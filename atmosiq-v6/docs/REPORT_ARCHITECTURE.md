# AtmosFlow Report Architecture — Engine v2.1

## Core Principle

**Engine decides. Narrative writes within permissions.**

The engine determines four things for every finding:
1. Is a definitive conclusion supported by the evidence?
2. Is causation supported across the contributing chain?
3. Is a regulatory conclusion supported by methodology and margin?
4. Is the data sufficient for a client-facing deliverable?

The narrative layer (AI or template) may only use language that the engine has explicitly permitted. If the engine says `definitiveConclusionAllowed: false`, no narrative may say "confirmed," "verified," or "is present."

## Dual Render Modes

### `report.internal(score)` → InternalReport
The operator dashboard. Contains numeric scores, severity labels, deductions, tier classifications, prioritization queues, and defensibility flags. Used for:
- Internal triage and prioritization
- Demo and sales presentations
- Engineering/maintenance action planning

**Never shown to clients as a professional deliverable.**

### `report.client(score, options)` → ClientReportResult
The CIH-defensible client deliverable. Returns a discriminated union:
- `{ kind: 'report', report: ClientReport }` — full professional report
- `{ kind: 'pre_assessment_memo', memo: PreAssessmentMemo, reasons: [...] }` — when data is insufficient

The client report:
- Contains NO numeric scores, severity labels, or tier classifications
- Uses `ProfessionalOpinionTier` for qualitative judgment
- Every finding sentence comes from the phrase library (no free-text)
- Includes verbatim transmittal, scope, and limitations paragraphs
- Includes signatory block with credentials and review status

## Permission Flags

Each `Finding` carries three permission flags:

| Flag | Permits | Requires |
|------|---------|----------|
| `definitiveConclusionAllowed` | "confirmed," "is," "exceeds" | documented_8hr_twa or laboratory_speciation + sampling adequate + outside noise floor |
| `causationSupported` | "caused by," "due to" | All contributing findings definitive + recognized causal chain |
| `regulatoryConclusionAllowed` | "noncompliant," "violation" | Definitive + regulatory limit exceeded beyond instrument uncertainty |

## Conditional Banned Terms

Terms are NOT permanently banned. They are blocked only when the corresponding permission flag is `false`:

- "confirmed" → blocked unless `definitiveConclusionAllowed`
- "noncompliant" → blocked unless `regulatoryConclusionAllowed`
- "caused by" → blocked unless `causationSupported`
- "toxic mold" → blocked unless lab speciation + definitive

When a banned term appears without permission, the validator **throws** — it does not silently rewrite. The exception is the developer's signal to fix the engine's permission logic.

## Phrase Library

Every `ConditionType` has an entry in `PHRASE_LIBRARY` with:
- `intentTemplate` — CIH-approved narrative sentence
- `bannedAlternatives` — terms blocked without permission
- `defaultLimitations` — attached to every finding of this type
- `defaultRecommendedActions` — with priority, timeframe, and standard reference

### Adding a new ConditionType
1. Add the type to the `ConditionType` union in `src/engine/types/domain.ts`
2. Add the entry to the appropriate category file in `src/engine/report/phrases/`
3. Run tests — the exhaustiveness test will fail until the entry exists
4. Add scoring logic in `src/engines/scoring.js` that produces findings of this type

## Refusal-to-Issue

`report.client()` returns a `PreAssessmentMemo` instead of a report when ANY trigger fires:

1. No zones have instrument measurements
2. >50% of zone×category cells are insufficient
3. No findings at screening or validated confidence
4. No calibration records for any instrument
5. No credentials on assessor and no reviewing professional
6. All findings at insufficient_data confidence

## Instrument Accuracy

The engine maintains accuracy specs for common instruments. When a measurement falls within the instrument's stated uncertainty band of a reference threshold, the finding is downgraded to qualitative and `definitiveConclusionAllowed` is set to false.

## Professional Opinion Tiers

Zone-level opinion follows first-match rules. Site-level = worst zone.

| Rule | Conditions | Opinion |
|------|-----------|---------|
| 1 | validated_defensible + critical/high | corrective_action |
| 2 | any critical | corrective_action |
| 3 | validated_defensible + medium | further_investigation |
| 4 | 2+ provisional at high/medium | further_investigation |
| 5 | qualitative_only + medium | monitoring |
| 7 | all pass/info | no_significant_concerns |

---

