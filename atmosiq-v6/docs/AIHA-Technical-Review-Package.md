# AtmosFlow — AIHA Technical Review Package

**Prudence Safety & Environmental Consulting, LLC (PSEC)**
Prepared for peer technical review · Engine `atmosflow-engine-2.9.0` · Standards manifest dated 2026-04-25

---

## How to use this package

This dossier is the reviewer-facing companion to a live AtmosFlow
demonstration. Its ten sections map one-to-one to the review agenda. Every
technical claim below is traceable to a specific file in the `atmosiq-v6`
codebase (the single source of truth), cited inline as `path/to/file`. Where
a number appears, it was either read directly from a constants file or
**produced by running the actual scoring engine** — not estimated. Reviewers
are encouraged to re-run any figure; the engine is deterministic, so the same
inputs always reproduce the same output.

> **Positioning, stated once and enforced everywhere:** AtmosFlow is a
> **screening and documentation tool**. It does not determine regulatory
> compliance, diagnose building problems, confirm root causes, or establish
> exposure causation. It references published standards as **benchmarks**, not
> as enforceable limits. This boundary is architectural, not cosmetic — the
> sections below show where it is enforced in code.

---

## ⚠️ Source-of-truth & accuracy notes (read before presenting)

During preparation, several **documentation-drift** discrepancies were found
between narrative docs and the authoritative code. **Present the code values
below** — a technical reviewer who opens the repo will see these, and the live
product reflects them. The stale narrative sources should be corrected
separately.

| Item | Authoritative value (code) | Stale value still in some docs | Source of truth |
|---|---|---|---|
| Engine version | **2.9.0** | White paper says "v2.3"; README says "2.6.0" | `src/version.js` `ENGINE_VERSION` |
| ASHRAE 62.1 edition | **2025** | White paper manifest says "2022" | `src/constants/standards.js` `STANDARDS_MANIFEST` / `STD.v.ref` |
| Calibration validity window | **365 days** | Standards-corpus text says "270-day gate" (lines 129, 285) | `src/utils/instrumentRegistry.js` `CAL_VALIDITY_DAYS = 365`; `lib/calibration/banner-state.ts` |
| Chat AI closing line | **"AI-assisted response — verify before use."** | AI-audit PDF (June 2026) says "IH Review Required" | `api/_jasper-lint.js` `AI_DISCLAIMER_LINE`; CLAUDE.md |
| Report-issuance on data gaps | **Issues full report + "Limitations on Reliance" warning** | Older docs imply refuse-to-issue / Pre-Assessment Memo substitution | `src/engine/report/client.ts` (override, engine v2.9.0) |
| Composite math | **Priority-weighted mean** (mission-critical zones 1.5×) with worst-zone override | White paper says "arithmetic mean" | `src/engines/scoring.js` `compositeScore()` |
| Audited AI model | **claude-sonnet-4-6** | — | `atmosflow-ai-audit.pdf`; `api/field-assistant.ts` |

None of these change AtmosFlow's methodology or defensibility posture — they
are edition/label lags in secondary documents. The engine itself is internally
consistent.

---

## Section 1 — Technical Review Overview

**Source:** `docs/AtmosFlow-White-Paper-Full.md`; `README.md`; `CLAUDE.md`

### 1.1 What AtmosFlow is

AtmosFlow is a structured indoor air quality (IAQ) assessment **software**
platform. It is *not* sampling hardware — assessors bring their own calibrated
instruments. The platform provides the guided field workflow, a deterministic
scoring engine, causal-hypothesis analysis, and consulting-grade report
generation. It serves two audiences on one engine: credentialed industrial
hygienists (IH mode) and facility managers (FM mode).

### 1.2 What AtmosFlow is *not* (stated in every report)

1. Not a compliance engine — OSHA does not regulate non-industrial IAQ, and
   AtmosFlow claims no compliance determination.
2. Not a diagnostic tool — it flags conditions warranting investigation.
3. Not a substitute for professional evaluation — professional/compliance
   reports are labeled *"Draft — Pending Professional Review"* until a
   credentialed reviewer signs off.
4. Not laboratory analysis, and not a generator of legally binding conclusions.

### 1.3 What reviewers are asked to evaluate

Reviewers are asked to assess **five** things and record findings on the
Section 9 form:

1. **Scientific basis** — Are the referenced standards correctly applied, at
   the correct edition, and correctly classified (enforceable vs. advisory vs.
   investigative)?
2. **Decision logic** — Do the deterministic rules that turn measurements into
   findings reflect defensible IH practice?
3. **Restraint / defensibility** — Does the platform avoid overclaiming
   (causation, compliance, health diagnosis)?
4. **AI governance** — Is the boundary between deterministic logic and
   generative AI sound and enforced?
5. **Deliverable quality** — Is the client report consulting-grade and
   appropriately caveated?

Reviewers are **not** asked to evaluate commercial, pricing, or UI matters.

---

## Section 2 — Technical Basis & Methodology

