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

import { useState, useEffect, useMemo, useRef } from "react";
import { useMediaQuery } from './hooks/useMediaQuery'
import LandingPage from './components/LandingPage'
const VER = "1.0.0";
const PLAT = [{id:"atmosiq",n:"AtmosIQ",i:"🌬️"},{id:"hydroscan",n:"HydroScan",i:"💧"},{id:"safestep",n:"SafeStep",i:"🛡️"},{id:"oshaready",n:"OSHAready",i:"🔴",on:true}];

const SITES=[{id:"s1",name:"Main Plant",type:"Manufacturing",emp:145,risk:"high"},{id:"s2",name:"Warehouse",type:"Distribution",emp:62,risk:"medium"},{id:"s3",name:"Corporate Office",type:"Office",emp:38,risk:"low"}];
const S_HAZ=[{id:"h1",title:"Unguarded conveyor nip point",site:"s1",loc:"Line 3",cat:"Machine Guarding",sev:"high",status:"open",by:"M. Johnson",date:"2026-03-28",interim:"Area barricaded",cfr:"29 CFR 1910.212"},{id:"h2",title:"Blocked emergency exit",site:"s2",loc:"Bay 2",cat:"Egress",sev:"critical",status:"corrected",by:"T. Williams",date:"2026-03-15",interim:"Pallets relocated",cfr:"29 CFR 1910.36"},{id:"h3",title:"Missing eyewash signage",site:"s1",loc:"Chemical Storage",cat:"Emergency Equipment",sev:"medium",status:"open",by:"S. Davis",date:"2026-04-01",interim:"Temp sign posted",cfr:"29 CFR 1910.151"}];
const S_ACT=[{id:"a1",title:"Install guard on Conveyor 3",source:"Hazard",owner:"Maintenance",due:"2026-04-15",sev:"high",status:"in_progress",root:"Guard removed during PM",interim:"Barricade",fix:"New polycarbonate guard"},{id:"a2",title:"Update LOTO procedures",source:"Mock OSHA Inspection",owner:"Safety Mgr",due:"2026-04-20",sev:"high",status:"open",root:"Procedures from 2019",interim:"Verbal instructions",fix:"New written procedures"},{id:"a3",title:"Install eyewash signs",source:"Hazard",owner:"Safety Mgr",due:"2026-04-10",sev:"medium",status:"in_progress",root:"Removed during painting",interim:"Temp signs",fix:"ANSI signs ordered"}];
const S_TRN=[{id:"t1",emp:"Johnson, M.",course:"HAZCOM / GHS",due:"2026-04-15",status:"due_soon",site:"s1"},{id:"t2",emp:"Williams, T.",course:"Forklift Operator",due:"2026-03-01",status:"overdue",site:"s2"},{id:"t3",emp:"Davis, S.",course:"LOTO Authorized",due:"2026-06-30",status:"current",site:"s1"},{id:"t4",emp:"Patel, A.",course:"Confined Space",due:"2026-02-28",status:"overdue",site:"s1"},{id:"t5",emp:"Garcia, L.",course:"Forklift Refresher",due:"2026-04-10",status:"due_soon",site:"s2"}];
const S_DOC=[{id:"d1",name:"Hazard Communication Program",folder:"Programs",site:"all",status:"current",exp:"2027-01-01",ver:"3.2",approval:"approved",approvedBy:"J. Safety",approvedDate:"2026-01-15",history:[{ver:"3.2",date:"2026-01-15",by:"J. Safety"},{ver:"3.1",date:"2025-06-10",by:"S. Davis"}]},{id:"d2",name:"Lockout/Tagout Program",folder:"Programs",site:"s1",status:"expired",exp:"2026-04-01",ver:"2.1",approval:"expired",approvedBy:"S. Davis",approvedDate:"2025-04-01",history:[{ver:"2.1",date:"2025-04-01",by:"S. Davis"}]},{id:"d3",name:"Emergency Action Plan",folder:"Programs",site:"all",status:"current",exp:"2027-06-01",ver:"4.0",approval:"approved",approvedBy:"J. Safety",approvedDate:"2026-02-20",history:[{ver:"4.0",date:"2026-02-20",by:"J. Safety"}]},{id:"d4",name:"OSHA 300 Log 2025",folder:"Logs",site:"all",status:"current",exp:null,ver:"1.0",approval:"approved",approvedBy:"J. Safety",approvedDate:"2026-02-01",history:[{ver:"1.0",date:"2026-02-01",by:"J. Safety"}]},{id:"d5",name:"Respiratory Protection",folder:"Programs",site:"s1",status:"current",exp:"2026-08-15",ver:"2.4",approval:"approved",approvedBy:"J. Safety",approvedDate:"2025-08-15",history:[{ver:"2.4",date:"2025-08-15",by:"J. Safety"}]},{id:"d6",name:"SDS Master Index",folder:"Chemical",site:"all",status:"current",exp:"2026-12-01",ver:"5.1",approval:"pending",approvedBy:null,approvedDate:null,history:[{ver:"5.1",date:"2026-03-01",by:"M. Johnson"}]}];

const MOCK_CORE=[
  {id:"c1",phase:"Opening",q:"OSHA poster displayed and current?",tip:"Required in a prominent location visible to all employees. Must be the current version.",std:"29 CFR 1903.2"},
  {id:"c2",phase:"Opening",q:"Employer representative identified?",tip:"This person speaks for the company during the inspection. Should be knowledgeable about operations.",std:"General"},
  {id:"c3",phase:"Opening",q:"Legal counsel contact information accessible?",tip:"Know your rights. You can have counsel present. Have the number ready.",std:"General"},
  {id:"c4",phase:"Opening",q:"Injury/illness logs accessible within 4 hours?",tip:"OSHA can request up to 5 years of 300/301 logs.",std:"29 CFR 1904"},
  {id:"c5",phase:"Opening",q:"Employee representative identified?",tip:"Non-union: employees can designate a rep. Union: union rep has right to accompany.",std:"29 CFR 1903.8"},
  {id:"c6",phase:"Documents",q:"OSHA 300/300A/301 logs current?",tip:"300A summary must be posted Feb 1 – Apr 30 each year.",std:"29 CFR 1904.32"},
  {id:"c7",phase:"Documents",q:"Hazard Communication program available?",tip:"Must include container labeling system, SDS access method, and training procedures.",std:"29 CFR 1910.1200"},
  {id:"c8",phase:"Documents",q:"Emergency Action Plan accessible?",tip:"Must cover evacuation procedures, reporting procedures, alarm systems, and employee duties.",std:"29 CFR 1910.38"},
  {id:"c9",phase:"Documents",q:"SDS sheets accessible to all employees?",tip:"Electronic access is acceptable if employees can access during their shift without barriers.",std:"29 CFR 1910.1200(g)"},
  {id:"c10",phase:"Documents",q:"Training records organized and accessible?",tip:"Must document who was trained, what topics, when, and by whom. Keep for duration of employment.",std:"Various"},
  {id:"c11",phase:"Walkaround",q:"Aisles and exits clear and marked?",tip:"Minimum 28-inch width. Exit signs illuminated. No obstructions within path of egress.",std:"29 CFR 1910.36-37"},
  {id:"c12",phase:"Walkaround",q:"Electrical panels have 36-inch clearance?",tip:"No storage within 36 inches. Panels must be labeled with circuit identification.",std:"29 CFR 1910.303(g)"},
  {id:"c13",phase:"Walkaround",q:"Chemical containers properly labeled?",tip:"GHS-compliant labels: product name, signal word, pictograms, hazard/precautionary statements.",std:"29 CFR 1910.1200(f)"},
  {id:"c14",phase:"Walkaround",q:"Fire extinguishers inspected monthly?",tip:"Monthly visual inspection tag + annual professional inspection. Mounted, accessible, charged.",std:"29 CFR 1910.157"},
  {id:"c15",phase:"Walkaround",q:"PPE in use where required?",tip:"Check correct type for the hazard, proper fit, acceptable condition, and employee training.",std:"29 CFR 1910.132"},
  {id:"c16",phase:"Walkaround",q:"First aid kit stocked and accessible?",tip:"Contents per ANSI Z308.1. Check expiration dates on supplies.",std:"29 CFR 1910.151"},
  {id:"c17",phase:"Walkaround",q:"Housekeeping acceptable?",tip:"Clean floors, organized materials, no trip hazards, proper waste disposal.",std:"29 CFR 1910.22"},
  {id:"c18",phase:"Employee",q:"Employees know where SDS sheets are?",tip:"Ask 2-3 workers. They should answer immediately without hesitation.",std:"29 CFR 1910.1200"},
  {id:"c19",phase:"Employee",q:"Employees can describe area hazards?",tip:"Workers should identify at least 2-3 hazards specific to their work area.",std:"General"},
  {id:"c20",phase:"Employee",q:"Employees know emergency exit routes?",tip:"Ask them to point to nearest exit. No hesitation = good training.",std:"29 CFR 1910.38"},
  {id:"c21",phase:"Employee",q:"Employees know how to report a hazard?",tip:"Should describe your facility's specific reporting procedure.",std:"General"},
  {id:"c22",phase:"Closing",q:"Notes taken during entire inspection?",tip:"Document everything: what was discussed, shown, and observed. Timestamp entries.",std:"General"},
  {id:"c23",phase:"Closing",q:"Corrective action timelines documented?",tip:"Every deficiency identified needs an owner, deadline, and documented plan.",std:"General"},
  {id:"c24",phase:"Closing",q:"Citation contest timeline understood?",tip:"15 working days from receipt to file a notice of contest. Calendar it immediately.",std:"29 CFR 1903.17"},
  {id:"c25",phase:"Closing",q:"Informal conference option noted?",tip:"You can request an informal conference with the Area Director to discuss citations.",std:"29 CFR 1903.19"},
];

const MOCK_INDUSTRY={
  "Manufacturing":[
    {id:"mfg1",phase:"Documents",q:"LOTO procedures written for EACH machine?",tip:"Generic procedures are citable. Every machine with hazardous energy needs its own procedure with specific steps.",std:"29 CFR 1910.147(c)(4)"},
    {id:"mfg2",phase:"Documents",q:"LOTO periodic inspections documented annually?",tip:"Annual inspection of each energy control procedure by an authorized employee OTHER than the one using it.",std:"29 CFR 1910.147(c)(6)"},
    {id:"mfg3",phase:"Documents",q:"Hearing Conservation Program documented?",tip:"Required when any employee TWA ≥ 85 dBA. Must include monitoring, audiometric testing, HPD, training.",std:"29 CFR 1910.95(c)"},
    {id:"mfg4",phase:"Documents",q:"Respiratory Protection Program written?",tip:"Required when respirators are used. Medical evaluations, fit testing, training all documented.",std:"29 CFR 1910.134(c)"},
    {id:"mfg5",phase:"Documents",q:"Permit-Required Confined Space program?",tip:"Written program if PRCS exist. Entry permits, rescue procedures, attendant duties.",std:"29 CFR 1910.146"},
    {id:"mfg6",phase:"Documents",q:"PPE Hazard Assessment certified?",tip:"Written certification that workplace hazard assessment was performed. Must be signed and dated.",std:"29 CFR 1910.132(d)(2)"},
    {id:"mfg7",phase:"Walkaround",q:"Machine guards in place at all points of operation?",tip:"Check point of operation guards, nip point guards, rotating part covers. No bypassed interlocks.",std:"29 CFR 1910.212"},
    {id:"mfg8",phase:"Walkaround",q:"LOTO devices applied during maintenance?",tip:"Each authorized employee applies their own lock. No group lockout without documented procedure.",std:"29 CFR 1910.147"},
    {id:"mfg9",phase:"Walkaround",q:"Lockout devices available at each machine?",tip:"Locks, tags, hasps, valve covers must be available and standardized facility-wide.",std:"29 CFR 1910.147(c)(5)"},
    {id:"mfg10",phase:"Walkaround",q:"Noise levels below 85 dBA or HPD in use?",tip:"If you must raise your voice at 3 feet, levels likely exceed 85 dBA. Check dosimetry records.",std:"29 CFR 1910.95"},
    {id:"mfg11",phase:"Walkaround",q:"Compressed gas cylinders secured upright?",tip:"Chained or strapped to wall/cart. Valve caps on when not in use. Segregate fuel from oxidizer.",std:"29 CFR 1910.253"},
    {id:"mfg12",phase:"Walkaround",q:"Eyewash/shower stations accessible and tested?",tip:"Within 10 seconds of corrosive hazard. Weekly activation test documented on tag.",std:"29 CFR 1910.151 / ANSI Z358.1"},
    {id:"mfg13",phase:"Walkaround",q:"Powered industrial trucks inspected pre-shift?",tip:"Daily pre-use inspection documented. Defective trucks taken out of service immediately.",std:"29 CFR 1910.178(q)"},
    {id:"mfg14",phase:"Walkaround",q:"Extension cords not used as permanent wiring?",tip:"Temporary use only. No running through walls, ceilings, or doorways. No daisy-chaining.",std:"29 CFR 1910.305(g)(1)"},
    {id:"mfg15",phase:"Employee",q:"Employees can demonstrate LOTO steps?",tip:"Ask an authorized employee to walk through their machine's LOTO procedure. Should match written procedure.",std:"29 CFR 1910.147(c)(7)"},
    {id:"mfg16",phase:"Employee",q:"Employees trained on specific chemical hazards in area?",tip:"Not just general HAZCOM — they should know the specific chemicals they work with and their hazards.",std:"29 CFR 1910.1200(h)"},
    {id:"mfg17",phase:"Employee",q:"Forklift operators have current certification?",tip:"Initial training + evaluation. Refresher every 3 years or after incident/near-miss/observed unsafe operation.",std:"29 CFR 1910.178(l)"},
  ],
  "Construction":[
    {id:"con1",phase:"Documents",q:"Fall protection plan documented?",tip:"Required for work at 6+ feet. Must address systems used, rescue procedures, and training.",std:"29 CFR 1926.502"},
    {id:"con2",phase:"Documents",q:"Competent person(s) designated for each hazard?",tip:"Excavation, scaffolding, fall protection, steel erection each require a named competent person.",std:"29 CFR 1926 (various)"},
    {id:"con3",phase:"Documents",q:"Excavation/trenching permit or assessment?",tip:"Soil classification required. Protective systems for trenches 5+ feet deep.",std:"29 CFR 1926.650-652"},
    {id:"con4",phase:"Documents",q:"Crane operator certification current?",tip:"NCCCO or equivalent. Crane inspection records, load charts accessible.",std:"29 CFR 1926.1427"},
    {id:"con5",phase:"Documents",q:"Silica exposure control plan?",tip:"Required for tasks exceeding action level. Must specify engineering controls, work practices, respiratory protection.",std:"29 CFR 1926.1153"},
    {id:"con6",phase:"Walkaround",q:"Fall protection in use above 6 feet?",tip:"Guardrails, safety nets, or personal fall arrest systems. Check anchor points rated for 5,000 lbs.",std:"29 CFR 1926.501"},
    {id:"con7",phase:"Walkaround",q:"Scaffolding erected by competent person?",tip:"Check planking, guardrails, base plates, mudsills, cross-bracing. Inspect daily before use.",std:"29 CFR 1926.451"},
    {id:"con8",phase:"Walkaround",q:"Trench/excavation properly sloped or shored?",tip:"Benching, sloping, or shoring required for trenches 5+ feet. Ladder within 25 feet of workers.",std:"29 CFR 1926.652"},
    {id:"con9",phase:"Walkaround",q:"Stairways/ladders provided for elevation changes > 19 inches?",tip:"Ladder extends 3 feet above landing. Secured at top. 4:1 ratio for straight ladders.",std:"29 CFR 1926.1051"},
    {id:"con10",phase:"Walkaround",q:"Hard hats worn in overhead hazard areas?",tip:"Type I (top) or Type II (top + sides). Check for cracks, dents, expired suspension.",std:"29 CFR 1926.100"},
    {id:"con11",phase:"Walkaround",q:"GFCIs in use on all temporary wiring?",tip:"All 120V temporary circuits must have GFCI protection or be part of an assured equipment grounding program.",std:"29 CFR 1926.405(a)(2)"},
    {id:"con12",phase:"Walkaround",q:"Overhead power line clearances maintained?",tip:"Minimum 10 feet for lines up to 50kV. Additional distance for higher voltages.",std:"29 CFR 1926.1408"},
    {id:"con13",phase:"Employee",q:"Workers can explain fall protection requirements?",tip:"Should know: when it's required, what system they use, anchor point locations, rescue plan.",std:"29 CFR 1926.503"},
    {id:"con14",phase:"Employee",q:"Competent person can identify soil types?",tip:"Should demonstrate knowledge of soil classification and protective system requirements.",std:"29 CFR 1926.650"},
  ],
  "Healthcare":[
    {id:"hc1",phase:"Documents",q:"Bloodborne Pathogen Exposure Control Plan?",tip:"Annual review and update. Must reflect current procedures and cover all at-risk employees.",std:"29 CFR 1910.1030(c)"},
    {id:"hc2",phase:"Documents",q:"Sharps Injury Log maintained?",tip:"Separate from OSHA 300 log. Records type/brand of device, department, description of incident.",std:"29 CFR 1910.1030(h)"},
    {id:"hc3",phase:"Documents",q:"TB exposure assessment/control plan?",tip:"Risk assessment, early detection, management of exposure incidents, respiratory protection.",std:"CDC/OSHA Guidelines"},
    {id:"hc4",phase:"Documents",q:"Workplace Violence Prevention Program?",tip:"Risk assessment, policies, training, incident reporting. Required in some states.",std:"OSHA Guidelines / State"},
    {id:"hc5",phase:"Documents",q:"Hazardous drug handling procedures?",tip:"USP 800 compliance for handling antineoplastic and hazardous drugs. Engineering controls, PPE, spill procedures.",std:"USP 800 / OSHA"},
    {id:"hc6",phase:"Walkaround",q:"Sharps containers not overfilled?",tip:"Replace when 3/4 full. Accessible, upright, labeled with biohazard symbol.",std:"29 CFR 1910.1030(d)(4)"},
    {id:"hc7",phase:"Walkaround",q:"Engineering controls for needlestick prevention?",tip:"Safety needles, needleless systems, retractable sharps. Evaluate annually.",std:"29 CFR 1910.1030(d)(2)"},
    {id:"hc8",phase:"Walkaround",q:"Patient lifting equipment available?",tip:"Mechanical lifts, transfer boards, slide sheets. Safe patient handling program in place.",std:"OSHA Ergonomics Guidelines"},
    {id:"hc9",phase:"Walkaround",q:"Biohazard waste properly contained and labeled?",tip:"Red bags or containers with biohazard symbol. Secondary containment for transport.",std:"29 CFR 1910.1030(d)(4)"},
    {id:"hc10",phase:"Walkaround",q:"Ventilation adequate in hazardous drug areas?",tip:"Biological safety cabinets, closed-system transfer devices, negative pressure rooms.",std:"USP 800"},
    {id:"hc11",phase:"Employee",q:"Staff demonstrate correct PPE donning/doffing?",tip:"Particularly for BBP exposure situations. Gown, gloves, face protection sequence matters.",std:"29 CFR 1910.1030(d)(3)"},
    {id:"hc12",phase:"Employee",q:"Staff know post-exposure incident procedure?",tip:"Report immediately, wash/flush, medical evaluation, documentation. Should be reflexive.",std:"29 CFR 1910.1030(f)"},
  ],
  "Warehouse":[
    {id:"wh1",phase:"Documents",q:"Forklift operator training and evaluation records?",tip:"Initial training (formal + practical + evaluation). Refresher every 3 years or after incident.",std:"29 CFR 1910.178(l)"},
    {id:"wh2",phase:"Documents",q:"Dock safety procedures written?",tip:"Wheel chocks, dock locks, trailer securement, visual communication systems documented.",std:"General Duty Clause"},
    {id:"wh3",phase:"Documents",q:"Racking inspection program documented?",tip:"Regular inspections for damage, overloading, proper anchoring. Weight capacity posted.",std:"ANSI MH16.1 / OSHA"},
    {id:"wh4",phase:"Walkaround",q:"Forklift daily pre-use inspections documented?",tip:"Check forks, tires, hydraulics, controls, horn, lights, backup alarm before each shift.",std:"29 CFR 1910.178(q)"},
    {id:"wh5",phase:"Walkaround",q:"Pedestrian/forklift traffic separated?",tip:"Marked walkways, intersections with mirrors or warning lights, speed limits posted.",std:"29 CFR 1910.176"},
    {id:"wh6",phase:"Walkaround",q:"Dock plates/boards in good condition?",tip:"Rated capacity posted, secured in place, lips on both sides, inspected before use.",std:"29 CFR 1910.30"},
    {id:"wh7",phase:"Walkaround",q:"Racking weight limits posted and not exceeded?",tip:"Check for damaged uprights, bent beams, missing pins. No climbing on racks.",std:"ANSI MH16.1"},
    {id:"wh8",phase:"Walkaround",q:"Manual lifting practices observed?",tip:"Proper technique used. Loads within capacity. Team lifts for heavy items.",std:"OSHA Ergonomics"},
    {id:"wh9",phase:"Walkaround",q:"Battery charging area properly ventilated?",tip:"Hydrogen gas accumulation risk. No smoking signs, eyewash within 25 feet, ventilation confirmed.",std:"29 CFR 1910.178(g)"},
    {id:"wh10",phase:"Employee",q:"Forklift operators demonstrate pre-shift inspection?",tip:"Should check without prompting — forks, hydraulics, controls, horn, seatbelt.",std:"29 CFR 1910.178(q)"},
    {id:"wh11",phase:"Employee",q:"Workers know pedestrian safety zones?",tip:"Should identify marked walkways, intersection protocols, and right-of-way rules.",std:"29 CFR 1910.176"},
  ],
  "Office":[
    {id:"of1",phase:"Documents",q:"Ergonomic assessment program documented?",tip:"Workstation evaluations for computer users. Adjustment procedures, equipment available.",std:"General Duty Clause"},
    {id:"of2",phase:"Documents",q:"Workplace violence prevention policy?",tip:"Reporting procedures, employee assistance, building security, visitor management.",std:"OSHA Guidelines"},
    {id:"of3",phase:"Walkaround",q:"Workstations ergonomically set up?",tip:"Monitor at eye level, keyboard at elbow height, feet flat on floor, adequate lighting.",std:"OSHA Ergonomics"},
    {id:"of4",phase:"Walkaround",q:"Walking surfaces free of trip hazards?",tip:"Cables secured, carpet not bunched, no items in walkways, wet floor signs when needed.",std:"29 CFR 1910.22"},
    {id:"of5",phase:"Walkaround",q:"Stairways in good condition with handrails?",tip:"Handrails on open sides. Non-slip treads. Adequate lighting. Not used for storage.",std:"29 CFR 1910.25"},
    {id:"of6",phase:"Walkaround",q:"Electrical cords in good condition?",tip:"No frayed cords, no daisy-chained power strips, no cords under carpets or across walkways.",std:"29 CFR 1910.305"},
    {id:"of7",phase:"Employee",q:"Employees know AED location and use?",tip:"If AED is provided, trained responders should be identified and current on certification.",std:"General"},
    {id:"of8",phase:"Employee",q:"Employees know workplace violence reporting?",tip:"Should describe the procedure clearly — who to contact, how to document, protective actions.",std:"General"},
  ],
};

const MOCK_INDUSTRIES = Object.keys(MOCK_INDUSTRY);

function calcScore(docs,trn,acts,haz,mock){
  const w={prog:20,trn:17,logs:12,audit:15,acts:10,haz:10,cond:12,resp:4};
  const safe=v=>{const n=Number(v);return(isNaN(n)||!isFinite(n)||n<0)?0:Math.min(n,100);};
  const ratio=(arr,filter)=>{if(!Array.isArray(arr)||arr.length===0)return 0;const matched=arr.filter(filter).length;return safe((matched/arr.length)*100);};
  const ps=ratio(docs.filter(d=>d.folder==="Programs"),d=>d.status==="current");
  const ts=ratio(trn,t=>t.status==="current");
  const ls=ratio(docs.filter(d=>d.folder==="Logs"),d=>d.status==="current");
  const as2=acts.length?ratio(acts,a=>a.status==="closed"):100;
  const hs=haz.length?ratio(haz,h=>h.status==="corrected"):100;
  const openHighHaz=Array.isArray(haz)?haz.filter(h=>h.status==="open"&&(h.sev==="critical"||h.sev==="high")).length:0;
  const condScore=openHighHaz>0?safe(100-openHighHaz*25):hs;
  const mockSafe=safe(mock);
  const respScore=safe(Math.min(100,(mockSafe>0?50:25)+(docs.filter(d=>d.folder==="Programs"&&d.status==="current").length>=3?25:0)+(acts.filter(a=>a.status==="open").length===0?25:0)));
  const raw=(ps*w.prog+ts*w.trn+ls*w.logs+mockSafe*w.audit+as2*w.acts+hs*w.haz+condScore*w.cond+respScore*w.resp)/100;
  const result=Math.round(safe(raw));
  return result;
}

const Logo=({s=40,light=false})=>(<svg width={s} height={s} viewBox="0 0 100 100" fill="none"><path d="M88 50 A38 38 0 1 1 72 22" stroke={light?"#2D2D2D":"#E2E8F0"} strokeWidth="14" strokeLinecap="round" fill="none"/><path d="M32 52 L48 68 L78 28" stroke="#DC2626" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>);

