/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

export const Q_PRESURVEY = [
  // Assessor
  { id:'ps_assessor',            sec:'Assessor',      q:'Assessor name and credentials',        t:'text', req:1, ic:'👤', ph:'e.g. J. Smith, CIH, CSP' },
  { id:'ps_assessor_certs',      sec:'Assessor',      q:'Certifications and licenses held',     t:'multi',       ic:'🎓', opts:['CIH','CIH-in-Training','CSP','CHMM','ACAC CIEC','ACAC CMC','ACAC CMI','NYSDOL Mold Assessor','State IH License','OSHA 30-Hour','Other'] },
  { id:'ps_assessor_exp',        sec:'Assessor',      q:'Years of IH/EHS experience',           t:'ch',          ic:'📅', opts:['1-3 years','3-5 years','5-10 years','10-20 years','20+ years'] },
  // Instruments
  { id:'ps_inst_iaq',            sec:'Instruments',   q:'Primary IAQ meter make/model?',        t:'combo',       ic:'📏', ph:'Or type your own...', opts:['TSI Q-Trak 7575','TSI Q-Trak 7515','TSI IAQ-Calc 7545','TSI VelociCalc 9565','Graywolf AdvancedSense Pro','Graywolf IQ-610','Graywolf PC-3016A','FLIR CM174','Kanomax 2211','Kanomax IAQ-2000','E Instruments AQ Pro','Testo 400','Testo 440','Bacharach Monoxor III','Aeroqual Series 500','HAL Technology HFX205','PPM Technology formaldemeter htV-m','CEM DT-9881','Extech SD800','Fieldpiece SDP2','Other'] },
  { id:'ps_inst_iaq_serial',     sec:'Instruments',   q:'Serial number?',                       t:'text', sk:1,  ic:'🔢', ph:'Instrument serial number' },
  { id:'ps_inst_iaq_cal',        sec:'Instruments',   q:'Last factory/field calibration date?', t:'date',        ic:'🔧' },
  { id:'ps_inst_iaq_cal_status', sec:'Instruments',   q:'Calibration status',                   t:'ch',          ic:'✅', opts:['Calibrated within manufacturer spec','Calibrated — overdue for recertification','Field-zeroed only','Not calibrated','Unknown'] },
  { id:'ps_inst_pid',            sec:'Instruments',   q:'PID / VOC meter (if used)?',           t:'combo', sk:1, ic:'🧪', ph:'Or type your own...', opts:['RAE Systems MiniRAE 3000','RAE Systems ppbRAE 3000','RAE Systems MultiRAE','Ion Science Tiger','Ion Science Tiger XT','Ion Science Cub','Honeywell ToxiRAE Pro PID','RKI Instruments Eagle 2','MSA Altair 5X PID','Dräger X-am 8000','Baseline piD-TECH eVx','Mocon Baseline VOC-TRAQ II','Other'] },
  { id:'ps_inst_pid_cal',        sec:'Instruments',   q:'PID calibration status?',              t:'ch',   sk:1,  ic:'✅', opts:['Bump-tested and calibrated','Bump-tested only','Not calibrated','N/A'] },
  { id:'ps_inst_other',          sec:'Instruments',   q:'Other instruments used?',              t:'ta',   sk:1,  ic:'🛠️', ph:'Moisture meter, thermal camera, smoke pencil, etc.' },
  // Trigger
  { id:'ps_reason',              sec:'Trigger Event', q:'What triggered this investigation?',   t:'ch',   req:1, ic:'🎯', opts:['Occupant complaint(s)','Routine / scheduled assessment','Post-renovation / construction','Water intrusion event','Odor event','Regulatory requirement','Due diligence / pre-lease','Insurance / litigation','Other'] },
  { id:'ps_complaint_narrative', sec:'Trigger Event', q:'Describe the complaint(s) in detail',  t:'ta',          ic:'📝', cond:{f:'ps_reason',eq:'Occupant complaint(s)'}, ph:'Who reported, symptoms, when, where' },
  { id:'ps_complaint_severity',  sec:'Trigger Event', q:'Severity?',                            t:'ch',          ic:'⚡', cond:{f:'ps_reason',eq:'Occupant complaint(s)'}, opts:['Minor — comfort concern only','Moderate — symptoms reported','Significant — multiple occupants affected','Severe — medical attention sought','Critical — evacuation or work stoppage'] },
  { id:'ps_complaint_formal',    sec:'Trigger Event', q:'Formal written complaints filed?',     t:'ch',          ic:'📄', cond:{f:'ps_reason',eq:'Occupant complaint(s)'}, opts:['No — verbal only','Yes — internal complaint form','Yes — to management / HR','Yes — to OSHA or regulatory agency','Yes — legal / attorney involved'] },
  { id:'ps_water_event_type',    sec:'Trigger Event', q:'Type of water event?',                 t:'ch',          ic:'🌊', cond:{f:'ps_reason',eq:'Water intrusion event'}, opts:['Roof leak','Pipe burst / plumbing failure','Flooding (weather)','HVAC condensate overflow','Fire suppression discharge','Foundation / below-grade seepage','Unknown source'] },
  { id:'ps_water_event_date',    sec:'Trigger Event', q:'When did the water event occur?',      t:'ch',          ic:'📅', cond:{f:'ps_reason',eq:'Water intrusion event'}, opts:['Within 24 hours','2-7 days ago','1-2 weeks ago','2-4 weeks ago','Over 1 month ago','Ongoing / recurring'] },
  { id:'ps_water_event_response',sec:'Trigger Event', q:'Response actions taken?',              t:'multi',       ic:'🔧', cond:{f:'ps_reason',eq:'Water intrusion event'}, opts:['Water extraction performed','Dehumidifiers deployed','Wet materials removed','Professional remediation hired','Fans / air movers used','Nothing yet','Unknown'] },
  { id:'ps_odor_describe',       sec:'Trigger Event', q:'Describe the odor event',              t:'ta',          ic:'👃', cond:{f:'ps_reason',eq:'Odor event'}, ph:'Character, intensity, timing, affected areas' },
  { id:'ps_odor_pattern',        sec:'Trigger Event', q:'Odor pattern?',                        t:'ch',          ic:'🕐', cond:{f:'ps_reason',eq:'Odor event'}, opts:['Constant — always present','Intermittent — comes and goes','Time-of-day pattern','Weather-dependent','HVAC-correlated','New — appeared suddenly'] },
  { id:'ps_reno_scope',          sec:'Trigger Event', q:'Renovation scope?',                    t:'multi',       ic:'🏗️', cond:{f:'ps_reason',eq:'Post-renovation / construction'}, opts:['Flooring replacement','Painting / wall finishing','Furniture / workstation install','Ceiling work','Ductwork modification','Plumbing work','Demolition / abatement','Full build-out','Roofing'] },
  { id:'ps_reno_completion',     sec:'Trigger Event', q:'Renovation completed?',                t:'ch',          ic:'📅', cond:{f:'ps_reason',eq:'Post-renovation / construction'}, opts:['Still in progress','Within 1 week','1-4 weeks ago','1-3 months ago','Over 3 months ago'] },
  { id:'ps_reno_containment',    sec:'Trigger Event', q:'Containment / occupant protection?',  t:'ch',          ic:'🛡️', cond:{f:'ps_reason',eq:'Post-renovation / construction'}, opts:['Yes — full containment with negative pressure','Yes — partial barriers','No containment used','Unknown'] },
  { id:'ps_reg_agency',          sec:'Trigger Event', q:'Which agency or requirement?',         t:'ta',          ic:'🏛️', cond:{f:'ps_reason',eq:'Regulatory requirement'}, ph:'OSHA inspection, local health dept, lease requirement, etc.' },
  // Prior History
  { id:'ps_prior',               sec:'Prior History',  q:'Prior IAQ investigations?',            t:'ch',          ic:'📁', opts:['No — first assessment','Yes — with findings','Yes — no significant findings','Unknown'] },
  { id:'ps_prior_notes',         sec:'Prior History',  q:'Prior investigation summary',          t:'ta',   sk:1,  ic:'📋', cond:{f:'ps_prior',eq:'Yes — with findings'}, ph:'Findings, dates, actions taken, unresolved issues' },
  // Design Review
  { id:'ps_blueprints',          sec:'Design Review',  q:'Mechanical drawings available?',       t:'ch',          ic:'📐', opts:['Yes — reviewed','Available but not reviewed','Not available'] },
  { id:'ps_design_oa',           sec:'Design Review',  q:'Design outdoor air rate documented?',  t:'ch',   sk:1,  ic:'🌬️', opts:['Yes — documented CFM','Partially — some zones','No — unknown','N/A'] },
  { id:'ps_design_oa_cfm',       sec:'Design Review',  q:'Design outdoor air rate?',             t:'num',  sk:1,  ic:'📊', u:'CFM', cond:{f:'ps_design_oa',eq:'Yes — documented CFM'} },
  { id:'ps_bms',                 sec:'Design Review',  q:'BMS / BAS data available?',            t:'ch',   sk:1,  ic:'🖥️', opts:['Yes — trending data reviewed','Yes — not reviewed','No BMS','Unknown'] },
  // Maintenance
  { id:'ps_filter_schedule',     sec:'Maintenance',    q:'Filter change schedule?',              t:'ch',          ic:'🔄', opts:['Quarterly','Semi-annual','Annual','As-needed','No schedule','Unknown'] },
  { id:'ps_water_history',       sec:'Maintenance',    q:'History of water intrusion?',          t:'ch',          ic:'🌊', opts:['No known history','Yes — resolved','Yes — recurring','Unknown'] },
  { id:'ps_water_detail',        sec:'Maintenance',    q:'Water intrusion history details',      t:'ta',   sk:1,  ic:'💧', cond:{f:'ps_water_history',ne:'No known history'}, ph:'Dates, locations, remediation' },
  { id:'ps_pest',                sec:'Maintenance',    q:'Recent pesticide / chemical apps?',    t:'ch',   sk:1,  ic:'🧴', opts:['None recent','Within 30 days','Within 90 days','Unknown'] },
  { id:'ps_reno_detail',         sec:'Maintenance',    q:'Other renovation / maintenance notes', t:'ta',   sk:1,  ic:'📝', ph:'Any relevant building history' },
  // Occupant Data — only show when triggered by complaints
  { id:'ps_complaint_count',     sec:'Occupant Data',  q:'Total documented complaints?',         t:'num',  sk:1,  ic:'📊', ph:'Number of formal complaints', cond:{f:'ps_reason',eq:'Occupant complaint(s)'} },
  { id:'ps_complaint_timeline',  sec:'Occupant Data',  q:'When did complaints begin?',           t:'ch',   sk:1,  ic:'📅', opts:['Within 1 week','Within 1 month','1-6 months ago','Over 6 months ago','Intermittent / recurring','Unknown'], cond:{f:'ps_reason',eq:'Occupant complaint(s)'} },
  { id:'ps_affected_areas',      sec:'Occupant Data',  q:'Most affected areas?',                 t:'ta',   sk:1,  ic:'📍', ph:'Floor numbers, rooms, departments', cond:{f:'ps_reason',eq:'Occupant complaint(s)'} },
]

