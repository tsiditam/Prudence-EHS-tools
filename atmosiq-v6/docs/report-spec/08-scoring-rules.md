# Deterministic Scoring Rule Structure

## Scoring Philosophy
The score is a PRIORITIZATION TOOL, not a compliance determination. It must be reproducible: given identical inputs, any reviewer must arrive at the identical score.

## Composite Formula
```
composite = round(avgZoneScore × 0.6 + worstZoneScore × 0.4)
```
Rationale: prevents a single bad zone from being masked by good zones.

## Risk Bands
| Score | Risk Level |
|-------|-----------|
| 80-100 | Low Risk |
| 60-79 | Moderate |
| 40-59 | High Risk |
| 0-39 | Critical |

## Category 1: Ventilation (Max 25)

### If CO₂ measured:
| Condition | Score | Severity | Finding Text |
|-----------|-------|----------|-------------|
| CO₂ > 1500 ppm | 0 | critical | "CO₂ {v} ppm — exceeds ventilation action level (ASHRAE 62.1 screening benchmark)" |
| CO₂ > 1000 ppm OR Δ > 700 ppm | 10 | high | "CO₂ {v} ppm — exceeds recognized ventilation adequacy threshold (per ASHRAE 62.1)" |
| CO₂ > 800 ppm | 20 | medium | "CO₂ {v} ppm — moderately elevated, ventilation adequacy should be verified" |
| CO₂ ≤ 800 ppm | 25 | pass | "CO₂ within recognized ventilation screening range" |

Outdoor baseline: use measured outdoor value, or default to 420 ppm if not recorded.

### If CO₂ NOT measured (field-indicator fallback):
Count flags: no airflow (3), weak airflow (2), OA damper closed/min/stuck (2), complaints+symptoms (1)
| Flags | Score | Severity |
|-------|-------|----------|
| ≥ 4 | 5 | high |
| ≥ 2 | 12 | medium |
| ≥ 1 | 18 | low |
| 0 | 25 | pass |

## Category 2: Contaminants (Max 25, deduction-based)

Start at 25, subtract deductions (floor at 0):

| Condition | Deduction | Severity | Benchmark Type |
|-----------|-----------|----------|---------------|
| PM2.5 > 35 µg/m³ | -8 (or -12 with outdoor) | high | PHG (EPA NAAQS) |
| PM2.5 > 15 µg/m³ | -4 (or -6 with outdoor) | medium | PHG (WHO AQG) |
| CO > 50 ppm | -25 | critical | OEL (OSHA PEL) |
| CO > 35 ppm | -12 | high | REL (NIOSH) |
| HCHO > 0.75 ppm | -25 | critical | OEL (OSHA PEL) |
| HCHO > 0.5 ppm | -12 | high | OEL (OSHA AL) |
| HCHO > 0.016 ppm | -6 | medium | REL (NIOSH) |
| TVOCs > 3000 µg/m³ | -15 (-10 no outdoor) | high | ICT |
| TVOCs > 500 µg/m³ | -7 (-5 no outdoor) | medium | ICT |
| Mold extensive | -25 | critical | MCI |
| Mold moderate | -15 | high | MCI |
| Mold small | -8 | medium | MCI |
| Mold suspected | -3 | low | MCI |
| Odor strong | -10 | high | observation |
| Odor moderate | -5 | medium | observation |
| Dust airborne/heavy | -5 | medium | observation |

Mold findings MUST append: "⚠ UNCONFIRMED — visual only, pending sampling"

## Category 3: HVAC (Max 20, deduction-based)

Start at 20, subtract deductions (floor at 0):

| Condition | Deduction | Severity |
|-----------|-----------|----------|
| Maintenance > 12 months | -15 | high |
| Maintenance 6-12 months | -5 | low |
| Maintenance unknown | -20 | high |
| Filter heavily loaded/damaged | -5 | medium |
| No filter | -8 | high |
| No supply airflow detected | -8 | critical |
| Drain pan standing water/bio | -5 | medium |

## Category 4: Complaints (Max 15)

| Condition | Score | Severity |
|-----------|-------|----------|
| No complaints | 15 | pass |
| Complaints, 1-2 affected | 10 | medium |
| Complaints, 3-5 affected | 5 | high |
| Complaints, 6+ affected | 0 | critical |
| Symptom resolution pattern | additional -3 | high |

## Category 5: Environment (Max 15, deduction-based)

Start at 15, subtract deductions (floor at 0):

**Temperature (season-aware: May-Sep = summer, Oct-Apr = winter):**
| Condition | Deduction | Severity |
|-----------|-----------|----------|
| Outside ASHRAE 55 range | -5 | high |
| Outside ASHRAE 55 optimal | -2 | low |
| Thermal discomfort (no measurement) | -4 | medium |

**Humidity:**
| Condition | Deduction | Severity |
|-----------|-----------|----------|
| RH < 20% or > 70% | -4 | high |
| RH outside 30-60% | -4 | medium |
| Humidity concern (no measurement) | -3 | medium |

**Water damage:**
| Condition | Deduction | Severity |
|-----------|-----------|----------|
| Extensive damage | -15 | critical |
| Active leak | -10 | high |
| Old staining | -3 | low |

## Appendix B Disclosure Requirement
The report MUST show every rule above in the scoring methodology appendix so any reviewer can reproduce the score from the same facts.
