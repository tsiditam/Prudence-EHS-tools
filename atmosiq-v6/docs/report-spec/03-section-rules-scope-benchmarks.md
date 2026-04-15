# Section Content-Generation Rules: Scope/Methods + Benchmarks

## Section 3: Assessment Scope and Methods

### Subsection 3a: Assessment Overview
- Reason for assessment (from presurvey)
- Areas assessed (zone names list)
- Activities performed: "Visual inspection, real-time direct-reading instrument measurements, occupant complaint documentation, HVAC system evaluation, and moisture/mold screening."
- What was NOT performed: "Laboratory sampling was not performed unless specifically noted. Destructive investigation (wall cavity access, ceiling removal) was not conducted. Continuous monitoring was not deployed."

### Subsection 3b: Instrumentation
Table columns: Instrument | Identifier | Calibration Status | Parameters Measured

For each instrument entry, pull from:
- `presurvey.ps_inst_iaq` → name
- `presurvey.ps_inst_iaq_serial` → serial
- `presurvey.ps_inst_iaq_cal_status` → calibration
- `presurvey.ps_inst_pid` → PID meter (if present)

### Subsection 3c: Measurement Interpretation Framework

ALWAYS include this exact content (not generated, hardcoded):

```
"The following framework describes how each measured parameter
is used in this assessment:

- CO₂: Ventilation screening indicator. Elevated CO₂ suggests
  inadequate outdoor air delivery relative to occupant load.
  CO₂ is not a toxic contaminant at indoor concentrations and
  should not be interpreted as an exposure hazard.

- Temperature and RH: Thermal comfort and moisture-support
  indicators per ASHRAE 55. Values outside comfort ranges do
  not indicate health hazard but may support occupant complaints
  and moisture-related concerns.

- PM2.5: Screening-level particulate indicator. Point-in-time
  direct readings should be interpreted cautiously. Source
  identification requires additional investigation. Indoor/outdoor
  comparison is necessary for building-attribution.

- TVOCs: Broad screening indicator for volatile organic compounds.
  TVOC readings do not identify specific compounds and cannot be
  used for compound-specific exposure assessment without
  laboratory speciation.

- Formaldehyde: Direct-reading or screening values are preliminary.
  Confirmed exposure assessment requires validated sampling per
  NIOSH 2016 or equivalent method.

- Complaint patterns: Occupant reports support investigation
  prioritization but do not alone establish exposure causation
  or building-relatedness.

All direct-reading measurements in this report are point-in-time
values representing conditions at the moment and location sampled.
They may not represent worst-case, average, or typical conditions."
```

---

## Section 4: Standards, Guidelines, and Benchmark Types

### Table Structure
Columns: Parameter | Benchmark | Source | Benchmark Type | Purpose in Report

### Required Rows

| Parameter | Benchmark | Source | Type | Purpose |
|-----------|-----------|--------|------|---------|
| CO₂ (differential) | Δ700 ppm above outdoor | ASHRAE 62.1-2025 | Ventilation screening benchmark | Indicator of outdoor air adequacy |
| CO₂ (absolute) | 1000 ppm concern / 1500 ppm action | ASHRAE 62.1-2025 | Ventilation screening benchmark | Screening thresholds for ventilation assessment |
| Temperature (summer) | 73-79°F optimal, 67-82°F range | ASHRAE 55-2023 | Thermal comfort criterion | Comfort evaluation, not health standard |
| Temperature (winter) | 68.5-74°F optimal, 68.5-76°F range | ASHRAE 55-2023 | Thermal comfort criterion | Comfort evaluation, not health standard |
| Relative Humidity | 30-60% | ASHRAE 55-2023 | Comfort / moisture indicator | Comfort + mold risk screening |
| PM2.5 (EPA) | 35 µg/m³ (24-hr) | EPA NAAQS | Public health ambient guideline | Screening comparison, not occupational limit |
| PM2.5 (WHO) | 15 µg/m³ | WHO AQG | Public health ambient guideline | More conservative screening benchmark |
| CO (OSHA) | 50 ppm TWA | 29 CFR 1910.1000 | Occupational exposure limit | Regulatory ceiling for workplace |
| CO (NIOSH) | 35 ppm TWA | NIOSH REL | Occupational exposure limit | Recommended exposure limit |
| HCHO (OSHA PEL) | 0.75 ppm TWA | 29 CFR 1910.1048 | Occupational exposure limit | Regulatory limit |
| HCHO (OSHA AL) | 0.5 ppm | 29 CFR 1910.1048 | Occupational exposure limit | Action level trigger |
| HCHO (NIOSH) | 0.016 ppm | NIOSH REL | Occupational exposure limit | Recommended exposure limit |
| TVOCs (concern) | 500 µg/m³ | AIHA/ACGIH | Internal concern threshold | Investigation trigger, not legal limit |
| TVOCs (acute) | 3000 µg/m³ | AIHA/ACGIH | Internal concern threshold | Acute concern trigger |

### Generation Rule
This table is HARDCODED — it does not change per assessment. Always render it in full.

### Required Footnote
```
"Benchmark types carry different legal and technical weight. Occupational
exposure limits are enforceable workplace standards. Public health guidelines
are health-based recommendations. Comfort criteria address thermal acceptability.
Screening benchmarks and internal concern thresholds are investigative triggers
used for prioritization, not compliance determination."
```
