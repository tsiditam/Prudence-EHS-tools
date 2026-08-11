/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Demo scenario B — building with multiple findings.
 *
 * A complaint-driven IAQ assessment of an older commercial building with
 * deferred HVAC maintenance and a recurring roof leak. It exercises several
 * finding types at once: inadequate ventilation (CO₂-only basis), an indoor
 * particulate source pattern, elevated TVOC, a critical HVAC hygiene condition
 * (standing water in the drain pan), moisture / suspected microbial growth,
 * occupant complaints, and thermal-comfort excursions. Fictional data for
 * demonstration only — every value is made up.
 *
 * Contact: tsidi@prudenceehs.com
 */

export const DEMO_FINDINGS_PRESURVEY = {
  ps_assessor: 'A. Rivera, CIH, CSP',
  ps_assessor_certs: ['CIH', 'CSP'],
  ps_assessor_exp: '10-20 years',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_serial: 'QT-2025-11423',
  ps_inst_iaq_accuracy: 'CO₂ ±3% rdg ±50 ppm · Temp ±0.5°C · RH ±3%',
  ps_inst_iaq_cal: '2026-06-02',
  ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
  ps_inst_pid: 'RAE Systems MiniRAE 3000',
  ps_inst_pid_accuracy: '±10% of reading · range 0–15,000 ppm',
  ps_inst_pid_cal: 'Bump-tested and calibrated',
  ps_reason: 'Occupant complaint(s)',
  ps_complaint_narrative: 'Multiple occupants on the 4th floor reported persistent headaches, fatigue, and eye irritation over the past month. Symptoms are reportedly worse in the afternoon and improve on weekends. A recurring roof leak above the northeast corner has not been fully resolved.',
  ps_complaint_severity: 'Significant — multiple occupants affected',
  ps_complaint_formal: 'Yes — to management / HR',
  ps_prior: 'Yes — with findings',
  ps_prior_notes: 'A 2024 walkthrough noted marginal ventilation and a filter-change backlog on the 4th-floor air handler; corrective actions were only partially completed.',
  ps_blueprints: 'Yes — reviewed',
  ps_design_oa: 'Partially — some zones',
  ps_design_oa_cfm: '',
  ps_filter_schedule: 'As-needed',
  ps_water_history: 'Yes — recurring',
  ps_water_detail: 'Recurring roof leak above the 4th-floor northeast corner. Last patched November 2025; reported leaking again March 2026.',
  ps_complaint_count: '9',
  ps_complaint_timeline: '1-6 months ago',
  ps_affected_areas: '4th Floor — open office and Conference Room C',
}

export const DEMO_FINDINGS_BUILDING = {
  fn: 'Harborview Corporate Center',
  fl: '85 Wharf Street, 4th Floor, Portland, ME 04101',
  ft: 'Commercial Office',
  ba: '1994',
  rn: 'No',
  ht: 'Central AHU — VAV',
  hm: 'Over 12 months',
  fm: 'MERV 8 or lower',
  fc: 'Heavily loaded',
  sa: 'Weak / reduced',
  od: 'Closed / minimum',
  dp: 'Standing water',
  bld_pressure: 'Negative (air pulls in)',
  bld_exhaust: ['Restroom exhaust', 'Kitchen / break room hood'],
  bld_intake_proximity: ['Near loading dock', 'Near parking garage'],
  wx_temp: '70',
  wx_rh: '64',
  wx_sky: 'Overcast',
  wx_precip: 'Light rain within 24 hours',
  wx_wind: 'Light (5-15 mph)',
}

export const DEMO_FINDINGS_ZONES = [
  {
    zid: 'zone-4f-open',
    zn: '4th Floor Open Office',
    servingEquipmentIds: ['eq-ahu-4'],
    su: 'office',
    sf: '4400',
    oc: '38',
    cx: 'Yes — complaints reported',
    sy: ['Headache', 'Fatigue', 'Eye irritation', 'Concentration issues', 'Nasal congestion'],
    sr: 'Yes — clear pattern',
    ac: '6-10',
    cc: 'Yes — this zone',
    tc: 'Too hot',
    hp: 'Too humid / stuffy',
    vd: 'Light surface dust',
    wd: 'Old staining',
    wl: ['Ceiling'],
    mi: 'Suspected discoloration',
    op: 'Moderate persistent',
    ot: ['Musty / Earthy'],
    src_internal: ['New furniture / carpet / paint'],
    path_pressure: 'Negative (draws in)',
    path_crosstalk: 'Odors migrating from adjacent space',
    path_crosstalk_source: 'Break room cooking odors entering through the ceiling plenum',
    co2: '1380',
    co2o: '430',
    tf: '78',
    tfo: '70',
    rh: '63',
    rho: '64',
    pm: '30',
    pmo: '11',
    co: '2',
    tv: '720',
    tvo: '90',
    hc: '0.021',
    meas_time: '2:20 PM',
    meas_occ: 'Typical occupancy',
    meas_duration: '15-minute average',
    meas_conditions: 'Yes — normal operations',
    znt: 'Ceiling tiles show water staining in the NE quadrant with a persistent musty odor. Supply diffusers produce weak airflow and the outdoor-air damper was observed near minimum. Indoor PM2.5 is elevated well above the concurrent outdoor reading. Occupants report symptoms worse after lunch.',
  },
  {
    zid: 'zone-conf-c',
    zn: 'Conference Room C',
    servingEquipmentIds: ['eq-ahu-4'],
    su: 'conference',
    sf: '500',
    oc: '12',
    cx: 'Yes — complaints reported',
    sy: ['Headache', 'Fatigue', 'Concentration issues'],
    sr: 'Partially',
    ac: '3-5',
    cc: 'Yes — this zone',
    tc: 'Too hot',
    hp: 'Too humid / stuffy',
    vd: 'None',
    wd: 'Active leak',
    wl: ['Ceiling', 'Walls'],
    mi: 'Small (< 10 sq ft)',
    op: 'Moderate persistent',
    ot: ['Musty / Earthy'],
    src_adjacent: ['Restrooms'],
    path_pressure: 'Negative (draws in)',
    path_crosstalk: 'None observed',
    co2: '1460',
    co2o: '430',
    tf: '79',
    rh: '67',
    pm: '19',
    co: '1',
    tv: '340',
    hc: '0.008',
    meas_time: '3:05 PM',
    meas_occ: 'Above typical (meeting in session)',
    meas_duration: '15-minute average',
    meas_conditions: 'No — doors/windows open',
    znt: 'Active water intrusion from the roof leak visible in the NE corner, with a small area of suspected microbial growth on a ceiling tile and the upper wall. CO₂ climbed during an occupied meeting; the room lacks a dedicated outdoor-air supply.',
  },
]

// HVAC equipment serving both 4th-floor zones — service deferred, drain-pan
// hygiene condition present.
export const DEMO_FINDINGS_EQUIPMENT = [
  {
    id: 'eq-ahu-4',
    label: 'AHU-4',
    type: 'AHU',
    location: '4th-floor mechanical room',
    servedZoneIds: ['zone-4f-open', 'zone-conf-c'],
    filterClass: 'MERV 8 or lower',
    lastServiceDate: '2025-01-22',
  },
]