**Source:** `src/engines/scoring.js`, `sufficiency.js`, `riskBands.js`;
`docs/AtmosFlow-White-Paper-Full.md`

### 2.1 Four design principles (the methodology contract)

| Principle | Meaning | Where enforced |
|---|---|---|
| **Deterministic** | Same inputs → same score. No AI/ML in the scoring path. | `src/engines/scoring.js` (pure functions) |
| **Reproducible** | Every deduction rule is published; a reviewer can hand-calculate the score. | Report Appendix (scoring transparency) |
| **Sufficiency-aware** | Missing data → *Insufficient*, never full credit. The engine fails **closed**. | `src/engines/sufficiency.js` |
| **Transparent** | Category weights, deduction rules, and composite formula appear in the report. | `src/engine/report/*` |

### 2.2 Five scoring categories (default weights)

`ZONE_WEIGHTS.default` in `src/engines/scoring.js`:

| Category | Max pts | Evaluation basis |
|---|---|---|
| Ventilation | 25 | cfm/person vs ASHRAE 62.1-2025 → ACH → CO₂ differential |
| Contaminants | 25 | PM (EPA/WHO), CO (OSHA/NIOSH/EPA), HCHO (OSHA/NIOSH), TVOC (advisory), odor, mold indicators |
| HVAC | 20 | Maintenance recency, filter condition/class, supply airflow, drain-pan hygiene |
| Complaints | 15 | Complaint presence, affected count, resolution pattern, clustering |
| Environment | 15 | Temperature (ASHRAE 55-2023), RH, water damage |

Zone-type profiles re-weight categories where appropriate — e.g. a
`data_hall` zone uses `{Ventilation 15, Contaminants 40, HVAC 30, Complaints 0,
Environment 15}` (equipment-focused), and battery rooms add a parallel H₂
hazard-atmosphere assessment (IEEE 1635 / NFPA 855).

### 2.3 The ventilation hierarchy (a core methodological stance)

`scoreVent()` applies ASHRAE 62.1-2025 in strict priority order:

1. **Primary — measured outdoor-air delivery** (`cfm_person`) vs the space-type
   minimum in `STD.v.oa` (e.g. office = 5 cfm/person).
2. **Secondary — air changes per hour** (`ach`) vs benchmark (≥4 office, ≥6
   healthcare/lab).
3. **Tertiary — CO₂**, used *only as a ventilation-effectiveness surrogate*,
   never as a contaminant limit.

Every CO₂ finding carries the caveat, verbatim from `scoreVent()`:
> *"CO₂ is a ventilation effectiveness indicator, not an air quality
> contaminant. No current ASHRAE standard establishes an indoor CO₂ limit
> (Persily, ASHRAE Journal 2021). The 700 ppm indoor-outdoor differential is a
> sedentary-office bioeffluent perception threshold from a since-removed
> informative appendix."*

When `cfm_person` or `ach` is present, CO₂ becomes confirmatory only. **This is
demonstrated in Section 6, Case 2:** CO₂ of 1500 ppm does not degrade the
ventilation score when measured cfm/person is adequate.

### 2.4 Sufficiency model (fail-closed)

`src/engines/sufficiency.js` declares required/optional inputs per category and
computes sufficiency **before** scoring:

- Category `maxAwardable = round(sufficiency × maxPoints)` — a category with 40%
  of its inputs cannot exceed 40% of its points, regardless of how clean the
  captured readings are.
- A category whose *required* inputs fall below its `minSufficiencyForScoring`
  threshold returns **INSUFFICIENT** (score = `null`), is **excluded** from the
  composite, and flags `partialComposite`.

| Category | Required inputs | Min required-sufficiency |
|---|---|---|
| Ventilation | CO₂ **or** cfm/person (**or** OA damper status) | 0.50 |
| Contaminants | PM2.5 **and** CO | 0.50 |
| HVAC | (none required; optional maintenance + filter) | 0.00 |
| Complaints | Complaint status | 1.00 |
| Environment | Temperature **and** RH | 1.00 |

### 2.5 Composite formula

`compositeScore()` in `src/engines/scoring.js`:

```
If any zone is Critical (score < 40):
    composite = worst zone score          # AIHA worst-zone override
Else:
    composite = priority-weighted mean of scorable zones
                (data_hall ×1.5, battery_room ×1.3, office ×0.8, default ×1.0)
```

The worst-zone override follows the AIHA exposure-assessment strategy principle
(Bullock & Ignacio, 2015): worst-case conditions drive the overall assessment
when any zone presents critical risk. Building confidence is set to the **lowest
zone confidence** — the building cannot claim High confidence if its riskiest
zone was not fully characterized.

### 2.6 Risk bands & confidence (single source of truth)

`RISK_BANDS` and `getConfidenceLevel()` in `src/engines/riskBands.js`:

