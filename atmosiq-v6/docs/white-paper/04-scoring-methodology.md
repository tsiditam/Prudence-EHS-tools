# AtmosFlow White Paper — Scoring Methodology

## Design Principles

1. **Deterministic.** Same inputs always produce the same score. No AI, machine learning, or subjective weighting in the scoring path.
2. **Reproducible.** Every deduction rule is documented. A reviewer can hand-calculate the same score from the same data.
3. **Sufficiency-aware.** Missing data produces "Insufficient" — not full credit. The engine fails closed.
4. **Transparent.** Every report includes Appendix B showing the exact category weights, deduction rules, and composite formula.

## Five Categories

| Category | Max Points | Evaluation Basis |
|----------|-----------|-----------------|
| Ventilation | 25 | cfm/person vs ASHRAE 62.1, ACH, CO₂ differential, damper status, airflow |
| Contaminants | 25 | PM2.5 (EPA/WHO), CO (OSHA/NIOSH), HCHO (OSHA/NIOSH), TVOCs, odors, dust |
| HVAC | 20 | Maintenance recency, filter condition/type, airflow, drain pan |
| Complaints | 15 | Complaint presence, affected count, symptom patterns, clustering |
| Environment | 15 | Temperature (ASHRAE 55), humidity, water damage, mold indicators |

## Composite Formula

```
If any zone scores Critical (< 40):
  composite = worst zone score (AIHA worst-zone override)

Otherwise:
  composite = arithmetic mean of all zone scores
```

The AIHA worst-zone override follows the exposure assessment strategy principle (Bullock & Ignacio, 2015): worst-case conditions drive the overall assessment when any zone presents critical risk.

## Risk Bands

| Score | Band | Severity |
|-------|------|----------|
| 80–100 | Low Risk | 1 |
| 60–79 | Moderate | 2 |
| 40–59 | High Risk | 3 |
| 0–39 | Critical | 4 |

A single `getRiskBand()` function is the only source of labels, colors, and severity levels throughout the application. No hardcoded risk labels exist elsewhere.

## Sufficiency Model (v2.3)

Each category declares required and optional inputs. Before scoring, the engine evaluates data sufficiency:

**Ventilation:** Requires CO₂ reading OR cfm/person OR damper status. Without any → INSUFFICIENT.

**Contaminants:** Requires PM2.5 reading AND CO reading. Without both → INSUFFICIENT.

**HVAC:** Requires maintenance history, filter condition, AND supply airflow observation. Min 66% required → INSUFFICIENT.

**Complaints:** Requires complaint status. Single required field → always sufficient if answered.

**Environment:** Requires temperature AND relative humidity. Both required → INSUFFICIENT without.

When a category is INSUFFICIENT:
- Score = null (not zero, not full credit)
- Category excluded from composite calculation
- Composite flagged as `partialComposite: true`
- Confidence downgraded proportionally

Score capping: a category with 60% data sufficiency cannot exceed 60% of its maximum points, regardless of how clean the captured data is.

## Confidence Model

Computed from weighted sufficiency across all categories:

| Sufficiency | Confidence |
|-------------|-----------|
| ≥ 85% | High |
| 60–84% | Medium |
| 30–59% | Low |
| < 30% | Insufficient |

Confidence is a transparency signal. It does NOT modify the composite score.

## Ventilation Hierarchy (v2.0+)

Priority order per ASHRAE 62.1-2022 and Persily (2022):

1. **Primary:** Measured outdoor air delivery (cfm/person) vs ASHRAE 62.1-2022 Table 6.2.2.1 minimum for space type
2. **Secondary:** Air changes per hour (ACH) vs benchmarks (≥4 office, ≥6 healthcare)
3. **Tertiary:** CO₂ screening with inline caveat: "CO₂ is a ventilation effectiveness indicator, not a standalone air quality metric per ASHRAE 62.1-2022."

When cfm/person or ACH data is present, CO₂ becomes confirmatory only. CO₂-only ventilation scoring carries a "Limited Confidence" tag.

## Mold Separation (v2.0+)

Per AIHA *Recognition, Evaluation, and Control of Indoor Mold* (2nd ed., 2020) and IICRC S520, visual mold findings are excluded from the composite score. Mold is assessed in a parallel panel using IICRC S520 Conditions:

- Condition 1: Normal fungal ecology
- Condition 2: Settled spores or contamination, no active growth
- Condition 3: Active growth present

Mold Condition 2 (≥10 sq ft) or Condition 3 triggers mandatory escalation to a qualified remediation professional.

## TVOC Discipline (v2.0+)

TVOC entry requires PID instrument context:
- Lamp energy (10.6 / 11.7 / 9.8 eV)
- Calibration gas reference
- Response factor

Every TVOC finding includes: "TVOC is a screening indicator only. No EPA, NIOSH, or OSHA regulatory limit exists for total VOCs. For compound identification, sorbent tube sampling per NIOSH Method 2549 is required."

## Benchmark Classification

The platform explicitly distinguishes benchmark types:

| Type | Examples | Legal Weight |
|------|----------|-------------|
| Occupational Exposure Limit | OSHA PELs, OSHA Action Levels | Enforceable |
| Recommended Exposure Limit | NIOSH RELs | Advisory |
| Public Health Guideline | EPA NAAQS, WHO AQG | Advisory |
| Ventilation Screening Benchmark | ASHRAE 62.1 CO₂ differential | Investigative |
| Thermal Comfort Criterion | ASHRAE 55 ranges | Investigative |
| Internal Concern Threshold | TVOC 500 µg/m³ | Investigative |

The report identifies which type each threshold belongs to, preventing conflation of investigative triggers with enforceable limits.
