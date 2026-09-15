/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Demo scenario C — post-renovation formaldehyde, with a week of logger data.
 *
 * A post-renovation IAQ assessment of a college residence hall whose second
 * floor was refurbished three weeks earlier: new luxury-vinyl-plank flooring,
 * pressed-wood (particleboard / MDF) wardrobes, desks and bed frames, and a
 * repaint. Occupants report a persistent "new furniture" odor and evening eye
 * and throat irritation. A continuous multi-parameter logger ran for seven
 * days in one refurnished room before the walkthrough, and that record is
 * what this demo exists to show:
 *
 *   - Formaldehyde sits at roughly 0.03 ppm all week — above the NIOSH REL
 *     (0.016 ppm, a 10-hour TWA) but far below the OSHA action level — then
 *     rises to 0.10–0.11 ppm for one 25-hour window (27 May), above the WHO
 *     30-minute indoor guideline (0.081 ppm), and returns to baseline.
 *   - CO₂ runs ~840 ppm overnight and ~600 ppm by day: the room is slept in,
 *     and the fan-coil unit's outdoor-air share is what the corridor DOAS
 *     delivers, so the overnight rise is occupancy, not a failure.
 *   - TVOC (~450 ppb) and PM2.5 (~30 µg/m³) rise together at 18:00 on all
 *     seven days and are back to baseline within the hour — a recurring,
 *     short, coincident event, which the occupant interview places at the
 *     kitchenette across the corridor.
 *
 * The walkthrough readings (`hc: '0.032'`) are what a spot instrument reads
 * in the same room on the afternoon after the logger came down, and they
 * agree with the logger's own afternoon values. The point of the demo is
 * that the walkthrough alone would have recorded a modest exceedance of a
 * health-protective TWA; the logger is what found the excursion, the
 * overnight ventilation picture and the evening event.
 *
 * Fictional data for demonstration only — the site, the client, the
 * instruments' serial numbers and every walkthrough value are made up. The
 * logger series is the one real-world-shaped input: it is loaded verbatim
 * from the log workbook it was built from (see DEMO_HCHO_LOGGER_ROWS) and
 * parsed by the same code path as an uploaded file, so the Logger Studio
 * charts, the monitoring statistics and the report figures all read the
 * same 168 hourly rows.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { parseSensorRows, normalizeSensorData, SENSOR_DATA_VERSION } from '../utils/sensorParser'

export const DEMO_HCHO_PRESURVEY = {
  ps_survey_date: '2026-06-01',
  ps_assessor: 'A. Rivera, CIH, CSP',
  ps_assessor_certs: ['CIH', 'CSP'],
  ps_assessor_exp: '10-20 years',
  ps_project_number: 'PSEC-2026-0117',
  ps_recipient_name: 'Dana Whitfield',
  ps_recipient_title: 'Director of Residence Life',
  ps_recipient_organization: 'Alder Ridge College',
  ps_recipient_address1: '310 Ridgeview Road',
  ps_recipient_address2: 'Larkin Hall, Suite 100',
  ps_recipient_city: 'Fort Collins',
  ps_recipient_state: 'CO',
  ps_recipient_zip: '80521',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_serial: 'QT-2025-11423',
  ps_inst_iaq_accuracy: 'CO₂ ±3% rdg ±50 ppm · Temp ±0.5°C · RH ±3%',
  ps_inst_iaq_cal: '2026-04-14',
  ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
  ps_inst_pid: 'RAE Systems ppbRAE 3000',
  ps_inst_pid_accuracy: '±10% of reading · 1 ppb – 10,000 ppm',
  ps_inst_pid_cal: 'Bump-tested and calibrated',
  ps_inst_other: 'PPM Technology Formaldemeter htV-m (S/N HTV-33017; factory calibration 2026-03-20; 8-minute sample mode) for formaldehyde spot readings.',
  ps_reason: 'Post-renovation / construction',
  ps_reno_scope: ['Flooring replacement', 'Furniture / workstation install', 'Painting / wall finishing'],
  ps_reno_completion: '1-4 weeks ago',
  ps_reno_containment: 'No containment used',
  ps_reno_materials: ['Particleboard / MDF furniture', 'Vinyl / LVP flooring', 'Paint / coatings'],
  ps_reno_reoccupied: '2026-05-18',
  ps_reno_flushout: 'No',
  // The dated sequence the report's site background states. What used to
  // live only in ps_reno_detail free text.
  ps_timeline: [
    { id: 't1', date: '2026-05-08', kind: 'renovation_started', description: 'Second-floor refurbishment began: original furniture removed, floors stripped' },
    { id: 't2', date: '2026-05-13', kind: 'materials_installed', description: 'LVP flooring laid; particleboard / MDF wardrobes, desks and bed frames installed in Rooms 201–224; walls repainted' },
    { id: 't3', date: '2026-05-15', kind: 'renovation_completed', description: 'Refurbishment signed off; rooms cleaned' },
    { id: 't4', date: '2026-05-18', kind: 'reoccupied', description: 'Second floor re-occupied for the summer session' },
    { id: 't5', date: '2026-05-20', kind: 'complaints_began', description: 'Occupants of Rooms 212–216 report a persistent "new furniture" odor and evening eye irritation to Residence Life' },
    { id: 't6', date: '2026-05-25', kind: 'logger_placed', description: 'Facilities places a continuous IAQ logger in Room 214' },
    { id: 't7', date: '2026-06-01', kind: 'logger_retrieved', description: 'Logger retrieved; walkthrough assessment' },
  ],
  ps_prior: 'No — first assessment',
  ps_blueprints: 'Yes — reviewed',
  ps_design_oa: 'Yes — documented CFM',
  ps_design_oa_cfm: '1450',
  ps_bms: 'No BMS',
  ps_filter_schedule: 'Quarterly',
  ps_water_history: 'No known history',
  ps_pest: 'None recent',
  ps_reno_detail: 'Second-floor refurbishment completed 15 May 2026: luxury vinyl plank flooring over the original slab, new particleboard / MDF wardrobes, desks and bed frames in Rooms 201–224, and low-VOC latex repainting. Rooms were re-occupied on 18 May for the summer session. Occupants of Rooms 212–216 reported a persistent "new furniture" odor and evening eye irritation within the first week; Facilities requested the assessment and placed a logger in Room 214 on 25 May.',
}

