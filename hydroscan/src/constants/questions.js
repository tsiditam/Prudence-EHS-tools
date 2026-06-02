/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * HydroScan Smart Sampler field-assessment questions — assessor intake,
 * water-source characterization, building/plumbing profile, in-situ field
 * testing, meter calibration, and QAPP data-quality objectives.
 *
 * Extracted verbatim from the original App.jsx monolith (Phase 1 relocation
 * — content unchanged).
 */

export const Q_ASSESSOR = [
  {id:"a_name",sec:"Assessor",q:"Assessor name and credentials",t:"text",req:1,ic:"👤",ph:"e.g. T. Tamakloe, CSP"},
  {id:"a_certs",sec:"Assessor",q:"Certifications held",t:"multi",ic:"🎓",opts:["CIH","CSP","PE","Licensed Water Operator","OSHA 30-Hour","HAZWOPER 40-Hour","State Water Inspector","Other"]},
  {id:"a_exp",sec:"Assessor",q:"Years of relevant experience",t:"ch",ic:"📅",opts:["1–3 years","3–5 years","5–10 years","10–20 years","20+ years"]},
];

export const Q_SOURCE = [
  {id:"src_type",sec:"Water Source",q:"Water source type?",t:"ch",req:1,ic:"💧",opts:["Public water system","Private well — drilled","Private well — dug/bored","Private well — driven point","Spring","Cistern / rainwater","Unknown"],br:1},
  {id:"src_pws",sec:"Water Source",q:"Public water system name?",t:"text",ic:"🏢",sk:1,cond:{f:"src_type",eq:"Public water system"},ph:"e.g. WSSC Water, DC Water"},
  {id:"src_pws_id",sec:"Water Source",q:"PWS ID number (if known)?",t:"text",ic:"🔢",sk:1,cond:{f:"src_type",eq:"Public water system"},ph:"e.g. MD0160001"},
  {id:"src_well_depth",sec:"Well Details",q:"Well depth?",t:"num",u:"ft",ic:"📐",sk:1,cond:{f:"src_type",inc:"well"},ph:"Total depth in feet"},
  {id:"src_well_age",sec:"Well Details",q:"Well age?",t:"ch",ic:"📅",sk:1,cond:{f:"src_type",inc:"well"},opts:["Less than 10 years","10–25 years","25–50 years","Over 50 years","Unknown"]},
  {id:"src_well_casing",sec:"Well Details",q:"Well casing material?",t:"ch",ic:"🔩",sk:1,cond:{f:"src_type",inc:"well"},opts:["Steel","PVC","Concrete","Open / no casing","Unknown"]},
  {id:"src_well_cap",sec:"Well Details",q:"Well cap condition?",t:"ch",ic:"🔒",sk:1,cond:{f:"src_type",inc:"well"},opts:["Sealed — good condition","Loose / damaged","Missing","Buried / not accessible","Unknown"],photo:1},
  {id:"src_well_flood",sec:"Well Details",q:"Has the well area flooded in the past 12 months?",t:"ch",ic:"🌊",sk:1,cond:{f:"src_type",inc:"well"},opts:["No","Yes — minor surface water","Yes — significant flooding","Unknown"]},
  {id:"src_well_prox",sec:"Well Details",q:"Proximity to contamination sources?",t:"multi",ic:"⚠️",sk:1,cond:{f:"src_type",inc:"well"},opts:["Septic system (< 50 ft)","Septic system (50–100 ft)","Agricultural land / feedlot","Underground storage tanks","Road salt application","Landfill / dump site","Industrial facility","None within 200 ft","Unknown"]},
  {id:"src_treat",sec:"Treatment",q:"Treatment systems installed?",t:"multi",ic:"🔧",sk:1,opts:["None","Sediment filter","Carbon filter","Reverse osmosis","UV disinfection","Water softener","Iron/manganese filter","Chlorination system","Acid neutralizer","Whole-house filtration","Unknown"]},
  {id:"src_treat_maint",sec:"Treatment",q:"Last treatment system maintenance?",t:"ch",ic:"📅",sk:1,opts:["Within 6 months","6–12 months","Over 12 months","Unknown","N/A — no treatment"]},
  {id:"src_trigger",sec:"Assessment Context",q:"What triggered this assessment?",t:"ch",req:1,ic:"🔎",opts:["Routine / periodic testing","Real estate transaction","New well construction","Occupant health complaint","Taste / odor / color change","Nearby contamination event","Regulatory requirement","Building water management program","Post-remediation verification","Unknown"],br:1},
  {id:"src_complaints",sec:"Assessment Context",q:"Water quality complaints?",t:"multi",ic:"🗣️",sk:1,opts:["Discoloration (brown/yellow/black)","Metallic taste","Rotten egg / sulfur odor","Chlorine taste/smell","Sediment / particles","Staining (fixtures/laundry)","Gastrointestinal illness","Skin irritation / rash","Low pressure","No complaints"]},
  {id:"src_history",sec:"Assessment Context",q:"Prior testing history?",t:"ch",ic:"📋",sk:1,opts:["No prior testing","Tested within 1 year","Tested 1–3 years ago","Tested over 3 years ago","Unknown"]},
  // QAPP Elements (Data Quality Objectives — required for legal defensibility)
  {id:"dqo_purpose",sec:"Data Quality",q:"Assessment purpose / legal context?",t:"ch",ic:"⚖️",sk:1,opts:["Routine monitoring","Real estate due diligence","Litigation support","Regulatory response","Complaint investigation","Post-remediation verification","Baseline documentation","Insurance claim"],ref:"Defines required detection limits and documentation level. Litigation requires Level IV data packages."},
  {id:"dqo_detection",sec:"Data Quality",q:"Required detection level?",t:"ch",ic:"🔬",sk:1,opts:["Standard reporting limits","Below MCL reporting limits","Lowest achievable detection limits","Method detection limits (MDLs)"],ref:"Legal cases often require detection limits significantly below MCLs."},
  {id:"dqo_data_pkg",sec:"Data Quality",q:"Lab data package level needed?",t:"ch",ic:"📊",sk:1,opts:["Summary report only","Level II — QC summary included","Level III — full QC with raw data","Level IV — complete with instrument calibrations"],ref:"Level IV includes all raw instrument data and calibration curves. Required for litigation."},
  {id:"dqo_rationale",sec:"Data Quality",q:"Analyte selection rationale?",t:"ta",ic:"📝",sk:1,ph:"Document why these parameters were selected based on source-pathway-receptor model. e.g. Pre-1986 plumbing → lead/copper. Near industrial site → VOCs/PFAS."},
];