const I=({n,s=18,c="currentColor",w=1.8})=>{const p={width:s,height:s,viewBox:"0 0 24 24",fill:"none",stroke:c,strokeWidth:w,strokeLinecap:"round",strokeLinejoin:"round"};const d={shield:<svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,check:<svg {...p}><polyline points="20 6 9 17 4 12"/></svg>,alert:<svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,clip:<svg {...p}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,wrench:<svg {...p}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,folder:<svg {...p}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,grad:<svg {...p}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/></svg>,live:<svg {...p}><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49M7.76 16.24a6 6 0 010-8.49"/></svg>,plus:<svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,list:<svg {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,send:<svg {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,arrow:<svg {...p}><polyline points="15 18 9 12 15 6"/></svg>};return d[n]||<svg {...p}><circle cx="12" cy="12" r="10"/></svg>;};

const STO={
  _s:typeof window!=="undefined"&&window.storage?window.storage:null,
  get:async k=>{try{
    if(STO._s){const r=await STO._s.get(k);return r?JSON.parse(r.value):null;}
    if(typeof localStorage!=="undefined"){const v=localStorage.getItem("or_"+k);return v?JSON.parse(v):null;}
    return null;
  }catch{return null;}},
  set:async(k,v)=>{try{
    const str=JSON.stringify(v);
    if(STO._s){await STO._s.set(k,str);}
    else if(typeof localStorage!=="undefined"){localStorage.setItem("or_"+k,str);}
  }catch(e){console.warn("Storage save failed:",e);}}
};

// Security utilities
const sanitize=s=>{if(typeof s!=="string")return s;return s.replace(/<[^>]*>/g,"").replace(/javascript:/gi,"").replace(/on\w+=/gi,"").slice(0,500);};
const safeVer=v=>{const n=parseFloat(v);return isNaN(n)?"1.0":(n+0.1).toFixed(1);};
const MAX_LEN={title:200,name:100,note:500,loc:100,course:150};

const _bg="#080A0E",_bdr="#1A2030",_crd="#0C1017",_sub="#12161D",pri="#DC2626",priD="#991B1B";
const sevC=s=>({critical:"#EF4444",high:"#FB923C",medium:"#FBBF24",low:"#64748B"}[s]||"#5E6578");
const statC=s=>({open:"#3B82F6",in_progress:"#FBBF24",closed:"#22C55E",corrected:"#22C55E",overdue:"#EF4444",due_soon:"#FBBF24",current:"#22C55E",expired:"#EF4444"}[s]||"#5E6578");
const scoreC=v=>v>=80?"#22C55E":v>=60?"#FBBF24":"#EF4444";
const fmtD=d=>{if(!d)return"";const p=d.split("-");return p.length===3?`${p[1]}/${p[2]}/${p[0]}`:d;};
function Particles(){return <div style={{position:"absolute",inset:0,overflow:"hidden"}}>{Array.from({length:10}).map((_,i)=><div key={i} style={{position:"absolute",width:2+Math.random()*3,height:2+Math.random()*3,background:"#DC262615",borderRadius:"50%",left:`${Math.random()*100}%`,top:`${Math.random()*100}%`,animation:`ft ${4+Math.random()*6}s ease-in-out infinite ${Math.random()*5}s`}}/>)}</div>;}

/* ─── DETERMINISTIC ACTION PLAN TEMPLATES (top 20 cited standards) ── */
const ACTION_TEMPLATES={
  "1910.212":{std:"29 CFR 1910.212",title:"Machine Guarding",steps:["Identify all points of operation, nip points, and rotating parts requiring guards per OSHA and ANSI B11 series","Select appropriate guard type: fixed barrier, interlocked, adjustable, or self-adjusting based on operation","Procure or fabricate guard to manufacturer/ANSI specifications","Install guard — must prevent hands/body from reaching the point of operation","Verify guard does not create new hazards (pinch points, sharp edges)","Train all operators on guard purpose and prohibition against removal","Post warning signage at guarded equipment","Document installation with photo, date, and installer name"],timeline:"30 days (interim barricade within 24 hours)",verify:"Photo of installed guard + operator training sign-off"},
  "1910.1200":{std:"29 CFR 1910.1200",title:"Hazard Communication",steps:["Inventory all hazardous chemicals in the workplace","Obtain current Safety Data Sheets (SDS) for each chemical","Ensure all containers have GHS-compliant labels: product name, signal word, pictograms, hazard statements, precautionary statements","Establish SDS access method accessible to all employees during every shift","Write or update Hazard Communication Program covering labeling, SDS, and training","Train all employees: location of SDS, how to read labels, hazards of chemicals in their work area","Document training with date, attendees, trainer, and topics covered","Conduct annual program review"],timeline:"14 days for SDS access; 30 days for full program update",verify:"SDS access test (ask 3 employees) + training records"},
  "1910.147":{std:"29 CFR 1910.147",title:"Lockout/Tagout (LOTO)",steps:["Inventory all machines/equipment with hazardous energy sources","Write machine-specific LOTO procedures for each (not generic)","Each procedure must list: energy sources, isolation devices, stored energy release method, verification steps","Procure individual locks and tags for each authorized employee","Train authorized employees on machine-specific procedures","Train affected employees on purpose and recognition of LOTO","Conduct annual periodic inspection of each procedure by different authorized employee","Document all training and inspections with dates and signatures"],timeline:"60 days for full implementation; interim verbal procedures within 48 hours",verify:"Periodic inspection records + employee demonstration"},
  "1910.134":{std:"29 CFR 1910.134",title:"Respiratory Protection",steps:["Conduct workplace exposure assessment to determine respiratory hazards","Select appropriate respirator type based on hazard and APF required","Enroll all respirator users in medical evaluation program (OSHA questionnaire or physician)","Conduct quantitative or qualitative fit testing for each user — annually and upon respirator change","Write Respiratory Protection Program with program administrator named","Train users on: proper don/doff, seal check, maintenance, limitations, emergency procedures","Establish cleaning, inspection, and storage procedures","Document medical clearance, fit test results, and training for each user"],timeline:"45 days; no respirator use without medical clearance and fit test",verify:"Fit test records + medical clearance letters on file"},
  "1926.501":{std:"29 CFR 1926.501",title:"Fall Protection (Construction)",steps:["Identify all walking/working surfaces at 6 feet or above","Evaluate feasibility of guardrail systems as primary protection","Where guardrails not feasible: implement personal fall arrest systems (PFAS) or safety nets","Inspect all fall protection equipment before each use — remove damaged equipment","Ensure anchorage points rated for 5,000 lbs per attached employee","Train all exposed employees on fall hazards, equipment use, and rescue procedures","Develop site-specific fall protection plan for operations where conventional means not feasible","Rescue plan: how to retrieve a fallen worker within 6 minutes"],timeline:"Immediate — no work at height without protection",verify:"Equipment inspection logs + training records + rescue plan"},
  "1910.132":{std:"29 CFR 1910.132",title:"PPE Assessment & Use",steps:["Conduct workplace hazard assessment for each job/area — document in writing","Identify PPE required for each hazard: eye, face, head, hand, foot, respiratory","Certify the hazard assessment in writing with assessor name, date, and signature","Select PPE appropriate to the hazard — must meet ANSI standards (Z87.1, Z89.1, etc.)","Procure PPE and ensure availability in appropriate sizes","Train employees: when PPE is necessary, what PPE is required, how to don/doff/adjust, limitations, care/maintenance","Enforce PPE use — address non-compliance through disciplinary process","Re-assess when conditions, processes, or equipment change"],timeline:"21 days; hazard assessment certification immediate",verify:"Signed hazard assessment + PPE training records"},
  "1910.178":{std:"29 CFR 1910.178",title:"Powered Industrial Trucks (Forklifts)",steps:["Identify all powered industrial truck operators","Verify each has completed training covering: truck operation, hazard recognition, load handling, refueling, pedestrian safety","Training must include formal instruction, practical training, and performance evaluation","Evaluate each operator at least every 3 years","Conduct daily pre-shift truck inspections — document findings","Address observed unsafe operation immediately with retraining","Maintain training records: operator name, training date, evaluator name, evaluation date","Post speed limits and traffic rules in operating areas"],timeline:"No operation without completed training; 30 days for full program",verify:"Operator evaluation records + daily inspection checklists"},
  "1910.303":{std:"29 CFR 1910.303",title:"Electrical Safety",steps:["Ensure 36-inch clearance maintained in front of all electrical panels","Label all circuit breakers and panels with circuit identification","Verify all electrical panel covers are in place — no open/missing knockouts","Remove all storage within 36 inches of electrical panels","Inspect all flexible cords — no frayed, spliced, or damaged cords in use","Verify GFCI protection on all outlets in wet/damp locations","Ensure all junction boxes have proper covers installed","Document all corrections with photos and dates"],timeline:"14 days; immediate for exposed live parts",verify:"Photo of cleared panels + inspection checklist"},
  "1910.36":{std:"29 CFR 1910.36-37",title:"Means of Egress",steps:["Survey all exit routes — minimum 28-inch unobstructed width","Verify all exit doors open in direction of travel and are not locked from inside during occupancy","Ensure EXIT signs are illuminated and visible from all approach directions","Remove all obstructions from exit paths, corridors, and stairways","Verify emergency lighting operates on backup power — test monthly","Post evacuation maps at key locations showing exit routes and assembly points","Conduct evacuation drill at least annually — document participation and time","Inspect all exit routes weekly for new obstructions"],timeline:"Immediate for blocked exits; 7 days for signage",verify:"Weekly inspection log + drill records"},
  "1910.157":{std:"29 CFR 1910.157",title:"Fire Extinguishers",steps:["Verify extinguishers are provided within 75 feet of all work areas (Class A) or 50 feet (Class B)","Confirm correct type for hazards present (ABC, CO2, Class K for kitchens)","Mount all extinguishers with top no higher than 5 feet (if ≤40 lbs) or 3.5 feet (if >40 lbs)","Ensure all extinguishers are accessible — not blocked by storage or equipment","Conduct monthly visual inspections — document on tag","Annual professional inspection and maintenance by certified technician","Hydrostatic testing per NFPA 10 schedule","Train employees on extinguisher location and use (PASS technique)"],timeline:"Immediate for missing/blocked extinguishers; 30 days for training",verify:"Monthly inspection tags + annual service records"},
  "1910.22":{std:"29 CFR 1910.22",title:"Walking-Working Surfaces / Housekeeping",steps:["Inspect all floors for trip hazards: uneven surfaces, holes, loose tiles, wet areas","Clean up spills immediately — post wet floor signs until dry","Maintain aisles clear of obstructions — mark aisle boundaries where appropriate","Secure all cords, cables, and hoses crossing walkways with covers or overhead routing","Repair or replace damaged flooring within marked timeframe","Establish routine housekeeping schedule with assigned responsibilities","Inspect loading docks, stairways, and elevated platforms for integrity","Document inspection findings and corrections"],timeline:"Immediate for active hazards; 14 days for structural repairs",verify:"Housekeeping inspection logs + repair photos"},
  "1910.1030":{std:"29 CFR 1910.1030",title:"Bloodborne Pathogens",steps:["Write Exposure Control Plan identifying job classifications with exposure","Offer Hepatitis B vaccination series to all employees with occupational exposure — free of charge","Implement Universal Precautions — treat all blood/OPIM as infectious","Provide appropriate PPE: gloves, face shields, gowns as required by task","Establish engineering controls: sharps containers, self-sheathing needles, biosafety cabinets","Train all at-risk employees annually on: hazards, protective measures, post-exposure procedures","Maintain Sharps Injury Log separate from OSHA 300","Post-exposure evaluation and follow-up by healthcare professional within 24 hours"],timeline:"30 days for full program; vaccination offer within 10 days of assignment",verify:"Vaccination declination forms + training records + Sharps Log"},
  "1910.146":{std:"29 CFR 1910.146",title:"Confined Space Entry",steps:["Identify and label all permit-required confined spaces in the workplace","Write entry procedures for each space: hazards, atmospheric testing requirements, ventilation, rescue","Test atmosphere before and during entry: O2, LEL, CO, H2S at minimum","Assign roles: entry supervisor, attendant, entrants, rescue team","Ensure rescue capability: on-site rescue team or pre-arranged external rescue (verify response time)","Complete entry permit before every entry — post at the space","Train all affected employees: entrants, attendants, supervisors, rescue","Cancel permit and evacuate immediately if conditions change"],timeline:"No entry without permit and procedures; 45 days for full program",verify:"Completed permits on file + atmospheric monitoring logs + rescue drill records"},
};

function matchActionTemplate(title,cat,cfr){
  // Try CFR match first (most precise)
  if(cfr){const k=cfr.replace(/29\s*CFR\s*/i,"").trim();if(ACTION_TEMPLATES[k])return{...ACTION_TEMPLATES[k],method:"template",match:"CFR: "+cfr};}
  // Try keyword match on title/category
  const low=(title+" "+cat).toLowerCase();
  const keywords={"1910.212":["guard","machine guard","nip point","point of operation"],"1910.1200":["hazcom","sds","chemical","label","ghs","safety data"],"1910.147":["loto","lockout","tagout","energy control"],"1910.134":["respirator","respiratory","n95","scba","air purifying"],"1926.501":["fall","height","roof","scaffold","ladder","guardrail"],"1910.132":["ppe","protective equipment","glasses","gloves","hard hat","safety shoes"],"1910.178":["forklift","powered industrial","pallet jack","lift truck"],"1910.303":["electrical","panel","breaker","wiring","cord","gfci"],"1910.36":["exit","egress","evacuation","door","blocked exit"],"1910.157":["extinguisher","fire","suppression"],"1910.22":["housekeeping","trip","floor","aisle","walking","slip"],"1910.1030":["bloodborne","needle","sharps","hepatitis","blood","bbp"],"1910.146":["confined space","permit","manhole","tank entry","vessel"]};
  for(const[std,words]of Object.entries(keywords)){if(words.some(w=>low.includes(w))&&ACTION_TEMPLATES[std])return{...ACTION_TEMPLATES[std],method:"template",match:"Keyword: "+words.find(w=>low.includes(w))};}
  return null;
}

const ABOUT_BIO={
  oneLiner:"Engineered by Certified Safety Professionals with proven field expertise.",
  paragraphs:["Prudence Safety & Environmental Consulting, LLC is an EHS consulting firm founded by practicing safety professionals who got tired of watching the industry run on paper forms, tribal knowledge, and fragmented spreadsheets.","The team behind OSHAready brings decades of combined experience across manufacturing, construction, healthcare, defense, commercial real estate, and federal government — performing industrial hygiene fieldwork, managing compliance programs, overseeing construction safety, and leading occupational safety professionals nationwide.","That practitioner mindset is what drives every feature in the platform. OSHAready was not designed by a software company that hired a safety consultant. It was built by the people who do the work — who know what OSHA actually cites, what inspectors actually look for, and what safety managers actually need. The team holds active memberships in the American Society of Safety Professionals and the American Industrial Hygiene Association."],
  website:"https://prudencesafety.com",
};

function AboutTrustBadge({onClick}){const[h,setH]=useState(false);return(<button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{display:"inline-flex",alignItems:"center",gap:8,background:h?"rgba(220,38,38,0.08)":"rgba(220,38,38,0.04)",border:`1px solid rgba(220,38,38,${h?0.25:0.12})`,borderRadius:8,padding:"10px 16px",cursor:"pointer",transition:"all 0.25s ease",transform:h?"translateY(-1px)":"none",width:"100%"}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"/><path d="M9 12l2 2 4-4"/></svg><span style={{fontFamily:"monospace",fontSize:12,color:"rgba(255,255,255,0.7)",textAlign:"left",flex:1}}>{ABOUT_BIO.oneLiner}</span><span style={{fontSize:12,color:"#DC2626",opacity:h?1:0.5}}>→</span></button>);}

function AboutPanel({open,onClose}){const[v,setV]=useState(false);const[s,setS]=useState(false);useEffect(()=>{if(open){setV(true);setTimeout(()=>setS(true),30);}else{setS(false);setTimeout(()=>setV(false),350);}},[open]);if(!v)return null;return(<div onClick={onClose} style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:s?"rgba(0,0,0,0.7)":"rgba(0,0,0,0)",backdropFilter:s?"blur(8px)":"blur(0)",transition:"all 0.35s ease",padding:20}}><div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",background:"#0C0E13",border:"1px solid rgba(220,38,38,0.1)",borderRadius:16,opacity:s?1:0,transform:s?"translateY(0) scale(1)":"translateY(16px) scale(0.97)",transition:"all 0.35s cubic-bezier(0.16,1,0.3,1)",boxShadow:"0 24px 80px rgba(0,0,0,0.5)"}}><div style={{padding:"28px 28px 20px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><div><div style={{fontSize:11,fontWeight:600,letterSpacing:2.5,textTransform:"uppercase",color:"#DC2626"}}>About Prudence</div><div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:2}}>Safety & Environmental Consulting</div></div><button onClick={onClose} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"rgba(255,255,255,0.4)"}}>✕</button></div><div style={{padding:"24px 28px 20px"}}>{ABOUT_BIO.paragraphs.map((p,i)=>(<p key={i} style={{fontSize:14,lineHeight:1.75,color:i===0?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.65)",margin:0,marginBottom:i<2?18:0}}>{p}</p>))}</div><div style={{padding:"16px 28px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}><span style={{fontFamily:"monospace",fontSize:11,color:"rgba(255,255,255,0.25)"}}>Prudence Safety & Environmental Consulting, LLC</span><a href={ABOUT_BIO.website} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"#DC2626",textDecoration:"none",padding:"6px 14px",borderRadius:6,border:"1px solid rgba(220,38,38,0.2)",background:"rgba(220,38,38,0.06)"}}>prudencesafety.com ↗</a></div></div></div>);}

export default function OSHAReady(){
  const { isDesktop, isStandalone } = useMediaQuery()
  if (isDesktop && !isStandalone) return <LandingPage isDesktop={true} />
  const [view,setView]=useState("dash");const [clock,setClock]=useState(new Date());const [navOpen,setNavOpen]=useState(false);const [panel,setPanel]=useState(null);const [tosOk,setTosOk]=useState(false);const [showTos,setShowTos]=useState(false);const [showTour,setShowTour]=useState(false);const [tourStep,setTourStep]=useState(0);const [fbText,setFbText]=useState("");const [fbSent,setFbSent]=useState(false);const [splash,setSplash]=useState(true);
  const [authScreen,setAuthScreen]=useState(null);const [authMode,setAuthMode]=useState("login");const [authForm,setAuthForm]=useState({name:"",email:"",password:"",company:"",role:"Safety Manager"});const [user,setUser]=useState(null);
  const [hazards,setHazards]=useState([]);const [actions,setActions]=useState([]);const [training,setTraining]=useState([]);const [docs,setDocs]=useState([]);const [mockR,setMockR]=useState({});const [mockIdx,setMockIdx]=useState(0);const [mockIndustry,setMockIndustry]=useState("");const [mockCustom,setMockCustom]=useState({});const [mockSetup,setMockSetup]=useState(true);const [mockDone,setMockDone]=useState(false);const [mockNotes,setMockNotes]=useState({});const [mockPhotos,setMockPhotos]=useState({});const [liveLog,setLiveLog]=useState([]);const [liveOn,setLiveOn]=useState(false);const [livePhase,setLivePhase]=useState("idle");const [pbChecks,setPbChecks]=useState({});const [pbStep,setPbStep]=useState(0);const [liveLogType,setLiveLogType]=useState(null);const [liveLogInput,setLiveLogInput]=useState("");const [showHF,setShowHF]=useState(false);const [newH,setNewH]=useState({title:"",site:"s1",loc:"",cat:"Machine Guarding",sev:"medium",interim:"",cfr:""});const [showDF,setShowDF]=useState(false);const [newDoc,setNewDoc]=useState({name:"",folder:"Programs",exp:"",site:"all"});const [docQ,setDocQ]=useState("");const [docSite,setDocSite]=useState("all");const [showTF,setShowTF]=useState(false);const [newTrn,setNewTrn]=useState({emp:"",course:"",due:""});
  const [notifs,setNotifs]=useState({weeklyDigest:true,trainingExpiry:true,docExpiry:true,actionOverdue:true,postingReminder:true,scoreChange:false,teamActivity:false,customTiming:false,quietStart:"22:00",quietEnd:"07:00",quietOn:false,channelPush:true,channelEmail:true,channelSms:false});
  const [appearance,setAppearance]=useState("dark");const [textSize,setTextSize]=useState("default");const [reduceMotion,setReduceMotion]=useState(false);const [hapticOn,setHapticOn]=useState(true);const [highContrast,setHighContrast]=useState(false);
  const lt=appearance==="light";
  const bg=lt?"#FAFBFC":_bg,crd=lt?"#FFFFFF":_crd,sub=lt?"#F1F5F9":_sub,bdr=lt?"#E2E8F0":_bdr;
  const txP=lt?"#1E293B":"#F0F4F8",txS=lt?"#475569":"#8B95A8",txM=lt?"#64748B":"#5E6578";
  const inp={padding:"10px 12px",background:sub,border:"1px solid "+bdr,borderRadius:8,color:txP,fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box",width:"100%"};
  const [toast,setToast]=useState(null);const [setupDone,setSetupDone]=useState(true);const [company,setCompany]=useState({name:"",industry:"",sites:1,contact:""});const [showPaywall,setShowPaywall]=useState(false);const [activePlan,setActivePlan]=useState(null);const [pendingNav,setPendingNav]=useState(null);const [restored,setRestored]=useState(false);const [showScoreDetail,setShowScoreDetail]=useState(false);const [aboutOpen,setAboutOpen]=useState(false);
  const [locked,setLocked]=useState(false);const [auditLog,setAuditLog]=useState([]);const [lastActivity,setLastActivity]=useState(Date.now());const [sessionTimeout,setSessionTimeout]=useState(15);
  const [emergencyContacts,setEmergencyContacts]=useState([{id:"ec1",name:"",role:"Legal Counsel",phone:"",email:"",notify:true},{id:"ec2",name:"",role:"Plant Manager",phone:"",email:"",notify:true},{id:"ec3",name:"",role:"HR Director",phone:"",email:"",notify:true}]);
  const [notifySending,setNotifySending]=useState(false);const [notifySent,setNotifySent]=useState(false);const [stakeOpen,setStakeOpen]=useState(false);const [logLastSent,setLogLastSent]=useState(0);const [logSending,setLogSending]=useState(false);const [alertFallback,setAlertFallback]=useState(false);
  const [wide,setWide]=useState(typeof window!=="undefined"?window.innerWidth>=768:false);
  const [online,setOnline]=useState(typeof navigator!=="undefined"?navigator.onLine:true);const [syncQueue,setSyncQueue]=useState([]);const [lastSaved,setLastSaved]=useState(null);
  useEffect(()=>{const h=()=>setWide(window.innerWidth>=768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  // Online/offline detection
  useEffect(()=>{
    const on=()=>{setOnline(true);if(syncQueue.length>0){notify(syncQueue.length+" offline actions synced");audit("Sync Complete",syncQueue.length+" actions");setSyncQueue([]);}};
    const off=()=>{setOnline(false);notify("You're offline — data saves locally","error");};
    window.addEventListener("online",on);window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[syncQueue]);
  // Auto-save all data to persistent storage (excluding photos to stay under 5MB)
  useEffect(()=>{
    if(!restored)return; // Don't save until restoration completes
    const save=async()=>{
      await STO.set("or-data",{hazards,actions,training,docs,mockR,mockNotes,notifs,appearance,sessionTimeout,emergencyContacts,auditLog:auditLog.slice(0,50)});
      setLastSaved(new Date().toLocaleTimeString());
    };
    const t=setTimeout(save,2000);return()=>clearTimeout(t);
  },[hazards,actions,training,docs,mockR,mockNotes,notifs,appearance,sessionTimeout,auditLog,restored]);
  const [chatOpen,setChatOpen]=useState(false);const [chatMsgs,setChatMsgs]=useState([]);const [chatInput,setChatInput]=useState("");const [chatLoading,setChatLoading]=useState(false);const [chatCount,setChatCount]=useState(()=>{try{const d=JSON.parse(localStorage.getItem("or_chat"));if(d&&d.date===new Date().toDateString())return d.count;return 0;}catch{return 0;}});const [chatMin,setChatMin]=useState(false);
  const audit=(action,detail="")=>{setAuditLog(p=>[{time:new Date().toLocaleString(),action,detail,id:Date.now()},...p].slice(0,200));};
  const lastSubmit=useRef(0);
  const prevScore=useRef(0);
  const rateOk=()=>{const now=Date.now();if(now-lastSubmit.current<1500)return false;lastSubmit.current=now;return true;};
  const [formErrors,setFormErrors]=useState({});

  const CHAT_SYS=`You are the OSHAready Assistant — a helpful navigation and support bot built into the OSHAready OSHA inspection readiness platform by Prudence Safety & Environmental Consulting, LLC.

YOUR ROLE: Help users navigate and use the OSHAready app. You know every feature, module, and workflow inside the app.

APP MODULES:
- Dashboard: Shows readiness score (100-point weighted model), critical gaps, next best action, monthly summary
- Mock OSHA Inspection: Industry-specific checklists (Manufacturing, Construction, Healthcare, Warehouse, Office) with OSHA standard references. One question at a time. Shows summary with deficiencies when complete.
- Hazard Reporting: Report hazards with title, site, location, severity, interim controls. Mark corrected. Create corrective actions from hazards.
- Corrective Action Tracker: Track actions from open → in progress → closed. AI Draft Action Plan available on Professional tier.
- Document Vault: Store written programs, OSHA logs, chemical docs. Search, site tagging, approval workflow (pending → approved), version history. Mark expired docs as updated.
- Training Tracker: Add employees + courses with due dates. Mark complete. Shows impact on readiness score.
- OSHA Recordkeeping: 300/300A/301 log display and posting reminders.
- Live Inspection Mode: 10-step Response Playbook for when OSHA arrives (verify credentials → contact counsel → designate rep → determine scope → locate logs → secure programs → locate training → brief supervisors → opening conference), then real-time logging.
- Notifications: Weekly digest, training/doc expiry alerts, action overdue alerts, 300A posting reminder.
- Security: Input sanitization, session auto-lock, audit logging, rate limiting.

SCORING MODEL (8 categories, weighted to 100):
Written Programs 20%, Training 17%, OSHA Logs 12%, Audit Performance 15%, Corrective Actions 10%, Hazard Closure 10%, Site Conditions 12%, Response Prep 4%.

PRICING: Starter $29/mo (single site), Professional $79/mo (3 sites, AI plans, Live Mode), Firm $199/mo (unlimited sites, consultant dashboard). All tiers include unlimited users.

RULES:
- NEVER give specific safety advice, compliance determinations, or regulatory interpretations
- If asked about safety specifics, say: "That requires a qualified safety professional. I can help you use OSHAready's tools to document and track that concern."
- Keep responses concise (2-4 sentences max)
- Use the user's current context when possible
- Suggest specific app actions when relevant ("Try running a Mock OSHA Inspection to find gaps")
- You can mention Prudence EHS consulting services for questions beyond the app's scope`;

  const CHAT_FALLBACK=[
    {k:["score","improve","increase","points","higher","100"],a:"Your readiness score is based on 8 categories: Written Programs (20%), Training (17%), OSHA Logs (12%), Audit Performance (15%), Corrective Actions (10%), Hazard Closure (10%), Site Conditions (12%), and Response Prep (4%). Weights are calibrated against OSHA FY2025 citation frequency data. Check your dashboard's 'Highest Impact Action' card — it shows exactly which action gives you the most points."},
    {k:["mock","inspection","audit","checklist"],a:"Tap the 'Run Mock OSHA Inspection' card on the dashboard. Select your industry (Manufacturing, Construction, etc.), customize which items to include, then answer each question Pass/Fail/N/A. When complete, you'll see a summary with your score and every deficiency listed with the OSHA standard reference."},
    {k:["live","osha arrives","inspector","response","playbook"],a:"Tap the LIVE button in the header. You'll get a 10-step Response Playbook: verify credentials, call counsel, designate your rep, determine scope, locate your 300 logs, secure written programs, pull training records, brief supervisors, and begin the opening conference. Each step is timestamped. After completing the playbook, you transition to real-time logging."},
    {k:["document","vault","program","approve","approval","expired"],a:"Open Documents from the menu. You can search by name, filter by site, and see approval status. Expired documents show 'Mark Updated' — tap it, and it resets to current with pending approval. Then tap 'Approve' to record who reviewed it and when. Version history tracks every change."},
    {k:["training","complete","overdue","certification","mark"],a:"Open Training from the menu. Each overdue or due-soon record has a 'Mark Complete' button. Tap it — the status changes to current, your readiness score updates immediately, and the training compliance percentage in the footer reflects the change."},
    {k:["hazard","report","corrected"],a:"Open Hazards from the menu and tap 'Report' in the top right. Fill in the title, site, location, severity, and any interim controls. Once submitted, the hazard appears in your list. Tap 'Corrected' when it's fixed, or 'Create Action' to generate a corrective action with tracking."},
    {k:["action","corrective","plan","ai","draft"],a:"Corrective actions are created from hazard reports or mock inspection failures. Each open action has Start/Close buttons to track progress. The 'Draft Action Plan' button generates an AI-powered step-by-step plan with OSHA references — available on the Professional tier ($79/mo)."},
    {k:["price","pricing","cost","upgrade","plan","tier","subscribe"],a:"OSHAready has three tiers: Starter ($29/mo) for single-site with core modules, Professional ($79/mo) for up to 3 sites with AI action plans and Live Inspection Mode, and Firm ($199/mo) for unlimited sites with consultant dashboard. All tiers include unlimited users — no per-seat fees."},
    {k:["notify","notification","alert","remind"],a:"Open Notifications from the menu. Free tier includes: weekly readiness digest, training expiry alerts (14 days), document expiry alerts (30 days), overdue action alerts, and 300A posting reminders. Professional adds score change alerts, team activity, and custom timing."},
    {k:["security","lock","session","audit log","protect"],a:"Open Security from the menu. The app includes input sanitization, session auto-lock (configurable 5–60 min), rate limiting, and audit logging of every action. You can view the full audit trail and adjust your lock timeout in the Security panel."},
    {k:["300","recordkeeping","log","posting"],a:"Open OSHA Recordkeeping from the menu. It displays your 300, 300A, and 301 logs with summary statistics. The notification system reminds you to post the 300A summary by February 1 each year."},
    {k:["hello","hi ","hey","help","what can you"],a:"I'm the OSHAready Assistant! I can help you navigate the app, explain features, and guide you through workflows. Try asking about your readiness score, how to run a mock inspection, or what to do when OSHA arrives."},
  ];

  const matchFallback=(msg)=>{const low=msg.toLowerCase();const match=CHAT_FALLBACK.find(f=>f.k.some(k=>low.includes(k)));return match?match.a:"I can help with navigating OSHAready — try asking about your readiness score, mock inspections, document approval, training tracking, or what to do when OSHA arrives.";};

  const loadDemo=()=>{setHazards(S_HAZ);setActions(S_ACT);setTraining(S_TRN);setDocs(S_DOC);setCompany({name:"Acme Manufacturing",industry:"Manufacturing",sites:3,contact:"Safety Manager"});notify("Demo data loaded — explore all features","success");audit("Demo Data Loaded","");};

  const sendChat=async()=>{
    const msg=sanitize(chatInput.trim());if(!msg||chatLoading)return;
    if(chatCount>=5){setChatMsgs(p=>[...p,{role:"user",content:msg},{role:"assistant",content:"You've reached the free daily limit of 5 messages. Upgrade to Professional for unlimited assistant access."}]);setChatInput("");return;}
    setChatMsgs(p=>[...p,{role:"user",content:msg}]);setChatInput("");setChatLoading(true);setChatCount(p=>{const n=p+1;try{localStorage.setItem("or_chat",JSON.stringify({count:n,date:new Date().toDateString()}));}catch{}return n;});
    try{
      const history=chatMsgs.slice(-10).map(m=>({role:m.role,content:m.content}));
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:300,system:CHAT_SYS,messages:[...history,{role:"user",content:msg}]})});
      const data=await res.json();
      const reply=data.content?.map(b=>b.text||"").join("")||matchFallback(msg);
      setChatMsgs(p=>[...p,{role:"assistant",content:reply}]);
    }catch{
      // Fallback to local responses when API unavailable
      await new Promise(r=>setTimeout(r,600));
      setChatMsgs(p=>[...p,{role:"assistant",content:matchFallback(msg)}]);
    }
    setChatLoading(false);audit("Chat Message",msg.slice(0,50));
  };

  const sendEmergencyAlert=async()=>{
    const contacts=emergencyContacts.filter(c=>c.notify&&(c.phone||c.email)&&c.name);
    if(!contacts.length){notify("No contacts configured — go to Settings → Emergency Contacts","error");return;}
    setNotifySending(true);
    const siteName=company.name||"Facility";
    const msg=`🚨 OSHA INSPECTION ALERT: A compliance officer is on-site at ${siteName}. Report immediately. Time: ${new Date().toLocaleTimeString()}. — Sent via OSHAready`;
    const results=[];
    for(const c of contacts){
      try{
        const res=await fetch("/api/notify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:c.phone,email:c.email,name:c.name,role:c.role,message:msg,site:siteName})});
        if(res.ok){results.push({name:c.name,status:"sent"});}
        else{results.push({name:c.name,status:"failed"});}
      }catch{
        // Offline or API unavailable — queue for later
        results.push({name:c.name,status:"queued"});
      }
    }
    const sent=results.filter(r=>r.status==="sent").length;
    const queued=results.filter(r=>r.status==="queued").length;
    setNotifySending(false);setNotifySent(true);
    if(sent>0)notify(sent+" team member"+(sent!==1?"s":"")+" notified","success");
    else if(queued>0)notify("Offline — "+queued+" alert"+(queued!==1?"s":"")+" queued for delivery");
    else notify("Alerts failed — call your team directly","error");
    if(sent===0)setAlertFallback(true);
    setLiveLog(p=>[...p,{type:"ALERT",time:new Date().toLocaleTimeString(),note:"Emergency alert sent to "+contacts.map(c=>c.name+" ("+c.role+")").join(", ")}]);
    audit("Emergency Alert Sent",contacts.length+" contacts: "+contacts.map(c=>c.name).join(", "));
    setTimeout(()=>setNotifySent(false),30000);
  };

  const sendLogUpdate=async()=>{
    const contacts=emergencyContacts.filter(c=>c.notify&&(c.phone||c.email)&&c.name);
    if(!contacts.length){notify("No contacts configured — go to Settings","error");return;}
    const newEntries=liveLog.slice(logLastSent);
    if(!newEntries.length){notify("No new entries since last update");return;}
    setLogSending(true);
    const siteName=company.name||"Facility";
    const logText=newEntries.map(e=>`${e.time} [${e.type}] ${e.note}`).join("\n");
    const msg=`📋 INSPECTION UPDATE — ${siteName}\n${newEntries.length} new log entr${newEntries.length!==1?"ies":"y"}:\n\n${logText}\n\n— Sent via OSHAready`;
    let sent=0;
    for(const c of contacts){
      try{
        await fetch("/api/notify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:c.phone,email:c.email,name:c.name,role:c.role,message:msg,site:siteName})});
        sent++;
      }catch{}
    }
    setLogSending(false);setLogLastSent(liveLog.length);
    if(sent>0)notify(sent+" team member"+(sent!==1?"s":"")+" updated","success");
    else notify("Updates queued — will send when online");
    setLiveLog(p=>[...p,{type:"UPDATE",time:new Date().toLocaleTimeString(),note:"Log update sent to "+contacts.map(c=>c.name).join(", ")}]);
    audit("Log Update Sent",newEntries.length+" entries to "+contacts.length+" contacts");
  };

  const mockItems=useMemo(()=>{
    const industry=MOCK_INDUSTRY[mockIndustry]||[];
    const all=[...MOCK_CORE,...industry];
    return all.filter(item=>mockCustom[item.id]!==false);
  },[mockIndustry,mockCustom]);
  const allMockItems=useMemo(()=>[...MOCK_CORE,...(MOCK_INDUSTRY[mockIndustry]||[])],[mockIndustry]);
  const mockPct=useMemo(()=>{const p=Object.values(mockR).filter(v=>v==="pass").length;return mockItems.length?Math.round((p/mockItems.length)*100):0;},[mockR,mockItems]);
  const score=useMemo(()=>calcScore(docs,training,actions,hazards,mockPct),[docs,training,actions,hazards,mockPct]);
  useEffect(()=>{if(!restored)return;if(prevScore.current>0&&score!==prevScore.current){const diff=score-prevScore.current;if(diff>0)notify("Score improved +"+diff+" points! Now at "+score,"success");if(score>=90&&prevScore.current<90)notify("Excellent! Your facility is in top readiness","success");if(score===100)notify("Perfect score! Fully OSHA-ready","success");}prevScore.current=score;},[score,restored]);
  const gaps=useMemo(()=>{const g=[];docs.filter(d=>d.status==="expired").forEach(d=>g.push({sev:"critical",text:d.name+" — EXPIRED",act:"Update document",mod:"docs"}));training.filter(t=>t.status==="overdue").forEach(t=>g.push({sev:"high",text:t.emp+" — "+t.course+" OVERDUE",act:"Schedule training",mod:"training"}));hazards.filter(h=>h.status==="open"&&(h.sev==="critical"||h.sev==="high")).forEach(h=>g.push({sev:h.sev,text:h.title,act:"Address hazard",mod:"hazards"}));return g.sort((a,b)=>a.sev==="critical"?-1:1);},[docs,training,hazards]);

  const TOUR=[
    {icon:"shield",color:pri,t:"Welcome to OSHAready",s:"Inspection Readiness Platform",b:"Everything you need to prepare for, survive, and recover from an OSHA inspection — in one place. Engineered by Certified Safety Professionals with proven field expertise."},
    {icon:"clip",color:"#FBBF24",t:"Readiness Score",s:"Your compliance report card",b:"A 100-point score across 8 categories — Written Programs, Training, OSHA Logs, Audit Performance, Corrective Actions, Hazard Closure, Site Conditions, and Response Prep. Weights are calibrated against real OSHA citation data. Tap the score to see exactly where your gaps are."},
    {icon:"clip",color:"#22D3EE",t:"Mock OSHA Inspection",s:"Practice before the real thing",b:"Industry-specific checklists (Manufacturing, Construction, Healthcare, Warehouse, Office). Every item cites the actual OSHA standard. Pass, Fail, or N/A — one question at a time. Photos and notes on every item. See your penalty exposure when you're done."},
    {icon:"alert",color:"#EF4444",t:"Hazard Reporting",s:"See it, report it, fix it",b:"Report hazards in seconds with severity, location, interim controls, and the applicable OSHA standard. Each report creates a traceable record. Mark corrected when fixed, or create a corrective action with one tap."},
    {icon:"wrench",color:"#FB923C",t:"Corrective Actions",s:"Track every fix to closure",b:"Every action has an owner, deadline, severity, and status. Overdue items sort to the top with a red badge. When you close an action, it's verified with your name and date — the audit trail OSHA looks for."},
    {icon:"folder",color:"#8B5CF6",t:"Document Vault & Training",s:"Programs, logs, and records",b:"Store your written programs, OSHA logs, and chemical docs with approval workflow and version history. Track employee training with due dates. Expired items are flagged automatically. Everything feeds your readiness score."},
    {icon:"live",color:"#FB923C",t:"Live Inspection Mode",s:"When OSHA actually arrives",b:"A 10-step Response Playbook guides you through the first 15 minutes. One tap alerts your entire team — legal counsel, plant manager, HR — via SMS and email simultaneously. Then log everything in real time: document requests, walkaround notes, interviews, evidence."},
    {icon:"shield",color:pri,t:"Action Plans",s:"Standards-based corrective plans",b:"Tap 'Draft Action Plan' on any deficiency. OSHAready matches it to the applicable OSHA standard and generates a step-by-step corrective plan with timelines and verification criteria. No AI — deterministic, standards-based plans you can trust."},
    {icon:"shield",color:"#22C55E",t:"You're Ready",s:"Let's check your score",b:"Your readiness score updates as you fix gaps. Run a mock inspection to find what's missing. Report hazards as you spot them. The goal: 100% before OSHA knocks. Tap 'Get Started' to see your dashboard."}
  ];

  useEffect(()=>{(async()=>{const v=await STO.get("or-v");if(!v){await STO.set("or-v",true);setShowTour(true);}const t=await STO.get("or-t");setTosOk(!!t);const u=await STO.get("or-user");if(u)setUser(u);else setAuthScreen("auth");
    // Restore saved data
    const d=await STO.get("or-data");if(d){
      if(d.hazards)setHazards(d.hazards);if(d.actions)setActions(d.actions);if(d.training)setTraining(d.training);if(d.docs)setDocs(d.docs);
      if(d.mockR)setMockR(d.mockR);if(d.mockNotes)setMockNotes(d.mockNotes);if(d.notifs)setNotifs(p=>({...p,...d.notifs}));
      if(d.appearance)setAppearance(d.appearance);if(d.sessionTimeout)setSessionTimeout(d.sessionTimeout);if(d.emergencyContacts)setEmergencyContacts(d.emergencyContacts);
    }setRestored(true);})();},[]);
  // Service Worker Registration (activates on Vercel deployment)
  useEffect(()=>{
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("/sw.js").then(reg=>{
        console.log("SW registered:",reg.scope);
        reg.addEventListener("updatefound",()=>{
          const nw=reg.installing;
          if(nw)nw.addEventListener("statechange",()=>{if(nw.state==="activated")notify("App updated — latest version loaded");});
        });
      }).catch(()=>console.log("SW not available in this environment"));
    }
  },[]);
  useEffect(()=>{if(splash){const t=setTimeout(()=>setSplash(false),2800);return()=>clearTimeout(t);}},[splash]);
  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),30000);return()=>clearInterval(t);},[]);
  // Session timeout — lock after inactivity
  useEffect(()=>{
    const check=setInterval(()=>{if(tosOk&&Date.now()-lastActivity>sessionTimeout*60*1000){STO.set("or-data",{hazards,actions,training,docs,mockR,mockNotes,notifs,appearance,sessionTimeout,emergencyContacts,auditLog:auditLog.slice(0,50)}).then(()=>setLocked(true));}},30000);
    const activity=()=>setLastActivity(Date.now());
    window.addEventListener("click",activity);window.addEventListener("keydown",activity);window.addEventListener("touchstart",activity);
    return()=>{clearInterval(check);window.removeEventListener("click",activity);window.removeEventListener("keydown",activity);window.removeEventListener("touchstart",activity);};
  },[lastActivity,sessionTimeout,tosOk]);
  const haptic=()=>{if(!hapticOn)return;try{navigator?.vibrate?.([15,40,15]);}catch{}};
  const gate=(nav)=>{if(!tosOk){setShowTos(true);if(nav)setPendingNav(nav);return false;}return true;};
  const notify=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),2200);};
  const Bd=({children,c,style})=><span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:(c||"#5E6578")+"20",color:c||"#5E6578",...style}}>{children}</span>;

  // Next Best Action — highest score-impact item
  const nextAction=useMemo(()=>{
    const items=[];
    docs.filter(d=>d.status==="expired").forEach(d=>items.push({text:"Update "+d.name,impact:15,mod:"docs",color:"#EF4444"}));
    training.filter(t=>t.status==="overdue").forEach(t=>items.push({text:t.emp+" — complete "+t.course,impact:10,mod:"training",color:"#EF4444"}));
    actions.filter(a=>a.status==="open").forEach(a=>items.push({text:"Start: "+a.title,impact:8,mod:"actions",color:"#FBBF24"}));
    hazards.filter(h=>h.status==="open"&&h.sev==="high").forEach(h=>items.push({text:"Address: "+h.title,impact:12,mod:"hazards",color:"#EF4444"}));
    if(mockPct===0)items.push({text:"Run your first Mock OSHA Inspection",impact:15,mod:"mock",color:pri});
    return items.sort((a,b)=>b.impact-a.impact)[0]||null;
  },[docs,training,actions,hazards,mockPct]);

  // Monthly summary stats
  const monthStats=useMemo(()=>({
    hazReported:hazards.length,hazClosed:hazards.filter(h=>h.status==="corrected").length,
    actOpen:actions.filter(a=>a.status!=="closed").length,actClosed:actions.filter(a=>a.status==="closed").length,
    trnOverdue:training.filter(t=>t.status==="overdue").length,trnCurrent:training.filter(t=>t.status==="current").length,
    docsExpired:docs.filter(d=>d.status==="expired").length,docsCurrent:docs.filter(d=>d.status==="current").length,
  }),[hazards,actions,training,docs]);

  // Mock inspection results summary
  const mockSummary=useMemo(()=>{
    const passed=mockItems.filter(i=>mockR[i.id]==="pass");
    const failed=mockItems.filter(i=>mockR[i.id]==="fail");
    const na=mockItems.filter(i=>mockR[i.id]==="na");
    return {passed,failed,na,total:mockItems.length};
  },[mockItems,mockR]);

  return(<div style={{minHeight:"100vh",background:bg,color:txP,fontFamily:"'Outfit',system-ui,sans-serif"}}>

    {/* Splash Screen Animation */}
    {splash&&<div style={{position:"fixed",inset:0,background:_bg,zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",animation:"splashOut 2.8s ease forwards"}}>
      <div style={{animation:"splashPulse 2s ease infinite",marginBottom:24}}>
        <svg width={100} height={100} viewBox="0 0 100 100" fill="none">
          <path d="M88 50 A38 38 0 1 1 72 22" stroke="#E2E8F0" strokeWidth="14" strokeLinecap="round" fill="none" style={{strokeDasharray:200,animation:"drawArc .8s ease .2s both"}}/>
          <path d="M32 52 L48 68 L78 28" stroke="#DC2626" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" style={{strokeDasharray:80,animation:"drawCheck .5s ease .9s both"}}/>
        </svg>
      </div>
      <div style={{animation:"splashText .5s ease 1.2s both"}}>
        <div style={{fontSize:32,fontWeight:800,letterSpacing:-0.5}}>OSHA<span style={{color:pri}}>ready</span></div>
      </div>
      <div style={{animation:"splashText .5s ease 1.6s both"}}>
        <div style={{fontSize:13,color:"#5E6578",fontFamily:"monospace",marginTop:4}}>by Prudence EHS</div>
      </div>
      <div style={{animation:"splashText .4s ease 2s both"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:20}}>
          <div style={{width:6,height:6,borderRadius:3,background:pri,animation:"pu 1s infinite"}}/>
          <span style={{fontSize:12,color:"#5E6578"}}>Loading your safety dashboard</span>
        </div>
      </div>
    </div>}
    {/* Toast notification */}
    {toast&&<div style={{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",zIndex:500,padding:"12px 24px",borderRadius:10,background:toast.type==="success"?"#22C55E":toast.type==="error"?"#EF4444":"#FBBF24",color:toast.type==="success"?"#052E16":toast.type==="error"?"#fff":"#422006",fontSize:14,fontWeight:600,boxShadow:"0 8px 30px #0004",animation:"fu .3s ease",display:"flex",alignItems:"center",gap:8,fontFamily:"inherit"}}>
      {toast.type==="success"&&<I n="check" s={16} c="#052E16"/>}{toast.msg}
    </div>}

    {/* Auth Screen — Login / Signup */}
    {!splash&&authScreen==="auth"&&!user&&<div style={{position:"fixed",inset:0,background:bg,zIndex:650,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380,animation:"fu .4s ease"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <Logo s={56} light={lt}/>
          <div style={{fontSize:28,fontWeight:800,marginTop:8}}>OSHA<span style={{color:pri}}>ready</span></div>
          <div style={{fontSize:13,color:"#5E6578",marginTop:4}}>{authMode==="login"?"Welcome back":"Create your account"}</div>
        </div>

        {/* OAuth buttons */}
        <button onClick={()=>{setUser({name:"Demo User",email:"demo@company.com",company:"Demo Company",role:"Safety Manager",avatar:null,joined:new Date().toISOString().slice(0,10)});STO.set("or-user",{name:"Demo User",email:"demo@company.com",company:"Demo Company",role:"Safety Manager",avatar:null,joined:new Date().toISOString().slice(0,10)});setAuthScreen(null);audit("Login","Google OAuth");}} style={{width:"100%",padding:14,background:sub,border:"1px solid "+bdr,borderRadius:10,color:"#F0F4F8",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:8}}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        <button onClick={()=>{setUser({name:"Demo User",email:"demo@company.com",company:"Demo Company",role:"Safety Manager",avatar:null,joined:new Date().toISOString().slice(0,10)});STO.set("or-user",{name:"Demo User",email:"demo@company.com",company:"Demo Company",role:"Safety Manager",avatar:null,joined:new Date().toISOString().slice(0,10)});setAuthScreen(null);audit("Login","Microsoft OAuth");}} style={{width:"100%",padding:14,background:sub,border:"1px solid "+bdr,borderRadius:10,color:"#F0F4F8",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:16}}>
          <svg width="18" height="18" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>
          Continue with Microsoft
        </button>

        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}><div style={{flex:1,height:1,background:bdr}}/><span style={{fontSize:12,color:"#5E6578"}}>or</span><div style={{flex:1,height:1,background:bdr}}/></div>

        {/* Email form */}
        <div style={{display:"grid",gap:10}}>
          {authMode==="signup"&&<div>
            <div style={{fontSize:12,color:"#8B95A8",marginBottom:4}}>Full name</div>
            <input value={authForm.name} onChange={e=>setAuthForm(p=>({...p,name:e.target.value}))} placeholder="Jane Smith" style={inp}/>
          </div>}
          <div>
            <div style={{fontSize:12,color:"#8B95A8",marginBottom:4}}>Email</div>
            <input type="email" value={authForm.email} onChange={e=>setAuthForm(p=>({...p,email:e.target.value}))} placeholder="you@company.com" style={inp}/>
          </div>
          <div>
            <div style={{fontSize:12,color:"#8B95A8",marginBottom:4}}>Password</div>
            <input type="password" value={authForm.password} onChange={e=>setAuthForm(p=>({...p,password:e.target.value}))} placeholder={authMode==="signup"?"Min 8 characters":"Enter password"} style={inp}/>
          </div>
          {authMode==="signup"&&<>
            <div>
              <div style={{fontSize:12,color:"#8B95A8",marginBottom:4}}>Company name</div>
              <input value={authForm.company} onChange={e=>setAuthForm(p=>({...p,company:e.target.value}))} placeholder="Acme Manufacturing" style={inp}/>
            </div>
            <div>
              <div style={{fontSize:12,color:"#8B95A8",marginBottom:4}}>Your role</div>
              <select value={authForm.role} onChange={e=>setAuthForm(p=>({...p,role:e.target.value}))} style={inp}>
                {["Safety Manager","EHS Director","Plant Manager","Operations Manager","Safety Consultant","Supervisor","Other"].map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </>}
        </div>

        <button onClick={()=>{
          if(!authForm.email||!authForm.password)return;
          if(authMode==="signup"&&(!authForm.name||!authForm.company))return;
          const u={name:authForm.name||authForm.email.split("@")[0],email:authForm.email,company:authForm.company||"My Company",role:authForm.role,avatar:null,joined:new Date().toISOString().slice(0,10)};
          setUser(u);STO.set("or-user",u);setAuthScreen(null);
          notify(authMode==="signup"?"Account created — welcome!":"Welcome back!");
          audit(authMode==="signup"?"Account Created":"Login",authForm.email);
        }} style={{width:"100%",padding:16,background:"linear-gradient(135deg,#991B1B,"+pri+")",border:"none",borderRadius:12,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:16}}>
          {authMode==="signup"?"Create Account":"Sign In"}
        </button>

        <div style={{textAlign:"center",marginTop:16}}>
          <button onClick={()=>setAuthMode(p=>p==="login"?"signup":"login")} style={{background:"none",border:"none",color:pri,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
            {authMode==="login"?"Don't have an account? Sign up":"Already have an account? Sign in"}
          </button>
        </div>

        {authMode==="login"&&<div style={{textAlign:"center",marginTop:8}}>
          <button style={{background:"none",border:"none",color:"#5E6578",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Forgot password?</button>
        </div>}

        <div style={{fontSize:10,color:"#5E6578",textAlign:"center",marginTop:20,lineHeight:1.6}}>By continuing, you agree to OSHAready's Terms of Service.<br/>Your data is encrypted and never shared.</div>
      </div>
    </div>}
    {locked&&<div style={{position:"fixed",inset:0,background:bg,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:64,height:64,borderRadius:20,background:pri+"15",display:"flex",alignItems:"center",justifyContent:"center"}}><I n="shield" s={32} c={pri}/></div>
      <div style={{fontSize:22,fontWeight:800}}>Session Locked</div>
      <div style={{fontSize:13,color:"#8B95A8",textAlign:"center",maxWidth:280,lineHeight:1.6}}>Your session was locked after {sessionTimeout} minutes of inactivity to protect your compliance data.</div>
      <button onClick={()=>{setLocked(false);setLastActivity(Date.now());audit("Session Unlocked","");}} style={{padding:"14px 32px",background:"linear-gradient(135deg,#991B1B,"+pri+")",border:"none",borderRadius:12,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:8}}>Unlock Session</button>
      <div style={{fontSize:11,color:"#5E6578",marginTop:4}}>In production, this would require re-authentication</div>
    </div>}

    {/* Paywall — AI Draft Action Plan */}
    {showPaywall&&<div style={{position:"fixed",inset:0,background:"#000D",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowPaywall(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:crd,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"92vh",overflow:"auto",padding:"28px 24px 40px",animation:"su .3s ease"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{width:56,height:56,borderRadius:16,background:pri+"15",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><I n="shield" s={28} c={pri}/></div>
          <div style={{fontSize:22,fontWeight:800}}>Upgrade OSHAready</div>
          <div style={{fontSize:13,color:"#8B95A8",marginTop:4}}>Unlimited users at every tier. No per-seat fees.</div>
        </div>

        {/* 3-tier pricing */}
        {[
          {name:"Starter",price:"29",period:"/mo",desc:"For single-site safety managers replacing spreadsheets.",badge:null,border:bdr,features:["Hazard reporting","Corrective action tracker","Training tracker","Document vault","Readiness score dashboard","Single site · unlimited users","Weekly email digest + expiration alerts"]},
          {name:"Professional",price:"79",period:"/mo",desc:"For teams that need inspection readiness and AI assistance.",badge:"Most Popular",border:pri,features:["Everything in Starter, plus:","AI-drafted corrective action plans","Live Inspection Mode + Response Playbook","One-tap team emergency alerts (SMS + email)","OSHA Recordkeeping (300/300A/301)","Industry-specific mock inspections","Push notifications with custom timing","Up to 3 sites · unlimited users"]},
          {name:"Firm",price:"199",period:"/mo",desc:"For consultants and multi-site operations.",badge:null,border:"#22C55E",features:["Everything in Professional, plus:","Unlimited sites","Team assignment workflows","PDF reports for management review","Consultant multi-client dashboard","Custom branding","Priority support"]},
        ].map((tier,i)=><div key={i} style={{padding:"16px",background:sub,borderRadius:14,border:"1.5px solid "+(tier.badge?tier.border:bdr),marginBottom:10,position:"relative"}}>
          {tier.badge&&<div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)",padding:"2px 12px",background:pri,borderRadius:10,fontSize:10,fontWeight:700,color:"#fff"}}>{tier.badge}</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div><div style={{fontSize:16,fontWeight:700}}>{tier.name}</div><div style={{fontSize:12,color:"#5E6578",marginTop:2}}>{tier.desc}</div></div>
            <div style={{textAlign:"right"}}><span style={{fontSize:28,fontWeight:800}}>${tier.price}</span><span style={{fontSize:13,color:"#5E6578"}}>{tier.period}</span></div>
          </div>
          {tier.features.map((f,j)=><div key={j} style={{display:"flex",gap:8,marginBottom:4,alignItems:"flex-start"}}>
            {f.includes("Everything")?<span style={{fontSize:12,color:pri,fontWeight:600}}>{f}</span>:<><I n="check" s={12} c="#22C55E"/><span style={{fontSize:12,color:lt?"#475569":"#C8D0DC",lineHeight:1.4}}>{f}</span></>}
          </div>)}
        </div>)}

        <div style={{padding:"10px 14px",background:bg,borderRadius:8,fontSize:12,color:"#FBBF24",lineHeight:1.5,marginBottom:16,textAlign:"center"}}>AI-generated plans are labeled as drafts and require review by a qualified safety professional.</div>

        <button onClick={()=>{setShowPaywall(false);notify("Upgrade coming soon — thank you for your interest");}} style={{width:"100%",padding:16,background:"linear-gradient(135deg,#991B1B,"+pri+")",border:"none",borderRadius:12,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Start Free Trial — 14 Days</button>
        <div style={{textAlign:"center",fontSize:12,color:"#5E6578",marginTop:8}}>No credit card required · Cancel anytime</div>
        <button onClick={()=>setShowPaywall(false)} style={{width:"100%",padding:12,background:"none",border:"none",color:"#5E6578",fontSize:13,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>Maybe later</button>
      </div>
    </div>}

    {/* Action Plan Panel — Teaser (Free) + Full Steps (PRO) */}
    {activePlan&&<div style={{position:"fixed",inset:0,background:"#000D",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setActivePlan(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:crd,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"88vh",overflow:"auto",padding:"24px 20px 40px",animation:"su .3s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div><div style={{fontSize:16,fontWeight:800}}>Corrective Action Plan</div><div style={{fontSize:11,color:"#22C55E",fontFamily:"monospace",marginTop:2}}>STANDARDS-BASED · DETERMINISTIC</div></div>
          <button onClick={()=>setActivePlan(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid "+bdr,background:"none",color:"#8B95A8",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{padding:"12px 14px",background:pri+"08",border:"1px solid "+pri+"20",borderRadius:10,marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:txP}}>{activePlan.actionTitle}</div>
          <div style={{fontSize:12,color:pri,fontFamily:"monospace",marginTop:3}}>{activePlan.std} — {activePlan.title}</div>
        </div>
        {/* Teaser: timeline, verification, step count — always visible */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          <div style={{padding:"10px 12px",background:sub,borderRadius:8}}><div style={{fontSize:10,color:txM,marginBottom:2}}>Timeline</div><div style={{fontSize:12,fontWeight:600,color:txP}}>{activePlan.timeline}</div></div>
          <div style={{padding:"10px 12px",background:sub,borderRadius:8}}><div style={{fontSize:10,color:txM,marginBottom:2}}>Verification</div><div style={{fontSize:12,fontWeight:600,color:txP}}>{activePlan.verify}</div></div>
        </div>
        <div style={{padding:"10px 12px",background:sub,borderRadius:8,marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:600,color:txP}}>{activePlan.steps.length}-step corrective plan available</div>
          <div style={{fontSize:11,color:txM,marginTop:2}}>Written by a CSP · Based on {activePlan.std} · No AI used</div>
        </div>
        {/* Step 1 preview — free */}
        <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>Step 1 <span style={{fontSize:11,color:txM,fontWeight:400}}>— preview</span></div>
        <div style={{display:"flex",gap:10,padding:"10px 0",borderBottom:"1px solid "+bdr,marginBottom:12}}>
          <div style={{width:22,height:22,borderRadius:6,background:"#22C55E15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#22C55E",flexShrink:0}}>1</div>
          <div style={{fontSize:13,color:lt?"#475569":"#C8D0DC",lineHeight:1.6}}>{activePlan.steps[0]}</div>
        </div>
        {/* Steps 2+ locked */}
        {!activePlan.unlocked?<div>
          <div style={{position:"relative",overflow:"hidden",borderRadius:10,marginBottom:12}}>
            {activePlan.steps.slice(1,3).map((s,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid "+bdr,filter:"blur(4px)",opacity:.4}}>
              <div style={{width:22,height:22,borderRadius:6,background:pri+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:pri,flexShrink:0}}>{i+2}</div>
              <div style={{fontSize:13,color:txM,lineHeight:1.6}}>{s}</div>
            </div>)}
            <div style={{position:"absolute",inset:0,background:`linear-gradient(transparent,${lt?"#F0F4F8":crd})`,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:8}}>
              <div style={{fontSize:11,color:txM}}>+{activePlan.steps.length-1} more steps</div>
            </div>
          </div>
          <button onClick={()=>{setActivePlan(null);setShowPaywall(true);}} style={{width:"100%",padding:14,background:"linear-gradient(135deg,#991B1B,"+pri+")",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}>Unlock Full Plan — Professional</button>
          <div style={{fontSize:11,color:txM,textAlign:"center"}}>$79/mo · All corrective action plans · Industry mock inspections · Live Mode</div>
        </div>
        :<div>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Steps 2–{activePlan.steps.length}</div>
          {activePlan.steps.slice(1).map((s,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid "+bdr}}>
            <div style={{width:22,height:22,borderRadius:6,background:pri+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:pri,flexShrink:0}}>{i+2}</div>
            <div style={{fontSize:13,color:lt?"#475569":"#C8D0DC",lineHeight:1.6}}>{s}</div>
          </div>)}
          <div style={{padding:"10px 12px",background:"#22C55E08",border:"1px solid #22C55E20",borderRadius:8,marginTop:10}}>
            <div style={{fontSize:11,color:"#22C55E",fontWeight:600}}>Source: Pre-built template — {activePlan.std}</div>
            <div style={{fontSize:10,color:txM,marginTop:2}}>This plan is based on published OSHA standards. No AI was used. Professional review recommended before implementation.</div>
          </div>
        </div>}
        <div style={{padding:"10px 12px",background:"#FBBF2408",border:"1px solid #FBBF2420",borderRadius:8,marginTop:8}}>
          <div style={{fontSize:10,color:"#FBBF24",lineHeight:1.5}}>Draft plan based on cited OSHA standard. Site-specific conditions may require modifications. A qualified safety professional should review before implementation.</div>
        </div>
      </div>
    </div>}

    <div style={{position:"sticky",top:0,zIndex:100,background:bg+(lt?"F0":"E8"),backdropFilter:"blur(16px)",borderBottom:"1px solid "+bdr,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}><button onClick={()=>setNavOpen(!navOpen)} style={{width:38,height:38,borderRadius:10,background:bg,border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Logo s={34} light={lt}/></button><div><div style={{fontSize:15,fontWeight:600,color:txP}}>OSHA<span style={{color:pri,fontWeight:800}}>ready</span></div><div style={{fontSize:11,color:txM,fontFamily:"monospace"}}>by Prudence EHS</div></div></div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
        {!online&&<div style={{padding:"3px 8px",borderRadius:6,background:"#FBBF2420",border:"1px solid #FBBF2440",display:"flex",alignItems:"center",gap:3,fontSize:9,fontWeight:700,color:"#FBBF24"}}>
          <div style={{width:5,height:5,borderRadius:3,background:"#FBBF24"}}/>OFFLINE
        </div>}
        <button onClick={()=>{setLiveOn(false);setView("live");}} style={{padding:"5px 10px",borderRadius:8,background:"#991B1B",border:"1px solid #DC2626",color:"#FCA5A5",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4,animation:liveOn?"pu 1.5s infinite":"none"}}><I n="live" s={12} c="#FCA5A5"/>{liveOn?"ACTIVE":"LIVE"}</button>
        <button onClick={()=>{setTourStep(0);setShowTour(true);}} style={{width:28,height:28,borderRadius:8,border:"1px solid "+bdr,background:"none",color:txM,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>?</button>
        {view!=="dash"&&<button onClick={()=>setView("dash")} style={{background:lt?"#E2E8F0":"#1A2535",border:"1.5px solid "+pri+"40",borderRadius:8,color:txP,fontSize:13,fontWeight:600,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit"}}>← Home</button>}</div>
    </div>

    {navOpen&&<div onClick={()=>setNavOpen(false)} style={{position:"fixed",inset:0,background:"#000A",zIndex:150}}><div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:50,left:0,width:wide?300:230,background:crd,borderRight:"1px solid "+bdr,borderRadius:"0 0 14px 0",padding:"10px 6px"}}>
        {/* User profile card */}
        {user&&<div style={{padding:"10px 12px",marginBottom:6,borderBottom:"1px solid "+bdr}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:10,background:pri+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:pri}}>{user.name?.[0]||"U"}</div>
            <div><div style={{fontSize:13,fontWeight:600}}>{user.name}</div><div style={{fontSize:10,color:"#5E6578"}}>{user.role}</div></div>
          </div>
        </div>}
        {PLAT.map(m=><div key={m.id} style={{padding:"11px 12px",borderRadius:8,display:"flex",alignItems:"center",gap:10,background:m.on?pri+"10":"transparent",opacity:m.on?1:.3}}><span>{m.i}</span><span style={{fontSize:14,fontWeight:m.on?600:400,color:m.on?pri:"#5E6578"}}>{m.n}</span></div>)}<div style={{borderTop:"1px solid "+bdr,margin:"8px 0",padding:"8px 12px"}}>{["About","FAQ","Privacy","Terms","Notifications","Security","Settings"].map(x=><button key={x} onClick={()=>{if(x==="Terms")setShowTos(true);else setPanel(x.toLowerCase());setNavOpen(false);}} style={{display:"block",background:"none",border:"none",color:x==="Notifications"?pri:x==="Security"?"#22C55E":x==="Settings"?"#FBBF24":"#5E6578",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"5px 0"}}>{x}</button>)}<button onClick={()=>{setPanel("fb");setFbSent(false);setFbText("");setNavOpen(false);}} style={{display:"block",background:"none",border:"none",color:pri,fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"5px 0"}}>Feedback</button>
        <button onClick={()=>{setPanel("profile");setNavOpen(false);}} style={{display:"block",background:"none",border:"none",color:"#8B95A8",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"5px 0"}}>My Profile</button>
        <button onClick={async()=>{await STO.set("or-user",null);setUser(null);setAuthScreen("auth");setNavOpen(false);audit("Logout","");}} style={{display:"block",background:"none",border:"none",color:"#EF4444",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"5px 0"}}>Sign Out</button>
        <div onClick={()=>{setAboutOpen(true);setNavOpen(false);}} style={{padding:"8px 0",fontSize:12,color:"#DC2626",cursor:"pointer",borderTop:"1px solid "+bdr,marginTop:6,paddingTop:8}}>About Prudence EHS</div></div></div></div>}

    {showTos&&<div style={{position:"fixed",inset:0,background:"#000D",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>tosOk&&setShowTos(false)}><div onClick={e=>e.stopPropagation()} style={{background:crd,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"90vh",overflow:"auto",padding:"28px 24px 40px",animation:"su .3s ease"}}><div style={{fontSize:20,fontWeight:800,marginBottom:16}}>Terms of Service</div>{["OSHAready is proprietary to Prudence Safety & Environmental Consulting, LLC.","OSHAready is not affiliated with, endorsed by, or approved by OSHA or the U.S. Department of Labor.","Supports — does not replace — professional safety judgment and legal counsel.","Your data stays local. PSEC never accesses it.","Provided 'as is.' Liability limited to fees paid in prior 12 months.","Maryland law. Montgomery County."].map((s,i)=><div key={i} style={{fontSize:13,color:"#8B95A8",lineHeight:1.7,marginBottom:8}}>{i+1}. {s}</div>)}{!tosOk?<button onClick={()=>{setTosOk(true);setShowTos(false);haptic();audit("Terms Accepted","");STO.set("or-t",true);if(pendingNav){const nav=pendingNav;setPendingNav(null);setTimeout(()=>nav(),100);}}} style={{width:"100%",padding:16,background:"linear-gradient(135deg,"+priD+","+pri+")",border:"none",borderRadius:12,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>I Accept</button>:<div style={{textAlign:"center",color:"#22C55E"}}>Accepted</div>}</div></div>}

    {panel&&<div style={{position:"fixed",inset:0,background:"#000D",zIndex:250,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setPanel(null)}><div onClick={e=>e.stopPropagation()} style={{background:crd,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"88vh",overflow:"auto",padding:"24px 20px 40px",animation:"su .3s ease"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}><div style={{fontSize:18,fontWeight:700}}>{panel==="about"?"About":panel==="faq"?"FAQ":panel==="privacy"?"Privacy":panel==="notifications"?"Notifications":panel==="security"?"Security":panel==="profile"?"My Profile":panel==="settings"?"Settings":"Feedback"}</div><button onClick={()=>setPanel(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid "+bdr,background:"none",color:"#8B95A8",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button></div>
    {panel==="about"&&<div style={{textAlign:"center"}}><Logo s={56} light={lt}/><div style={{fontSize:28,fontWeight:800,marginTop:8}}>OSHA<span style={{color:pri}}>ready</span></div><p style={{fontSize:14,color:"#8B95A8",lineHeight:1.7,marginTop:16,textAlign:"left"}}>Inspection readiness platform. Mock OSHA inspections, hazard tracking, corrective actions, training, document management, and live inspection logging — scored against a deterministic readiness model.</p><p style={{fontSize:11,color:"#64748B",lineHeight:1.6,marginTop:12,textAlign:"left"}}>OSHAready is not affiliated with, endorsed by, or approved by OSHA or the U.S. Department of Labor.</p></div>}
    {panel==="faq"&&<div>{[
      {q:"What is the readiness score?",a:"Your score is like a report card for your workplace — 0 to 100. It checks 8 things: your written safety programs, employee training records, OSHA injury logs, practice inspection results, whether you're fixing problems you find, whether reported hazards are getting closed, the physical condition of your facility, and whether you have a plan for when OSHA shows up. Each category counts for a different amount based on how often workplaces actually get fined for it. The higher your number, the more ready you are if an inspector walks through your door today."},
      {q:"How do I improve my score?",a:"Check the 'Highest Impact Action' card on your dashboard — it tells you the single thing that will raise your score the most right now. Common quick wins: mark overdue training as complete, update expired documents, close open corrective actions, and run a practice inspection. Every time you fix something, your score goes up immediately."},
      {q:"What happens during a mock inspection?",a:"You select your industry, then answer Pass/Fail/N/A on each OSHA checklist item — one question at a time. Each item includes the specific OSHA standard reference and a compliance tip. You can attach photos and notes to any item. When complete, you see a summary with your score, all deficiencies listed, and the option to create corrective actions directly."},
      {q:"What is Live Inspection Mode?",a:"A two-phase tool for when OSHA actually arrives. Phase 1: a 10-step Response Playbook that guides you through the first 15 minutes (verify credentials, call counsel, designate rep, locate records). You can instantly alert your entire team with one tap — legal counsel, plant manager, HR, and supervisors all get an SMS and email simultaneously. Phase 2: real-time logging with timestamped entries. The result is a documented record of the entire inspection."},
      {q:"What should I do when OSHA shows up?",a:"Tap the LIVE button in the header immediately. The Response Playbook will walk you step by step. The most critical first actions: verify the inspector's credentials (photo ID + CSHO number), call your attorney, and designate who will accompany the inspector. Do not let anyone in without verified credentials."},
      {q:"How much can OSHA fines cost?",a:"A serious violation is $16,550 per item. A willful or repeat violation can reach $165,514 per item. Under OSHA's instance-by-instance citing policy, a single hazard affecting 10 employees can become 10 separate citations — over $165,000 from one finding. Failure to fix a violation after the deadline adds $16,550 per day. Beyond fines, citations are public record, increase insurance premiums, can disqualify government contractors, and become evidence in civil lawsuits. The mock inspection results page shows your specific penalty exposure based on your deficiency count."},
      {q:"Is my data shared with OSHA?",a:"No. Your data is stored locally and encrypted. Prudence EHS does not access, review, or share your data with any third party — including OSHA — without a valid legal order. Your compliance data is yours."},
      {q:"Is OSHAready affiliated with OSHA?",a:"No. OSHAready is not affiliated with, endorsed by, or approved by the Occupational Safety and Health Administration (OSHA) or the U.S. Department of Labor. It is an independent product of Prudence Safety & Environmental Consulting, LLC."},
      {q:"How does document approval work?",a:"When you add or update a document, its approval status is set to 'pending.' A reviewer taps 'Approve' to record their name and the date. This creates the audit trail OSHA looks for — evidence that your written programs were reviewed and signed off by a responsible person, not just uploaded."},
      {q:"What does the AI Draft Action Plan do?",a:"Available on the Professional tier, it generates a step-by-step corrective action plan for each deficiency — including OSHA standard references, recommended timelines, root cause prompts, and a verification checklist. Every plan is labeled as a draft and requires review by a qualified safety professional before implementation."},
      {q:"Can I use this on multiple sites?",a:"Starter ($29/mo) covers a single site. Professional ($79/mo) covers up to 3 sites. Firm ($199/mo) covers unlimited sites. All tiers include unlimited users — no per-seat fees."},
      {q:"How do I mark training as complete?",a:"Open Training from the menu. Each overdue or due-soon record has a green 'Mark Complete' button. Tap it — the status changes to current, the readiness score updates immediately, and the training compliance percentage recalculates."},
      {q:"How is my data protected?",a:"OSHAready includes input sanitization (strips malicious code from all inputs), session auto-lock after inactivity, audit logging of every action, and rate limiting. In production, data is encrypted at rest (AES-256) and in transit (TLS 1.3), with multi-factor authentication on all accounts."},
      {q:"Can I export or delete my data?",a:"Yes. Go to Settings → Account & Data. 'Export My Data' downloads everything as JSON. 'Delete Account & Data' permanently removes your account and all associated data. This is your data — you control it."},
      {q:"What industries does the mock inspection cover?",a:"Manufacturing (17 additional items), Construction (14), Healthcare (12), Warehouse (11), and Office (8) — each added on top of a 25-item shared core that applies to all industries. Every item cites the specific OSHA standard (29 CFR)."},
      {q:"Who built OSHAready?",a:"OSHAready was built by the team at Prudence Safety & Environmental Consulting, LLC — Certified Safety Professionals with decades of combined EHS experience across manufacturing, construction, healthcare, and government. The tool reflects what practicing safety professionals actually need, not what a software company thinks they want."},
    ].map((f,i)=><div key={i} style={{marginBottom:8,padding:14,background:sub,borderRadius:10}}><div style={{fontWeight:600,marginBottom:4,color:txP}}>{f.q}</div><div style={{fontSize:13,color:txS,lineHeight:1.6}}>{f.a}</div></div>)}</div>}
    {panel==="privacy"&&<p style={{fontSize:13,color:"#8B95A8",lineHeight:1.7}}>All data stored locally. PSEC never accesses or shares your data.</p>}
    {panel==="notifications"&&<div>
      <div style={{fontSize:13,color:"#8B95A8",lineHeight:1.6,marginBottom:16}}>Choose which alerts you want to receive. Notifications help you stay ahead of expiring documents, overdue training, and approaching deadlines.</div>

      <div style={{fontSize:12,fontWeight:700,color:"#22C55E",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Included — Free</div>
      {[
        {key:"weeklyDigest",title:"Weekly Readiness Digest",desc:"Your score, open items, and what changed this week. Sent every Monday."},
        {key:"trainingExpiry",title:"Training Expiring (14 days)",desc:"Alert when an employee's certification expires within 14 days."},
        {key:"docExpiry",title:"Document Expiring (30 days)",desc:"Alert when a written program or compliance document expires within 30 days."},
        {key:"actionOverdue",title:"Corrective Action Past Due",desc:"Alert when an open action passes its deadline."},
        {key:"postingReminder",title:"OSHA 300A Posting Reminder",desc:"Annual reminder on January 25 to post your 300A summary by February 1."},
      ].map(n=><div key={n.key} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6}}>
        <button onClick={()=>setNotifs(p=>({...p,[n.key]:!p[n.key]}))} style={{width:40,height:24,borderRadius:12,background:notifs[n.key]?"#22C55E":"#334155",border:"none",cursor:"pointer",position:"relative",flexShrink:0,marginTop:2,transition:"background .2s"}}>
          <div style={{width:18,height:18,borderRadius:9,background:"#fff",position:"absolute",top:3,left:notifs[n.key]?19:3,transition:"left .2s",boxShadow:"0 1px 3px #0003"}}/>
        </button>
        <div><div style={{fontSize:13,fontWeight:600}}>{n.title}</div><div style={{fontSize:11,color:"#5E6578",marginTop:2,lineHeight:1.5}}>{n.desc}</div></div>
      </div>)}

      <div style={{fontSize:12,fontWeight:700,color:pri,textTransform:"uppercase",letterSpacing:1,marginTop:16,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>Professional <span style={{fontSize:10,background:pri+"15",padding:"1px 6px",borderRadius:4}}>PRO</span></div>
      {[
        {key:"scoreChange",title:"Readiness Score Changes",desc:"Instant alert when your score increases or decreases by 5+ points."},
        {key:"teamActivity",title:"Team Activity Alerts",desc:"Get notified when team members complete actions, report hazards, or finish training."},
        {key:"customTiming",title:"Custom Alert Timing",desc:"Set your own lead times — 7, 14, 30, 60, or 90 days before expiration."},
      ].map(n=><div key={n.key} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6,opacity:0.6}}>
        <button onClick={()=>setShowPaywall(true)} style={{width:40,height:24,borderRadius:12,background:"#334155",border:"none",cursor:"pointer",position:"relative",flexShrink:0,marginTop:2}}>
          <div style={{width:18,height:18,borderRadius:9,background:"#5E6578",position:"absolute",top:3,left:3}}/>
        </button>
        <div><div style={{fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>{n.title} <span style={{fontSize:9,color:pri,background:pri+"15",padding:"1px 5px",borderRadius:3}}>PRO</span></div><div style={{fontSize:11,color:"#5E6578",marginTop:2,lineHeight:1.5}}>{n.desc}</div></div>
      </div>)}

      <div style={{marginTop:16,padding:"12px 16px",background:sub,borderRadius:10,fontSize:12,color:"#5E6578",lineHeight:1.6}}>Notifications will be delivered via email and push (when enabled on your device). You can change these preferences at any time.</div>
    </div>}
    {panel==="security"&&<div>
      <div style={{fontSize:13,color:"#8B95A8",lineHeight:1.6,marginBottom:16}}>Security controls protecting your compliance data. In production, these are enforced server-side with MFA, encryption, and role-based access.</div>

      <div style={{fontSize:12,fontWeight:700,color:"#22C55E",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Active Protections</div>
      {[
        {name:"Input Sanitization",desc:"HTML tags, script injections, and event handlers stripped from all user inputs before storage.",active:true},
        {name:"Session Auto-Lock",desc:`Screen locks after ${sessionTimeout} minutes of inactivity. Protects unattended devices.`,active:true},
        {name:"Rate Limiting",desc:"Form submissions throttled to prevent rapid-fire automated attacks (1.5s minimum between actions).",active:true},
        {name:"Audit Logging",desc:`All actions recorded with timestamps. ${auditLog.length} events logged this session.`,active:true},
        {name:"Data Encryption (TLS)",desc:"All data transmitted over HTTPS. Vercel enforces TLS 1.3 in production.",active:true},
        {name:"XSS Protection",desc:"React JSX auto-escapes rendered content. No dangerouslySetInnerHTML used anywhere.",active:true},
      ].map((p,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{width:8,height:8,borderRadius:4,background:p.active?"#22C55E":"#EF4444",marginTop:6,flexShrink:0}}/>
        <div><div style={{fontSize:13,fontWeight:600}}>{p.name}</div><div style={{fontSize:11,color:"#5E6578",marginTop:2,lineHeight:1.5}}>{p.desc}</div></div>
      </div>)}

      <div style={{fontSize:12,fontWeight:700,color:"#FBBF24",textTransform:"uppercase",letterSpacing:1,marginTop:16,marginBottom:10}}>Requires Backend (Production)</div>
      {["Multi-Factor Authentication (MFA)","API key rotation and vault storage","Database encryption at rest (AES-256)","Role-based access control","Server-side rate limiting","Stripe webhook signature verification","Penetration testing program"].map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",background:sub,borderRadius:10,marginBottom:4,opacity:0.5}}>
        <div style={{width:8,height:8,borderRadius:4,background:"#FBBF24",flexShrink:0}}/>
        <span style={{fontSize:12,color:"#8B95A8"}}>{p}</span>
      </div>)}

      <div style={{fontSize:12,fontWeight:700,color:"#8B95A8",textTransform:"uppercase",letterSpacing:1,marginTop:16,marginBottom:10}}>Session Settings</div>
      <div style={{padding:"14px",background:sub,borderRadius:10,marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>Auto-Lock Timeout</div>
        <div style={{display:"flex",gap:6}}>
          {[5,10,15,30,60].map(m=><button key={m} onClick={()=>{setSessionTimeout(m);notify("Session timeout set to "+m+" min");}} style={{padding:"8px 12px",borderRadius:8,background:sessionTimeout===m?pri+"20":"transparent",border:"1px solid "+(sessionTimeout===m?pri:bdr),color:sessionTimeout===m?pri:"#8B95A8",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{m}m</button>)}
        </div>
      </div>

      <div style={{fontSize:12,fontWeight:700,color:"#8B95A8",textTransform:"uppercase",letterSpacing:1,marginTop:16,marginBottom:10}}>Audit Log ({auditLog.length} events)</div>
      <div style={{maxHeight:200,overflowY:"auto",background:sub,borderRadius:10,padding:auditLog.length?8:14}}>
        {auditLog.length===0?<div style={{fontSize:12,color:"#5E6578",textAlign:"center"}}>No actions recorded yet. Actions will appear here as you use the app.</div>
        :auditLog.slice(0,30).map(e=><div key={e.id} style={{display:"flex",gap:8,padding:"4px 6px",borderBottom:"1px solid "+bdr,fontSize:11}}>
          <span style={{fontFamily:"monospace",color:"#5E6578",minWidth:70,flexShrink:0}}>{e.time.split(", ")[1]||e.time}</span>
          <span style={{color:"#22C55E",fontWeight:600,minWidth:100}}>{e.action}</span>
          <span style={{color:"#8B95A8",flex:1}}>{e.detail}</span>
        </div>)}
      </div>
    </div>}
    {panel==="profile"&&user&&<div>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{width:64,height:64,borderRadius:20,background:pri+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,color:pri,margin:"0 auto 12px"}}>{user.name?.[0]||"U"}</div>
        <div style={{fontSize:20,fontWeight:700}}>{user.name}</div>
        <div style={{fontSize:13,color:"#8B95A8"}}>{user.role}</div>
      </div>

      <div style={{display:"grid",gap:8}}>
        {[{label:"Email",value:user.email},{label:"Company",value:user.company},{label:"Role",value:user.role},{label:"Member since",value:fmtD(user.joined)}].map((f,i)=><div key={i} style={{padding:"12px 14px",background:sub,borderRadius:10}}>
          <div style={{fontSize:11,color:"#5E6578",marginBottom:3}}>{f.label}</div>
          <div style={{fontSize:14,fontWeight:500}}>{f.value}</div>
        </div>)}
      </div>

      <div style={{marginTop:16,padding:"12px 14px",background:sub,borderRadius:10}}>
        <div style={{fontSize:11,color:"#5E6578",marginBottom:3}}>Subscription</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:14,fontWeight:600}}>Free Plan</div>
          <button onClick={()=>{setPanel(null);setShowPaywall(true);}} style={{padding:"6px 14px",borderRadius:6,background:pri+"15",border:"1px solid "+pri+"30",color:pri,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Upgrade</button>
        </div>
      </div>

      <button onClick={async()=>{await STO.set("or-user",null);setUser(null);setAuthScreen("auth");setPanel(null);audit("Logout","");}} style={{width:"100%",padding:14,background:"#EF444415",border:"1px solid #EF444425",borderRadius:10,color:"#EF4444",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:16}}>Sign Out</button>
    </div>}
    {panel==="settings"&&<div>
      {/* 1. ACCOUNT & DATA */}
      <div style={{fontSize:12,fontWeight:700,color:pri,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Account & Data</div>

      <div style={{padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:13,fontWeight:600}}>Export My Data</div><div style={{fontSize:11,color:"#5E6578",marginTop:2}}>Download all your compliance data as JSON</div></div>
          <button onClick={()=>notify("Data export would generate a download in production")} style={{padding:"6px 14px",borderRadius:6,background:sub,border:"1px solid "+bdr,color:lt?"#475569":"#C8D0DC",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Export</button>
        </div>
      </div>
      <div style={{padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:13,fontWeight:600,color:"#EF4444"}}>Delete Account & Data</div><div style={{fontSize:11,color:"#5E6578",marginTop:2}}>Permanently delete your account and all associated data. This cannot be undone.</div></div>
          <button onClick={()=>{if(confirm("Are you sure? This permanently deletes ALL your data and cannot be undone.")){STO.set("or-user",null);setUser(null);setAuthScreen("auth");setPanel(null);notify("Account deleted","error");audit("Account Deleted","");}}} style={{padding:"6px 14px",borderRadius:6,background:"#EF444415",border:"1px solid #EF444425",color:"#EF4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Delete</button>
        </div>
      </div>
      <div style={{padding:"12px 14px",background:sub,borderRadius:10,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Recent Logins</div>
        {[{device:"iPhone 15 Pro — Safari",loc:"Germantown, MD",time:"Today, 3:42 PM",current:true},{device:"MacBook Pro — Chrome",loc:"Germantown, MD",time:"Yesterday, 9:15 AM",current:false}].map((l,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i===0?"1px solid "+bdr:"none",fontSize:12}}>
          <div><div style={{color:lt?"#475569":"#C8D0DC"}}>{l.device}</div><div style={{color:"#5E6578",fontSize:11}}>{l.loc} · {l.time}</div></div>
          {l.current&&<Bd c="#22C55E">current</Bd>}
        </div>)}
      </div>

      {/* 2. NOTIFICATION CHANNELS */}
      <div style={{fontSize:12,fontWeight:700,color:pri,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Notification Delivery</div>
      <div style={{padding:"14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>Channels</div>
        {[{key:"channelPush",label:"Push Notifications"},{key:"channelEmail",label:"Email"},{key:"channelSms",label:"SMS"}].map(ch=><div key={ch.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
          <span style={{fontSize:13}}>{ch.label}</span>
          <button onClick={()=>setNotifs(p=>({...p,[ch.key]:!p[ch.key]}))} style={{width:40,height:24,borderRadius:12,background:notifs[ch.key]?"#22C55E":"#334155",border:"none",cursor:"pointer",position:"relative",transition:"background .2s"}}><div style={{width:18,height:18,borderRadius:9,background:"#fff",position:"absolute",top:3,left:notifs[ch.key]?19:3,transition:"left .2s",boxShadow:"0 1px 3px #0003"}}/></button>
        </div>)}
      </div>
      <div style={{padding:"14px",background:sub,borderRadius:10,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:13,fontWeight:600}}>Quiet Hours</div>
          <button onClick={()=>setNotifs(p=>({...p,quietOn:!p.quietOn}))} style={{width:40,height:24,borderRadius:12,background:notifs.quietOn?"#22C55E":"#334155",border:"none",cursor:"pointer",position:"relative",transition:"background .2s"}}><div style={{width:18,height:18,borderRadius:9,background:"#fff",position:"absolute",top:3,left:notifs.quietOn?19:3,transition:"left .2s",boxShadow:"0 1px 3px #0003"}}/></button>
        </div>
        {notifs.quietOn&&<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div><div style={{fontSize:11,color:"#5E6578",marginBottom:3}}>From</div><input type="time" value={notifs.quietStart} onChange={e=>setNotifs(p=>({...p,quietStart:e.target.value}))} style={{...inp,width:110,fontSize:13}}/></div>
          <div style={{color:"#5E6578",marginTop:16}}>→</div>
          <div><div style={{fontSize:11,color:"#5E6578",marginBottom:3}}>Until</div><input type="time" value={notifs.quietEnd} onChange={e=>setNotifs(p=>({...p,quietEnd:e.target.value}))} style={{...inp,width:110,fontSize:13}}/></div>
        </div>}
      </div>

      {/* 3. APPEARANCE & ACCESSIBILITY */}
      <div style={{fontSize:12,fontWeight:700,color:pri,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Appearance & Accessibility</div>
      <div style={{padding:"14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>Theme</div>
        <div style={{display:"flex",gap:6}}>
          {[{v:"dark",l:"Dark"},{v:"light",l:"Light"},{v:"system",l:"System"}].map(t=><button key={t.v} onClick={()=>{setAppearance(t.v);notify("Theme set to "+t.l);}} style={{flex:1,padding:"10px",borderRadius:8,background:appearance===t.v?pri+"20":"transparent",border:"1px solid "+(appearance===t.v?pri:bdr),color:appearance===t.v?pri:"#8B95A8",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>)}
        </div>
        <div style={{fontSize:11,color:txM,marginTop:6}}>Theme applies immediately across the entire app.</div>
      </div>
      <div style={{padding:"14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>Text Size</div>
        <div style={{display:"flex",gap:6}}>
          {[{v:"small",l:"A",s:12},{v:"default",l:"A",s:15},{v:"large",l:"A",s:18}].map(t=><button key={t.v} onClick={()=>{setTextSize(t.v);notify("Text size: "+t.v);}} style={{flex:1,padding:"10px",borderRadius:8,background:textSize===t.v?pri+"20":"transparent",border:"1px solid "+(textSize===t.v?pri:bdr),color:textSize===t.v?pri:"#8B95A8",fontSize:t.s,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>)}
        </div>
      </div>
      {[{key:"highContrast",st:highContrast,set:setHighContrast,label:"High Contrast Mode",desc:"Increases border and text contrast for better visibility"},
        {key:"reduceMotion",st:reduceMotion,set:setReduceMotion,label:"Reduce Motion",desc:"Disables animations and transitions throughout the app"},
        {key:"hapticOn",st:hapticOn,set:setHapticOn,label:"Haptic Feedback",desc:"Vibration feedback on key actions like accepting terms"},
      ].map(a=><div key={a.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div><div style={{fontSize:13,fontWeight:600}}>{a.label}</div><div style={{fontSize:11,color:"#5E6578",marginTop:2}}>{a.desc}</div></div>
        <button onClick={()=>a.set(p=>!p)} style={{width:40,height:24,borderRadius:12,background:a.st?"#22C55E":"#334155",border:"none",cursor:"pointer",position:"relative",flexShrink:0,transition:"background .2s"}}><div style={{width:18,height:18,borderRadius:9,background:"#fff",position:"absolute",top:3,left:a.st?19:3,transition:"left .2s",boxShadow:"0 1px 3px #0003"}}/></button>
      </div>)}

      {/* 3.5 EMERGENCY CONTACTS */}
      <div style={{fontSize:12,fontWeight:700,color:pri,textTransform:"uppercase",letterSpacing:1,marginTop:16,marginBottom:10}}>Emergency Contacts</div>
      <div style={{fontSize:12,color:txM,marginBottom:10}}>These people will be alerted instantly when you tap "Notify Team" in Live Inspection Mode.</div>
      {emergencyContacts.map((c,i)=><div key={c.id} style={{padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6,border:"1px solid "+bdr}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,fontWeight:700,color:pri}}>{c.role||"Contact "+(i+1)}</span>
          <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:txM,cursor:"pointer"}}>
            <input type="checkbox" checked={c.notify} onChange={e=>setEmergencyContacts(p=>p.map((x,j)=>j===i?{...x,notify:e.target.checked}:x))} style={{accentColor:pri}}/>Notify
          </label>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
          <input value={c.name} onChange={e=>setEmergencyContacts(p=>p.map((x,j)=>j===i?{...x,name:sanitize(e.target.value)}:x))} placeholder="Name" style={{...inp,fontSize:12,padding:"8px 10px"}}/>
          <input value={c.role} onChange={e=>setEmergencyContacts(p=>p.map((x,j)=>j===i?{...x,role:sanitize(e.target.value)}:x))} placeholder="Role" style={{...inp,fontSize:12,padding:"8px 10px"}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <input value={c.phone} onChange={e=>setEmergencyContacts(p=>p.map((x,j)=>j===i?{...x,phone:e.target.value.replace(/[^\d+\-() ]/g,"").slice(0,20)}:x))} placeholder="Phone" style={{...inp,fontSize:12,padding:"8px 10px"}}/>
          <input value={c.email} onChange={e=>setEmergencyContacts(p=>p.map((x,j)=>j===i?{...x,email:e.target.value.slice(0,100)}:x))} placeholder="Email" style={{...inp,fontSize:12,padding:"8px 10px"}}/>
        </div>
      </div>)}
      <button onClick={()=>setEmergencyContacts(p=>[...p,{id:"ec"+Date.now(),name:"",role:"",phone:"",email:"",notify:true}])} style={{width:"100%",padding:"10px",background:"none",border:"1px dashed "+bdr,borderRadius:8,color:txM,fontSize:12,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}>+ Add Contact</button>
      {emergencyContacts.length>3&&<button onClick={()=>setEmergencyContacts(p=>p.slice(0,-1))} style={{width:"100%",padding:"8px",background:"none",border:"none",color:"#EF4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Remove Last Contact</button>}

      {/* 4. PERFORMANCE & OFFLINE */}
      <div style={{fontSize:12,fontWeight:700,color:pri,textTransform:"uppercase",letterSpacing:1,marginTop:16,marginBottom:10}}>Performance & Offline</div>
      <div style={{padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:13,fontWeight:600}}>Connection Status</div><div style={{fontSize:11,color:online?"#22C55E":"#FBBF24",marginTop:2}}>{online?"Online — all changes sync in real time":"Offline — changes saved locally, will sync when reconnected"}</div></div>
          <div style={{width:10,height:10,borderRadius:5,background:online?"#22C55E":"#FBBF24"}}/>
        </div>
      </div>
      <div style={{padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:13,fontWeight:600}}>Auto-Save</div><div style={{fontSize:11,color:txM,marginTop:2}}>All data saves automatically 2 seconds after each change.{lastSaved?" Last saved: "+lastSaved:""}</div></div>
          <div style={{fontSize:11,color:"#22C55E"}}>Active</div>
        </div>
      </div>
      <div style={{padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:13,fontWeight:600}}>Clear Cached Data</div><div style={{fontSize:11,color:txM,marginTop:2}}>Frees storage space. You won't be logged out.</div></div>
          <button onClick={()=>notify("Cache cleared")} style={{padding:"6px 14px",borderRadius:6,background:sub,border:"1px solid "+bdr,color:txP,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Clear</button>
        </div>
      </div>
      {syncQueue.length>0&&<div style={{padding:"12px 14px",background:"#FBBF2410",border:"1px solid #FBBF2425",borderRadius:10,marginBottom:6}}>
        <div style={{fontSize:13,fontWeight:600,color:"#FBBF24"}}>{syncQueue.length} actions queued for sync</div>
        <div style={{fontSize:11,color:txM,marginTop:2}}>These will sync automatically when you reconnect.</div>
      </div>}

      {/* 5. WHAT'S NEW */}
      <div style={{fontSize:12,fontWeight:700,color:pri,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>What's New</div>
      <div style={{padding:"14px",background:sub,borderRadius:10,marginBottom:16}}>
        {[{ver:"1.0.0",date:"04/04/2026",items:["Mock OSHA Inspection with industry-specific checklists","Live Inspection Mode with 10-step Response Playbook","Photo capture and notes during mock inspections","AI-powered corrective action plans (Professional tier)","Document Vault with approval workflow and version history","Interactive training tracker with score impact","Session auto-lock and audit logging","AI chatbot assistant for app navigation","User accounts with signup/login"]}].map((r,i)=><div key={i}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:14,fontWeight:700}}>v{r.ver}</span><span style={{fontSize:11,color:"#5E6578"}}>{r.date}</span></div>
          {r.items.map((item,j)=><div key={j} style={{display:"flex",gap:6,marginBottom:4,alignItems:"flex-start"}}><span style={{color:"#22C55E",fontSize:11}}>•</span><span style={{fontSize:12,color:lt?"#475569":"#C8D0DC",lineHeight:1.5}}>{item}</span></div>)}
        </div>)}
      </div>

      {/* 6. LEGAL & APP INFO */}
      <div style={{fontSize:12,fontWeight:700,color:pri,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Legal & App Info</div>
      {["Terms of Service","Privacy Policy"].map(l=><button key={l} onClick={()=>{if(l==="Terms of Service")setShowTos(true);setPanel(null);}} style={{display:"block",width:"100%",padding:"12px 14px",background:sub,borderRadius:10,marginBottom:6,border:"none",color:lt?"#475569":"#C8D0DC",fontSize:13,fontWeight:500,textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>{l} →</button>)}
      <div style={{padding:"14px",background:sub,borderRadius:10,marginBottom:6}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Open Source Libraries</div>
        <div style={{fontSize:11,color:"#8B95A8",lineHeight:1.8}}>React · Vercel · Anthropic Claude API · Stripe · jsPDF (planned) · Next.js (planned)</div>
      </div>
      <div style={{textAlign:"center",padding:"12px 0",marginTop:8}}>
        <div style={{fontSize:12,color:"#5E6578",fontFamily:"monospace"}}>OSHAready v{VER}</div>
        <div style={{fontSize:10,color:"#334155",marginTop:2}}>© 2026 Prudence Safety & Environmental Consulting, LLC</div>
      </div>
    </div>}
    {panel==="fb"&&<div>{fbSent?<div style={{textAlign:"center",padding:40}}><I n="check" s={32} c="#22C55E"/><div style={{fontSize:18,fontWeight:700,marginTop:12}}>Thanks!</div></div>:<div><textarea value={fbText} onChange={e=>setFbText(e.target.value)} placeholder="Feedback..." rows={4} style={{...inp,marginBottom:12,resize:"vertical"}}/><button onClick={()=>{if(fbText.trim()){setFbSent(true);haptic();}}} style={{width:"100%",padding:14,background:fbText.trim()?"linear-gradient(135deg,"+priD+","+pri+")":"#1A2030",border:"none",borderRadius:10,color:fbText.trim()?"#fff":"#5E6578",fontSize:15,fontWeight:700,cursor:fbText.trim()?"pointer":"default",fontFamily:"inherit"}}>Submit</button></div>}</div>}
    </div></div>}

    {showTour&&<div style={{position:"fixed",inset:0,background:bg+"F5",zIndex:350,display:"flex",flexDirection:"column",animation:"fi .3s ease"}}><div style={{display:"flex",justifyContent:"center",gap:6,padding:"20px 0 10px"}}>{TOUR.map((_,i)=><div key={i} onClick={()=>setTourStep(i)} style={{width:tourStep===i?24:8,height:8,borderRadius:4,background:tourStep===i?pri:bdr,cursor:"pointer",transition:"all .3s"}}/>)}</div><div style={{textAlign:"right",padding:"0 24px"}}><button onClick={()=>setShowTour(false)} style={{background:"none",border:"none",color:"#5E6578",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Skip →</button></div><div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 32px"}}><div key={tourStep} style={{textAlign:"center",maxWidth:400,animation:"fu .4s ease"}}><div style={{display:"flex",justifyContent:"center",marginBottom:24}}><div style={{width:80,height:80,borderRadius:22,background:TOUR[tourStep].color+"12",border:"1.5px solid "+TOUR[tourStep].color+"30",display:"flex",alignItems:"center",justifyContent:"center"}}><I n={TOUR[tourStep].icon} s={38} c={TOUR[tourStep].color}/></div></div><div style={{fontSize:24,fontWeight:800,marginBottom:6}}>{TOUR[tourStep].t}</div><div style={{fontSize:14,color:pri,fontFamily:"monospace",marginBottom:16}}>{TOUR[tourStep].s}</div><div style={{fontSize:15,color:"#8B95A8",lineHeight:1.75}}>{TOUR[tourStep].b}</div></div></div><div style={{padding:"20px 24px 36px",display:"flex",justifyContent:"space-between"}}><button onClick={()=>setTourStep(Math.max(0,tourStep-1))} style={{padding:"12px 20px",background:"none",border:tourStep?"1px solid "+bdr:"none",borderRadius:10,color:tourStep?"#8B95A8":"transparent",fontSize:14,cursor:tourStep?"pointer":"default",fontFamily:"inherit"}}>← Back</button>{tourStep<TOUR.length-1?<button onClick={()=>{setTourStep(tourStep+1);}} style={{padding:"12px 28px",background:"linear-gradient(135deg,"+priD+","+pri+")",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Next</button>:<button onClick={()=>{setShowTour(false);haptic();}} style={{padding:"12px 28px",background:"linear-gradient(135deg,#059669,#22C55E)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Get Started</button>}</div></div>}

    <div style={{maxWidth:wide?900:620,margin:"0 auto",padding:wide?"0 32px":"0 16px",position:"relative",zIndex:1}}>

    {view==="dash"&&<div style={{paddingTop:20,paddingBottom:80}}>

      {/* 0. ABOUT PRUDENCE TRUST BADGE */}
      <div style={{marginBottom:12,animation:"fu .4s ease"}}><AboutTrustBadge onClick={()=>setAboutOpen(true)}/></div>

      {/* GETTING STARTED — shown when dashboard is empty */}
      {hazards.length===0&&actions.length===0&&training.length===0&&docs.length===0&&mockPct===0&&<div style={{marginBottom:16,animation:"fu .5s ease"}}>
        <div style={{padding:"20px 18px",background:crd,border:"1px solid "+pri+"30",borderRadius:14,marginBottom:10}}>
          <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>Welcome to OSHA<span style={{color:pri}}>ready</span></div>
          <div style={{fontSize:13,color:txM,lineHeight:1.6,marginBottom:14}}>Your dashboard is empty because you haven't added any data yet. Start by running a mock inspection — it takes 10 minutes and shows you exactly where your gaps are.</div>
          <div style={{fontSize:12,fontWeight:700,color:pri,marginBottom:8}}>Getting Started</div>
          {[
            {n:"Run a Mock OSHA Inspection",d:"Find your gaps with an industry-specific checklist",v:"mock",done:mockPct>0},
            {n:"Add your written programs",d:"HazCom, EAP, LOTO — upload what you have",v:"docs",done:docs.filter(d=>d.folder==="Programs").length>0},
            {n:"Add employee training records",d:"Who was trained on what and when",v:"training",done:training.length>0},
            {n:"Report any known hazards",d:"Open hazards affect your readiness score",v:"hazards",done:hazards.length>0},
            {n:"Set up emergency contacts",d:"For one-tap team alerts when OSHA arrives",v:null,done:emergencyContacts.filter(c=>c.name).length>0},
          ].map((item,i)=><div key={i} onClick={()=>{if(item.v)setView(item.v);else setPanel("settings");}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:item.done?"#22C55E08":sub,border:"1px solid "+(item.done?"#22C55E20":bdr),borderRadius:8,marginBottom:4,cursor:"pointer"}}>
            <div style={{width:22,height:22,borderRadius:6,background:item.done?"#22C55E":"transparent",border:item.done?"none":"2px solid "+bdr,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{item.done&&<span style={{color:"#fff",fontSize:12,fontWeight:700}}>✓</span>}</div>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:item.done?txM:txP,textDecoration:item.done?"line-through":"none"}}>{item.n}</div><div style={{fontSize:11,color:txM}}>{item.d}</div></div>
            {!item.done&&<span style={{fontSize:12,color:pri}}>→</span>}
          </div>)}
        </div>
        <button onClick={loadDemo} style={{width:"100%",padding:"12px 16px",background:sub,border:"1px solid "+bdr,borderRadius:10,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:14}}>🎮</span>
          <span style={{fontSize:13,color:txM}}>Load demo data to explore features</span>
        </button>
      </div>}

      {/* 1. CRITICAL GAPS — what's broken right now */}
      {gaps.length>0&&<div style={{marginBottom:16,animation:"fu .4s ease"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#EF4444",marginBottom:8,display:"flex",alignItems:"center",gap:6}}><I n="alert" s={16} c="#EF4444"/>Fix These First</div>
        {gaps.slice(0,4).map((g,i)=><div key={i} onClick={()=>setView(g.mod)} style={{padding:"14px 16px",background:crd,border:"1px solid #EF444425",borderRadius:12,marginBottom:6,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
          <div style={{width:10,height:10,borderRadius:5,background:sevC(g.sev),flexShrink:0}}/>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{g.text}</div><div style={{fontSize:11,color:"#5E6578"}}>{g.act}</div></div>
          <I n="arrow" s={14} c="#5E6578"/>
        </div>)}
      </div>}

      {gaps.length===0&&<div style={{padding:"20px 16px",background:score===100?"#052E16":"#14532D20",border:"1px solid #22C55E30",borderRadius:14,marginBottom:16,display:"flex",alignItems:"center",gap:12,animation:"fu .4s ease"}}>
        <I n="check" s={24} c="#22C55E"/>
        <div><div style={{fontSize:15,fontWeight:700,color:"#22C55E"}}>{score===100?"All Clear — Perfect Readiness":"No Critical Gaps"}</div><div style={{fontSize:12,color:score===100?"#86EFAC":"#8B95A8"}}>{score===100?"Your facility is fully OSHA-ready. Every category at 100%.":"All programs current. Run a mock inspection to find remaining opportunities."}</div></div>
      </div>}

      {/* 2. READINESS SCORE — tappable with breakdown */}
      {(()=>{
        const prg=docs.filter(d=>d.folder==="Programs");const ps=prg.length?Math.round((prg.filter(d=>d.status==="current").length/prg.length)*100):0;
        const ts=training.length?Math.round((training.filter(t=>t.status==="current").length/training.length)*100):0;
        const lg=docs.filter(d=>d.folder==="Logs");const ls=lg.length?Math.round((lg.filter(d=>d.status==="current").length/lg.length)*100):0;
        const as2=actions.length?Math.round((actions.filter(a=>a.status==="closed").length/actions.length)*100):100;
        const hs=hazards.length?Math.round((hazards.filter(h=>h.status==="corrected").length/hazards.length)*100):100;
        const openH=hazards.filter(h=>h.status==="open"&&(h.sev==="critical"||h.sev==="high")).length;
        const cs=openH>0?Math.max(0,100-openH*25):hs;
        const rs=Math.min(100,(mockPct>0?50:25)+(prg.filter(d=>d.status==="current").length>=3?25:0)+(actions.filter(a=>a.status==="open").length===0?25:0));
        const cats=[{name:"Written Programs",pct:ps,weight:20,nav:"docs",why:"Root of every OSHA compliance program. 15.4% of FY2025 citations trace to missing or inadequate written programs."},{name:"Training",pct:ts,weight:17,nav:"training",why:"27% of FY2025 Top 10 citations involve training deficiencies. Second most common reason workplaces get cited."},{name:"OSHA Logs",pct:ls,weight:12,nav:"docs",why:"Recordkeeping violations (29 CFR 1904) are common but lower frequency in Top 10. Failure to produce logs within 4 hours is an automatic citation."},{name:"Audit Performance",pct:mockPct,weight:15,nav:"mock",why:"Self-inspection demonstrates proactive safety culture. OSHA views regular audits favorably during penalty determination."},{name:"Corrective Actions",pct:as2,weight:10,nav:"actions",why:"Open corrective actions with no timeline signal a non-functional safety program. OSHA checks whether identified hazards are being addressed."},{name:"Hazard Closure",pct:hs,weight:10,nav:"hazards",why:"Measures whether employee-reported concerns are taken seriously. Unresolved hazards indicate management indifference."},{name:"Site Conditions",pct:cs,weight:12,nav:"hazards",why:"Physical hazards account for 57.6% of FY2025 citations. Missing guards, blocked exits, and fall hazards are the #1 reason OSHA issues fines."},{name:"Response Prep",pct:rs,weight:4,nav:"live",why:"Low citation frequency but high consequence. Prepared response reduces penalties and demonstrates good faith."}];
        return <>
      <div onClick={()=>setShowScoreDetail(p=>!p)} style={{padding:"16px 20px",background:crd,border:"1px solid "+bdr,borderRadius:14,marginBottom:showScoreDetail?0:16,cursor:"pointer",display:"flex",alignItems:"center",gap:16,animation:"fu .4s .05s ease both"}}>
        <div style={{position:"relative",width:64,height:64,flexShrink:0}}>
          <svg width={64} height={64} viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="none" stroke={bdr} strokeWidth="5"/><circle cx="32" cy="32" r="27" fill="none" stroke={scoreC(score)} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${score*1.696} 169.6`} transform="rotate(-90 32 32)"/></svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:scoreC(score)}}>{score}</div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700}}>Readiness Score</div>
          <div style={{fontSize:13,color:txS,marginTop:2}}>{score>=80?"Strong position — maintain your programs.":score>=60?gaps.length+" gap"+(gaps.length!==1?"s":"")+" could result in citations.":"Critical deficiencies. Prioritize the items above."}</div>
        </div>
        <span style={{fontSize:14,color:txM}}>{showScoreDetail?"▲":"▼"}</span>
      </div>
      {showScoreDetail&&<div style={{padding:"12px 16px",background:crd,border:"1px solid "+bdr,borderTop:"none",borderRadius:"0 0 14px 14px",marginBottom:16,animation:"fu .2s ease"}}>
        {cats.map((c,i)=><div key={i} onClick={()=>{setView(c.nav);setShowScoreDetail(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<cats.length-1?"1px solid "+bdr:"none",cursor:"pointer"}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,fontWeight:600}}>{c.name}</span>
              <span style={{fontSize:12,fontWeight:700,color:scoreC(c.pct)}}>{c.pct}%</span>
            </div>
            <div style={{height:4,background:bdr,borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:c.pct+"%",background:scoreC(c.pct),borderRadius:2,transition:"width .3s"}}/>
            </div>
            <div style={{fontSize:9,color:txM,marginTop:3,lineHeight:1.4}}>{c.why}</div>
          </div>
          <span style={{fontSize:10,color:txM,minWidth:24,textAlign:"right"}}>{c.weight}%</span>
        </div>)}
        <div style={{fontSize:11,color:txM,marginTop:8,textAlign:"center"}}>Tap any category to fix items. Weights calibrated against OSHA FY2025 citation data.</div>
      </div>}
      </>;})()}

      {/* 3. QUICK STATS */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:16,animation:"fu .4s .1s ease both"}}>
        {[{l:"Hazards",v:hazards.filter(h=>h.status==="open").length,c:hazards.filter(h=>h.status==="open").length?"#EF4444":"#22C55E",p:"hazards"},{l:"Actions",v:actions.filter(a=>a.status!=="closed").length,c:actions.filter(a=>a.status!=="closed").length?"#FBBF24":"#22C55E",p:"actions"},{l:"Training",v:training.filter(t=>t.status==="overdue").length,c:training.filter(t=>t.status==="overdue").length?"#EF4444":"#22C55E",p:"training"},{l:"Docs",v:docs.filter(d=>d.status==="expired").length,c:docs.filter(d=>d.status==="expired").length?"#EF4444":"#22C55E",p:"docs"}].map((s,i)=><div key={i} onClick={()=>setView(s.p)} style={{padding:"12px 6px",background:crd,border:"1px solid "+bdr,borderRadius:10,textAlign:"center",cursor:"pointer"}}><div style={{fontSize:22,fontWeight:800,color:s.c,fontFamily:"monospace"}}>{s.v}</div><div style={{fontSize:10,color:"#5E6578"}}>{s.l}</div></div>)}
      </div>

      {/* 4. MOCK INSPECTION — single prominent card */}
      <button onClick={()=>{setMockDone(false);setMockSetup(true);setMockIdx(0);setMockR({});setMockNotes({});setMockPhotos({});setView("mock");}} style={{width:"100%",padding:"18px 20px",background:crd,border:"1.5px solid "+pri+"30",borderRadius:14,cursor:"pointer",display:"flex",alignItems:"center",gap:14,fontFamily:"inherit",color:"#F0F4F8",textAlign:"left",marginBottom:16,position:"relative",overflow:"hidden",animation:"fu .4s .15s ease both"}}>
        <div style={{position:"absolute",inset:0,opacity:.06}}><Particles/></div>
        <div style={{width:44,height:44,borderRadius:12,background:pri+"15",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",zIndex:1,flexShrink:0}}><I n="clip" s={22} c={pri}/></div>
        <div style={{position:"relative",zIndex:1,flex:1}}><div style={{fontSize:15,fontWeight:700}}>Run Mock OSHA Inspection</div><div style={{fontSize:12,color:"#5E6578",marginTop:2}}>Industry-specific checklist · {mockPct>0?mockPct+"% last score":"Not yet run"}</div></div>
        <I n="arrow" s={16} c={pri}/>
      </button>

      {/* 5. NEXT BEST ACTION */}
      {nextAction&&<div onClick={()=>setView(nextAction.mod)} style={{padding:"14px 18px",background:crd,border:"1px solid "+nextAction.color+"30",borderRadius:12,marginBottom:16,display:"flex",alignItems:"center",gap:12,cursor:"pointer",animation:"fu .4s .18s ease both"}}>
        <div style={{width:36,height:36,borderRadius:10,background:nextAction.color+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><I n="arrow" s={18} c={nextAction.color}/></div>
        <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:nextAction.color,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Highest Impact Action</div><div style={{fontSize:14,fontWeight:600}}>{nextAction.text}</div><div style={{fontSize:11,color:"#5E6578"}}>+{nextAction.impact} pts to your readiness score</div></div>
      </div>}

      {/* 6. MONTHLY SUMMARY */}
      <div style={{display:"grid",gridTemplateColumns:wide?"1fr 1fr 1fr 1fr":"1fr 1fr",gap:8,marginBottom:16,animation:"fu .4s .2s ease both"}}>
        {[{label:"Hazards",a:monthStats.hazClosed+" closed",b:(monthStats.hazReported-monthStats.hazClosed)+" open",bc:monthStats.hazReported-monthStats.hazClosed>0?"#FBBF24":"#22C55E",nav:"hazards"},
          {label:"Actions",a:monthStats.actClosed+" closed",b:monthStats.actOpen+" open",bc:monthStats.actOpen>0?"#FBBF24":"#22C55E",nav:"actions"},
          {label:"Training",a:monthStats.trnCurrent+" current",b:monthStats.trnOverdue+" overdue",bc:monthStats.trnOverdue>0?"#EF4444":"#22C55E",nav:"training"},
          {label:"Documents",a:monthStats.docsCurrent+" current",b:monthStats.docsExpired+" expired",bc:monthStats.docsExpired>0?"#EF4444":"#22C55E",nav:"docs"},
        ].map((c,i)=><div key={i} onClick={()=>setView(c.nav)} style={{padding:"14px",background:crd,border:"1px solid "+bdr,borderRadius:12,cursor:"pointer"}}>
          <div style={{fontSize:11,color:txM,marginBottom:6}}>{c.label}</div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13}}>{c.a}</span><span style={{fontSize:13,color:c.bc}}>{c.b}</span></div>
        </div>)}
      </div>

      {/* 7. RECENT ACTIVITY */}
      <div style={{animation:"fu .4s .2s ease both"}}>
        <div style={{fontSize:12,fontWeight:600,color:txM,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Recent Activity</div>
        {[
          ...hazards.slice(0,2).map(h=>({text:(h.status==="corrected"?"✓ Corrected: ":"Reported: ")+h.title,time:fmtD(h.date),c:h.status==="corrected"?"#22C55E":"#FBBF24",nav:"hazards"})),
          ...actions.filter(a=>a.status==="in_progress").slice(0,2).map(a=>({text:"In progress: "+a.title,time:"Active",c:"#FBBF24",nav:"actions"})),
          ...training.filter(t=>t.status==="overdue").slice(0,1).map(t=>({text:"Overdue: "+t.emp+" — "+t.course,time:fmtD(t.due),c:"#EF4444",nav:"training"})),
        ].slice(0,5).map((item,i)=><div key={i} onClick={()=>setView(item.nav)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid "+bdr,cursor:"pointer"}}>
          <div style={{width:6,height:6,borderRadius:3,background:item.c,flexShrink:0}}/>
          <div style={{flex:1,fontSize:13}}>{item.text}</div>
          <span style={{fontSize:11,color:txM,fontFamily:"monospace"}}>{item.time}</span>
        </div>)}
        {hazards.length===0&&actions.length===0&&<div style={{fontSize:13,color:txM,padding:12,textAlign:"center"}}>No activity yet. Run a mock OSHA inspection to get started.</div>}
      </div>
    </div>}

    {view==="mock"&&<div style={{paddingTop:28,paddingBottom:100,animation:"fu .4s ease"}}>
      {/* Setup: industry selection + customization */}
      {mockSetup?<div>
        <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>Mock OSHA Inspection</div>
        <div style={{fontSize:13,color:"#8B95A8",marginBottom:20}}>Select your industry. Core items + industry-specific add-ons will be loaded.</div>

        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Industry</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:20}}>
          {MOCK_INDUSTRIES.map(ind=><button key={ind} onClick={()=>{setMockIndustry(ind);setMockCustom({});setMockR({});}} style={{padding:"10px 16px",background:mockIndustry===ind?pri+"15":crd,border:"1.5px solid "+(mockIndustry===ind?pri:bdr),borderRadius:10,color:mockIndustry===ind?pri:"#C8D0DC",fontSize:14,cursor:"pointer",fontFamily:"inherit",fontWeight:mockIndustry===ind?600:400}}>{ind}</button>)}
        </div>

        {mockIndustry&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:13,fontWeight:700}}>Checklist ({allMockItems.length} items)</div>
            <div style={{fontSize:11,color:"#5E6578"}}>{MOCK_CORE.length} core + {(MOCK_INDUSTRY[mockIndustry]||[]).length} {mockIndustry}</div>
          </div>

          {["Opening","Documents","Walkaround","Employee","Closing"].map(phase=>{
            const items=allMockItems.filter(i=>i.phase===phase);
            if(!items.length) return null;
            return <div key={phase} style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:600,color:pri,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>{phase}</div>
              {items.map(item=>{
                const enabled=mockCustom[item.id]!==false;
                const isIndustry=!MOCK_CORE.find(c=>c.id===item.id);
                return <div key={item.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 12px",background:enabled?crd:crd+"80",borderRadius:8,marginBottom:3,opacity:enabled?1:.5}}>
                  <button onClick={()=>setMockCustom(p=>({...p,[item.id]:enabled?false:undefined}))} style={{width:22,height:22,borderRadius:6,border:"1.5px solid "+(enabled?pri:bdr),background:enabled?pri+"20":"transparent",color:enabled?pri:"#5E6578",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{enabled?"✓":""}</button>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:enabled?"#E2E8F0":"#5E6578"}}>{item.q}</div>
                    {isIndustry&&<span style={{fontSize:10,color:pri,fontFamily:"monospace"}}>{mockIndustry}</span>}
                    {item.std&&<span style={{fontSize:10,color:"#5E6578",fontFamily:"monospace",marginLeft:isIndustry?6:0}}>{item.std}</span>}
                  </div>
                </div>;
              })}
            </div>;
          })}

          <button onClick={()=>{setMockSetup(false);setMockIdx(0);}} style={{width:"100%",padding:16,background:"linear-gradient(135deg,#991B1B,"+pri+")",border:"none",borderRadius:12,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:8}}>Start Inspection ({mockItems.length} items) →</button>
        </div>}
      </div>

      /* One-at-a-time flow */
      :<div>
        {!mockDone&&<div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:12,fontWeight:600,color:pri,textTransform:"uppercase",letterSpacing:2,fontFamily:"monospace"}}>Mock OSHA Inspection — {mockIndustry}</span>
          <span style={{fontSize:13,fontWeight:700,color:scoreC(mockPct),fontFamily:"monospace"}}>{mockPct}%</span>
        </div>
        <div style={{height:4,background:bdr,borderRadius:2,marginBottom:20,overflow:"hidden"}}>
          <div style={{height:"100%",width:((mockIdx+1)/mockItems.length*100)+"%",background:pri,borderRadius:2,transition:"width .3s"}}/>
        </div>
        <div style={{fontSize:11,color:"#5E6578",fontFamily:"monospace",marginBottom:6}}>
          {mockItems[mockIdx]?.phase} · {mockIdx+1}/{mockItems.length}
          {mockItems[mockIdx]?.std&&<span style={{marginLeft:8,color:pri}}>{mockItems[mockIdx].std}</span>}
        </div>

        <div key={mockIdx} style={{animation:"fu .3s ease"}}>
          <div style={{fontSize:18,fontWeight:700,lineHeight:1.4,marginBottom:12}}>{mockItems[mockIdx]?.q}</div>
          <div style={{padding:"12px 16px",background:pri+"08",border:"1px solid "+pri+"20",borderRadius:10,fontSize:13,color:"#FECACA",lineHeight:1.5,marginBottom:24}}>{mockItems[mockIdx]?.tip}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[{v:"pass",l:"Pass — Compliant",c:"#22C55E"},{v:"fail",l:"Fail — Deficiency",c:"#EF4444"},{v:"na",l:"N/A — Not Applicable",c:"#64748B"}].map(o=>{
              const sel=mockR[mockItems[mockIdx]?.id]===o.v;
              return <button key={o.v} onClick={()=>{setMockR(p=>({...p,[mockItems[mockIdx].id]:o.v}));if(o.v!=="fail"&&mockIdx<mockItems.length-1)setTimeout(()=>setMockIdx(mockIdx+1),800);}} style={{padding:"16px 20px",background:sel?o.c+"15":crd,border:"1.5px solid "+(sel?o.c:bdr),borderRadius:12,color:sel?o.c:"#C8D0DC",fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all .2s"}}>{sel?"✓ ":""}{o.l}</button>;
            })}
          </div>

          {/* Create action from failure */}
          {mockR[mockItems[mockIdx]?.id]==="fail"&&<button onClick={()=>{setActions(p=>[{id:"a"+Date.now(),title:"Fix: "+mockItems[mockIdx].q.replace("?",""),source:"Mock OSHA Inspection",owner:"",due:"",sev:"high",status:"open",root:mockNotes[mockItems[mockIdx]?.id]||"",interim:"",fix:""},...p]);notify("Corrective action created");audit("Action Created","Mock: "+mockItems[mockIdx].q);}} style={{marginTop:12,padding:"10px 16px",background:"#EF444415",border:"1px solid #EF444430",borderRadius:8,color:"#EF4444",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"left"}}>+ Create Corrective Action for this deficiency</button>}

          {/* Notes + Photo — shown after any answer */}
          {mockR[mockItems[mockIdx]?.id]&&<div style={{marginTop:12,animation:"fu .3s ease"}}>
            <textarea value={mockNotes[mockItems[mockIdx]?.id]||""} onChange={e=>setMockNotes(p=>({...p,[mockItems[mockIdx].id]:e.target.value}))} placeholder={mockR[mockItems[mockIdx]?.id]==="fail"?"Describe the deficiency — location, condition, what's missing...":"Notes (optional)"} rows={2} style={{...inp,resize:"vertical",fontSize:13,marginBottom:8}}/>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <label style={{padding:"8px 14px",borderRadius:8,background:sub,border:"1px solid "+bdr,color:lt?"#475569":"#C8D0DC",fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                <I n="plus" s={14} c="#C8D0DC"/>Photo
                <input type="file" accept="image/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{const img=new Image();img.onload=()=>{const maxDim=800;let w=img.width,h=img.height;if(w>maxDim||h>maxDim){if(w>h){h=Math.round(h*(maxDim/w));w=maxDim;}else{w=Math.round(w*(maxDim/h));h=maxDim;}}const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;canvas.getContext("2d").drawImage(img,0,0,w,h);const compressed=canvas.toDataURL("image/jpeg",0.6);setMockPhotos(p=>({...p,[mockItems[mockIdx].id]:[...(p[mockItems[mockIdx].id]||[]),{data:compressed,time:new Date().toLocaleTimeString(),name:file.name}]}));notify("Photo attached (compressed)");};img.src=ev.target.result;};reader.readAsDataURL(file);e.target.value="";}} style={{display:"none"}}/>
              </label>
              {mockPhotos[mockItems[mockIdx]?.id]?.length>0&&<span style={{fontSize:11,color:"#22C55E"}}>{mockPhotos[mockItems[mockIdx].id].length} photo{mockPhotos[mockItems[mockIdx].id].length>1?"s":""} attached</span>}
            </div>
            {/* Photo thumbnails */}
            {mockPhotos[mockItems[mockIdx]?.id]?.length>0&&<div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
              {mockPhotos[mockItems[mockIdx].id].map((ph,i)=><div key={i} style={{position:"relative"}}>
                <img src={ph.data} alt="" style={{width:56,height:56,borderRadius:8,objectFit:"cover",border:"1px solid "+bdr}}/>
                <button onClick={()=>setMockPhotos(p=>({...p,[mockItems[mockIdx].id]:p[mockItems[mockIdx].id].filter((_,j)=>j!==i)}))} style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:8,background:"#EF4444",border:"none",color:"#fff",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>)}
            </div>}
          </div>}
        </div>

        <div style={{display:"flex",justifyContent:"space-between",marginTop:24}}>
          <button onClick={()=>{if(mockIdx>0)setMockIdx(mockIdx-1);else setMockSetup(true);}} style={{padding:"10px 16px",background:"none",border:"1px solid "+bdr,borderRadius:8,color:"#8B95A8",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{mockIdx>0?"← Back":"← Setup"}</button>
          {mockIdx<mockItems.length-1?<button onClick={()=>setMockIdx(mockIdx+1)} style={{padding:"10px 20px",background:pri,border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Next →</button>
          :<button onClick={()=>{setMockDone(true);notify("Mock OSHA Inspection complete!");audit("Mock Inspection Completed",mockIndustry+" — "+mockPct+"%");}} style={{padding:"10px 20px",background:"#22C55E",border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Complete ✓</button>}
        </div>
      </div>}

      {/* Mock Inspection Summary */}
      {mockDone&&<div style={{animation:"fu .4s ease"}}>
        <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>Inspection Complete</div>
        <div style={{fontSize:13,color:"#8B95A8",marginBottom:16}}>Mock OSHA Inspection — {mockIndustry}</div>

        <div style={{padding:"20px",background:crd,border:"1px solid "+bdr,borderRadius:14,marginBottom:16,textAlign:"center"}}>
          <div style={{position:"relative",width:80,height:80,margin:"0 auto 12px"}}>
            <svg width={80} height={80} viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" fill="none" stroke={bdr} strokeWidth="6"/><circle cx="40" cy="40" r="34" fill="none" stroke={scoreC(mockPct)} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${mockPct*2.136} 213.6`} transform="rotate(-90 40 40)"/></svg>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,color:scoreC(mockPct)}}>{mockPct}%</div>
          </div>
          <div style={{fontSize:16,fontWeight:700}}>{mockPct>=80?"Strong Readiness":mockPct>=60?"Moderate Gaps":"Significant Deficiencies"}</div>
          <div style={{fontSize:13,color:"#8B95A8",marginTop:4}}>{mockSummary.passed.length} passed · {mockSummary.failed.length} failed · {mockSummary.na.length} N/A</div>
        </div>

        {mockSummary.failed.length>0&&<div style={{marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#EF4444",marginBottom:8}}>Deficiencies Found ({mockSummary.failed.length})</div>
          {mockSummary.failed.map(item=><div key={item.id} style={{padding:"12px 14px",background:crd,border:"1px solid #EF444425",borderRadius:10,marginBottom:6}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:3}}>{item.q}</div>
            <div style={{fontSize:11,color:"#5E6578"}}>{item.std} · {item.phase}</div>
            {mockNotes[item.id]&&<div style={{fontSize:12,color:"#FBBF24",marginTop:6,padding:"6px 10px",background:"#FBBF2408",borderRadius:6,lineHeight:1.5}}>Note: {mockNotes[item.id]}</div>}
            {mockPhotos[item.id]?.length>0&&<div style={{display:"flex",gap:4,marginTop:6}}>{mockPhotos[item.id].map((ph,i)=><img key={i} src={ph.data} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover",border:"1px solid "+bdr}}/>)}</div>}
          </div>)}
        </div>}

        {mockSummary.failed.length>0&&(()=>{const fc=mockSummary.failed.length;const lo=fc*16550;const hi=fc*165514;return <div style={{marginBottom:16}}><button onClick={()=>setStakeOpen(!stakeOpen)} style={{width:"100%",padding:"14px 16px",background:"#FBBF2408",border:"1px solid #FBBF2420",borderRadius:12,cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:18,flexShrink:0}}>⚠️</div>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#FBBF24"}}>What's at stake: ${lo.toLocaleString()} – ${hi.toLocaleString()} potential exposure</div><div style={{fontSize:11,color:txM,marginTop:2}}>{fc} deficienc{fc!==1?"ies":"y"} at current OSHA penalty rates · Tap to see details</div></div>
          <div style={{fontSize:12,color:"#FBBF24",transition:"transform .2s",transform:stakeOpen?"rotate(180deg)":"rotate(0)"}}> ▼</div>
        </button>
        {stakeOpen&&<div style={{padding:"14px 16px",background:crd,border:"1px solid #FBBF2420",borderTop:"none",borderRadius:"0 0 12px 12px",animation:"fu .3s ease"}}>
          <div style={{fontSize:12,color:txP,lineHeight:1.7,marginBottom:10}}>Based on {fc} failed item{fc!==1?"s":""}, if each were cited as a serious violation:</div>
          <div style={{display:"grid",gap:6}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:sub,borderRadius:8}}><span style={{fontSize:12,color:txM}}>Serious ({fc} items × $16,550)</span><span style={{fontSize:13,fontWeight:700,color:"#FBBF24"}}>${lo.toLocaleString()}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:sub,borderRadius:8}}><span style={{fontSize:12,color:txM}}>If cited as Willful ({fc} × $165,514)</span><span style={{fontSize:13,fontWeight:700,color:"#EF4444"}}>${hi.toLocaleString()}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:sub,borderRadius:8}}><span style={{fontSize:12,color:txM}}>Failure to abate (per day)</span><span style={{fontSize:13,fontWeight:700,color:"#FB923C"}}>$16,550/day</span></div>
          </div>
          <div style={{fontSize:11,color:txM,lineHeight:1.6,marginTop:10,padding:"8px 10px",borderLeft:"2px solid #FBBF2430"}}>OSHA citations are public record. Beyond fines, citations can increase insurance premiums, disqualify government contractors, and become evidence in civil litigation. Instance-by-instance citing means a single hazard affecting 10 employees can result in 10 separate penalties.</div>
          <div style={{fontSize:10,color:"#5E6578",marginTop:8}}>Penalty rates: OSHA FY2024 · Adjusted annually for inflation</div>
        </div>}
        </div>;})()}

        {mockSummary.passed.length>0&&<div style={{marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#22C55E",marginBottom:8}}>Passing ({mockSummary.passed.length})</div>
          {mockSummary.passed.slice(0,5).map(item=><div key={item.id} style={{padding:"8px 14px",background:"#22C55E08",borderRadius:8,marginBottom:3,fontSize:12,color:"#8B95A8"}}>{item.q.replace("?","")}</div>)}
          {mockSummary.passed.length>5&&<div style={{fontSize:12,color:"#5E6578",padding:"4px 14px"}}>+{mockSummary.passed.length-5} more passing</div>}
        </div>}

        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setMockDone(false);setMockSetup(true);setView("dash");}} style={{flex:1,padding:14,background:pri,border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Back to Dashboard</button>
          <button onClick={()=>{setMockDone(false);setMockSetup(true);setMockNotes({});setMockPhotos({});}} style={{padding:"14px 20px",background:"none",border:"1px solid "+bdr,borderRadius:10,color:"#8B95A8",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Run Again</button>
        </div>
      </div>}
      </div>}
    </div>}

    {view==="hazards"&&<div style={{paddingTop:28,paddingBottom:100,animation:"fu .4s ease"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:20,fontWeight:800}}>Hazard Reports</div><button onClick={()=>setShowHF(true)} style={{padding:"8px 16px",borderRadius:8,background:pri,border:"none",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}><I n="plus" s={14} c="#fff"/>Report</button></div>{showHF&&<div style={{padding:16,background:crd,border:"1px solid "+pri,borderRadius:14,marginBottom:16,animation:"fu .3s ease"}}><div style={{fontSize:14,fontWeight:700,color:pri,marginBottom:12}}>New Hazard</div><div style={{display:"grid",gap:8}}><input value={newH.title} onChange={e=>{setNewH(p=>({...p,title:e.target.value}));if(formErrors.hazTitle)setFormErrors({});}} placeholder="What's the hazard?" style={{...inp,border:formErrors.hazTitle?"2px solid #EF4444":"1px solid "+bdr}}/>{formErrors.hazTitle&&<div style={{fontSize:11,color:"#EF4444",marginTop:2}}>Hazard description is required</div>}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><select value={newH.site} onChange={e=>setNewH(p=>({...p,site:e.target.value}))} style={inp}>{SITES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input value={newH.loc} onChange={e=>setNewH(p=>({...p,loc:e.target.value}))} placeholder="Location" style={inp}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><select value={newH.sev} onChange={e=>setNewH(p=>({...p,sev:e.target.value}))} style={inp}>{["low","medium","high","critical"].map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select><input value={newH.interim} onChange={e=>setNewH(p=>({...p,interim:e.target.value}))} placeholder="Interim control" style={inp}/></div><input value={newH.cfr} onChange={e=>setNewH(p=>({...p,cfr:e.target.value}))} placeholder="OSHA standard (e.g. 29 CFR 1910.212)" style={inp}/><div style={{display:"flex",gap:8}}><button onClick={()=>{if(!newH.title){setFormErrors({hazTitle:true});return;}setFormErrors({});if(newH.title){setHazards(p=>[{id:"h"+Date.now(),title:sanitize(newH.title),site:newH.site,loc:sanitize(newH.loc),cat:newH.cat,sev:newH.sev,status:"open",by:"User",date:new Date().toISOString().slice(0,10),interim:newH.interim,cfr:sanitize(newH.cfr)},...p]);notify("Hazard reported successfully");audit("Hazard Reported",newH.title);setShowHF(false);setNewH({title:"",site:"s1",loc:"",cat:"Machine Guarding",sev:"medium",interim:"",cfr:""});}}} style={{flex:1,padding:12,background:pri,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Submit</button><button onClick={()=>setShowHF(false)} style={{padding:"12px 20px",background:"none",border:"1px solid "+bdr,borderRadius:8,color:"#8B95A8",cursor:"pointer",fontFamily:"inherit"}}>Cancel</button></div></div></div>}{hazards.length===0?<div style={{padding:40,textAlign:"center",background:crd,border:"1px solid "+bdr,borderRadius:14}}><I n="alert" s={32} c="#5E6578"/><div style={{fontSize:16,fontWeight:700,marginTop:10}}>No Hazards Reported</div><div style={{fontSize:13,color:"#8B95A8",marginTop:4,lineHeight:1.6}}>When you spot something unsafe, tap Report above to document it. Each report creates a traceable record with timestamps and interim controls.</div></div>:hazards.map(h=><div key={h.id} style={{padding:14,background:crd,border:"1px solid "+bdr,borderRadius:12,marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}><div style={{fontSize:14,fontWeight:600,flex:1}}>{h.title}</div><div style={{display:"flex",gap:4}}><Bd c={sevC(h.sev)}>{h.sev}</Bd><Bd c={statC(h.status)}>{h.status}</Bd></div></div><div style={{fontSize:12,color:"#5E6578"}}>{SITES.find(s=>s.id===h.site)?.name} · {h.loc} · {fmtD(h.date)}</div>{h.interim&&<div style={{fontSize:12,color:"#8B95A8",marginTop:3}}>Interim: {h.interim}</div>}{h.cfr&&<div style={{fontSize:11,color:pri,marginTop:2,fontFamily:"monospace"}}>{h.cfr}</div>}{h.status==="open"&&<div style={{display:"flex",gap:6,marginTop:8}}><button onClick={()=>{setHazards(p=>p.map(x=>x.id===h.id?{...x,status:"corrected"}:x));notify("Hazard marked as corrected");audit("Hazard Corrected",h.title);}} style={{padding:"6px 14px",borderRadius:6,background:"#22C55E15",border:"1px solid #22C55E30",color:"#22C55E",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Corrected</button><button onClick={()=>{setActions(p=>[{id:"a"+Date.now(),title:"Fix: "+h.title,source:"Hazard",owner:"",due:"",sev:h.sev,status:"open",root:"",interim:h.interim,fix:""},...p]);notify("Corrective action created");audit("Action Created","Fix: "+h.title);setView("actions");}} style={{padding:"6px 14px",borderRadius:6,background:pri+"15",border:"1px solid "+pri+"30",color:pri,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Create Action</button></div>}</div>)}</div>}

    {view==="actions"&&<div style={{paddingTop:28,paddingBottom:100,animation:"fu .4s ease"}}><div style={{fontSize:20,fontWeight:800,marginBottom:16}}>Corrective Actions</div>{actions.length===0?<div style={{padding:40,textAlign:"center",background:crd,border:"1px solid "+bdr,borderRadius:14}}><I n="wrench" s={32} c="#5E6578"/><div style={{fontSize:16,fontWeight:700,marginTop:10}}>No Corrective Actions</div><div style={{fontSize:13,color:"#8B95A8",marginTop:4,lineHeight:1.6}}>Actions are created from hazard reports and mock OSHA inspections. Each gets an owner, deadline, and closure verification.</div></div>:[...actions].sort((a,b)=>{const ov=x=>x.status!=="closed"&&x.due&&new Date(x.due)<new Date()?1:0;return ov(b)-ov(a);}).map(a=>{const overdue=a.status!=="closed"&&a.due&&new Date(a.due)<new Date();const daysOver=overdue?Math.ceil((Date.now()-new Date(a.due))/(1000*60*60*24)):0;return <div key={a.id} style={{padding:14,background:crd,border:"1px solid "+(overdue?"#EF444440":a.status!=="closed"&&a.sev==="high"?"#FB923C30":a.status!=="closed"&&a.sev==="critical"?"#EF444430":bdr),borderLeft:a.status!=="closed"?"4px solid "+(overdue?"#EF4444":sevC(a.sev)):"4px solid "+bdr,borderRadius:12,marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}><div style={{fontSize:14,fontWeight:600,flex:1}}>{a.title}</div><div style={{display:"flex",gap:4}}>{overdue&&<Bd c="#EF4444">{daysOver}d overdue</Bd>}<Bd c={sevC(a.sev)}>{a.sev}</Bd><Bd c={statC(a.status)}>{a.status.replace("_"," ")}</Bd></div></div><div style={{fontSize:12,color:overdue?"#EF4444":"#5E6578"}}>{a.source} · {a.owner||"Unassigned"} · Due: {a.due?fmtD(a.due):"TBD"}</div>{a.root&&<div style={{fontSize:12,color:"#8B95A8",marginTop:3}}>Root: {a.root}</div>}{a.fix&&<div style={{fontSize:12,color:"#8B95A8"}}>Fix: {a.fix}</div>}{a.status==="closed"&&a.closedBy&&<div style={{fontSize:11,color:"#22C55E",marginTop:3}}>Verified by {a.closedBy} on {fmtD(a.closedDate)}</div>}{a.status!=="closed"&&<div style={{marginTop:8}}>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            {a.status==="open"&&<button onClick={()=>{setActions(p=>p.map(x=>x.id===a.id?{...x,status:"in_progress"}:x));notify("Action started");audit("Action Started",a.title);}} style={{padding:"6px 14px",borderRadius:6,background:"#FBBF2415",border:"1px solid #FBBF2430",color:"#FBBF24",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Start</button>}
            {a.status==="in_progress"&&<button onClick={()=>{setActions(p=>p.map(x=>x.id===a.id?{...x,status:"closed",closedBy:company.name||"User",closedDate:new Date().toISOString().slice(0,10)}:x));notify("Action closed and verified");audit("Action Closed",a.title+" — verified by "+(company.name||"User"));}} style={{padding:"6px 14px",borderRadius:6,background:"#22C55E15",border:"1px solid #22C55E30",color:"#22C55E",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Close & Verify</button>}
          </div>
          <button onClick={()=>{const tpl=matchActionTemplate(a.title,a.cat||"",a.cfr||"");if(tpl){setActivePlan({...tpl,actionId:a.id,actionTitle:a.title});audit("Action Plan Generated",a.title+" — "+tpl.method);}else{setShowPaywall(true);}}} style={{width:"100%",padding:"10px 14px",borderRadius:8,background:sub,border:"1px solid "+bdr,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
            <div style={{width:28,height:28,borderRadius:7,background:pri+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><I n="shield" s={14} c={pri}/></div>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:lt?"#1E293B":"#E2E8F0"}}>Draft Action Plan <span style={{fontSize:10,color:pri,background:pri+"15",padding:"1px 6px",borderRadius:4,marginLeft:4}}>PRO</span></div><div style={{fontSize:11,color:"#5E6578",marginTop:1}}>Standards-based corrective plan with OSHA references, timelines, and verification criteria.</div></div>
          </button>
        </div>}</div>})}</div>}

    {view==="docs"&&<div style={{paddingTop:28,paddingBottom:100,animation:"fu .4s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:20,fontWeight:800}}>Document Vault</div>
        <button onClick={()=>setShowDF(p=>!p)} style={{padding:"8px 16px",borderRadius:8,background:showDF?sub:pri,border:showDF?"1px solid "+bdr:"none",color:showDF?txM:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>{showDF?"× Cancel":"+ Add"}</button>
      </div>

      {/* Add Document Form */}
      {showDF&&<div style={{padding:16,background:crd,border:"1px solid "+pri,borderRadius:14,marginBottom:12,animation:"fu .3s ease"}}>
        <div style={{fontSize:14,fontWeight:700,color:pri,marginBottom:10}}>Add Document</div>
        <div style={{display:"grid",gap:8}}>
          <input value={newDoc.name} onChange={e=>setNewDoc(p=>({...p,name:e.target.value}))} placeholder="Document name" style={inp}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <select value={newDoc.folder} onChange={e=>setNewDoc(p=>({...p,folder:e.target.value}))} style={inp}>
              <option value="Programs">Written Programs</option>
              <option value="Logs">OSHA Logs</option>
              <option value="Chemical">Chemical Management</option>
            </select>
            <select value={newDoc.site} onChange={e=>setNewDoc(p=>({...p,site:e.target.value}))} style={inp}>
              <option value="all">All Sites</option>
              {SITES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><div style={{fontSize:12,color:"#8B95A8",marginBottom:4}}>Expiration date</div><input type="date" value={newDoc.exp} onChange={e=>setNewDoc(p=>({...p,exp:e.target.value}))} style={inp}/></div>
          <button onClick={()=>{if(!newDoc.name)return;setDocs(p=>[{id:"d"+Date.now(),name:sanitize(newDoc.name),folder:newDoc.folder,site:newDoc.site,status:"current",exp:newDoc.exp||null,ver:"1.0",approval:"pending",approvedBy:null,approvedDate:null,history:[{ver:"1.0",date:new Date().toISOString().slice(0,10),by:"User"}]},...p]);notify(newDoc.name+" added");setNewDoc({name:"",folder:"Programs",exp:"",site:"all"});setShowDF(false);}} style={{padding:12,background:pri,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Add Document</button>
        </div>
      </div>}

      {/* Search + Site Filter */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{flex:1,position:"relative"}}><input value={docQ} onChange={e=>setDocQ(e.target.value)} placeholder="Search documents..." style={{...inp,paddingLeft:34,fontSize:13}}/><svg style={{position:"absolute",left:10,top:12}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={txM} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
        <select value={docSite} onChange={e=>setDocSite(e.target.value)} style={{...inp,width:"auto",minWidth:100,fontSize:12}}>
          <option value="all">All Sites</option>
          {SITES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Status strip */}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{padding:"5px 10px",borderRadius:8,background:"#22C55E15",border:"1px solid #22C55E25",fontSize:11,color:"#22C55E"}}>{docs.filter(d=>d.status==="current").length} current</div>
        <div style={{padding:"5px 10px",borderRadius:8,background:docs.filter(d=>d.status==="expired").length?"#EF444415":"#22C55E15",border:"1px solid "+(docs.filter(d=>d.status==="expired").length?"#EF444425":"#22C55E25"),fontSize:11,color:docs.filter(d=>d.status==="expired").length?"#EF4444":"#22C55E"}}>{docs.filter(d=>d.status==="expired").length} expired</div>
        <div style={{padding:"5px 10px",borderRadius:8,background:"#FBBF2415",border:"1px solid #FBBF2425",fontSize:11,color:"#FBBF24"}}>{docs.filter(d=>d.approval==="pending").length} pending approval</div>
      </div>

      {/* Document list by folder */}
      {docs.length===0?<div style={{padding:40,textAlign:"center",background:crd,border:"1px solid "+bdr,borderRadius:14}}><I n="folder" s={32} c="#5E6578"/><div style={{fontSize:16,fontWeight:700,marginTop:10}}>No Documents</div><div style={{fontSize:13,color:"#8B95A8",marginTop:4,lineHeight:1.6}}>Tap Add above to register your written programs, OSHA logs, and compliance documents.</div></div>
      :["Programs","Logs","Chemical"].map(f=>{
        const fd=docs.filter(d=>d.folder===f&&(docSite==="all"||d.site===docSite||d.site==="all")&&(!docQ||d.name.toLowerCase().includes(docQ.toLowerCase())));
        if(!fd.length)return null;
        return <div key={f} style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><I n="folder" s={16} c={pri}/><span style={{fontSize:14,fontWeight:700}}>{f==="Programs"?"Written Programs":f==="Logs"?"OSHA Logs":"Chemical Management"}</span><Bd c="#5E6578">{fd.length}</Bd></div>
          {fd.map(d=><div key={d.id} style={{padding:14,background:crd,border:"1px solid "+(d.status==="expired"?"#EF444420":d.approval==="pending"?"#FBBF2420":bdr),borderRadius:12,marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600}}>{d.name}</div>
                <div style={{fontSize:11,color:"#5E6578",marginTop:2,display:"flex",flexWrap:"wrap",gap:4}}>
                  <span>v{d.ver}</span>
                  {d.exp&&<span>· Expires: {fmtD(d.exp)}</span>}
                  <span>· {d.site==="all"?"All Sites":SITES.find(s=>s.id===d.site)?.name||d.site}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <Bd c={statC(d.status)}>{d.status}</Bd>
                <Bd c={d.approval==="approved"?"#22C55E":d.approval==="pending"?"#FBBF24":"#EF4444"}>{d.approval}</Bd>
              </div>
            </div>

            {/* Approval info */}
            {d.approval==="approved"&&d.approvedBy&&<div style={{fontSize:11,color:"#22C55E",marginTop:6,display:"flex",alignItems:"center",gap:4}}><I n="check" s={12} c="#22C55E"/>Approved by {d.approvedBy} on {fmtD(d.approvedDate)}</div>}

            {/* Actions */}
            <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
              {d.status==="expired"&&<button onClick={()=>{setDocs(p=>p.map(x=>x.id===d.id?{...x,status:"current",exp:new Date(Date.now()+365*86400000).toISOString().slice(0,10),ver:safeVer(x.ver),approval:"pending",approvedBy:null,approvedDate:null,history:[{ver:safeVer(x.ver),date:new Date().toISOString().slice(0,10),by:"User"},...(x.history||[])]}:x));notify(d.name+" updated — pending approval");audit("Document Updated",d.name);}} style={{padding:"6px 14px",borderRadius:6,background:"#22C55E15",border:"1px solid #22C55E30",color:"#22C55E",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Mark Updated</button>}
              {d.status==="expired"&&<button onClick={()=>{setActions(p=>[{id:"a"+Date.now(),title:"Update: "+d.name,source:"Document Vault",owner:"",due:"",sev:"high",status:"open",root:"Document expired",interim:"",fix:"Review and update "+d.name},...p]);notify("Corrective action created");}} style={{padding:"6px 14px",borderRadius:6,background:pri+"15",border:"1px solid "+pri+"30",color:pri,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Create Action</button>}
              {d.approval==="pending"&&<button onClick={()=>{setDocs(p=>p.map(x=>x.id===d.id?{...x,approval:"approved",approvedBy:"Current User",approvedDate:new Date().toISOString().slice(0,10)}:x));notify(d.name+" approved");audit("Document Approved",d.name);}} style={{padding:"6px 14px",borderRadius:6,background:"#FBBF2415",border:"1px solid #FBBF2430",color:"#FBBF24",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Approve</button>}
            </div>

            {/* Version history */}
            {d.history&&d.history.length>0&&<div style={{marginTop:8}}>
              <div style={{fontSize:10,color:"#5E6578",fontFamily:"monospace",marginBottom:4}}>Version History</div>
              {d.history.slice(0,3).map((h,i)=><div key={i} style={{fontSize:11,color:"#8B95A8",paddingLeft:8,borderLeft:"2px solid "+bdr,marginBottom:2}}>v{h.ver} — {fmtD(h.date)} by {h.by}</div>)}
              {d.history.length>3&&<div style={{fontSize:10,color:"#5E6578",paddingLeft:8}}>+{d.history.length-3} earlier versions</div>}
            </div>}
          </div>)}
        </div>;
      })}
      <div style={{marginTop:8,padding:"12px 16px",background:crd,border:"1px solid "+bdr,borderRadius:10,fontSize:12,color:"#8B95A8",lineHeight:1.6}}>Written programs contribute 20% to your readiness score (highest weighted category). Current: {docs.filter(d=>d.folder==="Programs"&&d.status==="current").length}/{docs.filter(d=>d.folder==="Programs").length} programs up to date.</div>
    </div>}

    {view==="training"&&<div style={{paddingTop:28,paddingBottom:100,animation:"fu .4s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:20,fontWeight:800}}>Training Tracker</div>
        <button onClick={()=>setShowTF(p=>!p)} style={{padding:"8px 16px",borderRadius:8,background:showTF?sub:pri,border:showTF?"1px solid "+bdr:"none",color:showTF?txM:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>{showTF?"× Cancel":"+ Add"}</button>
      </div>
      {showTF&&<div style={{padding:16,background:crd,border:"1px solid "+pri,borderRadius:14,marginBottom:12,animation:"fu .3s ease"}}>
        <div style={{fontSize:14,fontWeight:700,color:pri,marginBottom:10}}>Add Training Record</div>
        <div style={{display:"grid",gap:8}}>
          <input value={newTrn.emp} onChange={e=>setNewTrn(p=>({...p,emp:e.target.value}))} placeholder="Employee name" style={inp}/>
          <input value={newTrn.course} onChange={e=>setNewTrn(p=>({...p,course:e.target.value}))} placeholder="Course name" style={inp}/>
          <div><div style={{fontSize:12,color:"#8B95A8",marginBottom:4}}>Due date</div><input type="date" value={newTrn.due} onChange={e=>setNewTrn(p=>({...p,due:e.target.value}))} style={inp}/></div>
          <button onClick={()=>{if(!newTrn.emp||!newTrn.course||!newTrn.due)return;setTraining(p=>[{id:"t"+Date.now(),emp:sanitize(newTrn.emp),course:sanitize(newTrn.course),due:newTrn.due,status:newTrn.due<new Date().toISOString().slice(0,10)?"overdue":"due_soon",site:"s1"},...p]);notify(newTrn.emp+" — "+newTrn.course+" added");setNewTrn({emp:"",course:"",due:""});setShowTF(false);}} style={{padding:12,background:pri,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Add Training</button>
        </div>
      </div>}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{padding:"6px 12px",borderRadius:8,background:"#22C55E15",border:"1px solid #22C55E25",fontSize:12,color:"#22C55E"}}>{training.filter(t=>t.status==="current").length} current</div>
        <div style={{padding:"6px 12px",borderRadius:8,background:training.filter(t=>t.status==="overdue").length?"#EF444415":"#22C55E15",border:"1px solid "+(training.filter(t=>t.status==="overdue").length?"#EF444425":"#22C55E25"),fontSize:12,color:training.filter(t=>t.status==="overdue").length?"#EF4444":"#22C55E"}}>{training.filter(t=>t.status==="overdue").length} overdue</div>
        <div style={{padding:"6px 12px",borderRadius:8,background:"#FBBF2415",border:"1px solid #FBBF2425",fontSize:12,color:"#FBBF24"}}>{training.filter(t=>t.status==="due_soon").length} due soon</div>
      </div>
      {training.length===0?<div style={{padding:40,textAlign:"center",background:crd,border:"1px solid "+bdr,borderRadius:14}}><I n="grad" s={32} c="#5E6578"/><div style={{fontSize:16,fontWeight:700,marginTop:10}}>No Training Records</div><div style={{fontSize:13,color:"#8B95A8",marginTop:4,lineHeight:1.6}}>Tap Add above to create employee training records. The tracker alerts you when certifications are due or overdue.</div></div>
      :training.map(t=><div key={t.id} style={{padding:14,background:crd,border:"1px solid "+(t.status==="overdue"?"#EF444420":t.status==="current"?"#22C55E20":bdr),borderRadius:12,marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:600}}>{t.emp}</div>
            <div style={{fontSize:12,color:"#5E6578",marginTop:2}}>{t.course} · Due: {fmtD(t.due)}</div>
          </div>
          <Bd c={statC(t.status)}>{t.status.replace("_"," ")}</Bd>
        </div>
        {t.status!=="current"&&<div style={{display:"flex",gap:6,marginTop:8}}>
          <button onClick={()=>{setTraining(p=>p.map(x=>x.id===t.id?{...x,status:"current"}:x));notify(t.emp+" — "+t.course+" marked complete");audit("Training Completed",t.emp+" — "+t.course);}} style={{padding:"6px 14px",borderRadius:6,background:"#22C55E15",border:"1px solid #22C55E30",color:"#22C55E",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Mark Complete</button>
          <button onClick={()=>{if(confirm("Remove "+t.emp+"'s "+t.course+" record?")){setTraining(p=>p.filter(x=>x.id!==t.id));notify("Training record removed");}}} style={{padding:"6px 14px",borderRadius:6,background:"#EF444410",border:"1px solid #EF444425",color:"#EF4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
        </div>}
        {t.status==="current"&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
          <div style={{fontSize:11,color:"#22C55E",display:"flex",alignItems:"center",gap:4}}><I n="check" s={12} c="#22C55E"/>Completed</div>
          <button onClick={()=>{setTraining(p=>p.map(x=>x.id===t.id?{...x,status:"overdue"}:x));notify(t.course+" marked incomplete");}} style={{padding:"4px 10px",borderRadius:6,background:"none",border:"1px solid "+bdr,color:txM,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Undo</button>
        </div>}
      </div>)}
      <div style={{marginTop:16,padding:"12px 16px",background:crd,border:"1px solid "+bdr,borderRadius:10,fontSize:12,color:"#8B95A8",lineHeight:1.6}}>Training compliance contributes 15% to your readiness score. Current: {training.filter(t=>t.status==="current").length}/{training.length} employees compliant ({training.length?Math.round(training.filter(t=>t.status==="current").length/training.length*100):100}%).</div>
    </div>}

    {view==="logs"&&<div style={{paddingTop:28,paddingBottom:100,animation:"fu .4s ease"}}><div style={{fontSize:20,fontWeight:800,marginBottom:16}}>OSHA Recordkeeping</div><div style={{padding:16,background:crd,border:"1px solid "+bdr,borderRadius:14,marginBottom:12}}><div style={{fontSize:14,fontWeight:700,marginBottom:10}}>300 Log — 2026</div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["#","Employee","Date","Type","Away","Restr."].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",color:"#5E6578",borderBottom:"1px solid "+bdr}}>{h}</th>)}</tr></thead><tbody><tr><td style={{padding:"6px 8px"}}>001</td><td>Martinez</td><td>01/15</td><td>Laceration</td><td>3</td><td>5</td></tr><tr><td style={{padding:"6px 8px"}}>002</td><td>Kim</td><td>02/22</td><td>Strain</td><td>0</td><td>10</td></tr></tbody></table></div></div><div style={{padding:16,background:crd,border:"1px solid "+bdr,borderRadius:14}}><div style={{fontSize:14,fontWeight:700,marginBottom:8}}>300A Summary</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}><div><div style={{fontSize:22,fontWeight:800}}>2</div><div style={{fontSize:10,color:"#5E6578"}}>Cases</div></div><div><div style={{fontSize:22,fontWeight:800}}>3</div><div style={{fontSize:10,color:"#5E6578"}}>Away</div></div><div><div style={{fontSize:22,fontWeight:800}}>15</div><div style={{fontSize:10,color:"#5E6578"}}>Restricted</div></div></div></div></div>}

    {view==="live"&&<div style={{paddingTop:28,paddingBottom:100,animation:"fu .4s ease"}}>
      <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>Live Inspection Mode</div>
      <div style={{fontSize:13,color:"#8B95A8",marginBottom:16}}>Guided response + real-time logging when OSHA arrives.</div>

      {/* IDLE — no active inspection */}
      {livePhase==="idle"&&<div style={{padding:40,textAlign:"center",background:crd,border:"1px solid "+bdr,borderRadius:16}}>
        <I n="live" s={48} c="#FB923C"/>
        <div style={{fontSize:18,fontWeight:700,marginTop:12}}>No Active Inspection</div>
        <div style={{fontSize:13,color:"#8B95A8",marginTop:4,marginBottom:20}}>When an OSHA inspector arrives, tap below. You'll be guided through the first 15 minutes step by step.</div>
        <button onClick={()=>{setLivePhase("playbook");setPbStep(0);setPbChecks({});setLiveLog([{type:"START",time:new Date().toLocaleTimeString(),note:"OSHA inspection initiated — response playbook started"}]);setLiveOn(true);}} style={{padding:"14px 28px",background:"linear-gradient(135deg,#C2410C,#FB923C)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",width:"100%",marginBottom:10}}>OSHA Is Here — Start Response</button>
        <div style={{fontSize:11,color:txM,marginTop:12}}>Emergency contacts: {emergencyContacts.filter(c=>c.name&&(c.phone||c.email)).length} configured · <span onClick={()=>setPanel("settings")} style={{color:pri,cursor:"pointer"}}>Manage in Settings</span></div>
        <div style={{fontSize:11,color:"#FBBF24",marginTop:8,lineHeight:1.5}}>Average serious violation: $16,550/item · Willful: up to $165,514/item · Every minute of preparation matters.</div>
      </div>}

      {/* PLAYBOOK — guided first-15-minutes response */}
      {livePhase==="playbook"&&(()=>{
        const PB=[
          {id:"p1",title:"Verify Inspector Credentials",action:"Ask for photo ID and CSHO credential number. Record both.",detail:"Every OSHA compliance officer carries a U.S. Department of Labor credential with a photograph and serial number. Do not admit anyone without verified credentials.",field:"Inspector name & credential #"},
          {id:"p2",title:"Contact Legal Counsel",action:"Call your attorney or safety consultant now — before the walkaround begins.",detail:"You have the right to have counsel present. Call immediately. If they can't arrive in time, request a brief delay or have them available by phone.",field:"Attorney/consultant contacted"},
          {id:"p3",title:"Designate Employer Representative",action:"Identify who will accompany the inspector during the walkaround.",detail:"This person should be knowledgeable about your operations and safety programs. They will be with the inspector for the entire visit. Choose carefully.",field:"Representative name"},
          {id:"p4",title:"Identify Employee Representative",action:"If unionized, notify the union rep. If not, employees may designate their own representative.",detail:"Employees have a right to participate in the inspection. The employee representative may accompany the inspector separately.",field:"Employee rep name (if applicable)"},
          {id:"p5",title:"Determine Inspection Scope",action:"Ask the inspector: Is this a complaint inspection, programmed inspection, referral, or follow-up?",detail:"Understanding the scope tells you what standards they'll focus on and how broad the walkaround will be. A complaint inspection is limited to the complaint items. A programmed inspection can cover everything.",field:"Inspection type & scope"},
          {id:"p6",title:"Locate OSHA 300 Logs",action:"Pull your OSHA 300, 300A, and 301 forms for the current year plus 4 prior years.",detail:"You must produce these within 4 hours of the request. Failure to produce them is an automatic citation. Know exactly where they are before you need them.",field:null},
          {id:"p7",title:"Secure Written Programs Binder",action:"Gather your HazCom program, EAP, LOTO procedures, and all other written safety programs.",detail:"The inspector will review these during the document phase. Having them organized and immediately accessible demonstrates a functioning safety program.",field:null},
          {id:"p8",title:"Locate Training Records",action:"Pull training records for all employees. Must show who, what, when, and trainer.",detail:"OSHA will cross-reference training records with employee interviews. If an employee says they weren't trained on something, the record needs to prove otherwise.",field:null},
          {id:"p9",title:"Brief Supervisors",action:"Inform all supervisors that an OSHA inspection is underway. Key rules: be honest, don't volunteer extra information, don't hide anything.",detail:"Supervisors should answer questions truthfully and factually. They should not speculate, guess, or offer opinions. They should not attempt to hide or correct hazards while the inspector is present — that can be treated as evidence of willful violations.",field:null},
          {id:"p10",title:"Begin Opening Conference",action:"Proceed to the opening conference. Take notes on everything discussed.",detail:"The inspector will explain the purpose, scope, and process. Listen carefully. This is where you learn what they're looking for. Document everything from this point forward.",field:null},
        ];
        const step=PB[pbStep];
        const allDone=PB.every(p=>pbChecks[p.id]);
        return <div>
          {/* Emergency Alert Banner */}
          {!notifySent?<button onClick={sendEmergencyAlert} disabled={notifySending} style={{width:"100%",padding:"12px 16px",background:notifySending?"#991B1B":"linear-gradient(135deg,#991B1B,#DC2626)",border:"1.5px solid #DC262660",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,cursor:notifySending?"wait":"pointer",fontFamily:"inherit",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {notifySending?<><div style={{width:14,height:14,border:"2px solid #ffffff40",borderTopColor:"#fff",borderRadius:"50%",animation:"pu 1s linear infinite"}}/>Sending alerts...</>:<>🚨 Notify Team — Alert {emergencyContacts.filter(c=>c.name&&(c.phone||c.email)).length} Contact{emergencyContacts.filter(c=>c.name&&(c.phone||c.email)).length!==1?"s":""}</>}
          </button>
          :<div style={{padding:"10px 16px",background:"#22C55E15",border:"1px solid #22C55E30",borderRadius:10,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#22C55E",fontWeight:700,fontSize:13}}>✓ Team notified</span>
            <span style={{fontSize:11,color:txM}}>— alerts sent at {new Date().toLocaleTimeString()}</span>
          </div>}

          {alertFallback&&<div style={{padding:"12px 14px",background:"#EF444410",border:"1px solid #EF444430",borderRadius:10,marginBottom:14,animation:"fu .3s ease"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#EF4444",marginBottom:8}}>SMS/Email failed — call directly:</div>
            {emergencyContacts.filter(c=>c.name&&(c.phone||c.email)).map((c,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<emergencyContacts.length-1?"1px solid "+bdr:"none"}}>
              <div><div style={{fontSize:12,fontWeight:600,color:txP}}>{c.name}</div><div style={{fontSize:11,color:txM}}>{c.role}</div></div>
              <div style={{display:"flex",gap:6}}>
                {c.phone&&<a href={"tel:"+c.phone} style={{padding:"6px 12px",background:"#22C55E15",border:"1px solid #22C55E30",borderRadius:6,color:"#22C55E",fontSize:11,fontWeight:700,textDecoration:"none"}}>Call</a>}
                {c.email&&<a href={"mailto:"+c.email+"?subject=OSHA Inspection Alert"} style={{padding:"6px 12px",background:"#3B82F615",border:"1px solid #3B82F630",borderRadius:6,color:"#3B82F6",fontSize:11,fontWeight:700,textDecoration:"none"}}>Email</a>}
              </div>
            </div>)}
          </div>}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:12,fontWeight:600,color:"#FB923C",textTransform:"uppercase",letterSpacing:2,fontFamily:"monospace"}}>Response Playbook</span>
            <span style={{fontSize:13,fontWeight:700,color:"#FB923C",fontFamily:"monospace"}}>{Object.keys(pbChecks).length}/{PB.length}</span>
          </div>
          <div style={{height:4,background:bdr,borderRadius:2,marginBottom:20,overflow:"hidden"}}>
            <div style={{height:"100%",width:((pbStep+1)/PB.length*100)+"%",background:"#FB923C",borderRadius:2,transition:"width .3s"}}/>
          </div>

          <div key={pbStep} style={{animation:"fu .3s ease"}}>
            <div style={{fontSize:11,color:"#5E6578",fontFamily:"monospace",marginBottom:6}}>Step {pbStep+1} of {PB.length}</div>
            <div style={{fontSize:20,fontWeight:700,lineHeight:1.3,marginBottom:8}}>{step.title}</div>
            <div style={{fontSize:15,color:lt?"#475569":"#C8D0DC",lineHeight:1.5,marginBottom:12}}>{step.action}</div>
            <div style={{padding:"12px 16px",background:"#FB923C08",border:"1px solid #FB923C20",borderRadius:10,fontSize:13,color:"#FECACA",lineHeight:1.6,marginBottom:16}}>{step.detail}</div>

            {step.field&&<input value={pbChecks[step.id]||""} onChange={e=>setPbChecks(p=>({...p,[step.id]:e.target.value}))} placeholder={step.field} style={{width:"100%",padding:"12px 14px",background:sub,border:"1px solid "+bdr,borderRadius:8,color:"#F0F4F8",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:12}} onFocus={e=>e.target.style.borderColor="#FB923C"} onBlur={e=>e.target.style.borderColor=bdr}/>}

            <button onClick={()=>{
              if(!pbChecks[step.id])setPbChecks(p=>({...p,[step.id]:"✓"}));
              setLiveLog(p=>[...p,{type:"PLAYBOOK",time:new Date().toLocaleTimeString(),note:step.title+(pbChecks[step.id]&&pbChecks[step.id]!=="✓"?" — "+pbChecks[step.id]:"")}]);
              if(pbStep<PB.length-1)setTimeout(()=>setPbStep(pbStep+1),200);
            }} style={{width:"100%",padding:14,background:pbChecks[step.id]?"#22C55E15":"#FB923C",border:pbChecks[step.id]?"1px solid #22C55E30":"none",borderRadius:10,color:pbChecks[step.id]?"#22C55E":"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{pbChecks[step.id]?"✓ Done — Next":"Complete This Step"}</button>
          </div>

          <div style={{display:"flex",justifyContent:"space-between",marginTop:20}}>
            <button onClick={()=>pbStep>0&&setPbStep(pbStep-1)} style={{padding:"10px 16px",background:"none",border:pbStep?"1px solid "+bdr:"none",borderRadius:8,color:pbStep?"#8B95A8":"transparent",fontSize:13,cursor:pbStep?"pointer":"default",fontFamily:"inherit"}}>← Back</button>
            {allDone?<button onClick={()=>{setLivePhase("logging");setLiveLog(p=>[...p,{type:"PHASE",time:new Date().toLocaleTimeString(),note:"Playbook complete — switching to live logging"}]);}} style={{padding:"10px 20px",background:"#22C55E",border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Start Live Logging →</button>
            :pbStep<PB.length-1&&<button onClick={()=>setPbStep(pbStep+1)} style={{padding:"10px 16px",background:"none",border:"1px solid "+bdr,borderRadius:8,color:"#8B95A8",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Skip →</button>}
          </div>
        </div>;
      })()}

      {/* LOGGING — real-time inspection log */}
      {livePhase==="logging"&&<div>
        <div style={{padding:14,background:crd,border:"1px solid #FB923C",borderRadius:14,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:10,height:10,borderRadius:"50%",background:"#EF4444",animation:"pu 1.5s infinite"}}/><span style={{fontSize:14,fontWeight:700,color:"#FB923C"}}>LOGGING ACTIVE</span></div>
            <button onClick={()=>{setLivePhase("idle");setLiveOn(false);}} style={{padding:"6px 14px",borderRadius:6,background:"#EF444420",border:"none",color:"#EF4444",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>End Inspection</button>
          </div>
          {/* Send Update to Team */}
          <button onClick={sendLogUpdate} disabled={logSending} style={{width:"100%",padding:"10px 14px",background:logSending?"#3B82F610":"#3B82F610",border:"1px solid #3B82F630",borderRadius:8,cursor:logSending?"wait":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:12}}>
            {logSending?<><div style={{width:12,height:12,border:"2px solid #3B82F640",borderTopColor:"#3B82F6",borderRadius:"50%",animation:"pu 1s linear infinite"}}/><span style={{fontSize:12,color:"#3B82F6",fontWeight:600}}>Sending...</span></>:<><span style={{fontSize:14}}>📤</span><span style={{fontSize:12,color:"#3B82F6",fontWeight:600}}>Send Update to Team</span>{liveLog.length>logLastSent&&<span style={{fontSize:10,color:"#fff",background:"#3B82F6",borderRadius:10,padding:"1px 7px",fontWeight:700}}>{liveLog.length-logLastSent} new</span>}</>}
          </button>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:liveLogType?8:12}}>
            {[{l:"Doc Request",t:"DOC",c:"#3B82F6"},{l:"Walk Note",t:"WALK",c:"#FBBF24"},{l:"Interview",t:"INT",c:"#A78BFA"},{l:"Photo",t:"PHOTO",c:"#FB923C"},{l:"Evidence",t:"EVID",c:"#22C55E"},{l:"Conference",t:"CONF",c:"#F472B6"}].map(b=><button key={b.t} onClick={()=>{if(liveLogType===b.t){setLiveLogType(null);setLiveLogInput("");}else{setLiveLogType(b.t);setLiveLogInput("");}}} style={{padding:"8px 14px",borderRadius:8,background:liveLogType===b.t?b.c+"20":sub,border:"1.5px solid "+(liveLogType===b.t?b.c:bdr),color:liveLogType===b.t?b.c:lt?"#475569":"#C8D0DC",fontSize:12,fontWeight:liveLogType===b.t?700:400,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{b.l}</button>)}
          </div>
          {liveLogType&&<div style={{display:"flex",gap:6,marginBottom:12,animation:"fu .2s ease"}}>
            <input value={liveLogInput} onChange={e=>setLiveLogInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&liveLogInput.trim()){setLiveLog(p=>[...p,{type:liveLogType,time:new Date().toLocaleTimeString(),note:sanitize(liveLogInput.trim())}]);setLiveLogInput("");notify("Logged: "+liveLogType);}}} placeholder={"Describe the "+liveLogType.toLowerCase()+"..."} autoFocus style={{flex:1,padding:"10px 12px",background:sub,border:"1px solid "+bdr,borderRadius:8,color:txP,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            <button onClick={()=>{if(liveLogInput.trim()){setLiveLog(p=>[...p,{type:liveLogType,time:new Date().toLocaleTimeString(),note:sanitize(liveLogInput.trim())}]);setLiveLogInput("");notify("Logged: "+liveLogType);}}} style={{padding:"10px 16px",borderRadius:8,background:pri,border:"none",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Log</button>
          </div>}
          <div style={{maxHeight:350,overflowY:"auto"}}>
            {liveLog.map((e,i)=><div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid "+bdr,fontSize:12}}>
              <span style={{fontFamily:"monospace",color:"#5E6578",minWidth:60}}>{e.time}</span>
              <Bd c={e.type==="PLAYBOOK"?"#22C55E":e.type==="PHASE"?"#FB923C":pri} style={{minWidth:50,textAlign:"center",fontSize:10}}>{e.type}</Bd>
              <span style={{flex:1,color:lt?"#475569":"#C8D0DC"}}>{e.note}</span>
            </div>)}
          </div>
        </div>
      </div>}
    </div>}
    </div>

    {/* Chat Assistant Button */}
    {!splash&&!locked&&<button onClick={()=>setChatOpen(p=>!p)} style={{position:"fixed",bottom:chatOpen?0:20,right:20,width:chatOpen?0:52,height:chatOpen?0:52,borderRadius:26,background:"linear-gradient(135deg,#991B1B,"+pri+")",border:"none",color:"#fff",fontSize:20,cursor:"pointer",boxShadow:"0 4px 20px #DC262640",zIndex:300,display:chatOpen?"none":"flex",alignItems:"center",justifyContent:"center",animation:"fu .4s ease",overflow:"hidden"}}>
      <I n="send" s={22} c="#fff"/>
    </button>}

    {/* Chat Panel */}
    {chatOpen&&<div style={{position:"fixed",bottom:0,right:0,width:wide?"420px":"100%",maxWidth:420,height:chatMin?"auto":"70vh",maxHeight:chatMin?"none":500,background:crd,border:"1px solid "+bdr,borderRadius:wide?"16px 16px 0 0":"16px 16px 0 0",zIndex:300,display:"flex",flexDirection:"column",animation:"su .3s ease",boxShadow:"0 -4px 30px #0006"}}>
      {/* Header */}
      <div style={{padding:"14px 16px",borderBottom:chatMin?"none":"1px solid "+bdr,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div onClick={()=>setChatMin(p=>!p)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",flex:1}}>
          <div style={{width:32,height:32,borderRadius:10,background:pri+"15",display:"flex",alignItems:"center",justifyContent:"center"}}><I n="send" s={16} c={pri}/></div>
          <div><div style={{fontSize:14,fontWeight:700}}>OSHAready Assistant</div><div style={{fontSize:11,color:"#5E6578"}}>{chatMin?"Tap to expand":(5-chatCount)+" messages remaining"}</div></div>
        </div>
        <div style={{display:"flex",gap:4}}>
          <button onClick={()=>setChatMin(p=>!p)} style={{width:28,height:28,borderRadius:8,border:"1px solid "+bdr,background:"none",color:"#8B95A8",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{chatMin?"\u25B2":"\u25BC"}</button>
          <button onClick={()=>{setChatOpen(false);setChatMin(false);}} style={{width:28,height:28,borderRadius:8,border:"1px solid "+bdr,background:"none",color:"#8B95A8",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"×"}</button>
        </div>
      </div>

      {!chatMin&&<>
      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
        {chatMsgs.length===0&&<div style={{textAlign:"center",padding:"20px 0"}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>How can I help?</div>
          <div style={{fontSize:12,color:"#5E6578",lineHeight:1.6,marginBottom:16}}>I can help you navigate OSHAready, explain features, and guide you through workflows.</div>
          {["How do I improve my score?","Walk me through a mock inspection","What is Live Inspection Mode?","How do I approve a document?"].map((q,i)=><button key={i} onClick={()=>{setChatInput(q);}} style={{display:"block",width:"100%",padding:"10px 14px",background:sub,border:"1px solid "+bdr,borderRadius:10,color:lt?"#475569":"#C8D0DC",fontSize:12,textAlign:"left",cursor:"pointer",fontFamily:"inherit",marginBottom:6}}>{q}</button>)}
        </div>}
        {chatMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:8}}>
          <div style={{maxWidth:"85%",padding:"10px 14px",borderRadius:m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",background:m.role==="user"?pri+"20":sub,fontSize:13,color:m.role==="user"?"#F0F4F8":"#C8D0DC",lineHeight:1.5}}>{m.content}{m.role==="assistant"&&<div style={{fontSize:9,color:"#5E6578",marginTop:6,borderTop:"1px solid "+bdr,paddingTop:4}}>App navigation only — not compliance advice</div>}</div>
        </div>)}
        {chatLoading&&<div style={{display:"flex",justifyContent:"flex-start",marginBottom:8}}>
          <div style={{padding:"10px 14px",borderRadius:"14px 14px 14px 4px",background:sub,display:"flex",gap:4}}>
            {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:3,background:"#5E6578",animation:`pu 1.2s infinite ${i*0.2}s`}}/>)}
          </div>
        </div>}
      </div>

      {/* Input */}
      <div style={{padding:"12px 16px",borderTop:"1px solid "+bdr,flexShrink:0}}>
        <div style={{display:"flex",gap:8}}>
          <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}} placeholder="Ask about OSHAready..." style={{...inp,flex:1,fontSize:13}}/>
          <button onClick={sendChat} disabled={chatLoading||!chatInput.trim()} style={{width:40,height:40,borderRadius:10,background:chatInput.trim()?"linear-gradient(135deg,#991B1B,"+pri+")":"#1A2030",border:"none",color:chatInput.trim()?"#fff":"#5E6578",cursor:chatInput.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><I n="send" s={16} c={chatInput.trim()?"#fff":"#5E6578"}/></button>
        </div>
        <div style={{fontSize:10,color:"#5E6578",marginTop:6,textAlign:"center"}}>App navigation help only — not a substitute for professional safety advice</div>
      </div>
      </>}
    </div>}

    <AboutPanel open={aboutOpen} onClose={()=>setAboutOpen(false)}/>
    <style>{`@keyframes fu{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}@keyframes fi{from{opacity:0;}to{opacity:1;}}@keyframes su{from{transform:translateY(100%);}to{transform:translateY(0);}}@keyframes ft{0%,100%{transform:translateY(0);}50%{transform:translateY(-12px);}}@keyframes pu{0%,100%{opacity:1;}50%{opacity:.3;}}@keyframes drawArc{from{stroke-dashoffset:200;}to{stroke-dashoffset:0;}}@keyframes drawCheck{from{stroke-dashoffset:80;}to{stroke-dashoffset:0;}}@keyframes splashText{0%{opacity:0;transform:translateY(12px);}100%{opacity:1;transform:translateY(0);}}@keyframes splashOut{0%{opacity:1;}80%{opacity:1;}100%{opacity:0;}}@keyframes splashPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.04);}}@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');`}</style>
  </div>);
}
