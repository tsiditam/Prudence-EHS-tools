# Benchmark Classification Model

## Purpose

The report must NEVER present all benchmarks as carrying equal weight. Each threshold used in scoring and reporting must be classified by type so readers understand its regulatory, health, or investigative significance.

## Benchmark Type Taxonomy

| Type ID | Label | Legal Weight | Definition |
|---------|-------|-------------|------------|
| `oel` | Occupational Exposure Limit | Enforceable | Legally binding workplace exposure standard (OSHA PEL, OSHA AL) |
| `rel` | Recommended Exposure Limit | Advisory | Health-based recommendation from authoritative body (NIOSH REL) |
| `phg` | Public Health Guideline | Advisory | Population-level health guideline (EPA NAAQS, WHO AQG) |
| `vsb` | Ventilation Screening Benchmark | Investigative | Indicator of ventilation adequacy, not contaminant toxicity |
| `tcc` | Thermal Comfort Criterion | Investigative | Comfort evaluation standard, not health standard |
| `ict` | Internal Concern Threshold | Investigative | Platform-defined investigation trigger, not published limit |
| `mci` | Moisture/Condition Indicator | Investigative | Building condition screening criterion |

## Benchmark Registry

Every threshold used by the scoring engine must be registered here:

### Ventilation
| Parameter | Value | Source | Type |
|-----------|-------|--------|------|
| CO₂ outdoor baseline | 420 ppm | ASHRAE 62.1-2025 | `vsb` |
| CO₂ differential | 700 ppm above outdoor | ASHRAE 62.1-2025 | `vsb` |
| CO₂ concern | 1000 ppm | ASHRAE 62.1-2025 | `vsb` |
| CO₂ action | 1500 ppm | ASHRAE 62.1-2025 | `vsb` |

### Contaminants
| Parameter | Value | Source | Type |
|-----------|-------|--------|------|
| PM2.5 EPA | 35 µg/m³ | EPA NAAQS | `phg` |
| PM2.5 WHO | 15 µg/m³ | WHO AQG | `phg` |
| CO OSHA PEL | 50 ppm | 29 CFR 1910.1000 | `oel` |
| CO NIOSH REL | 35 ppm | NIOSH | `rel` |
| HCHO OSHA PEL | 0.75 ppm | 29 CFR 1910.1048 | `oel` |
| HCHO OSHA AL | 0.5 ppm | 29 CFR 1910.1048 | `oel` |
| HCHO NIOSH REL | 0.016 ppm | NIOSH | `rel` |
| TVOCs concern | 500 µg/m³ | AIHA/ACGIH | `ict` |
| TVOCs acute | 3000 µg/m³ | AIHA/ACGIH | `ict` |

### Comfort
| Parameter | Value | Source | Type |
|-----------|-------|--------|------|
| Temp summer range | 67-82°F | ASHRAE 55-2023 | `tcc` |
| Temp summer optimal | 73-79°F | ASHRAE 55-2023 | `tcc` |
| Temp winter range | 68.5-76°F | ASHRAE 55-2023 | `tcc` |
| Temp winter optimal | 68.5-74°F | ASHRAE 55-2023 | `tcc` |
| Relative humidity | 30-60% | ASHRAE 55-2023 | `tcc` |

## Implementation Rules

### In Scoring Engine (`scoring.js`)
Each finding text must include the benchmark type when referencing a threshold:
- OEL: "exceeds OSHA PEL (occupational exposure limit)"
- REL: "exceeds NIOSH REL (recommended exposure limit)"
- PHG: "exceeds EPA NAAQS (public health guideline)"
- VSB: "exceeds ventilation screening threshold (per ASHRAE 62.1)"
- TCC: "outside thermal comfort range (per ASHRAE 55)"
- ICT: "exceeds internal concern threshold"

### In Report Renderer
The benchmark type must appear in:
1. The Standards/Benchmarks table (Section 4) — always
2. The Zone Parameter Results table — in the Reference column
3. The Findings Register — in the Benchmark column

### In QA Rules
QA must flag any finding that references a benchmark without identifying its type. A finding that says "exceeds 35 µg/m³" without specifying "EPA NAAQS (public health guideline)" is a QA failure.

## Prohibited Conflation

The report must NEVER:
- Present a ventilation screening benchmark as an exposure limit
- Present a comfort criterion as a health standard
- Present an internal concern threshold as a regulatory requirement
- Use the word "limit" for non-OEL benchmarks
- Use the word "violation" for any benchmark type other than OEL
