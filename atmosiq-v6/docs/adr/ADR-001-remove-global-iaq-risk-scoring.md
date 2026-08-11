# ADR-001 — Remove the global IAQ risk-scoring model

- **Status:** Accepted (Stage 1 implemented)
- **Date:** 2026-08-11
- **Deciders:** Tsidi Tamakloe (BCSP #38426), AtmosFlow engineering
- **Supersedes:** the 2.x 0–100 weighted-category / composite / risk-band model

## Context

AtmosFlow 2.x produced a 0–100 zone and building score and a
Low/Moderate/High/Critical band by combining heterogeneous evidence
(ventilation, contaminants, HVAC condition, occupant complaints, thermal and
moisture conditions) through category weights, point deductions, weighted
averages, and a worst-zone override.

No scientifically validated quantitative risk-assessment model exists for the
general IAQ hazard mixture that this number spanned. A single figure derived
from unlike evidence can average away a significant finding, imply a
building-wide health grade the evidence does not support, and blur the line
between a numerical benchmark comparison and a benchmark exceedance, and between
screening and compliance.

## Decision

For engine version ≥ 3.0, AtmosFlow does **not** compute a global IAQ risk
score. It replaces the numeric layer with a deterministic **Investigation
Decision Framework**: per-finding evidence, data-quality, reference
applicability, interpretation (finding status), evidence strength, confidence
(with reason codes), investigation priority, hypotheses, and next-best actions,
rolled up conservatively into a non-numeric assessment summary.

**AtmosFlow explicitly does not claim that its prior 0–100 composite represented
a validated quantitative health-risk measure.** AtmosFlow 3.0 provides
deterministic investigation decision support through structured findings,
evidence assessment, uncertainty characterization, investigation prioritization,
hypotheses, and recommended next actions.

Generative AI remains outside the technical decision path. Proprietary logic is
labelled "AtmosFlow deterministic investigation methodology" and is not
attributed to external standards bodies unless they prescribe it.

## Consequences

- **Positive:** findings are individually inspectable and defensible; uncertainty
  is preserved rather than averaged; screening vs compliance and comparison vs
  exceedance are structurally enforced (reference-applicability + time-basis
  engines); investigation priority is decoupled from any implied health grade.
- **Cost:** a repository-wide, staged migration touching engine, reports, UI,
  API, database, analytics, AI prompts, tests, and docs (see
  `docs/ATMOSFLOW_3_MIGRATION.md`).
- **Compatibility:** historical (< 3.0) assessments are never reinterpreted;
  they route to the preserved legacy engine by their frozen `engineVersion` and
  are pinned by regression tests. Score columns become nullable/version-scoped,
  not deleted.
- **Risk:** the legacy number is a control signal in ~6 places (worst-zone
  override, contaminant/HVAC caps, confidence caps, summary/report/UI, analytics,
  score-asserting tests). These are re-expressed as escalation/priority rules —
  the items requiring CIH sign-off — not silently dropped.

## Alternatives considered

- **Keep the score, add disclaimers.** Rejected: disclaimers do not fix the
  scientific problem of a non-validated composite implying a health grade.
- **Replace with another single index (stars, 0–10, %).** Rejected explicitly:
  a relabelled score has the same defect.
- **Recalibrate the weights.** Rejected: the issue is combining unlike evidence
  into one figure, not the specific weights.