| Score | Band | Severity |    | Weighted sufficiency | Confidence |
|---|---|---|---|---|---|
| 80–100 | Low Risk | 1 |    | ≥ 0.85 | High |
| 60–79 | Moderate | 2 |    | 0.60–0.84 | Medium |
| 40–59 | High Risk | 3 |    | 0.30–0.59 | Low |
| 0–39 | Critical | 4 |    | < 0.30 | Insufficient |
| `null` | Insufficient Data | 0 |    | | |

**Confidence never modifies the composite score** — it is a transparency signal
about how much weight to place on the number.

### 2.7 Deterministic overrides (safety-critical gates)

| Override | Trigger | Effect | Source |
|---|---|---|---|
| Multiple Contaminant Exceedance | ≥2 Tier-1 contaminants above OSHA PEL (CO **and** HCHO) | Contaminants → 0; zone capped ≤ 39 (Critical) | `scoreCont()` / `scoreZone()` |
| Critical HVAC Condition | No filter, **or** no supply airflow, **or** drain-pan standing water / bio-growth | HVAC capped at 30%; zone capped ≤ 40; confidence capped Medium | `scoreHVAC()` `gate5` |
| Ventilation Confidence Cap | CO₂/field-indicator-only (no cfm, no ACH) | High → Medium confidence | `scoreZone()` |
| Data-hall corrosion screen | Visual/olfactory G3/GX | ANSI/ISA 71.04-2013 *screening* finding; recommends 30-day reactivity coupons | `scoreZone()` |

---

## Section 3 — Reference Register

**Source:** `src/constants/standards.js` (`STANDARDS_MANIFEST`, `STD`);
`src/constants/standards-corpus.js`; `src/engines/contextualStandards.js`

### 3.1 Standards manifest (frozen per assessment)

Every assessment embeds a frozen snapshot of the standard **editions** applied
at scoring time, so a legacy report always displays its original manifest — not
the current one. Authoritative editions (`STANDARDS_MANIFEST`):

| Standard | Edition applied |
|---|---|
| ASHRAE 62.1 (ventilation) | **2025** |
| ASHRAE 55 (thermal comfort) | 2023 |
| OSHA Z-1 PELs | 29 CFR 1910.1000 (current) |
| WHO Air Quality Guidelines | 2021 |
| IICRC S520 (mold remediation) | 2024 |
| NIOSH Pocket Guide RELs | current |
| EPA NAAQS | 2024 |
| WELL Building Standard v2 (advisory reference) | Q3 2024 |
| Mølhave TVOC tiers (advisory only) | 1991 |
| ANSI/ISA 71.04 (gaseous corrosion) | 2013 |
| ISO 14644-1 (cleanroom particle classes) | 2015 |
| ASHRAE TC 9.9 (data-center environmental) | 2011 |
| IEEE 1635 / ASHRAE Guideline 21 (battery ventilation) | current |
| NFPA 855 (energy storage) | 2026 |
| ASHRAE 241 (infectious aerosols — *bibliographic*) | 2023 |
| ACGIH TLVs and BEIs (*bibliographic*) | 2025 |

### 3.2 Numeric thresholds actually used in scoring (`STD`)

These are the exact constants the engine compares against. All are reviewer-verifiable in `src/constants/standards.js`.

**Ventilation (`STD.v`, ASHRAE 62.1-2025):**
- CO₂: baseline outdoor 420 ppm · 700 ppm indoor-outdoor differential (ventilation surrogate) · 1000 ppm screening trigger · 1500 ppm elevated-concern trigger.
- Outdoor-air minimums (people-component cfm/person): office 5 · classroom 15 · healthcare 5 · lab 10 · conference 5 · data_center 5 · gymnasium 20 · retail 7.5. (Full table incl. area component `ps` in source.)

**Contaminants (`STD.c`):**
| Analyte | Values | Classification |
|---|---|---|
| CO | OSHA PEL 50 ppm · NIOSH REL 35 · EPA NAAQS 9 · WELL 9 | Enforceable / advisory |
| Formaldehyde | OSHA PEL 0.75 ppm · Action Level 0.5 · NIOSH REL 0.016 · EPA RfC 0.008 · WHO 0.081 | Enforceable / advisory |
| PM2.5 | EPA 24-hr 35 µg/m³ · WHO 24-hr 15 · EPA annual 9 · WHO annual 5 · WELL 15 | Public-health guideline |
| PM10 | EPA 24-hr 150 · WHO 24-hr 45 · WHO annual 15 · WELL 50 | Public-health guideline |
| TVOC | Mølhave advisory tier 500 µg/m³ · elevated 3000 · WELL 500 | **Investigative / advisory only** |

**Environment (`STD.t`, ASHRAE 55-2023):** RH acceptable 30–60%; temperature
optimal 73–79 °F summer / 68.5–74 °F winter; acceptable 67–82 °F summer /
68.5–76 °F winter (season chosen by calendar month).

### 3.3 Benchmark-type classification (the defensibility keystone)

Every threshold is tagged by *type* so investigative triggers are never
conflated with enforceable limits (`docs/AtmosFlow-White-Paper-Full.md`,
Scoring Methodology):

