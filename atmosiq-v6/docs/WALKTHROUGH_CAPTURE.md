# Capturing the walkthrough the way the report reads

*Written against the third demo (Larkin Hall, `constants/demoDataHcho.js`)
and the AtmosFlow Word report it produces, September 2026. A plan, not a
change: nothing here is implemented yet.*

## 1. Why the demo report reads well, and what that tells us

The executive summary on the Larkin Hall report was not written by hand.
It is the output of `buildExecSummary` in `src/report/narrativeLibrary.js`,
the same deterministic function every AtmosFlow report has run since the
2026-08 reporting-voice change. It assembles five sentences from five
inputs, and every one of those inputs is a field somebody filled in during
the walkthrough:

| Sentence in the summary | Built from | Field(s) that feed it |
|---|---|---|
| "On June 1, 2026, PSEC conducted an IAQ assessment of Larkin Hall **in response to post-renovation / construction**." | `opening` | `ps_survey_date`, `ps_reason`, `fn` |
| "The assessment combined direct-reading instrument measurements with visual inspection **and documented occupant reports** across 2 representative zones." | `methods`, `scopeBit` | any zone with `cx = Yes — complaints reported`; zone count |
| "**Chemical exposure in Room 214 is the leading working hypothesis** on the observations available. No causal relationship has been established; **the contaminant should be identified by speciated sampling and characterized over a full work period** before a causal conclusion is drawn." | `conclusion`, from `pickPrimaryChain` | a *measured* causal chain, which needs `hc` (or another reading above a criterion) **plus** `src_internal` / `src_adjacent` **plus** `sy`; its `verification` text is keyed by chain type |
| Leading findings (three bullets) | `leadFindings` | the ranked finding rows, trimmed by `headline()` |
| Leading actions | `leadActions` | the Immediate tier of the action register (empty for this demo) |

The summary is only as good as the record beneath it. When the trigger is
blank the first sentence loses its "in response to" clause. When no zone
carries `cx`, "documented occupant reports" disappears from the method
sentence, correctly, because nothing was documented. When no chain has
measured evidence there is no conclusion paragraph at all, and the summary
collapses to "The findings below state what each rests on". That is the
difference between this report and the earlier ones the author compared
it to: the older assessments were run with the trigger, the sources, the
symptom pattern or the recipient left empty, and the sentences that depend
on them were correctly omitted. The prose did not get better. The record
got complete.

That is the thesis of this plan. **The report is already written; the
walkthrough decides how much of it appears.** So the work is to read the
report backwards, find every sentence and table cell, name the field that
feeds it, and make sure the walkthrough asks for that field at the moment
the assessor has the answer in front of them.

## 2. The report, read backwards

Every section of the AtmosFlow DOCX (`assembleRenderModel` in
`src/report/reportModel.js` → `sections-atmosflow.js`), what it consumes,
and where that is captured today.

