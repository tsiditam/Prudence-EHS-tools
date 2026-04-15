# Section Content-Generation Rules: Building Context + Zone Results

## Section 5: Building and Complaint Context

### Subsection Structure
Separate into labeled blocks:

**A. Building Facts** (from building survey — label "Facility data")
- Building type, year built, renovations
- HVAC system type

**B. Reported HVAC Conditions** (label "Reported by facility representative")
- Last maintenance date
- Filter type/condition
- OA damper status
- Supply airflow
- Building pressure

**C. Complaint Pattern** (label source: "Reported by occupants" or "Reported by facility representative")
- Complaint narrative
- Affected area description
- Severity characterization

**D. Moisture/Water History** (label "Historical information — not independently verified during this assessment" unless observed)
- Water history
- Prior assessments

### Evidence Source Labeling Rule
Every fact in this section MUST be tagged with its source:
- "Observed during assessment" — assessor directly witnessed
- "Reported by facility representative" — told to assessor
- "Reported by occupants" — complaint-based
- "Historical record — not independently verified" — prior reports/records

---

## Section 6: Zone-by-Zone Results

### Per-Zone Structure (in order)

**A. Observed Conditions**
Only include items directly observed or measured. Each bullet must be tagged:
- `[Observation]` — assessor saw/smelled/measured it
- `[Occupant report]` — complaint-based
- `[Facility report]` — told by building staff

Generation rules:
- `z.zc === 'Yes'` → "[Occupant report] Complaints reported: {details}"
- `z.wd !== 'None'` → "[Observation] Water damage: {z.wd}"
- `z.mi !== 'None'` → "[Observation] Mold indicators: {z.mi} — UNCONFIRMED, visual only"
- `z.od !== 'None'` → "[Observation] Odor: {z.od}"
- `z.src_int` → "[Observation] Interior sources: {list}"

**B. Measurement Results**
Table: Parameter | Indoor | Outdoor | Benchmark | Benchmark Type | Notes

Notes column MUST include:
- "Outdoor not recorded" if outdoor value missing
- "Point-in-time reading" for all direct-reading values
- "Screening value — confirmatory sampling recommended" for HCHO and TVOCs

**C. Professional Interpretation**
Write using varied openers (rotate by zone index):
1. "Conditions observed in this zone suggest..."
2. "Assessment data for this zone indicates..."
3. "Field observations and measurements reflect..."
4. "The evaluation of this zone is consistent with..."
5. "Documentation from this zone supports..."

REQUIRED elements in every interpretation:
- State what the data suggests (not what it "proves")
- State confidence level based on data completeness
- State key data gaps
- Identify worst-performing category with score

REQUIRED phrases to use:
- "is consistent with" (not "caused by")
- "suggests" (not "confirms")
- "may indicate" (not "indicates")
- "would warrant follow-up" (not "must be fixed")
- "does not by itself confirm" (when single evidence type)

**D. Contributing Factors**
Split into two groups:
1. "Strongly supported by field evidence" — ≥2 independent evidence types
2. "Possible contributors requiring follow-up" — single evidence type only

**E. Findings Register**
Table columns: Severity | Category | Finding | Evidence Basis | Benchmark | Confidence

Evidence Basis values (from `finding.basis`):
- "Direct-reading measurement"
- "Visual observation"
- "Occupant report"
- "Facility report"
- "Inferred correlation"

Confidence values (from `finding.confidence`):
- "Confirmed" — direct measurement exceeds published limit
- "Directional" — screening value or single observation
- "Preliminary" — inferred from pattern, needs follow-up

**F. Confidence + Missing Data**
- One line: "Confidence: {level}" with qualifier if score < 40
- One line: "Data gaps: {list}" or "No significant data gaps for this zone"

### Photo Documentation
If photos exist for zone, render after Observed Conditions with caption showing field label and timestamp.
