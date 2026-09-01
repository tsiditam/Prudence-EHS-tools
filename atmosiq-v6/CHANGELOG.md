# AtmosFlow Changelog

## Report templates: reachable, filled, and repeating

**User-visible change**

**Settings → Reports → Report Templates** now exists. Upload a `.docx` with
`{{tokens}}` in it, and Jasper's `generate_report` fills it from the
assessment.

Templates can now contain **repeating sections**. Wrap a table row in
`{{#findings}} … {{/findings}}` and it renders once per finding; the same works
for `zones`, `recommendations` and `sampling_plan`. Settings carries a
reference list of every field and section, generated from the registry.

**Two defects behind this, and they compounded**

*It was unreachable.* `SettingsScreen` never imported `ReportTemplatesPanel`.
The renderer, the token registry, the upload/list/delete API, the private
Storage bucket with its RLS, the Jasper tool and the panel itself were all
built and tested — and nothing in the app could upload a template, so
`generate_report` could only ever answer `no_templates_saved`. Its own failure
message points the assessor at "Settings → Report Templates", a place that did
not exist.

*It rendered blank.* The token resolvers were authored against the flat
`context = {...}` literal `MobileApp.jsx` used to hand Jasper — `findings`,
`recommendations` and `sampling_plan` at the top level. Jasper was migrated
onto `buildAssessmentContext`, where those live at `walkthrough_findings` and
under `engine_outputs`, and the render path inherited the new shape with the
resolvers unrepointed. **Thirteen of twenty-seven tokens went dead**, including
every finding, recommendation, sampling and report-identity token.

A missing token renders blank *by design* — that is the right behaviour for a
field the assessor left empty, and it is why this had no symptom. A rendered
report came out as letterhead with a client name and a zone list, and nothing
anywhere went red.

**What changed**

- Every resolver now reads the canonical `AssessmentContext` path **first**,
  with the legacy paths kept behind it as fallbacks (`buildJasperContext`
  aliases `presurvey` and `bldg` onto the payload, and older saved records
  still carry them).
- Recommendations are read from the `{imm, eng, adm, mon}` buckets `genRecs`
  actually returns. The old resolver filtered a flat array on
  `priority === 'immediate'`; the rows carry no `priority` field at all, so it
  needed reshaping as well as repointing.
- The sampling plan reads `{zone, type, method, standard}` — the fields
  `generateSamplingPlan` emits — not the `analyte` / `location` the old
  literal used.
- `report.date` resolves from `ps_survey_date`, the required "Date of survey"
  intake field. It was reading `meta.assessment_date`, which does not exist;
  `meta.generated_at` was the tempting substitute and is wrong, because it
  would silently re-date an old assessment to today on every re-render.
- `assessor.title` was **removed**. It read `profile.title`, and the app has no
  job-title field anywhere, so it could never fill. A registry entry that
  cannot resolve is worse than none — Settings advertised it and templates
  rendered it blank. Templates still using it now report it as an unknown
  token, which is the feedback that was missing.

**The qualitative-only marking now reaches a template**

CLAUDE.md's defensibility primitive says the `qualitative_only` flag
"propagates to every rendered output of that finding". The template path
carried it nowhere: `buildAssessmentContext` sets it on every finding and no
token surfaced it, so a user template rendered a qualitative-only finding
indistinguishable from an instrument-backed one. Finding rows now carry a
`{{qualitative_note}}` field, and the flat bullet block marks it too.

**Guard**

The regression that closes the class is a test that renders against a **real**
`buildJasperContext` — built from real app state, through the real engine.
The previous fixture was hand-shaped to match the resolvers, so it agreed with
them and with nothing else; that agreement is what let thirteen dead tokens
sit unnoticed. Reverting the repair fails eight tests in that file. Acceptance
criterion `REPORT-TEMPLATES` was eight `file_exists` checks and passed
throughout both defects; it now asserts the mount, the section registry, and
that the real-context test exists.

