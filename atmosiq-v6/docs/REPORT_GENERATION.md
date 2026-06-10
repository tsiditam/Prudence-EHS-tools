# AtmosFlow IAQ Report Generation

The fixed, deterministic pipeline that turns an assessment into a
consultant-grade screening report — matching the approved sample design,
using project-specific data, with the AI never deciding layout or inventing
facts.

```
Assessment data
  → Deterministic engine output            (src/engines/scoring.js, causalChains, recs — SACRED, read-only)
  → Report JSON                            (buildReportModel — src/report/reportModel.js)
  → Narrative assembly                     (assembleRenderModel + narrativeLibrary — controlled words)
  → Fixed PDF renderer                     (lib/report/render-pdf.js — pdfkit, owns 100% of layout)
  → /api/report-pdf                        (server render; banned-language gate)
```

**Core principle:** the renderer owns all visual structure (layout, fonts,
color, tables, charts, page breaks, headers/footers, watermark, branding).
The model carries every word and number. Same data in → same report out. The
optional AI pass may only *refine* wording from model facts; it can never add
a fact or change a technical position, and its output is re-scanned by the
banned-language gate.

## Files

| File | Role |
|---|---|
| `lib/report/render-pdf.js` | **The renderer.** pdfkit, CommonJS, `renderReportPdf(model) → Buffer`. Pure layout; contains no assessment prose. Shared by the sample script, the API, and tests. Two-pass (count pages → stamp "Page X of N"). |
| `src/report/reportModel.js` | `buildReportModel(data)` = the **Report JSON** (schema in §2 of the build plan). `assembleRenderModel(data, {mode})` clothes it in narrative → the renderer model. Reads engine output + `STD` thresholds; no scoring. |
| `src/report/narrativeLibrary.js` | Controlled narrative blocks: static "what it is" explainers, severity-keyed "observed" templates, exec-summary / overall-statement builders, fixed reference-framework / limitations / about text. Screening-only tone baked in. |
| `src/utils/downloadReportPdf.js` | Client helper: `assembleRenderModel` → POST `/api/report-pdf` → download. |
| `api/report-pdf.js` | Server endpoint. Validates the model, **scans all prose with the banned-language scanner** (`api/_banned-language.js`), renders, returns `application/pdf`. |
| `scripts/generate-sample-report-pdf.mjs` | Thin wrapper: the fictitious `SAMPLE_MODEL` → the same renderer → `public/sample-report.pdf`. Proves the sample and real reports share one renderer. |

## Fixed section structure

Cover · Executive Summary · Findings at a Glance · Severity Legend · Overall
Screening Statement · 1 Scope & Site · 2 Methodology & Instrumentation +
Reference Framework · 3 Measurement Results · Per-Parameter Interpretation ·
3.1 Logger Studio charts (point-drawn for the sample, embedded PNGs for real
assessments) + Peak CO₂ by Zone bar · 4 Findings & Interpretation · Reported
Concerns · Conceptual Site Model (source→pathway→receptor) · Working
Hypotheses · 5 Recommended Actions · 6 QA/QC · 7 Limitations · 8 Professional
Review & Signature · Appendix A Standards & References · Appendix B About
AtmosFlow · Appendix C Site Photographs.

**Sections with no model data are omitted** (e.g. no logger ⇒ no logger
charts; the peak-CO₂ bar still renders from grab readings).

## Export modes

`assembleRenderModel(data, { mode })` — `'draft'` (default) | `'final'` |
`'sample'`:

- **Draft** — `DRAFT` watermark, header "Draft — IH Review Required",
  signature block states the report needs qualified-professional review
  before issuance ("IH Review Required").
- **Final** — no watermark, accountable review statement ("The undersigned
  has reviewed…"). Intended to follow reviewer approval.
- **Sample** — `SAMPLE` watermark, evaluation-use disclaimer.

## Defensibility / guardrails (reused, not rebuilt)

- **Thresholds** come only from `src/constants/standards.js` (`STD`).
- **Per-parameter outcomes** are deterministic threshold comparisons framed as
  *screening indicators* — never compliance verdicts.
- **Banned-language gate**: `/api/report-pdf` runs `api/_banned-language.js`
  over every prose field and returns `422` on any hit, so no
  compliance/medical/causation claim can reach a PDF. The deterministic
  narrative library is written to pass this gate (regression-tested).
- **Missing data is disclosed** ("Not documented in project record."), never
  invented (QA/QC, photos, references).

## Why pdfkit + server render (not Puppeteer)

This is a Vite SPA on Vercel serverless. Puppeteer/headless-Chrome blows the
50 MB function limit and adds multi-second cold starts. pdfkit is pure JS,
renders server-side in milliseconds, and is the **exact code** behind the
approved sample — so the design is preserved by construction. The model is
built client-side; only layout happens on the server.

## Testing

- `tests/lib/render-pdf.test.js` — renderer produces valid multi-page PDFs,
  embeds images, guards degenerate images, applies brand color, omits empty
  sections.
- `tests/api/report-pdf.test.js` — endpoint validation + the 422
  banned-language block + a clean 200 render.
- `tests/components/render-model.test.js` — `assembleRenderModel` structure,
  Draft/Final/Sample chrome, QA disclosure, and **zero banned language** in
  the deterministic prose.
- `tests/components/report-model.test.js` — the Report JSON compiler.

Regenerate the sample after renderer changes: `node
scripts/generate-sample-report-pdf.mjs` (should stay ~13 pages).

## Extending

- **New section**: add the data to `assembleRenderModel`'s output and a
  conditional block in `buildContent` (render-pdf.js). Gate on data presence.
- **New parameter narrative**: add to `narrativeLibrary` (`WHAT_IS` +
  `OBSERVED`) — keep it screening-only and run the render-model test (it scans
  for banned language).
- **AI refinement (optional, future)**: post-process model prose through
  `/api/narrative` and re-scan; never let it introduce facts.
