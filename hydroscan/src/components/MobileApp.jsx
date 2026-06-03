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
import { useMediaQuery } from '../hooks/useMediaQuery'
import LandingPage from './LandingPage'
import { Logo, I } from './Icons'
import MarlowAssistant from './MarlowAssistant'
import PricingSheet from './pricing/PricingSheet'
import { buildReportModel } from '../report/report-model'
import { R } from '../styles/tokens'
import storage from '../utils/storage'
import { persistAssessment, loadHistory } from '../utils/cloudStorage'
import { useAuth } from '../contexts/AuthContext'
import { trackEvent } from '../utils/supabaseClient'

// ── Domain data & engine (Phase 1 extraction) ──
// Standards are the hardcoded, manifest-backed source of truth; the engine
// reads them and produces screening-only findings. See src/constants/standards.js
// and src/engine/* — nothing below restates a regulatory value inline.
import { STD, STATE_STDS, ALL_PARAMS, PARAM_MAP, CATS, QUICK_ADD } from '../constants/standards.js'
import { Q_ASSESSOR, Q_SOURCE, Q_BUILDING } from '../constants/questions.js'
import { COLLECTION_GUIDES } from '../constants/collection-guides.js'
import {
  evaluateResults,
  buildWaterCausalChains,
  generateSamplingPlan,
  generateRecommendations,
  applyStateOverlay,
  buildReadiness,
  fD,
  tierColor,
  tierLabel,
  tierBg,
  sevColor,
} from '../engine'

// ═══════════════════════════════════════════════════════════════════════════════
// HydroScan — Drinking Water Quality Intelligence
// Prudence EHS Platform Module
// Field Assessment · Lab Results · Compliance Engine · Sampling Plans
// ═══════════════════════════════════════════════════════════════════════════════


const VER = "1.0.0-beta";
const PLAT_MODULES = [
  { id:"atmosiq", n:"AtmosIQ", i:"🌬️" },
  { id:"hydroscan", n:"HydroScan", i:"💧", on:true },
];

/* ─── STORAGE HELPERS ────────────────────────────────────────────── */
// Storage: real localStorage-backed wrapper (replaces the old window.storage
// bridge shim, which no-opped on the web). Cloud sync is layered on top via
// cloudStorage when the user is signed in.
const STO = storage


/* ─── Particles Effect ───────────────────────────────────────────── */
function Particles(){return <div style={{position:"absolute",inset:0,overflow:"hidden"}}>{Array.from({length:12}).map((_,i)=><div key={i} style={{position:"absolute",width:2+Math.random()*3,height:2+Math.random()*3,background:`#14B8A6${Math.round(10+Math.random()*25).toString(16)}`,borderRadius:"50%",left:`${Math.random()*100}%`,top:`${Math.random()*100}%`,animation:`float ${4+Math.random()*6}s ease-in-out infinite ${Math.random()*5}s`}} />)}</div>;}

const ABOUT_BIO={
  oneLiner:"Built by a Certified Safety Professional with 10+ years of field experience.",
  paragraphs:["Tsidi Tamakloe, CSP is the founder of Prudence Safety & Environmental Consulting and an Occupational Safety and Health Program Manager at the F.A.A. He holds a B.S. in Health Science with a concentration in Environmental Health from Stony Brook University. Over the course of more than a decade, he has worked across manufacturing, defense, commercial real estate, construction, healthcare and federal government, performing industrial hygiene fieldwork, managing compliance programs, overseeing construction safety and leading teams of occupational safety professionals nationwide.","At F.A.A. Headquarters, he runs national programs including OSHA inspection response, a 12-member regional safety team and coordination of the National OSHECCOM. He also actively consults through Yellowbird and ComplyAuto, performing audits across multiple industries and staying directly connected to the compliance challenges businesses face every day.","That practitioner mindset is what led him to start building software for EHS professionals. After years of watching the work run on paper forms, tribal knowledge and fragmented spreadsheets, he became an early adopter of artificial intelligence to close that gap. Through Prudence, he is developing tools that bring regulatory rigor into modern, accessible platforms, built by someone who is still in the field doing the work. Mr. Tamakloe is a member of the American Society of Safety Professionals and the Maryland chapter of the American Industrial Hygiene Association."],
  website:"https://prudencesafety.com",
};

