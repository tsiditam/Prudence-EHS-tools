# Criteria

What a published threshold **means**, not just what it equals.

`src/constants/standards.js` holds the numbers. `src/constants/criteria.js`
holds everything a number needs in order to be compared honestly: the
averaging period it is defined over, the kinds of measurement that can
legitimately evaluate it, the class of criterion it is, and its citation.

> **Status:** live. CO and formaldehyde in `engines/scoring.js` evaluate
> through the registry; CO₂ takes its severity cap from it. Covered by
> `tests/engine/criteria.test.ts` and `tests/engine/co-indoor-tiers.test.ts`.

## First principle

**Threshold, averaging period, source and applicability travel together or not
at all.** A number without its averaging period is not a criterion — it is a
number that looks like one, and comparing a measurement against it produces a
statement the measurement cannot support.

## The three defects this exists to prevent

All three were the same omission, and all three shipped:

1. **An 8-hour TWA compared against a grab reading, reported as an exceedance.**
   `CO 60 ppm — EXCEEDS OSHA PEL`. A PEL cannot be exceeded by an instantaneous
   measurement; the comparison is a category error, not a conservative
   approximation. The phrase library already listed that exact string as a
   *banned alternative*, and the branch three lines below already worded it
   correctly — the discipline existed and had not been applied uniformly,
   because each branch wrote its own sentence.

2. **Short-duration criteria a walkthrough CAN evaluate were missing.** The
   NIOSH CO ceiling (200 ppm) and the OSHA formaldehyde STEL (2 ppm/15-min)
   were absent, because nothing recorded that a *ceiling is instantaneous by
   definition*. The criteria the survey was least able to judge were modelled;
   the ones it was best able to judge were not.

3. **CO₂ at 1,500 ppm rated `critical`** — the same severity as a hydrogen
   reading at 25% of the lower explosive limit — because severity was a literal
   at the comparison site rather than a property of the criterion's class.

## Averaging periods

`AVERAGING` declares, per period, which evidence bases can **settle** a
comparison and which make it **indicative**. The vocabulary is the engine's own
`EvidenceBasisKind`, not a second one.

| Period | Determinative from | Indicative from |
|---|---|---|
| `ceiling` | grab, continuous, TWA | — |
| `instantaneous` | grab, continuous, TWA | — |
| `min15` (STEL) | continuous, TWA | grab |
| `min30` | continuous, TWA | grab |
| `hour1` | continuous, TWA | grab |
| `hour8` / `hour10` (TWA) | TWA | continuous |
| `hour24` | TWA | continuous |
| `annual` | — | — |

A **ceiling is determinative from a grab reading** — that is what a ceiling
means. This is the entry that makes the previously-missing criteria expressible.

The empty `annual` row is load-bearing, not a gap waiting to be filled. No
evidence basis this platform can collect settles an annual mean, and none makes
one indicative either, so `evaluateCriteria` **skips any criterion whose period
admits no basis at all** rather than comparing against it and hedging in prose.
The check is on the period, not a list of criterion ids, so it covers
`pm25_epa_annual`, `pm25_who_annual`, `pm10_who_annual` and `hcho_epa_rfc`
together, and covers the next one added without being edited.

The failure it prevents is not hypothetical: a clean office at PM2.5 6 µg/m³
sits above the WHO annual guideline of 5, and the ladder — worst-first, first
match wins — would have told that client it was above a WHO guideline on the
strength of one walkthrough reading. A caveat sentence after the claim does not
undo the claim. The registry declares those criteria because they exist and are
worth naming; `contextualStandards.js` is where the reader is told why they
were not applied, and that entry now describes what the code does rather than
happening to agree with it.

## Where the evidence basis comes from

The table above is only as good as the basis handed to it, and that basis is
derived, not declared. `inferEvidenceBasis` in `src/engine/bridge/legacy.ts`
reads the zone's `meas_duration` — the walkthrough's "Measurement type?"
question — through `MEASUREMENT_BASIS`, which maps every option the
questionnaire offers:

| Recorded | Basis |
|---|---|
| *(not recorded)* | `screening_grab` |
| Spot check (instantaneous) | `screening_grab` |
| 5-minute / 15-minute / 1-hour average | `screening_continuous` |
| Continuous logging | `screening_continuous` |

The split is **instantaneous vs. integrated**, which is the distinction
`EvidenceBasisKind` draws. Both directions matter: calling a spot check
continuous claims monitoring nobody did, and calling a recorded 15-minute
average a grab reading downgrades a STEL comparison from determinative to
indicative against the very period it was taken to evaluate.

