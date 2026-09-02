# RegLens Scoring Methodology
## Technical White Paper

**Prudence Safety & Environmental Consulting, LLC**
**Germantown, Maryland**

**Version 2.1 — September 2026**

*Revision note (2.1): this version corrects the description of three score caps that could never trigger under the deduction schedule, updates the citation registry count, documents the readiness-check model the application actually runs, and records the document-length limit, prompt-injection defenses, and structured-output constraint added in September 2026.*

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
- **Output constraints**: 0–8 findings and 0–4 strengths per review. An empty findings array is a valid result. Earlier versions required a minimum of three findings; that floor was removed because a forced minimum induces findings that are not supported by the document and makes a score of 100 unreachable.
- **Critical rule**: The AI is explicitly prohibited from inventing regulations and must cite specific regulatory sections
- **Output schema**: The Messages API request carries a JSON schema (structured outputs) that constrains the response to the exact finding shape the scoring engine consumes, including the severity and requirement-type enumerations.

### 3.1.1 Untrusted-document handling

The instructions are sent as the system prompt. The document text is sent in the user turn inside `<document>` tags with an explicit statement that the contents are untrusted client data and that any instruction-like text inside them is to be treated as document content. This is the standard mitigation for indirect prompt injection (OWASP Top 10 for LLM Applications, LLM01), where a document could otherwise instruct the model to suppress findings and produce an unearned score of 100.

### 3.1.2 Document length

Up to 120,000 characters (roughly 30,000 tokens, or about 40 pages) of the document are reviewed. Longer documents are truncated and the report is labelled as a partial review on screen and in the exported file. The PDF and DOCX parser accepts files up to 10 MB.

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

After raw deductions are applied, the engine evaluates two floor rules to prevent edge-case scores that would misrepresent compliance posture:

| Rule | Condition | Effect | Rationale |
|------|-----------|--------|-----------|
| Best-practice floor | All findings are Best Practice (no regulatory requirements) | Score cannot go below 60 | Non-regulatory gaps alone should not trigger "High Risk" or "Critical Risk" designations |
| Absolute floor | Always | Score cannot go below 20 | Ensures score remains on a meaningful scale |

When a floor is triggered, the adjustment is logged in the score breakdown shown to the user.

**Properties guaranteed by the schedule itself.** Version 2.0 of this document listed three additional rules. They remain in the engine for defense in depth but are mathematically unreachable, so they are no longer presented as active safeguards:

| Former rule | Why it cannot trigger |
|-------------|-----------------------|
| ≥ 3 critical findings capped at 80 | Three critical findings already deduct 29 points, so the score is at most 71 |
| ≥ 5 critical findings capped at 70 | Five critical findings deduct 47 points, so the score is at most 53 |
| 0 critical and ≤ 2 major floored at 80 | The maximum deduction in that case is 10 (major) + 10 (minor cap) = 20, so the score is already at least 80 |

Because the guarantees hold by construction, a program with three or more critical findings can never rate "Excellent" or "Strong", and a program with no critical findings and at most two major findings can never rate below "Strong". These properties are asserted by the unit tests in `tests/scoring.test.js`.

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

RegLens maintains a curated registry of 90 verified regulatory citations across five regulatory bodies and two consensus-standards bodies (`src/lib/scoring.js`):

| Source | Count | Examples |
|--------|-------|---------|
| OSHA General Industry (29 CFR 1910) | 35 | 1910.134 Respiratory Protection, 1910.147 Lockout/Tagout, 1910.1200 Hazard Communication |
| OSHA Recordkeeping (29 CFR 1904) | 8 | 1904.7 General Recording Criteria, 1904.39 Reporting Fatalities |
| OSHA Construction (29 CFR 1926) | 8 | 1926.501 Fall Protection Duty, 1926.1153 Silica |
| EPA (40 CFR) | 13 | 40 CFR 112 SPCC, 40 CFR 262 Hazardous Waste Generators |
| NRC Radiation (10 CFR) | 5 | 10 CFR 20 Standards for Protection Against Radiation |
| NFPA Standards | 14 | NFPA 70E Electrical Safety, NFPA 101 Life Safety Code |
| ANSI Standards | 7 | ANSI Z87.1 Eye Protection, ANSI Z359.1 Fall Protection |