// ── MOBILE: Quick Start (get to zones in under 60 seconds) ──
// Assessor + instrument data auto-filled from profile
export const Q_QUICKSTART = [
  { id:'ps_reason',  sec:'Trigger',  q:'What triggered this investigation?', t:'ch', req:1, ic:'🎯', opts:['Occupant complaint(s)','Routine / scheduled assessment','Post-renovation / construction','Water intrusion event','Odor event','Regulatory requirement','Due diligence / pre-lease','Insurance / litigation','Other'] },
  { id:'ps_complaint_severity', sec:'Trigger', q:'Severity?', t:'ch', ic:'⚡', cond:{f:'ps_reason',eq:'Occupant complaint(s)'}, opts:['Minor — comfort concern only','Moderate — symptoms reported','Significant — multiple occupants affected','Severe — medical attention sought','Critical — evacuation or work stoppage'] },
  { id:'ps_water_event_type', sec:'Trigger', q:'Type of water event?', t:'ch', ic:'🌊', cond:{f:'ps_reason',eq:'Water intrusion event'}, opts:['Roof leak','Pipe burst / plumbing failure','Flooding (weather)','HVAC condensate overflow','Fire suppression discharge','Foundation / below-grade seepage','Unknown source'] },
  { id:'ps_odor_pattern', sec:'Trigger', q:'Odor pattern?', t:'ch', ic:'🕐', cond:{f:'ps_reason',eq:'Odor event'}, opts:['Constant — always present','Intermittent — comes and goes','Time-of-day pattern','Weather-dependent','HVAC-correlated','New — appeared suddenly'] },
  { id:'ps_reno_completion', sec:'Trigger', q:'Renovation completed?', t:'ch', ic:'📅', cond:{f:'ps_reason',eq:'Post-renovation / construction'}, opts:['Still in progress','Within 1 week','1-4 weeks ago','1-3 months ago','Over 3 months ago'] },
  { id:'fn',  sec:'Building', q:'Facility name?',    t:'text', req:1, ic:'🏢', ph:'e.g. One Liberty Plaza' },
  { id:'fl',  sec:'Building', q:'Facility address?',  t:'text', req:1, ic:'📍', ph:'Street address or campus ID', ac:'street-address' },
  { id:'ft',  sec:'Building', q:'Facility type?',     t:'ch',   req:1, ic:'🏗️', opts:['Commercial Office','School / University','Healthcare','Industrial / Manufacturing','Retail','Government','Data Center','Laboratory','Warehouse','Mixed Use'], premiumOpts:['Data Center'] },
  { id:'ht',  sec:'HVAC',    q:'HVAC system type?',   t:'ch',   req:1, ic:'❄️', opts:['Central AHU — VAV','Central AHU — CAV','Packaged Rooftop','Split System','Fan Coil Units','PTAC / PTHP','DOAS + Radiant','Natural Ventilation','Unknown'] },
  { id:'sa',  sec:'HVAC',    q:'Supply air delivery?', t:'ch',  req:1, ic:'💨', opts:['Normal airflow','Weak / reduced','No airflow detected','Not assessed'] },
]