Two things this deliberately does not do. It does not promote a direct reading
to `documented_8hr_twa` however long it was logged — a PEL claim needs chain of
custody, and `evaluatePermissions` blocks it regardless. And it does not treat
an absent `meas_duration` as a spot check: the field is skippable, so unrecorded
is the common case on legacy records, and the rationale says the type was not
recorded rather than asserting something about the record that is not there.

`tests/engine/evidence-basis.test.ts` reads the option list off `questions.js`
and asserts each one produces a distinct rationale, so adding an option to the
questionnaire cannot silently fall through to the unrecorded default.

*Every instrument-read condition was hardcoded to `screening_continuous` until
2026-08, with the rationale "Direct-reading measurement collected during
walkthrough" — a sentence describing a grab reading while labelling it
continuous. `pm_above_naaqs_documented` carried it into client-facing prose
("supported by continuous monitoring"). The zone parameter was already being
passed to `inferEvidenceBasis` and never read. The permission gate was never
fooled, so no compliance claim was unlocked; the report was describing evidence
it did not have, which is its own problem.*

## Criterion classes

`class` bounds severity. This is what stops a ventilation indicator being rated
like a combustion hazard.

| Class | Max severity | What it is |
|---|---|---|
| `physical_hazard` | critical | Flammability / oxygen displacement |
| `regulatory_oel` | critical | Occupational limit, healthy adult workers, defined shift |
| `health_indoor` | high | Health-based, indoor, general population |
| `ambient_benchmark` | medium | Outdoor ambient standard used indoors; no indoor standard exists |
| `comfort_consensus` | medium | Thermal comfort; not health-based or regulatory |
| `ventilation_indicator` | **high** | Indexes outdoor-air delivery per occupant; not a contaminant limit |
| `advisory` | medium | Literature benchmark; no regulatory limit exists |

## A citation must earn its place

A citation belongs in the deliverable only if removing it would change what
the reader **does** or **believes**. Four jobs qualify:

1. It is the yardstick a number was compared against.
2. It is the authority for a recommended action.
3. It is a **method** someone has to order.
4. It forecloses a specific misreading.

Anything else is furniture, and furniture reads as padding to the reviewer you
most want to convince. A rendered two-zone report with every parameter flagged
put roughly fifteen distinct authorities in front of a client for one office
walkthrough. The same CIH review that cut five whole sections from this report
was reacting to the same problem one level up.

Cut in 2026-08, each with the test it failed:

| Cut | Why |
|---|---|
| ACGIH TLV (CO) | A **third** parallel occupational limit beside the REL and the PEL, driving no criterion — the report named a limit it never used. Also ACGIH-copyrighted and licensed, and ACGIH states the TLVs are not for adoption as standards. |
| OSH Act §5(a)(1) | An enforcement hook. Invoking it edges toward the compliance determination the platform states it does not make. |
| OSHA 1989 vacated-rule history | Regulatory history. The conclusion it supported — practice acts on 35, not 50 — is still stated, without the litigation narrative. |
| Seifert (1990) | A second citation for the same background range Mølhave already supports, and Mølhave's are the tiers actually applied. |
| NYC DOHMH | A second humidity number (65 %) beside the ASHRAE 55 bound (60 %) the engine applies, and a municipal document cited as a national benchmark — tagged `edition: 'current'` for something unrevised since 2008. |

Kept, because each passes: the OSHA PELs, the NIOSH RELs, ASHRAE 55 and 62.1,
the EPA NAAQS, Mølhave, Persily, IICRC S520, and every sampling **method**
(NIOSH 2016 / 0800, EPA TO-17, and the ACGIH *Bioaerosols* guidance in
`sampling.js` — methodology, not an exposure limit, and it tells the reader
what to order).

*The specialty-occupancy standards — ISO 14644-1, NFPA 855, IEEE 1635,
ANSI/ISA 71.04 and ASHRAE TC 9.9 — were kept at that point on the grounds that
they were occupancy-conditional and fired only for the buildings they applied
to. They were removed days later along with the whole data-center module, which
was the only thing that used them. See "The data-center module" below.*

`tests/engine/citation-discipline.test.ts` asserts both directions — the cut
ones stay cut and the load-bearing ones stay present — against the exported
prose objects rather than the file text, so the comments recording *why* each
was cut do not trip it.

