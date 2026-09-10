/**
 * AtmosFlow Building-Type Profiles — v2.4
 * Zone-level field suppression, additional fields, threshold overrides,
 * ACH overrides, and context findings per building type.
 *
 * Every facility type offered in questions.js has a profile here.
 *
 * The DATA_CENTER profile was removed in 2026-08 along with the whole
 * data-center specialty module — the ISA-71.04 gaseous-corrosion and
 * ISO 14644-1 particle-class fields, the ASHRAE TC 9.9 thermal and
 * static-control overrides, the battery-room NFPA 855 / IEEE 1635
 * hydrogen findings, and the `data_hall` scoring branches. `Data Center`
 * is no longer offered as a facility type, so `getBuildingProfile`
 * returns null for one and the assessment scores as an unprofiled
 * building. See docs/CRITERIA.md.
 *
 * ── 2026-09 citation remediation (AUDIT-2026-09 C1, C7) ──────────────
 *
 * `rhOverrides` are gone from every profile. All nine carried
 * `{ min: 30, max: 60, label: 'ASHRAE 55' }` — the engine's own default
 * band under the one attribution the band does not have (ASHRAE 55 sets
 * an upper humidity limit as a humidity ratio and no lower limit at all;
 * the 30–60% band is US EPA moisture-control guidance, `STD.t.rh.ref`).
 * An override identical to the default exists only to re-cite it, so the
 * override is deleted and the engine default — with its own citation —
 * applies. Guarded by tests/engine/humidity-citation.test.ts.
 *
 * Air-change figures: a numeric ACH survives here only with a citation
 * that names the table it comes from. Figures the audit found not to match
 * their cited source, or that the source does not state at all, were
 * REMOVED rather than replaced with another guess; each removal is on the
 * ledger in tests/engine/citations-gap-ledger.ts with its reason, and the
 * finding text states the condition qualitatively and says what to verify
 * against. ASHRAE 62.1 sets outdoor-air rates, not air-change rates, and
 * ANSI/AIHA Z9.5 explicitly declines to set one — neither is cited for an
 * ACH anywhere in this file. Guarded by
 * tests/engine/citations-building-profiles.test.ts.
 */

import { STD } from '../constants/standards.js'

/**
 * Isolation rooms are two different things with opposite pressure
 * relationships, and a single `isolation` subtype cannot say which one a
 * zone is. If the record carries a kind (`isolation_kind`, `iso_kind` or
 * `isolation_type` — 'aii' / 'airborne' vs 'pe' / 'protective'), the finding
 * states the direction for that kind; otherwise it states both and asks the
 * assessor to record which applies. Nothing here asserts one direction for
 * an unrecorded kind.
 */
export function isolationKind(z = {}) {
  const raw = String(z.isolation_kind || z.iso_kind || z.isolation_type || '').toLowerCase()
  if (/\baii\b|airborne/.test(raw)) return 'aii'
  if (/\bpe\b|protective/.test(raw)) return 'pe'
  return null
}

function isolationText(z) {
  const kind = isolationKind(z)
  const ach = 'ASHRAE 170-2021 Table 7.1 lists a minimum of 12 total ACH for both room types and a minimum pressure differential of 0.01 in. w.g.; verify the design rate, the pressure relationship and continuous monitoring against that table.'
  if (kind === 'aii') return `Airborne infection isolation (AII) room: maintained NEGATIVE to the corridor and adjacent spaces. ${ach}`
  if (kind === 'pe') return `Protective environment (PE) room: maintained POSITIVE to the corridor and adjacent spaces. ${ach}`
  return `Isolation room: the required pressure relationship depends on which kind of room this is — airborne infection isolation (AII) rooms are maintained NEGATIVE to adjacent spaces; protective environment (PE) rooms are maintained POSITIVE. The room kind was not recorded, so no direction is asserted here; record it and verify the relationship. ${ach}`
}

