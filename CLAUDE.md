# CLAUDE.md — Label Verify

Guidance for AI assistants (and humans) working in this repo. This is a
take-home prototype for a TTB (Treasury / Alcohol and Tobacco Tax and Trade
Bureau) interview: an AI-powered alcohol-label verification app. Brief:
https://github.com/treasurytakehome-rgb/instructions

## What it is

A React + Vite single-page app that checks alcohol-beverage label artwork
against COLA application data (brand name, class/type, alcohol content, net
contents, and the mandatory Government Health Warning). It runs entirely in
the browser and deploys as static files to GitHub Pages.

## Commands

```bash
npm install
npm run dev        # local dev server (Vite)
npm test           # vitest — unit tests for the verification engine
npm run build      # production build into dist/
```

`npm test` must stay green. The tests are the contract for the decision logic
(see below) — if you change comparison behavior, update `compare.test.js` in
the same change and explain why.

## Architecture in one line

**The AI extracts; plain code decides.**

```
label image ──► Claude vision model ──► structured JSON (transcription only)
                                              │
COLA form data ───────────────────────────────┤
                                              ▼
                          deterministic engine (src/lib/compare.js, unit-tested)
                                              ▼
                            PASS / REVIEW / FAIL + per-field checklist
```

## Critical design decisions — DO NOT refactor these away

1. **AI extracts, code decides.** `src/lib/anthropic.js` makes a Claude vision
   call whose ONLY job is to transcribe the label into JSON, preserving exact
   case/punctuation/spelling. Every pass/fail decision is deterministic
   JavaScript in `src/lib/compare.js`, covered by `compare.test.js`. The tests
   encode specific stakeholder requirements from the brief:
   - Government warning must be an **exact, word-for-word** match to the 27 CFR
     Part 16 text, with a **case-sensitive** `GOVERNMENT WARNING:` ALL-CAPS
     prefix check. Whitespace/line-wrap is normalized; letter case never is.
     Title-case "Government Warning:" is a MISMATCH (FAIL).
   - Casing-only brand/class differences (e.g. label `STONE'S THROW` vs
     application `Stone's Throw`) go to **REVIEW**, not FAIL — agent judgment.
   - Alcohol content and net contents are compared numerically /
     unit-normalized (`750 mL` == `75 cL`; `45` matches `45% Alc./Vol.`).
   **Never move decision logic into the prompt.** Asking the model "does this
   match?" would approximate rules that must be enforced literally, and would
   not be unit-testable or explainable.
   **Adjudication never overwrites the AI verdict.** In batch mode an agent can
   resolve a REVIEW row to PASS or FAIL, but that decision is stored *alongside*
   the AI verdict as `agentDecision`, never replacing it. The handoff records
   both — `verdict` (final, post-adjudication) and `ai_verdict` (original) plus
   `agent_decision` — so the trail is auditable. See `src/lib/handoff.js`.

2. **Bring-your-own-key with a configurable API endpoint.** GitHub Pages is
   static hosting with no server to hold a secret, so the app calls
   `api.anthropic.com` directly from the browser using the
   `anthropic-dangerous-direct-browser-access` header. The key lives in
   `sessionStorage` only (cleared when the tab closes). The **endpoint is
   user-configurable** in Settings — this is the deliberate answer to the
   brief's firewall concern: a production deployment points the endpoint at an
   internal Azure proxy (or Azure OpenAI for a FedRAMP path) without a rebuild.
   See README "Network and firewall considerations."

3. **Minimal dependencies on purpose.** React, Vite, Vitest only. No UI
   framework, no CSV library (`src/lib/csv.js` is a small RFC 4180 parser), no
   Anthropic SDK (a plain `fetch`). Small surface area = easy to security
   review. Do not add dependencies without a strong reason.

4. **USWDS-inspired design for a federal audience.** Federal blue, Public Sans,
   17px base type, large touch targets, plain-language verdicts. This is a
   deliberate fit for the agency users described in the brief. Keep it.

