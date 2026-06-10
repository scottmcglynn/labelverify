/**
 * Deterministic field comparison engine.
 *
 * Design principle: the AI model EXTRACTS what is printed on the label;
 * this module DECIDES whether it matches the application. Keeping the
 * decision logic in plain, testable JavaScript means:
 *   - the exact-match Government Warning rule is enforced literally,
 *     not approximated by a language model's judgment
 *   - "obviously the same, technically different" cases (casing,
 *     punctuation) are flagged for human REVIEW instead of auto-failed
 *   - every verdict is explainable and unit-testable
 */

export const STATUS = {
  MATCH: 'MATCH',
  REVIEW: 'REVIEW',
  MISMATCH: 'MISMATCH',
  NOT_FOUND: 'NOT_FOUND',
};

/** Official health warning text required by 27 CFR Part 16. */
export const OFFICIAL_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should ' +
  'not drink alcoholic beverages during pregnancy because of the risk of ' +
  'birth defects. (2) Consumption of alcoholic beverages impairs your ' +
  'ability to drive a car or operate machinery, and may cause health problems.';

/** Collapse runs of whitespace and trim. Case is preserved. */
export function normalizeWhitespace(s) {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Lowercase, strip punctuation, collapse whitespace — for "same words" tests. */
function looseKey(s) {
  return normalizeWhitespace(s)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract the first decimal number from a string, or null. */
function firstNumber(s) {
  const m = (s ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Compare a free-text field (brand name, class/type).
 * Exact match -> MATCH. Same words, different case/punctuation -> REVIEW
 * (a human should confirm; per senior-agent feedback these are usually
 * the same product). Different words -> MISMATCH.
 */
export function compareText(applied, extracted) {
  if (!normalizeWhitespace(extracted)) {
    return {
      status: STATUS.NOT_FOUND,
      detail: 'Not found on the label (or not legible).',
    };
  }
  const a = normalizeWhitespace(applied);
  const e = normalizeWhitespace(extracted);
  if (a === e) {
    return { status: STATUS.MATCH, detail: 'Exact match.' };
  }
  if (looseKey(a) === looseKey(e)) {
    return {
      status: STATUS.REVIEW,
      detail: `Same wording, different formatting — label shows “${e}”, application says “${a}”. Agent judgment needed.`,
    };
  }
  return {
    status: STATUS.MISMATCH,
    detail: `Label shows “${e}”, application says “${a}”.`,
  };
}

/**
 * Compare alcohol content numerically. "45% Alc./Vol. (90 Proof)" matches
 * an application value of "45", "45%", or "45% Alc./Vol.".
 */
export function compareAbv(applied, extracted) {
  if (!normalizeWhitespace(extracted)) {
    return {
      status: STATUS.NOT_FOUND,
      detail: 'Alcohol content not found on the label.',
    };
  }
  const a = firstNumber(applied);
  const e = firstNumber(extracted);
  if (a == null) {
    return {
      status: STATUS.REVIEW,
      detail: `Could not read a number from the application value “${applied}”.`,
    };
  }
  if (e == null) {
    return {
      status: STATUS.REVIEW,
      detail: `Label text “${extracted}” does not contain a readable percentage.`,
    };
  }
  if (Math.abs(a - e) < 0.001) {
    return {
      status: STATUS.MATCH,
      detail: `${e}% on label matches application.`,
    };
  }
  return {
    status: STATUS.MISMATCH,
    detail: `Label shows ${e}%, application says ${a}%.`,
  };
}

const VOLUME_UNITS = [
  { re: /m\s*l\b|milliliters?/i, unit: 'mL', toMl: 1 },
  { re: /\bc\s*l\b|centiliters?/i, unit: 'cL', toMl: 10 },
  // Checked after mL/cL above, so a bare "L" here is genuinely liters.
  { re: /liters?\b|litres?\b|\bl\b/i, unit: 'L', toMl: 1000 },
  { re: /fl\.?\s*oz|fluid\s*ounces?/i, unit: 'fl oz', toMl: 29.5735 },
];

function parseVolume(s) {
  const n = firstNumber(s);
  if (n == null) return null;
  for (const u of VOLUME_UNITS) {
    if (u.re.test(s)) return { ml: n * u.toMl, display: `${n} ${u.unit}` };
  }
  // No recognizable unit — assume mL, the dominant case for labels.
  return { ml: n, display: `${n} mL (unit assumed)` };
}

/** Compare net contents with unit normalization (750 mL == 750ML == 75 cL). */
export function compareNetContents(applied, extracted) {
  if (!normalizeWhitespace(extracted)) {
    return {
      status: STATUS.NOT_FOUND,
      detail: 'Net contents not found on the label.',
    };
  }
  const a = parseVolume(applied);
  const e = parseVolume(extracted);
  if (!a || !e) {
    return {
      status: STATUS.REVIEW,
      detail: `Could not normalize volumes (“${applied}” vs “${extracted}”).`,
    };
  }
  if (Math.abs(a.ml - e.ml) < 0.5) {
    return { status: STATUS.MATCH, detail: `${e.display} matches application.` };
  }
  return {
    status: STATUS.MISMATCH,
    detail: `Label shows ${e.display}, application says ${a.display}.`,
  };
}

/**
 * Government warning verification — the strict one.
 * Requirements enforced:
 *   1. The statement must be present.
 *   2. Wording must match the official text exactly, word for word.
 *   3. "GOVERNMENT WARNING:" must be in ALL CAPS (case-sensitive check).
 * Whitespace and line breaks are normalized (labels wrap text), but
 * character case is never normalized.
 */
export function compareWarning(extractedText, appearsBold) {
  const text = normalizeWhitespace(extractedText);
  if (!text) {
    return {
      status: STATUS.NOT_FOUND,
      detail: 'Government warning statement not found on the label. Mandatory on all alcohol beverages.',
    };
  }

  // Normalize curly quotes/apostrophes only — printers substitute these.
  const canon = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  const got = canon(text);
  const want = canon(OFFICIAL_WARNING);

  if (got === want) {
    const boldNote =
      appearsBold === false
        ? ' Note: “GOVERNMENT WARNING:” may not be bold — verify visually.'
        : '';
    return {
      status: appearsBold === false ? STATUS.REVIEW : STATUS.MATCH,
      detail: 'Exact match with the required statement.' + boldNote,
    };
  }

  if (got.toLowerCase() === want.toLowerCase()) {
    // Words are right; the case is wrong somewhere (e.g. "Government
    // Warning:" in title case). This is a rejection in practice.
    const prefixOk = got.startsWith('GOVERNMENT WARNING:');
    return {
      status: STATUS.MISMATCH,
      detail: prefixOk
        ? 'Wording matches but letter case differs from the required statement.'
        : 'Statement found, but “GOVERNMENT WARNING:” is not in all capital letters as required.',
    };
  }

  return {
    status: STATUS.MISMATCH,
    detail: 'Statement text does not match the required wording word-for-word.',
  };
}

/**
 * Run the full verification for one application against one extraction.
 * Returns per-field results plus an overall verdict:
 *   PASS  — every field matched
 *   REVIEW — no hard mismatches, but at least one field needs a human
 *   FAIL  — at least one mismatch or missing mandatory element
 */
export function verify(application, extraction) {
  const fields = [
    {
      key: 'brand_name',
      label: 'Brand name',
      applied: application.brand_name,
      extracted: extraction.brand_name,
      result: compareText(application.brand_name, extraction.brand_name),
    },
    {
      key: 'class_type',
      label: 'Class / type',
      applied: application.class_type,
      extracted: extraction.class_type,
      result: compareText(application.class_type, extraction.class_type),
    },
    {
      key: 'alcohol_content',
      label: 'Alcohol content',
      applied: application.alcohol_content,
      extracted: extraction.alcohol_content,
      result: compareAbv(application.alcohol_content, extraction.alcohol_content),
    },
    {
      key: 'net_contents',
      label: 'Net contents',
      applied: application.net_contents,
      extracted: extraction.net_contents,
      result: compareNetContents(application.net_contents, extraction.net_contents),
    },
    {
      key: 'government_warning',
      label: 'Government warning',
      applied: 'Required statement (27 CFR Part 16)',
      extracted: extraction.government_warning?.text ?? '',
      result: compareWarning(
        extraction.government_warning?.text,
        extraction.government_warning?.appears_bold,
      ),
    },
  ];

  const statuses = fields.map((f) => f.result.status);
  let overall = 'PASS';
  if (statuses.includes(STATUS.MISMATCH) || statuses.includes(STATUS.NOT_FOUND)) {
    overall = 'FAIL';
  } else if (statuses.includes(STATUS.REVIEW)) {
    overall = 'REVIEW';
  }

  return { overall, fields, legibility: extraction.legibility ?? 'good' };
}