export const BUILDING_PROFILES = {
  HEALTHCARE: {
    id: 'healthcare',
    label: 'Healthcare',
    additionalStandards: ['ASHRAE 170-2021 (Ventilation of Health Care Facilities)'],
    zoneSubtypes: [
      { id: 'exam_room', label: 'Exam Room' },
      { id: 'waiting', label: 'Waiting Area' },
      { id: 'office', label: 'Office' },
      { id: 'procedure', label: 'Procedure Room' },
      { id: 'pharmacy', label: 'Pharmacy' },
      { id: 'lab', label: 'Laboratory' },
      { id: 'patient_room', label: 'Patient Room' },
      { id: 'isolation', label: 'Isolation Room' },
    ],
    suppressFields: {},
    additionalFields: {},
    // Total air changes per hour, ASHRAE 170-2021 Table 7.1. Removed from
    // this list and on the gap ledger: `waiting` (the profile's 4 ACH matched
    // no row — 170 lists ED and radiology waiting at 12, negative), `pharmacy`
    // (12 ACH "(ISO Class 7)" matched neither 170's general pharmacy nor USP
    // <797>'s 30 ACH ISO 7 buffer), and `office` (cited to ASHRAE 62.1, which
    // sets no air-change rate). The engine's generic healthcare default
    // applies to those subtypes until a primary-source figure is entered.
    achOverrides: {
      exam_room: { min: 6, label: 'ASHRAE 170-2021 Table 7.1' },
      // Was 6. Table 7.1 lists procedure rooms at 15 total ACH.
      procedure: { min: 15, label: 'ASHRAE 170-2021 Table 7.1' },
      lab: { min: 6, label: 'ASHRAE 170-2021 Table 7.1' },
      patient_room: { min: 4, label: 'ASHRAE 170-2021 Table 7.1' },
      // Same rate for AII and PE rooms; the pressure DIRECTION differs and is
      // handled in the context finding, not here.
      isolation: { min: 12, label: 'ASHRAE 170-2021 Table 7.1 (AII and PE rooms)' },
    },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'pharmacy',
        text: 'Pharmacy: verify the air-change rate against the requirement for this space type — ASHRAE 170-2021 Table 7.1 (general pharmacy) or USP <797> (sterile compounding; ISO 7 buffer room: 30 ACH). Verify the pressure relationship: negative to adjacent spaces for USP <800> compounding, positive for other sterile compounding.',
        sev: 'medium', std: 'ASHRAE 170-2021 Table 7.1; USP <797>; USP <800>' },
      { condition: (z) => z.zone_subtype === 'isolation',
        text: isolationText,
        sev: 'high', std: 'ASHRAE 170-2021 Table 7.1' },
      { condition: (z) => z.zone_subtype === 'procedure',
        text: 'Procedure room: ASHRAE 170-2021 Table 7.1 lists a minimum of 15 total ACH with positive pressure relative to adjacent spaces. Verify the design air-change rate and the pressure relationship.',
        sev: 'medium', std: 'ASHRAE 170-2021 Table 7.1' },
      // ASHRAE 170 is a ventilation standard and says nothing about mold;
      // it was dropped from this citation in 2026-09. The severity is the
      // profile's own and is unchanged — there is no mold criterion in the
      // registry to cap it (see the handoff note).
      { condition: (z) => z.mi && z.mi !== 'None' && z.mi !== 'Suspected discoloration',
        text: 'Visible mold in a healthcare facility requires prompt evaluation through the facility infection control risk assessment (ICRA) process.',
        sev: 'critical', std: 'Joint Commission' },
    ],
  },

  SCHOOL_K12: {
    id: 'school_k12',
    label: 'School (K-12)',
    additionalStandards: ['EPA IAQ Tools for Schools Action Kit (15 cfm/person classrooms)', 'ASHRAE 62.1-2025 (10 cfm/person + 0.12 cfm/ft² classrooms, age 9 plus)'],
    zoneSubtypes: [
      { id: 'classroom', label: 'Classroom' },
      { id: 'gymnasium', label: 'Gymnasium' },
      { id: 'cafeteria', label: 'Cafeteria' },
      { id: 'office', label: 'Office' },
      { id: 'library', label: 'Library' },
      { id: 'lab', label: 'Science Lab' },
      { id: 'auditorium', label: 'Auditorium' },
      { id: 'nurse', label: "Nurse's Office" },
    ],
    suppressFields: {},
    additionalFields: {},
    contextFindings: [
      // No measured rate: state both bases so the assessor knows what to
      // verify against. ASHRAE 62.1 is the code basis scoring evaluates;
      // EPA Tools for Schools is the more protective guidance target.
      { condition: (z) => z.zone_subtype === 'classroom' && !z.cfm_person,
        text: 'Classroom outdoor air was not measured. ASHRAE 62.1 requires 10 cfm/person plus 0.12 cfm/ft² for classrooms age 9 plus; EPA Tools for Schools guidance is 15 cfm/person. Verify the OA damper is open and the design delivery rate is documented against the basis the jurisdiction has adopted.',
        sev: 'medium', std: 'ASHRAE 62.1-2025 Table 6.2.2.1; EPA IAQ Tools for Schools' },
      // Measured, meets code, short of guidance. Its own finding at its own
      // severity — the guidance figure is not lost by scoring against code,
      // and a code-compliant school is no longer reported non-compliant.
      { condition: (z) => z.zone_subtype === 'classroom' && z.cfm_person
          && +z.cfm_person >= 10 && +z.cfm_person < 15,
        text: 'Classroom outdoor air delivery meets the ASHRAE 62.1 minimum of 10 cfm/person but falls below the 15 cfm/person target in EPA IAQ Tools for Schools. This is a guidance shortfall, not a code deficiency; the EPA figure is the more protective basis for classrooms and is worth meeting where the system allows.',
        sev: 'low', std: 'EPA IAQ Tools for Schools' },
      // Was rated `high` and cited to "EPA TfS", which states no CO₂
      // criterion. CO₂ is a ventilation indicator (CRITERION_CLASS
      // ventilation_indicator); 800 ppm sits below the registry's lowest
      // tier, so this is capped at medium and cited as an indicator only.
      { condition: (z) => z.zone_subtype === 'classroom' && z.co2 && +z.co2 > 800,
        text: `Classroom CO₂ above 800 ppm during occupancy. CO₂ indexes outdoor-air delivery per occupant rather than a contaminant level; the ASHRAE Position Document on Indoor Carbon Dioxide (2022) treats it as an indicator of ventilation relative to occupant load, not as a limit. Verify outdoor-air delivery against the design occupancy; the engine's own indicator tiers begin at ${STD.v.co2.con} ppm.`,
        sev: 'medium', std: 'ASHRAE Position Document on Indoor Carbon Dioxide (2022)' },
      { condition: (z) => z.zone_subtype === 'gymnasium',
        text: 'Large assembly spaces require elevated outdoor air per ASHRAE 62.1 Table 6.2.2.1. Confirm HVAC can handle intermittent peak occupancy loads.',
        sev: 'medium', std: 'ASHRAE 62.1-2025 Table 6.2.2.1' },
      // "6 ACH ... NFPA 45" removed: the figure could not be confirmed against
      // the cited source, and ASHRAE 62.1 (formerly co-cited) sets no
      // air-change rate. See the gap ledger.
      { condition: (z) => z.zone_subtype === 'lab',
        text: 'Science laboratory: where chemical fume hoods are present, verify that hood exhaust is not recirculated to occupied spaces and that the design air-change rate meets the requirement for this space type; verify against NFPA 45 and the adopted mechanical code. Neither ASHRAE 62.1 nor ANSI/AIHA Z9.5 sets an air-change rate for laboratories.',
        sev: 'high', std: 'NFPA 45' },
    ],
  },

  COMMERCIAL_OFFICE: {
    id: 'commercial_office',
    label: 'Commercial Office',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'open_office', label: 'Open Office' },
      { id: 'private_office', label: 'Private Office' },
      { id: 'conference', label: 'Conference Room' },
      { id: 'break_room', label: 'Break Room / Kitchen' },
      { id: 'lobby', label: 'Lobby / Reception' },
      { id: 'restroom', label: 'Restroom' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
      restroom: ['tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'conference' && z.co2 && +z.co2 > 1000,
        text: 'Conference room CO₂ elevated during occupancy. Verify dedicated outdoor air supply — conference rooms often lack adequate OA for peak occupancy.',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
    ],
  },

  INDUSTRIAL: {
    id: 'industrial',
    label: 'Industrial / Manufacturing',
    additionalStandards: ['OSHA 29 CFR 1910 (General Industry)', 'ACGIH TLVs'],
    zoneSubtypes: [
      { id: 'production', label: 'Production Floor' },
      { id: 'warehouse', label: 'Warehouse / Storage' },
      { id: 'office', label: 'Office' },
      { id: 'break_room', label: 'Break Room' },
      { id: 'loading_dock', label: 'Loading Dock' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      loading_dock: ['tc', 'hp'],
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'production',
        text: 'Production floor IAQ assessment should include process-specific contaminant evaluation. Verify LEV (local exhaust ventilation) is operational at all emission sources.',
        sev: 'medium', std: 'OSHA 29 CFR 1910.1000' },
      { condition: (z) => z.zone_subtype === 'loading_dock',
        text: 'Loading dock: evaluate diesel exhaust exposure during delivery operations. Ensure dock doors close when not in active use to prevent exhaust migration to occupied spaces.',
        sev: 'medium', std: 'OSHA diesel particulate guidance' },
    ],
  },

  RETAIL: {
    id: 'retail',
    label: 'Retail',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'sales_floor', label: 'Sales Floor' },
      { id: 'stockroom', label: 'Stockroom' },
      { id: 'office', label: 'Office' },
      { id: 'break_room', label: 'Break Room' },
    ],
    suppressFields: {},
    additionalFields: {},
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'sales_floor' && z.co2 && +z.co2 > 1000,
        text: 'Sales floor CO₂ elevated. Retail spaces with variable occupancy may require demand-controlled ventilation (DCV) per ASHRAE 62.1.',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
    ],
  },

  GOVERNMENT: {
    id: 'government',
    label: 'Government',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'open_office', label: 'Open Office' },
      { id: 'private_office', label: 'Private Office' },
      { id: 'conference', label: 'Conference Room' },
      { id: 'public_area', label: 'Public Area / Lobby' },
      { id: 'courtroom', label: 'Courtroom / Hearing Room' },
      { id: 'break_room', label: 'Break Room' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'courtroom' && z.co2 && +z.co2 > 1000,
        text: 'Courtroom/hearing room CO₂ elevated during occupancy. High-density assembly spaces require elevated OA delivery per ASHRAE 62.1 Table 6.2.2.1.',
        sev: 'medium', std: 'ASHRAE 62.1-2025 Table 6.2.2.1' },
    ],
  },

  LABORATORY: {
    id: 'laboratory',
    label: 'Laboratory',
    additionalStandards: ['ANSI/AIHA Z9.5 (Laboratory Ventilation)', 'NFPA 45 (Fire Protection for Labs)'],
    zoneSubtypes: [
      { id: 'wet_lab', label: 'Wet Lab / Chemistry' },
      { id: 'dry_lab', label: 'Dry Lab / Analytical' },
      { id: 'bio_lab', label: 'Biological Lab' },
      { id: 'office', label: 'Office / Write-Up' },
      { id: 'storage', label: 'Chemical Storage' },
      { id: 'corridor', label: 'Corridor / Support' },
    ],
    suppressFields: {
      storage: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    // No achOverrides. The four that stood here — wet lab 8, dry lab 6 and
    // bio lab 6 cited to ANSI/AIHA Z9.5, storage 6 cited to NFPA 45 — are on
    // the gap ledger. Z9.5 explicitly declines to prescribe an air-change
    // rate, and the NFPA 45 figure could not be confirmed against the
    // standard. The engine's generic lab default applies meanwhile.
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'wet_lab',
        text: 'Wet laboratory: verify fume hood face velocity 80-120 fpm per ANSI/AIHA Z9.5. All hoods should be operational during occupied hours. 100% exhaust (no recirculation).',
        sev: 'high', std: 'ANSI/AIHA Z9.5' },
      { condition: (z) => z.zone_subtype === 'bio_lab',
        text: 'Biological laboratory: verify directional airflow from clean to less clean areas. BSCs must be certified annually per NSF 49.',
        sev: 'high', std: 'CDC/NIH BMBL; NSF 49' },
      { condition: (z) => z.zone_subtype === 'storage',
        text: 'Chemical storage room: verify that continuous exhaust ventilation is provided and that the design air-change rate meets the requirement for this space type; verify against NFPA 45 and the adopted mechanical code. Incompatible chemicals must be stored in separate ventilated cabinets.',
        sev: 'high', std: 'NFPA 45' },
    ],
  },

  WAREHOUSE: {
    id: 'warehouse',
    label: 'Warehouse',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'main_floor', label: 'Main Warehouse Floor' },
      { id: 'office', label: 'Office' },
      { id: 'loading_dock', label: 'Loading Dock' },
      { id: 'break_room', label: 'Break Room' },
      { id: 'cold_storage', label: 'Cold Storage' },
    ],
    suppressFields: {
      loading_dock: ['tc', 'hp'],
      cold_storage: ['tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'loading_dock',
        text: 'Loading dock: evaluate diesel/vehicle exhaust exposure during operations. Ensure adequate separation between dock area and occupied office spaces.',
        sev: 'medium', std: 'OSHA diesel particulate guidance' },
      // Was `high`, cited to OSHA 29 CFR 1910.1000 — no OSHA figure is 5 ppm,
      // and an occupational 8-hour limit is not the comparison for a spot
      // reading in general occupancy. The reference indicator is the EPA
      // NAAQS 8-hour standard (criterion co_epa_naaqs_8h, class
      // ambient_benchmark, its own severity `medium`); this finding is
      // capped there.
      { condition: (z) => z.zone_subtype === 'main_floor' && z.co && +z.co > 5,
        text: `CO above typical indoor background on the warehouse floor suggests vehicle-exhaust accumulation (forklifts, delivery trucks). The EPA NAAQS 8-hour standard (${STD.c.co.epa} ppm) is the reference indicator for indoor CO in general occupancy; occupational exposure limits are not the appropriate comparison for a spot reading. Evaluate ventilation adequacy and consider propane/electric equipment alternatives.`,
        sev: 'medium', std: '40 CFR 50.8 — EPA NAAQS CO, 8-hour (reference indicator)' },
    ],
  },

  MIXED_USE: {
    id: 'mixed_use',
    label: 'Mixed Use',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'office', label: 'Office' },
      { id: 'retail', label: 'Retail' },
      { id: 'residential', label: 'Residential' },
      { id: 'restaurant', label: 'Restaurant / Food Service' },
      { id: 'common_area', label: 'Common Area / Lobby' },
      { id: 'parking', label: 'Parking Garage' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      parking: ['tc', 'hp'],
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'restaurant',
        text: 'Restaurant/food service: verify kitchen exhaust hood operation and makeup air balance. Cross-contamination of cooking odors to adjacent spaces indicates makeup air deficiency.',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
      { condition: (z) => z.zone_subtype === 'parking',
        text: `Parking garage: evaluate CO accumulation during peak vehicle traffic. Verify ventilation meets the ASHRAE 62.1 minimum exhaust rate for enclosed parking (${STD.v.oa.parking.ps} cfm/ft²).`,
        sev: 'medium', std: 'ASHRAE 62.1-2025 Table 6.5' },
      // 25 ppm is not an ASHRAE 62.1 figure (62.1 gives the exhaust rate
      // above). It is the CO-detection control point in IMC §404.1 and the
      // ACGIH TLV for CO.
      { condition: (z) => z.zone_subtype === 'parking' && z.co && +z.co > 25,
        text: 'CO above 25 ppm in the parking garage. The International Mechanical Code (§404.1) permits enclosed-parking ventilation to be controlled by CO detection, and the ACGIH TLV for CO is 25 ppm as an 8-hour TWA; this is a spot reading, not an 8-hour average. Evaluate ventilation fan operation and controls.',
        sev: 'high', std: 'IMC §404.1; ACGIH TLV (CO)' },
    ],
  },

  // ── 2026-09: five facility types added at the product owner's direction ──
  // (Marine / Vessel, Hotel / Lodging, Senior Living / Long-Term Care,
  // Childcare / Early Learning, Residential). Each is a facility type on the
  // intake and a zone-subtype list, and nothing more: no context findings,
  // no air-change rows, no additional standards. A first cut carried
  // population-specific findings (a CMS temperature range for resident
  // rooms, lead RRP for pre-1978 child-occupied rooms, chloramines at a
  // pool, an enclosed-space note for a cargo hold …) and was taken back out
  // at the product owner's direction — the assessment is of employee-
  // occupied areas, the engine's own findings apply in every one of these
  // buildings, and each extra rule was one more standard for the report to
  // carry. What survives is the part that costs nothing: the assessor can
  // name a zone by its subtype, and rooms with no occupants to ask
  // (mechanical, storage, a cargo hold) skip the complaint and comfort
  // questions. A zone under these types assesses exactly as an unprofiled
  // building does.

  MARINE_VESSEL: {
    id: 'marine_vessel',
    label: 'Marine / Vessel',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'bridge', label: 'Bridge / Wheelhouse' },
      { id: 'cabin', label: 'Crew Cabin / Berthing' },
      { id: 'mess', label: 'Mess / Crew Lounge' },
      { id: 'galley', label: 'Galley' },
      { id: 'passenger_space', label: 'Passenger Space / Lounge' },
      { id: 'engine_room', label: 'Engine Room / Machinery Space' },
      { id: 'cargo_hold', label: 'Cargo Hold / Tank' },
      { id: 'workshop', label: 'Workshop / Store' },
    ],
    suppressFields: {
      engine_room: ['tc', 'hp'],
      cargo_hold: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [],
  },

  HOTEL_LODGING: {
    id: 'hotel_lodging',
    label: 'Hotel / Lodging',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'guest_room', label: 'Guest Room' },
      { id: 'corridor', label: 'Guest Corridor' },
      { id: 'lobby', label: 'Lobby / Reception' },
      { id: 'meeting', label: 'Meeting Room / Ballroom' },
      { id: 'kitchen', label: 'Commercial Kitchen' },
      { id: 'restaurant', label: 'Restaurant / Bar' },
      { id: 'laundry', label: 'Laundry' },
      { id: 'pool_spa', label: 'Pool / Spa' },
      { id: 'fitness', label: 'Fitness Room' },
      { id: 'housekeeping', label: 'Housekeeping Store' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      housekeeping: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [],
  },

  SENIOR_LIVING: {
    id: 'senior_living',
    label: 'Senior Living / Long-Term Care',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'resident_room', label: 'Resident Room' },
      { id: 'dining_activity', label: 'Dining / Activity Room' },
      { id: 'corridor', label: 'Resident Corridor' },
      { id: 'nurse_station', label: 'Nurse Station' },
      { id: 'bathing', label: 'Central Bathing / Shower Room' },
      { id: 'therapy', label: 'Therapy (PT / OT)' },
      { id: 'kitchen', label: 'Kitchen' },
      { id: 'utility', label: 'Soiled / Clean Utility' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      utility: ['tc', 'hp'],
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [],
  },

  CHILDCARE: {
    id: 'childcare',
    label: 'Childcare / Early Learning',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'infant_room', label: 'Infant Room' },
      { id: 'toddler_room', label: 'Toddler Room' },
      { id: 'preschool_room', label: 'Preschool Room' },
      { id: 'play_room', label: 'Indoor Play / Gross Motor' },
      { id: 'diapering', label: 'Diapering / Restroom' },
      { id: 'kitchen', label: 'Kitchen' },
      { id: 'office', label: 'Office' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [],
  },

  RESIDENTIAL: {
    id: 'residential',
    label: 'Residential',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'living', label: 'Living Area' },
      { id: 'bedroom', label: 'Bedroom' },
      { id: 'kitchen', label: 'Kitchen' },
      { id: 'bathroom', label: 'Bathroom' },
      { id: 'basement', label: 'Basement / Crawlspace' },
      { id: 'garage', label: 'Attached Garage' },
      { id: 'laundry', label: 'Laundry / Utility' },
      { id: 'common', label: 'Common Area / Corridor (multifamily)' },
      { id: 'mechanical', label: 'Mechanical / Furnace Room' },
    ],
    suppressFields: {
      garage: ['tc', 'hp'],
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    contextFindings: [],
  },
}

