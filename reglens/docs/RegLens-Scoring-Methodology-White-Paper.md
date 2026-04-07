# RegLens Scoring Methodology
## Technical White Paper

**Prudence Safety & Environmental Consulting, LLC**
**Germantown, Maryland**

**Version 2.0 — April 2026**

---

## Abstract

RegLens is an AI-assisted regulatory compliance analysis platform that evaluates Environmental Health & Safety (EHS) program documents against federal and state regulations. This white paper describes the deterministic scoring methodology used to produce compliance scores, the citation verification system that validates regulatory references, and the architectural principles that ensure consistency, transparency, and audit defensibility.

RegLens employs a strict separation between AI-powered finding generation and deterministic scoring. The AI identifies compliance gaps and classifies them by severity; the scoring engine applies fixed mathematical rules to compute a final score. The same findings always produce the same score — no randomness, no AI judgment in scoring.

---

## 1. Architecture Overview

RegLens separates the compliance review process into three distinct phases:

**Phase 1 — Document Validation.** Before any AI analysis, the uploaded document undergoes local keyword validation to confirm it matches the selected program type. This prevents wasted API calls and ensures the correct regulatory framework is applied.

**Phase 2 — AI-Powered Finding Generation.** The document text is sent to a large language model (Anthropic Claude) with a structured prompt that instructs it to act as a Certified Safety Professional conducting a compliance review. The AI returns structured findings in JSON format, each classified by severity and regulatory citation.

**Phase 3 — Deterministic Scoring.** The RegLens scoring engine receives the AI-generated findings and computes a compliance score using fixed deduction rules, score caps, and band classifications. This phase contains no AI — it is a pure mathematical function.

This separation ensures that scoring is repeatable and auditable: given the same set of findings, the engine will always produce the identical score.

---

## 2. Document Pre-Validation

Before AI analysis begins, RegLens validates that the uploaded document matches the selected program type using keyword frequency analysis.

### 2.1 Keyword Libraries

Each of the 14 supported program types has a curated keyword library of 10–25 terms specific to that program. For example, the Respiratory Protection program keywords include "respiratory," "fit test," "N95," "PAPR," "SCBA," "1910.134," "medical evaluation," and "breathing zone."

### 2.2 Validation Algorithm

The validator computes a match score by counting how many program-specific keywords appear in the document text:

```
match_score = (matched_keywords / total_keywords) × 100
```

The validator also computes match scores against all 14 program types to detect if the user selected the wrong type.

### 2.3 Decision Thresholds

| Match Score | Outcome |
|-------------|---------|
| < 2 EHS keywords total | Rejected — "Not an EHS document" |
| < 15% match | Rejected — too few relevant keywords |
| < 20% match and another type scores 15+ points higher | Rejected — wrong program type suggested |
| 15–35% match | Accepted with warning — weak match, user may override |
| ≥ 35% match | Accepted — confident match (confidence capped at 98%) |

This pre-validation layer prevents the AI from reviewing non-EHS content (e.g., a marketing brochure uploaded by mistake) and redirects users who selected the wrong program type.

---

## 3. AI Finding Generation

### 3.1 Prompt Architecture

The AI receives a structured prompt that establishes its role, constraints, and output format:

- **Role**: Certified Safety Professional (CSP) conducting a compliance review
- **Regulatory expertise**: OSHA 29 CFR 1910 (General Industry), 1926 (Construction), EPA regulations, ANSI, NFPA, and ACGIH standards
- **Output constraints**: 3–8 findings and 2–4 strengths per review, valid JSON only
- **Critical rule**: The AI is explicitly prohibited from inventing regulations and must cite specific regulatory sections

### 3.2 Severity Classification

The AI classifies each finding into one of three severity levels:

| Severity | Definition | Examples |
|----------|-----------|----------|
| **Critical** | Missing required elements or regulatory non-compliance creating serious safety risk | Missing Emergency Action Plan, no LOTO procedures, absent respiratory fit testing |
| **Major** | Significant gaps in implementation or documentation | Incomplete hazard assessment, outdated training records, missing annual review |
| **Minor** | Small issues, clarity gaps, or best practice improvements | Formatting inconsistencies, missing revision dates, recommended but non-required elements |

### 3.3 Requirement Type Classification

Each finding is classified as one of two requirement types:

- **Regulatory Requirement** — mandated by OSHA, EPA, NRC, or other regulatory authority
- **Best Practice** — advisory improvement recommended by industry standards (ANSI, NFPA, ACGIH) but not legally required

This distinction affects scoring: a document with only best-practice gaps cannot score below 60 (see Section 4.4).

### 3.4 Industry Context Modification

RegLens supports 12 industries, each with a tailored context matrix that modifies the AI's review focus:

| Industry | Key Hazard Focus Areas |
|----------|----------------------|
| Manufacturing | Machine guarding, LOTO, noise, chemical handling, welding, forklifts |
| Construction | Fall protection, excavation, scaffolding, struck-by, silica, lead |
| Healthcare | Bloodborne pathogens, sharps, ergonomics, workplace violence, hazardous drugs |
| Government / Municipal | Public works struck-by, confined space, chlorine/H₂S, code enforcement |
| Warehousing / Logistics | Forklift operations, racking collapse, dock safety, conveyor hazards |
| Food Service / Hospitality | Burns/scalds, knife injuries, slip/fall, chemical cleaners |
| Laboratory | Chemical exposure, fume hood failures, biological agents, compressed gas, radiation |
| Energy / Utilities | Arc flash, high voltage, confined space, trenching, tower work, H₂S |
| Commercial Real Estate | Slip/trip/fall, asbestos, elevators, roof access, fire prevention |
| Automotive / Service Shop | Vehicle lifts, exhaust ventilation, battery acid, welding, compressed air |
| Data Centers | Arc flash (critical), battery hydrogen, electrical contact, LOTO complexity |
| Aviation | Jet blast, propeller/rotor strike, fueling, hangar fire, noise (95–140 dBA) |

Programs are classified as either **broad scope** (Safety & Health Plans, Emergency Action Plans, Fire Prevention Plans) or **narrow scope** (specialized programs like LOTO, Electrical Safety, Respiratory Protection). Broad-scope reviews check universal OSHA requirements across all categories; narrow-scope reviews focus strictly on the relevant program type within the facility's industry.

---

## 4. Deterministic Scoring Engine

### 4.1 Starting Score

Every compliance review begins at **100 points**. Points are deducted based on the severity and quantity of findings identified by the AI.

### 4.2 Deduction Schedule

Deductions follow a diminishing-returns curve: the first findings of each severity carry the highest per-finding penalty, with subsequent findings contributing progressively less.

**Critical Findings:**

| Finding Number | Points Deducted |
|---------------|----------------|
| 1st – 2nd | 10 points each |
| 3rd – 5th | 9 points each |
| 6th and beyond | 8 points each |

**Major Findings:**

| Finding Number | Points Deducted |
|---------------|----------------|
| 1st – 2nd | 5 points each |
| 3rd – 4th | 4 points each |
| 5th and beyond | 3 points each |

**Minor Findings:**

| Finding Number | Points Deducted |
|---------------|----------------|
| 1st – 3rd | 2 points each |
| 4th and beyond | 1 point each |
| **Total cap** | **10 points maximum** |

The diminishing-returns model reflects the reality that the first critical gap in a program represents a more significant compliance risk than the sixth — the marginal risk decreases as the program's fundamental deficiencies are already established.

Minor findings are capped at 10 total deduction points to prevent a large number of minor stylistic or formatting issues from disproportionately affecting the score.

### 4.3 Score Example

A document review that identifies 2 Critical findings, 3 Major findings, and 4 Minor findings:

```
Starting score:                    100
Critical deductions: 10 + 10     = -20
Major deductions: 5 + 5 + 4     = -14
Minor deductions: 2 + 2 + 2 + 1 =  -7
                                 ------
Raw score:                          59
```

### 4.4 Score Caps and Floors

After raw deductions are applied, the engine evaluates a series of cap and floor rules to prevent edge-case scores that would misrepresent compliance posture:

| Rule | Condition | Effect | Rationale |
|------|-----------|--------|-----------|
| Critical ceiling | ≥ 3 critical findings | Score cannot exceed 80 | A program with 3+ critical gaps should not rate as "Excellent" regardless of other strengths |
| Severe critical ceiling | ≥ 5 critical findings | Score cannot exceed 70 | Extensive critical gaps indicate fundamental non-compliance |
| Low-severity floor | 0 critical findings and ≤ 2 major findings | Score cannot go below 80 | Minor issues alone should not push a fundamentally sound program into risk territory |
| Best-practice floor | All findings are Best Practice (no regulatory requirements) | Score cannot go below 60 | Non-regulatory gaps alone should not trigger "High Risk" or "Critical Risk" designations |
| Absolute floor | Always | Score cannot go below 20 | Ensures score remains on a meaningful scale |

These caps and floors are applied in sequence after raw deductions. When a cap or floor is triggered, the adjustment is logged in the score breakdown shown to the user.

### 4.5 Score Bands

The final numeric score maps to one of seven compliance bands:

| Score Range | Band | Interpretation |
|-------------|------|---------------|
| 90 – 100 | Excellent | Program meets or exceeds regulatory requirements with minimal gaps |
| 80 – 89 | Strong | Program is substantially compliant with minor documentation or implementation gaps |
| 75 – 79 | Good | Program addresses most requirements but has notable areas for improvement |
| 70 – 74 | Functional | Program has a framework in place but significant gaps exist |
| 60 – 69 | Moderate Risk | Program has multiple gaps that could result in regulatory findings |
| 40 – 59 | High Risk | Program has serious deficiencies requiring immediate attention |
| 20 – 39 | Critical Risk | Program is fundamentally non-compliant and poses significant regulatory and safety risk |

