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
