# Label Verify — AI-Powered Alcohol Label Verification

A prototype tool for TTB compliance agents that checks alcohol beverage label
artwork against COLA application data: brand name, class/type, alcohol
content, net contents, and the mandatory Government Health Warning Statement.

**Live demo:** `https://<your-username>.github.io/<repo-name>/`

---

## Quick start

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests for the verification engine
npm run build      # production build in dist/
```

To use the app, open Settings and paste an Anthropic API key
(console.anthropic.com). The key is held in `sessionStorage` only — it is
cleared when the tab closes and is never sent anywhere except the configured
API endpoint.

## How it works

```
label image ──► Claude vision model ──► structured JSON extraction
                                              │
COLA form data ───────────────────────────────┤
                                              ▼
                                deterministic comparison engine
                                  (src/lib/compare.js, unit-tested)
                                              │
                                              ▼
                          PASS / REVIEW / FAIL + field checklist
```

The core design decision: **the AI extracts; plain code decides.**
The model's only job is to transcribe exactly what is printed on the label
into structured JSON. All pass/fail logic lives in `src/lib/compare.js` —
ordinary, testable JavaScript. This matters for three stakeholder
requirements:

1. **The warning statement must match exactly** (word-for-word, with
   `GOVERNMENT WARNING:` in all caps). A deterministic string comparison
   enforces this literally; asking a language model "does this match?"
   would approximate it. Whitespace from line wrapping is normalized;
   letter case never is. A title-case "Government Warning:" is a MISMATCH.
2. **Casing nuance needs judgment, not auto-rejection.** A label reading
   `STONE'S THROW` against an application reading `Stone's Throw` is the
   same words with different formatting — the engine flags it **REVIEW**
   (agent decides) rather than FAIL. Genuinely different wording is FAIL.
3. **Every verdict is explainable.** Each field shows what the application
   said, what the label shows, and why the status was assigned.

Verdict roll-up: any MISMATCH or missing mandatory element → **FAIL**;
otherwise any REVIEW field → **REVIEW**; otherwise **PASS**. The footer
states the operating assumption explicitly: agents make the final call.

## Meeting the stated requirements

| Requirement (from discovery notes) | How it's addressed |
| --- | --- |
| Results in ~5 seconds | Default model is Claude Haiku (fastest vision tier); images are downscaled client-side to ≤1568 px before upload, cutting transfer and processing time. Each result displays its actual processing time so the budget stays visible. |
| Usable by low-tech-comfort agents | Two-step flow (form → image → one button), 17 px base type, large targets, high-contrast USWDS-style palette, plain-language verdicts (PASS / REVIEW / FAIL), keyboard-accessible with visible focus states. |
| Batch uploads (200–300 applications) | Batch tab: upload a CSV of application data plus the label images; rows are matched by filename and processed through a concurrency-limited queue (4 parallel) with live progress, expandable per-label checklists, and CSV export of results. A template CSV is downloadable in-app. |
| Imperfect images | The extraction reports a legibility rating (good / partial / poor) and notes glare, angle, or blur; vision models tolerate moderately imperfect photos far better than classical OCR. |
| Exact warning statement | See above — strict, case-sensitive, unit-tested comparison against the 27 CFR Part 16 text, including a bold-prefix visual check flagged for review when uncertain. |

## Network and firewall considerations (production path)

IT noted that the agency firewall blocks many outbound domains, which broke a
prior vendor's cloud ML endpoints. This prototype is architected so that
concern is a configuration change, not a rebuild:

- **Configurable endpoint.** The API base URL is a setting in the UI (and a
  single constant in `src/lib/anthropic.js`). The deployed prototype calls
  `api.anthropic.com` directly from the browser using Anthropic's documented
  CORS support for bring-your-own-key apps.
- **Proxy-ready.** A production deployment would point the endpoint at a thin
  server-side proxy on the agency's existing Azure tenancy (App Service or
  Functions). That gives IT exactly one internal hostname to allow, keeps the
  API key server-side, and adds a natural place for logging and rate limits.
- **FedRAMP path.** The extraction request/response shape is the standard
  vision-LLM pattern; swapping the proxy's upstream to **Azure OpenAI Service**
  (FedRAMP High, already inside the agency's Azure environment) is an
  endpoint-and-key change. Fully on-premises vision models (e.g., via Ollama)
  are a further option for air-gapped scenarios.

## Architecture and code map

```
src/
  lib/
    anthropic.js     vision extraction client, image downscaling,
                     bounded-concurrency pool for batch mode
    compare.js       verification engine (all decision logic)
    compare.test.js  unit tests encoding the stakeholder requirements
    csv.js           RFC 4180 CSV parse/generate (no dependency needed)
  components/
    SingleVerify.jsx single-label flow
    BatchVerify.jsx  CSV + multi-image batch flow
    SettingsPanel.jsx key / model / endpoint configuration
    Shared.jsx       image drop zone, result checklist card
  App.jsx, main.jsx, styles.css
```

Dependencies are deliberately minimal: React, Vite, Vitest. No UI framework,
no CSV library, no SDK — the surface area is small enough that plain code is
clearer and easier to security-review.

## Deploying to GitHub Pages

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds, runs the
test suite, and publishes `dist/` on every push to `main`.

One-time setup: repository **Settings → Pages → Source → "GitHub Actions"**.
The Vite config uses `base: './'` so the build works at any subpath.

## Assumptions and trade-offs

- **Bring-your-own-key.** GitHub Pages is static hosting; there is no server
  to hold a secret. Evaluators paste their own Anthropic key (or one supplied
  with the submission). The production answer is the proxy described above.
- **Scope of fields.** The prototype verifies the five highest-volume checks.
  Producer name/address and country of origin are extracted (visible in the
  JSON) but not yet compared — the comparison engine makes adding a field a
  ~10-line change.
- **Batch CSV matching is by filename.** Simple and transparent; a production
  version would match on COLA application ID.
- **AI-assisted, not AI-decided.** The tool is built to clear an agent's
  routine matching workload, not to issue rejections. REVIEW exists precisely
  because some mismatches are judgment calls.

## Creating test labels

Per the brief, AI image generators work well for producing sample labels.
Generate a label containing the sample fields (brand "OLD TOM DISTILLERY",
"Kentucky Straight Bourbon Whiskey", "45% Alc./Vol. (90 Proof)", "750 mL",
and the full government warning), then make broken variants — wrong ABV,
title-case warning, missing warning — to exercise each verdict path.
