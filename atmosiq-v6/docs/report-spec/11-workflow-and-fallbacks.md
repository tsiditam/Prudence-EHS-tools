# Reviewer Signoff, Draft/Final States, and Fallback Behavior

## 8. Reviewer Signoff Workflow

### States
```
generated → draft → reviewed → final
```

### Draft State (default on generation)
- `reportStatus: "draft"`
- Header: "DRAFT — FOR PROFESSIONAL REVIEW"
- Cover: "Draft — Pending Professional Review"
- Reviewer block: blank with instruction text
- QA checklist: appended to report
- Distribution: restricted to internal review

### Reviewed State (after reviewer action)
- `reportStatus: "reviewed"`
- Reviewer fields populated: name, credentials, date, signoff timestamp
- Header: "REVIEWED — PENDING FINAL APPROVAL"
- QA checklist: removed from output
- Report is editable (DOCX) for reviewer markup

### Final State (after reviewer approval)
- `reportStatus: "final"`
- Cover: "Final Reviewed Report"
- Header: firm name only (no draft warning)
- Reviewer signoff block: completed with name, title, date
- Statement removed: "requires review by a qualified professional"
- Statement added: "Reviewed and approved by {reviewerName}, {credentials}"
- QA checklist: not present
- Distribution: cleared for client delivery

### Implementation
```javascript
// In report data object
meta: {
  reportStatus: 'draft',       // 'draft' | 'reviewed' | 'final'
  reviewerName: null,           // set during review
  reviewerCredentials: null,
  reviewerSignoff: null,        // ISO timestamp when signed off
}
```

The app currently does not have a reviewer workflow UI. For now:
- All generated reports are `draft`
- The signoff block renders as blank fields for manual completion
- The status can be changed manually in the DOCX export
- Future: add reviewer login + digital signoff in-app

---

## 9. Draft vs Final Report State Behavior

### Content Differences

| Element | Draft | Final |
|---------|-------|-------|
| Cover status | "Draft — Pending Professional Review" | "Final Reviewed Report" |
| Page header | "DRAFT — FOR PROFESSIONAL REVIEW" | Firm name only |
| Reviewer block | Blank with instructions | Completed |
| QA checklist | Appended | Not present |
| AI narrative disclaimer | Present | Removed (reviewer has approved) |
| Distribution statement | "Internal review only" | "Confidential — for client use only" |
| Software version | Shown in transparency panel | Shown in transparency panel |
| Disclaimer statement | "requires review by qualified professional" | "Reviewed and approved by..." |

### Conditional Rendering Rule
```javascript
if (meta.reportStatus === 'draft') {
  renderDraftHeader()
  renderQAChecklist()
  renderReviewerBlockBlank()
  renderAINarrativeDisclaimer()
} else if (meta.reportStatus === 'final') {
  renderFinalHeader()
  // no QA checklist
  renderReviewerBlockCompleted()
  // no AI disclaimer (reviewer approved content)
}
```

---

## 10. Fallback Behavior When Data Is Missing

### Principle
Missing data must NEVER be silently ignored. Every gap must be:
1. Noted in the relevant section
2. Reflected in confidence ratings
3. Listed in the Limitations section
4. Flagged in the OSHA-relevant conditions gaps

### Field-Level Fallback Rules

| Missing Field | Fallback Behavior |
|---------------|-------------------|
| CO₂ measurement | Use field-indicator scoring; note "CO₂ not measured — ventilation assessment based on field indicators only" |
| Outdoor CO₂ | Default to 420 ppm; note "Outdoor baseline not recorded — using 420 ppm default per ASHRAE 62.1" |
| Temperature | Use occupant comfort report if available; note "Temperature not measured" |
| Outdoor temp | Note "Outdoor baseline not recorded" in parameter table |
| RH measurement | Use occupant humidity report if available; note "RH not measured" |
| PM2.5 | Skip PM2.5 row in parameter table; note "Particulate screening not performed" |
| PM2.5 outdoor | Note "Indoor/outdoor comparison not available — building attribution cannot be determined" |
| CO measurement | Skip CO row; no score impact unless other evidence |
| TVOC measurement | Skip TVOC row; note if sources identified without measurement |
| HCHO measurement | Skip HCHO row |
| PID meter | Note "Compound-specific screening not performed" in limitations |
| HVAC maintenance date | Score as "unknown" (-20 HVAC); note "HVAC maintenance history not available" |
| Complaint data | Score as no complaints (15/15); note "Occupant complaint survey not conducted" only if relevant |
| Zone name | Default to "Zone {index + 1}" |
| Zone area | Note "Zone area not recorded" |
| Occupant count | Note "Occupant count not recorded"; skip calcVent |
| Water history | Note "Water/moisture history not reported" |
| Facility type | Default to "commercial" |
| Photos | Skip photo section for that zone |
| AI narrative | Use template-generated 3-paragraph summary |
| Causal chains | Skip pathway section if no pathways detected; note "No multi-factor concern pathways were identified" |
| Sampling plan | Skip sampling section if empty; note "No additional sampling recommended based on current findings" |
| Recommendations | Should never be empty — at minimum, monitoring rec always generated |

### Confidence Impact of Missing Data

| Missing Data | Confidence Downgrade |
|-------------|---------------------|
| No instrument data at all | OSHA confidence → "Limited"; all findings → "preliminary" |
| No outdoor baselines | Affected findings → cannot exceed "directional" |
| No complaint survey | Complaint-related findings → "preliminary" |
| HVAC maintenance unknown | HVAC findings → "preliminary" |

### Report-Level Fallback
If fewer than 2 of {instrument data, complaints, HVAC history} are available:
- Add to executive summary: "This assessment has significant data gaps that limit the confidence of findings. Results should be considered preliminary pending additional data collection."
- Set overall report confidence label to "Limited"

### Scoring Fallback
The scoring engine MUST always produce a score, even with missing data. Missing data results in default assumptions (documented in Appendix B) and reduced confidence, not suppressed output. The report must explain what defaults were applied.
