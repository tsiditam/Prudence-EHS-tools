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
| Seifert (1990) | A second citation for the same background range Mølhave already supports, and Mølhave's were the tiers actually applied. *(Mølhave followed it out in 2026-08 — see "TVOC has no criteria" below — so the background range now has no citation because it has no criterion.)* |
| NYC DOHMH | A second humidity number (65 %) beside the ASHRAE 55 bound (60 %) the engine applies, and a municipal document cited as a national benchmark — tagged `edition: 'current'` for something unrevised since 2008. |

Kept, because each passes: the OSHA PELs, the NIOSH RELs, ASHRAE 55 and 62.1,
the EPA NAAQS, Persily, IICRC S520, and every sampling **method**
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
for `pm25`, `co` and `hcho` only. **Removing them from the ladder
changed no score and no finding.**

They are **not deleted**. `referenceProfiles.js` offers WELL v2 as a selectable
Logger Studio reference, and that is a legitimate opt-in — an assessor picks it
*because* the client is pursuing certification, and the profile resolves its
citation from this registry so Logger Studio and the walkthrough cite
identically. The rule is about **who decides**: the assessor may apply a
certification target, the engine may not apply one unbidden.

*The WELL profile for TVOC was the exception and it is gone (2026-08), removed
with every other TVOC reference rather than kept as the parameter's last
selectable yardstick — see below. PM2.5, PM10 and CO keep theirs.*

## TVOC has no criteria, deliberately

`CRITERIA.tvoc` does not exist. `tvoc_molhave_concern` (500 µg/m³) and
`tvoc_molhave_action` (3,000 µg/m³) were removed in 2026-08, and with them
every surface on which this platform judged a TVOC reading.

**Why.** TVOC is a non-specific sum: it aggregates whatever a photoionization
detector responds to into one mass-equivalent number and identifies none of
it. No regulatory or consensus health-based limit exists for that quantity.
Mølhave's 1991 tiers were a chamber-study dose-response framework — a
description of how symptom likelihood varied across a defined 22-compound
mixture, not a limit anybody promulgated — and applying them produced a
severity, a citation, a client-facing finding and a sampling recommendation as
though they were one. Captioning them "advisory" did not help: a tier printed
beside a measured value reads as a limit however it is labelled, which is
precisely how they spread.

**What that means in code.** `evaluateCriteria` returns null for a parameter
with no registry entry and `scoring.js` guards `if (hit)`, so the ABSENCE of
the key is the behaviour — no branch anywhere tests for it. Removed in the
same change: the reference profiles (including the WELL target, so the chart
draws the series and no line), the `checkTVOC` live-advisor rule, the
concentration-triggered VOC-speciation sampling entry, and the TVOC term in
the chemical causal chain. The renovation/off-gassing TO-17 sampling entry is
untouched — it fires on a recorded SOURCE, not on a concentration, so it needs
no threshold to be defensible.

**What TVOC still does.** It is captured, converted between units, charted,
tabulated and reported. `reportModel` classifies it `not_evaluated` rather
than `acceptable`, because calling an unjudgeable reading acceptable is the
more dangerous of the two available errors, and `sections-atmosflow.js` renders
that as a distinct "Not evaluated" severity token. Every prose surface states
the measured value and what would be needed to say more — speciation by EPA
Method TO-17, which yields individual compounds that each carry a real
exposure limit.

Guard: `tests/engine/no-molhave.test.ts`.

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

> **Status: DELETED.** The **Criteria Applied** table was removed from the
> consultant deliverable in 2026-08, and `applied-references.js` was deleted
> outright later that month when the consultant report itself was removed
> (see "The consultant report (removed)" below). Nothing renders or builds it.
> This section is kept as the design record: what the table was for, and the
> traps to avoid if anything like it is built for the AtmosFlow report.

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
   unit it is given, so omitting `ctx.unit` is not "no unit" — it is whatever
   the profile's own default happens to be. TVOC's 500 µg/m³ came back as
   `218` (ppb, via isobutylene molecular weight) before `REPORT_UNIT` was
   supplied. TVOC no longer defaults that way — an absent or unrecognised unit
   now resolves to no reference at all — but HCHO still falls back to ppm, so
   the rule stands.