export const DEMO_HCHO_BUILDING = {
  fn: 'Larkin Hall (Residence Hall), Alder Ridge College',
  fl: '310 Ridgeview Road, Fort Collins, CO 80521',
  ft: 'School / University',
  ba: '1998',
  rn: 'Within 30 days',
  ht: 'Fan Coil Units',
  hm: 'Within 6 months',
  fm: 'MERV 8 or lower',
  fc: 'Clean / Recent',
  sa: 'Normal airflow',
  od: 'Open — proper',
  dp: 'Clean — draining',
  bld_press_door: 'Neutral / indeterminate',
  bld_press_method: 'Smoke pencil',
  bld_press_door_behavior: 'Normal',
  bld_press_dp_measured: 'No — no instrument available',
  bld_pressure: 'Neutral',
  bld_exhaust: ['Restroom exhaust', 'Kitchen / break room hood'],
  bld_intake_proximity: ['Clear of sources'],
  wx_temp: '71',
  wx_rh: '38',
  wx_sky: 'Clear / Sunny',
  wx_precip: 'None in past 48 hours',
  wx_wind: 'Light (5-15 mph)',
  wx_notes: 'Clear, dry afternoon; no smoke, dust or traffic haze. Outdoor readings taken at the east entrance, upwind of the loading area.',
}

