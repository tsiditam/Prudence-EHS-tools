# AtmosFlow Data Center Module — Gap Analysis

**Date:** 2026-04-25  
**Engine version:** v2.3  
**Analyst:** Claude Code (read-only audit)  
**Status:** Draft — pending product owner review

---

## 1. Executive Summary

### Top 5 Gaps

1. **GAP-01 — Battery room uses IAQ scoring instead of hazard-atmosphere logic (Critical).** The battery room has no H₂ LEL/LFL thresholds, no ventilation sizing math per IEEE 1635, and scores on the same 5-category IAQ model as offices. A battery room with 3% H₂ (75% LEL) would score "Moderate" instead of triggering immediate evacuation.

2. **GAP-02 — Walkthrough implies definitive ISA G-class without coupon data (Critical).** The UI presents G1–GX as a selection the assessor picks, but ANSI/ISA 71.04-2013 G-class requires 30-day passive reactivity coupon deployment. No disclaimer states that walkthrough output is screening only. A report claiming "G3 — Harsh" from a walkthrough misrepresents the standard.

3. **GAP-03 — Six zone types from the standards canon are missing (High).** Generator yard, electrical rooms, chiller plant, loading dock, tape vault, and MMR/network rooms are not implemented. Generator exhaust reaching data hall air intakes — a common critical finding — cannot be documented.

4. **GAP-04 — Single composite score mixes equipment-protection and human-health receptors (High).** A data hall score of 65 and a NOC score of 65 mean completely different things (equipment corrosion risk vs. occupant health concern), but the composite blends them into a single number. Buyers and IH reviewers need parallel receptor-specific scores.

5. **GAP-05 — DC-specific standards missing from STANDARDS_MANIFEST (High).** ANSI/ISA 71.04-2013, ISO 14644-1, ASHRAE TC 9.9, and NFPA 1 are cited in findings but absent from the manifest at `standards.js:13-24`. The report validator would flag cited-but-undisclosed standards.

### Gap Count by Severity

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 8 |
| Medium | 6 |
| Low | 3 |
| **Total** | **19** |

### Headline Recommendation

The data center module has a solid architectural foundation — profile-driven zone taxonomy, equipment-weighted scoring, corrosion/particle overrides, and causal chain analysis. However, two critical gaps (hazard-atmosphere logic for battery rooms and coupon-assessment honesty) must be resolved before the module can withstand IH peer review. The remaining high gaps are addressable with targeted additions to the existing profile system.

---

## 2. Current State Map

### Zone Taxonomy

| Zone ID | Display Label | Category Weights | Priority Weight | Suppressed Fields | Additional Fields | File |
|---------|---------------|-----------------|-----------------|-------------------|-------------------|------|
| `data_hall` | Data Hall / Server Room | V:15 C:40 H:30 Cx:0 E:15 | 1.5× | cx,ac,sy,sr,cc,tc,hp | gaseous_corrosion, dp_temp, iso_class | buildingProfiles.js:12 |
| `noc_office` | NOC / Operations Center | default (V:25 C:25 H:20 Cx:15 E:15) | 1.0× | — | — | buildingProfiles.js:13 |
| `battery_room` | Battery Room | default | 1.3× | tc,hp | h2_monitoring, exhaust_cfm_sqft | buildingProfiles.js:14 |
| `mechanical` | Mechanical Room | default | 0.8× | cx,ac,sy,sr,cc,tc,hp | — | buildingProfiles.js:15 |
| `office` | Office / Administrative | default | 0.8× | — | — | buildingProfiles.js:16 |

### Scoring Flow

```
Zone data → scoreZone() → 5 category scores → zone weights applied →
  sufficiency capping → DC overrides (G3/GX, ISO8) → gate5 cap →
  synergistic cap → confidence calculation → zone score (0-100)
                                                    ↓
All zone scores → compositeScore() → priority-weighted mean or
                                      AIHA worst-zone override → composite (0-100)
```

### Critical Override Conditions (data_hall only)

| Trigger | Threshold | Effect | Standard | File:Line |
|---------|-----------|--------|----------|-----------|
| Gaseous corrosion G3/GX | G3 or GX selected | Score ≤ 39 (Critical) | ANSI/ISA 71.04-2013 | scoring.js:64-68 |
| ISO Class 8 | ISO Class 8 selected | Score ≤ 39 (Critical) | ISO 14644-1:2015 | scoring.js:70-72 |

---

## 3. Reference Standards Canon

*(Reproduced from the gap analysis plan for traceability)*