2. **Benchmark type comes from the criterion CLASS**, shared with the full
   table via `CLASS_PRESENTATION`. Profiles with no registry criterion behind
   them (the comfort bands, CO₂'s ventilation indicators) fall back to
   `BAND_PRESENTATION`; without that they rendered a bare "Indicator", so the
   same parameter could be a "Ventilation benchmark" when flagged and an
   "Indicator" when not.

The technical/QA report keeps the fuller table (`benchmarkRowsFor`), narrowed
to the parameters measured. Different audience, same generated rows — depth
differs, the numbers cannot.

### Double-entry bookkeeping (how a wrong number gets caught)

Every threshold exists in two independently authored places:

| Ledger | File | Written for |
|---|---|---|
| Machine | `constants/criteria.js` | the engine |
| Prose | `constants/standards-corpus.js` | Jasper's retrieval layer, with primary-source citations |

**Until 2026-08 nothing compared them.** The engine scored temperature against
an invented 67–82 °F band with a fabricated "optimal" tier while the corpus,
three directories away, carried the correct 68–76 / 73–79 and had done since
it was written. It also stated in as many words that ASHRAE 55 "does NOT
prescribe a lower humidity limit" while eleven surfaces cited ASHRAE 55 for a
30 % floor. Both ledgers were in the repo. Neither was ever opened beside the
other.

A corpus entry whose text already states a threshold declares it structurally:

```js
figures: [
  { criterionId: 'temp_ashrae55_summer', band: [73, 79], unit: '°F' },
  // A figure may name its own bibliography entry when it belongs to another
  // body — epa-pm25-2024-revision states the EPA NAAQS and the stricter WHO
  // guidelines side by side, and that comparison is why it exists.
  { criterionId: 'pm25_who_24h', value: 15, unit: 'µg/m³', manifestKey: 'WHO Air Quality Guidelines' },
],
```

`figures` is metadata, not content — it links prose that already passed review
to the registry entry it describes. Writing NEW prose still needs BCSP sign-off.

`tests/engine/standards-reconciliation.test.ts` then enforces:

1. A declared figure matches the registry **exactly**. No tolerance — "close"
   is how 67 becomes defensible.
2. Every criterion is documented by a corpus figure **or** named in an explicit
   gap ledger with a reason. There is no third state.
3. The gap ledger may only name criteria that exist, so it cannot rot into a
   list of ghosts that silently excuses everything.
4. A criterion cannot be both documented and excused.
5. Every citation names a year, a regulation, a publication or a qualifier —
   a bare `ASHRAE 55` fails, because that was the shape of both wrong ones.

Verified against all three defect classes: restoring the invented band fails 1
test, re-citing humidity to ASHRAE 55 fails 2, and adding a new threshold with
`source: 'Industry practice'` fails 2.

**The gap ledger is a backlog, not an exemption.** Twenty-one criteria are on
it today — every CO and formaldehyde limit, all of PM10, the CO₂ indicators —
because no corpus entry states their figures. They are checkable by hand and
not contradictable, which is exactly the condition temperature and humidity
were in. It may only shrink.

### No reference line without a criterion

`tests/engine/reference-line-provenance.test.ts` is the general form of the
per-parameter guards that were each written after a specific figure turned out
to be wrong. A reference line is the most consequential number the product
renders — it is what a reading is judged against, it appears on a chart the
client keeps, and nobody reads it as an opinion. So every one must resolve to
a criterion, in the criterion's value (any unit projection), under the
criterion's own citation.

It found one on its first run: the CO₂ profiles drew 1,000 and 1,500 ppm with
no criterion linked, though `co2_concern` / `co2_action` hold exactly those
numbers. Linking them added no claim — the values already matched.

**The rule is traceability, not linkage**, and the first version of this guard
got that wrong. It demanded a criterion for every profile, which the TVOC
`well` profile had none of *by design* — `citation-discipline.test.ts` records
that as "the documented pattern for a profile with no registry threshold
behind it". *(That profile was itself removed in 2026-08, so the example is
now historical; the pattern it established still governs any self-sourced
profile.)* The correct response to a guard flagging a deliberate decision is
to fix the guard. Instead a criterion was invented to satisfy it and the
profile's WELL citation was replaced with a LEED one, on the reasoning that
the corpus "contradicted" WELL. It does not — the corpus entry for that figure
never mentions WELL, and silence is not contradiction. Reverted in full.

A profile therefore satisfies this guard by linking a criterion **or** by
declaring its own citation. What fails is a line at a number with neither, and
the self-sourced profiles are pinned as a named list so the exception cannot
spread quietly.

It also checks the **label**: a profile named "NIOSH REL (0.016 ppm)" states
the figure in text, where a stale one is invisible to any check that only reads
the resolved value.