| Type | Examples | Legal weight |
|---|---|---|
| Occupational Exposure Limit | OSHA PELs, Action Levels | **Enforceable** |
| Recommended Exposure Limit | NIOSH RELs | Advisory |
| Public Health Guideline | EPA NAAQS, WHO AQG | Advisory |
| Ventilation Screening Benchmark | ASHRAE 62.1 CO₂ differential | Investigative |
| Thermal Comfort Criterion | ASHRAE 55 ranges | Investigative |
| Internal Concern Threshold | TVOC 500 µg/m³ (Mølhave) | Investigative |

### 3.4 Curated standards corpus (32 primary-source chunks)

`src/constants/standards-corpus.js` holds 32 short, individually-cited
reference chunks powering the Field Assistant's retrieval layer. Editorial
policy is strict: every chunk carries a verifiable primary-source citation;
public-domain government text (OSHA CFR, NIOSH, EPA, ATSDR) may be quoted
verbatim; copyrighted third-party documents (ASHRAE, ACGIH, IICRC, Mølhave)
are **paraphrased with section/edition cited, never pasted**. Coverage
includes: OSHA Z-1/Z-2/Action Levels, NIOSH RELs/IDLH, ACGIH TLVs/BEIs, EPA
NAAQS + 2024 PM2.5 revision, ASHRAE 62.1 VRP/IAQP/CO₂-DCV, ASHRAE 241, ASHRAE
55, IICRC S520 conditions + mold sampling strategy, Mølhave 1991 TVOC tiers,
LEED 500 µg/m³ target, EPA TO-15/TO-17, NIOSH NMAM numbering, asbestos PCM/TEM,
IARC groups, SBS vs. BRI, radon, lead RRP, combustion sources, mercury response,
CoC, and screening-vs-compliance methodology.

### 3.5 Methodology-currency layer (references *not* in the scoring path)

`src/engines/contextualStandards.js` surfaces standards a reviewing IH *may
consult* but which are deliberately **not** codified into scoring thresholds
(to keep the deterministic engine stable): ASHRAE 241-2023 ECAi targets; the
2024 EPA annual PM2.5 NAAQS revision to 9 µg/m³ (89 FR 16202 — the engine
scores against the 24-hr 35 µg/m³ standard for spot readings); and the 2025
ACGIH TLVs. Each entry states plainly *what is / is not* in AtmosFlow's
deterministic path.

---

## Section 4 — Decision-Logic Matrix

**Source:** `src/engines/scoring.js`. This is the measurement → finding →
severity mapping. All rules are deterministic and reviewer-reproducible.

### 4.1 Ventilation (`scoreVent`)

| Condition | Score | Severity | Standard |
|---|---|---|---|
| cfm/person < 0.5 × min | 0 | Critical | ASHRAE 62.1-2025 |
| cfm/person < min | 10 | High | ASHRAE 62.1-2025 |
| cfm/person = min (area component not captured) | 20 | Medium | ASHRAE 62.1-2025 |
| cfm/person 1.0–1.2 × min | 20 | Medium | ASHRAE 62.1-2025 |
| cfm/person > 1.2 × min | 25 | Pass | ASHRAE 62.1-2025 |
| (fallback) CO₂ > 1500 ppm | 0 | Critical | ASHRAE PD Indoor CO₂ 2022 |
| (fallback) Δ > 700 ppm **or** CO₂ > 1000 | 10 | High | " |
| (fallback) approaching concern | 20 | Medium/Low | " |
| ACH branch | scaled vs ≥4 office / ≥6 healthcare-lab | — | CDC/ASHRAE 170 |

### 4.2 Contaminants (`scoreCont`) — deductions from 25

| Condition | Deduction | Severity | Standard |
|---|---|---|---|
| CO > 50 ppm | −25 | Critical | OSHA PEL |
| CO > 35 ppm | −12 | High | NIOSH REL |
| HCHO > 0.75 ppm | −25 | Critical | 29 CFR 1910.1048 |
| HCHO > 0.5 ppm (Action Level) | −12 | High | 29 CFR 1910.1048 |
| HCHO > 0.016 ppm (NIOSH ceiling; *explicitly "not a violation"*) | −6 | Medium | NIOSH REL |
| PM2.5 > 35 µg/m³ | −8/−12 | High | EPA NAAQS (24-hr) |
| PM2.5 > 15 µg/m³ | −4/−6 | Medium | WHO AQG |
| I/O PM ratio > 2.0 (indoor source) | note | Medium | Chen & Zhao, *Atmos. Environ.* 2011 |
| TVOC > 3000 µg/m³ | −10/−15 | High | Mølhave 1991 (advisory) |
| TVOC > 500 µg/m³ | −5/−7 | Medium | Mølhave 1991 (advisory) |
| Visible mold — extensive / moderate / small | −15 / −10 / −5 | Crit/High/Med | IICRC S520 + EPA Mold Levels |
| **≥2 Tier-1 above OSHA PEL** | contaminants → 0, zone ≤ 39 | Critical | Multiple Contaminant Exceedance |