## Certification targets are opt-in

`CRITERION_CLASS.certification_target` carries `autoApplied: false`, and
`evaluateCriteria` skips any class declaring it. Same shape as the
non-evaluable-period rule above: the registry declares the exclusion and the
function does not decide it.

A certification target measures a building against a scheme its owner chose to
pursue. If they have not pursued it, the comparison answers a question nobody
asked — and a finding citing WELL v2 in an investigation commissioned for
occupant complaints reads as padding.

Two of the three WELL criteria could never have fired anyway: `co_well` (9 ppm)
ties `co_epa_naaqs_8h` and `pm25_well` (15 µg/m³) ties `pm25_who_24h`, so a tier
above matched first in each worst-first ladder. `pm10_well` was ordered
reachable, but nothing evaluates PM10 — `scoring.js` calls `evaluateCriteria`
for `pm25`, `co`, `hcho` and `tvoc` only. **Removing them from the ladder
changed no score and no finding.**

They are **not deleted**. `referenceProfiles.js` offers WELL v2 as a selectable
Logger Studio reference, and that is a legitimate opt-in — an assessor picks it
*because* the client is pursuing certification, and the profile resolves its
citation from this registry so Logger Studio and the walkthrough cite
identically. The rule is about **who decides**: the assessor may apply a
certification target, the engine may not apply one unbidden.

## Severity does not move with averaging period

These are different questions, and conflating them re-breaks the gap the
indoor tiers were added to close.

- **Severity** is the *condition's significance*. An office at 15 ppm CO is a
  combustion source worth investigating whether or not the reading was an
  8-hour average.
- **The averaging period** governs *what may be asserted* — carried in the
  generated statement and the `determinative` flag consumers read.

An earlier draft downgraded severity one step when a criterion was
non-determinative. It systematically demoted exactly the indoor criteria that
matter in a building investigation, and the tests caught it. Where a criterion
genuinely cannot be judged from a survey (a chronic RfC over an annual mean),
that is expressed by giving the criterion a low severity outright.

## Statements are generated, not written

`buildStatement` composes value, criterion, averaging period, evidence caveat
and action. Per-branch prose is how the caveat came to be present on one branch
and missing from the two above it. Adding a criterion cannot reintroduce that.

## Adding a criterion

1. Add the value to `STD` in `standards.js` with its citation in the comment.
   **Verify it against the primary source first** — see the citation discipline
   in CLAUDE.md.
2. Add an entry to `CRITERIA[parameter]` in criterion order, worst first.
   `resolve()` reads `STD`; never restate a value here.
3. Declare `averaging`, `class`, `severity`, `source`, `action`.
4. `tests/engine/criteria.test.ts` enforces the invariants automatically —
   every criterion resolves a finite value, declares a known period and class,
   carries a source and an action, and each ladder stays ordered worst-first.

## Consumers

| Consumer | Uses |
|---|---|
| `engines/scoring.js` | `evaluateCriteria` for CO, formaldehyde and PM2.5; `capSeverity` for CO₂ |
| `utils/assessmentVerdict.js` | Severity ranks feed the shared verdict |
| `utils/referenceProfiles.js` | Logger Studio's per-parameter reference selection. Profiles link by `criterionId` and resolve their citation from the registry |

## Division of responsibility with `referenceProfiles`

A **profile** owns *selection* — which yardstick the assessor picks for a
parameter — and *unit projection* into whatever the logger recorded. A
**criterion** owns what the threshold means, including its citation.

Profiles carry a `criterionId` and resolve `source` from the registry, so
Logger Studio and the walkthrough cite identically. Profiles with no published
threshold behind them (a custom band, "no reference line", the ASHRAE comfort
bands) legitimately declare their own and are left alone.

The link is by id and nothing enforces it at the type level, so
`tests/engine/criteria.test.ts` walks every linked profile and asserts its
criterion exists and its citation matches.

## One criterion per parameter (built, not currently rendered)

> **Status:** the **Criteria Applied** table was removed from the consultant
> deliverable in 2026-08, along with the standards register and the other
> standards sections — the report now names its criteria in the findings and
> the Appendix D background instead. `applied-references.js` and its tests
> are retained and green; re-composing the section is one line in
> `sections-v21client.js`. The rest of this section describes how it works,
> and the traps to avoid if it is restored.