The registry contains federal regulations and national consensus standards only. State-plan requirements are not verified by the registry; the review prompt asks the model to identify them, and such citations surface as "valid but unverified".

### 5.2 Verification Algorithm

When the AI returns a regulatory citation for a finding, the verification system applies a three-tier check:

**Tier 1 — Exact Match.** The citation is compared directly against the registry. If found, the citation is marked as **verified** and the registry's official title is attached to the finding.

**Tier 2 — Base Section Match.** Subsection parentheticals are stripped (e.g., "29 CFR 1910.134(c)(1)" becomes "29 CFR 1910.134") and the base section is checked against the registry. If found, the citation is marked as **verified**.

**Tier 3 — Format Validation.** If not in the registry, the citation is checked against known regulatory format patterns (e.g., `XX CFR XXXX.XXX` for federal regulations, `ANSI ZXXX.X` for ANSI standards). If the format is valid, the citation is marked as **valid but unverified** — it may be a legitimate citation not yet in the registry.

If a citation fails all three tiers, it is flagged as **unverified** and a warning is logged. This prevents the AI from citing non-existent regulations while allowing legitimate citations that have not yet been added to the registry.

### 5.3 Known limits of registry verification

Tier 3 confirms only that a citation is well-formed, not that the section exists. Empirical work on legal citation generation shows why this matters: Dahl, Magesh, Suzgun and Ho (2024, *Journal of Legal Analysis*) measured hallucinated legal citations in 58–88% of responses to verifiable queries across the models they tested, and Magesh et al. (2025, *Journal of Empirical Legal Studies*) found that retrieval-backed legal research tools still produced hallucinated or mis-grounded citations in 17–33% of responses. RegLens therefore labels every Tier 3 result "Unverified" in the report, and reviewers should treat those citations as leads to confirm against eCFR rather than as established references. Expanding the registry from eCFR bulk data is the planned next step.

---

## 6. Readiness Check Scoring

RegLens includes a separate EHS Readiness Check that uses a different scoring methodology optimized for facility walkthroughs rather than document reviews.

### 6.1 Checklist Structure

A readiness check consists of a universal checklist that applies to every employer plus an industry-specific checklist for the selected industry (12 industries; see Section 3.4). Users may add custom items. Every item carries a citation and a severity classification of **Critical**, **Major**, or **Minor**, assigned when the checklist was authored.

### 6.2 Severity-Weighted Scoring Formula

Each applicable item contributes a weight determined by its severity:

| Severity | Weight |
|----------|--------|
| Critical | 10 |
| Major | 5 |
| Minor | 2 |

```
readiness_score = round( earned_weight / applicable_weight × 100 )
```

- **"Yes"** responses earn the item's full weight
- **"Partial"** responses earn 50% of the item's weight
- **"No"** responses earn zero
- **"N/A"** responses are excluded from both numerator and denominator

The application does not compute a score until every item has been answered. Earlier versions treated an unanswered item as "No", which meant an abandoned walkthrough produced a low score with red flags; the completion requirement removes that failure mode.

### 6.3 Readiness Bands

| Score Range | Band |
|-------------|------|
| 90 – 100 | Excellent |
| 75 – 89 | Good |
| 60 – 74 | Moderate Risk |
| 40 – 59 | High Risk |
| 0 – 39 | Critical Risk |

The readiness check uses five bands rather than the seven used for document reviews because checklist responses are coarser than reviewed findings.

### 6.4 Red Flag Override

Any **Critical** item answered "No" sets `criticalFlag = true` for the whole assessment and lists the item and its citation as a critical reason, regardless of the numeric score. A facility with a missing Emergency Action Plan but strong answers elsewhere is therefore never presented as simply "Good".

