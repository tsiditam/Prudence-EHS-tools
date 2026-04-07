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

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMediaQuery } from './hooks/useMediaQuery'
import LandingPage from './components/LandingPage'

// ═══════════════════════════════════════════════════════════════════════════════
// HydroScan — Drinking Water Quality Intelligence
// Prudence EHS Platform Module
// Field Assessment · Lab Results · Compliance Engine · Sampling Plans
// ═══════════════════════════════════════════════════════════════════════════════

/* ─── CUSTOM ICON SYSTEM ──────────────────────────────────────────── */

// HydroScan Logo — water drop with pulse/analysis line
const Logo = ({s=40}) => (
  <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
    <defs>
      <linearGradient id="hs-pulse" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#0D9488" />
        <stop offset="50%" stopColor="#14B8A6" />
        <stop offset="100%" stopColor="#5EEAD4" />
      </linearGradient>
      <clipPath id="hs-clip"><path d="M50 8 C50 8, 85 42, 85 58 A35 35 0 1 1 15 58 C15 42, 50 8, 50 8Z" /></clipPath>
    </defs>
    {/* Drop outline */}
    <path d="M50 8 C50 8, 85 42, 85 58 A35 35 0 1 1 15 58 C15 42, 50 8, 50 8Z" stroke="#0D9488" strokeWidth="5" fill="none" strokeLinejoin="round" />
    {/* Grid inside drop */}
    <g clipPath="url(#hs-clip)" opacity=".12" stroke="#14B8A6" strokeWidth=".8">
      <line x1="20" y1="48" x2="80" y2="48" /><line x1="20" y1="58" x2="80" y2="58" /><line x1="20" y1="68" x2="80" y2="68" />
      <line x1="35" y1="35" x2="35" y2="80" /><line x1="50" y1="35" x2="50" y2="80" /><line x1="65" y1="35" x2="65" y2="80" />
    </g>
    {/* Pulse line */}
    <polyline points="22,58 34,58 40,44 48,70 55,38 62,62 70,54 80,54" stroke="url(#hs-pulse)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* Start node */}
    <circle cx="22" cy="58" r="3.5" fill="#0D9488" stroke="#080A0E" strokeWidth="1.5" />
  </svg>
);