### Limits and bands

A criterion is one of two shapes:

| Shape | Declares | Matches when | Example |
|---|---|---|---|
| **Limit** | `resolve()` → a number | `value > threshold` | CO NIOSH ceiling, 200 ppm |
| **Band** | `resolveBand()` → `{min, max}` | `value < min` or `value > max` | ASHRAE 55 summer comfort, 73–79 °F |

Bands arrived in 2026-08, and their absence is the reason this project's two
worst citation errors were both in thermal comfort. Every parameter governed
by the registry travels with a class, an averaging period and a checkable
source, and **not one of them was wrong**. Temperature and relative humidity
had no registry entry at all — they lived as bare numbers on `STD.t` — because
the registry could only express "value > threshold" and comfort is a range.
The one shape the registry could not hold is the one shape that went
unaudited: an invented 67–82 °F "acceptable" band with a fabricated "optimal"
tier inside it, and a 30–60 % humidity range credited to a standard that sets
no lower limit at all.

CLAUDE.md already stated the rule this violated — *never compare a measured
value against a bare number from `STD`*. The gap was that for those two
parameters there was nowhere else to put the number.
`tests/engine/criterion-coverage.test.ts` now enforces it: every parameter the
engine emits a finding for must name a registry criterion, and that criterion
must carry an averaging period, a class and a source.

Three consequences worth knowing when you add a band:

1. **Every criterion exposes `resolve()`, `valueLabel` and `midpoint`,
   whatever its shape.** A consumer should never have to branch. `${c.resolve()}`
   printed `[object Object] °F` the moment a criterion stopped being a single
   number, which is why `valueLabel` ("73–79") exists and is what renders.
2. **A band may declare a SCOPE, and a scope the caller has not named is not a
   match.** Today that is `season`: the two ASHRAE 55 bands overlap (winter
   68–76, summer 73–79), so walking both makes 79 °F "outside the winter band"
   in July. Pass `evaluateCriteria(param, value, basis, { season })`.
3. **Both bounds ground.** A band finding prints two published numbers, so
   `provenance.ts` returns `criterionValuesById` → `[min, max]`. Grounding only
   one leaves a real published figure looking invented to the check that exists
   to catch invented figures.

The engine still owns the temperature comparison itself, because a building
profile may narrow the band for a specialty occupancy and the registry does not
know about profiles. What it takes from the registry is the **severity ceiling
and the citation** — via `criterionById` — which is the part that had drifted:
`scoreEnv` wrote `sev:'high'` for four months while
`CRITERION_CLASS.comfort_consensus` declared a ceiling of `medium`, and nothing
could see the disagreement because the branch was not governed by a criterion.

### Crossing units: the equivalence basis

A threshold travels with its averaging period, class and source. Units are the
fourth thing it travels with, and they split three ways rather than two:

| Case | Example | Conversion |
|---|---|---|
| Within a basis | mg/m³ → µg/m³, ppm → ppb | Decimal prefix shift. Exact. |
| Across bases, single compound | HCHO ppb ↔ µg/m³ | Needs a molecular weight, but the weight is a fact about the analyte. Exact. |
| Across bases, a mixture | TVOC ppb ↔ µg/m³ | Needs a molecular weight the mixture does not have, so one is **chosen**. |

Only the third case sets `equivalenceBasis` on the criterion, and setting it
is a requirement rather than a permission: `resolveReference` attaches the named compound and the
response-factor limitation to any value that crossed, and
`tests/lib/vocConversion.test.ts` fails if a tier crosses without one.

**`equivalenceBasis` is the default, not the answer.** The compound that
actually applies is the one the meter was spanned to, and the app records it:
`pid_cal_gas` per zone on an assessment, `calibration.gas` on a monitoring
session. `parseCalibrationGas` reads it (whole-word matching — "isobutane" is
not "isobutylene") and returns three states, each licensing a different
sentence: recognised (a fact about this survey), recorded-but-unweighable
(isobutylene is used and the note names the mismatch), and not recorded (a
stated convention). Pass it as `ctx.calibrationGas` / `opts.calibrationGas`;
a meter spanned to toluene resolves a 500 µg/m³ mass threshold at 133 ppb,
not 218.

**No criterion sets `equivalenceBasis` today.** The only two that did were the
TVOC tiers, removed in 2026-08 (below). The field, its validation and the
projection in `referenceProfiles.js` are kept as a whole contract so the rule
does not have to be rediscovered if a mixture threshold is ever added.