// ── MOBILE: Assessment Details (fill before or after walkthrough) ──
export const Q_DETAILS = [
  // Building details
  { id:'ba',  sec:'Building Details',  q:'Year built?',                t:'num', sk:1, ic:'📅', ph:'e.g. 1994' },
  { id:'rn',  sec:'Building Details',  q:'Recent renovation?',         t:'ch',  sk:1, ic:'🔨', opts:['No','Within 30 days','Within 6 months','Within 1 year'] },
  { id:'hm',  sec:'HVAC Details',      q:'Last HVAC service?',         t:'ch',  sk:1, ic:'🔧', opts:['Within 6 months','6-12 months ago','Over 12 months','Unknown'] },
  { id:'fm',  sec:'HVAC Details',      q:'Filter rating?',             t:'ch',  sk:1, ic:'🫧', opts:['MERV 8 or lower','MERV 11','MERV 13','MERV 14+','HEPA','Unknown','No filter'] },
  { id:'fc',  sec:'HVAC Details',      q:'Filter condition?',          t:'ch',  sk:1, ic:'🔍', opts:['Clean / Recent','Moderately loaded','Heavily loaded','Damaged / Bypass','Not accessible'] },
  { id:'od',  sec:'HVAC Details',      q:'Outdoor air damper?',        t:'ch',  sk:1, ic:'🚪', opts:['Open — proper','Closed / minimum','Stuck / inoperable','Not accessible','Unknown'] },
  { id:'dp',  sec:'HVAC Details',      q:'Condensate drain pan?',      t:'ch',  sk:1, ic:'🪣', opts:['Clean — draining','Standing water','Bio growth observed','Not accessible'], photo:1 },
  // Airflow
  { id:'bld_pressure',        sec:'Airflow Paths', q:'Building pressurization?',        t:'ch',   sk:1, ic:'🌀', opts:['Positive (air pushes out)','Negative (air pulls in)','Neutral','Variable / unknown','Not assessed'] },
  { id:'bld_exhaust',         sec:'Airflow Paths', q:'Exhaust systems present?',        t:'multi',sk:1, ic:'🔃', opts:['Restroom exhaust','Kitchen / break room hood','Lab fume hoods','Server room exhaust','Parking garage exhaust','Loading dock exhaust','Janitor closet exhaust','None identified'] },
  { id:'bld_intake_proximity',sec:'Airflow Paths', q:'OA intake proximity to sources?', t:'multi',sk:1, ic:'⚠️', opts:['Near loading dock','Near parking garage','Near exhaust outlet','Near dumpster / waste','Near cooling tower','Near traffic / roadway','Clear of sources','Not assessed'] },
  // Weather
  { id:'wx_temp',   sec:'Outdoor Conditions', q:'Outdoor temperature?',       t:'num', sk:1, ic:'🌡️', u:'°F' },
  { id:'wx_rh',     sec:'Outdoor Conditions', q:'Outdoor relative humidity?', t:'num', sk:1, ic:'💧', u:'%' },
  { id:'wx_sky',    sec:'Outdoor Conditions', q:'Sky / weather?',             t:'ch',  sk:1, ic:'☀️', opts:['Clear / Sunny','Partly cloudy','Overcast','Light rain','Heavy rain','Snow','Fog','Windy (>15 mph)'] },
  { id:'wx_precip', sec:'Outdoor Conditions', q:'Recent precipitation?',      t:'ch',  sk:1, ic:'🌧️', opts:['None in past 48 hours','Light rain within 24 hours','Heavy rain within 24 hours','Rain within past week','Flooding event recent','Snow / ice'] },
  // Pre-survey details
  { id:'ps_complaint_narrative', sec:'Complaint Details', q:'Describe the complaint(s)',     t:'ta',   sk:1, ic:'📝', cond:{f:'ps_reason',eq:'Occupant complaint(s)'}, ph:'Who reported, symptoms, when, where' },
  { id:'ps_complaint_formal',    sec:'Complaint Details', q:'Formal written complaints?',    t:'ch',   sk:1, ic:'📄', cond:{f:'ps_reason',eq:'Occupant complaint(s)'}, opts:['No — verbal only','Yes — internal complaint form','Yes — to management / HR','Yes — to OSHA or regulatory agency','Yes — legal / attorney involved'] },
  { id:'ps_complaint_count',     sec:'Complaint Details', q:'Total documented complaints?',  t:'num',  sk:1, ic:'📊', ph:'Number', cond:{f:'ps_reason',eq:'Occupant complaint(s)'} },
  { id:'ps_complaint_timeline',  sec:'Complaint Details', q:'When did complaints begin?',    t:'ch',   sk:1, ic:'📅', opts:['Within 1 week','Within 1 month','1-6 months ago','Over 6 months ago','Intermittent / recurring','Unknown'], cond:{f:'ps_reason',eq:'Occupant complaint(s)'} },
  { id:'ps_affected_areas',      sec:'Complaint Details', q:'Most affected areas?',          t:'ta',   sk:1, ic:'📍', ph:'Floor numbers, rooms, departments', cond:{f:'ps_reason',eq:'Occupant complaint(s)'} },
  // History
  { id:'ps_prior',          sec:'Prior History',  q:'Prior IAQ investigations?',       t:'ch',  sk:1, ic:'📁', opts:['No — first assessment','Yes — with findings','Yes — no significant findings','Unknown'] },
  { id:'ps_prior_notes',    sec:'Prior History',  q:'Prior investigation summary',     t:'ta',  sk:1, ic:'📋', cond:{f:'ps_prior',eq:'Yes — with findings'}, ph:'Findings, dates, actions taken' },
  { id:'ps_blueprints',     sec:'Design Review',  q:'Mechanical drawings available?',  t:'ch',  sk:1, ic:'📐', opts:['Yes — reviewed','Available but not reviewed','Not available'] },
  { id:'ps_bms',            sec:'Design Review',  q:'BMS / BAS data available?',       t:'ch',  sk:1, ic:'🖥️', opts:['Yes — trending data reviewed','Yes — not reviewed','No BMS','Unknown'] },
  // Maintenance
  { id:'ps_filter_schedule', sec:'Maintenance', q:'Filter change schedule?',        t:'ch',  sk:1, ic:'🔄', opts:['Quarterly','Semi-annual','Annual','As-needed','No schedule','Unknown'] },
  { id:'ps_water_history',   sec:'Maintenance', q:'History of water intrusion?',    t:'ch',  sk:1, ic:'🌊', opts:['No known history','Yes — resolved','Yes — recurring','Unknown'] },
  { id:'ps_water_detail',    sec:'Maintenance', q:'Water intrusion history details',t:'ta',  sk:1, ic:'💧', cond:{f:'ps_water_history',ne:'No known history'}, ph:'Dates, locations, remediation' },
  { id:'ps_pest',            sec:'Maintenance', q:'Recent pesticide / chemical apps?',t:'ch',sk:1, ic:'🧴', opts:['None recent','Within 30 days','Within 90 days','Unknown'] },
  // Instruments (also in Q_PRESURVEY — duplicated here so assessors can add post-assessment)
  { id:'ps_inst_iaq',            sec:'Instruments',   q:'Primary IAQ meter make/model?',        t:'combo', sk:1, ic:'📏', ph:'Or type your own...', opts:['TSI Q-Trak 7575','TSI Q-Trak 7515','TSI IAQ-Calc 7545','TSI VelociCalc 9565','Graywolf AdvancedSense Pro','Graywolf IQ-610','Graywolf PC-3016A','FLIR CM174','Kanomax 2211','Kanomax IAQ-2000','E Instruments AQ Pro','Testo 400','Testo 440','Bacharach Monoxor III','Aeroqual Series 500','HAL Technology HFX205','PPM Technology formaldemeter htV-m','CEM DT-9881','Extech SD800','Fieldpiece SDP2','Other'] },
  { id:'ps_inst_iaq_serial',     sec:'Instruments',   q:'Serial number?',                       t:'text', sk:1,  ic:'🔢', ph:'Instrument serial number' },
  { id:'ps_inst_iaq_cal',        sec:'Instruments',   q:'Last factory/field calibration date?', t:'date', sk:1,  ic:'🔧' },
  { id:'ps_inst_iaq_cal_status', sec:'Instruments',   q:'Calibration status',                   t:'ch',   sk:1,  ic:'✅', opts:['Calibrated within manufacturer spec','Calibrated — overdue for recertification','Field-zeroed only','Not calibrated','Unknown'] },
]

