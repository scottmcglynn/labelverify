/**
 * Vision extraction client.
 *
 * The model's only job is OCR-with-context: read the label image and
 * return structured JSON describing what is printed on it. All pass/fail
 * decisions happen in compare.js.
 *
 * The API base URL is configurable. The deployed prototype calls
 * api.anthropic.com directly from the browser (bring-your-own-key);
 * a production deployment behind a restrictive firewall would point this
 * at an internal proxy or an Azure OpenAI-backed equivalent instead.
 */

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

export const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Fast (Haiku) — recommended' },
  { id: 'claude-sonnet-4-6', label: 'High accuracy (Sonnet)' },
];

const EXTRACTION_PROMPT = `You are reading an alcohol beverage label image for a TTB compliance check.

Transcribe EXACTLY what is printed, preserving letter case, punctuation, and spelling. Do not correct, complete, or normalize anything. If an element is absent or unreadable, use null.

Respond with ONLY this JSON object, no markdown fences, no commentary:
{
  "brand_name": string | null,
  "class_type": string | null,            // e.g. "Kentucky Straight Bourbon Whiskey"
  "alcohol_content": string | null,       // e.g. "45% Alc./Vol. (90 Proof)" exactly as printed
  "net_contents": string | null,          // e.g. "750 mL" exactly as printed
  "producer": string | null,              // bottler/producer name and address if printed
  "country_of_origin": string | null,
  "government_warning": {
    "present": boolean,
    "text": string | null,                // the FULL statement transcribed exactly, preserving case
    "appears_bold": boolean | null        // does "GOVERNMENT WARNING:" appear bold?
  },
  "legibility": "good" | "partial" | "poor",
  "notes": string | null                  // glare, angle, blur, or anything affecting confidence
}`;

/**
 * Downscale an image file in the browser before upload. Phone photos are
 * often 4000+ px; the model reads labels just as well at ~1500 px and the
 * smaller payload keeps total turnaround inside the 5-second budget.
 */
export async function fileToOptimizedBase64(file, maxDim = 1568) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1] };
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/**
 * Extract label fields from one image.
 * @returns {Promise<{extraction: object, elapsedMs: number}>}
 */
export async function extractLabel({ file, apiKey, baseUrl, model }) {
  if (!apiKey) {
    throw new Error('No API key set. Open Settings and enter your Anthropic API key.');
  }

  const { mediaType, data } = await fileToOptimizedBase64(file);
  const started = performance.now();

  const response = await fetch(`${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      // Required by Anthropic for direct browser (CORS) requests. Safe in a
      // bring-your-own-key app: the only key in play is the user's own.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || MODELS[0].id,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    let message = `API error (HTTP ${response.status})`;
    try {
      const err = await response.json();
      message = err?.error?.message || message;
    } catch {
      /* keep generic message */
    }
    throw new Error(message);
  }

  const body = await response.json();
  const text = (body.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  let extraction;
  try {
    extraction = JSON.parse(stripFences(text));
  } catch {
    throw new Error('The model returned an unreadable response. Try again or switch to the high-accuracy model.');
  }

  return { extraction, elapsedMs: Math.round(performance.now() - started) };
}

/**
 * Run a set of jobs with bounded concurrency. Used by batch mode so a
 * 300-label upload streams steadily instead of firing 300 simultaneous
 * requests (and tripping rate limits).
 */
export async function runPool(jobs, limit, onResult) {
  const queue = jobs.map((job, index) => ({ job, index }));
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const { job, index } = queue.shift();
      try {
        const value = await job();
        onResult(index, { ok: true, value });
      } catch (error) {
        onResult(index, { ok: false, error });
      }
    }
  });
  await Promise.all(workers);
}