All of it goes through one module, `src/utils/vocConversion.js`, in both
directions — the published tier projecting into the logged unit, and a logged
ppb reading converting into the engine's µg/m³ `tv` field.

**Why one module.** The conversion had been implemented in three places under
three policies. The parse-to-reading path converted, the reference-projection
path refused to, and a ppb log therefore produced a scored comparison in the
assessment and no reference line at all in the monitoring report — from the
same instrument, on the same air. The property that closes it is asserted
directly: the same series must reach the same verdict whether the data moves
to the reference or the reference moves to the data.

**Why a disclosure and not a refusal.** The limitation is real — a PID's
response varies by compound, so its total is indicative rather than
speciated. But that limitation belongs to the READING, and it exists in
every unit: a PID displaying µg/m³ computed that number from the same
isobutylene-equivalent response, by the same arithmetic. Withholding the tier
from ppb-logging meters therefore removed nothing unsound; it removed the
reference from half the instruments in the field on the basis of a display
setting, and left the other half comparing against it with no disclosure at
all. State the assumption, cite EPA Method TO-17 as what would settle it, and
give both halves the same comparison.

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

## The consultant report (removed)

The consultant DOCX deliverable was removed in 2026-08 at the product owner's
direction — it had accumulated too many defects to keep shipping.

It was **one of two parallel client deliverables**, and the other one survives:

| | Consultant report (removed) | AtmosFlow report (survives) |
|---|---|---|
| Pipeline | bridge → `renderClientReport` → `sections-v21client` | `assembleRenderModel` → `sections-atmosflow` |
| File name | `AtmosFlow-Consultant-Report-…` | `AtmosFlow-Report-…` |
| PDF paths | never used it | already used it, client and server |

Removed with it, because each rendered only there: `sections-supplemental`,
`sections-resurvey`, `applied-references`, `sections-methodology-currency`,
`calibration-appendix`, `sections-lab-results`, `sections-sensor`,
`sections-conceptual-model`, `sections-cih-reasoning`, `sections-traceability`,
and the `reportStyle === 'cih'` flag that gated the last two.

**Share and peer review now attach the AtmosFlow DOCX.** Both called
`getConsultantDocxBlob`; the return shape is identical, so the change is the
one call each.

### Three consequences, all accepted deliberately

1. **The calibration record and the acknowledgement no longer appear in any
   deliverable.** They lived in the consultant report's Appendix B and the
   Appendix E QA notes. The acknowledgement is still built at the interrupt,
   still persisted to `assessments.calibration_acknowledgement`, and still
   emitted append-only to `audit_log` — only the client-facing disclosure
   ended. The finalization gate itself is untouched.
2. **The editorial-review feature is gone end to end** — the panel, the
   `api/report-editorial-review` endpoint, `editorialSuppressions.js`,
   `editorialReviewDigest.js`, and the read/write mapping in
   `supabaseStorage.js`. Only the consultant renderer honoured a suppression;
   `sections-atmosflow.js` reads none, because its render model carries no
   engine `findingId` to suppress against. Keeping the panel would have
   shipped an AI proposal + human approval flow that changed no output.
   The `editorial_suppressions` DB column is left alone — legacy rows keep
   their data, nothing reads it.
3. **The honesty guards went with it.** `cross-layer-consistency`,
   `no-standards-register`, `omitted-consultant-sections`, `canonical-sections`,
   `v22-docx-aesthetics`, `v22-toc` and `cih-report-integration` all rendered
   the consultant DOCX. **The AtmosFlow report has never been held to any of
   them** and is now the only client deliverable. Porting them was offered and
   deferred; it is the obvious next piece of work. Note in particular that
   `sections-atmosflow.js` renders an "Appendix A — Standards & References",
   which is the standards register `no-standards-register.test.ts` existed to
   keep out of the consultant report.

`renderClientReport` and `src/engine/report/` are **retained** — `PrintReport.jsx`
renders the HTML print view from them, and the investigation agent shares
`provenance.ts`, `recommendations.ts` and `parameter-ranges.ts`. Roughly twenty
suites still exercise that pipeline. Only the DOCX deliverable went.

Also removed: the legacy v2.3–v2.6 acceptance configs and the two fixture
renderers that fed them. Every `rendered_*` check in those configs read a
consultant DOCX rendered to `/tmp`, so none of them could run again.
`tests/engine/no-consultant-report.test.ts` and the `NO-CONSULTANT-REPORT`
acceptance criterion keep the removal from creeping back one helper at a time.