The table lists each measured parameter once, with the single criterion it
was evaluated against — the shape the Indoor Environmental Monitoring Report
has always used. It replaced a table that printed every criterion the
platform knows (seven for CO alone), leaving the reader to work out which one
the assessment rested on.

`src/components/docx/applied-references.js` resolves it:

| The engine | The citation |
|---|---|
| flagged the parameter | the criterion behind the **most severe** finding, read from `parameter-verdicts.ts` |
| flagged nothing | the parameter's **default reference profile** — the yardstick it cleared |

Contradiction-free by construction. A cleared reading cleared *every*
criterion including the default, so "within" is true of both; a flagged
reading cites the thing it exceeded.

**Why not simply use the Logger Studio default.** Because the two disagree,
in the same way Results and Zone Findings used to disagree about 72 °F:

- **Temperature** — the Logger default resolves the ASHRAE 55 *acceptable*
  range (67–82 °F); `scoreEnv` also flags the tighter seasonal *optimal* band
  (73–79 °F in summer). Printing 67–82 beside a finding on a 72 °F reading
  says the reading is inside the band it was flagged against.
- **CO** — the Logger default is the EPA 8-hour NAAQS at 9 ppm; the registry
  ladder reaches the WHO 24-hour indoor guideline at 6 ppm. A 7 ppm reading
  is flagged while a fixed 9 ppm reference says it is under the bar.

Two things to know when touching this:

1. **Pass the unit.** `resolveReference` *projects* a published value into the
   unit it is given, so omitting `ctx.unit` is not "no unit" — it is a silent
   conversion. TVOC's 500 µg/m³ came back as `218` (ppb, via isobutylene
   molecular weight) before `REPORT_UNIT` was supplied.
