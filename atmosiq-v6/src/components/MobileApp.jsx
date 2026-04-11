/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MobileApp — v5-style field experience with profile login + three-tier questions
 * Flow: Profile → Dashboard → Quick Start → Zone Walkthrough → Details (optional) → Results
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import STO from '../utils/storage'
import Profiles from '../utils/profiles'
import SupaStorage from '../utils/supabaseStorage'
import { supabase, trackEvent } from '../utils/supabaseClient'
import Backup from '../utils/backup'
import { VER } from '../constants/standards'
import { Q_PRESURVEY, Q_BUILDING, Q_ZONE, Q_QUICKSTART, Q_DETAILS, SENSOR_FIELDS } from '../constants/questions'
import { scoreZone, compositeScore, evalOSHA, calcVent, genRecs } from '../engines/scoring'
import { generateSamplingPlan } from '../engines/sampling'
import { buildCausalChains } from '../engines/causalChains'
import { generateNarrative } from '../engines/narrative'
import { I, emojiToIcon } from './Icons'
import Loading from './Loading'
import ScoreRing from './ScoreRing'
import PhotoCapture from './PhotoCapture'
import SensorScreen from './SensorScreen'
import ProfileScreen from './ProfileScreen'
import AuthScreen from './AuthScreen'
import { TermsOfService, PrivacyPolicy } from './LegalScreens'
import AdminDashboard from './AdminDashboard'
import WelcomeScreen from './WelcomeScreen'
import SettingsScreen from './SettingsScreen'
import { printReport } from './PrintReport'
import { DEMO_PRESURVEY, DEMO_BUILDING, DEMO_ZONES } from '../constants/demoData'

const haptic = (type) => { try { if (navigator.vibrate) navigator.vibrate(type === 'heavy' ? [30,20,30] : type === 'success' ? [10,30,10,30,10] : 12) } catch {} }
const fD = ts => ts ? new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''
const sv = sev => ({critical:{c:'#EF4444',bg:'#EF444418',l:'CRITICAL'},high:{c:'#FB923C',bg:'#FB923C18',l:'HIGH'},medium:{c:'#FBBF24',bg:'#FBBF2418',l:'MEDIUM'},low:{c:'#22D3EE',bg:'#22D3EE15',l:'LOW'},pass:{c:'#22C55E',bg:'#22C55E15',l:'PASS'},info:{c:'#94A3B8',bg:'#94A3B815',l:'INFO'}}[sev]||{c:'#94A3B8',bg:'#94A3B815',l:''})
const badge = (risk,rc) => <span style={{padding:'6px 16px',background:`${rc}18`,border:`1px solid ${rc}35`,borderRadius:20,fontSize:13,fontWeight:700,color:rc}}>{risk}</span>

// ─── Design Tokens ───
const BG = '#07080C'
const SURFACE = '#0D0E14'
const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const ACCENT_DIM = '#1A8FA0'
const TEXT = '#ECEEF2'
const SUB = '#8B93A5'
const DIM = '#6B7380'
const SUCCESS = '#22C55E'
const WARN = '#FBBF24'
const DANGER = '#EF4444'