### Data Hall / White Space / MMR / Network Rooms
- **ANSI/ISA-71.04-2013** — Gaseous corrosion classification (G1/G2/G3/GX) via copper + silver reactivity coupons. G1 target: <300 Å/month copper, <200 Å/month silver.
- **ASHRAE TC 9.9 (2011)** — Gaseous and Particulate Contamination Guidelines for Data Centers.
- **ASHRAE Datacom Series Book 8** — Particulate and Gaseous Contamination in Datacom Environments, 2nd ed., 2014.
- **ASHRAE Datacom Series Book 1** — Thermal Guidelines for Data Processing Environments, current ed.
- **ISO 14644-1** — Cleanroom particulate classification, typical target ISO Class 8.
- **iNEMI Position Statement (2012)** — Limits to avoid creep corrosion on PCBs post-RoHS.

### Battery / UPS Room
- **NFPA 855 (2026 ed.)** — Stationary energy storage system installation. Gas detection, deflagration venting, UL 9540A.
- **IEEE 1635 / ASHRAE Guideline 21** — Ventilation and thermal management of stationary batteries. H₂ evolution math, ventilation sizing.
- **OSHA 29 CFR 1910.178(g)** and **1926.441** — Battery ventilation, electrolyte handling.
- **NFPA 70E Article 320** — Battery room electrical safety.
- **IEEE 1188** (VRLA maintenance), **IEEE 450** (vented lead-acid maintenance).
- H₂ LEL = 4% vol; design ceiling typically 1% (25% LEL); IEEE 1635/ASHRAE 21 sets 2% absolute ceiling.

### Generator Yard / Day-Tank Room
- **OSHA diesel particulate guidance**, **ACGIH TLVs** for diesel exhaust constituents.
- **EPA NAAQS** for property-line PM₂.₅, NO₂, CO.
- **NFPA 110** — Standby and emergency power systems.
- **EPA AP-42** emission factors for generator modeling.

### Electrical Rooms / Switchgear
- **ASHRAE 62.1** if intermittently occupied.
- **SF₆ handling guidance** (legacy gear) — IEC 62271-4 lifecycle management.
- Ozone monitoring near corona-prone equipment.

### Mechanical / Chiller Plant
- **ASHRAE Standard 15** — Refrigeration system safety, A2L flammability and asphyxiation.
- Glycol aerosol monitoring near loop maintenance.

### NOC / SOC (Continuously Occupied)
- **ASHRAE 62.1-2025**, **ASHRAE 55-2023**, **OSHA PELs**, **NIOSH RELs**, **ACGIH TLVs**, **EPA NAAQS**.

### Loading Dock / Staging
- **ASHRAE 62.1**, **OSHA diesel PEL**, off-gassing from new-equipment crating (formaldehyde, VOCs).

### Offices, Break Rooms, Locker Rooms
- **ASHRAE 62.1**, **ASHRAE 55**, standard occupant comfort and IAQ.

### Tape Vault / Media Storage
- Historical media off-gassing literature (acetic acid from older tape stock); low priority.

### OEM Environmental Specs
- Dell, HPE, Cisco, IBM, NetApp all reference ANSI/ISA 71.04 G1 as warranty floor.


---

## 4. Phase 2 — Standards Mapping

### 4.1 Zone-to-Standard Mapping

| Zone | Currently Cited Standard(s) | Authoritative Standard(s) | Status |
|------|---------------------------|--------------------------|--------|
| data_hall | ANSI/ISA 71.04-2013, ISO 14644-1:2015, ASHRAE TC 9.9 | ANSI/ISA 71.04-2013, ASHRAE TC 9.9 (2011), ASHRAE Datacom Books 1 & 8, ISO 14644-1, iNEMI 2012 | **Partial** — missing ASHRAE Datacom Book 1 (thermal) & Book 8 (particulate), iNEMI creep corrosion limits |
| noc_office | ASHRAE 62.1-2022, ASHRAE 55-2023 (via default scoring) | ASHRAE 62.1-2025, ASHRAE 55-2023, OSHA PELs, NIOSH RELs, ACGIH TLVs | **Partial** — ASHRAE 62.1 edition is 2022 not 2025; no ACGIH TLV reference |
| battery_room | NFPA 1 (H₂ monitoring, exhaust rate) | NFPA 855 (2026), IEEE 1635/ASHRAE 21, OSHA 29 CFR 1910.178(g), NFPA 70E Art 320, IEEE 1188/450 | **Mismatch** — cites NFPA 1 (general fire code) instead of NFPA 855 (energy storage specific); missing IEEE 1635 H₂ ventilation math entirely |
| mechanical | Standard IAQ scoring only | ASHRAE Standard 15 (refrigeration safety), glycol aerosol monitoring | **Missing standard** — no refrigerant-specific or glycol monitoring logic |
| office | ASHRAE 62.1-2022, ASHRAE 55-2023 | ASHRAE 62.1-2025, ASHRAE 55-2023 | **Partial** — 62.1 edition is 2022 |
| generator_yard | *Not implemented* | OSHA diesel particulate, ACGIH TLVs, EPA NAAQS, NFPA 110, EPA AP-42 | **Missing zone** |
| electrical_room | *Not implemented* | ASHRAE 62.1, IEC 62271-4 (SF₆), ozone monitoring | **Missing zone** |
| chiller_plant | *Not implemented (partially covered by "mechanical")* | ASHRAE Standard 15 | **Missing zone** |
| loading_dock | *Not implemented* | ASHRAE 62.1, OSHA diesel PEL, off-gassing | **Missing zone** |
| tape_vault | *Not implemented* | Media off-gassing literature | **Missing zone** (low priority) |
| mmr_network | *Not implemented (collapsed into data_hall)* | ANSI/ISA 71.04-2013 (if corrosion-sensitive equipment present) | **Collapsed** — should be distinct from data_hall |