export const Q_BUILDING = [
  { id:'fn',  sec:'Building',         q:'Facility name?',                           t:'text', req:1, ic:'🏢', ph:'e.g. One Liberty Plaza' },
  { id:'fl',  sec:'Building',         q:'Facility address?',                        t:'text', req:1, ic:'📍', ph:'Street address or campus ID', ac:'street-address' },
  { id:'ft',  sec:'Building',         q:'Facility type?',                           t:'ch',   req:1, ic:'🏗️', opts:['Commercial Office','School / University','Healthcare','Industrial / Manufacturing','Retail','Government','Data Center','Laboratory','Warehouse','Mixed Use'], premiumOpts:['Data Center'] },
  { id:'ba',  sec:'Building',         q:'Year built?',                              t:'num',  sk:1,  ic:'📅', ph:'e.g. 1994' },
  { id:'rn',  sec:'Building',         q:'Recent renovation?',                       t:'ch',          ic:'🔨', opts:['No','Within 30 days','Within 6 months','Within 1 year'] },
  { id:'ht',  sec:'HVAC',            q:'HVAC system type?',                        t:'ch',   req:1, ic:'❄️', opts:['Central AHU — VAV','Central AHU — CAV','Packaged Rooftop','Split System','Fan Coil Units','PTAC / PTHP','DOAS + Radiant','Natural Ventilation','Unknown'] },
  { id:'hm',  sec:'HVAC',            q:'Last HVAC service?',                       t:'ch',          ic:'🔧', opts:['Within 6 months','6-12 months ago','Over 12 months','Unknown'] },
  { id:'fm',  sec:'HVAC',            q:'Filter rating?',                           t:'ch',   sk:1,  ic:'🫧', opts:['MERV 8 or lower','MERV 11','MERV 13','MERV 14+','HEPA','Unknown','No filter'] },
  { id:'fc',  sec:'HVAC',            q:'Filter condition?',                        t:'ch',          ic:'🔍', opts:['Clean / Recent','Moderately loaded','Heavily loaded','Damaged / Bypass','Not accessible'] },
  { id:'sa',  sec:'HVAC',            q:'Supply air delivery?',                     t:'ch',   req:1, ic:'💨', opts:['Normal airflow','Weak / reduced','No airflow detected','Not assessed'] },
  { id:'od',  sec:'HVAC',            q:'Outdoor air damper?',                      t:'ch',   sk:1,  ic:'🚪', opts:['Open — proper','Closed / minimum','Stuck / inoperable','Not accessible','Unknown'] },
  { id:'dp',  sec:'HVAC',            q:'Condensate drain pan?',                    t:'ch',   sk:1,  ic:'🪣', opts:['Clean — draining','Standing water','Bio growth observed','Not accessible'], photo:1 },
  { id:'bld_pressure',        sec:'Airflow Paths',  q:'Building pressurization?',              t:'ch',   sk:1, ic:'🌀', opts:['Positive (air pushes out)','Negative (air pulls in)','Neutral','Variable / unknown','Not assessed'] },
  { id:'bld_exhaust',         sec:'Airflow Paths',  q:'Exhaust systems present?',              t:'multi',sk:1, ic:'🔃', opts:['Restroom exhaust','Kitchen / break room hood','Lab fume hoods','Server room exhaust','Parking garage exhaust','Loading dock exhaust','Janitor closet exhaust','None identified'] },
  { id:'bld_intake_proximity',sec:'Airflow Paths',  q:'OA intake proximity to sources?',       t:'multi',sk:1, ic:'⚠️', opts:['Near loading dock','Near parking garage','Near exhaust outlet','Near dumpster / waste','Near cooling tower','Near traffic / roadway','Clear of sources','Not assessed'] },
  { id:'wx_temp',   sec:'Outdoor Conditions', q:'Outdoor temperature?',            t:'num',  sk:1, ic:'🌡️', u:'°F' },
  { id:'wx_rh',     sec:'Outdoor Conditions', q:'Outdoor relative humidity?',      t:'num',  sk:1, ic:'💧', u:'%' },
  { id:'wx_sky',    sec:'Outdoor Conditions', q:'Sky / weather conditions?',       t:'ch',   sk:1, ic:'☀️', opts:['Clear / Sunny','Partly cloudy','Overcast','Light rain','Heavy rain','Snow','Fog','Windy (>15 mph)'] },
  { id:'wx_precip', sec:'Outdoor Conditions', q:'Recent precipitation?',           t:'ch',   sk:1, ic:'🌧️', opts:['None in past 48 hours','Light rain within 24 hours','Heavy rain within 24 hours','Rain within past week','Flooding event recent','Snow / ice'] },
  { id:'wx_wind',   sec:'Outdoor Conditions', q:'Wind conditions?',                t:'ch',   sk:1, ic:'💨', opts:['Calm (< 5 mph)','Light (5-15 mph)','Moderate (15-25 mph)','Strong (> 25 mph)','Variable / gusty'] },
  { id:'wx_notes',  sec:'Outdoor Conditions', q:'Outdoor air quality observations?',t:'ta',  sk:1, ic:'📝', ph:'Haze, dust, traffic exhaust, nearby odors' },
]