Every TVOC finding appends the Mølhave advisory disclaimer and a recommendation
to speciate via EPA TO-17; every CO/HCHO finding names the specific standard and,
where relevant, states explicitly that a sub-PEL exceedance "is not a regulatory
violation."

### 4.3 HVAC (`scoreHVAC`) — deductions from 20

| Condition | Effect | Severity |
|---|---|---|
| Maintenance > 12 months | −5 | Medium |
| Maintenance unknown | Data Gap (confidence ↓, **not** scored as deficiency) | Info |
| Filter heavily loaded / bypass | −10 | High |
| No filter installed | −15, `gate5` | Critical |
| No supply airflow | −20, `gate5` | Critical |
| Drain pan standing water / bio-growth | −15, `gate5`; cites ASHRAE 188 Legionella | Critical |
| Any `gate5` fires | HVAC capped at 30% of max; zone capped ≤ 40 | — |

Physical hygiene outweighs administrative documentation gaps by design — an
*unknown* maintenance history reduces **confidence**, not the score.

### 4.4 Complaints (`scoreComp`) & Environment (`scoreEnv`)

- Complaints: >10 or 6–10 affected → 0 (Critical); 3–5 → 5 (High); 1–2 → 10
  (Medium). Symptoms resolving away from building (−3) and in-zone clustering
  are flagged.
- Environment: temperature/RH outside ASHRAE 55-2023 ranges deducts (RH >70 or
  <20 escalates to High); water damage extensive −15 (Critical), active leak −10
  (High), old staining −3 (Low).

### 4.5 Evidence-basis tagging (on every finding)

Findings carry their evidence basis so inferred conclusions are never presented
as confirmed observations (`docs/AtmosFlow-White-Paper-Full.md`, Defensibility):
**direct-reading measurement · visual observation · occupant report · facility
report · inferred correlation.**

---

## Section 5 — AI Governance & Guardrails

**Source:** `atmosflow-ai-audit.pdf`; `api/field-assistant.ts`;
`api/_jasper-lint.js`; `lib/ai-training-consent.ts`; `CLAUDE.md`

### 5.1 The bright line

**Scoring and all findings are 100% deterministic (Sections 2–4). Generative
AI never touches the scoring path.** AI is confined to two roles: (a) drafting
narrative prose from deterministic inputs, and (b) an in-app assistant
("Field Assistant," codename *Jasper*), scoped as a **Defensibility Copilot**.
Model audited: **claude-sonnet-4-6**.

### 5.2 What the AI assistant may do

Seven tools, tiered (per `atmosflow-ai-audit.pdf` §1):

| Tier | Tool | Function |
|---|---|---|
| L2 | `lookup_exposure_limit` | OSHA PEL / NIOSH REL / ACGIH TLV / EPA NAAQS, primary-source cited |
| L2 | `lookup_sampling_method` | NIOSH NMAM / OSHA / EPA TO methods |
| L2 | `lookup_health_effects` | ATSDR / IARC / EPA IRIS endpoints |
| L2 | `list_known_analytes` | Knowledge-base discovery/fallback |
| L3 | `search_standards_corpus` | Deterministic TF-IDF + cosine RAG over the 32 curated chunks |
| L4 | `analyze_photo` | Claude-vision screening; strict screening-only JSON, always stamped `ih_review_required: true` |
| — | `propose_action` | Proposes navigate / add-note as an **Accept/Reject** card; never executes server-side |
| — | `generate_report` | Proposes a DOCX render from the user's own saved templates (token-fill only) |

### 5.3 What the AI may **not** do (hard role-prompt guardrails)

It may not: assign scores or severity · determine compliance · diagnose health
effects · attribute causation · certify safe/unsafe · override the engine or the
calibration gate · mutate records · invent any value, citation, or serial
number. **Tool output is always preferred over recalled values.** RAG is
deliberately lexical TF-IDF (not embeddings) so retrieval is deterministic and
**auditable**.

### 5.4 Separation & provenance enforcement (guarded by tests)

- **DOCX:** `aiProvenanceBanner()` renders *"AI-ASSISTED NARRATIVE — VERIFY
  BEFORE ISSUE"* immediately before any AI-written paragraph, and nothing before
  deterministic prose (`tests/engine/ai-provenance-banner.test.ts`).
- **Chat:** every assistant answer ends with the `AI_DISCLAIMER_LINE`
  — *"AI-assisted response — verify before use."* — enforced by
  `api/_jasper-lint.js`, which rewrites non-conforming output
  (`tests/api/jasper-disclaimer.test.ts`). *(Note: the audit PDF's older wording
  "IH Review Required" was reworded to this line — see accuracy notes.)*
- **Structured answer format** for context-bearing questions: Assessment
  context → Screening interpretation → Recommended next steps → **Defensibility
  note**.

### 5.5 Privacy, data, and bounds

- **AI-training consent is fail-closed** — `lib/ai-training-consent.ts` returns
  `false` on any missing row, query error, or opt-out, so a transient error can
  never sweep a non-consenting user's data into a training export.
