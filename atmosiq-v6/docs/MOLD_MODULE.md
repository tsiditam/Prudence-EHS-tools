# Mold Screening Module

The mold module turns a mold/moisture assessment into an explicit, deterministic
**screening** result: IICRC S520 water-intrusion **Categories**, suggested
remediation **Conditions**, comparative indoor/outdoor **spore screening**, and
categorical **findings** — all sourced, all screening-only, none a health
verdict. It is a *parallel* system to the IAQ engine: it shares zones, photos,
lab ingest, report chrome and calibration, but never touches IAQ scoring.

> **Status:** foundation landed, **staged dark** behind `MOLD_KILL_SWITCH`
> (`src/utils/featureFlags.js`, currently `true`). The engine, standards, intake
> schema, demo fixture, tests and acceptance gate ship now; the mold *mode UI*
> and the *DOCX report* are the next, separately-reviewable increments. Nothing
> is wired into the running app yet, so the live IH/FM product is unchanged.

## First principle

The mold engine is a **pure, deterministic projection** of assessment inputs →
a screening result. It holds no original facts and can be rebuilt at any time
from `(zones + observations + lab spore rows)`. Consequences baked into the
design, and enforced by tests:

- **No health verdict, ever.** There is no health-based numeric exposure limit
  for airborne mold spores (IOM 2004; ACMT 2025). Severity is **categorical**
  (`observation | screening_indicator | elevated_indicator`) — never a numeric
  "mold risk score" that would imply an exposure/health determination.
- **Classification, then comparison.** Interpretation is IICRC S520
  classification (water Category 1–3, remediation Condition 1–3) plus
  **comparative** indoor-vs-outdoor spore screening. A bare indoor spore count
  is `insufficient-data`, not a finding.
- **Every finding is screening.** Each carries `screeningOnly: true` and
  `requiresProfessionalReview: true`; the standing disclaimer and the
  no-health-limit note ride on every result.
- **The IAQ engine is sacred.** No file under `src/engine/` or
  `src/engines/scoring.js` is touched. The mold engine imports nothing from
  them and carries its **own** version (`MOLD_ENGINE_VERSION`).

## Architecture

| Layer | File | Notes |
|---|---|---|
| Version | `src/version.js` | `MOLD_ENGINE_VERSION` (`0.1.0`), independent of `ENGINE_VERSION` |
| Standards | `src/constants/moldStandards.js` | S520 `WATER_CATEGORIES` + `REMEDIATION_CONDITIONS`, `MOISTURE_INDICATORS`, `SPORE_SCREENING`, the screening disclaimer + no-health-limit note. The single place thresholds/vocabulary live (engine never hardcodes them) |
| Types | `src/types/mold.ts` | Readonly domain model (`MoldAssessmentInput` → `MoldScreeningResult`) |
| Engine | `src/engines/mold/*.js` | Pure classifiers + `assessMold()` orchestrator (below) |
| Intake | `src/constants/moldQuestions.js` | Declarative `Q_MOLD_PRESURVEY` / `Q_MOLD_ZONE` (same shape as `questions.js`) |
| Mapper | `src/engines/mold/buildInput.js` | `buildMoldInput(state)` — pure intake → engine input; keeps schema + engine in step |
| Demo | `src/constants/demoDataMold.js` | Realistic fixture exercising every path |
| Flag | `src/utils/featureFlags.js` | `isMoldModuleEnabled()` / `MOLD_KILL_SWITCH`, via the shared `resolveStagedFlag()` |
| Manifest | `src/constants/standards.js` | S520 / AIHA / EPA / IOM / ACMT added to `STANDARDS_MANIFEST` (bibliographic) |

### The engine is four classifiers + an orchestrator

1. **`classifyWaterCategory(source, {prolonged})`** — maps a *described* water
   source to an S520 Category (1 sanitary / 2 significantly contaminated / 3
   grossly contaminated). Keyword classification against the S520 definitions;
   an unrecognized source returns `null` (professional classifies it — no
   guess). A prolonged Cat 1/2 event is *flagged* as potentially escalated,
   never silently reclassified.
2. **`classifyCondition(evidence)`** — suggests a remediation Condition (1
   normal ecology / 2 settled spores / 3 actual growth) from observed evidence,
   with an explicit `basis[]`. In S520 the Condition is a professional
   determination, so this is a *screening-suggested* condition.