### 4.2 Threshold Provenance Check

| Constant | Value | Currently Cited Source | Authoritative Source | Provenance Check |
|----------|-------|----------------------|---------------------|-----------------|
| RH data_hall range | 20–60% | ASHRAE TC 9.9 | ASHRAE TC 9.9 (2011) Table 1 | **Verified** |
| Dew point range | 41.9–59°F | ASHRAE TC 9.9 | ASHRAE TC 9.9 (2011) Table 1 (A1 class) | **Verified** |
| G1/G2/G3/GX classification | Qualitative selection | ANSI/ISA 71.04-2013 | ANSI/ISA 71.04-2013 Table 1 | **Verified** (classification names correct; quantitative Å/month thresholds not implemented) |
| ISO Class 8 override threshold | ISO Class 8 | ISO 14644-1:2015 | ISO 14644-1:2015 Table 1 | **Verified** (classification correct; particle count limits not implemented — relies on assessor selection) |
| Battery exhaust min | 1 cfm/sq ft | NFPA 1 | IEEE 1635/ASHRAE 21 ventilation sizing; NFPA 855 §11.1.4 | **Mis-cited** — value may be correct but authoritative source is IEEE 1635, not NFPA 1 general fire code |
| H₂ monitoring | Yes/No question only | NFPA 1 | NFPA 855 §11.1.2; IEEE 1635 §6.3 | **Mis-cited** — no LEL thresholds implemented |
| CO OSHA PEL | 50 ppm | 29 CFR 1910.1000 | 29 CFR 1910.1000 Table Z-1 | **Verified** |
| HCHO OSHA PEL | 0.75 ppm | 29 CFR 1910.1048 | 29 CFR 1910.1048(c) | **Verified** |
| PM2.5 EPA 24-hr | 35 µg/m³ | EPA NAAQS 2024 | EPA 40 CFR 50 (2024 revision) | **Verified** |
| CO₂ concern | 1000 ppm | ASHRAE 62.1-2022 | ASHRAE 62.1-2022 §6.3 | **Verified** |
| OA rate data_center | 5 cfm/person + 0.06 cfm/ft² | Not cited | ASHRAE 62.1-2022 Table 6-1 | **PROVENANCE: UNKNOWN** — value matches 62.1 but no explicit citation in code |

### 4.3 Missing Zones (in canon, not implemented)

| Zone | Governing Standards | Risk of Omission | Priority |
|------|-------------------|------------------|----------|
| Generator yard / day-tank room | OSHA diesel, ACGIH TLVs, NFPA 110, EPA AP-42 | **High** — generator exhaust reaching air intakes is a top-3 DC finding | High |
| Electrical rooms / switchgear | ASHRAE 62.1, IEC 62271-4 (SF₆) | **Medium** — SF₆ is a potent GHG with asphyxiation risk in enclosed spaces | Medium |
| Loading dock / staging | ASHRAE 62.1, OSHA diesel PEL | **Medium** — new equipment off-gassing (formaldehyde, VOCs) enters data hall via staging | Medium |
| Chiller plant (distinct from mechanical) | ASHRAE Standard 15 | **Medium** — A2L refrigerant flammability not addressed | Medium |
| Tape vault / media storage | Media off-gassing literature | **Low** — declining relevance | Low |
| MMR / network rooms (distinct from data_hall) | ANSI/ISA 71.04-2013 | **Low** — often similar to data_hall conditions | Low |

### 4.4 Collapsed Zones

| Implemented Zone | Collapsed Into | Should Be Distinct? | Rationale |
|-----------------|---------------|--------------------|-----------| 
| MMR / network rooms | data_hall | **Yes** — different equipment density, cooling, and sometimes different corrosion sensitivity | MMR may have lower particle sensitivity but similar gaseous corrosion requirements |
| Chiller plant | mechanical | **Yes** — ASHRAE Standard 15 refrigerant safety is distinct from general mechanical room IAQ | Refrigerant leak detection and A2L flammability are not addressed by generic mechanical scoring |