const I = ({n, s=18, c="currentColor", w=1.8}) => {
  const p = {width:s,height:s,viewBox:"0 0 24 24",fill:"none",stroke:c,strokeWidth:w,strokeLinecap:"round",strokeLinejoin:"round"};
  const d = {
    drop: <svg {...p}><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>,
    flask: <svg {...p}><path d="M9 3v6l-2 4v5a2 2 0 002 2h6a2 2 0 002-2v-5l-2-4V3"/><path d="M9 3h6"/><path d="M7 13h10"/><circle cx="11" cy="17" r="1" fill={c} stroke="none"/></svg>,
    shield: <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>,
    alert: <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    check: <svg {...p}><path d="M20 6L9 17l-5-5" strokeWidth="2.5"/></svg>,
    bldg: <svg {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22V12h6v10"/><line x1="8" y1="6" x2="8" y2="6.01" strokeWidth="2.5"/><line x1="12" y1="6" x2="12" y2="6.01" strokeWidth="2.5"/><line x1="16" y1="6" x2="16" y2="6.01" strokeWidth="2.5"/></svg>,
    chart: <svg {...p}><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
    clip: <svg {...p}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,
    clock: <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    search: <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    bolt: <svg {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={c} fillOpacity=".12"/><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    user: <svg {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    send: <svg {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    home: <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>,
    pipe: <svg {...p}><path d="M4 10h4v4H4z" fill={c} fillOpacity=".1"/><path d="M8 10h8v4H8z"/><path d="M16 10h4v4h-4z" fill={c} fillOpacity=".1"/><path d="M4 10h16v4H4z"/><path d="M6 14v4M18 14v4M6 6v4M18 6v4"/></svg>,
    bacteria: <svg {...p}><circle cx="12" cy="12" r="5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5.6 5.6l3.5 3.5M14.8 14.8l3.5 3.5M5.6 18.4l3.5-3.5M14.8 9.2l3.5-3.5"/></svg>,
    well: <svg {...p}><path d="M6 4h12M8 4v4a4 4 0 008 0V4"/><path d="M12 8v14"/><path d="M8 18h8"/><path d="M7 22h10"/></svg>,
    refresh: <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
    download: <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    chain: <svg {...p}><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.5 8.5L15.5 15.5"/><circle cx="18" cy="6" r="2" strokeWidth="1.5" opacity=".5"/></svg>,
    pulse: <svg {...p}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h3l1.5-3 2 6 1.5-3H19" strokeWidth="2"/></svg>,
  };
  return d[n] || null;
};

const VER = "1.0.0-beta";
const PLAT_MODULES = [
  { id:"atmosiq", n:"AtmosIQ", i:"🌬️" },
  { id:"hydroscan", n:"HydroScan", i:"💧", on:true },
];

/* ─── STANDARDS DATABASE ─────────────────────────────────────────── */
// EPA SDWA MCLs, MCLGs, Action Levels, SMCLs + WHO Guidelines
// Sources: EPA 816-F-09-004, 40 CFR 141, WHO GDWQ 4th Ed (2022)
const STD = {
  micro: [
    {id:"tc",name:"Total Coliforms",unit:"P/A",mcl:"<5% positive",mclg:0,who:"Should not be detected",cat:"Microbiological",health:"Indicator of treatment failure or distribution contamination",acute:true},
    {id:"ecoli",name:"E. coli",unit:"P/A",mcl:"Zero",mclg:0,who:"Must not be detected",cat:"Microbiological",health:"Indicates fecal contamination — immediate health risk",acute:true},
    {id:"turb",name:"Turbidity",unit:"NTU",mcl:1,mclg:null,who:1,smcl:null,cat:"Microbiological",health:"Pathogen surrogate — interferes with disinfection",acute:true},
    {id:"hpc",name:"Heterotrophic Plate Count",unit:"CFU/mL",mcl:500,mclg:null,who:null,cat:"Microbiological",health:"General microbial indicator"},
  ],
  metals: [
    {id:"pb",name:"Lead",unit:"µg/L",mcl:null,al:15,mclg:0,who:10,cat:"Metals",health:"Neurotoxin — no safe level for children. EPA MCLG is zero.",crc:null},
    {id:"cu",name:"Copper",unit:"mg/L",mcl:null,al:1.3,mclg:1.3,who:2,smcl:1.0,cat:"Metals",health:"GI effects at high levels; liver/kidney damage chronic"},
    {id:"as",name:"Arsenic",unit:"µg/L",mcl:10,mclg:0,who:10,cat:"Metals",health:"Group 1 carcinogen (IARC) — bladder, lung, skin cancer",crc:"Group 1"},
    {id:"no3",name:"Nitrate (as N)",unit:"mg/L",mcl:10,mclg:10,who:50,cat:"Inorganics",health:"Methemoglobinemia (blue baby syndrome) in infants",acute:true},
    {id:"no2",name:"Nitrite (as N)",unit:"mg/L",mcl:1,mclg:1,who:3,cat:"Inorganics",health:"Methemoglobinemia — more acutely toxic than nitrate",acute:true},
    {id:"f",name:"Fluoride",unit:"mg/L",mcl:4,mclg:4,who:1.5,smcl:2,cat:"Inorganics",health:"Skeletal fluorosis at high chronic exposure; dental fluorosis >2 mg/L"},
    {id:"ba",name:"Barium",unit:"mg/L",mcl:2,mclg:2,who:1.3,cat:"Metals",health:"Cardiovascular effects"},
    {id:"cr",name:"Chromium (total)",unit:"µg/L",mcl:100,mclg:100,who:50,cat:"Metals",health:"Chromium-6 is a carcinogen; total Cr MCL includes all forms"},
    {id:"hg",name:"Mercury",unit:"µg/L",mcl:2,mclg:2,who:6,cat:"Metals",health:"Kidney damage, neurological effects"},
    {id:"se",name:"Selenium",unit:"µg/L",mcl:50,mclg:50,who:40,cat:"Metals",health:"Hair/nail loss, numbness, circulatory problems"},
    {id:"cd",name:"Cadmium",unit:"µg/L",mcl:5,mclg:5,who:3,cat:"Metals",health:"Kidney damage; Group 1 carcinogen (IARC)"},
    {id:"sb",name:"Antimony",unit:"µg/L",mcl:6,mclg:6,who:20,cat:"Metals",health:"Cholesterol, blood sugar effects"},
    {id:"tl",name:"Thallium",unit:"µg/L",mcl:2,mclg:0.5,who:null,cat:"Metals",health:"Hair loss, kidney/liver/intestinal damage"},
    {id:"u",name:"Uranium",unit:"µg/L",mcl:30,mclg:0,who:30,cat:"Metals",health:"Kidney toxicity; radioactive; carcinogen"},
  ],
  dbp: [
    {id:"tthm",name:"Total THMs",unit:"µg/L",mcl:80,mclg:null,who:null,cat:"DBPs",health:"Chloroform group — bladder cancer risk (EPA Stage 2 DBPR)"},
    {id:"haa5",name:"HAA5",unit:"µg/L",mcl:60,mclg:null,who:null,cat:"DBPs",health:"Haloacetic acids — cancer risk from chlorination byproducts"},
    {id:"br",name:"Bromate",unit:"µg/L",mcl:10,mclg:0,who:10,cat:"DBPs",health:"Carcinogen — byproduct of ozonation"},
  ],
  disinfectant: [
    {id:"cl2",name:"Free Chlorine",unit:"mg/L",mrdl:4,mrdlg:4,who:5,cat:"Disinfectant",health:"Eye/nose irritation >4 mg/L; residual needed for pathogen control",target:{min:0.2,max:2}},
    {id:"nh2cl",name:"Chloramine",unit:"mg/L",mrdl:4,mrdlg:4,who:3,cat:"Disinfectant",health:"Respiratory irritation at high levels"},
  ],
  physical: [
    {id:"ph",name:"pH",unit:"SU",smcl:{min:6.5,max:8.5},who:{min:6.5,max:8.5},cat:"Physical",health:"Low pH (<6.5) corrodes pipes releasing lead/copper; high pH reduces disinfection"},
    {id:"tds",name:"Total Dissolved Solids",unit:"mg/L",smcl:500,who:null,cat:"Physical",health:"Taste/aesthetic indicator; >1000 increasingly unpalatable"},
    {id:"hard",name:"Hardness (as CaCO3)",unit:"mg/L",smcl:null,who:null,cat:"Physical",health:"Scale buildup; WHO classifies: <60 soft, 60-120 moderate, 120-180 hard, >180 very hard",whoClass:[{max:60,l:"Soft"},{max:120,l:"Moderate"},{max:180,l:"Hard"},{max:99999,l:"Very Hard"}]},
    {id:"fe",name:"Iron",unit:"mg/L",smcl:0.3,who:null,cat:"Physical",health:"Staining, metallic taste; not a health concern at typical levels"},
    {id:"mn",name:"Manganese",unit:"µg/L",smcl:50,who:80,healthAdv:300,cat:"Physical",health:"Black staining; neurotoxic to infants at >300 µg/L (EPA Health Advisory 2004)"},
    {id:"so4",name:"Sulfate",unit:"mg/L",smcl:250,who:null,cat:"Physical",health:"Laxative effect >500 mg/L; taste threshold ~250 mg/L"},
    {id:"cl",name:"Chloride",unit:"mg/L",smcl:250,who:null,cat:"Physical",health:"Salty taste; corrosion indicator"},
    {id:"na",name:"Sodium",unit:"mg/L",smcl:null,who:null,epaAdv:20,cat:"Physical",health:"EPA advisory 20 mg/L for sodium-restricted diets; no MCL"},
    {id:"zn",name:"Zinc",unit:"mg/L",smcl:5,who:null,cat:"Physical",health:"Metallic taste; not a health concern at typical levels"},
    {id:"color",name:"Color",unit:"CU",smcl:15,who:15,cat:"Physical",health:"Aesthetic; may indicate organic contamination or metals"},
  ],
  voc: [
    {id:"benz",name:"Benzene",unit:"µg/L",mcl:5,mclg:0,who:10,cat:"VOCs",health:"Group 1 carcinogen (IARC) — leukemia",crc:"Group 1"},
    {id:"tce",name:"Trichloroethylene (TCE)",unit:"µg/L",mcl:5,mclg:0,who:20,cat:"VOCs",health:"Group 1 carcinogen — kidney cancer, NHL",crc:"Group 1"},
    {id:"pce",name:"Tetrachloroethylene (PCE)",unit:"µg/L",mcl:5,mclg:0,who:40,cat:"VOCs",health:"Probable carcinogen — liver, kidney effects",crc:"Group 2A"},
    {id:"vc",name:"Vinyl Chloride",unit:"µg/L",mcl:2,mclg:0,who:0.3,cat:"VOCs",health:"Group 1 carcinogen — liver angiosarcoma",crc:"Group 1"},
    {id:"ccl4",name:"Carbon Tetrachloride",unit:"µg/L",mcl:5,mclg:0,who:4,cat:"VOCs",health:"Probable carcinogen — liver/kidney damage",crc:"Group 2B"},
    {id:"mtbe",name:"MTBE",unit:"µg/L",mcl:null,mclg:null,who:null,epaAdv:20,cat:"VOCs",health:"Taste/odor at low levels; possible carcinogen; EPA advisory 20-40 µg/L"},
  ],
  radio: [
    {id:"ga",name:"Gross Alpha",unit:"pCi/L",mcl:15,mclg:0,who:null,cat:"Radionuclides",health:"Screening for radioactive contamination; cancer risk"},
    {id:"ra",name:"Radium 226+228",unit:"pCi/L",mcl:5,mclg:0,who:null,cat:"Radionuclides",health:"Bone cancer risk"},
  ],
  pfas: [
    {id:"pfoa",name:"PFOA",unit:"ppt",mcl:4,mclg:0,who:null,cat:"PFAS",health:"Linked to kidney/testicular cancer, thyroid disease, pregnancy complications. Group 1 carcinogen (IARC 2023). EPA MCLG is zero.",crc:"Group 1",pfasHI:false},
    {id:"pfos",name:"PFOS",unit:"ppt",mcl:4,mclg:0,who:null,cat:"PFAS",health:"Linked to liver damage, immune suppression, developmental effects, cancer. EPA MCLG is zero.",crc:"Group 1",pfasHI:false},
    {id:"pfhxs",name:"PFHxS",unit:"ppt",mcl:10,mclg:10,who:null,cat:"PFAS",health:"Thyroid effects, liver toxicity, developmental concerns. Part of Hazard Index mixture.",pfasHI:true,hiDenom:10},
    {id:"pfna",name:"PFNA",unit:"ppt",mcl:10,mclg:10,who:null,cat:"PFAS",health:"Developmental toxicity, liver and kidney effects. Part of Hazard Index mixture.",pfasHI:true,hiDenom:10},
    {id:"hfpoda",name:"HFPO-DA (GenX)",unit:"ppt",mcl:10,mclg:10,who:null,cat:"PFAS",health:"Liver toxicity, kidney effects, developmental toxicity, cancer concern. Part of Hazard Index mixture.",pfasHI:true,hiDenom:10},
    {id:"pfbs",name:"PFBS",unit:"ppt",mcl:null,mclg:null,who:null,cat:"PFAS",health:"Thyroid, reproductive, developmental effects. No individual MCL — included in Hazard Index mixture only.",pfasHI:true,hiDenom:2000},
  ],
};

// State-specific standards (stricter than federal where applicable)
const STATE_STDS = {
  NJ: {pfoa:14,pfos:13,pfna:13,pfhxs:null,mn_health:null,label:"New Jersey DEP"},
  CA: {pfoa:null,pfos:null,cr6:10,mn_health:null,label:"California OEHHA (Notification Levels)"},
  MA: {pfas6_total:20,label:"Massachusetts DEP (MassDEP PFAS6 sum ≤ 20 ppt)"},
  VT: {pfas5_total:20,label:"Vermont ANR (PFAS5 sum ≤ 20 ppt)"},
  NH: {pfoa:12,pfos:15,pfhxs:18,pfna:11,label:"New Hampshire DES"},
  MI: {pfoa:8,pfos:16,pfhxs:51,pfna:6,pfbs:420,hfpoda:370,label:"Michigan EGLE"},
};

// Flatten for lookup
const ALL_PARAMS = [...STD.micro,...STD.metals,...STD.dbp,...STD.disinfectant,...STD.physical,...STD.voc,...STD.radio,...STD.pfas];
const PARAM_MAP = Object.fromEntries(ALL_PARAMS.map(p=>[p.id,p]));

// Categories for grouping
const CATS = ["Microbiological","Metals","Inorganics","DBPs","Disinfectant","Physical","VOCs","Radionuclides","PFAS"];

/* ─── FIELD ASSESSMENT QUESTIONS ─────────────────────────────────── */
const Q_ASSESSOR = [
  {id:"a_name",sec:"Assessor",q:"Assessor name and credentials",t:"text",req:1,ic:"👤",ph:"e.g. T. Tamakloe, CSP"},
  {id:"a_certs",sec:"Assessor",q:"Certifications held",t:"multi",ic:"🎓",opts:["CIH","CSP","PE","Licensed Water Operator","OSHA 30-Hour","HAZWOPER 40-Hour","State Water Inspector","Other"]},
  {id:"a_exp",sec:"Assessor",q:"Years of relevant experience",t:"ch",ic:"📅",opts:["1–3 years","3–5 years","5–10 years","10–20 years","20+ years"]},
];

const Q_SOURCE = [
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

const Q_BUILDING = [
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

/* ─── LAB PARAMETERS — QUICK-ADD PRESETS ─────────────────────────── */
const QUICK_ADD = {
  basic: {label:"Basic Well Test",ids:["tc","ecoli","no3","pb","cu","ph","tds","hard","fe","mn","cl2"]},
  lead: {label:"Lead & Copper",ids:["pb","cu","ph"]},
  metals_full: {label:"Full Metals",ids:["pb","cu","as","ba","cr","cd","hg","se","sb","tl","u","fe","mn","zn","na"]},
  micro: {label:"Microbiological",ids:["tc","ecoli","hpc","turb"]},
  dbp: {label:"Disinfection Byproducts",ids:["tthm","haa5","cl2"]},
  voc: {label:"VOC Screen",ids:["benz","tce","pce","vc","ccl4","mtbe"]},
  comprehensive: {label:"Comprehensive",ids:["tc","ecoli","pb","cu","as","no3","no2","f","ba","cr","hg","se","cd","tthm","haa5","cl2","benz","tce","pce","ph","tds","hard","fe","mn","so4","cl","na","turb","color"]},
  pfas: {label:"PFAS Panel",ids:["pfoa","pfos","pfhxs","pfna","hfpoda","pfbs"]},
};

/* ─── COMPLIANCE ENGINE ──────────────────────────────────────────── */
function evaluateResults(results) {
  // results = [{id, value, unit, qualifier}]
  const findings = [];
  let tier = "compliant"; // compliant|monitor|advisory|immediate

  results.forEach(r => {
    const param = PARAM_MAP[r.id];
    if (!param || r.value === null || r.value === undefined || r.value === "") return;

    const val = r.qualifier === "P" ? "P" : r.qualifier === "A" ? "A" : parseFloat(r.value);
    const f = { param, value: val, qualifier: r.qualifier || null, violations: [], advisories: [], notes: [] };

    // Presence/Absence parameters (coliforms, E. coli)
    if (param.unit === "P/A") {
      if (val === "P" || val === "Detected" || val === "Present") {
        if (param.id === "ecoli") {
          f.violations.push({ std: "EPA MCL", threshold: "Zero", desc: "E. coli detected — IMMEDIATE boil water advisory", severity: "critical" });
          tier = "immediate";
        } else if (param.id === "tc") {
          f.violations.push({ std: "EPA RTCR", threshold: "< 5% positive", desc: "Total coliforms detected — repeat sampling required", severity: "high" });
          if (tier !== "immediate") tier = "advisory";
        }
      } else {
        f.notes.push("Not detected — compliant");
      }
      findings.push(f);
      return;
    }

    if (isNaN(val)) { findings.push(f); return; }

    // pH — range check
    if (param.id === "ph") {
      if (param.smcl) {
        if (val < param.smcl.min) {
          f.advisories.push({ std: "EPA SMCL", threshold: `${param.smcl.min}–${param.smcl.max}`, desc: `pH ${val} — corrosive; may leach lead/copper from pipes`, severity: "high" });
          if (tier === "compliant") tier = "advisory";
        } else if (val > param.smcl.max) {
          f.advisories.push({ std: "EPA SMCL", threshold: `${param.smcl.min}–${param.smcl.max}`, desc: `pH ${val} — alkaline; may reduce disinfection efficacy`, severity: "medium" });
          if (tier === "compliant") tier = "monitor";
        } else {
          f.notes.push(`pH ${val} — within SMCL range`);
        }
      }
      findings.push(f);
      return;
    }

    // Standard threshold checks
    // MCL check (primary — legal)
    if (param.mcl && typeof param.mcl === "number" && val > param.mcl) {
      f.violations.push({ std: "EPA MCL", threshold: `${param.mcl} ${param.unit}`, desc: `${param.name} ${val} ${param.unit} EXCEEDS MCL of ${param.mcl}`, severity: param.acute ? "critical" : "high" });
      tier = param.acute ? "immediate" : (tier !== "immediate" ? "immediate" : tier);
    }
    // Action Level (Lead/Copper Rule)
    else if (param.al && val > param.al) {
      f.violations.push({ std: "EPA Action Level", threshold: `${param.al} ${param.unit}`, desc: `${param.name} ${val} ${param.unit} exceeds Action Level of ${param.al}`, severity: "high" });
      if (tier !== "immediate") tier = "immediate";
    }
    // MRDL (disinfectant)
    else if (param.mrdl && val > param.mrdl) {
      f.violations.push({ std: "EPA MRDL", threshold: `${param.mrdl} ${param.unit}`, desc: `${param.name} ${val} ${param.unit} exceeds MRDL of ${param.mrdl}`, severity: "medium" });
      if (tier === "compliant" || tier === "monitor") tier = "advisory";
    }
    // WHO guideline exceedance (non-US jurisdictions or health reference)
    else if (param.who && typeof param.who === "number" && val > param.who && !(param.mcl && val <= param.mcl)) {
      f.advisories.push({ std: "WHO Guideline", threshold: `${param.who} ${param.unit}`, desc: `${param.name} ${val} exceeds WHO guideline of ${param.who}`, severity: "medium" });
      if (tier === "compliant") tier = "monitor";
    }
    // Approaching MCL (> 80%)
    else if (param.mcl && typeof param.mcl === "number" && val > param.mcl * 0.8) {
      f.advisories.push({ std: "EPA MCL", threshold: `${param.mcl} ${param.unit}`, desc: `${param.name} ${val} — approaching MCL (>${Math.round(param.mcl*0.8)})`, severity: "low" });
      if (tier === "compliant") tier = "monitor";
    }
    // SMCL exceedance (aesthetic)
    else if (param.smcl && typeof param.smcl === "number" && val > param.smcl) {
      f.advisories.push({ std: "EPA SMCL", threshold: `${param.smcl} ${param.unit}`, desc: `${param.name} ${val} — exceeds secondary standard of ${param.smcl}`, severity: "low" });
      if (tier === "compliant") tier = "monitor";
    }
    // Health advisory (manganese, MTBE, sodium)
    else if (param.healthAdv && val > param.healthAdv) {
      f.advisories.push({ std: "EPA Health Advisory", threshold: `${param.healthAdv} ${param.unit}`, desc: `${param.name} ${val} — exceeds EPA health advisory level`, severity: "medium" });
      if (tier === "compliant" || tier === "monitor") tier = "advisory";
    }
    else if (param.epaAdv && val > param.epaAdv) {
      f.advisories.push({ std: "EPA Advisory", threshold: `${param.epaAdv} ${param.unit}`, desc: `${param.name} ${val} — exceeds EPA advisory of ${param.epaAdv}`, severity: "low" });
      if (tier === "compliant") tier = "monitor";
    }
    // Pass
    else {
      const ref = param.mcl || param.al || param.mrdl || (param.smcl && typeof param.smcl === "number" ? param.smcl : null);
      if (ref) f.notes.push(`${val} ${param.unit} — below ${ref} ${param.unit}`);
      else f.notes.push(`${val} ${param.unit} — recorded`);
    }

    // Carcinogen flag
    if (param.crc && val > 0) {
      f.notes.push(`${param.crc} carcinogen (IARC)`);
    }

    // MCLG zero check — any detection is noteworthy
    if (param.mclg === 0 && val > 0 && !f.violations.length) {
      f.notes.push(`EPA MCLG is zero — any detection warrants attention`);
    }

    findings.push(f);
  });

  // PFAS Hazard Index calculation (EPA NPDWR 2024)
  // HI = sum of (concentration / health-based water concentration) for PFHxS, PFNA, HFPO-DA, PFBS
  const hiParams = results.filter(r => PARAM_MAP[r.id]?.pfasHI && r.value && parseFloat(r.value) > 0);
  if (hiParams.length >= 2) {
    let hi = 0;
    const hiComponents = [];
    hiParams.forEach(r => {
      const p = PARAM_MAP[r.id];
      const val = parseFloat(r.value);
      const fraction = val / p.hiDenom;
      hi += fraction;
      hiComponents.push(`${p.name}: ${val}/${p.hiDenom} = ${fraction.toFixed(3)}`);
    });
    if (hi > 1) {
      findings.push({
        param: {id:"pfas_hi",name:"PFAS Hazard Index (Mixture)",unit:"unitless",cat:"PFAS",health:"Combined health risk from co-occurring PFAS exceeds EPA threshold. The Hazard Index accounts for additive effects of multiple PFAS compounds."},
        value: hi.toFixed(3), qualifier: null,
        violations: [{std:"EPA PFAS NPDWR (Hazard Index MCL)",threshold:"1.0",desc:`PFAS Hazard Index ${hi.toFixed(3)} EXCEEDS MCL of 1.0 — mixture of ${hiParams.length} PFAS compounds`,severity:"critical"}],
        advisories: [], notes: hiComponents,
      });
      tier = "immediate";
    } else if (hi > 0.5) {
      findings.push({
        param: {id:"pfas_hi",name:"PFAS Hazard Index (Mixture)",unit:"unitless",cat:"PFAS",health:"Approaching combined PFAS threshold."},
        value: hi.toFixed(3), qualifier: null, violations: [],
        advisories: [{std:"EPA PFAS NPDWR",threshold:"1.0",desc:`PFAS HI ${hi.toFixed(3)} — approaching mixture MCL of 1.0`,severity:"medium"}],
        notes: hiComponents,
      });
      if (tier === "compliant") tier = "monitor";
    }
  }

  return { findings, tier };
}

/* ─── CAUSAL CHAIN ENGINE ────────────────────────────────────────── */
function buildWaterCausalChains(fieldData, labFindings) {
  const chains = [];
  const fd = fieldData || {};
  const violations = labFindings?.filter(f => f.violations.length > 0) || [];
  const advisories = labFindings?.filter(f => f.advisories.length > 0) || [];

  // Lead pathway
  const leadF = labFindings?.find(f => f.param.id === "pb" && f.violations.length > 0);
  if (leadF) {
    const ev = [`Lead ${leadF.value} µg/L — exceeds Action Level`];
    if ((fd.b_pipe_mat||"").includes("Lead")) ev.push("Lead service line identified");
    if ((fd.b_int_pipe||"").includes("lead")) ev.push("Pre-1986 copper with potential lead solder");
    if ((fd.b_fix_age||"").includes("Pre-")) ev.push("Older fixtures may contain lead");
    const phF = labFindings?.find(f => f.param.id === "ph");
    if (phF && phF.value < 7) ev.push(`Low pH (${phF.value}) — corrosive water leaches lead`);
    if (fd.b_stag && fd.b_stag !== "No — all areas in regular use") ev.push("Stagnation present — increases lead leaching");
    chains.push({ type: "Lead Contamination", evidence: ev, confidence: ev.length >= 3 ? "Strong" : ev.length >= 2 ? "Moderate" : "Preliminary", severity: "critical", recommendation: "Implement corrosion control, flush before use, consider lead service line replacement. For children under 6: use only cold water for drinking and cooking, run water 2+ minutes after stagnation." });
  }

  // Microbial contamination (private wells)
  const ecoliF = labFindings?.find(f => f.param.id === "ecoli" && f.violations.length > 0);
  const tcF = labFindings?.find(f => f.param.id === "tc" && f.violations.length > 0);
  if (ecoliF || tcF) {
    const ev = [];
    if (ecoliF) ev.push("E. coli detected — fecal contamination confirmed");
    if (tcF && !ecoliF) ev.push("Total coliforms detected — treatment/distribution concern");
    if ((fd.src_well_cap||"") !== "Sealed — good condition" && fd.src_type?.includes("well")) ev.push(`Well cap: ${fd.src_well_cap || "unknown condition"}`);
    if ((fd.src_well_flood||"") === "Yes — significant flooding") ev.push("Recent flooding of well area");
    if ((fd.src_well_prox||[]).some(p => p.includes("Septic"))) ev.push("Septic system within proximity");
    const turbF = labFindings?.find(f => f.param.id === "turb" && (f.violations.length > 0 || f.advisories.length > 0));
    if (turbF) ev.push(`Elevated turbidity (${turbF.value} NTU) — may harbor pathogens`);
    chains.push({ type: "Microbial Contamination", evidence: ev, confidence: ev.length >= 3 ? "Strong" : "Moderate", severity: "critical", recommendation: ecoliF ? "IMMEDIATE: Issue boil water advisory. Shock chlorinate well. Investigate contamination source. Retest after treatment. Consider UV disinfection." : "Repeat sampling within 24 hours. If confirmed, investigate source and disinfect." });
  }

  // Legionella risk (building systems)
  if (fd.b_wh_temp && !["140°F or above","Unknown"].includes(fd.b_wh_temp)) {
    const ev = [`Water heater temperature: ${fd.b_wh_temp}`];
    if (fd.b_stag && fd.b_stag !== "No — all areas in regular use") ev.push(`Stagnation: ${fd.b_stag}`);
    if (fd.b_deadlegs === "Yes" || fd.b_deadlegs === "Suspected") ev.push("Dead legs present — high-risk stagnation zones");
    if (fd.b_wh_age && ["10–15 years","Over 15 years"].includes(fd.b_wh_age)) ev.push(`Aging water heater (${fd.b_wh_age}) — biofilm accumulation risk`);
    if ((fd.b_visual||[]).includes("Biofilm / slime at fixtures")) ev.push("Visible biofilm observed at fixtures");
    if (ev.length >= 2) chains.push({ type: "Legionella Risk Factors", evidence: ev, confidence: ev.length >= 3 ? "Strong" : "Moderate", severity: "high", recommendation: "Implement water management program per ASHRAE 188-2018. Raise stored water temperature to ≥140°F (60°C). Flush low-use fixtures weekly. Consider Legionella culture testing. Consult with water management specialist." });
  }

  // Nitrate contamination (agricultural/septic)
  const no3F = labFindings?.find(f => f.param.id === "no3" && (f.violations.length > 0 || f.advisories.length > 0));
  if (no3F) {
    const ev = [`Nitrate: ${no3F.value} mg/L`];
    if ((fd.src_well_prox||[]).some(p => p.includes("Agricultural") || p.includes("Septic"))) ev.push("Contamination source nearby: " + (fd.src_well_prox||[]).filter(p => p.includes("Agricultural") || p.includes("Septic")).join(", "));
    if (fd.b_children === "Yes") ev.push("VULNERABLE POPULATION: Children under 6 present — methemoglobinemia risk");
    chains.push({ type: "Nitrate Contamination", evidence: ev, confidence: ev.length >= 2 ? "Moderate" : "Preliminary", severity: no3F.violations.length > 0 ? "critical" : "high", recommendation: "Do not use for infant formula preparation. Identify and eliminate contamination source. Consider treatment (ion exchange or RO). Retest quarterly." });
  }

  // Corrosion indicators
  const phF = labFindings?.find(f => f.param.id === "ph" && f.advisories.length > 0 && f.value < 6.5);
  const cuF = labFindings?.find(f => f.param.id === "cu" && (f.violations.length > 0 || f.advisories.length > 0));
  if (phF || (cuF && leadF)) {
    const ev = [];
    if (phF) ev.push(`Low pH (${phF.value}) — aggressive/corrosive water`);
    if (leadF) ev.push(`Elevated lead (${leadF.value} µg/L)`);
    if (cuF) ev.push(`Elevated copper (${cuF.value} mg/L)`);
    if ((fd.b_visual||[]).includes("Green / blue staining (copper)")) ev.push("Blue-green staining observed at fixtures");
    if (ev.length >= 2) chains.push({ type: "Corrosive Water / Pipe Leaching", evidence: ev, confidence: ev.length >= 3 ? "Strong" : "Moderate", severity: leadF ? "critical" : "high", recommendation: "Install acid neutralizer (calcite/corosex) to raise pH. Consider phosphate-based corrosion inhibitor. Replace lead components. Monitor lead/copper quarterly." });
  }

  return chains;
}

/* ─── SAMPLING PLAN GENERATOR ────────────────────────────────────── */
function generateSamplingPlan(fieldData) {
  const plan = [];
  const fd = fieldData || {};
  const isWell = (fd.src_type||"").includes("well") || (fd.src_type||"") === "Spring";
  const isPublic = fd.src_type === "Public water system";

  // Always recommend for private wells with no recent testing
  if (isWell && fd.src_history !== "Tested within 1 year") {
    plan.push({ test: "Basic Water Chemistry", method: "EPA 200.7/200.8 (metals), SM 4500 (nutrients)", params: "Total Coliforms, E. coli, Nitrate, Lead, Copper, pH, Iron, Manganese, TDS, Hardness", trigger: "Private well without recent testing", hold: "Bacteria: 6 hours on ice. Metals: HNO₃ preserved, 180 days", notes: "First-draw sample for lead (stagnation ≥ 6 hours). Second draw for general chemistry.", std: "EPA Private Well Guidelines" });
  }

  // Lead/Copper — any building with risk factors
  if ((fd.b_pipe_mat||"").includes("Lead") || (fd.b_int_pipe||"").includes("lead") || (fd.b_int_pipe||"").includes("Galvanized") || (fd.b_fix_age||"").includes("Pre-")) {
    plan.push({ test: "Lead & Copper — First Draw / Flush Profile", method: "EPA 200.8 (ICP-MS)", params: "Lead (Pb), Copper (Cu)", trigger: `Plumbing risk: ${fd.b_pipe_mat || "unknown service line"}, ${fd.b_int_pipe || "unknown interior"}`, hold: "250 mL first-draw after ≥ 6-hour stagnation. Preserve with HNO₃. 180-day hold.", notes: "Collect 1st draw (1L), 2nd draw (1L), and flushed sample per EPA 3Ts protocol. Compare to identify lead source (service line vs. interior vs. fixture).", std: "EPA 3Ts, Lead and Copper Rule Revisions (LCRR 2024)" });
  }

  // Microbial — wells near septic, flooding, complaints
  if ((fd.src_well_prox||[]).some(p => p.includes("Septic")) || (fd.src_well_flood||"").includes("Yes") || (fd.src_complaints||[]).includes("Gastrointestinal illness")) {
    plan.push({ test: "Microbial Panel", method: "SM 9223 (Colilert)", params: "Total Coliforms, E. coli, Heterotrophic Plate Count", trigger: fd.src_well_flood?.includes("Yes") ? "Recent flooding of well area" : "Septic system proximity or GI complaints", hold: "Sterile container with Na₂S₂O₃ if chlorinated. Ice, <10°C. 6-hour hold time (strict).", notes: "Sample at point of use (kitchen cold water tap). Do not flame or pre-flush for bacteria samples.", std: "EPA Total Coliform Rule" });
  }

  // Legionella — building risk factors
  if (fd.b_stag && fd.b_stag !== "No — all areas in regular use" && fd.b_type && !["Single family residence"].includes(fd.b_type)) {
    plan.push({ test: "Legionella Culture", method: "ISO 11731, CDC ELITE protocol", params: "Legionella pneumophila, Legionella spp.", trigger: `Stagnation: ${fd.b_stag}. Water heater: ${fd.b_wh_temp || "unknown"}`, hold: "Sterile container, no preservative. Room temp. 24-hour hold.", notes: "Sample from distal fixtures (furthest from water heater), hot water return, water heater drain, and any cooling towers. Include hot and cold samples.", std: "ASHRAE 188-2018, ASHRAE Guideline 12-2020" });
  }

  // VOCs — near industrial, USTs, or chemical complaints
  if ((fd.src_well_prox||[]).some(p => p.includes("Underground") || p.includes("Industrial")) || (fd.src_complaints||[]).includes("Chemical / solvent") || (fd.b_odor||"") === "Chemical / solvent") {
    plan.push({ test: "VOC Screen", method: "EPA 524.2 (GC-MS)", params: "60+ compounds including benzene, TCE, PCE, vinyl chloride, MTBE", trigger: fd.src_well_prox?.filter(p => p.includes("Underground") || p.includes("Industrial")).join(", ") || "Chemical odor reported", hold: "40 mL VOA vials with HCl preservative. Zero headspace. Ice. 14-day hold.", notes: "Sample from raw (untreated) water source. Avoid splashing or aerating sample.", std: "EPA SDWA VOC MCLs" });
  }

  // Aesthetic complaints
  if ((fd.src_complaints||[]).some(c => ["Discoloration (brown/yellow/black)","Metallic taste","Rotten egg / sulfur odor","Staining (fixtures/laundry)"].includes(c))) {
    const existing = plan.find(p => p.params?.includes("Iron"));
    if (!existing) {
      plan.push({ test: "Aesthetic / Secondary Parameters", method: "EPA 200.7, SM 4500, SM 2120", params: "Iron, Manganese, Sulfate, Chloride, TDS, pH, Color, Hardness", trigger: `Complaints: ${(fd.src_complaints||[]).filter(c => !["No complaints","Gastrointestinal illness","Skin irritation / rash","Low pressure"].includes(c)).join(", ")}`, hold: "Metals: HNO₃ preserved. General: ice, unpreserved. 180-day / 28-day hold.", notes: "Include both first-draw and flushed samples to differentiate plumbing source from supply source.", std: "EPA Secondary MCLs" });
    }
  }

  // Radionuclides — well in known radionuclide area or if comprehensive
  if (isWell && fd.src_well_depth && parseInt(fd.src_well_depth) > 200) {
    plan.push({ test: "Radionuclide Screen", method: "EPA 900.0", params: "Gross Alpha, Radium 226+228", trigger: `Deep well (${fd.src_well_depth} ft) — bedrock aquifer`, hold: "HNO₃ or HCl preserved. 180-day hold.", notes: "If gross alpha > 5 pCi/L, follow up with speciated analysis. Granite/metamorphic bedrock increases risk.", std: "EPA SDWA Radionuclide MCLs" });
  }

  // PFAS — near military bases, airports, industrial sites, firefighting facilities
  if ((fd.src_well_prox||[]).some(p => p.includes("Industrial")) || (fd.src_trigger||"") === "Nearby contamination event" || isWell) {
    plan.push({ test: "PFAS Panel (6 Regulated Compounds)", method: "EPA 533 or EPA 537.1 (LC-MS/MS)", params: "PFOA, PFOS, PFHxS, PFNA, HFPO-DA (GenX), PFBS + Hazard Index calculation", trigger: isWell ? "Private well — EPA recommends PFAS testing for all private wells near potential sources" : "Potential PFAS source proximity", hold: "HDPE or polypropylene bottle (no glass). Trizma preservative. Ice. 14-day hold. No field filtering.", notes: "PFAS contamination sources include: military bases (AFFF firefighting foam), airports, landfills, wastewater treatment plants, and industrial facilities. Detection limits must be ≤2 ppt for PFOA/PFOS compliance evaluation.", std: "EPA PFAS NPDWR (40 CFR 141, April 2024)" });
  }

  return plan;
}

/* ─── SAMPLE COLLECTION GUIDE ────────────────────────────────────── */
const COLLECTION_GUIDES = {
  lead_first_draw: {
    title: "Lead First-Draw Sample Collection",
    std: "EPA 3Ts Protocol / Lead and Copper Rule",
    steps: [
      {n:1,text:"Identify the tap to sample (kitchen cold water or drinking fountain). Do NOT use bathroom taps.",icon:"🚰"},
      {n:2,text:"Ensure the tap has been unused for AT LEAST 6 hours (overnight stagnation is ideal). Post 'DO NOT USE' signs the evening before.",icon:"⏰"},
      {n:3,text:"Without pre-flushing, gently turn on the cold water tap and collect the FIRST 250 mL in the provided bottle. This is the 'first draw' — it captures water that has been in contact with plumbing fixtures.",icon:"🧪"},
      {n:4,text:"Immediately collect a SECOND 250 mL sample (second draw). This captures water from interior plumbing.",icon:"🧪"},
      {n:5,text:"Let the water run for 2-3 minutes, then collect a THIRD 'flushed' sample. This represents supply water after plumbing influence is purged.",icon:"💧"},
      {n:6,text:"Cap tightly. Label each bottle: sample location, date, time, collector name, 'First Draw' / 'Second Draw' / 'Flushed'.",icon:"🏷️"},
      {n:7,text:"Store on ice (<10°C). Deliver to certified lab within 48 hours. Samples should be preserved with HNO₃ (lab may pre-add).",icon:"🧊"},
    ],
    notes: "Comparing first-draw vs. flushed results identifies whether lead originates from fixtures (high first draw, low flushed) or service line (elevated in all samples). Use only cold water — hot water dissolves more lead."
  },
  bacteria: {
    title: "Bacteriological Sample Collection",
    std: "SM 9223B / EPA Total Coliform Rule",
    steps: [
      {n:1,text:"Use a STERILE sample container provided by the lab (contains sodium thiosulfate if water is chlorinated). Do NOT open until ready to collect.",icon:"🧫"},
      {n:2,text:"Select a cold water tap WITHOUT aerator screen, filter, or hose attachment. Remove aerator if present. Do NOT sample from outside spigots or swivel faucets.",icon:"🚰"},
      {n:3,text:"Run cold water for 2-3 minutes to flush the line (opposite of lead testing — we want supply water, not stagnant).",icon:"💧"},
      {n:4,text:"Turn off water. Disinfect the faucet opening with chlorine wipe or flame (lighter held under spout for 2-3 seconds). Let cool.",icon:"🔥"},
      {n:5,text:"Open sterile container without touching the inside of the cap or bottle rim. Fill to the marked line (usually 100 mL). Do NOT overfill.",icon:"🧪"},
      {n:6,text:"Cap immediately. Label with location, date, time, collector name.",icon:"🏷️"},
      {n:7,text:"Keep on ice (<10°C). Deliver to lab within 6 HOURS (strict hold time). Do not freeze. Do not expose to sunlight.",icon:"🧊"},
    ],
    notes: "The 6-hour hold time is non-negotiable — results from samples held longer are invalid. Plan collection timing around lab receiving hours. If you cannot deliver within 6 hours, contact the lab about shipping options."
  },
  pfas: {
    title: "PFAS Sample Collection",
    std: "EPA 533 / EPA 537.1",
    steps: [
      {n:1,text:"Use only HDPE (high-density polyethylene) or polypropylene containers provided by the lab. NEVER use glass — PFAS can adhere to glass surfaces.",icon:"🧪"},
      {n:2,text:"Do NOT wear waterproof or stain-resistant clothing, sunscreen, or insect repellent during collection — these contain PFAS and will contaminate the sample.",icon:"⚠️"},
      {n:3,text:"Do NOT use any products containing Teflon, Gore-Tex, or fluoropolymer materials during collection.",icon:"🚫"},
      {n:4,text:"Run the cold water tap for 2-3 minutes. Collect the sample directly into the provided container.",icon:"💧"},
      {n:5,text:"Add Trizma preservative if provided by lab (may be pre-added to container).",icon:"🧫"},
      {n:6,text:"Cap tightly. Label with location, date, time, collector name. Double-bag in provided ziplock.",icon:"🏷️"},
      {n:7,text:"Store on ice. Deliver to lab within 14 days. Lab must be capable of EPA 533 or 537.1 method with detection limits ≤2 ppt.",icon:"🧊"},
    ],
    notes: "PFAS sampling has unusually strict contamination prevention requirements. The most common source of false positives is contamination from the collector's clothing or equipment. Field blanks are strongly recommended."
  },
};

/* ─── RECOMMENDATION ENGINE ──────────────────────────────────────── */
function generateRecommendations(tier, findings, chains, fieldData) {
  const recs = { immediate: [], shortTerm: [], longTerm: [], monitoring: [] };
  const fd = fieldData || {};

  findings.forEach(f => {
    f.violations.forEach(v => {
      if (v.severity === "critical") {
        if (f.param.id === "ecoli") recs.immediate.push("BOIL WATER ADVISORY — Do not consume water without boiling for 1 minute. Notify all occupants immediately.");
        else if (f.param.id === "pb") recs.immediate.push("Flush cold water taps for 2+ minutes before drinking or cooking. Use only cold water for consumption. Install NSF-certified point-of-use filter rated for lead removal.");
        else if (f.param.id === "no3" && fd.b_children === "Yes") recs.immediate.push("DO NOT use water for infant formula preparation. Provide alternative water source for infants and pregnant women.");
        else recs.immediate.push(`${f.param.name} exceeds EPA limit — restrict use pending investigation and treatment.`);
      } else {
        recs.shortTerm.push(`${f.param.name} exceeds ${v.std} (${v.threshold}) — investigate source and treatment options within 30 days.`);
      }
    });
    f.advisories.forEach(a => {
      if (a.severity === "medium" || a.severity === "high") recs.shortTerm.push(`${f.param.name}: ${a.desc} — monitor and consider treatment.`);
      else recs.monitoring.push(`${f.param.name}: ${a.desc} — retest in 6-12 months.`);
    });
  });

  chains.forEach(ch => {
    if (ch.recommendation && !recs.immediate.includes(ch.recommendation) && !recs.shortTerm.includes(ch.recommendation)) {
      if (ch.severity === "critical") recs.immediate.push(ch.recommendation);
      else recs.shortTerm.push(ch.recommendation);
    }
  });

  // General monitoring
  if (fd.src_type?.includes("well")) recs.monitoring.push("Private wells: test annually for bacteria, nitrate, and any previously detected contaminants. Test every 3-5 years for comprehensive parameters.");
  if ((fd.b_pipe_mat||"").includes("Lead") || (fd.b_int_pipe||"").includes("lead")) recs.monitoring.push("Lead plumbing identified — test lead levels annually until service line is replaced.");

  return recs;
}

/* ─── STORAGE HELPERS ────────────────────────────────────────────── */
const STO = {
  get: async(k)=>{try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null;}catch{return null;}},
  set: async(k,v)=>{try{await window.storage.set(k,JSON.stringify(v));return true;}catch{return false;}},
  del: async(k)=>{try{await window.storage.delete(k);}catch{}},
  hasVisited: async()=>{const v=await STO.get("hydroscan-visited");if(!v)await STO.set("hydroscan-visited",true);return!!v;},
};

/* ─── FORMAT HELPERS ─────────────────────────────────────────────── */
const fD = ts => ts ? new Date(ts).toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"}) : "";
const tierColor = t => ({immediate:"#EF4444",advisory:"#FB923C",monitor:"#FBBF24",compliant:"#22C55E"}[t]||"#5E6578");
const tierLabel = t => ({immediate:"⚠ Immediate Action",advisory:"Advisory",monitor:"Monitor",compliant:"✓ Compliant"}[t]||"Unknown");
const tierBg = t => ({immediate:"#EF444412",advisory:"#FB923C12",monitor:"#FBBF2412",compliant:"#22C55E12"}[t]||"#12161D");
const sevColor = s => ({critical:"#EF4444",high:"#FB923C",medium:"#FBBF24",low:"#14B8A6",pass:"#22C55E"}[s]||"#5E6578");

/* ─── Particles Effect ───────────────────────────────────────────── */
function Particles(){return <div style={{position:"absolute",inset:0,overflow:"hidden"}}>{Array.from({length:12}).map((_,i)=><div key={i} style={{position:"absolute",width:2+Math.random()*3,height:2+Math.random()*3,background:`#14B8A6${Math.round(10+Math.random()*25).toString(16)}`,borderRadius:"50%",left:`${Math.random()*100}%`,top:`${Math.random()*100}%`,animation:`float ${4+Math.random()*6}s ease-in-out infinite ${Math.random()*5}s`}} />)}</div>;}

const ABOUT_BIO={
  oneLiner:"Built by a Certified Safety Professional with 10+ years of field experience.",
  paragraphs:["Tsidi Tamakloe, CSP is the founder of Prudence Safety & Environmental Consulting and an Occupational Safety and Health Program Manager at the F.A.A. He holds a B.S. in Health Science with a concentration in Environmental Health from Stony Brook University. Over the course of more than a decade, he has worked across manufacturing, defense, commercial real estate, construction, healthcare and federal government, performing industrial hygiene fieldwork, managing compliance programs, overseeing construction safety and leading teams of occupational safety professionals nationwide.","At F.A.A. Headquarters, he runs national programs including OSHA inspection response, a 12-member regional safety team and coordination of the National OSHECCOM. He also actively consults through Yellowbird and ComplyAuto, performing audits across multiple industries and staying directly connected to the compliance challenges businesses face every day.","That practitioner mindset is what led him to start building software for EHS professionals. After years of watching the work run on paper forms, tribal knowledge and fragmented spreadsheets, he became an early adopter of artificial intelligence to close that gap. Through Prudence, he is developing tools that bring regulatory rigor into modern, accessible platforms, built by someone who is still in the field doing the work. Mr. Tamakloe is a member of the American Society of Safety Professionals and the Maryland chapter of the American Industrial Hygiene Association."],
  website:"https://prudencesafety.com",
};

function AboutTrustBadge({onClick}){const[h,setH]=useState(false);return(<button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{display:"inline-flex",alignItems:"center",gap:8,background:h?"rgba(20,184,166,0.08)":"rgba(20,184,166,0.04)",border:`1px solid rgba(20,184,166,${h?0.25:0.12})`,borderRadius:8,padding:"10px 16px",cursor:"pointer",transition:"all 0.25s ease",transform:h?"translateY(-1px)":"none",width:"100%"}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"/><path d="M9 12l2 2 4-4"/></svg><span style={{fontFamily:"monospace",fontSize:12,color:"rgba(255,255,255,0.7)",textAlign:"left",flex:1}}>{ABOUT_BIO.oneLiner}</span><span style={{fontSize:12,color:"#14B8A6",opacity:h?1:0.5}}>→</span></button>);}

function AboutPanel({open,onClose}){const[v,setV]=useState(false);const[s,setS]=useState(false);useEffect(()=>{if(open){setV(true);setTimeout(()=>setS(true),30);}else{setS(false);setTimeout(()=>setV(false),350);}},[open]);if(!v)return null;return(<div onClick={onClose} style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:s?"rgba(0,0,0,0.7)":"rgba(0,0,0,0)",backdropFilter:s?"blur(8px)":"blur(0)",transition:"all 0.35s ease",padding:20}}><div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",background:"#0C0E13",border:"1px solid rgba(20,184,166,0.1)",borderRadius:16,opacity:s?1:0,transform:s?"translateY(0) scale(1)":"translateY(16px) scale(0.97)",transition:"all 0.35s cubic-bezier(0.16,1,0.3,1)",boxShadow:"0 24px 80px rgba(0,0,0,0.5)"}}><div style={{padding:"28px 28px 20px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><div><div style={{fontSize:11,fontWeight:600,letterSpacing:2.5,textTransform:"uppercase",color:"#14B8A6"}}>About Prudence</div><div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:2}}>Safety & Environmental Consulting</div></div><button onClick={onClose} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"rgba(255,255,255,0.4)"}}>✕</button></div><div style={{padding:"24px 28px 20px"}}>{ABOUT_BIO.paragraphs.map((p,i)=>(<p key={i} style={{fontSize:14,lineHeight:1.75,color:i===0?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.65)",margin:0,marginBottom:i<2?18:0}}>{i===0?<><strong style={{color:"#fff",fontWeight:600}}>Tsidi Tamakloe, CSP</strong>{p.substring(p.indexOf(" is the founder"))}</>:p}</p>))}</div><div style={{padding:"16px 28px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}><span style={{fontFamily:"monospace",fontSize:11,color:"rgba(255,255,255,0.25)"}}>CSP · BCSP #38426</span><a href={ABOUT_BIO.website} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"#14B8A6",textDecoration:"none",padding:"6px 14px",borderRadius:6,border:"1px solid rgba(20,184,166,0.2)",background:"rgba(20,184,166,0.06)"}}>prudencesafety.com ↗</a></div></div></div>);}

/* ═══════════════════════════════════════════════════════════════════ */
/* MAIN COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════════ */
export default function HydroScan() {
  const { isDesktop, isStandalone } = useMediaQuery()
  if (isDesktop && !isStandalone) return <LandingPage isDesktop={true} />

  const [isReturning, setIsReturning] = useState(false);
  const [view, setView] = useState("dash");
  const [navOpen, setNavOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [panel, setPanel] = useState(null); // about|settings|privacy|faq|feedback
  const [tosAccepted, setTosAccepted] = useState(false);
  const [showTos, setShowTos] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [userSettings, setUserSettings] = useState({name:"",firm:"",phone:"",instrument:"",calDate:""});
  const [clock, setClock] = useState(new Date());
  const [milestone, setMilestone] = useState(null);

  // Assessment state
  const [mode, setMode] = useState(null); // "field"|"lab"
  const [assessor, setAssessor] = useState({});
  const [aqi, setAqi] = useState(0);
  const [source, setSource] = useState({});
  const [sqi, setSqi] = useState(0);
  const [building, setBuilding] = useState({});
  const [bqi, setBqi] = useState(0);
  const [photos, setPhotos] = useState({});

  // Lab results state
  const [labResults, setLabResults] = useState([]); // [{id, value, qualifier}]
  const [evaluation, setEvaluation] = useState(null); // {findings, tier}
  const [chains, setChains] = useState([]);
  const [samplingPlan, setSamplingPlan] = useState([]);
  const [recs, setRecs] = useState(null);
  const [rTab, setRTab] = useState("compliance");
  const [showGuide, setShowGuide] = useState(null); // key from COLLECTION_GUIDES
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const TOUR = [
    {icon:"drop",color:"#14B8A6",title:"Welcome to HydroScan",sub:"Drinking Water Quality Intelligence",body:"HydroScan guides you through complete drinking water assessments — from field walkthrough to lab results evaluation. Every finding is evaluated against EPA, WHO, and ASHRAE standards with full regulatory traceability."},
    {icon:"search",color:"#14B8A6",title:"Field Assessment",sub:"Mode 1 — On-site walkthrough",body:"Guided questions cover water source type (public/private well), well construction, plumbing materials, fixture age, water heater settings, stagnation risks, and visual observations. Conditional branching adapts to your specific scenario."},
    {icon:"flask",color:"#8B5CF6",title:"Lab Results Evaluation",sub:"Mode 2 — Compliance analysis",body:"Enter lab results manually or use quick-add panels for common test packages. The compliance engine evaluates 50+ parameters against EPA MCLs, Action Levels, WHO Guidelines, and state-specific standards — instantly."},
    {icon:"shield",color:"#22C55E",title:"Tiered Compliance",sub:"Not a score — a classification",body:"Results are classified as Immediate Action (MCL violations), Advisory (approaching limits), Monitor (secondary exceedances), or Compliant. A single MCL violation flags the entire assessment. No averaging. No hiding violations."},
    {icon:"drop",color:"#EF4444",title:"PFAS Analysis",sub:"6 compounds + Hazard Index",body:"Full EPA PFAS NPDWR evaluation: PFOA and PFOS at 4 ppt, PFHxS/PFNA/GenX at 10 ppt, plus the Hazard Index calculation for co-occurring PFAS mixtures. State-specific limits for NJ, CA, MA, NH, MI, and VT."},
    {icon:"chain",color:"#FB923C",title:"Root Cause Analysis",sub:"Causal chain engine",body:"The engine links lab results to field observations: lead service line + low pH + stagnation = lead contamination chain. Microbial, Legionella, nitrate, and corrosion pathways are identified with confidence ratings."},
    {icon:"clip",color:"#14B8A6",title:"Sampling Plans & COC",sub:"Hypothesis-driven + chain of custody",body:"Sampling recommendations are generated from walkthrough findings with EPA method numbers, hold times, and preservation requirements. The free Chain of Custody form auto-populates from your sampling plan."},
    {icon:"chart",color:"#FBBF24",title:"Historical Trending",sub:"Track changes over time",body:"Every evaluation is saved automatically. After two or more tests, the Trending tab shows sparkline charts for each parameter — is your lead going up or down? MCL limit lines show proximity to violations."},
    {icon:"pipe",color:"#0D9488",title:"Collection Guides",sub:"Step-by-step sampling protocols",body:"Visual guides for Lead First-Draw (EPA 3Ts protocol), Bacteriological (sterile technique, 6-hour hold), and PFAS (contamination prevention — no waterproof clothing, HDPE only). Printable from the field."},
    {icon:"bolt",color:"#14B8A6",title:"Ready to Start",sub:"Choose your mode",body:"Tap Field Assessment for on-site walkthroughs or Lab Results for direct compliance evaluation. The Chain of Custody form is always available from the dashboard — free for everyone."},
  ];
  const [history, setHistory] = useState([]); // [{ts, sourceId, results, tier, findings}]
  const [selState, setSelState] = useState(""); // state code for state-specific standards
  const [coc, setCoc] = useState(null); // chain of custody form data

  // COC helpers
  const initCOC = () => {
    const samples = samplingPlan.length > 0 ? samplingPlan.map((sp,i)=>({id:`S-${String(i+1).padStart(3,"0")}`,location:"",matrix:"Drinking Water",datetime:"",container:"",preservative:"",analyses:sp.params||sp.test,notes:""})) : [{id:"S-001",location:"",matrix:"Drinking Water",datetime:"",container:"",preservative:"",analyses:"",notes:""}];
    setCoc({project:source.src_type?.includes("well")?"Private Well Assessment":"Building Water Assessment",client:"",siteAddr:"",sampler:assessor.a_name||"",samplerCo:"Prudence Safety & Environmental Consulting, LLC",samplerPhone:"",samplerEmail:"",labName:"",labAcct:"",labAccred:"",labISO:"",dataPackage:source.dqo_data_pkg||"Summary report only",turnaround:"Standard (10 business days)",tempOnReceipt:"",specialInstructions:source.dqo_rationale||"",tamperSeals:"Yes",qcSamples:{fieldBlank:false,tripBlank:false,duplicate:false,equipBlank:false},samples,custody:[{from:assessor.a_name||"",fromDate:new Date().toISOString().slice(0,16),to:"",toDate:""}]});
    setView("coc");
  };
  const updateCocSample = (idx,field,val) => setCoc(p=>({...p,samples:p.samples.map((s,i)=>i===idx?{...s,[field]:val}:s)}));
  const addCocSample = () => setCoc(p=>({...p,samples:[...p.samples,{id:`S-${String(p.samples.length+1).padStart(3,"0")}`,location:"",matrix:"Drinking Water",datetime:"",container:"",preservative:"",analyses:"",notes:""}]}));
  const removeCocSample = (idx) => setCoc(p=>({...p,samples:p.samples.filter((_,i)=>i!==idx)}));
  const addCustodyRow = () => setCoc(p=>({...p,custody:[...p.custody,{from:"",fromDate:"",to:"",toDate:""}]}));
  const updateCustody = (idx,field,val) => setCoc(p=>({...p,custody:p.custody.map((c,i)=>i===idx?{...c,[field]:val}:c)}));

  // Storage
  const [index, setIndex] = useState({reports:[],drafts:[]});

  // Live clock
  useEffect(() => { const t=setInterval(()=>setClock(new Date()),30000); return ()=>clearInterval(t); }, []);

  // Init
  useEffect(() => {
    (async () => {
      const visited = await STO.hasVisited();
      setIsReturning(!!visited);
      if (!visited) { setTourStep(0); setShowTour(true); }
      const tos = await STO.get("hydroscan-tos");
      setTosAccepted(!!tos);
      const us = await STO.get("hydroscan-settings");
      if (us) setUserSettings(us);
      await refreshIndex();
      const h = await STO.get("hydroscan-history") || [];
      setHistory(h);
    })();
  }, []);

  const refreshIndex = async () => {
    const idx = await STO.get("hydroscan-idx") || {reports:[],drafts:[]};
    setIndex(idx);
  };

  // Save evaluation to history for trending
  const saveToHistory = async (ev, src) => {
    const entry = { ts: new Date().toISOString(), sourceId: `${src.src_type||"unknown"}-${src.b_type||""}`, tier: ev.tier, paramCount: ev.findings.length, violations: ev.findings.filter(f=>f.violations.length>0).map(f=>({id:f.param.id,name:f.param.name,value:f.value,unit:f.param.unit})), results: labResults.filter(r=>r.value||r.qualifier).map(r=>({id:r.id,value:r.value,qualifier:r.qualifier})) };
    const updated = [...history, entry].slice(-50);
    setHistory(updated);
    await STO.set("hydroscan-history", updated);
  };

  const haptic = (type) => { try { if(navigator.vibrate) navigator.vibrate(type==="heavy"?[30,20,30]:type==="success"?[10,30,10,30,10]:12); } catch{} };
  const showMilestone = (icon, title, sub, nextFn) => { haptic("success"); setMilestone({icon,title,sub}); setTimeout(()=>{setMilestone(null);nextFn();},1400); };
  const acceptTos = async () => { await STO.set("hydroscan-tos", true); setTosAccepted(true); setShowTos(false); haptic("success"); };
  const saveUserSettings = async (s) => { setUserSettings(s); await STO.set("hydroscan-settings", s); haptic("success"); };

  // Question navigation helpers
  const setAF = (k,v) => setAssessor(p=>({...p,[k]:v}));
  const setSF = (k,v) => setSource(p=>({...p,[k]:v}));
  const setBF = (k,v) => setBuilding(p=>({...p,[k]:v}));
  const addPhoto = (qId, data) => setPhotos(p=>({...p,[qId]:[...(p[qId]||[]),data]}));
  const removePhoto = (qId, idx) => setPhotos(p=>({...p,[qId]:(p[qId]||[]).filter((_,i)=>i!==idx)}));

  // Visible questions (conditional logic)
  const visibleQs = (qs, data) => qs.filter(q => {
    if (!q.cond) return true;
    const val = data[q.cond.f];
    if (q.cond.eq) return val === q.cond.eq;
    if (q.cond.ne) return val && val !== q.cond.ne;
    if (q.cond.inc) return val && val.includes(q.cond.inc);
    return true;
  });

  const aVis = useMemo(()=>visibleQs(Q_ASSESSOR, assessor),[assessor]);
  const sVis = useMemo(()=>visibleQs(Q_SOURCE, source),[source]);
  const bVis = useMemo(()=>visibleQs(Q_BUILDING, building),[building]);

  const acq = aVis[aqi]; const scq = sVis[sqi]; const bcq = bVis[bqi];

  const aSecs=[...new Set(aVis.map(q=>q.sec))];
  const sSecs=[...new Set(sVis.map(q=>q.sec))];
  const bSecs=[...new Set(bVis.map(q=>q.sec))];

  // Start modes
  // Smart Start — 4-question entry
  const [smart, setSmart] = useState({source:"",building:"",trigger:"",concerns:[]});
  const [showDeepen, setShowDeepen] = useState(false);

  const startSmart = () => { if(!tosAccepted){setShowTos(true);return;} setSmart({source:"",building:"",trigger:"",concerns:[]}); setSamplingPlan([]); setShowDeepen(false); setView("smart"); };
  const startField = () => { if(!tosAccepted){setShowTos(true);return;} setMode("field"); setAssessor({}); setAqi(0); setSource({}); setSqi(0); setBuilding({}); setBqi(0); setPhotos({}); setLabResults([]); setEvaluation(null); setChains([]); setSamplingPlan([]); setRecs(null); setView("assessor"); };
  const startLab = () => { if(!tosAccepted){setShowTos(true);return;} setMode("lab"); setLabResults([]); setSource({}); setBuilding({}); setEvaluation(null); setChains([]); setRecs(null); setView("labentry"); };

  // Smart sampling plan — generates from just 4 answers
  const generateSmartPlan = () => {
    const plan = [];
    const isWell = smart.source === "Private well";
    const isSchool = smart.building === "School / Daycare";
    const hasHealthConcern = smart.concerns.includes("Illness") || smart.concerns.includes("Skin irritation");
    const hasLeadConcern = smart.concerns.includes("Lead worry") || smart.building === "School / Daycare" || smart.building === "Pre-1986 home";
    const hasPFAS = smart.concerns.includes("PFAS concern");
    const hasAesthetic = smart.concerns.some(c => ["Bad taste/smell","Discoloration","Staining"].includes(c));

    // Core test — everyone gets this
    if (isWell) {
      plan.push({test:"Basic Well Water Test",method:"EPA 200.8, SM 9223, SM 4500",params:"Bacteria (Total Coliforms + E. coli), Nitrate, Lead, Copper, pH, Iron, Manganese, TDS, Hardness",trigger:`Private well — ${smart.trigger}`,hold:"Bacteria: sterile bottle, ice, 6-hour hold. Metals: HNO₃ preserved, 180-day hold.",notes:"First-draw sample for lead (6+ hours stagnation). Second sample after flushing 2-3 min for supply water quality.",std:"EPA Private Well Guidelines",guide:"lead_first_draw"});
    } else {
      plan.push({test:"Lead & Copper Screen",method:"EPA 200.8 (ICP-MS)",params:"Lead (Pb), Copper (Cu), pH",trigger:`Building water — ${smart.trigger}`,hold:"250 mL first-draw after 6+ hour stagnation. HNO₃ preserved.",notes:"Collect first-draw, second-draw, and flushed samples to identify lead source (fixture vs. plumbing vs. supply).",std:"EPA Lead and Copper Rule (LCRR 2024)",guide:"lead_first_draw"});
    }

    // Lead-specific for schools
    if (isSchool) {
      plan.push({test:"EPA 3Ts Lead Testing — All Drinking Outlets",method:"EPA 200.8",params:"Lead at each drinking water outlet (fountains, kitchen taps, nurse station)",trigger:"School / daycare facility — EPA 3Ts protocol",hold:"250 mL first-draw per outlet. HNO₃ preserved. Label each with outlet ID + location.",notes:"Test EVERY outlet used for drinking or food preparation. Include teacher lounges and food service areas. First-draw after overnight stagnation.",std:"EPA 3Ts for Reducing Lead in Schools",guide:"lead_first_draw"});
    }

    // Bacteria for health concerns or wells near contamination
    if (hasHealthConcern && !isWell) {
      plan.push({test:"Microbiological Panel",method:"SM 9223 (Colilert)",params:"Total Coliforms, E. coli",trigger:"Health complaint reported",hold:"Sterile container with Na₂S₂O₃. Ice. 6-hour hold (strict).",notes:"Flush 2-3 minutes before collection. Disinfect faucet. Do NOT use bathroom taps.",std:"EPA Total Coliform Rule",guide:"bacteria"});
    }

    // PFAS
    if (hasPFAS || (isWell && smart.trigger === "Contamination nearby")) {
      plan.push({test:"PFAS Panel (6 EPA-Regulated Compounds)",method:"EPA 533 or EPA 537.1 (LC-MS/MS)",params:"PFOA, PFOS, PFHxS, PFNA, GenX, PFBS + Hazard Index",trigger:hasPFAS ? "PFAS concern identified" : "Nearby contamination source — PFAS screening recommended",hold:"HDPE bottle only (no glass). Trizma preservative. Ice. 14 days. Zero headspace.",notes:"Do NOT wear waterproof clothing, sunscreen, or insect repellent during collection — these contain PFAS. Use only lab-provided containers.",std:"EPA PFAS NPDWR (2024)",guide:"pfas"});
    }

    // Aesthetic
    if (hasAesthetic) {
      plan.push({test:"Aesthetic / Secondary Parameters",method:"EPA 200.7, SM 4500, SM 2120",params:"Iron, Manganese, Sulfate, Chloride, TDS, pH, Color, Hardness",trigger:`Complaints: ${smart.concerns.filter(c=>["Bad taste/smell","Discoloration","Staining"].includes(c)).join(", ")}`,hold:"Metals: HNO₃. General: ice. 180-day / 28-day hold.",notes:"Include both first-draw and flushed samples.",std:"EPA Secondary MCLs"});
    }

    setSamplingPlan(plan);
    // Pre-fill source data for later use
    setSource({src_type: isWell ? "Private well — drilled" : "Public water system", src_trigger: smart.trigger});
    setBuilding({b_type: smart.building});
    haptic("success");
    setView("smartresults");
  };

  const finishAssessor = () => showMilestone("user","Assessor Logged","Starting source assessment",()=>{setSqi(0);setView("source");});
  const finishSource = () => showMilestone("well","Source Assessment Complete","Starting building walkthrough",()=>{setBqi(0);setView("building");});
  const finishBuilding = () => {
    const sp = generateSamplingPlan({...source,...building});
    setSamplingPlan(sp);
    showMilestone("clip","Field Assessment Complete",`${sp.length} sampling recommendation${sp.length!==1?"s":""}`,()=>{setView("fieldresults");});
  };

  // Lab results evaluation
  const runEvaluation = () => {
    const ev = evaluateResults(labResults);
    setEvaluation(ev);
    const cc = buildWaterCausalChains({...source,...building}, ev.findings);
    setChains(cc);
    const rc = generateRecommendations(ev.tier, ev.findings, cc, {...source,...building});
    setRecs(rc);
    haptic("success");
    setMilestone({icon:"chart",title:"Evaluation Complete",sub:`${ev.findings.length} parameters analyzed`});
    setTimeout(()=>{setMilestone(null);setRTab("compliance");setView("labresults");},1400);
    saveToHistory(ev, {...source,...building});
  };

  // Add lab result row
  const addLabParam = (id) => {
    if (labResults.find(r=>r.id===id)) return;
    setLabResults(p=>[...p,{id,value:"",qualifier:""}]);
  };
  const updateLabResult = (id, field, val) => setLabResults(p=>p.map(r=>r.id===id?{...r,[field]:val}:r));
  const removeLabResult = (id) => setLabResults(p=>p.filter(r=>r.id!==id));

  // Question Renderer
  const renderQuestion = (q, data, setField, qIdx, visQs, goNext, goPrev, onFinish, finishLabel, secs, secIdx) => {
    const progress = Math.round(((qIdx+1)/visQs.length)*100);
    return (
    <div style={{paddingTop:12,paddingBottom:100}}>
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:12,color:"#8B95A8",fontFamily:"'DM Mono'"}}>{qIdx+1} of {visQs.length}</span>
          <span style={{fontSize:12,color:"#14B8A6",fontFamily:"'DM Mono'",fontWeight:600}}>{progress}%</span>
        </div>
        <div style={{height:4,background:"#12161D",borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${progress}%`,background:"linear-gradient(90deg,#0D9488,#14B8A6)",borderRadius:2,transition:"width .4s ease",boxShadow:"0 0 8px #14B8A640"}} />
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:24,flexWrap:"wrap"}}>
        {secs.map((s,i)=><span key={s} style={{padding:"7px 14px",borderRadius:20,fontSize:12,fontWeight:600,fontFamily:"'DM Mono'",background:i===secIdx?"#14B8A615":"transparent",color:i===secIdx?"#14B8A6":i<secIdx?"#8B95A8":"#3A4050",border:`1px solid ${i===secIdx?"#14B8A630":"transparent"}`}}>{s}</span>)}
      </div>
      <div key={q.id} style={{animation:"fadeUp .4s cubic-bezier(.22,1,.36,1)"}}>
        <div style={{width:52,height:52,borderRadius:14,background:"#14B8A610",border:"1px solid #14B8A620",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,marginBottom:18}}>{q.ic}</div>
        <h2 style={{fontSize:26,fontWeight:700,lineHeight:1.25,margin:0,marginBottom:8,letterSpacing:"-0.5px"}}>{q.q}</h2>
        {q.ref&&<div style={{display:"inline-flex",gap:7,padding:"7px 14px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:8,marginBottom:20,marginTop:6}}><span style={{fontSize:13,color:"#14B8A6"}}>📐</span><span style={{fontSize:12,color:"#8B95A8",fontFamily:"'DM Mono'",lineHeight:1.4}}>{q.ref}</span></div>}
        {!q.ref&&<div style={{height:16}} />}

        {q.t==="text"&&<input type="text" value={data[q.id]||""} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||"Type..."} autoFocus onKeyDown={e=>{if(e.key==="Enter"&&data[q.id])goNext();}} style={{width:"100%",padding:"16px 18px",background:"#0C1017",border:"1.5px solid #1A2030",borderRadius:12,color:"#F0F4F8",fontSize:17,fontFamily:"'Outfit'",fontWeight:500,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#14B8A6"} onBlur={e=>e.target.style.borderColor="#1A2030"} />}
        {q.t==="num"&&<div style={{position:"relative"}}><input type="number" value={data[q.id]||""} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||"Enter..."} autoFocus onKeyDown={e=>{if(e.key==="Enter"&&data[q.id])goNext();}} style={{width:"100%",padding:"16px 18px",paddingRight:q.u?70:18,background:"#0C1017",border:"1.5px solid #1A2030",borderRadius:12,color:"#F0F4F8",fontSize:17,fontFamily:"'Outfit'",fontWeight:500,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#14B8A6"} onBlur={e=>e.target.style.borderColor="#1A2030"} />{q.u&&<span style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",color:"#5E6578",fontSize:14,fontFamily:"'DM Mono'"}}>{q.u}</span>}</div>}
        {q.t==="ch"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{q.opts.map((o,i)=>{const sel=data[q.id]===o;return(<button key={o} onClick={()=>{haptic("light");setField(q.id,o);setTimeout(goNext,250);}} style={{padding:"15px 18px",textAlign:"left",background:sel?"#14B8A612":"#0C1017",border:`1.5px solid ${sel?"#14B8A6":"#1A2030"}`,borderRadius:12,color:sel?"#14B8A6":"#E2E8F0",fontSize:16,fontFamily:"'Outfit'",fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:12,animation:`fadeUp .3s ${i*.04}s cubic-bezier(.22,1,.36,1) both`}}><div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${sel?"#14B8A6":"#2A3040"}`,background:sel?"#14B8A6":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{sel&&<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5L4.5 7.5L8 3" stroke="#080A0E" strokeWidth="1.5" fill="none"/></svg>}</div>{o}</button>);})}</div>}
        {q.t==="multi"&&<div style={{display:"flex",flexWrap:"wrap",gap:8}}>{q.opts.map((o,i)=>{const sel=(data[q.id]||[]).includes(o);return(<button key={o} onClick={()=>{haptic("light");setField(q.id,sel?(data[q.id]||[]).filter(x=>x!==o):[...(data[q.id]||[]),o]);}} style={{padding:"12px 16px",background:sel?"#14B8A612":"#0C1017",border:`1.5px solid ${sel?"#14B8A6":"#1A2030"}`,borderRadius:10,color:sel?"#14B8A6":"#C8D0DC",fontSize:14,cursor:"pointer",fontFamily:"inherit",animation:`fadeUp .25s ${i*.03}s cubic-bezier(.22,1,.36,1) both`}}>{sel?"✓ ":""}{o}</button>);})}</div>}
        {q.t==="ta"&&<textarea value={data[q.id]||""} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||"Describe..."} rows={3} style={{width:"100%",padding:"14px 16px",background:"#0C1017",border:"1.5px solid #1A2030",borderRadius:12,color:"#F0F4F8",fontSize:15,fontFamily:"inherit",outline:"none",resize:"vertical",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#14B8A6"} onBlur={e=>e.target.style.borderColor="#1A2030"} />}
        {q.photo&&<div style={{marginTop:12,fontSize:12,color:"#5E6578"}}>📷 Photo capture available on deployed version</div>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:30,gap:10}}>
        <button onClick={goPrev} style={{padding:"12px 20px",background:"transparent",border:`1.5px solid ${qIdx>0?"#2A3040":"transparent"}`,borderRadius:10,color:qIdx>0?"#8B95A8":"transparent",fontSize:14,cursor:qIdx>0?"pointer":"default",fontFamily:"inherit"}}>← Back</button>
        <div style={{display:"flex",gap:8}}>
          {q.sk&&<button onClick={goNext} style={{padding:"12px 20px",background:"transparent",border:"1.5px solid #2A3040",borderRadius:10,color:"#8B95A8",fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}>Skip</button>}
          {qIdx===visQs.length-1
            ? <button onClick={onFinish} style={{padding:"13px 26px",background:"linear-gradient(135deg,#059669,#22C55E)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px #22C55E30"}}>{finishLabel}</button>
            : q.t!=="ch" ? <button onClick={goNext} style={{padding:"13px 26px",background:"linear-gradient(135deg,#0D9488,#14B8A6)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:(!q.req||data[q.id])?1:.3,boxShadow:"0 4px 16px #14B8A630"}}>Continue →</button> : null}
        </div>
      </div>
    </div>
  );};

  return (
    <div style={{minHeight:"100vh",background:"#080A0E",color:"#F0F4F8",fontFamily:"'Outfit', system-ui, sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&family=Sora:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}><div style={{position:"absolute",top:"-20%",left:"-10%",width:"50%",height:"50%",background:"radial-gradient(circle,#14B8A606 0%,transparent 70%)",filter:"blur(60px)"}} /><div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 1px 1px, #14B8A606 1px, transparent 0)",backgroundSize:"32px 32px"}} /></div>

      {/* Header */}
      <header style={{position:"sticky",top:0,zIndex:100,height:50,background:"#080A0EDD",backdropFilter:"blur(20px)",borderBottom:"1px solid #1A2030",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setNavOpen(!navOpen)} style={{width:38,height:38,borderRadius:10,background:"#080A0E",display:"flex",alignItems:"center",justifyContent:"center",border:"none",cursor:"pointer",padding:0}}><Logo s={34} /></button>
          <div><div style={{fontSize:15,fontWeight:600,lineHeight:1.1}}>Hydro<span style={{color:"#14B8A6",fontWeight:800}}>Scan</span></div><div style={{fontSize:11,color:"#8B95A8",fontFamily:"'DM Mono'"}}>by Prudence EHS</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{textAlign:"right",lineHeight:1.2}}>
            <div style={{fontSize:11,fontWeight:600,color:"#F0F4F8",fontFamily:"'DM Mono'"}}>{clock.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
            <div style={{fontSize:9,color:"#5E6578",fontFamily:"'DM Mono'"}}>{clock.toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"})}</div>
          </div>
          <button onClick={()=>{setTourStep(0);setShowTour(true);}} style={{width:30,height:30,borderRadius:8,border:"1px solid #1A2030",background:"transparent",color:"#5E6578",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono'"}}>?</button>
          {view!=="dash"&&<button onClick={()=>setView("dash")} style={{background:"#1A2535",border:"1.5px solid #14B8A640",borderRadius:8,color:"#E2E8F0",fontSize:14,fontWeight:600,padding:"8px 16px",cursor:"pointer",fontFamily:"inherit"}}>← Home</button>}
        </div>
      </header>

      {/* Milestone */}
      {milestone&&<div style={{position:"fixed",inset:0,background:"#080A0EF0",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn .3s ease"}}><div style={{textAlign:"center",animation:"milestoneIn .5s cubic-bezier(.22,1,.36,1)"}}><div style={{marginBottom:16,display:"flex",justifyContent:"center"}}><div style={{width:72,height:72,borderRadius:20,background:"#14B8A612",border:"1.5px solid #14B8A630",display:"flex",alignItems:"center",justifyContent:"center"}}><I n={milestone.icon} s={36} c="#14B8A6" w={2} /></div></div><div style={{fontSize:24,fontWeight:800,color:"#F0F4F8",fontFamily:"'Sora'",letterSpacing:"-0.5px"}}>{milestone.title}</div><div style={{fontSize:14,color:"#14B8A6",fontFamily:"'DM Mono'",marginTop:8}}>{milestone.sub}</div><div style={{width:48,height:3,background:"linear-gradient(90deg,#14B8A6,#0D9488)",borderRadius:2,margin:"16px auto 0",animation:"milestoneBar 1.2s ease"}} /></div></div>}

      {/* Collection Guide Overlay */}
      {showGuide&&COLLECTION_GUIDES[showGuide]&&(
        <div style={{position:"fixed",inset:0,background:"#000000DD",zIndex:250,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowGuide(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0C1017",border:"1px solid #1A2030",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"88vh",overflow:"auto",padding:"24px 20px 40px",animation:"slideUp .3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:"'Sora'"}}>{COLLECTION_GUIDES[showGuide].title}</div>
              <button onClick={()=>setShowGuide(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid #1A2030",background:"transparent",color:"#8B95A8",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{fontSize:12,color:"#14B8A6",fontFamily:"'DM Mono'",marginBottom:20}}>{COLLECTION_GUIDES[showGuide].std}</div>

            {COLLECTION_GUIDES[showGuide].steps.map((step,i) => (
              <div key={i} style={{display:"flex",gap:14,marginBottom:14}}>
                <div style={{width:36,height:36,borderRadius:10,background:"#14B8A610",border:"1px solid #14B8A620",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,fontWeight:800,color:"#14B8A6",fontFamily:"'DM Mono'"}}>{step.n}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,color:"#E2E8F0",lineHeight:1.6}}>{step.text}</div>
                </div>
              </div>
            ))}

            {COLLECTION_GUIDES[showGuide].notes&&(
              <div style={{marginTop:16,padding:"14px 16px",background:"#FBBF2408",border:"1px solid #FBBF2420",borderRadius:12}}>
                <div style={{fontSize:12,fontWeight:700,color:"#FBBF24",marginBottom:4}}>⚠ Important Notes</div>
                <div style={{fontSize:13,color:"#C8D0DC",lineHeight:1.6}}>{COLLECTION_GUIDES[showGuide].notes}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nav Drawer */}
      {navOpen&&<div onClick={()=>setNavOpen(false)} style={{position:"fixed",inset:0,background:"#000000AA",zIndex:150}}><div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:50,left:0,width:230,background:"#0C1017",borderRight:"1px solid #1A2030",borderRadius:"0 0 14px 0",padding:"10px 6px",boxShadow:"20px 0 60px #00000080",animation:"slideRight .2s ease"}}>
        {PLAT_MODULES.map(m=><div key={m.id} style={{padding:"11px 12px",borderRadius:8,display:"flex",alignItems:"center",gap:10,background:m.on?"#14B8A610":"transparent",opacity:m.on?1:.3,marginBottom:2}}><span style={{fontSize:18}}>{m.i}</span><span style={{fontSize:14,fontWeight:m.on?600:400,color:m.on?"#14B8A6":"#5E6578"}}>{m.n}</span></div>)}
        <div style={{borderTop:"1px solid #1A2030",margin:"8px 0",padding:"8px 12px",display:"flex",flexDirection:"column",gap:4}}>
          {[{k:"settings",l:"Settings",i:"user"},{k:"about",l:"About",i:"drop"},{k:"faq",l:"FAQ & Glossary",i:"alert"},{k:"privacy",l:"Privacy Policy",i:"shield"}].map(it=><button key={it.k} onClick={()=>{setPanel(it.k);setNavOpen(false);}} style={{background:"none",border:"none",color:"#5E6578",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"6px 0",display:"flex",alignItems:"center",gap:8}}><I n={it.i} s={14} c="#5E6578" />{it.l}</button>)}
          <button onClick={()=>{setShowTos(true);setNavOpen(false);}} style={{background:"none",border:"none",color:"#5E6578",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"6px 0",display:"flex",alignItems:"center",gap:8}}><I n="shield" s={14} c="#5E6578" />Terms of Service</button>
          <button onClick={()=>{setTourStep(0);setShowTour(true);setNavOpen(false);}} style={{background:"none",border:"none",color:"#5E6578",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"6px 0",display:"flex",alignItems:"center",gap:8}}><I n="home" s={14} c="#5E6578" />How to Use</button>
          <button onClick={()=>{setPanel("feedback");setFeedbackSent(false);setFeedbackText("");setNavOpen(false);}} style={{background:"none",border:"none",color:"#14B8A6",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"6px 0",display:"flex",alignItems:"center",gap:8}}><I n="send" s={14} c="#14B8A6" />Send Feedback</button>
          <div onClick={()=>{setAboutOpen(true);setNavOpen(false);}} style={{padding:"6px 0",fontSize:12,color:"#14B8A6",cursor:"pointer",borderTop:"1px solid #1A2030",marginTop:6,paddingTop:8,display:"flex",alignItems:"center",gap:8}}><I n="shield" s={14} c="#14B8A6"/>About Prudence EHS</div>
        </div>
      </div></div>}

      {/* Terms of Service */}
      {showTos&&<div style={{position:"fixed",inset:0,background:"#000000DD",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>tosAccepted&&setShowTos(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#0C1017",border:"1px solid #1A2030",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"90vh",overflow:"auto",padding:"28px 24px 40px",animation:"slideUp .3s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{fontSize:20,fontWeight:800,fontFamily:"'Sora'"}}>Terms of Service</div>
            {tosAccepted&&<button onClick={()=>setShowTos(false)} style={{width:32,height:32,borderRadius:8,border:"1px solid #1A2030",background:"transparent",color:"#8B95A8",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>}
          </div>
          <div style={{fontSize:12,color:"#8B95A8",fontFamily:"'DM Mono'",marginBottom:20}}>Last updated: April 2026 · HydroScan by Prudence Safety & Environmental Consulting, LLC</div>
          {[
            {t:"1. Intellectual Property",b:"HydroScan, including its compliance engine, standards database, PFAS Hazard Index calculation, causal chain analysis, sampling plan generator, collection guides, and all associated documentation, is the proprietary intellectual property of Prudence Safety & Environmental Consulting, LLC (\"PSEC\"). All rights reserved."},
            {t:"2. License Grant",b:"PSEC grants you a limited, non-exclusive, non-transferable, revocable license to use HydroScan for professional water quality assessment purposes. You may not sublicense, resell, or white-label the platform without a separate written agreement."},
            {t:"3. Professional Use Disclaimer",b:"HydroScan is a professional practice support tool. It is NOT a substitute for qualified professional judgment. All compliance evaluations are deterministic (rule-based against published standards). Assessments involving health complaints, regulatory proceedings, or litigation should be conducted by or reviewed by a CIH or qualified EHS professional."},
            {t:"4. Standards & Compliance",b:"HydroScan evaluates against EPA SDWA MCLs, Action Levels, WHO Guidelines, and state-specific standards. These are informational references — not legal advice. The user is responsible for verifying applicable standards in their jurisdiction."},
            {t:"5. Data Ownership",b:"Assessment data you enter remains your property. PSEC does not sell, share, or access your data. Data is stored locally on your device."},
            {t:"6. Limitation of Liability",b:"PSEC provides HydroScan \"as is\" without warranty. PSEC shall not be liable for decisions made based on platform outputs. Maximum liability shall not exceed subscription fees paid in the 12 months preceding the claim."},
            {t:"7. Indemnification",b:"You agree to indemnify and hold harmless PSEC from claims arising from your use of HydroScan or your professional activities conducted using the platform."},
            {t:"8. Governing Law",b:"These Terms are governed by the laws of the State of Maryland. Disputes shall be resolved in Montgomery County, Maryland."},
          ].map((s,i)=><div key={i} style={{marginBottom:14}}><div style={{fontSize:14,fontWeight:700,color:"#F0F4F8",marginBottom:3}}>{s.t}</div><div style={{fontSize:13,color:"#8B95A8",lineHeight:1.7}}>{s.b}</div></div>)}
          {!tosAccepted?<button onClick={acceptTos} style={{width:"100%",padding:"16px 0",background:"linear-gradient(135deg,#0D9488,#14B8A6)",border:"none",borderRadius:12,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:12}}>I Accept These Terms</button>:<div style={{textAlign:"center",fontSize:13,color:"#22C55E",fontFamily:"'DM Mono'"}}>✓ Accepted</div>}
        </div>
      </div>}

      {/* Panel Overlay (About, Settings, Privacy, FAQ, Feedback) */}
      {panel&&<div style={{position:"fixed",inset:0,background:"#000000DD",zIndex:250,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setPanel(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#0C1017",border:"1px solid #1A2030",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"88vh",overflow:"auto",padding:"24px 20px 40px",animation:"slideUp .3s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{fontSize:18,fontWeight:700,fontFamily:"'Sora'"}}>{panel==="about"?"About":panel==="settings"?"Settings":panel==="privacy"?"Privacy Policy":panel==="faq"?"FAQ & Glossary":"Send Feedback"}</div>
            <button onClick={()=>setPanel(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid #1A2030",background:"transparent",color:"#8B95A8",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>

          {panel==="about"&&<div>
            <div style={{textAlign:"center",marginBottom:24}}><Logo s={56} /><div style={{fontSize:28,fontWeight:800,fontFamily:"'Sora'",marginTop:8}}>Hydro<span style={{color:"#14B8A6"}}>Scan</span></div><div style={{fontSize:12,color:"#8B95A8",fontFamily:"'DM Mono'",marginTop:4}}>by Prudence EHS · v{VER}</div></div>
            <div style={{fontSize:14,color:"#8B95A8",lineHeight:1.7,marginBottom:16}}>HydroScan is a standards-driven drinking water assessment platform. It evaluates lab results against EPA, WHO, and state-specific standards, generates hypothesis-driven sampling plans, and provides defensible documentation for private wells and building water systems.</div>
            {[{l:"Developed by",v:"Prudence Safety & Environmental Consulting, LLC"},{l:"Location",v:"Germantown, MD"},{l:"Website",v:"prudencesafety.com"},{l:"Standards",v:"EPA SDWA MCLs · PFAS NPDWR 2024 · Lead & Copper Rule · WHO GDWQ · ASHRAE 188 · EPA 3Ts"},{l:"Parameters",v:"50+ including 6 PFAS with Hazard Index calculation"}].map((r,i)=><div key={i} style={{display:"flex",gap:12,marginBottom:8,fontSize:13}}><span style={{color:"#5E6578",fontFamily:"'DM Mono'",fontSize:11,minWidth:85,flexShrink:0}}>{r.l}</span><span style={{color:"#C8D0DC",lineHeight:1.5}}>{r.v}</span></div>)}
          </div>}

          {panel==="settings"&&<div>
            <div style={{fontSize:13,color:"#8B95A8",marginBottom:16}}>These defaults auto-populate when you start assessments.</div>
            {[{k:"name",l:"Your Name & Credentials",ph:"e.g. T. Tamakloe, CSP"},{k:"firm",l:"Company",ph:"e.g. Prudence Safety & Environmental Consulting"},{k:"phone",l:"Phone",ph:"Contact number"},{k:"instrument",l:"Field Meter",ph:"e.g. Hach HQ40d"},{k:"calDate",l:"Meter Calibration Date",ph:"e.g. 2026-03-01"}].map(f=><div key={f.k} style={{marginBottom:12}}><div style={{fontSize:12,fontWeight:600,color:"#C8D0DC",marginBottom:4}}>{f.l}</div><input value={userSettings[f.k]||""} onChange={e=>setUserSettings(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} style={{width:"100%",padding:"12px 14px",background:"#12161D",border:"1px solid #1A2030",borderRadius:8,color:"#F0F4F8",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>)}
            <button onClick={()=>{saveUserSettings(userSettings);setPanel(null);}} style={{width:"100%",padding:"14px 0",background:"linear-gradient(135deg,#0D9488,#14B8A6)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:8}}>Save Settings</button>
            <div style={{textAlign:"center",marginTop:16}}><button onClick={async()=>{if(confirm("Clear all data?")){await STO.del("hydroscan-idx");await STO.del("hydroscan-visited");await STO.del("hydroscan-tos");await STO.del("hydroscan-settings");await STO.del("hydroscan-history");location.reload();}}} style={{background:"none",border:"none",color:"#EF4444",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Clear All Data & Reset</button></div>
          </div>}

          {panel==="privacy"&&<div>
            {[{t:"Data Collection",b:"HydroScan collects only the data you actively enter. We do not collect analytics, tracking data, or browsing behavior."},{t:"Data Storage",b:"All data is stored locally on your device. Nothing is uploaded to PSEC servers unless you explicitly export it."},{t:"Data Sharing",b:"PSEC does not sell, share, or disclose your data to any third party."},{t:"Photo & Document Data",b:"Photos and COC forms are stored locally. PSEC never accesses your files."},{t:"Children's Privacy",b:"HydroScan is a professional tool not intended for use by individuals under 18."},{t:"Contact",b:"Privacy inquiries: prudencesafety.com"}].map((s,i)=><div key={i} style={{marginBottom:14}}><div style={{fontSize:14,fontWeight:700,color:"#F0F4F8",marginBottom:3}}>{s.t}</div><div style={{fontSize:13,color:"#8B95A8",lineHeight:1.7}}>{s.b}</div></div>)}
          </div>}

          {panel==="faq"&&<div>
            <div style={{fontSize:14,fontWeight:700,color:"#14B8A6",marginBottom:12}}>Frequently Asked Questions</div>
            {[{q:"What does HydroScan do?",a:"It helps you figure out what to test in your water, how to collect samples correctly, and what your lab results mean — all based on EPA and WHO standards."},{q:"Do I need to be an expert to use it?",a:"No. The Quick Assessment asks 4 simple questions and gives you a sampling plan. If you need deeper analysis, the full professional walkthrough is one tap away."},{q:"Does it replace a water quality professional?",a:"No. HydroScan is a tool that helps professionals work faster and helps non-experts understand their results. For health complaints or legal situations, a CIH or qualified EHS professional should review the findings."},{q:"What is an MCL?",a:"Maximum Contaminant Level — the highest level of a contaminant allowed in drinking water, set by the EPA. If your result is above the MCL, it's a violation that needs action."},{q:"What are PFAS?",a:"Per- and polyfluoroalkyl substances, also called 'forever chemicals.' They're found near military bases, airports, and industrial sites. EPA set limits for 6 PFAS compounds in 2024."},{q:"Is my data private?",a:"Yes. Everything stays on your device. We don't collect, store, or sell any of your data."}].map((f,i)=><div key={i} style={{marginBottom:12,padding:"14px 16px",background:"#12161D",borderRadius:10}}><div style={{fontSize:14,fontWeight:600,color:"#E2E8F0",marginBottom:4}}>{f.q}</div><div style={{fontSize:13,color:"#8B95A8",lineHeight:1.6}}>{f.a}</div></div>)}
            <div style={{fontSize:14,fontWeight:700,color:"#14B8A6",marginTop:20,marginBottom:12}}>Glossary</div>
            {[{t:"MCL",d:"Maximum Contaminant Level — legal limit for contaminants in drinking water"},{t:"MCLG",d:"Maximum Contaminant Level Goal — non-enforceable health goal (zero for carcinogens)"},{t:"Action Level",d:"Concentration that triggers required treatment (e.g., Lead at 15 µg/L)"},{t:"PFAS",d:"Per- and polyfluoroalkyl substances — 'forever chemicals' regulated since 2024"},{t:"Hazard Index",d:"EPA method for evaluating health risk from a mixture of PFAS compounds"},{t:"COC",d:"Chain of Custody — document tracking sample handling from collection to lab"},{t:"SMCL",d:"Secondary MCL — aesthetic guideline (taste, odor, color), not health-based"},{t:"ppt",d:"Parts per trillion — unit used for PFAS (1 ppt = 1 nanogram per liter)"},{t:"NTU",d:"Nephelometric Turbidity Units — measures water cloudiness"},{t:"CIH",d:"Certified Industrial Hygienist — gold standard credential for IH professionals"}].map((g,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:6,fontSize:13}}><span style={{color:"#14B8A6",fontWeight:700,fontFamily:"'DM Mono'",fontSize:12,minWidth:65,flexShrink:0}}>{g.t}</span><span style={{color:"#8B95A8",lineHeight:1.5}}>{g.d}</span></div>)}
          </div>}

          {panel==="feedback"&&<div>
            {feedbackSent?<div style={{textAlign:"center",padding:"40px 0"}}><I n="check" s={32} c="#22C55E" /><div style={{fontSize:18,fontWeight:700,marginTop:12}}>Thank You!</div><div style={{fontSize:14,color:"#8B95A8",marginTop:6}}>Your feedback helps make HydroScan better.</div></div>:(
              <div><div style={{fontSize:13,color:"#8B95A8",marginBottom:16}}>Report bugs, suggest features, or share your experience.</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>{["Bug Report","Feature Request","Confusing Question","Standards Issue","General"].map(c=><button key={c} onClick={()=>setFeedbackText(p=>p.startsWith("[")?`[${c}] ${p.replace(/^\[.*?\]\s*/,"")}`:`[${c}] ${p}`)} style={{padding:"7px 14px",borderRadius:20,background:feedbackText.includes(`[${c}]`)?"#14B8A615":"#12161D",border:`1px solid ${feedbackText.includes(`[${c}]`)?"#14B8A640":"#1A2030"}`,color:feedbackText.includes(`[${c}]`)?"#14B8A6":"#8B95A8",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{c}</button>)}</div>
              <textarea value={feedbackText} onChange={e=>setFeedbackText(e.target.value)} placeholder="Describe your feedback..." rows={4} style={{width:"100%",padding:"14px",background:"#12161D",border:"1px solid #1A2030",borderRadius:10,color:"#F0F4F8",fontSize:14,fontFamily:"inherit",outline:"none",resize:"vertical",boxSizing:"border-box",marginBottom:12}} />
              <button onClick={()=>{if(feedbackText.trim()){setFeedbackSent(true);haptic("success");}}} disabled={!feedbackText.trim()} style={{width:"100%",padding:"14px 0",background:feedbackText.trim()?"linear-gradient(135deg,#0D9488,#14B8A6)":"#1A2030",border:"none",borderRadius:10,color:feedbackText.trim()?"#fff":"#5E6578",fontSize:15,fontWeight:700,cursor:feedbackText.trim()?"pointer":"default",fontFamily:"inherit"}}>Submit</button></div>
            )}
          </div>}
        </div>
      </div>}

      {/* Guided Tour */}
      {showTour&&(
        <div style={{position:"fixed",inset:0,background:"#080A0EF5",zIndex:350,display:"flex",flexDirection:"column",animation:"fadeIn .3s ease"}}>
          <div style={{display:"flex",justifyContent:"center",gap:6,padding:"20px 0 10px"}}>
            {TOUR.map((_,i)=><div key={i} onClick={()=>setTourStep(i)} style={{width:tourStep===i?24:8,height:8,borderRadius:4,background:tourStep===i?"#14B8A6":"#1A2030",transition:"all .3s",cursor:"pointer"}} />)}
          </div>
          <div style={{textAlign:"right",padding:"0 24px"}}>
            <button onClick={()=>setShowTour(false)} style={{background:"none",border:"none",color:"#5E6578",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:"8px 0"}}>Skip →</button>
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 32px"}}>
            <div key={tourStep} style={{textAlign:"center",maxWidth:400,animation:"fadeUp .4s cubic-bezier(.22,1,.36,1)"}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:24}}>
                <div style={{width:80,height:80,borderRadius:22,background:`${TOUR[tourStep].color}12`,border:`1.5px solid ${TOUR[tourStep].color}30`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <I n={TOUR[tourStep].icon} s={38} c={TOUR[tourStep].color} w={1.8} />
                </div>
              </div>
              <div style={{fontSize:24,fontWeight:800,fontFamily:"'Sora','Outfit',sans-serif",letterSpacing:"-0.5px",marginBottom:6}}>{TOUR[tourStep].title}</div>
              <div style={{fontSize:14,color:"#14B8A6",fontFamily:"'DM Mono'",marginBottom:16}}>{TOUR[tourStep].sub}</div>
              <div style={{fontSize:15,color:"#8B95A8",lineHeight:1.75}}>{TOUR[tourStep].body}</div>
            </div>
          </div>
          <div style={{padding:"20px 24px 36px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={()=>setTourStep(Math.max(0,tourStep-1))} style={{padding:"12px 20px",background:"none",border:`1px solid ${tourStep===0?"transparent":"#1A2030"}`,borderRadius:10,color:tourStep===0?"transparent":"#8B95A8",fontSize:14,cursor:tourStep===0?"default":"pointer",fontFamily:"inherit"}}>← Back</button>
            {tourStep < TOUR.length - 1 ? (
              <button onClick={()=>{setTourStep(tourStep+1);haptic("light");}} style={{padding:"12px 28px",background:"linear-gradient(135deg,#0D9488,#14B8A6)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px #14B8A630"}}>Next</button>
            ) : (
              <button onClick={()=>{setShowTour(false);haptic("success");}} style={{padding:"12px 28px",background:"linear-gradient(135deg,#059669,#22C55E)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px #22C55E30"}}>Get Started</button>
            )}
          </div>
        </div>
      )}

      <div style={{maxWidth:620,margin:"0 auto",padding:"0 16px",position:"relative",zIndex:1}}>

        {/* ═══ DASHBOARD ═══ */}
        {view==="dash"&&(
          <div style={{paddingTop:20,paddingBottom:80}}>
            {/* Hero with water ripple effect */}
            <div style={{position:"relative",padding:"36px 24px 28px",background:"linear-gradient(180deg,#14B8A610 0%,transparent 100%)",borderRadius:20,border:"1px solid #14B8A615",marginBottom:20,overflow:"hidden",animation:"fadeUp .5s ease"}}>
              {/* Ripple rings */}
              <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",border:"1.5px solid #14B8A612"}} />
              <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",border:"1px solid #14B8A610"}} />
              <div style={{position:"absolute",bottom:-30,left:-30,width:100,height:100,borderRadius:"50%",border:"1px solid #14B8A608"}} />
              <div style={{position:"relative",zIndex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                  <div style={{width:52,height:52,borderRadius:16,background:"#080A0E",display:"flex",alignItems:"center",justifyContent:"center"}}><Logo s={48} /></div>
                  <div>
                    <h1 style={{fontSize:34,fontWeight:800,lineHeight:1,margin:0,letterSpacing:"-1.5px"}}>Hydro<span style={{color:"#14B8A6"}}>Scan</span></h1>
                    <div style={{fontSize:11,color:"#5E6578",fontFamily:"'DM Mono'",marginTop:3}}>by Prudence EHS · v{VER}</div>
                  </div>
                </div>
                <p style={{fontSize:14,color:"#8B95A8",lineHeight:1.6,maxWidth:420}}>Standards-driven drinking water assessment. Field walkthrough to sampling plan. Lab results to compliance analysis. Private wells and building water systems.</p>
              </div>
            </div>

            <div style={{marginBottom:16,animation:"fadeUp .5s .05s ease both"}}><AboutTrustBadge onClick={()=>setAboutOpen(true)}/></div>

            {/* Quick stats from history */}
            {history.length > 0 && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16,animation:"fadeUp .5s .1s ease both"}}>
                <div style={{padding:"14px 10px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:800,fontFamily:"'DM Mono'",color:"#14B8A6"}}>{history.length}</div>
                  <div style={{fontSize:10,color:"#5E6578",fontFamily:"'DM Mono'"}}>Evaluations</div>
                </div>
                <div style={{padding:"14px 10px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:800,fontFamily:"'DM Mono'",color:history.filter(h=>h.tier==="immediate").length?"#EF4444":"#22C55E"}}>{history.filter(h=>h.tier==="immediate"||h.tier==="advisory").length}</div>
                  <div style={{fontSize:10,color:"#5E6578",fontFamily:"'DM Mono'"}}>Flagged</div>
                </div>
                <div style={{padding:"14px 10px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:800,fontFamily:"'DM Mono'",color:"#8B95A8"}}>{history.reduce((a,h)=>a+h.violations.length,0)}</div>
                  <div style={{fontSize:10,color:"#5E6578",fontFamily:"'DM Mono'"}}>Violations</div>
                </div>
              </div>
            )}

            {/* Mode selector — larger visual cards */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16,animation:"fadeUp .5s .15s ease both"}}>
              <button onClick={startSmart} style={{padding:"24px 16px",background:"#0C1017",border:"1.5px solid #14B8A630",borderRadius:16,cursor:"pointer",textAlign:"center",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",inset:0,opacity:.08}}><Particles /></div>
                <div style={{position:"relative",zIndex:1}}>
                  <div style={{width:48,height:48,borderRadius:14,background:"#14B8A615",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><I n="search" s={24} c="#14B8A6" /></div>
                  <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Field Assessment</div>
                  <div style={{fontSize:11,color:"#5E6578",lineHeight:1.4}}>Walkthrough → Observations → Sampling Plan</div>
                </div>
              </button>
              <button onClick={startLab} style={{padding:"24px 16px",background:"#0C1017",border:"1.5px solid #8B5CF630",borderRadius:16,cursor:"pointer",textAlign:"center"}}>
                <div style={{width:48,height:48,borderRadius:14,background:"#8B5CF615",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><I n="flask" s={24} c="#8B5CF6" /></div>
                <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Lab Results</div>
                <div style={{fontSize:11,color:"#5E6578",lineHeight:1.4}}>Enter Results → Compliance → Risk Analysis</div>
              </button>
            </div>

            {/* Chain of Custody Form */}
            <button onClick={initCOC} style={{width:"100%",padding:"16px 18px",marginBottom:16,background:"#0C1017",border:"1.5px solid #14B8A620",borderRadius:14,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,animation:"fadeUp .5s .18s ease both"}}>
              <div style={{width:40,height:40,borderRadius:11,background:"#14B8A610",display:"flex",alignItems:"center",justifyContent:"center"}}><I n="clip" s={20} c="#14B8A6" /></div>
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>Chain of Custody Form</div><div style={{fontSize:11,color:"#5E6578",marginTop:2}}>Generate · Print · Free</div></div>
              <span style={{fontSize:11,color:"#22C55E",fontWeight:600,fontFamily:"'DM Mono'"}}>FREE</span>
            </button>

            {/* PFAS regulatory alert */}
            <div style={{padding:"14px 16px",background:"#FBBF2408",border:"1px solid #FBBF2420",borderRadius:14,marginBottom:16,animation:"fadeUp .5s .2s ease both"}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <I n="alert" s={18} c="#FBBF24" w={2} />
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#FBBF24",marginBottom:3}}>PFAS Regulation Active</div>
                  <div style={{fontSize:12,color:"#8B95A8",lineHeight:1.5}}>EPA finalized MCLs for 6 PFAS compounds (Apr 2024). PFOA/PFOS at 4 ppt. Compliance by 2031. HydroScan evaluates all 6 + Hazard Index for mixtures.</div>
                </div>
              </div>
            </div>

            {/* Capabilities grid */}
            <div style={{animation:"fadeUp .5s .25s ease both"}}>
              <div style={{fontSize:11,fontWeight:600,color:"#5E6578",textTransform:"uppercase",letterSpacing:2,fontFamily:"'DM Mono'",marginBottom:10}}>Capabilities</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[
                  {i:"shield",l:"EPA SDWA MCLs",c:"#14B8A6"},{i:"drop",l:"PFAS (6 compounds + HI)",c:"#14B8A6"},
                  {i:"pipe",l:"Lead & Copper Rule",c:"#FB923C"},{i:"bacteria",l:"Microbial Analysis",c:"#EF4444"},
                  {i:"bldg",l:"ASHRAE 188 Legionella",c:"#8B5CF6"},{i:"well",l:"Private Well Assessment",c:"#0D9488"},
                  {i:"chart",l:"Historical Trending",c:"#FBBF24"},{i:"clip",l:"Collection Guides",c:"#8B95A8"},
                ].map((cap,idx)=>(
                  <div key={idx} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"#0C1017",borderRadius:10,border:"1px solid #1A2030"}}>
                    <I n={cap.i} s={16} c={cap.c} />
                    <span style={{fontSize:12,color:"#C8D0DC",fontWeight:500}}>{cap.l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Standards badges */}
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:16,animation:"fadeUp .5s .3s ease both"}}>{["EPA SDWA","PFAS NPDWR 2024","Lead & Copper Rule","WHO GDWQ","ASHRAE 188","EPA 3Ts","AIHA"].map(s=><span key={s} style={{padding:"3px 9px",background:"#14B8A608",border:"1px solid #14B8A615",borderRadius:18,fontSize:11,fontFamily:"'DM Mono'",color:"#14B8A680"}}>{s}</span>)}</div>
          </div>
        )}

        {/* ═══ SMART START — 4 Questions ═══ */}
        {view==="smart"&&(
          <div style={{paddingTop:28,paddingBottom:100,animation:"fadeUp .4s ease"}}>
            <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>Quick Assessment</div>
            <div style={{fontSize:13,color:"#8B95A8",marginBottom:24}}>Answer 4 questions. Get a sampling plan and collection guide.</div>

            {/* Q1: Water Source */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:"#E2E8F0",marginBottom:8}}>1. Where does the water come from?</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {["Public water (city/county)","Private well","Not sure"].map(o=>(
                  <button key={o} onClick={()=>setSmart(p=>({...p,source:o==="Private well"?"Private well":"Public water"}))} style={{padding:"14px 16px",textAlign:"left",background:smart.source===(o==="Private well"?"Private well":"Public water")&&(o!=="Not sure"||!smart.source)?"#14B8A612":"#0C1017",border:`1.5px solid ${smart.source===(o==="Private well"?"Private well":"Public water")&&o!=="Not sure"?"#14B8A6":"#1A2030"}`,borderRadius:12,color:smart.source===(o==="Private well"?"Private well":"Public water")&&o!=="Not sure"?"#14B8A6":"#C8D0DC",fontSize:15,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>{o}</button>
                ))}
              </div>
            </div>

            {/* Q2: Building Type */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:"#E2E8F0",marginBottom:8}}>2. What type of building?</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {["Home","Pre-1986 home","School / Daycare","Apartment complex","Office / Commercial","Healthcare","Other"].map(o=>{const sel=smart.building===o;return(
                  <button key={o} onClick={()=>setSmart(p=>({...p,building:o}))} style={{padding:"10px 16px",background:sel?"#14B8A612":"#0C1017",border:`1.5px solid ${sel?"#14B8A6":"#1A2030"}`,borderRadius:10,color:sel?"#14B8A6":"#C8D0DC",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>{o}</button>
                );})}
              </div>
            </div>

            {/* Q3: Trigger */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:"#E2E8F0",marginBottom:8}}>3. Why are you testing?</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {["Routine / annual","Buying or selling property","Someone got sick","Water looks/tastes/smells wrong","Contamination nearby","Required by regulation","Just want to know"].map(o=>{const sel=smart.trigger===o;return(
                  <button key={o} onClick={()=>setSmart(p=>({...p,trigger:o}))} style={{padding:"10px 16px",background:sel?"#14B8A612":"#0C1017",border:`1.5px solid ${sel?"#14B8A6":"#1A2030"}`,borderRadius:10,color:sel?"#14B8A6":"#C8D0DC",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>{o}</button>
                );})}
              </div>
            </div>

            {/* Q4: Concerns */}
            <div style={{marginBottom:24}}>
              <div style={{fontSize:13,fontWeight:700,color:"#E2E8F0",marginBottom:4}}>4. Any specific concerns? <span style={{fontWeight:400,color:"#5E6578"}}>(select all that apply)</span></div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                {["Lead worry","PFAS concern","Bad taste/smell","Discoloration","Staining","Illness","Skin irritation","None — just testing"].map(o=>{const sel=(smart.concerns||[]).includes(o);return(
                  <button key={o} onClick={()=>setSmart(p=>({...p,concerns:sel?p.concerns.filter(x=>x!==o):o==="None — just testing"?["None — just testing"]:[...(p.concerns||[]).filter(x=>x!=="None — just testing"),o]}))} style={{padding:"10px 16px",background:sel?"#14B8A612":"#0C1017",border:`1.5px solid ${sel?"#14B8A6":"#1A2030"}`,borderRadius:10,color:sel?"#14B8A6":"#C8D0DC",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>{sel?"✓ ":""}{o}</button>
                );})}
              </div>
            </div>

            <button onClick={generateSmartPlan} disabled={!smart.source||!smart.trigger} style={{width:"100%",padding:"16px 0",background:smart.source&&smart.trigger?"linear-gradient(135deg,#0D9488,#14B8A6)":"#1A2030",border:"none",borderRadius:12,color:smart.source&&smart.trigger?"#fff":"#5E6578",fontSize:16,fontWeight:700,cursor:smart.source&&smart.trigger?"pointer":"default",fontFamily:"inherit",boxShadow:smart.source&&smart.trigger?"0 4px 20px #14B8A630":"none"}}>Generate Sampling Plan →</button>
          </div>
        )}

        {/* ═══ SMART RESULTS — Sampling Plan + Contextual Deepen ═══ */}
        {view==="smartresults"&&(
          <div style={{paddingTop:28,paddingBottom:100,animation:"fadeUp .4s ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <I n="check" s={20} c="#22C55E" />
              <div style={{fontSize:18,fontWeight:700}}>Your Sampling Plan</div>
            </div>
            <div style={{fontSize:13,color:"#8B95A8",marginBottom:16}}>{samplingPlan.length} test{samplingPlan.length!==1?"s":""} recommended based on your answers</div>

            {samplingPlan.map((sp,i)=>(
              <div key={i} style={{padding:14,background:"#0C1017",border:"1px solid #1A2030",borderRadius:14,marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <I n="flask" s={16} c="#14B8A6" />
                  <div style={{fontSize:15,fontWeight:700,color:"#E2E8F0"}}>{sp.test}</div>
                </div>
                <div style={{fontSize:13,color:"#C8D0DC",lineHeight:1.6,marginBottom:6}}><strong>What to test:</strong> {sp.params}</div>
                <div style={{fontSize:13,color:"#8B95A8",lineHeight:1.5,marginBottom:6}}><strong>How to collect:</strong> {sp.notes}</div>
                <div style={{fontSize:12,color:"#5E6578",lineHeight:1.5}}><strong>Hold time:</strong> {sp.hold}</div>
                {sp.guide&&COLLECTION_GUIDES[sp.guide]&&(
                  <button onClick={()=>setShowGuide(sp.guide)} style={{marginTop:8,padding:"8px 14px",background:"#14B8A608",border:"1px solid #14B8A620",borderRadius:8,color:"#14B8A6",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}><I n="clip" s={14} c="#14B8A6" />Step-by-step collection guide</button>
                )}
              </div>
            ))}

            {/* COC Form */}
            <button onClick={initCOC} style={{width:"100%",padding:"14px 16px",marginTop:12,background:"#14B8A608",border:"1px solid #14B8A625",borderRadius:12,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}}>
              <I n="clip" s={18} c="#14B8A6" /><div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#14B8A6"}}>Chain of Custody Form</div><div style={{fontSize:11,color:"#5E6578"}}>Auto-filled from your plan · printable · free</div></div>
            </button>

            {/* Contextual Deepen Prompts — data-driven */}
            <div style={{marginTop:20}}>
              <div style={{fontSize:12,fontWeight:600,color:"#5E6578",textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>Strengthen Your Assessment</div>

              {/* Always show */}
              <button onClick={()=>{setMode("field");setView("assessor");}} style={{width:"100%",padding:"14px 16px",marginBottom:6,background:"#0C1017",border:"1px solid #1A2030",borderRadius:12,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}}>
                <I n="search" s={18} c="#8B95A8" /><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#C8D0DC"}}>Full Professional Walkthrough</div><div style={{fontSize:11,color:"#5E6578"}}>Detailed source, building, plumbing, and field testing assessment</div></div><span style={{color:"#5E6578",fontSize:12}}>→</span>
              </button>

              {/* Contextual — lead risk */}
              {(smart.building==="Pre-1986 home"||smart.concerns.includes("Lead worry")||smart.building==="School / Daycare")&&(
                <div style={{padding:"12px 16px",marginBottom:6,background:"#FB923C08",border:"1px solid #FB923C20",borderRadius:12,fontSize:13,color:"#FB923C",lineHeight:1.5}}>
                  <strong>Lead risk detected.</strong> Documenting plumbing materials, fixture age, and pipe condition strengthens your report and helps identify the lead source. The full walkthrough captures these details.
                </div>
              )}

              {/* Contextual — health complaint */}
              {(smart.trigger==="Someone got sick"||smart.concerns.includes("Illness"))&&(
                <div style={{padding:"12px 16px",marginBottom:6,background:"#EF444408",border:"1px solid #EF444420",borderRadius:12,fontSize:13,color:"#EF4444",lineHeight:1.5}}>
                  <strong>Health complaint reported.</strong> For complaints involving illness, a documented professional assessment with QC samples and calibration records provides legal defensibility if the situation escalates.
                </div>
              )}

              {/* Contextual — PFAS */}
              {smart.concerns.includes("PFAS concern")&&(
                <div style={{padding:"12px 16px",marginBottom:6,background:"#FBBF2408",border:"1px solid #FBBF2420",borderRadius:12,fontSize:13,color:"#FBBF24",lineHeight:1.5}}>
                  <strong>PFAS testing requires extra care.</strong> Tap the collection guide above for contamination prevention steps. PFAS samples are easily contaminated by clothing and equipment.
                </div>
              )}
            </div>

            {/* Lab Results entry */}
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={startLab} style={{flex:1,padding:"14px 0",background:"linear-gradient(135deg,#6D28D9,#8B5CF6)",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Enter Lab Results →</button>
              <button onClick={()=>setView("dash")} style={{padding:"14px 20px",background:"transparent",border:"1px solid #1A2030",borderRadius:10,color:"#8B95A8",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Done</button>
            </div>
          </div>
        )}

        {/* ═══ FIELD ASSESSMENT PHASES (Full Professional) ═══ */}
        {view==="assessor"&&acq&&renderQuestion(acq,assessor,setAF,aqi,aVis,()=>{if(aqi<aVis.length-1)setAqi(aqi+1);},()=>{if(aqi>0)setAqi(aqi-1);},finishAssessor,"→ Source Assessment",aSecs,aSecs.indexOf(acq.sec))}
        {view==="source"&&scq&&renderQuestion(scq,source,setSF,sqi,sVis,()=>{if(sqi<sVis.length-1)setSqi(sqi+1);},()=>{if(sqi>0)setSqi(sqi-1);},finishSource,"→ Building Walkthrough",sSecs,sSecs.indexOf(scq.sec))}
        {view==="building"&&bcq&&renderQuestion(bcq,building,setBF,bqi,bVis,()=>{if(bqi<bVis.length-1)setBqi(bqi+1);},()=>{if(bqi>0)setBqi(bqi-1);},finishBuilding,"→ Generate Sampling Plan",bSecs,bSecs.indexOf(bcq.sec))}

        {/* ═══ FIELD RESULTS — SAMPLING PLAN ═══ */}
        {view==="fieldresults"&&(
          <div style={{paddingTop:28,paddingBottom:100,animation:"fadeUp .4s ease"}}>
            <div style={{fontSize:12,fontWeight:600,color:"#14B8A6",textTransform:"uppercase",letterSpacing:2,fontFamily:"'DM Mono'",marginBottom:12}}>Sampling Recommendations</div>
            <div style={{padding:"12px 16px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12,marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:700}}>{source.src_type?.includes("well")?"Private Well":"Building"} — {building.b_type||"Assessment"}</div>
              <div style={{fontSize:12,color:"#5E6578",fontFamily:"'DM Mono'",marginTop:4}}>{clock.toLocaleDateString()} · {assessor.a_name || "Assessor"} · {samplingPlan.length} recommendation{samplingPlan.length!==1?"s":""}</div>
            </div>

            {samplingPlan.length===0?(
              <div style={{padding:32,textAlign:"center",background:"#0C1017",borderRadius:14,border:"1px solid #1A2030"}}>
                <div style={{fontSize:28,marginBottom:10}}>✓</div>
                <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>No Specific Sampling Triggers</div>
                <div style={{fontSize:13,color:"#8B95A8",lineHeight:1.5}}>The field walkthrough did not identify conditions requiring targeted sampling beyond routine testing.</div>
              </div>
            ):samplingPlan.map((sp,i)=>(
              <div key={i} style={{padding:16,background:"#0C1017",border:"1px solid #1A2030",borderRadius:14,marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <I n="flask" s={16} c="#14B8A6" />
                  <div style={{fontSize:15,fontWeight:700,color:"#E2E8F0"}}>{sp.test}</div>
                </div>
                <div style={{fontSize:12,color:"#FB923C",fontWeight:600,marginBottom:6}}>Trigger: {sp.trigger}</div>
                <div style={{fontSize:13,color:"#8B95A8",lineHeight:1.6,marginBottom:6}}><strong style={{color:"#C8D0DC"}}>Parameters:</strong> {sp.params}</div>
                <div style={{fontSize:13,color:"#8B95A8",lineHeight:1.6,marginBottom:6}}><strong style={{color:"#C8D0DC"}}>Method:</strong> {sp.method}</div>
                <div style={{fontSize:13,color:"#8B95A8",lineHeight:1.6,marginBottom:6}}><strong style={{color:"#C8D0DC"}}>Hold/Preservation:</strong> {sp.hold}</div>
                {sp.notes&&<div style={{fontSize:12,color:"#5E6578",lineHeight:1.5,padding:"8px 12px",background:"#12161D",borderRadius:8,marginTop:6}}>{sp.notes}</div>}
                <div style={{fontSize:11,color:"#14B8A6",fontFamily:"'DM Mono'",marginTop:6}}>{sp.std}</div>
              </div>
            ))}

            {/* Sample Collection Guides */}
            {samplingPlan.length>0&&(
              <div style={{marginTop:12,padding:"14px 16px",background:"#0C1017",border:"1px solid #14B8A620",borderRadius:14}}>
                <div style={{fontSize:13,fontWeight:700,color:"#14B8A6",marginBottom:10}}>📋 Sample Collection Guides</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {Object.entries(COLLECTION_GUIDES).map(([k,g])=>(
                    <button key={k} onClick={()=>setShowGuide(k)} style={{padding:"12px 16px",background:"#12161D",border:"1px solid #1A2030",borderRadius:10,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}}>
                      <I n="clip" s={16} c="#14B8A6" />
                      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#E2E8F0"}}>{g.title}</div><div style={{fontSize:11,color:"#5E6578"}}>{g.std}</div></div>
                      <span style={{color:"#14B8A6",fontSize:13}}>View →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={initCOC} style={{width:"100%",padding:"14px 16px",marginTop:16,background:"#14B8A608",border:"1px solid #14B8A625",borderRadius:12,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}}>
              <I n="clip" s={18} c="#14B8A6" /><div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#14B8A6"}}>Generate Chain of Custody Form</div><div style={{fontSize:11,color:"#5E6578"}}>Auto-populates from sampling plan · printable</div></div>
            </button>

            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button onClick={startLab} style={{flex:1,padding:"14px 0",background:"linear-gradient(135deg,#6D28D9,#8B5CF6)",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Enter Lab Results →</button>
              <button onClick={()=>setView("dash")} style={{padding:"14px 20px",background:"transparent",border:"1px solid #1A2030",borderRadius:10,color:"#8B95A8",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Done</button>
            </div>
          </div>
        )}

        {/* ═══ LAB ENTRY ═══ */}
        {view==="labentry"&&(
          <div style={{paddingTop:28,paddingBottom:100,animation:"fadeUp .4s ease"}}>
            <div style={{fontSize:12,fontWeight:600,color:"#8B5CF6",textTransform:"uppercase",letterSpacing:2,fontFamily:"'DM Mono'",marginBottom:12}}>Lab Results Entry</div>

            {/* State-specific standards selector */}
            <div style={{marginBottom:16,padding:"14px 16px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12}}>
              <div style={{fontSize:12,fontWeight:600,color:"#C8D0DC",marginBottom:6}}>Jurisdiction (for state-specific standards)</div>
              <select value={selState} onChange={e=>setSelState(e.target.value)} style={{width:"100%",padding:"10px 14px",background:"#12161D",border:"1px solid #1A2030",borderRadius:8,color:"#F0F4F8",fontSize:14,fontFamily:"inherit"}}>
                <option value="">Federal (EPA) standards only</option>
                {Object.entries(STATE_STDS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              {selState&&<div style={{fontSize:11,color:"#FBBF24",fontFamily:"'DM Mono'",marginTop:6}}>State standards will be applied in addition to federal MCLs where stricter</div>}
            </div>

            {/* PDF upload note */}
            <div style={{marginBottom:16,padding:"12px 16px",background:"#14B8A608",border:"1px solid #14B8A620",borderRadius:10,fontSize:13,color:"#14B8A6",lineHeight:1.5}}>
              <strong>PDF Lab Report Upload</strong> — available in deployed version with network access. For now, use manual entry or quick-add panels below.
            </div>

            {/* Quick-add presets */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:600,color:"#C8D0DC",marginBottom:8}}>Quick Add Test Panels</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {Object.entries(QUICK_ADD).map(([k,v])=>(
                  <button key={k} onClick={()=>v.ids.forEach(id=>addLabParam(id))} style={{padding:"8px 14px",borderRadius:20,background:"#8B5CF610",border:"1px solid #8B5CF625",color:"#8B5CF6",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{v.label}</button>
                ))}
              </div>
            </div>

            {/* Individual parameter add */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:600,color:"#C8D0DC",marginBottom:8}}>Add Individual Parameters</div>
              <select onChange={e=>{if(e.target.value)addLabParam(e.target.value);e.target.value="";}} style={{width:"100%",padding:"12px 14px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:10,color:"#F0F4F8",fontSize:14,fontFamily:"inherit"}}>
                <option value="">Select parameter...</option>
                {CATS.map(cat=><optgroup key={cat} label={cat}>{ALL_PARAMS.filter(p=>p.cat===cat).map(p=><option key={p.id} value={p.id} disabled={labResults.some(r=>r.id===p.id)}>{p.name} ({p.unit})</option>)}</optgroup>)}
              </select>
            </div>

            {/* Results table */}
            {labResults.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,color:"#C8D0DC",marginBottom:8}}>Results ({labResults.length})</div>
                {labResults.map(r=>{
                  const param = PARAM_MAP[r.id]; if(!param) return null;
                  const ref = param.mcl||param.al||param.mrdl||(param.smcl&&typeof param.smcl==="number"?param.smcl:null);
                  return (
                    <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"10px 12px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:10}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#E2E8F0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{param.name}</div>
                        <div style={{fontSize:10,color:"#5E6578",fontFamily:"'DM Mono'"}}>{ref?`Limit: ${typeof param.smcl==="object"?`${param.smcl.min}–${param.smcl.max}`:ref} ${param.unit}`:param.unit}</div>
                      </div>
                      {param.unit==="P/A"?(
                        <div style={{display:"flex",gap:4}}>
                          {["A","P"].map(v=><button key={v} onClick={()=>updateLabResult(r.id,"qualifier",v)} style={{padding:"6px 12px",borderRadius:6,background:r.qualifier===v?(v==="P"?"#EF444420":"#22C55E20"):"#12161D",border:`1px solid ${r.qualifier===v?(v==="P"?"#EF4444":"#22C55E"):"#1A2030"}`,color:r.qualifier===v?(v==="P"?"#EF4444":"#22C55E"):"#8B95A8",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{v==="A"?"Absent":"Present"}</button>)}
                        </div>
                      ):(
                        <input type="number" value={r.value} onChange={e=>updateLabResult(r.id,"value",e.target.value)} placeholder="Result" style={{width:90,padding:"8px 10px",background:"#12161D",border:"1px solid #1A2030",borderRadius:6,color:"#F0F4F8",fontSize:14,fontFamily:"'DM Mono'",outline:"none",textAlign:"right"}} />
                      )}
                      <button onClick={()=>removeLabResult(r.id)} style={{background:"none",border:"none",color:"#3A4050",fontSize:16,cursor:"pointer",padding:"4px"}}>×</button>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={runEvaluation} disabled={labResults.length===0||labResults.every(r=>!r.value&&!r.qualifier)} style={{width:"100%",padding:"16px 0",background:labResults.length>0?"linear-gradient(135deg,#0D9488,#14B8A6)":"#1A2030",border:"none",borderRadius:12,color:labResults.length>0?"#fff":"#5E6578",fontSize:16,fontWeight:700,cursor:labResults.length>0?"pointer":"default",fontFamily:"inherit",boxShadow:labResults.length>0?"0 4px 20px #14B8A630":"none"}}>
              <I n="shield" s={18} c={labResults.length>0?"#fff":"#5E6578"} /> Evaluate Results
            </button>
          </div>
        )}

        {/* ═══ LAB RESULTS — COMPLIANCE & ANALYSIS ═══ */}
        {view==="labresults"&&evaluation&&(
          <div style={{paddingTop:28,paddingBottom:100,animation:"fadeUp .4s ease"}}>
            {/* Tier Hero */}
            <div style={{textAlign:"center",padding:"28px 20px",background:tierBg(evaluation.tier),border:`1.5px solid ${tierColor(evaluation.tier)}40`,borderRadius:18,marginBottom:14}}>
              <div style={{fontSize:12,color:"#8B95A8",textTransform:"uppercase",fontFamily:"'DM Mono'",letterSpacing:2,marginBottom:10}}>Water Quality Classification</div>
              <div style={{fontSize:32,fontWeight:800,color:tierColor(evaluation.tier),fontFamily:"'Sora'",letterSpacing:"-1px"}}>{tierLabel(evaluation.tier)}</div>
              <div style={{fontSize:13,color:"#8B95A8",fontFamily:"'DM Mono'",marginTop:8}}>{evaluation.findings.length} parameters · {evaluation.findings.filter(f=>f.violations.length>0).length} violations · {evaluation.findings.filter(f=>f.advisories.length>0).length} advisories</div>
            </div>

            {/* Tabs */}
            <div style={{display:"flex",gap:4,padding:4,background:"#0C1017",borderRadius:10,border:"1px solid #1A2030",marginBottom:14,overflowX:"auto",scrollbarWidth:"none"}}>
              {[["compliance","shield","Compliance"],["chains","chain","Root Cause"],["actions","bolt","Actions"],["trending","chart","Trending"]].map(([k,ic,l])=><button key={k} onClick={()=>{setRTab(k);haptic("light");}} style={{flex:"0 0 auto",padding:"10px 16px",borderRadius:8,border:"none",background:rTab===k?"#14B8A615":"transparent",color:rTab===k?"#14B8A6":"#5E6578",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}><I n={ic} s={16} c={rTab===k?"#14B8A6":"#5E6578"} />{l}</button>)}
            </div>

            {/* COMPLIANCE TAB */}
            {rTab==="compliance"&&(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {evaluation.findings.map((f,i)=>{
                  const hasV = f.violations.length > 0;
                  const hasA = f.advisories.length > 0;
                  const color = hasV ? "#EF4444" : hasA ? "#FBBF24" : "#22C55E";
                  return (
                    <div key={i} style={{padding:"14px 16px",background:"#0C1017",border:`1px solid ${color}25`,borderRadius:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <span style={{fontSize:14,fontWeight:600,color:"#E2E8F0"}}>{f.param.name}</span>
                        <span style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono'",color}}>{f.qualifier==="P"||f.qualifier==="A"?(f.qualifier==="P"?"DETECTED":"NOT DETECTED"):`${f.value} ${f.param.unit}`}</span>
                      </div>
                      {f.violations.map((v,j)=><div key={j} style={{fontSize:13,color:sevColor(v.severity),lineHeight:1.5,paddingLeft:10,borderLeft:`2px solid ${sevColor(v.severity)}40`,marginTop:6}}>{v.desc} <span style={{fontSize:11,color:"#5E6578"}}>({v.std}: {v.threshold})</span></div>)}
                      {f.advisories.map((a,j)=><div key={j} style={{fontSize:13,color:sevColor(a.severity),lineHeight:1.5,paddingLeft:10,borderLeft:`2px solid ${sevColor(a.severity)}40`,marginTop:6}}>{a.desc}</div>)}
                      {!hasV&&!hasA&&f.notes.map((n,j)=><div key={j} style={{fontSize:12,color:"#5E6578",marginTop:4}}>{n}</div>)}
                      {f.param.health&&<div style={{fontSize:11,color:"#3A4050",marginTop:4}}>{f.param.health}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ROOT CAUSE TAB */}
            {rTab==="chains"&&(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {chains.length===0?(
                  <div style={{padding:32,textAlign:"center",background:"#0C1017",borderRadius:14,border:"1px solid #1A2030"}}>
                    <I n="chain" s={28} c="#5E6578" /><div style={{fontSize:15,fontWeight:600,marginTop:10,marginBottom:4}}>No Causal Chains Identified</div>
                    <div style={{fontSize:13,color:"#8B95A8",lineHeight:1.5}}>The data did not produce correlated multi-factor findings. This may indicate isolated issues or compliant results.</div>
                  </div>
                ):chains.map((ch,i)=>(
                  <div key={i} style={{padding:16,background:"#0C1017",border:`1px solid ${sevColor(ch.severity)}25`,borderRadius:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <I n="chain" s={16} c={sevColor(ch.severity)} />
                      <span style={{fontSize:15,fontWeight:700,color:sevColor(ch.severity)}}>{ch.type}</span>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:`${sevColor(ch.severity)}15`,color:sevColor(ch.severity),fontFamily:"'DM Mono'",fontWeight:600}}>{ch.confidence}</span>
                    </div>
                    {ch.evidence.map((e,j)=><div key={j} style={{fontSize:13,color:"#C8D0DC",lineHeight:1.6,paddingLeft:12,borderLeft:"2px solid #1A2030",marginBottom:4}}>{e}</div>)}
                    <div style={{marginTop:8,padding:"10px 14px",background:"#12161D",borderRadius:8,fontSize:13,color:"#8B95A8",lineHeight:1.6}}><strong style={{color:"#14B8A6"}}>Recommendation:</strong> {ch.recommendation}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ACTIONS TAB */}
            {rTab==="actions"&&recs&&(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[{k:"immediate",l:"Immediate Actions",c:"#EF4444",i:"alert"},{k:"shortTerm",l:"Short-Term (30 Days)",c:"#FB923C",i:"bolt"},{k:"longTerm",l:"Long-Term",c:"#14B8A6",i:"pipe"},{k:"monitoring",l:"Ongoing Monitoring",c:"#8B95A8",i:"refresh"}].map(cat=>{
                  if(!recs[cat.k]?.length) return null;
                  return (
                    <div key={cat.k} style={{padding:14,background:"#0C1017",border:"1px solid #1A2030",borderRadius:12}}>
                      <div style={{fontSize:14,fontWeight:700,color:cat.c,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><I n={cat.i} s={16} c={cat.c} />{cat.l}</div>
                      {recs[cat.k].map((r,j)=><div key={j} style={{fontSize:14,color:"#C8D0DC",lineHeight:1.6,marginBottom:6,paddingLeft:12,borderLeft:`2px solid ${cat.c}30`}}>{r}</div>)}
                    </div>
                  );
                })}

                {/* Find a Professional */}
                {(evaluation.tier==="immediate"||evaluation.tier==="advisory"||chains.length>0)&&(
                  <div style={{padding:16,background:"#8B5CF610",border:"1px solid #8B5CF625",borderRadius:14,marginTop:6}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#8B5CF6",marginBottom:6}}>Professional Review Recommended</div>
                    <div style={{fontSize:13,color:"#C8D0DC",lineHeight:1.6,marginBottom:12}}>
                      {evaluation.tier==="immediate"?"MCL violations or acute health risks were identified. A CIH or qualified EHS professional should review findings and oversee remediation.":"Advisory or monitoring findings were identified. Professional review is recommended for treatment decisions."}
                    </div>
                    <a href="https://www.aiha.org/consultants-directory" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:10,textDecoration:"none",cursor:"pointer",marginBottom:6}}>
                      <I n="search" s={18} c="#8B5CF6" />
                      <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#E2E8F0"}}>AIHA Consultants Directory</div><div style={{fontSize:12,color:"#8B95A8"}}>Find CIHs and OEHS professionals by state</div></div>
                      <span style={{color:"#8B5CF6"}}>→</span>
                    </a>
                    <a href="https://www.epa.gov/safewater/labs" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:10,textDecoration:"none",cursor:"pointer"}}>
                      <I n="flask" s={18} c="#14B8A6" />
                      <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#E2E8F0"}}>Find Certified Lab</div><div style={{fontSize:12,color:"#8B95A8"}}>EPA-certified drinking water laboratories</div></div>
                      <span style={{color:"#14B8A6"}}>→</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* TRENDING TAB */}
            {rTab==="trending"&&(
              <div style={{display:"flex",flexDirection:"column",gap:10,animation:"fadeUp .3s ease"}}>
                {history.length < 2 ? (
                  <div style={{padding:32,textAlign:"center",background:"#0C1017",borderRadius:14,border:"1px solid #1A2030"}}>
                    <I n="chart" s={28} c="#5E6578" /><div style={{fontSize:15,fontWeight:600,marginTop:10,marginBottom:4}}>Not Enough Data for Trends</div>
                    <div style={{fontSize:13,color:"#8B95A8",lineHeight:1.5}}>After two or more evaluations, this tab will show how your water quality parameters are changing over time. Each evaluation is automatically saved.</div>
                    <div style={{fontSize:12,color:"#5E6578",fontFamily:"'DM Mono'",marginTop:10}}>{history.length} evaluation{history.length!==1?"s":""} on record</div>
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize:13,color:"#8B95A8",marginBottom:12}}>Showing {history.length} evaluations over time. Parameters that appeared in multiple tests are tracked below.</div>
                    {(() => {
                      // Find parameters that appear in multiple history entries
                      const paramCounts = {};
                      history.forEach(h => (h.results||[]).forEach(r => { paramCounts[r.id] = (paramCounts[r.id]||0) + 1; }));
                      const tracked = Object.entries(paramCounts).filter(([_,c]) => c >= 2).map(([id]) => id);
                      if (!tracked.length) return <div style={{padding:20,textAlign:"center",color:"#5E6578"}}>No parameters tested more than once yet.</div>;
                      return tracked.slice(0,10).map(pid => {
                        const param = PARAM_MAP[pid]; if (!param) return null;
                        const points = history.filter(h => (h.results||[]).some(r => r.id === pid && r.value)).map(h => {
                          const r = h.results.find(r => r.id === pid);
                          return { ts: h.ts, value: parseFloat(r.value) };
                        }).filter(p => !isNaN(p.value));
                        if (points.length < 2) return null;
                        const limit = param.mcl || param.al || (param.smcl && typeof param.smcl === "number" ? param.smcl : null);
                        const maxVal = Math.max(...points.map(p => p.value), limit || 0);
                        const trend = points[points.length-1].value - points[0].value;
                        return (
                          <div key={pid} style={{padding:"14px 16px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12,marginBottom:8}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                              <span style={{fontSize:14,fontWeight:600,color:"#E2E8F0"}}>{param.name}</span>
                              <span style={{fontSize:12,fontFamily:"'DM Mono'",color:trend>0?"#EF4444":trend<0?"#22C55E":"#8B95A8"}}>{trend>0?"↑":"↓"} {Math.abs(trend).toFixed(2)} {param.unit}</span>
                            </div>
                            {/* Simple sparkline bar chart */}
                            <div style={{display:"flex",gap:3,alignItems:"flex-end",height:48,marginBottom:6}}>
                              {points.map((p,i) => {
                                const h = maxVal > 0 ? (p.value / maxVal) * 48 : 2;
                                const overLimit = limit && p.value > limit;
                                return <div key={i} style={{flex:1,height:Math.max(h,2),background:overLimit?"#EF4444":"#14B8A6",borderRadius:"3px 3px 0 0",opacity:0.6 + (i/points.length)*0.4}} title={`${new Date(p.ts).toLocaleDateString()}: ${p.value} ${param.unit}`} />;
                              })}
                            </div>
                            {limit && <div style={{height:1,background:"#EF444440",marginBottom:4}} />}
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#5E6578",fontFamily:"'DM Mono'"}}>
                              <span>{new Date(points[0].ts).toLocaleDateString([],{month:"short",year:"2-digit"})}</span>
                              {limit&&<span style={{color:"#EF444480"}}>Limit: {limit} {param.unit}</span>}
                              <span>{new Date(points[points.length-1].ts).toLocaleDateString([],{month:"short",year:"2-digit"})}</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}

            <div style={{display:"flex",gap:8,marginTop:20}}>
              <button onClick={()=>setView("dash")} style={{flex:1,padding:"14px 0",background:"transparent",border:"1px solid #1A2030",borderRadius:10,color:"#8B95A8",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>← Dashboard</button>
            </div>
          </div>
        )}

        {/* ═══ CHAIN OF CUSTODY FORM ═══ */}
        {view==="coc"&&coc&&(
          <div style={{paddingTop:28,paddingBottom:100,animation:"fadeUp .4s ease"}} id="coc-form">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:"#14B8A6",textTransform:"uppercase",letterSpacing:2,fontFamily:"'DM Mono'"}}>Chain of Custody</div>
                <div style={{fontSize:11,color:"#5E6578",fontFamily:"'DM Mono'",marginTop:2}}>Drinking Water Samples</div>
              </div>
              <button onClick={()=>window.print()} style={{padding:"8px 16px",background:"#14B8A615",border:"1px solid #14B8A630",borderRadius:8,color:"#14B8A6",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}><I n="download" s={14} c="#14B8A6" />Print</button>
            </div>

            {/* Header */}
            <div style={{padding:"16px 20px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:"14px 14px 0 0",display:"flex",alignItems:"center",gap:12}}>
              <Logo s={32} />
              <div><div style={{fontSize:16,fontWeight:800}}>Hydro<span style={{color:"#14B8A6"}}>Scan</span></div><div style={{fontSize:10,color:"#5E6578",fontFamily:"'DM Mono'"}}>Chain of Custody · Prudence EHS</div></div>
              <div style={{marginLeft:"auto",textAlign:"right",fontSize:10,color:"#5E6578",fontFamily:"'DM Mono'"}}>{clock.toLocaleDateString()}<br/>{clock.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
            </div>

            {/* Project Info */}
            <div style={{padding:"14px 18px",background:"#0C1017",border:"1px solid #1A2030",borderTop:"none"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#14B8A6",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Project Information</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[{k:"project",l:"Project"},{k:"client",l:"Client"},{k:"siteAddr",l:"Site Address",span:true},{k:"sampler",l:"Sampler"},{k:"samplerCo",l:"Company"},{k:"samplerPhone",l:"Phone"},{k:"samplerEmail",l:"Email"},{k:"labName",l:"Laboratory"},{k:"labAcct",l:"Lab Acct #"},{k:"labAccred",l:"Lab Accreditation (NELAP/TNI)"},{k:"labISO",l:"ISO/IEC 17025?"},{k:"turnaround",l:"TAT"},{k:"dataPackage",l:"Data Package Level"}].map(f=>(
                  <div key={f.k} style={f.span?{gridColumn:"1/-1"}:{}}>
                    <div style={{fontSize:9,color:"#5E6578",fontFamily:"'DM Mono'",marginBottom:2}}>{f.l}</div>
                    {f.k==="turnaround"?<select value={coc[f.k]} onChange={e=>setCoc(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit"}}><option>Rush (24h)</option><option>Expedited (3 days)</option><option>Standard (10 days)</option></select>
                    :f.k==="dataPackage"?<select value={coc[f.k]} onChange={e=>setCoc(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit"}}><option>Summary report only</option><option>Level II — QC summary</option><option>Level III — full QC + raw data</option><option>Level IV — complete + calibrations</option></select>
                    :f.k==="labISO"?<select value={coc[f.k]||""} onChange={e=>setCoc(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit"}}><option value="">Not verified</option><option>Yes — ISO/IEC 17025</option><option>No</option></select>
                    :<input value={coc[f.k]||""} onChange={e=>setCoc(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#14B8A6"} onBlur={e=>e.target.style.borderColor="#1A2030"} />}
                  </div>
                ))}
              </div>
            </div>

            {/* QC Samples & Tamper Documentation */}
            <div style={{padding:"14px 18px",background:"#0C1017",border:"1px solid #1A2030",borderTop:"none"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#FBBF24",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Quality Control Samples</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                {[{k:"fieldBlank",l:"Field Blank",tip:"DI water poured into sample container on-site — proves no ambient contamination"},{k:"tripBlank",l:"Trip Blank",tip:"Lab-sealed bottle transported with samples — proves no transport contamination (required for VOCs)"},{k:"duplicate",l:"Duplicate Sample",tip:"Second sample from same tap — proves lab precision/repeatability"},{k:"equipBlank",l:"Equipment Blank",tip:"DI water through sampling equipment — proves no equipment contamination"}].map(qc=>(
                  <button key={qc.k} onClick={()=>setCoc(p=>({...p,qcSamples:{...p.qcSamples,[qc.k]:!p.qcSamples[qc.k]}}))} style={{padding:"8px 14px",borderRadius:8,background:coc.qcSamples?.[qc.k]?"#FBBF2415":"#12161D",border:`1px solid ${coc.qcSamples?.[qc.k]?"#FBBF2440":"#1A2030"}`,color:coc.qcSamples?.[qc.k]?"#FBBF24":"#8B95A8",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{coc.qcSamples?.[qc.k]?"✓ ":""}{qc.l}</button>
                ))}
              </div>
              {!coc.qcSamples?.fieldBlank&&!coc.qcSamples?.tripBlank&&<div style={{fontSize:11,color:"#EF4444",lineHeight:1.5,padding:"6px 10px",background:"#EF444408",borderRadius:6}}>⚠ No QC samples selected. Without blanks, sample integrity cannot be verified. Results may be challenged in legal proceedings.</div>}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <div style={{flex:1}}><div style={{fontSize:9,color:"#5E6578",fontFamily:"'DM Mono'",marginBottom:2}}>Tamper-Evident Seals</div><select value={coc.tamperSeals||""} onChange={e=>setCoc(p=>({...p,tamperSeals:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit"}}><option>Yes — applied to all bottles</option><option>Yes — applied to cooler only</option><option>No seals used</option></select></div>
                <div style={{flex:1}}><div style={{fontSize:9,color:"#5E6578",fontFamily:"'DM Mono'",marginBottom:2}}>Seal Condition on Receipt</div><select value={coc.sealCondition||""} onChange={e=>setCoc(p=>({...p,sealCondition:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit"}}><option value="">Lab use</option><option>Intact</option><option>Broken / compromised</option></select></div>
              </div>
            </div>

            {/* Samples */}
            <div style={{padding:"14px 18px",background:"#0C1017",border:"1px solid #1A2030",borderTop:"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:700,color:"#14B8A6",textTransform:"uppercase",letterSpacing:1.5}}>Samples ({coc.samples.length})</div>
                <button onClick={addCocSample} style={{padding:"3px 10px",borderRadius:5,background:"#14B8A615",border:"1px solid #14B8A630",color:"#14B8A6",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>+ Add</button>
              </div>
              {coc.samples.map((s,i)=>(
                <div key={i} style={{padding:"10px 12px",background:"#12161D",borderRadius:8,marginBottom:5,position:"relative"}}>
                  <button onClick={()=>removeCocSample(i)} style={{position:"absolute",top:6,right:6,background:"none",border:"none",color:"#3A4050",fontSize:13,cursor:"pointer"}}>×</button>
                  <div style={{display:"grid",gridTemplateColumns:"70px 1fr 1fr",gap:5,marginBottom:5}}>
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>ID</div><input value={s.id} onChange={e=>updateCocSample(i,"id",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#14B8A6",fontSize:11,fontFamily:"'DM Mono'",fontWeight:700,outline:"none",boxSizing:"border-box"}} /></div>
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>Collected</div><input type="datetime-local" value={s.datetime} onChange={e=>updateCocSample(i,"datetime",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>Matrix</div><select value={s.matrix} onChange={e=>updateCocSample(i,"matrix",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit"}}><option>Drinking Water</option><option>Groundwater</option><option>Surface Water</option></select></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:5}}>
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>Location</div><input value={s.location} onChange={e=>updateCocSample(i,"location",e.target.value)} placeholder="Kitchen cold, first draw" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>Container / Preservative</div><input value={s.preservative} onChange={e=>updateCocSample(i,"preservative",e.target.value)} placeholder="250mL HDPE / HNO₃" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                  </div>
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>Analyses Requested</div><input value={s.analyses} onChange={e=>updateCocSample(i,"analyses",e.target.value)} placeholder="Lead, Copper, pH — EPA 200.8" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                </div>
              ))}
            </div>

            {/* Special Instructions + Receipt */}
            <div style={{padding:"14px 18px",background:"#0C1017",border:"1px solid #1A2030",borderTop:"none"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#14B8A6",textTransform:"uppercase",letterSpacing:1.5,marginBottom:6}}>Instructions & Receipt</div>
              <textarea value={coc.specialInstructions} onChange={e=>setCoc(p=>({...p,specialInstructions:e.target.value}))} placeholder="Stagnation: 8 hrs. First-draw per EPA 3Ts. Include field blank." rows={2} style={{width:"100%",padding:"8px 10px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit",outline:"none",resize:"vertical",boxSizing:"border-box",marginBottom:6}} />
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <div><div style={{fontSize:9,color:"#5E6578",fontFamily:"'DM Mono'"}}>Temp on Receipt (°C)</div><input value={coc.tempOnReceipt||""} onChange={e=>setCoc(p=>({...p,tempOnReceipt:e.target.value}))} placeholder="Lab use" style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                <div><div style={{fontSize:9,color:"#5E6578",fontFamily:"'DM Mono'"}}>Cooler Intact?</div><select value={coc.coolerIntegrity||""} onChange={e=>setCoc(p=>({...p,coolerIntegrity:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit"}}><option value="">Lab use</option><option>Intact — ice present</option><option>Intact — no ice</option><option>Compromised</option></select></div>
              </div>
            </div>

            {/* Custody Transfer */}
            <div style={{padding:"14px 18px",background:"#0C1017",border:"1px solid #1A2030",borderTop:"none",borderRadius:"0 0 14px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:700,color:"#14B8A6",textTransform:"uppercase",letterSpacing:1.5}}>Custody Transfer</div>
                <button onClick={addCustodyRow} style={{padding:"3px 10px",borderRadius:5,background:"#14B8A615",border:"1px solid #14B8A630",color:"#14B8A6",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>+ Row</button>
              </div>
              {coc.custody.map((c,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,padding:"8px 10px",background:"#12161D",borderRadius:6,marginBottom:4}}>
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>Relinquished By</div><input value={c.from} onChange={e=>updateCustody(i,"from",e.target.value)} placeholder="Name / Signature" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>Date/Time</div><input type="datetime-local" value={c.fromDate} onChange={e=>updateCustody(i,"fromDate",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>Received By</div><input value={c.to} onChange={e=>updateCustody(i,"to",e.target.value)} placeholder="Name / Signature" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"'DM Mono'"}}>Date/Time</div><input type="datetime-local" value={c.toDate} onChange={e=>updateCustody(i,"toDate",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                </div>
              ))}
              <div style={{fontSize:9,color:"#3A4050",marginTop:6}}>Signatures confirm unbroken custody from collection to laboratory receipt.</div>
            </div>

            <div style={{marginTop:12,padding:"10px 14px",background:"#14B8A608",border:"1px solid #14B8A612",borderRadius:10,fontSize:10,color:"#5E6578",lineHeight:1.6}}>Generated by HydroScan · Prudence Safety & Environmental Consulting, LLC · This form does not replace laboratory-specific COC requirements.</div>

            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button onClick={()=>window.print()} style={{flex:1,padding:"14px 0",background:"linear-gradient(135deg,#0D9488,#14B8A6)",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Print / Save as PDF</button>
              <button onClick={()=>setView("dash")} style={{padding:"14px 20px",background:"transparent",border:"1px solid #1A2030",borderRadius:10,color:"#8B95A8",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Done</button>
            </div>
          </div>
        )}
      </div>

      <AboutPanel open={aboutOpen} onClose={()=>setAboutOpen(false)}/>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        @keyframes milestoneIn{from{opacity:0;transform:scale(.8) translateY(20px);}to{opacity:1;transform:scale(1) translateY(0);}}
        @keyframes milestoneBar{from{width:0;}to{width:48px;}}
        @keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
        @keyframes slideRight{from{opacity:0;transform:translateX(-16px);}to{opacity:1;transform:translateX(0);}}
        @keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-12px);}}
        *{box-sizing:border-box;margin:0;}button{font-family:inherit;}
        input::placeholder,textarea::placeholder{color:#3A4050;}
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=number]{-moz-appearance:textfield;}
        select option{background:#0C1017;color:#9CA3B4;}
        ::-webkit-scrollbar{width:4px;height:0;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#1A2030;border-radius:2px;}
      `}</style>
    </div>
  );
}
