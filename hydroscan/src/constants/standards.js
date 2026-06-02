/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * HydroScan standards database — the SINGLE SOURCE OF TRUTH for every
 * regulatory value the app uses. All numbers here are HARDCODED from the
 * primary sources catalogued in STANDARDS_MANIFEST. Nothing in the engine,
 * the Marlow AI tools, or the DOCX report may state a limit that is not
 * present in this file (see tests/engine/manifest-integrity.test for the
 * guard). Do not alter, round, or add unsourced values.
 *
 * Plain ES module (.js, not .ts) on purpose: this file is imported by the
 * api-graph-reachable tool modules, and the api-js-import guardrail forbids
 * a `.js` → extension-less `.ts` resolution. Keeping it `.js` keeps the
 * Vercel runtime resolution safe.
 *
 * Sources:
 *   EPA SDWA 40 CFR 141 · EPA 816-F-09-004 (2009 NPDWR/NSDWR summary) ·
 *   WHO GDWQ 4th Ed (2022) · Lead & Copper Rule Revisions (LCRR, 2024) ·
 *   PFAS NPDWR (40 CFR 141, April 2024) · Revised Total Coliform Rule ·
 *   Stage 2 DBPR · ASHRAE 188-2018 / Guideline 12-2020 · EPA Health
 *   Advisories · state programs (NJ DEP, CA OEHHA, MassDEP, VT ANR, NH
 *   DES, MI EGLE).
 */

import { STANDARDS_MANIFEST_VERSION } from '../version.js'

/* ─── STANDARDS DATABASE ─────────────────────────────────────────── */
// EPA SDWA MCLs, MCLGs, Action Levels, SMCLs + WHO Guidelines
// Sources: EPA 816-F-09-004, 40 CFR 141, WHO GDWQ 4th Ed (2022)
export const STD = {
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
export const STATE_STDS = {
  NJ: {pfoa:14,pfos:13,pfna:13,pfhxs:null,mn_health:null,label:"New Jersey DEP"},
  CA: {pfoa:null,pfos:null,cr6:10,mn_health:null,label:"California OEHHA (Notification Levels)"},
  MA: {pfas6_total:20,label:"Massachusetts DEP (MassDEP PFAS6 sum ≤ 20 ppt)"},
  VT: {pfas5_total:20,label:"Vermont ANR (PFAS5 sum ≤ 20 ppt)"},
  NH: {pfoa:12,pfos:15,pfhxs:18,pfna:11,label:"New Hampshire DES"},
  MI: {pfoa:8,pfos:16,pfhxs:51,pfna:6,pfbs:420,hfpoda:370,label:"Michigan EGLE"},
};

// Flatten for lookup
export const ALL_PARAMS = [...STD.micro,...STD.metals,...STD.dbp,...STD.disinfectant,...STD.physical,...STD.voc,...STD.radio,...STD.pfas];
export const PARAM_MAP = Object.fromEntries(ALL_PARAMS.map(p=>[p.id,p]));

// Categories for grouping
export const CATS = ["Microbiological","Metals","Inorganics","DBPs","Disinfectant","Physical","VOCs","Radionuclides","PFAS"];

/* ─── LAB PARAMETERS — QUICK-ADD PRESETS ─────────────────────────── */
export const QUICK_ADD = {
  basic: {label:"Basic Well Test",ids:["tc","ecoli","no3","pb","cu","ph","tds","hard","fe","mn","cl2"]},
  lead: {label:"Lead & Copper",ids:["pb","cu","ph"]},
  metals_full: {label:"Full Metals",ids:["pb","cu","as","ba","cr","cd","hg","se","sb","tl","u","fe","mn","zn","na"]},
  micro: {label:"Microbiological",ids:["tc","ecoli","hpc","turb"]},
  dbp: {label:"Disinfection Byproducts",ids:["tthm","haa5","cl2"]},
  voc: {label:"VOC Screen",ids:["benz","tce","pce","vc","ccl4","mtbe"]},
  comprehensive: {label:"Comprehensive",ids:["tc","ecoli","pb","cu","as","no3","no2","f","ba","cr","hg","se","cd","tthm","haa5","cl2","benz","tce","pce","ph","tds","hard","fe","mn","so4","cl","na","turb","color"]},
  pfas: {label:"PFAS Panel",ids:["pfoa","pfos","pfhxs","pfna","hfpoda","pfbs"]},
};

/* ─── STANDARDS MANIFEST ─────────────────────────────────────────────
 * The bibliography of primary sources behind every value above. The set
 * of `standard` strings the engine may emit is enumerated here so the
 * manifest-integrity test can assert nothing un-sourced leaks into a
 * finding or report. When a value or citation changes, bump
 * STANDARDS_MANIFEST_VERSION in src/version.js.
 */
export const STANDARDS_MANIFEST = {
  version: STANDARDS_MANIFEST_VERSION,
  sources: [
    { id: 'sdwa', title: 'EPA Safe Drinking Water Act — National Primary Drinking Water Regulations', citation: '40 CFR Part 141; EPA 816-F-09-004 (2009)' },
    { id: 'nsdwr', title: 'EPA National Secondary Drinking Water Regulations', citation: '40 CFR Part 143' },
    { id: 'lcrr', title: 'Lead and Copper Rule Revisions', citation: '40 CFR 141 Subpart I (LCRR, 2024); EPA 3Ts for Reducing Lead in Drinking Water' },
    { id: 'rtcr', title: 'Revised Total Coliform Rule', citation: '40 CFR 141 Subpart Y (2016)' },
    { id: 'dbpr', title: 'Stage 2 Disinfectants and Disinfection Byproducts Rule', citation: '40 CFR 141 Subpart V' },
    { id: 'pfas', title: 'PFAS National Primary Drinking Water Regulation', citation: '40 CFR 141 (April 2024) — incl. Hazard Index for PFHxS/PFNA/HFPO-DA/PFBS' },
    { id: 'radionuclides', title: 'EPA Radionuclides Rule', citation: '40 CFR 141 Subpart G' },
    { id: 'who', title: 'WHO Guidelines for Drinking-water Quality', citation: '4th Edition incorporating the 1st & 2nd addenda (2022)' },
    { id: 'epa_ha', title: 'EPA Drinking Water Health Advisories', citation: 'EPA Office of Water Health Advisory tables (incl. manganese 2004, MTBE, sodium)' },
    { id: 'ashrae188', title: 'ASHRAE Standard 188-2018 / Guideline 12-2020 — Legionellosis risk management', citation: 'ASHRAE 188-2018; ASHRAE Guideline 12-2020' },
    { id: 'state', title: 'State drinking-water programs (stricter-than-federal)', citation: 'NJ DEP, CA OEHHA, MassDEP, VT ANR, NH DES, MI EGLE' },
  ],
  // The standard families an engine finding may cite. Every `std` value the
  // compliance engine emits must match one of these (substring) — the
  // integrity test enforces it.
  standardFamilies: [
    'EPA MCL',
    'EPA MCLG',
    'EPA Action Level',
    'EPA MRDL',
    'EPA SMCL',
    'EPA RTCR',
    'EPA Health Advisory',
    'EPA Advisory',
    'EPA PFAS NPDWR',
    'WHO Guideline',
    'State Standard',
  ],
};

/** Returns the manifest source whose family this `std` label belongs to,
 *  or null when the label is not a recognized (sourced) standard family. */
export function isManifestStandard(stdLabel) {
  if (!stdLabel || typeof stdLabel !== 'string') return false;
  return STANDARDS_MANIFEST.standardFamilies.some((fam) => stdLabel.includes(fam));
}
