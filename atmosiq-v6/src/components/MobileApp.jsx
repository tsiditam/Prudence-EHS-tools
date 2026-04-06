/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MobileApp — v5-style one-question-at-a-time field experience
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import STO from '../utils/storage'
import { VER, PLAT_MODULES } from '../constants/standards'
import { Q_PRESURVEY, Q_BUILDING, Q_ZONE, SENSOR_FIELDS } from '../constants/questions'
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
import { DEMO_PRESURVEY, DEMO_BUILDING, DEMO_ZONES } from '../constants/demoData'

const haptic = (type) => { try { if (navigator.vibrate) navigator.vibrate(type === 'heavy' ? [30,20,30] : type === 'success' ? [10,30,10,30,10] : 12) } catch {} }
const fD = ts => ts ? new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''
const sv = sev => ({critical:{c:'#EF4444',bg:'#EF444415',l:'CRITICAL'},high:{c:'#FB923C',bg:'#FB923C15',l:'HIGH'},medium:{c:'#FBBF24',bg:'#FBBF2415',l:'MEDIUM'},low:{c:'#22D3EE',bg:'#22D3EE12',l:'LOW'},pass:{c:'#22C55E',bg:'#22C55E12',l:'PASS'},info:{c:'#64748B',bg:'#64748B12',l:'INFO'}}[sev]||{c:'#64748B',bg:'#64748B12',l:''})
const badge = (risk,rc) => <span style={{padding:'5px 14px',background:`${rc}18`,border:`1px solid ${rc}35`,borderRadius:20,fontSize:13,fontWeight:700,color:rc}}>{risk}</span>