## v2.3 — Limitations attached to findings, not to sections

The v2.3 release reworks how limitations and the Building and System Conditions section render in client deliverables. Two specific defects from the Hizinburg Data Center rendering motivated the change:

1. The Building and System Conditions section was rendering as an empty section header followed by an aggregated dump of every limitation in the assessment (sixteen orphaned bullet points), even when no building-scoped findings existed.
2. Finding-level limitations were being aggregated into a section-level "Data Limitations" list rather than attached inline with the findings they qualify.

### Decision rule for limitations placement

Limitations render in exactly **two** places in the final report:

| Surface | Content |
|---|---|
| Inline beneath each finding | `RenderedFinding.limitations` — the phrase library's `defaultLimitations` for the finding's `ConditionType`, deduplicated within the zone |
| Terminal "Limitations and Professional Judgment" paragraph | The verbatim engine paragraph at `templates.ts: LIMITATIONS_PARAGRAPH` |

The "Methodology Disclosure" verbatim paragraph at the top of the report is a **methodology-level** limitation framing (how the assessment was conducted), not a data-limitations dump, and stays as-is.

There is **no** standalone "Data Limitations" section anywhere. The validator in `cih-validation.ts` blocks any reintroduction.

### Conditional rendering of the Building and System Conditions section

The section renders **only when at least one finding has scope `building` or `hvac_system`**. When no such findings exist:

- The section header is omitted entirely from the report body.
- The section is omitted from the Table of Contents.
- The Results narrative does not name the section.
- Exactly this sentence is appended to the **Scope of Work** narrative:

  > Building system condition was not within the scope of this assessment beyond the observations documented in the zone-by-zone findings.

The previous wording "No visible building or system deficiencies were identified during the walkthrough" is **banned** in v2.3 because it makes an unsupported affirmative claim. Absence of in-scope assessment is not equivalent to absence of deficiency.

### `RenderedFinding` shape

Each finding renders as a self-contained block:

```ts
export interface RenderedFinding {
  readonly findingId: FindingId
  readonly conditionType: ConditionType
  readonly narrative: string                              // approvedNarrativeIntent
  readonly observedValue?: string
  readonly limitations: ReadonlyArray<string>             // pulled from finding.limitations
  readonly recommendedActions: ReadonlyArray<RecommendedAction>
  readonly confidenceTierLanguage: string                 // CONFIDENCE_TIER_LANGUAGE[finding.confidenceTier]
}
```

The renderer (HTML and DOCX) emits each `RenderedFinding` as:

```
[narrative paragraph]

[if observedValue present:]
Observed: [observedValue]

[if limitations.length > 0:]
Limitations of this finding:
- [limitation 1]
- [limitation 2]

[if recommendedActions.length > 0:]
Recommended actions:
- [priority] ([timeframe]): [action] — [standardReference if present]
```

### Empty-zone single-sentence rule

A zone with zero significant findings renders exactly **one sentence** under the zone heading:

> No conditions warranting elevated concern were identified in this zone within the stated limitations.

The renderer does not emit an empty `observedConditions` list, an empty `recommendedActions` list, or any "no significant conditions identified" placeholder.

### Per-zone limitations dedup

Within a single zone, when the same limitation string appears on multiple findings, it renders **once** beneath the first finding it appears on. Subsequent findings in the same zone omit the duplicate. Implementation in `src/engine/report/client.ts` as `dedupZoneLimitations`.

**Cross-zone dedup is NOT applied.** A limitation may legitimately reappear in a different zone if the same finding type fires there — each zone is its own context for the reader.

### Acceptance runner

`npm run accept:v2.3` mechanically enforces every requirement above. Internally it:

1. Runs `vitest run scripts/acceptance/render-acceptance-fixture.test.ts` with `VITEST_RENDER_FIXTURES=1` to produce two `.docx` fixtures and their extracted `.txt` representations:
   - `/tmp/acceptance-report.docx` — canonical multi-zone fixture with HVAC findings + an empty zone
   - `/tmp/acceptance-report-no-building.docx` — fixture with zone findings but ZERO building-scoped findings
2. Reads `scripts/acceptance/v2.3.json` and runs each criterion's checks (`rendered_contains` / `rendered_excludes` / `engine_version_equals` / `vitest_passes`).
3. Exits 0 iff every criterion passes; 1 with detailed reasons otherwise.

The runner is the canonical gate for v2.3 completion — any change that breaks one of the eight criteria fails the build.