5. **Client-side image normalization.** `fileToOptimizedBase64` downscales
   images to ≤1568px JPEG before upload to stay inside the brief's ~5-second
   budget. `decodeImage` has a fast path (`createImageBitmap`, raster formats)
   and a fallback (`HTMLImageElement`) that handles **SVG** (which Chrome's
   `createImageBitmap` rejects); genuinely unsupported formats (TIFF/HEIC/PDF)
   get a friendly error. SVG is rasterized AT maxDim so small viewBoxes stay
   crisp. The SVG/fallback path is exercised by the fixtures in `test-labels/`.

6. **Verify-button state machine (both tabs).** The primary Verify button
   follows ready → verifying → verified (disabled + "Verified ✓" once results
   exist); stale results are ALWAYS cleared on any input change (form field,
   image, application, or CSV) so a verdict never lingers when it no longer
   matches the visible inputs; re-running is a separate "Run check again" action
   that requires modal confirmation when any agent decision has been recorded
   (a re-run rebuilds results and would destroy decisions).

## Code map

```
src/
  lib/
    anthropic.js     vision extraction client, image downscaling (decodeImage,
                     fileToOptimizedBase64), MODELS list, bounded-concurrency
                     runPool for batch mode. extractLabel retries transient
                     429/529 with exponential backoff (1s/2s/4s, honors
                     Retry-After, 15s cap) and times only the successful
                     attempt. EXTRACTION_PROMPT lives here — keep it
                     transcription-only.
    compare.js       verification engine — ALL decision logic. STATUS enum,
                     OFFICIAL_WARNING text, compareText/Abv/NetContents/Warning,
                     verify() roll-up (PASS/REVIEW/FAIL).
    compare.test.js  unit tests encoding the stakeholder requirements.
    csv.js           RFC 4180 CSV parse/generate (no dependency).
    handoff.js       buildHandoff(rows, {model, source}) — pure builder of the
                     JSON submission payload (the downstream/COLA integration
                     point). verdict = final post-adjudication; ai_verdict +
                     agent_decision preserve the original; source is 'single' |
                     'batch'. BOTH tabs emit this one schema, so the consumer is
                     indifferent to entry point. Also exports downloadHandoff
                     (side-effecting). Pure builder tested in handoff.test.js.
    sampleApplications.js  six mock COLA records for the single-tab "Load
                     application" lookup; mirrors test-labels/applications.csv.
  components/
    SingleVerify.jsx single-label flow: simulated COLA lookup (prefill, still
                     editable) → image → Verify → REVIEW adjudication → submit
    BatchVerify.jsx  CSV + multi-image batch flow: filename matching, verdict
                     filters, REVIEW adjudication, JSON handoff submit
    SettingsPanel.jsx key / model / endpoint configuration
    Shared.jsx       image drop zone, result checklist card (ResultCard takes
                     an optional imageFile prop to show a label preview +
                     "View full size"), plus AdjudicationPanel and the Modal
                     shell — both shared by the single and batch tabs
    LabelViewer.jsx  full-screen modal label inspector — original-resolution
                     image, button-based zoom (fit/100/200/400%), drag-to-pan,
                     focus-trapped, ESC/backdrop close. Opened from ResultCard.
  App.jsx, main.jsx, styles.css

test-labels/         AI/SVG test fixtures + expected verdicts (see its README)
```

## Verdict roll-up (in `verify()`)

- Any field MISMATCH or NOT_FOUND (missing mandatory element) → **FAIL**
- else any REVIEW field → **REVIEW**
- else → **PASS**

## Models

`MODELS` in `anthropic.js` lists the selectable vision models; the first entry
is the default. Default is Haiku for the speed budget. If Haiku's
warning-text transcription proves unreliable in testing, switch the default to
Sonnet — accuracy of the exact-match warning check beats the speed margin.

## When changing things

- Touching comparison behavior → update `compare.test.js` and keep `npm test`
  green.
- Touching the prompt → keep it transcription-only; do not add judgments.
- Adding a verified field → it's ~a 10-line addition to `verify()` plus a
  `compareX` function plus tests (producer/country are already extracted but
  not yet compared).
- Deploying → GitHub Actions (`.github/workflows/deploy.yml`) builds, tests,
  and publishes `dist/` on push to `main`. Update the live-demo URL in
  `README.md` once the Pages URL is known.
