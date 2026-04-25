# Data Hall B — Before/After Reference

**Purpose:** Concrete reference for the screening-only remediation pass. Shows the current (overclaiming) output verbatim and the corrected (screening-appropriate) output side by side.

**Source artifact:** `AtmosFlow-Report-Hizinburg_Data_Center___Building_2-6.html`, generated April 25, 2026, AtmosFlow v6.0.0-beta (Engine v2.3).

**Underlying principle being enforced:** AtmosFlow is a screening tool. Walkthrough data identifies risk indicators and produces sampling plans. Walkthrough data never produces definitive regulatory classifications, particle counts, gas-phase classifications, or compliance determinations. Any output that asserts a regulatory state is a defect.

---

## Pattern summary for Claude Code

When refactoring data-center-module outputs for screening-only mode:

1. **Banned verbs in finding text:** *exceeded, classified as, is G[n], measured at Class [n], complies, fails to meet, confirmed, verified.*
2. **Required verbs:** *suggests, indicates, screening indicates, elevated risk of, consistent with, warrants definitive assessment by [method].*
3. **Standard citations get a methodology suffix:** "ANSI/ISA 71.04-2013 (screening)" or "ANSI/ISA 71.04-2013 (definitive — coupon results)" — the engine knows which mode generated the finding and surfaces it.
4. **Critical Override gate:** fires only on definitive-mode inputs. Screening-mode findings drive risk-tier scoring, not override.
5. **Recommendations match findings, not categories:** a G-class risk finding routes to coupon deployment, never to "PM2.5 baseline." A particle finding routes to particle-counter deployment. A suspected outdoor source routes to OA screening + source inventory.
6. **Critical zones auto-populate Immediate-tier actions.** A score below 40 with equipment damage risk language must produce at least notification, installation hold, and visual inspection actions in the 0–48 hour bucket.
7. **Recommendation library has data-center-specific actions.** If the library only contains generic IAQ actions, the data center module will produce mismatched recommendations regardless of how good the findings are.
8. **WHO AQG, EPA NAAQS, OSHA PELs:** apply only to human-occupancy zones (NOC, offices, break rooms, loading dock). Removed from data hall and battery room scoring entirely. Different receptor, different framework.
9. **Outdated program references:** sweep the recommendation library for EPA BASE and similar defunct-program references. Replace with current methodology + appropriate methodological citations.
10. **Causal chain section is mandatory for any Critical or High zone.** Empty section header is worse than no section.

---

## Regression test acceptance criteria

After remediation, regenerate this report with the same input data:

- Zero occurrences of "G[n] — [classification]" as an asserted finding.
- Zero occurrences of "ISO 14644-1 Class [n] exceeded" without particle count data present.
- Zero WHO AQG citations on data hall zones.
- Zero EPA BASE references in recommendations.
- Minimum 3 Immediate-tier recommendations on Data Hall B.
- Coupon deployment recommendation present and correctly scoped (3+ locations, 30-day exposure, lab analysis).
- Particle counter deployment recommendation present and references ISO 14644-1 size thresholds.
- Causal Chain Analysis section populated with hypothesis, observations, confidence, refutation criteria.
- Standards manifest includes: ASHRAE 62.1-2025, ANSI/ISA 71.04-2013, ISO 14644-1:2015, ASHRAE TC 9.9.