---

## 5. Phase 3 — Architectural Gap Assessment

### Dimension 1: Zone Taxonomy Completeness

| | |
|---|---|
| **Current state** | 5 zone types implemented: data_hall, noc_office, battery_room, mechanical, office. Profile-driven injection via buildingProfiles.js. |
| **Ideal state** | 10–11 zone types covering the full DC facility footprint: data hall, MMR/network, battery/UPS, generator yard, electrical/switchgear, chiller plant, NOC/SOC, loading dock, offices, tape vault, and potentially roof/intake areas. |
| **Gap severity** | **High** |
| **Rationale** | 6 zones from the standards canon are missing. The most impactful omission is generator yard — generator exhaust infiltrating air intakes is one of the most common critical findings in DC assessments and cannot currently be documented. |

### Dimension 2: Receptor-Appropriate Scoring

| | |
|---|---|
| **Current state** | Single composite score per zone (0–100) mixing equipment-protection metrics (gaseous corrosion, ISO class) with human-health metrics (CO, HCHO, PM2.5) and comfort metrics (temperature, RH). The data_hall weight override (Contaminants:40) partially addresses this by emphasizing equipment, and Complaints are suppressed. |
| **Ideal state** | Parallel scores per receptor: (1) Equipment protection score (corrosion, particles, dew point); (2) Human-health score (PELs, RELs for any occupants/visitors); (3) Hazard-atmosphere score (LEL/LFL for battery rooms). Each with its own thresholds, standards, and reporting. |
| **Gap severity** | **High** |
| **Rationale** | A data hall with G1 corrosion but elevated CO₂ (from adjacent NOC air leakage) would show a poor score driven by ventilation — misleading for equipment-focused buyers. Conversely, a NOC with equipment-appropriate conditions but poor thermal comfort for operators scores the same way as a data hall. The single-composite model obscures which receptor is at risk. |

### Dimension 3: Walkthrough vs. Coupon-Based Assessment Honesty

| | |
|---|---|
| **Current state** | The walkthrough presents gaseous corrosion as a dropdown: "ISA-71.04 gaseous corrosion classification?" with G1–GX options. The assessor selects a classification. No disclaimer states that definitive G-class determination requires 30-day passive reactivity coupon deployment per ANSI/ISA 71.04-2013 §5. Report findings state "Gaseous corrosion G3 — Harsh" as fact. |
| **Ideal state** | Two paths: (1) If coupon data is available, accept Å/month measurements and compute G-class. (2) If walkthrough only, clearly label output as "Screening classification based on field indicators — definitive G-class requires 30-day passive coupon deployment per ANSI/ISA 71.04-2013 §5." The sampling plan should automatically recommend coupon deployment when G-class is walkthrough-estimated. |
| **Gap severity** | **Critical** |
| **Rationale** | An IH reviewer would immediately flag a report that claims a definitive ISA G-class from a walkthrough. This is a defensibility failure and potential misrepresentation of the standard's methodology. The module's own architectural constraint ("AI never sets thresholds") is violated in spirit when a walkthrough-selected classification is presented as a measured result. |

### Dimension 4: Adjacency / Pressurization Modeling

| | |
|---|---|
| **Current state** | Cross-contamination pathway fields exist (path_crosstalk, path_pressure) in the zone walkthrough. Building-level intake proximity tracking exists. A context finding warns that NOC should have dedicated OA (not return from data hall). No explicit inter-zone pressure cascade modeling. |
| **Ideal state** | Zone adjacency matrix where pressurization relationships are documented (data hall positive to corridor, corridor positive to battery room, etc.). Generator yard exhaust distance to intake louvers. Stack effect modeling for multi-story facilities. Cross-zone findings auto-generated when pressure differential + contaminant source align. |
| **Gap severity** | **Medium** |
| **Rationale** | The existing pathway fields capture the most critical cross-zone observations manually. A full adjacency model would be ideal but is architecturally complex. The current approach is defensible as a field-observation-driven assessment if the walkthrough questions are thorough. The main gap is that generator exhaust → intake coupling cannot be documented because the generator zone doesn't exist. |

### Dimension 5: Threshold Provenance

| | |
|---|---|
| **Current state** | Most thresholds are traceable: OSHA PELs, EPA NAAQS, ASHRAE 62.1 are cited in standards.js with edition years. DC-specific thresholds cite ANSI/ISA 71.04-2013, ISO 14644-1:2015, ASHRAE TC 9.9 in buildingProfiles.js. Battery room cites "NFPA 1" which is the wrong source. OA rate for data_center lacks explicit citation. |
| **Ideal state** | Every threshold has: standard name, edition/year, specific section/table reference. All citations current as of 2026. |
| **Gap severity** | **Medium** |
| **Rationale** | Most provenance is solid. The battery room NFPA 1 citation is wrong (should be NFPA 855 / IEEE 1635). The missing OA rate citation is minor. The ASHRAE 62.1 edition (2022 vs 2025) is outdated but the rate procedure hasn't materially changed. |