export const DEMO_HCHO_ZONES = [
  {
    zid: 'zone-214',
    zn: 'Room 214 (refurnished — logger location)',
    servingEquipmentIds: ['eq-fcu-214', 'eq-doas-1'],
    su: 'residential',
    zone_role: 'Complaint / affected area',
    sf: '210',
    oc: '2',
    cx: 'Yes — complaints reported',
    sy: ['Eye irritation', 'Throat irritation', 'Headache'],
    sr: 'Yes — clear pattern',
    ac: '1-2',
    cc: 'Scattered',
    sy_onset: 'Within the past month',
    sy_time: 'Evening / night',
    sy_days: 'Every day',
    sy_where: 'Throughout the room; strongest near the wardrobe',
    sy_relief: ['Leaving the building', 'Opening a window'],
    tc: 'Comfortable',
    hp: 'Comfortable',
    vd: 'None',
    wd: 'None',
    mi: 'None',
    op: 'Moderate persistent',
    ot: ['Off-gassing', 'Chemical'],
    src_internal: ['New furniture / carpet / paint'],
    src_adjacent: ['Kitchen / break room', 'New construction / renovation area'],
    src_detail: {
      'New furniture / carpet / paint': { what: 'Particleboard wardrobe, two MDF desks and two bed frames; luxury vinyl plank floor over the slab; latex repaint', installedOn: '2026-05-13', extent: 'Whole room; same fit-out in Rooms 201–224' },
      'Kitchen / break room': { what: 'Shared kitchenette across the corridor, in use each evening', extent: 'Corridor door undercut is the only connection' },
      'New construction / renovation area': { what: 'The refurbished second floor as a whole', installedOn: '2026-05-15', extent: 'Rooms 201–224' },
    },
    path_pressure: 'Neutral',
    // The outdoor-air estimate the readings screen offers once CO₂, the
    // outdoor baseline and the occupant count are in (ASHRAE 62.1 steady-
    // state mass balance), recorded as the prompt records it.
    cfm_person: '41',
    path_crosstalk: 'Odors migrating from adjacent space',
    path_crosstalk_source: 'Cooking odors from the second-floor kitchenette across the corridor are noticeable in the room each evening. The logger records a coincident TVOC and PM2.5 rise at 18:00 on all seven days, back to baseline within the hour.',
    zone_checks: {
      door_smoke: { result: 'Neutral / indeterminate', method: 'Smoke pencil' },
      diffuser_airflow: { result: 'Normal', method: 'Felt by hand' },
      damper_seen: { result: 'Open', method: 'Visual' },
      drain_pan_seen: { result: 'Clean — draining', method: 'Visual' },
    },
    logger_deployment: {
      placed: true,
      instrument: 'Multi-parameter IAQ logger (NDIR CO₂, optical PM2.5, PID TVOC, electrochemical formaldehyde, temperature, RH)',
      serial: 'LG-2026-0412',
      position: 'Desk / work surface',
      height_m: '1.1',
      start: '2026-05-25T00:00',
      end: '2026-06-01T09:30',
      interval_min: '60',
      events: [
        { id: 'e1', at: '2026-05-25T18:00', kind: 'cooking', description: 'Kitchenette across the corridor in use; repeats at 18:00 every evening of the logging period' },
        { id: 'e2', at: '2026-05-26T21:00', kind: 'delivery', description: 'Replacement wardrobes for Rooms 218–220 unpacked and staged in the second-floor corridor overnight' },
        { id: 'e3', at: '2026-05-27T19:30', kind: 'delivery', description: 'Staged wardrobes installed and packaging removed from the floor' },
      ],
    },
    co2: '618',
    co2o: '412',
    tf: '73.4',
    tfo: '71',
    rh: '44',
    rho: '38',
    pm: '6.4',
    pmo: '9.1',
    co: '0',
    tv: '345',
    tvo: '85',
    hc: '0.032',
    meas_time: '2:10 PM',
    meas_occ: 'Below typical',
    meas_duration: '15-minute average',
    meas_conditions: 'Yes — normal operations',
    pid_lamp: '10.6 eV',
    pid_cal_gas: 'Isobutylene 100 ppm',
    pid_rf: '1.0',
    tvoc_source_class: 'Off-gassing materials',
    znt: 'Double room, re-occupied 18 May after the refurbishment. New particleboard wardrobe, two MDF desks and two bed frames; luxury vinyl plank floor; walls repainted. A distinct resinous "new furniture" odor is apparent on entry and persists. No visible dust, moisture or staining. The fan-coil unit runs continuously on low; its outdoor-air share is what the corridor DOAS delivers through the door undercut. Both occupants report eye and throat irritation that is worst in the evening and clears within an hour of leaving the building. The 7-day logger sat on the desk at 1.1 m, away from the window and the FCU discharge; its afternoon values on 31 May (CO₂ 636 ppm, 22.4 °C, 47% RH, PM2.5 8.4 µg/m³, TVOC 149 ppb, formaldehyde 0.040 mg/m³ ≈ 0.033 ppm) agree with these walkthrough readings.',
  },
  {
    zid: 'zone-108',
    zn: 'Room 108 (original furniture — comparison)',
    servingEquipmentIds: ['eq-fcu-108', 'eq-doas-1'],
    su: 'residential',
    zone_role: 'Comparison area (no complaint)',
    sf: '210',
    oc: '2',
    cx: 'No complaints',
    tc: 'Comfortable',
    hp: 'Comfortable',
    vd: 'None',
    wd: 'None',
    mi: 'None',
    op: 'None',
    src_internal: ['None identified'],
    src_adjacent: ['None of concern'],
    path_pressure: 'Neutral',
    path_crosstalk: 'None observed',
    cfm_person: '44',
    zone_checks: {
      door_smoke: { result: 'Neutral / indeterminate', method: 'Smoke pencil' },
      diffuser_airflow: { result: 'Normal', method: 'Felt by hand' },
    },
    co2: '605',
    co2o: '412',
    tf: '73.8',
    tfo: '71',
    rh: '45',
    rho: '38',
    pm: '5.8',
    pmo: '9.1',
    co: '0',
    tv: '175',
    tvo: '85',
    hc: '0.011',
    meas_time: '2:45 PM',
    meas_occ: 'Below typical',
    meas_duration: '15-minute average',
    meas_conditions: 'Yes — normal operations',
    pid_lamp: '10.6 eV',
    pid_cal_gas: 'Isobutylene 100 ppm',
    pid_rf: '1.0',
    tvoc_source_class: 'Unknown',
    znt: 'First-floor double room of the same plan and orientation, served by the same DOAS and an identical fan-coil unit; not part of the refurbishment (original 1998 solid-wood furniture, sheet-vinyl floor, last repainted 2022). Chosen as the comparison space. No odor, no complaints. Formaldehyde reads at about a third of Room 214 and TVOC at half, with CO₂, temperature, RH and PM2.5 essentially the same — the difference between the two rooms is their contents, not their ventilation.',
  },
]

