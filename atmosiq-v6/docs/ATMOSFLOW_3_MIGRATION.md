# AtmosFlow 3.0 — Migration Guide

**Status:** Stage 1 (foundation) landed. Stages 2+ planned.
**Owner sign-off required:** Tsidi Tamakloe (BCSP #38426) on the scientific
decision points marked ⚠️ below.

This document records the migration of AtmosFlow from the 2.x weighted-category
/ composite / risk-band scoring model to the **AtmosFlow 3.0 Investigation
Decision Framework**. See also the Architecture Decision Record:
`docs/adr/ADR-001-remove-global-iaq-risk-scoring.md`.

---

## 1. Why scoring is being removed

The 2.x engine combined heterogeneous evidence — ventilation, contaminants,
HVAC condition, complaints, thermal/moisture — into a single 0–100 zone/building
number and a Low/Moderate/High/Critical band. That number is not a validated
quantitative health-risk measure, and no such validated model exists for the
general IAQ hazard mix it spanned. Combining unlike evidence into one figure
can:

- **average away a significant finding** because unrelated domains are normal;
- imply a **building-wide health grade** the evidence does not support;
- obscure the distinction between a **numerical benchmark comparison** and a
  **benchmark exceedance**, and between **screening** and **compliance**.

AtmosFlow 3.0 instead answers, per finding: what was observed, is the evidence
valid and representative, what reference (if any) applies, how applicable it is,
what finding the evidence supports, how strong that evidence is, how confident
the investigator can be, what hypothesis remains, and what to investigate next.

**AtmosFlow does not claim its prior 0–100 composite represented a validated
quantitative health-risk measure.** 3.0 provides deterministic investigation
decision support, not a risk score.

## 2. What replaces it

The pipeline becomes:

```
EVIDENCE → DATA QUALITY → REFERENCE APPLICABILITY → DOMAIN INTERPRETATION
→ FINDING → EVIDENCE STRENGTH → CONFIDENCE → HYPOTHESIS
→ INVESTIGATION PRIORITY → NEXT-BEST ACTION → PROFESSIONAL REVIEW → REPORT
```

Core objects (all in `lib/investigation/`): `InvestigationFinding`,
`EvidenceItem`, `ReferenceValue` + `ReferenceAssessment`,
`InvestigationHypothesis`, `NextAction`, `AssessmentSummary`. Classification
enums replace the numeric layer: `FindingStatus`, `EvidenceStrength`,
`ConfidenceLevel`, `InvestigationPriority`, `ComparisonApplicability`,
`OelComparisonStatus`. **There is no numeric risk-score field**; internal
integers exist only for deterministic ordering and are never rendered as
meaningful.

Proprietary decision logic is labelled **"AtmosFlow deterministic investigation
methodology"** and is never attributed to AIHA/ASHRAE/OSHA/NIOSH/EPA/WHO/IICRC/
ACGIH/CDC unless that body actually prescribes it.

## 3. Legacy compatibility (non-negotiable)

Engine version routing keys off the assessment's **frozen** `engineVersion`:

```
engineVersion  < 3.0  → legacy scoring engine (src/engines/*, unchanged)
engineVersion >= 3.0  → Investigation Decision Framework
```

`lib/investigation/version.ts` provides `isLegacyEngine()` /
`usesInvestigationFramework()` / `routeForEngineVersion()`. Unknown/unparseable
versions **fail safe to legacy** — the framework never silently reinterprets an
old assessment. The legacy engine is preserved (never deleted while any
historical assessment depends on it); it may only be *moved* into a clearly
named versioned module. Canonical 2.9 outputs are pinned by
`tests/engine/investigation-legacy-preservation.test.ts`.

## 4. Stage plan

Stage 1 is additive and non-breaking (imports nothing from the legacy engine;
typecheck/lint/tests green). Later stages touch the live scoring path and are
sequenced so each is independently shippable and verifiable.

| Stage | Scope | Phases | Status |
|---|---|---|---|
| **1** | Framework core: types, time-basis + reference-applicability engines, evidence-strength/confidence/summary, version routing, legacy pin, docs | 1–2, 4–13, 16–19, 24 (types), 35 | ✅ **Landed** |
| **2** | Reference registry (typed `ReferenceValue` + parity guard); domain rule engines (ventilation, contaminants, moisture/microbial, HVAC, thermal, sources/pathways, occupant) producing `InvestigationFinding[]`; escalation registry; next-best-action generation; zone/building orchestrator + conservative summary | 5, 11, 14–17, 20 | ✅ **Landed** |
| **3** | Version-routed dispatch **spine** (`dispatch.ts`, dependency-injected so `lib/` never imports the sacred engine) + new-assessment engine-version selection (`engineSelection.ts`) + `INVESTIGATION_FRAMEWORK` feature flag, **staged dark** (`INVESTIGATION_KILL_SWITCH = true`, prod stays 2.x). The seam Stages 6–7 call. | 3 | ✅ **Landed (dark)** |
| 6/7 | Consume the dispatch result in the dashboard + report renderer so engine ≥ 3.0 assessments actually render the evidence-based output; lift the kill switch to begin rollout | 18, 21, 22 | Planned |
| 4 | Data model: nullable/version-scoped score columns; persist findings/hypotheses/actions; migrations + rollback | 28 | Planned |
| 5 | API: return domain findings/status/strength/confidence/priority/applicability/hypotheses/gaps/actions/summary; version legacy responses | 29 | Planned |
| 6 | UI: replace score gauges with Assessment Overview + domain cards; legacy-assessment "Engine 2.x" labelling | 21, 35 | Planned |
| 7 | Report: 18-section non-scored structure; per-finding evidence→reference→interpretation→confidence→priority→next-action | 22 | Planned |
| 8 | AI assistant migration: remove score assumptions from prompts; add refusal tests | 23 | Planned |
| 9 | Analytics migration off risk scores to operational metrics | 30 | Planned |
| 10 | Full 30+ validation-case library; expert-concordance framework | 25–26 | Planned |
| 11 | Documentation rewrite + regenerated AIHA Technical Review Package; final stale-reference audit | 27, 31–33 | Planned |
| 12 | Terminology policy enforcement pass (contextual, not global replace) | 27 | Planned |

## 5. Load-bearing decision points — "replace, don't delete"

The 2.x number is a *control signal* (not just a display value) in a small,
identifiable set of places. Each must be **re-expressed**, not removed:

| # | Legacy coupling | Location | 3.0 replacement | Owner review |
|---|---|---|---|---|
| 1 | Worst-zone Critical override | `compositeScore()` | `AssessmentSummary.highestPriority` + escalation | ⚠️ |
| 2 | Multiple-contaminant cap `tot ≤ 39` | `scoreCont()`/`scoreZone()` (`synergistic`) | Escalation rule → `IMMEDIATE_EVALUATION` | ⚠️ |
| 3 | Critical-HVAC caps `tot ≤ 40`, conf → Medium | `scoreHVAC()` (`gate5`) | Escalation rule + confidence reason codes | ⚠️ |
| 4 | Confidence derivation + caps inside scoring | `scoreZone()` | Standalone `deriveConfidence()` (Stage 1) | — |
| 5 | Summary gauge / band | `MobileApp.jsx`, `StatusPill.jsx`, dashboards | Assessment Overview panel (Stage 6) | — |
| 6 | Band tables / point deductions in report | `client-html.js`, DOCX `sections-*` | Domain cards + status/priority (Stage 7) | — |
| 7 | Score persistence + analytics | migration 014, analytics | Nullable/version-scoped + new metrics (Stages 4, 9) | — |
| 8 | ~40 tests asserting exact scores | `tests/engine/*`, `src/__tests__/*` | Migrate to status/priority assertions, or retain as legacy pins | — |

Rows 1–3 encode real IH decisions **as arithmetic** (`Math.min(tot, 39)`); they
are the highest-care items and require CIH sign-off before the legacy path is
unwired for new assessments.

## 6. Removed / new / changed concepts

- **Removed (from new assessments only):** 0–100 zone/building scores, point
  deductions, category weights, weighted averages, risk bands
  (Low/Moderate/High/Critical), score-driven worst-zone override. Not replaced
  by any disguised score (no stars, 0–10, percentages, or hidden pseudo-risk).
- **New:** investigation domains (unweighted), finding status, evidence model,
  evidence strength, confidence + reason codes, investigation priority (≠ health
  severity), reference applicability engine, time-basis validation, OEL
  comparison status, first-class hypotheses, next-best-action engine,
  conservative assessment summary, professional-judgment markers.
- **Terminology:** "Critical" (score band) → `IMMEDIATE_EVALUATION`
  (investigation priority, explicitly not a health-risk grade). "confirmed mold"
  → "visible suspected microbial growth" unless identification is established.
  "exceeded" reserved for supported, time-basis-compatible comparisons.

## 7. Validation approach

- Stage 1: 46 unit tests (`tests/lib/investigation-*`) + legacy regression pin
  (`tests/engine/investigation-legacy-preservation.test.ts`).
- Stage 10: ≥30 canonical cases (including ambiguous/insufficient-information
  cases) with expected findings/strength/applicability/confidence/priority/
  hypotheses/prohibited-conclusions/next-actions; plus an expert-concordance
  schema that measures disagreement transparently (success ≠ "reviewer agrees
  with AtmosFlow").

## 8. Known limitations of Stage 1

Stage 1 is the decision *substrate* only. It does not yet consume live zone
data, emit findings for a real assessment, alter any UI/report/API/DB, or touch
the AI prompts. New assessments still run the 2.x engine until Stage 3 flips the
version-routed dispatch. Nothing in production behaviour changes as of Stage 1.

## 9. Open scientific questions requiring independent CIH/SME determination

These are **not** guessed. Each states the issue, why the repo/source material
doesn't resolve it, what expertise is needed, and the conservative interim
behaviour AtmosFlow uses until resolved.

1. **Escalation thresholds for rows 1–3 above.** The legacy caps encode
   "Critical" as arithmetic. *Unresolved because:* the numeric caps were tuned,
   not derived from a cited protocol. *Needs:* CIH determination of the evidence
   conditions that warrant `IMMEDIATE_EVALUATION` per hazard. *Interim:* preserve
   the legacy trigger conditions verbatim as escalation rules, labelled AtmosFlow
   methodology, `professionalReviewRequired = true`.
2. **CO acute-response escalation.** At what measured CO concentration/duration/
   context should a field session trigger immediate protective action vs. a
   priority follow-up? *Needs:* CIH/emergency-response input. *Interim:* any CO
   numerically above the OSHA PEL → `PRIORITY` + professional review; no
   automatic "immediate danger" language without documented sustained levels.
3. **Formaldehyde reference basis.** Confirm current OSHA PEL/AL, NIOSH REL, and
   public-health references and their averaging bases against primary sources
   before Stage 2 codifies them. *Interim:* carry the 2.x values as
   screening triggers only, never as TWA exceedances from spot readings.
4. **Representativeness criteria per parameter.** What sampling duration /
   temporal coverage makes a measurement "representative" enough for
   `EvidenceStrength.STRONG` for CO₂, PM, CO, HCHO, TVOC? *Needs:* CIH sampling-
   strategy input. *Interim:* `representative` defaults false unless a logger/
   time-series or method-appropriate duration is documented.
5. **OEL sampling-strategy sufficiency.** What documented strategy (HEG design,
   NIOSH method, sample count) flips `samplingStrategySupportsReference` true?
   *Needs:* CIH determination. *Interim:* defaults false — OEL comparisons are
   screening only until a professional confirms strategy sufficiency.
6. **Microbial "suspected growth" vs "growth."** The evidence bar for asserting
   growth (vs suspected) without sampling. *Interim:* visual discoloration →
   "visible suspected microbial growth" only; growth asserted only with
   appropriate identification.

---

*Prudence Safety & Environmental Consulting, LLC. Stage 1 implemented in
`lib/investigation/`; verified by `tests/lib/investigation-*` and
`tests/engine/investigation-legacy-preservation.test.ts`.*
