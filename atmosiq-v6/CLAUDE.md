# AtmosFlow — Project Context for Claude Code

## What this is

AtmosFlow is an IAQ (indoor air quality) assessment SaaS platform built by
Prudence Safety & Environmental Consulting, LLC (PSEC). It produces
consultant-grade IAQ reports for industrial hygienists and EHS
professionals. The platform identifies risk indicators and produces
sampling plans; it does not make definitive regulatory classifications,
compliance determinations, or medical/causation calls without
licensed-professional sign-off. Maintain that substantive boundary in
any code, copy, or documentation you generate — but do **NOT** reintroduce
"screening", "screening-level", or "screening-only" as a label, tagline,
banner, chip, or repeated caveat. That branding was deliberately stripped
from the reports and the platform (2026-08): the boundary now lives in a
single reworded limitation statement ("not a regulatory / compliance /
medical determination") plus the over-claim guardrail in
`api/_banned-language.js` — not in repeated "screening" labeling.

**What it optimises for.** Helping a qualified professional run an
investigation and communicate what they found, clearly enough that a client
or facility stakeholder can act on it. Defensibility is a property the
platform maintains, not the thing it is for. It was the defining trait
through 2026-08 and is no longer; see the working principles below and
`docs/REPORTING_VOICE.md`.

Live at atmosflow.net. Engine version is currently **3.0** — a MAJOR bump,
because v3.0 removed the 100-point composite score and every risk band, so
the same inputs no longer produce the same conclusions. See "The 100-point
score was removed" below. (v2.9 changed report-issuance gating from
refuse-to-issue to issue-with-warnings; see the engine override note under
Working principles.)

## Stack

- **Vite 5 + React 18 SPA** (not Next.js — atmosiq-v6/ is the canonical
  AtmosFlow codebase). PWA-shipped to iOS Safari, Chrome, Edge.
- **Inline styles, no Tailwind, no shadcn/ui.** A limited token surface
  exists at `src/styles/tokens.js` but the codebase predominantly uses
  inline `style={{...}}` per-component. UI primitives are not yet
  extracted; planned in a future "UI system pass."
- **Express harness** at `server/index.js` for container-mode deploys
  (FedRAMP/GovCloud portability). Vercel serverless is the production
  deploy path; Express container is parallel infrastructure.
- **Stripe Checkout** (subscription mode) with credits ledger and the
  webhook idempotency table (`stripe_webhook_events`, migration 006).
- **Supabase** for auth + Postgres; client-side persistence via
  `src/utils/storage.js` (localStorage wrapper) plus
  `src/utils/cloudStorage.js` (facade over `supabaseStorage`).
- **DOCX generation** via the `docx` package (Buffer/Blob output);
  rendering pipeline at `src/components/DocxReport.js` →
  `src/components/docx/sections-*.js`.
- **PDF generation** via `pdfkit` for marketing samples
  (`scripts/generate-sample-report-pdf.mjs`).
- **Sentry** for error monitoring with PII scrubbing (`lib/sentry.ts`).
- **Resend** for transactional + onboarding emails
  (`lib/email-sequences.ts`, `lib/email-triggers.ts`).
- Deployed on Vercel.

## Repository layout

Read these directories first when investigating any task:
- `src/components/` — UI components, mostly inline-styled JSX. Hot files:
  `MobileApp.jsx` (main app shell + dashboard + result tabs + bottom nav),
  `LandingPage.jsx`, `AuthScreen.jsx`, `SettingsScreen.jsx`,
  `AdminDashboard.jsx`, `DocxReport.js`.
- `src/components/docx/` — DOCX section builders
  (sections-core, sections-atmosflow, sections-recommendations, etc.).
- `src/components/pricing/` — Pricing UI: `PricingSheet.jsx`, `tiers.js`.
- `components/onboarding/FirstAssessmentTour.tsx` (root, not under src/)
  — first-assessment guided tour. The TSX components for onboarding,
  account, and pricing-related UI live at the repo root rather than
  under `src/components/` because the acceptance gates assert their
  paths there. The SPA imports them via relative paths.
- `components/account/AccountSettings.tsx` (root, not under src/) —
  self-serve account settings (Manage Subscription, profile edit,
  two-step delete).
- `src/engine/` — TypeScript engine: scoring contracts, ClientReport
  rendering, CIH-validation layer, professional-opinion logic, citation
  templates, finding groups, watermark interface.
  - `src/engine/report/client.ts` — ClientReport renderer
  - `src/engine/report/cih-validation.ts` — defensibility checks
  - `src/engine/report/templates.ts` — TRANSMITTAL / SCOPE /
    LIMITATIONS / ASSESSMENT_INDEX_DISCLAIMER paragraphs
  - `src/engine/report/watermark.ts` — WatermarkConfig type
  - `src/engine/bridge/legacy.ts` — bridge from legacy scoring to
    AssessmentScore
- `src/engines/` (plural, distinct from src/engine/) — JS engines for
  assessment, sampling, narrative orchestration. **`scoring.js` is the
  core finding-generation engine** (determinism core per the standing
  rule below). It kept its name through the v3.0 score removal; what it
  produces now is findings, not points.
- `src/constants/` — `standards.js` (manifest + thresholds),
  `questions.js`, `demoData.js` / `demoDataFM.js` / `demoDataDC.js`.
- `src/utils/` — `storage.js` (localStorage), `supabaseStorage.js`
  (Supabase sync), `cloudStorage.js` (facade), `supabaseClient.js`,
  `instrumentRegistry.js`, `profiles.js`, `backup.js`.
- `src/contexts/` — React contexts (AuthContext, AssessmentContext,
  StorageContext).