| Report section | What it prints | Consumes | Captured today | Gap |
|---|---|---|---|---|
| Cover, Prepared For | facility, address, recipient, assessor, report id | `fn`, `fl`, `ps_recipient_*`, `ps_assessor`, `ps_project_number` | Q_DETAILS (all optional) | Recipient is skippable, so drafts name nobody. Readiness flags it; the demo filled it. |
| Executive Summary | see §1 | `ps_reason`, `cx`, chains, findings, Immediate actions | as above | Trigger detail beyond the one-word reason never reaches the summary. |
| Findings at a Glance | parameter, site range, reference basis, outcome | sensor fields, criterion outcomes | zone sensor panel | Complete. |
| 1. Purpose, Scope & Site Background | facility type, year, HVAC type, trigger | `ft`, `ba`, `ht`, `ps_reason` | Quick Start / Q_BUILDING | Nothing about *what happened*: the renovation, when, what materials, when the rooms were re-occupied, when complaints began. All of that lived in `ps_reno_detail` free text in the demo and prints nowhere. |
| 2. Methods & QA/QC | instruments, calibration, averaging, formaldehyde meter, "other instruments" | `ps_inst_*`, `meas_duration`, `ps_inst_other` | Pre-Survey | The logger deployment (where, height, period, interval) has no field; the demo wrote it into `ps_inst_other`, which prints under the label "Formaldehyde meter". |
| 3. Walkthrough Observations | building systems table; per-zone observation sentences; occupant report sentences; assessor notes | `buildingObservations`, `zoneObservations`, `zoneOccupantReports`, `znt` | Q_ZONE dropdowns + notes | The dropdowns give a category ("new furniture / carpet / paint"); the substance (particleboard wardrobe, MDF desks, LVP floor, repainted, installed 15 May) is only in `znt`. The comparison room is a comparison room only because its name says so. |
| 4. Measurement Results | zone rows, outdoor reference, site mean | sensor fields, `co2o` etc. | sensor panel | Complete. |
| 4.1 Logger figures | four timelines with captions | `sensorData.graphs[id].include / caption / imageDataUrl` | Logger Studio, after the fact | Captions are typed in Logger Studio or not at all. The demo's captions state the baseline, the excursion and the 18:00 event because a person wrote them; the monitoring statistics already compute every number in them. |
| 5. Discussion; Conceptual Site Model; Working Hypotheses | ranked findings; the primary chain as source → pathway → receptor with evidence and verification; the other chains with their verification | `zoneScores`, `causalChains`, `VERIFICATION` by chain type | engine | The CSM's evidence line is category words ("New furniture / carpet / paint, Kitchen / break room"). The verification is generic per chain type; it cannot say "the door test was done and read indeterminate" because nothing records what was already tested. |
| 6. Recommended Actions | the action register with owner and completion evidence | `recs` | engine | See "Not changed, on purpose" in PR #559. |
| 7. Limitations | derived from absence | `cfm_person` / `ach`, photos, logger, sampling | — | "No quantified ventilation-rate measurement" prints on every demo because nobody captures OA cfm/person or ACH, though the CO₂ mass-balance helper exists on the field. |
| Appendix A | per-parameter background and observed range | sensor fields | — | Complete. |
| Appendix C | photos with captions | `photos` keyed by zone and field | PhotoCapture on `dp`, `wd`, `mi`, `bld_press_door` | The source, the odor, the logger placement and the comparison room have no photo prompt. The demo has no photos at all. |

Two things fall out of the table. First, the report's *structure* is
complete: nothing in the demo needed a new section. Second, the substance
that made the demo read as an investigation rather than a checklist,
namely the event timeline, the source specifics, the comparison room, the
logger deployment and the evening event, was carried almost entirely in
free-text notes and in captions typed by hand, and the engine, the
evidence package and the AI writer see none of it.

## 3. What the walkthrough should capture

Seven additions, each named for the report sentence it feeds. All are
inputs and editorial renderers. None changes what the engine concludes
from the same readings, so none crosses the determinism-core line in
CLAUDE.md, with the exceptions called out in §5.

### 3.1 The event timeline

**Feeds:** section 1 background, the CSM evidence line, the logger
captions, the AI writer's evidence package.

A dated list on the presurvey record: `{ date, kind, description, zoneIds }`
with `kind` drawn from a short vocabulary: renovation started / completed,
materials installed, re-occupied, complaints began, prior action taken,
HVAC change, water event, logger placed, logger retrieved. The
post-renovation and complaint branches already ask "completed?" and "when
did complaints begin?" as ranges; the timeline keeps those and adds dates
where the assessor has them.

The EPA/NIOSH *Building Air Quality* guide (1991) put an Incident Log and a
Log of Activities and System Operation in its forms appendix for exactly
this reason: the diagnostic value of an IAQ complaint is in the sequence,
and a sequence cannot be reconstructed from four dropdowns. Section 1 then
reads "The second floor was refurnished on 15 May, re-occupied on 18 May,
and the first complaints were recorded on 20 May" instead of "prompted by
post-renovation / construction".