function AboutTrustBadge({onClick}){const[h,setH]=useState(false);return(<button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{display:"inline-flex",alignItems:"center",gap:8,background:h?"rgba(20,184,166,0.08)":"rgba(20,184,166,0.04)",border:`1px solid rgba(20,184,166,${h?0.25:0.12})`,borderRadius:8,padding:"10px 16px",cursor:"pointer",transition:"all 0.25s ease",transform:h?"translateY(-1px)":"none",width:"100%"}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"/><path d="M9 12l2 2 4-4"/></svg><span style={{fontFamily:"var(--font-mono)",fontSize:12,color:"rgba(255,255,255,0.7)",textAlign:"left",flex:1}}>{ABOUT_BIO.oneLiner}</span><span style={{fontSize:12,color:"#14B8A6",opacity:h?1:0.5}}>→</span></button>);}

function AboutPanel({open,onClose}){const[v,setV]=useState(false);const[s,setS]=useState(false);useEffect(()=>{if(open){setV(true);setTimeout(()=>setS(true),30);}else{setS(false);setTimeout(()=>setV(false),350);}},[open]);if(!v)return null;return(<div onClick={onClose} style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:s?"rgba(0,0,0,0.7)":"rgba(0,0,0,0)",backdropFilter:s?"blur(8px)":"blur(0)",transition:"all 0.35s ease",padding:20}}><div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",background:"#0C0E13",border:"1px solid rgba(20,184,166,0.1)",borderRadius:16,opacity:s?1:0,transform:s?"translateY(0) scale(1)":"translateY(16px) scale(0.97)",transition:"all 0.35s cubic-bezier(0.16,1,0.3,1)",boxShadow:"0 24px 80px rgba(0,0,0,0.5)"}}><div style={{padding:"28px 28px 20px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><div><div style={{fontSize:11,fontWeight:600,letterSpacing:2.5,textTransform:"uppercase",color:"#14B8A6"}}>About Prudence</div><div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:2}}>Safety & Environmental Consulting</div></div><button onClick={onClose} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"rgba(255,255,255,0.4)"}}>✕</button></div><div style={{padding:"24px 28px 20px"}}>{ABOUT_BIO.paragraphs.map((p,i)=>(<p key={i} style={{fontSize:14,lineHeight:1.75,color:i===0?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.65)",margin:0,marginBottom:i<2?18:0}}>{i===0?<><strong style={{color:"#fff",fontWeight:600}}>Tsidi Tamakloe, CSP</strong>{p.substring(p.indexOf(" is the founder"))}</>:p}</p>))}</div><div style={{padding:"16px 28px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}><span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"rgba(255,255,255,0.25)"}}>CSP · BCSP #38426</span><a href={ABOUT_BIO.website} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"#14B8A6",textDecoration:"none",padding:"6px 14px",borderRadius:6,border:"1px solid rgba(20,184,166,0.2)",background:"rgba(20,184,166,0.06)"}}>prudencesafety.com ↗</a></div></div></div>);}

/* ═══════════════════════════════════════════════════════════════════ */
/* MAIN COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════════ */
export default function MobileApp() {
  const { isDesktop, isStandalone } = useMediaQuery()
  const { user, profile, signOut, saveProfile } = useAuth()
  if (isDesktop && !isStandalone) return <LandingPage isDesktop={true} />

  const [isReturning, setIsReturning] = useState(false);
  const [view, setView] = useState("dash");
  const [navOpen, setNavOpen] = useState(false);
  const [marlowOpen, setMarlowOpen] = useState(false); // Phase 2 — Marlow AI assistant
  const [pricingOpen, setPricingOpen] = useState(false); // Phase 6 — plans/pricing
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
  const [stateExceed, setStateExceed] = useState([]); // Phase 3 state-overlay exceedances
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
      // Cloud history when signed in, else local (cloudStorage facade).
      const h = await loadHistory();
      setHistory(Array.isArray(h) ? h : []);
    })();
  }, []);

  const refreshIndex = async () => {
    const idx = await STO.get("hydroscan-idx") || {reports:[],drafts:[]};
    setIndex(idx);
  };

  // Prefill assessor defaults from the signed-in user's profile.
  useEffect(() => {
    if (!profile) return;
    setUserSettings(p => ({
      name: p.name || profile.full_name || "",
      firm: p.firm || profile.firm || "",
      phone: p.phone || profile.phone || "",
      instrument: p.instrument || profile.instrument || "",
      calDate: p.calDate || profile.calibration_date || "",
    }));
  }, [profile]);

  // Save evaluation to history for trending
  const saveToHistory = async (ev, src) => {
    trackEvent('assessment_completed', { tier: ev.tier, param_count: ev.findings.length, violations: ev.findings.filter(f=>f.violations.length>0).length });
    const entry = { ts: new Date().toISOString(), sourceId: `${src.src_type||"unknown"}-${src.b_type||""}`, tier: ev.tier, paramCount: ev.findings.length, violations: ev.findings.filter(f=>f.violations.length>0).map(f=>({id:f.param.id,name:f.param.name,value:f.value,unit:f.param.unit})), results: labResults.filter(r=>r.value||r.qualifier).map(r=>({id:r.id,value:r.value,qualifier:r.qualifier})) };
    const updated = [...history, entry].slice(-50);
    setHistory(updated);
    await STO.set("hydroscan-history", updated);
    // Mirror to the cloud when signed in (best-effort; offline-safe).
    try { await persistAssessment(entry, { mode, source, building, labResults }); } catch { /* offline / signed out */ }
  };

  const haptic = (type) => { try { if(navigator.vibrate) navigator.vibrate(type==="heavy"?[30,20,30]:type==="success"?[10,30,10,30,10]:12); } catch{} };
  const showMilestone = (icon, title, sub, nextFn) => { haptic("success"); setMilestone({icon,title,sub}); setTimeout(()=>{setMilestone(null);nextFn();},1400); };
  const acceptTos = async () => { await STO.set("hydroscan-tos", true); setTosAccepted(true); setShowTos(false); haptic("success"); };
  const saveUserSettings = async (s) => { setUserSettings(s); await STO.set("hydroscan-settings", s); if (user) { try { await saveProfile(s); } catch { /* offline */ } } haptic("success"); };

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

  const startSmart = () => { if(!tosAccepted){setShowTos(true);return;} trackEvent('assessment_started',{type:'quick'}); setSmart({source:"",building:"",trigger:"",concerns:[]}); setSamplingPlan([]); setShowDeepen(false); setView("smart"); };
  const startField = () => { if(!tosAccepted){setShowTos(true);return;} trackEvent('assessment_started',{type:'field'}); setMode("field"); setAssessor({}); setAqi(0); setSource({}); setSqi(0); setBuilding({}); setBqi(0); setPhotos({}); setLabResults([]); setEvaluation(null); setChains([]); setSamplingPlan([]); setRecs(null); setView("assessor"); };
  const startLab = () => { if(!tosAccepted){setShowTos(true);return;} trackEvent('assessment_started',{type:'lab'}); setMode("lab"); setLabResults([]); setSource({}); setBuilding({}); setEvaluation(null); setChains([]); setRecs(null); setView("labentry"); };

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
    // State-limit overlay (Phase 3): surface stricter-than-federal exceedances
    // for the selected state, in addition to the federal evaluation.
    const stateEx = applyStateOverlay(labResults, selState);
    setStateExceed(stateEx);
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

  // Phase 4 — generate the DOCX Water Quality Assessment Report (client-side)
  const [reporting, setReporting] = useState(false);
  const generateReport = async () => {
    if (reporting) return;
    setReporting(true);
    try {
      const model = buildReportModel({ assessor, source, building, labResults, evaluation, chains, samplingPlan, recs, stateExceed, selState, coc });
      // Lazy-load the docx builder so its weight stays out of the initial bundle.
      const { getReportDocxBlob } = await import('../report/DocxReport');
      const blob = await getReportDocxBlob(model);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${model.meta.reportId}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
      trackEvent('report_generated', { tier: evaluation?.tier, parameters: evaluation?.findings?.length });
      haptic("success");
    } catch (e) {
      haptic("error");
      alert("Could not generate the report. Please try again.");
    } finally {
      setReporting(false);
    }
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
          <span style={{fontSize:12,color:"#8B95A8",fontFamily:"var(--font-mono)"}}>{qIdx+1} of {visQs.length}</span>
          <span style={{fontSize:12,color:"#14B8A6",fontFamily:"var(--font-mono)",fontWeight:600}}>{progress}%</span>
        </div>
        <div style={{height:4,background:"#12161D",borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${progress}%`,background:"linear-gradient(90deg,#0D9488,#14B8A6)",borderRadius:2,transition:"width .4s ease",boxShadow:"0 0 8px #14B8A640"}} />
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:24,flexWrap:"wrap"}}>
        {secs.map((s,i)=><span key={s} style={{padding:"7px 14px",borderRadius:20,fontSize:12,fontWeight:600,fontFamily:"var(--font-mono)",background:i===secIdx?"#14B8A615":"transparent",color:i===secIdx?"#14B8A6":i<secIdx?"#8B95A8":"#3A4050",border:`1px solid ${i===secIdx?"#14B8A630":"transparent"}`}}>{s}</span>)}
      </div>
      <div key={q.id} style={{animation:"fadeUp .4s cubic-bezier(.22,1,.36,1)"}}>
        <div style={{width:52,height:52,borderRadius:14,background:"#14B8A610",border:"1px solid #14B8A620",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,marginBottom:18}}>{q.ic}</div>
        <h2 style={{fontSize:26,fontWeight:700,lineHeight:1.25,margin:0,marginBottom:8,letterSpacing:"-0.5px"}}>{q.q}</h2>
        {q.ref&&<div style={{display:"inline-flex",gap:7,padding:"7px 14px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:8,marginBottom:20,marginTop:6}}><span style={{fontSize:13,color:"#14B8A6"}}>📐</span><span style={{fontSize:12,color:"#8B95A8",fontFamily:"var(--font-mono)",lineHeight:1.4}}>{q.ref}</span></div>}
        {!q.ref&&<div style={{height:16}} />}

        {q.t==="text"&&<input type="text" value={data[q.id]||""} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||"Type..."} autoFocus onKeyDown={e=>{if(e.key==="Enter"&&data[q.id])goNext();}} style={{width:"100%",padding:"16px 18px",background:"#0C1017",border:"1.5px solid #1A2030",borderRadius:12,color:"#F0F4F8",fontSize:17,fontFamily:"var(--font-sans)",fontWeight:500,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#14B8A6"} onBlur={e=>e.target.style.borderColor="#1A2030"} />}
        {q.t==="num"&&<div style={{position:"relative"}}><input type="number" value={data[q.id]||""} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||"Enter..."} autoFocus onKeyDown={e=>{if(e.key==="Enter"&&data[q.id])goNext();}} style={{width:"100%",padding:"16px 18px",paddingRight:q.u?70:18,background:"#0C1017",border:"1.5px solid #1A2030",borderRadius:12,color:"#F0F4F8",fontSize:17,fontFamily:"var(--font-sans)",fontWeight:500,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#14B8A6"} onBlur={e=>e.target.style.borderColor="#1A2030"} />{q.u&&<span style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",color:"#5E6578",fontSize:14,fontFamily:"var(--font-mono)"}}>{q.u}</span>}</div>}
        {q.t==="ch"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{q.opts.map((o,i)=>{const sel=data[q.id]===o;return(<button key={o} onClick={()=>{haptic("light");setField(q.id,o);setTimeout(goNext,250);}} style={{padding:"15px 18px",textAlign:"left",background:sel?"#14B8A612":"#0C1017",border:`1.5px solid ${sel?"#14B8A6":"#1A2030"}`,borderRadius:12,color:sel?"#14B8A6":"#E2E8F0",fontSize:16,fontFamily:"var(--font-sans)",fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:12,animation:`fadeUp .3s ${i*.04}s cubic-bezier(.22,1,.36,1) both`}}><div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${sel?"#14B8A6":"#2A3040"}`,background:sel?"#14B8A6":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{sel&&<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5L4.5 7.5L8 3" stroke="#080A0E" strokeWidth="1.5" fill="none"/></svg>}</div>{o}</button>);})}</div>}
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
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"var(--font-sans)"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}><div style={{position:"absolute",top:"-20%",left:"-10%",width:"50%",height:"50%",background:"radial-gradient(circle,#14B8A606 0%,transparent 70%)",filter:"blur(60px)"}} /><div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 1px 1px, #14B8A606 1px, transparent 0)",backgroundSize:"32px 32px"}} /></div>

      {/* Header */}
      <header style={{position:"sticky",top:0,zIndex:100,height:50,background:"#080A0EDD",backdropFilter:"blur(20px)",borderBottom:"1px solid #1A2030",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setNavOpen(!navOpen)} style={{width:38,height:38,borderRadius:10,background:"#080A0E",display:"flex",alignItems:"center",justifyContent:"center",border:"none",cursor:"pointer",padding:0}}><Logo s={34} /></button>
          <div><div style={{fontSize:15,fontWeight:600,lineHeight:1.1}}>Hydro<span style={{color:"#14B8A6",fontWeight:800}}>Scan</span></div><div style={{fontSize:11,color:"#8B95A8",fontFamily:"var(--font-mono)"}}>by Prudence EHS</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{textAlign:"right",lineHeight:1.2}}>
            <div style={{fontSize:11,fontWeight:600,color:"#F0F4F8",fontFamily:"var(--font-mono)"}}>{clock.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
            <div style={{fontSize:9,color:"#5E6578",fontFamily:"var(--font-mono)"}}>{clock.toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"})}</div>
          </div>
          <button onClick={()=>{setTourStep(0);setShowTour(true);}} style={{width:30,height:30,borderRadius:8,border:"1px solid #1A2030",background:"transparent",color:"#5E6578",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-mono)"}}>?</button>
          {view!=="dash"&&<button onClick={()=>setView("dash")} style={{background:"#1A2535",border:"1.5px solid #14B8A640",borderRadius:8,color:"#E2E8F0",fontSize:14,fontWeight:600,padding:"8px 16px",cursor:"pointer",fontFamily:"inherit"}}>← Home</button>}
        </div>
      </header>

      {/* Milestone */}
      {milestone&&<div style={{position:"fixed",inset:0,background:"#080A0EF0",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn .3s ease"}}><div style={{textAlign:"center",animation:"milestoneIn .5s cubic-bezier(.22,1,.36,1)"}}><div style={{marginBottom:16,display:"flex",justifyContent:"center"}}><div style={{width:72,height:72,borderRadius:20,background:"#14B8A612",border:"1.5px solid #14B8A630",display:"flex",alignItems:"center",justifyContent:"center"}}><I n={milestone.icon} s={36} c="#14B8A6" w={2} /></div></div><div style={{fontSize:24,fontWeight:800,color:"#F0F4F8",fontFamily:"var(--font-sans)",letterSpacing:"-0.5px"}}>{milestone.title}</div><div style={{fontSize:14,color:"#14B8A6",fontFamily:"var(--font-mono)",marginTop:8}}>{milestone.sub}</div><div style={{width:48,height:3,background:"linear-gradient(90deg,#14B8A6,#0D9488)",borderRadius:2,margin:"16px auto 0",animation:"milestoneBar 1.2s ease"}} /></div></div>}

      {/* Collection Guide Overlay */}
      {showGuide&&COLLECTION_GUIDES[showGuide]&&(
        <div style={{position:"fixed",inset:0,background:"#000000DD",zIndex:250,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowGuide(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0C1017",border:"1px solid #1A2030",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"88vh",overflow:"auto",padding:"24px 20px 40px",animation:"slideUp .3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:"var(--font-sans)"}}>{COLLECTION_GUIDES[showGuide].title}</div>
              <button onClick={()=>setShowGuide(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid #1A2030",background:"transparent",color:"#8B95A8",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{fontSize:12,color:"#14B8A6",fontFamily:"var(--font-mono)",marginBottom:20}}>{COLLECTION_GUIDES[showGuide].std}</div>

            {COLLECTION_GUIDES[showGuide].steps.map((step,i) => (
              <div key={i} style={{display:"flex",gap:14,marginBottom:14}}>
                <div style={{width:36,height:36,borderRadius:10,background:"#14B8A610",border:"1px solid #14B8A620",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,fontWeight:800,color:"#14B8A6",fontFamily:"var(--font-mono)"}}>{step.n}</div>
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
          <button onClick={()=>{setPricingOpen(true);setNavOpen(false);}} style={{background:"none",border:"none",color:"#14B8A6",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"6px 0",display:"flex",alignItems:"center",gap:8}}><I n="bolt" s={14} c="#14B8A6" />Plans & Pricing</button>
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
            <div style={{fontSize:20,fontWeight:800,fontFamily:"var(--font-sans)"}}>Terms of Service</div>
            {tosAccepted&&<button onClick={()=>setShowTos(false)} style={{width:32,height:32,borderRadius:8,border:"1px solid #1A2030",background:"transparent",color:"#8B95A8",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>}
          </div>
          <div style={{fontSize:12,color:"#8B95A8",fontFamily:"var(--font-mono)",marginBottom:20}}>Last updated: April 2026 · HydroScan by Prudence Safety & Environmental Consulting, LLC</div>
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
          {!tosAccepted?<button onClick={acceptTos} style={{width:"100%",padding:"16px 0",background:"linear-gradient(135deg,#0D9488,#14B8A6)",border:"none",borderRadius:12,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:12}}>I Accept These Terms</button>:<div style={{textAlign:"center",fontSize:13,color:"#22C55E",fontFamily:"var(--font-mono)"}}>✓ Accepted</div>}
        </div>
      </div>}

      {/* Panel Overlay (About, Settings, Privacy, FAQ, Feedback) */}
      {panel&&<div style={{position:"fixed",inset:0,background:"#000000DD",zIndex:250,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setPanel(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#0C1017",border:"1px solid #1A2030",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"88vh",overflow:"auto",padding:"24px 20px 40px",animation:"slideUp .3s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{fontSize:18,fontWeight:700,fontFamily:"var(--font-sans)"}}>{panel==="about"?"About":panel==="settings"?"Settings":panel==="privacy"?"Privacy Policy":panel==="faq"?"FAQ & Glossary":"Send Feedback"}</div>
            <button onClick={()=>setPanel(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid #1A2030",background:"transparent",color:"#8B95A8",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>

          {panel==="about"&&<div>
            <div style={{textAlign:"center",marginBottom:24}}><Logo s={56} /><div style={{fontSize:28,fontWeight:800,fontFamily:"var(--font-sans)",marginTop:8}}>Hydro<span style={{color:"#14B8A6"}}>Scan</span></div><div style={{fontSize:12,color:"#8B95A8",fontFamily:"var(--font-mono)",marginTop:4}}>by Prudence EHS · v{VER}</div></div>
            <div style={{fontSize:14,color:"#8B95A8",lineHeight:1.7,marginBottom:16}}>HydroScan is a standards-driven drinking water assessment platform. It evaluates lab results against EPA, WHO, and state-specific standards, generates hypothesis-driven sampling plans, and provides defensible documentation for private wells and building water systems.</div>
            {[{l:"Developed by",v:"Prudence Safety & Environmental Consulting, LLC"},{l:"Location",v:"Germantown, MD"},{l:"Website",v:"prudencesafety.com"},{l:"Standards",v:"EPA SDWA MCLs · PFAS NPDWR 2024 · Lead & Copper Rule · WHO GDWQ · ASHRAE 188 · EPA 3Ts"},{l:"Parameters",v:"50+ including 6 PFAS with Hazard Index calculation"}].map((r,i)=><div key={i} style={{display:"flex",gap:12,marginBottom:8,fontSize:13}}><span style={{color:"#5E6578",fontFamily:"var(--font-mono)",fontSize:11,minWidth:85,flexShrink:0}}>{r.l}</span><span style={{color:"#C8D0DC",lineHeight:1.5}}>{r.v}</span></div>)}
          </div>}

          {panel==="settings"&&<div>
            <div style={{fontSize:13,color:"#8B95A8",marginBottom:16}}>These defaults auto-populate when you start assessments.</div>
            {[{k:"name",l:"Your Name & Credentials",ph:"e.g. T. Tamakloe, CSP"},{k:"firm",l:"Company",ph:"e.g. Prudence Safety & Environmental Consulting"},{k:"phone",l:"Phone",ph:"Contact number"},{k:"instrument",l:"Field Meter",ph:"e.g. Hach HQ40d"},{k:"calDate",l:"Meter Calibration Date",ph:"e.g. 2026-03-01"}].map(f=><div key={f.k} style={{marginBottom:12}}><div style={{fontSize:12,fontWeight:600,color:"#C8D0DC",marginBottom:4}}>{f.l}</div><input value={userSettings[f.k]||""} onChange={e=>setUserSettings(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} style={{width:"100%",padding:"12px 14px",background:"#12161D",border:"1px solid #1A2030",borderRadius:8,color:"#F0F4F8",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>)}
            <button onClick={()=>{saveUserSettings(userSettings);setPanel(null);}} style={{width:"100%",padding:"14px 0",background:"linear-gradient(135deg,#0D9488,#14B8A6)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:8}}>Save Settings</button>
            {user&&<div style={{marginTop:14,padding:"12px 14px",borderRadius:R.md,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:12.5,color:"var(--sub)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Signed in · {user.email}</div><button onClick={()=>signOut()} style={{background:"none",border:"1px solid var(--border)",borderRadius:R.sm,color:"var(--accent)",fontSize:12,fontWeight:700,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Sign Out</button></div>}
            <div style={{textAlign:"center",marginTop:16}}><button onClick={async()=>{if(confirm("Clear all data?")){await STO.del("hydroscan-idx");await STO.del("hydroscan-visited");await STO.del("hydroscan-tos");await STO.del("hydroscan-settings");await STO.del("hydroscan-history");location.reload();}}} style={{background:"none",border:"none",color:"#EF4444",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Clear All Data & Reset</button></div>
          </div>}

          {panel==="privacy"&&<div>
            {[{t:"Data Collection",b:"HydroScan collects only the data you actively enter. We do not collect analytics, tracking data, or browsing behavior."},{t:"Data Storage",b:"All data is stored locally on your device. Nothing is uploaded to PSEC servers unless you explicitly export it."},{t:"Data Sharing",b:"PSEC does not sell, share, or disclose your data to any third party."},{t:"Photo & Document Data",b:"Photos and COC forms are stored locally. PSEC never accesses your files."},{t:"Children's Privacy",b:"HydroScan is a professional tool not intended for use by individuals under 18."},{t:"Contact",b:"Privacy inquiries: prudencesafety.com"}].map((s,i)=><div key={i} style={{marginBottom:14}}><div style={{fontSize:14,fontWeight:700,color:"#F0F4F8",marginBottom:3}}>{s.t}</div><div style={{fontSize:13,color:"#8B95A8",lineHeight:1.7}}>{s.b}</div></div>)}
          </div>}

          {panel==="faq"&&<div>
            <div style={{fontSize:14,fontWeight:700,color:"#14B8A6",marginBottom:12}}>Frequently Asked Questions</div>
            {[{q:"What does HydroScan do?",a:"It helps you figure out what to test in your water, how to collect samples correctly, and what your lab results mean — all based on EPA and WHO standards."},{q:"Do I need to be an expert to use it?",a:"No. The Quick Assessment asks 4 simple questions and gives you a sampling plan. If you need deeper analysis, the full professional walkthrough is one tap away."},{q:"Does it replace a water quality professional?",a:"No. HydroScan is a tool that helps professionals work faster and helps non-experts understand their results. For health complaints or legal situations, a CIH or qualified EHS professional should review the findings."},{q:"What is an MCL?",a:"Maximum Contaminant Level — the highest level of a contaminant allowed in drinking water, set by the EPA. If your result is above the MCL, it's a violation that needs action."},{q:"What are PFAS?",a:"Per- and polyfluoroalkyl substances, also called 'forever chemicals.' They're found near military bases, airports, and industrial sites. EPA set limits for 6 PFAS compounds in 2024."},{q:"Is my data private?",a:"Yes. Everything stays on your device. We don't collect, store, or sell any of your data."}].map((f,i)=><div key={i} style={{marginBottom:12,padding:"14px 16px",background:"#12161D",borderRadius:10}}><div style={{fontSize:14,fontWeight:600,color:"#E2E8F0",marginBottom:4}}>{f.q}</div><div style={{fontSize:13,color:"#8B95A8",lineHeight:1.6}}>{f.a}</div></div>)}
            <div style={{fontSize:14,fontWeight:700,color:"#14B8A6",marginTop:20,marginBottom:12}}>Glossary</div>
            {[{t:"MCL",d:"Maximum Contaminant Level — legal limit for contaminants in drinking water"},{t:"MCLG",d:"Maximum Contaminant Level Goal — non-enforceable health goal (zero for carcinogens)"},{t:"Action Level",d:"Concentration that triggers required treatment (e.g., Lead at 15 µg/L)"},{t:"PFAS",d:"Per- and polyfluoroalkyl substances — 'forever chemicals' regulated since 2024"},{t:"Hazard Index",d:"EPA method for evaluating health risk from a mixture of PFAS compounds"},{t:"COC",d:"Chain of Custody — document tracking sample handling from collection to lab"},{t:"SMCL",d:"Secondary MCL — aesthetic guideline (taste, odor, color), not health-based"},{t:"ppt",d:"Parts per trillion — unit used for PFAS (1 ppt = 1 nanogram per liter)"},{t:"NTU",d:"Nephelometric Turbidity Units — measures water cloudiness"},{t:"CIH",d:"Certified Industrial Hygienist — gold standard credential for IH professionals"}].map((g,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:6,fontSize:13}}><span style={{color:"#14B8A6",fontWeight:700,fontFamily:"var(--font-mono)",fontSize:12,minWidth:65,flexShrink:0}}>{g.t}</span><span style={{color:"#8B95A8",lineHeight:1.5}}>{g.d}</span></div>)}
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
              <div style={{fontSize:24,fontWeight:800,fontFamily:"var(--font-sans)",letterSpacing:"-0.5px",marginBottom:6}}>{TOUR[tourStep].title}</div>
              <div style={{fontSize:14,color:"#14B8A6",fontFamily:"var(--font-mono)",marginBottom:16}}>{TOUR[tourStep].sub}</div>
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

      <div style={{maxWidth:620,margin:"0 auto",padding:"0 16px 88px",position:"relative",zIndex:1}}>

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
                    <div style={{fontSize:11,color:"#5E6578",fontFamily:"var(--font-mono)",marginTop:3}}>by Prudence EHS · v{VER}</div>
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
                  <div style={{fontSize:22,fontWeight:800,fontFamily:"var(--font-mono)",color:"#14B8A6"}}>{history.length}</div>
                  <div style={{fontSize:10,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Evaluations</div>
                </div>
                <div style={{padding:"14px 10px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:800,fontFamily:"var(--font-mono)",color:history.filter(h=>h.tier==="immediate").length?"#EF4444":"#22C55E"}}>{history.filter(h=>h.tier==="immediate"||h.tier==="advisory").length}</div>
                  <div style={{fontSize:10,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Flagged</div>
                </div>
                <div style={{padding:"14px 10px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:800,fontFamily:"var(--font-mono)",color:"#8B95A8"}}>{history.reduce((a,h)=>a+h.violations.length,0)}</div>
                  <div style={{fontSize:10,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Violations</div>
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
              <span style={{fontSize:11,color:"#22C55E",fontWeight:600,fontFamily:"var(--font-mono)"}}>FREE</span>
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
              <div style={{fontSize:11,fontWeight:600,color:"#5E6578",textTransform:"uppercase",letterSpacing:2,fontFamily:"var(--font-mono)",marginBottom:10}}>Capabilities</div>
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
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:16,animation:"fadeUp .5s .3s ease both"}}>{["EPA SDWA","PFAS NPDWR 2024","Lead & Copper Rule","WHO GDWQ","ASHRAE 188","EPA 3Ts","AIHA"].map(s=><span key={s} style={{padding:"3px 9px",background:"#14B8A608",border:"1px solid #14B8A615",borderRadius:18,fontSize:11,fontFamily:"var(--font-mono)",color:"#14B8A680"}}>{s}</span>)}</div>
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
            <div style={{fontSize:12,fontWeight:600,color:"#14B8A6",textTransform:"uppercase",letterSpacing:2,fontFamily:"var(--font-mono)",marginBottom:12}}>Sampling Recommendations</div>
            <div style={{padding:"12px 16px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12,marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:700}}>{source.src_type?.includes("well")?"Private Well":"Building"} — {building.b_type||"Assessment"}</div>
              <div style={{fontSize:12,color:"#5E6578",fontFamily:"var(--font-mono)",marginTop:4}}>{clock.toLocaleDateString()} · {assessor.a_name || "Assessor"} · {samplingPlan.length} recommendation{samplingPlan.length!==1?"s":""}</div>
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
                <div style={{fontSize:11,color:"#14B8A6",fontFamily:"var(--font-mono)",marginTop:6}}>{sp.std}</div>
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
            <div style={{fontSize:12,fontWeight:600,color:"#8B5CF6",textTransform:"uppercase",letterSpacing:2,fontFamily:"var(--font-mono)",marginBottom:12}}>Lab Results Entry</div>

            {/* State-specific standards selector */}
            <div style={{marginBottom:16,padding:"14px 16px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:12}}>
              <div style={{fontSize:12,fontWeight:600,color:"#C8D0DC",marginBottom:6}}>Jurisdiction (for state-specific standards)</div>
              <select value={selState} onChange={e=>setSelState(e.target.value)} style={{width:"100%",padding:"10px 14px",background:"#12161D",border:"1px solid #1A2030",borderRadius:8,color:"#F0F4F8",fontSize:14,fontFamily:"inherit"}}>
                <option value="">Federal (EPA) standards only</option>
                {Object.entries(STATE_STDS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              {selState&&<div style={{fontSize:11,color:"#FBBF24",fontFamily:"var(--font-mono)",marginTop:6}}>State standards will be applied in addition to federal MCLs where stricter</div>}
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
                        <div style={{fontSize:10,color:"#5E6578",fontFamily:"var(--font-mono)"}}>{ref?`Limit: ${typeof param.smcl==="object"?`${param.smcl.min}–${param.smcl.max}`:ref} ${param.unit}`:param.unit}</div>
                      </div>
                      {param.unit==="P/A"?(
                        <div style={{display:"flex",gap:4}}>
                          {["A","P"].map(v=><button key={v} onClick={()=>updateLabResult(r.id,"qualifier",v)} style={{padding:"6px 12px",borderRadius:6,background:r.qualifier===v?(v==="P"?"#EF444420":"#22C55E20"):"#12161D",border:`1px solid ${r.qualifier===v?(v==="P"?"#EF4444":"#22C55E"):"#1A2030"}`,color:r.qualifier===v?(v==="P"?"#EF4444":"#22C55E"):"#8B95A8",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{v==="A"?"Absent":"Present"}</button>)}
                        </div>
                      ):(
                        <input type="number" value={r.value} onChange={e=>updateLabResult(r.id,"value",e.target.value)} placeholder="Result" style={{width:90,padding:"8px 10px",background:"#12161D",border:"1px solid #1A2030",borderRadius:6,color:"#F0F4F8",fontSize:14,fontFamily:"var(--font-mono)",outline:"none",textAlign:"right"}} />
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
              <div style={{fontSize:12,color:"#8B95A8",textTransform:"uppercase",fontFamily:"var(--font-mono)",letterSpacing:2,marginBottom:10}}>Water Quality Classification</div>
              <div style={{fontSize:32,fontWeight:800,color:tierColor(evaluation.tier),fontFamily:"var(--font-sans)",letterSpacing:"-1px"}}>{tierLabel(evaluation.tier)}</div>
              <div style={{fontSize:13,color:"#8B95A8",fontFamily:"var(--font-mono)",marginTop:8}}>{evaluation.findings.length} parameters · {evaluation.findings.filter(f=>f.violations.length>0).length} violations · {evaluation.findings.filter(f=>f.advisories.length>0).length} advisories</div>
            </div>

            {/* Phase 3 — state-limit overlay (advisory) */}
            {stateExceed.length>0&&(
              <div style={{marginBottom:14,padding:"12px 14px",borderRadius:R.md,background:"color-mix(in srgb, var(--warn) 10%, transparent)",border:"1px solid color-mix(in srgb, var(--warn) 30%, transparent)"}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"var(--warn)",marginBottom:6}}>State limit exceedances · {selState}</div>
                {stateExceed.map((x,i)=>(<div key={i} style={{fontSize:12.5,color:"var(--text)",lineHeight:1.6}}>• {x.parameter}: {x.value} {x.unit} exceeds {x.program} limit of {x.stateLimit} {x.unit}{x.stricterThanFederal?" (stricter than federal)":""}</div>))}
              </div>
            )}

            {/* Phase 3 — readiness gate (advisory; never blocks issuance) */}
            {(()=>{ const rd=buildReadiness({assessor,source,building,labResults,evaluation}); if(!rd.blockers.length) return null; return (
              <div style={{marginBottom:14,padding:"12px 14px",borderRadius:R.md,background:"var(--surface)",border:"1px solid var(--border)"}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:rd.ready?"var(--accent)":"var(--warn)",marginBottom:6}}>Readiness — {rd.ready?"no blocking gaps":"review gaps"} <span style={{color:"var(--dim)",fontWeight:600}}>(advisory)</span></div>
                {rd.blockers.map((b,i)=>(<div key={i} style={{fontSize:12,color:"var(--sub)",lineHeight:1.6}}>• <span style={{color:b.tier==="hard"?"var(--warn)":"var(--sub)"}}>{b.message}</span> <span style={{color:"var(--dim)"}}>— {b.fixLocation}</span></div>))}
              </div>
            );})()}

            {/* Phase 4 — DOCX report drafting */}
            <button onClick={generateReport} disabled={reporting} style={{width:"100%",marginBottom:14,padding:"13px 0",borderRadius:R.md,border:"none",cursor:reporting?"default":"pointer",background:reporting?"var(--border)":"var(--accent-fill)",color:reporting?"var(--dim)":"var(--on-accent-fill)",fontSize:14,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <I n="download" s={17} c={reporting?"var(--dim)":"var(--on-accent-fill)"} />{reporting?"Generating…":"Generate Report (DOCX)"}
            </button>

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
                        <span style={{fontSize:14,fontWeight:800,fontFamily:"var(--font-mono)",color}}>{f.qualifier==="P"||f.qualifier==="A"?(f.qualifier==="P"?"DETECTED":"NOT DETECTED"):`${f.value} ${f.param.unit}`}</span>
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
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:`${sevColor(ch.severity)}15`,color:sevColor(ch.severity),fontFamily:"var(--font-mono)",fontWeight:600}}>{ch.confidence}</span>
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
                    <div style={{fontSize:12,color:"#5E6578",fontFamily:"var(--font-mono)",marginTop:10}}>{history.length} evaluation{history.length!==1?"s":""} on record</div>
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
                              <span style={{fontSize:12,fontFamily:"var(--font-mono)",color:trend>0?"#EF4444":trend<0?"#22C55E":"#8B95A8"}}>{trend>0?"↑":"↓"} {Math.abs(trend).toFixed(2)} {param.unit}</span>
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
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#5E6578",fontFamily:"var(--font-mono)"}}>
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
                <div style={{fontSize:12,fontWeight:600,color:"#14B8A6",textTransform:"uppercase",letterSpacing:2,fontFamily:"var(--font-mono)"}}>Chain of Custody</div>
                <div style={{fontSize:11,color:"#5E6578",fontFamily:"var(--font-mono)",marginTop:2}}>Drinking Water Samples</div>
              </div>
              <button onClick={()=>window.print()} style={{padding:"8px 16px",background:"#14B8A615",border:"1px solid #14B8A630",borderRadius:8,color:"#14B8A6",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}><I n="download" s={14} c="#14B8A6" />Print</button>
            </div>

            {/* Header */}
            <div style={{padding:"16px 20px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:"14px 14px 0 0",display:"flex",alignItems:"center",gap:12}}>
              <Logo s={32} />
              <div><div style={{fontSize:16,fontWeight:800}}>Hydro<span style={{color:"#14B8A6"}}>Scan</span></div><div style={{fontSize:10,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Chain of Custody · Prudence EHS</div></div>
              <div style={{marginLeft:"auto",textAlign:"right",fontSize:10,color:"#5E6578",fontFamily:"var(--font-mono)"}}>{clock.toLocaleDateString()}<br/>{clock.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
            </div>

            {/* Project Info */}
            <div style={{padding:"14px 18px",background:"#0C1017",border:"1px solid #1A2030",borderTop:"none"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#14B8A6",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Project Information</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[{k:"project",l:"Project"},{k:"client",l:"Client"},{k:"siteAddr",l:"Site Address",span:true},{k:"sampler",l:"Sampler"},{k:"samplerCo",l:"Company"},{k:"samplerPhone",l:"Phone"},{k:"samplerEmail",l:"Email"},{k:"labName",l:"Laboratory"},{k:"labAcct",l:"Lab Acct #"},{k:"labAccred",l:"Lab Accreditation (NELAP/TNI)"},{k:"labISO",l:"ISO/IEC 17025?"},{k:"turnaround",l:"TAT"},{k:"dataPackage",l:"Data Package Level"}].map(f=>(
                  <div key={f.k} style={f.span?{gridColumn:"1/-1"}:{}}>
                    <div style={{fontSize:9,color:"#5E6578",fontFamily:"var(--font-mono)",marginBottom:2}}>{f.l}</div>
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
                <div style={{flex:1}}><div style={{fontSize:9,color:"#5E6578",fontFamily:"var(--font-mono)",marginBottom:2}}>Tamper-Evident Seals</div><select value={coc.tamperSeals||""} onChange={e=>setCoc(p=>({...p,tamperSeals:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit"}}><option>Yes — applied to all bottles</option><option>Yes — applied to cooler only</option><option>No seals used</option></select></div>
                <div style={{flex:1}}><div style={{fontSize:9,color:"#5E6578",fontFamily:"var(--font-mono)",marginBottom:2}}>Seal Condition on Receipt</div><select value={coc.sealCondition||""} onChange={e=>setCoc(p=>({...p,sealCondition:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit"}}><option value="">Lab use</option><option>Intact</option><option>Broken / compromised</option></select></div>
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
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>ID</div><input value={s.id} onChange={e=>updateCocSample(i,"id",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#14B8A6",fontSize:11,fontFamily:"var(--font-mono)",fontWeight:700,outline:"none",boxSizing:"border-box"}} /></div>
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Collected</div><input type="datetime-local" value={s.datetime} onChange={e=>updateCocSample(i,"datetime",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Matrix</div><select value={s.matrix} onChange={e=>updateCocSample(i,"matrix",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit"}}><option>Drinking Water</option><option>Groundwater</option><option>Surface Water</option></select></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:5}}>
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Location</div><input value={s.location} onChange={e=>updateCocSample(i,"location",e.target.value)} placeholder="Kitchen cold, first draw" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                    <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Container / Preservative</div><input value={s.preservative} onChange={e=>updateCocSample(i,"preservative",e.target.value)} placeholder="250mL HDPE / HNO₃" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                  </div>
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Analyses Requested</div><input value={s.analyses} onChange={e=>updateCocSample(i,"analyses",e.target.value)} placeholder="Lead, Copper, pH — EPA 200.8" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                </div>
              ))}
            </div>

            {/* Special Instructions + Receipt */}
            <div style={{padding:"14px 18px",background:"#0C1017",border:"1px solid #1A2030",borderTop:"none"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#14B8A6",textTransform:"uppercase",letterSpacing:1.5,marginBottom:6}}>Instructions & Receipt</div>
              <textarea value={coc.specialInstructions} onChange={e=>setCoc(p=>({...p,specialInstructions:e.target.value}))} placeholder="Stagnation: 8 hrs. First-draw per EPA 3Ts. Include field blank." rows={2} style={{width:"100%",padding:"8px 10px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit",outline:"none",resize:"vertical",boxSizing:"border-box",marginBottom:6}} />
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <div><div style={{fontSize:9,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Temp on Receipt (°C)</div><input value={coc.tempOnReceipt||""} onChange={e=>setCoc(p=>({...p,tempOnReceipt:e.target.value}))} placeholder="Lab use" style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                <div><div style={{fontSize:9,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Cooler Intact?</div><select value={coc.coolerIntegrity||""} onChange={e=>setCoc(p=>({...p,coolerIntegrity:e.target.value}))} style={{width:"100%",padding:"7px 8px",background:"#12161D",border:"1px solid #1A2030",borderRadius:5,color:"#F0F4F8",fontSize:12,fontFamily:"inherit"}}><option value="">Lab use</option><option>Intact — ice present</option><option>Intact — no ice</option><option>Compromised</option></select></div>
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
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Relinquished By</div><input value={c.from} onChange={e=>updateCustody(i,"from",e.target.value)} placeholder="Name / Signature" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Date/Time</div><input type="datetime-local" value={c.fromDate} onChange={e=>updateCustody(i,"fromDate",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Received By</div><input value={c.to} onChange={e=>updateCustody(i,"to",e.target.value)} placeholder="Name / Signature" style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
                  <div><div style={{fontSize:8,color:"#5E6578",fontFamily:"var(--font-mono)"}}>Date/Time</div><input type="datetime-local" value={c.toDate} onChange={e=>updateCustody(i,"toDate",e.target.value)} style={{width:"100%",padding:"5px 6px",background:"#0C1017",border:"1px solid #1A2030",borderRadius:4,color:"#F0F4F8",fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} /></div>
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

      {/* Plans & pricing (Phase 6) */}
      <PricingSheet open={pricingOpen} onClose={()=>setPricingOpen(false)} currentPlan="free" />

      {/* Marlow AI — streaming water-quality assistant (Phase 2) */}
      <MarlowAssistant
        open={marlowOpen}
        onClose={()=>setMarlowOpen(false)}
        context={{ view, source, building, findings: evaluation?.findings, tier: evaluation?.tier, samplingPlan }}
      />

      {/* Bottom navigation — token-driven primary nav (AtmosFlow pattern) */}
      {!showTour&&(()=>{
        const ASSESS_VIEWS=["smart","smartresults","assessor","source","building","fieldresults"];
        const REPORT_VIEWS=["labentry","labresults","coc"];
        const NAV=[
          {k:"home",label:"Home",icon:"home",active:view==="dash"&&!marlowOpen,onTap:()=>{setMarlowOpen(false);setPanel(null);setView("dash");}},
          {k:"assess",label:"Assess",icon:"search",active:ASSESS_VIEWS.includes(view)&&!marlowOpen,onTap:()=>{setMarlowOpen(false);setPanel(null);setView("smart");}},
          {k:"reports",label:"Reports",icon:"clip",active:REPORT_VIEWS.includes(view)&&!marlowOpen,onTap:()=>{setMarlowOpen(false);setPanel(null);setView(evaluation?"labresults":"labentry");}},
          {k:"marlow",label:"Marlow",icon:"pulse",active:marlowOpen,onTap:()=>setMarlowOpen(true),accent:true},
          {k:"settings",label:"Settings",icon:"user",active:panel==="settings",onTap:()=>{setMarlowOpen(false);setPanel("settings");}},
        ];
        return (
          <nav style={{position:"fixed",left:0,right:0,bottom:0,zIndex:120,display:"flex",justifyContent:"center",background:"color-mix(in srgb, var(--surface) 92%, transparent)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:`1px solid var(--border)`,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
            <div style={{width:"100%",maxWidth:620,display:"flex",alignItems:"stretch"}}>
              {NAV.map(t=>{
                const col=t.active?"var(--accent)":"var(--dim)";
                return (
                  <button key={t.k} onClick={t.onTap} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"9px 4px 10px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
                    {t.accent?(
                      <div style={{width:34,height:34,marginTop:-2,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",background:t.active?"var(--accent-fill)":"color-mix(in srgb, var(--accent) 16%, transparent)",border:t.active?"none":"1px solid color-mix(in srgb, var(--accent) 32%, transparent)",boxShadow:t.active?"0 4px 14px color-mix(in srgb, var(--accent) 45%, transparent)":"none"}}>
                        <I n={t.icon} s={18} c={t.active?"var(--on-accent-fill)":"var(--accent)"} w={2} />
                      </div>
                    ):(
                      <I n={t.icon} s={20} c={col} w={1.9} />
                    )}
                    <span style={{fontSize:10.5,fontWeight:t.active?700:500,color:col,letterSpacing:"0.2px"}}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        );
      })()}
    </div>
  );
}
