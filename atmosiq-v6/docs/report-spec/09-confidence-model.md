# Confidence Model for Findings and Hypotheses

## Purpose
Every finding, interpretation, and pathway hypothesis must carry an explicit confidence rating. This prevents overclaiming and helps the reviewer understand the strength of each conclusion.

## Finding-Level Confidence

### Three Tiers

| Tier | Label | Criteria | Report Language |
|------|-------|----------|----------------|
| `confirmed` | Confirmed | Direct measurement exceeds a published OEL or REL; instrument calibrated; value unambiguous | "Measurement of {value} exceeds {standard}" |
| `directional` | Directional | Screening measurement suggests concern; point-in-time value; or strong visual observation | "Conditions suggest..." / "Screening data indicates..." |
| `preliminary` | Preliminary | Single data point, occupant report, inferred pattern, or facility-reported information | "Preliminary evidence suggests..." / "Reported conditions may indicate..." |

### Assignment Rules

**Confirmed** — ALL of these must be true:
- Based on calibrated instrument measurement (`basis: measurement`)
- Value exceeds a published OEL or REL (not screening threshold)
- No ambiguity in the reading (not borderline)
- Examples: CO > 50 ppm (OSHA PEL), HCHO > 0.75 ppm (OSHA PEL)

**Directional** — ANY of these:
- Measurement exceeds a screening benchmark (VSB, PHG, ICT, TCC)
- Strong visual observation (visible active leak, visible mold growth)
- ≥2 corroborating evidence types for the same concern
- Examples: CO₂ > 1000 ppm, PM2.5 > 35 µg/m³, visible mold + musty odor

**Preliminary** — ANY of these:
- Single occupant report without corroborating measurement
- Facility-reported information not independently verified
- Inferred pattern from indirect evidence
- Measurement near but not exceeding threshold
- Examples: "occupants report headaches" alone, "maintenance unknown"

## Pathway-Level Confidence

### Three Tiers (renamed from Strong/Moderate/Possible)

| Tier | Label | Criteria |
|------|-------|----------|
| `higher` | Higher confidence hypothesis | ≥3 independent evidence types supporting the pathway AND no major contradictory evidence |
| `moderate` | Moderate confidence hypothesis | 2 independent evidence types |
| `preliminary_hyp` | Preliminary hypothesis | 1 evidence type OR inferred only |

### Evidence Type Independence
Evidence types are independent when they come from different sources:
1. Direct-reading measurement
2. Visual observation
3. Occupant complaint pattern
4. HVAC system condition
5. Building history/moisture record

Two measurements (e.g., CO₂ + temperature) count as ONE evidence type (both are instrument readings). A measurement + a visual observation = 2 independent types.

### Contradiction Check
Before assigning "Higher confidence":
- If any measured parameter CONTRADICTS the pathway, downgrade to "Moderate"
- Example: ventilation deficiency pathway but CO₂ < 700 ppm → contradictory → cap at Moderate

## OSHA-Relevant Conditions Confidence

| Confidence | Label | Criteria |
|------------|-------|----------|
| High | "High" | Has instrument data AND documented complaints AND known HVAC history |
| Medium | "Medium" | ≥2 of the three above |
| Limited | "Limited" | <2 of the three above |

## Implementation in Scoring Engine

```javascript
// Every finding must include confidence
r.push({
  t: 'finding text',
  sev: 'high',
  std: 'ASHRAE 62.1',
  basis: 'measurement',
  confidence: determineConfidence(basis, value, threshold, benchmarkType)
})
```

```javascript
function determineConfidence(basis, value, threshold, benchmarkType) {
  if (basis === 'measurement' && (benchmarkType === 'oel' || benchmarkType === 'rel') && value > threshold) {
    return 'confirmed'
  }
  if (basis === 'measurement' || basis === 'observation') {
    return 'directional'
  }
  return 'preliminary'
}
```

## Implementation in Report Renderer

### Findings Register Table
Must include a "Confidence" column showing the tier for each finding.

### Zone Interpretation
Must reference confidence when discussing key findings:
- Confirmed: "CO measurement of {x} ppm exceeds the OSHA PEL..."
- Directional: "Screening data suggests ventilation adequacy concerns..."
- Preliminary: "Reported complaint pattern may indicate building-related concerns..."

### Pathway Section
Must show confidence tier as a badge/label on each pathway card.

## Prohibited Confidence Claims
- NEVER use "confirmed" for visual-only mold observations
- NEVER use "confirmed" for TVOC readings (not compound-specific)
- NEVER use "confirmed" for occupant reports alone
- NEVER use "higher confidence" for pathways with <3 evidence types
- NEVER claim "confirmed root cause" for any pathway