**Not in this change**

`ai_*` prose tokens. A user template has no `aiProvenanceBanner()` hook, so
model-written text would land under the assessor's letterhead and credentials
with nothing marking it as model-written. That needs deciding before it is
built.


## TVOC is no longer judged — the Mølhave advisory tiers are removed

**User-visible change**

A total-VOC reading is still captured, converted between units, charted,
tabulated and reported. It is no longer compared against anything.

Concretely: no TVOC finding, at any concentration. No reference line on the
TVOC chart and no reference row in the monitoring report. No "TVOC elevated"
chip in the field assistant, and no live advisory when a reading crosses 500
or 3,000 µg/m³. No TVOC-triggered speciation entry in the sampling plan, and
no TVOC term in the chemical causal chain. In the client DOCX the parameter's
Basis column reads "No applicable threshold — reported, not judged" and its
outcome is **Not evaluated** — a distinct token, deliberately not
*Acceptable*.

**Why**

TVOC is a non-specific sum. A photoionization detector aggregates whatever it
responds to into one mass-equivalent number and identifies none of it, and no
regulatory or consensus health-based limit exists for that quantity.

The platform's only basis for judging one was Mølhave (1991) — a chamber-study
dose-response framework describing how symptom likelihood varied across a
defined 22-compound mixture. It is not a limit and was never promulgated as
one, and applying it produced a severity, a citation, a client-facing finding,
a field advisory, a sampling recommendation and a causal-chain term as though
it were.

Every surface that carried a tier also carried a disclaimer saying it was
advisory rather than regulatory. That is the part worth recording: **the
disclaimer was the delivery mechanism, not the safeguard.** A figure printed
beside a measured value reads as a limit however it is captioned, so the
caveat let the tier travel while appearing to be careful about it. The
platform's own anti-pattern list had it backwards — it REQUIRED the Mølhave
disclaimer on any TVOC interpretation, which is a rule that mandates the
comparison it means to qualify.

**What went with them**

The WELL v2 TVOC target (500 µg/m³) too, rather than being kept as the
parameter's last selectable yardstick. Opt-in does not rescue a figure with no
health basis behind it, and leaving one reference in place would have made
"is this reading acceptable" answerable again by a different route.

Also removed: the `molhave-tvoc-framework` corpus entry and the Mølhave row in
the exposure-limit lookup table (both are what the assistant CITES from, so an
entry there is a citable threshold whatever the note beside it says), the
manifest entry, the parameter-prose citation, and the TVOC threshold from the
sample report shipped in `docs/`.

**What was inverted rather than deleted**

Two rules had to flip, not go. The pre-review linter flagged TVOC
interpretations that did NOT cite Mølhave; left in place it would have fired
on every honest sentence and told the assessor to add a reference the platform
had just deleted. It now flags TVOC described as above, below, within or
exceeding any limit — and reads "total VOCs" as well as the acronym, because
that is the label the report itself prints. The same inversion was applied to
the semantic pre-review prompt and to the CLAUDE.md anti-pattern.

**What deliberately stayed**

- `utils/vocConversion.js`, untouched. A logger reporting ppb feeding an
  engine field denominated in µg/m³ still has to cross bases correctly and
  disclose the compound it crossed against. That is a factual question about
  the air, and it stays one whether or not anything scores the result.
- The LEED / green-building 500 µg/m³ corpus entry, whose text now states
  outright that AtmosFlow applies no TVOC threshold. An assessor meets that
  figure in a specification and needs to know what it is.
- The renovation/off-gassing TO-17 sampling entry, which fires on a recorded
  SOURCE rather than a concentration and never needed a threshold to be
  defensible. Removing an over-reaching trigger must not leave a real one with
  nothing to say.
- The `equivalenceBasis` field and its projection, now with no caller. The
  contract is kept whole so it does not silently do nothing the next time a
  mixture threshold is added.

