# AtmosFlow Changelog

## Engine v2.8.0 — HVAC equipment-scoped recommendations

**User-visible change**

HVAC actions are now grouped by equipment so a single AHU serving
multiple zones shows one action, not duplicates. Two zones served by
the same AHU produce one drain-pan / filter / OA-damper / comprehensive
HVAC inspection action labeled to the AHU with both zones listed under
"Affects:". Two zones served by different AHUs still produce two
separate actions, one per unit.

**Walkthrough**

A new "HVAC equipment" capture step lives between Quick Start and the
zone walkthrough. Each captured equipment unit (AHU, RTU, FCU, ERV,
MAU, DOAS, VRF indoor, Other) is selectable as "Served by" on each
zone. Zones with no equipment selected (or marked "Unknown") trigger a
single building-scoped fallback action prefixed
"HVAC equipment not yet identified —" instead of duplicating per zone.

**Scope inventory**

| Recommendation | Scope (v2.8.0) | Notes |
|---|---|---|
| Clean drain pan + EPA-registered biocide | Equipment | Was zone — now grouped per AHU/RTU |
| Address drain pan condition immediately | Equipment | Was zone |
| ASHRAE 188 Legionella drain-pan evaluation | Equipment | Was zone |
| Replace air filters (immediate / high) | Equipment | Was zone |
| OA delivery rate + damper position | Equipment | Was zone |
| Comprehensive HVAC inspection | Equipment | Was zone |
| Comprehensive HVAC system assessment (data gap) | Equipment | Was zone |
| Water intrusion / IICRC S500 | Zone | Unchanged — per zone |
| NIOSH IEQ symptom questionnaire | Zone | Unchanged |
| ATSDR occupant risk communication | Zone | Unchanged |
| Temporary relocation feasibility | Zone | Unchanged |
| Re-occupancy / clearance criteria | Zone | Unchanged |
| Portable HEPA in occupied area | Zone | Unchanged |
| Periodic reassessment | Building | Unchanged |
| Preventive HVAC maintenance schedule | Building | Unchanged |

**Backwards compatibility**

Reports finalized prior to v2.8.0 store recommendations as
`{ imm: string[], eng: ..., adm: ..., mon: ... }` (legacy "ZoneName:
text" prefix shape). The renderers (`MobileApp.jsx` Actions tab,
`sections-recommendations.js`, `sections-core.js`,
`generateLegacyPrintHTML`) normalize either shape via
`src/utils/recFormatting.js`, so historic reports continue to render
correctly without re-running the engine.

**Out of scope for this release**

- Cost estimation / pricing
- Equipment-maintenance scheduling / CMMS integration
- Sensor binding to equipment
- Post-finalization REVISED-badge / recipient-notification registry
  (referenced in the v2.8.0 PR spec §6 — confirmed not yet built;
  re-running the engine after adding equipment will simply re-emit
  the action list with equipment grouping but without a revision
  marker until that registry exists)