- Persisted copies run through `scrubPii`.
- Bounded: max 4 tool rounds/turn, 20-turn history, 4000-char messages, 5
  photos/request; rate-limited 15/min · 150/day (10/day free tier).
- Cost model hardcoded and independently verified against published rates
  (`atmosflow-ai-audit.pdf` §4).

---

## Section 6 — Validation / Test Evidence

**Source:** `tests/engine/` (65 engine test files);
`src/engine/report/cih-validation.ts`; `scripts/acceptance/`. All figures below
were produced by executing `src/engines/scoring.js` directly.

### 6.1 Reproducible known-input → engine-output cases

Each case is a single office zone; only the varied dimension is noted. Reviewers
can reproduce by calling `scoreZone(input, {})`.

| # | Input (Δ from a complete, clean control zone) | Composite | Band | Confidence | Demonstrates |
|---|---|---|---|---|---|
| 1 | Complete clean control | **89** | Low Risk | High | Baseline; full-data zone tops the Low band |
| 2 | CO₂ = 1500 ppm, cfm/person = 20 present | **89** | Low Risk | High | **Ventilation hierarchy — high CO₂ ignored when cfm adequate** |
| 3 | cfm/person = 2 (< office min 5) | **70** | Moderate | High | Primary ventilation metric drives the score |
| 4 | CO = 60 ppm (> OSHA PEL 50) | **69** | Moderate | High | Single Tier-1 exceedance → Contaminants → 0 |
| 5 | HCHO = 0.9 ppm (> OSHA PEL 0.75) | **69** | Moderate | High | Formaldehyde PEL logic |
| 6 | CO 60 **and** HCHO 0.9 | **39** | Critical | High | **Multiple Contaminant Exceedance override → ≤39** |
| 7 | No supply airflow | **40** | High Risk | Medium | Critical HVAC gate caps zone ≤40 & confidence |
| 8 | Drain-pan standing water | **40** | High Risk | Medium | HVAC hygiene gate (ASHRAE 188 cited) |
| 9 | Sparse: CO₂ only (no PM/CO/temp-pair fully) | **53** | High Risk | **Insufficient** | **Fail-closed** — Contaminants/HVAC/Complaints excluded, confidence downgraded |

Two behaviors worth narrating to reviewers: Case 2 is the headline
demonstration that CO₂ is treated as a *ventilation surrogate*, not a limit;
Case 9 shows the fail-closed philosophy — thin data yields lower confidence and
a capped, not inflated, result.

### 6.2 CIH defensibility validation layer (13 post-render check categories)

`src/engine/report/cih-validation.ts`, regression-tested in
`tests/engine/v22-cih-validation.test.ts`. Every rendered client report is
swept before issuance:

| Check | Blocks / warns on |
|---|---|
| §1 | Quantified counts in narrative ("11 conditions warrant attention") |
| §2 | Duplicate findings |
| §5 | Building-section integrity; banned affirmative claims ("No visible deficiencies") |
| §6 | Results/Opinion redundancy |
| §8 | Legacy corrosion "professional judgment / visual-olfactory" phrasing |
| §9 | Recommendation cap (≤ 5 in Executive Summary) |
| §10 | Tone bans + **context-aware** bans |
| §11 | Required statements (methodology disclosure + limitations paragraph) |

**Banned-language examples** (flagged): *"in compliance with," "compliant with,"
"unsafe," "confirmed," "definitively conclude," "will ensure safe air quality,"
"sick building syndrome was identified,"* clinical *"consistent with
[disease]."*
**Allow-listed** (legitimate screening prose): *"consistent with insufficient
outdoor air delivery," "high confidence in the measured CO₂ excursion,"
"before drawing definitive conclusions," "this is not a sick building syndrome
determination."*

### 6.3 Acceptance gates (the "ready to ship" definition of done)

`scripts/acceptance/` — a release cannot ship unless the runner exits 0 against
a freshly rendered canonical fixture:

| Gate | Criteria |
|---|---|
| Production readiness | 23 |
| Pricing rollout | 19 |
| Go-live experience | 21 |
| Engine v2.6 acceptance | 49 baseline + 8 v2.6 |

The full Vitest suite (~1,700 tests across engine, API, components, and lib)
runs on every change; representative engine coverage includes causal-chains,
hypotheses, calibration QA notes, refusal/data-gap triggers, banned-language
parity, citation tracking, and instrument-accuracy propagation.

---

## Section 7 — Example Investigation (Meridian Commerce Tower)

**Source:** `src/constants/demoData.js`. Scores below are **actual engine
output** (`scoreZone` + `compositeScore`), not illustrative.

### 7.1 Intake

- **Site:** Meridian Commerce Tower, 450 Commerce Blvd, Suite 300, Hartford, CT
  (built 1998; central AHU-VAV; building under negative pressure; outdoor-air
  intakes near a parking garage and loading dock).