- `api/` — Vercel serverless functions (.js + a few .ts):
  `webhook.js`, `checkout.js`, `credits.js`, `delete-account.js`,
  `narrative.js`, `admin.js`, `audit.js`, `customer-portal.ts`,
  `early-access.js`, `reset-credits.js`, the cron handlers,
  `_audit.js` (the audit-log helper), `profile/mark-onboarded.ts`.
- `lib/` — TypeScript utilities at the repo root:
  `sentry.ts` / `sentry-client.ts`, `email-sequences.ts` /
  `email-triggers.ts`, `password-reset.ts`, `free-tier.ts`,
  `stripe-prices.ts`.
- `components/` (root, not under src/) — contains `onboarding/` and
  `account/` (TSX components asserted by the acceptance gates and
  imported by the SPA via relative paths). Pricing UI is under
  `src/components/pricing/`, not here.
- `pages/index.tsx` — public marketing landing page. Self-contained
  TSX; not yet wired into the SPA's actual route shell (the live root
  currently renders `src/components/LandingPage.jsx`).
- `supabase/migrations/` — 011 migrations covering analytics, billing,
  teams/orgs, enterprise phase 1, early-access, webhook-idempotency,
  deletion-audit, narrative-generations, pricing rollout, onboarding,
  email queue.
- `scripts/` — acceptance runner (`acceptance-check.mjs`), engine merge
  readiness diagnostic, smoke test, password-reset verification, Stripe
  setup, cron implementations, sample-report PDF generator.
- `scripts/acceptance/` — JSON acceptance configs:
  `prod-ready.json` (71 criteria), `pricing-rollout.json` (19),
  `go-live.json` (21), and the legacy v2.X engine configs.
- `tests/` — Vitest:
  - `tests/engine/` — engine logic + report rendering tests (.ts)
  - `tests/api/` — API handler tests (.ts)
  - `tests/components/` — React component tests (.tsx, jsdom env)
  - `tests/lib/` — lib utility tests (.ts)
  - `tests/pages/` — landing-page test (.tsx, jsdom env)
  - `tests/scripts/` — script tests
- `docs/` — operational runbooks: `PRODUCTION_READINESS.md`,
  `PRICING.md`, `GO_LIVE.md`, `SENTRY.md`, `CONTAINER.md`, plus
  `ARCHITECTURE.md` at the repo root.

## Directories to skip unless explicitly asked

- `dist/` — Vite build output.
- `node_modules/` — npm install tree.
- `.vercel/` — Vercel deploy artifacts.
- `coverage/` — test coverage output.
- `public/` — static assets shipped to the SPA. The sample
  report PDF (`public/sample-report.pdf`) is a tracked binary; if you
  need to inspect it use the source generator at
  `scripts/generate-sample-report-pdf.mjs` instead.
- Other tracked binaries (`sample-report.docx`, any `*.docx` / `*.pdf` /
  `*.xlsx`) — large and rarely relevant. Use prefix `CLAUDE-REVIEW-` if
  you want me to read a specific one.

## Working principles

- **Discover before editing.** Use `grep` and `glob` to locate relevant
  code before reading files. Do not read entire directories.
- **Surgical changes only.** No drive-by refactors. If you see code that
  should be improved but isn't related to the current task, leave a
  `// TODO(claude):` comment and continue.
- **No functional regressions.** This is a production SaaS. If a fix
  risks breaking adjacent functionality, stop and surface the concern
  before proceeding.
- **Defensibility is a floor, not the product.** AtmosFlow still must not
  claim compliance certification, professional opinion without licensed
  sign-off, or causation the evidence does not support — the MSA recitals
  depend on it, and the permission flags plus `api/_banned-language.js`
  enforce it. That floor holds.

  What changed in 2026-08 is its status: it is no longer the trait the
  product is built around. The platform is judged on whether it helps a
  professional investigate and communicate. So do not reach for a caveat,
  hedge, disclaimer, or label defensively — the boundary lives in the
  substantive limitation statement and the guardrails, not in repeated
  qualification. Where caution and clarity conflict on routine material,
  clarity wins; `docs/REPORTING_VOICE.md` is the governing style. (Same
  reasoning that stripped "screening" labeling platform-wide — do NOT
  reintroduce it.)
- **Preserve calibration gating.** The instrument-calibration gate is a
  competitive moat and a litigation defense. Do not bypass or weaken it.
  Described precisely, because the report appendix asserts this to
  clients and previously overstated it:
  - **Validity is 365 days** (`CAL_VALIDITY_DAYS`, defined in BOTH
    `src/utils/instrumentRegistry.js` and `lib/calibration/banner-state.ts`
    — keep them in step). Earlier revisions of this file said 270; 365 is
    the correct and confirmed figure (product decision, 2026-08). It is
    NOT configurable by device class today; per-class override is
    roadmap only.
  - **Where it bites:** `MobileApp.finishAssessment` interrupts
    finalization when instrument make/model, serial, calibration date or
    status is missing, or calibration is older than 365 days. It lists
    what is missing and stops.
  - **What it is not:** a hard block. The assessor can proceed
    (`finishAssessment(true, acknowledgement)`). Report EXPORT
    (`handleExport` / `executeExport`) is not gated at all.
  - **What proceeding costs (2026-08):** a written justification. The
    interrupt's "Continue without" button opens a required textarea
    (`validateJustification`, min 20 chars) and builds a calibration
    ACKNOWLEDGEMENT — `src/utils/calibrationAcknowledgement.js`. It is
    persisted on `assessments.calibration_acknowledgement` (migration
    028, jsonb, never backfilled), emitted append-only to `audit_log` as
    `calibration_exception_acknowledged`, exposed on the assessment
    context as `calibration_acknowledgement`, and printed verbatim in the
    appendix E QA notes with who / when / why.
    The acknowledgement **ADDS an audit artifact and removes nothing.**
    An acknowledged gap still fires the engine's data-gap trigger, still
    appears under "Limitations on Reliance", and still prints its own
    appendix row. Do not confuse it with the deleted IH score-override
    (`consultantReportOverride.js`), which mutated the score so triggers
    stopped firing — post-v2.9 that would DELETE a real disclosure.
  - **Separately**, the engine's calibration data-gap trigger fires on
    the ABSENCE of any calibration record — not on an expired one — and
    surfaces as a cover notice plus a "Limitations on Reliance" entry
    (engine v2.9+).
  - Any client-facing text describing this must not promise a hard
    block — that does not exist — and must not describe the
    acknowledgement as resolving, waiving or excusing the gap. It
    records who accepted it and on what reasoning; that is all. See
    `tests/engine/calibration-qa-notes.test.ts` and
    `tests/lib/calibrationAcknowledgement.test.ts`.