// HVAC equipment. One rooftop dedicated outdoor-air unit ventilates the
// corridors and, through door undercuts, the rooms; each room has its own
// fan-coil unit for heating and cooling. Both were serviced at the
// refurbishment turnover.
export const DEMO_HCHO_EQUIPMENT = [
  {
    id: 'eq-doas-1',
    label: 'DOAS-1',
    type: 'DOAS',
    location: 'Roof, above the east stair',
    servedZoneIds: ['zone-214', 'zone-108'],
    filterClass: 'MERV 13',
    lastServiceDate: '2026-05-12',
  },
  {
    id: 'eq-fcu-214',
    label: 'FCU-214',
    type: 'FCU',
    location: 'Room 214, below the window',
    servedZoneIds: ['zone-214'],
    filterClass: 'MERV 8 or lower',
    lastServiceDate: '2026-05-12',
  },
  {
    id: 'eq-fcu-108',
    label: 'FCU-108',
    type: 'FCU',
    location: 'Room 108, below the window',
    servedZoneIds: ['zone-108'],
    filterClass: 'MERV 8 or lower',
    lastServiceDate: '2026-05-12',
  },
]

// The logger record, verbatim from the workbook it was built from
// (IAQ_HCHO_Detailed_Log.xlsx): one header row and 168 hourly rows,
// 25 May 00:00 through 31 May 23:00. Units are the workbook's own —
// temperature in °C and formaldehyde in mg/m³ — and the parser converts them
// exactly as it would for an uploaded file (formaldehyde to ppb, the
// temperature scale carried through), so the demo exercises the same
// normalization a real log does.
export const DEMO_HCHO_LOGGER_FILE = 'IAQ_HCHO_Detailed_Log.xlsx'
export const DEMO_HCHO_LOGGER_ROWS = [
  ['Timestamp', 'Temp (°C)', 'Humidity (%)', 'CO2 (ppm)', 'TVOC (ppb)', 'HCHO (mg/m³)', 'PM2.5 (µg/m³)'],
  ['2026-05-25 00:00', 21.82, 46.2, 886, 184, 0.037, 7.5],
  ['2026-05-25 01:00', 22.24, 45, 821, 146, 0.04, 6.8],
  ['2026-05-25 02:00', 22.07, 46.2, 853, 134, 0.04, 6.2],
  ['2026-05-25 03:00', 22.44, 43.1, 847, 141, 0.034, 8.7],
  ['2026-05-25 04:00', 23.44, 40.7, 853, 144, 0.035, 4],
  ['2026-05-25 05:00', 22.87, 42.8, 849, 129, 0.038, 2.6],
  ['2026-05-25 06:00', 22.59, 43.5, 836, 178, 0.031, 3.6],
  ['2026-05-25 07:00', 23.2, 47, 846, 166, 0.049, 2.7],
  ['2026-05-25 08:00', 22.76, 47.8, 564, 174, 0.047, 6.6],
  ['2026-05-25 09:00', 22.87, 52, 589, 124, 0.037, 2.5],
  ['2026-05-25 10:00', 23.07, 44.2, 692, 124, 0.046, 5.7],
  ['2026-05-25 11:00', 22.7, 47.1, 598, 146, 0.042, 2.8],
  ['2026-05-25 12:00', 22.41, 42.7, 610, 140, 0.038, 6.7],
  ['2026-05-25 13:00', 22.81, 47, 590, 164, 0.034, 3.6],
  ['2026-05-25 14:00', 22.43, 43.6, 576, 167, 0.033, 2.7],
  ['2026-05-25 15:00', 22, 45.6, 571, 167, 0.034, 3.9],
  ['2026-05-25 16:00', 21.86, 46.2, 611, 170, 0.03, 6],
  ['2026-05-25 17:00', 21.7, 53.5, 600, 168, 0.041, 6],
  ['2026-05-25 18:00', 21.83, 43.3, 630, 449, 0.052, 31],
  ['2026-05-25 19:00', 21.16, 47.1, 570, 169, 0.021, 1.4],
  ['2026-05-25 20:00', 21.06, 42.6, 593, 185, 0.033, 1.6],
  ['2026-05-25 21:00', 20.89, 45.4, 639, 157, 0.034, 6.2],
  ['2026-05-25 22:00', 20.95, 43.5, 592, 161, 0.027, 4.6],
  ['2026-05-25 23:00', 21.39, 45, 562, 137, 0.033, 4.6],
  ['2026-05-26 00:00', 21.03, 47.5, 831, 193, 0.029, 2.9],
  ['2026-05-26 01:00', 21.04, 43.8, 896, 150, 0.042, 5.5],
  ['2026-05-26 02:00', 21.1, 48.2, 844, 154, 0.034, 6.3],
  ['2026-05-26 03:00', 20.97, 46.7, 871, 162, 0.03, 6.1],
  ['2026-05-26 04:00', 21.27, 43.8, 893, 170, 0.036, 3.4],
  ['2026-05-26 05:00', 21.98, 47, 785, 165, 0.039, 7.7],
  ['2026-05-26 06:00', 21.98, 43.7, 828, 138, 0.03, 6.3],
  ['2026-05-26 07:00', 21.92, 43.6, 825, 152, 0.027, 5.9],
  ['2026-05-26 08:00', 22.58, 46, 636, 145, 0.039, 5.4],
  ['2026-05-26 09:00', 22.58, 43.9, 627, 130, 0.028, 5.1],
  ['2026-05-26 10:00', 22.28, 46.3, 630, 114, 0.042, 6.6],
  ['2026-05-26 11:00', 22.77, 43.6, 576, 124, 0.045, 6.1],
  ['2026-05-26 12:00', 22.83, 47.3, 607, 142, 0.037, 6],
  ['2026-05-26 13:00', 22.87, 48.3, 614, 167, 0.036, 4.1],
  ['2026-05-26 14:00', 23.1, 43.7, 636, 148, 0.033, 5.8],
  ['2026-05-26 15:00', 23.03, 45.5, 612, 180, 0.035, 2.4],
  ['2026-05-26 16:00', 22.94, 45.5, 612, 159, 0.03, 6],
  ['2026-05-26 17:00', 22.88, 44.3, 595, 156, 0.034, 6.7],
  ['2026-05-26 18:00', 23.05, 42.9, 655, 446, 0.062, 29.9],
  ['2026-05-26 19:00', 22.6, 44.6, 625, 170, 0.035, 6.3],
  ['2026-05-26 20:00', 22.44, 46.4, 587, 162, 0.04, 6],
  ['2026-05-26 21:00', 22.23, 49.1, 596, 154, 0.048, 7.1],
  ['2026-05-26 22:00', 22.04, 45.8, 588, 165, 0.041, 4.9],
  ['2026-05-26 23:00', 21.88, 44, 621, 187, 0.025, 1.4],
  ['2026-05-27 00:00', 21.95, 46.9, 846, 172, 0.12, 6.5],
  ['2026-05-27 01:00', 21.88, 42.9, 870, 152, 0.117, 6.6],
  ['2026-05-27 02:00', 21.42, 42.6, 838, 129, 0.105, 6.7],
  ['2026-05-27 03:00', 21.36, 46.9, 858, 138, 0.119, 8.4],
  ['2026-05-27 04:00', 21.37, 45.3, 832, 153, 0.111, 3.9],
  ['2026-05-27 05:00', 21.23, 43.6, 855, 171, 0.105, 8.6],
  ['2026-05-27 06:00', 21.03, 45.8, 880, 114, 0.113, 3.7],
  ['2026-05-27 07:00', 20.79, 45.2, 846, 161, 0.108, 4.6],
  ['2026-05-27 08:00', 21.28, 45.2, 603, 146, 0.114, 4.3],
  ['2026-05-27 09:00', 21.05, 47.4, 596, 166, 0.1, 7.2],
  ['2026-05-27 10:00', 21.34, 42.3, 582, 181, 0.105, 7.6],
  ['2026-05-27 11:00', 20.92, 40.2, 560, 148, 0.113, 7.2],
  ['2026-05-27 12:00', 21.65, 44.2, 557, 169, 0.104, 4.2],
  ['2026-05-27 13:00', 21.72, 45.8, 613, 141, 0.121, 8.4],
  ['2026-05-27 14:00', 22, 46.5, 641, 120, 0.118, 7.7],
  ['2026-05-27 15:00', 22.22, 43.7, 599, 170, 0.113, 6.2],
  ['2026-05-27 16:00', 22.34, 47, 663, 104, 0.118, 2.4],
  ['2026-05-27 17:00', 22.33, 44.7, 618, 179, 0.113, 3.6],
  ['2026-05-27 18:00', 22.5, 43.7, 574, 478, 0.133, 27.9],
  ['2026-05-27 19:00', 22.6, 47.3, 591, 174, 0.119, 4.3],
  ['2026-05-27 20:00', 22.81, 42.6, 617, 140, 0.111, 5.5],
  ['2026-05-27 21:00', 22.82, 45.4, 572, 181, 0.119, 3.9],
  ['2026-05-27 22:00', 22.79, 44.4, 610, 122, 0.119, 9.9],
  ['2026-05-27 23:00', 23.31, 45.6, 614, 134, 0.124, 5.7],
  ['2026-05-28 00:00', 23.02, 42.8, 829, 142, 0.113, 4.4],
  ['2026-05-28 01:00', 23.3, 46.7, 877, 183, 0.039, 4.5],
  ['2026-05-28 02:00', 22.89, 40.9, 796, 161, 0.039, 6.6],
  ['2026-05-28 03:00', 22.5, 44.6, 865, 144, 0.029, 7.8],
  ['2026-05-28 04:00', 22.47, 41.5, 875, 139, 0.029, 7.9],
  ['2026-05-28 05:00', 22.12, 46.2, 871, 136, 0.04, 0.9],
  ['2026-05-28 06:00', 22.03, 45.9, 799, 165, 0.036, 3.2],
  ['2026-05-28 07:00', 22.06, 47.6, 834, 167, 0.037, 5.7],
  ['2026-05-28 08:00', 21.65, 43.2, 595, 169, 0.037, 6.1],
  ['2026-05-28 09:00', 21.63, 47.5, 617, 131, 0.037, 7],
  ['2026-05-28 10:00', 21.49, 46.4, 583, 167, 0.035, 7.8],
  ['2026-05-28 11:00', 21.32, 45.5, 622, 173, 0.039, 6.9],
  ['2026-05-28 12:00', 21.06, 44.2, 594, 180, 0.039, 5.8],
  ['2026-05-28 13:00', 21.21, 47.3, 598, 167, 0.036, 7.7],
  ['2026-05-28 14:00', 21.14, 48.1, 554, 133, 0.033, 5.9],
  ['2026-05-28 15:00', 21.14, 45.6, 580, 157, 0.028, 3.3],
  ['2026-05-28 16:00', 21.28, 43.9, 583, 172, 0.027, 5.3],
  ['2026-05-28 17:00', 21.17, 40, 641, 186, 0.016, 5.1],
  ['2026-05-28 18:00', 21.11, 42.5, 607, 432, 0.054, 29.7],
  ['2026-05-28 19:00', 21.42, 45.5, 600, 167, 0.027, 3.8],
  ['2026-05-28 20:00', 21.88, 46.9, 601, 164, 0.043, 8.5],
  ['2026-05-28 21:00', 22.01, 45.1, 547, 117, 0.039, 6.5],
  ['2026-05-28 22:00', 21.95, 43.9, 652, 130, 0.027, 6],
  ['2026-05-28 23:00', 22.44, 50.9, 621, 176, 0.038, 5.9],
  ['2026-05-29 00:00', 22.33, 46.3, 786, 140, 0.043, 3.4],
  ['2026-05-29 01:00', 22.53, 48.3, 849, 159, 0.039, 5.6],
  ['2026-05-29 02:00', 22.55, 49.5, 854, 169, 0.042, 7.5],
  ['2026-05-29 03:00', 22.66, 44.5, 878, 134, 0.031, 4.1],
  ['2026-05-29 04:00', 22.86, 48.3, 800, 162, 0.049, 4.5],
  ['2026-05-29 05:00', 23, 42.4, 805, 159, 0.041, 7.2],
  ['2026-05-29 06:00', 22.78, 41.6, 843, 152, 0.034, 7],
  ['2026-05-29 07:00', 22.93, 42, 852, 149, 0.045, 5.7],
  ['2026-05-29 08:00', 23.09, 46.2, 608, 143, 0.039, 5.6],
  ['2026-05-29 09:00', 23.01, 43.9, 586, 146, 0.028, 3.4],
  ['2026-05-29 10:00', 22.44, 46.5, 578, 160, 0.043, 5],
  ['2026-05-29 11:00', 22.58, 47.9, 576, 138, 0.045, 3.8],
  ['2026-05-29 12:00', 22.44, 45.8, 603, 123, 0.039, 5.4],
  ['2026-05-29 13:00', 22.13, 43.6, 580, 151, 0.033, 6.1],
  ['2026-05-29 14:00', 21.8, 45.3, 612, 145, 0.029, 8],
  ['2026-05-29 15:00', 21.72, 43.4, 570, 153, 0.026, 0.1],
  ['2026-05-29 16:00', 21.92, 42.9, 590, 146, 0.035, 7.4],
  ['2026-05-29 17:00', 21.25, 43.6, 641, 123, 0.023, 7.6],
  ['2026-05-29 18:00', 21.11, 43.4, 586, 453, 0.057, 32],
  ['2026-05-29 19:00', 21.34, 42.4, 510, 165, 0.027, 1.4],
  ['2026-05-29 20:00', 20.98, 43.7, 600, 158, 0.029, 4.5],
  ['2026-05-29 21:00', 20.86, 42.8, 570, 126, 0.03, 7.2],
  ['2026-05-29 22:00', 20.79, 43.4, 645, 175, 0.025, 6.1],
  ['2026-05-29 23:00', 20.97, 42.8, 601, 150, 0.032, 5.1],
  ['2026-05-30 00:00', 20.89, 46.2, 830, 166, 0.021, 3.8],
  ['2026-05-30 01:00', 21.13, 43.7, 843, 181, 0.029, 5.3],
  ['2026-05-30 02:00', 21.06, 46.1, 863, 148, 0.035, 7.1],
  ['2026-05-30 03:00', 21.59, 47.8, 801, 147, 0.037, 4.2],
  ['2026-05-30 04:00', 21.91, 47.9, 884, 125, 0.036, 4],
  ['2026-05-30 05:00', 21.8, 45.7, 860, 147, 0.026, 8.3],
  ['2026-05-30 06:00', 22.2, 46.4, 853, 130, 0.052, 5.6],
  ['2026-05-30 07:00', 21.92, 46.8, 861, 126, 0.036, 6.7],
  ['2026-05-30 08:00', 22.69, 45.7, 607, 173, 0.04, 5.1],
  ['2026-05-30 09:00', 22.5, 43.7, 578, 154, 0.041, 5.1],
  ['2026-05-30 10:00', 22.73, 45.8, 598, 129, 0.037, 5.4],
  ['2026-05-30 11:00', 22.92, 45.7, 620, 100, 0.038, 4.2],
  ['2026-05-30 12:00', 23.02, 42, 562, 129, 0.038, 5.3],
  ['2026-05-30 13:00', 23.13, 46.2, 655, 152, 0.043, 6.3],
  ['2026-05-30 14:00', 22.94, 45.4, 580, 155, 0.042, 2.1],
  ['2026-05-30 15:00', 22.85, 44.6, 584, 162, 0.035, 6.1],
  ['2026-05-30 16:00', 22.88, 42.6, 618, 134, 0.035, 8.5],
  ['2026-05-30 17:00', 22.86, 44, 623, 127, 0.042, 6.3],
  ['2026-05-30 18:00', 22.53, 46.1, 584, 477, 0.055, 31.5],
  ['2026-05-30 19:00', 22.65, 45.3, 625, 142, 0.043, 3.3],
  ['2026-05-30 20:00', 22.53, 45.5, 626, 148, 0.038, 2.9],
  ['2026-05-30 21:00', 22.39, 43.1, 595, 156, 0.033, 4.2],
  ['2026-05-30 22:00', 21.81, 42.1, 659, 147, 0.036, 4.1],
  ['2026-05-30 23:00', 21.51, 46.1, 599, 155, 0.034, 7],
  ['2026-05-31 00:00', 21.53, 46.1, 846, 136, 0.022, 5.8],
  ['2026-05-31 01:00', 21.09, 43.1, 800, 169, 0.032, 14.3],
  ['2026-05-31 02:00', 21.22, 46.1, 862, 156, 0.03, 3.9],
  ['2026-05-31 03:00', 20.89, 44.9, 850, 137, 0.034, 5.5],
  ['2026-05-31 04:00', 20.75, 45.6, 838, 161, 0.037, 5.5],
  ['2026-05-31 05:00', 20.67, 43.8, 878, 140, 0.025, 2.8],
  ['2026-05-31 06:00', 20.78, 46.1, 824, 143, 0.03, 2.8],
  ['2026-05-31 07:00', 21.07, 41, 845, 140, 0.033, 5.7],
  ['2026-05-31 08:00', 21.35, 45.8, 652, 152, 0.032, 5.4],
  ['2026-05-31 09:00', 21.52, 44.6, 602, 127, 0.029, 5.9],
  ['2026-05-31 10:00', 21.42, 44.8, 565, 148, 0.032, 4.5],
  ['2026-05-31 11:00', 21.65, 41.5, 596, 161, 0.033, 4.6],
  ['2026-05-31 12:00', 22.38, 42.9, 611, 136, 0.037, 3.9],
  ['2026-05-31 13:00', 21.98, 43.5, 604, 159, 0.038, 2.1],
  ['2026-05-31 14:00', 22.42, 47, 636, 149, 0.04, 8.4],
  ['2026-05-31 15:00', 22.28, 42.3, 604, 162, 0.043, 8.6],
  ['2026-05-31 16:00', 22.86, 45.2, 569, 167, 0.043, 7.7],
  ['2026-05-31 17:00', 22.8, 40.2, 620, 147, 0.041, 5.1],
  ['2026-05-31 18:00', 23.06, 44.3, 652, 436, 0.062, 35.1],
  ['2026-05-31 19:00', 23.35, 45.9, 598, 124, 0.049, 4],
  ['2026-05-31 20:00', 23.21, 45.6, 639, 163, 0.042, 3.2],
  ['2026-05-31 21:00', 22.89, 44.4, 591, 137, 0.052, 7.2],
  ['2026-05-31 22:00', 23.16, 43.5, 555, 131, 0.036, 6.3],
  ['2026-05-31 23:00', 22.56, 44.3, 632, 143, 0.045, 6.8],
]

