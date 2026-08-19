# Reporting Voice

How AtmosFlow communicates findings to a client or facility stakeholder.

> **Status:** this document is the **agreed voice policy**, and the report's
> parameter results and per-finding limitations now implement it. An engine
> override was granted (2026-08) covering `parameter-prose/` and `phrases/`;
> scoring, thresholds, permission flags and the banned-term list were not
> touched. Remaining non-conforming surfaces are listed in the
> [Surface inventory](#surface-inventory).

## The voice

Write as an experienced industrial hygienist communicating findings to a client
or facility stakeholder. Clear, confident, concise professional judgment — not
prose composed in anticipation of a legal, regulatory, or peer-review challenge.

**Governing principle: be accurate without being defensive.** Qualify a
statement only when the qualification would materially change how the reader
should understand or act on the result.

## Interpretation rules

1. State what the data show and what they mean in practical terms.
2. Use normal professional judgment when the evidence supports a conclusion.
3. No disclaimers, caveats, or limitations on routine findings unless they
   materially affect interpretation.
4. Do not repeatedly explain what a parameter cannot establish.
5. Do not turn normal results into technical discussions.
6. Distinguish measurements, observations, and findings. **A normal measurement
   is not automatically a finding.**
7. When conditions are normal, say so plainly.
8. When conditions warrant attention, explain why and identify the next step.
9. Avoid "does not necessarily indicate," "cannot by itself establish," "should
   not be interpreted as," "at the time of measurement" — unless the
   qualification changes the conclusion.
10. Do not recite standards history or technical controversies inside individual
    findings. **Technical context belongs in the methodology or reference
    section**, where a reader who wants it can find it.
11. Do not use regulatory or exposure-limit language for screening values unless
    the reference genuinely is a regulatory or occupational exposure limit.
12. Match the strength of the language to the strength of the evidence.

## Worked example

**Preferred**

> CO₂: 420 ppm (Δ −130 ppm) — Low CO₂ with no evidence of occupant-related
> accumulation.

**Rejected**

> CO₂: 420 ppm (Δ −130 ppm) — The measured indoor concentration was below the
> concurrent outdoor concentration. This result does not indicate CO₂
> accumulation associated with occupant-generated bioeffluents at the time of
> measurement. CO₂ may provide useful information about outdoor-air ventilation
> relative to occupancy under appropriate measurement conditions but should not
> be used alone to determine ventilation adequacy or overall indoor air quality.

Both say the same thing. The second buries it, and repeats on every parameter in
every zone.

## What this policy does NOT change

This is a change to **verbosity and placement**, not to defensibility. Nothing
here authorises claiming more than the evidence supports. Specifically, all of
the following stay exactly as they are:

- **Permission flags** — `definitiveConclusionAllowed`, `causationSupported`,
  `regulatoryConclusionAllowed` continue to gate what may be asserted.
- **The banned-term list** — `TONE_BANNED_TERMS` in `cih-validation.ts` and its
  CommonJS mirror `api/_banned-language.js`. "Confirmed", "caused by",
  "noncompliant", "unsafe" remain blocked without the earned flag. No rule in
  this document requires any of them.
- **AI provenance labelling** and the Jasper disclaimer line.
- **Qualitative-only propagation** from uncalibrated instruments.

Rule 12 ("match the strength of the language to the strength of the evidence")
*is* the permission-flag model stated in prose. Rule 11 is **stricter** than
current output: the CO₂ prose today cites the OSHA PEL of 5,000 ppm in routine
findings, which is exposure-limit framing applied to a screening value.

## Surface inventory

| Surface | File(s) | State |
|---|---|---|
| Jasper chat | `src/constants/field-assistant-prompt.js` | **Largely conforms** — already instructs a direct working read, no deflection, plain active voice |
| Parameter results prose | `src/engine/report/parameter-prose/*.ts` | **Conforms.** Summaries rewritten; standards background relocated to Appendix D |
| Per-finding limitations | `src/engine/report/phrases/*.ts` | **Conforms.** Evidentiary limitations stay inline; standards framing moved to Appendix D |
| Verbatim report paragraphs | `src/engine/report/templates.ts` | **Editorial layer** — scope / limitations / methodology blocks. Was listed here as "engine-sacred"; CLAUDE.md's two-layer rule (2026-08) puts verbatim paragraphs in the editorial layer, changeable like any other code |
| Scoring finding text | `src/engines/scoring.js` | **Determinism core** — changing it changes what the engine concludes, so it needs product sign-off |
| Print report | `src/components/PrintReport.jsx` | Non-conforming, editable |
| Lifecycle copy | `src/constants/reportLifecycle.js` | Non-conforming, editable |
| AI narrative | `src/engines/narrative.js` (the prompt; `api/narrative.js` is a proxy) | **Conforms** — rewritten 2026-08 to Finding → Significance → Action; see below |

## The architectural tension

Two engine rules run against rules 3 and 10:

- **v2.3 — "limitations attached to findings, not to sections."** Every finding
  carries its ConditionType's `defaultLimitations` inline. That is unconditional
  by design; rule 3 asks for it to become conditional on materiality.
- **Parameter prose renders `standardsBackground` per parameter** in the Results
  section — the standards history rule 10 asks to relocate.

Rule 10 supplies the destination rather than deleting the content: methodology
or reference section. Appendix D (standards and citations) and the Methodology
Disclosure already exist and are the natural homes, so the defensible material
survives — it stops being repeated inside every finding.

Both were resolved under the override, by **relocation rather than deletion**.

## How it was implemented

### Parameter results

Each `summaryTemplate` now branches on `withinStandards` and states the normal
case plainly. Exposure-limit framing was dropped from routine results per rule
11 — the CO₂ summary no longer cites the OSHA PEL of 5,000 ppm to report a
420 ppm reading. The elevated branch says what the exceedance means and names
the next step.

The ~1,270 words of `standardsBackground` are unchanged and now render once, in
Appendix D, for the parameters actually measured (`AppendixD.parameterBackground`).
The DOCX renderer had already stopped printing them in Results; the HTML
renderer had not, so the two were inconsistent. They now match.

### Finding limitations

`PhraseLibraryEntry` gained an optional `technicalContext` field. Limitations
split by kind:

- **Evidentiary** — what was or was not measured, and the instrument or method
  constraints bearing on it. Material: they change what the reader should do.
  These stay inline beneath the finding.
- **Standards framing / definitional** — what a benchmark *is*, or what a
  parameter cannot establish alone. Collected once into Appendix D under
  **Interpretation Notes**, for the condition types that actually fired.

Eight strings moved:

| Condition type | Relocated to Appendix D |
|---|---|
| `ventilation_co2_only` | ASHRAE 62.1 compliance requires measured supply airflow… |
| `ventilation_inadequate_outdoor_air` | CO₂ is a ventilation effectiveness indicator, not a contaminant (Persily 2021) |
| `tvoc_screening_elevated` | Mølhave (1991) tiers are advisory benchmarks, not regulatory limits |
| `objectionable_odor` | The presence of an odor does not necessarily indicate a health hazard |
| `temperature_outside_comfort` | Comfort interpretation depends on activity level, clothing, physiology |
| `humidity_microbial_amplification_range` | Continuous RH logging over 14+ days is recommended… |
| `occupant_symptoms_anecdotal` | Causation… cannot be established from anecdotal report alone |
| `occupant_cluster_anecdotal` | Spatial clustering alone does not establish causation |

**The never-empty guard.** A first pass moved fourteen strings and left six
condition types — the PM and comfort ones — with no inline qualification at
all. `tests/engine/phrase-library.test.ts` caught it, and it was a real
mis-classification rather than a stale invariant: for a documented PM
exceedance, "EPA NAAQS are ambient standards applied here as indoor
benchmarks" is exactly what stops a reader treating the benchmark as an indoor
regulatory limit — rule 11 wants that sentence kept. The rule is now explicit:
**where relocating would empty an entry, the first limitation is material after
all and stays inline.** Pinned by `tests/engine/reporting-voice.test.ts`.

### AI narrative

The narrative layer is the one surface where the prose is written by a model,
so the prompt in `src/engines/narrative.js` *is* the implementation. A CIH
review of a live narrative (Summani Plaza, 2026-08) found the engine selected
and ranked the findings correctly and then communicated them badly. The
failures were all voice failures, and each one is now an instruction:

| Defect in the reviewed narrative | Correction |
|---|---|
| Opened *"Zone 1 presents three converging indicators that warrant prompt CIH review"* | Lead with the conclusion in plain language. No opening on a count, a score, a severity label, or a review request |
| PM2.5 bullet carried I/O ratio, an unnamed threshold, a NAAQS comparison and pathway speculation at once | Plain-language claim first, numbers after; never stack the analytical steps into one sentence |
| *"the threshold the screening literature associates with…"* | A comparison value comes from the manifest or is not stated. An indoor-vs-outdoor comparison needs no threshold at all |
| *"compound-level characterization by TO-17 GC/MS is needed"* | A named analytical method is a conditional escalation after source identification is attempted, never the opening step |
| *"flags this assessment as having high OSHA defensibility relevance per the platform's logic"* | Boundary 4: never describe AtmosFlow, its logic, scores or classifications. `oshaDefensibility` was also removed from the payload — the model cannot report what it is not given |
| *"Temperature (78 °F) and RH (45 %) fall within ASHRAE 55-2023 ranges"* | Comfort is not settled by two spot readings. Say those conditions did not identify a notable condition |

The output shape is two sections, **Overall Finding** then **Recommended Next
Steps**, and the second distinguishes *further investigation* from *corrective
action* — recommending a control for a source nobody has found yet is the
error that produced "deploy interim portable HEPA units".

Ratios, criteria, tiers and methodological qualification are not lost; they
belong in the report's own results tables and technical sections, which is
where the reader looks for them.

Pinned by `tests/engine/narrative-prompt.test.ts`. Those are assertions about
instructions, not about model output — they prove the instruction preventing
each known failure is still present, not that any given narrative reads well.
The rendered text is separately guarded by `api/_banned-language.js`.

### Review note

The evidentiary-vs-context split is an editorial judgment applied to
liability-adjacent text. It was made string by string and is recorded in the
table above precisely so it can be overruled. Anything moved is still in the
report; nothing was deleted.
