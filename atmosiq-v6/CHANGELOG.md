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

**The drain-pan finding no longer escalates to Legionella / ASHRAE 188**

A condensate drain pan answered as "Standing water" or "Bio growth
observed" produced a critical finding ending *"Evaluate for Legionella
risk per ASHRAE Standard 188 if building lacks a Water Management
Program"*, cited to `ASHRAE 188`. That intake field was the entire
trigger — no water system, no aerosol-generating equipment, no water
temperature, no occupant symptom, no building type. ASHRAE 188 scopes
itself to building water systems with a recognised aerosol transmission
risk (cooling towers, evaporative condensers, domestic hot water,
fountains, misters); a low-temperature condensate pan is not one, and a
visual observation of one does not establish an exposure pathway.

The finding now states the condition and stops: *"Drain pan: standing
water — Critical Moisture/Hygiene Deficiency. Potential microbial
reservoir in the condensate pan."* It keeps its `critical` severity and
its `gate5` structural flag; only the escalation went. It cites nothing,
because the standards corpus documents no drain-pan threshold — and 43 of
the 57 findings this engine emits already carry no citation, including
both of this one's neighbours.

ASHRAE 188 appeared in no ledger — absent from `STANDARDS_MANIFEST`,
`criteria.js` and `standards-corpus.js` alike — so the double-entry
reconciliation could not see it.

*How it survived:* the editorial layer had already retired it.
`phrases/hvac.ts` removed the escalation deliberately and recorded why.
But that entry governs `renderClientReport` / PrintReport, while the
AtmosFlow DOCX — the only client deliverable — takes `text: r.t` verbatim
off the engine finding via `reportModel.collectFindings`. The retired
sentence went on shipping from `scoring.js` regardless. Same cross-layer
shape as the 67–82 °F comfort band.

**The recommendation went with it, and carried a worse defect**

`genRecs` fired a matching `legionella_188` action off any finding whose
text contained "Drain pan":

> Evaluate drain pan for Legionella risk per ASHRAE Standard 188. If
> building lacks a Water Management Program, consider Legionella sampling
> **given active occupant respiratory symptoms**.

The closing clause asserts active respiratory symptoms as established
fact, inside an `if (hasDrainPan)` block, with nothing anywhere checking
that a single symptom had been recorded. A recommendation may not state a
fact the assessment did not observe — and deleting only the standard name
would have left that clause standing, so it is pinned as its own property.

`drainpan_immediate` and `drainpan_clean` still fire, so the condition
keeps two actions: address it immediately, and clean the pan and verify
slope and condensate disposal.

**Two more retirements the engine had ignored**

Chasing the Legionella remnant turned up the same defect twice more. In
each case the phrase library had removed an over-reaching instruction,
written down why, and the engine kept shipping it:

- **The EPA-registered-biocide instruction** (`drainpan_clean`). Retired
  by `phrases/hvac.ts` on the reasoning that biocide selection is a
  maintenance decision, not a screening finding. The assessment observed
  a pan; it did not evaluate what may lawfully be applied to that
  equipment, where the condensate discharges, or what the manufacturer
  permits. The action now reads *"Clean the drain pan and associated
  components in accordance with manufacturer recommendations and
  applicable HVAC maintenance procedures; correct drainage and slope
  deficiencies contributing to standing water."*
- **The ATSDR occupant-risk-communication action.** Retired by
  `phrases/complaints.ts` as disproportionate to a routine commercial IAQ
  assessment with no hazardous release identified — ATSDR guidance
  addresses public-health responses to contaminated sites. The
  proportionate step is a structured symptom survey, and the critical and
  high complaint branches each already emit one as a NIOSH IEQ
  questionnaire action. Verified on both severity paths before removing
  it; HEPA filtration and the relocation evaluation are untouched.

**Guards**

`tests/engine/editorial-engine-parity.test.ts` closes the class instead
of the three instances. Its general property: **no engine finding may
contain a `bannedAlternative` of the condition type it classifies to**,
checked across a zone matrix wide enough to fire every branch in all five
categories, plus the union of every ban over every recommendation. That
is machine-checkable and survives without anyone maintaining a comment.
The three named retirements are pinned on top of it — at the engine, at
`collectFindings`, and in `genRecs`.

Both files also assert what must REMAIN. An absence-only guard is
satisfied by an engine that recommends nothing at all, which would be a
worse defect than any of the three removed. That counterweight earned its
place immediately: it failed on first run and exposed a fixture using
`ac: '12'`, which is not one of that field's options and fell through to
a severity where the block under test never ran.

Verified against each restored defect: 9 of 14 fail with the original
finding, 5 of 20 with the original recommendation, 3 of 15 with the
biocide and ATSDR text.

`tests/engine/drain-pan-no-legionella.test.ts` keeps the per-condition
detail. Acceptance criterion `EDITORIAL-ENGINE-PARITY` gates both. Its
`grep_excludes` is anchored to a single-quoted string literal rather than
the bare words: the runner does not strip comments, and the unanchored
form matched four of this change's own removal records — the same
false-positive class `NO-COMPOSITE-SCORE` was re-anchored to avoid.

The stale sample report at `docs/sample-iaq-consultant-report.html`
carried the Legionella claim in four places and was corrected with it.

**Jasper can explain the monitoring report it generated**

Logger Studio produces an Indoor Environmental Monitoring Report. Jasper
could discuss the *readings* — `logger_data_summary` has shipped in the
assessment context for a while — but knew nothing about the *deliverable*:
which reference the assessor chose per parameter, what status the report
reached, why something read "Not Established", or what its limitations
covered. Asked about the document a client was holding, it had nothing.

`read_monitoring_report` closes that. It returns the report as issued.

**It reads the model, not the DOCX.** PR #524 taught Jasper to review an
attached third-party report by quoting it and verifying every quotation,
because such a report is text and nothing else. This one is ours:
`buildMonitoringReportModel(session, opts)` is pure, so the session plus
its generation options reproduce the issued document exactly. Reading the
model beats extracting our own file on every axis — lossless where
extraction drops table structure, exact where a model would re-read a
rounded number off the page, and cheap where a 40-page parse is not. The
projection therefore **re-derives nothing**; every value is copied out of
the model the document was rendered from.

**The session now persists.** Everything on the report sheet except the
readings — location, client, instrument, and above all which reference
profile was chosen per parameter — was typed in and discarded when the
sheet closed. It now rides the `sensorData` envelope, which already
carries exactly this class of state (`tempDisplay`, `thresholds`,
`occupancyWindows`) and already persists to the draft, the report record
and the cloud. No new storage key, no new sync path. Written only after
generation succeeds: a session that produced no document is not a report.

**Scope is explain, not review.** Jasper says what the report states and
what its terms mean; it does not grade the deliverable or volunteer what
is missing. That constraint and the locked status vocabulary cannot be
enforced by a data shape, so both ship as `usage_rules` on the tool
result — the `assess_investigation` pattern — and are asserted in tests.

The load-bearing property: **a comparison the report withheld can never
reach Jasper as a verdict.** When calibration does not cover the
monitoring period, `statusFor` withdraws the status to "Not Established"
and the statistics print alone — so a reader skimming numbers assumes a
comparison was made. The projection carries the withdrawal, and the
`reason` sentence the document builds but renders nowhere, making Jasper
the only surface that can tell a reader why.

Guards: `monitoring-report-summary` (22), `read-monitoring-report` (17),
`monitoring-report-persistence` (6). Verified by inversion — forcing a
"Within Reference" over a withheld comparison fails 4, dropping the
envelope field fails 1. Gate: `IEMR-JASPER-READABLE` (prod-ready now 74).

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