2. **Benchmark type comes from the criterion CLASS**, shared with the full
   table via `CLASS_PRESENTATION`. Profiles with no registry criterion behind
   them (the comfort bands, CO₂'s ventilation indicators) fall back to
   `BAND_PRESENTATION`; without that they rendered a bare "Indicator", so the
   same parameter could be a "Ventilation benchmark" when flagged and an
   "Indicator" when not.

The technical/QA report keeps the fuller table (`benchmarkRowsFor`), narrowed
to the parameters measured. Different audience, same generated rows — depth
differs, the numbers cannot.

### No standards register

Appendix D used to close with a bibliographic catalogue of every standard
invoked. It is gone (product decision, 2026-08) and the appendix is now
**Criteria Background** — background prose and interpretation notes only.

Each criterion is already named three places a reader will look: beside its
result in Criteria Applied, in the finding it produced, and in that
background prose. The catalogue was a fourth statement of the same thing.

The citation walker still runs and still populates `appendixD.citations`, so
the audit record of what a report cited is intact — only the printing
stopped. `tests/engine/no-standards-register.test.ts` fails if a register
reappears in the rendered DOCX.

## The complement: criteria we chose NOT to apply

`src/engines/contextualStandards.js` is the other half of the registry. The
registry says which criteria produced findings; that file says which published
criteria a reader might reasonably have expected, and why they were not used.
It renders as the report's **Additional Criteria Considered** section
(`src/components/docx/sections-methodology-currency.js`), after Limitations.

Three entries today: ASHRAE 241-2023 (ECAi is a different target from 62.1
outdoor-air rates), the 2024 annual PM2.5 NAAQS and the WHO annual guideline
(annual means, which one visit cannot establish), and the ACGIH TLVs (a
separate consensus series from the OSHA PELs and NIOSH RELs used here).

Two rules keep it honest, both enforced by
`tests/engine/contextual-standards.test.ts`:

1. **An entry may not claim a criterion is unapplied when the registry applies
   it.** The test greps every registry `source` for the subjects claimed
   absent. Add an ACGIH criterion to `criteria.js` and the test fails until
   the corresponding entry is rewritten or removed. This guard exists because
   the file told clients the annual PM2.5 NAAQS was "not currently integrated
   into the deterministic scoring path" and went on saying it after
   `pm25_epa_annual` was added — nothing compared the two lists.
2. **It describes criteria, not AtmosFlow.** Vocabulary like "scoring engine"
   or "standards manifest" is asserted against. Prose of that kind is why the
   section was cut from the deliverable in `048f6d4`; it returned in 2026-08
   rewritten as criteria-selection rationale addressed to the reader.

Entries are scoped by `appliesWhen` to the parameters actually measured, so a
comfort-only walkthrough renders no section at all rather than three
irrelevant notes.

## Known remaining work
- **Thermal comparison is deliberately not a ladder.** Thermal is a band
  (min/max), seasonal, and keyed on a comfort model rather than a threshold
  sequence. Forcing it into the registry's shape would be a worse abstraction,
  not a more consistent one. Its severities sit within the `comfort_consensus`
  cap, so nothing is mis-rated. CO, formaldehyde, TVOC, PM2.5 and the CO₂ cap
  are migrated.

  *PM2.5 was on this list until 2026-08, on the reasoning that its
  outdoor-conditional weighting and (then-extant) data-hall branch were
  comparative logic
  rather than a flat ladder. That conflated two separable things. The
  **threshold comparison** — which criterion a reading trips, what it is called,
  what may be asserted from a walkthrough — is an ordinary ladder and now lives
  in the registry. The **deduction weight** is scoring math and stayed in
  `scoring.js`, keyed off the criterion's severity
  (`PM25_DEDUCTION_BY_SEVERITY`) with the no-outdoor-reading factor applied on
  top. The indoor/outdoor ratio finding is a different comparison against a
  different reference and is untouched. (The data-hall branch was left alone
  at the time; it was removed outright with the data-center module days later.)
  The cost of the delay was a literal ladder in scoring code that had drifted:
  it cited "EPA NAAQS" as a bare string with no averaging period, so a single
  walkthrough reading was compared to a 24-hour standard and stated without the
  caveat every registry-generated statement carries — the same defect class as
  `CO — EXCEEDS OSHA PEL`, in the one parameter still outside the registry.*

## The data-center module (removed)

The `DATA_CENTER` building profile and everything specific to it were removed in
2026-08 at the product owner's direction. What went:

| Layer | Removed |
|---|---|
| Profile | `BUILDING_PROFILES.DATA_CENTER` — zone subtypes (`data_hall`, `noc_office`, `battery_room`, `mechanical`), the six additional fields (`gaseous_corrosion`, `iso_class`, `dp_temp`, `h2_monitoring`, `h2_ppm`, `exhaust_cfm_sqft`), the TC 9.9 temperature and static-control overrides, and the battery-room NFPA 855 / IEEE 1635 context findings |
| Intake | `Data Center` as a facility type, its `premiumOpts` gate, the premium bottom sheet and its enterprise sales CTA, `isEnterprise`, `isPremiumOpt`, and the `premiumOverride` localStorage escape hatch |
| Scoring | the `data_hall` category weights and the zone priority weights, the ISA-71.04 and ISO-14644 walkthrough findings, the data-hall PM2.5 branch, and the battery-room H₂ ladder |
| Reasoning | causal-chain Rule 5 (data-center corrosion), hypothesis Rule 6 (atmospheric corrosion), and the two data-center sampling-plan entries |
| Report | condition types `particle_screening_only`, `possible_corrosive_environment` and `temperature_low_data_center`, with their phrase entries, finding groups, lead terms and recommendation intents; `DATA_CENTER_CONTEXT_PARAGRAPH`; the §8 corrosion validation check |
| Standards | ANSI/ISA 71.04-2013, ISO 14644-1:2015, ASHRAE TC 9.9, IEEE 1635 / ASHRAE Guideline 21, NFPA 855 — from the manifest, the citation tracker, the knowledge graph, the instrument registry and the settings screen |

Three consequences worth knowing, because none is obvious from the diff:

1. **Category suppression is now unreachable.** A category is suppressed when
   its zone weight is `0`, and `data_hall`'s `Complaints: 0` was the only zero
   in `ZONE_WEIGHTS`. The mechanism and the bridge's `SUPPRESSED → suppressed`
   mapping are intact and still tested — against a constructed fixture, since
   no profile can produce one any more. Adding a zero weight re-activates it.
2. **No profile declares `additionalFields`.** `DATA_CENTER` was the only one.
   The field registry still derives them, and `field-registry.test.ts` proves
   that by injecting a probe field and rebuilding rather than asserting names
   that no longer exist.
3. **Two `KNOWN_UNRESOLVED_READS` resolved themselves.** `observation_corrosion`
   and `corrosion_notes` were the unreachable half of `hasCorrosionIndicator`,
   which is gone. The list is down from five entries to three.

Deliberately kept: `SITE_TYPES` in `projectStore.js` still offers "Data Center"
as a project label. That is filing metadata for organising work, not the engine
facility type — a consultant can still have a data-center client; they just get
standard IAQ treatment rather than a specialty module.