### 3.2 Zone role

**Feeds:** the results table, the CSM evidence, the Investigation tab.

A single field per zone, `zone_role`: *complaint / affected*, *comparison*,
*outdoor reference*, *representative*. The demo's strongest sentence, "the
difference between the two rooms is their contents, not their
ventilation", is in the assessor's notes because the report has no way to
know Room 108 was chosen as a control. With the role recorded, the results
table can label the comparison row, the CSM can print the paired
difference as evidence ("Room 108, comparison: 0.011 ppm"), and a
readiness check can note when a complaint zone has no comparison space.
AIHA's *IAQ Investigator's Guide* (2nd ed., 2008) and ASTM D7297 both make
the complaint-versus-non-complaint comparison the first discriminating
observation an investigator takes; the record should carry it as data.

### 3.3 Source specifics

**Feeds:** section 3 observations, the CSM source line, the sampling
plan's controls note, the AI writer.

`src_internal` and `src_adjacent` stay as they are; each selected item
gains an optional detail card: `{ what, installedOn, extent, photoKey }`.
"New furniture / carpet / paint" becomes "particleboard wardrobe, two MDF
desks, two bed frames; LVP flooring; latex repaint, installed 15 May, whole
floor". The observation sentence prints the detail; the CSM's source line
stops being a category; the photo prompt attaches the exhibit to the
source rather than to the zone.

### 3.4 The occupant interview as a record

**Feeds:** section 3 occupant reports, the CSM evidence, the hypotheses'
verification, the evidence package.

Today the interview is four dropdowns (`sy`, `sr`, `ac`, `cc`). Add the
questions the NIOSH Indoor Environmental Quality questionnaire and the BAQ
Occupant Interview form ask and the report cannot currently state:
*onset* (date or range), *time-of-day pattern* (morning / afternoon /
evening / no pattern), *day-of-week pattern*, *where in the zone*, *what
relieves it*. The demo's "worst in the evening" is the observation that
ties the symptoms to the 18:00 logger event, and it is in a note. Keep
each answer a fact about what was reported; the engine's Complaints rules
read `sy`, `sr`, `ac`, `cc` and are untouched.

### 3.5 The logger deployment record and event log

**Feeds:** section 2 (a "Continuous monitoring" row of its own), 4.1
captions, the monitoring statistics, the evidence package.

Two records on the `sensorData` envelope, captured on the phone when the
instrument goes down and comes up, not in Logger Studio afterwards:

- `deployment`: instrument (from the instrument registry, with its
  calibration), zone, position, height, start, end, logging interval,
  and the occupancy schedule the occupants describe. The monitoring
  report sheet already types `calibration`, `occupancySchedule` and
  `events` into `monitoringReport.session`; this moves them upstream so
  every consumer reads them, and the QA/QC table stops printing the
  logger under "Formaldehyde meter".
- `events`: `{ at, kind, description }` added from the phone during the
  logging period: cleaning, cooking, HVAC schedule change, doors open,
  furniture delivered. ISO 16000-1 treats the record of activities during
  sampling as part of the sampling strategy, and it is what turns "a
  TVOC and PM2.5 rise at 18:00 on all seven days" into "the kitchenette's
  evening service".

With both, the captions write themselves from `parameterStats`: baseline
median, excursion window and peak against the reference line, and the
events that fall inside it. The assessor edits a sentence rather than
composing one.

### 3.6 Checks performed

**Feeds:** the hypotheses' verification lines, the readiness panel.

The building record already stores the exterior door test and its method.
Add the same shape per zone for the standard pathway checks an
investigator does on the way through: door smoke test, diffuser airflow
felt or measured, damper position seen, drain pan seen, grille flow
measured. Each is `{ check, result, method }`. The Working Hypotheses
section can then print "verification: door pressure test done, neutral /
indeterminate; differential-pressure instrument not available" instead of
asking for a test that was already made.

### 3.7 Ventilation quantified

**Feeds:** the Ventilation category's confidence, the Limitations section.

