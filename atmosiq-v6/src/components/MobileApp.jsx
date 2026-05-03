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
import Storage from '../utils/cloudStorage'
import { supabase, trackEvent } from '../utils/supabaseClient'
import Backup from '../utils/backup'
import { groupActions } from '../utils/recFormatting'
import { VER, STANDARDS_MANIFEST } from '../constants/standards'
import { Q_PRESURVEY, Q_BUILDING, Q_ZONE, Q_QUICKSTART, Q_DETAILS, SENSOR_FIELDS } from '../constants/questions'
import { scoreZone, compositeScore, evalOSHA, calcVent, genRecs, evalMold, evalMeasurementConfidence } from '../engines/scoring'
import { generateSamplingPlan } from '../engines/sampling'
import { buildCausalChains } from '../engines/causalChains'
import { generateNarrative } from '../engines/narrative'
import PricingSheet from './pricing/PricingSheet'
import { I, emojiToIcon } from './Icons'
import Loading from './Loading'
import ScoreRing from './ScoreRing'
import PhotoCapture from './PhotoCapture'
import SensorScreen from './SensorScreen'
import TimePickerInput from './TimePickerInput'
import Co2OaCalculator from './Co2OaCalculator'
import ProfileScreen from './ProfileScreen'
import AuthScreen from './AuthScreen'
import { TermsOfService, PrivacyPolicy } from './LegalScreens'
import AdminDashboard from './AdminDashboard'
import WelcomeScreen from './WelcomeScreen'
import SettingsScreen from './SettingsScreen'
import { printReport, generatePrintHTML } from './PrintReport'
// v2.6.1 — DocxReport is a static import. Earlier `await import('./DocxReport')`
// triggered "'text/html' is not a valid JavaScript MIME type" errors when a
// user's cached index.html referenced a chunk hash that no longer existed
// after redeploy (the missing-chunk request returned the SPA HTML fallback).
// Bundling the docx renderer into the main chunk eliminates that failure
// mode for the most common user action — exporting a report.
import { generateDocx, generateConsultantOnly, generateTechnicalOnly } from './DocxReport'
import { DEMO_PRESURVEY, DEMO_BUILDING, DEMO_ZONES, DEMO_EQUIPMENT } from '../constants/demoData'
import { DEMO_FM_PRESURVEY, DEMO_FM_BUILDING, DEMO_FM_ZONES } from '../constants/demoDataFM'
import { DEMO_DC_PRESURVEY, DEMO_DC_BUILDING, DEMO_DC_ZONES } from '../constants/demoDataDC'
import { getMode, setMode as persistMode, isFM, t } from '../constants/terminology'
import { evaluateEscalation, hasActiveEscalation } from '../engines/escalation'
import { getBuildingProfile } from '../engines/buildingProfiles'
import ModeSelector from './ModeSelector'
import ComplaintLog from './ComplaintLog'
import InterventionTracker from './InterventionTracker'
import IHDirectory from './IHDirectory'
import PropertyDashboard from './PropertyDashboard'
import SpatialMap from './SpatialMap'
import InstrumentManager from './InstrumentManager'
import V21InternalPanel from './V21InternalPanel'
import { useAssessment } from '../contexts/AssessmentContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useStorage } from '../contexts/StorageContext.jsx'