### Dimension 6: Conflict Resolution Between Standards

| | |
|---|---|
| **Current state** | No explicit conflict-resolution logic. When a NOC is adjacent to a data hall, both ASHRAE 62.1 (human comfort) and TC 9.9 (equipment) apply, but only the default IAQ scoring runs for noc_office. The RH override system (buildingProfiles.js:42-44) handles the equipment vs comfort RH conflict for data_hall but not for adjacent zones. |
| **Ideal state** | Explicit documentation per zone: "When ASHRAE 62.1 and ASHRAE TC 9.9 both apply, TC 9.9 governs for [equipment parameter] and 62.1 governs for [occupant parameter]." Conflict-resolution rules in the scoring engine that select the more conservative threshold when two standards overlap. |
| **Gap severity** | **Medium** |
| **Rationale** | The current implicit approach (data_hall uses TC 9.9 RH, noc_office uses 62.1) is functionally correct but not documented or defensible. An IH reviewer would want to see which standard governs each parameter and why. |

### Dimension 7: Per-Zone Confidence Degradation

| | |
|---|---|
| **Current state** | Zone-level confidence is computed from weighted sufficiency (riskBands.js:101-113). Missing gaseous corrosion or ISO class data reduces zone sufficiency but doesn't generate a penalty — fields are optional. Building confidence is capped at worst zone (scoring.js:131-134). |
| **Ideal state** | Per-zone confidence correctly isolated. DC-specific required fields: data_hall should require either coupon data or a screening classification. Missing gaseous corrosion for a data_hall should explicitly degrade confidence and generate a "sampling recommended" finding. |
| **Gap severity** | **Low** |
| **Rationale** | The existing system works correctly — missing data reduces confidence, not risk. The gap is that gaseous_corrosion and iso_class are fully optional, so a data hall with no corrosion or particle data gets no finding or recommendation about it. The sampling plan engine may compensate for this, but confidence should explicitly note the omission. |

### Dimension 8: Hazardous Atmosphere Logic

| | |
|---|---|
| **Current state** | Battery room uses standard IAQ 5-category scoring (Ventilation, Contaminants, HVAC, Complaints, Environment). The only battery-specific logic is: context finding about H₂ monitoring + exhaust (buildingProfiles.js:46-50), two additional fields (h2_monitoring, exhaust_cfm_sqft), and tc/hp suppression. No H₂ LEL thresholds. No ventilation sizing math. No hazard-atmosphere classification. |
| **Ideal state** | Battery room scored on hazard-atmosphere model: H₂ concentration vs LEL (4% vol), design ceiling at 1% (25% LEL), absolute ceiling at 2% per IEEE 1635. Ventilation sizing per IEEE 1635/ASHRAE 21 formula: Q = V × N × 0.0145 (for lead-acid). Scoring produces: SAFE / MONITOR / ALARM / EVACUATE classifications, not a 0–100 composite. NFPA 855 gas detection compliance check. |
| **Gap severity** | **Critical** |
| **Rationale** | This is the most severe gap. A battery room is a potentially hazardous atmosphere governed by NFPA 855 and IEEE 1635, not an IAQ space. Scoring it on comfort/contaminant thresholds is categorically wrong. An assessor documenting "No H₂ monitoring" gets a context finding but no score impact. A battery room with inadequate ventilation for H₂ evolution would score "Moderate" on IAQ metrics while presenting an actual explosion risk. |

### Dimension 9: OEM Warranty Alignment

| | |
|---|---|
| **Current state** | No OEM warranty references in the codebase. The module cites ANSI/ISA 71.04-2013 as the corrosion standard but does not mention that Dell, HPE, Cisco, IBM, and NetApp all reference G1 as their warranty floor. |
| **Ideal state** | Report findings and recommendations reference OEM warranty implications: "Equipment operating in G3 environment may void manufacturer warranties. Dell, HPE, Cisco, IBM, and NetApp environmental specifications require G1 (Mild) conditions per ANSI/ISA 71.04-2013." Recommendation to contact OEM for warranty status when G-class exceeds G1. |
| **Gap severity** | **Medium** |
| **Rationale** | OEM warranty is a primary business driver for DC assessments. Buyers commission these assessments specifically because OEMs require G1 conditions. Not mentioning warranty implications reduces the report's value to the buyer. However, the underlying scoring is correct — this is a reporting/narrative gap, not a scoring gap. |

### Dimension 10: Reporting Defensibility

