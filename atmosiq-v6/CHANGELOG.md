# AtmosFlow Changelog

## Engine v3.0.0 — the 100-point composite score is removed

**User-visible change**

An assessment no longer produces a score or a risk band. In their place
is a **census**: how many findings, at what severity, in which zone.
The results screen, the print report, the client DOCX and the practice
roll-up all lead with that count. Nothing rates a building.

A MAJOR bump because the same inputs no longer produce the same
conclusions — the reason for the rule that a version pins reproducible
output.

**Why**

The number could not be explained in a sentence. It was simultaneously
a weighted mean over five categories (25/25/20/15/15), a worst-zone
override, a normalization against whatever data happened to be
captured, and a severity cap. Downstream of that:

- **Six mutually inconsistent band ladders** existed across the
  codebase, in four different threshold sets — including one inside
  `riskBands.js`, the file whose own header claimed to be their single
  source of truth.
- **Two published composite formulas contradicted each other**: the
  report spec said `avg x 0.6 + worst x 0.4`, the white paper said an
  arithmetic mean with a worst-zone override, and `ARCHITECTURE.md`
  published a third set of band thresholds.
- The score had already been hidden from users by default since
  2026-08. What remained was an internal computation whose real output
  was always the findings tree.

**What changed, by layer**

| Layer | Change |
|---|---|
| `src/engines/scoring.js` | `scoreZone` keeps its name and its findings; the points, weights, normalization and caps are gone. `compositeScore` is replaced by `summarizeAssessment`, returning `{ count, findings, confidence, partialData }`. |
| `src/engines/riskBands.js` | `RISK_BANDS`, `getRiskBand`, `SEVERITY_TO_BAND`, `findingsToBand` and `deriveFMSummary` deleted. Confidence survives — it was never a band over a score. |
| `src/engines/sufficiency.js` | Point caps deleted; `_overall` is now an unweighted mean (see Behaviour changes). |
| `src/utils/assessmentVerdict.js` | The composite floor is gone; a verdict now rests on the worst finding and the escalation triggers. |
| `src/engine/bridge/legacy.ts`, `report/internal.ts` | `siteScore`, `siteTier`, `composite`, `tier`, `rawScore` / `cappedScore` / `maxScore` removed from the contract; prioritization ranks by severity. |
| `PrintReport.jsx`, `SpatialMap.jsx`, `docx/sections-*`, `report/portfolioModel.js` | Score badges, the score numeral, the composite-score explanation, band tints and the band histogram replaced by the census. |
| `featureFlags.js` | `isIaqScoreVisible` / `IAQ_SCORE_VISIBLE_DEFAULT` deleted along with the `?score=1` escape hatch. |
| Copy and docs | FAQ, terminology, feature tour, landing page, white paper, `ARCHITECTURE.md`, `REPORT_ARCHITECTURE.md`, `CLAUDE.md`. Two scoring-methodology documents deleted. |

**Behaviour changes worth reviewing**

1. **A verdict can move down.** With the composite floor gone, an
   assessment with only `low`-severity findings and no escalation
   trigger reads "Within Acceptable Range" where a composite under 70
   once made it "Moderate Concern". Verdicts only ever move down, and
   only for an assessment with nothing to point at.
2. **`sufficiency._overall` is unweighted.** It weighted each category
   by its point cap; with no caps it is a plain mean, which can shift a
   borderline assessment one confidence band.
3. **`evalOSHA`'s complaint rule needs an indicator.** It took the
   composite as a parameter and fired on `composite?.tot || 0`, so a
   missing composite scored 0 and the rule fired by default. It now
   requires a concurrent indicator.

**Legacy reports**

Stored scores are **not** deleted. The Supabase `score` / `composite` /
`zone_scores` columns and the localStorage report index keep their
data; nothing reads it. Dropping a column is irreversible and an issued
report's record is the only evidence of what it said. A pre-v3.0 record
opens, renders without a score or a band, and contributes "not
recorded" rather than a zero to the practice roll-up.
`runScoring()` already early-returned for finalized reports, so this
release cannot retroactively alter what an old report *says* — only
what is rendered from it.

**Guards**

`tests/engine/no-scoring.test.ts` asserts the absence at every layer,
against engine OUTPUT rather than by grepping for names, and includes a
positive control so a regex that stops matching cannot read as a clean
removal. Acceptance criterion `NO-COMPOSITE-SCORE` runs it.

The acceptance runner also had a hole worth naming: `grep_excludes`
returned "pass" when none of its paths existed, so deleting a file made
its own removal-guard silently succeed. An exclusion with nothing left
to read now fails.

## Engine v2.8.0 — HVAC equipment-scoped recommendations

**User-visible change**

HVAC actions are now grouped by equipment so a single AHU serving
multiple zones shows one action, not duplicates. Two zones served by
the same AHU produce one drain-pan / filter / OA-damper / comprehensive
HVAC inspection action labeled to the AHU with both zones listed under
"Affects:". Two zones served by different AHUs still produce two
separate actions, one per unit.

**Walkthrough**

A new "HVAC equipment" capture step lives between Quick Start and the
zone walkthrough. Each captured equipment unit (AHU, RTU, FCU, ERV,
MAU, DOAS, VRF indoor, Other) is selectable as "Served by" on each
zone. Zones with no equipment selected (or marked "Unknown") trigger a
single building-scoped fallback action prefixed
"HVAC equipment not yet identified —" instead of duplicating per zone.

**Scope inventory**

| Recommendation | Scope (v2.8.0) | Notes |
|---|---|---|
| Clean drain pan + EPA-registered biocide | Equipment | Was zone — now grouped per AHU/RTU |
| Address drain pan condition immediately | Equipment | Was zone |
| ASHRAE 188 Legionella drain-pan evaluation | Equipment | Was zone |
| Replace air filters (immediate / high) | Equipment | Was zone |
| OA delivery rate + damper position | Equipment | Was zone |
| Comprehensive HVAC inspection | Equipment | Was zone |
| Comprehensive HVAC system assessment (data gap) | Equipment | Was zone |
| Water intrusion / IICRC S500 | Zone | Unchanged — per zone |
| NIOSH IEQ symptom questionnaire | Zone | Unchanged |
| ATSDR occupant risk communication | Zone | Unchanged |
| Temporary relocation feasibility | Zone | Unchanged |
| Re-occupancy / clearance criteria | Zone | Unchanged |
| Portable HEPA in occupied area | Zone | Unchanged |
| Periodic reassessment | Building | Unchanged |
| Preventive HVAC maintenance schedule | Building | Unchanged |

**Backwards compatibility**

Reports finalized prior to v2.8.0 store recommendations as
`{ imm: string[], eng: ..., adm: ..., mon: ... }` (legacy "ZoneName:
text" prefix shape). The renderers (`MobileApp.jsx` Actions tab,
`sections-recommendations.js`, `sections-core.js`,
`generateLegacyPrintHTML`) normalize either shape via
`src/utils/recFormatting.js`, so historic reports continue to render
correctly without re-running the engine.

**Out of scope for this release**

- Cost estimation / pricing
- Equipment-maintenance scheduling / CMMS integration
- Sensor binding to equipment
- Post-finalization REVISED-badge / recipient-notification registry
  (referenced in the v2.8.0 PR spec §6 — confirmed not yet built;
  re-running the engine after adding equipment will simply re-emit
  the action list with equipment grouping but without a revision
  marker until that registry exists)