const haptic = (type) => { try { if (navigator.vibrate) navigator.vibrate(type === 'heavy' ? [30,20,30] : type === 'success' ? [10,30,10,30,10] : 12) } catch {} }
const BETA_MODE = true // Set to false when ready to go live — re-enables all premium gates
const isEnterprise = (profile) => BETA_MODE || profile?.plan === 'team' || profile?.plan === 'enterprise' || !!localStorage.getItem('atmosflow:premiumOverride')
const isPremiumOpt = (q, opt) => q.premiumOpts && q.premiumOpts.includes(opt)
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

  // ── Shared state from context providers ──
  // Auth: profile/credits/admin live in AuthContext so other route components
  // (split out in Phase 5) can read them without prop drilling.
  const {
    profile, setProfile,
    credits, setCredits,
    adminSecret, setAdminSecret,
  } = useAuth()
  // Storage: index of saved drafts/reports lives in StorageContext.
  const { index, refreshIndex } = useStorage()
  // Assessment: every field representing the assessment-in-progress lives in
  // AssessmentContext. Local handleLogin/Logout/runScoring/setZF below still
  // own the operations; they read/write context state via these setters.
  const {
    draftId, setDraftId,
    presurvey, setPresurvey,
    bldg, setBldg,
    qsqi, setQsqi, dqi, setDqi, zqi, setZqi,
    zones, setZones, curZone, setCurZone,
    photos, setPhotos,
    zoneScores, setZoneScores,
    comp, setComp,
    oshaResult, setOshaResult,
    recs, setRecs,
    narrative, setNarrative,
    narrativeLoading, setNarrativeLoading,
    samplingPlan, setSamplingPlan,
    causalChains, setCausalChains,
    moldResults, setMoldResults,
    floorPlan, setFloorPlan,
    measConf, setMeasConf,
    equipment, setEquipment,
  } = useAssessment()

  // ── Local UI state (truly component-local; not shared) ──
  const [loading, setLoading] = useState(true)
  const [isReturning, setIsReturning] = useState(false)
  const [welcomeDone, setWelcomeDone] = useState(!!sessionStorage.getItem('aiq_welcomed'))
  const [userMode, setUserMode] = useState(getMode())
  const [needsModeSelect, setNeedsModeSelect] = useState(false)
  const [profileChecked, setProfileChecked] = useState(false)
  // Paywall pause — set to false to re-enable the credits gate.
  // When true: startNew + requestNarrative skip the credits check, and
  // consumeCredit no-ops so we don't spam analytics or hit /api/credits
  // 402s. The pricing modal is still reachable from the credits chip.
  const PAYWALL_DISABLED = true
  // views: dash|quickstart|zone|details|results|history|drafts|report
  const [view, setView] = useState('dash')
  const [milestone, setMilestone] = useState(null)
  const [clock, setClock] = useState(new Date())
  const [showPricing, setShowPricing] = useState(false)
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

  const [showPhotoSelect, setShowPhotoSelect] = useState(false)
  const [showPremiumGate, setShowPremiumGate] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState({})
  const [exportFormat, setExportFormat] = useState(null)
  const [rTab, setRTab] = useState('overview')
  const [selZone, setSelZone] = useState(0)

  const [viewRpt, setViewRpt] = useState(null)
  const [delConf, setDelConf] = useState(null)
  const [zonePrompt, setZonePrompt] = useState(false)
  const [calWarning, setCalWarning] = useState(null)
  const [docxPicker, setDocxPicker] = useState(false)
  const [hSearch, setHSearch] = useState('')
  const [hSort, setHSort] = useState('newest')
  // v2.8 UI pass — Notion-style 3-dot home menu. Replaces the standalone
  // gear icon in the Home header; Settings is now one entry inside the
  // dropdown alongside Upgrade plan / Reports / Trash / Help & Support.
  const [showHomeMenu, setShowHomeMenu] = useState(false)

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(t) }, [])

  // Check for existing auth on load
  useEffect(() => {
    (async () => {
      const v = await STO.hasVisited()
      setIsReturning(!!v)
      await refreshIndex()
      await STO.markVisited()
      // Try Supabase auth first, fall back to local profiles
      if (supabase) {
        const user = await Storage.getUser()
        if (user) {
          const p = await Storage.getProfile()
          if (p) setProfile(p)
          else setProfile({ id: user.id, name: user.email, isNew: true })
          Storage.processSyncQueue()
          // Fetch credits from server
          try {
            const session = await Storage.getSession()
            if (session?.access_token) {
              const res = await fetch('/api/credits', { headers: { 'Authorization': 'Bearer ' + session.access_token } })
              if (res.ok) { const data = await res.json(); setCredits(data.credits ?? 5) }
            }
          } catch {}
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
    return Storage.onAuthChange((event, session) => {
      if (event === 'SIGNED_OUT') { setProfile(null); setView('dash') }
    })
  }, [])

  const handleLogin = async (userOrProfile) => {
    if (userOrProfile?.email && supabase) {
      trackEvent('login_completed', {})
      const p = await Storage.getProfile()
      if (p) setProfile(p)
      else setProfile({ id: userOrProfile.id, name: userOrProfile.email, isNew: true })
      Storage.fullSync()
      // Fetch credits from server
      try {
        const session = await Storage.getSession()
        if (session?.access_token) {
          const res = await fetch('/api/credits', { headers: { 'Authorization': 'Bearer ' + session.access_token } })
          if (res.ok) { const data = await res.json(); setCredits(data.credits ?? 5) }
        }
      } catch {}
    } else {
      setProfile(userOrProfile)
    }
  }
  const handleLogout = async () => {
    if (supabase) await Storage.signOut()
    setProfile(null); setView('dash')
  }

  // Auto-save draft
  const saveRef = useRef(null)
  useEffect(() => {
    if (!['quickstart','zone','details'].includes(view) || !draftId) return
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(async () => {
      const draft = { id:draftId, presurvey, bldg, zones, equipment, photos, floorPlan, qsqi, dqi, curZone, zqi, ua:new Date().toISOString(), standardsManifest:STANDARDS_MANIFEST }
      await STO.set(draftId, draft)
      await STO.addDraftToIndex({ id:draftId, facility:bldg.fn||'Untitled', ua:draft.ua })
      await refreshIndex()
      trackEvent('draft_saved', { draft_id: draftId, phase: view, zones: (zones||[]).length })
    }, 1200)
    return () => { if (saveRef.current) clearTimeout(saveRef.current) }
  }, [presurvey, bldg, zones, equipment, photos, qsqi, dqi, curZone, zqi, view, draftId])

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
  const dcProfile = useMemo(() => getBuildingProfile(bldg.ft), [bldg.ft])
  const zoneSubtype = zData.zone_subtype || null
  const suppressedIds = useMemo(() => dcProfile?.suppressFields?.[zoneSubtype] || [], [dcProfile, zoneSubtype])
  const additionalQs = useMemo(() => dcProfile?.additionalFields?.[zoneSubtype] || [], [dcProfile, zoneSubtype])
  const zVis = useMemo(() => {
    // Build base question list: standard zone questions + profile additional fields
    let qs = Q_ZONE.map(q => {
      // Populate zone_subtype options from building profile
      if (q.profileDynamic && q.id === 'zone_subtype' && dcProfile?.zoneSubtypes?.length) {
        return { ...q, opts: dcProfile.zoneSubtypes.map(st => st.label), _subtypeMap: dcProfile.zoneSubtypes }
      }
      return q
    })
    // Filter: hide profileDynamic questions when no profile, apply conditional logic, suppress fields
    qs = qs.filter(q => {
      if (q.profileDynamic && (!dcProfile || !dcProfile.zoneSubtypes?.length)) return false
      if (suppressedIds.includes(q.id)) return false
      if (!q.cond) return true
      if (q.cond.eq && zData[q.cond.f] !== q.cond.eq) return false
      if (q.cond.ne && zData[q.cond.f] === q.cond.ne) return false
      return true
    })
    // Inject additional fields from profile at end
    if (additionalQs.length > 0) qs = [...qs, ...additionalQs]
    return qs
  }, [zData, bldg.ft, dcProfile, suppressedIds, additionalQs])
  const setZF = useCallback((id,v) => { setZones(prev => { const next = [...prev]; next[curZone] = {...(next[curZone]||{}), [id]:v}; return next }) }, [curZone])

  const showMilestone = (icon, title, sub, nextFn) => {
    haptic('success'); setMilestone({icon, title, sub})
    setTimeout(() => { setMilestone(null); nextFn() }, 1400)
  }

  const consumeCredit = async (amount, reason, refId) => {
    if (PAYWALL_DISABLED) return
    setCredits(prev => Math.max(0, prev - amount))
    trackEvent('credit_consumed', { amount, reason, balance: credits - amount })
    if (supabase) {
      try {
        const session = await Storage.getSession()
        if (session?.access_token) {
          const res = await fetch('/api/credits', { method: 'POST', headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, reason, reference_id: refId || '' }) })
          if (res.ok) { const data = await res.json(); setCredits(data.credits) }
        }
      } catch {}
    }
  }

  const startNew = () => {
    if (!PAYWALL_DISABLED && credits < 1) { setShowPricing(true); return }
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
    setZones([{}]); setCurZone(0); setZqi(0); setPhotos({}); setEquipment([])
    setZoneScores([]); setComp(null); setOshaResult(null); setRecs(null); setNarrative(null); setSamplingPlan(null); setCausalChains([])
    setView('quickstart')
  }

  const runDemo = (type) => {
    const demos = {
      ih: { bldg: DEMO_BUILDING, zones: DEMO_ZONES, pre: DEMO_PRESURVEY, equipment: DEMO_EQUIPMENT },
      fm: { bldg: DEMO_FM_BUILDING, zones: DEMO_FM_ZONES, pre: DEMO_FM_PRESURVEY, equipment: [] },
      dc: { bldg: DEMO_DC_BUILDING, zones: DEMO_DC_ZONES, pre: DEMO_DC_PRESURVEY, equipment: [] },
    }
    const pick = type || (userMode === 'fm' ? 'fm' : 'ih')
    const { bldg: demoBldg, zones: demoZones, pre: demoPre, equipment: demoEq } = demos[pick]
    trackEvent('assessment_mode_selected', { mode: 'demo', demoType: pick, userMode })
    setBldg(demoBldg); setZones(demoZones); setPresurvey(demoPre); setPhotos({}); setEquipment(demoEq || [])
    const zScores = demoZones.map(z => scoreZone(z, demoBldg))
    const composite = compositeScore(zScores)
    const worst = demoZones.reduce((w, z) => (!w || scoreZone(z, demoBldg).tot < scoreZone(w, demoBldg).tot) ? z : w, demoZones[0])
    const osha = evalOSHA({...demoBldg, ...worst}, composite?.tot || 0)
    const recommendations = genRecs(zScores, demoBldg, { zones: demoZones, equipment: demoEq || [] })
    const sp = generateSamplingPlan(demoZones, demoBldg)
    const cc = buildCausalChains(demoZones, demoBldg, zScores)
    const mold = demoZones.map(z => evalMold(z)).filter(Boolean)
    const mc = evalMeasurementConfidence(demoZones)
    setZoneScores(zScores); setComp(composite); setOshaResult(osha); setRecs(recommendations)
    setSamplingPlan(sp); setCausalChains(cc); setMoldResults(mold); setMeasConf(mc); setSelZone(0); setRTab('overview'); setNarrative(null); setView('results')
  }

  const resumeDraft = async (id) => {
    const d = await STO.get(id)
    if (!d) return
    trackEvent('draft_resumed', { draft_id: id, facility: d.bldg?.fn || d.building?.fn || '' })
    setDraftId(d.id); setPresurvey(d.presurvey||{}); setBldg(d.bldg||d.building||{}); setZones(d.zones||[{}]); setEquipment(d.equipment||[]); setPhotos(d.photos||{}); setFloorPlan(d.floorPlan||null)
    setQsqi(d.qsqi||0); setDqi(d.dqi||0); setCurZone(d.curZone||0); setZqi(d.zqi||0)
    // Resume at the right phase
    if (!d.bldg?.fn && !d.building?.fn) setView('quickstart')
    else if (d.zones?.length > 0 && d.zones[0]?.zn) setView('zone')
    else setView('quickstart')
  }

  const finishQuickStart = () => {
    trackEvent('quickstart_completed', { facility: bldg.fn || '', building_type: bldg.ft || '' })
    if (zones.length === 0) setZones([{}])
    // v2.8.0 — capture HVAC equipment before zones so each zone can
    // be mapped to the units serving it. Equipment-scoped recs
    // (drain pan, filters, OA damper, ASHRAE 188, comprehensive
    // HVAC inspection) emit one action per equipment unit instead
    // of duplicating per zone.
    showMilestone('check', 'Quick Start Complete', 'Capture HVAC equipment next', () => { setView('equipment') })
  }

  const finishEquipment = () => {
    trackEvent('equipment_capture_completed', {
      facility: bldg.fn || '',
      equipment_count: (equipment || []).length,
      types: [...new Set((equipment || []).map(e => e.type))].join(','),
    })
    showMilestone('check', 'Equipment Captured', 'Starting zone walkthrough', () => { setCurZone(0); setZqi(0); setView('zone') })
  }

  // Zone-equipment mapping helpers. The engine consumes
  // zone.servingEquipmentIds; an empty array means "unmapped" and
  // triggers the building-scoped fallback in genRecs.
  const ensureZoneId = (idx) => {
    const z = zones[idx]
    if (z?.zid) return z.zid
    const zid = 'z-' + Date.now().toString(36) + '-' + idx
    setZones(prev => { const next = [...prev]; next[idx] = { ...(next[idx] || {}), zid }; return next })
    return zid
  }
  const toggleZoneEquipment = (zoneIdx, eqId) => {
    const zid = ensureZoneId(zoneIdx)
    setZones(prev => {
      const next = [...prev]
      const z = { ...(next[zoneIdx] || {}) }
      const cur = Array.isArray(z.servingEquipmentIds) ? z.servingEquipmentIds : []
      z.servingEquipmentIds = cur.includes(eqId) ? cur.filter(x => x !== eqId) : [...cur, eqId]
      next[zoneIdx] = z
      return next
    })
    // Mirror the inverse mapping on the equipment side so that
    // either direction stays referentially intact.
    setEquipment(prev => prev.map(e => {
      if (e.id !== eqId) return e
      const served = Array.isArray(e.servedZoneIds) ? e.servedZoneIds : []
      const exists = served.includes(zid)
      return { ...e, servedZoneIds: exists ? served.filter(x => x !== zid) : [...served, zid] }
    }))
  }

  const runScoring = () => {
    // Propagate outdoor baselines — one outdoor reading per parameter applies to all zones
    const outdoorFields = ['co2o', 'tfo', 'rho', 'pmo', 'tvo']
    const outdoorValues = {}
    outdoorFields.forEach(f => { const z = zones.find(z => z[f]); if (z) outdoorValues[f] = z[f] })
    const zonesWithOutdoor = zones.map(z => {
      const fill = {}
      outdoorFields.forEach(f => { if (!z[f] && outdoorValues[f]) fill[f] = outdoorValues[f] })
      return Object.keys(fill).length > 0 ? { ...z, ...fill } : z
    })
    const zScores = zonesWithOutdoor.map(z => scoreZone(z, bldg))
    const composite = compositeScore(zScores)
    const worst = zonesWithOutdoor.reduce((w, z) => (!w || scoreZone(z, bldg).tot < scoreZone(w, bldg).tot) ? z : w, zonesWithOutdoor[0])
    const osha = evalOSHA({...bldg, ...worst}, composite?.tot || 0)
    const recommendations = genRecs(zScores, bldg, { zones: zonesWithOutdoor, equipment })
    const sp = generateSamplingPlan(zonesWithOutdoor, bldg)
    const cc = buildCausalChains(zonesWithOutdoor, bldg, zScores)
    const mold = zonesWithOutdoor.map(z => evalMold(z)).filter(Boolean)
    const mc = evalMeasurementConfidence(zonesWithOutdoor)
    setZones(zonesWithOutdoor)
    setZoneScores(zScores); setComp(composite); setOshaResult(osha); setRecs(recommendations)
    setSamplingPlan(sp); setCausalChains(cc); setMoldResults(mold); setMeasConf(mc)
    return { zScores, composite, osha, recommendations, sp, cc, mold, mc }
  }

  const finishAssessment = async (bypassCalWarning) => {
    // Backend validation: prevent Data Center save without Enterprise tier
    if (bldg.ft === 'Data Center' && !isEnterprise(profile)) {
      setShowPremiumGate(true); return
    }
    // Instrument metadata check — warn if missing
    if (!bypassCalWarning) {
      const missing = []
      if (!presurvey.ps_inst_iaq) missing.push('Instrument make/model')
      if (!presurvey.ps_inst_iaq_serial) missing.push('Instrument serial number')
      if (!presurvey.ps_inst_iaq_cal) missing.push('Last calibration date')
      if (!presurvey.ps_inst_iaq_cal_status || presurvey.ps_inst_iaq_cal_status === 'Unknown') missing.push('Calibration status')
      if (presurvey.ps_inst_iaq_cal) {
        const daysSinceCal = (Date.now() - new Date(presurvey.ps_inst_iaq_cal).getTime()) / 86400000
        if (daysSinceCal > 365) missing.push('Calibration expired (' + Math.round(daysSinceCal) + ' days since last calibration)')
      }
      if (missing.length > 0) { setCalWarning(missing); return }
    }
    setCalWarning(null)
    const { zScores, composite, osha, recommendations, sp, cc } = runScoring()
    setSelZone(0); setNarrative(null)
    trackEvent('score_generated', { composite: composite?.tot, avg: composite?.avg, worst: composite?.worst, risk: composite?.risk, osha_flag: !!osha?.flag, confidence: osha?.conf || 'unknown', data_gaps: (osha?.gaps||[]).length })
    trackEvent('assessment_completed', { zones: zones.length, score: composite?.tot, facility: bldg.fn || 'unknown', has_causal_chains: cc.length > 0, sampling_recommendations: sp?.plan?.length || 0 })
    haptic('success')
    setMilestone({icon:'chart',title:'Assessment Complete',sub:`Scoring ${zones.length} zone${zones.length>1?'s':''}...`})
    setTimeout(() => { setMilestone(null); setRTab('overview'); setView('results') }, 1600)
    const rid = 'rpt-' + Date.now()
    const report = { id:rid, ts:new Date().toISOString(), ver:VER, presurvey, building:bldg, zones, equipment, photos, floorPlan, zoneScores:zScores, comp:composite, oshaEvals:[osha], recs:recommendations, samplingPlan:sp, causalChains:cc, standardsManifest:STANDARDS_MANIFEST }
    await STO.set(rid, report)
    await STO.addReportToIndex({ id:rid, ts:report.ts, facility:bldg.fn, score:composite?.tot })
    if (draftId) { await STO.del(draftId) }
    await refreshIndex()
    // Sync to cloud
    if (supabase) {
      try { await Storage.saveAssessment({ ...report, status: 'complete', facility_name: bldg.fn, score: composite?.tot, risk: composite?.risk }) }
      catch (e) { console.warn('Cloud sync deferred:', e.message) }
    }
  }

  const finishDetails = () => {
    trackEvent('details_completed', { facility: bldg.fn || '' })
    runScoring()
    showMilestone('check', 'Details Complete', 'Assessment rescored with updated data', () => { setView('results') })
  }

  const requestNarrative = async () => {
    if (!PAYWALL_DISABLED && credits < 3) { setShowPricing(true); return }
    consumeCredit(3, 'narrative')
    trackEvent('narrative_requested', { facility: bldg.fn || '', score: comp?.tot })
    setNarrativeLoading(true)
    const text = await generateNarrative(bldg, zones, zoneScores, comp, oshaResult, recs)
    setNarrative(text); setNarrativeLoading(false)
    if (text) trackEvent('narrative_generated', { word_count: text.split(/\s+/).length })
  }

  // Equipment-capture working state (the equipment array itself
  // lives in AssessmentContext). editingEqId === '__new' means a
  // brand-new unit being added; any other value is editing in place.
  const [editingEqId, setEditingEqId] = useState(null)
  const [eqForm, setEqForm] = useState({})
  const [docxTypeChoice, setDocxTypeChoice] = useState(null)
  const handleExport = (format, docxType) => {
    setExportFormat(format)
    setDocxTypeChoice(docxType || null)
    const hasPhotos = photos && Object.values(photos).some(arr => arr && arr.length > 0)
    if (hasPhotos) {
      const sel = {}
      Object.keys(photos).forEach(k => { (photos[k]||[]).forEach((_, i) => { sel[`${k}::${i}`] = true }) })
      setSelectedPhotos(sel)
      setShowPhotoSelect(true)
    } else {
      executeExport(format, {}, docxType)
    }
  }

  const confirmExportWithPhotos = () => {
    const filtered = {}
    Object.keys(photos).forEach(k => {
      const kept = (photos[k]||[]).filter((_, i) => selectedPhotos[`${k}::${i}`])
      if (kept.length > 0) filtered[k] = kept
    })
    setShowPhotoSelect(false)
    executeExport(exportFormat, filtered, docxTypeChoice)
  }

  const executeExport = async (format, filteredPhotos, docxType) => {
    const esc = evaluateEscalation({ zones, comp, moldResults }, [], [])
    const reportData = { building: bldg, presurvey, zones, equipment, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos: filteredPhotos, version: VER, standardsManifest: viewRpt?.standardsManifest || STANDARDS_MANIFEST, userMode, escalationTriggers: esc, floorPlan }
    trackEvent('report_exported', { format: docxType || format, facility: bldg.fn || '', score: comp?.tot, zones: zones.length, has_narrative: !!narrative, photos: Object.values(filteredPhotos).flat().length })
    try {
      if (format === 'docx') {
        if (docxType === 'consultant') await generateConsultantOnly(reportData)
        else if (docxType === 'technical') await generateTechnicalOnly(reportData)
        else await generateDocx(reportData)
      } else {
        printReport(reportData)
      }
    } catch (e) {
      console.error('Export failed:', e)
      // v2.6.1 — detect the stale-chunk MIME error and offer a hard
      // reload instead of the generic "Please try again" message.
      // The error fires when index.html references a chunk hash the
      // server no longer has (post-redeploy without cache bust).
      const msg = (e && e.message) || ''
      if (/is not a valid JavaScript MIME type|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) {
        const reload = window.confirm(
          'This page is out of date and the export cannot run with the cached version. Reload to update?'
        )
        if (reload) window.location.reload()
        return
      }
      alert('Report export failed: ' + (msg || 'Unknown error') + '. Please try again.')
    }
  }

  const handleShare = async () => {
    const title = `IAQ Assessment Report — ${bldg.fn || 'Assessment'}`
    const html = generatePrintHTML({ building: bldg, presurvey, zones, equipment, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos: {}, version: VER, standardsManifest: viewRpt?.standardsManifest || STANDARDS_MANIFEST, userMode })
    const blob = new Blob([html], { type: 'text/html' })
    const file = new File([blob], `${bldg.fn || 'Assessment'}-Report.html`, { type: 'text/html' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ title, files: [file] }) } catch {}
    } else if (navigator.share) {
      const text = `${bldg.fn || 'Facility'}\nComposite Score: ${comp?.tot || '?'}/100 — ${comp?.risk || '?'}\n${zoneScores?.length || 0} zones assessed`
      try { await navigator.share({ title, text }) } catch {}
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
  }

  const openReport = async (meta) => {
    const rpt = await STO.get(meta.id)
    if (!rpt) return
    trackEvent('report_viewed', { report_id: meta.id, facility: meta.facility || '', score: meta.score })
    setViewRpt(rpt); setPresurvey(rpt.presurvey||{}); setBldg(rpt.building||rpt.bldg||{}); setZones(rpt.zones||[]); setEquipment(rpt.equipment||[])
    setPhotos(rpt.photos||{}); setFloorPlan(rpt.floorPlan||null); setZoneScores(rpt.zoneScores||[]); setComp(rpt.comp||rpt.composite)
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
  // Mode selection — FM mode paused; auto-select IH for all users
  const hasModeSet = localStorage.getItem('atmosflow:userMode')
  if (profile && (!hasModeSet || hasModeSet === 'fm')) {
    persistMode('ih')
    setUserMode('ih')
  }
  // New user — show welcome then profile setup
  if (profile?.isNew && view === 'dash') {
    if (!welcomeDone) return <WelcomeScreen onComplete={() => { sessionStorage.setItem('aiq_welcomed', '1'); setWelcomeDone(true) }} />
    return <ProfileScreen onLogin={async (p) => { if (supabase) await Storage.saveProfile(p); setProfile(p) }} />
  }

  const handleModeSwitch = (m) => { persistMode(m); setUserMode(m) }


  // ── Question renderer (shared across quick start, zone, details) ──
  const renderQuestion = (q, data, setField, qIdx, visQs, goNext, goPrev, onFinish, finishLabel, secs) => {
    const progress = Math.round(((qIdx + 1) / visQs.length) * 100)
    const secIdx = secs.indexOf(q.sec)
    return (
      <div style={{paddingTop:12,paddingBottom:120}}>
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontSize:13,color:SUB,fontFamily:"var(--font-mono)"}}>{qIdx + 1} of {visQs.length}</span>
            <span style={{fontSize:13,color:ACCENT,fontFamily:"var(--font-mono)",fontWeight:600}}>{progress}%</span>
          </div>
          <div style={{height:4,background:BORDER,borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${progress}%`,background:`linear-gradient(90deg,#0891B2,${ACCENT})`,borderRadius:2,transition:'width .4s ease'}} />
          </div>
        </div>
        <div style={{display:'flex',gap:6,marginBottom:24,flexWrap:'wrap'}}>
          {secs.map((s,i)=><span key={s} style={{padding:'8px 16px',borderRadius:20,fontSize:12,fontWeight:600,fontFamily:"var(--font-mono)",minHeight:36,display:'inline-flex',alignItems:'center',background:i===secIdx?`${ACCENT}15`:'transparent',color:i===secIdx?ACCENT:i<secIdx?SUB:DIM,border:`1px solid ${i===secIdx?ACCENT+'30':'transparent'}`}}>{s}</span>)}
        </div>
        <div key={q.id+'-'+curZone} style={{animation:'fadeUp .4s cubic-bezier(.22,1,.36,1)'}}>
          <div style={{width:48,height:48,borderRadius:12,background:`${ACCENT}08`,border:`1px solid ${ACCENT}15`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>{emojiToIcon[q.ic] ? <I n={emojiToIcon[q.ic]} s={22} c={ACCENT} w={1.6} /> : <span style={{fontSize:22}}>{q.ic}</span>}</div>
          <h2 style={{fontSize:26,fontWeight:700,lineHeight:1.3,margin:0,marginBottom:10,letterSpacing:'-0.3px',color:TEXT}}>{q.q}</h2>
          {q.ref&&<div style={{display:'inline-flex',gap:7,padding:'8px 14px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:20,marginTop:6}}><span style={{fontSize:13,color:SUB,fontFamily:"var(--font-mono)",lineHeight:1.4}}>{q.ref}</span></div>}
          {!q.ref&&<div style={{height:16}} />}

          {q.t==='text'&&<input type="text" autoComplete={q.ac||'off'} value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Type...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&data[q.id])goNext()}} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:'inherit',fontWeight:500,outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}
          {q.t==='num'&&<div><div style={{position:'relative'}}><input type="number" inputMode="decimal" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Enter...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&data[q.id])goNext()}} style={{width:'100%',padding:'18px 20px',paddingRight:q.u?70:20,background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:'inherit',fontWeight:500,outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />{q.u&&<span style={{position:'absolute',right:18,top:'50%',transform:'translateY(-50%)',color:DIM,fontSize:14,fontFamily:"var(--font-mono)"}}>{q.u}</span>}</div>{q.helper==='co2_mass_balance'&&<Co2OaCalculator co2={data.co2} co2o={data.co2o} onApply={v=>setField(q.id,v)} onCo2Change={v=>setField('co2',v)} onCo2oChange={v=>setField('co2o',v)} />}</div>}
          {q.t==='date'&&<input type="date" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:'inherit',outline:'none',boxSizing:'border-box',colorScheme:'dark'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}
          {q.t==='time'&&<TimePickerInput value={data[q.id]||''} onChange={v=>setField(q.id,v)} placeholder={q.ph||'Select time…'} />}
          {q.t==='ta'&&<textarea value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Notes...'} rows={3} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',outline:'none',resize:'vertical',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}
          {q.t==='ch'&&q.opts&&<div style={{display:'flex',flexDirection:'column',gap:8}}>{q.opts.map((o,i)=>{const stMap=q._subtypeMap;const storedVal=stMap?stMap.find(st=>st.label===o)?.id||o:o;const sel=stMap?(data[q.id]===storedVal):(data[q.id]===o||(o==='Other'&&data[q.id]&&!q.opts.slice(0,-1).includes(data[q.id])));const locked=isPremiumOpt(q,o)&&!isEnterprise(profile);return(<button key={o} onClick={()=>{if(locked){haptic('light');setShowPremiumGate(true);return}haptic('light');if(o==='Other'){setField(q.id,'Other')}else{setField(q.id,storedVal);setTimeout(goNext,250)}}} style={{padding:'16px 20px',textAlign:'left',background:sel?`${ACCENT}12`:locked?`${CARD}`:`${CARD}`,border:`1.5px solid ${sel?ACCENT:BORDER}`,borderRadius:14,color:sel?ACCENT:locked?DIM:'#E2E8F0',fontSize:16,fontFamily:'inherit',fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:14,minHeight:54,animation:`fadeUp .3s ${i*.04}s cubic-bezier(.22,1,.36,1) both`}}><div style={{width:24,height:24,borderRadius:'50%',border:`2px solid ${sel?ACCENT:'#2A3040'}`,background:sel?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{sel&&<I n="check" s={12} c={BG} />}</div><span style={{flex:1}}>{o}</span>{locked&&<span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:4,background:'#F9731615',color:'#F97316',letterSpacing:'0.3px'}}>PREMIUM</span>}</button>)})}
            {q.other&&data[q.id]&&(data[q.id]==='Other'||!q.opts.slice(0,-1).includes(data[q.id]))&&<input type="text" value={data[q.id]==='Other'?'':data[q.id]} onChange={e=>setField(q.id,e.target.value||'Other')} placeholder="Describe space use..." autoFocus style={{width:'100%',padding:'16px 20px',background:CARD,border:`1.5px solid ${ACCENT}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginTop:4}} />}
          </div>}
          {q.t==='multi'&&q.opts&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>{q.opts.map((o,i)=>{const arr=data[q.id]||[],sel=arr.includes(o);return(<button key={o} onClick={()=>setField(q.id,sel?arr.filter(x=>x!==o):[...arr,o])} style={{padding:'12px 18px',borderRadius:24,background:sel?`${ACCENT}15`:CARD,border:`1.5px solid ${sel?ACCENT:BORDER}`,color:sel?ACCENT:'#C8D0DC',fontSize:14,fontFamily:'inherit',fontWeight:500,cursor:'pointer',minHeight:44,animation:`fadeUp .25s ${i*.03}s cubic-bezier(.22,1,.36,1) both`}}>{sel?'✓ ':''}{o}</button>)})}</div>}
          {q.t==='combo'&&q.opts&&(()=>{const otherOpts=q.opts.filter(o=>o!=='Other');const isOther=(data[q.id]||'')==='__other__'||((data[q.id]||'')&&!otherOpts.includes(data[q.id]));return(<div><select value={isOther?'__other__':(data[q.id]||'')} onChange={e=>setField(q.id,e.target.value)} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',outline:'none',boxSizing:'border-box',appearance:'auto'}}><option value="">Select or skip...</option>{otherOpts.map(o=><option key={o} value={o}>{o}</option>)}<option value="__other__">Other</option></select>{isOther&&<input type="text" value={data[q.id]==='__other__'?'':data[q.id]} onChange={e=>setField(q.id,e.target.value||'__other__')} placeholder="Type here..." autoFocus style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${ACCENT}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginTop:8}} />}</div>)})()}
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

        {/* ── Legacy / Standards Badge ── */}
        {viewRpt && !viewRpt.standardsManifest && <div style={{padding:'8px 14px',background:'#FBBF2410',border:`1px solid #FBBF2428`,borderRadius:8,marginBottom:10,fontSize:10,color:WARN}}>Legacy v1.x scoring — standards manifest not embedded</div>}

        {/* ── Composite Score Card ── */}
        <div style={{padding:'20px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,marginBottom:12,position:'relative',overflow:'hidden'}}>
          {/* Severity accent — top edge gradient */}
          <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg, ${comp.rc}, ${comp.rc}40)`}} />
          <div style={{display:'flex',alignItems:'center',gap:20,marginTop:2}}>
            {userMode !== 'fm' && <div style={{flexShrink:0}}>
              <ScoreRing value={comp.tot} color={comp.rc} size={96} />
            </div>}
            {userMode === 'fm' && <div style={{flexShrink:0,width:64,height:64,borderRadius:16,background:`${comp.rc}15`,border:`2px solid ${comp.rc}40`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <I n={comp.tot>=70?'check':comp.tot>=40?'alert':'alert'} s={28} c={comp.rc} w={2} />
            </div>}
            <div style={{flex:1,minWidth:0}}>
              <span style={{padding:'3px 8px',borderRadius:4,fontSize:9,fontWeight:700,background:`${comp.rc}12`,color:comp.rc,textTransform:'uppercase',letterSpacing:'0.5px'}}>{comp.risk}</span>
              {measConf&&<span style={{padding:'3px 8px',borderRadius:4,fontSize:9,fontWeight:600,background:measConf.overall==='High'?`${SUCCESS}12`:measConf.overall==='Low'?`${WARN}12`:`${DIM}15`,color:measConf.overall==='High'?SUCCESS:measConf.overall==='Low'?WARN:SUB,marginLeft:6,letterSpacing:'0.3px'}}>{measConf.overall} Confidence</span>}
              <div style={{fontSize:13,fontWeight:600,color:TEXT,marginTop:6,lineHeight:1.4}}>{riskLabel}</div>
              <div style={{fontSize:11,color:SUB,marginTop:3,lineHeight:1.4}}>{actionLabel}</div>
            </div>
          </div>
          {userMode !== 'fm' && <>
          <div style={{display:'flex',gap:1,marginTop:16,background:SURFACE,borderRadius:8,overflow:'hidden'}}>
            {[
              {l:'Zone average',v:comp.avg,s:'/100'},
              {l:'Lowest zone',v:comp.worst,s:'/100'},
              {l:'Zones assessed',v:comp.count,s:''},
            ].map((m,i)=>(
              <div key={i} style={{flex:1,padding:'10px 8px',textAlign:'center',borderRight:i<2?`1px solid ${BORDER}`:'none'}}>
                <div style={{fontSize:16,fontWeight:700,color:TEXT,fontFamily:"var(--font-mono)"}}>{m.v}<span style={{fontSize:9,color:DIM,fontWeight:500}}>{m.s}</span></div>
                <div style={{fontSize:8,color:SUB,marginTop:2,textTransform:'uppercase',letterSpacing:'0.3px'}}>{m.l}</div>
              </div>
            ))}
          </div>
          <div style={{textAlign:'center',marginTop:10,fontSize:9,color:DIM,fontFamily:"var(--font-mono)"}}>
            {comp.logic==='worst-zone-override'?'Composite = worst zone (Critical zone override)':'Composite = zone average (no Critical zones)'}
          </div>
          </>}
          {userMode === 'fm' && <div style={{textAlign:'center',marginTop:12,fontSize:10,color:DIM}}>{comp.count} area{comp.count!==1?'s':''} assessed</div>}
          {measConf?.overall==='Low'&&<div style={{textAlign:'center',marginTop:6,fontSize:9,color:WARN,lineHeight:1.5}}>Single-point measurement. Consider time-weighted sampling per AIHA strategy before drawing conclusions.</div>}
        </div>

        {/* ── v2.1 Engine InternalReport (operator dashboard) ── */}
        <V21InternalPanel
          zoneScores={zoneScores}
          comp={comp}
          zones={zones}
          profile={profile}
          presurvey={presurvey}
          bldg={bldg}
          assessmentDate={viewRpt?.ts ? viewRpt.ts.slice(0,10) : undefined}
        />

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
              {recs?.imm?.[0] && (() => { const first = recs.imm[0]; const text = (typeof first === 'string') ? first : (first?.text || ''); return (<div><div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Next action</div><div style={{color:ACCENT,lineHeight:1.4}}>{text.length > 70 ? text.slice(0,67)+'...' : text}</div></div>) })()}
              <div><div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Sampling</div><div style={{color:TEXT,lineHeight:1.4}}>{samplingPlan?.plan?.length > 0 ? `Targeted confirmatory sampling recommended (${samplingPlan.plan.length} analytical method${samplingPlan.plan.length>1?'s':''})` : 'No confirmatory sampling indicated at this time'}</div></div>
            </div>
          </div>
        )}

        {/* ── Instrument Data prompt ── */}
        {!archived && (!presurvey.ps_inst_iaq || !presurvey.ps_inst_iaq_serial || !presurvey.ps_inst_iaq_cal) && (
          <button onClick={()=>{setDqi(Q_DETAILS.findIndex(q=>q.id==='ps_inst_iaq'));setView('details')}} style={{width:'100%',padding:'12px 16px',background:`${WARN}08`,border:`1px solid ${WARN}20`,borderRadius:10,marginBottom:8,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
            <I n="alert" s={16} c={WARN} />
            <div style={{flex:1}}><span style={{fontSize:12,fontWeight:600,color:WARN}}>Add instrument data</span><span style={{fontSize:10,color:DIM,marginLeft:8}}>Required for defensible reports</span></div>
            <span style={{fontSize:13,color:WARN}}>→</span>
          </button>
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
            <span style={{fontSize:10,color:SUB,fontFamily:"var(--font-mono)"}}>{archived?'Final':narrative?'Ready for review':'Draft'}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,fontSize:9,color:DIM,fontFamily:"var(--font-mono)"}}>
            <span>{zoneScores.reduce((a,z)=>a+z.cats.reduce((b,c)=>b+c.r.length,0),0)} findings</span>
            <span>{Object.keys(photos||{}).length} photos</span>
          </div>
        </div>

        {/* ── Zone Selector ── */}
        {zoneScores.length > 1 && <div style={{display:'flex',gap:4,padding:3,background:CARD,borderRadius:10,border:`1px solid ${BORDER}`,marginBottom:12,overflowX:'auto',WebkitOverflowScrolling:'touch',scrollbarWidth:'none'}}>
          {zoneScores.map((z,i) => (
            <button key={i} onClick={()=>setSelZone(i)} style={{padding:'8px 12px',borderRadius:7,border:'none',background:selZone===i?`${z.rc}12`:'transparent',color:selZone===i?TEXT:DIM,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0,minHeight:36,display:'flex',alignItems:'center',gap:8}}>
              <span>{z.zoneName}</span>
              <span style={{padding:'2px 6px',borderRadius:4,fontSize:10,fontWeight:700,fontFamily:"var(--font-mono)",background:selZone===i?`${z.rc}20`:`${DIM}15`,color:selZone===i?z.rc:DIM}}>{z.tot}</span>
            </button>
          ))}
        </div>}

        {/* ── Content Tabs ──
            Tab visual language (UI upgrade): underline-on-active segmented
            control, ~44px tap target, icon stacked above label, transition
            on color/border. Container is a single bottom rule (no card-on-
            card nesting). Inactive uses SUB (raised from DIM for legibility).
        */}
        <div style={{display:'flex',gap:0,marginBottom:14,borderBottom:`1px solid ${BORDER}`,overflowX:'auto',scrollbarWidth:'none',WebkitOverflowScrolling:'touch'}}>
          {(userMode === 'fm'
            ? [['overview','findings','Findings'],['narrative','pulse','Narrative'],['actions','bolt','Actions']]
            : [['overview','findings','Findings'],['rootcause','chain','Pathways'],['sampling','flask','Sampling'],['narrative','pulse','Narrative'],['actions','bolt','Actions']]
          ).map(([k,ic,l])=>{
            const isActive = rTab===k
            return (
              <button key={k} onClick={()=>{setRTab(k);haptic('light')}} style={{flex:'1 1 auto',minWidth:64,padding:'10px 10px 12px',background:'transparent',border:'none',borderBottom:`2px solid ${isActive?ACCENT:'transparent'}`,marginBottom:-1,color:isActive?ACCENT:SUB,fontSize:12,fontWeight:isActive?600:500,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',display:'flex',flexDirection:'column',alignItems:'center',gap:4,transition:'color 160ms ease, border-color 160ms ease',WebkitTapHighlightColor:'transparent'}}>
                <I n={ic} s={14} c={isActive?ACCENT:SUB} w={isActive?2:1.6} />
                {l}
              </button>
            )
          })}
        </div>

        {rTab==='overview' && zs && <div style={{display:isTablet?'grid':'flex',gridTemplateColumns:isTablet?'1fr 1fr':'none',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
            <div style={{fontSize:14,fontWeight:600,color:TEXT}}>{zs.zoneName}</div>
            {userMode === 'fm' ? (
              <span style={{padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:700,background:`${zs.rc}15`,color:zs.rc}}>{zs.risk}</span>
            ) : (
              <div style={{display:'flex',alignItems:'baseline',gap:2}}>
                <span style={{fontSize:22,fontWeight:800,fontFamily:"var(--font-mono)",color:zs.rc}}>{zs.tot}</span>
                <span style={{fontSize:11,color:DIM,fontFamily:"var(--font-mono)"}}>/100</span>
              </div>
            )}
          </div>
          {zs.cats.map((cat,ci)=>{
            if (cat.s === null || cat.status === 'DATA_GAP' || cat.status === 'INSUFFICIENT') {
              return(
                <div key={cat.l} style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:14,fontWeight:600,color:TEXT}}>{cat.l}</span>
                    <span style={{fontSize:11,color:DIM,fontStyle:'italic'}}>Not scored</span>
                  </div>
                  <div style={{fontSize:11,color:DIM,marginTop:6,lineHeight:1.5}}>Data gap — documentation not provided for this category</div>
                </div>
              )
            }
            const pct=Math.round((cat.s/cat.mx)*100);const bc=pct>=80?'#22C55E':pct>=60?'#FBBF24':pct>=40?'#FB923C':'#EF4444';const pctLabel=pct>=80?'Within range':pct>=60?'Moderate concern':pct>=40?'Significant concern':'Critical concern';const fmLabel=pct>=70?'Pass':pct>=40?'Needs attention':'Action needed';const fmColor=pct>=70?'#22C55E':pct>=40?'#FBBF24':'#EF4444';const findings=cat.r.filter(r => !(r.sev === 'pass' && pct < 70));return(
            <div key={cat.l} style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
              {/* ── Canonical two-up label/value header (matches Expert Summary grammar) ── */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:userMode==='fm'?12:10}}>
                <div>
                  <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Category</div>
                  <div style={{color:TEXT,fontWeight:600,fontSize:14,lineHeight:1.4}}>{cat.l}</div>
                </div>
                <div>
                  <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Score</div>
                  {userMode === 'fm' ? (
                    <span style={{padding:'3px 10px',borderRadius:6,fontSize:11,fontWeight:700,background:`${fmColor}15`,color:fmColor}}>{cat.s===null?'No data':fmLabel}</span>
                  ) : (
                    <div style={{lineHeight:1.4,fontSize:13}}>
                      <span style={{color:bc,fontWeight:700}}>{cat.s}/{cat.mx}</span>
                      <span style={{color:DIM,fontWeight:500}}> · {pctLabel}</span>
                    </div>
                  )}
                </div>
              </div>
              {userMode !== 'fm' && <div style={{height:3,background:BORDER,borderRadius:2,overflow:'hidden',marginBottom:14}}>
                <div style={{height:'100%',width:`${pct}%`,background:bc,borderRadius:2,transition:'width .8s ease'}} />
              </div>}
              {findings.map((r,i)=>{const s=sv(r.sev);const sevLabel=r.sev.charAt(0).toUpperCase()+r.sev.slice(1);return(
                <div key={i} style={{marginBottom: i < findings.length - 1 ? 14 : 0}}>
                  <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Severity</div>
                  <div style={{color:s.c,fontWeight:700,fontSize:13,lineHeight:1.4,marginBottom:6}}>{sevLabel}</div>
                  <div style={{color:SUB,fontSize:13,lineHeight:1.6}}>{r.t}</div>
                  {r.std && <div style={{color:DIM,fontSize:12,marginTop:4,lineHeight:1.5}}>{r.std}</div>}
                </div>
              )})}
            </div>
          )})}
          {userMode !== 'fm' && oshaResult?.flag&&<div style={{padding:16,background:'#EF444412',border:`1px solid #EF444428`,borderRadius:10}}>
            <div style={{fontSize:13,fontWeight:700,color:'#EF4444',marginBottom:6}}>OSHA-Relevant Conditions</div>
            <div style={{fontSize:11,color:DIM,marginBottom:12,lineHeight:1.5}}>These items may warrant OSHA-related review and are not a determination of citation or violation.</div>
            {oshaResult.fl.map((f,i)=><div key={i} style={{fontSize:13,color:SUB,lineHeight:1.6,marginBottom:i<oshaResult.fl.length-1?6:0}}>{f}</div>)}
          </div>}
          {oshaResult?.gaps?.length>0&&<div style={{padding:16,background:'#FBBF2410',border:`1px solid #FBBF2428`,borderRadius:10}}>
            <div style={{fontSize:13,fontWeight:700,color:'#FBBF24',marginBottom:10}}>Data Gaps</div>
            {oshaResult.gaps.map((g,i)=><div key={i} style={{fontSize:13,color:SUB,lineHeight:1.6,marginBottom:i<oshaResult.gaps.length-1?6:0}}>{g}</div>)}
          </div>}
          {/* Mold Findings — parallel panel, not in composite */}
          {moldResults.length>0&&<div style={{padding:16,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginTop:10}}>
            <div style={{fontSize:14,fontWeight:600,color:TEXT,marginBottom:3}}>Mold Findings</div>
            <div style={{fontSize:11,color:DIM,marginBottom:12,lineHeight:1.5}}>Parallel assessment — not included in composite score. Drives IICRC S520 Conditions assessment.</div>
            {moldResults.map((m,i)=>{const moldColor=m.condition>=3?DANGER:m.condition>=2?WARN:SUB;return(
              <div key={i} style={{marginBottom:i<moldResults.length-1?12:0}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:3,flexWrap:'wrap'}}>
                  <div style={{color:moldColor,fontWeight:700,fontSize:13,lineHeight:1.4}}>{m.label}</div>
                  {m.investigationTriggered&&<span style={{padding:'2px 8px',background:`${WARN}15`,border:`1px solid ${WARN}30`,borderRadius:4,fontSize:10,fontWeight:700,color:WARN,letterSpacing:'0.3px'}}>Investigation triggered</span>}
                </div>
                <div style={{color:SUB,fontSize:13,lineHeight:1.6}}>{m.visual}</div>
              </div>
            )})}
          </div>}
          {/* Standards Used — collapsible */}
          {(() => {
            const manifest = viewRpt?.standardsManifest || STANDARDS_MANIFEST
            return (
              <details style={{marginTop:10}}>
                <summary style={{fontSize:11,fontWeight:600,color:DIM,cursor:'pointer',padding:'10px 0',listStyle:'none',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:8,color:DIM}}>▶</span> Standards reference · Engine v{manifest.engineVersion || '1.x'}
                </summary>
                <div style={{padding:12,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,marginTop:4}}>
                  {Object.entries(manifest).filter(([k]) => k !== 'engineVersion' && k !== 'manifestUpdated').map(([k, v]) => (
                    <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:SUB,marginBottom:4,gap:12}}>
                      <span style={{color:DIM}}>{k}</span><span style={{color:SUB,fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                  <div style={{fontSize:10,color:DIM,marginTop:6,borderTop:`1px solid ${BORDER}`,paddingTop:6}}>Manifest updated: {manifest.manifestUpdated || 'N/A'}</div>
                </div>
              </details>
            )
          })()}
        </div>}

        {rTab==='rootcause'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:11,color:DIM,lineHeight:1.5,marginBottom:4}}>Concern pathways are based on correlation of field observations, measurements, and occupant reports. They support — but do not confirm — root-cause determination.</div>
          {causalChains.length===0?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:10,border:`1px solid ${BORDER}`}}><I n="chain" s={24} c={DIM} w={1.4} /><div style={{fontSize:14,fontWeight:600,marginTop:12,marginBottom:4,color:SUB}}>No concern pathways identified</div><div style={{fontSize:12,color:DIM,lineHeight:1.5}}>No correlated multi-factor findings in this assessment.</div></div>
          :causalChains.map((ch,i)=>{const confLabel=ch.confidence==='Strong'?'High confidence':ch.confidence==='Moderate'?'Moderate confidence':'Possible';const cc=ch.confidence==='Strong'?'#22C55E':ch.confidence==='Moderate'?'#FBBF24':SUB;return(
            <div key={i} style={{padding:16,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
              {/* ── Canonical two-up: PATHWAY + CONFIDENCE ── */}
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,marginBottom:12,alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Pathway</div>
                  <div style={{color:TEXT,fontWeight:600,fontSize:14,lineHeight:1.4}}>{ch.type}</div>
                </div>
                <div>
                  <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Confidence</div>
                  <span style={{padding:'3px 10px',background:`${cc}12`,border:`1px solid ${cc}25`,borderRadius:4,fontSize:11,fontWeight:700,color:cc,letterSpacing:'0.3px'}}>{confLabel}</span>
                </div>
              </div>
              {/* ── ZONE — plain bold white, not cyan/monospace ── */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Zone</div>
                <div style={{color:TEXT,fontWeight:600,fontSize:13,lineHeight:1.4}}>{ch.zone}</div>
              </div>
              {/* ── HYPOTHESIS — flat label/value, no border, no quote framing ── */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Hypothesis</div>
                <div style={{color:SUB,fontSize:13,lineHeight:1.6}}>{ch.rootCause}</div>
              </div>
              {/* ── SUPPORTING EVIDENCE — flat list, no leading arrows ── */}
              <div>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Supporting evidence</div>
                {ch.evidence.map((e,j)=><div key={j} style={{fontSize:13,color:SUB,lineHeight:1.6,marginBottom:j<ch.evidence.length-1?2:0}}>{e}</div>)}
              </div>
            </div>
          )})}
        </div>}

        {rTab==='sampling'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
          {(!samplingPlan||samplingPlan.plan.length===0)?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:10,border:`1px solid ${BORDER}`}}><I n="flask" s={24} c={DIM} w={1.4} /><div style={{fontSize:14,fontWeight:600,marginTop:12,marginBottom:4,color:SUB}}>No sampling indicated</div><div style={{fontSize:12,color:DIM,lineHeight:1.5}}>No hypotheses requiring confirmatory sampling.</div></div>
          :<>{samplingPlan.plan.map((p,i)=>{const pc=p.priority==='critical'?'#EF4444':p.priority==='high'?'#FB923C':'#FBBF24';const priLabel=p.priority.charAt(0).toUpperCase()+p.priority.slice(1);return(
            <div key={i} style={{padding:18,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
              {/* ── Canonical two-up: SAMPLE TYPE + PRIORITY ── */}
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,marginBottom:12,alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Sample type</div>
                  <div style={{color:TEXT,fontWeight:600,fontSize:14,lineHeight:1.4}}>{p.type}</div>
                </div>
                <div>
                  <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Priority</div>
                  <span style={{padding:'3px 10px',background:`${pc}12`,border:`1px solid ${pc}25`,borderRadius:4,fontSize:11,fontWeight:700,color:pc,letterSpacing:'0.3px'}}>{priLabel}</span>
                </div>
              </div>
              {/* ── ZONE — plain bold white ── */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Zone</div>
                <div style={{color:TEXT,fontWeight:600,fontSize:13,lineHeight:1.4}}>{p.zone}</div>
              </div>
              {/* ── HYPOTHESIS / METHOD / CONTROLS — flat label/value pairs ── */}
              {[{l:'Hypothesis',v:p.hypothesis},{l:'Method',v:p.method},{l:'Controls',v:p.controls}].filter(x=>x.v).map(x=><div key={x.l} style={{marginBottom:12}}>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>{x.l}</div>
                <div style={{color:SUB,fontSize:13,lineHeight:1.6}}>{x.v}</div>
              </div>)}
              {/* ── REFERENCE — sentence case, no monospace ── */}
              {p.standard && <div>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Reference</div>
                <div style={{color:DIM,fontSize:12,lineHeight:1.5}}>{p.standard}</div>
              </div>}
            </div>
          )})}{samplingPlan.outdoorGaps?.length>0&&<div style={{padding:16,background:'#FBBF2410',border:`1px solid #FBBF2428`,borderRadius:10}}><div style={{fontSize:13,fontWeight:700,color:'#FBBF24',marginBottom:10}}>Outdoor Control Gaps</div>{samplingPlan.outdoorGaps.map((g,i)=><div key={i} style={{fontSize:13,color:SUB,lineHeight:1.6,marginBottom:i<samplingPlan.outdoorGaps.length-1?6:0}}>{g}</div>)}</div>}</>}
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
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,marginBottom:12,flexWrap:'wrap'}}>
              <div style={{fontSize:14,fontWeight:600,color:TEXT}}>Findings Narrative</div>
              <span style={{fontSize:11,color:DIM,fontWeight:500}}>AI-generated · Review required</span>
            </div>
            <div style={{fontSize:13,color:SUB,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{narrative}</div>
            <div style={{marginTop:14,padding:'10px 12px',background:`${WARN}08`,border:`1px solid ${WARN}18`,borderRadius:10}}>
              <div style={{fontSize:11,color:WARN,fontWeight:600,marginBottom:3}}>Professional review required</div>
              <div style={{fontSize:11,color:DIM,lineHeight:1.5}}>This narrative was generated from deterministic scoring output. Review, edit, and approve before including in any client deliverable or report.</div>
            </div>
          </div>}
        </div>}

        {rTab==='actions'&&recs&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontSize:11,color:DIM,lineHeight:1.5,marginBottom:2}}>Recommendations are tiered by urgency and type. Review and adapt for site-specific conditions before implementation.</div>
          {[{k:'imm',l:'Immediate Actions',s:'Address within 48 hours',c:'#EF4444'},{k:'eng',l:'Engineering Controls',s:'1–4 weeks',c:ACCENT},{k:'adm',l:'Administrative Controls',s:'1–3 months',c:'#FBBF24'},{k:'mon',l:'Ongoing Monitoring',s:'Continuous',c:SUB}].map(cat=>{
            if(!recs[cat.k]?.length)return null
            const knownZones=(zones||[]).map(z=>z.zn).filter(Boolean)
            // Engine v2.8+ emits RecommendationAction[] objects; reports
            // finalized pre-v2.8 stored string[] — groupActions normalizes
            // both shapes and groups by zone / equipment / building so each
            // location header renders once with its actions as bullets
            // (instead of repeating the location label per rule).
            const groups = groupActions(recs[cat.k], knownZones)
            return(<div key={cat.k} style={{padding:14,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
            {/* ── Canonical two-up: TIER + TIMEFRAME ── */}
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,marginBottom:14,alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Tier</div>
                <div style={{color:cat.c,fontWeight:600,fontSize:14,lineHeight:1.4}}>{cat.l}</div>
              </div>
              <div>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Timeframe</div>
                <div style={{color:SUB,fontWeight:500,fontSize:13,lineHeight:1.4}}>{cat.s}</div>
              </div>
            </div>
            {/* ── Group header (zone / equipment / building-wide) + bulleted action list ── */}
            {groups.map((g, gi) => {
              const isEquipment = g.scope === 'equipment'
              const headerColor = isEquipment ? ACCENT : TEXT
              return (
                <div key={g.key} style={{marginBottom: gi < groups.length - 1 ? 14 : 0}}>
                  <div style={{color:headerColor,fontWeight:600,fontSize:13,lineHeight:1.4,marginBottom:6,display:'flex',alignItems:'baseline',gap:6}}>
                    <span>{g.label}</span>
                  </div>
                  <ul style={{margin:0,padding:'0 0 0 18px',listStyle:'disc',color:SUB}}>
                    {g.actions.map((a, ai) => (
                      <li key={ai} style={{color:SUB,fontSize:13,lineHeight:1.6,marginBottom:4}}>{a.text}</li>
                    ))}
                  </ul>
                  {isEquipment && g.affectedZoneNames && g.affectedZoneNames.length > 0 && (
                    <div style={{color:DIM,fontSize:11,fontStyle:'italic',marginTop:4,marginLeft:18}}>Affects: {g.affectedZoneNames.join(', ')}</div>
                  )}
                </div>
              )
            })}
          </div>)})}
          <div style={{display:'flex',gap:10,marginTop:8}}>
            <button onClick={()=>handleExport('pdf')} style={{flex:1,padding:'14px 20px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}30`,borderRadius:12,color:ACCENT,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><I n="download" s={16} c={ACCENT} /> PDF</button>
            <button onClick={()=>setDocxPicker(true)} style={{flex:1,padding:'14px 20px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}30`,borderRadius:12,color:ACCENT,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><I n="notes" s={16} c={ACCENT} /> Word</button>
            <button onClick={handleShare} style={{flex:1,padding:'14px 20px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,color:SUB,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><I n="send" s={16} c={SUB} /> Share</button>
          </div>
          <button onClick={()=>setView('spatial')} style={{padding:'14px 20px',background:`${ACCENT}06`,border:`1px solid ${ACCENT}18`,borderRadius:12,color:ACCENT,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',marginTop:8,minHeight:48,width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><I n="bldg" s={16} c={ACCENT} /> Map Zones on Floor Plan</button>
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
              <div style={{fontSize:12,color:DIM,fontFamily:"var(--font-mono)",marginTop:4}}>Deleted {fD(t.deletedAt)} · Expires {fD(t.expiresAt)}</div>
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
    <div style={{minHeight:'100vh',background:BG,color:TEXT,fontFamily:"'inherit', system-ui, sans-serif"}}>
      <header style={{position:'fixed',top:0,left:0,right:0,zIndex:100,background:`${BG}F2`,backdropFilter:'blur(24px) saturate(1.4)',WebkitBackdropFilter:'blur(24px) saturate(1.4)',borderBottom:`1px solid ${BORDER}`,paddingTop:'env(safe-area-inset-top, 0px)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:48,padding:`0 ${padX}px`,maxWidth:contentMax,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:28,height:28,borderRadius:7,background:ACCENT,display:'flex',alignItems:'center',justifyContent:'center'}}><I n="wind" s={14} c={BG} w={2.2} /></div>
            <span style={{fontSize:15,fontWeight:700,letterSpacing:'-0.3px',color:TEXT}}>Atmos<span style={{color:ACCENT}}>Flow</span></span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {isAssessing&&<span style={{fontSize:10,color:ACCENT,fontFamily:"var(--font-mono)",background:`${ACCENT}0A`,padding:'3px 10px',borderRadius:4,border:`1px solid ${ACCENT}20`,letterSpacing:'0.5px'}}>SAVING</span>}
            {view!=='dash'&&view!=='drafts'&&view!=='history'&&view!=='settings'&&view!=='trash'&&view!=='tos'&&view!=='privacy'&&<button onClick={()=>{setView('dash');setViewRpt(null)}} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:13,fontWeight:600,padding:'7px 14px',cursor:'pointer',fontFamily:'inherit',minHeight:36,transition:'color 0.15s'}}>← Home</button>}
          </div>
        </div>
      </header>
      <div style={{height:'calc(48px + env(safe-area-inset-top, 0px))'}} />

      {milestone&&<div style={{position:'fixed',inset:0,background:`${BG}F0`,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 32px'}}><div style={{textAlign:'center',animation:'milestoneIn .5s cubic-bezier(.22,1,.36,1)'}}><div style={{marginBottom:20,display:'flex',justifyContent:'center'}}><div style={{width:80,height:80,borderRadius:22,background:`${ACCENT}12`,border:`1.5px solid ${ACCENT}30`,display:'flex',alignItems:'center',justifyContent:'center'}}><I n={milestone.icon} s={40} c={ACCENT} w={2} /></div></div><div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.5px',color:TEXT}}>{milestone.title}</div><div style={{fontSize:15,color:ACCENT,fontFamily:"var(--font-mono)",marginTop:10}}>{milestone.sub}</div></div></div>}

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
              <div>All outputs generated by AtmosFlow are advisory and intended to support — not replace — professional judgment by a qualified industrial hygienist or EHS professional.</div>
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
              <div>AI-generated narratives and automated findings require professional review before client delivery. AtmosFlow does not provide legal, regulatory, or medical advice.</div>
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
      {showPricing && (
        <PricingSheet
          profile={profile}
          credits={credits}
          contentMax={contentMax}
          onClose={() => setShowPricing(false)}
        />
      )}

      {/* ── Photo Selection Modal ── */}
      {showPhotoSelect&&<div style={{position:'fixed',inset:0,background:'#000000DD',zIndex:260,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)setShowPhotoSelect(false)}}>
        <div style={{width:'100%',maxWidth:contentMax,background:CARD,border:`1px solid ${BORDER}`,borderRadius:'20px 20px 0 0',padding:'24px 20px',paddingBottom:'calc(32px + env(safe-area-inset-bottom, 0px))',animation:'fadeUp .3s ease',maxHeight:'80vh',overflowY:'auto'}}>
          <div style={{width:36,height:4,borderRadius:2,background:BORDER,margin:'0 auto 16px'}} />
          <div style={{fontSize:18,fontWeight:700,color:TEXT,marginBottom:4}}>Include Photos</div>
          <div style={{fontSize:12,color:SUB,marginBottom:16}}>Select which photos to include in the report.</div>
          {Object.keys(photos).filter(k=>(photos[k]||[]).length>0).map(k=>{
            const zi=parseInt(k.match(/^z(\d+)-/)?.[1]??'-1')
            const fieldId=k.replace(/^z\d+-/,'')
            const fieldLabels={dp:'Condensate drain pan',wd:'Water damage',mi:'Mold indicators'}
            const zoneName=zones[zi]?.zn||`Zone ${zi+1}`
            return (photos[k]||[]).map((p,i)=>(
              <button key={`${k}::${i}`} onClick={()=>setSelectedPhotos(prev=>({...prev,[`${k}::${i}`]:!prev[`${k}::${i}`]}))} style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:selectedPhotos[`${k}::${i}`]?`${ACCENT}08`:SURFACE,border:`1px solid ${selectedPhotos[`${k}::${i}`]?ACCENT+'30':BORDER}`,borderRadius:10,marginBottom:6,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${selectedPhotos[`${k}::${i}`]?ACCENT:DIM}`,background:selectedPhotos[`${k}::${i}`]?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {selectedPhotos[`${k}::${i}`]&&<span style={{color:'#000',fontSize:12,fontWeight:700}}>✓</span>}
                </div>
                {p.src&&<img src={p.src} alt="" style={{width:48,height:48,objectFit:'cover',borderRadius:6,flexShrink:0}} />}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:TEXT}}>{fieldLabels[fieldId]||fieldId}</div>
                  <div style={{fontSize:10,color:DIM,marginTop:1}}>{zoneName}{p.ts?` · ${new Date(p.ts).toLocaleTimeString()}`:''}</div>
                </div>
              </button>
            ))
          })}
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button onClick={()=>{setSelectedPhotos({});confirmExportWithPhotos()}} style={{flex:1,padding:'14px 0',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Skip Photos</button>
            <button onClick={confirmExportWithPhotos} style={{flex:1,padding:'14px 0',background:ACCENT,border:'none',borderRadius:10,color:'#000',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Export with {Object.values(selectedPhotos).filter(Boolean).length} Photo{Object.values(selectedPhotos).filter(Boolean).length!==1?'s':''}</button>
          </div>
        </div>
      </div>}

      {/* ── Premium Gate Modal ── */}
      {showPremiumGate&&<div style={{position:'fixed',inset:0,background:'#000000DD',zIndex:270,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={e=>{if(e.target===e.currentTarget)setShowPremiumGate(false)}}>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:28,maxWidth:380,width:'100%',animation:'fadeUp .3s ease'}}>
          <div style={{fontSize:20,fontWeight:700,color:TEXT,marginBottom:6}}>Unlock Mission-Critical IAQ Features</div>
          <div style={{fontSize:13,color:SUB,lineHeight:1.7,marginBottom:16}}>The Data Center module activates specialized analytical logic for ASHRAE TC 9.9 thermal ranges and ANSI/ISA-71.04 corrosion tracking. This is required for documenting compliance in facilities with high-value hardware and mission-critical uptime requirements.</div>
          <div style={{padding:12,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:16}}>
            <div style={{display:'flex',flexDirection:'column',gap:6,fontSize:11,color:SUB}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{color:ACCENT}}>✓</span> ISA-71.04 gaseous corrosion classification</div>
              <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{color:ACCENT}}>✓</span> ISO 14644-1 particle count tracking</div>
              <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{color:ACCENT}}>✓</span> ASHRAE TC 9.9 thermal envelope scoring</div>
              <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{color:ACCENT}}>✓</span> Creep corrosion risk pattern analysis</div>
              <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{color:ACCENT}}>✓</span> Zone-specific equipment-focused weighting</div>
            </div>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setShowPremiumGate(false)} style={{flex:1,padding:'14px 0',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:13,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Back</button>
            <a href="mailto:support@prudenceehs.com?subject=Data Center Module — Enterprise Inquiry" style={{flex:1,padding:'14px 0',background:'#F97316',border:'none',borderRadius:10,color:'#000',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:44,textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center'}}>Contact Sales</a>
          </div>
        </div>
      </div>}

      {delConf&&<div style={{position:'fixed',inset:0,background:'#000000CC',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}><div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:28,maxWidth:340,width:'100%',animation:'fadeUp .3s ease'}}><div style={{fontSize:18,fontWeight:700,marginBottom:8,color:TEXT}}>Move to Trash?</div><div style={{fontSize:14,color:SUB,marginBottom:12,lineHeight:1.6}}>You can recover this for 30 days.</div><div style={{fontSize:12,color:DIM,marginBottom:24,background:SURFACE,padding:'10px 14px',borderRadius:8}}>Recoverable from Dashboard → Trash</div><div style={{display:'flex',gap:10}}><button onClick={()=>setDelConf(null)} style={{flex:1,padding:'14px 0',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Cancel</button><button onClick={()=>deleteItem(delConf.id,delConf.name,delConf.type)} style={{flex:1,padding:'14px 0',background:'#EF444420',border:'1px solid #EF444440',borderRadius:10,color:'#EF4444',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Delete</button></div></div></div>}

      {/* ── Calibration Warning Modal ── */}
      {calWarning&&<div style={{position:'fixed',inset:0,background:'#000000CC',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:28,maxWidth:400,width:'100%',animation:'fadeUp .3s ease'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{width:36,height:36,borderRadius:10,background:`${WARN}15`,border:`1px solid ${WARN}30`,display:'flex',alignItems:'center',justifyContent:'center'}}><I n="alert" s={18} c={WARN} w={2} /></div>
            <div style={{fontSize:18,fontWeight:700,color:TEXT}}>Instrument Data Missing</div>
          </div>
          <div style={{fontSize:13,color:SUB,lineHeight:1.7,marginBottom:16}}>Reports generated without instrument identification and calibration records have reduced defensibility. The following information was not provided:</div>
          <div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:20}}>
            {calWarning.map((m,i)=><div key={i} style={{fontSize:12,color:WARN,lineHeight:1.8,paddingLeft:12,borderLeft:`2px solid ${WARN}30`,marginBottom:i<calWarning.length-1?6:0}}>• {m}</div>)}
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>{setCalWarning(null);setDqi(Q_DETAILS.findIndex(q=>q.id==='ps_inst_iaq'));setView('details')}} style={{flex:1,padding:'14px 0',background:ACCENT,border:'none',borderRadius:10,color:'#000',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Add instrument data</button>
            <button onClick={()=>{setCalWarning(null);finishAssessment(true)}} style={{flex:1,padding:'14px 0',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:13,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Continue without</button>
          </div>
          <div style={{textAlign:'center',marginTop:10,fontSize:9,color:DIM,lineHeight:1.5}}>Instrument metadata strengthens OSHA defensibility and professional credibility of assessment findings.</div>
        </div>
      </div>}

      {/* ── DOCX Report Type Picker ── */}
      {docxPicker&&<div style={{position:'fixed',inset:0,background:'#000000CC',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,padding:28,maxWidth:380,width:'100%',animation:'fadeUp .3s ease'}}>
          <div style={{fontSize:18,fontWeight:700,color:TEXT,marginBottom:4}}>Export Word Report</div>
          <div style={{fontSize:12,color:SUB,marginBottom:20,lineHeight:1.5}}>Choose which report format to generate.</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button onClick={()=>{setDocxPicker(false);handleExport('docx','consultant')}} style={{padding:'16px',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'border-color 0.15s'}}>
              <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:2}}>Consultant Report</div>
              <div style={{fontSize:11,color:SUB,lineHeight:1.5}}>Narrative format with executive summary, interpretation, and recommendations. For client delivery.</div>
            </button>
            <button onClick={()=>{setDocxPicker(false);handleExport('docx','technical')}} style={{padding:'16px',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'border-color 0.15s'}}>
              <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:2}}>Technical Report</div>
              <div style={{fontSize:11,color:SUB,lineHeight:1.5}}>Structured findings register, score matrix, instrument log, and data gaps. For peer review and engineering.</div>
            </button>
            <button onClick={()=>{setDocxPicker(false);handleExport('docx','both')}} style={{padding:'16px',background:`${ACCENT}08`,border:`1px solid ${ACCENT}20`,borderRadius:12,cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'border-color 0.15s'}}>
              <div style={{fontSize:14,fontWeight:700,color:ACCENT,marginBottom:2}}>Both Reports</div>
              <div style={{fontSize:11,color:SUB,lineHeight:1.5}}>Downloads both files — consultant report + technical report.</div>
            </button>
          </div>
          <button onClick={()=>setDocxPicker(false)} style={{width:'100%',padding:'12px 0',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:DIM,fontSize:13,cursor:'pointer',fontFamily:'inherit',marginTop:12,minHeight:44}}>Cancel</button>
        </div>
      </div>}

      <div style={{maxWidth:contentMax,margin:'0 auto',padding:`0 ${padX}px`,position:'relative',zIndex:1}}>

        {view==='dash'&&<div style={{paddingTop:24,paddingBottom:100,maxWidth:contentMax,margin:'0 auto'}}>

          {/* ── Header: name, date, credits, kebab menu ── */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24,animation:'fadeUp .4s ease'}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:TEXT,fontFamily:'inherit',letterSpacing:'-0.2px'}}>{profile?.name || 'Assessor'}</div>
              <div style={{fontSize:11,fontFamily:"var(--font-mono)",color:DIM,marginTop:2}}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</div>
            </div>
            <div style={{position:'relative',display:'flex',alignItems:'center',gap:8}}>
              <button onClick={()=>setShowPricing(true)} style={{padding:'6px 12px',borderRadius:8,background:SURFACE,border:`1px solid ${BORDER}`,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'baseline',gap:6,minHeight:36}}>
                <span style={{fontSize:13,fontWeight:700,color:ACCENT,fontFamily:"var(--font-mono)"}}>{credits}</span>
                <span style={{fontSize:10,color:SUB}}>credits</span>
              </button>
              {profile && (
                <button
                  onClick={()=>setShowHomeMenu(v=>!v)}
                  aria-label="Open menu"
                  aria-haspopup="menu"
                  aria-expanded={showHomeMenu}
                  style={{width:36,height:36,borderRadius:10,background:showHomeMenu ? CARD : SURFACE,border:`1px solid ${BORDER}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <I n="dots" s={18} c={SUB} />
                </button>
              )}
              {showHomeMenu && (
                <>
                  {/* Backdrop catches outside clicks. Transparent so it
                      doesn't darken the screen — matches Notion's
                      lightweight popover model. */}
                  <div onClick={()=>setShowHomeMenu(false)} style={{position:'fixed',inset:0,zIndex:90,background:'transparent'}} />
                  <div role="menu" style={{position:'absolute',top:'calc(100% + 8px)',right:0,minWidth:240,background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:6,zIndex:100,boxShadow:'0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset',animation:'fadeUp .15s ease'}}>
                    {[
                      { label: 'Upgrade plan', icon: 'bolt',   onClick: () => setShowPricing(true) },
                      { label: 'Settings',     icon: 'gear',   onClick: () => setView('settings') },
                      { label: 'Reports',      icon: 'report', onClick: () => setView('history') },
                      { label: 'Trash',        icon: 'trash',  onClick: () => setView('trash') },
                      { label: 'Help & Support', icon: 'help', onClick: () => { window.location.href = 'mailto:support@prudenceehs.com?subject=AtmosFlow%20support' } },
                    ].map(item => (
                      <button
                        key={item.label}
                        role="menuitem"
                        onClick={() => { setShowHomeMenu(false); item.onClick() }}
                        style={{
                          width:'100%',padding:'12px 14px',background:'transparent',border:'none',borderRadius:10,
                          cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,
                          fontFamily:'inherit',color:TEXT,fontSize:14,fontWeight:500,minHeight:44,
                          transition:'background 0.12s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = SURFACE }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <I n={item.icon} s={18} c={SUB} w={1.6} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Exception-only status. Renders nothing in the happy path. ── */}
          {(() => {
            const calDue = profile?.iaq_meter && !profile?.iaq_cal_status?.includes('within manufacturer')
            if (!calDue) return null
            return (
              <div role="status" style={{padding:'10px 14px',background:`${WARN}10`,border:`1px solid ${WARN}30`,borderRadius:10,marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                <I n="alert" s={14} c={WARN} w={1.8} />
                <span style={{fontSize:12,color:TEXT,fontWeight:500}}>Calibration may be due — check before next assessment</span>
                <button onClick={()=>setView('settings')} style={{marginLeft:'auto',background:'none',border:'none',color:WARN,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Review</button>
              </div>
            )
          })()}

          {/* ── Tier 1: primary action ── */}
          <button onClick={startNew} style={{width:'100%',padding:'18px 20px',marginBottom:24,background:`${ACCENT}10`,border:`1px solid ${ACCENT}40`,borderRadius:14,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,fontFamily:'inherit',transition:'border-color 0.15s, background 0.15s',minHeight:64}}>
            <div style={{width:44,height:44,borderRadius:11,background:`${ACCENT}18`,border:`1px solid ${ACCENT}30`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <I n="wind" s={20} c={ACCENT} w={2} />
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:16,fontWeight:700,color:TEXT,fontFamily:'inherit',letterSpacing:'-0.2px'}}>{userMode==='fm' ? 'New Air Quality Check' : 'New Assessment'}</div>
              <div style={{fontSize:11,color:SUB,marginTop:3,fontFamily:"var(--font-mono)"}}>1 credit</div>
            </div>
          </button>

          {/* ── Tier 2 Group A: Workspace ── */}
          <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:8,paddingLeft:4}}>Workspace</div>
          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,marginBottom:24,overflow:'hidden'}}>
            {[
              { key:'drafts', label: userMode==='fm' ? 'In Progress' : 'Drafts', count: (index.drafts||[]).length, view: 'drafts' },
              { key:'reports', label: 'Reports', count: (index.reports||[]).length, view: 'history' },
            ].map((row, i) => (
              <button key={row.key} onClick={()=>{ if (row.count) setView(row.view) }} disabled={!row.count} style={{width:'100%',padding:'14px 16px',background:'transparent',border:'none',borderTop: i===0 ? 'none' : `1px solid ${BORDER}`,cursor: row.count ? 'pointer' : 'default',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',minHeight:56,opacity: row.count ? 1 : 0.55}}>
                <span style={{flex:1,fontSize:14,fontWeight:600,color: row.count ? TEXT : SUB}}>{row.label}</span>
                <span style={{fontSize:14,fontWeight:700,fontFamily:"var(--font-mono)",color: row.count ? TEXT : DIM}}>{row.count}</span>
                {row.count > 0 && <span style={{color:DIM,fontSize:13,marginLeft:4}}>›</span>}
              </button>
            ))}
          </div>

          {/* ── Tier 2 Group B: Recent reports (only when present) ── */}
          {(index.reports||[]).length > 0 && <>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:8,paddingLeft:4,paddingRight:4}}>
              <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px'}}>Recent</div>
              {(index.reports||[]).length > 3 && <button onClick={()=>setView('history')} style={{background:'none',border:'none',color:ACCENT,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>View all</button>}
            </div>
            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,marginBottom:24,overflow:'hidden'}}>
              {(index.reports||[]).slice(0,3).map((r, i) => {
                const sc = r.score
                const sevColor = sc>=70 ? SUCCESS : sc>=50 ? WARN : DANGER
                return (
                  <button key={r.id} onClick={()=>openReport(r)} style={{width:'100%',padding:'14px 16px',background:'transparent',border:'none',borderTop: i===0 ? 'none' : `1px solid ${BORDER}`,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',minHeight:60}}>
                    <div style={{width:38,height:38,borderRadius:8,background:`${sevColor}10`,border:`1px solid ${sevColor}25`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span style={{fontSize:14,fontWeight:800,fontFamily:"var(--font-mono)",color:sevColor}}>{sc || '—'}</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:TEXT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.facility || 'Untitled'}</div>
                      <div style={{fontSize:11,color:DIM,fontFamily:"var(--font-mono)",marginTop:2}}>{fD(r.ts)}</div>
                    </div>
                    <span style={{color:DIM,fontSize:13}}>›</span>
                  </button>
                )
              })}
            </div>
          </>}

          {/* ── Tier 2 Group C: Demos ── */}
          <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:8,paddingLeft:4}}>Try with sample data</div>
          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,marginBottom:20,overflow:'hidden'}}>
            <button onClick={()=>runDemo()} style={{width:'100%',padding:'14px 16px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',minHeight:56}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:TEXT}}>{userMode==='fm' ? 'Sample Air Quality Check' : 'Office Building Demo'}</div>
                <div style={{fontSize:11,color:SUB,marginTop:2,fontFamily:"var(--font-mono)",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userMode==='fm' ? 'Greenfield Office Park · 2 areas' : 'Meridian Commerce Tower · 3 zones'}</div>
              </div>
              <span style={{fontSize:10,color:DIM,fontFamily:"var(--font-mono)",padding:'3px 8px',borderRadius:6,background:SURFACE,border:`1px solid ${BORDER}`}}>~10 min</span>
              <span style={{color:DIM,fontSize:13,marginLeft:4}}>›</span>
            </button>
            {userMode !== 'fm' && <button onClick={()=>runDemo('dc')} style={{width:'100%',padding:'14px 16px',background:'transparent',border:'none',borderTop:`1px solid ${BORDER}`,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',minHeight:56}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:TEXT}}>Data Center Demo</div>
                <div style={{fontSize:11,color:SUB,marginTop:2,fontFamily:"var(--font-mono)",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Hizinburg DC · 3 zones · ISA-71.04 + ISO 14644</div>
              </div>
              <span style={{fontSize:10,color:DIM,fontFamily:"var(--font-mono)",padding:'3px 8px',borderRadius:6,background:SURFACE,border:`1px solid ${BORDER}`}}>~10 min</span>
              <span style={{color:DIM,fontSize:13,marginLeft:4}}>›</span>
            </button>}
          </div>

          {/* ── Empty state — only when no reports AND no drafts ── */}
          {(index.reports||[]).length===0 && (index.drafts||[]).length===0 && (
            <div style={{padding:'18px 16px',background:SURFACE,border:`1px dashed ${BORDER}`,borderRadius:12,marginBottom:20,textAlign:'center'}}>
              <div style={{fontSize:13,fontWeight:600,color:TEXT,marginBottom:4}}>No assessments yet</div>
              <div style={{fontSize:12,color:SUB,lineHeight:1.5}}>Start a new assessment above, or run a demo to see a finished report.</div>
            </div>
          )}

        </div>}

        {view==='quickstart'&&qscq&&renderQuestion(qscq,mergedData,setQSField,qsqi,qsVis,()=>{if(qsqi<qsVis.length-1)setQsqi(qsqi+1)},()=>{if(qsqi>0)setQsqi(qsqi-1)},finishQuickStart,'→ HVAC Equipment',qsSecs)}

        {view==='equipment'&&<div style={{paddingTop:20,paddingBottom:120,maxWidth:contentMax,margin:'0 auto'}}>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:600,color:ACCENT,fontFamily:"var(--font-mono)",letterSpacing:'0.5px',marginBottom:6}}>STEP 2 OF 3 · HVAC EQUIPMENT</div>
            <div style={{fontSize:22,fontWeight:700,color:TEXT,letterSpacing:'-0.4px',marginBottom:6}}>Capture HVAC equipment</div>
            <div style={{fontSize:13,color:SUB,lineHeight:1.5}}>List the HVAC units serving the assessed area (AHU, RTU, FCU, ERV, etc.). Each captured unit becomes selectable when you map zones in the next step. <strong style={{color:TEXT,fontWeight:600}}>You can skip this step</strong> — equipment-scoped recommendations will surface as building-wide actions until equipment is identified.</div>
          </div>

          {/* Equipment list */}
          {(equipment||[]).length > 0 && (
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
              {equipment.map(e => (
                <div key={e.id} style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,display:'flex',alignItems:'center',gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:TEXT}}>{e.label} <span style={{fontSize:11,color:DIM,fontFamily:"var(--font-mono)",fontWeight:500,marginLeft:6}}>{e.type}</span></div>
                    {e.location && <div style={{fontSize:12,color:SUB,marginTop:2}}>{e.location}</div>}
                  </div>
                  <button onClick={()=>{setEditingEqId(e.id); setEqForm(e)}} style={{padding:'8px 12px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:12,cursor:'pointer',fontFamily:'inherit',minHeight:36}}>Edit</button>
                  <button onClick={()=>{setEquipment(prev=>prev.filter(x=>x.id!==e.id)); setZones(prev=>prev.map(z=>({...z,servingEquipmentIds:(z.servingEquipmentIds||[]).filter(id=>id!==e.id)})))}} style={{padding:'8px 12px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:'#EF4444',fontSize:12,cursor:'pointer',fontFamily:'inherit',minHeight:36}}>Remove</button>
                </div>
              ))}
            </div>
          )}

          {/* Add / edit form */}
          {editingEqId ? (
            <div style={{padding:18,background:CARD,border:`1px solid ${ACCENT}30`,borderRadius:12,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:14}}>{editingEqId === '__new' ? 'New equipment unit' : 'Edit equipment'}</div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:600,color:SUB,marginBottom:6}}>Label *</div>
                <input type="text" value={eqForm.label||''} onChange={e=>setEqForm(p=>({...p,label:e.target.value}))} placeholder="e.g. AHU-1, RTU-3, FCU-3F-Open" style={{width:'100%',padding:'12px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,fontFamily:'inherit',boxSizing:'border-box'}} />
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:600,color:SUB,marginBottom:6}}>Type *</div>
                <select value={eqForm.type||''} onChange={e=>setEqForm(p=>({...p,type:e.target.value}))} style={{width:'100%',padding:'12px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,fontFamily:'inherit',boxSizing:'border-box'}}>
                  <option value="">Select type…</option>
                  <option value="AHU">AHU — Air Handling Unit</option>
                  <option value="RTU">RTU — Rooftop Unit</option>
                  <option value="FCU">FCU — Fan Coil Unit</option>
                  <option value="VRF_INDOOR">VRF Indoor Unit</option>
                  <option value="ERV">ERV — Energy Recovery Ventilator</option>
                  <option value="MAU">MAU — Makeup Air Unit</option>
                  <option value="DOAS">DOAS — Dedicated Outdoor Air System</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:600,color:SUB,marginBottom:6}}>Location <span style={{color:DIM,fontWeight:400}}>(optional)</span></div>
                <input type="text" value={eqForm.location||''} onChange={e=>setEqForm(p=>({...p,location:e.target.value}))} placeholder="e.g. 3rd-floor mechanical room, rooftop" style={{width:'100%',padding:'12px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,fontFamily:'inherit',boxSizing:'border-box'}} />
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:600,color:SUB,marginBottom:6}}>Filter class <span style={{color:DIM,fontWeight:400}}>(optional)</span></div>
                <input type="text" value={eqForm.filterClass||''} onChange={e=>setEqForm(p=>({...p,filterClass:e.target.value}))} placeholder="e.g. MERV 13" style={{width:'100%',padding:'12px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,fontFamily:'inherit',boxSizing:'border-box'}} />
              </div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:600,color:SUB,marginBottom:6}}>Notes <span style={{color:DIM,fontWeight:400}}>(optional)</span></div>
                <textarea value={eqForm.notes||''} onChange={e=>setEqForm(p=>({...p,notes:e.target.value}))} rows={2} style={{width:'100%',padding:'12px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,fontFamily:'inherit',boxSizing:'border-box',resize:'vertical'}} />
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{setEditingEqId(null); setEqForm({})}} style={{flex:0,padding:'12px 18px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:13,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Cancel</button>
                <button disabled={!eqForm.label || !eqForm.type} onClick={()=>{
                  const id = editingEqId === '__new' ? ('eq-' + Date.now().toString(36)) : editingEqId
                  const next = { id, label: eqForm.label.trim(), type: eqForm.type, location: eqForm.location?.trim() || '', filterClass: eqForm.filterClass?.trim() || '', notes: eqForm.notes?.trim() || '', servedZoneIds: editingEqId === '__new' ? [] : (equipment.find(x=>x.id===editingEqId)?.servedZoneIds || []) }
                  setEquipment(prev => editingEqId === '__new' ? [...prev, next] : prev.map(x => x.id === editingEqId ? next : x))
                  setEditingEqId(null); setEqForm({})
                }} style={{flex:1,padding:'12px 18px',background:ACCENT,border:'none',borderRadius:8,color:BG,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:44,opacity:(!eqForm.label || !eqForm.type) ? 0.4 : 1}}>{editingEqId === '__new' ? 'Add Equipment' : 'Save'}</button>
              </div>
            </div>
          ) : (
            <button onClick={()=>{setEditingEqId('__new'); setEqForm({})}} style={{width:'100%',padding:'14px 0',background:`${ACCENT}10`,border:`1px dashed ${ACCENT}40`,borderRadius:10,color:ACCENT,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',marginBottom:14,minHeight:48}}>+ Add HVAC Equipment</button>
          )}

          {/* Continue / Skip */}
          <div style={{display:'flex',gap:10,marginTop:18}}>
            <button onClick={()=>{setView('quickstart'); setQsqi(qsVis.length-1)}} style={{flex:0,padding:'14px 22px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>← Back</button>
            <button onClick={finishEquipment} style={{flex:1,padding:'14px 22px',background:ACCENT,border:'none',borderRadius:10,color:BG,fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>{(equipment||[]).length === 0 ? 'Skip — Continue to Zones →' : 'Continue to Zones →'}</button>
          </div>
        </div>}

        {view==='zone'&&zcq&&<div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:16,marginBottom:-8}}>
            <div style={{fontSize:12,fontWeight:600,color:ACCENT,fontFamily:"var(--font-mono)"}}>Zone {curZone+1}: {zData.zn||'New Zone'}</div>
            <div style={{display:'flex',gap:8}}>
              {zones.length>1&&curZone>0&&<button onClick={()=>{setCurZone(curZone-1);setZqi(0)}} style={{fontSize:14,color:SUB,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:'8px 12px',minHeight:44}}>‹ Prev</button>}
              {curZone<zones.length-1&&<button onClick={()=>{setCurZone(curZone+1);setZqi(0)}} style={{fontSize:14,color:SUB,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:'8px 12px',minHeight:44}}>Next ›</button>}
            </div>
          </div>
          {/* Zone-equipment mapping (v2.8.0). Equipment-scoped recs
              group by these IDs at scoring time. Empty selection
              triggers the building-scoped fallback in genRecs. */}
          {zqi === 0 && (() => {
            const sel = Array.isArray(zData.servingEquipmentIds) ? zData.servingEquipmentIds : []
            return (
              <div style={{marginTop:12,padding:'12px 14px',background:`${ACCENT}06`,border:`1px solid ${ACCENT}20`,borderRadius:10}}>
                <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:8}}>Served by HVAC equipment</div>
                {(equipment||[]).length === 0 ? (
                  <div style={{fontSize:12,color:SUB,lineHeight:1.5}}>No equipment captured. Recommendations for this zone will surface as building-wide actions until equipment is identified. <button onClick={()=>setView('equipment')} style={{background:'none',border:'none',color:ACCENT,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0,textDecoration:'underline'}}>Add equipment →</button></div>
                ) : (
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {equipment.map(e => {
                      const on = sel.includes(e.id)
                      return (
                        <button key={e.id} onClick={()=>toggleZoneEquipment(curZone, e.id)} style={{padding:'6px 12px',borderRadius:6,background:on?`${ACCENT}18`:'transparent',border:`1px solid ${on?ACCENT:BORDER}`,color:on?ACCENT:SUB,fontSize:12,fontWeight:on?600:500,cursor:'pointer',fontFamily:'inherit',minHeight:32}}>
                          {on && <span style={{marginRight:4}}>✓</span>}{e.label}
                        </button>
                      )
                    })}
                    <button onClick={()=>{
                      // "Unknown" clears any selection — explicit
                      // unmapped flag. The engine treats empty
                      // servingEquipmentIds as fallback-trigger.
                      setZones(prev => { const next = [...prev]; next[curZone] = { ...(next[curZone]||{}), servingEquipmentIds: [] }; return next })
                      setEquipment(prev => prev.map(e => ({ ...e, servedZoneIds: (e.servedZoneIds||[]).filter(zid => zid !== zData.zid) })))
                    }} style={{padding:'6px 12px',borderRadius:6,background:sel.length===0?`${DIM}18`:'transparent',border:`1px solid ${sel.length===0?DIM:BORDER}`,color:sel.length===0?TEXT:SUB,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',minHeight:32}}>
                      {sel.length === 0 && <span style={{marginRight:4}}>✓</span>}Unknown
                    </button>
                  </div>
                )}
              </div>
            )
          })()}
          {renderQuestion(zcq,zData,setZF,zqi,zVis,()=>{if(zqi<zVis.length-1)setZqi(zqi+1)},()=>{if(zqi>0)setZqi(zqi-1)},()=>{setZonePrompt(true)},'Complete Zone ✓',zSecs)}
        </div>}

        {view==='details'&&dtcq&&renderQuestion(dtcq,mergedData,setQSField,dqi,dtVis,()=>{if(dqi<dtVis.length-1)setDqi(dqi+1)},()=>{if(dqi>0)setDqi(dqi-1)},finishDetails,'Done ✓',dtSecs)}

        {(view==='results'||view==='report')&&renderResults(view==='report')}

        {view==='drafts'&&<div style={{paddingTop:28,paddingBottom:100}}>
          <h2 style={{fontSize:20,fontWeight:700,marginBottom:4,color:TEXT}}>{userMode === 'fm' ? 'In Progress' : 'Drafts'}</h2>
          <div style={{fontSize:11,color:DIM,marginBottom:20}}>{userMode === 'fm' ? 'Air quality checks in progress' : 'Assessments in progress'}</div>
          {(index.drafts||[]).length===0?(
            <div style={{padding:'48px 24px',textAlign:'center',background:CARD,borderRadius:10,border:`1px solid ${BORDER}`}}>
              <I n="draft" s={28} c={DIM} w={1.4} />
              <div style={{fontSize:15,fontWeight:600,color:SUB,marginTop:16}}>No drafts in progress</div>
              <div style={{fontSize:12,color:DIM,marginTop:6,lineHeight:1.5}}>Start a new assessment to begin capturing field data.</div>
              <button onClick={startNew} style={{marginTop:16,padding:'10px 24px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>New Assessment</button>
              <div style={{marginTop:10}}><button onClick={runDemo} style={{background:'none',border:'none',color:DIM,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>or open sample project →</button></div>
            </div>
          ):(index.drafts||[]).map(d=>(
            <div key={d.id} style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6,display:'flex',alignItems:'center',gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:TEXT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.facility||'Untitled Assessment'}</div>
                <div style={{fontSize:11,color:DIM,fontFamily:"var(--font-mono)",marginTop:3}}>{fD(d.ua||d.ts)}</div>
                <div style={{fontSize:10,color:ACCENT,marginTop:3}}>In progress</div>
              </div>
              <button onClick={()=>resumeDraft(d.id)} style={{padding:'8px 16px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}25`,borderRadius:8,color:ACCENT,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:38}}>Resume</button>
              <button onClick={(e)=>{e.stopPropagation();setDelConf({id:d.id,name:d.facility,type:'dft'})}} style={{width:44,height:44,background:'#EF444410',border:`1px solid #EF444425`,borderRadius:8,color:'#EF4444',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',flexShrink:0,WebkitTapHighlightColor:'transparent'}}>
                <I n="trash" s={14} c="#EF4444" w={1.4} />
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
                <button onClick={startNew} style={{marginTop:16,padding:'10px 24px',background:ACCENT,border:'none',borderRadius:8,color:'#000',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Start Assessment</button>
                <div style={{marginTop:10}}><button onClick={runDemo} style={{background:'none',border:'none',color:DIM,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>or view sample report →</button></div>
              </>}
            </div>
          ):fReports.map(r=>(
            <div key={r.id} onClick={()=>openReport(r)} style={{width:'100%',padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',transition:'border-color 0.15s'}}>
              <div style={{width:40,height:40,borderRadius:8,background:r.score>=70?`${SUCCESS}10`:r.score>=50?`${WARN}10`:`${DANGER}10`,border:`1px solid ${r.score>=70?`${SUCCESS}20`:r.score>=50?`${WARN}20`:`${DANGER}20`}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:15,fontWeight:800,fontFamily:"var(--font-mono)",color:r.score>=70?SUCCESS:r.score>=50?WARN:DANGER}}>{r.score||'—'}</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:TEXT}}>{r.facility||'Untitled'}</div>
                <div style={{fontSize:10,color:DIM,fontFamily:"var(--font-mono)",marginTop:3}}>{fD(r.ts)} · Final</div>
              </div>
              <button onClick={e=>{e.stopPropagation();setDelConf({id:r.id,name:r.facility,type:'rpt'})}} style={{width:36,height:36,background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',flexShrink:0}}>
                <I n="trash" s={14} c={DIM} w={1.4} />
              </button>
            </div>
          ))}
        </div>}
        {view==='trash'&&<TrashView onRecover={async(id)=>{await Backup.recover(id);await refreshIndex()}} onDelete={async(id)=>{await Backup.permanentDelete(id)}} />}
        {view==='settings'&&<SettingsScreen profile={profile} credits={credits} onEditProfile={()=>{setProfile({...profile,isNew:true});setView('dash')}} onLogout={handleLogout} onClose={()=>setView('dash')} onNavigate={(v)=>{if(v==='pricing'){setShowPricing(true)}else{setView(v)}}} adminActive={!!adminSecret} onActivateAdmin={(secret)=>{setAdminSecret(secret);setView('admin')}} />}
        {view==='tos'&&<TermsOfService onBack={()=>setView('settings')} />}
        {view==='privacy'&&<PrivacyPolicy onBack={()=>setView('settings')} />}
        {view==='admin'&&adminSecret&&<AdminDashboard onBack={()=>setView('settings')} adminSecret={adminSecret} />}
        {view==='complaints'&&<ComplaintLog buildingId={bldg?.fn||'default'} onBack={()=>setView('dash')} />}
        {view==='interventions'&&<InterventionTracker buildingId={bldg?.fn||'default'} onBack={()=>setView('dash')} assessments={index.reports} />}
        {view==='directory'&&<IHDirectory onBack={()=>setView('dash')} />}
        {view==='properties'&&<PropertyDashboard onBack={()=>setView('dash')} onNavigate={(v)=>setView(v)} assessmentIndex={index} />}
        {view==='spatial'&&<SpatialMap zones={zones} zoneScores={zoneScores} floorPlan={floorPlan} onUploadFloorPlan={setFloorPlan} onUpdateZone={(zi, update)=>{const z=[...zones];z[zi]={...z[zi],...update};setZones(z)}} onClose={()=>{runScoring();setView('results')}} />}
        {view==='instruments'&&<InstrumentManager onBack={()=>setView('settings')} />}
      </div>

      {/* ── Bottom Tab Bar ── */}
      {/* iOS Safari defensives: solid background (no scroll-bleed during URL-bar transitions),
          isolation:isolate for a clean stacking context, transform:translateZ(0) to force a
          compositor layer so position:fixed cannot be reinterpreted relative to an ancestor. */}
      {!isAssessing && !milestone && (
        <nav style={{position:'fixed',bottom:0,left:0,right:0,zIndex:100,background:BG,borderTop:`1px solid ${BORDER}`,paddingBottom:'env(safe-area-inset-bottom, 0px)',isolation:'isolate',transform:'translateZ(0)',WebkitTransform:'translateZ(0)'}}>
          <div style={{display:'flex',justifyContent:'space-around',alignItems:'center',height:52,maxWidth:contentMax,margin:'0 auto'}}>
            {(userMode === 'fm' ? [
              {id:'dash',label:'Home',icon:'home'},
              {id:'properties',label:'Buildings',icon:'bldg'},
              {id:'complaints',label:'Complaints',icon:'alert'},
              {id:'settings',label:'Settings',icon:'user'},
            ] : [
              {id:'dash',label:'Home',icon:'home'},
              {id:'drafts',label:'Drafts',icon:'clip',badge:(index.drafts||[]).length||null},
              {id:'history',label:'Reports',icon:'findings',badge:(index.reports||[]).length||null},
              {id:'settings',label:'Settings',icon:'user'},
            ]).map(t=>(
              <button key={t.id} onClick={()=>{ supabase&&trackEvent('page_view',{tab:t.id}); setView(t.id); if(t.id==='dash')setViewRpt(null); }} style={{background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'6px 16px',minWidth:56,fontFamily:'inherit',position:'relative',WebkitTapHighlightColor:'transparent',transition:'opacity 0.15s'}}>
                {/* Active "lift": icon scale 1.06× + smooth transition. Color
                    change on icon and label provides the secondary signal. */}
                <div style={{position:'relative',transform:view===t.id?'scale(1.06)':'scale(1)',transition:'transform 160ms ease'}}>
                  <I n={t.icon} s={20} c={view===t.id?ACCENT:DIM} w={view===t.id?2:1.6} />
                  {t.badge>0&&<div style={{position:'absolute',top:-3,right:-7,minWidth:14,height:14,borderRadius:7,background:ACCENT,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:BG,fontFamily:"var(--font-mono)",padding:'0 3px'}}>{t.badge}</div>}
                </div>
                <span style={{fontSize:9,fontWeight:view===t.id?600:500,color:view===t.id?ACCENT:DIM,letterSpacing:'0.2px',transition:'color 160ms ease'}}>{t.label}</span>
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