## v2.4 — Consolidated Completion

Engine version: `atmosflow-engine-2.4.0`. v2.4 closes the v2.2/v2.3 misses
that earlier acceptance prose claimed but didn't actually deliver. The
acceptance runner was rebuilt for v2.4 — see [`docs/ACCEPTANCE.md`](./ACCEPTANCE.md).

### §2 Per-parameter Results subsections

Between **Sampling Methodology** and **Building and System Context**, the
report now renders a structured **Results** section with one subsection
per measured parameter (Carbon Dioxide, Carbon Monoxide, Formaldehyde,
Total VOCs, PM2.5/PM10, Temperature, Relative Humidity). Each
subsection emits two paragraphs:

1. The standards background prose from `src/engine/report/parameter-prose/<param>.ts`,
   citing the applicable ASHRAE / OSHA / EPA / NIOSH / peer-reviewed
   reference for that parameter.
2. A measurement summary built from the `ParameterRange` computed in
   `src/engine/report/parameter-ranges.ts` ("CO₂ concentrations
   recorded during the survey ranged from 550 to 1180 ppm, averaging
   876.67 ppm…"). Subsections are emitted only when at least one
   valid measurement exists for that parameter.

### §3 Six structured appendices (A–F)

`ClientReportAppendix` carries six new structured appendix shapes:

| Appendix | Type | Content |
| --- | --- | --- |
| A | `AppendixA` | Per-zone × parameter measurement tabulation |
| B | `AppendixB` | Sampling locations and methodology detail (instruments + zones) |
| C | `AppendixC` | Photo documentation (optional; empty when no photos) |
| D | `AppendixD` | Standards & citations + the **single** engine-version line |
| E | `AppendixE` | Quality assurance & instrument calibration records |
| F | `AppendixF` | Glossary of terms and abbreviations |

Renderers live in `src/components/docx/sections-v21client.js`
(`buildAppendices`) and `src/components/print/client-html.js`
(`renderAppendices`). Both anchor the appendices with stable
`appendix-{a..f}` ids so the TOC links work in the HTML viewer.

### §4 Per-zone synthesis module

`src/engine/report/synthesis.ts` exports `synthesizeZone(zone)` which
replaces the v2.3 confidence-tier boilerplate ("Findings are
preliminary and based on screening-level data…") with a pattern-aware
zone interpretation. Eight templates evaluated in priority order:

1. `sick-building` — symptom cluster + symptoms-resolve-away + at least one
   ventilation/contaminant/moisture signal
2. `moisture-driven` — water damage / drain pan / amplification-range RH /
   visible microbial growth
3. `symptom-cluster-no-resolution` — cluster present, resolves-away absent
4. `ventilation-deficit` — CO₂ surrogate / inadequate-OA without contaminants
5. `particulate-amplification` — PM elevated + indoor > outdoor
6. `thermal-humidity-comfort` — comfort excursions only
7. `no-findings` — empty zone (single sentence)
8. `default-fallback` — confidence-tier language

### §5 Finding-level dedup within zones

`dedupZoneFindings` keys on `(conditionType + observedValue)`. Earlier
the legacy classifier could emit the same condition twice in one zone
(e.g. `occupant_cluster_anecdotal` from both the `cc` field and the
`sy` symptoms field). The first occurrence wins.

The Executive Summary's `findingsByGroup` now uses a
`SHORT_STATEMENT_BY_CONDITION` map (see `finding-groups.ts`) instead of
the verbatim approved narrative. The lead term still bolds; the short
statement is a single ~10–18 word abstracted consequence so the reader
doesn't see the same sentence twice (once in summary, once in zone).

### §6 Recommendations rendering rule

The **Recommendations Register** is the authoritative list of all
deduped actions, grouped by priority (Immediate / Short term / Further
evaluation / Long term). The Register is the canonical place a reader
goes to plan the response. Per-finding action blocks are still rendered
inline with each finding for context, but no action appears more than
twice across the entire report (`RENDER-NO-ACTION-TRIPLE-DUP`).

### §7 Footer migration

The repeated body footer (`Generated by AtmosFlow Engine X.Y.Z…`) is
removed from both the print and DOCX renderers. The engine version
line lives **only** in Appendix D (`AppendixD.engineVersionLine`).
Acceptance enforces both `RENDER-NO-FOOTER-LEAK` and
`RENDER-ENGINE-VERSION-IN-APPENDIX-D-ONLY`.

### §8 Recipient salutation fallback

When `transmittalRecipient.fullName` is empty, the salutation now
addresses **"Dear Building Operations Team,"** rather than the
boilerplate "To whom it may concern,". Implementation in
`buildTransmittalSalutation` in `src/engine/report/templates.ts`.

### §9 No mid-word truncation

`firstSentence(text)` in `src/engine/report/finding-groups.ts` no
longer truncates with an ellipsis when no sentence-ending punctuation
is found within 120 characters. The renderer wraps visually instead.
Acceptance enforces `RENDER-NO-TRUNCATION` (no `screening-l…` mid-word
chops).

## v2.5 — Residual Defect Cleanup

Engine version: `atmosflow-engine-2.5.0`. v2.5 closes six small but
defensibility-relevant defects that survived the v2.4 acceptance gate.
The acceptance runner gains nine new criteria; total criteria = 49.
Run `npm run accept:v2.5` to enforce.

### §1 "Not Specified" vs. em-dash for required recipient fields

The Executive Summary metadata table renders **`Not Specified`** in
required cells (Client Name, Site Contact, Requested By, Project
Number, Survey Date, Project Address, Survey Area) when the
underlying field is empty or absent. Em-dashes (`—`) remain
acceptable as placeholders in **optional** cells — most notably the
Recommendations Register `Reference` column. Implementation is
centralized in `fallbackOrNotSpecified()` in
`src/engine/report/client.ts`; the rule applies before the metadata
object is constructed, so both DOCX and HTML renderers stay free of
display-layer fallback logic.

### §2 Appendix D citation walker

`src/engine/report/appendix-d.ts` exports `collectCitations`,
`formatCitation`, and `ORGANIZATION_DISPLAY`. The walker recursively
traverses the entire `ClientReport` tree (plus the parameter-prose
`applicableStandards` arrays) and pulls every Citation-shaped value
plus every `RecommendedAction.standardReference` string into a
single deduped, sorted list.

#### Authority abbreviation expansion

Citations in the engine carry an `authority` enum
(`regulatory` / `consensus` / `advisory` / …). For Appendix D
display we additionally infer an **organization** code (OSHA,
NIOSH, ACGIH, EPA, ASHRAE, WHO, ISO, ANSI, AIHA, ABIH, FDA, IICRC,
ASTM, NYC_DOHMH, AABC_NEBB, PEER_REVIEWED, MANUFACTURER, OTHER) and
expand it to the full body name in the rendered bibliography.

| Code | Display |
| --- | --- |
| `OSHA` | Occupational Safety and Health Administration |
| `NIOSH` | National Institute for Occupational Safety and Health |
| `ACGIH` | American Conference of Governmental Industrial Hygienists |
| `EPA` | U.S. Environmental Protection Agency |
| `ASHRAE` | ASHRAE |
| `WHO` | World Health Organization |
| `ISO` | International Organization for Standardization |
| `ANSI` | American National Standards Institute |
| `AIHA` | American Industrial Hygiene Association |
| `ABIH` | American Board of Industrial Hygiene |
| `FDA` | U.S. Food and Drug Administration |
| `IICRC` | Institute of Inspection, Cleaning and Restoration Certification |
| `ASTM` | ASTM International |
| `NYC_DOHMH` | New York City Department of Health and Mental Hygiene |
| `AABC_NEBB` | AABC / NEBB |
| `PEER_REVIEWED` | Peer-reviewed literature |
| `MANUFACTURER` | Manufacturer |
| `OTHER` | (use the source field; no expansion) |

When a Citation does not carry an explicit `organization` field the
walker calls `inferOrganization(source)` to derive it from the
source string heuristically (e.g. `29 CFR 1910.1000` → OSHA,
`NIOSH Method 2016` → NIOSH).

After the citation list, the appendix closes with the engine
version line:

> *Report generated using AtmosFlow assessment platform, engine version atmosflow-engine-2.5.0.*

This is the only rendered location of the engine-version string per
v2.4 §7. Acceptance enforces both the presence of the line and the
absence of the engine-version string in any other body footer.

### §3 Building Conditions limitations-inline rule

The Building and System Conditions section uses the same
`RenderedFinding` block layout as zone findings:

```
[narrative paragraph for building finding]

[if observedValue present:]
Observed: <value>

Limitations of this finding:
- <limitation 1>
- <limitation 2>

Recommended actions:
- <priority> (<timeframe>): <action> — <standardReference>
```

There is no section-level "Data limitations" subsection and no
section-level "Recommended actions" rolling block. The canonical
Recommendations Register at the end of the report is the only place
recommendations aggregate.

Per-section limitations dedup applies: when two building findings
carry the same limitation string, it renders only beneath the first.
This mirrors the v2.3 per-zone limitations dedup rule.

### §4 Cross-zone finding consolidation in Executive Summary

A finding with `scope: 'zone'` legitimately appears in each zone
where it was observed. The Executive Summary **Summary of Findings**
cell, however, consolidates same-`conditionType` findings across
zones into a single entry naming all zones in the suffix:

> **Symptom cluster pattern:** A spatial cluster of similar occupant symptoms was reported in a localized area. *Observed in: 3rd Floor Open Office, Conference Room B.*

Per-zone Zone Findings sections continue to render the finding
under each zone where it occurred. The Recommendations Register
also continues to dedupe recommended actions across zones.

### §5 Appendix C deterministic logic

`src/engine/report/appendix-c.ts` exports `buildAppendixC(photos)`.
Empty photo arrays produce a single deterministic narrative
sentence:

> No photo documentation was collected during this assessment.
> Where photographs would have informed an observation, the
> corresponding finding includes a textual description …

Non-empty photo arrays produce a captioned list. Photos sort by:

1. Building-level (`zoneName === null`) photos first.
2. Then by zone name alphabetically.
3. Then by `capturedAt` for stable order within a zone.

Each entry renders as `Photo N: <Building or zoneName> — <caption>`.
A separate italic line lists the relative path or filename so a
reader can cross-reference the field photo set delivered separately
when image embedding is not available.

### §6 Executive Summary findings consolidation rule

`src/engine/report/exec-summary-findings.ts` exports
`consolidateExecutiveSummaryFindings()`. Findings are grouped by
`conditionType` and sorted by:

1. Worst severity (critical > high > medium > low)
2. Best confidence (validated_defensible > provisional > qualitative > insufficient)
3. Number of zones affected (descending)

Output is capped at six entries; if more than six finding groups
exist, a final "Additional findings of lower priority …" truncation
note is appended. Zone Findings and Building and System Conditions
sections continue to render every finding in full detail.

### §7 Instrument zero-readings filtering

`src/engine/report/methodology-narrative.ts` accepts an optional
`readingsByInstrument` map keyed by instrument model (case-
insensitive contains-match). When provided, instruments with zero
readings tied to them are filtered from Sampling Methodology and
Appendix B and a warning is surfaced via the configurable `warn`
sink (defaults to `console.warn`). This is treated as an upstream
data-integrity issue, not a renderer concern.

When an instrument **is** used and readings exist but the model
is not in the AtmosFlow accuracy database, the methodology
paragraph explicitly ties the missing accuracy spec to the
qualitative-only consequence:

> Manufacturer accuracy specifications for this model are not in
> the AtmosFlow accuracy database; findings derived from this
> instrument are presented as qualitative only and should be
> confirmed with calibrated reference instrumentation if
> quantitative determination is required.

### §8 v2.5 acceptance criteria added

| Criterion | What it enforces |
| --- | --- |
| `APPENDIX-D-MODULE` | The citation walker module exists |
| `APPENDIX-C-MODULE` | The deterministic Appendix C builder exists |
| `EXEC-SUMMARY-CONSOLIDATION-MODULE` | Cross-zone consolidator exists |
| `RENDER-EXEC-SUMMARY-RECIPIENT-POPULATED` | No em-dash in Client Name / Site Contact |
| `RENDER-NOT-SPECIFIED-VS-EM-DASH` | "Not Specified" replaces em-dash in all required cells |
| `RENDER-APPENDIX-D-CITATIONS-NONEMPTY` | At least eight distinct citations rendered |
| `RENDER-APPENDIX-D-AUTHORITIES-EXPANDED` | OSHA / NIOSH full names appear |
| `RENDER-APPENDIX-D-ENGINE-VERSION-LAST` | Engine-version line is the final Appendix D entry, references 2.5.0 |
| `RENDER-NO-DATA-LIMITATIONS-SUBSECTION` | No "Data limitations" / "Data Limitations" section heading anywhere |
| `RENDER-BUILDING-SECTION-INLINE-LIMITATIONS` | Building Conditions findings carry inline "Limitations of this finding" |
| `RENDER-EXEC-SUMMARY-FINDINGS-LIMIT` | Cross-zone "Observed in:" suffix appears at least once |
| `RENDER-NO-SYMPTOM-CLUSTER-VERBATIM-DUP` | Symptom-cluster narrative ≤ 3 occurrences |
| `RENDER-INSTRUMENT-FILTERING` | Zero-reading instruments filtered |
| `RENDER-APPENDIX-C-DETERMINISTIC` | Hedging both-ways language gone; "Photo N:" pattern emitted |

The runner is the gate. `npm run accept:v2.5` exits 0 only when
every criterion passes.

## v2.6 — Hypothesis and causal chain engines restored

Engine version: `atmosflow-engine-2.6.0`. v2.6 restores two
foundational reasoning modules that the v2.0 → v2.5 TS rewrite had
left as stub fields (`AssessmentScore.causalChains` and
`AssessmentScore.hypotheses` populated as `[]`). Both engines are
now first-class TypeScript modules under `src/engine/`, wired into
the bridge AND the new public `score()` entry point in
`src/engine/index.ts`. Run `npm run accept:v2.6` to enforce.

### What each engine produces

| Engine | Module | Output | Purpose |
| --- | --- | --- | --- |
| Causal chains | `src/engine/causal-chains.ts` | `CausalChain[]` | Synthesizes findings into reasoned root-cause statements |
| Hypotheses   | `src/engine/hypotheses.ts`    | `Hypothesis[]`  | Suggests sampling methodology to confirm/refute walkthrough patterns |

The two engines are complementary:

- **Causal chains** look at the *findings* the bridge produced and
  ask "what root cause synthesizes this set?" They emit a
  `rootCause` statement, contributing zone IDs, related finding
  IDs, a citation, and a `causationSupported` flag the renderer
  uses to choose between supportive vs. hypothesis closing
  language.
- **Hypotheses** look at the *walkthrough observations* directly
  (legacy zone-data + building-data) and ask "what should be
  measured next?" They emit a list of `SamplingRecommendation`
  entries (parameter / method / rationale), a confidence tier
  derived from the indicator count, and the related finding IDs
  for cross-reference. Hypotheses can fire on a walkthrough alone
  — no measurements required.

### Causal chain rules (six rules; each is a pure function of `(zones, findings)`)

| Rule id | Trigger | Citation |
| --- | --- | --- |
| `chain_inadequate_outdoor_air` | ventilation finding + HVAC airflow finding + complaint finding | ASHRAE 62.1-2022 §6.2 + ASHRAE/ACCA 180-2018 |
| `chain_moisture_microbial` | (mold OR water damage) + amplification-range humidity, OR drain-pan reservoir | ASHRAE Position Document on Mold and Dampness + EPA Mold Remediation |
| `chain_filter_particulate` | filter loading or under-spec class + any indoor PM elevation | ASHRAE 62.1-2022 §6.2.1.4 + ASHRAE Position Document on Filtration |
| `chain_sick_building` | symptoms-resolve-away + at least one high/critical severity finding | NIOSH HHE Program — Building-Related Illness Methodology |
| `chain_data_center_corrosion` | data-center zone + (PM elevation OR corrosive environment) | ISO 14644-1:2015 + ANSI/ISA 71.04-2013 + ASHRAE TC 9.9 |
| `chain_thermal_comfort` | ≥2 thermal/humidity excursions + at least one complaint | ASHRAE 55-2020 §5.3 + AABC/NEBB Total System Balance |

`causationSupported` is set per rule:

- **Rule 1**: true only when at least one related finding has `definitiveConclusionAllowed = true`.
- **Rule 2**: false unless an `evidenceBasis.kind === 'laboratory_speciation'` finding exists in the chain.
- **Rule 3**: true only when `pm_above_naaqs_documented` is present and definitive.
- **Rule 4**: always false — the resolution-away pattern is suggestive, not confirmatory.
- **Rule 5**: always false — the chain points to confirmatory sampling paths, not established conclusions.
- **Rule 6**: always false.

### Hypothesis rules (six rules; each emits a `SamplingRecommendation[]`)

| Hypothesis | Trigger | Sampling recommendations |
| --- | --- | --- |
| Inadequate outdoor-air ventilation | weak supply airflow OR neurological symptoms OR damper compromised | CO₂ peak-occupancy, supply-airflow CFM, OA fraction at AHU |
| Bioaerosol amplification | visible mold OR water damage OR respiratory symptoms OR drain-pan biological growth | Andersen N6 + NIOSH 0800, ASTM D7338 tape lift, qPCR/ERMI bulk |
| VOC source or off-gassing | objectionable odor present + intensity ≥ 3 (or odor without intensity) | EPA TO-17 sorbent tube, NIOSH 2016 DNPH cartridge |
| Particulate amplification or filter failure | visible dust OR HVAC filter loaded | optical PM (DustTrak), ISO 14644-1 particle counts |
| Combustion source / CO infiltration | neurological symptom pattern | continuous CO data-logger (1-min resolution) |
| Atmospheric corrosion (data-center) | data-center zone + corrosion indicator | ANSI/ISA 71.04-2013 Cu+Ag coupons, gaseous contaminant speciation |

Confidence tiering is indicator-count based: 1 indicator →
`qualitative_only`; 2+ independent indicators →
`provisional_screening_level`; 0 indicators → hypothesis is not
emitted at all.

### Wiring — `score()` is the public entry point

`src/engine/index.ts` exports `score(input: AssessmentInput): AssessmentScore`
which:

1. Runs the legacy per-zone scorer (`scoreZone`) and composite
   (`compositeScore`).
2. Maps the legacy shape to an `AssessmentScore` via the bridge
   (`legacyToAssessmentScore`). The bridge invokes both derivers
   internally so direct-bridge callers also get populated arrays.
3. Re-derives causal chains and hypotheses at the public API. The
   recomputation is idempotent (same input → same output); it
   exists so the orchestration is explicit at the engine entry
   point and so callers using a bridge-bypassing path still see
   populated arrays.

### Conditional rendering rule (client report)

The client report renders two new sections between **Zone Findings**
and **Recommendations Register**:

1. **Potential Contributing Factors** — derived from
   `score.causalChains`. Section is omitted entirely (no header,
   no TOC entry) when `causalChains.length === 0`. Each block:
   - Bold chain name
   - Justified description (the synthesized `rootCause`)
   - Bulleted `Related findings:` list using the lead-term + short-
     statement format (NOT the verbatim approved-narrative — that
     would repeat content the reader already saw in Zone Findings)
   - `Affected zones: …` line listing contributing zone names
   - `Source: …` italicized citation source
   - Closing line keyed on `causationSupported`:
     - `true` → "This relationship is supported by direct
       measurement and structured observation."
     - `false` → "This relationship is suggested by the pattern
       of observations and is offered as a hypothesis for further
       investigation."
2. **Recommended Sampling Plan** — derived from `score.hypotheses`.
   Section is omitted entirely when no hypothesis fired. Each
   block:
   - Bold hypothesis name + parenthesized confidence tier in
     italic body voice
   - Bulleted `Basis:` list of the indicator strings that
     triggered the hypothesis
   - Bulleted `Suggested sampling:` list — one bullet per
     `SamplingRecommendation` formatted as
     `<parameter> — <method>. <rationale>`

The section name is **"Potential Contributing Factors"** by
deliberate choice — the working v2.4 placeholder name "Causal
Chain Analysis" was banned because it implies causal language
unconditionally. Acceptance enforces the correct title.

### Internal report — full detail

`InternalReport.hypotheses: Hypothesis[]` (not `ContributingFactor[]`)
and `InternalReport.causalChains: CausalChain[]` carry the
unredacted engine output for the operator dashboard. Confidence
tiers, related finding ids, contributing zone ids, citations, and
the `causationSupported` flag are all surfaced. The internal
report is for operator dashboards; it is never shown to clients.

### Adding a new chain or hypothesis rule

1. Add the rule function to `causal-chains.ts` or `hypotheses.ts`.
   It must be a pure function returning either the matched chain /
   hypothesis or `null`.
2. Append the function reference to the `RULES` array at the
   bottom of the module.
3. Add a dedicated unit test in
   `tests/engine/causal-chains.test.ts` or
   `tests/engine/hypotheses.test.ts` covering: trigger pattern,
   non-trigger pattern, `causationSupported` boundary (chains),
   confidence tier boundary (hypotheses).
4. If the rule introduces new condition types or new walkthrough
   fields, document them and update the integration test fixture.
5. Run `npm run accept:v2.6` to confirm no regression.
