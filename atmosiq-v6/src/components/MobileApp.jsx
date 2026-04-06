/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MobileApp — v5-style field experience with profile login + three-tier questions
 * Flow: Profile → Dashboard → Quick Start → Zone Walkthrough → Details (optional) → Results
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import STO from '../utils/storage'
import Profiles from '../utils/profiles'
import SupaStorage from '../utils/supabaseStorage'
import { supabase } from '../utils/supabaseClient'
import { VER } from '../constants/standards'
import { Q_PRESURVEY, Q_BUILDING, Q_ZONE, Q_QUICKSTART, Q_DETAILS, SENSOR_FIELDS } from '../constants/questions'
import { scoreZone, compositeScore, evalOSHA, calcVent, genRecs } from '../engines/scoring'
import { generateSamplingPlan } from '../engines/sampling'
import { buildCausalChains } from '../engines/causalChains'
import { generateNarrative } from '../engines/narrative'
import { I } from './Icons'
import Particles from './Particles'
import Loading from './Loading'
import ScoreRing from './ScoreRing'
import PhotoCapture from './PhotoCapture'
import SensorScreen from './SensorScreen'
import ProfileScreen from './ProfileScreen'
import AuthScreen from './AuthScreen'
import { DEMO_PRESURVEY, DEMO_BUILDING, DEMO_ZONES } from '../constants/demoData'

const haptic = (type) => { try { if (navigator.vibrate) navigator.vibrate(type === 'heavy' ? [30,20,30] : type === 'success' ? [10,30,10,30,10] : 12) } catch {} }
const fD = ts => ts ? new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''
const sv = sev => ({critical:{c:'#EF4444',bg:'#EF444418',l:'CRITICAL'},high:{c:'#FB923C',bg:'#FB923C18',l:'HIGH'},medium:{c:'#FBBF24',bg:'#FBBF2418',l:'MEDIUM'},low:{c:'#22D3EE',bg:'#22D3EE15',l:'LOW'},pass:{c:'#22C55E',bg:'#22C55E15',l:'PASS'},info:{c:'#94A3B8',bg:'#94A3B815',l:'INFO'}}[sev]||{c:'#94A3B8',bg:'#94A3B815',l:''})
const badge = (risk,rc) => <span style={{padding:'6px 16px',background:`${rc}18`,border:`1px solid ${rc}35`,borderRadius:20,fontSize:13,fontWeight:700,color:rc}}>{risk}</span>

const BG = '#060609'
const SURFACE = '#0C0C14'
const CARD = '#101018'
const BORDER = '#1E1E2E'
const ACCENT = '#22D3EE'
const TEXT = '#F0F2F5'
const SUB = '#9BA4B5'
const DIM = '#6B7280'

