# Government Warning Compliance Audit — 27 CFR Part 16 (§16.21, §16.22)

**Scope:** Audit only. No code was written or modified. Findings reference the
current `main` as of this report.

**Bottom line:** The tool implements the **§16.21 wording check** well (exact,
case-sensitive, whitespace-tolerant, unit-tested). It implements essentially
**none of §16.22** — the *format* and *type-size* requirements. Bold is inferred
from the vision model's self-reported flag rather than measured; there is no
contrast measurement, no container-size tier logic, no physical (mm / chars-per-
inch) measurement, and no pixel→mm calibration of any kind. Critically, the
image pipeline **destroys the inputs that physical measurement would require
before any measurement could happen**, so §16.22(b) cannot be added to the
existing single pipeline — it needs a parallel original-bytes path.

Legend: ✅ Implemented · ⚠️ Partial · ❌ Missing · ⛔ Incorrect

---

## Checklist

### Wording matched verbatim — ✅ Implemented
`src/lib/compare.js:22-26` (`OFFICIAL_WARNING`) and `:168-209` (`compareWarning`).
The official text is stored verbatim and matches the §16.21 wording exactly. A
MATCH requires `got === want` (`:182`) after collapsing whitespace (`:169`,
`normalizeWhitespace` at `:29-31`) and canonicalizing curly quotes/apostrophes
(`:178`). Letter case is **never** normalized, so the comparison is genuinely
verbatim. Wired into the verdict at `compare.js:248-257`.