export default function MobileApp() {
  const { isTablet, isTabletLand } = useMediaQuery()
  // Responsive layout: phone=620, tablet portrait=860, tablet landscape=1080
  const contentMax = isTabletLand ? 1080 : isTablet ? 860 : 620
  const padX = isTablet ? 28 : 20
  const [loading, setLoading] = useState(true)
  const [isReturning, setIsReturning] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profileChecked, setProfileChecked] = useState(false)
  // views: dash|quickstart|zone|details|results|history|drafts|report
  const [view, setView] = useState('dash')
  const [milestone, setMilestone] = useState(null)
  const [clock, setClock] = useState(new Date())
  const [credits, setCredits] = useState(5) // default free tier
  const [showPricing, setShowPricing] = useState(false)
  const [adminSecret, setAdminSecret] = useState(null)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [connectionToast, setConnectionToast] = useState(null)

  // Connection toast
  useEffect(() => {
    const goOffline = () => { setConnectionToast('offline'); setTimeout(() => setConnectionToast(null), 4000) }
    const goOnline = () => { setConnectionToast('online'); setTimeout(() => setConnectionToast(null), 3000) }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline) }
  }, [])

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
      trackEvent('login_completed', {})
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
      trackEvent('draft_saved', { draft_id: draftId, phase: view, zones: (zones||[]).length })
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

  const consumeCredit = (amount, reason, refId) => {
    setCredits(prev => Math.max(0, prev - amount))
    trackEvent('credit_consumed', { amount, reason, balance: credits - amount })
  }

  const startNew = () => {
    if (credits < 1) { setShowPricing(true); return }
    setShowDisclaimer(true)
  }

  const proceedAfterDisclaimer = () => {
    setShowDisclaimer(false)
    consumeCredit(1, 'assessment')
    trackEvent('assessment_mode_selected', { mode: 'new' })
    trackEvent('assessment_created', {})
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
    trackEvent('assessment_mode_selected', { mode: 'demo' })
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
    trackEvent('draft_resumed', { draft_id: id, facility: d.bldg?.fn || d.building?.fn || '' })
    setDraftId(d.id); setPresurvey(d.presurvey||{}); setBldg(d.bldg||d.building||{}); setZones(d.zones||[{}]); setPhotos(d.photos||{})
    setQsqi(d.qsqi||0); setDqi(d.dqi||0); setCurZone(d.curZone||0); setZqi(d.zqi||0)
    // Resume at the right phase
    if (!d.bldg?.fn && !d.building?.fn) setView('quickstart')
    else if (d.zones?.length > 0 && d.zones[0]?.zn) setView('zone')
    else setView('quickstart')
  }

  const finishQuickStart = () => {
    trackEvent('quickstart_completed', { facility: bldg.fn || '', building_type: bldg.ft || '' })
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
    trackEvent('score_generated', { composite: composite?.tot, avg: composite?.avg, worst: composite?.worst, risk: composite?.risk, osha_flag: !!osha?.flag, confidence: osha?.conf || 'unknown', data_gaps: (osha?.gaps||[]).length })
    trackEvent('assessment_completed', { zones: zones.length, score: composite?.tot, facility: bldg.fn || 'unknown', has_causal_chains: cc.length > 0, sampling_recommendations: sp?.plan?.length || 0 })
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
    trackEvent('details_completed', { facility: bldg.fn || '' })
    showMilestone('check', 'Details Complete', 'Assessment data updated', () => { setView('results') })
  }

  const requestNarrative = async () => {
    if (credits < 3) { setShowPricing(true); return }
    consumeCredit(3, 'narrative')
    trackEvent('narrative_requested', { facility: bldg.fn || '', score: comp?.tot })
    setNarrativeLoading(true)
    const text = await generateNarrative(bldg, zones, zoneScores, comp, oshaResult, recs)
    setNarrative(text); setNarrativeLoading(false)
    if (text) trackEvent('narrative_generated', { word_count: text.split(/\s+/).length })
  }

  const handleExportPDF = () => {
    trackEvent('report_exported', { facility: bldg.fn || '', score: comp?.tot, zones: zones.length, has_narrative: !!narrative })
    printReport({ building: bldg, presurvey, zones, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, version: VER })
  }

  const handleShare = async () => {
    const title = `AtmosIQ Report — ${bldg.fn || 'Assessment'}`
    const text = `${bldg.fn || 'Facility'}\nComposite Score: ${comp?.tot || '?'}/100 — ${comp?.risk || '?'}\n${zoneScores?.length || 0} zones assessed\n${oshaResult?.flag ? '⚠ OSHA flags identified' : '✓ No OSHA flags'}`
    if (navigator.share) {
      try { await navigator.share({ title, text }) } catch {}
    } else {
      try { await navigator.clipboard.writeText(`${title}\n\n${text}`); alert('Report summary copied to clipboard') } catch {}
    }
  }

  const openReport = async (meta) => {
    const rpt = await STO.get(meta.id)
    if (!rpt) return
    trackEvent('report_viewed', { report_id: meta.id, facility: meta.facility || '', score: meta.score })
    setViewRpt(rpt); setPresurvey(rpt.presurvey||{}); setBldg(rpt.building||rpt.bldg||{}); setZones(rpt.zones||[])
    setPhotos(rpt.photos||{}); setZoneScores(rpt.zoneScores||[]); setComp(rpt.comp||rpt.composite)
    setOshaResult(rpt.oshaEvals?.[0]||rpt.osha||null); setRecs(rpt.recs||null)
    setSamplingPlan(rpt.samplingPlan||null); setCausalChains(rpt.causalChains||[])
    setSelZone(0); setRTab('overview'); setNarrative(rpt.narrative||null); setView('report')
  }

  const deleteItem = async (id, name, type) => {
    // Soft delete — recoverable for 30 days
    await Backup.softDelete(id, name, type)
    if (navigator.onLine && supabase) {
      try { await supabase.from('assessments').delete().eq('id', id) } catch {}
    }
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
  // New user — show welcome then profile setup
  if (profile?.isNew && view === 'dash') {
    const hasSeenWelcome = sessionStorage.getItem('aiq_welcomed')
    if (!hasSeenWelcome) return <WelcomeScreen onComplete={() => sessionStorage.setItem('aiq_welcomed', '1')} />
    return <ProfileScreen onLogin={async (p) => { if (supabase) await SupaStorage.saveProfile(p); setProfile(p) }} />
  }


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
          <div style={{width:48,height:48,borderRadius:12,background:`${ACCENT}08`,border:`1px solid ${ACCENT}15`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>{emojiToIcon[q.ic] ? <I n={emojiToIcon[q.ic]} s={22} c={ACCENT} w={1.6} /> : <span style={{fontSize:22}}>{q.ic}</span>}</div>
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
    const detailsFilled = Q_DETAILS.filter(q => mergedData[q.id]).length
    const worstCat = zs?.cats?.reduce((a, b) => ((a.s/a.mx) < (b.s/b.mx) ? a : b)) || null
    const complaintCat = zs?.cats?.find(c => c.l === 'Complaints')
    const hasComplaints = complaintCat && complaintCat.r.some(r => r.sev === 'critical' || r.sev === 'high')
    // Primary driver is the worst NON-complaints category (complaints are a symptom, not a driver)
    const driverCat = zs?.cats?.filter(c => c.l !== 'Complaints').reduce((a, b) => ((a.s/a.mx) < (b.s/b.mx) ? a : b), zs.cats[0]) || worstCat
    const riskLabel = comp.tot < 30 ? 'Critical indoor air quality concern' : comp.tot < 50 ? 'Significant indoor air quality concern' : comp.tot < 70 ? 'Moderate indoor air quality concern' : 'Conditions within acceptable range'
    const actionLabel = comp.tot < 30 ? 'Immediate corrective action recommended' : comp.tot < 50 ? 'Targeted investigation and corrective action warranted' : comp.tot < 70 ? 'Targeted improvements recommended' : 'Continue routine monitoring'
    // Expert summary — IH-grade reasoning (complaints are pattern, not driver)
    const driverMap = {Ventilation:'Ventilation inadequacy',Contaminants:'Elevated contaminant exposure',HVAC:'HVAC system deficiency',Environment:'Environmental condition exceedance'}
    const causeMap = {Ventilation:'Insufficient outdoor air delivery or poor air distribution',Contaminants:'Proximity to emission sources with inadequate dilution ventilation',HVAC:'Deferred maintenance or mechanical system degradation',Environment:'Thermal or moisture conditions outside recognized comfort standards'}
    const expertDriver = driverCat ? (driverMap[driverCat.l] || driverCat.l + ' deficiency') : null
    const expertComplaint = hasComplaints ? 'Building-related symptom cluster reported' : null
    const expertCause = causalChains[0] ? causalChains[0].rootCause : (driverCat ? (causeMap[driverCat.l] || 'Contributing factors require further investigation') : null)

    return (
      <div style={{paddingTop:20,paddingBottom:120}}>

        {/* ── Building Header ── */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:18,fontWeight:700,color:TEXT,letterSpacing:'-0.3px'}}>{bldg.fn||'Assessment'}</div>
          {bldg.fl && <div style={{fontSize:11,color:SUB,marginTop:3}}>{bldg.fl}</div>}
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
            {profile && <><I n="user" s={11} c={DIM} w={1.4} /><span style={{fontSize:10,color:DIM}}>{profile.name}</span></>}
            {profile && <span style={{color:BORDER}}>·</span>}
            <span style={{fontSize:10,color:DIM}}>{clock.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</span>
          </div>
        </div>

        {/* ── Composite Score Card ── */}
        <div style={{padding:'20px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,marginBottom:12,position:'relative',overflow:'hidden'}}>
          {/* Severity accent — top edge gradient */}
          <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg, ${comp.rc}, ${comp.rc}40)`}} />
          <div style={{display:'flex',alignItems:'center',gap:20,marginTop:2}}>
            <div style={{flexShrink:0}}>
              <ScoreRing value={comp.tot} color={comp.rc} size={96} />
            </div>
            <div style={{flex:1,minWidth:0}}>
              <span style={{padding:'3px 8px',borderRadius:4,fontSize:9,fontWeight:700,background:`${comp.rc}12`,color:comp.rc,textTransform:'uppercase',letterSpacing:'0.5px'}}>{comp.risk}</span>
              <div style={{fontSize:13,fontWeight:600,color:TEXT,marginTop:6,lineHeight:1.4}}>{riskLabel}</div>
              <div style={{fontSize:11,color:SUB,marginTop:3,lineHeight:1.4}}>{actionLabel}</div>
            </div>
          </div>
          <div style={{display:'flex',gap:1,marginTop:16,background:SURFACE,borderRadius:8,overflow:'hidden'}}>
            {[
              {l:'Zone average',v:comp.avg,s:'/100'},
              {l:'Lowest zone',v:comp.worst,s:'/100'},
              {l:'Zones assessed',v:comp.count,s:''},
            ].map((m,i)=>(
              <div key={i} style={{flex:1,padding:'10px 8px',textAlign:'center',borderRight:i<2?`1px solid ${BORDER}`:'none'}}>
                <div style={{fontSize:16,fontWeight:700,color:TEXT,fontFamily:"'DM Mono'"}}>{m.v}<span style={{fontSize:9,color:DIM,fontWeight:500}}>{m.s}</span></div>
                <div style={{fontSize:8,color:SUB,marginTop:2,textTransform:'uppercase',letterSpacing:'0.3px'}}>{m.l}</div>
              </div>
            ))}
          </div>
          <div style={{textAlign:'center',marginTop:10,fontSize:9,color:DIM,fontFamily:"'DM Mono'"}}>Lower score = greater concern · 100 = no findings</div>
        </div>

        {/* ── Expert Summary Card ── */}
        {(causalChains.length > 0 || driverCat) && (
          <div style={{padding:'16px 18px',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:600,color:SUB,textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:12}}>Expert Summary</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:12}}>
              {expertDriver && <div><div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Primary driver</div><div style={{color:TEXT,fontWeight:600,lineHeight:1.4}}>{expertDriver}</div></div>}
              {expertComplaint && <div><div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Complaint pattern</div><div style={{color:WARN,fontWeight:500,lineHeight:1.4}}>{expertComplaint}</div></div>}
              {!expertComplaint && expertCause && <div><div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Contributing cause</div><div style={{color:SUB,lineHeight:1.4}}>{expertCause.length > 80 ? expertCause.slice(0,77)+'...' : expertCause}</div></div>}
            </div>
            {expertComplaint && expertCause && <div style={{marginTop:12}}><div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Likely contributing cause</div><div style={{fontSize:12,color:SUB,lineHeight:1.5}}>{expertCause.length > 120 ? expertCause.slice(0,117)+'...' : expertCause}</div></div>
            }
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12,fontSize:12}}>
              {recs?.imm?.[0] && <div><div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Next action</div><div style={{color:ACCENT,lineHeight:1.4}}>{recs.imm[0].length > 70 ? recs.imm[0].slice(0,67)+'...' : recs.imm[0]}</div></div>}
              <div><div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Sampling</div><div style={{color:TEXT,lineHeight:1.4}}>{samplingPlan?.plan?.length > 0 ? `Targeted confirmatory sampling recommended (${samplingPlan.plan.length} analytical method${samplingPlan.plan.length>1?'s':''})` : 'No confirmatory sampling indicated at this time'}</div></div>
            </div>
          </div>
        )}

        {/* ── Assessment Details prompt ── */}
        {!archived && detailsFilled < 5 && (
          <button onClick={()=>{setDqi(0);setView('details')}} style={{width:'100%',padding:'12px 16px',background:`${WARN}08`,border:`1px solid ${WARN}20`,borderRadius:10,marginBottom:12,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
            <I n="clip" s={16} c={WARN} />
            <div style={{flex:1}}><span style={{fontSize:12,fontWeight:600,color:WARN}}>Add assessment details</span><span style={{fontSize:10,color:DIM,marginLeft:8}}>Strengthens defensibility</span></div>
            <span style={{fontSize:13,color:WARN}}>→</span>
          </button>
        )}

        {/* ── Report Status Strip ── */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:archived?SUCCESS:narrative?WARN:DIM}} />
            <span style={{fontSize:10,color:SUB,fontFamily:"'DM Mono'"}}>{archived?'Final':narrative?'Ready for review':'Draft'}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,fontSize:9,color:DIM,fontFamily:"'DM Mono'"}}>
            <span>{zoneScores.reduce((a,z)=>a+z.cats.reduce((b,c)=>b+c.r.length,0),0)} findings</span>
            <span>{Object.keys(photos||{}).length} photos</span>
          </div>
        </div>

        {/* ── Zone Selector ── */}
        {zoneScores.length > 1 && <div style={{display:'flex',gap:4,padding:3,background:CARD,borderRadius:10,border:`1px solid ${BORDER}`,marginBottom:12,overflowX:'auto',WebkitOverflowScrolling:'touch',scrollbarWidth:'none'}}>
          {zoneScores.map((z,i) => (
            <button key={i} onClick={()=>setSelZone(i)} style={{padding:'8px 12px',borderRadius:7,border:'none',background:selZone===i?`${z.rc}12`:'transparent',color:selZone===i?TEXT:DIM,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0,minHeight:36,display:'flex',alignItems:'center',gap:8}}>
              <span>{z.zoneName}</span>
              <span style={{padding:'2px 6px',borderRadius:4,fontSize:10,fontWeight:700,fontFamily:"'DM Mono'",background:selZone===i?`${z.rc}20`:`${DIM}15`,color:selZone===i?z.rc:DIM}}>{z.tot}</span>
            </button>
          ))}
        </div>}

        {/* ── Content Tabs ── */}
        <div style={{display:'flex',gap:2,padding:2,background:CARD,borderRadius:10,border:`1px solid ${BORDER}`,marginBottom:14,overflowX:'auto',scrollbarWidth:'none',WebkitOverflowScrolling:'touch'}}>
          {[['overview','findings','Findings'],['rootcause','chain','Pathways'],['sampling','flask','Sampling'],['narrative','pulse','Narrative'],['actions','bolt','Actions']].map(([k,ic,l])=>(
            <button key={k} onClick={()=>{setRTab(k);haptic('light')}} style={{flex:'0 0 auto',padding:'8px 12px',borderRadius:8,border:'none',background:rTab===k?`${ACCENT}10`:'transparent',color:rTab===k?ACCENT:DIM,fontSize:11,fontWeight:rTab===k?600:500,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',minHeight:34,transition:'color 0.15s'}}>
              {l}
            </button>
          ))}
        </div>

        {rTab==='overview' && zs && <div style={{display:isTablet?'grid':'flex',gridTemplateColumns:isTablet?'1fr 1fr':'none',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
            <div style={{fontSize:14,fontWeight:600,color:TEXT}}>{zs.zoneName}</div>
            <div style={{display:'flex',alignItems:'baseline',gap:2}}>
              <span style={{fontSize:22,fontWeight:800,fontFamily:"'DM Mono'",color:zs.rc}}>{zs.tot}</span>
              <span style={{fontSize:11,color:DIM,fontFamily:"'DM Mono'"}}>/100</span>
            </div>
          </div>
          {zs.cats.map((cat,ci)=>{const pct=Math.round((cat.s/cat.mx)*100);const bc=pct>=80?'#22C55E':pct>=60?'#FBBF24':pct>=40?'#FB923C':'#EF4444';const pctLabel=pct>=80?'Within range':pct>=60?'Moderate concern':pct>=40?'Significant concern':'Critical concern';return(
            <div key={cat.l} style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                <span style={{fontSize:14,fontWeight:600,color:TEXT}}>{cat.l}</span>
                <div style={{display:'flex',alignItems:'baseline',gap:2}}>
                  <span style={{fontSize:16,fontWeight:800,fontFamily:"'DM Mono'",color:bc}}>{cat.s}</span>
                  <span style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'"}}>/{cat.mx}</span>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <div style={{flex:1,height:3,background:BORDER,borderRadius:2,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${pct}%`,background:bc,borderRadius:2,transition:'width .8s ease'}} />
                </div>
                <span style={{fontSize:9,color:bc,fontWeight:600,flexShrink:0}}>{pctLabel}</span>
              </div>
              {cat.r.map((r,i)=>{const s=sv(r.sev);return(
                <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:6,fontSize:13,lineHeight:1.6}}>
                  <span style={{padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:700,fontFamily:"'DM Mono'",background:s.bg,color:s.c,flexShrink:0,marginTop:3}}>{s.l}</span>
                  <span style={{color:SUB}}>{r.t}{r.std?<span style={{color:DIM,fontSize:11}}> ({r.std})</span>:null}</span>
                </div>
              )})}
            </div>
          )})}
          {oshaResult?.flag&&<div style={{padding:16,background:'#EF444412',border:`1px solid #EF444428`,borderRadius:14}}><div style={{fontSize:13,fontWeight:700,color:'#EF4444',marginBottom:10}}>⚠ OSHA Flags</div>{oshaResult.fl.map((f,i)=><div key={i} style={{fontSize:14,color:'#E2E8F0',lineHeight:1.6,paddingLeft:12,borderLeft:'2px solid #EF444435',marginBottom:6}}>{f}</div>)}</div>}
          {oshaResult?.gaps?.length>0&&<div style={{padding:16,background:'#FBBF2410',border:`1px solid #FBBF2428`,borderRadius:14}}><div style={{fontSize:13,fontWeight:700,color:'#FBBF24',marginBottom:8}}>Data Gaps</div>{oshaResult.gaps.map((g,i)=><div key={i} style={{fontSize:14,color:'#D1D5DB',marginBottom:6}}>• {g}</div>)}</div>}
        </div>}

        {rTab==='rootcause'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:11,color:DIM,lineHeight:1.5,marginBottom:4}}>Concern pathways are based on correlation of field observations, measurements, and occupant reports. They support — but do not confirm — root-cause determination.</div>
          {causalChains.length===0?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:10,border:`1px solid ${BORDER}`}}><I n="chain" s={24} c={DIM} w={1.4} /><div style={{fontSize:14,fontWeight:600,marginTop:12,marginBottom:4,color:SUB}}>No concern pathways identified</div><div style={{fontSize:12,color:DIM,lineHeight:1.5}}>No correlated multi-factor findings in this assessment.</div></div>
          :causalChains.map((ch,i)=>{const confLabel=ch.confidence==='Strong'?'High confidence':ch.confidence==='Moderate'?'Moderate confidence':'Possible';const cc=ch.confidence==='Strong'?'#22C55E':ch.confidence==='Moderate'?'#FBBF24':SUB;return(
            <div key={i} style={{padding:16,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{fontSize:14,fontWeight:700,color:TEXT}}>{ch.type}</div>
                <span style={{padding:'3px 10px',background:`${cc}12`,border:`1px solid ${cc}25`,borderRadius:4,fontSize:9,fontWeight:700,color:cc,letterSpacing:'0.3px'}}>{confLabel}</span>
              </div>
              <div style={{fontSize:11,color:ACCENT,fontFamily:"'DM Mono'",marginBottom:8}}>{ch.zone}</div>
              <div style={{fontSize:13,color:SUB,lineHeight:1.7,marginBottom:12,padding:'10px 14px',background:SURFACE,borderRadius:8,borderLeft:`2px solid ${ACCENT}`}}>{ch.rootCause}</div>
              <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:6}}>Supporting evidence</div>
              {ch.evidence.map((e,j)=><div key={j} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:5}}><span style={{color:ACCENT,fontSize:12,marginTop:1,flexShrink:0}}>→</span><span style={{fontSize:12,color:SUB,lineHeight:1.6}}>{e}</span></div>)}
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
          {!narrative&&!narrativeLoading&&<div style={{padding:32,textAlign:'center',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
            <I n="report" s={28} c={DIM} w={1.4} />
            <div style={{fontSize:15,fontWeight:600,marginTop:14,marginBottom:4,color:TEXT}}>Findings Narrative</div>
            <div style={{fontSize:12,color:SUB,lineHeight:1.6,marginBottom:6}}>Generate a professional findings narrative from your assessment data.</div>
            <div style={{fontSize:10,color:DIM,lineHeight:1.5,marginBottom:20}}>Output is generated from deterministic scoring results — not from raw AI interpretation. You review and approve before delivery.</div>
            <button onClick={requestNarrative} style={{padding:'12px 28px',background:ACCENT,border:'none',borderRadius:8,color:BG,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Generate Narrative</button>
            <div style={{fontSize:9,color:DIM,marginTop:10}}>Costs 3 credits</div>
          </div>}
          {narrativeLoading&&<div style={{padding:44,textAlign:'center',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}><div style={{width:36,height:36,margin:'0 auto 14px',borderRadius:'50%',border:'2px solid transparent',borderTopColor:ACCENT,animation:'spin 1s linear infinite'}} /><div style={{fontSize:12,color:SUB}}>Generating narrative from assessment data...</div></div>}
          {narrative&&<div style={{padding:18,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:600,color:TEXT}}>Findings Narrative</div>
              <span style={{fontSize:9,color:DIM,fontFamily:"'DM Mono'"}}>AI-generated · Review required</span>
            </div>
            <div style={{fontSize:13,color:SUB,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{narrative}</div>
            <div style={{marginTop:14,padding:'10px 12px',background:`${WARN}08`,border:`1px solid ${WARN}18`,borderRadius:8}}>
              <div style={{fontSize:10,color:WARN,fontWeight:600}}>Professional review required</div>
              <div style={{fontSize:10,color:DIM,marginTop:3,lineHeight:1.5}}>This narrative was generated from deterministic scoring output. Review, edit, and approve before including in any client deliverable or report.</div>
            </div>
          </div>}
        </div>}

        {rTab==='actions'&&recs&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontSize:11,color:DIM,lineHeight:1.5,marginBottom:2}}>Recommendations are tiered by urgency and type. Review and adapt for site-specific conditions before implementation.</div>
          {[{k:'imm',l:'Immediate Actions',s:'Address within 48 hours',c:'#EF4444'},{k:'eng',l:'Engineering Controls',s:'1–4 weeks',c:ACCENT},{k:'adm',l:'Administrative Controls',s:'1–3 months',c:'#FBBF24'},{k:'mon',l:'Ongoing Monitoring',s:'Continuous',c:SUB}].map(cat=>{if(!recs[cat.k]?.length)return null;return(<div key={cat.k} style={{padding:14,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:cat.c}}>{cat.l}</div>
              <span style={{fontSize:9,color:DIM,fontFamily:"'DM Mono'"}}>{cat.s}</span>
            </div>
            {recs[cat.k].map((r,i)=><div key={i} style={{fontSize:12,color:SUB,lineHeight:1.7,marginBottom:6,paddingLeft:12,borderLeft:`2px solid ${cat.c}25`}}>{r}</div>)}
          </div>)})}
          <div style={{display:'flex',gap:10,marginTop:8}}>
            <button onClick={handleExportPDF} style={{flex:1,padding:'14px 20px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}30`,borderRadius:12,color:ACCENT,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><I n="download" s={16} c={ACCENT} /> PDF</button>
            <button onClick={handleShare} style={{flex:1,padding:'14px 20px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,color:SUB,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><I n="send" s={16} c={SUB} /> Share</button>
          </div>
          {!archived&&<button onClick={startNew} style={{padding:'14px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:12,color:SUB,fontSize:15,cursor:'pointer',fontFamily:'inherit',marginTop:8,minHeight:48,width:'100%'}}>New Assessment</button>}
        </div>}
      </div>
    )
  }


  // ── Trash view (inline component) ──
  const TrashView = ({ onRecover, onDelete }) => {
    const [items, setItems] = useState([])
    useEffect(() => { Backup.listTrash().then(setItems) }, [])
    return (
      <div style={{paddingTop:28,paddingBottom:100}}>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:8,color:TEXT}}>Trash</h2>
        <div style={{fontSize:13,color:SUB,marginBottom:20,lineHeight:1.6}}>Deleted items are kept for 30 days, then permanently removed.</div>
        {items.length===0?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:14,border:`1px solid ${BORDER}`,color:SUB,fontSize:14}}>Trash is empty</div>
        :items.map(t=>(
          <div key={t.id} style={{padding:'16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,marginBottom:8,display:'flex',alignItems:'center',gap:14}}>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:600,color:TEXT}}>{t.name||'Untitled'}</div>
              <div style={{fontSize:12,color:DIM,fontFamily:"'DM Mono'",marginTop:4}}>Deleted {fD(t.deletedAt)} · Expires {fD(t.expiresAt)}</div>
            </div>
            <button onClick={async()=>{await onRecover(t.id);setItems(await Backup.listTrash())}} style={{padding:'10px 16px',background:`${ACCENT}15`,border:`1px solid ${ACCENT}30`,borderRadius:10,color:ACCENT,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Recover</button>
            <button onClick={async()=>{await onDelete(t.id);setItems(await Backup.listTrash())}} style={{padding:'10px 14px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:DIM,fontSize:13,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>✕</button>
          </div>
        ))}
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
      <header style={{position:'fixed',top:0,left:0,right:0,zIndex:100,background:`${BG}F2`,backdropFilter:'blur(24px) saturate(1.4)',WebkitBackdropFilter:'blur(24px) saturate(1.4)',borderBottom:`1px solid ${BORDER}`,paddingTop:'env(safe-area-inset-top, 0px)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:48,padding:`0 ${padX}px`,maxWidth:contentMax,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:28,height:28,borderRadius:7,background:ACCENT,display:'flex',alignItems:'center',justifyContent:'center'}}><I n="wind" s={14} c={BG} w={2.2} /></div>
            <span style={{fontSize:15,fontWeight:700,letterSpacing:'-0.3px',color:TEXT}}>atmos<span style={{color:ACCENT}}>IQ</span></span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {isAssessing&&<span style={{fontSize:10,color:ACCENT,fontFamily:"'DM Mono'",background:`${ACCENT}0A`,padding:'3px 10px',borderRadius:4,border:`1px solid ${ACCENT}20`,letterSpacing:'0.5px'}}>SAVING</span>}
            {view!=='dash'&&view!=='drafts'&&view!=='history'&&view!=='settings'&&view!=='trash'&&view!=='tos'&&view!=='privacy'&&<button onClick={()=>{setView('dash');setViewRpt(null)}} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:13,fontWeight:600,padding:'7px 14px',cursor:'pointer',fontFamily:'inherit',minHeight:36,transition:'color 0.15s'}}>← Home</button>}
          </div>
        </div>
      </header>
      <div style={{height:'calc(48px + env(safe-area-inset-top, 0px))'}} />

      {milestone&&<div style={{position:'fixed',inset:0,background:`${BG}F0`,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 32px'}}><div style={{textAlign:'center',animation:'milestoneIn .5s cubic-bezier(.22,1,.36,1)'}}><div style={{marginBottom:20,display:'flex',justifyContent:'center'}}><div style={{width:80,height:80,borderRadius:22,background:`${ACCENT}12`,border:`1.5px solid ${ACCENT}30`,display:'flex',alignItems:'center',justifyContent:'center'}}><I n={milestone.icon} s={40} c={ACCENT} w={2} /></div></div><div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.5px',color:TEXT}}>{milestone.title}</div><div style={{fontSize:15,color:ACCENT,fontFamily:"'DM Mono'",marginTop:10}}>{milestone.sub}</div></div></div>}

      {zonePrompt&&<div style={{position:'fixed',inset:0,background:'#000000CC',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}><div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:28,maxWidth:340,width:'100%',animation:'fadeUp .3s ease'}}><div style={{fontSize:18,fontWeight:700,marginBottom:8,color:TEXT}}>Zone Complete</div><div style={{fontSize:14,color:SUB,marginBottom:24,lineHeight:1.6}}>Add another zone to this assessment?</div><div style={{display:'flex',flexDirection:'column',gap:10}}><button onClick={()=>{trackEvent('zone_added',{zone_index:zones.length});setZonePrompt(false);setZones(p=>[...p,{}]);setCurZone(zones.length);setZqi(0)}} style={{padding:'16px 0',background:`${ACCENT}12`,border:`1px solid ${ACCENT}30`,borderRadius:12,color:ACCENT,fontSize:16,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:52}}>+ Add Another Zone</button><button onClick={()=>{setZonePrompt(false);finishAssessment()}} style={{padding:'16px 0',background:'linear-gradient(135deg,#059669,#22C55E)',border:'none',borderRadius:12,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:52}}>Finish Assessment ✓</button></div></div></div>}

      {/* ── Connection Toast ── */}
      {connectionToast && (
        <div style={{position:'fixed',top:'calc(56px + env(safe-area-inset-top, 0px))',left:'50%',transform:'translateX(-50%)',zIndex:300,padding:'10px 20px',borderRadius:8,background:connectionToast==='offline'?'#F59E0B':'#22C55E',color:'#000',fontSize:12,fontWeight:600,fontFamily:'inherit',boxShadow:'0 4px 20px rgba(0,0,0,0.4)',animation:'fadeUp .3s ease',display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:connectionToast==='offline'?'#92400E':'#166534'}} />
          {connectionToast==='offline'?'You\'re offline — changes will sync when reconnected':'Back online — syncing data'}
        </div>
      )}

      {/* ── Pre-Assessment Disclaimer ── */}
      {showDisclaimer&&<div style={{position:'fixed',inset:0,background:'#000000DD',zIndex:250,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={e=>{if(e.target===e.currentTarget)setShowDisclaimer(false)}}>
        <div style={{width:'100%',maxWidth:420,background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:'24px 20px',animation:'fadeUp .3s ease',maxHeight:'85vh',overflowY:'auto'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
            <I n="shield" s={20} c={ACCENT} w={1.6} />
            <div style={{fontSize:16,fontWeight:700,color:TEXT}}>Before You Begin</div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:12,fontSize:12,color:SUB,lineHeight:1.7}}>
            <div style={{padding:'12px 14px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`}}>
              <div style={{fontSize:10,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Advisory Use Only</div>
              <div>All outputs generated by atmosIQ are advisory and intended to support — not replace — professional judgment by a qualified industrial hygienist or EHS professional.</div>
            </div>

            <div style={{padding:'12px 14px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`}}>
              <div style={{fontSize:10,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Scoring Methodology</div>
              <div>Scoring applies deterministic rules informed by recognized ventilation, comfort, and exposure standards. It does not constitute a compliance certification or regulatory determination.</div>
            </div>

            <div style={{padding:'12px 14px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`}}>
              <div style={{fontSize:10,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Assessor Responsibility</div>
              <div>You are responsible for interpreting findings, reviewing all generated outputs, and exercising professional judgment before any deliverable is shared with clients or used for decision-making.</div>
            </div>

            <div style={{padding:'12px 14px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`}}>
              <div style={{fontSize:10,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Report Review</div>
              <div>AI-generated narratives and automated findings require professional review before client delivery. atmosIQ does not provide legal, regulatory, or medical advice.</div>
            </div>
          </div>

          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button onClick={()=>setShowDisclaimer(false)} style={{flex:0,padding:'12px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:13,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Cancel</button>
            <button onClick={proceedAfterDisclaimer} style={{flex:1,padding:'12px 20px',background:ACCENT,border:'none',borderRadius:8,color:BG,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>I Understand — Begin Assessment</button>
          </div>

          <div style={{textAlign:'center',marginTop:12,fontSize:9,color:DIM}}>By proceeding, you acknowledge these terms for this assessment session.</div>
        </div>
      </div>}

      {/* ── Pricing Modal ── */}
      {showPricing&&<div style={{position:'fixed',inset:0,background:'#000000DD',zIndex:250,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)setShowPricing(false)}}>
        <div style={{width:'100%',maxWidth:contentMax,background:CARD,border:`1px solid ${BORDER}`,borderRadius:'20px 20px 0 0',padding:'24px 20px',paddingBottom:'calc(32px + env(safe-area-inset-bottom, 0px))',animation:'fadeUp .3s ease'}}>
          <div style={{width:36,height:4,borderRadius:2,background:BORDER,margin:'0 auto 16px'}} />
          <div style={{fontSize:18,fontWeight:700,color:TEXT,marginBottom:4}}>Assessment Credits</div>
          <div style={{fontSize:12,color:SUB,marginBottom:4}}>Credits power assessments and AI narrative generation.</div>
          <div style={{fontSize:11,color:DIM,marginBottom:20,fontFamily:"'DM Mono'"}}>Current balance: {credits} credit{credits!==1?'s':''}</div>
          {[
            {id:'solo',name:'Solo',credits:50,price:'$149',per:'/month',desc:'For independent assessors'},
            {id:'pro',name:'Pro',credits:200,price:'$349',per:'/month',desc:'For active consulting firms',popular:true},
            {id:'team',name:'Team',credits:500,price:'$799',per:'/month',desc:'For teams and enterprise'},
          ].map(p=>(
            <button key={p.id} onClick={async()=>{
              try{
                const res=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:p.id,userId:profile?.id,userEmail:profile?.email})})
                const data=await res.json()
                if(data.url)window.location.href=data.url
              }catch{alert('Payment setup failed. Please try again.')}
            }} style={{width:'100%',padding:'16px 18px',background:p.popular?`${ACCENT}08`:SURFACE,border:`1px solid ${p.popular?ACCENT+'30':BORDER}`,borderRadius:12,marginBottom:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit',position:'relative',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              {p.popular&&<div style={{position:'absolute',top:-8,right:16,padding:'2px 10px',borderRadius:6,background:ACCENT,color:BG,fontSize:9,fontWeight:700}}>BEST VALUE</div>}
              <div>
                <div style={{fontSize:15,fontWeight:700,color:TEXT}}>{p.name} <span style={{fontWeight:500,color:SUB}}>— {p.credits} credits</span></div>
                <div style={{fontSize:11,color:DIM,marginTop:2}}>{p.desc}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontSize:18,fontWeight:700,color:ACCENT}}>{p.price}</div>
                <div style={{fontSize:9,color:DIM,fontFamily:"'DM Mono'"}}>{p.per}</div>
              </div>
            </button>
          ))}
          <div style={{textAlign:'center',marginTop:12,fontSize:10,color:DIM}}>Secure payments by Stripe · Credits never expire</div>
        </div>
      </div>}

      {delConf&&<div style={{position:'fixed',inset:0,background:'#000000CC',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}><div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:28,maxWidth:340,width:'100%',animation:'fadeUp .3s ease'}}><div style={{fontSize:18,fontWeight:700,marginBottom:8,color:TEXT}}>Move to Trash?</div><div style={{fontSize:14,color:SUB,marginBottom:12,lineHeight:1.6}}>You can recover this for 30 days.</div><div style={{fontSize:12,color:DIM,marginBottom:24,background:SURFACE,padding:'10px 14px',borderRadius:8}}>Recoverable from Dashboard → Trash</div><div style={{display:'flex',gap:10}}><button onClick={()=>setDelConf(null)} style={{flex:1,padding:'14px 0',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Cancel</button><button onClick={()=>deleteItem(delConf.id,delConf.name,delConf.type)} style={{flex:1,padding:'14px 0',background:'#EF444420',border:'1px solid #EF444440',borderRadius:10,color:'#EF4444',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Delete</button></div></div></div>}

      <div style={{maxWidth:contentMax,margin:'0 auto',padding:`0 ${padX}px`,position:'relative',zIndex:1}}>

        {view==='dash'&&<div style={{paddingTop:28,paddingBottom:100}}>

          {/* ── Context Header ── */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,animation:'fadeUp .4s ease'}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:TEXT,marginBottom:2}}>{profile?.name||'Assessor'}</div>
              <div style={{fontSize:11,fontFamily:"'DM Mono'",color:SUB}}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</div>
              <div style={{fontSize:10,color:DIM,marginTop:4,display:'flex',alignItems:'center',gap:6}}>
                {profile?.iaq_meter && <><div style={{width:5,height:5,borderRadius:'50%',background:profile.iaq_cal_status?.includes('within manufacturer')?SUCCESS:WARN}} /><span>{profile.iaq_cal_status?.includes('within manufacturer')?'Meter calibrated':'Check calibration'}</span><span style={{color:BORDER}}>·</span></>}
                <span>Standards loaded</span>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <button onClick={()=>setShowPricing(true)} style={{padding:'4px 10px',borderRadius:6,background:`${ACCENT}10`,border:`1px solid ${ACCENT}18`,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:4}}>
                <span style={{fontSize:12,fontWeight:700,color:ACCENT,fontFamily:"'DM Mono'"}}>{credits}</span>
                <span style={{fontSize:9,color:SUB}}>credits</span>
              </button>
              {profile&&<button onClick={()=>setView('settings')} style={{width:36,height:36,borderRadius:10,background:CARD,border:`1px solid ${BORDER}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'border-color 0.15s'}}>
                <I n="user" s={16} c={SUB} />
              </button>}
            </div>
          </div>

          {/* ── Dashboard Content — adaptive layout ── */}
          <div style={{display:isTabletLand?'grid':'block',gridTemplateColumns:isTabletLand?'1fr 1fr':'none',gap:isTabletLand?24:0,alignItems:'start'}}>

          {/* Left column (or full width on portrait/phone) */}
          <div>
          {/* ── Primary Action ── */}
          <button onClick={startNew} style={{width:'100%',padding:isTablet?'22px 24px':'20px',marginBottom:12,background:CARD,border:`1px solid ${ACCENT}25`,borderRadius:12,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:16,fontFamily:'inherit',transition:'border-color 0.2s,background 0.2s',position:'relative',overflow:'hidden'}}>
            <div style={{width:48,height:48,borderRadius:12,background:`${ACCENT}12`,border:`1px solid ${ACCENT}20`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <I n="wind" s={22} c={ACCENT} w={2} />
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:isTablet?17:16,fontWeight:700,color:TEXT,letterSpacing:'-0.2px'}}>New Assessment</div>
              <div style={{fontSize:12,color:SUB,marginTop:3}}>Multi-zone IAQ · {profile?.name?.split(',')[0]||'Profile'} auto-filled</div>
            </div>
            <div style={{width:32,height:32,borderRadius:8,background:`${ACCENT}10`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{fontSize:14,color:ACCENT}}>→</span>
            </div>
          </button>

          {/* ── Secondary: Demo ── */}
          <button onClick={runDemo} style={{width:'100%',padding:'14px 20px',marginBottom:16,background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,fontFamily:'inherit',transition:'border-color 0.15s'}}>
            <I n="bldg" s={18} c={DIM} />
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:SUB}}>Open sample project</div>
              <div style={{fontSize:10,color:DIM,marginTop:2}}>Meridian Business Park · 3 zones</div>
            </div>
            <span style={{fontSize:13,color:DIM}}>→</span>
          </button>

          {/* ── Workspace Cards ── */}
          <div style={{display:'grid',gridTemplateColumns:isTabletLand?'1fr':'1fr 1fr',gap:10,marginBottom:isTabletLand?12:20}}>
            {[
              {l:'Drafts',n:(index.drafts||[]).length,v:'drafts',ic:'clip',sub:((index.drafts||[]).length>0?'In progress':'No active drafts')},
              {l:'Reports',n:(index.reports||[]).length,v:'history',ic:'findings',sub:((index.reports||[]).length>0?'Finalized':'No finalized reports')}
            ].map(c=>(
              <button key={c.l} onClick={()=>{if(c.n)setView(c.v)}} style={{padding:'16px',background:CARD,border:`1px solid ${c.n?`${ACCENT}18`:BORDER}`,borderRadius:10,cursor:c.n?'pointer':'default',textAlign:'left',fontFamily:'inherit',transition:'border-color 0.15s'}}>
                <div style={{fontSize:22,fontWeight:700,fontFamily:"'DM Mono'",color:c.n?TEXT:DIM,marginBottom:8}}>{c.n}</div>
                <div style={{fontSize:13,fontWeight:600,color:c.n?TEXT:SUB}}>{c.l}</div>
                <div style={{fontSize:10,color:SUB,marginTop:3}}>{c.sub}</div>
              </button>
            ))}
          </div>

          {/* ── Attention Strip — rotates based on state ── */}
          {(() => {
            const draftCount = (index.drafts||[]).length
            const reportCount = (index.reports||[]).length
            const calDue = profile?.iaq_meter && !profile?.iaq_cal_status?.includes('within manufacturer')
            const lastReport = (index.reports||[])[0]
            let msg, icon, color
            if (calDue) { msg = 'Meter calibration may be due — check before next assessment'; icon = 'alert'; color = WARN }
            else if (draftCount > 0) { msg = `${draftCount} draft${draftCount>1?'s':''} in progress — resume to finalize`; icon = 'draft'; color = SUB }
            else if (reportCount === 0) { msg = 'No reports ready for export'; icon = 'guidance'; color = DIM }
            else if (lastReport) { msg = `Last report: ${lastReport.facility || 'Assessment'} · ${fD(lastReport.ts)}`; icon = 'findings'; color = DIM }
            else { msg = 'System ready'; icon = 'check'; color = DIM }
            return (
              <div style={{padding:'8px 14px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
                <I n={icon} s={13} c={color} w={1.6} />
                <span style={{fontSize:10,color:color===WARN?SUB:DIM,fontFamily:"'DM Mono'"}}>{msg}</span>
              </div>
            )
          })()}

          {/* ── Status Bar ── */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:isTabletLand?0:20}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:navigator.onLine&&supabase?SUCCESS:supabase?WARN:DIM}} />
              <span style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'"}}>{navigator.onLine&&supabase?'Cloud synced':supabase?'Offline mode':'Stored on device'}</span>
            </div>
            <span style={{fontSize:9,color:DIM,fontFamily:"'DM Mono'"}}>v{VER}</span>
          </div>
          </div>{/* end left column */}

          {/* Right column (recent assessments — side panel in landscape, below in portrait) */}
          <div>
          {/* ── Recent Assessments ── */}
          {(index.reports||[]).length>0&&<div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <span style={{fontSize:12,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'1px'}}>Recent</span>
              {(index.reports||[]).length>3&&<button onClick={()=>setView('history')} style={{background:'none',border:'none',color:ACCENT,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:'4px 0'}}>View all</button>}
            </div>
            {(index.reports||[]).slice(0,3).map(r=>(
              <button key={r.id} onClick={()=>openReport(r)} style={{width:'100%',padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',transition:'border-color 0.15s'}}>
                <div style={{width:38,height:38,borderRadius:8,background:r.score>=70?`${SUCCESS}10`:r.score>=50?`${WARN}10`:`${DANGER}10`,border:`1px solid ${r.score>=70?`${SUCCESS}20`:r.score>=50?`${WARN}20`:`${DANGER}20`}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <span style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono'",color:r.score>=70?SUCCESS:r.score>=50?WARN:DANGER}}>{r.score||'—'}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:TEXT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.facility||'Untitled'}</div>
                  <div style={{fontSize:11,color:DIM,fontFamily:"'DM Mono'",marginTop:2}}>{fD(r.ts)}</div>
                </div>
                <span style={{fontSize:12,color:DIM}}>→</span>
              </button>
            ))}
          </div>}

          {/* ── System Summary (when no recent reports) ── */}
          {(index.reports||[]).length===0&&(
            <div style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginTop:12}}>
              <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:8}}>System Summary</div>
              <div style={{display:'flex',flexDirection:'column',gap:4,fontSize:11,color:SUB,fontFamily:"'DM Mono'"}}>
                <div style={{display:'flex',justifyContent:'space-between'}}><span>Assessor</span><span style={{color:TEXT}}>{profile?.name?.split(',')[0]||'Not set'}</span></div>
                <div style={{display:'flex',justifyContent:'space-between'}}><span>Primary meter</span><span style={{color:profile?.iaq_meter?TEXT:DIM}}>{profile?.iaq_meter||'Not configured'}</span></div>
                <div style={{display:'flex',justifyContent:'space-between'}}><span>Standards</span><span style={{color:TEXT}}>ASHRAE · OSHA · EPA</span></div>
                <div style={{display:'flex',justifyContent:'space-between'}}><span>Storage</span><span style={{color:TEXT}}>{(index.drafts||[]).length} drafts · {(index.reports||[]).length} reports</span></div>
              </div>
            </div>
          )}
          </div>{/* end right column */}
          </div>{/* end adaptive grid */}
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

        {view==='drafts'&&<div style={{paddingTop:28,paddingBottom:100}}>
          <h2 style={{fontSize:20,fontWeight:700,marginBottom:4,color:TEXT}}>Drafts</h2>
          <div style={{fontSize:11,color:DIM,marginBottom:20}}>Assessments in progress</div>
          {(index.drafts||[]).length===0?(
            <div style={{padding:'48px 24px',textAlign:'center',background:CARD,borderRadius:10,border:`1px solid ${BORDER}`}}>
              <I n="draft" s={28} c={DIM} w={1.4} />
              <div style={{fontSize:15,fontWeight:600,color:SUB,marginTop:16}}>No drafts in progress</div>
              <div style={{fontSize:12,color:DIM,marginTop:6,lineHeight:1.5}}>Start a new assessment to begin capturing field data.</div>
              <button onClick={startNew} style={{marginTop:16,padding:'10px 24px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}25`,borderRadius:8,color:ACCENT,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>New Assessment</button>
              <div style={{marginTop:10}}><button onClick={runDemo} style={{background:'none',border:'none',color:DIM,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>or open sample project →</button></div>
            </div>
          ):(index.drafts||[]).map(d=>(
            <div key={d.id} style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6,display:'flex',alignItems:'center',gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:TEXT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.facility||'Untitled Assessment'}</div>
                <div style={{fontSize:11,color:DIM,fontFamily:"'DM Mono'",marginTop:3}}>{fD(d.ua||d.ts)}</div>
                <div style={{fontSize:10,color:ACCENT,marginTop:3}}>In progress</div>
              </div>
              <button onClick={()=>resumeDraft(d.id)} style={{padding:'8px 16px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}25`,borderRadius:8,color:ACCENT,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:38}}>Resume</button>
              <button onClick={()=>setDelConf({id:d.id,name:d.facility,type:'dft'})} style={{width:36,height:36,background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',flexShrink:0}}>
                <I n="alert" s={14} c={DIM} w={1.4} />
              </button>
            </div>
          ))}
        </div>}

        {view==='history'&&<div style={{paddingTop:28,paddingBottom:100}}>
          <h2 style={{fontSize:20,fontWeight:700,marginBottom:4,color:TEXT}}>Reports</h2>
          <div style={{fontSize:11,color:DIM,marginBottom:16}}>Finalized assessment deliverables</div>
          <div style={{display:'flex',gap:8,marginBottom:14}}>
            <input type="text" value={hSearch} onChange={e=>setHSearch(e.target.value)} placeholder="Search reports..." style={{flex:1,padding:'12px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:TEXT,fontSize:15,fontFamily:'inherit',outline:'none',boxSizing:'border-box',minHeight:44}} />
            <select value={hSort} onChange={e=>setHSort(e.target.value)} style={{padding:'12px 12px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:12,fontFamily:'inherit',outline:'none',minHeight:44}}>
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="score-low">Score ↑</option><option value="score-high">Score ↓</option>
            </select>
          </div>
          {fReports.length===0?(
            <div style={{padding:'48px 24px',textAlign:'center',background:CARD,borderRadius:10,border:`1px solid ${BORDER}`}}>
              <I n="report" s={28} c={DIM} w={1.4} />
              <div style={{fontSize:15,fontWeight:600,color:SUB,marginTop:16}}>No reports generated yet</div>
              <div style={{fontSize:12,color:DIM,marginTop:6,lineHeight:1.5}}>{hSearch?'No reports match your search.':'Complete and finalize an assessment to generate your first report.'}</div>
              {!hSearch&&<>
                <button onClick={startNew} style={{marginTop:16,padding:'10px 24px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}25`,borderRadius:8,color:ACCENT,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Start Assessment</button>
                <div style={{marginTop:10}}><button onClick={runDemo} style={{background:'none',border:'none',color:DIM,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>or view sample report →</button></div>
              </>}
            </div>
          ):fReports.map(r=>(
            <div key={r.id} onClick={()=>openReport(r)} style={{width:'100%',padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',transition:'border-color 0.15s'}}>
              <div style={{width:40,height:40,borderRadius:8,background:r.score>=70?`${SUCCESS}10`:r.score>=50?`${WARN}10`:`${DANGER}10`,border:`1px solid ${r.score>=70?`${SUCCESS}20`:r.score>=50?`${WARN}20`:`${DANGER}20`}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:15,fontWeight:800,fontFamily:"'DM Mono'",color:r.score>=70?SUCCESS:r.score>=50?WARN:DANGER}}>{r.score||'—'}</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:TEXT}}>{r.facility||'Untitled'}</div>
                <div style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'",marginTop:3}}>{fD(r.ts)} · Final</div>
              </div>
              <button onClick={e=>{e.stopPropagation();setDelConf({id:r.id,name:r.facility,type:'rpt'})}} style={{width:36,height:36,background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',flexShrink:0}}>
                <I n="alert" s={14} c={DIM} w={1.4} />
              </button>
            </div>
          ))}
        </div>}
        {view==='trash'&&<TrashView onRecover={async(id)=>{await Backup.recover(id);await refreshIndex()}} onDelete={async(id)=>{await Backup.permanentDelete(id)}} />}
        {view==='settings'&&<SettingsScreen profile={profile} onEditProfile={()=>{setProfile({...profile,isNew:true});setView('dash')}} onLogout={handleLogout} onClose={()=>setView('dash')} onNavigate={(v)=>{if(v==='pricing'){setShowPricing(true)}else{setView(v)}}} adminActive={!!adminSecret} onActivateAdmin={(secret)=>{setAdminSecret(secret);setView('admin')}} />}
        {view==='tos'&&<TermsOfService onBack={()=>setView('settings')} />}
        {view==='privacy'&&<PrivacyPolicy onBack={()=>setView('settings')} />}
        {view==='admin'&&adminSecret&&<AdminDashboard onBack={()=>setView('settings')} adminSecret={adminSecret} />}
      </div>

      {/* ── Bottom Tab Bar ── */}
      {!isAssessing && !milestone && (
        <nav style={{position:'fixed',bottom:0,left:0,right:0,zIndex:100,background:`${BG}F5`,backdropFilter:'blur(24px) saturate(1.3)',WebkitBackdropFilter:'blur(24px) saturate(1.3)',borderTop:`1px solid ${BORDER}`,paddingBottom:'env(safe-area-inset-bottom, 0px)'}}>
          <div style={{display:'flex',justifyContent:'space-around',alignItems:'center',height:52,maxWidth:contentMax,margin:'0 auto'}}>
            {[
              {id:'dash',label:'Home',icon:'home'},
              {id:'drafts',label:'Drafts',icon:'clip',badge:(index.drafts||[]).length||null},
              {id:'history',label:'Reports',icon:'findings',badge:(index.reports||[]).length||null},
              {id:'settings',label:'Settings',icon:'user'},
            ].map(t=>(
              <button key={t.id} onClick={()=>{ supabase&&trackEvent('page_view',{tab:t.id}); setView(t.id); if(t.id==='dash')setViewRpt(null); }} style={{background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'6px 16px',minWidth:56,fontFamily:'inherit',position:'relative',WebkitTapHighlightColor:'transparent',transition:'opacity 0.15s'}}>
                <div style={{position:'relative'}}>
                  <I n={t.icon} s={20} c={view===t.id?ACCENT:DIM} w={view===t.id?2:1.6} />
                  {t.badge>0&&<div style={{position:'absolute',top:-3,right:-7,minWidth:14,height:14,borderRadius:7,background:ACCENT,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:BG,fontFamily:"'DM Mono'",padding:'0 3px'}}>{t.badge}</div>}
                </div>
                <span style={{fontSize:9,fontWeight:view===t.id?600:500,color:view===t.id?ACCENT:DIM,letterSpacing:'0.2px'}}>{t.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

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