### 6.5 Findings

Every item not answered "Yes" or "N/A" becomes a finding. A "Partial" answer on a Critical item is reported as Major, and a "Partial" on a Major or Minor item as Minor; a "No" keeps the item's own severity. Findings are sorted by severity. These findings feed the Corrective Action Plan generator.

### 6.6 Alternate Category Model

The engine also contains a seven-category weighted model (Written Programs 20, Training 20, Inspections 15, Hazard Controls 15, Incident Management 10, Regulatory 10, Recordkeeping 10) with seven designated red-flag questions and a severity × likelihood × regulatory-impact priority score. It is unit tested and available for programmatic use, but the application's readiness check does not currently run it. Version 2.0 of this paper described that model as the readiness methodology; this version documents the model actually in use.

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

Determinism of the scoring function does not make the end-to-end pipeline deterministic. Finding generation is a language-model inference and can vary between runs on the same document; Zheng et al. (2023, NeurIPS) documented run-to-run inconsistency and length bias in model-as-judge settings. The structured-output schema and the removal of the forced minimum finding count reduce that variance but do not eliminate it. The planned mitigation is consensus sampling: run the finding step several times and score only findings that recur in a majority of runs (self-consistency, Wang et al., ICLR 2023). Until a test-retest study is published, users should treat the score as reproducible for a given set of findings, not for a given document.

### 8.2 Transparency
Every point deducted is traceable to a specific finding with a specific severity. Users can view the full score breakdown including starting score, per-severity deductions, caps applied, and final score. No deductions are hidden or aggregated.

### 8.3 Separation of Concerns
AI generates findings; the engine scores them. This separation means scoring methodology can be updated independently of the AI model, and scoring behavior can be validated with unit tests using fixed finding sets.

### 8.4 Regulatory Accuracy
The citation verification registry flags citations that cannot be confirmed. Every citation is checked against 90 known-good entries spanning OSHA, EPA, NRC, NFPA, and ANSI standards; anything outside the registry is labelled "Unverified" in the report (see Section 5.3).

### 8.5 Industry Awareness
The 12-industry × 14-program context matrix produces over 130 industry-specific review contexts, ensuring that a Respiratory Protection review for a laboratory evaluates different hazards than the same program type for a construction site.

### 8.6 Fail-Safe Design
When the AI service is unavailable, RegLens does not generate a score or display any findings. It shows an "Awaiting Review" state with the error, keeps the document text locally so the user can retry without re-uploading, and records the review with a "queued" status. Earlier versions displayed sample findings for the program type in this state; that behaviour was removed because sample findings attached to a real document are easily mistaken for an analysis of it.

---

## 9. Limitations and Disclaimers

- RegLens scores are **advisory only** and do not constitute a compliance certification, legal opinion, or professional audit.
- The AI finding generation depends on the quality and completeness of the uploaded document. Incomplete or heavily redacted documents may produce incomplete findings.
- The scoring engine evaluates only the findings returned by the AI. It does not independently verify the content of the source document.
- Citation verification confirms that a registry entry exists for a reference — it does not confirm that the reference is correctly applied to the specific finding, and citations outside the registry are only format-checked.
- Only the first 120,000 characters of a document are reviewed. Partial reviews are labelled as such.
- No test-retest reliability study has been published for the finding-generation step. Repeated reviews of the same document can differ in the findings returned and therefore in the score.
- Scores should be reviewed by a qualified safety professional before being used for compliance decisions, regulatory submissions, or management reporting.

---

## 10. Contact

**Prudence Safety & Environmental Consulting, LLC**
Germantown, Maryland
info@prudencesafety.com
prudencesafety.com

---

*© 2026 Prudence Safety & Environmental Consulting, LLC. All rights reserved. The scoring methodology, citation verification registry, industry context matrix, and AI prompt architecture described in this document are proprietary trade secrets of Prudence Safety & Environmental Consulting, LLC.*
