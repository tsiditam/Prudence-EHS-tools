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

/** The childcare rooms children occupy for the day (not office, kitchen, mechanical). */
const CHILD_ROOMS = new Set(['infant_room', 'toddler_room', 'preschool_room', 'play_room'])
const isChildRoom = (z = {}) => CHILD_ROOMS.has(z.zone_subtype)

/**
 * EPA RRP (40 CFR 745) applies to renovation disturbing painted surfaces in
 * pre-1978 target housing and child-occupied facilities. `ba` (year built)
 * and `rn` (recent renovation) are building fields, spread onto the zone by
 * scoreZone.
 */
const preLeadRenovation = (z = {}) =>
  Number.isFinite(+z.ba) && +z.ba > 0 && +z.ba < 1978 && !!z.rn && z.rn !== 'No'

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
  // Childcare / Early Learning, Residential). Each carries subtypes and
  // context findings that name the standard the assessor verifies against.
  // NONE carries an achOverride: no air-change figure for these occupancies
  // was entered from a primary source with a table citation in hand, and the
  // rule above is that a number that has not been checked is not entered. A
  // recorded ACH in any of these zones is reported, not judged, until a
  // figure is entered with the table it comes from. No rhOverrides either —
  // the engine's EPA moisture band applies as it does everywhere.

  MARINE_VESSEL: {
    id: 'marine_vessel',
    label: 'Marine / Vessel',
    // Building standards are the wrong basis aboard a vessel: ASHRAE 62.1 is
    // written for buildings, and the design basis for accommodation and
    // machinery-space ventilation is the flag-state and classification
    // requirement. The engine still reports readings against its usual
    // criteria; the findings below say what to verify them against.
    additionalStandards: [
      'ILO Maritime Labour Convention, 2006 — Standard A3.1 (accommodation: ventilation, heating, air conditioning)',
      'ISO 7547 (air conditioning and ventilation of accommodation spaces — design conditions)',
      'ISO 8861 (engine-room ventilation in diesel-engined ships)',
      'IMO Resolution A.1050(27) (entering enclosed spaces aboard ships)',
    ],
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
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'cabin' || z.zone_subtype === 'mess',
        text: 'Crew accommodation: the Maritime Labour Convention (Standard A3.1) requires sleeping rooms and mess rooms to be adequately ventilated, and air conditioned on ships regularly trading to the tropics. Verify the accommodation ventilation is running, that its intakes are sited away from engine and generator exhaust, and that the design basis (ISO 7547 or the class rule) is documented. Building outdoor-air rates (ASHRAE 62.1) are an indicator here, not the design requirement.',
        sev: 'low', std: 'ILO MLC 2006 Standard A3.1; ISO 7547' },
      // Steel hull, cold sea-side surfaces, closed cabins: condensation is the
      // usual moisture path aboard, not a roof leak.
      { condition: (z) => (z.zone_subtype === 'cabin' || z.zone_subtype === 'mess' || z.zone_subtype === 'passenger_space')
          && ((z.mi && z.mi !== 'None') || z.hp === 'Too humid / stuffy' || (z.wd && z.wd !== 'None')),
        text: 'Moisture or mold indicator in accommodation: aboard a vessel the usual path is condensation on hull plating and uninsulated cold surfaces behind linings, not a leak from above. Check behind bulkhead linings and under bunks, and verify the accommodation air handling is dehumidifying at the current sea-water and outdoor conditions.',
        sev: 'medium', std: STD.t.rh.ref },
      { condition: (z) => z.zone_subtype === 'galley',
        text: 'Galley: verify the range hood exhausts outboard and that make-up air is provided; cooking odor migrating into accommodation points to a make-up air shortfall. Where cooking is fuel-fired (LPG on smaller vessels), the combustion products go into a small closed volume — a CO reading in the galley and the adjacent mess during cooking is the check.',
        sev: 'medium', std: 'ILO MLC 2006 Standard A3.1; ISO 7547' },
      { condition: (z) => z.zone_subtype === 'engine_room',
        text: 'Machinery space: ventilation here is designed for combustion air and heat removal (ISO 8861), not for occupant air quality, and crew time in the space is governed by occupational exposure limits (ACGIH TLVs) rather than building criteria. Verify the exhaust routing, that engine-room air does not migrate into accommodation through doors, trunks or the ventilation system, and note heat stress alongside contaminants.',
        sev: 'medium', std: 'ISO 8861; ACGIH TLVs' },
      { condition: (z) => z.zone_subtype === 'cargo_hold',
        text: 'Cargo hold or tank: an enclosed space for entry purposes. The atmosphere may be oxygen-deficient, or may hold fumigant or cargo off-gassing, and a walkthrough IAQ reading is not an entry test. Verify that the vessel\'s enclosed-space entry procedure was followed and record the pre-entry atmosphere test (oxygen, flammables, toxic gases) with the instrument used.',
        sev: 'high', std: 'IMO Resolution A.1050(27)' },
      // Exhaust re-entrainment is the vessel-specific CO source; the reading
      // itself is scored by the contaminant criteria (co_who_24h, severity
      // low), and this finding is capped there.
      { condition: (z) => z.zone_subtype !== 'engine_room' && z.co && +z.co > STD.c.co.who24h,
        text: `CO above the WHO 24-hour indoor guideline (${STD.c.co.who24h} ppm) outside the machinery space. Aboard a vessel the likely source is engine or generator exhaust re-entering through accommodation intakes, open doors or ports when the stack is downwind; verify the intake siting relative to the exhaust and re-check the reading under way and at berth.`,
        sev: 'low', std: 'WHO Guidelines for Indoor Air Quality: Selected Pollutants (2010) — CO, 24-hour' },
    ],
  },

  HOTEL_LODGING: {
    id: 'hotel_lodging',
    label: 'Hotel / Lodging',
    additionalStandards: [
      'ASHRAE 62.1-2025 Table 6.2.2.1 (hotels, motels, resorts, dormitories) and Table 6.5 (exhaust)',
      'ASHRAE 188 (Legionellosis: risk management for building water systems) — where a spa, whirlpool, decorative fountain or cooling tower is present',
      'CDC Model Aquatic Health Code — indoor aquatic facility air handling',
    ],
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
    contextFindings: [
      // `ht` is the building's HVAC type, spread onto the zone by scoreZone.
      { condition: (z) => z.zone_subtype === 'guest_room' && /PTAC|PTHP|Fan Coil/i.test(String(z.ht || '')),
        text: 'Guest room served by a through-wall or fan-coil unit: these units recirculate room air, and outdoor air reaches the room only through the unit\'s own OA damper, a corridor make-up path or a separate dedicated outdoor-air system. Verify which of those is the design path and that it is open; check the unit filter and condensate pan, which are the usual odor and moisture sources in this room type.',
        sev: 'medium', std: 'ASHRAE 62.1-2025 Table 6.2.2.1 (hotels, motels, resorts, dormitories)' },
      { condition: (z) => z.zone_subtype === 'guest_room'
          && (z.hp === 'Too humid / stuffy' || (z.mi && z.mi !== 'None') || z.op === 'Moderate persistent' || z.op === 'Strong / overpowering'),
        text: 'Humidity, odor or mold indicator in a guest room: rooms left at a deep temperature setback between stays stop dehumidifying while outdoor air and infiltration continue, and moisture accumulates in carpet, bedding and wall cavities. Verify the unoccupied-mode setpoint and that the unit dehumidifies at part load; check behind headboards and under window units.',
        sev: 'medium', std: STD.t.rh.ref },
      { condition: (z) => z.zone_subtype === 'corridor' && /Negative/i.test(String(z.path_pressure || '')),
        text: 'Guest corridor measured negative to adjacent spaces. Hotel corridors are commonly the make-up air path for guest rooms and are held positive so that room exhaust does not pull corridor and stair air the wrong way; a negative corridor draws guest-room, stair and shaft air into the corridor instead. Verify the corridor make-up air unit and the exhaust balance.',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
      { condition: (z) => z.zone_subtype === 'meeting' && z.co2 && +z.co2 > 1000,
        text: 'Meeting room or ballroom CO₂ elevated during occupancy. Function spaces swing from empty to full and are usually ventilated on a schedule or by demand control; verify the outdoor-air delivery against the event occupancy, not the default schedule.',
        sev: 'medium', std: 'ASHRAE 62.1-2025 Table 6.2.2.1' },
      { condition: (z) => z.zone_subtype === 'kitchen' || z.zone_subtype === 'restaurant',
        text: 'Kitchen and food service: verify the cooking hood exhaust and make-up air balance. Cooking odor in the restaurant, lobby or guest corridors means the kitchen is running positive to those spaces — a make-up air shortfall — and grease-laden exhaust is a hood-cleaning and fire item as well as an air-quality one.',
        sev: 'medium', std: 'ASHRAE 62.1-2025 Table 6.5; IMC §507' },
      { condition: (z) => z.zone_subtype === 'laundry',
        text: 'Laundry: verify that dryer exhaust terminates outdoors with no lint accumulation in the duct, that make-up air is provided for the dryer volume, and, where dryers are gas-fired, that combustion products are not spilling into the room (a CO reading with the dryers running is the check). Heat and humidity in this space are expected; lint and combustion spillage are the findings.',
        sev: 'medium', std: 'IMC §504 (clothes dryer exhaust)' },
      { condition: (z) => z.zone_subtype === 'pool_spa',
        text: 'Indoor pool or spa: chloramines released from the water (trichloramine in particular) are the usual cause of eye and airway irritation at indoor aquatic facilities, and the air handling is designed to exhaust them at the water surface and to manage moisture and condensation. Verify the air-handling design against the CDC Model Aquatic Health Code and check for corrosion and condensation on cold surfaces. Where a spa or whirlpool is present, verify the property\'s water management program covers it — an aerosolizing water feature is within the scope of ASHRAE 188. This is a walkthrough observation, not a Legionella assessment.',
        sev: 'medium', std: 'CDC Model Aquatic Health Code; ASHRAE 188' },
      { condition: (z) => z.zone_subtype === 'fitness',
        text: 'Fitness room: ASHRAE 62.1 lists exercise spaces at a higher per-person outdoor-air rate than offices and lobbies because of the activity level. Verify the outdoor-air delivery against the design occupancy and that the room is not served as an afterthought from an adjacent system.',
        sev: 'low', std: 'ASHRAE 62.1-2025 Table 6.2.2.1' },
    ],
  },

  SENIOR_LIVING: {
    id: 'senior_living',
    label: 'Senior Living / Long-Term Care',
    // No achOverrides. ASHRAE 170-2021 carries its own table for residential
    // health, care and support facilities, and the figures for resident
    // rooms, bathing rooms and soiled utility were not entered here from a
    // checked copy. Enter them with the table citation when confirmed; until
    // then the findings name the standard and the reading is reported, not
    // judged.
    additionalStandards: [
      'ASHRAE 170-2021 (residential health, care and support facilities)',
      '42 CFR 483 (CMS requirements for long-term care facilities) — §483.10(i)(6) temperature, §483.80 infection prevention and control',
      'CMS QSO-17-30 (water management programs — Legionella), revised 2018; ASHRAE 188',
    ],
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
    contextFindings: [
      // CMS requires long-term care facilities certified after 1 October
      // 1990 to maintain 71–81 °F (42 CFR 483.10(i)(6)). That is a regulatory
      // range for a vulnerable population, stated beside the engine's ASHRAE
      // 55 comfort band rather than replacing it — a room can be inside the
      // CMS range and still a comfort finding, and the reverse. Documented in
      // standards-corpus.js (`cms-ltc-temperature`).
      { condition: (z) => z.zone_subtype === 'resident_room' && z.tf !== '' && z.tf != null && Number.isFinite(+z.tf) && (+z.tf < 71 || +z.tf > 81),
        text: (z) => `Resident room temperature ${z.tf} °F is outside the 71–81 °F range that CMS requires long-term care facilities certified after October 1, 1990 to maintain (42 CFR 483.10(i)(6)). Older adults regulate body temperature less well than the general population, so the regulatory range is narrower than a comfort band; verify the room setpoint and the unit's ability to hold it, and re-check at a different time of day.`,
        sev: 'medium', std: '42 CFR 483.10(i)(6)' },
      { condition: (z) => z.mi && z.mi !== 'None' && z.mi !== 'Suspected discoloration',
        text: 'Visible mold in a long-term care facility: the residents are an older and often immunocompromised population, and CMS requires the facility to run an infection prevention and control program. Route this through that program for evaluation and remediation planning rather than treating it as a housekeeping item.',
        sev: 'high', std: '42 CFR 483.80; EPA Mold Remediation in Schools and Commercial Buildings' },
      { condition: (z) => z.zone_subtype === 'bathing',
        text: 'Central bathing or shower room: showers and spa tubs aerosolize water, and CMS requires long-term care facilities to have a water management program addressing Legionella. Verify that the program exists and covers this room\'s fixtures, and that the room is exhausted and held negative to the corridor per the ASHRAE 170 design basis so moist air does not migrate into resident areas. This is a walkthrough observation, not a Legionella assessment.',
        sev: 'medium', std: 'CMS QSO-17-30; ASHRAE 188; ASHRAE 170-2021' },
      { condition: (z) => z.zone_subtype === 'utility',
        text: 'Soiled and clean utility: the ASHRAE 170 design basis holds soiled utility negative to the corridor and clean utility positive. Verify the pressure relationship at the door with a smoke source and that the exhaust runs continuously.',
        sev: 'medium', std: 'ASHRAE 170-2021' },
      { condition: (z) => z.zone_subtype === 'dining_activity' && z.co2 && +z.co2 > 1000,
        text: 'Dining or activity room CO₂ elevated during occupancy. These are the highest-density spaces in the building at mealtimes; verify the outdoor-air delivery against the mealtime occupancy rather than the average.',
        sev: 'medium', std: 'ASHRAE 170-2021; ASHRAE 62.1-2025 Table 6.2.2.1' },
      { condition: (z) => z.zone_subtype === 'kitchen',
        text: 'Kitchen: verify the cooking hood exhaust and make-up air balance. Cooking odor in the dining room or resident corridors means the kitchen is running positive to those spaces — a make-up air shortfall.',
        sev: 'medium', std: 'ASHRAE 62.1-2025 Table 6.5; IMC §507' },
    ],
  },

  CHILDCARE: {
    id: 'childcare',
    label: 'Childcare / Early Learning',
    additionalStandards: [
      'ASHRAE 62.1-2025 Table 6.2.2.1 (daycare through age 4; classrooms ages 5–8)',
      'EPA IAQ Tools for Schools',
      '40 CFR 745 (EPA lead Renovation, Repair and Painting rule — child-occupied facilities built before 1978)',
      'Caring for Our Children, 4th ed. (AAP / APHA / NRC) — national health and safety performance standards for early care and education',
    ],
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
    contextFindings: [
      { condition: (z) => isChildRoom(z) && !z.cfm_person,
        text: 'Child-occupied room outdoor air was not measured. ASHRAE 62.1 lists daycare (through age 4) at a higher per-area outdoor-air rate than a classroom, and the occupants cannot report stuffiness themselves; verify the OA damper is open and the design delivery rate is documented for the licensed capacity of the room.',
        sev: 'medium', std: 'ASHRAE 62.1-2025 Table 6.2.2.1' },
      { condition: (z) => isChildRoom(z) && z.co2 && +z.co2 > 1000,
        text: `Child-occupied room CO₂ above ${STD.v.co2.con} ppm during occupancy. CO₂ indexes outdoor-air delivery per occupant; with naps and full-day occupancy, a room that reads high in the afternoon has been short of outdoor air for hours. Verify the delivery against the licensed capacity.`,
        sev: 'medium', std: 'ASHRAE Position Document on Indoor Carbon Dioxide (2022)' },
      // Lead: RRP applies to child-occupied facilities built before 1978
      // when renovation disturbs painted surfaces. `ba` (year built) and `rn`
      // (recent renovation) are building fields spread onto the zone.
      { condition: (z) => (isChildRoom(z) || z.zone_subtype === 'diapering') && preLeadRenovation(z),
        text: (z) => `Child-occupied facility built in ${z.ba} with renovation reported ${String(z.rn).toLowerCase()}: the EPA Renovation, Repair and Painting rule applies to work that disturbs painted surfaces in pre-1978 child-occupied facilities. Verify that the work was done under lead-safe practices by a certified firm and that post-work dust-wipe clearance was documented; where it was not, dust-wipe sampling of floors and window sills in this room is the next step.`,
        sev: 'high', std: '40 CFR 745 (EPA RRP)' },
      { condition: (z) => isChildRoom(z) && Array.isArray(z.src_internal) && z.src_internal.includes('Space heaters'),
        text: 'Space heater in a child-occupied room: if it is fuel-fired and unvented, its combustion products (CO, NO₂, fine particulate) go straight into the breathing zone of children, who are more susceptible to NO₂ than adults. Record the heater type; an unvented fuel-fired heater in this room is a removal item, and an electric one is a burn and tip-over item rather than an air-quality one.',
        sev: 'medium', std: 'EPA IAQ Tools for Schools; ASHRAE 62.1-2025 §5' },
      { condition: (z) => (isChildRoom(z) || z.zone_subtype === 'diapering')
          && z.op && z.op !== 'None' && Array.isArray(z.ot) && z.ot.includes('Chemical'),
        text: 'Chemical odor in a child-occupied room: licensed childcare sanitizes and disinfects surfaces several times a day, and the products are the usual source. Verify that the products in use are applied at the labelled dilution, that the room is ventilated during and after application, and that concentrates are stored outside child-occupied rooms.',
        sev: 'medium', std: 'Caring for Our Children, 4th ed.; EPA IAQ Tools for Schools' },
      { condition: (z) => z.zone_subtype === 'diapering',
        text: 'Diapering area: verify that the space has continuous exhaust and that it is not open to a room where food is prepared or served; hand-washing and diapering sinks are separate from food-preparation sinks under the childcare health and safety standards.',
        sev: 'low', std: 'Caring for Our Children, 4th ed.; ASHRAE 62.1-2025 Table 6.5' },
      { condition: (z) => z.mi && z.mi !== 'None' && z.mi !== 'Suspected discoloration',
        text: 'Visible mold in a childcare facility: children are among the populations the EPA guidance singles out for damp-building exposure. Remediate on the EPA schools-and-commercial-buildings guidance and keep children out of the affected room until the work is complete.',
        sev: 'high', std: 'EPA Mold Remediation in Schools and Commercial Buildings' },
    ],
  },

  RESIDENTIAL: {
    id: 'residential',
    label: 'Residential',
    // ASHRAE 62.2 is the residential ventilation standard: a whole-dwelling
    // mechanical rate from floor area and bedroom count, plus local exhaust
    // in kitchens and bathrooms. The engine's cfm/person comparison is an
    // ASHRAE 62.1 (buildings) figure and does not describe a dwelling; the
    // findings below say so where a reading would otherwise be compared to
    // it.
    additionalStandards: [
      'ASHRAE 62.2-2022 (ventilation and acceptable indoor air quality in residential buildings)',
      'EPA — A Citizen\'s Guide to Radon (EPA 402-K-12-002)',
      '40 CFR 745 (EPA lead Renovation, Repair and Painting rule — target housing built before 1978)',
      'US EPA — Mold, Moisture and Your Home',
    ],
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
    contextFindings: [
      { condition: (z) => z.cfm_person,
        text: 'A cfm/person figure was recorded in a dwelling. The engine compares it to an ASHRAE 62.1 (buildings) rate; the residential standard is ASHRAE 62.2, which sets a whole-dwelling mechanical ventilation rate from floor area and bedroom count plus local exhaust in the kitchen and bathrooms. Read the per-person comparison as an indicator only and verify the dwelling against 62.2.',
        sev: 'low', std: 'ASHRAE 62.2-2022' },
      { condition: (z) => z.zone_subtype === 'kitchen',
        text: 'Kitchen: verify that the range hood exhausts outdoors (a recirculating hood provides no exhaust) and that it is used during cooking. Where the range is gas-fired, cooking without exhaust releases CO, NO₂ and fine particulate into the dwelling; a CO and PM2.5 reading during cooking is the check.',
        sev: 'medium', std: 'ASHRAE 62.2-2022 (local exhaust); EPA IAQ Tools for Schools + ASHRAE 62.1 §5 (combustion sources)' },
      { condition: (z) => z.zone_subtype === 'bathroom' && (z.hp === 'Too humid / stuffy' || (z.mi && z.mi !== 'None') || (z.wd && z.wd !== 'None')),
        text: 'Bathroom moisture or mold indicator: verify that the exhaust fan runs, moves air (a tissue held to the grille is the field check), terminates outdoors rather than in the attic, and is used during and after showers. A bathroom without working local exhaust is the most common moisture source in a dwelling.',
        sev: 'medium', std: 'ASHRAE 62.2-2022 (local exhaust); US EPA — Mold, Moisture and Your Home' },
      { condition: (z) => z.zone_subtype === 'basement',
        text: 'Basement or crawlspace: a ground-contact space. EPA recommends radon testing in all homes; if no test result is on file, a short-term test in the lowest lived-in level is the next step, and a walkthrough IAQ instrument does not measure it. Check for moisture at the slab and foundation walls and for a dryer or combustion appliance venting into the space.',
        sev: 'low', std: 'EPA 402-K-12-002 "A Citizen\'s Guide to Radon"; US EPA — Mold, Moisture and Your Home' },
      { condition: (z) => z.zone_subtype === 'garage',
        text: 'Attached garage: vehicle exhaust, stored fuel and solvents migrate into the dwelling through the connecting door, shared wall penetrations and any air handler or return located in the garage. Verify the separation (weather-stripped self-closing door, sealed penetrations), that no return or air handler draws from the garage, and take a CO reading in the adjacent living space with the garage door closed.',
        sev: 'medium', std: 'ASHRAE 62.2-2022; EPA IAQ Tools for Schools + ASHRAE 62.1 §5 (combustion sources)' },
      { condition: (z) => z.zone_subtype === 'bedroom' && z.co2 && +z.co2 > 1000,
        text: 'Bedroom CO₂ elevated. Bedrooms are occupied for the longest continuous period in a dwelling with the door often closed, so they are the room most likely to run short of outdoor air overnight; verify the dwelling\'s mechanical ventilation and whether the bedroom receives supply or transfer air with the door shut.',
        sev: 'medium', std: 'ASHRAE Position Document on Indoor Carbon Dioxide (2022); ASHRAE 62.2-2022' },
      { condition: (z) => z.zone_subtype === 'common' && z.path_crosstalk && z.path_crosstalk !== 'None observed',
        text: 'Cross-contamination in a multifamily common area or corridor: odor and smoke transfer between units and from corridors follows stack effect and any pressure imbalance between the corridor supply and unit exhaust. Verify the corridor make-up air and the unit compartmentalization; the source unit is usually below or upwind on the stack.',
        sev: 'medium', std: 'ASHRAE 62.2-2022' },
      // Stated in the rooms children spend time in, not in every zone of the
      // dwelling — it is one building-level fact.
      { condition: (z) => (z.zone_subtype === 'living' || z.zone_subtype === 'bedroom') && preLeadRenovation(z),
        text: (z) => `Dwelling built in ${z.ba} with renovation reported ${String(z.rn).toLowerCase()}: the EPA Renovation, Repair and Painting rule applies to work that disturbs painted surfaces in pre-1978 housing. Verify that the work was done under lead-safe practices and, where children under six live or spend time here, that post-work dust-wipe clearance was documented.`,
        sev: 'medium', std: '40 CFR 745 (EPA RRP)' },
      { condition: (z) => (z.zone_subtype === 'mechanical' || z.zone_subtype === 'laundry') && z.co && +z.co > STD.c.co.who24h,
        text: `CO above the WHO 24-hour indoor guideline (${STD.c.co.who24h} ppm) in the utility space. A fuel-fired furnace, water heater or dryer that is backdrafting or spilling at its draft hood is the usual source; verify the flue draft with the appliances firing and the dryer and exhaust fans running, which depressurize the space.`,
        sev: 'low', std: 'WHO Guidelines for Indoor Air Quality: Selected Pollutants (2010) — CO, 24-hour' },
    ],
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