**Guard**

`tests/engine/no-molhave.test.ts`, acceptance criterion `NO-TVOC-THRESHOLD`.
It pins the class rather than the instances: behavioural assertions through
the real entry points at every tier boundary the removed criteria used, plus a
sweep of `src/`, `api/` and `lib/` for a TVOC threshold in a rendered position.
The sweep strips comments first — twenty-odd files now carry removal records
that name the tiers and quote their figures, and a guard that could not tell a
record from a shipped string would fail on its own documentation. It also pins
what must remain, because an absence-only guard is satisfied by deleting too
much.


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

**A report keeps one identity across every export**

Both renderers have always honoured `data.id` for the Report ID — and no
caller ever passed one. So both fell through to
`AIQ-${Date.now().toString(36)…}` on every export, and the **same report
regenerated after a typo fix came out bearing a different identity from the
copy the client already held.** Two documents, one assessment, disagreeing
about which one they are. The Report ID is what a client quotes back when
they ring about a document and what a reviewer writes on a finding.

`Date.now()` is a timestamp, not an identity: it changes on re-issue, which
is precisely when a stable id matters most. The three `reportData` builds —
export, share, peer-review email — now carry `id: viewRpt?.id || draftId`.
The fallback stays for a caller with no record behind it at all (the
marketing sample); what must not happen is a caller that HAS a record still
landing on it.

Deliberate contrast with `datasetHash`, which fingerprints the READINGS and
is invariant across re-issue for the opposite reason: it answers *"is this
the same data"*, where this answers *"is this the same report"*.

**An assessment now has a durable identity**

Record ids are not durable. `resolveFinalizeTarget` mints a fresh
`rpt-<timestamp>` the first time a `draft-<timestamp>` session finalizes, so
the id an assessment is known by changes exactly once — at the moment it
becomes a deliverable. Fine for storage, which is all it was asked to do.
Useless as a key for anything that must outlive that transition.

`src/billing/assessmentUid.js` adds one that survives draft → finalize →
re-open → re-finalize, riding alongside the record id rather than replacing
it. `finalizeTarget.js` is untouched: record ids are load-bearing across six
`supabaseStorage.js` call sites that split drafts from reports on the
id/status shape, and the duplicate-reports bug already lives there.

**`deriveLegacyUid` is pure, and that is the whole point.** Every existing
assessment has no uid. If opening one MINTS instead of DERIVES, the record's
identity changes on every open — and under per-report pricing, re-downloading
last month's report would charge for it again, silently, because from the
code's view it is simply a different assessment. So: existing uid, else
derive deterministically from the record id, and mint only when there is
neither. No clock, no randomness, no I/O. Finalize **carries** the uid across
the id change rather than re-deriving from the new `rpt-` id — one line, and
the reason the module exists.

Migration 032 adds `assessments.assessment_uid` with `UNIQUE (user_id,
assessment_uid)`. Nullable, no backfill — a SQL backfill would be a second
implementation of a function whose entire job is to agree with the first.
The column exists so the **server** can bind on it: a client-minted uid means
nothing until a row proves this user owns it. It also rides inside `payload`,
so the client round-trip works on a project that has not migrated yet — and
the upsert retry now drops `assessment_uid` alongside `payload` so an
unapplied migration cannot break all syncing.

Guards: `assessmentUid` (17) pins purity, RFC-4122 shape, collision behaviour
across consecutive `Date.now()` ids, and the crypto-less PWA fallback;
`assessmentUid-wiring` (11) pins that finalize carries rather than re-derives,
that both re-open paths backfill, and that a cloud row without a uid cannot
blank a local one. Verified by inversion — making `openReport` mint fails the
re-open guard. `report-id-stability` (8) covers the export identity, including
a source-level check that all three build sites pass the id.

Neither change is billing. Both are prerequisites for it, and both fix real
defects on their own.

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