export const Q_ZONE = [
  { id:'zn', sec:'Zone',        q:'Zone / Room name?',                    t:'text', req:1, ic:'📍', ph:'e.g. 3rd Floor Conf Room B' },
  { id:'zone_subtype', sec:'Zone', q:'Zone subtype?',                     t:'ch',   sk:1, ic:'🏗️', opts:[], profileDynamic:true },
  { id:'su', sec:'Zone',        q:'Space use?',                           t:'ch',   req:1, ic:'🪑', opts:['office','classroom','retail','healthcare','lab','warehouse','manufacturing','conference','data_center','restaurant / kitchen','hotel / hospitality','gym / fitness','residential','library','auditorium / theater','daycare / childcare','church / worship','parking garage','mechanical room','server / telecom room','Other'], other:1 },
  { id:'sf', sec:'Zone',        q:'Zone area?',                           t:'num',  req:1, ic:'📐', u:'sq ft' },
  { id:'oc', sec:'Zone',        q:'Occupant count?',                      t:'num',  req:1, ic:'👥' },
  { id:'cx', sec:'Complaints',  q:'Complaints in this zone?',             t:'ch',   req:1, ic:'🗣️', opts:['No complaints','Yes — complaints reported'], br:1 },
  { id:'sy', sec:'Complaints',  q:'Symptoms reported?',                   t:'multi',       ic:'🩺', cond:{f:'cx',eq:'Yes — complaints reported'}, opts:['Headache','Fatigue','Concentration issues','Eye irritation','Nasal congestion','Throat irritation','Cough','Wheezing','Skin dryness','Nausea','Dizziness'] },
  { id:'sr', sec:'Complaints',  q:'Symptoms improve away from building?', t:'ch',          ic:'🏠', cond:{f:'cx',eq:'Yes — complaints reported'}, opts:['Yes — clear pattern','Partially','No — persist','Unknown'] },
  { id:'ac', sec:'Complaints',  q:'How many affected?',                   t:'ch',          ic:'👥', cond:{f:'cx',eq:'Yes — complaints reported'}, opts:['1-2','3-5','6-10','More than 10','Unknown'] },
  { id:'cc', sec:'Complaints',  q:'Clustered in this zone?',              t:'ch',          ic:'📌', cond:{f:'cx',eq:'Yes — complaints reported'}, opts:['Yes — this zone','Scattered','Unknown'] },
  { id:'tc', sec:'Environment', q:'Thermal comfort?',                     t:'ch',          ic:'🌡️', opts:['Comfortable','Slightly warm','Slightly cool','Too hot','Too cold','Fluctuating','Drafty'] },
  { id:'hp', sec:'Environment', q:'Humidity?',                            t:'ch',          ic:'💧', opts:['Comfortable','Too humid / stuffy','Too dry','Variable'] },
  { id:'vd', sec:'Environment', q:'Visible dust?',                        t:'ch',          ic:'🌫️', opts:['None','Light surface dust','Airborne haze','Heavy accumulation'] },
  { id:'wd', sec:'Environment', q:'Water damage?',                        t:'ch',          ic:'🚿', opts:['None','Old staining','Active leak','Extensive damage'], br:1, photo:1 },
  { id:'wl', sec:'Environment', q:'Water damage location?',               t:'multi',       ic:'📍', cond:{f:'wd',ne:'None'}, opts:['Ceiling','Walls','Floor','Windows','Pipes','Roof','Below grade'] },
  { id:'mi', sec:'Environment', q:'Mold indicators?',                     t:'ch',          ic:'🦠', opts:['None','Suspected discoloration','Small (< 10 sq ft)','Moderate (10-100 sq ft)','Extensive (> 100 sq ft)'], photo:1 },
  { id:'op', sec:'Environment', q:'Unusual odors?',                       t:'ch',          ic:'👃', opts:['None','Faint / intermittent','Moderate persistent','Strong / overpowering'], br:1 },
  { id:'ot', sec:'Environment', q:'Odor type?',                           t:'multi',       ic:'🧪', cond:{f:'op',ne:'None'}, opts:['Chemical','Musty / Earthy','Sewage','Exhaust','Off-gassing','Sweet','Unknown'] },
  { id:'src_adjacent',      sec:'Source ID',   q:'Adjacent to this zone?',        t:'multi',sk:1, ic:'🔎', opts:['Copier / printer room','Janitorial / chemical closet','Kitchen / break room','Restrooms','Loading dock','Parking garage','Mechanical room','Lab space','New construction / renovation area','Exterior wall (traffic side)','Roof (near exhaust)','None of concern'] },
  { id:'src_internal',      sec:'Source ID',   q:'Sources WITHIN this zone?',     t:'multi',sk:1, ic:'🏭', opts:['New furniture / carpet / paint','Space heaters','Personal air fresheners','Stored chemicals','Aquariums / plants','Laser printers','3D printers','Cleaning in progress','Construction materials','Food preparation','None identified'] },
  { id:'cfm_person',        sec:'Airflow',     q:'Measured outdoor air (cfm/person)?', t:'num', sk:1, ic:'💨', u:'cfm/person', ph:'e.g. 18', ref:'ASHRAE 62.1-2022 Table 6.2.2.1' },
  { id:'ach',               sec:'Airflow',     q:'Air changes per hour (ACH)?',   t:'num', sk:1, ic:'🔄', u:'ACH', ph:'e.g. 4.5', ref:'≥4 office · ≥6 healthcare (CDC/ASHRAE 170)' },
  { id:'path_pressure',     sec:'Airflow',     q:'Zone pressure vs adjacent?',    t:'ch',   sk:1, ic:'🌀', opts:['Positive (pushes out)','Negative (draws in)','Neutral','Not assessed'], ref:'Use smoke pencil at doorways/gaps' },
  { id:'path_crosstalk',    sec:'Airflow',     q:'Cross-contamination evidence?', t:'ch',   sk:1, ic:'🔄', opts:['None observed','Odors migrating from adjacent space','Visible air movement at gaps / penetrations','Duct cross-talk suspected','Stack effect pulling from below','Not assessed'] },
  { id:'path_crosstalk_source',sec:'Airflow',  q:'Cross-contamination source?',  t:'ta',   sk:1, ic:'📝', cond:{f:'path_crosstalk',ne:'None observed'} },
  { id:'meas_time',         sec:'Measurements',q:'Time of readings?',            t:'text', sk:1, ic:'🕐', ph:'e.g. 2:15 PM' },
  { id:'meas_occ',          sec:'Measurements',q:'Occupancy at time of measurement?',t:'ch',sk:1,ic:'👥', opts:['Typical occupancy','Above typical (meeting/event)','Below typical','Unoccupied','Unknown'] },
  { id:'meas_duration',     sec:'Measurements',q:'Measurement type?',            t:'ch',   sk:1, ic:'⏱️', opts:['Spot check (instantaneous)','5-minute average','15-minute average','1-hour average','Continuous logging'] },
  { id:'meas_conditions',   sec:'Measurements',q:'Conditions typical during readings?',t:'ch',sk:1,ic:'📋', opts:['Yes — normal operations','No — unusual activity','No — HVAC off/abnormal','No — doors/windows open','Unknown'] },
  { id:'pid_lamp',          sec:'Measurements',q:'PID lamp energy?',                t:'ch',   sk:1, ic:'🔬', opts:['10.6 eV','11.7 eV','9.8 eV','Other','No PID used'] },
  { id:'pid_cal_gas',       sec:'Measurements',q:'PID calibration gas reference?',  t:'text', sk:1, ic:'⚗️', cond:{f:'pid_lamp',ne:'No PID used'}, ph:'e.g. Isobutylene 100 ppm' },
  { id:'pid_rf',            sec:'Measurements',q:'Response factor applied?',        t:'num',  sk:1, ic:'📊', cond:{f:'pid_lamp',ne:'No PID used'}, ph:'1.0 = isobutylene-equivalent' },
  { id:'tvoc_source_class', sec:'Measurements',q:'Dominant VOC source class (if known)?', t:'ch', sk:1, ic:'🧪', cond:{f:'pid_lamp',ne:'No PID used'}, opts:['Paint solvents','Cleaning agents','Off-gassing materials','Combustion byproducts','Unknown'] },
  { id:'_sensors',          sec:'Measurements',q:'Instrument readings for this zone',t:'sensors',sk:1,ic:'📏' },
  { id:'znt',               sec:'Zone Notes',  q:'Zone observations / notes?',   t:'ta',   sk:1, ic:'📝' },
]