export default function MobileApp() {
  const [loading, setLoading] = useState(true)
  const [isReturning, setIsReturning] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profileChecked, setProfileChecked] = useState(false)
  // views: dash|quickstart|zone|details|results|history|drafts|report
  const [view, setView] = useState('dash')
  const [milestone, setMilestone] = useState(null)
  const [clock, setClock] = useState(new Date())

  const [draftId, setDraftId] = useState(null)
  // Combined data store: quick start + details merged into presurvey + bldg
  const [presurvey, setPresurvey] = useState({})
  const [bldg, setBldg] = useState({})
  const [qsqi, setQsqi] = useState(0) // quick start question index
  const [dqi, setDqi] = useState(0)   // details question index
  const [zones, setZones] = useState([{}])
  const [curZone, setCurZone] = useState(0)
  const [zqi, setZqi] = useState(0)
  const [photos, setPhotos] = useState({})

  const [zoneScores, setZoneScores] = useState([])
  const [comp, setComp] = useState(null)
  const [oshaResult, setOshaResult] = useState(null)
  const [recs, setRecs] = useState(null)
  const [narrative, setNarrative] = useState(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [samplingPlan, setSamplingPlan] = useState(null)
  const [causalChains, setCausalChains] = useState([])
  const [rTab, setRTab] = useState('overview')
  const [selZone, setSelZone] = useState(0)

  const [index, setIndex] = useState({reports:[],drafts:[]})
  const [viewRpt, setViewRpt] = useState(null)
  const [delConf, setDelConf] = useState(null)
  const [zonePrompt, setZonePrompt] = useState(false)
  const [hSearch, setHSearch] = useState('')
  const [hSort, setHSort] = useState('newest')

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(t) }, [])

  // Check for existing auth on load
  useEffect(() => {
    (async () => {
      const v = await STO.hasVisited()
      setIsReturning(!!v)
      const idx = await STO.getIndex()
      setIndex(idx)
      await STO.markVisited()
      // Try Supabase auth first, fall back to local profiles
      if (supabase) {
        const user = await SupaStorage.getUser()
        if (user) {
          const p = await SupaStorage.getProfile()
          if (p) setProfile(p)
          else setProfile({ id: user.id, name: user.email, isNew: true })
          // Sync offline changes
          SupaStorage.processSyncQueue()
        }
      } else {
        const activeProfile = await Profiles.getActiveProfile()
        if (activeProfile) setProfile(activeProfile)
      }
      setProfileChecked(true)
    })()
  }, [])

  // Listen for Supabase auth changes
  useEffect(() => {
    return SupaStorage.onAuthChange((event, session) => {
      if (event === 'SIGNED_OUT') { setProfile(null); setView('dash') }
    })
  }, [])

  const refreshIndex = async () => { setIndex(await STO.getIndex()) }

  const handleLogin = async (userOrProfile) => {
    // From Supabase AuthScreen
    if (userOrProfile?.email && supabase) {
      const p = await SupaStorage.getProfile()
      if (p) setProfile(p)
      else setProfile({ id: userOrProfile.id, name: userOrProfile.email, isNew: true })
      SupaStorage.fullSync()
    } else {
      // From local ProfileScreen
      setProfile(userOrProfile)
    }
  }
  const handleLogout = async () => {
    if (supabase) await SupaStorage.signOut()
    setProfile(null); setView('dash')
  }

  // Auto-save draft
  const saveRef = useRef(null)
  useEffect(() => {
    if (!['quickstart','zone','details'].includes(view) || !draftId) return
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(async () => {
      const draft = { id:draftId, presurvey, bldg, zones, photos, qsqi, dqi, curZone, zqi, ua:new Date().toISOString() }
      await STO.set(draftId, draft)
      await STO.addDraftToIndex({ id:draftId, facility:bldg.fn||'Untitled', ua:draft.ua })
      await refreshIndex()
    }, 1200)
    return () => { if (saveRef.current) clearTimeout(saveRef.current) }
  }, [presurvey, bldg, zones, photos, qsqi, dqi, curZone, zqi, view, draftId])

  // Merge quick start data into both presurvey and bldg depending on field prefix
  const mergedData = useMemo(() => ({ ...presurvey, ...bldg }), [presurvey, bldg])
  const setQSField = useCallback((id, v) => {
    // Building fields go to bldg, pre-survey fields go to presurvey
    if (['fn','fl','ft','ht','sa','ba','rn','hm','fm','fc','od','dp','bld_pressure','bld_exhaust','bld_intake_proximity','wx_temp','wx_rh','wx_sky','wx_precip','wx_wind','wx_notes'].includes(id)) {
      setBldg(p => ({...p, [id]: v}))
    } else {
      setPresurvey(p => ({...p, [id]: v}))
    }
  }, [])

  const qsVis = useMemo(() => Q_QUICKSTART.filter(q => { if (!q.cond) return true; if (q.cond.eq && mergedData[q.cond.f] !== q.cond.eq) return false; if (q.cond.ne && mergedData[q.cond.f] === q.cond.ne) return false; return true }), [mergedData])
  const dtVis = useMemo(() => Q_DETAILS.filter(q => { if (!q.cond) return true; if (q.cond.eq && mergedData[q.cond.f] !== q.cond.eq) return false; if (q.cond.ne && mergedData[q.cond.f] === q.cond.ne) return false; return true }), [mergedData])
  const zData = zones[curZone] || {}
  const zVis = useMemo(() => Q_ZONE.filter(q => { if (!q.cond) return true; if (q.cond.eq && zData[q.cond.f] !== q.cond.eq) return false; if (q.cond.ne && zData[q.cond.f] === q.cond.ne) return false; return true }), [zData])
  const setZF = useCallback((id,v) => { setZones(prev => { const next = [...prev]; next[curZone] = {...(next[curZone]||{}), [id]:v}; return next }) }, [curZone])

  const showMilestone = (icon, title, sub, nextFn) => {
    haptic('success'); setMilestone({icon, title, sub})
    setTimeout(() => { setMilestone(null); nextFn() }, 1400)
  }

  const startNew = () => {
    const id = 'draft-' + Date.now()
    setDraftId(id)
    // Auto-fill from profile
    const psFill = profile ? Profiles.toPresurvey(profile) : {}
    setPresurvey(psFill); setBldg({}); setQsqi(0); setDqi(0)
    setZones([{}]); setCurZone(0); setZqi(0); setPhotos({})
    setZoneScores([]); setComp(null); setOshaResult(null); setRecs(null); setNarrative(null); setSamplingPlan(null); setCausalChains([])
    setView('quickstart')
  }

  const runDemo = () => {
    setBldg(DEMO_BUILDING); setZones(DEMO_ZONES); setPresurvey(DEMO_PRESURVEY); setPhotos({})
    const zScores = DEMO_ZONES.map(z => scoreZone(z, DEMO_BUILDING))
    const composite = compositeScore(zScores)
    const worst = DEMO_ZONES.reduce((w, z) => (!w || scoreZone(z, DEMO_BUILDING).tot < scoreZone(w, DEMO_BUILDING).tot) ? z : w, DEMO_ZONES[0])
    const osha = evalOSHA({...DEMO_BUILDING, ...worst}, composite?.tot || 0)
    const recommendations = genRecs(zScores, DEMO_BUILDING)
    const sp = generateSamplingPlan(DEMO_ZONES, DEMO_BUILDING)
    const cc = buildCausalChains(DEMO_ZONES, DEMO_BUILDING, zScores)
    setZoneScores(zScores); setComp(composite); setOshaResult(osha); setRecs(recommendations)
    setSamplingPlan(sp); setCausalChains(cc); setSelZone(0); setRTab('overview'); setNarrative(null); setView('results')
  }

  const resumeDraft = async (id) => {
    const d = await STO.get(id)
    if (!d) return
    setDraftId(d.id); setPresurvey(d.presurvey||{}); setBldg(d.bldg||d.building||{}); setZones(d.zones||[{}]); setPhotos(d.photos||{})
    setQsqi(d.qsqi||0); setDqi(d.dqi||0); setCurZone(d.curZone||0); setZqi(d.zqi||0)
    // Resume at the right phase
    if (!d.bldg?.fn && !d.building?.fn) setView('quickstart')
    else if (d.zones?.length > 0 && d.zones[0]?.zn) setView('zone')
    else setView('quickstart')
  }

  const finishQuickStart = () => {
    if (zones.length === 0) setZones([{}])
    showMilestone('check', 'Quick Start Complete', 'Starting zone walkthrough', () => { setCurZone(0); setZqi(0); setView('zone') })
  }

  const finishAssessment = async () => {
    const zScores = zones.map(z => scoreZone(z, bldg))
    const composite = compositeScore(zScores)
    const worst = zones.reduce((w, z) => (!w || scoreZone(z, bldg).tot < scoreZone(w, bldg).tot) ? z : w, zones[0])
    const osha = evalOSHA({...bldg, ...worst}, composite?.tot || 0)
    const recommendations = genRecs(zScores, bldg)
    const sp = generateSamplingPlan(zones, bldg)
    const cc = buildCausalChains(zones, bldg, zScores)
    setZoneScores(zScores); setComp(composite); setOshaResult(osha); setRecs(recommendations)
    setSamplingPlan(sp); setCausalChains(cc); setSelZone(0); setNarrative(null)
    haptic('success')
    setMilestone({icon:'chart',title:'Assessment Complete',sub:`Scoring ${zones.length} zone${zones.length>1?'s':''}...`})
    setTimeout(() => { setMilestone(null); setRTab('overview'); setView('results') }, 1600)
    const rid = 'rpt-' + Date.now()
    const report = { id:rid, ts:new Date().toISOString(), ver:VER, presurvey, building:bldg, zones, photos, zoneScores:zScores, comp:composite, oshaEvals:[osha], recs:recommendations, samplingPlan:sp, causalChains:cc }
    await STO.set(rid, report)
    await STO.addReportToIndex({ id:rid, ts:report.ts, facility:bldg.fn, score:composite?.tot })
    if (draftId) { await STO.del(draftId) }
    await refreshIndex()
  }

  const finishDetails = () => {
    showMilestone('check', 'Details Complete', 'Assessment data updated', () => { setView('results') })
  }

  const requestNarrative = async () => {
    setNarrativeLoading(true)
    const text = await generateNarrative(bldg, zones, zoneScores, comp, oshaResult, recs)
    setNarrative(text); setNarrativeLoading(false)
  }

  const openReport = async (meta) => {
    const rpt = await STO.get(meta.id)
    if (!rpt) return
    setViewRpt(rpt); setPresurvey(rpt.presurvey||{}); setBldg(rpt.building||rpt.bldg||{}); setZones(rpt.zones||[])
    setPhotos(rpt.photos||{}); setZoneScores(rpt.zoneScores||[]); setComp(rpt.comp||rpt.composite)
    setOshaResult(rpt.oshaEvals?.[0]||rpt.osha||null); setRecs(rpt.recs||null)
    setSamplingPlan(rpt.samplingPlan||null); setCausalChains(rpt.causalChains||[])
    setSelZone(0); setRTab('overview'); setNarrative(rpt.narrative||null); setView('report')
  }

  const deleteItem = async (id, type) => {
    await STO.del(id)
    const idx = await STO.getIndex()
    if (type === 'rpt') idx.reports = (idx.reports||[]).filter(r => r.id !== id)
    else idx.drafts = (idx.drafts||[]).filter(d => d.id !== id)
    await STO.set('atmosiq-idx', idx)
    await refreshIndex(); setDelConf(null)
  }

  const fReports = useMemo(() => {
    let l = [...(index.reports||[])]
    if (hSearch) { const q = hSearch.toLowerCase(); l = l.filter(r => (r.facility||'').toLowerCase().includes(q)) }
    if (hSort === 'newest') l.sort((a,b) => new Date(b.ts)-new Date(a.ts))
    else if (hSort === 'oldest') l.sort((a,b) => new Date(a.ts)-new Date(b.ts))
    else if (hSort === 'score-low') l.sort((a,b) => (a.score||0)-(b.score||0))
    else l.sort((a,b) => (b.score||0)-(a.score||0))
    return l
  }, [index.reports, hSearch, hSort])

  const qsSecs = [...new Set(qsVis.map(q=>q.sec))]
  const dtSecs = [...new Set(dtVis.map(q=>q.sec))]
  const zSecs = [...new Set(zVis.map(q=>q.sec))]

  if (loading) return <Loading fast={isReturning} onDone={() => setLoading(false)} />
  // Auth gate: Supabase login when configured, local profiles when not
  if (profileChecked && !profile) {
    if (supabase) return <AuthScreen onAuth={handleLogin} />
    return <ProfileScreen onLogin={handleLogin} />
  }
  // New Supabase user needs to set up profile
  if (profile?.isNew && view === 'dash') return <ProfileScreen onLogin={async (p) => { if (supabase) await SupaStorage.saveProfile(p); setProfile(p) }} />


  // ── Question renderer (shared across quick start, zone, details) ──
  const renderQuestion = (q, data, setField, qIdx, visQs, goNext, goPrev, onFinish, finishLabel, secs) => {
    const progress = Math.round(((qIdx + 1) / visQs.length) * 100)
    const secIdx = secs.indexOf(q.sec)
    return (
      <div style={{paddingTop:12,paddingBottom:120}}>
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontSize:13,color:SUB,fontFamily:"'DM Mono'"}}>{qIdx + 1} of {visQs.length}</span>
            <span style={{fontSize:13,color:ACCENT,fontFamily:"'DM Mono'",fontWeight:600}}>{progress}%</span>
          </div>
          <div style={{height:4,background:BORDER,borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${progress}%`,background:`linear-gradient(90deg,#0891B2,${ACCENT})`,borderRadius:2,transition:'width .4s ease'}} />
          </div>
        </div>
        <div style={{display:'flex',gap:6,marginBottom:24,flexWrap:'wrap'}}>
          {secs.map((s,i)=><span key={s} style={{padding:'8px 16px',borderRadius:20,fontSize:12,fontWeight:600,fontFamily:"'DM Mono'",minHeight:36,display:'inline-flex',alignItems:'center',background:i===secIdx?`${ACCENT}15`:'transparent',color:i===secIdx?ACCENT:i<secIdx?SUB:DIM,border:`1px solid ${i===secIdx?ACCENT+'30':'transparent'}`}}>{s}</span>)}
        </div>
        <div key={q.id+'-'+curZone} style={{animation:'fadeUp .4s cubic-bezier(.22,1,.36,1)'}}>
          <div style={{width:56,height:56,borderRadius:16,background:`${ACCENT}10`,border:`1px solid ${ACCENT}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,marginBottom:20}}>{q.ic}</div>
          <h2 style={{fontSize:26,fontWeight:700,lineHeight:1.3,margin:0,marginBottom:10,letterSpacing:'-0.3px',color:TEXT}}>{q.q}</h2>
          {q.ref&&<div style={{display:'inline-flex',gap:7,padding:'8px 14px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:20,marginTop:6}}><span style={{fontSize:13,color:SUB,fontFamily:"'DM Mono'",lineHeight:1.4}}>{q.ref}</span></div>}
          {!q.ref&&<div style={{height:16}} />}

          {q.t==='text'&&<input type="text" autoComplete={q.ac||'off'} value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Type...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&data[q.id])goNext()}} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:"'Outfit'",fontWeight:500,outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}
          {q.t==='num'&&<div style={{position:'relative'}}><input type="number" inputMode="decimal" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Enter...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&data[q.id])goNext()}} style={{width:'100%',padding:'18px 20px',paddingRight:q.u?70:20,background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:"'Outfit'",fontWeight:500,outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />{q.u&&<span style={{position:'absolute',right:18,top:'50%',transform:'translateY(-50%)',color:DIM,fontSize:14,fontFamily:"'DM Mono'"}}>{q.u}</span>}</div>}
          {q.t==='date'&&<input type="date" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:"'Outfit'",outline:'none',boxSizing:'border-box',colorScheme:'dark'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}
          {q.t==='ta'&&<textarea value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Notes...'} rows={3} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:"'Outfit'",outline:'none',resize:'vertical',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}
          {q.t==='ch'&&q.opts&&<div style={{display:'flex',flexDirection:'column',gap:8}}>{q.opts.map((o,i)=>{const sel=data[q.id]===o;return(<button key={o} onClick={()=>{haptic('light');setField(q.id,o);setTimeout(goNext,250)}} style={{padding:'16px 20px',textAlign:'left',background:sel?`${ACCENT}12`:CARD,border:`1.5px solid ${sel?ACCENT:BORDER}`,borderRadius:14,color:sel?ACCENT:'#E2E8F0',fontSize:16,fontFamily:"'Outfit'",fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:14,minHeight:54,animation:`fadeUp .3s ${i*.04}s cubic-bezier(.22,1,.36,1) both`}}><div style={{width:24,height:24,borderRadius:'50%',border:`2px solid ${sel?ACCENT:'#2A3040'}`,background:sel?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{sel&&<I n="check" s={12} c={BG} />}</div>{o}</button>)})}</div>}
          {q.t==='multi'&&q.opts&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>{q.opts.map((o,i)=>{const arr=data[q.id]||[],sel=arr.includes(o);return(<button key={o} onClick={()=>setField(q.id,sel?arr.filter(x=>x!==o):[...arr,o])} style={{padding:'12px 18px',borderRadius:24,background:sel?`${ACCENT}15`:CARD,border:`1.5px solid ${sel?ACCENT:BORDER}`,color:sel?ACCENT:'#C8D0DC',fontSize:14,fontFamily:"'Outfit'",fontWeight:500,cursor:'pointer',minHeight:44,animation:`fadeUp .25s ${i*.03}s cubic-bezier(.22,1,.36,1) both`}}>{sel?'✓ ':''}{o}</button>)})}</div>}
          {q.t==='combo'&&q.opts&&(()=>{const otherOpts=q.opts.filter(o=>o!=='Other');const isOther=(data[q.id]||'')==='__other__'||((data[q.id]||'')&&!otherOpts.includes(data[q.id]));return(<div><select value={isOther?'__other__':(data[q.id]||'')} onChange={e=>setField(q.id,e.target.value)} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:"'Outfit'",outline:'none',boxSizing:'border-box',appearance:'auto'}}><option value="">Select or skip...</option>{otherOpts.map(o=><option key={o} value={o}>{o}</option>)}<option value="__other__">Other</option></select>{isOther&&<input type="text" value={data[q.id]==='__other__'?'':data[q.id]} onChange={e=>setField(q.id,e.target.value||'__other__')} placeholder="Type here..." autoFocus style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${ACCENT}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:"'Outfit'",outline:'none',boxSizing:'border-box',marginTop:8}} />}</div>)})()}
          {q.t==='sensors'&&<SensorScreen data={data} onChange={setField} isDesktop={false} />}
          {q.photo&&<PhotoCapture photos={photos[`z${curZone}-${q.id}`]||[]} onAdd={p=>setPhotos(prev=>({...prev,[`z${curZone}-${q.id}`]:[...(prev[`z${curZone}-${q.id}`]||[]),p]}))} onRemove={i=>setPhotos(prev=>({...prev,[`z${curZone}-${q.id}`]:(prev[`z${curZone}-${q.id}`]||[]).filter((_,j)=>j!==i)}))} />}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:32}}>
          <button onClick={goPrev} disabled={qIdx===0} style={{background:'none',border:'none',color:qIdx===0?DIM:SUB,fontSize:16,fontWeight:500,cursor:qIdx===0?'default':'pointer',fontFamily:'inherit',padding:'12px 16px',minHeight:48,minWidth:48}}>← Back</button>
          <div style={{display:'flex',gap:10}}>
            {q.sk&&<button onClick={goNext} style={{padding:'14px 22px',background:'transparent',border:`1.5px solid ${BORDER}`,borderRadius:12,color:SUB,fontSize:15,fontWeight:500,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Skip</button>}
            {qIdx===visQs.length-1
              ? <button onClick={onFinish} style={{padding:'14px 28px',background:'linear-gradient(135deg,#059669,#22C55E)',border:'none',borderRadius:12,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>{finishLabel}</button>
              : q.t!=='ch' ? <button onClick={goNext} style={{padding:'14px 28px',background:`linear-gradient(135deg,#0891B2,${ACCENT})`,border:'none',borderRadius:12,color:'#fff',fontSize:16,fontWeight:600,cursor:'pointer',fontFamily:'inherit',opacity:(!q.req||data[q.id])?1:.3,minHeight:48}}>Continue →</button> : null}
          </div>
        </div>
      </div>
    )
  }


  // ── Results renderer ──
  const renderResults = (archived) => {
    if (!comp || !zoneScores.length) return null
    const zs = zoneScores[selZone]
    // Count how many detail fields are filled
    const detailsFilled = Q_DETAILS.filter(q => mergedData[q.id]).length
    const detailsTotal = Q_DETAILS.length
    return (
      <div style={{paddingTop:28,paddingBottom:120}}>
        <div style={{padding:'16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,marginBottom:14}}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:4,color:TEXT}}>{bldg.fn||'Assessment'}</div>
          <div style={{fontSize:13,color:SUB,marginBottom:8}}>{bldg.fl}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:12,fontSize:12,color:DIM,fontFamily:"'DM Mono'"}}>
            {profile&&<span>👤 {profile.name}</span>}
            <span>📅 {clock.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</span>
          </div>
        </div>

        {/* Assessment Details prompt */}
        {!archived && detailsFilled < 5 && (
          <button onClick={()=>{setDqi(0);setView('details')}} style={{width:'100%',padding:'14px 18px',background:'#FBBF2410',border:`1px solid #FBBF2428`,borderRadius:14,marginBottom:14,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,fontFamily:'inherit',minHeight:56}}>
            <div style={{width:40,height:40,borderRadius:10,background:'#FBBF2415',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><I n="clip" s={20} c="#FBBF24" /></div>
            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:'#FBBF24'}}>Add Assessment Details</div><div style={{fontSize:12,color:SUB,marginTop:2}}>HVAC details, weather, history — strengthens defensibility</div></div>
            <div style={{fontSize:16,color:'#FBBF24'}}>→</div>
          </button>
        )}

        <div style={{textAlign:'center',padding:'36px 20px 28px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:20,position:'relative',overflow:'hidden',marginBottom:14}}>
          <div style={{position:'absolute',inset:0,opacity:.25}}><Particles /></div>
          <div style={{position:'relative',zIndex:1}}>
            <div style={{fontSize:12,color:SUB,textTransform:'uppercase',fontFamily:"'DM Mono'",letterSpacing:2,marginBottom:14}}>Building Composite</div>
            <ScoreRing value={comp.tot} color={comp.rc} size={140} />
            <div style={{marginTop:12}}>{badge(comp.risk,comp.rc)}</div>
            <div style={{display:'flex',justifyContent:'center',gap:24,marginTop:16,fontSize:11,color:DIM,fontFamily:"'DM Mono'"}}>
              <span>Avg: {comp.avg}</span><span>Worst: {comp.worst}</span><span>{comp.count} zone{comp.count>1?'s':''}</span>
            </div>
          </div>
        </div>

        {zoneScores.length > 1 && <div style={{display:'flex',gap:4,padding:4,background:CARD,borderRadius:12,border:`1px solid ${BORDER}`,marginBottom:14,overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          {zoneScores.map((z,i) => <button key={i} onClick={()=>setSelZone(i)} style={{padding:'10px 14px',borderRadius:8,border:'none',background:selZone===i?`${z.rc}18`:'transparent',color:selZone===i?z.rc:DIM,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0,minHeight:44}}>{z.zoneName} <span style={{fontFamily:"'DM Mono'",fontWeight:800}}>{z.tot}</span></button>)}
        </div>}

        <div style={{display:'flex',gap:4,padding:4,background:CARD,borderRadius:12,border:`1px solid ${BORDER}`,marginBottom:16,overflowX:'auto',scrollbarWidth:'none',WebkitOverflowScrolling:'touch'}}>
          {[['overview','findings','Findings'],['rootcause','chain','Root Cause'],['sampling','flask','Sampling'],['narrative','pulse','AI Report'],['actions','bolt','Actions']].map(([k,ic,l])=><button key={k} onClick={()=>{setRTab(k);haptic('light')}} style={{flex:'0 0 auto',padding:'12px 16px',borderRadius:8,border:'none',background:rTab===k?`${ACCENT}15`:'transparent',color:rTab===k?ACCENT:DIM,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6,minHeight:44}}><I n={ic} s={16} c={rTab===k?ACCENT:DIM} />{l}</button>)}
        </div>

        {rTab==='overview' && zs && <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{textAlign:'center',marginBottom:4}}>
            <div style={{fontSize:12,fontWeight:600,color:zs.rc}}>{zs.zoneName}</div>
            <div style={{fontSize:30,fontWeight:800,fontFamily:"'DM Mono'",color:zs.rc}}>{zs.tot}<span style={{fontSize:14,color:DIM}}>/100</span></div>
          </div>
          {zs.cats.map((cat,ci)=>{const pct=(cat.s/cat.mx)*100;const bc=pct>=80?'#22C55E':pct>=60?'#FBBF24':pct>=40?'#FB923C':'#EF4444';return(
            <div key={cat.l} style={{padding:'16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <span style={{fontSize:16,fontWeight:600,color:TEXT}}>{cat.l}</span>
                <span style={{fontSize:18,fontWeight:800,fontFamily:"'DM Mono'",color:bc}}>{cat.s}/{cat.mx}</span>
              </div>
              <div style={{height:4,background:BORDER,borderRadius:2,overflow:'hidden',marginBottom:12}}>
                <div style={{height:'100%',width:`${pct}%`,background:bc,borderRadius:2,transition:'width .8s ease'}} />
              </div>
              {cat.r.map((r,i)=>{const s=sv(r.sev);return(
                <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:8,fontSize:14,lineHeight:1.6}}>
                  <span style={{padding:'3px 10px',borderRadius:6,fontSize:10,fontWeight:700,fontFamily:"'DM Mono'",background:s.bg,color:s.c,flexShrink:0,marginTop:3}}>{s.l}</span>
                  <span style={{color:'#D1D5DB'}}>{r.t}{r.std?<span style={{color:DIM}}> ({r.std})</span>:null}</span>
                </div>
              )})}
            </div>
          )})}
          {oshaResult?.flag&&<div style={{padding:16,background:'#EF444412',border:`1px solid #EF444428`,borderRadius:14}}><div style={{fontSize:13,fontWeight:700,color:'#EF4444',marginBottom:10}}>⚠ OSHA Flags</div>{oshaResult.fl.map((f,i)=><div key={i} style={{fontSize:14,color:'#E2E8F0',lineHeight:1.6,paddingLeft:12,borderLeft:'2px solid #EF444435',marginBottom:6}}>{f}</div>)}</div>}
          {oshaResult?.gaps?.length>0&&<div style={{padding:16,background:'#FBBF2410',border:`1px solid #FBBF2428`,borderRadius:14}}><div style={{fontSize:13,fontWeight:700,color:'#FBBF24',marginBottom:8}}>Data Gaps</div>{oshaResult.gaps.map((g,i)=><div key={i} style={{fontSize:14,color:'#D1D5DB',marginBottom:6}}>• {g}</div>)}</div>}
        </div>}

        {rTab==='rootcause'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
          {causalChains.length===0?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:16,border:`1px solid ${BORDER}`}}><div style={{fontSize:28,marginBottom:12}}>🔗</div><div style={{fontSize:16,fontWeight:600,marginBottom:6,color:TEXT}}>No Causal Chains</div><div style={{fontSize:14,color:SUB,lineHeight:1.6}}>No correlated multi-factor findings.</div></div>
          :causalChains.map((ch,i)=>{const cc=ch.confidence==='Strong'?'#22C55E':ch.confidence==='Moderate'?'#FBBF24':SUB;return(
            <div key={i} style={{padding:18,background:CARD,border:`1px solid ${BORDER}`,borderRadius:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div style={{fontSize:15,fontWeight:700,color:TEXT}}>🔗 {ch.type}</div>
                <span style={{padding:'4px 12px',background:`${cc}18`,border:`1px solid ${cc}35`,borderRadius:16,fontSize:11,fontWeight:700,color:cc}}>{ch.confidence}</span>
              </div>
              <div style={{fontSize:13,color:ACCENT,fontFamily:"'DM Mono'",marginBottom:8}}>{ch.zone}</div>
              <div style={{fontSize:14,color:'#D1D5DB',lineHeight:1.7,marginBottom:14,padding:'12px 16px',background:SURFACE,borderRadius:10,borderLeft:`3px solid ${ACCENT}`}}>{ch.rootCause}</div>
              {ch.evidence.map((e,j)=><div key={j} style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:6}}><span style={{color:ACCENT,fontSize:14,marginTop:1}}>→</span><span style={{fontSize:14,color:'#D1D5DB',lineHeight:1.6}}>{e}</span></div>)}
            </div>
          )})}
        </div>}

        {rTab==='sampling'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
          {(!samplingPlan||samplingPlan.plan.length===0)?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:16,border:`1px solid ${BORDER}`}}><div style={{fontSize:28,marginBottom:12}}>🧪</div><div style={{fontSize:16,fontWeight:600,marginBottom:6,color:TEXT}}>No Sampling Indicated</div><div style={{fontSize:14,color:SUB,lineHeight:1.6}}>No hypotheses requiring confirmatory sampling.</div></div>
          :<>{samplingPlan.plan.map((p,i)=>{const pc=p.priority==='critical'?'#EF4444':p.priority==='high'?'#FB923C':'#FBBF24';return(
            <div key={i} style={{padding:18,background:CARD,border:`1px solid ${BORDER}`,borderRadius:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{fontSize:15,fontWeight:700,color:TEXT}}>🧪 {p.type}</div>
                <span style={{padding:'4px 12px',background:`${pc}18`,border:`1px solid ${pc}35`,borderRadius:16,fontSize:11,fontWeight:700,color:pc}}>{p.priority.toUpperCase()}</span>
              </div>
              <div style={{fontSize:13,color:ACCENT,fontFamily:"'DM Mono'",marginBottom:10}}>{p.zone}</div>
              {[{l:'Hypothesis',v:p.hypothesis},{l:'Method',v:p.method},{l:'Controls',v:p.controls}].map(x=><div key={x.l} style={{marginBottom:10}}><div style={{fontSize:12,fontWeight:600,color:SUB,marginBottom:4}}>{x.l}</div><div style={{fontSize:14,color:'#D1D5DB',lineHeight:1.6}}>{x.v}</div></div>)}
              <div style={{fontSize:12,color:DIM,fontFamily:"'DM Mono'"}}>{p.standard}</div>
            </div>
          )})}{samplingPlan.outdoorGaps?.length>0&&<div style={{padding:16,background:'#FBBF2410',border:`1px solid #FBBF2428`,borderRadius:14}}><div style={{fontSize:13,fontWeight:700,color:'#FBBF24',marginBottom:10}}>⚠ Outdoor Control Gaps</div>{samplingPlan.outdoorGaps.map((g,i)=><div key={i} style={{fontSize:14,color:'#D1D5DB',lineHeight:1.6,marginBottom:6}}>• {g}</div>)}</div>}</>}
        </div>}

        {rTab==='narrative'&&<div>
          {!narrative&&!narrativeLoading&&<div style={{padding:36,textAlign:'center',background:CARD,border:`1px solid ${BORDER}`,borderRadius:16}}>
            <div style={{fontSize:28,marginBottom:14}}>🤖</div>
            <div style={{fontSize:16,fontWeight:600,marginBottom:6,color:TEXT}}>AI Findings Narrative</div>
            <div style={{fontSize:13,color:SUB,lineHeight:1.6,marginBottom:20}}>Professional narrative from deterministic output. You review before delivery.</div>
            <button onClick={requestNarrative} style={{padding:'14px 28px',background:`linear-gradient(135deg,#0891B2,${ACCENT})`,border:'none',borderRadius:12,color:'#fff',fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Generate Narrative</button>
          </div>}
          {narrativeLoading&&<div style={{padding:44,textAlign:'center',background:CARD,border:`1px solid ${BORDER}`,borderRadius:16}}><div style={{width:44,height:44,margin:'0 auto 16px',borderRadius:'50%',border:'2px solid transparent',borderTopColor:ACCENT,animation:'spin 1s linear infinite'}} /><div style={{fontSize:13,color:SUB}}>Generating narrative...</div></div>}
          {narrative&&<div style={{padding:20,background:CARD,border:`1px solid ${BORDER}`,borderRadius:16}}>
            <div style={{fontSize:12,fontWeight:600,color:ACCENT,marginBottom:14}}>AI-Generated Narrative</div>
            <div style={{fontSize:14,color:'#D1D5DB',lineHeight:1.8,whiteSpace:'pre-wrap'}}>{narrative}</div>
            <div style={{marginTop:16,padding:'12px 14px',background:'#FBBF2412',border:`1px solid #FBBF2420`,borderRadius:10}}>
              <div style={{fontSize:11,color:'#FBBF24',fontWeight:600}}>⚠ IH Review Required</div>
              <div style={{fontSize:11,color:SUB,marginTop:3,lineHeight:1.5}}>Review and modify before including in any client deliverable.</div>
            </div>
          </div>}
        </div>}

        {rTab==='actions'&&recs&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
          {[{k:'imm',l:'Immediate',c:'#EF4444'},{k:'eng',l:'Engineering',c:ACCENT},{k:'adm',l:'Administrative',c:'#FBBF24'},{k:'mon',l:'Monitoring',c:SUB}].map(cat=>{if(!recs[cat.k]?.length)return null;return(<div key={cat.k} style={{padding:16,background:CARD,border:`1px solid ${BORDER}`,borderRadius:14}}><div style={{fontSize:15,fontWeight:700,color:cat.c,marginBottom:10}}>{cat.l}</div>{recs[cat.k].map((r,i)=><div key={i} style={{fontSize:14,color:'#D1D5DB',lineHeight:1.7,marginBottom:8,paddingLeft:14,borderLeft:`2px solid ${cat.c}30`}}>{r}</div>)}</div>)})}
          {!archived&&<button onClick={startNew} style={{padding:'14px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:12,color:SUB,fontSize:15,cursor:'pointer',fontFamily:'inherit',marginTop:8,minHeight:48}}>New Assessment</button>}
        </div>}
      </div>
    )
  }


  // ── Main render ──
  const qscq = qsVis[qsqi]
  const dtcq = dtVis[dqi]
  const zcq = zVis[zqi]
  const isAssessing = ['quickstart','zone','details'].includes(view)

  return (
    <div style={{minHeight:'100vh',background:BG,color:TEXT,fontFamily:"'Outfit', system-ui, sans-serif"}}>
      <header style={{position:'sticky',top:0,zIndex:100,background:`${BG}E8`,backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderBottom:`1px solid ${BORDER}`,padding:`env(safe-area-inset-top, 0px) 16px 0`,display:'flex',alignItems:'center',justifyContent:'space-between',height:56}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${ACCENT},#0891B2)`,display:'flex',alignItems:'center',justifyContent:'center'}}><I n="home" s={16} c="#fff" /></div>
          <div><div style={{fontSize:16,fontWeight:700,lineHeight:1.1}}>atmos<span style={{color:ACCENT,fontWeight:800}}>IQ</span></div><div style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'"}}>v{VER}</div></div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {isAssessing&&<span style={{fontSize:10,color:`${ACCENT}80`,fontFamily:"'DM Mono'",background:`${ACCENT}08`,padding:'4px 10px',borderRadius:6}}>AUTO-SAVE</span>}
          {view!=='dash'&&<button onClick={()=>{setView('dash');setViewRpt(null)}} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,color:TEXT,fontSize:14,fontWeight:600,padding:'10px 18px',cursor:'pointer',fontFamily:'inherit',minHeight:44}}>← Home</button>}
        </div>
      </header>

      {milestone&&<div style={{position:'fixed',inset:0,background:`${BG}F0`,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 32px'}}><div style={{textAlign:'center',animation:'milestoneIn .5s cubic-bezier(.22,1,.36,1)'}}><div style={{marginBottom:20,display:'flex',justifyContent:'center'}}><div style={{width:80,height:80,borderRadius:22,background:`${ACCENT}12`,border:`1.5px solid ${ACCENT}30`,display:'flex',alignItems:'center',justifyContent:'center'}}><I n={milestone.icon} s={40} c={ACCENT} w={2} /></div></div><div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.5px',color:TEXT}}>{milestone.title}</div><div style={{fontSize:15,color:ACCENT,fontFamily:"'DM Mono'",marginTop:10}}>{milestone.sub}</div></div></div>}

      {zonePrompt&&<div style={{position:'fixed',inset:0,background:'#000000CC',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}><div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:28,maxWidth:340,width:'100%',animation:'fadeUp .3s ease'}}><div style={{fontSize:18,fontWeight:700,marginBottom:8,color:TEXT}}>Zone Complete</div><div style={{fontSize:14,color:SUB,marginBottom:24,lineHeight:1.6}}>Add another zone to this assessment?</div><div style={{display:'flex',flexDirection:'column',gap:10}}><button onClick={()=>{setZonePrompt(false);setZones(p=>[...p,{}]);setCurZone(zones.length);setZqi(0)}} style={{padding:'16px 0',background:`${ACCENT}12`,border:`1px solid ${ACCENT}30`,borderRadius:12,color:ACCENT,fontSize:16,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:52}}>+ Add Another Zone</button><button onClick={()=>{setZonePrompt(false);finishAssessment()}} style={{padding:'16px 0',background:'linear-gradient(135deg,#059669,#22C55E)',border:'none',borderRadius:12,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:52}}>Finish Assessment ✓</button></div></div></div>}

      {delConf&&<div style={{position:'fixed',inset:0,background:'#000000CC',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}><div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:28,maxWidth:340,width:'100%',animation:'fadeUp .3s ease'}}><div style={{fontSize:18,fontWeight:700,marginBottom:8,color:TEXT}}>Delete?</div><div style={{fontSize:14,color:SUB,marginBottom:24,lineHeight:1.6}}>Permanently removed.</div><div style={{display:'flex',gap:10}}><button onClick={()=>setDelConf(null)} style={{flex:1,padding:'14px 0',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Cancel</button><button onClick={()=>deleteItem(delConf.id,delConf.type)} style={{flex:1,padding:'14px 0',background:'#EF444420',border:'1px solid #EF444440',borderRadius:10,color:'#EF4444',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Delete</button></div></div></div>}

      <div style={{maxWidth:620,margin:'0 auto',padding:'0 20px',position:'relative',zIndex:1}}>

        {view==='dash'&&<div style={{paddingTop:32,paddingBottom:100}}>
          <div style={{animation:'fadeUp .5s ease'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
              <div><div style={{fontSize:11,fontWeight:600,color:ACCENT,textTransform:'uppercase',letterSpacing:3,fontFamily:"'DM Mono'",marginBottom:12}}>Air Quality Intelligence</div><h1 style={{fontSize:36,fontWeight:800,lineHeight:1.1,margin:0,letterSpacing:'-1px'}}>atmos<span style={{color:ACCENT}}>IQ</span></h1></div>
              {profile&&<button onClick={handleLogout} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>
                <div style={{width:28,height:28,borderRadius:8,background:`${ACCENT}15`,display:'flex',alignItems:'center',justifyContent:'center'}}><I n="user" s={14} c={ACCENT} /></div>
                <div style={{fontSize:13,fontWeight:600,color:TEXT,maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{profile.name?.split(',')[0]||'User'}</div>
              </button>}
            </div>
            <p style={{fontSize:15,color:SUB,lineHeight:1.7,maxWidth:420}}>Multi-zone assessments. Deterministic scoring. OSHA defensibility.</p>
          </div>
          <button onClick={startNew} style={{width:'100%',padding:'22px 24px',marginTop:20,background:`linear-gradient(135deg,#0E7490,${ACCENT}20)`,border:`1.5px solid ${ACCENT}40`,borderRadius:16,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:16,position:'relative',overflow:'hidden',minHeight:80,fontFamily:'inherit'}}><div style={{position:'absolute',inset:0,opacity:.12}}><Particles /></div><div style={{width:52,height:52,borderRadius:14,background:`${ACCENT}20`,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',zIndex:1}}><I n="wind" s={26} c={ACCENT} /></div><div style={{position:'relative',zIndex:1,flex:1}}><div style={{fontSize:17,fontWeight:700,color:TEXT}}>New Assessment</div><div style={{fontSize:13,color:SUB,marginTop:3}}>Quick start · {profile?.name?.split(',')[0]||'Profile'} auto-filled</div></div><div style={{fontSize:20,color:ACCENT,position:'relative',zIndex:1}}>→</div></button>
          <button onClick={runDemo} style={{width:'100%',padding:'18px 22px',marginTop:10,background:CARD,border:`1.5px solid #8B5CF630`,borderRadius:16,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:16,minHeight:72,fontFamily:'inherit'}}><div style={{width:48,height:48,borderRadius:12,background:'#8B5CF615',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="bldg" s={24} c="#8B5CF6" /></div><div style={{flex:1}}><div style={{fontSize:16,fontWeight:700,color:TEXT}}>Run Demo</div><div style={{fontSize:13,color:SUB,marginTop:3}}>Meridian Business Park — 3 zones</div></div><div style={{fontSize:20,color:'#8B5CF6'}}>→</div></button>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}>
            {[{l:'Drafts',n:(index.drafts||[]).length,v:'drafts',ic:'clip'},{l:'History',n:(index.reports||[]).length,v:'history',ic:'clock'}].map(c=><button key={c.l} onClick={()=>{if(c.n)setView(c.v)}} style={{padding:'20px 16px',background:CARD,border:`1px solid ${c.n?`${ACCENT}25`:BORDER}`,borderRadius:14,opacity:c.n?1:.4,cursor:c.n?'pointer':'default',textAlign:'left',minHeight:80,fontFamily:'inherit'}}><div style={{marginBottom:10}}><I n={c.ic} s={24} c={c.n?ACCENT:DIM} /></div><div style={{fontSize:14,fontWeight:600,color:TEXT}}>{c.l}</div><div style={{fontSize:15,color:c.n?ACCENT:DIM,fontFamily:"'DM Mono'",marginTop:3,fontWeight:700}}>{c.n}</div></button>)}
          </div>
          {(index.reports||[]).length>0&&<div style={{marginTop:24}}><div style={{fontSize:12,fontWeight:600,color:SUB,textTransform:'uppercase',letterSpacing:1.5,marginBottom:12}}>Recent</div>{(index.reports||[]).slice(0,3).map(r=><button key={r.id} onClick={()=>openReport(r)} style={{width:'100%',padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,marginBottom:8,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,minHeight:64,fontFamily:'inherit'}}><div style={{width:40,height:40,borderRadius:10,background:`${ACCENT}12`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,fontFamily:"'DM Mono'",color:ACCENT}}>{r.score||'?'}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:TEXT}}>{r.facility||'?'}</div><div style={{fontSize:12,color:DIM,fontFamily:"'DM Mono'",marginTop:3}}>{fD(r.ts)}</div></div></button>)}</div>}
        </div>}

        {view==='quickstart'&&qscq&&renderQuestion(qscq,mergedData,setQSField,qsqi,qsVis,()=>{if(qsqi<qsVis.length-1)setQsqi(qsqi+1)},()=>{if(qsqi>0)setQsqi(qsqi-1)},finishQuickStart,'→ Start Zones',qsSecs)}

        {view==='zone'&&zcq&&<div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:16,marginBottom:-8}}>
            <div style={{fontSize:12,fontWeight:600,color:ACCENT,fontFamily:"'DM Mono'"}}>Zone {curZone+1}: {zData.zn||'New Zone'}</div>
            <div style={{display:'flex',gap:8}}>
              {zones.length>1&&curZone>0&&<button onClick={()=>{setCurZone(curZone-1);setZqi(0)}} style={{fontSize:14,color:SUB,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:'8px 12px',minHeight:44}}>‹ Prev</button>}
              {curZone<zones.length-1&&<button onClick={()=>{setCurZone(curZone+1);setZqi(0)}} style={{fontSize:14,color:SUB,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:'8px 12px',minHeight:44}}>Next ›</button>}
            </div>
          </div>
          {renderQuestion(zcq,zData,setZF,zqi,zVis,()=>{if(zqi<zVis.length-1)setZqi(zqi+1)},()=>{if(zqi>0)setZqi(zqi-1)},()=>{setZonePrompt(true)},'Complete Zone ✓',zSecs)}
        </div>}

        {view==='details'&&dtcq&&renderQuestion(dtcq,mergedData,setQSField,dqi,dtVis,()=>{if(dqi<dtVis.length-1)setDqi(dqi+1)},()=>{if(dqi>0)setDqi(dqi-1)},finishDetails,'Done ✓',dtSecs)}

        {(view==='results'||view==='report')&&renderResults(view==='report')}

        {view==='drafts'&&<div style={{paddingTop:28,paddingBottom:100}}><h2 style={{fontSize:22,fontWeight:700,marginBottom:20,color:TEXT}}>Drafts</h2>{(index.drafts||[]).length===0?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:14,border:`1px solid ${BORDER}`,color:SUB,fontSize:14}}>No drafts</div>:(index.drafts||[]).map(d=><div key={d.id} style={{padding:'16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,marginBottom:8,display:'flex',alignItems:'center',gap:14}}><div style={{flex:1}}><div style={{fontSize:15,fontWeight:600,color:TEXT}}>{d.facility||'Untitled'}</div><div style={{fontSize:13,color:DIM,fontFamily:"'DM Mono'",marginTop:4}}>{fD(d.ua||d.ts)}</div></div><button onClick={()=>resumeDraft(d.id)} style={{padding:'10px 18px',background:`${ACCENT}15`,border:`1px solid ${ACCENT}30`,borderRadius:10,color:ACCENT,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Resume</button><button onClick={()=>setDelConf({id:d.id,type:'dft'})} style={{padding:'10px 14px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:DIM,fontSize:13,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>✕</button></div>)}</div>}

        {view==='history'&&<div style={{paddingTop:28,paddingBottom:100}}><h2 style={{fontSize:22,fontWeight:700,marginBottom:16,color:TEXT}}>History</h2><div style={{display:'flex',gap:8,marginBottom:14}}><input type="text" value={hSearch} onChange={e=>setHSearch(e.target.value)} placeholder="Search..." style={{flex:1,padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,color:TEXT,fontSize:16,fontFamily:'inherit',outline:'none',boxSizing:'border-box',minHeight:48}} /><select value={hSort} onChange={e=>setHSort(e.target.value)} style={{padding:'14px 12px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,color:SUB,fontSize:13,fontFamily:'inherit',outline:'none',minHeight:48}}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="score-low">Score ↑</option><option value="score-high">Score ↓</option></select></div>{fReports.length===0?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:14,border:`1px solid ${BORDER}`,color:SUB,fontSize:14}}>{hSearch?'No matches':'No reports yet'}</div>:fReports.map(r=><button key={r.id} onClick={()=>openReport(r)} style={{width:'100%',padding:'16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,marginBottom:8,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,minHeight:64,fontFamily:'inherit'}}><div style={{width:44,height:44,borderRadius:12,background:`${ACCENT}12`,display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:17,fontWeight:800,fontFamily:"'DM Mono'",color:ACCENT}}>{r.score||'?'}</span></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:15,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:TEXT}}>{r.facility||'?'}</div><div style={{fontSize:13,color:DIM,fontFamily:"'DM Mono'",marginTop:4}}>{fD(r.ts)}</div></div><button onClick={e=>{e.stopPropagation();setDelConf({id:r.id,type:'rpt'})}} style={{padding:'8px 12px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:12,cursor:'pointer',fontFamily:'inherit',minHeight:40}}>🗑</button></button>)}</div>}
      </div>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes milestoneIn{from{opacity:0;transform:scale(.85) translateY(20px);}to{opacity:1;transform:scale(1) translateY(0);}}
        *{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent;}
        button{font-family:inherit;-webkit-tap-highlight-color:transparent;}
        input::placeholder,textarea::placeholder{color:#525A6A;}
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=number]{-moz-appearance:textfield;}
        select option{background:${CARD};color:${SUB};}
        ::-webkit-scrollbar{width:0;height:0;}
        body{overscroll-behavior:none;}
      `}</style>
    </div>
  )
}