---

## 5. Citation Verification System

### 5.1 Citation Registry

RegLens maintains a curated registry of 83 verified regulatory citations across five regulatory bodies:

| Source | Count | Examples |
|--------|-------|---------|
| OSHA General Industry (29 CFR 1910) | 32 | 1910.134 Respiratory Protection, 1910.147 Lockout/Tagout, 1910.1200 Hazard Communication |
| OSHA Recordkeeping (29 CFR 1904) | 8 | 1904.7 General Recording Criteria, 1904.39 Reporting Fatalities |
| OSHA Construction (29 CFR 1926) | 8 | 1926.501 Fall Protection Duty, 1926.1153 Silica |
| EPA (40 CFR) | 11 | 40 CFR 112 SPCC, 40 CFR 262 Hazardous Waste Generators |
| NRC Radiation (10 CFR) | 5 | 10 CFR 20 Standards for Protection Against Radiation |
| NFPA Standards | 10 | NFPA 70E Electrical Safety, NFPA 101 Life Safety Code |
| ANSI Standards | 9 | ANSI Z87.1 Eye Protection, ANSI Z359.1 Fall Protection |

### 5.2 Verification Algorithm

When the AI returns a regulatory citation for a finding, the verification system applies a three-tier check:

**Tier 1 — Exact Match.** The citation is compared directly against the registry. If found, the citation is marked as **verified** and the registry's official title is attached to the finding.

**Tier 2 — Base Section Match.** Subsection parentheticals are stripped (e.g., "29 CFR 1910.134(c)(1)" becomes "29 CFR 1910.134") and the base section is checked against the registry. If found, the citation is marked as **verified**.

**Tier 3 — Format Validation.** If not in the registry, the citation is checked against known regulatory format patterns (e.g., `XX CFR XXXX.XXX` for federal regulations, `ANSI ZXXX.X` for ANSI standards). If the format is valid, the citation is marked as **valid but unverified** — it may be a legitimate citation not yet in the registry.

If a citation fails all three tiers, it is flagged as **unverified** and a warning is logged. This prevents the AI from citing non-existent regulations while allowing legitimate citations that have not yet been added to the registry.

---

## 6. Readiness Check Scoring

RegLens includes a separate EHS Readiness Check that uses a different scoring methodology optimized for facility walkthroughs rather than document reviews.

### 6.1 Seven Weighted Categories

The Readiness Check evaluates facilities across seven categories, each with a fixed weight totaling 100 points:

| Category | Weight | Focus Areas |
|----------|--------|-------------|
| Written Programs & Policies | 20 | Safety & Health Plan, EAP, HazCom, LOTO, Respiratory Protection, Fire Prevention, BBP, annual updates |
| Training & Communication | 20 | New employee orientation, HazCom training, high-risk task training, evacuation drills, forklift certification, refresher training, training records |
| Inspections & Audits | 15 | Workplace inspections, fire extinguisher inspections, eyewash/shower inspections, forklift pre-shift inspections, annual audit, corrective action tracking |
| Hazard Controls & PPE | 15 | PPE hazard assessment, appropriate PPE provision, engineering controls hierarchy, machine guards, chemical exposure controls, fall protection |
| Incident Management | 10 | Written reporting procedure, root cause analysis, near-miss reporting, corrective action tracking, fatality/hospitalization notification |
| Regulatory / OSHA Compliance | 10 | OSHA 300 log and 300A posting, OSHA poster display, no open citations, employee record access, multi-employer responsibility |
| Recordkeeping & Documentation | 10 | Training records, SDS accessibility, equipment maintenance records, incident investigation reports, permit archives |

### 6.2 Category Scoring Formula

Within each category, the score is computed from user responses:

```
category_score = (earned_points / applicable_points) × category_weight
```

- **"Yes"** responses earn full points for the question
- **"Partial"** responses earn 50% of the question's points
- **"No"** or unanswered responses earn zero points
- **"N/A"** responses are excluded from both numerator and denominator

The overall readiness score is the sum of all category scores (0–100).

### 6.3 Red Flag Override System

Seven questions are designated as **red flag items** — critical compliance requirements where a "No" response triggers an immediate alert regardless of the overall score:

| Red Flag | Regulation | Significance |
|----------|-----------|-------------|
| Missing Emergency Action Plan | 29 CFR 1910.38 | Required for most employers |
| Missing Hazard Communication Program | 29 CFR 1910.1200 | Required for all employers with hazardous chemicals |
| Missing Lockout/Tagout Program | 29 CFR 1910.147 | Required where employees service equipment with hazardous energy |
| Missing PPE Hazard Assessment | 29 CFR 1910.132(d) | Required before PPE selection |
| Missing High-Risk Task Training | Various | Required for LOTO, confined space, fall protection |
| No Incident Reporting Process | 29 CFR 1904.29 | Required for OSHA recordkeeping |
| Open or Unresolved OSHA Citation | OSHA Act | Indicates active regulatory non-compliance |

A single red flag "No" response sets `criticalFlag = true` for the entire assessment. This prevents a facility with a missing Emergency Action Plan (but strong scores in other areas) from receiving a misleading overall score.

### 6.4 Finding Priority Scoring

Individual readiness check findings are prioritized using a three-factor multiplication:

```
priority_score = severity × likelihood × regulatory_impact
```

Where:
- **Severity** (1–3): Red flag items = 3, high-point questions = 2, low-point questions = 1
- **Likelihood** (2–3): "No" or "Unknown" = 3, "Partial" = 2
- **Regulatory Impact** (1–3): Red flag or regulatory requirement = 3, regulatory requirement = 2, best practice = 1

| Priority Score | Level |
|---------------|-------|
| 19 – 27 | Critical |
| 10 – 18 | High |
| 4 – 9 | Medium |
| 1 – 3 | Low |

---

## 7. Supported Program Types

RegLens supports compliance reviews for 14 EHS program types:

| Program | Primary Regulation |
|---------|-------------------|
| Safety & Health Plan | OSHA General Duty, 29 CFR 1910/1926 |
| Injury & Illness Reporting | 29 CFR 1904 |
| SDS / Hazard Communication | 29 CFR 1910.1200 |
| Respiratory Protection | 29 CFR 1910.134 |
| SPCC Plan | 40 CFR 112 |
| Lockout/Tagout | 29 CFR 1910.147 |
| Electrical Safety | NFPA 70E, 29 CFR 1910.303–335 |
| Fall Protection Plan | 29 CFR 1910.28/1926.501 |
| Emergency Action Plan | 29 CFR 1910.38 |
| Bloodborne Pathogens | 29 CFR 1910.1030 |
| Hearing Conservation | 29 CFR 1910.95 |
| Fire Prevention Plan | 29 CFR 1910.39, NFPA 10/72/101 |
| Radiation Safety | 10 CFR 19/20/30/35 |
| Confined Space | 29 CFR 1910.146 |

---

## 8. Design Principles

### 8.1 Determinism
The scoring engine is a pure function: `f(findings) → score`. There is no randomness, no model inference, and no state dependency. The same set of findings will always produce the identical score, deduction breakdown, and band classification.

### 8.2 Transparency
Every point deducted is traceable to a specific finding with a specific severity. Users can view the full score breakdown including starting score, per-severity deductions, caps applied, and final score. No deductions are hidden or aggregated.

### 8.3 Separation of Concerns
AI generates findings; the engine scores them. This separation means scoring methodology can be updated independently of the AI model, and scoring behavior can be validated with unit tests using fixed finding sets.

### 8.4 Regulatory Accuracy
The citation verification registry prevents AI hallucination of non-existent regulations. Every citation is checked against 83 known-good entries spanning OSHA, EPA, NRC, NFPA, and ANSI standards.

### 8.5 Industry Awareness
The 12-industry × 14-program context matrix produces over 130 industry-specific review contexts, ensuring that a Respiratory Protection review for a laboratory evaluates different hazards than the same program type for a construction site.

### 8.6 Fail-Safe Design
When the AI service is unavailable, RegLens does not generate a score. Instead, it displays an "Awaiting Review" state and queues the document for retry. This prevents misleading scores from being presented to users when actual analysis has not been performed.

---

## 9. Limitations and Disclaimers

- RegLens scores are **advisory only** and do not constitute a compliance certification, legal opinion, or professional audit.
- The AI finding generation depends on the quality and completeness of the uploaded document. Incomplete or heavily redacted documents may produce incomplete findings.
- The scoring engine evaluates only the findings returned by the AI. It does not independently verify the content of the source document.
- Citation verification confirms that regulatory references exist — it does not confirm that they are correctly applied to the specific finding.
- Scores should be reviewed by a qualified safety professional before being used for compliance decisions, regulatory submissions, or management reporting.

---

## 10. Contact

**Prudence Safety & Environmental Consulting, LLC**
Germantown, Maryland
info@prudencesafety.com
prudencesafety.com

---

*© 2026 Prudence Safety & Environmental Consulting, LLC. All rights reserved. The scoring methodology, citation verification registry, industry context matrix, and AI prompt architecture described in this document are proprietary trade secrets of Prudence Safety & Environmental Consulting, LLC.*
