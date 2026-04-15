# QA Guardrails That Prevent Overclaiming

## Automated QA Checks

Every generated report must pass these checks before rendering. Failed checks produce warnings in the report output, not silent suppression.

### Rule 1: Forbidden Language
Scan all generated text for prohibited terms:
```
BLOCKED: "proves", "confirms root cause", "definitively caused",
"guarantees", "OSHA violation", "OSHA citation", "noncompliant",
"regulatory breach", "likely citation", "unsafe", "dangerous",
"toxic" (without qualifier), "contaminated" (without qualifier),
"failing" (for HVAC — use "maintenance status suggests"),
"caused by" (without "may be" or "consistent with" qualifier)
```

### Rule 2: Causation Language
Every sentence containing a causal claim must use hedged language:
- ALLOWED: "is consistent with", "suggests", "may indicate", "would warrant follow-up", "available evidence supports", "does not by itself confirm"
- BLOCKED: "caused by", "proves that", "confirms that", "due to" (without qualifier)

### Rule 3: Benchmark Type Labeling
Every threshold reference must include its benchmark type. Flag any finding that says "exceeds {number}" without identifying the benchmark source and type.

### Rule 4: Evidence Basis Requirement
Every finding in the Findings Register must have a non-empty `basis` field. Report generation must fail (with error message) if any finding lacks evidence basis tagging.

### Rule 5: Confidence Requirement
Every finding must have a non-empty `confidence` field. Every pathway must have a confidence tier.

### Rule 6: Score Override Prevention
No section module may modify scores calculated by the scoring engine. The report renders scores as-is. Only the scoring engine produces scores.

### Rule 7: Section Bleed Prevention
No section may reference data that belongs to a different section's domain. The executive summary may not contain zone-level detail. Zone sections may not contain building-level conclusions.

### Rule 8: Mold Confirmation Guard
Any finding referencing mold, microbial growth, or biological contamination from visual observation MUST include the caveat: "visual observation only — not confirmed by sampling."

### Rule 9: Measurement Qualification Guard
Any finding based on direct-reading measurement MUST note that it represents point-in-time conditions. Findings based on screening instruments (PID for TVOCs, direct-reading HCHO) MUST note that confirmatory sampling is recommended.

### Rule 10: Missing Outdoor Baseline Guard
If indoor PM2.5, TVOCs, or CO₂ are reported without corresponding outdoor values, the report MUST note: "Indoor/outdoor comparison not available — building attribution cannot be determined from indoor value alone."

### Rule 11: Complaint-Only Finding Guard
Any finding based solely on occupant reports (no corroborating measurement or observation) MUST carry `confidence: preliminary` and include: "based on occupant report — not independently verified by measurement."

### Rule 12: AI Narrative Disclosure
If any section contains AI-generated text, it MUST include: "This section was generated from deterministic scoring output and requires professional review before external reliance."

### Rule 13: Draft Status Guard
If `reportStatus === 'draft'`, the report MUST display:
- "DRAFT — FOR PROFESSIONAL REVIEW" on every page header
- Cover page status line showing draft status
- Reviewer signoff block must be blank with instruction text

## QA Checklist (Rendered at End of Draft Reports)

When `reportStatus === 'draft'`, append this checklist to the report:

```
INTERNAL QA CHECKLIST — REMOVE BEFORE FINAL ISSUANCE

[ ] All findings distinguish observed vs. reported vs. inferred
[ ] All benchmarks identified by type (OEL, REL, PHG, VSB, TCC, ICT)
[ ] No unsupported causation claims
[ ] Methods and limitations clearly stated
[ ] Scoring rules disclosed and reproducible
[ ] Missing data identified and impact noted
[ ] Mold observations marked as unconfirmed
[ ] Direct-reading values noted as point-in-time
[ ] Pathway hypotheses carry explicit confidence tiers
[ ] Recommendations linked to triggering evidence
[ ] No forbidden language present
[ ] Reviewer signoff block present and blank
```

## Implementation in QA Runner

```javascript
// qa/qaRunner.js — each rule returns { pass, issue }
const QA_RULES = [
  { id: 'forbidden_language', check: checkForbiddenLanguage },
  { id: 'causation_language', check: checkCausationLanguage },
  { id: 'benchmark_labeling', check: checkBenchmarkLabeling },
  { id: 'evidence_basis', check: checkEvidenceBasis },
  { id: 'confidence_tags', check: checkConfidenceTags },
  { id: 'mold_confirmation', check: checkMoldConfirmation },
  { id: 'measurement_qualification', check: checkMeasurementQualification },
  { id: 'outdoor_baseline', check: checkOutdoorBaseline },
  { id: 'complaint_only', check: checkComplaintOnlyFindings },
  { id: 'ai_disclosure', check: checkAIDisclosure },
  { id: 'draft_status', check: checkDraftStatus },
]
```

Each failed check produces a warning appended to the report's QA section, not a silent failure.