- **The engine has two layers, and only one of them is fixed.** The split
  matters because the old absolute rule ("do not modify anything under
  `src/engine/`") was read as *don't touch anything the engine renders* —
  which put report wording out of reach and turned every clarity fix into a
  governance question.

  **Determinism core — changes need explicit product sign-off.** Scoring
  logic (`src/engines/scoring.js`, `scoring-legacy.js`), threshold constants
  (`src/constants/standards.js`), the scoring contracts and finding shapes
  in `src/engine/types/`, and the permission-flag logic deciding what a
  narrative may assert. These determine **what the engine concludes**.
  Changing them changes numbers and conclusions, and the reproducibility of
  already-issued reports rests on them. Ask first, and say what moves.

  **Editorial layer — change it like any other code.** Phrase wording
  (`src/engine/report/phrases/`), parameter prose
  (`src/engine/report/parameter-prose/`), the verbatim paragraphs in
  `templates.ts`, section ordering, and where a limitation renders. These
  determine **how a conclusion is communicated**. Communication is a product
  concern, not a compliance artifact; improving it needs no special
  dispensation. Tests and the acceptance gates are the check.

  **The decision test:** would the change alter what the engine concludes
  from the same inputs? If yes, it is core — ask. If it only changes how
  that conclusion reads, it is editorial — make it well, and let the tests
  catch regressions.

  Two guardrails survive intact in both layers, because neither is about
  caution for its own sake: the **banned-term list** with its permission
  flags (`cih-validation.ts` + the `api/_banned-language.js` mirror, kept in
  sync by `banned-language-parity.test.ts`), and **AI provenance
  labelling**. Nothing in the editorial layer requires "confirmed", "caused
  by", or "noncompliant", so clarity work never needs to weaken them.

  *History: this replaced an absolute "the engine is sacred" prohibition in
  2026-08, after it required two one-off overrides in quick succession —
  v2.9.0 report issuance, then the reporting-voice change. Both were
  editorial under the rule above. Needing an exception for routine wording
  changes was the signal the line had been drawn in the wrong place. The
  v2.9.0 issuance change is described under Defensibility primitives; the
  voice change in `docs/REPORTING_VOICE.md`.*

## Assessment context (connectivity layer)

There is one normalized shape every downstream consumer (Jasper,
narrative generation, report rendering, Logger Studio, future
server-side revalidation) should read from:

- **Shape:** `lib/context/types.ts` — the `AssessmentContext`
  interface. Every field is `readonly` (one-way data flow: consumers
  READ the context; they never write back into it, the engine, or
  the assessment record).
- **Builder:** `lib/context/buildAssessmentContext.ts` —
  `buildAssessmentContext(rawState)`. Pure function; composes the
  existing pure helpers (`buildReadinessVerdict`,
  `summarizeLoggerForContext`, `ENGINE_VERSION`). Engine outputs
  (composite, zoneScores, recs, narrative) pass through unchanged.
- **Drift guard:** `tests/lib/buildAssessmentContext.test.ts` pins the
  top-level key set AND the `meta` key set against a golden fixture. If
  you add a field to either, update the fixture; a failing snapshot means
  a consumer-breaking change. (`meta` was added to the guard in the
  report-lifecycle work: pinning only the top level let fields be added
  inside `meta` — the block every consumer reads first — completely
  undetected. Other sub-objects are still unpinned; widen the guard if you
  touch them.)

When adding a new AI / report / export consumer, read from the
builder's output — do NOT hand-build a bespoke data pull (the
pattern Jasper's old `context = {...}` literal in MobileApp.jsx
used). Migrating existing consumers onto the builder is staged
(see the connectivity-layer plan): the builder ships first
(landed), Jasper / DOCX migrations follow additively.

## Engine version conventions

Three concepts, kept distinct:
- **App version** — the Vite client build (e.g. 6.0.0)
- **Engine version** — the scoring/methodology engine (e.g. 2.6.0)
- **Standards manifest version** — the bibliography snapshot, dated

All three derive from a single source of truth. Do not hardcode version
strings outside that source.

## Defensibility primitives

The floor described in the working principles, stated concretely. These
patterns are non-negotiable — but they are a floor to clear, not a target to
aim at. Clearing them does not make a report good; it makes it publishable.
When working on report generation:

- **Citation tracker.** Every body-text reference to a standard registers
  with the tracker (`src/engine/report/citation-tracker.ts`), and the walker
  still populates `appendixD.citations` / `displayLines` as the audit record
  of what a report cited.

  **The register is no longer RENDERED** (product decision, 2026-08). Appendix
  D used to close with a ~22-line bibliographic catalogue; it is now
  "Appendix D — Criteria Background" and carries the per-parameter background
  prose and interpretation notes only. Each criterion is already named where
  it is used — beside its result in **Criteria Applied**, in the finding it
  produced, and in that background prose — so the catalogue stated it a third
  time. A reviewer reads the standards off the report, which is how
  consultant reports in this field are normally written. Do not reintroduce a
  standards list; `tests/engine/no-standards-register.test.ts` fails if one
  reappears in the DOCX. Tracking is unchanged — only printing stopped.
- **Qualitative-only propagation.** Findings derived from instruments
  not in the accuracy database inherit a `qualitative_only: true` flag
  that propagates to every rendered output of that finding.
- **Location on recommendations.** Every Immediate-priority
  recommendation must populate at least one of: `zone_id`, `system`,
  `surface_or_asset`, `free_text`.
- **Finalization gate (advisory only).** `src/engines/validation.js`
  produces a two-tier blocker list — HARD (missing client name, missing
  site contact name + role, missing photos for Critical/High findings)
  and DISMISSIBLE (occupant denominator for symptomatic zones,
  assessor-name placeholder, requested-by provenance, findings without
  recommendations) — each with the exact field + fix-location. Client
  identity autowires from `presurvey.ps_recipient_*`; occupant
  denominator autowires from the zone's `oc` / `ac` intake fields.
  **As of 2026-05-27 this gate is advisory — it does NOT block report
  issuance.** It drives the informational Readiness panel
  (`ReadinessPanel.jsx`, SCREENING mode), whose blocker cards are
  tap-to-fix (they navigate to the exact field). The consultant
  report-issuance preflight modal (`consultantReportPreflight.js`) was
  **removed** by product decision: a credentialed assessor owns
  defensibility, so AtmosFlow surfaces gaps but never hard-blocks the
  deliverable. Do not re-introduce a hard issuance block (or restore the
  preflight modal) without explicit product sign-off. Note: the engine
  may still emit a Pre-Assessment Memo instead of a full consultant
  report when it has no measurements — that is the engine's own behavior
  and a deliverable, not a finalization gate.
- **Report lifecycle: labeling ≠ issuance.** A report carries a profile
  (screening | professional | compliance) and a status (draft →
  in_review → reviewed → final); see `src/constants/reportLifecycle.js`.
  A **compliance** report cannot be *labelled* Final without a recorded
  reviewer approval (`canTransition`). That is NOT a re-introduction of
  the issuance block removed above, and should not be read as one:
  nothing gates report GENERATION on status — `downloadReportPdf.js`,
  `DocxReport.js` and `api/report-pdf.js` never read `report_status`, so
  any report can be generated, downloaded and sent at any point. The
  constraint is only on what the platform will *assert*: it will not
  claim a professional review that has no record. Same principle as
  migration 027's backfill, which marks legacy reports Final but never
  "Professionally Reviewed". `canTransition` is enforced in exactly two
  places, both in the peer-review API.
- **Journal citations must be verified.** Title, journal, volume,
  issue, pages, year — all from primary sources. Flag unverified
  entries with TODO and exclude from generated reports.
- **The consultant report was REMOVED in 2026-08.** It had accumulated too
  many defects to keep shipping. It was one of two parallel client
  deliverables; the **AtmosFlow report** (`assembleRenderModel` →
  `sections-atmosflow.js`) is the survivor and is now the only client DOCX.
  Share and peer review attach it. `renderClientReport` and
  `src/engine/report/` are retained — PrintReport.jsx and the investigation
  agent use them — but no DOCX renders them. Full account, including three
  accepted consequences, in docs/CRITERIA.md.

  *Historical, and the reason several sections below are described as
  "removed" rather than "never built":* five standards sections had already
  been cut from that report in 2026-08 after a CIH review found it overbuilt
  — the Appendix D standards register, **Criteria Applied**, **Additional
  Criteria Considered**, **Potential Contributing Factors**, and **Appendix F
  — Glossary**.

  Those builders, and the tests that kept them out
  (`omitted-consultant-sections`, `no-standards-register`), were deleted with
  the report in the removal above — along with `applied-references.js`,
  `sections-supplemental.js`, `sections-resurvey.js` and the rest of the
  consultant-only section set.

  **Carry the lesson to the surviving report.** `sections-atmosflow.js`
  renders an "Appendix A — Standards & References", which is exactly the
  standards register `no-standards-register.test.ts` existed to keep out of a
  deliverable. Nothing currently stops it. If that register is reconsidered,
  note the trap the old guard caught: check the table of contents as well as
  the body — a removal that deletes only the section leaves the contents page
  pointing at nothing, which is how "Standards, Guidelines, and Benchmark
  Types" survived its own rename. And if a one-criterion-per-parameter table
  is ever built again, do NOT source its citation from a fixed per-parameter
  default. The trap this warned about was real and has since been fixed at
  the root: the Logger Studio card drew ASHRAE 55's "acceptable" range while
  the engine flagged a tighter "optimal" band, so the table contradicted the
  finding beside it. Both tiers turned out to be invented — see the thermal
  comfort note below — and there is now one band that every surface reads.