`cfm_person` carries a `co2_mass_balance` helper today and nobody reaches
it. Prompt it automatically once `co2`, `co2o` and `oc` are all present,
with the ASHRAE 62.1 steady-state assumption stated in the helper. Add an
optional balometer / flow-hood instrument (`ps_inst_flow`) so a measured
supply or exhaust flow can be recorded where one was taken. Either removes
the "ventilation adequacy is inferred from CO₂ as an indicator only" line
from a report where it need not be true.

## 4. How the capture should feel

- **Ask at the moment of knowledge.** The source card opens when a source
  is ticked; the logger deployment card opens when the assessor says a
  logger was placed; the interview questions follow `cx`. Nothing is added
  to the Quick Start path.
- **Facts, never verdicts.** Every new field records what was seen, said,
  measured or done. Interpretation stays with the engine and the assessor's
  signature. This is the same rule that keeps a phrase template from
  asserting a verdict (CLAUDE.md, "Every layer must say the same thing").
- **A field exists only with its renderer.** Each field above names the
  sentence that prints it. A field with no renderer is the embalmed-module
  pattern CLAUDE.md warns about, and `field-registry.js` plus its test
  should be extended so that a declared field with no reader fails.
- **Notes remain, and become structured on confirmation.** `znt` stays.
  The assistant already has an allow-list of observable fields it may
  write (`observable-fields.js`); a dictated note can propose values for
  the fields above, and the assessor confirms each one. The proposal
  never writes on its own.
- **Photos attach to observations.** The prompt sits on the source card,
  the odor answer, the comparison room and the logger placement, and the
  caption is derived from the observation the way `photoCaption` already
  derives it for `dp`, `wd` and `mi`.

## 5. Sequencing

**Tranche 1, no engine change.** `zone_role`, the event timeline, source
detail cards, the interview additions, the logger deployment and event
records. Renderers in `reportModel.js` (background paragraph, observation
sentences, CSM evidence, results-table label, 4.1 captions, a "Continuous
monitoring" QA/QC row) and the evidence package's writable context. Field
registry and readiness checks extended for each.

**Tranche 2, capture surfaces.** Per-trigger capture cards in the
walkthrough, the phone-side event quick-add during logging, the automatic
mass-balance prompt, the added photo prompts, and note-to-field proposals
through the assistant with confirmation.

**Tranche 3, needs product sign-off, because each changes what the
engine concludes.** Reading `zone_role` to emit a paired-comparison
finding; reading the interview's time-of-day pattern into the causal
chains' evidence weighing; a formaldehyde action below the critical tier;
printing the sampling plan in the DOCX. Each is a one-line decision to
make first, and none is required for tranches 1 and 2.

## 6. References

- US EPA / NIOSH. *Building Air Quality: A Guide for Building Owners and
  Facility Managers.* EPA 402-F-91-102, 1991. Forms appendix: Occupant
  Interview, Incident Log, Log of Activities and System Operation,
  Pollutant Pathway Record, HVAC Checklist.
- NIOSH. *Indoor Environmental Quality Survey* (the NIOSH IEQ
  questionnaire): symptom onset, timing and relief questions.
- AIHA. *The IAQ Investigator's Guide*, 2nd ed., 2008: complaint
  characterization and the use of comparison areas.
- ASTM D7297-14. *Standard Practice for Evaluating Residential Indoor Air
  Quality Concerns*: walk-through inspection and occupant questionnaire
  structure.
- ISO 16000-1:2004. *Indoor air, Part 1: General aspects of sampling
  strategy*: the record of activities and occupancy during sampling.
- ASHRAE 62.1-2025, Appendix on CO₂-based estimation of outdoor-air
  delivery (the mass-balance assumption behind `cfm_person`).
- WHO. *Guidelines for Indoor Air Quality: Selected Pollutants*, 2010:
  the 30-minute formaldehyde guideline, and why the averaging period of a
  criterion decides what a logger can and a spot reading cannot settle.