- **Reason:** Occupant complaint — 12 occupants on the 3rd floor reporting
  persistent headache, fatigue, and eye irritation for ~3 weeks; symptoms worse
  in the afternoon and improving on weekends. HVAC maintenance deferred for
  budget; recurring roof leak over the 3rd-floor NE corner (repaired Oct 2025,
  leaking again Feb 2026).
- **Assessor & instruments:** J. Smith, CIH, CSP · TSI Q-Trak 7575 (SN
  QT-2024-08712, calibrated 2026-01-15, CO₂ ±3% rdg ±50 ppm) · RAE MiniRAE 3000
  PID (bump-tested).
- **Prior history:** 2024 assessment found ventilation deficiencies on floors
  2–4; OA-damper repairs only partially implemented.

### 7.2 Zone measurements (as captured)

| Parameter | 3rd-Floor Open Office | Conference Room B |
|---|---|---|
| CO₂ (indoor / outdoor) | 1180 / 415 ppm (Δ 765) | 1420 / 415 ppm (Δ 1005) |
| Temp / RH | 77 °F / 62% | 79 °F / 68% |
| PM2.5 (indoor / outdoor) | 28 / 12 µg/m³ (I/O 2.33) | 18 µg/m³ |
| CO / TVOC / HCHO | 2 ppm / 680 / 0.022 ppm | 1 ppm / 320 / 0.008 ppm |
| Moisture / mold | Ceiling water staining; suspected discoloration; musty odor | **Active leak**; small mold < 10 sq ft |
| HVAC (shared AHU-1) | Maintenance > 12 mo; MERV-11 heavily loaded; weak airflow; OA damper closed/min; **drain-pan standing water** |

### 7.3 Engine output (verified)

| | 3rd-Floor Open Office | Conference Room B |
|---|---|---|
| Ventilation | 10 / 25 *(capped)* | 10 / 25 *(capped)* |
| Contaminants | 1 / 25 | 11 / 25 |
| HVAC | 0 / 20 | 0 / 20 |
| Complaints | 0 / 15 | 5 / 15 |
| Environment | 8 / 15 | 1 / 15 |
| **Zone score** | **19 — Critical** | **27 — Critical** |
| **Confidence** | Medium | Medium |

**Composite = 19 (Critical), Medium confidence.** Logic:
`worst-zone-override` — because both zones are Critical, the composite equals
the worst zone (19), not the priority-weighted mean (which would be 23). This is
the AIHA worst-zone principle in action.

### 7.4 How the numbers arise (traceable narrative)

- **HVAC → 0 in both zones:** the shared AHU-1 drain pan holds standing water —
  a `gate5` Critical HVAC condition — which caps HVAC at 30% and drags each zone
  ≤ 40, and caps confidence at Medium. The finding cites ASHRAE 188 (Legionella)
  because the building lacks a documented Water Management Program.
- **Ventilation capped at 10:** CO₂ differentials (765 / 1005 ppm) exceed the
  700 ppm surrogate, and because no cfm/person or ACH was captured, ventilation
  is scored from CO₂ only — flagged "Limited Confidence."
- **Contaminants:** the open office's PM2.5 I/O ratio of 2.33 (> 2.0) is flagged
  as a significant indoor particulate source (Chen & Zhao 2011); TVOC 680 µg/m³
  exceeds the Mølhave advisory tier with the standard speciation caveat.
- **Complaints → 0 (open office):** 6–10 affected occupants with a clear
  symptoms-resolve-away-from-building pattern.
- **Escalation:** the active leak + visible mold trigger IICRC S520 / EPA
  mold-level findings and a professional-evaluation recommendation.

### 7.5 What the report tells the client to do

Findings roll up into an equipment-scoped Recommendations Register (a single
AHU-1 action set — drain-pan service, filter replacement, OA-damper repair,
ASHRAE 188 evaluation, comprehensive HVAC inspection) plus a hypothesis-driven
sampling plan (mold air sampling with outdoor reference per IICRC S520/AIHA;
TVOC speciation via TO-17). All framed as screening findings requiring
professional confirmation.

---

## Section 8 — Sample Client Report

**Source:** `docs/sample-iaq-consultant-report.html`;
`docs/REPORT_ARCHITECTURE.md`; `src/engine/report/*`;
`src/constants/reportLifecycle.js`

### 8.1 Structure the client receives

| Section | Content |
|---|---|
| 1.0 Executive Summary | Overall screening opinion (no quantified finding counts) |
| 2.0 Summary of Findings | Consolidated cross-zone findings |
| 3.0 Results at a Glance | Composite + per-zone bands and confidence |
| 4.0 Zone Findings | Per-zone observed conditions, findings, inline limitations |
| 5.0 Recommendations Register | Tiered, equipment/zone-scoped actions |
| 6.0 Limitations & Professional Sign-Off | *Prepared by* + *Reviewed & approved (CIH)* blocks |
| Appendix A | Measurement Tabulation |
| Appendix B | Instrument Calibration |
| Appendix C | Standards & Benchmark Citations (only registered citations) |
| Appendix D | Glossary |

