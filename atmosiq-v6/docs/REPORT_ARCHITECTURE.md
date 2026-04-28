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