3. **`evaluateMoisture(reading)`** — compares a reading to its material's
   building-science screening reference (`MOISTURE_INDICATORS`). "Elevated"
   means *supports growth potential — investigate*, sourced to EPA 2008; never a
   health limit, never a claim mold is present.
4. **`screenSpores(indoor, outdoor)`** — comparative only (AIHA 2020). Produces
   a categorical outcome: `possible-amplification-indicator` /
   `consistent-with-normal-ecology` / `insufficient-data`. No paired outdoor
   reference → `insufficient-data`.

**`assessMold(input)`** composes them into a deterministic, version-stamped
`MoldScreeningResult`: `waterCategories`, per-zone `conditions`, `sporeScreening`,
sorted `findings`, `limitations`, `standardsCited`, and the `disclaimer`. It is
defensive — any non-array input degrades to empty, it never throws.

## IICRC S520 model

- **Water Categories** describe the sanitary quality of the intruding water at
  its source; Categories 1 and 2 `mayEscalate` with time/contact.
- **Remediation Conditions** describe the indoor environment: Condition 1 is the
  reference ("normal fungal ecology"), Condition 2 is settled spores from a
  Condition 3 area, Condition 3 is actual (visible or hidden) growth.

Both are stored with their published definitions and cited to `IICRC S520-2024`.

## Screening-only framing (defensibility)

Three strings, imported everywhere rather than re-authored, keep the positioning
from drifting:

- `MOLD_SCREENING_DISCLAIMER` — "Screening only … must be confirmed by a
  qualified professional."
- `NO_HEALTH_LIMIT_NOTE` — states no health-based numeric spore limit exists
  (IOM 2004; ACMT 2025) and that spore data are interpreted comparatively.
- Every `MoldFinding` is `screeningOnly` + `requiresProfessionalReview`.

This is the "spore counts are not health proof" anti-pattern (CLAUDE.md),
encoded and test-guarded (`tests/engine/mold-standards.test.ts`,
`tests/engine/mold-engine.test.ts` banned-language check).

## Feature flag

`isMoldModuleEnabled()` resolves through the **shared** `resolveStagedFlag()`
(the same algorithm the Knowledge Graph uses — one resolution path, no second
copy), with its own keys (`af.moldModule`, `af.moldCohort`) and URL param
(`?mold=1`). `MOLD_KILL_SWITCH` starts `true`, so the module is off everywhere
until the mode UI + report land. Lift the switch to resume the staged rollout
(preview-on, prod-off-by-default, `?mold=1` opt-in, beta cohort).

## Tests & acceptance

- `npm run test:mold` — classifiers, `assessMold` determinism + demo
  end-to-end, screening-only invariants, the feature flag, standards framing,
  and the intake/mapper drift guard.
- `npm run accept:mold` — the executable acceptance gate
  (`scripts/acceptance/mold.json`), including a check that the mold engine never
  imports the sacred IAQ engine and never uses health-verdict language.

## Next increments (deliberately separate, not debt)

These are scoped follow-ons, each its own reviewable change — bundling them here
would mean an unreviewable diff and would touch the live IH/FM product:

1. **Mold mode UI** — a `userMode: 'mold'` peer to `'ih'`/`'fm'` in
   `MobileApp.jsx` (home view, nav, result tabs, intake), driving the engine
   from captured fields via `buildMoldInput`. Gated by `isMoldModuleEnabled()`.
2. **DOCX mold report** — `src/components/docx/sections-mold.js`: a moisture
   Conceptual Site Model, S520 Category/Condition tables, the spore-screening
   comparison, findings, and the limitations/disclaimer, wired into
   `DocxReport.js` by mode.
3. **Lab-ingest wiring** — feed spore-trap rows from the existing lab-results
   pipeline (`sections-lab-results.js`) into `assessMold`.
4. **Calibration** — route the moisture meter / thermo-hygrometer through the
   existing calibration-acknowledgement gate.

The moisture numeric references are widely-cited building-science *screening*
figures (EPA 2008) with explicit species/meter caveats; before the report
asserts them to a client they should carry Tsidi's (CSP) sign-off, exactly as
the IAQ advisory reference lines do.
