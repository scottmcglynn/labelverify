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
 * Decode an image file into something drawable on a canvas.
 * Fast path: createImageBitmap (raster formats). Fallback: HTMLImageElement,
 * which handles SVG — Chrome's createImageBitmap rejects SVG blobs outright
 * and Firefox rejects SVGs lacking width/height attributes. If both paths
 * fail, the format is genuinely unsupported (e.g. TIFF, HEIC, PDF).
 */
async function decodeImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    return {
      source: bmp,
      width: bmp.width,
      height: bmp.height,
      cleanup: () => bmp.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(
        `Could not read “${file.name}” as an image. Supported formats: JPEG, PNG, WebP, GIF, SVG. For TIFF or PDF artwork, convert to PNG first.`,
      );
    }
    // SVGs may report no intrinsic size; pick a sane rasterization width.
    const width = img.naturalWidth || 1200;
    const height = img.naturalHeight || Math.round(width * 1.4);
    return {
      source: img,
      width,
      height,
      isVector: file.type === 'image/svg+xml',
      cleanup: () => URL.revokeObjectURL(url),
    };
  }
}

/**
 * Normalize an image file to a JPEG payload before upload. Raster images are
 * downscaled to maxDim (phone photos are often 4000+ px; the model reads
 * labels just as well at ~1500 px, and the smaller payload keeps turnaround
 * inside the 5-second budget). Vector sources (SVG) are rasterized AT maxDim
 * so small viewBoxes still yield crisp, readable text.
 */
export async function fileToOptimizedBase64(file, maxDim = 1568) {
  const decoded = await decodeImage(file);
  try {
    const ratio = maxDim / Math.max(decoded.width, decoded.height);
    const scale = decoded.isVector ? ratio : Math.min(1, ratio);
    const w = Math.max(1, Math.round(decoded.width * scale));
    const h = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // White backing so transparent PNG/SVG label art doesn't become black JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(decoded.source, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1] };
  } finally {
    decoded.cleanup();
  }
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