| | |
|---|---|
| **Current state** | Findings cite standards (ANSI/ISA 71.04-2013, ISO 14644-1:2015) in the finding text. DC parameters appear in DOCX reports (sections-zone.js:108-124). Standards manifest exists but omits DC-specific standards. Scoring transparency panel shows engine version and general standards. The AI narrative labels output "IH Review Required." |
| **Ideal state** | Every finding shows: standard name, edition, specific section/table, threshold value, measured value, confidence level. Standards manifest includes all cited standards. Report clearly distinguishes walkthrough-estimated classifications from laboratory-measured values. |
| **Gap severity** | **High** |
| **Rationale** | The findings do cite standards, which is good. But the standards manifest gap (DC standards not listed) and the walkthrough/coupon ambiguity undermine defensibility. A third-party IH would ask: "Where is ANSI/ISA 71.04-2013 in your standards manifest?" and "How was this G-class determined — coupons or observation?" |


---

## 6. Severity-Ranked Findings

| Gap ID | Title | Severity | Affected Zone(s) | Standard(s) | Current | Required | Effort | Code Locations | Dependencies |
|--------|-------|----------|-------------------|-------------|---------|----------|--------|----------------|--------------|
| GAP-01 | Battery room uses IAQ scoring instead of hazard-atmosphere logic | **Critical** | battery_room | NFPA 855, IEEE 1635/ASHRAE 21, OSHA 29 CFR 1910.178(g) | Standard 5-category IAQ scoring; context finding only | H₂ LEL thresholds (4% vol), ventilation sizing math, SAFE/MONITOR/ALARM/EVACUATE classification | XL | scoring.js:21-95, buildingProfiles.js:34-39 | GAP-06 (battery standards) |
| GAP-02 | Walkthrough implies definitive ISA G-class without coupon data | **Critical** | data_hall | ANSI/ISA 71.04-2013 §5 | Assessor selects G1-GX from dropdown; presented as fact in report | Distinguish coupon-measured vs walkthrough-estimated G-class; auto-recommend coupon deployment; disclaimer on walkthrough-only output | M | buildingProfiles.js:25-27, scoring.js:64-68, PrintReport.jsx, sections-zone.js:120 | None |
| GAP-03 | Six zone types from standards canon not implemented | **High** | generator_yard, electrical_room, chiller_plant, loading_dock, tape_vault, mmr_network | Multiple (see §4.3) | 5 zone types | 10-11 zone types | XL | buildingProfiles.js:11-16 | Each zone needs its own threshold set |
| GAP-04 | Single composite mixes equipment-protection and human-health receptors | **High** | data_hall, noc_office, battery_room | ANSI/ISA 71.04-2013, ASHRAE 62.1, NFPA 855 | One 0-100 composite per zone | Parallel receptor-specific scores per zone | XL | scoring.js:21-95, compositeScore() | GAP-01 (hazard-atmosphere model) |
| GAP-05 | DC-specific standards missing from STANDARDS_MANIFEST | **High** | all DC zones | ANSI/ISA 71.04-2013, ISO 14644-1, ASHRAE TC 9.9, NFPA 1/855 | Manifest at standards.js:13-24 lists only general IAQ standards | Add all DC-cited standards to manifest | S | standards.js:13-24 | None |
| GAP-06 | Battery room cites NFPA 1 instead of NFPA 855 / IEEE 1635 | **High** | battery_room | NFPA 855 (2026), IEEE 1635/ASHRAE 21 | NFPA 1 cited for H₂ monitoring and exhaust | Cite NFPA 855 for installation/detection, IEEE 1635 for ventilation sizing | S | buildingProfiles.js:35-39 | None |
| GAP-07 | No H₂ LEL thresholds or ventilation sizing for battery room | **High** | battery_room | IEEE 1635/ASHRAE 21 | Yes/No question for H₂ monitoring; 1 cfm/sq ft exhaust threshold | H₂ concentration input, LEL calculation (4% vol / 25% LEL design / 2% IEEE ceiling), IEEE 1635 Q formula | L | buildingProfiles.js:34-39, scoring.js | GAP-01, GAP-06 |
| GAP-08 | Generator yard zone not implemented | **High** | generator_yard | OSHA diesel, ACGIH TLVs, NFPA 110, EPA AP-42 | Not implemented | Zone type with diesel exhaust thresholds, intake proximity assessment, NFPA 110 compliance | L | buildingProfiles.js:11-16 | GAP-03 |
| GAP-09 | No causal chain for generator exhaust → air intake coupling | **High** | data_hall, generator_yard | EPA AP-42, ASHRAE TC 9.9 | No cross-zone generator exhaust logic | Causal chain: generator yard exhaust + proximity to intake + wind direction → data hall contamination risk | M | causalChains.js | GAP-08 |
| GAP-10 | ASHRAE 62.1 edition cited as 2022, current is 2025 | **High** | noc_office, office, all occupied zones | ASHRAE 62.1-2025 | standards.js cites 2022 edition | Update to 2025 edition; verify rate procedure unchanged | S | standards.js:13-24, all ASHRAE 62.1 references | None |
| GAP-11 | No OEM warranty references in findings or recommendations | **Medium** | data_hall | Dell, HPE, Cisco, IBM, NetApp environmental specs | No OEM references | Add warranty implication text to G-class findings; recommendation to verify OEM compliance | S | scoring.js:64-68 findings text, buildingProfiles.js context findings | None |
| GAP-12 | No ASHRAE Datacom Book 1 (thermal) or Book 8 (particulate) references | **Medium** | data_hall | ASHRAE Datacom Series Books 1 & 8 | Not referenced | Add as supplementary references in context findings and standards manifest | S | buildingProfiles.js, standards.js | None |
| GAP-13 | No iNEMI (2012) creep corrosion limits referenced | **Medium** | data_hall | iNEMI Position Statement 2012 | Not referenced | Add iNEMI creep corrosion risk finding when G-class ≥ G2 and RH conditions met | S | causalChains.js:90-101 (creep corrosion chain exists but doesn't cite iNEMI) | None |
| GAP-14 | Conflict resolution between standards not documented | **Medium** | noc_office, data_hall | ASHRAE 62.1, ASHRAE TC 9.9 | Implicit (data_hall uses TC 9.9 RH, noc uses 62.1) | Explicit documentation of which standard governs per parameter per zone | M | buildingProfiles.js, report templates | None |
| GAP-15 | No ASHRAE Standard 15 refrigerant safety for mechanical/chiller | **Medium** | mechanical | ASHRAE Standard 15 | Generic IAQ scoring | Refrigerant leak detection, A2L flammability assessment, leak concentration thresholds | M | buildingProfiles.js:15 | GAP-03 (chiller zone) |
| GAP-16 | AI narrative system prompt has no DC-specific constraints | **Medium** | all DC zones | N/A (architectural) | Generic "expert CIH" prompt | Add DC-specific prompt constraints: don't claim definitive G-class from walkthrough data; reference OEM warranty implications; note that battery rooms are hazardous atmospheres | S | narrative.js:20, api/narrative.js | GAP-02 |
| GAP-17 | Missing gaseous_corrosion for data_hall generates no finding | **Low** | data_hall | ANSI/ISA 71.04-2013 | Optional field — no penalty if missing | Generate "Gaseous corrosion assessment not performed — coupon deployment recommended" finding with sev:info | S | scoring.js:64-73, buildingProfiles.js | None |
| GAP-18 | Electrical room zone not implemented | **Low** | electrical_room | ASHRAE 62.1, IEC 62271-4 (SF₆) | Not implemented | Zone type with SF₆ monitoring guidance, ozone near corona equipment | M | buildingProfiles.js:11-16 | GAP-03 |
| GAP-19 | Tape vault / media storage zone not implemented | **Low** | tape_vault | Media off-gassing literature | Not implemented | Low-priority zone type for acetic acid off-gassing from legacy media | S | buildingProfiles.js:11-16 | GAP-03 |

---

## 7. Three-Tier Remediation Roadmap

### Tier 1 — Pre-Launch Blockers (Critical)

Must resolve before paid DC assessments. Failure to address these would cause buyer rejection or IH peer-review failure.

| Order | Gap ID | Title | Effort | Dependencies |
|-------|--------|-------|--------|--------------|
| 1 | GAP-02 | Walkthrough vs coupon G-class honesty | M | None — can implement immediately |
| 2 | GAP-05 | Add DC standards to STANDARDS_MANIFEST | S | None — quick fix |
| 3 | GAP-06 | Fix battery room standard citations (NFPA 1 → NFPA 855 / IEEE 1635) | S | None — quick fix |
| 4 | GAP-01 | Battery room hazard-atmosphere scoring model | XL | GAP-06 done first |

**Implementation notes:**
- GAP-02 is the highest-priority fix because every DC report currently risks misrepresenting the ISA 71.04 methodology. Fix: add `assessment_method` field to gaseous_corrosion question ("Coupon measurement" vs "Visual/walkthrough screening"), adjust finding text and confidence accordingly, auto-inject coupon deployment into sampling plan when method is screening.
- GAP-01 is the largest effort but is architecturally isolated — the battery room scoring can be a parallel return alongside the standard IAQ score without changing the core engine.

### Tier 2 — Launch Hardening (High)

Address before scaling to paid customers. Important for defensibility and completeness.

| Order | Gap ID | Title | Effort | Dependencies |
|-------|--------|-------|--------|--------------|
| 5 | GAP-10 | Update ASHRAE 62.1 to 2025 edition | S | None |
| 6 | GAP-07 | H₂ LEL thresholds and ventilation sizing | L | GAP-06 |
| 7 | GAP-08 | Generator yard zone type | L | None |
| 8 | GAP-09 | Generator exhaust → intake causal chain | M | GAP-08 |
| 9 | GAP-04 | Receptor-appropriate parallel scoring | XL | GAP-01 (hazard model informs pattern) |
| 10 | GAP-17 | Missing gaseous_corrosion finding for data_hall | S | None |

**Implementation notes:**
- GAP-08 and GAP-09 should be done together — the generator yard zone type is only useful if the exhaust→intake causal chain exists.
- GAP-04 (parallel receptor scores) is the largest architectural change and should follow GAP-01 so the battery room hazard-atmosphere model can inform the pattern for equipment-protection vs human-health splitting.

### Tier 3 — Backlog (Medium/Low)

Post-launch improvements. Important for comprehensiveness but not defensibility-blocking.

| Order | Gap ID | Title | Effort | Dependencies |
|-------|--------|-------|--------|--------------|
| 11 | GAP-11 | OEM warranty references | S | None |
| 12 | GAP-16 | DC-specific AI narrative constraints | S | GAP-02 |
| 13 | GAP-12 | ASHRAE Datacom Book 1 & 8 references | S | None |
| 14 | GAP-13 | iNEMI creep corrosion citation | S | None |
| 15 | GAP-14 | Conflict resolution documentation | M | None |
| 16 | GAP-15 | ASHRAE Standard 15 for mechanical/chiller | M | GAP-03 |
| 17 | GAP-18 | Electrical room zone type | M | GAP-03 |
| 18 | GAP-03 | Remaining missing zone types (loading dock, tape vault, MMR) | L | None |
| 19 | GAP-19 | Tape vault zone type | S | GAP-03 |

---

## 8. Open Questions

Items where this analysis hit ambiguity requiring product owner resolution.

| # | Question | Context | Impact on Remediation |
|---|----------|---------|----------------------|
| 1 | **Does the product claim to produce definitive ISA G-class determinations, or is it positioned as a screening tool?** | GAP-02 fix depends on whether the product should accept coupon Å/month data (lab results) or only offer walkthrough screening with a sampling recommendation. | If screening only: add disclaimers and auto-recommend coupon deployment. If definitive: add Å/month input fields and compute G-class per ISA 71.04 Table 1. |
| 2 | **Should battery room scoring be a completely separate model or a parallel track within the existing engine?** | GAP-01 can be implemented as: (a) separate hazard-atmosphere scoring function returning SAFE/MONITOR/ALARM/EVACUATE, displayed alongside but not mixed into the 0-100 composite; or (b) replacement of the 5-category IAQ score for battery_room zones entirely. | Option (a) preserves the existing engine architecture. Option (b) is cleaner but requires more refactoring. |
| 3 | **What is the target zone taxonomy for v1.0 launch?** | GAP-03 lists 6 missing zones. Implementing all 6 is XL effort. Which are essential for launch? | ASSUMPTION: generator yard is the highest-priority missing zone. Electrical rooms and loading dock are next. Tape vault and MMR are backlog. |
| 4 | **Should receptor-specific parallel scores be visible to FM-mode users?** | GAP-04 proposes parallel equipment/human-health/hazard scores. FM mode was just simplified to pass/fail. Should FM see receptor breakdown or just the worst-case pass/fail? | Recommend: FM sees worst-case pass/fail across all receptors. IH mode sees full receptor breakdown. |
| 5 | **Which OEM environmental specs should be cited?** | GAP-11 references Dell, HPE, Cisco, IBM, NetApp. Should the module cite specific document numbers, or just reference "manufacturer environmental specifications" generically? | Generic reference is legally safer. Specific citations (e.g., "Dell Data Center Infrastructure Requirements v4.0") are more defensible but require maintenance as OEMs update specs. |
| 6 | **Is ASHRAE 62.1-2025 materially different from 2022 for the rate procedure used?** | GAP-10 flags the edition year. If the ventilation rate procedure table values haven't changed, updating the citation is sufficient. If thresholds changed, the constants need updating. | ASSUMPTION: rate procedure values unchanged between 2022 and 2025 editions. Verify before updating. |
| 7 | **Should the DC module support lithium-ion battery rooms (NFPA 855 / UL 9540A) in addition to lead-acid (IEEE 1635)?** | NFPA 855 (2026) covers Li-ion energy storage with thermal runaway considerations that differ significantly from lead-acid H₂ evolution. | If Li-ion in scope: significantly expands GAP-01 effort (thermal runaway gas detection, deflagration venting per UL 9540A). If lead-acid only: simpler H₂-focused implementation. |

---

*End of gap analysis. No code was modified during this audit.*