export default function MobileApp() {
  const [loading, setLoading] = useState(true)
  const [isReturning, setIsReturning] = useState(false)
  const [view, setView] = useState('dash')
  const [milestone, setMilestone] = useState(null)
  const [clock, setClock] = useState(new Date())

  const [draftId, setDraftId] = useState(null)
  const [presurvey, setPresurvey] = useState({})
  const [psqi, setPsqi] = useState(0)
  const [bldg, setBldg] = useState({})
  const [bqi, setBqi] = useState(0)
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
  const [hSearch, setHSearch] = useState('')
  const [hSort, setHSort] = useState('newest')

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { (async () => { const v = await STO.hasVisited(); setIsReturning(!!v); const idx = await STO.getIndex(); setIndex(idx); await STO.markVisited() })() }, [])

  const refreshIndex = async () => { setIndex(await STO.getIndex()) }

  // Auto-save draft
  const saveRef = useRef(null)
  useEffect(() => {
    if (!['presurvey','bldg','zone'].includes(view) || !draftId) return
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(async () => {
      const draft = { id:draftId, presurvey, bldg, zones, photos, psqi, bqi, curZone, zqi, ua:new Date().toISOString() }
      await STO.set(draftId, draft)
      await STO.addDraftToIndex({ id:draftId, facility:bldg.fn||'Untitled', ua:draft.ua })
      await refreshIndex()
    }, 1200)
    return () => { if (saveRef.current) clearTimeout(saveRef.current) }
  }, [presurvey, bldg, zones, photos, psqi, bqi, curZone, zqi, view, draftId])

  const psVis = useMemo(() => Q_PRESURVEY.filter(q => { if (!q.cond) return true; if (q.cond.eq && presurvey[q.cond.f] !== q.cond.eq) return false; if (q.cond.ne && presurvey[q.cond.f] === q.cond.ne) return false; return true }), [presurvey])
  const bVis = useMemo(() => Q_BUILDING.filter(q => { if (!q.cond) return true; if (q.cond.eq && bldg[q.cond.f] !== q.cond.eq) return false; if (q.cond.ne && bldg[q.cond.f] === q.cond.ne) return false; return true }), [bldg])
  const zData = zones[curZone] || {}
  const zVis = useMemo(() => Q_ZONE.filter(q => { if (!q.cond) return true; if (q.cond.eq && zData[q.cond.f] !== q.cond.eq) return false; if (q.cond.ne && zData[q.cond.f] === q.cond.ne) return false; return true }), [zData])

  const setBF = useCallback((id,v) => setBldg(p=>({...p,[id]:v})), [])
  const setPSF = useCallback((id,v) => setPresurvey(p=>({...p,[id]:v})), [])
  const setZF = useCallback((id,v) => { setZones(prev => { const next = [...prev]; next[curZone] = {...(next[curZone]||{}), [id]:v}; return next }) }, [curZone])

  const showMilestone = (icon, title, sub, nextFn) => {
    haptic('success'); setMilestone({icon, title, sub})
    setTimeout(() => { setMilestone(null); nextFn() }, 1400)
  }

  const startNew = () => {
    const id = 'draft-' + Date.now()
    setDraftId(id); setPresurvey({}); setPsqi(0); setBldg({}); setBqi(0); setZones([{}]); setCurZone(0); setZqi(0); setPhotos({})
    setZoneScores([]); setComp(null); setOshaResult(null); setRecs(null); setNarrative(null); setSamplingPlan(null); setCausalChains([])
    setView('presurvey')
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
    setPsqi(d.psqi||0); setBqi(d.bqi||0); setCurZone(d.curZone||0); setZqi(d.zqi||0)
    if ((d.psqi||0) < Q_PRESURVEY.length && !(d.bldg||d.building)?.fn) setView('presurvey')
    else if ((d.bqi||0) < Q_BUILDING.length) setView('bldg')
    else setView('zone')
  }

  const finishPresurvey = () => { showMilestone('check', 'Pre-Survey Complete', 'Starting on-site assessment', () => { setBqi(0); setView('bldg') }) }
  const finishBuilding = () => { if (zones.length === 0) setZones([{}]); showMilestone('bldg', 'Building Assessment Complete', 'Starting zone walkthrough', () => { setCurZone(0); setZqi(0); setView('zone') }) }

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

  const psSecs = [...new Set(psVis.map(q=>q.sec))]
  const bSecs = [...new Set(bVis.map(q=>q.sec))]
  const zSecs = [...new Set(zVis.map(q=>q.sec))]

  if (loading) return <Loading fast={isReturning} onDone={() => setLoading(false)} />


  // ── Question renderer (one at a time) ──
  const renderQuestion = (q, data, setField, qIdx, visQs, goNext, goPrev, onFinish, finishLabel, secs) => {
    const progress = Math.round(((qIdx + 1) / visQs.length) * 100)
    const secIdx = secs.indexOf(q.sec)
    return (
      <div style={{paddingTop:12,paddingBottom:100}}>
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <span style={{fontSize:12,color:'#8B95A8',fontFamily:"'DM Mono'"}}>{qIdx + 1} of {visQs.length}</span>
            <span style={{fontSize:12,color:'#22D3EE',fontFamily:"'DM Mono'",fontWeight:600}}>{progress}%</span>
          </div>
          <div style={{height:4,background:'#12161D',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${progress}%`,background:'linear-gradient(90deg,#0891B2,#22D3EE)',borderRadius:2,transition:'width .4s ease',boxShadow:'0 0 8px #22D3EE40'}} />
          </div>
        </div>
        <div style={{display:'flex',gap:6,marginBottom:24,flexWrap:'wrap'}}>
          {secs.map((s,i)=><span key={s} style={{padding:'7px 14px',borderRadius:20,fontSize:12,fontWeight:600,fontFamily:"'DM Mono'",background:i===secIdx?'#22D3EE15':'transparent',color:i===secIdx?'#22D3EE':i<secIdx?'#8B95A8':'#3A4050',border:`1px solid ${i===secIdx?'#22D3EE30':'transparent'}`}}>{s}</span>)}
        </div>
        <div key={q.id+'-'+curZone} style={{animation:'fadeUp .4s cubic-bezier(.22,1,.36,1)'}}>
          <div style={{width:52,height:52,borderRadius:14,background:'#22D3EE10',border:'1px solid #22D3EE20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,marginBottom:18}}>{q.ic}</div>
          <h2 style={{fontSize:28,fontWeight:700,lineHeight:1.25,margin:0,marginBottom:8,letterSpacing:'-0.5px'}}>{q.q}</h2>
          {q.ref&&<div style={{display:'inline-flex',gap:7,padding:'7px 14px',background:'#0C1017',border:'1px solid #1A2030',borderRadius:8,marginBottom:20,marginTop:6}}><span style={{fontSize:12,color:'#8B95A8',fontFamily:"'DM Mono'",lineHeight:1.4}}>{q.ref}</span></div>}
          {!q.ref&&<div style={{height:16}} />}

          {q.t==='text'&&<input type="text" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Type...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&data[q.id])goNext()}} style={{width:'100%',padding:'16px 18px',background:'#0C1017',border:'1.5px solid #1A2030',borderRadius:12,color:'#F0F4F8',fontSize:17,fontFamily:"'Outfit'",fontWeight:500,outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor='#22D3EE'} onBlur={e=>e.target.style.borderColor='#1A2030'} />}
          {q.t==='num'&&<div style={{position:'relative'}}><input type="number" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Enter...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&data[q.id])goNext()}} style={{width:'100%',padding:'16px 18px',paddingRight:q.u?70:18,background:'#0C1017',border:'1.5px solid #1A2030',borderRadius:12,color:'#F0F4F8',fontSize:17,fontFamily:"'Outfit'",fontWeight:500,outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor='#22D3EE'} onBlur={e=>e.target.style.borderColor='#1A2030'} />{q.u&&<span style={{position:'absolute',right:16,top:'50%',transform:'translateY(-50%)',color:'#5E6578',fontSize:14,fontFamily:"'DM Mono'"}}>{q.u}</span>}</div>}
          {q.t==='ta'&&<textarea value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder="Notes..." rows={3} style={{width:'100%',padding:'16px 18px',background:'#0C1017',border:'1.5px solid #1A2030',borderRadius:12,color:'#F0F4F8',fontSize:16,fontFamily:"'Outfit'",outline:'none',resize:'vertical',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor='#22D3EE'} onBlur={e=>e.target.style.borderColor='#1A2030'} />}
          {q.t==='ch'&&q.opts&&<div style={{display:'flex',flexDirection:'column',gap:8}}>{q.opts.map((o,i)=>{const sel=data[q.id]===o;return(<button key={o} onClick={()=>{haptic('light');setField(q.id,o);setTimeout(goNext,250)}} style={{padding:'15px 18px',textAlign:'left',background:sel?'#22D3EE12':'#0C1017',border:`1.5px solid ${sel?'#22D3EE':'#1A2030'}`,borderRadius:12,color:sel?'#22D3EE':'#E2E8F0',fontSize:16,fontFamily:"'Outfit'",fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:12,animation:`fadeUp .3s ${i*.04}s cubic-bezier(.22,1,.36,1) both`}}><div style={{width:22,height:22,borderRadius:'50%',border:`2px solid ${sel?'#22D3EE':'#2A3040'}`,background:sel?'#22D3EE':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{sel&&<I n="check" s={10} c="#080A0E" />}</div>{o}</button>)})}</div>}
          {q.t==='multi'&&q.opts&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>{q.opts.map((o,i)=>{const arr=data[q.id]||[],sel=arr.includes(o);return(<button key={o} onClick={()=>setField(q.id,sel?arr.filter(x=>x!==o):[...arr,o])} style={{padding:'10px 16px',borderRadius:24,background:sel?'#22D3EE15':'#0C1017',border:`1.5px solid ${sel?'#22D3EE':'#1A2030'}`,color:sel?'#22D3EE':'#C8D0DC',fontSize:14,fontFamily:"'Outfit'",fontWeight:500,cursor:'pointer',animation:`fadeUp .25s ${i*.03}s cubic-bezier(.22,1,.36,1) both`}}>{sel?'✓ ':''}{o}</button>)})}</div>}
          {q.t==='combo'&&q.opts&&(()=>{const otherOpts=q.opts.filter(o=>o!=='Other');const isOther=(data[q.id]||'')==='__other__'||((data[q.id]||'')&&!otherOpts.includes(data[q.id]));return(<div><select value={isOther?'__other__':(data[q.id]||'')} onChange={e=>setField(q.id,e.target.value)} style={{width:'100%',padding:'16px 18px',background:'#0C1017',border:'1.5px solid #1A2030',borderRadius:12,color:'#F0F4F8',fontSize:17,fontFamily:"'Outfit'",outline:'none',boxSizing:'border-box',appearance:'auto'}}><option value="">Select...</option>{otherOpts.map(o=><option key={o} value={o}>{o}</option>)}<option value="__other__">Other</option></select>{isOther&&<input type="text" value={data[q.id]==='__other__'?'':data[q.id]} onChange={e=>setField(q.id,e.target.value||'__other__')} placeholder="Type here..." autoFocus style={{width:'100%',padding:'16px 18px',background:'#0C1017',border:'1.5px solid #22D3EE',borderRadius:12,color:'#F0F4F8',fontSize:17,fontFamily:"'Outfit'",outline:'none',boxSizing:'border-box',marginTop:8}} />}</div>)})()}
          {q.t==='sensors'&&<SensorScreen data={data} onChange={setField} isDesktop={false} />}
          {q.photo&&<PhotoCapture photos={photos[`z${curZone}-${q.id}`]||[]} onAdd={p=>setPhotos(prev=>({...prev,[`z${curZone}-${q.id}`]:[...(prev[`z${curZone}-${q.id}`]||[]),p]}))} onRemove={i=>setPhotos(prev=>({...prev,[`z${curZone}-${q.id}`]:(prev[`z${curZone}-${q.id}`]||[]).filter((_,j)=>j!==i)}))} />}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:32}}>
          <button onClick={goPrev} disabled={qIdx===0} style={{background:'none',border:'none',color:qIdx===0?'#3A4050':'#9CA3B4',fontSize:15,fontWeight:500,cursor:qIdx===0?'default':'pointer',fontFamily:'inherit'}}>← Back</button>
          <div style={{display:'flex',gap:8}}>
            {q.sk&&<button onClick={goNext} style={{padding:'12px 20px',background:'transparent',border:'1.5px solid #2A3040',borderRadius:10,color:'#8B95A8',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>Skip</button>}
            {qIdx===visQs.length-1
              ? <button onClick={onFinish} style={{padding:'13px 26px',background:'linear-gradient(135deg,#059669,#22C55E)',border:'none',borderRadius:10,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 16px #22C55E30'}}>{finishLabel}</button>
              : q.t!=='ch' ? <button onClick={goNext} style={{padding:'13px 26px',background:'linear-gradient(135deg,#0891B2,#22D3EE)',border:'none',borderRadius:10,color:'#fff',fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',opacity:(!q.req||data[q.id])?1:.3,boxShadow:'0 4px 16px #22D3EE30'}}>Continue →</button> : null}
          </div>
        </div>
      </div>
    )
  }


  // ── Results renderer ──
  const renderResults = (archived) => {
    if (!comp || !zoneScores.length) return null
    const zs = zoneScores[selZone]
    return (
      <div style={{paddingTop:28,paddingBottom:100}}>
        <div style={{padding:'14px 16px',background:'#0C1017',border:'1px solid #1A2030',borderRadius:12,marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{bldg.fn||'Assessment'}</div>
          <div style={{fontSize:12,color:'#8B95A8',marginBottom:8}}>{bldg.fl}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:12,fontSize:11,color:'#5E6578',fontFamily:"'DM Mono'"}}>
            {presurvey.ps_assessor&&<span>👤 {presurvey.ps_assessor}</span>}
            <span>📅 {clock.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</span>
          </div>
        </div>

        <div style={{textAlign:'center',padding:'32px 20px 24px',background:'#0C1017',border:'1px solid #1A2030',borderRadius:18,position:'relative',overflow:'hidden',marginBottom:14}}>
          <div style={{position:'absolute',inset:0,opacity:.3}}><Particles /></div>
          <div style={{position:'relative',zIndex:1}}>
            <div style={{fontSize:12,color:'#8B95A8',textTransform:'uppercase',fontFamily:"'DM Mono'",letterSpacing:2,marginBottom:12}}>Building Composite</div>
            <ScoreRing value={comp.tot} color={comp.rc} size={130} />
            <div style={{marginTop:10}}>{badge(comp.risk,comp.rc)}</div>
            <div style={{display:'flex',justifyContent:'center',gap:20,marginTop:14,fontSize:10,color:'#5E6578',fontFamily:"'DM Mono'"}}>
              <span>Avg: {comp.avg}</span><span>Worst: {comp.worst}</span><span>{comp.count} zone{comp.count>1?'s':''}</span>
            </div>
          </div>
        </div>

        {zoneScores.length > 1 && <div style={{display:'flex',gap:4,padding:4,background:'#0C1017',borderRadius:10,border:'1px solid #1A2030',marginBottom:12,overflowX:'auto'}}>
          {zoneScores.map((z,i) => <button key={i} onClick={()=>setSelZone(i)} style={{padding:'7px 12px',borderRadius:7,border:'none',background:selZone===i?`${z.rc}18`:'transparent',color:selZone===i?z.rc:'#5E6578',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0}}>{z.zoneName} <span style={{fontFamily:"'DM Mono'",fontWeight:800}}>{z.tot}</span></button>)}
        </div>}

        <div style={{display:'flex',gap:4,padding:4,background:'#0C1017',borderRadius:10,border:'1px solid #1A2030',marginBottom:14,overflowX:'auto',scrollbarWidth:'none'}}>
          {[['overview','findings','Findings'],['rootcause','chain','Root Cause'],['sampling','flask','Sampling'],['narrative','pulse','AI Report'],['actions','bolt','Actions']].map(([k,ic,l])=><button key={k} onClick={()=>{setRTab(k);haptic('light')}} style={{flex:'0 0 auto',padding:'10px 16px',borderRadius:8,border:'none',background:rTab===k?'#22D3EE15':'transparent',color:rTab===k?'#22D3EE':'#5E6578',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}><I n={ic} s={16} c={rTab===k?'#22D3EE':'#5E6578'} />{l}</button>)}
        </div>

        {rTab==='overview' && zs && <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{textAlign:'center',marginBottom:4}}>
            <div style={{fontSize:11,fontWeight:600,color:zs.rc}}>{zs.zoneName}</div>
            <div style={{fontSize:28,fontWeight:800,fontFamily:"'DM Mono'",color:zs.rc}}>{zs.tot}<span style={{fontSize:14,color:'#3A4050'}}>/100</span></div>
          </div>
          {zs.cats.map((cat,ci)=>{const pct=(cat.s/cat.mx)*100;const bc=pct>=80?'#22C55E':pct>=60?'#FBBF24':pct>=40?'#FB923C':'#EF4444';return(
            <div key={cat.l} style={{padding:'14px 16px',background:'#0C1017',border:'1px solid #1A2030',borderRadius:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:15,fontWeight:600}}>{cat.l}</span>
                <span style={{fontSize:17,fontWeight:800,fontFamily:"'DM Mono'",color:bc}}>{cat.s}/{cat.mx}</span>
              </div>
              <div style={{height:3,background:'#12161D',borderRadius:2,overflow:'hidden',marginBottom:10}}>
                <div style={{height:'100%',width:`${pct}%`,background:bc,borderRadius:2,transition:'width .8s ease'}} />
              </div>
              {cat.r.map((r,i)=>{const s=sv(r.sev);return(
                <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:6,fontSize:13,lineHeight:1.5}}>
                  <span style={{padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,fontFamily:"'DM Mono'",background:s.bg,color:s.c,flexShrink:0,marginTop:2}}>{s.l}</span>
                  <span style={{color:'#C8D0DC'}}>{r.t}{r.std?<span style={{color:'#5E6578'}}> ({r.std})</span>:null}</span>
                </div>
              )})}
            </div>
          )})}
          {oshaResult?.flag&&<div style={{padding:14,background:'#EF444412',border:'1px solid #EF444425',borderRadius:12}}><div style={{fontSize:12,fontWeight:700,color:'#EF4444',marginBottom:8}}>⚠ OSHA Flags</div>{oshaResult.fl.map((f,i)=><div key={i} style={{fontSize:13,color:'#E2E8F0',lineHeight:1.5,paddingLeft:10,borderLeft:'2px solid #EF444435',marginBottom:4}}>{f}</div>)}</div>}
          {oshaResult?.gaps?.length>0&&<div style={{padding:14,background:'#FBBF2410',border:'1px solid #FBBF2425',borderRadius:12}}><div style={{fontSize:12,fontWeight:700,color:'#FBBF24',marginBottom:6}}>Data Gaps</div>{oshaResult.gaps.map((g,i)=><div key={i} style={{fontSize:13,color:'#C8D0DC',marginBottom:4}}>• {g}</div>)}</div>}
        </div>}

        {rTab==='rootcause'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
          {causalChains.length===0?<div style={{padding:32,textAlign:'center',background:'#0C1017',borderRadius:14,border:'1px solid #1A2030'}}><div style={{fontSize:28,marginBottom:10}}>🔗</div><div style={{fontSize:15,fontWeight:600,marginBottom:4}}>No Causal Chains Identified</div><div style={{fontSize:13,color:'#8B95A8',lineHeight:1.5}}>The walkthrough data did not produce correlated multi-factor findings.</div></div>
          :causalChains.map((ch,i)=>{const cc=ch.confidence==='Strong'?'#22C55E':ch.confidence==='Moderate'?'#FBBF24':'#8B95A8';return(
            <div key={i} style={{padding:16,background:'#0C1017',border:'1px solid #1A2030',borderRadius:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{fontSize:14,fontWeight:700}}>🔗 {ch.type}</div>
                <span style={{padding:'3px 10px',background:`${cc}18`,border:`1px solid ${cc}35`,borderRadius:16,fontSize:11,fontWeight:700,color:cc}}>{ch.confidence}</span>
              </div>
              <div style={{fontSize:12,color:'#22D3EE',fontFamily:"'DM Mono'",marginBottom:6}}>{ch.zone}</div>
              <div style={{fontSize:14,color:'#C8D0DC',lineHeight:1.6,marginBottom:12,padding:'10px 14px',background:'#12161D',borderRadius:8,borderLeft:'3px solid #22D3EE'}}>{ch.rootCause}</div>
              {ch.evidence.map((e,j)=><div key={j} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:5}}><span style={{color:'#22D3EE',fontSize:13,marginTop:1}}>→</span><span style={{fontSize:13,color:'#C8D0DC',lineHeight:1.5}}>{e}</span></div>)}
            </div>
          )})}
        </div>}

        {rTab==='sampling'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
          {(!samplingPlan||samplingPlan.plan.length===0)?<div style={{padding:32,textAlign:'center',background:'#0C1017',borderRadius:14,border:'1px solid #1A2030'}}><div style={{fontSize:28,marginBottom:10}}>🧪</div><div style={{fontSize:15,fontWeight:600,marginBottom:4}}>No Sampling Indicated</div><div style={{fontSize:13,color:'#8B95A8',lineHeight:1.5}}>Walkthrough findings did not generate hypotheses requiring confirmatory sampling.</div></div>
          :<>{samplingPlan.plan.map((p,i)=>{const pc=p.priority==='critical'?'#EF4444':p.priority==='high'?'#FB923C':'#FBBF24';return(
            <div key={i} style={{padding:16,background:'#0C1017',border:'1px solid #1A2030',borderRadius:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:700}}>🧪 {p.type}</div>
                <span style={{padding:'3px 10px',background:`${pc}18`,border:`1px solid ${pc}35`,borderRadius:16,fontSize:11,fontWeight:700,color:pc}}>{p.priority.toUpperCase()}</span>
              </div>
              <div style={{fontSize:12,color:'#22D3EE',fontFamily:"'DM Mono'",marginBottom:8}}>{p.zone}</div>
              <div style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:600,color:'#8B95A8',marginBottom:3}}>Hypothesis</div><div style={{fontSize:13,color:'#C8D0DC',lineHeight:1.5}}>{p.hypothesis}</div></div>
              <div style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:600,color:'#8B95A8',marginBottom:3}}>Method</div><div style={{fontSize:13,color:'#C8D0DC',lineHeight:1.5}}>{p.method}</div></div>
              <div style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:600,color:'#8B95A8',marginBottom:3}}>Controls</div><div style={{fontSize:13,color:'#C8D0DC',lineHeight:1.5}}>{p.controls}</div></div>
              <div style={{fontSize:11,color:'#5E6578',fontFamily:"'DM Mono'"}}>{p.standard}</div>
            </div>
          )})}{samplingPlan.outdoorGaps?.length>0&&<div style={{padding:14,background:'#FBBF2410',border:'1px solid #FBBF2425',borderRadius:12}}><div style={{fontSize:13,fontWeight:700,color:'#FBBF24',marginBottom:8}}>⚠ Outdoor Control Gaps</div>{samplingPlan.outdoorGaps.map((g,i)=><div key={i} style={{fontSize:13,color:'#C8D0DC',lineHeight:1.6,marginBottom:4}}>• {g}</div>)}</div>}</>}
        </div>}

        {rTab==='narrative'&&<div>
          {!narrative&&!narrativeLoading&&<div style={{padding:32,textAlign:'center',background:'#0C1017',border:'1px solid #1A2030',borderRadius:14}}>
            <div style={{fontSize:28,marginBottom:12}}>🤖</div>
            <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>AI Findings Narrative</div>
            <div style={{fontSize:11,color:'#5E6578',lineHeight:1.6,marginBottom:16}}>Generates a professional IH narrative from the deterministic scoring output.</div>
            <button onClick={requestNarrative} style={{padding:'12px 24px',background:'linear-gradient(135deg,#0891B2,#22D3EE)',border:'none',borderRadius:10,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Generate Narrative</button>
          </div>}
          {narrativeLoading&&<div style={{padding:40,textAlign:'center',background:'#0C1017',border:'1px solid #1A2030',borderRadius:14}}><div style={{width:40,height:40,margin:'0 auto 16px',borderRadius:'50%',border:'2px solid transparent',borderTopColor:'#22D3EE',animation:'spin 1s linear infinite'}} /><div style={{fontSize:12,color:'#5E6578'}}>Generating narrative...</div></div>}
          {narrative&&<div style={{padding:18,background:'#0C1017',border:'1px solid #1A2030',borderRadius:14}}>
            <div style={{fontSize:11,fontWeight:600,color:'#22D3EE',marginBottom:12}}>AI-Generated Narrative</div>
            <div style={{fontSize:13,color:'#C8D0DC',lineHeight:1.75,whiteSpace:'pre-wrap'}}>{narrative}</div>
            <div style={{marginTop:14,padding:'10px 12px',background:'#FBBF2410',border:'1px solid #FBBF2420',borderRadius:8}}>
              <div style={{fontSize:10,color:'#FBBF24',fontWeight:600}}>⚠ IH Review Required</div>
              <div style={{fontSize:10,color:'#8B95A8',marginTop:2,lineHeight:1.4}}>Review and modify before including in any client deliverable.</div>
            </div>
          </div>}
        </div>}

        {rTab==='actions'&&recs&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
          {[{k:'imm',l:'Immediate',c:'#EF4444'},{k:'eng',l:'Engineering',c:'#22D3EE'},{k:'adm',l:'Administrative',c:'#FBBF24'},{k:'mon',l:'Monitoring',c:'#8B95A8'}].map(cat=>{if(!recs[cat.k]?.length)return null;return(<div key={cat.k} style={{padding:14,background:'#0C1017',border:'1px solid #1A2030',borderRadius:12}}><div style={{fontSize:14,fontWeight:700,color:cat.c,marginBottom:8}}>{cat.l}</div>{recs[cat.k].map((r,i)=><div key={i} style={{fontSize:14,color:'#C8D0DC',lineHeight:1.6,marginBottom:6,paddingLeft:12,borderLeft:`2px solid ${cat.c}30`}}>{r}</div>)}</div>)})}
          {!archived&&<button onClick={startNew} style={{padding:'10px 16px',background:'transparent',border:'1px solid #1A2030',borderRadius:9,color:'#5E6578',fontSize:14,cursor:'pointer',fontFamily:'inherit',marginTop:6}}>New Assessment</button>}
        </div>}
      </div>
    )
  }


  // ── Main render ──
  const pscq = psVis[psqi]
  const bcq = bVis[bqi]
  const zcq = zVis[zqi]

  return (
    <div style={{minHeight:'100vh',background:'#080A0E',color:'#F0F4F8',fontFamily:"'Outfit', system-ui, sans-serif"}}>
      <header style={{position:'sticky',top:0,zIndex:100,height:50,background:'#080A0EDD',backdropFilter:'blur(20px)',borderBottom:'1px solid #1A2030',padding:'0 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#22D3EE,#0891B2)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="home" s={16} c="#fff" /></div>
          <div><div style={{fontSize:15,fontWeight:600,lineHeight:1.1}}>atmos<span style={{color:'#22D3EE',fontWeight:800}}>IQ</span></div><div style={{fontSize:11,color:'#8B95A8',fontFamily:"'DM Mono'"}}>by Prudence EHS</div></div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{textAlign:'right',lineHeight:1.2}}>
            <div style={{fontSize:11,fontWeight:600,color:'#F0F4F8',fontFamily:"'DM Mono'"}}>{clock.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
            <div style={{fontSize:9,color:'#5E6578',fontFamily:"'DM Mono'"}}>{clock.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}</div>
          </div>
          {['presurvey','bldg','zone'].includes(view)&&<span style={{fontSize:10,color:'#22D3EE80',fontFamily:"'DM Mono'"}}>AUTO-SAVE</span>}
          {view!=='dash'&&<button onClick={()=>{setView('dash');setViewRpt(null)}} style={{background:'#1A2535',border:'1.5px solid #22D3EE40',borderRadius:8,color:'#E2E8F0',fontSize:14,fontWeight:600,padding:'8px 16px',cursor:'pointer',fontFamily:'inherit'}}>← Home</button>}
        </div>
      </header>

      {milestone&&<div style={{position:'fixed',inset:0,background:'#080A0EF0',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{textAlign:'center',animation:'milestoneIn .5s cubic-bezier(.22,1,.36,1)'}}><div style={{marginBottom:16,display:'flex',justifyContent:'center'}}><div style={{width:72,height:72,borderRadius:20,background:'#22D3EE12',border:'1.5px solid #22D3EE30',display:'flex',alignItems:'center',justifyContent:'center'}}><I n={milestone.icon} s={36} c="#22D3EE" w={2} /></div></div><div style={{fontSize:24,fontWeight:800,letterSpacing:'-0.5px'}}>{milestone.title}</div><div style={{fontSize:14,color:'#22D3EE',fontFamily:"'DM Mono'",marginTop:8}}>{milestone.sub}</div></div></div>}

      {delConf&&<div style={{position:'fixed',inset:0,background:'#000000CC',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}><div style={{background:'#0C1017',border:'1px solid #1A2030',borderRadius:14,padding:22,maxWidth:320,width:'100%'}}><div style={{fontSize:14,fontWeight:600,marginBottom:6}}>Delete?</div><div style={{fontSize:11,color:'#8B95A8',marginBottom:16}}>This will be permanently removed.</div><div style={{display:'flex',gap:8}}><button onClick={()=>setDelConf(null)} style={{flex:1,padding:'9px 0',background:'#12161D',border:'1px solid #1A2030',borderRadius:7,color:'#9CA3B4',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button><button onClick={()=>deleteItem(delConf.id,delConf.type)} style={{flex:1,padding:'9px 0',background:'#EF444420',border:'1px solid #EF444440',borderRadius:7,color:'#EF4444',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Delete</button></div></div></div>}

      <div style={{maxWidth:620,margin:'0 auto',padding:'0 16px',position:'relative',zIndex:1}}>

        {view==='dash'&&<div style={{paddingTop:36,paddingBottom:80}}>
          <div><div style={{fontSize:10,fontWeight:600,color:'#22D3EE',textTransform:'uppercase',letterSpacing:3,fontFamily:"'DM Mono'",marginBottom:10}}>Air Quality Intelligence</div><h1 style={{fontSize:38,fontWeight:800,lineHeight:1.05,margin:0,letterSpacing:'-1.5px'}}>atmos<span style={{color:'#22D3EE'}}>IQ</span></h1><p style={{fontSize:14,color:'#8B95A8',lineHeight:1.6,marginTop:12,maxWidth:420}}>Multi-zone assessments. Photo evidence. Deterministic scoring. AI narrative. OSHA defensibility.</p></div>
          <div style={{display:'flex',flexWrap:'wrap',gap:5,margin:'22px 0'}}>{['ASHRAE 62.1-2025','ASHRAE 55-2023','OSHA PELs','NIOSH RELs','EPA NAAQS','WHO'].map(s=><span key={s} style={{padding:'3px 9px',background:'#22D3EE08',border:'1px solid #22D3EE20',borderRadius:18,fontSize:12,fontFamily:"'DM Mono'",color:'#22D3EE'}}>{s}</span>)}</div>
          <button onClick={startNew} style={{width:'100%',padding:'20px 22px',marginTop:6,background:'linear-gradient(135deg,#0E7490,#22D3EE20)',border:'1.5px solid #22D3EE40',borderRadius:14,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,position:'relative',overflow:'hidden'}}><div style={{position:'absolute',inset:0,opacity:.12}}><Particles /></div><div style={{width:48,height:48,borderRadius:12,background:'#22D3EE20',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',zIndex:1}}><I n="wind" s={24} c="#22D3EE" /></div><div style={{position:'relative',zIndex:1,flex:1}}><div style={{fontSize:16,fontWeight:700}}>New Assessment</div><div style={{fontSize:11,color:'#8B95A8',marginTop:2}}>Multi-zone · Photo capture · AI report</div></div><div style={{fontSize:18,color:'#22D3EE',position:'relative',zIndex:1}}>→</div></button>
          <button onClick={runDemo} style={{width:'100%',padding:'16px 20px',marginTop:8,background:'#0C1017',border:'1.5px solid #8B5CF630',borderRadius:14,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14}}><div style={{width:44,height:44,borderRadius:11,background:'#8B5CF615',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="bldg" s={22} c="#8B5CF6" /></div><div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>Run Demo</div><div style={{fontSize:12,color:'#8B95A8',marginTop:2}}>Meridian Business Park — 3 zones · Critical findings</div></div><div style={{fontSize:18,color:'#8B5CF6'}}>→</div></button>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
            {[{l:'Drafts',n:(index.drafts||[]).length,v:'drafts',ic:'clip'},{l:'History',n:(index.reports||[]).length,v:'history',ic:'clock'}].map(c=><button key={c.l} onClick={()=>{if(c.n)setView(c.v)}} style={{padding:'16px 14px',background:'#0C1017',border:`1px solid ${c.n?'#22D3EE25':'#1A2030'}`,borderRadius:12,opacity:c.n?.9:.35,cursor:c.n?'pointer':'default',textAlign:'left'}}><div style={{marginBottom:8}}><I n={c.ic} s={22} c={c.n?'#22D3EE':'#5E6578'} /></div><div style={{fontSize:12,fontWeight:600}}>{c.l}</div><div style={{fontSize:13,color:c.n?'#22D3EE':'#8B95A8',fontFamily:"'DM Mono'",marginTop:1}}>{c.n}</div></button>)}
          </div>
          {(index.reports||[]).length>0&&<div style={{marginTop:18}}><div style={{fontSize:12,fontWeight:600,color:'#8B95A8',textTransform:'uppercase',letterSpacing:1.5,marginBottom:10}}>Recent</div>{(index.reports||[]).slice(0,3).map(r=><button key={r.id} onClick={()=>openReport(r)} style={{width:'100%',padding:'12px 14px',background:'#0C1017',border:'1px solid #1A2030',borderRadius:10,marginBottom:6,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12}}><div style={{width:36,height:36,borderRadius:9,background:'#22D3EE12',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:800,fontFamily:"'DM Mono'",color:'#22D3EE'}}>{r.score||'?'}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.facility||'?'}</div><div style={{fontSize:12,color:'#8B95A8',fontFamily:"'DM Mono'",marginTop:2}}>{fD(r.ts)}</div></div></button>)}</div>}
        </div>}

        {view==='presurvey'&&pscq&&renderQuestion(pscq,presurvey,setPSF,psqi,psVis,()=>{if(psqi<psVis.length-1)setPsqi(psqi+1)},()=>{if(psqi>0)setPsqi(psqi-1)},finishPresurvey,'→ On-Site Assessment',psSecs)}
        {view==='bldg'&&bcq&&renderQuestion(bcq,bldg,setBF,bqi,bVis,()=>{if(bqi<bVis.length-1)setBqi(bqi+1)},()=>{if(bqi>0)setBqi(bqi-1)},finishBuilding,'→ Start Zones',bSecs)}
        {view==='zone'&&zcq&&<div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:16,marginBottom:-12}}>
            <div style={{fontSize:11,fontWeight:600,color:'#22D3EE',fontFamily:"'DM Mono'"}}>Zone {curZone+1}: {zData.zn||'New Zone'}</div>
            <div style={{display:'flex',gap:6}}>
              {zones.length>1&&curZone>0&&<button onClick={()=>{setCurZone(curZone-1);setZqi(0)}} style={{fontSize:13,color:'#5E6578',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>‹ Prev</button>}
              {curZone<zones.length-1&&<button onClick={()=>{setCurZone(curZone+1);setZqi(0)}} style={{fontSize:13,color:'#8B95A8',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>Next ›</button>}
            </div>
          </div>
          {renderQuestion(zcq,zData,setZF,zqi,zVis,()=>{if(zqi<zVis.length-1)setZqi(zqi+1)},()=>{if(zqi>0)setZqi(zqi-1)},()=>{if(confirm('Zone complete. Add another zone?')){setZones(p=>[...p,{}]);setCurZone(zones.length);setZqi(0)}else{finishAssessment()}},'Complete Zone ✓',zSecs)}
        </div>}

        {(view==='results'||view==='report')&&renderResults(view==='report')}

        {view==='drafts'&&<div style={{paddingTop:28,paddingBottom:80}}><h2 style={{fontSize:20,fontWeight:700,marginBottom:16}}>📋 Drafts</h2>{(index.drafts||[]).length===0?<div style={{padding:32,textAlign:'center',background:'#0C1017',borderRadius:12,border:'1px solid #1A2030',color:'#5E6578',fontSize:13}}>No drafts</div>:(index.drafts||[]).map(d=><div key={d.id} style={{padding:'14px 16px',background:'#0C1017',border:'1px solid #1A2030',borderRadius:12,marginBottom:6,display:'flex',alignItems:'center',gap:12}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{d.facility||'Untitled'}</div><div style={{fontSize:12,color:'#8B95A8',fontFamily:"'DM Mono'",marginTop:3}}>{fD(d.ua||d.ts)}</div></div><button onClick={()=>resumeDraft(d.id)} style={{padding:'7px 14px',background:'#22D3EE15',border:'1px solid #22D3EE30',borderRadius:7,color:'#22D3EE',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Resume</button><button onClick={()=>setDelConf({id:d.id,type:'dft'})} style={{padding:'7px 8px',background:'transparent',border:'1px solid #1A2030',borderRadius:7,color:'#5E6578',fontSize:10,cursor:'pointer',fontFamily:'inherit'}}>✕</button></div>)}</div>}

        {view==='history'&&<div style={{paddingTop:28,paddingBottom:80}}><h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>📊 History</h2><div style={{display:'flex',gap:6,marginBottom:12}}><input type="text" value={hSearch} onChange={e=>setHSearch(e.target.value)} placeholder="Search..." style={{flex:1,padding:'9px 12px',background:'#0C1017',border:'1px solid #1A2030',borderRadius:8,color:'#F0F4F8',fontSize:12,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}} /><select value={hSort} onChange={e=>setHSort(e.target.value)} style={{padding:'9px 8px',background:'#0C1017',border:'1px solid #1A2030',borderRadius:8,color:'#9CA3B4',fontSize:10,fontFamily:'inherit',outline:'none'}}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="score-low">Score ↑</option><option value="score-high">Score ↓</option></select></div>{fReports.length===0?<div style={{padding:32,textAlign:'center',background:'#0C1017',borderRadius:12,border:'1px solid #1A2030',color:'#5E6578',fontSize:13}}>{hSearch?'No matches':'No reports yet'}</div>:fReports.map(r=><button key={r.id} onClick={()=>openReport(r)} style={{width:'100%',padding:'14px 16px',background:'#0C1017',border:'1px solid #1A2030',borderRadius:12,marginBottom:6,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12}}><div style={{width:40,height:40,borderRadius:10,background:'#22D3EE12',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:16,fontWeight:800,fontFamily:"'DM Mono'",color:'#22D3EE'}}>{r.score||'?'}</span></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.facility||'?'}</div><div style={{fontSize:12,color:'#8B95A8',fontFamily:"'DM Mono'",marginTop:3}}>{fD(r.ts)}</div></div><button onClick={e=>{e.stopPropagation();setDelConf({id:r.id,type:'rpt'})}} style={{padding:'3px 7px',background:'transparent',border:'1px solid #1A2030',borderRadius:5,color:'#3A4050',fontSize:9,cursor:'pointer',fontFamily:'inherit'}}>🗑</button></button>)}</div>}
      </div>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes milestoneIn{from{opacity:0;transform:scale(.8) translateY(20px);}to{opacity:1;transform:scale(1) translateY(0);}}
        *{box-sizing:border-box;margin:0;}button{font-family:inherit;}
        input::placeholder,textarea::placeholder{color:#3A4050;}
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=number]{-moz-appearance:textfield;}
        ::-webkit-scrollbar{width:4px;height:0;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#1A2030;border-radius:2px;}
      `}</style>
    </div>
  )
}