The engine-generated DOCX carries additional appendices (photo documentation,
calibration QA notes with any acknowledgement, and a citation walk).

### 8.2 Report lifecycle — labeling ≠ issuance

`src/constants/reportLifecycle.js`: a report carries a **profile**
(screening | professional | compliance) and a **status** (draft → in_review →
reviewed → final).

- **Professional/compliance** reports are labeled *"Draft — Pending Professional
  Review"* with a blank reviewer sign-off block; a **compliance** report cannot
  be *labeled* Final without a recorded reviewer approval (name, credentials,
  organization, approval ID, date).
- **Screening** reports reach Final without a reviewer (a record of measured
  conditions), carrying a scope-limitation statement and an explicit
  non-compliance-determination note.
- Report **generation is never gated** — any report can be downloaded at any
  time; the constraint is only on what the platform will *assert* (it never
  claims a professional review that has no record).

### 8.3 Defensibility features visible to the client

- Every direct-reading measurement is qualified as a **point-in-time** value.
- Visual mold observations always carry *"visual observation only — not confirmed
  by sampling."*
- Instrument make/model/serial/calibration appears in Scope & Methodology;
  a missing calibration record fires a data-gap trigger that surfaces as a cover
  notice plus a *"Limitations on Reliance — Identified Data Gaps"* section
  (engine v2.9+) — the report still issues, but the gap is disclosed, not hidden.
- Findings derived from instruments not in the accuracy database inherit a
  `qualitative_only` flag that propagates to every rendered output.

---

## Section 9 — Reviewer Comment Form

One row per comment. Please classify each finding by disposition so PSEC can
track resolution. Copy this table (or the CSV block that follows) as needed.

| # | Package section | Location / file cited | Comment type | Severity | Reviewer comment | Recommended change | PSEC disposition |
|---|---|---|---|---|---|---|---|
|  |  |  | ☐ Scientific accuracy ☐ Standard edition/citation ☐ Decision logic ☐ Language/defensibility ☐ AI governance ☐ Report clarity ☐ Editorial |  Critical / Major / Minor / Comment |  |  | Accept / Accept-w-mod / Defer / Decline (+rationale) |

**Comment-type key**
- **Scientific accuracy** — a threshold, rule, or interpretation is technically wrong.
- **Standard edition/citation** — right concept, wrong edition/section/attribution.
- **Decision logic** — the measurement→finding mapping departs from defensible IH practice.
- **Language/defensibility** — over- or under-claiming; restraint concern.
- **AI governance** — a gap in the deterministic/AI boundary or its enforcement.
- **Report clarity** — client-facing comprehension issue.
- **Editorial** — typo/formatting.

**Severity key:** Critical (blocks reliance) · Major (should fix before launch)
· Minor (fix when convenient) · Comment (informational).

```csv
id,section,location,comment_type,severity,comment,recommended_change,disposition
1,,,,,,,
2,,,,,,,
3,,,,,,,
```

---

## Section 10 — Live AtmosFlow Demonstration

Run **after** methodology review so reviewers watch the code execute the logic
they have just evaluated. Suggested flow (~15 min):

1. **Mode & intake (2 min).** Show IH-mode pre-survey: instrument registration,
   calibration date capture, and the 365-day calibration gate (`finishAssessment`
   interrupt requiring a written justification — *note: it records an
   acknowledgement, it does not waive the gap*).
2. **Guided walkthrough (3 min).** Enter the Meridian Commerce Tower open-office
   zone one question at a time; capture CO₂ 1180/415, PM 28/12, the drain-pan
   condition, and the water staining.
3. **Deterministic scoring (3 min).** Show the zone landing at **19 / Critical /
   Medium confidence**, and open the scoring transparency panel — walk one
   category's deductions so reviewers see the published rule reproduce the
   number live. Re-enter the same inputs to show identical output
   (determinism).
4. **Ventilation hierarchy (1 min).** Add a cfm/person reading and show the
   ventilation finding shift from CO₂-surrogate to primary-metric basis.
5. **AI assistant, in bounds (3 min).** Ask Jasper to explain the ASHRAE 62.1
   CO₂ differential and to look up the formaldehyde PEL; show the primary-source
   tool citation, the four-section answer format, and the closing
   *"AI-assisted response — verify before use."* Then ask it to "score this zone"
   or "confirm the cause" and show it **decline** — the guardrail in action.
6. **Report + lifecycle (3 min).** Generate the client report; show the
   *"Draft — Pending Professional Review"* label, the Limitations & Sign-Off
   block, the data-gap "Limitations on Reliance" section, and Appendix C
   citations. Emphasize: report issues, gaps are disclosed, professional
   sign-off is required for reliance.

**Backup:** the demo runs on `src/constants/demoData.js`, so it is fully
reproducible offline if network/live-site access is unavailable.

---

*Prudence Safety & Environmental Consulting, LLC · Germantown, Maryland ·
support@prudenceehs.com. This package was assembled from the `atmosiq-v6`
source of truth; every figure is reproducible from the cited files.*