- **Every layer must say the same thing about the same data.** The report is
  assembled by layers that each used to form their own opinion — the legacy
  scorer, the bridge, the professional-opinion rollup, the phrase library,
  the parameter prose, the renderers. Every contradiction this codebase has
  shipped came from one of them deciding something the others did not know.

  Three rules, each learned from a shipped defect:

  1. **A phrase template may not assert a verdict.** `ventilation_co2_only`
     opened "CO₂ results were within the reference range" whatever the
     reading — in an entry whose own `bannedAlternatives` forbid "CO₂ below
     standard". A template states the CONDITION or the LIMITATION; whether
     the reading is acceptable is the engine's answer, not the template's.
  2. **`classify.ts` routes on severity and structured fields, never on
     finding prose.** `matches` is `includes`, so the token `inadequate`
     never matched the worst CO₂ tier's own word `inadequacy`, and the
     medium tier's "approaching concern" matched nothing. Both fell into the
     within-range template while the tier between them classified correctly.
     Rewording a finding must never change how it is classified.
  3. **The opinion rollup weighs findings; it does not count them.** Tiers
     come from `tierForFinding` (severity, raised by documented evidence) and
     the zone takes the max. The old rules required "2+ provisional
     findings", so ONE high-severity finding matched nothing and produced
     "No significant indoor air quality concerns were identified". Two
     properties are asserted in `professional-opinion.test.ts` and must
     hold: **count-invariance** (one finding and ten identical ones agree)
     and **monotonicity in confidence** (better evidence never lowers the
     tier — a visual observation once outranked an instrument measurement).

     **This rule applies to causal chains too, and did not reach them for four
     months.** Every chain in `causalChains.js` ended in some form of
     `ev.length >= N`, which asks how many strings are in an array rather than
     what kind of evidence exists. In the cross-contamination chain that meant
     typing anything at all into the free-text `path_crosstalk_source` — even
     "unknown" — pushed a second string and raised the tier from Possible to
     Moderate; the field elaborates the observation the chain already rests on
     and is not independent support. A complaint-only chain labelled
     "(Hypothesis)" in its own type string could reach **Strong** by having
     four complaint fields filled in. Both are fixed by `weighChain`, which
     separates `measured` from `corroborating` and makes Strong unreachable for
     a hypothesis; `tests/engine/chain-confidence.test.ts` pins it, including
     monotonicity. Nothing failed when this was corrected, because nothing had
     ever asserted it.

  **The backstop is currently missing.** `cross-layer-consistency.test.ts`
  rendered real *consultant* reports across a fixture matrix and asserted the
  layers agreed with each other and with the engine. The consultant report was
  removed in 2026-08 (see below) and that test went with it. The three rules
  above still hold and are still individually tested, but nothing now renders
  the surviving deliverable and checks the layers against each other.
  **Re-establishing that on the AtmosFlow report is the highest-value open
  work in this area** — see docs/CRITERIA.md, "The consultant report
  (removed)".
- **A comfort band travels with its assumptions, and ASHRAE 55 has ONE.**
  `STD.t.temp` is a single acceptable range per season — winter 68–76°F,
  summer 73–79°F — and `tests/engine/thermal-comfort-band.test.ts` holds it
  there. It used to be a wide 67–82°F "acceptable" band with a tighter
  73–79°F "optimal" band inside it, both attributed to ASHRAE 55-2023.
  Neither the wide figure nor the two-tier ladder is in the standard, the
  block was the only constant in `standards.js` with no provenance comment,
  and it contradicted this project's own standards corpus — which already
  held the right numbers. The engine scored one band, Jasper cited another,
  and the Logger Studio card drew a third, so a single 72.6°F reading read
  as in-range on one surface and as a finding on another.

  Three qualifiers travel with the band and must be stated wherever it is:
  the **assumptions** (1.0–1.3 met, 0.5 clo summer / 1.0 clo winter), the
  **quantity** (the standard's zone is OPERATIVE temperature; AtmosFlow
  measures dry-bulb air temperature, which diverges near glazing), and
  **what it is not** (ASHRAE 55 resolves comfort from six variables and the
  app captures one, so an out-of-band reading is an indicator, never a
  determination). Severity is capped at `medium` by
  `CRITERION_CLASS.comfort_consensus` — the engine used to raise `high`,
  breaking a ceiling it defines itself.

  **RH 30–60% is not an ASHRAE 55 figure either**, and was cited as one on
  eleven surfaces until 2026-08. ASHRAE 55 expresses its upper humidity limit
  as a humidity ratio (0.012 kg/kg) rather than an RH percentage, and it
  dropped its lower limit in 55-2013 — so the 30% floor was attributed to a
  standard that does not contain it. The band is US EPA moisture-control
  guidance (below 60%, ideally 30–50%), it carries its own `STD.t.rh.ref`
  rather than inheriting `STD.t.ref`, and its two bounds have different
  rationales: 60% is condensation and microbial-amplification control, 30% is
  dryness and irritation. `tests/engine/humidity-citation.test.ts` sweeps
  every file that states the band. Note how it spread — six of the eleven
  surfaces simply read `STD.t.ref` because `rh` sat inside `STD.t`. **A
  constant nested under another's citation inherits it.**
- **A threshold travels with its averaging period, class and source.**
  `src/constants/criteria.js` is the registry; `docs/CRITERIA.md` explains
  it. **This rule now has enforcement**
  (`tests/engine/criterion-coverage.test.ts`): every parameter the engine
  emits a finding for must name a registry criterion, and that criterion must
  carry an averaging period, a class and a source. It was added after the two
  parameters that had no entry — temperature and relative humidity — turned
  out to be the only two whose citations were wrong. They had no entry because
  the registry could only express `value > threshold` and comfort is a range;
  **band criteria** (`resolveBand`) closed that in 2026-08. A band declares a
  scope (`season`) that `evaluateCriteria` will not guess, exposes the same
  `resolve()` / `valueLabel` / `midpoint` accessors as a limit, and grounds
  BOTH bounds in `provenance.ts`. Never compare a measured value against a
  bare number from `STD` —
  an 8-hour TWA compared to a grab reading produces a statement the
  measurement cannot support, which is how `CO — EXCEEDS OSHA PEL` shipped.
  Severity comes from the criterion's CLASS (a ventilation indicator can
  never be `critical`), and finding sentences are generated by
  `buildStatement`, not written per branch.