export const SENSOR_FIELDS = [
  { id:'co2',  label:'CO2 (Indoor)',         u:'ppm',    ref:'ASHRAE 62.1 · >1000 concern' },
  { id:'co2o', label:'CO2 (Outdoor)',        u:'ppm',    ref:'~420 typical · REQUIRED for delta' },
  { id:'tf',   label:'Temperature (Indoor)', u:'°F',     ref:'ASHRAE 55-2023' },
  { id:'tfo',  label:'Temperature (Outdoor)',u:'°F',     ref:'Outdoor baseline' },
  { id:'rh',   label:'RH (Indoor)',          u:'%',      ref:'30-60%' },
  { id:'rho',  label:'RH (Outdoor)',         u:'%',      ref:'Outdoor baseline' },
  { id:'pm',   label:'PM2.5 (Indoor)',       u:'ug/m3',  ref:'EPA: 35 · WHO: 15' },
  { id:'pmo',  label:'PM2.5 (Outdoor)',      u:'ug/m3',  ref:'Outdoor control sample' },
  { id:'co',   label:'CO',                   u:'ppm',    ref:'OSHA: 50 · NIOSH: 35' },
  { id:'tv',   label:'TVOCs (PID)',          u:'ug/m3',  ref:'Concern: 500 · Use PID for spikes' },
  { id:'tvo',  label:'TVOCs (Outdoor)',      u:'ug/m3',  ref:'Outdoor control baseline' },
  { id:'hc',   label:'HCHO',                 u:'ppm',    ref:'OSHA: 0.75 · NIOSH: 0.016' },
]