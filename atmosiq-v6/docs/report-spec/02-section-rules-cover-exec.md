# Section Content-Generation Rules: Cover + Executive Summary

## Section 1: Cover Page

### Required Fields
- Report title: "Indoor Air Quality Assessment Report"
- Firm: "Prudence Safety & Environmental Consulting, LLC"
- Site name, address
- Assessment date, report date
- Assessor name and credentials
- Reviewer name (blank until reviewed) with signoff line
- Report ID, version, report profile, report status
- Status label: from `statusLabel(profile, status)` in
  `src/constants/reportLifecycle.js` — "Draft" | "Draft — Pending
  Professional Review" | "In Review" | "Professionally Reviewed" | "Final".
  A SCREENING report shows plain "Draft"/"Final": it never had a
  professional reviewer to be pending on.
- Platform version (small text)
- Statement: profile-dependent. A **screening** report carries the
  limitation statement (`SCREENING_LIMITATION`) — scope stated honestly,
  no claim that the document is unfinished and no compliance
  determination. A **professional / compliance** report carries the
  reviewer's accountability statement once reviewed, and a
  not-yet-reviewed notice before that.
- Distribution: "CONFIDENTIAL — FOR CLIENT USE ONLY"

### Generation Rules
- reportId: auto-generate as `RPT-${timestamp.base36}`
- reportVersion: always "1.0" on first generation
- reportStatus: always "draft" on generation — only changes via reviewer action
- reviewerName: null until review workflow completes
- Never show "Final" status unless `reviewerSignoff` timestamp exists

---

## Section 2: Executive Summary

### Structure
1. **Scope paragraph** — what was assessed
2. **Key findings paragraph** — what was observed (not diagnosed)
3. **Score context paragraph** — what the score means and does NOT mean
4. **Priority next actions** — short list

### Content-Generation Rules

**Paragraph 1 (Scope):**
```
Template: "An indoor air quality assessment was conducted at {facility}
on {date}, encompassing {zoneCount} zone(s){reason clause}. The assessment
included direct-reading instrument measurements, visual inspection, HVAC
system evaluation, and occupant complaint documentation."

reason clause: if reason exists → " in response to {reason.toLowerCase()}"
              else → ""
```

**Paragraph 2 (Key Findings):**
Must vary by score band AND include worst category:

- Score ≥ 70: "Conditions observed during the assessment are broadly consistent with recognized occupancy standards. The composite score of {score}/100 reflects generally acceptable conditions, with {worstCat} ({worstScore}/{worstMax}) identified as the area most warranting attention."
- Score 50-69: "The assessment identified moderate indoor air quality concerns. The composite score of {score}/100 reflects conditions where {worstCat} ({worstScore}/{worstMax}) represents the primary area of concern. These findings are directional and warrant targeted follow-up."
- Score < 50: "The assessment identified significant indoor air quality concerns across multiple categories. The composite score of {score}/100 reflects conditions that would warrant prioritized investigation and corrective action, with {worstCat} ({worstScore}/{worstMax}) as the most acute concern."

**Paragraph 3 (Score Context) — ALWAYS include:**
```
"The composite score is a structured prioritization tool derived from
deterministic rules applied against published standards. It is not a
standalone compliance determination and should be interpreted in context
with professional judgment, building history, and follow-up findings."
```

**Paragraph 4 (Priority Actions):**
- If immediate recs exist: list first 3 as "Most important next actions:"
- If no immediate recs: "Recommended next steps are detailed in the Follow-Up Actions and Sampling Plan sections."

### Prohibited Language in Executive Summary
- "unsafe", "noncompliant", "OSHA violation"
- "proves", "confirms", "guarantees"
- "root cause" without "potential" or "possible" qualifier
- Any claim of confirmed exposure or confirmed health impact