## Acceptance gates

Three feature-level acceptance configs gate completion claims:

| Gate | Script | Criteria |
|---|---|---|
| Production readiness (Group A) | `npm run accept:prod-ready` | 71 |
| Pricing rollout (Group B) | `npm run accept:pricing-rollout` | 19 |
| Go-live experience (Group C) | `npm run accept:go-live` | 21 |

**Tasks are not complete until the relevant acceptance group passes.**
Run `npm run accept:prod-ready` (or `accept:pricing-rollout` /
`accept:go-live`, depending on the feature area) as the final
verification step before reporting completion. If the script exits
non-zero, the task is not done — investigate before declaring success.
Do not self-grade against prose; the runner exits 0 only when every
criterion passes. The runner itself lives at
`scripts/acceptance-check.mjs`.

## Session-learned pitfalls

Patterns where Claude Code has gone down the wrong path during sessions
on this codebase. Watch for them.

1. **Working directory matters for `npm install`.** This is a monorepo
   (`Prudence-EHS-tools/{atmosiq-v6, hydroscan, oshaready, reglens}`).
   The atmosiq-v6/ workspace has its own `package.json` and
   `node_modules/`. Running `npm install` from the repo root creates a
   stray top-level `package.json` / `node_modules` that breaks
   transitive dependency resolution (e.g. wrong React version pulled
   in for tests, then test failures appear in unrelated files).
   Always `cd atmosiq-v6/` before any `npm` command.

2. **API handlers are CommonJS; `vi.mock` doesn't reliably intercept
   `require()` calls.** Tests for `api/*.js` files cannot mock
   `stripe` or `@supabase/supabase-js` via `vi.mock` alone — the
   require resolves before the mock takes effect. Established pattern:
   each handler exports `module.exports.__test = { setStripe(mock),
   setSupabase(mock), reset...() }` and tests inject mocks via those
   hooks instead of `vi.mock`. See `api/webhook.js`,
   `api/delete-account.js`, `api/narrative.js`, `api/customer-portal.ts`
   for the established shape. New API tests should follow the same
   pattern, not reinvent the mocking strategy.

3. **Engine season detection is calendar-based — now date-injectable.**
   `comfortSeason(assessmentDate)` in `src/engines/scoring.js` chooses
   summer (May–October: **73–79°F**) vs winter (November–April:
   **68–76°F**). `scoreEnv` reads it off `d.assessmentDate`, which
   rides in on the building object, and falls back to now when absent.

   **Tests MUST pin a date** (`scoreZone(zone, { assessmentDate:
   '2026-07-15' })`). This stopped being optional in 2026-08: the bands
   used to be a wide invented 67–82°F "acceptable" range with a tighter
   "optimal" band inside it, and the outer range was forgiving enough that
   an unpinned fixture passed in any month. With the real bands only
   73–76°F satisfies both seasons, so an unpinned test now passes or fails
   by the month it runs in — `scoring.test.js` and two seasonality tests
   were all re-pinned for exactly that reason.

   It used to read the clock directly, which meant a report re-scored in
   November applied the winter band to an October survey: the same data
   produced a different report depending on the day it was rendered.
   Finalized reports are additionally guarded (`runScoring` early-returns
   when `viewRpt` is set), because `handleExport` builds its DOCX from
   component state.

   Still open: a DRAFT carries only `ua` (last-saved), not a survey date,
   so nothing is passed on that path and it still falls back to now. The
   calendar heuristic itself is also imprecise — May is spring — and
   clothing insulation, not month, is what ASHRAE 55 actually keys on.

4. **No extension-less `.ts` imports from a `.js` file on the API
   path.** PR #297 (commit `fcfe774`) shipped this line in
   `src/constants/field-assistant-tools.js` (a plain ES module loaded
   by every Jasper turn):

   ```js
   import { renderTemplate as defaultRenderTemplate }
     from '../../lib/report-templates/render'
   ```

   `render.ts` is TypeScript. Vitest's TS-aware resolver let the
   extension-less `.ts` import resolve cleanly from a `.js` file,
   so the test suite (1736/1741) was green, lint was green,
   typecheck was green, and accept:prod-ready was green. Vercel's
   serverless Node runtime, however, can't resolve a `.ts`
   extension from a plain `.js` ESM importer at module-load time —
   `/api/field-assistant` crashed at import before any handler
   logic ran, and every Jasper turn returned 500 in production.
   The crash silently passed every local gate and only surfaced on
   atmosflow.net.

   **The rule:** any `.js` / `.mjs` file that's transitively
   reachable from `api/**` must NOT import an extension-less path
   that resolves to a `.ts` / `.tsx` file. Two ways to satisfy it:
   (a) inject the dep via a `ctx` parameter from a `.ts` entry
   point (the `analyze_photo` / `generate_report` pattern in
   `api/field-assistant.ts`), or (b) convert the importer itself
   to `.ts`. SPA-side `.js → .ts` imports (under `src/components/`,
   `src/main.jsx`, etc.) are intentionally allowed — Vite's
   bundler handles them transparently. The narrow rule only
   applies to the API graph.

   **The guardrail:** `scripts/check-api-js-imports.mjs` runs as
   part of `npm run lint` (wired through `lint:imports`) and as
   acceptance criterion `API-JS-IMPORT-GUARDRAIL`. It walks the
   import graph rooted at `api/**`, collects every `.js`/`.mjs`
   file reached, and fails if any of their extension-less imports
   resolve only to a `.ts`/`.tsx` file. The regression test at
   `tests/scripts/check-api-js-imports.test.ts` exercises this
   against a fixture tree that re-encodes the PR #297 pattern.

