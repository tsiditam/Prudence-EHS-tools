/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MobileApp — v5-style field experience with profile login + three-tier questions
 * Flow: Profile → Dashboard → Quick Start → Zone Walkthrough → Details (optional) → Results
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../hooks/useMediaQuery'
import STO from '../utils/storage'
import Profiles from '../utils/profiles'
import Storage from '../utils/cloudStorage'
import { supabase, trackEvent } from '../utils/supabaseClient'
import Backup from '../utils/backup'
import { groupActions } from '../utils/recFormatting'
import { getCalibrationBannerState, loadInstruments, isOutOfCal } from '../utils/instrumentRegistry'
import { extractDocxText, REVIEW_INSTRUCTIONS, REVIEW_CREDIT_COST } from '../utils/reportReview'
import { SENSOR_INSIGHTS_CREDIT_COST, buildSensorInsightsPayload } from '../utils/sensorInsights'
import { getRiskBand } from '../engines/riskBands'
import { getSubscriptionBannerState, BILLING_MODE } from '../utils/subscriptionState'
import { VER, STANDARDS_MANIFEST } from '../constants/standards'
import { Q_PRESURVEY, Q_BUILDING, Q_ZONE, Q_QUICKSTART, Q_DETAILS, SENSOR_FIELDS } from '../constants/questions'
import { scoreZone, compositeScore, evalOSHA, calcVent, genRecs, evalMold, evalMeasurementConfidence } from '../engines/scoring'
import { generateSamplingPlan } from '../engines/sampling'
import { buildCausalChains } from '../engines/causalChains'
import { generateNarrative } from '../engines/narrative'
import PricingSheet from './pricing/PricingSheet'
import { I, iconForEmoji } from './Icons'
import { isOtherChoice } from '../utils/choiceOther'
import * as V3 from '../styles/tokens'
import { GLASS, RADII, RHYTHM, stack as sgStack } from '../styles/soft-glass'
import GlassCard from './ui/GlassCard'
import StatusPill from './ui/StatusPill'
import TactileButton from './ui/TactileButton'
import BottomSheet from './ui/BottomSheet'
import Loading from './Loading'
import ScoreRing from './ScoreRing'
import CountUp from './ui/CountUp'
import PhotoCapture from './PhotoCapture'
import ProfileAvatar from './ProfileAvatar'
import CollaboratorsBar from './CollaboratorsBar'
import SensorScreen from './SensorScreen'
import TimePickerInput from './TimePickerInput'
import Co2OaCalculator from './Co2OaCalculator'
import VoiceInputButton, { appendWithSpace } from './VoiceInputButton'
import InlineAiButton from './InlineAiButton'
import BleSensorButton from './BleSensorButton'
import ProfileScreen, { IAQ_OPTS, PID_OPTS, CAL_OPTS, PID_CAL_OPTS } from './ProfileScreen'
import AuthScreen from './AuthScreen'
import { TermsOfService, PrivacyPolicy } from './LegalScreens'
import AdminDashboard from './AdminDashboard'
import WelcomeScreen from './WelcomeScreen'
import SensorDataPage from './sensor/SensorDataPage'
import ProjectsScreen from './projects/ProjectsScreen'
import ProjectDetail from './projects/ProjectDetail'
import { getOrCreateProjectByName } from '../utils/projectStore'
import { KEYS } from '../utils/storageKeys'
import SettingsScreen from './SettingsScreen'
import { printReport, generatePrintHTML } from './PrintReport'
// v2.6.1 — DocxReport is a static import. Earlier `await import('./DocxReport')`
// triggered "'text/html' is not a valid JavaScript MIME type" errors when a
// user's cached index.html referenced a chunk hash that no longer existed
// after redeploy (the missing-chunk request returned the SPA HTML fallback).
// Bundling the docx renderer into the main chunk eliminates that failure
// mode for the most common user action — exporting a report.
import { generateDocx, generateConsultantOnly, generateTechnicalOnly, getConsultantDocxBlob, getNarrativeDocxBlob } from './DocxReport'
import { runConsultantPreflight } from '../utils/consultantReportPreflight'
import { DEMO_PRESURVEY, DEMO_BUILDING, DEMO_ZONES, DEMO_EQUIPMENT } from '../constants/demoData'
import { DEMO_FM_PRESURVEY, DEMO_FM_BUILDING, DEMO_FM_ZONES } from '../constants/demoDataFM'
import { DEMO_DC_PRESURVEY, DEMO_DC_BUILDING, DEMO_DC_ZONES } from '../constants/demoDataDC'
import { getMode, setMode as persistMode, isFM, t } from '../constants/terminology'
import { evaluateEscalation, hasActiveEscalation } from '../engines/escalation'
import { getBuildingProfile } from '../engines/buildingProfiles'
import ModeSelector from './ModeSelector'
import IncidentForm from './IncidentForm'
import IncidentLog from './IncidentLog'
import IncidentDetail from './IncidentDetail'
import PropertyDashboard from './PropertyDashboard'
import SpatialMap from './SpatialMap'
import V21InternalPanel from './V21InternalPanel'
import { FAQ_SECTIONS } from '../constants/faq'
import SearchView from './SearchView'
import FieldAssistant from './FieldAssistant'
import VoiceCommandModal from './VoiceCommandModal'
import JasperRobotIcon from './JasperRobotIcon'
import PendingSyncIndicator from './PendingSyncIndicator'
import OfflineBanner from './OfflineBanner'
import JasperWatchPanel from './JasperWatchPanel'
import ReadinessPanel from './ReadinessPanel'
import { buildReadinessVerdict } from '../engines/readiness-verdict'
import SamplingFormsView from './SamplingFormsView'
import { useAssessment } from '../contexts/AssessmentContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useStorage } from '../contexts/StorageContext.jsx'
import { useTheme, mix } from '../utils/theme'

const haptic = (type) => { try { if (navigator.vibrate) navigator.vibrate(type === 'heavy' ? [30,20,30] : type === 'success' ? [10,30,10,30,10] : 12) } catch {} }

