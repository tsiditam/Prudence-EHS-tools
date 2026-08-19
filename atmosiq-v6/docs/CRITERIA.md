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
| `engines/scoring.js` | `evaluateCriteria` for CO and formaldehyde; `capSeverity` for CO₂ |
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
- **PM2.5 and thermal comparisons are deliberately not ladders.** PM carries
  outdoor-conditional deduction weights, a data-hall branch, and an
  indoor/outdoor ratio — comparative logic, not a flat threshold ladder.
  Thermal is a band (min/max) rather than a ladder. Forcing either into the
  registry's shape would be a worse abstraction, not a more consistent one.
  Their severities sit within their class caps, so nothing is currently
  mis-rated. CO, formaldehyde, TVOC and the CO₂ cap are migrated.
