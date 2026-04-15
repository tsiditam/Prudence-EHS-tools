# Section Content-Generation Rules: Pathways, Actions, Sampling, Limitations

## Section 7: Potential IAQ Pathways Requiring Follow-Up

### Renamed from "Causal Chain Analysis"
Title: "Potential IAQ Pathways Requiring Follow-Up"
Intro text: "The following concern pathways were identified through correlation of field observations, instrument data, and occupant reports. These are hypotheses requiring confirmation, not established root-cause determinations."

### Confidence Tiers (renamed from Strong/Moderate/Possible)
- "Higher confidence hypothesis" — ≥3 independent evidence types, no major contradiction
- "Moderate confidence hypothesis" — 2 evidence types
- "Preliminary hypothesis" — 1 evidence type or inferred only

### Per-Pathway Structure
1. **Pathway type** + confidence tier badge
2. **Zone** affected
3. **Statement of concern** (rootCause text)
4. **Evidence supporting pathway** (bullet list)
5. **Evidence gaps / uncertainty** (NEW — bullet list of what's missing)
6. **Recommended follow-up** (NEW — what would confirm or rule out)

### Evidence Gaps Generation Rule
For each pathway type, auto-generate gaps:
- Ventilation: "Outdoor air rate measurement not performed" if no calcVent data; "CO₂ monitoring limited to point-in-time" always
- Moisture/Biological: "Microbial sampling not performed" if no lab data; "Moisture mapping not conducted" if no moisture meter data
- Chemical: "Compound-specific speciation not performed" always for TVOCs; "Sampling duration insufficient for TWA comparison" for direct-reading
- Cross-contamination: "Pressure differential measurement not performed" if no blower door; "Air balancing study not conducted"

---

## Section 8: Recommended Follow-Up Actions

### Split into three tiers:
1. **Immediate corrective actions** (from `recs.imm`)
2. **Near-term investigation actions** (from `recs.eng`)
3. **Monitoring / verification actions** (from `recs.adm` + `recs.mon`)

### Per-Recommendation Table Columns
| Priority | Action | Rationale | Triggering Evidence | Responsible Party | Timing | Action Type |

Action Type values:
- "Corrective" — fix the problem
- "Investigative" — gather more information
- "Confirmatory" — verify a hypothesis or corrective action

### Rationale Generation Rule
For each recommendation, auto-generate a one-sentence rationale linking it to the triggering finding. Example:
- Rec: "Evaluate outdoor air delivery rate..."
- Rationale: "CO₂ levels measured at {value} ppm suggest inadequate ventilation for current occupant load."

### Responsible Party
Default: "Qualified HVAC contractor", "Qualified IH professional", "Facility management", "Remediation contractor" — based on recommendation category.

---

## Section 9: Recommended Sampling Plan

### Per-Sample Table Columns
| Sample Type | Zone | Priority | Purpose | Question to Answer | Why Current Evidence Is Insufficient | Method | Decision Value |

### New Required Fields

**"Question to Answer"** — auto-generate from sample type:
- Bioaerosol: "Is there confirmed microbial amplification in the affected area?"
- Formaldehyde: "Does formaldehyde exposure exceed OSHA PEL under representative conditions?"
- VOC speciation: "What specific compounds are contributing to elevated TVOC readings?"
- Moisture: "What is the extent and severity of moisture intrusion in building materials?"

**"Why Current Evidence Is Insufficient"** — auto-generate:
- Bioaerosol: "Visual observation alone does not confirm microbial growth species or concentration."
- Formaldehyde: "Direct-reading screening value is preliminary and not equivalent to validated TWA sampling."
- VOC speciation: "TVOC readings do not identify individual compounds or enable compound-specific risk assessment."

**"Decision Value"** — what the result tells you:
- Bioaerosol: "Confirms or rules out need for remediation; identifies species for health risk assessment."
- Formaldehyde: "Determines whether OSHA PEL or action level is exceeded under representative conditions."

---

## Section 10: Limitations and Professional Judgment

### Required Limitation Bullets (hardcoded, always include all)
1. Single-event limitation
2. Temporal variability
3. Occupancy variability
4. HVAC variability
5. Direct-reading instrument limitations
6. Visual observation non-confirmatory nature
7. Scoring as prioritization tool, not compliance finding
8. Report supports but does not replace professional judgment
9. Conclusions should be reviewed with building history + follow-up

### Dynamic Limitations (added when applicable)
- If data gaps exist: "Data gaps identified: {list}."
- If no outdoor measurements: "Indoor/outdoor comparison not available for all parameters."
- If no PID used: "Compound-specific screening not performed."

### Closing Statement (always include)
"This report is intended to support — not replace — professional judgment by a qualified industrial hygienist or EHS professional. Conclusions should be interpreted in the context of building history, maintenance records, occupancy patterns, and follow-up investigation findings."

### Reviewer Signoff Block
```
Reviewed by: ________________________
Title/Credentials: ________________________
Date: ________________________
Signature: ________________________
```