// Press-feedback handlers for native <button>s that aren't going
// through the TactileButton primitive (e.g. the bottom nav, the
// workflow stage tabs, the result tab row). Returns the four pointer
// handlers + the style fragment needed to animate the press. iOS
// Safari does not support navigator.vibrate at all (Apple has never
// exposed the Taptic Engine to web JS) so the scale + opacity dip
// IS the "haptic" on iOS - it's what makes the tap feel physical
// even without a real buzz. On Android the dip + vibrate stack.
//
// Usage:
//   <button {...pressFeedback()} onClick={...} style={{ ...pressFeedback.style, ...rest }}>
//
// pressFeedback() can be called with `intensity` ('soft' for the
// thinner nav-tab buttons, 'medium' for chip-sized tabs).
const pressFeedback = (intensity = 'medium') => {
  const scale = intensity === 'soft' ? 0.92 : 0.95
  const dim = intensity === 'soft' ? '0.78' : '0.85'
  return {
    onPointerDown: (e) => { e.currentTarget.style.transform = `scale(${scale})`; e.currentTarget.style.opacity = dim },
    onPointerUp:   (e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1' },
    onPointerLeave:(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1' },
    onPointerCancel:(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1' },
  }
}
// Companion style fragment - tap-highlight reset + spring transition.
// Spread INTO the button's `style={{...}}` so it composes with the
// existing tab styling.
pressFeedback.style = {
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
  transition: 'transform 120ms cubic-bezier(0.34,1.4,0.64,1), opacity 120ms ease-out',
}
const BETA_MODE = true // Set to false when ready to go live — re-enables all premium gates
const isEnterprise = (profile) => BETA_MODE || profile?.plan === 'team' || profile?.plan === 'enterprise' || !!localStorage.getItem(KEYS.premiumOverride)
const isPremiumOpt = (q, opt) => q.premiumOpts && q.premiumOpts.includes(opt)
const fD = ts => ts ? new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''
const sv = sev => ({critical:{c:'#EF4444',bg:'#EF444418',l:'CRITICAL'},high:{c:'#FB923C',bg:'#FB923C18',l:'HIGH'},medium:{c:'#FBBF24',bg:'#FBBF2418',l:'MEDIUM'},low:{c:'#38BDF8',bg:'#38BDF815',l:'LOW'},pass:{c:'#22C55E',bg:'#22C55E15',l:'PASS'},info:{c:'#94A3B8',bg:'#94A3B815',l:'INFO'}}[sev]||{c:'#94A3B8',bg:'#94A3B815',l:''})
const badge = (risk,rc) => <span style={{padding:'6px 16px',background:`${rc}18`,border:`1px solid ${rc}35`,borderRadius:20,fontSize:13,fontWeight:700,color:rc}}>{risk}</span>

// Top-of-funnel CTAs (New Assessment / Continue Assessment) use the
// shared V3.btnPrimary surface — accent-fill cyan, accent-on-fill
// text — so the primary accent stays single-channel across the app.
// Semantic colors (red/amber/green) are reserved for severity,
// confidence, and other meaning-bearing chrome.
const PRIMARY_CTA_ICON = 'var(--on-accent-fill)'

// ─── Design Tokens ───
// CSS-variable references defined in index.html. Default is the dark
// palette; [data-theme="light"] on <html> overrides to light. Toggle
// via src/utils/theme.js — set in Settings → Theme or the header kebab.
const BG = 'var(--bg)'
const SURFACE = 'var(--surface)'
const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const ACCENT_DIM = 'var(--accent-dim)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const SUCCESS = 'var(--success)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'

// Canonical results-card section label (Pathways / Sampling): an
// uppercase group header sitting above each label/value pair. A touch
// larger and more tracked than inline micro-copy so the card's content
// groups read as distinct sections and the card gets a clear vertical
// rhythm.
const CARD_LABEL = { fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600, marginBottom: 5 }

// Confidence tones for the results cards. High = green (confident),
// Moderate = amber, Possible = a cool slate-blue — deliberately lower-
// energy but still chromatic, so the lowest tier reads as an intentional
// confidence state rather than disabled gray body text.
const confColor = (conf) => conf === 'Strong' ? '#22C55E'
  : conf === 'Moderate' ? '#FBBF24'
  : '#8AA4CC'
const ON_ACCENT = 'var(--on-accent)'

// Map a saved profile instrument's coarse calStatus → the assessment's
// calibration-status option. Best-guess only — the assessor confirms it
// on the instrument step before finalizing (the field stays editable).
// Factory/field calibrations downgrade to "overdue for recertification"
// once the last-cal date is past the validity window, and to "Unknown"
// when no cal date is on file — we never assert current calibration we
// can't date-support.
function mapInstrumentCalStatus(inst) {
  const s = inst?.calStatus
  if (s === 'bump') return 'Field-zeroed only'
  if (s === 'factory' || s === 'field') {
    if (!inst.lastCalDate) return 'Unknown'
    return isOutOfCal(inst) ? 'Calibrated — overdue for recertification' : 'Calibrated within manufacturer spec'
  }
  return 'Unknown'
}

// `mix(name, pct)` for legacy `${TOKEN}HEX_ALPHA` sites is imported
// from utils/theme above. CSS-var references with hex-suffix alpha
// would produce invalid CSS, so those sites are rewritten to
// color-mix(in srgb, var(--…) X%, transparent).

// In-app FAQ — same FAQ_SECTIONS data as the public landing page so the
// public answer and the in-app answer cannot drift apart. One question
// open at a time across the entire list.
function HelpView({ onBack }) {
  const [openId, setOpenId] = useState(null)
  return (
    <div style={{paddingTop:24,paddingBottom:120}}>
      <button onClick={onBack} style={{background:'none',border:'none',color:ACCENT,fontSize:15,fontWeight:500,cursor:'pointer',padding:'0 4px',marginBottom:16,fontFamily:'inherit'}}>← Settings</button>
      <h2 style={{fontSize:22,fontWeight:700,marginBottom:6,color:TEXT,letterSpacing:'-0.3px',fontFamily:'inherit'}}>Help &amp; FAQ</h2>
      <div style={{fontSize:12,color:DIM,marginBottom:20,lineHeight:1.55}}>Common questions about AtmosFlow methodology, scoring, workflow, and limitations.</div>
      {FAQ_SECTIONS.map(section => (
        <div key={section.title} style={{marginTop:24}}>
          <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',padding:'0 4px 8px'}}>{section.title}</div>
          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
            {section.items.map((item, i) => {
              const id = section.title + ':' + i
              const open = openId === id
              return (
                <div key={id} style={{borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`}}>
                  <button
                    onClick={() => setOpenId(open ? null : id)}
                    aria-expanded={open}
                    style={{
                      width:'100%',padding:'14px 16px',background:'transparent',border:'none',cursor:'pointer',
                      textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',
                      color:TEXT,fontSize:14,fontWeight:600,lineHeight:1.45,minHeight:52,
                    }}>
                    <span style={{flex:1,minWidth:0}}>{item.q}</span>
                    <span style={{
                      flexShrink:0,fontSize:18,color:DIM,lineHeight:1,
                      transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                      transition: 'transform 200ms ease',
                    }}>+</span>
                  </button>
                  {open && (
                    <div style={{padding:'0 16px 16px',fontSize:13,color:SUB,lineHeight:1.7,whiteSpace:'pre-line'}}>{item.a}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{marginTop:28,padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,fontSize:12,color:SUB,lineHeight:1.7,textAlign:'center'}}>
        More questions? <a href="mailto:support@prudenceehs.com" style={{color:ACCENT,textDecoration:'none'}}>support@prudenceehs.com</a>
      </div>
    </div>
  )
}

// Standalone instrument editor — edits ONLY the profile-embedded primary
// IAQ + PID fields (iaq_meter, iaq_serial, iaq_cal_date, iaq_cal_status,
// pid_meter, pid_cal_status, other_instruments). Reachable from each
// instrument row in Settings so the user no longer has to walk through
// the multi-profile picker + Credentials step just to update a serial
// number or a calibration date. Mirrors ProfileScreen Step 1 visually
// but skips every other affordance.
function InstrumentEditView({ profile, onSave, onCancel }) {
  const [form, setForm] = useState(profile || {})
  const [saving, setSaving] = useState(false)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const inp = { width:'100%',padding:'14px 16px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:15,fontFamily:'inherit',fontWeight:500,outline:'none',boxSizing:'border-box',transition:'border-color 0.15s' }
  const lbl = { fontSize:13,fontWeight:600,color:SUB,marginBottom:6,display:'block',letterSpacing:'0.1px' }

  const Radio = ({ selected, label, onClick }) => (
    <button onClick={onClick} style={{width:'100%',padding:'10px 14px',textAlign:'left',background:selected?`${mix('accent', 3)}`:'transparent',border:`1px solid ${selected?`${mix('accent', 19)}`:BORDER}`,borderRadius:8,color:selected?TEXT:SUB,fontSize:13,fontWeight:selected?600:500,cursor:'pointer',fontFamily:'inherit',minHeight:38,transition:'all 0.15s',marginBottom:4}}>{label}</button>
  )

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await Profiles.save({
        ...profile,
        iaq_meter: form.iaq_meter || '',
        iaq_serial: form.iaq_serial || '',
        iaq_cal_date: form.iaq_cal_date || '',
        iaq_cal_status: form.iaq_cal_status || '',
        pid_meter: form.pid_meter || '',
        pid_cal_status: form.pid_cal_status || '',
        other_instruments: form.other_instruments || '',
      })
      // Calibration changes drive the finalization gate — track them so
      // we have a paper trail consistent with ProfileScreen's behavior.
      if (form.iaq_cal_date !== profile?.iaq_cal_date || form.iaq_cal_status !== profile?.iaq_cal_status) {
        trackEvent('calibration_date_entered', { instrument: 'iaq', meter: form.iaq_meter || '', status: form.iaq_cal_status || '' })
      }
      if (form.pid_cal_status !== profile?.pid_cal_status) {
        trackEvent('calibration_date_entered', { instrument: 'pid', meter: form.pid_meter || '', status: form.pid_cal_status || '' })
      }
      const updated = await Profiles.get(profile.id)
      onSave(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{paddingTop:24,paddingBottom:120}}>
      <button onClick={onCancel} style={{background:'none',border:'none',color:ACCENT,fontSize:15,fontWeight:500,cursor:'pointer',padding:'0 4px',marginBottom:16,fontFamily:'inherit'}}>← Settings</button>
      <h2 style={{fontSize:22,fontWeight:700,marginBottom:6,color:TEXT,letterSpacing:'-0.3px',fontFamily:'inherit'}}>Instruments</h2>
      <div style={{fontSize:12,color:DIM,marginBottom:24,lineHeight:1.55}}>Primary IAQ meter, PID, and calibration records used in your reports.</div>

      <div style={{marginBottom:20}}>
        <span style={lbl}>Primary IAQ meter</span>
        <select value={form.iaq_meter||''} onChange={e=>setF('iaq_meter',e.target.value)} style={{...inp,appearance:'auto'}}>
          <option value="">Select or skip</option>
          {IAQ_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {form.iaq_meter && (
        <div style={{padding:'16px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>{form.iaq_meter}</div>
          <div style={{marginBottom:14}}>
            <span style={lbl}>Serial number <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></span>
            <input type="text" value={form.iaq_serial||''} onChange={e=>setF('iaq_serial',e.target.value)} placeholder="S/N" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
          </div>
          <div style={{marginBottom:14}}>
            <span style={lbl}>Last calibration</span>
            <input type="date" value={form.iaq_cal_date||''} onChange={e=>setF('iaq_cal_date',e.target.value)} style={{...inp,colorScheme:'dark'}} />
          </div>
          <div>
            <span style={lbl}>Calibration status</span>
            {CAL_OPTS.map(o => <Radio key={o} selected={form.iaq_cal_status===o} label={o} onClick={()=>setF('iaq_cal_status',o)} />)}
          </div>
        </div>
      )}

      <div style={{marginBottom:20}}>
        <span style={lbl}>PID / VOC meter <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></span>
        <select value={form.pid_meter||''} onChange={e=>setF('pid_meter',e.target.value)} style={{...inp,appearance:'auto'}}>
          <option value="">None</option>
          {PID_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {form.pid_meter && (
        <div style={{padding:'16px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>{form.pid_meter}</div>
          <span style={lbl}>Calibration status</span>
          {PID_CAL_OPTS.map(o => <Radio key={o} selected={form.pid_cal_status===o} label={o} onClick={()=>setF('pid_cal_status',o)} />)}
        </div>
      )}

      <div style={{marginBottom:24}}>
        <span style={lbl}>Additional instruments <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></span>
        <textarea value={form.other_instruments||''} onChange={e=>setF('other_instruments',e.target.value)} placeholder="Moisture meter, thermal camera, smoke pencil..." rows={2} style={{...inp,resize:'vertical',fontFamily:'inherit'}} />
      </div>

      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} disabled={saving} style={{flex:0,padding:'14px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Cancel</button>
        <button onClick={handleSave} disabled={saving || !profile?.id} style={{flex:1,padding:'14px 0',background:ACCENT,border:'none',borderRadius:8,color:ON_ACCENT,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:48,letterSpacing:'-0.1px',opacity:saving?0.6:1}}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

export default function MobileApp() {
  const { isTablet, isTabletLand } = useMediaQuery()
  // Responsive layout: phone=620, tablet portrait=860, tablet landscape=1080
  const contentMax = isTabletLand ? 1080 : isTablet ? 860 : 620
  const padX = isTablet ? 28 : 20

  // Theme quick-toggle for the kebab menu. Default is dark; this lets
  // users flip light/dark in one tap without opening Settings.
  const { mode: themeMode, toggle: toggleThemeMode } = useTheme()

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
  // Paywall pause — set to false to re-enable the (legacy) credits
  // gate. When true: startNew + requestNarrative skip the credits
  // check, and consumeCredit no-ops so we don't spam analytics or hit
  // /api/credits 402s. The pricing modal is no longer reachable from
  // the credits chip — the chip itself was removed in
  // billing-architecture Phase 1.
  //
  // TODO(billing-architecture): replace with the BILLING_MODE flag
  // exported from src/utils/subscriptionState.js. Phase 2 deletes
  // this constant, the consumeCredit machinery, and the credit-
  // balance pre-checks below in favor of subscription-tier
  // entitlements written by Stripe webhooks. Until then, leaving
  // PAYWALL_DISABLED=true keeps the existing call sites safely
  // dormant.
  const PAYWALL_DISABLED = true
  // views: dash|quickstart|zone|details|results|history|drafts|report
  const [view, setView] = useState('dash')
  const [activeProjectId, setActiveProjectId] = useState(null)
  // Where the project workspace returns to — 'projects' (IH list) or
  // 'properties' (FM Buildings portfolio), set when navigating in.
  const [projectBackView, setProjectBackView] = useState('projects')
  const [milestone, setMilestone] = useState(null)
  const [clock, setClock] = useState(new Date())
  const [showPricing, setShowPricing] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [connectionToast, setConnectionToast] = useState(null)

  // Connection toast + offline-queue auto-drain triggers.
  //
  // Three triggers drain the queue when online:
  //   1. window 'online' event — fires once on transition (already
  //      hooked in supabaseStorage.js too; this is belt-and-suspenders).
  //   2. visibilitychange — when the tab becomes visible again, the
  //      user may have been away for a while; try a drain.
  //   3. periodic interval (60s) — covers cases where neither of the
  //      above fires (e.g. flaky cellular that doesn't trigger the
  //      online event, user staring at the same tab for hours).
  //
  // Each trigger is a no-op when the queue is empty or when a drain
  // is already in flight (single-flight guard in processSyncQueue).
  useEffect(() => {
    const goOffline = () => { setConnectionToast('offline'); setTimeout(() => setConnectionToast(null), 4000) }
    const goOnline = () => {
      setConnectionToast('online')
      setTimeout(() => setConnectionToast(null), 3000)
      Storage.processSyncQueue()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) Storage.processSyncQueue()
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    document.addEventListener('visibilitychange', onVisible)
    const drainId = setInterval(() => {
      if (navigator.onLine) Storage.processSyncQueue()
    }, 60000)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(drainId)
    }
  }, [])

  const [showPhotoSelect, setShowPhotoSelect] = useState(false)
  const [showPremiumGate, setShowPremiumGate] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState({})
  const [exportFormat, setExportFormat] = useState(null)
  const [rTab, setRTab] = useState('overview')
  const [selZone, setSelZone] = useState(0)

  const [viewRpt, setViewRpt] = useState(null)
  const [currentIncident, setCurrentIncident] = useState(null)
  const [delConf, setDelConf] = useState(null)
  const [zonePrompt, setZonePrompt] = useState(false)
  const [calWarning, setCalWarning] = useState(null)
  // Saved profile instruments + the picker that lets the assessor pull
  // make/serial/cal into the assessment instead of retyping them.
  const [instPickerOpen, setInstPickerOpen] = useState(false)
  const [savedInstruments, setSavedInstruments] = useState([])
  // Refresh on mount and whenever the view changes or the advisory opens,
  // so instruments added in Settings mid-session show up at the entry
  // points (localStorage read is cheap).
  useEffect(() => { setSavedInstruments(loadInstruments()) }, [view, calWarning])
  const [docxPicker, setDocxPicker] = useState(false)
  // Consultant preflight: when the v2.1 engine would refuse to issue
  // (no measurements, calibration missing, etc.), we surface the
  // triggers + an IH override flow instead of silently downgrading to
  // a memo file. Shape: { triggers, score, reportData } | null.
  const [preflight, setPreflight] = useState(null)
  const [overrideJustification, setOverrideJustification] = useState('')
  const [overrideChecked, setOverrideChecked] = useState({})
  const [hSearch, setHSearch] = useState('')
  const [hSort, setHSort] = useState('newest')
  // v2.8 UI pass — Notion-style 3-dot home menu. Replaces the standalone
  // gear icon in the Home header; Settings is now one entry inside the
  // dropdown.
  const [showHomeMenu, setShowHomeMenu] = useState(false)
  // Ref + cached rect for the hamburger menu's anchoring. When the menu
  // opens, we cache the button's bounding rect so the portal'd menu can
  // position itself with `position: fixed`. Portaling is required
  // because the header has `backdrop-filter: blur(24px)` which creates
  // a containing block for fixed-positioned descendants — any backdrop
  // rendered as a descendant of the header is clipped to the header's
  // bounds, so taps below the header strip never reach it. Portaling
  // to document.body escapes that containing block.
  const menuButtonRef = useRef(null)
  const [menuAnchor, setMenuAnchor] = useState(null)
  // Home menu sub-mode. 'main' shows the canonical menu items; 'demos'
  // shows the demo picker (Office Building / Data Center / FM Sample
  // Check). Consolidates what was three separate flat menu entries
  // into one "Demos" entry with a sub-list, reducing menu height and
  // making the "load fake data to explore the app" affordance more
  // discoverable as a category. Reset to 'main' whenever the menu
  // closes so reopening always lands at the top level.
  const [homeMenuMode, setHomeMenuMode] = useState('main')
  // Field-assistant bottom sheet. Backend: api/field-assistant.ts.
  // UI is hidden whenever there's no profile (auth screen), during a
  // milestone overlay, or while another full-screen modal is up.
  const [faOpen, setFaOpen] = useState(false)
  // Voice-command modal state. When the user submits a transcribed
  // question, we drop the transcript into `voicePrefill` and open
  // the Jasper sheet; FieldAssistant's initialMessage prop picks it
  // up and auto-sends.
  const [voiceCmdOpen, setVoiceCmdOpen] = useState(false)
  const [voicePrefill, setVoicePrefill] = useState(null)
  // AtmosFlow AI "Review for discrepancies" — chooser + the payload/prompt
  // handed to the assistant. reviewPayload rides the request context;
  // reviewPrefill is the visible directive the sheet auto-sends on open.
  const [reviewChooserOpen, setReviewChooserOpen] = useState(false)
  const [reviewPayload, setReviewPayload] = useState(null)
  // Sensor Data / Environmental Evidence Graphs — parsed logger series +
  // per-graph report selections, persisted with the assessment draft.
  const [sensorData, setSensorData] = useState(null)
  const [reviewPrefill, setReviewPrefill] = useState(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState(null)
  // Sensor-insights AI run (analyzer → AtmosFlow AI). sensorInsightsPayload
  // rides the request context (summary only); sensorInsightsPrefill is the
  // short message the sheet auto-sends on open. Mirrors the review pair.
  const [sensorInsightsPayload, setSensorInsightsPayload] = useState(null)
  const [sensorInsightsPrefill, setSensorInsightsPrefill] = useState(null)
  const reviewDocxInputRef = useRef(null)
  // Billing Phase 1 — credit-unit definition sheet was added in PR
  // #143 (Fix 2 of the CIH-credibility prompt) and removed by the
  // subsequent pricing-architecture decision (delete the credit
  // model entirely; replace with subscription tiers + Single
  // Assessment License). The state declaration is intentionally kept
  // *gone* — there's no in-product surface that opens this sheet.
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
      const draft = { id:draftId, presurvey, bldg, zones, equipment, photos, floorPlan, sensorData, qsqi, dqi, curZone, zqi, ua:new Date().toISOString(), standardsManifest:STANDARDS_MANIFEST }
      await STO.set(draftId, draft)
      await STO.addDraftToIndex({ id:draftId, facility:bldg.fn||'Untitled', ua:draft.ua })
      await refreshIndex()
      trackEvent('draft_saved', { draft_id: draftId, phase: view, zones: (zones||[]).length })
    }, 1200)
    return () => { if (saveRef.current) clearTimeout(saveRef.current) }
  }, [presurvey, bldg, zones, equipment, photos, sensorData, qsqi, dqi, curZone, zqi, view, draftId])

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

  // Populate the assessment's instrument fields from a saved profile
  // instrument. Calibration status is a best-guess mapping the assessor
  // confirms (left editable) on the instrument step.
  const applyInstrument = useCallback((inst) => {
    if (!inst) return
    setQSField('ps_inst_iaq', inst.make || inst.nickname || '')
    setQSField('ps_inst_iaq_serial', inst.serial || '')
    setQSField('ps_inst_iaq_cal', inst.lastCalDate || '')
    setQSField('ps_inst_iaq_cal_status', mapInstrumentCalStatus(inst))
  }, [setQSField])


  const qsVis = useMemo(() => Q_QUICKSTART.filter(q => { if (!q.cond) return true; if (q.cond.eq && mergedData[q.cond.f] !== q.cond.eq) return false; if (q.cond.ne && mergedData[q.cond.f] === q.cond.ne) return false; return true }), [mergedData])
  const dtVis = useMemo(() => Q_DETAILS.filter(q => { if (!q.cond) return true; if (q.cond.eq && mergedData[q.cond.f] !== q.cond.eq) return false; if (q.cond.ne && mergedData[q.cond.f] === q.cond.ne) return false; return true }), [mergedData])

  // Pick a saved instrument from either entry point (advisory modal or
  // the instrument step), then route to the instrument step so the
  // prefilled — and editable — fields can be reviewed before finalizing.
  const pickInstrument = useCallback((inst) => {
    applyInstrument(inst)
    setInstPickerOpen(false)
    setDqi(Math.max(0, dtVis.findIndex(q => q.id === 'ps_inst_iaq')))
    setView('details')
  }, [applyInstrument, dtVis, setDqi, setView])
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

  // Hand the assistant a discrepancy-scan directive. The bulk report
  // content rides the request context (report_review), so the visible
  // chat message stays a short prompt. Charges credits up front, gated
  // on balance like the other paid actions.
  const launchReview = (kind, content) => {
    if (!content || !content.trim()) { setReviewError('Nothing to review — no report content was found.'); return }
    if (!PAYWALL_DISABLED && credits < REVIEW_CREDIT_COST) { setReviewChooserOpen(false); setShowPricing(true); return }
    consumeCredit(REVIEW_CREDIT_COST, 'discrepancy_scan', viewRpt?.id || draftId || '')
    setReviewPayload({ kind, content, instructions: REVIEW_INSTRUCTIONS })
    setReviewPrefill('Review this report for discrepancies — compare the narrative against the underlying data and flag any inconsistencies, missing defensibility items, or unfilled placeholders.')
    setReviewChooserOpen(false)
    setReviewError(null)
    setFaOpen(true)
    trackEvent('report_review_started', { kind })
  }

  // Analyzer → AtmosFlow AI: hand the parsed sensor SUMMARY (never the raw
  // series) to the assistant for a screening-level read. Mirrors
  // launchReview's credit-gate + open-the-sheet flow.
  const launchSensorInsights = () => {
    const payload = buildSensorInsightsPayload(sensorData)
    if (!payload) return
    if (!PAYWALL_DISABLED && credits < SENSOR_INSIGHTS_CREDIT_COST) { setShowPricing(true); return }
    consumeCredit(SENSOR_INSIGHTS_CREDIT_COST, 'sensor_insights', draftId || viewRpt?.id || '')
    setSensorInsightsPayload(payload)
    setSensorInsightsPrefill('Give me a screening-level read of this sensor log — central values, ranges, data-quality caveats, and what to investigate next.')
    setFaOpen(true)
    trackEvent('sensor_insights_started', { params: (sensorData?.params || []).length })
  }

  // Source 1 — the current in-app assessment. Send the structured data
  // (not the rendered doc) so the assistant can cross-check the narrative
  // against the underlying scores/zones/recommendations. Photos are
  // excluded (binary + large); the deterministic readiness gate already
  // covers photo presence.
  const reviewCurrentReport = () => {
    let content = ''
    try {
      content = JSON.stringify({
        facility: bldg?.fn || null,
        building: bldg, presurvey,
        composite: comp, zoneScores, zones,
        recommendations: recs, causalChains, samplingPlan,
        narrative: narrative || null,
        osha: oshaResult || null,
        userMode,
      })
    } catch { content = '' }
    launchReview('current', content)
  }

  // Source 2 — an uploaded .docx (external or older report). Extract the
  // text client-side via jszip; the assistant scans the rendered text.
  const onPickReviewDocx = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setReviewError(null)
    setReviewBusy(true)
    try {
      const text = await extractDocxText(file)
      setReviewBusy(false)
      if (!text || text.length < 20) { setReviewError('Could not read text from that file — make sure it is a .docx report.'); return }
      launchReview('docx', `Uploaded document: ${file.name}\n\n${text}`)
    } catch (err) {
      setReviewBusy(false)
      setReviewError((err && err.message) || 'Could not read that .docx file.')
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
    setPresurvey(psFill); setBldg({}); setQsqi(0); setDqi(0); setSensorData(null)
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
    setDraftId(d.id); setPresurvey(d.presurvey||{}); setBldg(d.bldg||d.building||{}); setZones(d.zones||[{}]); setEquipment(d.equipment||[]); setPhotos(d.photos||{}); setFloorPlan(d.floorPlan||null); setSensorData(d.sensorData||null)
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
    const reportData = { building: bldg, presurvey, zones, equipment, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos: filteredPhotos, version: VER, standardsManifest: viewRpt?.standardsManifest || STANDARDS_MANIFEST, userMode, escalationTriggers: esc, floorPlan, sensorData, labResults: viewRpt?.labResults || null }
    trackEvent('report_exported', { format: docxType || format, facility: bldg.fn || '', score: comp?.tot, zones: zones.length, has_narrative: !!narrative, photos: Object.values(filteredPhotos).flat().length })

    // Consultant preflight: the v2.1 engine returns a Pre-Assessment
    // Site Visit Memo (not a full consultant report) when its refusal
    // triggers fire. Catch this BEFORE generation so we can show the
    // IH which gaps the engine flagged and offer an override path.
    // Technical / Both DOCX and PDF do not go through the v2.1 engine
    // — they render directly from the legacy zoneScores — so they
    // skip the preflight.
    if (format === 'docx' && docxType === 'consultant') {
      try {
        const pf = runConsultantPreflight(reportData)
        if (pf.wouldRefuse) {
          setPreflight({ ...pf, reportData })
          setOverrideJustification('')
          setOverrideChecked({})
          return
        }
      } catch (pfErr) {
        // Preflight failure must not block export. Log + proceed; the
        // engine will produce its memo if refusal still applies, which
        // is the prior behavior.
        console.warn('Consultant preflight failed; proceeding without preflight modal:', pfErr)
      }
    }

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

  // Run the consultant DOCX with the IH override applied. Called from
  // the preflight modal's "Generate with IH override" action. The
  // override payload becomes part of the deliverable's cover notice
  // and per-page watermark, so the audit trail is in the report
  // itself — no separate audit-log entry required.
  const executeConsultantWithOverride = async () => {
    if (!preflight) return
    const triggers = Object.keys(overrideChecked).filter(k => overrideChecked[k])
    const ihOverride = {
      triggers,
      justification: overrideJustification.trim(),
      overriddenAt: new Date().toISOString(),
    }
    const reportData = { ...preflight.reportData, ihOverride }
    trackEvent('consultant_override_applied', {
      facility: bldg.fn || '',
      triggers: triggers.join(','),
      justification_length: ihOverride.justification.length,
    })
    setPreflight(null)
    setOverrideJustification('')
    setOverrideChecked({})
    try {
      await generateConsultantOnly(reportData)
    } catch (e) {
      console.error('Consultant override export failed:', e)
      alert('Report export failed under override: ' + ((e && e.message) || 'Unknown error') + '.')
    }
  }

  /**
   * Share the consultant DOCX via the Web Share API. The previous
   * implementation shared an inline HTML print preview, which broke
   * when the recipient opened it in any app that expected a Word
   * document (mail clients, Slack, iOS Files). The DOCX is the file
   * the assessor would attach to an email anyway — share that.
   *
   * Fallback ladder:
   *   1. navigator.share with the DOCX as a File (iOS Safari, Android Chrome)
   *   2. navigator.share with text-only summary (older browsers)
   *   3. Direct download as a last resort (desktop)
   */
  const handleShare = async () => {
    const title = `IAQ Assessment Report — ${bldg.fn || 'Assessment'}`
    const filteredPhotos = (() => {
      const sel = selectedPhotos && Object.values(selectedPhotos).some(Boolean) ? selectedPhotos : null
      if (!sel) return photos
      const out = {}
      Object.keys(photos || {}).forEach(k => {
        out[k] = (photos[k] || []).filter((_, i) => sel[`${k}::${i}`])
      })
      return out
    })()
    const reportData = { building: bldg, presurvey, zones, equipment, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos: filteredPhotos, version: VER, standardsManifest: viewRpt?.standardsManifest || STANDARDS_MANIFEST, userMode, floorPlan, sensorData, labResults: viewRpt?.labResults || null, ts: viewRpt?.ts }
    let blob, fileName
    try {
      const built = await getConsultantDocxBlob(reportData)
      blob = built.blob
      fileName = built.fileName
    } catch (e) {
      console.error('Share DOCX build failed:', e)
      alert('Could not prepare report for sharing: ' + ((e && e.message) || 'Unknown error'))
      return
    }
    trackEvent('report_shared', { facility: bldg.fn || '', score: comp?.tot, format: 'docx' })
    const file = new File([blob], fileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ title, files: [file] }) } catch { /* user cancelled */ }
    } else if (navigator.share) {
      const text = `${bldg.fn || 'Facility'} — IAQ screening assessment\n${zoneScores?.length || 0} zone${(zoneScores?.length || 0) === 1 ? '' : 's'} assessed`
      try { await navigator.share({ title, text }) } catch { /* user cancelled */ }
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
  }

  /**
   * Share the AI-generated findings narrative as a lightweight DOCX.
   * Distinct from the full consultant DOCX path — this builds a
   * minimal Word doc with just the narrative text + the "review
   * required" advisory, so the reviewing IH can hand it off as a
   * draft for editing rather than as the finalized deliverable.
   */
  const handleShareNarrative = async () => {
    if (!narrative) return
    let blob, fileName
    try {
      const built = await getNarrativeDocxBlob({ facility: bldg, narrative, profile, ts: viewRpt?.ts })
      blob = built.blob
      fileName = built.fileName
    } catch (e) {
      console.error('Share narrative DOCX build failed:', e)
      alert('Could not prepare narrative for sharing: ' + ((e && e.message) || 'Unknown error'))
      return
    }
    trackEvent('narrative_shared', { facility: bldg.fn || '', word_count: String(narrative).split(/\s+/).length })
    const file = new File([blob], fileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const title = `IAQ Findings Narrative — ${bldg.fn || 'Assessment'}`
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ title, files: [file] }) } catch { /* user cancelled */ }
    } else if (navigator.share) {
      try { await navigator.share({ title, text: String(narrative).slice(0, 280) }) } catch { /* user cancelled */ }
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
  }

  // Bridge the FM Buildings portfolio to the project workspace: tapping a
  // building opens its Project (created on first open, matched by name), so
  // the two building-organization surfaces are layered (portfolio → site
  // workspace) rather than parallel and disconnected.
  const openBuildingProject = async (buildingId) => {
    let buildings = []
    try { buildings = JSON.parse(localStorage.getItem(KEYS.buildings) || '[]') } catch { buildings = [] }
    const b = buildings.find(x => x && x.id === buildingId)
    if (!b) return
    const proj = await getOrCreateProjectByName(b.name, { address: b.address || '', status: 'active' })
    setProjectBackView('properties')
    setActiveProjectId(proj.id)
    setView('project-detail')
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
  const hasModeSet = localStorage.getItem(KEYS.userMode)
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
  const renderQuestion = (q, data, setField, qIdx, visQs, goNext, goPrev, onFinish, finishLabel, secs, extraTop) => {
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
          {secs.map((s,i)=><span key={s} style={{padding:'8px 16px',borderRadius:20,fontSize:12,fontWeight:600,fontFamily:"var(--font-mono)",minHeight:36,display:'inline-flex',alignItems:'center',background:i===secIdx?`${mix('accent', 8)}`:'transparent',color:i===secIdx?ACCENT:i<secIdx?SUB:DIM,border:`1px solid ${i===secIdx?mix('accent', 19):'transparent'}`}}>{s}</span>)}
        </div>
        <div key={q.id+'-'+curZone} style={{animation:'fadeUp .4s cubic-bezier(.22,1,.36,1)'}}>
          <div style={{width:48,height:48,borderRadius:12,background:`${mix('accent', 3)}`,border:`1px solid ${mix('accent', 8)}`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>{iconForEmoji(q.ic) ? <I n={iconForEmoji(q.ic)} s={22} c={ACCENT} w={1.6} /> : <span style={{fontSize:22}}>{q.ic}</span>}</div>
          <h2 style={{fontSize:26,fontWeight:700,lineHeight:1.3,margin:0,marginBottom:10,letterSpacing:'-0.3px',color:TEXT}}>{q.q}</h2>
          {q.ref&&<div style={{display:'inline-flex',gap:7,padding:'8px 14px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:20,marginTop:6}}><span style={{fontSize:13,color:SUB,fontFamily:"var(--font-mono)",lineHeight:1.4}}>{q.ref}</span></div>}
          {!q.ref&&<div style={{height:16}} />}

          {extraTop}

          {q.t==='text'&&<input type="text" autoComplete={q.ac||'off'} value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Type...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&data[q.id])goNext()}} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:'inherit',fontWeight:500,outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}
          {q.t==='num'&&(() => {
            // Map wizard field id → canonical BLE metric. Only the
            // CO2 fields wire to BLE in this PR; adding RH / temp /
            // pressure is a one-liner per field once their drivers
            // are tested on hardware.
            // Map a question's field id to the canonical BLE driver
            // metric so the inline sensor button can stream values
            // straight into the field. Aranet4 emits CO₂, temperature,
            // humidity, and pressure — wire every supported field.
            const BLE_METRIC_BY_FIELD = {
              co2: 'co2_ppm', co2o: 'co2_ppm',
              tf: 'temperature_f', tfo: 'temperature_f',
              rh: 'humidity_rh', rho: 'humidity_rh',
            }
            const bleMetric = BLE_METRIC_BY_FIELD[q.id] || null
            return (
              <div>
                <div style={{display:'flex',alignItems:'stretch',gap:8}}>
                  <div style={{position:'relative',flex:1,minWidth:0}}>
                    <input type="number" inputMode="decimal" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Enter...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&data[q.id])goNext()}} style={{width:'100%',padding:'18px 20px',paddingRight:q.u?70:20,background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:'inherit',fontWeight:500,outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
                    {q.u&&<span style={{position:'absolute',right:18,top:'50%',transform:'translateY(-50%)',color:DIM,fontSize:14,fontFamily:"var(--font-mono)"}}>{q.u}</span>}
                  </div>
                  {/* BLE sensor pair button — sits to the right of
                      the input as a sibling so it doesn't fight with
                      the existing unit badge for the input's
                      right-padding. */}
                  {bleMetric && (() => {
                    const BLE_FIELD_LABELS = {
                      co2: 'indoor CO₂', co2o: 'outdoor CO₂',
                      tf: 'indoor temperature', tfo: 'outdoor temperature',
                      rh: 'indoor humidity', rho: 'outdoor humidity',
                    }
                    return (
                      <BleSensorButton
                        metric={bleMetric}
                        size={56}
                        ariaLabel={`Pair Bluetooth sensor for ${BLE_FIELD_LABELS[q.id] || q.label || q.id}`}
                        onInsert={(value) => setField(q.id, String(value))}
                      />
                    )
                  })()}
                </div>
                {q.helper==='co2_mass_balance'&&<Co2OaCalculator co2={data.co2} co2o={data.co2o} onApply={v=>setField(q.id,v)} onCo2Change={v=>setField('co2',v)} onCo2oChange={v=>setField('co2o',v)} />}
              </div>
            )
          })()}
          {q.t==='date'&&<input type="date" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:'inherit',outline:'none',boxSizing:'border-box',colorScheme:'dark'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}
          {q.t==='time'&&<TimePickerInput value={data[q.id]||''} onChange={v=>setField(q.id,v)} placeholder={q.ph||'Select time…'} />}
          {/* Free-text wizard input ('ta' question type). Wrapped in
              a relative container so the dictation mic button can
              float in the bottom-right corner of the textarea
              without consuming vertical space or breaking the
              existing focus styling. Padding-right on the textarea
              is bumped to keep typed content from sliding under
              the button. */}
          {q.t==='ta'&&<div style={{position:'relative'}}>
            {/* Free-text wizard input. Right-side padding grows to
                fit two 36px buttons (voice mic + AI rewrite).
                Buttons are absolute-positioned in the bottom-right
                corner of the textarea — same idiom as Notion AI /
                Cursor inline-AI / Apple Writing Tools, just adapted
                for a touch-first wizard. */}
            <textarea value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Notes...'} rows={3} style={{width:'100%',padding:'18px 96px 18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',outline:'none',resize:'vertical',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
            <div style={{position:'absolute',right:10,bottom:10,display:'flex',gap:6}}>
              <VoiceInputButton
                ariaLabel="Dictate notes"
                size={36}
                onTranscript={(text)=>setField(q.id, appendWithSpace(data[q.id]||'', text))}
              />
              <InlineAiButton
                ariaLabel="Rewrite with AI"
                size={36}
                text={data[q.id]||''}
                context={{ field: q.id, prompt: q.q || q.ph || null }}
                onAccept={(rewritten)=>setField(q.id, rewritten)}
              />
            </div>
          </div>}
          {q.t==='ch'&&q.opts&&<div style={{display:'flex',flexDirection:'column',gap:8}}>{q.opts.map((o,i)=>{const stMap=q._subtypeMap;const storedVal=stMap?stMap.find(st=>st.label===o)?.id||o:o;const sel=stMap?(data[q.id]===storedVal):(o==='Other'?isOtherChoice(q.opts,data[q.id]):(data[q.id]===o));const locked=isPremiumOpt(q,o)&&!isEnterprise(profile);return(<button key={o} onClick={()=>{if(locked){haptic('light');setShowPremiumGate(true);return}haptic('light');if(o==='Other'){setField(q.id,'Other')}else{setField(q.id,storedVal);setTimeout(goNext,250)}}} style={{padding:'16px 20px',textAlign:'left',background:sel?`${mix('accent', 7)}`:locked?`${CARD}`:`${CARD}`,border:`1.5px solid ${sel?ACCENT:BORDER}`,borderRadius:14,color:sel?ACCENT:locked?DIM:TEXT,fontSize:16,fontFamily:'inherit',fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:14,minHeight:54,animation:`fadeUp .3s ${i*.04}s cubic-bezier(.22,1,.36,1) both`}}><div style={{width:24,height:24,borderRadius:'50%',border:`2px solid ${sel?ACCENT:BORDER}`,background:sel?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{sel&&<I n="check" s={12} c={ON_ACCENT} />}</div><span style={{flex:1}}>{o}</span>{locked&&<span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:4,background:'#F9731615',color:'#F97316',letterSpacing:'0.3px'}}>PREMIUM</span>}</button>)})}
            {q.other&&isOtherChoice(q.opts,data[q.id])&&<input type="text" value={data[q.id]==='Other'?'':data[q.id]} onChange={e=>setField(q.id,e.target.value||'Other')} placeholder="Describe space use..." autoFocus style={{width:'100%',padding:'16px 20px',background:CARD,border:`1.5px solid ${ACCENT}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginTop:4}} />}
          </div>}
          {q.t==='multi'&&q.opts&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>{q.opts.map((o,i)=>{const arr=data[q.id]||[],sel=arr.includes(o);return(<button key={o} onClick={()=>setField(q.id,sel?arr.filter(x=>x!==o):[...arr,o])} style={{padding:'12px 18px',borderRadius:24,background:sel?`${mix('accent', 8)}`:CARD,border:`1.5px solid ${sel?ACCENT:BORDER}`,color:sel?ACCENT:TEXT,fontSize:14,fontFamily:'inherit',fontWeight:500,cursor:'pointer',minHeight:44,animation:`fadeUp .25s ${i*.03}s cubic-bezier(.22,1,.36,1) both`}}>{sel?'✓ ':''}{o}</button>)})}</div>}
          {q.t==='combo'&&q.opts&&(()=>{const otherOpts=q.opts.filter(o=>o!=='Other');const isOther=(data[q.id]||'')==='__other__'||((data[q.id]||'')&&!otherOpts.includes(data[q.id]));return(<div><select value={isOther?'__other__':(data[q.id]||'')} onChange={e=>setField(q.id,e.target.value)} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',outline:'none',boxSizing:'border-box',appearance:'auto'}}><option value="">Select or skip...</option>{otherOpts.map(o=><option key={o} value={o}>{o}</option>)}<option value="__other__">Other</option></select>{isOther&&<input type="text" value={data[q.id]==='__other__'?'':data[q.id]} onChange={e=>setField(q.id,e.target.value||'__other__')} placeholder="Type here..." autoFocus style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${ACCENT}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginTop:8}} />}</div>)})()}
          {q.t==='sensors'&&<><SensorScreen data={data} onChange={setField} sensorData={sensorData} isDesktop={false} /><JasperWatchPanel data={data} context={{building: bldg, presurvey}} /></>}
          {q.photo&&<PhotoCapture
            photos={photos[`z${curZone}-${q.id}`]||[]}
            analysisContext={`Zone ${curZone+1} — ${q.lbl || q.id}`}
            onAdd={p=>setPhotos(prev=>({...prev,[`z${curZone}-${q.id}`]:[...(prev[`z${curZone}-${q.id}`]||[]),p]}))}
            onAnalyze={(idx, analysis)=>setPhotos(prev=>{
              const key=`z${curZone}-${q.id}`
              const arr=(prev[key]||[]).slice()
              if (arr[idx]) arr[idx]={...arr[idx], aiAnalysis: analysis}
              return {...prev, [key]: arr}
            })}
            onRemove={i=>setPhotos(prev=>({...prev,[`z${curZone}-${q.id}`]:(prev[`z${curZone}-${q.id}`]||[]).filter((_,j)=>j!==i)}))}
          />}
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

    // ── v3 derivations for the redesigned hero / panels ──
    // Severity headline distilled from comp.tot. Pulled out of the
    // legacy riskLabel string so the hero can render a tight 3-word
    // headline plus a sentence of supporting prose.
    const sevPillTone = comp.tot < 30 ? V3.SEVERITY.critical : comp.tot < 50 ? V3.SEVERITY.high : comp.tot < 70 ? V3.SEVERITY.medium : V3.SEVERITY.pass
    const sevPillLabel = comp.tot < 30 ? 'Critical Concern' : comp.tot < 50 ? 'Significant Concern' : comp.tot < 70 ? 'Moderate Concern' : 'Within Acceptable Range'
    const confTone = measConf?.overall === 'High' ? V3.CONFIDENCE.high : measConf?.overall === 'Low' ? V3.CONFIDENCE.low : V3.CONFIDENCE.medium
    const confLabel = measConf?.overall ? `${measConf.overall} Confidence` : 'Confidence Pending'
    const headline = (() => {
      if (causalChains[0]?.type) return `${causalChains[0].type} likely`
      if (expertDriver) return `${expertDriver}`
      return 'Screening-level assessment complete'
    })()

    return (
      <div style={{paddingTop:20,paddingBottom:120,position:'relative',isolation:'isolate'}}>
        {/* Very-low-intensity airflow gradient behind the results — a
            calm "moving air" ambience for the instrument-panel feel.
            Masked to fade out before content, pointer-transparent, and
            disabled under prefers-reduced-motion. */}
        <div className="fa-airflow" aria-hidden="true" style={{
          position:'absolute', top:0, left:0, right:0, height:440, zIndex:0, pointerEvents:'none',
          background:'radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%)',
          backgroundSize:'160% 160%', backgroundRepeat:'no-repeat',
          maskImage:'linear-gradient(180deg, #000 0%, #000 40%, transparent 100%)',
          WebkitMaskImage:'linear-gradient(180deg, #000 0%, #000 40%, transparent 100%)',
        }} />
        <div style={{position:'relative', zIndex:1}}>

        {/* ── Building Header — facility name + address only. The
            meta strip (assessor name · date · status pill) and the
            header-level CTAs (Continue Assessment + View Report
            (Draft)) were removed: the score panel below is the
            point of this view, and the meta + CTAs were chrome that
            competed with the actual content. The home tab still
            provides Continue Assessment on the in-progress hero
            card, and the result tabs strip below this header
            still navigates to the Narrative tab — so no
            functionality is lost, only redundant header chrome. ── */}
        <div style={{marginBottom:18}}>
          <div style={{...V3.T.h1, fontSize:30, lineHeight:'36px', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis'}}>{bldg.fn||'Assessment'}</div>
          {bldg.fl && <div style={{...V3.T.h1Sub}}>{bldg.fl}</div>}
        </div>

        {/* ── Legacy / Standards Badge ── */}
        {viewRpt && !viewRpt.standardsManifest && (
          <div style={{padding:'8px 14px',background:`${V3.SEVERITY.medium}10`,border:`1px solid ${V3.SEVERITY.medium}28`,borderRadius:V3.R.md,marginBottom:10,fontSize:11,color:WARN}}>
            Legacy v1.x scoring — standards manifest not embedded
          </div>
        )}

        {/* ── Hero: composite assessment + next recommended steps ──
            Two-column on tablet+, stacked on mobile. The left column
            is the situational summary (severity, confidence, headline
            sentence, stat strip). The right column lists up to three
            recommended next steps drawn from recs.imm so the assessor
            sees the call-to-action without scrolling. */}
        <div style={{display:'grid',gridTemplateColumns:isTablet?'minmax(0,1.4fr) minmax(0,1fr)':'minmax(0,1fr)',gap:RHYTHM.base,marginBottom:RHYTHM.base}}>
          {/* Composite hero — soft-glass card with severity-railed top
              edge, layered shadow, and meniscus highlight. Padding is
              zero on the wrapper because the hero composes three
              vertical zones (intro, denominator line, optional
              advisory) each with their own padding rhythm. */}
          <GlassCard accent={sevPillTone} style={{padding:0}}>
            <div style={{padding:'22px 24px 8px',display:'flex',alignItems:'flex-start',gap:18}}>
              <div style={{flexShrink:0}}>
                {userMode !== 'fm' ? (
                  <ScoreRing value={comp.tot} color={comp.rc} size={84} />
                ) : (
                  <div style={{width:60,height:60,borderRadius:V3.R.lg,background:`${comp.rc}15`,border:`2px solid ${comp.rc}40`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <I n={comp.tot>=70?'check':'alert'} s={26} c={comp.rc} w={2} />
                  </div>
                )}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
                  <StatusPill tone={sevPillTone}>{sevPillLabel}</StatusPill>
                  {measConf && <StatusPill tone={confTone}>{confLabel}</StatusPill>}
                </div>
                {/* Headline runs at 18 Bold -1 per the v3 Figma HeroCard
                    spec — heavier than V3.T.h2 (18 SemiBold -0.2) so it
                    anchors the hero next to the ScoreRing's visual mass.
                    Tighter -1 letter-spacing gives the optical density
                    that reads as a confident screening conclusion rather
                    than a sub-headline. */}
                <div style={{...V3.T.h2, fontWeight:700, letterSpacing:'-1px', lineHeight:'24px', marginBottom:6}}>{headline}</div>
                <div style={{...V3.T.bodyDim, marginBottom:0}}>
                  {comp.tot < 30 ? 'Building-related symptom cluster identified. Immediate corrective action recommended.'
                    : comp.tot < 50 ? 'Targeted investigation and corrective action warranted.'
                    : comp.tot < 70 ? 'Targeted improvements recommended; conditions trending outside accepted range.'
                    : 'Conditions within acceptable range; continue routine monitoring.'}
                </div>
              </div>
            </div>

            {/* Zone-count summary — a single low-emphasis denominator
                line replaces the earlier three-up score strip (Zone
                Average / Lowest Zone / Zones Assessed). Numeric
                composite scores are still computed by the engine and
                surface in the operator dashboard + DOCX, but the hero
                leads with the severity pill + narrative, not a
                /100 readout. Keeps the screening-only positioning:
                scores are an internal indicator, the conclusion is
                the headline. */}
            <div style={{padding:'12px 24px 18px',textAlign:'center',...V3.T.captionDim}}>
              {comp.count} {userMode === 'fm' ? 'area' : 'zone'}{comp.count!==1?'s':''} assessed
            </div>
            {measConf?.overall === 'Low' && (
              <div style={{
                margin:'0 20px 20px',
                padding:'12px 14px',
                ...GLASS.subtle,
                borderRadius:RADII.md,
                ...V3.T.captionDim,
                color:WARN,
                lineHeight:1.55,
              }}>
                Single-point measurement. Consider time-weighted sampling per AIHA strategy before drawing conclusions.
              </div>
            )}
          </GlassCard>

          {/* Next recommended steps — soft-glass card matching the
              hero's surface vocabulary. Sits to the right on tablet,
              stacks below on phone. */}
          <GlassCard>
            <div style={{...V3.T.h3, marginBottom:14}}>Next recommended steps</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {(() => {
                const items = []
                if (recs?.imm?.length) {
                  recs.imm.slice(0, 3).forEach((item, idx) => {
                    const text = typeof item === 'string' ? item : (item?.text || '')
                    if (text) items.push({ k: `imm-${idx}`, text })
                  })
                }
                if (samplingPlan?.plan?.length > 0 && items.length < 3) {
                  items.push({ k: 'samp', text: `Targeted confirmatory sampling (${samplingPlan.plan.length} analytical method${samplingPlan.plan.length>1?'s':''})` })
                }
                if (items.length === 0) {
                  return <div style={V3.T.bodyDim}>No immediate actions identified. Continue routine monitoring and re-assess on the next cycle.</div>
                }
                return items.map(({ k, text }) => (
                  <div key={k} style={{display:'flex',alignItems:'flex-start',gap:10}}>
                    <div style={{...V3.iconBox('var(--accent)'), width:22, height:22, borderRadius:V3.R.pill, flexShrink:0, marginTop:1}}>
                      <I n="check" s={12} c="var(--accent)" w={2.2} />
                    </div>
                    <div style={{...V3.T.body, flex:1, minWidth:0}}>{text}</div>
                  </div>
                ))
              })()}
            </div>
            <div style={V3.divider()} />
            <button onClick={()=>{ haptic('light'); setRTab('actions') }} style={{background:'none',border:'none',color:'var(--accent)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0,display:'inline-flex',alignItems:'center',gap:6}}>
              View all actions
              <span style={{fontSize:13}}>›</span>
            </button>
          </GlassCard>
        </div>

        {/* ── v2.1 Engine InternalReport (operator dashboard) ──
            Demoted to a tighter wrapper so the chrome line "v2.8.0
            ENGINE · Internal report (operator dashboard) · Expand"
            doesn't break the visual flow between hero and tabs.
            The panel itself manages its own collapsed state — we
            only constrain its outer padding here. ── */}
        {/* Internal operator dashboard — visible only to PSEC staff
            with an active admin session (Settings → Activate admin).
            Surfaces v2.8 engine scoring internals (severity matrix,
            confidence tiers, defensibility flags) that are useful for
            QA/debugging but not appropriate for client-facing or
            non-staff consultant accounts. */}
        {!!adminSecret && (
          <div style={{marginBottom:14, marginTop:-4, opacity:0.85}}>
            <V21InternalPanel
              zoneScores={zoneScores}
              comp={comp}
              zones={zones}
              profile={profile}
              presurvey={presurvey}
              bldg={bldg}
              assessmentDate={viewRpt?.ts ? viewRpt.ts.slice(0,10) : undefined}
            />
          </div>
        )}

        {/* ── Data-completeness prompts. Banner-style status-by-
            exception entries — surface only when defensibility is at
            risk. Restyled with the v3 token surface so they read as
            actionable warnings rather than chrome noise. ── */}
        {!archived && (!presurvey.ps_inst_iaq || !presurvey.ps_inst_iaq_serial || !presurvey.ps_inst_iaq_cal) && (
          <button onClick={()=>{setDqi(Math.max(0, dtVis.findIndex(q=>q.id==='ps_inst_iaq')));setView('details')}} style={{width:'100%',padding:'12px 16px',background:`${WARN}10`,border:`1px solid ${WARN}28`,borderRadius:V3.R.md,marginBottom:8,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
            <I n="alert" s={16} c={WARN} />
            <div style={{flex:1,minWidth:0}}>
              <div style={{...V3.T.bodyStrong, color:WARN}}>Add instrument data</div>
              <div style={V3.T.captionDim}>Required for defensible reports</div>
            </div>
            <span style={{fontSize:13,color:WARN}}>→</span>
          </button>
        )}
        {!archived && detailsFilled < 5 && (
          <button onClick={()=>{setDqi(0);setView('details')}} style={{width:'100%',padding:'12px 16px',background:`${WARN}10`,border:`1px solid ${WARN}28`,borderRadius:V3.R.md,marginBottom:12,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
            <I n="clip" s={16} c={WARN} />
            <div style={{flex:1,minWidth:0}}>
              <div style={{...V3.T.bodyStrong, color:WARN}}>Add assessment details</div>
              <div style={V3.T.captionDim}>Strengthens defensibility</div>
            </div>
            <span style={{fontSize:13,color:WARN}}>→</span>
          </button>
        )}

        {/* ── Workflow tabs — v3 tabRow. State keys stay the same
            (overview/readiness/rootcause/sampling/narrative/actions)
            for back-compat with the setRTab call sites at lines 592,
            707, 822; visible labels are reconciled with the workflow
            grammar used on Home (Findings / Pathways / Sampling /
            Narrative / Actions / Review). ── */}
        <div id="result-tabs-anchor" style={{...V3.tabRow, marginBottom:16, scrollMarginTop:80}}>
          {(userMode === 'fm'
            ? [['overview','findings','Findings'],['narrative','notes','Narrative'],['actions','check','Actions'],['readiness','shield','Review']]
            : [['overview','findings','Findings'],['rootcause','chain','Pathways'],['sampling','flask','Sampling'],['narrative','notes','Narrative'],['actions','check','Actions'],['readiness','shield','Review']]
          ).map(([k,ic,l])=>{
            const isActive = rTab===k
            return (
              <button key={k} onClick={()=>{setRTab(k);haptic('light')}} {...pressFeedback()} style={{...V3.tabItem(isActive), ...pressFeedback.style}}>
                <I n={ic} s={15} c={isActive?'var(--accent)':V3.TEXT_TERTIARY} w={isActive?1.9:1.6} />
                <span>{l}</span>
              </button>
            )
          })}
        </div>

        {rTab==='readiness' && (
          <ReadinessPanel
            assessment={{
              assessmentMode: 'SCREENING',
              presurvey, building: bldg, client: bldg && bldg.client ? bldg.client : {},
              zones, zoneScores, recs, photos,
              profile: profile ? { name: profile.name } : null,
            }}
          />
        )}

        {rTab==='overview' && zs && (() => {
          // ── v3 Findings tab — derive panels from existing engine state ──
          // Data Gaps: combine OSHA-relevant gaps, not-scored categories
          // on the focused zone, and instrument/details prompts that
          // would erode defensibility if shipped to a report.
          const gapItems = []
          if (!presurvey.ps_inst_iaq) gapItems.push('Instrument model not recorded')
          else if (!presurvey.ps_inst_iaq_cal) gapItems.push('Instrument calibration date not recorded')
          if (zs?.cats?.some(c => c.l === 'Environment' && (c.s === null || c.status === 'DATA_GAP'))) gapItems.push('Humidity / thermal data not logged')
          if (zs?.cats?.some(c => c.l === 'Ventilation' && (c.s === null || c.status === 'DATA_GAP'))) gapItems.push('Airflow / CO₂ measurement not captured')
          if (oshaResult?.gaps?.length) oshaResult.gaps.slice(0, 3).forEach(g => gapItems.push(g))
          // De-dupe + cap at 4 visible entries
          const dataGaps = Array.from(new Set(gapItems)).slice(0, 4)

          // Evidence Summary breakdown. The engine does not separately
          // tag finding provenance (measurement vs observation vs
          // occupant report), so the breakdown is derived from the
          // category each finding belongs to. Heuristic mapping —
          // refine in a future slice once provenance is a first-class
          // field on Finding.
          const evCount = { meas: 0, obs: 0, occ: 0 }
          zoneScores.forEach(z => (z.cats || []).forEach(c => {
            const n = (c.r || []).length
            if (c.l === 'Ventilation' || c.l === 'Environment' || c.l === 'Contaminants') evCount.meas += n
            else if (c.l === 'HVAC') evCount.obs += n
            else if (c.l === 'Complaints') evCount.occ += n
          }))
          const evTotal = evCount.meas + evCount.obs + evCount.occ
          const photoCount = Object.keys(photos || {}).length

          // Key indicator — use the primary driver category from this
          // zone. If complaints carry the most weight, the gauge would
          // mislead (complaints are a symptom, not a driver), so the
          // logic mirrors line 940 above and picks the worst non-
          // complaint category.
          const keyCat = driverCat || zs.cats?.[0]
          const keyPct = keyCat && keyCat.s !== null ? Math.round((keyCat.s / keyCat.mx) * 100) : null
          const keyTone = keyPct === null ? V3.TEXT_TERTIARY : keyPct < 30 ? V3.SEVERITY.critical : keyPct < 50 ? V3.SEVERITY.high : keyPct < 70 ? V3.SEVERITY.medium : V3.SEVERITY.pass
          const keyConcernLabel = keyPct === null ? 'Insufficient Data' : keyPct < 30 ? 'Critical Concern' : keyPct < 50 ? 'High Concern' : keyPct < 70 ? 'Moderate Concern' : 'Within Range'
          const keyDescMap = {
            Ventilation: 'CO₂ and outdoor-air delivery indicators inform ventilation effectiveness, not air quality contamination.',
            Contaminants: 'Combined exposure indicators across particulate, VOC, and other measured contaminants.',
            HVAC: 'Mechanical system condition, maintenance, and operational reliability indicators.',
            Environment: 'Thermal and moisture indicators relative to recognized comfort and dewpoint ranges.',
            Complaints: 'Occupant-reported symptom patterns. Indicates impact, not cause.',
          }
          const keyDesc = keyCat ? (keyDescMap[keyCat.l] || 'Category-level severity indicator.') : ''

          return (
            <div style={{display:'flex',flexDirection:'column',gap:16}}>

              {/* ── Two-up: Professional Assessment + Key Indicator ─── */}
              <div style={{display:'grid',gridTemplateColumns:isTablet?'minmax(0,1.1fr) minmax(0,1fr)':'minmax(0,1fr)',gap:16}}>
                {/* Professional Assessment.
                    Inner grid uses minmax(0,1fr) so long engine output
                    like "HVAC system deficiency" wraps inside its cell
                    instead of forcing 2 lines via column starvation;
                    at the narrowest of the iPad-portrait two-column
                    split we collapse Primary driver / Complaint pattern
                    to a single column for breathing room. ── */}
                <div style={V3.panel()}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:18}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
                      <div style={V3.T.h3}>Professional Assessment</div>
                      <div style={{...V3.T.captionDim, fontStyle:'italic'}}>(Screening-Level)</div>
                    </div>
                    <I n="help" s={13} c={V3.TEXT_MUTED} w={1.6} />
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:isTabletLand?'minmax(0,1fr) minmax(0,1fr)':'minmax(0,1fr)',gap:isTabletLand?14:10,marginBottom:expertCause||expertComplaint?14:0}}>
                    {expertDriver && (
                      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                        <div style={V3.iconBox('var(--accent)')}><I n="wind" s={15} c="var(--accent)" w={1.8} /></div>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={V3.T.captionDim}>Primary driver</div>
                          <div style={{...V3.T.bodyStrong, marginTop:3, lineHeight:'18px'}}>{expertDriver}</div>
                        </div>
                      </div>
                    )}
                    {expertComplaint && (
                      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                        <div style={V3.iconBox(WARN)}><I n="people" s={15} c={WARN} w={1.8} /></div>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={V3.T.captionDim}>Complaint pattern</div>
                          <div style={{...V3.T.bodyStrong, marginTop:3, lineHeight:'18px'}}>Building-related symptoms</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {expertCause && (
                    <div style={{padding:'14px 0',borderTop:`1px solid ${V3.BORDER_SUBTLE}`,display:'flex',gap:10,alignItems:'flex-start'}}>
                      <div style={V3.iconBox(V3.TEXT_SECONDARY)}><I n="person" s={15} c={V3.TEXT_SECONDARY} w={1.8} /></div>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={V3.T.captionDim}>Likely contributing cause</div>
                        <div style={{...V3.T.body, marginTop:3, lineHeight:'19px'}}>{expertCause.length > 140 ? expertCause.slice(0, 137) + '…' : expertCause}</div>
                      </div>
                    </div>
                  )}
                  <div style={{padding:'14px 0 0',borderTop:`1px solid ${V3.BORDER_SUBTLE}`,display:'flex',gap:10,alignItems:'flex-start'}}>
                    <div style={V3.iconBox(V3.TEXT_SECONDARY)}><I n="notes" s={15} c={V3.TEXT_SECONDARY} w={1.8} /></div>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={V3.T.captionDim}>Overall assessment</div>
                      <div style={{...V3.T.body, marginTop:3, lineHeight:'19px'}}>{(() => {
                        if (comp.tot < 30) return 'Under-delivered outdoor air is the most common contributor based on available data.'
                        if (comp.tot < 50) return 'Multiple contributing factors detected; targeted intervention warranted.'
                        if (comp.tot < 70) return 'Conditions trending outside accepted range; targeted improvements recommended.'
                        return 'Conditions consistent with expected baseline; continue routine monitoring.'
                      })()}</div>
                    </div>
                  </div>
                  <div style={V3.divider()} />
                  <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:16}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                      <I n="chart" s={14} c={confTone} w={1.7} />
                      <div style={{minWidth:0}}>
                        <div style={V3.T.captionDim}>Confidence</div>
                        <div style={{...V3.T.bodyStrong, color:confTone, marginTop:2}}>{measConf?.overall || 'Pending'}</div>
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                      <I n="shield" s={14} c={V3.TEXT_SECONDARY} w={1.7} />
                      <div style={{minWidth:0}}>
                        <div style={V3.T.captionDim}>Assessment type</div>
                        <div style={{...V3.T.body, marginTop:2}}>Screening <span style={V3.T.captionDim}>(Non-compliance)</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Indicator.
                    Title row left + score right (matches the reference
                    target proportions). Score takes mono numerals at
                    32 px so it reads as the dominant value, with the
                    concern label tinted to the same severity tone
                    underneath. Gauge bar runs full width below. ── */}
                <div style={V3.panel()}>
                  <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:16,flexWrap:'wrap'}}>
                    <div style={V3.T.h3}>Key Indicator</div>
                    <div style={V3.T.captionDim}>(Worst Zone)</div>
                  </div>
                  {keyCat ? (
                    <>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:18}}>
                        <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0,flex:1}}>
                          <div style={V3.iconBox(keyTone)}>
                            <I n={keyCat.l === 'Ventilation' ? 'wind' : keyCat.l === 'HVAC' ? 'hvac' : keyCat.l === 'Environment' ? 'thermo' : keyCat.l === 'Contaminants' ? 'flask' : 'symptom'} s={16} c={keyTone} w={1.8} />
                          </div>
                          <div style={{...V3.T.bodyStrong, fontSize:17, lineHeight:'22px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{keyCat.l}</div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{display:'flex',alignItems:'baseline',gap:1,justifyContent:'flex-end'}}>
                            <span style={{fontFamily:'var(--font-mono)', fontSize:32, lineHeight:'34px', fontWeight:600, color:keyTone, letterSpacing:'-0.5px'}}>{keyPct ?? '—'}</span>
                            {keyPct !== null && <span style={{...V3.N.sm, fontSize:13, color:V3.TEXT_TERTIARY}}>/100</span>}
                          </div>
                          <div style={{...V3.T.caption, color:keyTone, marginTop:2, textAlign:'right'}}>{keyConcernLabel}</div>
                        </div>
                      </div>
                      {keyPct !== null && (
                        <>
                          <div style={{...V3.gaugeTrack, height:8}}>
                            <div style={{...V3.gaugeDot(keyPct, keyTone), top:-5, width:16, height:16}} />
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',marginTop:8,...V3.N.sm, fontSize:11}}>
                            <span>0</span>
                            <span>100</span>
                          </div>
                        </>
                      )}
                      <div style={V3.divider()} />
                      <div style={V3.T.captionDim}>Why this matters</div>
                      <div style={{...V3.T.body, marginTop:4, lineHeight:'20px'}}>{keyDesc}</div>
                    </>
                  ) : (
                    <div style={V3.T.bodyDim}>No category scored yet — capture field data to surface the worst-zone indicator.</div>
                  )}
                </div>
              </div>

              {/* ── Two-up: Data Gaps + Evidence Summary ─── */}
              <div style={{display:'grid',gridTemplateColumns:isTablet?'minmax(0,1fr) minmax(0,1fr)':'minmax(0,1fr)',gap:16}}>
                {/* Data Gaps */}
                <div style={V3.panel()}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={V3.iconBox(WARN)}><I n="gap" s={15} c={WARN} w={1.8} /></div>
                      <div style={V3.T.h3}>Data Gaps</div>
                    </div>
                    {dataGaps.length > 0 && <span style={V3.pill(WARN)}>{dataGaps.length} item{dataGaps.length===1?'':'s'}</span>}
                  </div>
                  {dataGaps.length === 0 ? (
                    <div style={V3.T.bodyDim}>No defensibility-blocking gaps identified for this assessment.</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      {dataGaps.map((g, i) => (
                        <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10}}>
                          <I n="alert" s={14} c={WARN} w={1.8} />
                          <div style={{...V3.T.body, flex:1, minWidth:0, lineHeight:'19px'}}>{g}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {dataGaps.length > 0 && (
                    <>
                      <div style={V3.divider()} />
                      <button onClick={()=>{ haptic('light'); setRTab('readiness') }} style={{background:'none',border:'none',color:'var(--accent)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0,display:'inline-flex',alignItems:'center',gap:6}}>
                        View all gaps and assumptions
                        <span style={{fontSize:13}}>›</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Evidence Summary */}
                <div style={V3.panel()}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={V3.iconBox(V3.TEXT_SECONDARY)}><I n="report" s={15} c={V3.TEXT_SECONDARY} w={1.8} /></div>
                      <div style={V3.T.h3}>Evidence Summary</div>
                    </div>
                    {evTotal > 0 && <span style={V3.pill(V3.TEXT_SECONDARY)}>{evTotal} finding{evTotal===1?'':'s'}</span>}
                  </div>
                  <div style={{display:'flex',flexDirection:'column'}}>
                    {[
                      ['Measurements',     evCount.meas, 'gauge'],
                      ['Observations',     evCount.obs,  'eye'],
                      ['Occupant Feedback',evCount.occ,  'people'],
                      ['Photos',           photoCount,   'image'],
                    ].map(([k, v, ic], i, arr) => (
                      <div key={k} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`}}>
                        <I n={ic} s={14} c={V3.TEXT_TERTIARY} w={1.6} />
                        <div style={{...V3.T.body, flex:1, minWidth:0}}>{k}</div>
                        <div style={{...V3.N.md, color: v > 0 ? V3.TEXT_PRIMARY : V3.TEXT_MUTED}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Assessed Zones table — click row to focus that zone
                  for the detailed drilldown below. Current focus is
                  visually called out with a Current focus sub-label
                  and a raised background on the row. ── */}
              <div style={V3.panel({ dense: true })}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,padding:'4px 4px 0'}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                    <div style={V3.T.h3}>Assessed Zones</div>
                    <div style={V3.T.captionDim}>{zoneScores.length}</div>
                  </div>
                </div>
                {/* Header row */}
                <div style={{display:'grid',gridTemplateColumns: isTablet ? '2fr 1fr 1fr 1.4fr' : '2fr 1fr 1.4fr', gap:12, padding:'8px 8px', borderBottom:`1px solid ${V3.BORDER_DEFAULT}`}}>
                  <div style={V3.T.micro}>Zone</div>
                  {isTablet && <div style={V3.T.micro}>Findings</div>}
                  <div style={{...V3.T.micro, textAlign:'right'}}>Score</div>
                  <div style={{...V3.T.micro, textAlign:'right'}}>Status</div>
                </div>
                {zoneScores.map((z, i) => {
                  const isFocus = selZone === i
                  const findingCount = (z.cats || []).reduce((acc, c) => acc + (c.r?.length || 0), 0)
                  return (
                    <button key={i} onClick={()=>setSelZone(i)} style={{display:'grid',gridTemplateColumns: isTablet ? '2fr 1fr 1fr 1.4fr' : '2fr 1fr 1.4fr', gap:12, padding:'12px 8px', alignItems:'center', textAlign:'left', background: isFocus ? V3.RAISED : 'transparent', border:'none', borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`, cursor:'pointer', fontFamily:'inherit', borderRadius: isFocus ? V3.R.sm : 0, width:'100%'}}>
                      <div style={{minWidth:0}}>
                        <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{z.zoneName}</div>
                        {isFocus && <div style={{...V3.T.micro, color:'var(--accent)', marginTop:3, textTransform:'none', letterSpacing:0, fontSize:11}}>Current focus</div>}
                      </div>
                      {isTablet && <div style={{...V3.N.md, color:V3.TEXT_SECONDARY}}>{findingCount}</div>}
                      <div style={{textAlign:'right'}}>
                        <span style={{...V3.N.md, color:z.rc}}><CountUp value={z.tot} /></span>
                        <span style={V3.N.sm}>/100</span>
                      </div>
                      <div style={{textAlign:'right',display:'flex',justifyContent:'flex-end',alignItems:'center',gap:8}}>
                        <span style={V3.pill(z.rc)}>{z.risk}</span>
                        <span style={{color:V3.TEXT_TERTIARY,fontSize:13}}>›</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* ── Detailed findings — the legacy zone-by-category
                  drilldown for the currently focused zone. Kept as the
                  authoritative engine readout so the redesigned panels
                  above act as the executive summary, not a substitute. ── */}
              <div style={{display:'flex',alignItems:'baseline',gap:8,marginTop:8,padding:'0 2px'}}>
                <div style={V3.T.micro}>Detailed findings</div>
                <div style={V3.T.captionDim}>· {zs.zoneName}</div>
              </div>
              <div key={selZone} className="fa-zone-in" style={{display:isTablet?'grid':'flex',gridTemplateColumns:isTablet?'1fr 1fr':'none',flexDirection:'column',gap:10}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:CARD,border:`1px solid ${V3.BORDER_DEFAULT}`,borderRadius:V3.R.md}}>
                  <div style={{...V3.T.bodyStrong}}>{zs.zoneName}</div>
                  {userMode === 'fm' ? (
                    <span style={V3.pill(zs.rc)}>{zs.risk}</span>
                  ) : (
                    <div style={{display:'flex',alignItems:'baseline',gap:2}}>
                      <span style={{...V3.N.lg, color:zs.rc, fontSize:22, lineHeight:'26px'}}>{zs.tot}</span>
                      <span style={V3.N.sm}>/100</span>
                    </div>
                  )}
                </div>
          {zs.cats.map((cat,ci)=>{
            if (cat.s === null || cat.status === 'DATA_GAP' || cat.status === 'INSUFFICIENT') {
              return(
                <div key={cat.l} style={{padding:'14px 18px',background:CARD,border:`1px solid ${V3.BORDER_DEFAULT}`,borderRadius:V3.R.md}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={V3.T.bodyStrong}>{cat.l}</span>
                    <span style={V3.pill(V3.TEXT_TERTIARY)}>Not Scored</span>
                  </div>
                  <div style={{...V3.T.captionDim, marginTop:6}}>Data gap — documentation not provided for this category</div>
                </div>
              )
            }
            const pct=Math.round((cat.s/cat.mx)*100);const bc=pct>=80?'#22C55E':pct>=60?'#FBBF24':pct>=40?'#FB923C':'#EF4444';const pctLabel=pct>=80?'Within range':pct>=60?'Moderate concern':pct>=40?'Significant concern':'Critical concern';const fmLabel=pct>=70?'Pass':pct>=40?'Needs attention':'Action needed';const fmColor=pct>=70?'#22C55E':pct>=40?'#FBBF24':'#EF4444';const findings=cat.r.filter(r => !(r.sev === 'pass' && pct < 70));return(
            <div key={cat.l} style={{padding:'16px 18px',background:CARD,border:`1px solid ${V3.BORDER_DEFAULT}`,borderRadius:V3.R.md}}>
              {/* Category header — single row, mono score + concern
                  text inline, with a thin progress bar below. Replaces
                  the legacy "Category | Score" two-up grid that double-
                  printed the cat label and used two micro headings. */}
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,marginBottom:userMode==='fm'?12:8}}>
                <div style={{...V3.T.bodyStrong, fontSize:15}}>{cat.l}</div>
                {userMode === 'fm' ? (
                  <span style={V3.pill(fmColor)}>{cat.s===null?'No data':fmLabel}</span>
                ) : (
                  <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                    <span style={{...V3.N.md, color:bc, fontSize:15}}><CountUp value={cat.s} /><span style={{color:V3.TEXT_TERTIARY, fontWeight:500}}>/{cat.mx}</span></span>
                    <span style={V3.T.captionDim}>· {pctLabel}</span>
                  </div>
                )}
              </div>
              {userMode !== 'fm' && <div style={{height:3,background:V3.BORDER_DEFAULT,borderRadius:2,overflow:'hidden',marginBottom:14}}>
                <div style={{height:'100%',width:`${pct}%`,background:bc,borderRadius:2,transition:'width .8s ease'}} />
              </div>}
              {findings.map((r,i)=>{const s=sv(r.sev);const sevLabel=r.sev.charAt(0).toUpperCase()+r.sev.slice(1);return(
                <div key={i} style={{paddingTop: i === 0 ? 0 : 12, paddingBottom: i < findings.length - 1 ? 12 : 0, borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                    <span style={{...V3.pill(s.c), marginTop:1, flexShrink:0}}>{sevLabel}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{...V3.T.body, lineHeight:'20px'}}>{r.t}</div>
                      {r.std && <div style={{...V3.T.captionDim, marginTop:4, fontFamily:'var(--font-mono)', fontSize:11}}>{r.std}</div>}
                    </div>
                  </div>
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
                  {m.investigationTriggered&&<span style={{padding:'2px 8px',background:`${mix('warn', 8)}`,border:`1px solid ${mix('warn', 19)}`,borderRadius:4,fontSize:10,fontWeight:700,color:WARN,letterSpacing:'0.3px'}}>Investigation triggered</span>}
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
              </div>
            </div>
          )
        })()}

        {rTab==='rootcause'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:11,color:DIM,lineHeight:1.5,marginBottom:4}}>Concern pathways are based on correlation of field observations, measurements, and occupant reports. They support — but do not confirm — root-cause determination.</div>
          {causalChains.length===0?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:10,border:`1px solid ${BORDER}`}}><I n="chain" s={24} c={DIM} w={1.4} /><div style={{fontSize:14,fontWeight:600,marginTop:12,marginBottom:4,color:SUB}}>No concern pathways identified</div><div style={{fontSize:12,color:DIM,lineHeight:1.5}}>No correlated multi-factor findings in this assessment.</div></div>
          :causalChains.map((ch,i)=>{const confLabel=ch.confidence==='Strong'?'High':ch.confidence==='Moderate'?'Moderate':'Possible';const cc=confColor(ch.confidence);return(
            <div key={i} style={{padding:'16px 16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12}}>
              {/* ── Canonical two-up: PATHWAY + CONFIDENCE ── */}
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,marginBottom:14,alignItems:'flex-start'}}>
                <div>
                  <div style={CARD_LABEL}>Pathway</div>
                  <div style={{color:TEXT,fontWeight:700,fontSize:15,lineHeight:1.35}}>{ch.type}</div>
                </div>
                <div>
                  <div style={CARD_LABEL}>Confidence</div>
                  <span style={{padding:'3px 10px',background:`${cc}1F`,border:`1px solid ${cc}59`,borderRadius:5,fontSize:11,fontWeight:700,color:cc,letterSpacing:'0.4px',whiteSpace:'nowrap'}}>{confLabel}</span>
                </div>
              </div>
              {/* ── ZONE — plain bold white, not cyan/monospace ── */}
              <div style={{marginBottom:14}}>
                <div style={CARD_LABEL}>Zone</div>
                <div style={{color:TEXT,fontWeight:600,fontSize:13,lineHeight:1.4}}>{ch.zone}</div>
              </div>
              {/* ── HYPOTHESIS — the primary conclusion, rendered brighter
                  (TEXT, not SUB) than the supporting evidence below so the
                  takeaway is scannable first. ── */}
              <div style={{marginBottom:14}}>
                <div style={CARD_LABEL}>Hypothesis</div>
                <div style={{color:TEXT,fontSize:14,lineHeight:1.55}}>{ch.rootCause}</div>
              </div>
              {/* ── SUPPORTING EVIDENCE — separated from the interpretation
                  above by a hairline; dimmer + roomier line spacing so the
                  references read as a scannable list, not a wall of text.
                  Flat list, no leading arrows (intentional). ── */}
              <div style={{paddingTop:14,borderTop:`1px solid ${V3.BORDER_SUBTLE}`}}>
                <div style={CARD_LABEL}>Supporting evidence</div>
                {ch.evidence.map((e,j)=><div key={j} style={{fontSize:13,color:SUB,lineHeight:1.55,marginBottom:j<ch.evidence.length-1?6:0}}>{e}</div>)}
              </div>
            </div>
          )})}
        </div>}

        {rTab==='sampling'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
          {(!samplingPlan||samplingPlan.plan.length===0)?<div style={{padding:36,textAlign:'center',background:CARD,borderRadius:10,border:`1px solid ${BORDER}`}}><I n="flask" s={24} c={DIM} w={1.4} /><div style={{fontSize:14,fontWeight:600,marginTop:12,marginBottom:4,color:SUB}}>No sampling indicated</div><div style={{fontSize:12,color:DIM,lineHeight:1.5}}>No hypotheses requiring confirmatory sampling.</div></div>
          :<>{samplingPlan.plan.map((p,i)=>{const pc=p.priority==='critical'?'#EF4444':p.priority==='high'?'#FB923C':'#FBBF24';const priLabel=p.priority.charAt(0).toUpperCase()+p.priority.slice(1);return(
            <div key={i} style={{padding:'18px 18px 20px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12}}>
              {/* ── Canonical two-up: SAMPLE TYPE + PRIORITY ── */}
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,marginBottom:14,alignItems:'flex-start'}}>
                <div>
                  <div style={CARD_LABEL}>Sample type</div>
                  <div style={{color:TEXT,fontWeight:700,fontSize:15,lineHeight:1.35}}>{p.type}</div>
                </div>
                <div>
                  <div style={CARD_LABEL}>Priority</div>
                  <span style={{padding:'3px 10px',background:`${pc}1F`,border:`1px solid ${pc}59`,borderRadius:5,fontSize:11,fontWeight:700,color:pc,letterSpacing:'0.4px',whiteSpace:'nowrap'}}>{priLabel}</span>
                </div>
              </div>
              {/* ── ZONE — plain bold white ── */}
              <div style={{marginBottom:14}}>
                <div style={CARD_LABEL}>Zone</div>
                <div style={{color:TEXT,fontWeight:600,fontSize:13,lineHeight:1.4}}>{p.zone}</div>
              </div>
              {/* ── HYPOTHESIS / METHOD / CONTROLS — flat label/value pairs.
                  The hypothesis (the reason to sample) leads brighter than
                  the method/controls detail beneath it. ── */}
              {[{l:'Hypothesis',v:p.hypothesis},{l:'Method',v:p.method},{l:'Controls',v:p.controls}].filter(x=>x.v).map((x,xi)=><div key={x.l} style={{marginBottom:14}}>
                <div style={CARD_LABEL}>{x.l}</div>
                <div style={{color:xi===0?TEXT:SUB,fontSize:xi===0?14:13,lineHeight:1.55}}>{x.v}</div>
              </div>)}
              {/* ── REFERENCE — separated from the interpretation above by a
                  hairline so the citation reads as a distinct reference. ── */}
              {p.standard && <div style={{paddingTop:14,borderTop:`1px solid ${V3.BORDER_SUBTLE}`}}>
                <div style={CARD_LABEL}>Reference</div>
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
            <button onClick={requestNarrative} style={{padding:'12px 28px',background:ACCENT,border:'none',borderRadius:8,color:ON_ACCENT,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Generate Narrative</button>
            <div style={{fontSize:9,color:DIM,marginTop:10}}>Costs 3 credits</div>
          </div>}
          {narrativeLoading&&<div style={{padding:44,textAlign:'center',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}><div style={{width:36,height:36,margin:'0 auto 14px',borderRadius:'50%',border:'2px solid transparent',borderTopColor:ACCENT,animation:'spin 1s linear infinite'}} /><div style={{fontSize:12,color:SUB}}>Generating narrative from assessment data...</div></div>}
          {narrative&&<div style={{padding:18,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,marginBottom:12,flexWrap:'wrap'}}>
              <div style={{fontSize:14,fontWeight:600,color:TEXT}}>Findings Narrative</div>
              <span style={{fontSize:11,color:DIM,fontWeight:500}}>AI-generated · Review required</span>
            </div>
            <div style={{fontSize:13,color:SUB,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{narrative}</div>
            <div style={{marginTop:14,padding:'10px 12px',background:`${mix('warn', 3)}`,border:`1px solid ${mix('warn', 9)}`,borderRadius:10}}>
              <div style={{fontSize:11,color:WARN,fontWeight:600,marginBottom:3}}>Professional review required</div>
              <div style={{fontSize:11,color:DIM,lineHeight:1.5}}>This narrative was generated from deterministic scoring output. Review, edit, and approve before including in any client deliverable or report.</div>
            </div>
            {/* Share the narrative as a lightweight DOCX so the
                reviewing IH can hand it off as an editable draft
                (Mail, Slack, Files) without bundling the full
                consultant report. */}
            <div style={{marginTop:14,display:'flex',gap:10,flexWrap:'wrap'}}>
              <TactileButton variant="secondary" onClick={handleShareNarrative} icon={<I n="send" s={15} c="var(--accent)" w={1.8} />}>
                Share narrative as Word
              </TactileButton>
            </div>
          </div>}
        </div>}

        {rTab==='actions'&&recs&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
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
            // Mobile fit-and-finish: 3px left accent stripe in the tier
            // color so the priority hierarchy reads at a glance when
            // scrolling. Card padding bumped to 16px and the left edge
            // gets extra to clear the stripe.
            return(<div key={cat.k} style={{padding:'16px 16px 16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderLeft:`3px solid ${cat.c}`,borderRadius:10}}>
            {/* ── Canonical two-up: TIER + TIMEFRAME ── */}
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,marginBottom:16,alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Tier</div>
                <div style={{color:cat.c,fontWeight:700,fontSize:15,lineHeight:1.4,letterSpacing:'-0.1px'}}>{cat.l}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:9,color:DIM,textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:3}}>Timeframe</div>
                <div style={{color:SUB,fontWeight:500,fontSize:13,lineHeight:1.4}}>{cat.s}</div>
              </div>
            </div>
            {/* ── Group header (zone / equipment / building-wide) + bulleted action list ── */}
            {groups.map((g, gi) => {
              const isEquipment = g.scope === 'equipment'
              const headerColor = isEquipment ? ACCENT : TEXT
              return (
                <div key={g.key} style={{marginBottom: gi < groups.length - 1 ? 16 : 0}}>
                  <div style={{color:headerColor,fontWeight:600,fontSize:13,lineHeight:1.4,marginBottom:8,display:'flex',alignItems:'baseline',gap:6}}>
                    <span>{g.label}</span>
                  </div>
                  <ul style={{margin:0,padding:'0 0 0 18px',listStyle:'disc',color:SUB}}>
                    {g.actions.map((a, ai) => (
                      <li key={ai} style={{color:SUB,fontSize:13,lineHeight:1.65,marginBottom:6}}>{a.text}</li>
                    ))}
                  </ul>
                  {isEquipment && g.affectedZoneNames && g.affectedZoneNames.length > 0 && (
                    <div style={{color:DIM,fontSize:11,fontStyle:'italic',marginTop:6,marginLeft:18}}>Affects: {g.affectedZoneNames.join(', ')}</div>
                  )}
                </div>
              )
            })}
          </div>)})}
          {/* Floating action bar — tactile soft-glass buttons with
              scale-down tap feedback. Word is the primary export
              affordance now that PDF has been retired; Share and Map
              Zones round out the result-screen action surface. */}
          <div style={sgStack('tight')}>
            <div style={{display:'flex',gap:10,marginTop:8}}>
              <TactileButton variant="secondary" fullWidth size="lg" onClick={()=>setDocxPicker(true)} icon={<I n="notes" s={16} c={ACCENT} />}>Word</TactileButton>
              <TactileButton variant="ghost" fullWidth size="lg" onClick={handleShare} icon={<I n="send" s={16} c={SUB} />}>Share</TactileButton>
            </div>
            <TactileButton variant="secondary" fullWidth size="lg" onClick={()=>setView('spatial')} icon={<I n="bldg" s={16} c={ACCENT} />}>Map Zones on Floor Plan</TactileButton>
            <TactileButton variant="ghost" fullWidth size="lg" onClick={()=>{setReviewError(null);setReviewChooserOpen(true)}} icon={<I n="search" s={16} c={SUB} />}>Review for discrepancies</TactileButton>
            <TactileButton variant="secondary" fullWidth size="lg" onClick={()=>setView('sensor-data')} icon={<I n="chart" s={16} c={ACCENT} />}>Logger Studio{sensorData?.graphs && Object.values(sensorData.graphs).some(g=>g?.include)?' ✓':''}</TactileButton>
          </div>
          {/* Removed redundant "Start Assessment" CTA — the user viewing
              this screen is already inside an assessment; starting a new
              one is handled from Home or the Reports tab header. The
              Continue Assessment button at the top of the hero is the
              right affordance for picking up where they left off. */}
        </div>}
        </div>
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
            <button onClick={async()=>{await onRecover(t.id);setItems(await Backup.listTrash())}} style={{padding:'10px 16px',background:`${mix('accent', 8)}`,border:`1px solid ${mix('accent', 19)}`,borderRadius:10,color:ACCENT,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Recover</button>
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
      {/* Global offline banner — sits above the header so the
          offline state is impossible to miss. PendingSyncIndicator
          below stays as the source-of-truth for queue depth + last
          sync time; this banner is the binary "are we connected"
          signal. */}
      <OfflineBanner />
      <header style={{position:'fixed',top:0,left:0,right:0,zIndex:100,background:`${mix('bg', 95)}`,backdropFilter:'blur(24px) saturate(1.4)',WebkitBackdropFilter:'blur(24px) saturate(1.4)',borderBottom:`1px solid ${BORDER}`,paddingTop:'env(safe-area-inset-top, 0px)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:48,padding:`0 ${padX}px`,maxWidth:contentMax,margin:'0 auto'}}>
          {/* Left cluster — hamburger menu (with its dropdown). The
              "AtmosFlow" wordmark used to live here; it's been removed
              so the menu sits flush at the left edge and the right
              cluster (status pills + avatar) reads as the identity
              column. The relative positioning anchors the dropdown
              menu below to this left cluster instead of the right
              one, so the popover now opens DOWN-LEFT from the
              hamburger rather than down-right. */}
          <div style={{position:'relative',display:'flex',alignItems:'center'}}>
            {profile && (
              <button
                ref={menuButtonRef}
                onClick={(e)=>{
                  // Cache the rect when opening so the portal'd menu
                  // can render with `position: fixed` anchored to the
                  // button. Reading at toggle-time (not on every render)
                  // avoids layout thrash.
                  if (!showHomeMenu) {
                    const r = e.currentTarget.getBoundingClientRect()
                    setMenuAnchor({ top: r.bottom + 8, left: r.left })
                  }
                  setShowHomeMenu(v=>!v)
                }}
                aria-label="Open menu"
                aria-haspopup="menu"
                aria-expanded={showHomeMenu}
                style={{width:36,height:36,borderRadius:10,background:showHomeMenu ? CARD : 'transparent',border:`1px solid ${BORDER}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <I n="menu" s={22} c={ACCENT} w={2.6} />
              </button>
            )}
            {showHomeMenu && (() => {
              // Demo entries by user mode. For FM users there's only
              // one demo (Sample Air Quality Check); for everyone else
              // the two scored demos (Office Building, Data Center)
              // share the picker. runDemo() with no arg defaults to
              // 'office' inside the handler.
              const demoItems = userMode === 'fm'
                ? [{ label: 'Sample Air Quality Check', icon: 'play', onClick: () => runDemo() }]
                : [
                    { label: 'Office Building', icon: 'play', onClick: () => runDemo() },
                    { label: 'Data Center',     icon: 'play', onClick: () => runDemo('dc') },
                  ]
              const mainItems = [
                { label: 'Search',       icon: 'search', onClick: () => setView('search') },
                { label: 'Settings',     icon: 'gear',   onClick: () => setView('settings') },
                { label: themeMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode',
                  icon: themeMode === 'light' ? 'moon' : 'sun',
                  onClick: () => { toggleThemeMode() } },
                { label: 'Trash',        icon: 'trash',  onClick: () => setView('trash') },
                { label: 'Sampling forms', icon: 'flask', onClick: () => setView('sampling-forms') },
                { label: 'Logger Studio', icon: 'chart', onClick: () => setView('sensor-data') },
                { label: 'Projects',     icon: 'bldg',   onClick: () => setView('projects') },
                // Single Demos entry — opens the sub-picker instead
                // of running a demo directly. The "submenu" flag tells
                // the click handler to stay open + switch mode rather
                // than close.
                { label: 'Demos', icon: 'play', submenu: 'demos' },
                { label: 'Help & Support', icon: 'help', onClick: () => { window.location.href = 'mailto:support@prudenceehs.com?subject=AtmosFlow%20support' } },
                { label: 'Sign out',     icon: 'logout', onClick: handleLogout, divider: true, danger: true },
              ]
              const closeMenu = () => { setShowHomeMenu(false); setHomeMenuMode('main') }
              // The menu + backdrop are portaled to document.body so they
              // escape the header's containing block. The header has
              // `backdrop-filter: blur(24px)` which (per CSS spec)
              // creates a containing block for `position: fixed`
              // descendants — without the portal, the backdrop's
              // `inset: 0` would clip to the header strip, leaving the
              // page below tap-unreachable. The anchor coordinates come
              // from the hamburger button's bounding rect, cached on
              // open.
              const anchor = menuAnchor || { top: 60, left: 12 }
              return createPortal(
                <>
                  {/* Full-viewport backdrop. Sits at z-1000 — well above
                      the header (100), bottom nav (100), floating CTA
                      (90), and any sheet/modal stack. Both onClick and
                      onPointerDown handlers so iOS catches the first
                      touch even if the click event is swallowed by a
                      tap-cancel on scroll-jitter. */}
                  <div
                    onClick={closeMenu}
                    onPointerDown={closeMenu}
                    style={{
                      position:'fixed', inset:0, zIndex:1000,
                      background:'rgba(0,0,0,0.22)',
                      backdropFilter:'blur(6px)',
                      WebkitBackdropFilter:'blur(6px)',
                    }} />
                  {/* Menu — position:fixed anchored to the cached
                      button rect. Soft-glass surface matches the rest
                      of v3.3. z-1010 so it sits above its own backdrop. */}
                  <div role="menu" style={{
                    position:'fixed',
                    top: anchor.top, left: anchor.left,
                    minWidth:240, zIndex:1010, padding:6,
                    ...GLASS.elevated,
                    // Notion-like frosted translucency: drop the elevated
                    // surface's near-opaque 96% fill to ~70% and lean on a
                    // heavier backdrop blur, so the page reads softly
                    // through the menu instead of behind a solid block.
                    background:'color-mix(in srgb, var(--card) 70%, transparent)',
                    backdropFilter:'blur(30px) saturate(180%)',
                    WebkitBackdropFilter:'blur(30px) saturate(180%)',
                    borderRadius: RADII.sheet,
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.06), ' +
                      '0 12px 32px rgba(0,0,0,0.55), ' +
                      '0 2px 6px rgba(0,0,0,0.30)',
                    animation:'fadeUp .15s ease',
                  }}>
                    {homeMenuMode === 'demos' && (
                      // Submenu header — back button to return to the
                      // main menu without closing the popover.
                      <button
                        role="menuitem"
                        onClick={() => setHomeMenuMode('main')}
                        style={{
                          width:'100%',padding:'10px 14px 12px',background:'transparent',border:'none',borderRadius:10,
                          cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:10,
                          fontFamily:'inherit',color:SUB,fontSize:12,fontWeight:600,minHeight:36,letterSpacing:'0.3px',
                          textTransform:'uppercase',
                          borderBottom:`1px solid ${BORDER}`,marginBottom:4,borderRadius:0,
                        }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SUB} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="15 18 9 12 15 6" />
                        </svg>
                        <span>Demos</span>
                      </button>
                    )}
                    {(homeMenuMode === 'demos' ? demoItems : mainItems).map(item => (
                      <button
                        key={item.label}
                        role="menuitem"
                        onClick={() => {
                          if (item.submenu) { setHomeMenuMode(item.submenu); return }
                          closeMenu()
                          item.onClick()
                        }}
                        style={{
                          width:'100%',padding:'12px 14px',background:'transparent',border:'none',borderRadius:10,
                          cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,
                          fontFamily:'inherit',color:item.danger?DANGER:TEXT,fontSize:14,fontWeight:500,minHeight:44,
                          transition:'background 0.12s',
                          ...(item.divider?{marginTop:6,paddingTop:14,borderTop:`1px solid ${BORDER}`,borderRadius:0}:{}),
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = SURFACE }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <I n={item.icon} s={18} c={item.danger?DANGER:SUB} w={1.6} />
                        <span style={{flex:1}}>{item.label}</span>
                        {item.submenu && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SUB} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>,
                document.body
              )
            })()}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {isAssessing&&<span style={{fontSize:10,color:ACCENT,fontFamily:"var(--font-mono)",background:`${mix('accent', 4)}`,padding:'3px 10px',borderRadius:4,border:`1px solid ${mix('accent', 13)}`,letterSpacing:'0.5px'}}>SAVING</span>}
            {/* Home — compact icon control on deeper screens. The action
                always routes to the dashboard (not a one-step back), so a
                home glyph reads more honestly than a back arrow and frees
                the horizontal space the "← Home" text pill used to take.
                Square 36×36 footprint + radius matches the hamburger so
                the header chrome stays cohesive. */}
            {view!=='dash'&&view!=='history'&&view!=='search'&&view!=='settings'&&view!=='trash'&&view!=='tos'&&view!=='privacy'&&view!=='help'&&view!=='instrument-edit'&&view!=='incident-form'&&view!=='incident-log'&&view!=='incident-detail'&&view!=='sampling-forms'&&<button onClick={()=>{setView('dash');setViewRpt(null)}} aria-label="Home" title="Home" style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,cursor:'pointer',fontFamily:'inherit',width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'color 0.15s',WebkitTapHighlightColor:'transparent'}}><I n="home" s={17} c={SUB} w={1.8} /></button>}
            {/* Subscription-status pill — exception-only. In beta
                the helper returns null. Phase 2+ surfaces it on
                diverging state (payment failed, plan cancelling,
                beta ending). Lives next to the hamburger so the
                user can act on it from any screen. */}
            {(() => {
              const state = getSubscriptionBannerState(profile)
              if (!state) return null
              const color = state.tone === 'danger' ? DANGER : WARN
              return (
                <button onClick={() => setView('settings')} aria-label={state.message} style={{padding:'5px 10px',borderRadius:8,background:`${color}10`,border:`1px solid ${color}30`,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,minHeight:32}}>
                  <span style={{fontSize:11,fontWeight:600,color,fontFamily:'var(--font-mono)'}}>{state.message}</span>
                </button>
              )
            })()}
            {/* Persistent right-cluster pill — search icon + profile
                avatar wrapped in a single rounded container. Reads as
                one identity-and-quick-find unit at the right edge of
                the header. Search opens the search view; avatar
                routes to Settings (account section). The pill
                background is one step UP the surface ladder (CARD
                over SURFACE) so it lifts off the blurred header
                background; the avatar sits flush inside with no
                gap between its right edge and the pill's right
                edge, matching the reference pattern. */}
            {profile && (
              <div style={{
                display:'flex', alignItems:'center', gap:2,
                // Soft-glass pill: low-opacity card surface with a
                // backdrop blur so it reads as a translucent layer
                // floating over the blurred header rather than a flat
                // CARD block. Inner highlight + outer drop give it the
                // tactile depth the rest of the v3.3 surface uses.
                ...GLASS.subtle,
                borderRadius: 999, padding:'2px 2px 2px 6px',
                height: 36, boxSizing:'border-box',
              }}>
                <button
                  type="button"
                  onClick={() => setView('search')}
                  aria-label="Search"
                  title="Search"
                  style={{
                    width:30, height:30, borderRadius:'50%',
                    background:'transparent', border:'none',
                    cursor:'pointer', display:'flex',
                    alignItems:'center', justifyContent:'center',
                    fontFamily:'inherit', padding:0,
                    WebkitTapHighlightColor:'transparent',
                  }}>
                  <I n="search" s={17} c={TEXT} w={2} />
                </button>
                {/* Voice command — speak a question and Jasper
                    answers. Sits between Search and the avatar in
                    the right-cluster pill so the assessor can
                    invoke it from any screen. Tapping opens the
                    fullscreen Voice Command modal; the transcript
                    routes to Jasper via the initialMessage prop. */}
                <button
                  type="button"
                  onClick={() => { supabase && trackEvent('jasper_open', { source: 'voice_command' }); setVoiceCmdOpen(true) }}
                  aria-label="Ask Jasper by voice"
                  title="Ask Jasper by voice"
                  style={{
                    width:30, height:30, borderRadius:'50%',
                    background:'transparent', border:'none',
                    cursor:'pointer', display:'flex',
                    alignItems:'center', justifyContent:'center',
                    fontFamily:'inherit', padding:0,
                    WebkitTapHighlightColor:'transparent',
                  }}>
                  {/* Mic glyph — same wireframe as VoiceInputButton
                      so the affordance reads as "voice" across the
                      app, just visually paired with Jasper here by
                      the context (header pill, not a textarea). */}
                  <svg width="16" height="16" viewBox="0 0 24 24"
                    fill="none" stroke="var(--text)" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                  </svg>
                </button>
                <ProfileAvatar
                  profile={profile}
                  size={30}
                  onClick={() => setView('settings')}
                  ariaLabel={`Open account ${profile.name ? `for ${profile.name}` : ''}`.trim()}
                  ringTone="none"
                />
              </div>
            )}
          </div>
        </div>
      </header>
      <div style={{height:'calc(48px + env(safe-area-inset-top, 0px))'}} />

      {milestone&&<div style={{position:'fixed',inset:0,background:`${mix('bg', 94)}`,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 32px'}}><div style={{textAlign:'center',animation:'milestoneIn .5s cubic-bezier(.22,1,.36,1)'}}><div style={{marginBottom:20,display:'flex',justifyContent:'center'}}><div style={{width:80,height:80,borderRadius:22,background:`${mix('accent', 7)}`,border:`1.5px solid ${mix('accent', 19)}`,display:'flex',alignItems:'center',justifyContent:'center'}}><I n={milestone.icon} s={40} c={ACCENT} w={2} /></div></div><div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.5px',color:TEXT}}>{milestone.title}</div><div style={{fontSize:15,color:ACCENT,fontFamily:"var(--font-mono)",marginTop:10}}>{milestone.sub}</div></div></div>}

      {/* Zone Complete bottom sheet — appears after the last question
          in a zone. Soft-glass; the existing finishAssessment() call
          is the "tap outside to dismiss" semantic equivalent (closes
          the sheet without finalizing), so onClose just sets the
          prompt state back to false without finishing. */}
      {zonePrompt && (
        <BottomSheet title="Zone complete" onClose={()=>setZonePrompt(false)} ariaLabel="Zone complete — add another or finish">
          <div style={{...V3.T.bodyDim, margin:'4px 0 18px'}}>Add another zone to this assessment, or wrap up and review findings?</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <TactileButton
              variant="secondary"
              fullWidth
              onClick={()=>{trackEvent('zone_added',{zone_index:zones.length});setZonePrompt(false);setZones(p=>[...p,{}]);setCurZone(zones.length);setZqi(0)}}
              icon={<I n="bldg" s={16} c="var(--accent)" w={1.8} />}
            >
              Add another zone
            </TactileButton>
            <TactileButton
              variant="primary"
              fullWidth
              haptic="success"
              onClick={()=>{setZonePrompt(false);finishAssessment()}}
              iconRight={<I n="check" s={16} c={PRIMARY_CTA_ICON} w={2.2} />}
            >
              Finish walkthrough
            </TactileButton>
          </div>
        </BottomSheet>
      )}

      {/* Persistent badge that surfaces the offline sync queue. Renders
          nothing when the queue is empty and no recent error — sits to
          the right of the transient connection toast when both are
          visible. */}
      <PendingSyncIndicator />

      {/* ── Connection Toast ── */}
      {connectionToast && (
        <div style={{position:'fixed',top:'calc(56px + env(safe-area-inset-top, 0px))',left:'50%',transform:'translateX(-50%)',zIndex:300,padding:'10px 20px',borderRadius:8,background:connectionToast==='offline'?'#F59E0B':'#22C55E',color:'#000',fontSize:12,fontWeight:600,fontFamily:'inherit',boxShadow:'0 4px 20px rgba(0,0,0,0.4)',animation:'fadeUp .3s ease',display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:connectionToast==='offline'?'#92400E':'#166534'}} />
          {connectionToast==='offline'?'You\'re offline — changes will sync when reconnected':'Back online — syncing data'}
        </div>
      )}

      {/* ── Pre-assessment disclaimer — bottom sheet ──
          Four advisory panels rendered as in-sheet soft-glass cards
          so the disclaimers feel like read-and-acknowledge items
          rather than dense legal-form text. Tap outside dismisses
          (the user is not committing yet); the explicit primary
          button is the consent action. */}
      {showDisclaimer && (
        <BottomSheet
          title="Before you begin"
          onClose={()=>setShowDisclaimer(false)}
          maxWidth={460}
          ariaLabel="Pre-assessment disclaimer"
        >
          <div style={{display:'flex',alignItems:'center',gap:10,margin:'4px 0 14px'}}>
            <I n="shield" s={18} c={ACCENT} w={1.6} />
            <div style={V3.T.captionDim}>Acknowledge before starting</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10,fontSize:13,color:SUB,lineHeight:1.6,marginBottom:18}}>
            {[
              { label: 'Advisory use only', body: 'All outputs generated by AtmosFlow are advisory and intended to support — not replace — professional judgment by a qualified industrial hygienist or EHS professional.' },
              { label: 'Scoring methodology', body: 'Scoring applies deterministic rules informed by recognized ventilation, comfort, and exposure standards. It does not constitute a compliance certification or regulatory determination.' },
              { label: 'Assessor responsibility', body: 'You are responsible for interpreting findings, reviewing all generated outputs, and exercising professional judgment before any deliverable is shared with clients or used for decision-making.' },
              { label: 'Report review', body: 'AI-generated narratives and automated findings require professional review before client delivery. AtmosFlow does not provide legal, regulatory, or medical advice.' },
            ].map((d, i) => (
              <div key={i} style={{...GLASS.subtle, padding:'12px 14px', borderRadius:RADII.md}}>
                <div style={{...V3.T.micro, marginBottom:4}}>{d.label}</div>
                <div style={{color:V3.TEXT_SECONDARY}}>{d.body}</div>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:10,flexDirection:'column'}}>
            <TactileButton variant="primary" fullWidth size="lg" onClick={proceedAfterDisclaimer} haptic="success">
              I understand — begin walkthrough
            </TactileButton>
            <TactileButton variant="ghost" fullWidth onClick={()=>setShowDisclaimer(false)}>
              Not yet
            </TactileButton>
          </div>
          <div style={{textAlign:'center',marginTop:10,fontSize:10,color:DIM}}>By proceeding, you acknowledge these terms for this session.</div>
        </BottomSheet>
      )}

      {/* ── Pricing Modal ── */}
      {showPricing && (
        <PricingSheet
          profile={profile}
          credits={credits}
          contentMax={contentMax}
          onClose={() => setShowPricing(false)}
        />
      )}

      {/* ── Credit Definition Sheet ──
          CIH credibility — vague billing units erode professional
          trust. Tap on the credits chip in the Home header opens this
          small sheet (definition only, plus per-credit price by plan
          and a Buy Credits CTA) so the unit is never opaque. Same
          definition is mirrored in Settings → About to satisfy the
          "matches the billing engine and MSA pricing schedule"
          consistency requirement. (FTC dark-patterns guidance;
          Cialdini, *Influence*.) ── */}
      {/* Credit-definition mini-sheet removed — Phase 1 of the
          billing-architecture migration deletes the credit model
          entirely. The user paid at subscription time; the product
          surface no longer carries a billing UI. See
          src/utils/subscriptionState.js for the new helper that
          replaces it (always-null in beta), and the pricing-
          architecture prompt for the Phase 2+ subscription-tier
          model. */}

      {/* ── Photo Selection — bottom sheet ─────────────────────────
          Soft-glass sheet listing every captured photo with a tick
          affordance. Skip Photos and Export with N Photos remain;
          the row toggles use the new accent-tinted selected state
          but otherwise keep the same multi-select semantics. */}
      {showPhotoSelect && (
        <BottomSheet
          title="Include photos"
          onClose={()=>setShowPhotoSelect(false)}
          maxWidth={contentMax}
          ariaLabel="Select photos to include in the report"
        >
          <div style={{...V3.T.bodyDim, margin:'4px 0 14px'}}>Select which photos to include in the report.</div>
          {Object.keys(photos).filter(k=>(photos[k]||[]).length>0).map(k=>{
            const zi=parseInt(k.match(/^z(\d+)-/)?.[1]??'-1')
            const fieldId=k.replace(/^z\d+-/,'')
            const fieldLabels={dp:'Condensate drain pan',wd:'Water damage',mi:'Mold indicators'}
            const zoneName=zones[zi]?.zn||`Zone ${zi+1}`
            return (photos[k]||[]).map((p,i)=>{
              const sel = !!selectedPhotos[`${k}::${i}`]
              return (
                <button key={`${k}::${i}`} onClick={()=>setSelectedPhotos(prev=>({...prev,[`${k}::${i}`]:!prev[`${k}::${i}`]}))} style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:sel?`color-mix(in srgb, var(--accent) 8%, transparent)`:'transparent',border:`1px solid ${sel?'color-mix(in srgb, var(--accent) 30%, transparent)':V3.BORDER_DEFAULT}`,borderRadius:10,marginBottom:6,cursor:'pointer',fontFamily:'inherit',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                  <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${sel?ACCENT:DIM}`,background:sel?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {sel && <span style={{color:ON_ACCENT,fontSize:12,fontWeight:700}}>✓</span>}
                  </div>
                  {p.src && <img src={p.src} alt="" style={{width:48,height:48,objectFit:'cover',borderRadius:6,flexShrink:0}} />}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:TEXT}}>{fieldLabels[fieldId]||fieldId}</div>
                    <div style={{fontSize:11,color:DIM,marginTop:2}}>{zoneName}{p.ts?` · ${new Date(p.ts).toLocaleTimeString()}`:''}</div>
                  </div>
                </button>
              )
            })
          })}
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <TactileButton variant="ghost" fullWidth onClick={()=>{setSelectedPhotos({});confirmExportWithPhotos()}}>Skip photos</TactileButton>
            <TactileButton variant="primary" fullWidth onClick={confirmExportWithPhotos}>
              Export with {Object.values(selectedPhotos).filter(Boolean).length} photo{Object.values(selectedPhotos).filter(Boolean).length!==1?'s':''}
            </TactileButton>
          </div>
        </BottomSheet>
      )}

      {/* ── Premium Gate — bottom sheet ─────────────────────────── */}
      {showPremiumGate && (
        <BottomSheet
          title="Unlock mission-critical IAQ features"
          onClose={()=>setShowPremiumGate(false)}
          maxWidth={420}
          ariaLabel="Data Center module — premium gate"
        >
          <div style={{...V3.T.bodyDim, margin:'4px 0 14px', lineHeight:1.65}}>
            The Data Center module activates specialized analytical logic for ASHRAE TC 9.9 thermal ranges and ANSI/ISA-71.04 corrosion tracking. Required for documenting compliance in facilities with high-value hardware and mission-critical uptime requirements.
          </div>
          <div style={{...GLASS.subtle, padding:'14px 16px', borderRadius:RADII.md, marginBottom:18}}>
            <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:12,color:V3.TEXT_SECONDARY,lineHeight:1.5}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{color:ACCENT,fontWeight:700}}>✓</span> ISA-71.04 gaseous corrosion classification</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{color:ACCENT,fontWeight:700}}>✓</span> ISO 14644-1 particle count tracking</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{color:ACCENT,fontWeight:700}}>✓</span> ASHRAE TC 9.9 thermal envelope scoring</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{color:ACCENT,fontWeight:700}}>✓</span> Creep corrosion risk pattern analysis</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{color:ACCENT,fontWeight:700}}>✓</span> Zone-specific equipment-focused weighting</div>
            </div>
          </div>
          <div style={{display:'flex',gap:10,flexDirection:'column'}}>
            <a
              href="mailto:support@prudenceehs.com?subject=Data Center Module — Enterprise Inquiry"
              style={{
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                padding:'15px 0', minHeight:48,
                background:'#F97316', color:'#000', fontSize:14, fontWeight:700,
                borderRadius:RADII.md, textDecoration:'none', fontFamily:'inherit',
                boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 18px rgba(249,115,22,0.30)',
                WebkitTapHighlightColor:'transparent',
              }}>
              Contact sales
            </a>
            <TactileButton variant="ghost" fullWidth onClick={()=>setShowPremiumGate(false)}>
              Back
            </TactileButton>
          </div>
        </BottomSheet>
      )}

      {/* ── Move-to-Trash confirmation — bottom sheet ──────────────
          Outside-tap dismiss now works (the old solid-modal had no
          backdrop click handler). Delete is a danger TactileButton
          with a heavier haptic so the confirmatory tap reads as
          deliberate. */}
      {delConf && (
        <BottomSheet
          title="Move to trash?"
          onClose={()=>setDelConf(null)}
          maxWidth={400}
          ariaLabel="Confirm move to trash"
        >
          <div style={{...V3.T.bodyDim, margin:'4px 0 10px'}}>You can recover this for 30 days.</div>
          <div style={{...GLASS.subtle, ...V3.T.captionDim, padding:'10px 14px', borderRadius:RADII.md, marginBottom:18}}>
            Recoverable from Dashboard → Trash
          </div>
          <div style={{display:'flex',gap:10,flexDirection:'column'}}>
            <TactileButton variant="danger" fullWidth haptic="heavy" onClick={()=>deleteItem(delConf.id,delConf.name,delConf.type)}>
              Delete
            </TactileButton>
            <TactileButton variant="ghost" fullWidth onClick={()=>setDelConf(null)}>
              Cancel
            </TactileButton>
          </div>
        </BottomSheet>
      )}

      {/* ── Calibration warning — bottom sheet ──────────────────── */}
      {calWarning && (
        <BottomSheet
          title="Instrument data missing"
          onClose={()=>setCalWarning(null)}
          maxWidth={420}
          ariaLabel="Instrument calibration warning"
        >
          <div style={{display:'flex',alignItems:'center',gap:10,margin:'4px 0 12px'}}>
            <div style={{width:36,height:36,borderRadius:10,background:`color-mix(in srgb, var(--warn) 14%, transparent)`,border:`1px solid color-mix(in srgb, var(--warn) 32%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <I n="alert" s={18} c={WARN} w={2} />
            </div>
            <div style={V3.T.captionDim}>Defensibility advisory</div>
          </div>
          <div style={{...V3.T.bodyDim, lineHeight:1.65, marginBottom:14}}>
            Reports generated without instrument identification and calibration records have reduced defensibility. The following information was not provided:
          </div>
          <div style={{...GLASS.subtle, padding:'12px 14px', borderRadius:RADII.md, marginBottom:18}}>
            {calWarning.map((m,i) => (
              <div key={i} style={{fontSize:12,color:WARN,lineHeight:1.8,paddingLeft:12,borderLeft:`2px solid color-mix(in srgb, var(--warn) 38%, transparent)`,marginBottom:i<calWarning.length-1?6:0}}>• {m}</div>
            ))}
          </div>
          <div style={{display:'flex',gap:10,flexDirection:'column'}}>
            <TactileButton variant="primary" fullWidth size="lg" onClick={()=>{setCalWarning(null);setDqi(Math.max(0, dtVis.findIndex(q=>q.id==='ps_inst_iaq')));setView('details')}}>
              Add instrument data
            </TactileButton>
            {savedInstruments.length > 0 && (
              <TactileButton variant="secondary" fullWidth size="lg" onClick={()=>{setCalWarning(null);setInstPickerOpen(true)}}>
                Use a saved instrument
              </TactileButton>
            )}
            <TactileButton variant="ghost" fullWidth onClick={()=>{setCalWarning(null);finishAssessment(true)}}>
              Continue without
            </TactileButton>
          </div>
          <div style={{textAlign:'center',marginTop:12,fontSize:10,color:DIM,lineHeight:1.5}}>Instrument metadata strengthens OSHA defensibility and professional credibility of assessment findings.</div>
        </BottomSheet>
      )}

      {instPickerOpen && (
        <BottomSheet
          title="Use a saved instrument"
          onClose={()=>setInstPickerOpen(false)}
          maxWidth={420}
          ariaLabel="Pick a saved instrument"
        >
          <div style={{...V3.T.bodyDim, lineHeight:1.6, margin:'4px 0 16px'}}>
            Pulls make/model, serial, and last-cal date from your profile. The
            calibration status is mapped automatically — confirm it on the
            instrument step before finalizing.
          </div>
          {savedInstruments.length === 0 ? (
            <div style={{...GLASS.subtle, padding:'16px', borderRadius:RADII.md, ...V3.T.captionDim, textAlign:'center'}}>
              No saved instruments yet. Add them in Settings → Instruments.
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {savedInstruments.map(inst => (
                <button key={inst.id} onClick={()=>pickInstrument(inst)} style={{width:'100%',textAlign:'left',padding:'14px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:RADII.md,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:12,WebkitTapHighlightColor:'transparent'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{...V3.T.bodyStrong, overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{inst.make || inst.nickname || 'Instrument'}</div>
                    <div style={V3.T.captionDim}>{inst.serial ? `S/N ${inst.serial}` : 'No serial'}{inst.lastCalDate ? ` · Cal ${inst.lastCalDate}` : ' · No cal date'}</div>
                  </div>
                  {isOutOfCal(inst) && <span style={{fontSize:10,fontWeight:700,color:WARN,padding:'2px 8px',borderRadius:4,background:`color-mix(in srgb, var(--warn) 12%, transparent)`,border:`1px solid color-mix(in srgb, var(--warn) 30%, transparent)`,letterSpacing:'0.3px',flexShrink:0}}>OVERDUE</span>}
                  <span style={{color:V3.TEXT_TERTIARY,fontSize:13,flexShrink:0}}>›</span>
                </button>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {reviewChooserOpen && (
        <BottomSheet
          title="Review for discrepancies"
          onClose={()=>setReviewChooserOpen(false)}
          maxWidth={420}
          ariaLabel="Review report for discrepancies"
        >
          <div style={{...V3.T.bodyDim, lineHeight:1.6, margin:'4px 0 16px'}}>
            AtmosFlow AI scans for internal inconsistencies — narrative vs data,
            missing defensibility items, and unfilled placeholders. A screening
            QA aid, not a substitute for professional review.{!PAYWALL_DISABLED ? ` Uses ${REVIEW_CREDIT_COST} credits.` : ''}
          </div>
          {reviewError && (
            <div style={{...GLASS.subtle, padding:'10px 12px', borderRadius:RADII.md, marginBottom:12, color:DANGER, fontSize:12, lineHeight:1.5}}>{reviewError}</div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <TactileButton variant="primary" fullWidth size="lg" disabled={reviewBusy} onClick={reviewCurrentReport}>
              Scan this report
            </TactileButton>
            <TactileButton variant="secondary" fullWidth size="lg" disabled={reviewBusy} onClick={()=>reviewDocxInputRef.current?.click()}>
              {reviewBusy ? 'Reading…' : 'Upload a Word (.docx) file'}
            </TactileButton>
          </div>
          <input
            ref={reviewDocxInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onPickReviewDocx}
            style={{display:'none'}}
            aria-hidden="true"
          />
        </BottomSheet>
      )}

      {/* ── DOCX Report Type Picker — bottom sheet ─────────────────
          Mobile-first soft-glass sheet. The three options are now
          tactile soft-glass cards (tap feedback + glass background)
          rather than flat-colored buttons. The "Both" option keeps
          its accent rail to read as the recommended path. */}
      {docxPicker && (
        <BottomSheet title="Export Word Report" onClose={()=>setDocxPicker(false)} ariaLabel="Choose report format">
          <div style={{fontSize:13,color:SUB,margin:'4px 0 16px',lineHeight:1.55}}>Choose which report format to generate.</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <GlassCard onClick={()=>{setDocxPicker(false);handleExport('docx','consultant')}} dense style={{padding:'14px 16px'}}>
              <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:3}}>Consultant Report</div>
              <div style={{fontSize:12,color:SUB,lineHeight:1.55}}>Narrative format with executive summary, interpretation, and recommendations. For client delivery.</div>
            </GlassCard>
            <GlassCard onClick={()=>{setDocxPicker(false);handleExport('docx','technical')}} dense style={{padding:'14px 16px'}}>
              <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:3}}>Technical Report</div>
              <div style={{fontSize:12,color:SUB,lineHeight:1.55}}>Structured findings register, score matrix, instrument log, and data gaps. For peer review and engineering.</div>
            </GlassCard>
            <GlassCard onClick={()=>{setDocxPicker(false);handleExport('docx','both')}} accent={ACCENT} dense style={{padding:'14px 16px'}}>
              <div style={{fontSize:14,fontWeight:700,color:ACCENT,marginBottom:3}}>Both Reports</div>
              <div style={{fontSize:12,color:SUB,lineHeight:1.55}}>Downloads both files — consultant report + technical report.</div>
            </GlassCard>
          </div>
          <div style={{marginTop:14}}>
            <TactileButton variant="ghost" fullWidth onClick={()=>setDocxPicker(false)}>Cancel</TactileButton>
          </div>
        </BottomSheet>
      )}

      {/* ── Consultant Report Preflight Modal ──
          Surfaces defensibility requirements + IH professional-judgment
          path. Pinned by tests/lib/consultant-report-preflight.test.ts. */}
      {preflight && (() => {
        const hasNonOverridable = preflight.triggers.some(t => !t.overridable)
        const overridableTriggers = preflight.triggers.filter(t => t.overridable)
        const allChecked = overridableTriggers.length > 0
          && overridableTriggers.every(t => overrideChecked[t.id])
        const justificationOk = overrideJustification.trim().length >= 10
        const canOverride = !hasNonOverridable && allChecked && justificationOk
        // Severity is derived in the UI layer (not the engine):
        //   • non-overridable triggers       → Required Before Issuance
        //   • overridable, but a non-overridable blocker is also present
        //     → effectively required, because the override path is gated
        //     off until the blocker clears (e.g., calibration override is
        //     unavailable until a reviewing professional is designated)
        //   • overridable, no blockers       → Professional Judgment Eligible
        const severityFor = (trig) => {
          if (!trig.overridable) return { label: 'Required Before Issuance', color: WARN, bg: mix('warn', 12) }
          if (hasNonOverridable)  return { label: 'Required Before Issuance', color: WARN, bg: mix('warn', 12) }
          return { label: 'Professional Judgment Eligible', color: ACCENT, bg: mix('accent', 8) }
        }
        return (
          <div style={{
            position:'fixed', inset:0,
            background:'rgba(0,0,0,0.55)',
            backdropFilter:'blur(6px)',
            WebkitBackdropFilter:'blur(6px)',
            zIndex:201, display:'flex', alignItems:'center', justifyContent:'center',
            padding:16, overflowY:'auto',
          }}>
            {/* Defensibility gate: deliberately no outside-tap dismiss
                so the user has to actively Cancel or Issue under
                documented judgment. Soft-glass treatment keeps the
                surface vocabulary consistent. */}
            <div style={{
              ...GLASS.elevated,
              borderRadius: RADII.card,
              padding: '24px 22px',
              maxWidth: 560, width: '100%', maxHeight: '92vh', overflowY: 'auto',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.06), ' +
                '0 24px 56px rgba(0,0,0,0.55)',
            }} data-testid="consultant-preflight-modal">
              <div style={{fontSize:20,fontWeight:700,color:TEXT,marginBottom:8,lineHeight:1.3}}>Report cannot be issued yet</div>
              <div style={{fontSize:13,color:SUB,marginBottom:22,lineHeight:1.55}}>AtmosFlow identified the following defensibility requirements that should be resolved before report issuance. Certain items may be issued under documented professional judgment by the reviewing IH.</div>

              <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:22}}>
                {preflight.triggers.map(trig => {
                  const sev = severityFor(trig)
                  return (
                    <div key={trig.id} data-testid={`preflight-trigger-${trig.id}`} style={{padding:'14px 16px',background:SURFACE,border:`1px solid ${trig.overridable && !hasNonOverridable ? BORDER : mix('warn', 19)}`,borderRadius:12}}>
                      <div style={{display:'inline-block',fontSize:10,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase',color:sev.color,background:sev.bg,padding:'4px 8px',borderRadius:6,marginBottom:8}}>{sev.label}</div>
                      <div style={{fontSize:14,fontWeight:600,color:TEXT,marginBottom:8,lineHeight:1.4}}>{trig.label}</div>
                      <div style={{fontSize:12,color:SUB,lineHeight:1.6,marginBottom:12,whiteSpace:'pre-wrap'}}>{trig.description}</div>
                      <div style={{fontSize:12,color:DIM,lineHeight:1.6,marginBottom:trig.overridable ? 12 : 0,whiteSpace:'pre-wrap'}}>{trig.fixWhere}</div>
                      {trig.overridable && !hasNonOverridable && (
                        <label style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',fontSize:12,color:SUB,lineHeight:1.6,padding:'10px 12px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,marginTop:4}}>
                          <input
                            type="checkbox"
                            data-testid={`preflight-override-${trig.id}`}
                            checked={!!overrideChecked[trig.id]}
                            onChange={e => setOverrideChecked(prev => ({...prev,[trig.id]: e.target.checked}))}
                            style={{marginTop:3,flexShrink:0}}
                          />
                          <span><strong style={{color:TEXT,fontWeight:600}}>Issue under documented professional judgment.</strong> {trig.overrideCaveat}</span>
                        </label>
                      )}
                      {!trig.overridable && (
                        <div style={{fontSize:12,color:WARN,fontWeight:600,lineHeight:1.6,marginTop:10}}>This requirement must be completed before report issuance.</div>
                      )}
                    </div>
                  )
                })}
              </div>

              {!hasNonOverridable && overridableTriggers.length > 0 && (
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:13,fontWeight:600,color:TEXT,marginBottom:8}}>Reviewing IH justification</div>
                  <div style={{fontSize:11,color:DIM,marginBottom:8,lineHeight:1.5}}>Required, minimum 10 characters.</div>
                  <textarea
                    data-testid="preflight-justification"
                    value={overrideJustification}
                    onChange={e=>setOverrideJustification(e.target.value)}
                    rows={4}
                    placeholder="Describe the professional basis for issuing under documented judgment (e.g., 'Calibration certificate on file at PSEC office, dated 2025-09-12. Field measurements taken under direct CIH supervision.')."
                    style={{width:'100%',padding:12,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,fontFamily:'inherit',resize:'vertical',lineHeight:1.55,boxSizing:'border-box'}}
                  />
                  <div style={{fontSize:11,color:DIM,marginTop:6,lineHeight:1.5}}>This justification is recorded on the report cover and retained in the deliverable's audit trail.</div>
                </div>
              )}

              <div style={{display:'flex',gap:10,flexDirection:'column'}}>
                {!hasNonOverridable && overridableTriggers.length > 0 && (
                  <button
                    data-testid="preflight-generate-override"
                    disabled={!canOverride}
                    onClick={executeConsultantWithOverride}
                    style={{padding:'15px 0',background: canOverride ? ACCENT : SURFACE,border: canOverride ? 'none' : `1px solid ${BORDER}`,borderRadius:10,color: canOverride ? 'var(--on-accent)' : DIM,fontSize:14,fontWeight:700,cursor: canOverride ? 'pointer' : 'not-allowed',fontFamily:'inherit',minHeight:48}}>
                    Issue report under documented professional judgment
                  </button>
                )}
                <button
                  data-testid="preflight-cancel"
                  onClick={()=>{setPreflight(null);setOverrideJustification('');setOverrideChecked({})}}
                  style={{padding:'13px 0',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>
                  Cancel — fix required items
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <div style={{maxWidth:contentMax,margin:'0 auto',padding:`0 ${padX}px`,position:'relative',zIndex:1}}>

        {view==='dash'&&(() => {
          // ── v3 Home — premium dark, expert-grade. Surfaces situational
          //    awareness when an assessment is in progress; falls back
          //    to a tight start panel when none is active. The legacy
          //    "two cyan pills floating on a black page" launcher pad
          //    was replaced because it conveyed nothing domain-specific
          //    about IH work and left ~50% of the viewport empty. The
          //    v3 layout is built from primitives in src/styles/tokens.js
          //    (panel, pill, tabItem, statBlock, …) so the next slice
          //    (Assessment detail screen) can reuse the same surface.
          const drafts = index.drafts || []
          const reports = index.reports || []
          const activeDraft = drafts[0] || null
          const isWide = isTablet || isTabletLand

          // Workflow stages — visual only on Home, all route to
          // resumeDraft until the per-stage detail views land in a
          // subsequent slice. The active marker reflects "current
          // focus" once stage tracking is available in draft state;
          // for now we anchor on Findings as the canonical entry.
          const stages = [
            { id: 'findings',  label: 'Findings',  icon: 'findings' },
            { id: 'pathways',  label: 'Pathways',  icon: 'chain' },
            { id: 'sampling',  label: 'Sampling',  icon: 'flask' },
            { id: 'narrative', label: 'Narrative', icon: 'notes' },
            { id: 'actions',   label: 'Actions',   icon: 'check' },
            { id: 'review',    label: 'Review',    icon: 'shield' },
          ]
          const activeStage = activeDraft?.stage || 'findings'

          return (
            // Bottom padding clears the bottom nav (64px) AND, when an
            // active draft is in flight, the floating Continue walkthrough
            // action bar (~76px) that pins above the nav. Without the
            // bump the last list item ends up tucked behind the CTA.
            <div style={{paddingTop:24, paddingBottom: activeDraft ? 200 : 100, maxWidth:contentMax,margin:'0 auto'}}>

              {/* Calibration exception banner — status-by-exception.
                  Surfaces only when the primary instrument's
                  calibration is within CAL_WARN_DAYS of expiry,
                  already expired, or has no recorded calibration
                  date — the cases that would have an IH peer
                  reviewer ask "would I sign my name to a report
                  this tool produced?" (Norman, status by exception;
                  Hollnagel, surface only what diverges.) */}
              {(() => {
                const banner = getCalibrationBannerState(profile?.iaq_meter, profile?.iaq_cal_date)
                if (!banner) return null
                const color = banner.tone === 'danger' ? DANGER : WARN
                return (
                  <div role="status" style={{padding:'10px 14px',background:`${color}10`,border:`1px solid ${color}30`,borderRadius:10,marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                    <I n="alert" s={14} c={color} w={1.8} />
                    <span style={{fontSize:12,color:TEXT,fontWeight:500,flex:1,minWidth:0}}>
                      {banner.kind === 'unrecorded' && (
                        <>{profile?.iaq_meter} <span style={{color:DIM}}>calibration date not recorded</span></>
                      )}
                      {banner.kind === 'expiring' && (
                        <>{profile?.iaq_meter} <span style={{color:DIM}}>calibration expires in</span> <span style={{fontFamily:'var(--font-mono)',color:color,fontWeight:600}}>{banner.daysToExpiry} days</span></>
                      )}
                      {banner.kind === 'expired' && (
                        <>{profile?.iaq_meter} <span style={{color:DIM}}>calibration expired</span> <span style={{fontFamily:'var(--font-mono)',color:color,fontWeight:600}}>{Math.abs(banner.daysToExpiry)} days</span> <span style={{color:DIM}}>ago</span></>
                      )}
                    </span>
                    <button onClick={()=>setView('settings')} style={{background:'none',border:'none',color:color,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>Review</button>
                  </div>
                )
              })()}

              {activeDraft ? (
                <>
                  {/* ── HERO: current assessment situational awareness ───
                      Soft-glass card with the in-progress accent rail at
                      the top. The Continue walkthrough CTA used to live
                      inside this card at the foot; it's now a floating
                      action bar pinned to the bottom of the dash view
                      (rendered below in the same view block), so the
                      hero focuses on situational awareness and the
                      primary action sticks to the thumb-reach zone of
                      the screen. */}
                  <GlassCard accent={V3.STATUS.inProgress} style={{padding:0, marginBottom:RHYTHM.base}}>
                    <div style={{padding:'20px 24px 0'}}>
                      <div style={{...V3.T.h1, marginBottom:6, overflow:'hidden', textOverflow:'ellipsis'}}>
                        {activeDraft.facility || 'Untitled Assessment'}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',color:V3.TEXT_TERTIARY,fontSize:12}}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
                          <I n="user" s={13} c={V3.TEXT_TERTIARY} w={1.6} />
                          <span>Assessment by you</span>
                        </span>
                        <span style={{color:V3.BORDER_STRONG}}>·</span>
                        <span style={{fontFamily:'var(--font-mono)'}}>{fD(activeDraft.ua || activeDraft.ts)}</span>
                        <StatusPill tone={V3.STATUS.inProgress} dim>In Progress</StatusPill>
                        {/* Real-time presence — surfaces other IHs
                            who joined the same assessment via the
                            Supabase Realtime presence channel. Renders
                            nothing in the solo case (the common case)
                            so the hero stays clean. */}
                        {profile?.id && (
                          <span style={{marginLeft:'auto'}}>
                            <CollaboratorsBar
                              assessmentId={activeDraft.id}
                              me={{ id: profile.id, name: profile.name, avatar_url: profile.avatar_url }}
                              currentZone={null}
                            />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Headline + screening framing. The earlier
                        "Screening in progress / Awaiting field data"
                        pill row was removed — those states are
                        already conveyed by the In Progress pill in
                        the header and the body copy below, so the
                        extra pills read as redundant chrome. */}
                    <div style={{padding:'20px 24px 4px',...V3.T.h2}}>
                      Continue capturing field data to refine the screening assessment
                    </div>
                    <div style={{padding:'0 24px 20px',...V3.T.bodyDim, maxWidth:640}}>
                      Severity, confidence, and recommended actions will populate as findings,
                      measurements, and zone observations are entered. Outputs are
                      screening-level — they identify risk indicators, not regulatory
                      determinations.
                    </div>

                    {/* Workflow tabs. Visual stage indicator until the
                        per-stage detail views ship — every tab resumes
                        the draft so users can pick up where they left
                        off without a dead-click. The inline meta band
                        that previously sat between the body copy and
                        these tabs (zones started · last touched ·
                        screening assessment) was removed: zones-started
                        is implicit in the workflow stage, last-touched
                        already appears in the header meta row, and
                        "screening assessment" is the only kind of
                        assessment the product produces. */}
                    {/* Inline workflow stepper. The container picks up
                        the same mobile-fit-and-finish treatment as the
                        V3.tabRow token (momentum scrolling, scroll-snap,
                        inline padding) so iOS swipes feel native and
                        first/last tabs don't hug the card edge. */}
                    <div style={{
                      padding:'14px 16px 16px',
                      display:'flex', alignItems:'stretch', gap:4,
                      overflowX:'auto', scrollbarWidth:'none',
                      WebkitOverflowScrolling:'touch',
                      scrollSnapType:'x proximity',
                      scrollPaddingInline:16,
                    }}>
                      {stages.map(s => {
                        const isActive = s.id === activeStage
                        return (
                          <button key={s.id} onClick={()=>{ haptic('light'); resumeDraft(activeDraft.id) }} {...pressFeedback()} style={{...V3.tabItem(isActive), ...pressFeedback.style}}>
                            <I n={s.icon} s={16} c={isActive ? 'var(--accent)' : V3.TEXT_TERTIARY} w={1.6} />
                            <span>{s.label}</span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Bottom card spacing — the resume CTA used to
                        live here but moved to a sticky floating action
                        bar at the bottom of the view so it's always
                        reachable from the thumb-zone regardless of
                        scroll position. */}
                    <div style={{padding:'4px 20px 20px'}} />
                  </GlassCard>

                  {/* Next recommended steps. The "Assessment details"
                      key:value panel that previously sat to the right
                      of this card was removed — facility / started /
                      last touched / zones / status all surface in the
                      hero header above, so the panel was a redundant
                      restatement. Single-column layout now. */}
                  <div style={{marginBottom:RHYTHM.section}}>
                    {/* Next action — drives the assessor forward */}
                    <GlassCard>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={V3.iconBox('var(--accent)')}>
                            <I n="target" s={16} c="var(--accent)" w={1.8} />
                          </div>
                          <div style={V3.T.h3}>Next recommended steps</div>
                        </div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:12}}>
                        <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                          <I n="check" s={16} c={V3.TEXT_TERTIARY} w={1.8} />
                          <div style={{flex:1,minWidth:0}}>
                            <div style={V3.T.body}>Complete the zone walkthrough</div>
                            <div style={V3.T.captionDim}>Capture observations, instrument readings, and HVAC notes per zone.</div>
                          </div>
                        </div>
                        <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                          <I n="check" s={16} c={V3.TEXT_TERTIARY} w={1.8} />
                          <div style={{flex:1,minWidth:0}}>
                            <div style={V3.T.body}>Record an outdoor reference reading</div>
                            <div style={V3.T.captionDim}>Needed for CO₂ and humidity Δ comparisons in the narrative.</div>
                          </div>
                        </div>
                        <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                          <I n="check" s={16} c={V3.TEXT_TERTIARY} w={1.8} />
                          <div style={{flex:1,minWidth:0}}>
                            <div style={V3.T.body}>Verify instrument calibration is current</div>
                            <div style={V3.T.captionDim}>Required for any quantitative finding to appear in the report.</div>
                          </div>
                        </div>
                      </div>
                    </GlassCard>

                  </div>

                  {/* Other in-progress assessments — only if multiple drafts.
                      Each row is a soft-glass card with tap feedback so
                      the list reads as a stack of individual cards rather
                      than a flat segmented control. */}
                  {drafts.length > 1 && (
                    <div style={{marginBottom:RHYTHM.section}}>
                      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10,padding:'0 2px'}}>
                        <div style={V3.T.micro}>Other in progress · {drafts.length - 1}</div>
                        <button onClick={()=>setView('history')} style={{background:'none',border:'none',color:'var(--accent)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>View all</button>
                      </div>
                      <div style={sgStack('tight')}>
                        {drafts.slice(1, 4).map((d) => (
                          <GlassCard key={d.id} dense onClick={()=>resumeDraft(d.id)} style={{padding:'14px 16px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:12,minHeight:44}}>
                              <div style={V3.iconBox(V3.STATUS.inProgress)}>
                                <I n="bldg" s={15} c={V3.STATUS.inProgress} w={1.6} />
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{d.facility || 'Untitled Assessment'}</div>
                                <div style={{...V3.T.captionDim, fontFamily:'var(--font-mono)'}}>{fD(d.ua || d.ts)}</div>
                              </div>
                              <StatusPill tone={V3.STATUS.inProgress} dim>In Progress</StatusPill>
                              <span style={{color:V3.TEXT_TERTIARY,fontSize:13}}>›</span>
                            </div>
                          </GlassCard>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ── No active draft — soft-glass start panel.
                    Friendly microcopy ("Start a walkthrough" instead of
                    "Start IAQ Assessment") reframes the workflow from
                    compliance form to field activity. The two CTAs use
                    TactileButton primary/secondary so the press feels
                    physical, with a light haptic on touch. */
                <GlassCard style={{padding:'28px 26px', marginBottom:RHYTHM.section}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                    <I n="airflow" s={18} c="var(--accent)" w={1.8} />
                    <div style={V3.T.micro}>AtmosFlow · Field co-pilot</div>
                  </div>
                  <div style={{...V3.T.h1, marginBottom:6}}>Ready to start a walkthrough?</div>
                  <div style={{...V3.T.bodyDim, maxWidth:560, marginBottom:20}}>
                    Capture field observations, instrument readings, and zone notes.
                    AtmosFlow organizes them into a screening-level professional
                    assessment with severity, confidence, and recommended actions.
                  </div>
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    <TactileButton variant="primary" size="sm" pill onClick={startNew} icon={<I n="play" s={13} c={PRIMARY_CTA_ICON} w={2} />}>
                      Start walkthrough
                    </TactileButton>
                    {/* Report an incident is a secondary action here, so
                        its accent border + tint are toned down (30%→16%
                        border, 12%→7% fill) to calm the neon-bright halo
                        the default secondary variant gave it on the dark
                        co-pilot card. */}
                    <TactileButton
                      variant="secondary"
                      size="sm"
                      pill
                      onClick={()=>setView('incident-form')}
                      icon={<I n="alert" s={13} c="var(--accent)" w={1.8} />}
                      style={{
                        background:'color-mix(in srgb, var(--accent) 7%, transparent)',
                        border:'1px solid color-mix(in srgb, var(--accent) 16%, transparent)',
                        boxShadow:'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.20)',
                      }}
                    >
                      Report an incident
                    </TactileButton>
                  </div>
                </GlassCard>
              )}

              {/* ── Finalized reports — stack of soft-glass cards.
                  Each report card uses tap feedback (scale + light
                  haptic) so the list reads as physical objects rather
                  than rows in a table. */}
              {reports.length > 0 && (
                <div>
                  <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10,padding:'0 2px'}}>
                    <div style={V3.T.micro}>Recent reports{reports.length > 0 ? ` · ${reports.length}` : ''}</div>
                    {reports.length > 3 && <button onClick={()=>setView('history')} style={{background:'none',border:'none',color:'var(--accent)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>View all</button>}
                  </div>
                  <div style={sgStack('tight')}>
                    {reports.slice(0, 3).map((r) => {
                      const band = getRiskBand(r.score ?? null)
                      return (
                        <GlassCard key={r.id} dense onClick={()=>openReport(r)} style={{padding:'14px 16px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:12,minHeight:44}}>
                            <div style={V3.iconBox(band.color)}>
                              <I n="report" s={15} c={band.color} w={1.6} />
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.facility || 'Untitled'}</div>
                              <div style={{...V3.T.captionDim, fontFamily:'var(--font-mono)'}}>{fD(r.ts)}</div>
                            </div>
                            <StatusPill tone={band.color} dim>{band.label}</StatusPill>
                            <span style={{color:V3.TEXT_TERTIARY,fontSize:13}}>›</span>
                          </div>
                        </GlassCard>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )
        })()}

        {/* ── Floating Continue walkthrough CTA ─────────────────────
            When the user has an active draft, a soft-glass action bar
            stickies to the bottom of the dash view above the bottom
            nav, always in thumb-reach regardless of scroll position.
            `drafts[0]` is the same expression the dash IIFE uses to
            derive its local `activeDraft`; computed inline here
            because the IIFE's locals aren't visible at this scope. ── */}
        {(() => {
          // `drafts` lives inside the dash IIFE, but `index` is the
          // outer-scope storage hook (line 309) — `index.drafts` is the
          // same array the IIFE reads from. Pull from there directly.
          const fab = view === 'dash' ? ((index?.drafts || [])[0] || null) : null
          if (!fab) return null
          return (
            <div style={{
              position: 'fixed',
              left: 0, right: 0,
              // Sits above the bottom-nav (height ~64) + safe-area inset
              // so the CTA never overlaps the nav. zIndex below the nav
              // (100) so a stray full-bleed dropdown can't trap focus.
              bottom: `calc(72px + env(safe-area-inset-bottom, 0px))`,
              zIndex: 90,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              padding: '0 14px',
            }}>
              <div style={{
                ...GLASS.elevated,
                maxWidth: contentMax,
                width: '100%',
                borderRadius: RADII.sheet,
                padding: '10px 12px',
                pointerEvents: 'auto',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                boxShadow:
                  '0 -6px 20px rgba(0,0,0,0.32), ' +
                  '0 12px 28px rgba(0,0,0,0.42), ' +
                  'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}>
                <div style={{flex:1,minWidth:0,padding:'0 6px'}}>
                  <div style={{...V3.T.captionDim, marginBottom:2}}>Active walkthrough</div>
                  <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                    {fab.facility || 'Untitled Assessment'}
                  </div>
                </div>
                <TactileButton
                  variant="primary"
                  size="sm"
                  pill
                  onClick={()=>resumeDraft(fab.id)}
                  iconRight={<I n="play" s={13} c={PRIMARY_CTA_ICON} w={2} />}
                  // Drop the primary variant's accent glow on this floating
                  // bar — it bled a cyan halo onto the page behind the bar.
                  // Keep the inner highlight + subtle dark drop for depth.
                  style={{boxShadow:'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.20)'}}
                >
                  Continue walkthrough
                </TactileButton>
              </div>
            </div>
          )
        })()}

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
            <div style={{padding:18,background:CARD,border:`1px solid ${mix('accent', 19)}`,borderRadius:12,marginBottom:14}}>
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
                }} style={{flex:1,padding:'12px 18px',background:ACCENT,border:'none',borderRadius:8,color:ON_ACCENT,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:44,opacity:(!eqForm.label || !eqForm.type) ? 0.4 : 1}}>{editingEqId === '__new' ? 'Add Equipment' : 'Save'}</button>
              </div>
            </div>
          ) : (
            <button onClick={()=>{setEditingEqId('__new'); setEqForm({})}} style={{width:'100%',padding:'14px 0',background:`${mix('accent', 6)}`,border:`1px dashed ${mix('accent', 25)}`,borderRadius:10,color:ACCENT,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',marginBottom:14,minHeight:48}}>+ Add HVAC Equipment</button>
          )}

          {/* Continue / Skip */}
          <div style={{display:'flex',gap:10,marginTop:18}}>
            <button onClick={()=>{setView('quickstart'); setQsqi(qsVis.length-1)}} style={{flex:0,padding:'14px 22px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>← Back</button>
            <button onClick={finishEquipment} style={{flex:1,padding:'14px 22px',background:ACCENT,border:'none',borderRadius:10,color:ON_ACCENT,fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>{(equipment||[]).length === 0 ? 'Skip — Continue to Zones →' : 'Continue to Zones →'}</button>
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
              <div style={{marginTop:12,padding:'12px 14px',background:`${mix('accent', 2)}`,border:`1px solid ${mix('accent', 13)}`,borderRadius:10}}>
                <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:8}}>Served by HVAC equipment</div>
                {(equipment||[]).length === 0 ? (
                  <div style={{fontSize:12,color:SUB,lineHeight:1.5}}>No equipment captured. Recommendations for this zone will surface as building-wide actions until equipment is identified. <button onClick={()=>setView('equipment')} style={{background:'none',border:'none',color:ACCENT,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0,textDecoration:'underline'}}>Add equipment →</button></div>
                ) : (
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {equipment.map(e => {
                      const on = sel.includes(e.id)
                      return (
                        <button key={e.id} onClick={()=>toggleZoneEquipment(curZone, e.id)} style={{padding:'6px 12px',borderRadius:6,background:on?`${mix('accent', 9)}`:'transparent',border:`1px solid ${on?ACCENT:BORDER}`,color:on?ACCENT:SUB,fontSize:12,fontWeight:on?600:500,cursor:'pointer',fontFamily:'inherit',minHeight:32}}>
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
                    }} style={{padding:'6px 12px',borderRadius:6,background:sel.length===0?`${mix('dim', 9)}`:'transparent',border:`1px solid ${sel.length===0?DIM:BORDER}`,color:sel.length===0?TEXT:SUB,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',minHeight:32}}>
                      {sel.length === 0 && <span style={{marginRight:4}}>✓</span>}Unknown
                    </button>
                  </div>
                )}
              </div>
            )
          })()}
          {renderQuestion(zcq,zData,setZF,zqi,zVis,()=>{if(zqi<zVis.length-1)setZqi(zqi+1)},()=>{if(zqi>0)setZqi(zqi-1)},()=>{setZonePrompt(true)},'Complete Zone ✓',zSecs)}
        </div>}

        {view==='details'&&dtcq&&renderQuestion(dtcq,mergedData,setQSField,dqi,dtVis,()=>{if(dqi<dtVis.length-1)setDqi(dqi+1)},()=>{if(dqi>0)setDqi(dqi-1)},finishDetails,'Done ✓',dtSecs,
          dtcq.id==='ps_inst_iaq' && savedInstruments.length>0 ? (
            <button onClick={()=>setInstPickerOpen(true)} style={{width:'100%',padding:'12px 16px',marginBottom:16,background:mix('accent',6),border:`1px solid ${mix('accent',18)}`,borderRadius:14,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:10,fontFamily:'inherit',WebkitTapHighlightColor:'transparent'}}>
              <I n="gear" s={16} c={ACCENT} w={1.8} />
              <span style={{flex:1,...V3.T.bodyStrong,color:ACCENT}}>Use a saved instrument</span>
              <span style={V3.T.captionDim}>{savedInstruments.length}</span>
            </button>
          ) : null)}

        {(view==='results'||view==='report')&&renderResults(view==='report')}

        {view==='search'&&<SearchView
          index={index}
          onOpenReport={(r)=>openReport(r)}
          onResumeDraft={(id)=>resumeDraft(id)}
          onOpenIncident={(inc)=>{setCurrentIncident(inc);setView('incident-detail')}}
          onNavigate={(v)=>setView(v)}
        />}

        {view==='history'&&<div style={{paddingTop:28,paddingBottom:100,maxWidth:contentMax,margin:'0 auto'}}>
          {/* ── Reports header ──────────────────────────────────────
              The "New Assessment" CTA that previously sat here was
              removed. The clickable draft-icon in the empty-state
              card below is now the start-an-assessment affordance
              within the Reports tab; the Home tab also offers it. */}
          <div style={{marginBottom:20}}>
            <div style={{...V3.T.h1, marginBottom:4}}>Reports</div>
            <div style={V3.T.bodyDim}>Drafts and finalized deliverables · {((index.drafts||[]).length + (index.reports||[]).length)} total</div>
          </div>

          {/* ── Drafts / In Progress ──────────────────────────────── */}
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10,padding:'0 2px'}}>
            <div style={V3.T.micro}>{userMode === 'fm' ? 'In Progress' : 'Drafts'}{(index.drafts||[]).length>0?` · ${(index.drafts||[]).length}`:''}</div>
          </div>
          {(index.drafts||[]).length === 0 ? (
            // Empty state — the draft icon is the start-an-assessment
            // affordance now that the header CTA has been removed.
            // Rendered as a <button> for keyboard + screen-reader
            // accessibility; visual treatment matches V3.iconBox.
            <div style={{...V3.panel(), display:'flex',alignItems:'center',gap:14,marginBottom:24,padding:'18px 22px'}}>
              <button
                onClick={startNew}
                aria-label="Start new assessment"
                style={{...V3.iconBox(V3.STATUS.draft),padding:0,cursor:'pointer',fontFamily:'inherit',WebkitTapHighlightColor:'transparent'}}
              >
                <I n="draft" s={15} c={V3.STATUS.draft} w={1.6} />
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={V3.T.bodyStrong}>No drafts in progress</div>
                <div style={V3.T.captionDim}>Start a new assessment to capture field observations.</div>
              </div>
            </div>
          ) : (
            <div style={{background:CARD,border:`1px solid ${V3.BORDER_DEFAULT}`,borderRadius:V3.R.lg,marginBottom:24,overflow:'hidden'}}>
              {(index.drafts||[]).map((d, i) => (
                <div key={d.id} style={{padding:'14px 16px',background:'transparent',borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`,display:'flex',alignItems:'center',gap:12}}>
                  <div style={V3.iconBox(V3.STATUS.inProgress)}><I n="bldg" s={15} c={V3.STATUS.inProgress} w={1.6} /></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{d.facility||'Untitled Assessment'}</div>
                    {/* "In Progress" pill removed — rows in the
                        Drafts section are by definition in-progress,
                        and the section header already labels them as
                        such ("DRAFTS · N"). The Resume button to the
                        right is the action signal. */}
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
                      <span style={{...V3.T.captionDim, fontFamily:'var(--font-mono)'}}>{fD(d.ua||d.ts)}</span>
                    </div>
                  </div>
                  <button onClick={()=>resumeDraft(d.id)} style={V3.btnPrimary}>Resume</button>
                  <button onClick={(e)=>{e.stopPropagation();setDelConf({id:d.id,name:d.facility,type:'dft'})}} style={{width:40,height:40,background:`${DANGER}10`,border:`1px solid ${DANGER}28`,borderRadius:V3.R.md,color:DANGER,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',flexShrink:0,WebkitTapHighlightColor:'transparent'}}>
                    <I n="trash" s={14} c={DANGER} w={1.4} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Finalized ─────────────────────────────────────────── */}
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10,padding:'0 2px'}}>
            <div style={V3.T.micro}>Finalized{(index.reports||[]).length>0?` · ${(index.reports||[]).length}`:''}</div>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:14}}>
            <div style={{flex:1,position:'relative'}}>
              <input type="text" value={hSearch} onChange={e=>setHSearch(e.target.value)} placeholder="Search finalized reports..." style={{width:'100%',padding:'12px 14px 12px 38px',background:CARD,border:`1px solid ${V3.BORDER_DEFAULT}`,borderRadius:V3.R.md,color:TEXT,fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box',minHeight:44}} />
              <div style={{position:'absolute',top:'50%',left:14,transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}>
                <I n="search" s={14} c={V3.TEXT_TERTIARY} w={1.8} />
              </div>
            </div>
            <select value={hSort} onChange={e=>setHSort(e.target.value)} style={{padding:'12px 14px',background:CARD,border:`1px solid ${V3.BORDER_DEFAULT}`,borderRadius:V3.R.md,color:V3.TEXT_SECONDARY,fontSize:13,fontFamily:'inherit',outline:'none',minHeight:44,cursor:'pointer'}}>
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="score-low">Score ↑</option><option value="score-high">Score ↓</option>
            </select>
          </div>
          {fReports.length === 0 ? (
            <div style={{...V3.panel(), padding:'40px 24px', textAlign:'center'}}>
              <div style={{...V3.iconBox(V3.TEXT_TERTIARY), width:48, height:48, margin:'0 auto 12px', borderRadius:V3.R.lg}}>
                <I n="report" s={20} c={V3.TEXT_TERTIARY} w={1.6} />
              </div>
              <div style={{...V3.T.h3, marginBottom:6}}>No reports generated yet</div>
              <div style={{...V3.T.bodyDim, marginBottom:hSearch?0:16}}>
                {hSearch ? 'No reports match your search.' : 'Complete and finalize an assessment to generate your first report.'}
              </div>
              {!hSearch && (
                // "View sample report" stays as the only action here —
                // it offers a distinct value prop (preview the output)
                // and starting a new assessment is reachable via the
                // clickable draft icon in the Drafts empty-state above
                // and from the Home tab.
                <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
                  <button onClick={runDemo} style={V3.btnGhost}>View sample report</button>
                </div>
              )}
            </div>
          ) : (
            <div style={{background:CARD,border:`1px solid ${V3.BORDER_DEFAULT}`,borderRadius:V3.R.lg,overflow:'hidden'}}>
              {fReports.map((r, i) => {
                const band = getRiskBand(r.score ?? null)
                return (
                  <div key={r.id} onClick={()=>openReport(r)} style={{padding:'14px 16px',background:'transparent',borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`,cursor:'pointer',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
                    <div style={V3.iconBox(band.color)}><I n="report" s={15} c={band.color} w={1.6} /></div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.facility||'Untitled'}</div>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
                        <span style={{...V3.T.captionDim, fontFamily:'var(--font-mono)'}}>{fD(r.ts)}</span>
                      </div>
                    </div>
                    <span style={V3.pill(band.color)}>{band.label}</span>
                    <button onClick={e=>{e.stopPropagation();setDelConf({id:r.id,name:r.facility,type:'rpt'})}} style={{width:36,height:36,background:'transparent',border:`1px solid ${V3.BORDER_DEFAULT}`,borderRadius:V3.R.md,color:V3.TEXT_TERTIARY,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit',flexShrink:0}}>
                      <I n="trash" s={13} c={V3.TEXT_TERTIARY} w={1.4} />
                    </button>
                    <span style={{color:V3.TEXT_TERTIARY,fontSize:13}}>›</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>}
        {view==='trash'&&<TrashView onRecover={async(id)=>{await Backup.recover(id);await refreshIndex()}} onDelete={async(id)=>{await Backup.permanentDelete(id)}} />}
        {view==='sampling-forms'&&<SamplingFormsView profile={profile} onBack={()=>setView('dash')} />}
        {view==='sensor-data'&&<SensorDataPage value={sensorData} onChange={setSensorData} onBack={()=>setView(comp?'results':'dash')} onAskInsights={launchSensorInsights} />}
        {view==='projects'&&<ProjectsScreen onBack={()=>setView('dash')} onOpen={(pid)=>{setProjectBackView('projects');setActiveProjectId(pid);setView('project-detail')}} />}
        {view==='project-detail'&&<ProjectDetail id={activeProjectId} profile={profile} onBack={()=>setView(projectBackView)} onOpenReport={(r)=>openReport(r)} />}
        {view==='settings'&&<SettingsScreen profile={profile} onEditProfile={()=>{sessionStorage.setItem('aiq_welcomed','1');setWelcomeDone(true);setProfile({...profile,isNew:true});setView('dash')}} onLogout={handleLogout} onClose={()=>setView('dash')} onNavigate={(v)=>{if(v==='pricing'){setShowPricing(true)}else{setView(v)}}} adminActive={!!adminSecret} onActivateAdmin={(secret)=>{setAdminSecret(secret);setView('admin')}} />}
        {view==='tos'&&<TermsOfService onBack={()=>setView('settings')} />}
        {view==='privacy'&&<PrivacyPolicy onBack={()=>setView('settings')} />}
        {view==='help'&&<HelpView onBack={()=>setView('settings')} />}
        {view==='instrument-edit'&&<InstrumentEditView profile={profile} onSave={(updated)=>{setProfile(updated);setView('settings')}} onCancel={()=>setView('settings')} />}
        {view==='admin'&&adminSecret&&<AdminDashboard onBack={()=>setView('settings')} adminSecret={adminSecret} />}
        {view==='incident-form'&&<IncidentForm onCancel={()=>setView('dash')} onSaved={(inc)=>{setCurrentIncident(inc);setView('incident-detail')}} />}
        {view==='incident-log'&&<IncidentLog profile={profile} onBack={()=>setView('dash')} onNewIncident={()=>setView('incident-form')} onView={(inc)=>{setCurrentIncident(inc);setView('incident-detail')}} />}
        {view==='incident-detail'&&currentIncident&&<IncidentDetail incident={currentIncident} profile={profile} onBack={()=>setView('incident-log')} onChange={setCurrentIncident} onDeleted={()=>{setCurrentIncident(null);setView('incident-log')}} />}
        {view==='properties'&&<PropertyDashboard onBack={()=>setView('dash')} onNavigate={(target,arg)=>{if(target==='building'){openBuildingProject(arg)}else{setView(target)}}} assessmentIndex={index} />}
        {view==='spatial'&&<SpatialMap zones={zones} zoneScores={zoneScores} floorPlan={floorPlan} onUploadFloorPlan={setFloorPlan} onUpdateZone={(zi, update)=>{const z=[...zones];z[zi]={...z[zi],...update};setZones(z)}} onClose={()=>{runScoring();setView('results')}} />}
      </div>

      {/* ── Bottom Tab Bar (v3) ──
          iOS Safari defensives retained: solid background (no scroll-
          bleed during URL-bar transitions), isolation:isolate for a
          clean stacking context, transform:translateZ(0) to force a
          compositor layer so position:fixed cannot be reinterpreted
          relative to an ancestor.
          v3 visual: top hairline + top accent rail above the active
          tab (instrument-panel cue, replaces the earlier scale 1.06
          "lift"), icon stays at its base size, label sits below. */}
      {!isAssessing && !milestone && (
        <nav style={{position:'fixed',bottom:0,left:0,right:0,zIndex:100,background:BG,borderTop:`1px solid ${V3.BORDER_DEFAULT}`,paddingBottom:'env(safe-area-inset-bottom, 0px)',isolation:'isolate',transform:'translateZ(0)',WebkitTransform:'translateZ(0)'}}>
          <div style={{display:'flex',justifyContent:'space-around',alignItems:'stretch',height:56,maxWidth:contentMax,margin:'0 auto'}}>
            {(userMode === 'fm' ? [
              {id:'dash',label:'Home',icon:'home'},
              {id:'properties',label:'Buildings',icon:'bldg'},
              {id:'incident-log',label:'Incidents',icon:'alert'},
              {id:'settings',label:'Settings',icon:'gear'},
            ] : [
              {id:'dash',label:'Home',icon:'home'},
              {id:'history',label:'Reports',icon:'report',badge:((index.drafts||[]).length+(index.reports||[]).length)||null},
              // AtmosFlow AI replaces the previous Search tab. The
              // brain-on-chip silhouette + same TEXT_TERTIARY →
              // accent treatment as every other tab so the row reads
              // as one cohesive nav. Labeled "AtmosFlow AI" to match
              // the assistant sheet's header — one consistent name
              // across every surface (the internal id stays 'jasper'
              // to avoid touching shipped event/table names).
              {id:'jasper',label:'AtmosFlow AI',icon:'jasper'},
              {id:'settings',label:'Settings',icon:'gear'},
            ]).map(t=>{
              const isJasper = t.id === 'jasper'
              const isActive = isJasper ? faOpen : (view === t.id)
              const onClick = isJasper
                ? () => { haptic('light'); supabase && trackEvent('jasper_open', { source: 'bottom_nav' }); setFaOpen(true) }
                : () => { haptic('light'); supabase && trackEvent('page_view', { tab: t.id }); setView(t.id); if (t.id === 'dash') setViewRpt(null) }
              return (
                <button
                  key={t.id}
                  onClick={onClick}
                  {...pressFeedback('soft')}
                  style={{flex:1,background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,paddingTop:6,fontFamily:'inherit',position:'relative',...pressFeedback.style}}>
                  {/* Top accent rail — only on the active tab. Cyan
                      hairline tucked under the nav's top border so the
                      visual is "this lane is lit", not a button glow.
                      For Jasper, the rail lights up while the
                      FieldAssistant sheet is open. */}
                  <div style={{position:'absolute',top:0,left:'20%',right:'20%',height:2,background:isActive?'var(--accent)':'transparent',borderRadius:'0 0 2px 2px',transition:'background 160ms ease'}} />
                  <div style={{position:'relative',display:'flex'}}>
                    {/* Ambient breathing glow behind the AI tab so the
                        assistant reads as "alive" / inviting. Sits behind
                        the icon, pointer-transparent; calms under
                        prefers-reduced-motion (static soft glow). */}
                    {isJasper && (
                      <span className="fa-breathe" aria-hidden="true" style={{
                        position:'absolute', top:'50%', left:'50%', width:34, height:34,
                        marginTop:-17, marginLeft:-17, borderRadius:'50%', pointerEvents:'none',
                        background:'radial-gradient(circle, color-mix(in srgb, var(--accent) 42%, transparent), transparent 70%)',
                      }} />
                    )}
                    {isJasper ? (
                      <JasperRobotIcon size={22} color={isActive ? 'var(--accent)' : V3.TEXT_TERTIARY} />
                    ) : (
                      <I n={t.icon} s={20} c={isActive?'var(--accent)':V3.TEXT_TERTIARY} w={isActive?2:1.7} />
                    )}
                    {t.badge>0&&<div style={{position:'absolute',top:-4,right:-8,minWidth:15,height:15,borderRadius:V3.R.pill,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'var(--on-accent-fill)',fontFamily:'var(--font-mono)',padding:'0 4px'}}>{t.badge}</div>}
                  </div>
                  <span style={{fontSize:10,fontWeight:isActive?600:500,color:isActive?'var(--accent)':V3.TEXT_TERTIARY,letterSpacing:'0.2px',transition:'color 160ms ease'}}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {/* The floating Field-Assistant FAB was retired when Jasper
          moved into the bottom-nav tab — two launchers for the same
          modal was redundant, and the FAB's bottom-right position
          visually overlapped the new Jasper tab. The Jasper tab in
          the nav is now the single launcher across the app. */}
      {/* Voice command modal — speaks → routes the transcript to
          Jasper via initialMessage. Lives at the app shell so it's
          available from every screen via the header pill's mic. */}
      {profile && (
        <VoiceCommandModal
          open={voiceCmdOpen}
          onCancel={() => setVoiceCmdOpen(false)}
          onSubmit={(transcript) => {
            setVoiceCmdOpen(false)
            setVoicePrefill(transcript)
            setFaOpen(true)
          }}
        />
      )}

      {profile && faOpen && (
        <FieldAssistant
          onClose={() => { setFaOpen(false); setVoicePrefill(null); setReviewPrefill(null); setReviewPayload(null); setSensorInsightsPrefill(null); setSensorInsightsPayload(null) }}
          onNavigate={(v) => { setFaOpen(false); setVoicePrefill(null); setReviewPrefill(null); setReviewPayload(null); setSensorInsightsPrefill(null); setSensorInsightsPayload(null); setView(v) }}
          initialMessage={voicePrefill || reviewPrefill || sensorInsightsPrefill}
          onAction={(action) => {
            // Agentic action executor. Jasper proposes via
            // propose_action tool → SSE → ActionCard in chat →
            // user taps Apply → this callback runs. Return
            // false to veto (rare); otherwise the hook marks
            // the card accepted.
            if (!action || typeof action !== 'object') return false
            if (action.type === 'navigate') {
              const target = action.target
              if (!target) return false
              // Results view also accepts an inner tab via the
              // tab_target field. Set rTab BEFORE setView so the
              // tab is correct when results mount.
              if (action.tab_target) setRTab(action.tab_target)
              setView(target)
              setFaOpen(false)
              setVoicePrefill(null)
              return true
            }
            if (action.type === 'add_zone_note') {
              const noteText = (action.note_text || '').trim()
              if (!noteText) return false
              // Append to the current zone's notes field. If
              // there's no current zone (e.g. user is on the
              // dashboard), reject — the model shouldn't have
              // proposed this. The notes field on a zone is
              // `nt` per the wizard schema; append with a
              // newline separator if there's existing content.
              const zoneIdx = curZone
              const zone = zones[zoneIdx]
              if (!zone) return false
              const prevNotes = zone.nt || ''
              const nextNotes = prevNotes
                ? `${prevNotes}\n${noteText}`
                : noteText
              const nextZones = zones.slice()
              nextZones[zoneIdx] = { ...zone, nt: nextNotes }
              setZones(nextZones)
              return true
            }
            return false
          }}
          context={{
            view,
            presurvey,
            bldg,
            current_zone: zones[curZone],
            zones_count: zones.length,
            incident: currentIncident,
            // Discrepancy-scan payload + directive (present only during a
            // "Review for discrepancies" run). Carries the report content
            // so the chat message can stay a short prompt.
            report_review: reviewPayload || undefined,
            // Sensor-analyzer summary + directive (present only during an
            // analyzer "Ask AtmosFlow AI for insights" run). Summary only —
            // never the raw time series.
            sensor_insights: sensorInsightsPayload || undefined,
            // Active-assessment label for the assistant's context chip +
            // prompt. Prefer the loaded assessment's facility; on the
            // dashboard (where bldg isn't hydrated until a draft is
            // resumed) fall back to the top in-progress draft so the
            // assistant still knows what the assessor is working on.
            active_assessment: (() => {
              const facility = bldg?.fn || (index?.drafts || [])[0]?.facility || null
              if (!facility) return null
              const status = (view === 'results' || view === 'report')
                ? 'Finalized report'
                : 'Draft assessment'
              return { facility, status }
            })(),
            profile_minimal: profile ? { plan: profile.plan, certs: profile.certs, firm: profile.firm } : null,
            // v1.5 Defensibility Copilot: when the user is in results
            // view, attach the readiness verdict so the agent can answer
            // "what's blocking this report?" with concrete gaps + the
            // ASHRAE / IICRC citations baked into the gap rationales —
            // no tool-calling round-trip required.
            readiness: (view === 'results' || view === 'report') && comp
              ? buildReadinessVerdict({
                  assessmentMode: 'SCREENING',
                  presurvey, building: bldg,
                  client: bldg && bldg.client ? bldg.client : {},
                  zones, zoneScores, recs, photos,
                  profile: profile ? { name: profile.name } : null,
                })
              : undefined,
          }}
        />
      )}

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes milestoneIn{from{opacity:0;transform:scale(.85) translateY(20px);}to{opacity:1;transform:scale(1) translateY(0);}}
        /* Motion polish — "alive" ambience. faZoneIn: the focused-zone
           drilldown expands in when you open a zone. faBreathe: the AI
           tab's ambient glow. faDrift: a very-low-intensity airflow
           gradient behind the results. All disabled under reduced-motion. */
        @keyframes faZoneIn{from{opacity:0;transform:translateY(8px) scale(.995);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes faBreathe{0%,100%{opacity:.22;transform:scale(.82);}50%{opacity:.55;transform:scale(1.12);}}
        @keyframes faDrift{0%{background-position:38% 0%;}50%{background-position:62% 14%;}100%{background-position:38% 0%;}}
        .fa-zone-in{animation:faZoneIn .26s cubic-bezier(.22,1,.36,1) both;}
        .fa-breathe{animation:faBreathe 3.6s ease-in-out infinite;}
        .fa-airflow{animation:faDrift 22s ease-in-out infinite;}
        @media (prefers-reduced-motion: reduce){
          .fa-zone-in{animation:none;}
          .fa-breathe{animation:none;opacity:.32;}
          .fa-airflow{animation:none;}
        }
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