export const Q_BUILDING = [
  {id:"b_type",sec:"Building",q:"Building / property type?",t:"ch",req:1,ic:"🏠",opts:["Single family residence","Multi-family (2–4 units)","Apartment / condo complex","School / daycare","Commercial office","Healthcare facility","Restaurant / food service","Industrial","Government building","Other"]},
  {id:"b_year",sec:"Building",q:"Year built?",t:"num",ic:"📅",sk:1,ph:"e.g. 1978"},
  {id:"b_occ",sec:"Building",q:"Number of occupants?",t:"num",ic:"👥",sk:1,ph:"Regular occupants"},
  {id:"b_children",sec:"Building",q:"Children under 6 or pregnant women present?",t:"ch",ic:"👶",sk:1,opts:["Yes","No","Unknown"],ref:"Lead exposure is most dangerous for children under 6 and developing fetuses"},
  {id:"b_pipe_mat",sec:"Plumbing",q:"Service line material (street to meter)?",t:"ch",ic:"🔩",opts:["Copper","Lead","Galvanized steel","PVC / plastic","Unknown","Not accessible"],ref:"Lead service lines are the #1 source of lead in drinking water"},
  {id:"b_int_pipe",sec:"Plumbing",q:"Interior plumbing material?",t:"ch",ic:"🔩",opts:["Copper (post-1986)","Copper (pre-1986, may have lead solder)","Galvanized steel","PEX / CPVC","Lead","Mixed / unknown"]},
  {id:"b_fix_age",sec:"Plumbing",q:"Fixture age (faucets, valves)?",t:"ch",ic:"🚰",sk:1,opts:["All post-2014 (lead-free certified)","Mixed ages","Pre-2014","Pre-1986","Unknown"],ref:"Federal law reduced allowable lead in fixtures in 2014"},
  {id:"b_wh_type",sec:"Water Heater",q:"Water heater type?",t:"ch",ic:"🔥",sk:1,opts:["Tank — gas","Tank — electric","Tankless — gas","Tankless — electric","Boiler system","None","Unknown"]},
  {id:"b_wh_temp",sec:"Water Heater",q:"Water heater set temperature?",t:"ch",ic:"🌡️",sk:1,opts:["Below 120°F","120°F (EPA recommended)","Above 120°F but below 140°F","140°F or above","Unknown"],ref:"ASHRAE 188: stored water should be ≥140°F to control Legionella; delivered ≤120°F to prevent scalding"},
  {id:"b_wh_age",sec:"Water Heater",q:"Water heater age?",t:"ch",ic:"📅",sk:1,opts:["Less than 5 years","5–10 years","10–15 years","Over 15 years","Unknown"]},
  {id:"b_stag",sec:"Stagnation",q:"Any portions of the building with low or no water use?",t:"ch",ic:"⏸️",opts:["No — all areas in regular use","Yes — vacant floors / wings","Yes — seasonal low use","Yes — fixtures rarely used","Unknown"],ref:"Stagnation promotes lead leaching and Legionella growth"},
  {id:"b_deadlegs",sec:"Stagnation",q:"Dead legs or capped-off pipe runs present?",t:"ch",ic:"🔄",sk:1,opts:["No","Yes","Suspected","Unknown"],ref:"Dead legs are high-risk zones for microbial growth per ASHRAE 188"},
  {id:"b_backflow",sec:"Cross-Connection",q:"Backflow prevention device installed?",t:"ch",ic:"🛡️",sk:1,opts:["Yes — tested within 12 months","Yes — not recently tested","No","Unknown"]},
  {id:"b_visual",sec:"Observations",q:"Visual observations at fixtures?",t:"multi",ic:"👁️",sk:1,opts:["Clear water — no concerns","Brown / yellow discoloration","Black particles or sediment","White scale / mineral buildup","Green / blue staining (copper)","Biofilm / slime at fixtures","Aerator buildup","No hot water at some fixtures","Low pressure at some fixtures","None notable"],photo:1},
  {id:"b_odor",sec:"Observations",q:"Odor observations?",t:"ch",ic:"👃",sk:1,opts:["None","Chlorine / bleach","Rotten egg / sulfur","Musty / earthy","Metallic","Chemical / solvent","Sewage"]},
  {id:"b_taste",sec:"Observations",q:"Taste observations?",t:"ch",ic:"👅",sk:1,opts:["None","Metallic","Salty","Bitter","Chlorine","Earthy / musty","Sweet / chemical","Not assessed"]},
  {id:"b_wx_temp",sec:"Conditions",q:"Outdoor temperature?",t:"num",u:"°F",ic:"🌡️",sk:1,ph:"Current outdoor temp"},
  {id:"b_wx_precip",sec:"Conditions",q:"Recent precipitation?",t:"ch",ic:"🌧️",sk:1,opts:["None in past 48 hours","Rain within 24 hours","Heavy rain / storm within 72 hours","Flooding recent"]},
  // In-Situ Field Testing (legally critical — these change the moment water leaves the pipe)
  {id:"f_ph",sec:"Field Testing",q:"Field pH reading?",t:"num",u:"SU",ic:"🧪",sk:1,ph:"e.g. 7.2",ref:"Measure at point of use with calibrated pH meter. Record within 15 min of collection."},
  {id:"f_temp",sec:"Field Testing",q:"Water temperature at tap?",t:"num",u:"°F",ic:"🌡️",sk:1,ph:"e.g. 55.4"},
  {id:"f_chlorine",sec:"Field Testing",q:"Residual chlorine?",t:"num",u:"mg/L",ic:"💧",sk:1,ph:"Free chlorine, e.g. 0.4",ref:"DPD colorimetric or amperometric. Target 0.2–2.0 mg/L for adequate disinfection."},
  {id:"f_turbidity",sec:"Field Testing",q:"Field turbidity?",t:"num",u:"NTU",ic:"🌫️",sk:1,ph:"e.g. 0.8",ref:"Nephelometric method. >1 NTU may interfere with disinfection."},
  // Meter Calibration (NIST traceability)
  {id:"f_meter",sec:"Meter Calibration",q:"Field meter make/model?",t:"text",ic:"📏",sk:1,ph:"e.g. Hach HQ40d, YSI Pro Plus"},
  {id:"f_meter_serial",sec:"Meter Calibration",q:"Meter serial number?",t:"text",ic:"🔢",sk:1,ph:"Serial number"},
  {id:"f_meter_cal",sec:"Meter Calibration",q:"Calibration status?",t:"ch",ic:"✅",sk:1,opts:["NIST-traceable calibration current","Factory calibrated — within spec","Field calibrated with standards","Calibration overdue","Not calibrated","N/A — no field meter used"],ref:"NIST-traceable calibration proves field meters were accurate. Required for legal defensibility."},
  {id:"f_meter_cal_date",sec:"Meter Calibration",q:"Last calibration date?",t:"text",ic:"📅",sk:1,ph:"e.g. 2026-03-01"},
  {id:"f_meter_buffers",sec:"Meter Calibration",q:"pH calibration buffers used?",t:"multi",ic:"🧫",sk:1,opts:["pH 4.0","pH 7.0","pH 10.0","N/A"]},
];