### Wording diff produced when match fails — ❌ Missing
`src/lib/compare.js:193-208`. On failure the function returns only a *categorical*
reason string ("…letter case differs…", "…not in all capital letters…", "Statement
text does not match the required wording word-for-word."). No token/word-level
diff is computed, and the UI hides the extracted warning text entirely for this
field (`src/components/Shared.jsx` renders the application-vs-label values row
only `when f.key !== 'government_warning'`), so an agent cannot even see *what*
the model transcribed, let alone where it diverged.

### Prefix bold detection (and METHOD) — ⚠️ Partial — METHOD: OCR/model font flag, not measured stroke width
The boldness signal is the vision model's self-reported boolean
`government_warning.appears_bold` (prompt at `src/lib/anthropic.js:37`), passed to
`compareWarning(extractedText, appearsBold)` (`compare.js:168`, fed at `:255`).
It is **not** a measured stroke-width comparison of prefix vs. body. Worse, it is
only consulted on the exact-match path and only downgrades to REVIEW when it is
*strictly* `false` (`compare.js:188`): `appears_bold === true` **or `null`
(model unsure) both yield MATCH**, and the result is at most REVIEW, never FAIL.
So bold is effectively advisory and trivially defeated by an uncertain model.

### Prefix all-caps detection — ✅ Implemented (case-sensitive)
`src/lib/compare.js:182` (exact path requires the literal `GOVERNMENT WARNING:`
in caps) and `:193-202` (when words match case-insensitively, `prefixOk =
got.startsWith('GOVERNMENT WARNING:')` distinguishes a non-caps prefix and emits
"…not in all capital letters…", a MISMATCH/FAIL). A title-case prefix can never
produce MATCH. This is the strongest §16.22(a) check present.

### Body not-bold detection — ❌ Missing
§16.22(a) requires the remainder **not** be bold. Nothing extracts or checks the
body's weight — the model is asked only whether the *prefix* appears bold
(`anthropic.js:37`). An all-bold statement with a bold prefix would pass as MATCH
(`compare.js:182-190`).

### Continuous-block detection (interruption list when failed) — ❌ Missing
No detection of intervening text/graphics. The model transcribes only the warning
`text` (`anthropic.js:36`), and `compareWarning` immediately collapses all
whitespace **including newlines** (`compare.js:169`). That normalization would
*mask* an interruption rather than surface one; there is no interruption list and
no concept of block continuity.

### Background contrast measured and threshold applied — ❌ Missing
No pixel/color analysis exists anywhere (grep for `contrast`/`stroke`/`wcag`
across `src/` returns nothing). No WCAG ≥ 4.5:1 threshold, no region sampling. The
model is not even asked about legibility of the warning specifically (only a
whole-image `legibility: good|partial|poor`, `anthropic.js:39`).

### Net contents parsed from label OR accepted as input — ✅ Implemented (both)
Label: `net_contents` is OCR'd (`anthropic.js:31`). Input: `application.net_contents`
(`compare.js:244`). `compareNetContents` (`:135-157`) + `parseVolume` (`:124-132`)
normalize units (mL/cL/L/fl oz) for an equality check. **Caveat:** this value is
used *only* to compare label-vs-application; it is **not** fed to any tier logic
(none exists), and `parseVolume` silently assumes mL when no unit is found
(`:130-131`) — a dangerous default if it were ever wired to tier selection.

### Container tier selected correctly from net contents — ❌ Missing
There is no §16.22(b) tier table and no tier-selection logic anywhere. The mL
value computed by `parseVolume` is never used to choose a size class
(≤237 mL / >237 mL–3 L / >3 L).

### Type size measured in mm against tier-appropriate minimum — ❌ Missing
No letter-height measurement, no millimeters anywhere (the only `mm` token in
`src/` is the `fl oz`→mL constant context, not a measurement). Cannot exist
without calibration, which is also absent.

### Characters-per-inch measured against tier-appropriate maximum — ❌ Missing
No character-density measurement and no inch/cpi concept anywhere.

### Calibration via UPC-A — ❌ Missing
No barcode detection or decoding. The 37.29 mm × 25.91 mm reference is not present.

### Calibration via supplied label width — ❌ Missing
No label-width input exists in the UI, the application schema, or `extractLabel`.

### Calibration via EXIF DPI — ❌ Missing
No EXIF parsing. Moreover the pipeline cannot supply it: `decodeImage`
(`anthropic.js:50-82`) decodes via `createImageBitmap`/`HTMLImageElement`, neither
of which exposes EXIF DPI, and the original file bytes are never read as an
ArrayBuffer. (See "Image-pipeline implications" below.)

### Explicit calibrationFailed path when no reference resolves — ❌ Missing
There is no calibration step at all, hence no explicit failure path. The system
silently has no physical-measurement capability rather than declaring it
uncalibrated.

### Sulfite-declaration-on-trailing-line exception handled — ❌ Missing
No sulfite handling anywhere (grep `sulfite|sulphite` → none). Because the warning
is treated as a single normalized string, a shared trailing line could not be
distinguished from an interruption even in principle today.

---

## Test coverage

**Unit tests** — `src/lib/compare.test.js:58-92` (`compareWarning`) cover the
§16.21 wording dimension only:
- exact official statement → MATCH (`:59-61`)
- line-wrap whitespace tolerated, case never → MATCH (`:63-66`)
- title-case prefix → MISMATCH / "capital letters" (`:68-76`)
- reworded statement → MISMATCH (`:78-83`)
- missing statement → NOT_FOUND (`:85-87`)
- model `appears_bold === false` → REVIEW (`:89-91`)

`:94-122` (`verify`) covers the roll-up (PASS / REVIEW / FAIL) with the warning as
one field.

**End-to-end fixtures** — `test-labels/` (six authored SVGs; expected verdicts in
README and `applications.csv`):
- `01-clean-pass.svg` — compliant warning, bold prefix → PASS
- `02-brand-casing-review.svg` — warning compliant; brand casing → REVIEW
- `03-wrong-abv-fail.svg` — warning compliant; ABV wrong → FAIL
- `04-titlecase-warning-fail.svg` — "Government Warning:" title case → FAIL ← only fixture that stresses warning **format/case**
- `05-missing-warning-fail.svg` — warning absent → FAIL (NOT_FOUND)
- `06-different-brand-fail.svg` — warning compliant; brand differs → FAIL

**Checklist items with NO test (unit or fixture):**
Wording diff; **measured** bold; body-not-bold; continuous block; background
contrast; container-tier selection; type-size (mm); chars-per-inch; UPC-A
calibration; supplied-width calibration; EXIF-DPI calibration; calibrationFailed
path; sulfite trailing-line exception. The only warning checks with coverage are
verbatim wording, all-caps prefix, presence, and the *model-flag* bold path.

Note: the SVG fixtures **cannot** test §16.22(b) even in principle — they are
rasterized to a ≤1568 px canvas with no scale reference, so they carry no physical
dimension. There is also no fixture for a >3 L container, a sub-minimum type size,
a low-contrast warning, an interrupted block, a bold body, a sulfite line, or an
in-frame UPC barcode.

---

## Suspicious or fragile spots (would pass happy path, fail on real scans)

1. **Bold is asserted, not measured, and fails open.** `anthropic.js:37` +
   `compare.js:188`. A real scan with mild contrast or a condensed font will make
   the model's `appears_bold` unreliable; `null` (unsure) is treated identically
   to `true`. A non-bold prefix is at most REVIEW, never FAIL — so a genuine
   §16.22(a) bold violation can pass.

2. **Whitespace normalization can mask a continuous-block violation.**
   `compare.js:169` collapses newlines, so a statement interrupted by other text
   (if the model happened to include it) would compare as continuous. The prompt
   also tells the model to transcribe only the warning text (`anthropic.js:36`),
   so interruptions likely never reach the comparator at all.

3. **Whole-string equality with no diff is brittle both ways.** `compare.js:182`.
   A single model transcription slip (a dropped comma, an OCR's "1"/"l") produces
   FAIL with only "does not match word-for-word," and the UI hides the extracted
   warning text (`Shared.jsx`), so the agent cannot tell an OCR artifact from a
   real label defect. Conversely, real near-miss wording defects are reported with
   the same generic message — no indication of *which* clause is wrong.

4. **Body-case exactness is stricter than the rule and can false-FAIL.**
   `compare.js:193-200` treats any body letter-case difference as MISMATCH
   ("letter case differs"). Labels frequently set the statement in small caps or
   all caps for legibility; depending on how the model transcribes that, a
   compliant label could be failed on styling the regulation does not actually
   forbid for the body.

5. **`parseVolume` assumes mL on an unrecognized unit** (`compare.js:130-131`).
   Harmless for the current equality use, but it would silently mis-tier a
   container the moment net contents is wired to §16.22(b) (e.g., a bare "1.75"
   read as 1.75 mL instead of 1.75 L would pick the wrong size class).

### Image-pipeline implications for §16.22 measurement (the structural blocker)

`fileToOptimizedBase64` (`anthropic.js:91-113`) and `decodeImage` (`:50-82`) form
the **only** path from file to model, and `extractLabel` (`:154-203`) consumes
**only** their `{ mediaType, data }` output (base64 of a downscaled JPEG); the
original `file`/bytes are never retained or returned. What is destroyed, in order,
before any measurement could occur:

- **EXIF / all metadata — gone immediately and unreadable by design.**
  `createImageBitmap` and `HTMLImageElement` decode to pixels and expose no EXIF;
  DPI lives in the file's JFIF/APP0–APP1 headers, which are never parsed (no
  ArrayBuffer read anywhere). So **EXIF DPI is inaccessible through this pipeline
  even before downscaling**.
- **Native resolution — discarded.** `:94-97` downscales to `maxDim = 1568`
  (`scale = min(1, ratio)` for raster). The native pixel dimensions exist only
  transiently as `decoded.width/height` to compute the scale, then the bitmap is
  drawn smaller and `cleanup()` closes it (`:111`). The full-resolution pixels a
  letter-height/stroke measurement needs are not kept.
- **Lossless edges — re-encoded away.** `:108` emits JPEG at quality 0.88. JPEG's
  8×8 block transform and chroma subsampling corrupt exactly the thin-stroke and
  edge information that bold/stroke-width and letter-height metrology depend on,
  and shift colors enough to undermine any contrast-ratio measurement. The white
  canvas backing (`:104-105`) further alters the warning's true background.

**Conclusion:** The current single pipeline **cannot** support calibrated
physical measurement. Every input §16.22(b) and the calibration ladder require —
EXIF DPI, native resolution, an un-recompressed barcode for UPC-A, and lossless
edges — is gone by the time the model (or any analyzer) sees the image. The
downscaled JPEG is appropriate for LLM *transcription* but unusable for
*metrology*. A **parallel original-bytes analysis path is required**: retain the
original `File`, read EXIF + full-resolution pixels (and detect/decode a UPC-A)
from those bytes, derive a px→mm scale with an explicit `calibrationFailed`
result, and run measurements on the lossless pixels — keeping the existing
transcription pipeline untouched for the wording check.

---

## Recommended next prompts (in order of impact)

1. **Build the calibration + original-bytes foundation.** "Add a parallel
   analysis path that preserves the original uploaded File, reads EXIF DPI and
   native resolution from its bytes, and resolves a pixels→mm scale via the
   ladder UPC-A barcode → caller-supplied label width → EXIF DPI, returning an
   explicit `calibrationFailed` result (with reason) when none resolves. Do not
   route measurement through the downscaled JPEG." *This unblocks all of §16.22(b);
   nothing physical is possible without it.*

2. **Add the §16.22(b) type-size engine on top of calibration.** "Using the
   calibrated scale, select the container tier from net contents (≤237 mL / >237
   mL–3 L / >3 L), measure minimum letter height in mm and characters-per-inch in
   the warning region, and pass/fail against the tier's thresholds. Add fixtures
   for each tier including a >3 L container and a sub-minimum type-size label."

3. **Harden the §16.22(a)/§16.21 format checks.** "Replace the model's
   `appears_bold` flag with a measured stroke-width comparison of prefix vs body
   (and a body-not-bold check), add a WCAG contrast measurement on the warning's
   background, produce a token-level wording diff surfaced in the UI, and add
   continuous-block detection with a sulfite-trailing-line exception." *Lower
   architectural risk than 1–2 but closes the 'passes happy path, fails real
   scans' gaps.*