export function getBuildingProfile(buildingType) {
  const n = (buildingType || '').toLowerCase().replace(/[\s\/]/g, '_')
  // The five 2026-09 types are matched first: their names share substrings
  // with older matches ("nursing home" / "home", "preschool" / "school",
  // "hospitality" / "hospital"), so order decides.
  // Word-start match for ship/boat, so "dealership" and "worship" stay ashore.
  if (n.includes('marine') || n.includes('vessel') || /(^|_)(ship|boat)/.test(n)) return BUILDING_PROFILES.MARINE_VESSEL
  if (n.includes('senior') || n.includes('long-term') || n.includes('long_term') || n.includes('nursing') || n.includes('assisted')) return BUILDING_PROFILES.SENIOR_LIVING
  if (n.includes('childcare') || n.includes('child_care') || n.includes('daycare') || n.includes('day_care') || n.includes('early_learning') || n.includes('preschool')) return BUILDING_PROFILES.CHILDCARE
  if (n.includes('hotel') || n.includes('lodging') || n.includes('motel') || n.includes('hospitality')) return BUILDING_PROFILES.HOTEL_LODGING
  if (n.includes('residential') || n.includes('apartment') || n.includes('multifamily') || n.includes('dwelling')) return BUILDING_PROFILES.RESIDENTIAL
  if (n.includes('healthcare') || n.includes('hospital') || n.includes('clinic')) return BUILDING_PROFILES.HEALTHCARE
  if (n.includes('school') || n.includes('education') || n.includes('university')) return BUILDING_PROFILES.SCHOOL_K12
  if (n.includes('office') && !n.includes('mixed')) return BUILDING_PROFILES.COMMERCIAL_OFFICE
  if (n.includes('industrial') || n.includes('manufacturing')) return BUILDING_PROFILES.INDUSTRIAL
  if (n.includes('retail')) return BUILDING_PROFILES.RETAIL
  if (n.includes('government')) return BUILDING_PROFILES.GOVERNMENT
  if (n.includes('lab')) return BUILDING_PROFILES.LABORATORY
  if (n.includes('warehouse')) return BUILDING_PROFILES.WAREHOUSE
  if (n.includes('mixed')) return BUILDING_PROFILES.MIXED_USE
  return null
}

export function getSuppressedFields(profile, zoneSubtype) {
  if (!profile?.suppressFields) return []
  return profile.suppressFields[zoneSubtype] || []
}

export function getAdditionalFields(profile, zoneSubtype) {
  if (!profile?.additionalFields) return []
  return profile.additionalFields[zoneSubtype] || []
}

export function getProfileContextFindings(profile, zoneData) {
  if (!profile?.contextFindings) return []
  return profile.contextFindings
    .filter(cf => cf.condition(zoneData))
    .map(cf => ({ t: typeof cf.text === 'function' ? cf.text(zoneData) : cf.text, sev: cf.sev, std: cf.std || '' }))
}

export function getRHOverride(profile, zoneSubtype) {
  if (!profile?.rhOverrides) return null
  return profile.rhOverrides[zoneSubtype] || profile.rhOverrides.default || null
}

export function getTempOverride(profile, zoneSubtype) {
  if (!profile?.tempOverrides) return null
  return profile.tempOverrides[zoneSubtype] || profile.tempOverrides.default || null
}

export function getACHOverride(profile, zoneSubtype) {
  if (!profile?.achOverrides) return null
  return profile.achOverrides[zoneSubtype] || null
}
