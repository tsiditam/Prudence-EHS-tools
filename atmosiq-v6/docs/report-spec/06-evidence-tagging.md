# Evidence Tagging Logic Map

## Evidence Basis Categories

Every finding, observation, and data point in the report MUST be tagged with one of these five evidence basis types:

| Tag | Label in Report | Definition | Examples |
|-----|----------------|------------|----------|
| `measurement` | "Direct-reading measurement" | Assessor recorded a numeric value from a calibrated instrument | CO₂ = 1200 ppm, PM2.5 = 42 µg/m³, Temp = 81°F |
| `observation` | "Visual observation" | Assessor directly saw, smelled, or physically detected | Visible mold, standing water, odor, no airflow, dust |
| `occupant_report` | "Occupant report" | Information from building occupants/complainants | Symptoms, complaint history, thermal discomfort |
| `facility_report` | "Facility report" | Information from building management/maintenance | HVAC maintenance date, filter type, renovation history |
| `inferred` | "Inferred correlation" | Pattern derived from combining multiple data points | Causal pathway connections, symptom-ventilation correlation |

## Tagging Rules by Data Source

### Measurements (basis: `measurement`)
These fields always tag as `measurement`:
- `z.co2`, `z.co2o` — CO₂ indoor/outdoor
- `z.tf`, `z.tfo` — temperature
- `z.rh`, `z.rho` — relative humidity
- `z.pm`, `z.pmo` — PM2.5
- `z.co` — carbon monoxide
- `z.tv`, `z.tvo` — TVOCs
- `z.hc` — formaldehyde

Confidence: `directional` (point-in-time, not TWA)
Exception: if value exceeds OSHA PEL → confidence: `confirmed` (regulatory exceedance)

### Visual Observations (basis: `observation`)
These fields always tag as `observation`:
- `z.wd` — water damage (when not "None")
- `z.mi` — mold indicators (when not "None")
- `z.od` — odor
- `z.vd` — visible dust
- `z.dp` — drain pan condition
- `z.sa` — supply airflow (felt/measured at register)
- `bldg.od` — OA damper position (if physically inspected)
- `bldg.fc` — filter condition (if physically inspected)

Confidence: `directional` (observation without lab confirmation)
Special rule for mold: ALWAYS append "visual only — not confirmed by sampling"

### Occupant Reports (basis: `occupant_report`)
These fields always tag as `occupant_report`:
- `z.zc` — complaints present
- `z.zca` — affected count
- `z.zcs` — symptom types
- `z.sr` — symptom resolution pattern
- `presurvey.ps_complaint_narrative`
- `presurvey.ps_complaint_severity`
- Thermal discomfort when no measured temperature

Confidence: `preliminary` (subjective, not independently verified)

### Facility Reports (basis: `facility_report`)
These fields always tag as `facility_report`:
- `bldg.ba` — year built
- `bldg.rn` — renovation history
- `bldg.ht` — HVAC system type (if not inspected)
- `bldg.hm` — last HVAC maintenance
- `presurvey.ps_water_history`
- `presurvey.ps_prior`

Confidence: `preliminary` (reported, not independently verified)

### Inferred Correlations (basis: `inferred`)
These are NEVER direct data — they are pattern connections:
- Causal chain pathways (all of them)
- Symptom-ventilation correlations
- Complaint clustering analysis
- Cross-contamination pathway inference

Confidence: depends on supporting evidence count:
- ≥3 independent evidence types → `directional`
- 2 types → `preliminary`
- 1 type → `preliminary` with explicit caveat

## Implementation in Scoring Engine

The `scoreZone()` function must attach `basis` and `confidence` to every finding object in the `r[]` array:

```javascript
r.push({
  t: 'CO₂ 1200 ppm — exceeds recognized ventilation threshold',
  sev: 'high',
  std: 'ASHRAE 62.1',
  basis: 'measurement',          // NEW
  confidence: 'directional'      // NEW
})
```

## Implementation in Report Renderer

The Findings Register table must show Evidence Basis and Confidence as columns. The zone interpretation paragraph must reference the evidence basis when discussing key findings.