5. **No heavy DOCX deps on the Jasper hot path.** After PR #297 / #298
   landed, the Jasper handler still imported `lib/report-templates/render.ts`
   directly — which pulls `docxtemplater` and `pizzip` into every
   cold-start of `/api/field-assistant`. The user reported continued
   500s on production despite the `.js → .ts` resolution fix. Root
   cause was less important than the architectural rule we now enforce:

   **The Jasper hot path stays lean.** `generate_report` returns a
   render PROPOSAL — `{ status: 'render_proposed', template_id,
   template_name, file_name }`. The handler side-channels a
   `render_proposed` SSE event; the client receives it and POSTs to
   `/api/report-templates-render` (the dedicated function that
   actually bundles docxtemplater) with the same Bearer token. The
   chat surfaces a Download card in `rendering` → `ready` → `downloaded`
   states. This mirrors the `propose_action` pattern: the tool
   dispatches intent; the client executes.

   **The guardrail:** `tests/api/field-assistant-bundle.test.ts`
   compiles `api/field-assistant.ts` with esbuild (matching Vercel's
   bundle shape) and asserts that the output contains NO
   `docxtemplater` / `pizzip` / `report-templates/render` /
   `renderTemplate` symbol. A positive control asserts
   `api/report-templates-render.ts` DOES bundle docxtemplater (so we
   don't accidentally decouple too aggressively). Re-introducing the
   import fails this test in CI before merge.

   **Diagnostic instrumentation:** every implicit 500 path in the
   handler now carries a stable `code` (`fa_init_000` … `fa_init_005`)
   in the response body. When the user reports "Server error (500)",
   reading the response in DevTools immediately identifies which path
   failed (env var, supabase init, auth, conversation, history,
   rate-limit). The user-visible message stays "Server error (500).
   Please try again." — the code is for debugging only.

## The 100-point score was removed (engine v3.0)

Nothing computes a composite score, a category weight, a deduction or a
risk band. `scoreZone` still produces the findings tree — that was always
its real job — and `summarizeAssessment` replaced `compositeScore` with a
finding census, a zone count, confidence and a partial-data flag.

**Do not reintroduce a rating.** `tests/engine/no-scoring.test.ts` and the
`NO-COMPOSITE-SCORE` acceptance criterion assert the absence at every
layer it reached, including that a saved assessment still carrying
`comp` / `zone_scores` / `score` keys is inert.

Why it went, since the reasons constrain what may replace it: the number
was simultaneously a weighted mean, a worst-zone override, a
normalization against whatever data was captured, and a severity cap, so
it could not be explained in a sentence. Six mutually inconsistent band
ladders existed across the codebase — including inside the file that
claimed to be their single source of truth — and the two published
composite formulas contradicted each other.

What replaced it is a **census**: how many findings, at what severity,
in which zone.

**Two verdict rollups survive, and that is deliberate — do not remove
them as "leftover scoring".** `resolveVerdict`
(`src/utils/assessmentVerdict.js`, four states: Critical Concern /
Significant Concern / Moderate Concern / Within Acceptable Range) and
`ProfessionalOpinionTier`
(`src/engine/report/professional-opinion.ts`, four tiers). Neither has
any score dependency; both predate the removal and were untouched by it.
They were reviewed on their own merits after the removal shipped and
kept, on the reasoning that a consultant deliverable is supposed to carry
a professional's conclusion — the platform stopped RATING buildings, it
did not stop concluding.

They do read like a rating, which is the trap: the first report off the
v3.0 build showed "Minor observations only / Conditions within acceptable
range" and was reasonably mistaken for the score coming back. Two rules
follow, both learned there:

  1. **The verdict is stated ONCE per surface**, in the lead card. The
     panels below it explain the verdict or list what was found; none of
     them restates the conclusion. The same sentence rendered twice on
     one scroll is what made the app look like it was still scoring.
  2. **No numeric ladder may reappear behind either rollup.** The last
     one — a 30/50/70 over `comp.tot` in the results panel — outlived
     the composite by reading a field that no longer exists, so every
     comparison was false and it silently printed the cleanest verdict
     in the system over an assessment with critical findings.

**Data confidence is a third ladder, and it stays too — but for a reason
that does not generalize.** `getConfidenceLevel` bands at 0.85 / 0.6 /
0.3 over `sufficiency._overall`. That is a ladder over a number, so it
gets asked about; the answer is what the number MEANS. It is a
completeness fraction — the share of expected inputs actually recorded —
so it can be shown its work (`evaluateCategorySufficiency` returns
`present` and `missing`), and it says nothing about the building. It
rates the RECORD, not the site. The composite could claim neither.

Confidence WAS coupled to the score and no longer is: `_overall` used to
be weighted by the category point caps (25/25/20/15/15), so it silently
inherited the scoring weight vector. v3.0 made it an unweighted mean.
The invariant that keeps them apart is asserted in
`no-scoring.test.ts` — two zones with an identical set of captured
fields but 1 vs 6 findings must produce the same completeness ratio to
ten decimal places. **If confidence ever starts moving with severity, it
has become a rating of the site again.**

The other three confidence mechanisms have never touched the score and
are not ladders over one: `evalMeasurementConfidence` (counts captured
parameters), `CIHConfidenceTier` (`validated_defensible` /
`provisional_screening_level` / `qualitative_only`, from evidence basis —
and load-bearing for `professional-opinion.ts`'s monotonicity property),
and the structural demotions in `scoreZone` (`gate5`, `adminGap`,
insufficient categories).

Stored scores are NOT deleted. The Supabase `score` / `composite` /
`zone_scores` columns and the localStorage report index keep their data;
nothing reads them. Dropping a column is irreversible and an issued
report's record is the only evidence of what it said.

## Out of scope unless explicitly requested

- UI redesign (separate plan; result tabs / demo cards / bottom nav
  redesigned in commit `c1ed1c8`, broader UI system pass deferred)
- Mold module: the **foundation has landed** — a parallel, deterministic
  assessment engine (`src/engines/mold/*`, IICRC S520 water Category +
  remediation Condition + comparative indoor/outdoor spore analysis),
  `src/constants/moldStandards.js`, `src/types/mold.ts`, the intake schema
  (`src/constants/moldQuestions.js`) + demo (`demoDataMold.js`), and a read-only
  result surface `src/components/MoldScreeningView.jsx` that **mirrors the IAQ
  result tabs** (reuses `AssessmentSegmentedPillNav`: Findings / Conditions /
  Spores / Review). Like the IAQ module, the assessment basis + limitation live
  in the Review tab and the report (Basis and limitations), NOT a banner, with a
  per-finding "Professional review recommended" flag; there is also a
  `/dev/mold-screening` preview. **Live as a Beta**: `MOLD_KILL_SWITCH` lifted
  and the flag defaults ON on every host incl. production
  (`resolveMoldFlag` → `defaultOn`); `?mold=0` hides it per-browser. Mold is its
  **own `userMode`**: `terminology.js` registers `'mold'`, and `MobileApp.jsx`
  EARLY-RETURNS the isolated `src/components/MoldModeScreen.jsx` (home → intake →
  result) when `userMode==='mold'` && the flag is on — so the IAQ shell/nav never
  mounts in mold mode and IH/FM are untouched. Entered from Settings →
  *Assessment mode → Mold assessment (Beta)*; exits back to IH. Docs:
  `docs/MOLD_MODULE.md`;
  gates: `npm run test:mold` / `accept:mold`. No health verdict —
  categorical severity, every finding requires professional review.
  Assessments **persist** — `STO.get/save/deleteMoldAssessment`
  (`KEYS.moldAssessments`), a local collection like incidents, kept OUT of the
  IAQ reports/drafts index; the record stores the captured INPUT and the result
  is re-derived on open. An assessment produces a standalone **DOCX report**
  (`src/components/docx/sections-mold.js` + `mold-report.js`, reusing the shared
  report chrome; `MoldModeScreen` dynamic-imports `generateMoldReport`). **Still
  out of scope** (next increment): **cloud sync** of mold assessments (local-only
  today). The engine is versioned independently (`MOLD_ENGINE_VERSION`) and
  imports nothing from the sacred IAQ engine.
- Marketing copy on prudenceehs.com or atmosflow positioning pages
- FedRAMP MFA enforcement, FIPS-140 crypto, SSP authoring (handled by
  separate FedRAMP workstream; see `docs/PRODUCTION_READINESS.md`)

## Test commands

- `npm run test` — Vitest unit + integration tests (default)
- `npm run typecheck` — TypeScript noEmit check
  (`tsc --noEmit -p tsconfig.check.json`, scoped to new infra paths;
  src/engine type errors are a separate engine-scope follow-up)
- `npm run lint` — ESLint flat config, scoped to new infra paths
- `npm run build` — Vite SPA production build

Run tests after any change to `src/engine/`, `src/engines/`, `src/components/docx/`,
`api/`, or `lib/`.

## Anti-patterns to avoid

- Hardcoded standards thresholds inside scoring logic (thresholds live
  in `src/constants/standards.js`, not in scoring code paths)
- AI-generated narrative without an AI-provenance label. The label is a
  statement about WHO WROTE the text, not about whether the report is
  finished — a client-facing paragraph written by a model must stay
  distinguishable from one the assessor wrote, in every lifecycle state.
  Two enforcement points, both guarded by tests:
  - **DOCX**: `aiProvenanceBanner()` in
    `src/components/docx/sections-core.js` renders
    "AI-ASSISTED NARRATIVE — VERIFY BEFORE ISSUE" immediately before any
    AI narrative, and nothing for deterministic prose.
    (`tests/engine/ai-provenance-banner.test.ts`, acceptance
    `NARRATIVE-AI-PROVENANCE-BANNER`.)
  - **Chat**: every Jasper answer ends with `AI_DISCLAIMER_LINE`
    ("AI-assisted response — verify before use.") from
    `api/_jasper-lint.js`, which REWRITES non-conforming output. The
    literal is duplicated in `src/constants/field-assistant-prompt.js`
    because the two live on different module systems;
    `tests/api/jasper-disclaimer.test.ts` stops them drifting.
  Both were reworded off "IH Review Required" — that phrase stamped
  every report and every chat answer as pending review, which was the
  problem the report lifecycle set out to fix. The liability
  boundary does NOT rest on either label: in the report it is the
  limitation statement, and in chat the required "## Defensibility note"
  section.
- TVOC interpretation without Mølhave 1991 advisory tier disclaimer
- ASHRAE 62.1 cited as a CO₂ contaminant limit (it isn't — see Persily
  2021)
- Spore counts framed as health proof (they aren't — IOM 2004,
  ACMT 2025)
- Report generation without calibration verification

## When in doubt

Ask. The author of this codebase is **Tsidi Tamakloe** (CSP, BCSP
#38426, OSH Program Manager at FAA). His preferred work style is:
discovery first, surgical fixes, explicit acceptance criteria, no
drive-by changes. If a task is ambiguous, surface the ambiguity rather
than picking a direction.