// Overnight occupancy, 23:00–07:00 each night, as the occupants described
// it. Shaded on the charts and used by the monitoring statistics to split
// occupied from unoccupied hours; the CO₂ rise sits inside these windows.
const NIGHTS = ['2026-05-24', '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31']
const localMs = (ymd, hh) => new Date(`${ymd}T${String(hh).padStart(2, '0')}:00:00`).getTime()
const nextDay = (ymd) => { const d = new Date(`${ymd}T12:00:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

/**
 * The demo's Logger Studio envelope: the parsed primary indoor dataset, the
 * four timelines the report embeds flagged "Include in report" (the images
 * are rasterized at export, as for any assessment), the CO₂ and PM
 * reference lines on, and the overnight occupancy windows. Built fresh each
 * time so the demo never carries a stale parse.
 */
export function buildDemoHchoSensorData() {
  const parsed = parseSensorRows(DEMO_HCHO_LOGGER_ROWS, { fileName: DEMO_HCHO_LOGGER_FILE })
  if (!parsed) return null
  const occupancyWindows = NIGHTS.map((night, i) => ({
    id: `night-${i + 1}`,
    kind: 'occupied',
    label: 'Overnight occupancy',
    start: localMs(night, 23),
    end: localMs(nextDay(night), 7),
  }))
  return normalizeSensorData({
    version: SENSOR_DATA_VERSION,
    datasets: [{ id: 'primary', role: 'indoor', label: 'Room 214 — indoor', ...parsed }],
    occupancyWindows,
    thresholds: { co2: true, rh: true, pm: true },
    graphs: {
      hcho: { include: true, caption: 'Formaldehyde, Room 214, hourly averages 25–31 May 2026. Baseline ≈ 0.037 mg/m³ (0.03 ppm); one 25-hour excursion on 27 May to 0.10–0.13 mg/m³ (0.08–0.11 ppm).' },
      // No "below the 1,000 ppm advisory" clause. 1,000 ppm is a NIOSH
      // screening trigger point (STD.v.co2.con), not an advisory limit and
      // not an ASHRAE figure, and the report states in Methods that ASHRAE
      // 62.1 prescribes ventilation rates rather than a CO2 limit. A
      // hand-written caption asserting a threshold the report declines to
      // apply is a second reference model living in the fixture.
      co2: { include: true, caption: 'CO₂, Room 214. About 840 ppm overnight while the room is slept in, about 600 ppm by day, tracking occupancy.' },
      pm: { include: true, caption: 'PM2.5, Room 214. Baseline 2–10 µg/m³ with a one-hour rise to about 30 µg/m³ at 18:00 every day, coincident with the TVOC rise.' },
      tvoc: { include: true, caption: 'TVOC (PID, isobutylene-equivalent), Room 214. Baseline 100–190 ppb with a one-hour rise to 430–480 ppb at 18:00 every day.' },
    },
  })
}
