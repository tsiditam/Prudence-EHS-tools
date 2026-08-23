/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Demo scenario A — "Clean" / well-run building.
 *
 * A routine, proactive IAQ assessment of a modern, well-maintained commercial
 * office. Adequate measured outdoor-air delivery, current HVAC maintenance, no
 * occupant complaints, and conditions within screening ranges. Fictional data
 * for demonstration only — every value is made up.
 *
 * Contact: tsidi@prudenceehs.com
 */

export const DEMO_CLEAN_PRESURVEY = {
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
  ps_reason: 'Routine / scheduled assessment',
  ps_prior: 'Yes — no significant findings',
  ps_prior_notes: 'Annual baseline assessment in 2025 found conditions within screening ranges across all floors; no corrective actions were required.',
  ps_blueprints: 'Yes — reviewed',
  ps_design_oa: 'Yes — documented CFM',
  ps_design_oa_cfm: '3200',
  ps_filter_schedule: 'Quarterly',
  ps_water_history: 'No known history',
}

export const DEMO_CLEAN_BUILDING = {
  fn: 'Lakeside Professional Center',
  fl: '1400 Lakeshore Dr, Suite 200, Madison, WI 53703',
  ft: 'Commercial Office',
  ba: '2016',
  rn: 'No',
  ht: 'Central AHU — VAV',
  hm: 'Within 6 months',
  fm: 'MERV 13',
  fc: 'Clean / Recent',
  sa: 'Normal airflow',
  od: 'Open — proper',
  dp: 'Clean — draining',
  bld_pressure: 'Neutral',
  bld_exhaust: ['Restroom exhaust'],
  bld_intake_proximity: ['Clear of sources'],
  wx_temp: '68',
  wx_rh: '50',
  wx_sky: 'Clear / Sunny',
  wx_precip: 'None in past 48 hours',
  wx_wind: 'Calm (< 5 mph)',
}

export const DEMO_CLEAN_ZONES = [
  {
    zid: 'zone-2f-open',
    zn: '2nd Floor Open Office',
    servingEquipmentIds: ['eq-ahu-2'],
    su: 'office',
    sf: '3800',
    oc: '24',
    cx: 'No complaints',
    tc: 'Comfortable',
    hp: 'Comfortable',
    vd: 'None',
    wd: 'None',
    mi: 'None',
    op: 'None',
    cfm_person: '18',
    co2: '720',
    co2o: '425',
    tf: '74',
    tfo: '68',
    rh: '46',
    rho: '50',
    pm: '7',
    pmo: '6',
    co: '1',
    tv: '140',
    tvo: '95',
    hc: '0.004',
    meas_time: '10:30 AM',
    meas_occ: 'Typical occupancy',
    meas_duration: '15-minute average',
    meas_conditions: 'Yes — normal operations',
    znt: 'Well-ventilated open office. Measured outdoor-air delivery is comfortably above the ASHRAE 62.1 minimum for the space type; supply diffusers deliver balanced airflow. No odors, visible dust, or moisture observed. Occupants report no comfort concerns.',
  },
  {
    zid: 'zone-conf-main',
    zn: 'Main Conference Room',
    servingEquipmentIds: ['eq-ahu-2'],
    su: 'conference',
    sf: '520',
    oc: '14',
    cx: 'No complaints',
    tc: 'Comfortable',
    hp: 'Comfortable',
    vd: 'None',
    wd: 'None',
    mi: 'None',
    op: 'None',
    cfm_person: '16',
    co2: '780',
    co2o: '425',
    tf: '75',
    rh: '48',
    pm: '6',
    pmo: '6',
    co: '1',
    tv: '110',
    tvo: '95',
    hc: '0.003',
    meas_time: '11:05 AM',
    meas_occ: 'Above typical (meeting in session)',
    meas_duration: '15-minute average',
    meas_conditions: 'Yes — normal operations',
    znt: 'Dedicated outdoor-air supply confirmed. CO₂ remained stable during an occupied meeting and the indoor/outdoor differential stayed well within the ventilation screening range. No findings.',
  },
]

// HVAC equipment serving both clean-demo zones — recently serviced.
export const DEMO_CLEAN_EQUIPMENT = [
  {
    id: 'eq-ahu-2',
    label: 'AHU-2',
    type: 'AHU',
    location: '2nd-floor mechanical room',
    servedZoneIds: ['zone-2f-open', 'zone-conf-main'],
    filterClass: 'MERV 13',
    lastServiceDate: '2026-05-18',
  },
]
