/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MobileApp — v5-style field experience with profile login + three-tier questions
 * Flow: Profile → Dashboard → Quick Start → Zone Walkthrough → Details (optional) → Results
 */

import { useState, useEffect, useCallback, useMemo, useRef, Component, Suspense } from 'react'
import * as Sentry from '@sentry/react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../hooks/useMediaQuery'
import STO from '../utils/storage'
import { resolveFinalizeTarget } from '../utils/finalizeTarget'
import { ensureAssessmentUid } from '../billing/assessmentUid'
import { hasDraftContent } from '../utils/draftContent'
import { resolveDraftResumeView } from '../utils/resumePhase'
import { blankZoneIndices, removeZoneAt, removeZonesAt, zoneLabel } from '../utils/zoneContent'
import Profiles from '../utils/profiles'
import Storage from '../utils/cloudStorage'
import { supabase, trackEvent } from '../utils/supabaseClient'
import Backup from '../utils/backup'
import { describeAssessmentBasis } from '../utils/assessmentBasis'
import { resolvePrimaryDriver } from '../utils/primaryDriver'
import { resolveVerdict, countFindings, worstZoneIndex, worstFindingSeverity } from '../utils/assessmentVerdict'
import { groupPathways, groupSamplingPlan, groupActionsByText } from '../utils/resultsGrouping'
import { buildReadinessVerdict } from '../engines/readiness-verdict'
import { withAiSections, lockAiSections } from '../report/aiSections'
import { checkRenderModel } from '../report/modelConsistency'
import { resolveAssessmentDate, todayLocalISO } from '../utils/assessmentDate'
import { getCalibrationBannerState, loadInstruments, isOutOfCal } from '../utils/instrumentRegistry'
import {
  buildCalibrationAcknowledgement, validateJustification, MAX_JUSTIFICATION_LEN,
} from '../utils/calibrationAcknowledgement'
import { extractDocxText, REVIEW_INSTRUCTIONS, REVIEW_CREDIT_COST } from '../utils/reportReview'
import { getSubscriptionBannerState } from '../utils/subscriptionState'
import { VER, STANDARDS_MANIFEST } from '../constants/standards'
import { Q_ZONE, Q_QUICKSTART, Q_DETAILS, SENSOR_FIELDS } from '../constants/questions'
import { BUILDING_SCOPED_IDS } from '../constants/field-registry'
import { deriveInvestigation } from '../engine/investigation'
import { scoreZone, summarizeAssessment, evalOSHA, genRecs, evalMold, evalMeasurementConfidence } from '../engines/scoring'
import { generateSamplingPlan } from '../engines/sampling'
import { buildCausalChains, pickPrimaryChain } from '../engines/causalChains'
import { generateNarrative } from '../engines/narrative'
import { generateReportSections } from '../engines/reportSections'
import PricingSheet from './pricing/PricingSheet'
import { I } from './Icons'
import { isOtherChoice } from '../utils/choiceOther'
import * as V3 from '../styles/tokens'
import Markdown from './Markdown'
import { GLASS, RADII, RHYTHM, stack as sgStack } from '../styles/soft-glass'
import GlassCard from './ui/GlassCard'
import { clickable } from './ui/a11y'
import AssessmentSegmentedPillNav from './ui/AssessmentSegmentedPillNav'
import AtmosFlowFloatingDock from './ui/AtmosFlowFloatingDock'
import JasperFloatingButton from './JasperFloatingButton'
import AnimatedPageTransition from './ui/AnimatedPageTransition'
import FeedbackSheet from './ui/FeedbackSheet'
import FeedbackButton from './ui/FeedbackButton'
import StatusPill from './ui/StatusPill'
import TactileButton from './ui/TactileButton'
import BottomSheet from './ui/BottomSheet'
import LaunchFrame, { LazyPlaceholder } from './LaunchFrame'
import PhotoCapture, { PhotoThumb } from './PhotoCapture'
import { expandPhotos, rekeyPhotos } from '../utils/photoCompaction'
import { normalizeFloorPlans, expandFloorPlans, compactFloorPlans, rekeyFloorPlans, storeFloorPlanImage, clearPinsOnPlan, newPlanId } from '../utils/floorPlans'
import { reportStorageWrite } from './ui/storageToast'
import { useViewHistory, readInitialNav } from '../hooks/useViewHistory'
import { useNavStack } from '../hooks/useNavStack'
import { ROUTES } from '../constants/routes'
import ToolsHub from './ToolsHub'
import CollaboratorsBar from './CollaboratorsBar'
import SensorScreen from './SensorScreen'
import InstrumentLogImport from './InstrumentLogImport'
import TimePickerInput from './TimePickerInput'
import Co2OaCalculator from './Co2OaCalculator'
import VoiceInputButton, { appendWithSpace } from './VoiceInputButton'
import TextareaWithGhost from './TextareaWithGhost'
import InlineAiButton from './InlineAiButton'
import BleSensorButton from './BleSensorButton'
import ProfileScreen, { IAQ_OPTS, PID_OPTS, CAL_OPTS, PID_CAL_OPTS } from './ProfileScreen'
import AuthScreen from './AuthScreen'
import { TermsOfService, PrivacyPolicy } from './LegalScreens'
import WelcomeScreen from './WelcomeScreen'
import ProjectsScreen from './projects/ProjectsScreen'
import ProjectDetail from './projects/ProjectDetail'
import { getOrCreateProjectByName } from '../utils/projectStore'
import { KEYS } from '../utils/storageKeys'
import SettingsScreen, { SitesScreen, ReportTemplatesScreen } from './SettingsScreen'
import AccountScreen from './AccountScreen'
import { getInitials } from './ProfileAvatar'
import FeatureTour from './FeatureTour'
import { downloadReportPdf } from '../utils/downloadReportPdf'
// Code-splitting (audit 2026-09 §6 Performance). The report renderers
// (DocxReport → `docx`, PrintReport, the logger chart rasterizer →
// recharts + html2canvas) and the heavy screens below are loaded on
// demand. v2.6.1 had made DocxReport a STATIC import because a stale
// cached index.html could reference a chunk hash the server no longer
// had ("'text/html' is not a valid JavaScript MIME type"). That failure
// mode is now handled — the global unhandledrejection handler in
// main.jsx plus `importSafe` / `lazySafe` (src/components/ui/lazySafe.jsx)
// evict the service-worker caches and offer a one-tap reload — which is
// what makes lazy loading safe. See the comment in lazySafe.jsx.
import { lazySafe, importSafe, isStaleChunkError } from './ui/lazySafe'
import { toast } from 'sonner'
const loadDocxReport = () => importSafe(() => import('./DocxReport'))
const loadPrintReport = () => importSafe(() => import('./PrintReport'))
const loadLoggerChartImages = () => importSafe(() => import('../utils/loggerChartImages'))
const loadFloorPlanFigure = () => importSafe(() => import('../utils/floorPlanFigure'))
const AdminDashboard = lazySafe(() => import('./AdminDashboard'))
const SensorDataPage = lazySafe(() => import('./sensor/SensorDataPage'))
const LoggerGraphsTab = lazySafe(() => import('./sensor/LoggerGraphsTab'))
const SpatialMap = lazySafe(() => import('./SpatialMap'))
const FieldAssistant = lazySafe(() => import('./FieldAssistant'))
const EvidenceMap = lazySafe(() => import('./EvidenceMap'))
const MoldModeScreen = lazySafe(() => import('./MoldModeScreen'))
const SamplingFormsView = lazySafe(() => import('./SamplingFormsView'))
const VentilationTool = lazySafe(() => import('./VentilationTool'))
// Suspense fallback for the lazy screens — a quiet caption in place, in
// the theme's ink. It used to be the brand splash in a 400 ms form: a
// full-screen black canvas on every first open of a lazy screen.
const LAZY_FALLBACK = <LazyPlaceholder />
import { DEMO_CLEAN_PRESURVEY, DEMO_CLEAN_BUILDING, DEMO_CLEAN_ZONES, DEMO_CLEAN_EQUIPMENT } from '../constants/demoDataClean'
import { DEMO_FM_PRESURVEY, DEMO_FM_BUILDING, DEMO_FM_ZONES } from '../constants/demoDataFM'
import { DEMO_FINDINGS_PRESURVEY, DEMO_FINDINGS_BUILDING, DEMO_FINDINGS_ZONES, DEMO_FINDINGS_EQUIPMENT } from '../constants/demoDataFindings'
import { getMode, setMode as persistMode, isFM, t, homeView } from '../constants/terminology'
import { evaluateEscalation, hasActiveEscalation } from '../engines/escalation'
import { getBuildingProfile } from '../engines/buildingProfiles'
import ModeSelector from './ModeSelector'
import IncidentForm from './IncidentForm'
import IncidentLog from './IncidentLog'
import IncidentDetail from './IncidentDetail'
import PropertyDashboard from './PropertyDashboard'
import V21InternalPanel from './V21InternalPanel'
import { FAQ_SECTIONS } from '../constants/faq'
import SearchView from './SearchView'
import SimilarAssessmentsPanel from './SimilarAssessmentsPanel'
import VoiceCommandModal from './VoiceCommandModal'
import JasperBrainIcon from './JasperBrainIcon'
import PendingSyncIndicator from './PendingSyncIndicator'
import OfflineBanner from './OfflineBanner'
import JasperWatchPanel from './JasperWatchPanel'
import ReadinessPanel from './ReadinessPanel'
import DesktopSidebar, { SIDEBAR_W } from './desktop/DesktopSidebar'
import { isKnowledgeGraphEnabled, isMoldModuleEnabled } from '../utils/featureFlags'

// Knowledge Graph Evidence tab is staged behind a flag — on for preview/
// localhost, off on the production host until merged (?kg=1 to demo). Resolved
// once at module load. See src/utils/featureFlags.js.
const KG_EVIDENCE_ENABLED = isKnowledgeGraphEnabled()
// Whether the composite IAQ score (0–100) and risk band are shown. Default
// hidden; `?score=1` restores per-browser. The engine still computes the score
// internally (findings, severity color, sorting, persistence all unaffected);
// this governs display only. Resolved once at module load like KG above.
import { buildJasperContext } from '../../lib/context/buildJasperContext'
import { buildAssessmentContext } from '../../lib/context/buildAssessmentContext'
import { emitEvent } from '../../lib/events/emit'
import SaveSitePrompt from './SaveSitePrompt'
import PeerReviewModal from './PeerReviewModal'
import { parseSiteLink, clearSiteLink, findMostRecentReportForSite } from '../utils/siteLink'
import { siteSaveMessage } from '../utils/siteSaveMessage'
import { useAssessment } from '../contexts/AssessmentContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useStorage } from '../contexts/StorageContext.jsx'
import { mix } from '../utils/theme'
import { formatDate } from '../utils/formatDate'

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
const fD = ts => formatDate(ts)
// Severity color helper. The hexes live in tokens.js SEVERITY (the
// single source — v3 primitives read the same table); this only adds the
// tinted background and the pill label.
const sv = sev => V3.severityTone(sev)
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
// Result tab keys by the names Jasper's propose_action and older call
// sites use for them. Sampling and Actions merged into Plan, Narrative
// and Review into Report (2026-09); the labels and the old keys still
// resolve.
const RESULT_TAB_ALIASES = {
  findings: 'overview', pathways: 'rootcause',
  sampling: 'plan', actions: 'plan',
  narrative: 'report', readiness: 'report', review: 'report',
  // 'spatial' was the standalone route this screen used to be.
  spatial: 'locations', floorplan: 'locations', map: 'locations',
}
// Results screen (restraint pass, 2026-09): a section is a micro heading
// over content that parts from the previous section with a hairline — no
// card, no icon tile, no tinted pill. Every result tab uses the same two
// styles, so the screen reads as one document rather than a dashboard.
const RS_SECTION = { paddingTop: 18, borderTop: `1px solid ${V3.BORDER_SUBTLE}` }
const RS_HEAD = { ...V3.T.micro, marginBottom: 10 }

// Reader-facing names for the AI-sections audit breakdown (src/report/aiSections.js
// keys). Matches the WRITABLE_SECTIONS names, plus the per-parameter
// `parameter_background.<key>` keys reportModel.js's own grouping produces.
const AI_SECTION_LABELS = {
  executive_summary: 'Executive Summary',
  discussion: 'Discussion & Conclusions',
  conceptual_site_model: 'Conceptual Site Model',
  recommendations_prose: 'Recommendations framing',
  'parameter_background.co2': 'Background — Carbon dioxide',
  'parameter_background.co': 'Background — Carbon monoxide',
  'parameter_background.thermal': 'Background — Thermal comfort',
  'parameter_background.pm25': 'Background — Fine particulate',
  'parameter_background.tvoc': 'Background — Total VOCs',
}
// A text action / link: the primary ink, weight 600, a chevron when it goes
// somewhere. Accent discipline (2026-09): cyan is reserved for the one
// primary action on a screen and the selected state; links stopped
// borrowing it.
const RS_LINK = { background: 'none', border: 'none', color: V3.TEXT_PRIMARY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, WebkitTapHighlightColor: 'transparent' }

// Confidence tones for the results cards. High = green (confident),
// Moderate = amber, Possible = a cool slate-blue — deliberately lower-
// energy but still chromatic, so the lowest tier reads as an intentional
// confidence state rather than disabled gray body text.
const confColor = (conf) => conf === 'Strong' ? '#22C55E'
  : conf === 'Moderate' ? '#FBBF24'
  : '#8AA4CC'
const ON_ACCENT = 'var(--on-accent)'
// Hero heading font. Was an editorial serif (Tiempos/Lora); switched to
// the app's sans (var(--font-sans), Inter) so the result acard + Home
// co-pilot headings read consistently with the rest of the glass/cyan UI
// rather than as an editorial outlier.

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
    return isOutOfCal(inst) ? 'Calibrated, overdue for recertification' : 'Calibrated within manufacturer spec'
  }
  return 'Unknown'
}

/**
 * The presurvey a NEW assessment starts from: profile auto-fill, plus the
 * survey date stamped at the moment the walkthrough begins.
 *
 * The date matters more than it looks. `ps_survey_date` lives only in
 * Q_PRESURVEY — the desktop long form — so nothing on the mobile path could
 * ever set it. With no date `comfortSeason` returns null by design (audit
 * H5), `assessEnv` takes the data-gap branch, and TEMPERATURE IS NEVER
 * EVALUATED on a Quick Start assessment. The report then prints "assessment
 * date not recorded" on a page that states the assessment date three times,
 * because the report chrome falls back to the finalize timestamp `ts` and the
 * scorer — which is handed only { ...bldg, ...zone } — has no `ts` to fall
 * back to. In a complaint-driven survey that silently skipped the parameter
 * most likely to explain the complaint.
 *
 * Stamping at creation rather than defaulting at score time is what keeps a
 * draft resumed after a month boundary scored against the day the walkthrough
 * actually happened. It stays editable in Assessment Details.
 */
function freshPresurvey(profile) {
  return { ps_survey_date: todayLocalISO(), ...(profile ? Profiles.toPresurvey(profile) : {}) }
}

// `mix(name, pct)` for legacy `${TOKEN}HEX_ALPHA` sites is imported
// from utils/theme above. CSS-var references with hex-suffix alpha
// would produce invalid CSS, so those sites are rewritten to
// color-mix(in srgb, var(--…) X%, transparent).

// In-app FAQ — same FAQ_SECTIONS data as the public landing page so the
// public answer and the in-app answer cannot drift apart. One question
// open at a time across the entire list.
function HelpView() {
  const [openId, setOpenId] = useState(null)
  return (
    <div style={{paddingTop:24,paddingBottom:120}}>
      {/* The shell header's back pill is the single back affordance; the
          in-body "← Settings" link duplicated it (and pointed somewhere
          else, which is how a screen ends up with two backs). Title +
          subtitle on the shared scale. */}
      <h2 style={{...V3.T.h1,marginBottom:4}}>Help &amp; FAQ</h2>
      <div style={{...V3.T.h1Sub,marginBottom:20}}>Common questions about AtmosFlow methodology, scoring, workflow, and limitations.</div>
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

// Radio-style option row for the instrument editor. Module scope on
// purpose: defined inside InstrumentEditView it was a new component type
// on every render, so React unmounted and remounted every option (and
// dropped focus) on each keystroke in the form.
const Radio = ({ selected, label, onClick }) => (
  <button type="button" role="radio" aria-checked={!!selected} onClick={onClick} style={{width:'100%',padding:'10px 14px',textAlign:'left',background:selected?`${mix('accent', 3)}`:'transparent',border:`1px solid ${selected?`${mix('accent', 19)}`:BORDER}`,borderRadius:8,color:selected?TEXT:SUB,fontSize:13,fontWeight:selected?600:500,cursor:'pointer',fontFamily:'inherit',minHeight:38,transition:'all 0.15s',marginBottom:4}}>{label}</button>
)

// ── Trash view ──
// Hoisted out of MobileApp's render (audit §6 Structure): as an inline
// component it was remounted — and its `items` refetched — on every shell
// re-render, which the 30-second clock interval used to trigger while the
// user sat on this screen. Exported for tests/components/TrashView.test.tsx.
export const TrashView = ({ onRecover, onDelete }) => {
  const [items, setItems] = useState([])
  useEffect(() => { Backup.listTrash().then(setItems) }, [])
  return (
    <div style={{paddingTop:24,paddingBottom:120}}>
      <h2 style={{...V3.T.h1,marginBottom:4}}>Trash</h2>
      <div style={{...V3.T.h1Sub,marginBottom:20}}>Deleted items are kept for 30 days, then permanently removed.</div>
      {items.length===0?(
        // Same empty-state shape as Projects / Reports / Incidents: icon
        // tile, title, one line of body — not a bare sentence in a box.
        <div style={{...V3.panel(),textAlign:'center',padding:'36px 24px'}}>
          <div style={{width:52,height:52,borderRadius:14,margin:'0 auto 14px',display:'flex',alignItems:'center',justifyContent:'center',background:'color-mix(in srgb, var(--accent) 8%, transparent)',border:'1px solid color-mix(in srgb, var(--accent) 22%, transparent)'}}>
            <I n="trash" s={24} c="var(--accent)" w={1.8} />
          </div>
          <div style={{...V3.T.h3,marginBottom:6}}>Trash is empty</div>
          <div style={{...V3.T.bodyDim,maxWidth:360,margin:'0 auto'}}>Deleted reports and drafts wait here for 30 days before they are removed for good.</div>
        </div>
      )
      :items.map(t=>(
        <div key={t.id} style={{padding:'16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,marginBottom:8,display:'flex',alignItems:'center',gap:14}}>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:600,color:TEXT}}>{t.name||'Untitled'}</div>
            <div style={{fontSize:12,color:DIM,fontFamily:"var(--font-mono)",marginTop:4}}>Deleted {fD(t.deletedAt)} · Expires {fD(t.expiresAt)}</div>
          </div>
          <button onClick={async()=>{await onRecover(t.id);setItems(await Backup.listTrash())}} style={{padding:'10px 16px',background:`${mix('accent', 8)}`,border:`1px solid ${mix('accent', 19)}`,borderRadius:10,color:ACCENT,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Recover</button>
          <button onClick={async()=>{await onDelete(t.id);setItems(await Backup.listTrash())}} aria-label={`Permanently delete ${t.name||'Untitled'}`} style={{padding:'10px 14px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:DIM,fontSize:13,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>✕</button>
        </div>
      ))}
    </div>
  )
}

// Row in the "Send graphs to a report" picker. Module scope for the same
// reason as TrashView — an inline definition remounted every row on each
// parent render.
const GraphTargetRow = ({ item, kind, onSend }) => (
  <GlassCard dense onClick={()=>onSend(item.id)} style={{padding:'14px 16px'}}>
    <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:3}}>{item.facility || 'Untitled'}</div>
    <div style={{fontSize:12,color:SUB}}>{kind}</div>
  </GlassCard>
)

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

  const inp = { width:'100%',padding:'14px 16px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:15,fontFamily:'inherit',fontWeight:500,boxSizing:'border-box',transition:'border-color 0.15s' }
  const lbl = { fontSize:13,fontWeight:600,color:SUB,marginBottom:6,display:'block',letterSpacing:'0.1px' }

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
        <label htmlFor="ie-iaq_meter" style={lbl}>Primary IAQ meter</label>
        <select id="ie-iaq_meter" value={form.iaq_meter||''} onChange={e=>setF('iaq_meter',e.target.value)} style={{...inp,appearance:'auto'}}>
          <option value="">Select or skip</option>
          {IAQ_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {form.iaq_meter && (
        <div style={{padding:'16px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>{form.iaq_meter}</div>
          <div style={{marginBottom:14}}>
            <label htmlFor="ie-iaq_serial" style={lbl}>Serial number <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></label>
            <input id="ie-iaq_serial" type="text" value={form.iaq_serial||''} onChange={e=>setF('iaq_serial',e.target.value)} placeholder="S/N" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
          </div>
          <div style={{marginBottom:14}}>
            <label htmlFor="ie-iaq_cal_date" style={lbl}>Last calibration</label>
            <input id="ie-iaq_cal_date" type="date" value={form.iaq_cal_date||''} onChange={e=>setF('iaq_cal_date',e.target.value)} style={{...inp,colorScheme:'dark'}} />
          </div>
          <div>
            <span style={lbl}>Calibration status</span>
            {CAL_OPTS.map(o => <Radio key={o} selected={form.iaq_cal_status===o} label={o} onClick={()=>setF('iaq_cal_status',o)} />)}
          </div>
        </div>
      )}

      <div style={{marginBottom:20}}>
        <label htmlFor="ie-pid_meter" style={lbl}>PID / VOC meter <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></label>
        <select id="ie-pid_meter" value={form.pid_meter||''} onChange={e=>setF('pid_meter',e.target.value)} style={{...inp,appearance:'auto'}}>
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
        <label htmlFor="ie-other_instruments" style={lbl}>Additional instruments <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></label>
        <textarea id="ie-other_instruments" value={form.other_instruments||''} onChange={e=>setF('other_instruments',e.target.value)} placeholder="Moisture meter, thermal camera, smoke pencil..." rows={2} style={{...inp,resize:'vertical',fontFamily:'inherit'}} />
      </div>

      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} disabled={saving} style={{flex:0,padding:'14px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Cancel</button>
        <button onClick={handleSave} disabled={saving || !profile?.id} style={{flex:1,padding:'14px 0',background:ACCENT,border:'none',borderRadius:8,color:ON_ACCENT,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:48,letterSpacing:'-0.1px',opacity:saving?0.6:1}}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

// Multi-select "exclusive" options — a "none / not assessed / clear of
// sources" answer that can't coexist with specific selections. Selecting
// one clears the rest and locks the others; selecting a specific option
// clears any exclusive choice. Matched by label so the rule applies
// consistently across every t:'multi' question in the app.
const EXCLUSIVE_MULTI_OPTS = new Set([
  'not assessed', 'none identified', 'none observed', 'none', 'none of concern',
  'clear of sources', 'nothing yet', 'unknown',
])
const isExclusiveMultiOpt = (o) => EXCLUSIVE_MULTI_OPTS.has(String(o).trim().toLowerCase())

// Per-zone "photo capture not feasible" control. Clears a Critical/High photo
// blocker with a documented justification when a photo genuinely can't be
// taken. Writes { reason } into photoOverrides[zoneName], which the
// readiness/validation engine already honors (src/engines/validation.js).
function PhotoNotFeasible({ existing, onSave, onClear }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState((existing && existing.reason) || '')
  const marked = !!(existing && typeof existing.reason === 'string' && existing.reason.trim())
  const link = { background:'none', border:'none', padding:0, color:V3.TEXT_PRIMARY, fontWeight:600, fontSize:12, fontFamily:'inherit', cursor:'pointer', textDecoration:'underline' }
  if (marked) {
    return (
      <div style={{marginTop:10, fontSize:12, color:'var(--sub)', lineHeight:1.5}}>
        Photo capture marked <strong>not feasible</strong>: “{existing.reason}”.{' '}
        <button type="button" onClick={onClear} style={link}>Undo</button>
      </div>
    )
  }
  if (!open) {
    return <button type="button" onClick={()=>setOpen(true)} style={{...link, marginTop:10, display:'inline-block'}}>Photo capture not feasible?</button>
  }
  return (
    <div style={{marginTop:10}}>
      <textarea
        value={reason}
        onChange={e=>setReason(e.target.value)}
        rows={2}
        placeholder="Why can't a photo be captured for this zone? (required, e.g. tenant denied access, energized equipment)"
        style={{width:'100%', padding:'12px 14px', background:'var(--card)', border:'1.5px solid var(--border)', borderRadius:12, color:'var(--text)', fontSize:14, fontFamily:'inherit', boxSizing:'border-box', resize:'vertical'}}
      />
      <div style={{display:'flex', gap:8, marginTop:8}}>
        <button type="button" disabled={!reason.trim()} onClick={()=>{ onSave(reason.trim()); setOpen(false) }}
          style={{padding:'8px 16px', borderRadius:10, border:'none', background: reason.trim()?'var(--accent)':'var(--border)', color:'var(--on-accent)', fontSize:13, fontWeight:600, fontFamily:'inherit', cursor: reason.trim()?'pointer':'not-allowed', minHeight:40}}>
          Mark not feasible
        </button>
        <button type="button" onClick={()=>{ setOpen(false); setReason((existing && existing.reason) || '') }}
          style={{padding:'8px 16px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--sub)', fontSize:13, fontFamily:'inherit', cursor:'pointer', minHeight:40}}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// Catches render-time errors in the saved-report / results view so a failure
// shows the actual error on screen (and reports to Sentry) instead of a blank
// screen that reads as a dead tap. Children render inside the boundary, so a
// throw while building the report view is caught here.
class ReportErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) {
    try { Sentry.captureException(err, { extra: { componentStack: info?.componentStack, where: 'report-view-render' } }) } catch { /* noop */ }
  }
  render() {
    if (!this.state.err) return this.props.children
    const e = this.state.err
    return (
      <div style={{ padding: '40px 24px', maxWidth: 620, margin: '0 auto', fontFamily: 'inherit' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Couldn’t open this report</div>
        <div style={{ fontSize: 14, color: 'var(--sub)', marginBottom: 16, lineHeight: 1.5 }}>
          The report errored while rendering. These details were also sent to Sentry. Please copy or screenshot them so this can be fixed.
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.5, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, color: 'var(--danger)', maxHeight: 300, overflow: 'auto', margin: 0 }}>
          {String(e?.name || 'Error')}: {String(e?.message || e)}{'\n\n'}{String(e?.stack || '').slice(0, 1400)}
        </pre>
        <button type="button" onClick={this.props.onBack} style={{ marginTop: 16, padding: '12px 20px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--on-accent-fill, #000)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          ← Back to Reports
        </button>
      </div>
    )
  }
}

// Invokes a render closure as a child component so a throw inside it is caught
// by an ancestor error boundary (a function called inline during the parent's
// render would not be).
function DeferredRender({ render }) { return render() }

// Full-screen "writing your report" overlay shown while a DOCX is generated.
// Cycling status phrases (Claude-Code-style) in the brand accent (cyan),
// with three small cascading dots to the left. A determinate progress
// bar fills over `durationMs` so the engineered wait reads as bounded.
//
// The 12s / 8s engineered wait is preserved — the audit framed it as a
// labor-illusion loading state (Norton & Buell 2009), not engagement
// theater. New visual, same timing semantics.
function ReportWritingOverlay({ label, durationMs }) {
  const ACCENT = 'var(--accent)'
  // Phrases are deliberately scoped to report ASSEMBLY (composing,
  // citing, formatting, polishing). No verbs that imply analysis,
  // diagnosis, or causation — that would conflict with the
  // screening-only positioning (CLAUDE.md).
  const PHRASES = [
    'Composing findings…',
    'Citing standards…',
    'Cross-checking sampling plan…',
    'Verifying calibration metadata…',
    'Assembling appendices…',
    'Drafting executive summary…',
    'Polishing recommendations…',
    'Formatting deliverable…',
    'Tightening the prose…',
    'Finalizing…',
  ]
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PHRASES.length), 1800)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return createPortal(
    <div role="status" aria-live="polite" aria-label={label}
      style={{ position:'fixed', inset:0, zIndex:4000, background:'rgba(8,10,14,0.94)',
        backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)', display:'flex',
        flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 36px', fontFamily:'inherit' }}>
      <style>{`
        @keyframes rwoBar { from{width:0%} to{width:100%} }
        @keyframes rwoIn  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes rwoDot { 0%,80%,100%{opacity:.22;transform:translateY(0)} 40%{opacity:1;transform:translateY(-3px)} }
        @keyframes rwoPhrase { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <div style={{ animation:'rwoIn .4s ease both', display:'flex', flexDirection:'column', alignItems:'center', width:'100%', maxWidth:440 }}>
        <div style={{ fontSize:11, color:'var(--sub, #9aa7b4)', marginBottom:22, textAlign:'center', letterSpacing:'0.14em', textTransform:'uppercase', fontWeight:600, fontFamily:'var(--font-mono)' }}>
          {label}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, minHeight:28, width:'100%', justifyContent:'center' }}>
          {/* three small cascading dots — "small animation to the left" */}
          <span aria-hidden="true" style={{ display:'inline-flex', alignItems:'center', gap:4, flexShrink:0 }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:ACCENT, boxShadow:`0 0 6px ${ACCENT}`, animation:'rwoDot 1.3s ease-in-out infinite', animationDelay:'0s' }} />
            <span style={{ width:5, height:5, borderRadius:'50%', background:ACCENT, boxShadow:`0 0 6px ${ACCENT}`, animation:'rwoDot 1.3s ease-in-out infinite', animationDelay:'0.18s' }} />
            <span style={{ width:5, height:5, borderRadius:'50%', background:ACCENT, boxShadow:`0 0 6px ${ACCENT}`, animation:'rwoDot 1.3s ease-in-out infinite', animationDelay:'0.36s' }} />
          </span>
          {/* cycling phrase in the brand accent (cyan), monospace —
              `key={idx}` replays the slide-in on each tick. */}
          <span key={idx} style={{ color:ACCENT, fontSize:16, fontWeight:500, letterSpacing:0, fontFamily:'var(--font-mono)', animation:'rwoPhrase .3s ease-out both' }}>
            {PHRASES[idx]}
          </span>
        </div>
        <div style={{ width:'100%', height:3, borderRadius:99, background:'rgba(255,255,255,0.08)', marginTop:28, overflow:'hidden' }}>
          <div style={{ height:'100%', borderRadius:99, background:ACCENT, boxShadow:`0 0 6px ${ACCENT}`, animation:`rwoBar ${durationMs}ms linear both` }}/>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Membership test for setQSField's routing. Built once at module load. */
const BUILDING_SCOPED_ID_SET = new Set(BUILDING_SCOPED_IDS)

export default function MobileApp() {
  const { isTablet, isTabletLand, isDesktop } = useMediaQuery()
  // Responsive layout: phone=620, tablet portrait=860, tablet landscape=1080,
  // desktop (>=1024, persistent left sidebar)=1280. padX widens to match.
  const contentMax = isDesktop ? 1280 : isTabletLand ? 1080 : isTablet ? 860 : 620
  const padX = isDesktop ? 40 : isTablet ? 28 : 20

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
    photoOverrides, setPhotoOverrides,
    zoneScores, setZoneScores,
    comp, setComp,
    oshaResult, setOshaResult,
    recs, setRecs,
    narrative, setNarrative,
    narrativeLoading, setNarrativeLoading,
    aiSections, setAiSections,
    samplingPlan, setSamplingPlan,
    causalChains, setCausalChains,
    moldResults, setMoldResults,
    floorPlans, setFloorPlans,
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
  // True while the portfolio-summary Word export is being built.
  const [portfolioBusy, setPortfolioBusy] = useState(false)
  // True while the saved-profile picker / editor is open (reached from the
  // Account screen). Decouples that flow from the legacy 'dash' view so it
  // returns to the correct home (projects for IH/CSP) after a profile is
  // selected or saved — instead of stranding the user on the old co-pilot home.
  const [editingProfile, setEditingProfile] = useState(false)
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
  // Projects is the default landing (projects-centric nav redesign); the
  // legacy dashboard remains reachable from the side menu's Home-less
  // deep links until it's fully retired.
  // First view comes from the browser history / URL hash when the route
  // can be restored without in-memory draft state (see routes.js
  // `restore`); id-bearing routes are hydrated once storage is ready.
  const initialNav = useRef(readInitialNav('projects')).current
  // Navigation is a stack (hooks/useNavStack): `view` is the top entry,
  // `setView` pushes a screen, a dock tab resets the stack to itself, and
  // the header back pill pops — so "back" means the screen you came from,
  // and a tool opened from a project returns to that project without the
  // shell remembering it. The page-transition direction (tab / forward /
  // back) comes from the same stack, so it is right the instant the new
  // page mounts.
  const nav = useNavStack(initialNav.view, homeView(userMode))
  const view = nav.view
  const setView = nav.navigate
  const navDir = nav.dir
  const [activeProjectId, setActiveProjectId] = useState(null)
  // Summary of the open Project/Site workspace — loaded when a project is
  // opened and handed to Jasper's context (project_workspace) so the AI
  // knows which site engagement the conversation is about.
  const [activeProjectSummary, setActiveProjectSummary] = useState(null)
  useEffect(() => {
    if (!activeProjectId) { setActiveProjectSummary(null); return }
    let alive = true
    import('../utils/projectStore').then(m => m.getProject(activeProjectId)).then(p => {
      if (!alive || !p) return
      setActiveProjectSummary({
        id: p.id,
        name: p.name || null,
        client: p.client || null,
        site_type: p.siteType || null,
        address: p.address || null,
        status: p.status || null,
        counts: {
          assessments: (p.linkedReportIds || []).length,
          documents: (p.documents || []).length,
          photos: (p.evidence || []).length,
          notes: (p.notes || []).length,
        },
      })
    }).catch(() => {})
    return () => { alive = false }
  }, [activeProjectId])
  // Where the project workspace returns to — 'projects' (IH list) or
  // 'properties' (FM Buildings portfolio), set when navigating in.
  // Bumped from the header ⋯ overflow's "Edit details" item; ProjectDetail
  // watches it and opens its edit sheet (the sheet state lives in the child).
  const [projectEditNonce, setProjectEditNonce] = useState(0)
  const [milestone, setMilestone] = useState(null)
  const [showPricing, setShowPricing] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  // When a new assessment is launched from a Project workspace, seed the
  // building name/address so the walkthrough opens pre-bound to that site
  // and re-links to it on finalize (matched by name via the existing
  // getOrCreateProjectByName auto-link). null = launched globally.
  const [assessmentSeed, setAssessmentSeed] = useState(null)
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
  // Replayable feature tour. Auto-shows once for returning users on the
  // dashboard; new users (isNew) get the welcome/profile-setup flow
  // first, so the tour waits until that's behind them. Always replayable
  // from Settings → Help.
  const [showTour, setShowTour] = useState(false)
  useEffect(() => {
    if (!profile || profile.isNew) return
    if (view !== 'dash') return
    let cancelled = false
    STO.get('aiq_feature_tour_seen').then(seen => { if (!cancelled && !seen) setShowTour(true) })
    return () => { cancelled = true }
  }, [profile, view])
  const closeTour = () => {
    STO.set('aiq_feature_tour_seen', '1')
    setShowTour(false)
  }
  const [selectedPhotos, setSelectedPhotos] = useState({})
  const [exportFormat, setExportFormat] = useState(null)
  // Pen-writing overlay shown while a DOCX generates: { label, durationMs } | null
  const [genWriting, setGenWriting] = useState(null)
  const [rTab, setRTab] = useState('overview')
  const [selZone, setSelZone] = useState(0)

  const [viewRpt, setViewRpt] = useState(null)
  // Editorial cuts approved for the currently-viewed report. Held in session
  // state so they apply to the report's export even when the report is not
  // saved (e.g. a demo). Hydrated from a saved report's stored cuts on open,
  // and reset when the viewed report changes.
  const [reportOpenError, setReportOpenError] = useState(null)
  const [currentIncident, setCurrentIncident] = useState(null)
  // Mirror `view` (+ the ids a screen needs) into history.pushState so the
  // platform back gesture goes to the previous screen instead of leaving
  // the PWA, and a refresh reopens the last view. `restoreNav` (below,
  // next to openReport) rebuilds the screen from a popped entry.
  useViewHistory({
    view,
    extra: {
      rptId: view === 'report' ? (viewRpt?.id || null) : null,
      projectId: view === 'project-detail' ? (activeProjectId || null) : null,
      incidentId: view === 'incident-detail' ? (currentIncident?.id || null) : null,
    },
    onPop: (st) => restoreNav(st),
  })
  const [delConf, setDelConf] = useState(null)
  const [zonePrompt, setZonePrompt] = useState(false)
  // Finalize found zones with nothing recorded in them: their indices,
  // or null when the sheet is closed. See finishAssessment.
  const [blankZonePrompt, setBlankZonePrompt] = useState(null)
  // "Remove this zone" confirmation on the zone screen.
  const [confirmRemoveZone, setConfirmRemoveZone] = useState(false)
  // Bumped after the blank-zone sheet strips zones, so finalize re-runs
  // against the committed state (finishAssessment reads `zones` from its
  // closure, so calling it in the same handler would score the old list).
  const [pendingFinish, setPendingFinish] = useState(0)
  const [calWarning, setCalWarning] = useState(null)
  // A finalize that the calibration interrupt sent to the Details form is
  // still OUTSTANDING. Without this the interrupt's own "Add instrument data"
  // button silently abandoned the finalize: it set the view to 'details' and
  // nothing re-entered finishAssessment, so an assessor who took the
  // responsible route landed on a Results screen reading "Saved · N findings"
  // with no report written, no finalize affordance anywhere on that screen,
  // and — once the data was filled — not even the completeness prompts that
  // might have hinted something was unfinished. Only "Continue without"
  // actually finalized, which made the careless path the working one.
  const [finalizePending, setFinalizePending] = useState(false)
  // Calibration acknowledgement — the record left when an assessor
  // finalizes past the instrument interrupt. See
  // src/utils/calibrationAcknowledgement.js for why this ADDS an audit
  // artifact rather than suppressing the warning (the old IH
  // score-override did the latter and was deleted in engine v2.9).
  const [calAckOpen, setCalAckOpen] = useState(false)
  const [calAckText, setCalAckText] = useState('')
  const [calAckError, setCalAckError] = useState(null)
  const [calAck, setCalAck] = useState(null)
  // Saved profile instruments + the picker that lets the assessor pull
  // make/serial/cal into the assessment instead of retyping them.
  const [instPickerOpen, setInstPickerOpen] = useState(false)
  const [savedInstruments, setSavedInstruments] = useState([])
  // Refresh on mount and whenever the view changes or the advisory opens,
  // so instruments added in Settings mid-session show up at the entry
  // points (localStorage read is cheap).
  useEffect(() => { setSavedInstruments(loadInstruments()) }, [view, calWarning])
  // Logger Studio → "Send graphs to a report" target picker
  const [graphTargetOpen, setGraphTargetOpen] = useState(false)
  const [hSearch, setHSearch] = useState('')
  const [hSort, setHSort] = useState('newest')
  // v2.8 UI pass — Notion-style 3-dot home menu. Replaces the standalone
  // gear icon in the Home header; Settings is now one entry inside the
  // dropdown.
  const [showHomeMenu, setShowHomeMenu] = useState(false)
  // Whether content has scrolled beneath the fixed top bar. At the top of
  // a screen the bar is transparent and the page reads as one sheet; once
  // anything passes under it the bar takes the --chrome-glass tint, blurs
  // what is behind it and draws a hairline, so the back control and the
  // overflow glyph never sit over moving text. The app scrolls inside
  // .af-content-surface, not the window, and scroll events do not bubble,
  // so this listens in the capture phase on the document (the same reason
  // JasperFloatingButton does) and reads the surface's own scrollTop.
  const [chromeScrolled, setChromeScrolled] = useState(false)
  useEffect(() => {
    let raf = 0
    let last = false
    const onScroll = (e) => {
      const t = e.target
      if (!t || !t.classList || !t.classList.contains('af-content-surface')) return
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const next = t.scrollTop > 2
        if (next !== last) { last = next; setChromeScrolled(next) }
      })
    }
    document.addEventListener('scroll', onScroll, true)
    return () => { document.removeEventListener('scroll', onScroll, true); if (raf) cancelAnimationFrame(raf) }
  }, [])
  // Which secondary groups (Tools/Resources/Support) are expanded on the
  // DESKTOP rail, which keeps its toggles. The phone side menu no longer
  // collapses anything — every destination is visible under a static
  // section label — so this state only reaches DesktopSidebar. Open by
  // default there too, so the two surfaces show the same list.
  const [menuGroupsOpen, setMenuGroupsOpen] = useState({ tools: true, resources: true, support: true })
  // Project switcher (top of the side menu). Loads the project list each
  // time the menu opens so the recents are fresh; `menuSwitcherOpen`
  // expands the inline recents list under the chip.
  const [menuProjects, setMenuProjects] = useState([])
  const [menuSwitcherOpen, setMenuSwitcherOpen] = useState(false)
  useEffect(() => {
    if (!showHomeMenu) { setMenuSwitcherOpen(false); return }
    let alive = true
    import('../utils/projectStore').then(m => m.getProjects()).then(p => { if (alive) setMenuProjects(p || []) }).catch(() => {})
    return () => { alive = false }
  }, [showHomeMenu])
  // Side-menu edge-swipe gesture state (kept at the top with the other
  // hooks so it always runs before any conditional early return).
  const swipeRef = useRef(null)
  // Slide-out latch — kept true for the duration of the exit animation
  // so the Kalshi-style drawer can translate back off-screen before it
  // unmounts (rather than vanishing instantly). closeMenu() sets this,
  // then a timer clears showHomeMenu once the keyframe has played.
  const [menuClosing, setMenuClosing] = useState(false)
  // Feedback sheet: holds the context string of where it was opened from
  // (menu, AI narrative, findings…) or null when closed.
  const [feedbackCtx, setFeedbackCtx] = useState(null)
  const openFeedback = (ctx) => setFeedbackCtx(ctx || 'General feedback')
  // Ref to the hamburger button. The drawer itself is a full-height,
  // left-anchored panel (position:fixed; left:0) portaled to
  // document.body, so it no longer needs the button's bounding rect —
  // but the ref is retained for focus/aria wiring. Portaling is still
  // required because the header has `backdrop-filter: blur(24px)`, which
  // creates a containing block for fixed-positioned descendants; a scrim
  // rendered inside the header would clip to the header strip and leave
  // the page below tap-unreachable. document.body escapes that.
  const menuButtonRef = useRef(null)
  // Home menu sub-mode. 'main' shows the canonical menu items; 'demos'
  // shows the demo picker. Consolidates what was three separate flat menu entries
  // into one "Demos" entry with a sub-list, reducing menu height and
  // making the "load fake data to explore the app" affordance more
  // discoverable as a category. Reset to 'main' whenever the menu
  // closes so reopening always lands at the top level.
  const [homeMenuMode, setHomeMenuMode] = useState('main')
  // Field-assistant bottom sheet. Backend: api/field-assistant.ts.
  // UI is hidden whenever there's no profile (auth screen), during a
  // milestone overlay, or while another full-screen modal is up.
  const [faOpen, setFaOpen] = useState(false)
  // Light project-portfolio index for the AI — refreshed each time the
  // assistant opens so it can answer "what projects do I have" from any
  // view. Minimal fields only; capped at the 20 most-recent.
  const [aiProjectsIndex, setAiProjectsIndex] = useState(null)
  useEffect(() => {
    if (!faOpen) return
    let alive = true
    import('../utils/projectStore').then(m => m.getProjects()).then(list => {
      if (!alive) return
      const idx = [...(list || [])]
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 20)
        .map(p => ({
          id: p.id,
          name: p.name || null,
          client: p.client || null,
          status: p.status || null,
          updated_at: p.updatedAt || null,
          assessments: (p.linkedReportIds || []).length,
        }))
      setAiProjectsIndex(idx)
    }).catch(() => {})
    return () => { alive = false }
  }, [faOpen])
  // Voice-command modal state. When the user submits a transcribed
  // question, we drop the transcript into `voicePrefill` and open
  // the Jasper sheet; FieldAssistant's initialMessage prop picks it
  // up and auto-sends.
  const [voiceCmdOpen, setVoiceCmdOpen] = useState(false)
  // Header ⋯ overflow — opens a context action menu (Senior top-bar design).
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionsAnchor, setActionsAnchor] = useState(null)
  // Which header glass control (hamburger / kebab / back) is currently held.
  // Drives a sustained "liquid" expand: the control grows + glows while
  // pressed and springs back on release (state-driven so it persists through
  // the re-render when the menu opens). null = none pressed.
  const [pressedTrigger, setPressedTrigger] = useState(null)
  // Drives the .af-menu `is-open` class for the action menu: toggled on one
  // frame after mount (enter transition) and off to play the close
  // animation before the menu unmounts.
  const [actionsVis, setActionsVis] = useState(false)
  useEffect(() => {
    if (actionsOpen) {
      const r = requestAnimationFrame(() => setActionsVis(true))
      return () => cancelAnimationFrame(r)
    }
    setActionsVis(false)
  }, [actionsOpen])
  const closeActions = useCallback(() => {
    setActionsVis(false)
    setTimeout(() => setActionsOpen(false), 190)
  }, [])
  // A Readiness "Fix" that targets a zone field — held until the zone's
  // question list (zVis) recomputes for the new zone, then an effect lands
  // zqi exactly on the target question.
  const [pendingZoneFix, setPendingZoneFix] = useState(null)
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
  // Site library (habit-loop PR 1) — currentSiteId tracks whether the
  // in-progress assessment is bound to a saved site (via deep-link or
  // SaveSitePrompt at finalize). Used at finalize-time to decide
  // between "Save site" prompt vs silent next-due refresh.
  const [currentSiteId, setCurrentSiteId] = useState(null)
  const [savePromptCtx, setSavePromptCtx] = useState(null)  // { rid, ts } | null
  // Habit-loop PR 4: peer review modal open state.
  const [peerReviewOpen, setPeerReviewOpen] = useState(false)
  const reviewDocxInputRef = useRef(null)
  // Billing Phase 1 — credit-unit definition sheet was added in PR
  // #143 (Fix 2 of the CIH-credibility prompt) and removed by the
  // subsequent pricing-architecture decision (delete the credit
  // model entirely; replace with subscription tiers + Single
  // Assessment License). The state declaration is intentionally kept
  // *gone* — there's no in-product surface that opens this sheet.
  // (A 30-second `setClock` interval used to live here. Nothing read the
  // clock; its only effect was re-rendering the whole shell twice a minute
  // while idle, which remounted the then-inline TrashView. Removed.)

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
      // Bootstrap done — drop the neutral cover. Returning users with a
      // cached session land straight in the app with no brand animation.
      setLoading(false)
    })()
  }, [])

  // Deep-link hydration from the reassessment-reminder email
  // (habit-loop PR 1). URL: ?start=site&id=<site_id>. When present
  // AND the user is authenticated, fetch the site + the most recent
  // finalized report referencing it, hydrate bldg/presurvey into a
  // fresh draft, and land on the QuickStart screen. The URL params
  // are cleared so a refresh doesn't re-trigger.
  useEffect(() => {
    if (!profileChecked || !profile) return
    const siteId = parseSiteLink()
    if (!siteId) return
    clearSiteLink()
    ;(async () => {
      try {
        const session = supabase ? await Storage.getSession() : null
        if (!session?.access_token) return
        const resp = await fetch('/api/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ action: 'list' }),
        })
        if (!resp.ok) return
        const json = await resp.json().catch(() => ({}))
        const site = (json.sites || []).find(s => s.id === siteId)
        if (!site) return
        // Find the most recent matching finalized report locally.
        const allReports = []
        for (const meta of (index?.reports || [])) {
          const r = await STO.get(meta.id)
          if (r) allReports.push(r)
        }
        const prior = findMostRecentReportForSite(site, allReports)
        // Hydrate a NEW draft from the prior report, OR fall back to
        // a fresh New Assessment with just the site name/address pre-filled.
        const draftIdNew = 'draft-' + Date.now()
        const psFill = freshPresurvey(profile)
        if (prior) {
          setBldg({ ...(prior.building || {}), fn: site.name, address: site.address || prior.building?.address || '' })
          setPresurvey({ ...psFill, ...(prior.presurvey || {}) })
          setEquipment(prior.equipment || [])
        } else {
          setBldg({ fn: site.name, address: site.address || '', type: site.building_type || '' })
          setPresurvey(psFill)
          setEquipment([])
        }
        setDraftId(draftIdNew)
        setCurrentSiteId(site.id)
        setZones([{}]); setCurZone(0); setQsqi(0); setDqi(0); setZqi(0)
        setPhotos({}); setPhotoOverrides({}); setSensorData(null); setFloorPlans([])
        setZoneScores([]); setComp(null); setOshaResult(null); setRecs(null)
        setNarrative(null); setSamplingPlan(null); setCausalChains([]); setAiSections(null)
        trackEvent('site_link_hydrated', { site_id: site.id, prior_report: !!prior })
        setView('quickstart')
      } catch (e) {
        console.warn('Site-link hydration failed:', e && e.message)
      }
    })()
  }, [profileChecked, profile])  // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for Supabase auth changes
  useEffect(() => {
    return Storage.onAuthChange((event, session) => {
      if (event === 'SIGNED_OUT') { setProfile(null); setView('projects') }
    })
  }, [])
  // FM users' home remains the dashboard — once after login, redirect the
  // Projects landing default to dash for them (one-shot so a later manual
  // visit to Projects isn't yanked back).
  const fmLandedRef = useRef(false)
  useEffect(() => {
    if (!fmLandedRef.current && profile && userMode === 'fm') {
      fmLandedRef.current = true
      setView(v => (v === 'projects' ? 'dash' : v))
    }
  }, [profile, userMode])
  // "Go home" — the consultant home is the Projects landing; FM home stays
  // the dashboard. Used by every exit-to-home flow so the two modes don't
  // fork at each call site.
  const goHome = () => { nav.reset(homeView(userMode)); setViewRpt(null) }
  // A dock tab / menu primary: the stack becomes that one screen.
  const goTab = (v) => { nav.reset(v); if (v === 'dash' || v === 'projects') setViewRpt(null) }

  // Sustained "liquid-glass" press for the header glass controls (hamburger,
  // kebab, back pill). While held, the control grows and a cyan glow blooms;
  // it holds at that size for as long as the finger is down, then springs
  // back on release. State-driven (not CSS :active or a one-shot animation)
  // so the expand persists for a press-and-hold and survives the re-render
  // when the menu opens. Reduced-motion gets a plain instant press.
  const reduceMotion = (() => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) } catch { return false } })()
  const triggerPress = (key) => ({
    onPointerDown: () => setPressedTrigger(key),
    onPointerUp:    () => setPressedTrigger((k) => (k === key ? null : k)),
    onPointerLeave: () => setPressedTrigger((k) => (k === key ? null : k)),
    onPointerCancel:() => setPressedTrigger((k) => (k === key ? null : k)),
  })
  // peak = how much the control swells while held (icon buttons can take a
  // bigger swell than the wide back pill). The glow is an INSET (internal)
  // box-shadow rather than an outer drop-shadow so the header's overflow can't
  // clip it — it blooms inside the control. Brand cyan reads on both themes;
  // boxShadow is left undefined when idle so the .af-glass-control glass
  // shadow shows through.
  const triggerFx = (key, peak = 1.3) => {
    const on = pressedTrigger === key
    if (reduceMotion) return { transform: on ? 'scale(0.97)' : 'scale(1)', transition: 'transform 90ms ease' }
    return {
      transform: on ? `scale(${peak})` : 'scale(1)',
      boxShadow: on ? 'inset 0 0 18px rgba(57,192,217,0.72), inset 0 0 7px rgba(57,192,217,0.6)' : undefined,
      filter: on ? 'brightness(1.12)' : 'none',
      // Quick ease-out on the way up (tracks the finger), springy overshoot on
      // the way back so the release reads "liquid", not snapped.
      transition: on
        ? 'transform 200ms cubic-bezier(.2,.85,.3,1), box-shadow 180ms ease, filter 200ms ease'
        : 'transform 460ms cubic-bezier(.34,1.56,.64,1), box-shadow 320ms ease, filter 360ms ease',
      willChange: 'transform',
    }
  }
  // Opening a tool. A tool is pushed onto the stack, so back returns to
  // wherever it was opened from (a project workspace, the Tools hub, the
  // results screen). Logger Studio ingests a file INTO an assessment: when
  // no assessment is open and there are drafts to choose from, it asks
  // which one to attach to first (the sheet is rendered with the other
  // sheets below). The chooser is deliberately not shown when there is
  // nothing to choose — an empty list is not a question.
  const [attachSheet, setAttachSheet] = useState(false)
  const draftOpen = !!draftId && hasDraftContent({ bldg, zones, equipment, photos, sensorData, floorPlans })
  const openTool = (id) => {
    if (id === 'sensor-data' && !draftOpen && (index.drafts || []).length > 0) { setAttachSheet(true); return }
    nav.navigate(id)
  }
  const attachLoggerTo = async (id) => {
    setAttachSheet(false)
    // resumeDraft lands on the assessment's phase; Logger Studio goes on
    // top of it, so back from the tool is the assessment it attached to.
    await resumeDraft(id)
    nav.navigate('sensor-data')
  }
  // The Assess dock tab: continue the open assessment, or start one.
  const openAssess = () => {
    goTab('projects')
    if (comp) nav.navigate('results')
    else if (draftOpen) nav.navigate(bldg?.fn && zones?.[0]?.zn ? 'zone' : 'quickstart')
    else startNew()
  }

  const handleLogin = async (userOrProfile) => {
    // No brand intro on sign-in (removed 2026-09; see LaunchFrame). The
    // app's first screen is the welcome.
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
    setProfile(null); setView('projects')
  }

  // Auto-save draft
  const saveRef = useRef(null)
  useEffect(() => {
    // 'equipment' belongs in this whitelist too — it sits between
    // quickstart and zone in the walkthrough, and equipment captured
    // there was previously never persisted (silently dropped if the
    // assessor left the app on this screen), nor could resumeDraft ever
    // route back to it. See resolveDraftResumeView.
    if (!['quickstart','equipment','zone','details'].includes(view) || !draftId) return
    // Don't persist an assessment that hasn't been started. This fired 1.2s
    // after "New Assessment" with `bldg` still `{}`, so backing out left an
    // "Untitled" draft row forever — and nothing ever pruned one. See
    // utils/draftContent.js for why `presurvey` is not part of the test.
    if (!hasDraftContent({ bldg, zones, equipment, photos, sensorData, floorPlans })) return
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(async () => {
      // Merge over the existing stored body. When a finalized report is
      // resumed for editing (resumeAndFix sets draftId === the report's rpt
      // id), the prior body carries comp/zoneScores/recs/etc.; a plain
      // draft-shape write would drop them and leave the report unopenable.
      // Preserving them keeps the report renderable while it's edited, and a
      // re-finalize recomputes them. Fresh drafts have none, so this is a
      // no-op for them.
      const prev = (await STO.get(draftId)) || {}
      // The assessment's durable identity, stamped on first save and never
      // recomputed after — `ensureAssessmentUid` returns `prev`'s value when
      // there is one. Record ids are not durable (finalize mints a new one),
      // so anything that has to outlive the draft→report transition keys on
      // this instead. See src/billing/assessmentUid.js.
      // Plan images live in IndexedDB; the record carries the refs. A plan
      // still inline (IndexedDB unavailable) is saved inline, as before.
      // The legacy single `floorPlan` is dropped once the list is written.
      const draft = { ...prev, id:draftId, assessmentUid: ensureAssessmentUid({ ...prev, id: draftId }), presurvey, bldg, zones, equipment, photos, photoOverrides, floorPlans: compactFloorPlans(floorPlans), sensorData, qsqi, dqi, curZone, zqi, site_id: currentSiteId || null, ua:new Date().toISOString(), standardsManifest:STANDARDS_MANIFEST, aiSections }
      delete draft.floorPlan
      reportStorageWrite(await STO.set(draftId, draft), 'draft')
      await STO.addDraftToIndex({ id:draftId, facility:bldg.fn||'Untitled', ua:draft.ua })
      await refreshIndex()
      trackEvent('draft_saved', { draft_id: draftId, phase: view, zones: (zones||[]).length })
    }, 1200)
    return () => { if (saveRef.current) clearTimeout(saveRef.current) }
  }, [presurvey, bldg, zones, equipment, photos, photoOverrides, floorPlans, sensorData, qsqi, dqi, curZone, zqi, view, draftId, currentSiteId])

  // Merge quick start data into both presurvey and bldg depending on field prefix
  const mergedData = useMemo(() => ({ ...presurvey, ...bldg }), [presurvey, bldg])
  // Building fields go to bldg, pre-survey fields go to presurvey. The
  // routing set comes from the field registry rather than a literal list
  // here: this was one of six places that independently decided which
  // field names live where, and a field added to Q_BUILDING but forgotten
  // in this array would have been written into the pre-survey record,
  // where the engines never look for it.
  const setQSField = useCallback((id, v) => {
    if (BUILDING_SCOPED_ID_SET.has(id)) {
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
  const buildingProfile = useMemo(() => getBuildingProfile(bldg.ft), [bldg.ft])
  const zoneSubtype = zData.zone_subtype || null
  const suppressedIds = useMemo(() => buildingProfile?.suppressFields?.[zoneSubtype] || [], [buildingProfile, zoneSubtype])
  const additionalQs = useMemo(() => buildingProfile?.additionalFields?.[zoneSubtype] || [], [buildingProfile, zoneSubtype])
  const zVis = useMemo(() => {
    // Build base question list: standard zone questions + profile additional fields
    let qs = Q_ZONE.map(q => {
      // Populate zone_subtype options from building profile
      if (q.profileDynamic && q.id === 'zone_subtype' && buildingProfile?.zoneSubtypes?.length) {
        return { ...q, opts: buildingProfile.zoneSubtypes.map(st => st.label), _subtypeMap: buildingProfile.zoneSubtypes }
      }
      return q
    })
    // Filter: hide profileDynamic questions when no profile, apply conditional logic, suppress fields
    qs = qs.filter(q => {
      if (q.profileDynamic && (!buildingProfile || !buildingProfile.zoneSubtypes?.length)) return false
      if (suppressedIds.includes(q.id)) return false
      if (!q.cond) return true
      if (q.cond.eq && zData[q.cond.f] !== q.cond.eq) return false
      if (q.cond.ne && zData[q.cond.f] === q.cond.ne) return false
      return true
    })
    // Inject additional fields from profile at end
    if (additionalQs.length > 0) qs = [...qs, ...additionalQs]
    return qs
  }, [zData, bldg.ft, buildingProfile, suppressedIds, additionalQs])
  // Defensive clamp: qsqi/dqi/zqi index into qsVis/dtVis/zVis, and a
  // conditional question (e.g. Q_ZONE's cx → sy/sr/ac/cc) can shrink one
  // of those lists out from under an index that pointed past where the
  // list now ends. An out-of-range index means `qscq`/`dtcq`/`zcq` is
  // undefined, and each wizard screen is gated on that value being
  // truthy — so the screen renders nothing at all: no question, no Back,
  // no Continue, a dead end the assessor cannot navigate out of. Pull the
  // index back onto the last real question instead.
  useEffect(() => { if (qsVis.length > 0 && qsqi > qsVis.length - 1) setQsqi(qsVis.length - 1) }, [qsVis.length, qsqi, setQsqi])
  useEffect(() => { if (dtVis.length > 0 && dqi > dtVis.length - 1) setDqi(dtVis.length - 1) }, [dtVis.length, dqi, setDqi])
  useEffect(() => { if (zVis.length > 0 && zqi > zVis.length - 1) setZqi(zVis.length - 1) }, [zVis.length, zqi, setZqi])
  // Outdoor sensor readings are a site-wide baseline, captured once (only the
  // first zone shows them). Writing one applies it to EVERY zone so scoring and
  // the report see the outdoor value regardless of which zone is active.
  const OUTDOOR_SENSOR_IDS = useMemo(() => new Set(SENSOR_FIELDS.filter(f => f.outdoor).map(f => f.id)), [])
  const setZF = useCallback((id,v) => {
    setZones(prev => {
      if (OUTDOOR_SENSOR_IDS.has(id)) return prev.map(z => ({ ...(z||{}), [id]:v }))
      const next = [...prev]; next[curZone] = {...(next[curZone]||{}), [id]:v}; return next
    })
  }, [curZone, OUTDOOR_SENSOR_IDS, setZones])
  // The investigation state behind the Readiness panel's gap list.
  // buildAssessmentContext derives its own from the same inputs; both
  // call one pure function, so they agree by construction and a test
  // pins that rather than trusting it.
  const readinessInvestigation = useMemo(() => {
    if (!Array.isArray(zones) || zones.length === 0) return null
    try {
      return deriveInvestigation({
        zonesData: zones,
        buildingData: bldg || {},
        zoneScores: Array.isArray(zoneScores) ? zoneScores : undefined,
        samplingPlan: samplingPlan || null,
        causalChains: Array.isArray(causalChains) ? causalChains : null,
      })
    } catch {
      return null
    }
  }, [zones, bldg, zoneScores, samplingPlan, causalChains])

  // Bumped when an accepted Jasper write lands, so the engine re-runs
  // against the record as it now stands. A counter rather than a boolean:
  // two writes accepted in quick succession are two rescores, and a
  // boolean already true would swallow the second.
  const [pendingRescore, setPendingRescore] = useState(0)
  useEffect(() => {
    if (pendingRescore === 0) return
    runScoring()
    // Depends on the counter ALONE, deliberately.
    //
    // The write and this bump are set in the same handler, so React
    // applies both before the effect runs and the closure here already
    // sees the updated zones and building. Adding them to the dependency
    // list would not make it fresher — it would make it non-terminating:
    // runScoring() ends with setZones(zonesWithOutdoor), and that .map()
    // returns a new array identity on every call, so `zones` would change
    // on every run and re-trigger this effect forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRescore])

  // Land a pending Readiness "Fix" on the exact zone question once we've
  // navigated to that zone and its visible-question list is built. '__photo__'
  // targets the first photo-capable question; otherwise we match the field id.
  useEffect(() => {
    if (!pendingZoneFix || view !== 'zone' || curZone !== pendingZoneFix.zoneIndex) return
    const idx = pendingZoneFix.field === '__photo__'
      ? zVis.findIndex(q => q.photo)
      : zVis.findIndex(q => q.id === pendingZoneFix.field)
    if (idx >= 0) setZqi(idx)
    setPendingZoneFix(null)
  }, [pendingZoneFix, view, curZone, zVis, setZqi])

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
    if (!content || !content.trim()) { setReviewError('Nothing to review, no report content was found.'); return }
    if (!PAYWALL_DISABLED && credits < REVIEW_CREDIT_COST) { setReviewChooserOpen(false); setShowPricing(true); return }
    consumeCredit(REVIEW_CREDIT_COST, 'discrepancy_scan', viewRpt?.id || draftId || '')
    setReviewPayload({ kind, content, instructions: REVIEW_INSTRUCTIONS })
    setReviewPrefill('Review this report for discrepancies: compare the narrative against the underlying data and flag any inconsistencies, missing defensibility items, or unfilled placeholders.')
    setReviewChooserOpen(false)
    setReviewError(null)
    setFaOpen(true)
    trackEvent('report_review_started', { kind })
  }

  // Analyzer → AtmosFlow AI: hand the parsed sensor SUMMARY (never the raw
  // series) to the assistant for a screening-level read. Mirrors
  // launchReview's credit-gate + open-the-sheet flow.
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
      if (!text || text.length < 20) { setReviewError('Could not read text from that file. Make sure it is a .docx report.'); return }
      launchReview('docx', `Uploaded document: ${file.name}\n\n${text}`)
    } catch (err) {
      setReviewBusy(false)
      setReviewError((err && err.message) || 'Could not read that .docx file.')
    }
  }

  const startNew = (seed = null) => {
    if (!PAYWALL_DISABLED && credits < 1) { setShowPricing(true); return }
    setAssessmentSeed(seed && (seed.name || seed.address) ? { name: seed.name || '', address: seed.address || '' } : null)
    setShowDisclaimer(true)
  }

  const proceedAfterDisclaimer = () => {
    setShowDisclaimer(false)
    consumeCredit(1, 'assessment')
    trackEvent('assessment_mode_selected', { mode: 'new' })
    trackEvent('assessment_created', {})
    const id = 'draft-' + Date.now()
    setDraftId(id)
    setCurrentSiteId(null)  // PR 1: fresh assessments aren't bound to a site
    // Auto-fill from profile
    const psFill = freshPresurvey(profile)
    // Pre-bind to the originating Project when launched from its workspace.
    setFinalizePending(false)
    setPresurvey(psFill); setBldg(assessmentSeed ? { name: assessmentSeed.name, address: assessmentSeed.address } : {}); setAssessmentSeed(null); setQsqi(0); setDqi(0); setSensorData(null)
    setZones([{}]); setCurZone(0); setZqi(0); setPhotos({}); setEquipment([])
    setZoneScores([]); setComp(null); setOshaResult(null); setRecs(null); setNarrative(null); setSamplingPlan(null); setCausalChains([]); setAiSections(null)
    setView('quickstart')
  }

  const runDemo = (type) => {
    const demos = {
      clean: { bldg: DEMO_CLEAN_BUILDING, zones: DEMO_CLEAN_ZONES, pre: DEMO_CLEAN_PRESURVEY, equipment: DEMO_CLEAN_EQUIPMENT },
      fm: { bldg: DEMO_FM_BUILDING, zones: DEMO_FM_ZONES, pre: DEMO_FM_PRESURVEY, equipment: [] },
      findings: { bldg: DEMO_FINDINGS_BUILDING, zones: DEMO_FINDINGS_ZONES, pre: DEMO_FINDINGS_PRESURVEY, equipment: DEMO_FINDINGS_EQUIPMENT },
    }
    const pick = type || (userMode === 'fm' ? 'fm' : 'clean')
    const { bldg: demoBldg, zones: demoZones, pre: demoPre, equipment: demoEq } = demos[pick]
    trackEvent('assessment_mode_selected', { mode: 'demo', demoType: pick, userMode })
    setBldg(demoBldg); setZones(demoZones); setPresurvey(demoPre); setPhotos({}); setEquipment(demoEq || [])
    const zScores = demoZones.map(z => scoreZone(z, demoBldg))
    const composite = summarizeAssessment(zScores)
    const worst = demoZones[worstZoneIndex(zScores)]
    const osha = evalOSHA({...demoBldg, ...worst})
    const recommendations = genRecs(zScores, demoBldg, { zones: demoZones, equipment: demoEq || [] })
    const sp = generateSamplingPlan(demoZones, demoBldg)
    const cc = buildCausalChains(demoZones, demoBldg, zScores)
    const mold = demoZones.map(z => evalMold(z)).filter(Boolean)
    const mc = evalMeasurementConfidence(demoZones)
    setZoneScores(zScores); setComp(composite); setOshaResult(osha); setRecs(recommendations)
    setSamplingPlan(sp); setCausalChains(cc); setMoldResults(mold); setMeasConf(mc); setSelZone(0); setRTab('overview'); setNarrative(null); setAiSections(null); setView('results')
  }

  /**
   * Load an assessment into the editor. Returns false when it could not be
   * loaded, and the caller MUST respect that — see resumeAndFix.
   *
   * This used to be a bare `STO.get` with `if (!d) return`: no cloud
   * fallback, no error, no signal to the caller. On a device without the
   * body in localStorage (a second device, cleared storage, an eviction)
   * it silently did nothing while the caller carried on into edit mode
   * with `draftId` still pointing at the previous assessment — so the
   * finalize either minted a duplicate report or, worse, overwrote
   * whichever report `draftId` happened to hold.
   */
  const resumeDraft = async (id) => {
    let d = await STO.get(id)
    if (!d && supabase) {
      try {
        const remote = await Storage.getRemoteAssessment(id)
        if (remote) { d = remote; try { await STO.set(id, remote) } catch { /* quota */ } }
      } catch (e) {
        try { Sentry.captureException(e, { extra: { where: 'resumeDraft.remote', id } }) } catch { /* noop */ }
      }
    }
    if (!d) return false
    // Backfill the durable identity on a record that predates it, and write
    // it back so it is stamped once rather than re-derived on every open.
    // DERIVED, never minted — `ensureAssessmentUid` is deterministic for a
    // record that has an id, which is what stops a re-open from silently
    // becoming a different assessment.
    if (!d.assessmentUid) {
      d = { ...d, assessmentUid: ensureAssessmentUid(d) }
      try { await STO.set(id, d) } catch { /* quota — the value is derived, so the next open agrees anyway */ }
    }
    trackEvent('draft_resumed', { draft_id: id, facility: d.bldg?.fn || d.building?.fn || '' })
    // A suspended finalize belongs to the assessment it was suspended on.
    setFinalizePending(false)
    setDraftId(d.id); setPresurvey(d.presurvey||{}); setBldg(d.bldg||d.building||{}); setZones(d.zones||[{}]); setEquipment(d.equipment||[]); setPhotos(d.photos||{}); setPhotoOverrides(d.photoOverrides||{}); setFloorPlans(await expandFloorPlans(normalizeFloorPlans(d))); setSensorData(d.sensorData||null)
    setCurrentSiteId(d.site_id || null)  // PR 1: inherit site binding if the draft carries one
    setQsqi(d.qsqi||0); setDqi(d.dqi||0); setCurZone(d.curZone||0); setZqi(d.zqi||0)
    // Resume at the right phase — see resolveDraftResumeView for why
    // 'equipment' is a real destination here, not a fallthrough to
    // 'quickstart'.
    setView(resolveDraftResumeView(d))
    return true
  }

  // Logger Studio → report. Writes converted sensor-log averages into a
  // chosen zone of a chosen in-progress report. For the currently-loaded
  // draft we update live state (autosave persists it); for any other draft
  // we read/merge/write it directly via STO. Indoor reading fields only —
  // the converter leaves outdoor/metadata fields untouched.
  const applyAveragesToReport = async ({ reportId, zoneIndex, newZoneName, fields, mode }) => {
    if (!reportId || !fields) return { ok: false }
    const isCurrent = reportId === draftId
    const existing = await STO.get(reportId)
    if (!existing && !isCurrent) return { ok: false }
    const baseDraft = existing || {}
    const srcZones = isCurrent ? zones : (baseDraft.zones || [])
    const nextZones = srcZones.map(z => ({ ...(z || {}) }))
    let zi
    if (zoneIndex === 'new') {
      nextZones.push({ zn: (newZoneName || '').trim() || `Zone ${nextZones.length + 1}` })
      zi = nextZones.length - 1
    } else {
      zi = zoneIndex
      if (zi == null || zi < 0 || zi >= nextZones.length) return { ok: false }
    }
    const zone = { ...(nextZones[zi] || {}) }
    let written = 0
    Object.keys(fields).forEach(id => {
      const isEmpty = String(zone[id] ?? '').trim() === ''
      if (isEmpty || mode === 'overwrite') { zone[id] = fields[id]; written++ }
    })
    nextZones[zi] = zone
    const ua = new Date().toISOString()
    const facility = baseDraft.bldg?.fn || baseDraft.building?.fn || (isCurrent ? bldg.fn : '') || 'Untitled'
    await STO.set(reportId, { ...baseDraft, id: reportId, zones: nextZones, ua })
    await STO.addDraftToIndex({ id: reportId, facility, ua })
    if (isCurrent) setZones(nextZones)
    await refreshIndex()
    trackEvent('logger_averages_applied', { report_id: reportId, zone_index: zi, fields: written, mode })
    return { ok: true, written, zoneName: zone.zn || `Zone ${zi + 1}`, facility }
  }

  // Attach the loaded Logger Studio charts (the whole sensorData object — its
  // per-graph "Include in report" flags + captured images) to a chosen report
  // or draft, so the charts embed in that report's DOCX (sections-sensor reads
  // sensorData.graphs[*].include + imageDataUrl). Writes into the target's
  // stored body; the currently-open assessment already carries it live.
  const applyGraphsToReport = async (reportId) => {
    if (!reportId || !sensorData) return { ok: false }
    if (reportId === draftId) return { ok: true, current: true }
    const base = await STO.get(reportId)
    if (!base) return { ok: false }
    const ua = new Date().toISOString()
    const facility = base.bldg?.fn || base.building?.fn || base.facility_name || 'Untitled'
    await STO.set(reportId, { ...base, id: reportId, sensorData, ua })
    // Refresh the matching index entry's timestamp without moving it between lists.
    if ((index.drafts || []).some(d => d.id === reportId)) await STO.addDraftToIndex({ id: reportId, facility, ua })
    else if ((index.reports || []).some(r => r.id === reportId)) await STO.addReportToIndex({ id: reportId, ts: base.ts || ua, facility, ...indexFindings(base.zoneScores) })
    await refreshIndex()
    trackEvent('logger_graphs_applied', { report_id: reportId })
    return { ok: true, facility }
  }

  const finishQuickStart = () => {
    trackEvent('quickstart_completed', { facility: bldg.fn || '', building_type: bldg.ft || '' })
    if (zones.length === 0) setZones([{}])
    // v2.8.0 — capture HVAC equipment before zones so each zone can
    // be mapped to the units serving it. Equipment-scoped recs
    // (drain pan, filters, OA damper, comprehensive
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
    // A FINALIZED report is a record, not a live recomputation. Re-scoring one
    // would apply today's thermal-comfort season to a survey done months ago,
    // and handleExport builds its DOCX from component state — so the exported
    // document would differ from the one that was issued, silently.
    //
    // The one call site this was written for is gone — the floor-plan screen
    // used to re-score on its way back to Results, and is now a tab that
    // never leaves the screen. The guard stays because it is about the whole
    // class, not that caller: any future entry point that re-scores while a
    // finalized report is open is covered here rather than at each site.
    if (viewRpt) {
      return {
        zScores: zoneScores, composite: comp, osha: oshaResult, recommendations: recs,
        sp: samplingPlan, cc: causalChains, mold: moldResults, mc: measConf,
      }
    }
    // Every entry in `zones` is scored. finishAssessment keeps a zone with
    // nothing recorded in it from reaching here (isBlankZone); the
    // zone screen offers "Remove this zone" for the same reason.
    // Propagate outdoor baselines — one outdoor reading per parameter applies to all zones
    const outdoorFields = ['co2o', 'tfo', 'rho', 'pmo', 'tvo']
    const outdoorValues = {}
    outdoorFields.forEach(f => { const z = zones.find(z => z[f]); if (z) outdoorValues[f] = z[f] })
    const zonesWithOutdoor = zones.map(z => {
      const fill = {}
      outdoorFields.forEach(f => { if (!z[f] && outdoorValues[f]) fill[f] = outdoorValues[f] })
      return Object.keys(fill).length > 0 ? { ...z, ...fill } : z
    })
    // The survey date rides in on the building object (scoreZone merges
    // { ...bldg, ...zone }), so a draft resumed after a month boundary is
    // still scored against the day the walkthrough happened rather than the
    // day it was reopened.
    //
    // The fallback is today, and it is stated here rather than left to the
    // engine. comfortSeason used to read the clock itself; that was removed
    // (audit H5) so a report re-rendered in another month could not silently
    // change band, and its docstring says "the caller that genuinely is live
    // passes today explicitly". THIS is that caller, and it did not — the old
    // comment here still claimed "comfortSeason's fallback to now is correct"
    // about a fallback that no longer existed. Between them, every assessment
    // that reached scoring without an entered date had its temperature
    // silently not evaluated. New assessments now carry a stamped
    // ps_survey_date (freshPresurvey); this covers drafts created before that.
    const surveyDate = resolveAssessmentDate({ presurvey }) || todayLocalISO()
    const scoringBldg = { ...bldg, assessmentDate: surveyDate }
    const zScores = zonesWithOutdoor.map(z => scoreZone(z, scoringBldg))
    const composite = summarizeAssessment(zScores)
    // The zone carrying the worst finding. This used to re-run scoreZone
    // twice per comparison to find the lowest-SCORING zone.
    const worst = zonesWithOutdoor[worstZoneIndex(zScores)]
    const osha = evalOSHA({...bldg, ...worst})
    const recommendations = genRecs(zScores, bldg, { zones: zonesWithOutdoor, equipment })
    const sp = generateSamplingPlan(zonesWithOutdoor, bldg)
    const cc = buildCausalChains(zonesWithOutdoor, bldg, zScores)
    const mold = zonesWithOutdoor.map(z => evalMold(z)).filter(Boolean)
    const mc = evalMeasurementConfidence(zonesWithOutdoor)
    setZones(zonesWithOutdoor)
    setZoneScores(zScores); setComp(composite); setOshaResult(osha); setRecs(recommendations)
    setSamplingPlan(sp); setCausalChains(cc); setMoldResults(mold); setMeasConf(mc)
    emitEvent('engine_ran', {
      target_id: draftId || null,
      target_type: 'assessment',
      details: { findings: composite?.findings?.total ?? null, attention: composite?.findings?.attention ?? null, zones: zonesWithOutdoor.length },
    })
    return { zScores, composite, osha, recommendations, sp, cc, mold, mc }
  }

  const finishAssessment = async (bypassCalWarning, acknowledgement, opts = {}) => {
    // Zones with nothing recorded — a "+ Add another zone" that was never
    // filled in, or one stepped past with ‹ Prev / Next › — do not belong
    // in the census. Stop and ask before scoring them; the sheet either
    // strips them (then re-enters here with skipBlankCheck, see the
    // pendingFinish effect) or takes the assessor to the first one. The
    // ack path (bypassCalWarning) has already been through this.
    if (!bypassCalWarning && !opts.skipBlankCheck) {
      const blank = blankZoneIndices(zones, OUTDOOR_SENSOR_IDS)
      if (blank.length > 0 && blank.length < zones.length) { setBlankZonePrompt(blank); return }
      // Every zone blank: there is nothing to finalize. Send them to zone 1.
      if (blank.length > 0) { setCurZone(0); setZqi(0); setView('zone'); toast.error('Record at least one zone before finishing.'); return }
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
    // Carry whatever the interrupt captured (null on the clean path).
    const calibrationAcknowledgement = acknowledgement || calAck || null
    // Append-only copy in audit_log. The assessment row is mutable and
    // deletable; an acknowledgement that disappears with the record it
    // explains is not an audit trail. actor_id is derived server-side
    // from the session, so the identity here cannot be spoofed.
    if (calibrationAcknowledgement) {
      emitEvent('calibration_exception_acknowledged', {
        target_id: draftId || null,
        target_type: 'assessment',
        details: {
          items: calibrationAcknowledgement.items,
          justification: calibrationAcknowledgement.justification,
        },
      })
    }
    const { zScores, composite, osha, recommendations, sp, cc } = runScoring()
    // aiSections is deliberately NOT cleared here, unlike narrative. Its own
    // fingerprint (src/report/aiSections.js) already governs whether it
    // survives this re-score: identical data re-scores to an identical
    // fingerprint and the AI sections the assessor just generated stay
    // usable through to the finalize below; changed data goes stale and
    // falls back on its own. Clearing it here would discard valid work the
    // fingerprint check was built to keep.
    setSelZone(0); setNarrative(null)
    trackEvent('engine_completed', { zones: composite?.count, findings: composite?.findings?.total, attention: composite?.findings?.attention, osha_flag: !!osha?.flag, confidence: osha?.conf || 'unknown', data_gaps: (osha?.gaps||[]).length })
    trackEvent('assessment_completed', { zones: zones.length, findings: composite?.findings?.total, facility: bldg.fn || 'unknown', has_causal_chains: cc.length > 0, sampling_recommendations: sp?.plan?.length || 0 })
    haptic('success')
    setMilestone({icon:'chart',title:'Assessment Complete',sub:`Scoring ${zones.length} zone${zones.length>1?'s':''}...`})
    // The milestone holds for at least 1.6s so the "scoring" beat reads as
    // a step, but Results is shown only once the LOCAL record is written
    // and `draftId` has advanced to the report id — an export tapped
    // before that carried the retired draft id. Cloud sync and the site
    // refresh stay after the transition: they never touch `draftId`, and
    // an offline queue should not hold the screen.
    const minHold = new Promise((resolve) => setTimeout(resolve, 1600))
    const showResults = () => { setMilestone(null); setRTab('overview'); setView('results') }
    let report = null
    let rid = null
    try {
    // Reuse the existing report id when re-finalizing one that was resumed to
    // fix a defensibility gap, so it UPDATES in place instead of spawning a
    // duplicate. A brand-new assessment gets a fresh rpt- id and its source
    // draft is retired. Either way the id is dropped from the drafts list so a
    // finalized report never also lingers as a draft.
    rid = resolveFinalizeTarget({
      currentId: draftId,
      reportIds: (index.reports || []).map(r => r.id),
      newId: 'rpt-' + Date.now(),
    }).rid
    // PR 1: stamp the report with the bound site_id when present
    // (deep-link hydration or a previous "Save site" finalize).
    // siteLink.findMostRecentReportForSite uses this on the next round.
    // Carry the assessment's durable identity ACROSS the id change.
    //
    // `rid` is a brand-new `rpt-` id whenever this is a first finalize, so
    // deriving a uid from it here would hand the same assessment a different
    // identity the moment it became a deliverable — the one transition the
    // uid exists to survive. Read it off the record being finalized instead:
    // the opened report when re-finalizing, else the draft body the autosave
    // stamped. `ensureAssessmentUid` is the last resort, for a finalize with
    // no stored body behind it at all.
    const priorBody = (draftId ? await STO.get(draftId) : null) || {}
    const assessmentUid =
      viewRpt?.assessmentUid || priorBody.assessmentUid || ensureAssessmentUid({ id: draftId || rid })
    // Photo blobs live in IndexedDB under the DRAFT id; deleteAssessment
    // below purges that namespace, so copy them under the report id first.
    const { photos: reportPhotos } = await rekeyPhotos(photos, rid)
    if (reportPhotos !== photos) setPhotos(reportPhotos)
    // The floor plans' images live in the same namespace; same move.
    const reportPlans = await rekeyFloorPlans(floorPlans, rid)
    if (reportPlans !== floorPlans) setFloorPlans(reportPlans)
    // aiSections locks here (src/report/aiSections.js) — mirrors `runScoring`'s
    // own finalized-report guard: an issued report's AI-authored sections do
    // not change on a later export because someone regenerated them. Locking
    // a record that happens to be stale against zScores/cc is harmless — the
    // render-time freshness check is what actually gates use, always, lock or
    // no lock; this only stops FURTHER regeneration once issued.
    report = { id:rid, assessmentUid, ts:new Date().toISOString(), ver:VER, presurvey, building:bldg, zones, equipment, photos: reportPhotos, floorPlans: compactFloorPlans(reportPlans), sensorData, zoneScores:zScores, comp:composite, oshaEvals:[osha], recs:recommendations, samplingPlan:sp, causalChains:cc, standardsManifest:STANDARDS_MANIFEST, site_id: currentSiteId || null, calibrationAcknowledgement, aiSections: lockAiSections(aiSections) }
    reportStorageWrite(await STO.set(rid, report), 'report')
    await STO.addReportToIndex({ id:rid, ts:report.ts, facility:bldg.fn, ...indexFindings(zScores) })
    await STO.removeFromIndex(rid, 'dft')
    // Storage.deleteAssessment, not STO.del: the draft row in the cloud
    // still carries this assessment_uid, and the new rpt- row would hit
    // the 032 unique index on first finalize (audit H3). deleteAssessment
    // removes local + index + IDB photos AND the cloud row, queueing the
    // cloud delete when offline. (supabaseStorage also self-heals a
    // 23505 by deleting the stale draft- row, so this is belt and braces.)
    if (draftId && draftId !== rid) { await Storage.deleteAssessment(draftId) }
    // Advance the session pointer to the finalized report. Without this,
    // draftId kept pointing at the now-retired draft id, so a follow-up
    // finalize in the SAME session — e.g. right after fixing a readiness
    // blocker on the results screen — failed the reuse check above and minted
    // a second rpt- record. That was the multiple-reports-per-project bug: the
    // in-session fix path never matched, only the leave-and-reopen path (via
    // resumeAndFix → resumeDraft) did.
    setDraftId(rid)
    await refreshIndex()
    } catch (e) {
      // Live state is already scored and renders Results on its own; what
      // failed is the saved record. Say so rather than letting the beat
      // time out into a screen that looks finalized.
      console.error('Finalize: local persistence failed', e)
      report = null
      toast.error('The report could not be saved on this device. Your results are shown, but re-finalize before exporting.')
    }
    await minHold
    showResults()
    if (!report) return
    // Sync to cloud
    if (supabase) {
      // saveAssessment never throws on a cloud failure any more; it reports
      // { ok, queued, conflict } (sync handoff §4).
      const r = await Storage.saveAssessment({ ...report, status: 'complete', facility_name: bldg.fn })
      if (r && !r.ok && r.conflict) console.warn('Cloud sync conflict — resolve from the sync indicator:', r.error?.message)
      else if (r && !r.ok && !r.queued) console.warn('Cloud sync failed:', r.error?.message)
    }

    // Habit-loop PR 1 — close the investment → trigger arc.
    //
    // Two branches:
    //   • Already bound to a site (deep-link or earlier save): silently
    //     refresh last_finalized_at on the site so the cron reschedules
    //     the reminder pushed out one full interval from THIS finalize.
    //   • Fresh assessment with no bound site: surface the SaveSitePrompt
    //     so the user explicitly consents to the loop. Either choice
    //     emits assessment_finalized (with or without site_id) so the
    //     event spine sees a finalize regardless.
    if (currentSiteId) {
      // Silent refresh path. Update the site's last_finalized_at, then
      // emit so /api/events re-enqueues the reminder.
      try {
        const session = supabase ? await Storage.getSession() : null
        if (session?.access_token) {
          await fetch('/api/sites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
            body: JSON.stringify({ action: 'save', site: { id: currentSiteId, name: bldg.fn || 'Site', last_finalized_at: report.ts } }),
          })
        }
      } catch (e) { console.warn('Site refresh deferred:', e && e.message) }
      emitEvent('assessment_finalized', {
        target_id: rid,
        target_type: 'assessment',
        details: {
          site_id: currentSiteId,
          zones: zones.length,
          facility_name: bldg.fn || null,
          // Habit-loop PR 5: lets /api/events schedule the
          // sampling-results-outstanding reminder.
          sampling_plan_size: (sp?.plan || []).length,
          lab_results_attached: !!(viewRpt?.labResults),
        },
      })
    } else {
      // First-time path — open the SaveSitePrompt over the results view.
      setSavePromptCtx({ rid, ts: report.ts })
    }
  }

  // Re-enter finalize once the blank-zone sheet's removal has committed.
  // Counter, not boolean, and depends on the counter ALONE — same
  // reasoning as pendingRescore above: the strip and this bump land in
  // one handler, so the closure here already sees the shorter `zones`.
  useEffect(() => {
    if (pendingFinish === 0) return
    finishAssessment(false, null, { skipBlankCheck: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFinish])

  // Take the current zone out of the assessment: photos re-keyed, the
  // equipment mapping pruned, the pointer clamped. See zoneContent.js.
  const removeCurrentZone = () => {
    if (zones.length <= 1) return
    const next = removeZoneAt({ zones, photos, photoOverrides, equipment, curZone }, curZone)
    trackEvent('zone_removed', { zone_index: curZone, zones_remaining: next.zones.length })
    setZones(next.zones); setPhotos(next.photos); setPhotoOverrides(next.photoOverrides); setEquipment(next.equipment)
    setCurZone(next.curZone); setZqi(0); setConfirmRemoveZone(false)
    haptic('light')
  }

  const finishDetails = () => {
    trackEvent('details_completed', { facility: bldg.fn || '' })
    runScoring()
    // Resume the finalize the calibration interrupt suspended. The flag is
    // cleared either way, so Details reached from anywhere else — the results
    // screen's completeness prompts, the menu — still just re-scores and
    // returns, and a stale flag cannot survive into a later visit.
    if (finalizePending) {
      setFinalizePending(false)
      showMilestone('check', 'Details Complete', 'Finalizing the assessment', () => { finishAssessment() })
      return
    }
    showMilestone('check', 'Details Complete', 'Assessment rescored with updated data', () => { setView('results') })
  }

  // What the deterministic audit found in the last generated narrative
  // (src/report/narrativeAudit.js). Not persisted: it describes one draft, and
  // a stale verdict beside re-generated prose is worse than none.
  const [narrativeAudit, setNarrativeAudit] = useState(null)

  const requestNarrative = async () => {
    if (!PAYWALL_DISABLED && credits < 3) { setShowPricing(true); return }
    consumeCredit(3, 'narrative')
    trackEvent('narrative_requested', { facility: bldg.fn || '', findings: comp?.findings?.total })
    setNarrativeLoading(true)
    setNarrativeAudit(null)
    // The rest of the report data rides along so the evidence package the
    // model writes from describes the same report the client will receive —
    // same criteria, same action register, same limitations.
    const result = await generateNarrative(bldg, zones, zoneScores, recs, presurvey, {
      id: viewRpt?.id || draftId || null, equipment, comp,
      causalChains, profile, photos, photoOverrides, floorPlans, ts: viewRpt?.ts,
      sensorData: (viewRpt && viewRpt.sensorData) || sensorData,
    })
    const text = result && result.narrative
    setNarrative(text || null)
    setNarrativeAudit(text ? { issues: result.audit || [], summary: result.auditSummary } : null)
    setNarrativeLoading(false)
    if (text) {
      trackEvent('narrative_generated', {
        word_count: text.split(/\s+/).length,
        audit_blocking: (result.auditSummary && result.auditSummary.blocking) || 0,
        audit_warnings: (result.auditSummary && result.auditSummary.warnings) || 0,
      })
    }
  }

  const [reportSectionsLoading, setReportSectionsLoading] = useState(false)

  const requestReportSections = async () => {
    if (!PAYWALL_DISABLED && credits < 5) { setShowPricing(true); return }
    consumeCredit(5, 'report_sections')
    trackEvent('report_sections_requested', { facility: bldg.fn || '', findings: comp?.findings?.total })
    setReportSectionsLoading(true)
    // Same report data narrative already threads through, so the evidence
    // package this writes from and the one the DOCX export will fingerprint
    // against (src/report/aiSections.js) describe the same assessment.
    const rec = await generateReportSections({
      building: bldg, presurvey, zones, zoneScores, recs, causalChains,
      id: viewRpt?.id || draftId || null, equipment, comp, profile, photos, photoOverrides, floorPlans,
      ts: viewRpt?.ts, sensorData: (viewRpt && viewRpt.sensorData) || sensorData,
    })
    setAiSections(rec)
    setReportSectionsLoading(false)
    if (rec) {
      const summaries = Object.values(rec.auditSummary || {})
      trackEvent('report_sections_generated', {
        section_count: Object.keys(rec.sections || {}).length,
        audit_blocked: summaries.filter(s => s && s.supported === false).length,
      })
    }
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

  // The logger dataset a report of THIS assessment reads. On a saved report
  // (view 'report') it rides on viewRpt — that is where "Send graphs to a
  // report" writes it and where the Logger tab's include toggle edits it —
  // while the live sensorData state belongs to whatever assessment was last
  // worked on in Logger Studio. Until 2026-09 every export read the live
  // state, so a finalized report opened from the list exported WITHOUT the
  // graphs attached to it (the toast had promised "open it and re-export"),
  // and with another assessment's graphs if any happened to be loaded. One
  // source, used by every export path, the Report-tab consistency check and
  // the assessment context.
  const reportSensorData = () => ((view === 'report' && viewRpt) ? (viewRpt.sensorData || null) : sensorData)

  // The figures a report embeds, prepared once per export:
  //  - every "Include in report" logger timeline with a usable PNG. The
  //    on-screen capture is unreliable on iOS Safari (and the results-tab
  //    toggle never captured at all), so the included charts are re-rendered
  //    from their data points — a self-contained-SVG raster every export
  //    (DOCX, AtmosFlow PDF, Web) then embeds.
  //  - every floor plan with the sampling locations drawn on it as numbered
  //    pins, one figure per plan. A Word document cannot overlay the spatial
  //    map's HTML pins, so each plan and its pins are composed into one
  //    image here; if that fails the raw plan still renders, sized from its
  //    own header, with the recorded positions listed beneath it.
  const prepareReportFigures = async () => {
    const { ensureLoggerChartImages } = await loadLoggerChartImages()
    const sensorDataForReport = await ensureLoggerChartImages(reportSensorData())
    let floorPlansForReport = floorPlans || []
    if (floorPlansForReport.length) {
      try {
        const { composeFloorPlanFigures } = await loadFloorPlanFigure()
        floorPlansForReport = await composeFloorPlanFigures({ floorPlans }, zones, { building: bldg })
      } catch { /* the raw plans are still embedded */ }
    }
    return { sensorData: sensorDataForReport, floorPlans: floorPlansForReport }
  }

  const executeExport = async (format, filteredPhotos, docxType) => {
    // Photo records are `{ idbId, ts }` in state; the renderers need the
    // image. Resolve every selected record from IndexedDB here, once.
    filteredPhotos = (await expandPhotos(filteredPhotos || {})).photos
    const esc = evaluateEscalation({ zones, comp, moldResults }, [], [])
    const figures = await prepareReportFigures()
    const assessmentContext = buildAssessmentContext({
      view, presurvey, bldg, zones, curZone, photos: filteredPhotos, sensorData: figures.sensorData,
      comp, zoneScores, recs, narrative, samplingPlan, causalChains,
      profile, draftId,
      calibrationAcknowledgement: viewRpt?.calibrationAcknowledgement || calAck || null,
    })
    // `id` is the record this export is OF. Without it every export of the
    // same report mints a fresh Report ID downstream — see the fallback in
    // src/report/reportModel.js. `viewRpt` is the opened finalized report;
    // `draftId` is the session pointer, which finalize advances to the new
    // report id, so this resolves to the same value on every re-export.
    const reportData = { id: viewRpt?.id || draftId || null, building: bldg, presurvey, zones, equipment, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos: filteredPhotos, photoOverrides, version: VER, standardsManifest: viewRpt?.standardsManifest || STANDARDS_MANIFEST, userMode, escalationTriggers: esc, floorPlans: figures.floorPlans, sensorData: figures.sensorData, labResults: viewRpt?.labResults || null, calibrationAcknowledgement: viewRpt?.calibrationAcknowledgement || calAck || null, aiSections: viewRpt?.aiSections || aiSections, assessmentContext }
    trackEvent('report_exported', { format: docxType || format, facility: bldg.fn || '', findings: comp?.findings?.total, zones: zones.length, has_narrative: !!narrative, photos: Object.values(filteredPhotos).flat().length })

    try {
      if (format === 'docx') {
        // Play the pen-writing animation for a fixed beat before the file is
        // produced — longer for the narrative consultant report, shorter for
        // the structured technical report.
        const WRITE_MS = { technical: 12000 }
        const ms = WRITE_MS[docxType] || 15000
        const label = docxType === 'technical' ? 'Writing your technical report' : 'Writing your report'
        setGenWriting({ label, durationMs: ms })
        await new Promise(res => setTimeout(res, ms))
        const { generateTechnicalOnly, generateAtmosFlowOnly } = await loadDocxReport()
        if (docxType === 'technical') await generateTechnicalOnly(reportData)
        else await generateAtmosFlowOnly(reportData)
      } else if (format === 'pdf') {
        // Fixed AtmosFlow PDF report — the exact sample design, real data.
        // Built model client-side, laid out by the shared pdfkit renderer
        // server-side (/api/report-pdf). docxType carries the mode.
        const mode = docxType === 'final' ? 'final' : 'draft'
        setGenWriting({ label: 'Generating your AtmosFlow report', durationMs: 10000 })
        await downloadReportPdf(reportData, { mode })
      } else {
        // Web (HTML) consultant report — play the same pen-writing beat
        // as the DOCX path before the file is produced, then download.
        // docxType carries the style choice here: 'modern' = new editorial
        // layout, anything else = classic.
        const style = docxType === 'modern_summary' ? 'modern_summary' : docxType === 'modern' ? 'modern' : 'classic'
        setGenWriting({ label: 'Writing your consultant report', durationMs: 15000 })
        const { printReport } = await loadPrintReport()
        await new Promise(res => setTimeout(res, 15000))
        printReport(reportData, { style })
      }
      emitEvent('report_exported', {
        target_id: draftId || null,
        target_type: 'assessment',
        details: { format: docxType || format, findings: comp?.findings?.total ?? null, zones: zones.length },
      })
    } catch (e) {
      console.error('Export failed:', e)
      // v2.6.1 — detect the stale-chunk MIME error and offer a hard
      // reload instead of the generic "Please try again" message.
      // The error fires when index.html references a chunk hash the
      // server no longer has (post-redeploy without cache bust).
      const msg = (e && e.message) || ''
      if (isStaleChunkError(e)) {
        // importSafe has already evicted the SW caches and raised the
        // persistent "Reload" toast; nothing more to say here.
        return
      }
      toast.error('Report export failed: ' + (msg || 'Unknown error') + '. Please try again.')
    } finally {
      setGenWriting(null)
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
    const title = `IAQ Assessment Report: ${bldg.fn || 'Assessment'}`
    const filteredPhotos = (() => {
      const sel = selectedPhotos && Object.values(selectedPhotos).some(Boolean) ? selectedPhotos : null
      if (!sel) return photos
      const out = {}
      Object.keys(photos || {}).forEach(k => {
        out[k] = (photos[k] || []).filter((_, i) => sel[`${k}::${i}`])
      })
      return out
    })()
    const expandedPhotos = (await expandPhotos(filteredPhotos)).photos
    const figures = await prepareReportFigures()
    const assessmentContext = buildAssessmentContext({
      view, presurvey, bldg, zones, curZone, photos: filteredPhotos, sensorData: figures.sensorData,
      comp, zoneScores, recs, narrative, samplingPlan, causalChains,
      profile, draftId,
      calibrationAcknowledgement: viewRpt?.calibrationAcknowledgement || calAck || null,
    })
    // `id` — the record this export is OF. See the note in executeExport.
    const reportData = { id: viewRpt?.id || draftId || null, building: bldg, presurvey, zones, equipment, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos: expandedPhotos, photoOverrides, version: VER, standardsManifest: viewRpt?.standardsManifest || STANDARDS_MANIFEST, userMode, floorPlans: figures.floorPlans, sensorData: figures.sensorData, labResults: viewRpt?.labResults || null, calibrationAcknowledgement: viewRpt?.calibrationAcknowledgement || calAck || null, aiSections: viewRpt?.aiSections || aiSections, ts: viewRpt?.ts, assessmentContext }
    let blob, fileName
    try {
      const { getAtmosFlowDocxBlob } = await loadDocxReport()
      const built = await getAtmosFlowDocxBlob(reportData)
      blob = built.blob
      fileName = built.fileName
    } catch (e) {
      console.error('Share DOCX build failed:', e)
      toast.error('Could not prepare report for sharing: ' + ((e && e.message) || 'Unknown error'))
      return
    }
    trackEvent('report_shared', { facility: bldg.fn || '', findings: comp?.findings?.total, format: 'docx' })
    const file = new File([blob], fileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ title, files: [file] }) } catch { /* user cancelled */ }
    } else if (navigator.share) {
      const text = `${bldg.fn || 'Facility'}: IAQ screening assessment\n${zoneScores?.length || 0} zone${(zoneScores?.length || 0) === 1 ? '' : 's'} assessed`
      try { await navigator.share({ title, text }) } catch { /* user cancelled */ }
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
  }

  /**
   * Send the finalized consultant DOCX to a peer reviewer (habit-loop PR 4).
   * Generates the DOCX client-side (so docxtemplater stays out of the
   * /api/peer-review function), base64-encodes it, POSTs to
   * /api/peer-review with the reviewer's name/email/note. The server
   * inserts a peer_reviews row + sends the email synchronously via
   * Resend with the DOCX attached.
   */
  const sendForPeerReview = async ({ reviewer_name, reviewer_email, message }) => {
    // Build reportData identically to handleShare so the DOCX is the
    // same artifact the assessor would have shared manually.
    const filteredPhotos = (() => {
      const sel = selectedPhotos && Object.values(selectedPhotos).some(Boolean) ? selectedPhotos : null
      if (!sel) return photos
      const out = {}
      Object.keys(photos || {}).forEach(k => {
        out[k] = (photos[k] || []).filter((_, i) => sel[`${k}::${i}`])
      })
      return out
    })()
    const expandedPhotos = (await expandPhotos(filteredPhotos)).photos
    const figures = await prepareReportFigures()
    const assessmentContext = buildAssessmentContext({
      view, presurvey, bldg, zones, curZone, photos: filteredPhotos, sensorData: figures.sensorData,
      comp, zoneScores, recs, narrative, samplingPlan, causalChains,
      profile, draftId,
      calibrationAcknowledgement: viewRpt?.calibrationAcknowledgement || calAck || null,
    })
    // `id` — the record this export is OF. See the note in executeExport.
    const reportData = { id: viewRpt?.id || draftId || null, building: bldg, presurvey, zones, equipment, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos: expandedPhotos, photoOverrides, version: VER, standardsManifest: viewRpt?.standardsManifest || STANDARDS_MANIFEST, userMode, floorPlans: figures.floorPlans, sensorData: figures.sensorData, labResults: viewRpt?.labResults || null, calibrationAcknowledgement: viewRpt?.calibrationAcknowledgement || calAck || null, aiSections: viewRpt?.aiSections || aiSections, ts: viewRpt?.ts, assessmentContext }
    const { getAtmosFlowDocxBlob } = await loadDocxReport()
    const built = await getAtmosFlowDocxBlob(reportData)
    // Size pre-check. The DOCX is uploaded to Storage and attached to the
    // review email by the server; keep it under a cap that leaves the
    // outbound email (base64 adds ~33%) safely below Resend's ~40 MB limit.
    const EMAIL_DOCX_LIMIT_BYTES = 20 * 1024 * 1024
    if (built.blob.size > EMAIL_DOCX_LIMIT_BYTES) {
      const mb = (built.blob.size / (1024 * 1024)).toFixed(1)
      throw new Error(`This report is ${mb} MB — too large to email for peer review (limit 20 MB; photos are the usual cause). Deselect or compress photos, or download the report and send it to your reviewer manually.`)
    }
    if (!supabase) throw new Error('You need to be signed in to send for review.')
    const session = await Storage.getSession()
    if (!session?.access_token) throw new Error('Session expired. Please sign in again.')
    const userId = session.user?.id
    if (!userId) throw new Error('Session expired. Please sign in again.')
    const reportId = viewRpt?.id || draftId || ('rpt-' + Date.now())
    // Upload the DOCX to Storage and send only its path — keeps the request
    // body tiny so it never trips Vercel's ~4.5 MB body limit. Path is scoped
    // to the user's own folder (bucket RLS + server-side prefix check).
    const uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const docxPath = `${userId}/${uid}.docx`
    const { error: upErr } = await supabase.storage.from('peer-review-attachments').upload(docxPath, built.blob, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    })
    if (upErr) throw new Error(`Could not stage the report for review: ${upErr.message || 'upload failed'}. Please try again.`)
    const resp = await fetch('/api/peer-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({
        action: 'send',
        report_id: reportId,
        facility_name: bldg.fn || null,
        reviewer_name, reviewer_email, message,
        file_name: built.fileName,
        docx_path: docxPath,
      }),
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      // Prefer the handler's own error code; otherwise the failure came from
      // the platform (413 body-too-large, 5xx, timeout) with no JSON body —
      // surface the status so it's diagnosable instead of a bare "Send failed."
      const detail = json.error === 'report_not_found'
        ? 'this report has not synced to the cloud yet — connect and try again.'
        : json.error
        ? String(json.error)
        : resp.status === 413
          ? 'the report is too large to email (20 MB limit).'
          : resp.status === 401
            ? 'your session expired — sign in and try again.'
            : resp.status >= 500
              ? 'the review service is temporarily unavailable. Please try again shortly.'
              : `unexpected error (HTTP ${resp.status}).`
      throw new Error(`Send failed — ${detail}`)
    }
    emitEvent('peer_review_requested', {
      target_id: json.id || null,
      target_type: 'peer_review',
      details: { facility: bldg.fn || null },
    })
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
      const { getNarrativeDocxBlob } = await loadDocxReport()
      const built = await getNarrativeDocxBlob({ facility: bldg, narrative, profile, ts: viewRpt?.ts })
      blob = built.blob
      fileName = built.fileName
    } catch (e) {
      console.error('Share narrative DOCX build failed:', e)
      toast.error('Could not prepare narrative for sharing: ' + ((e && e.message) || 'Unknown error'))
      return
    }
    trackEvent('narrative_shared', { facility: bldg.fn || '', word_count: String(narrative).split(/\s+/).length })
    const file = new File([blob], fileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const title = `IAQ Findings Narrative: ${bldg.fn || 'Assessment'}`
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

  // Rebuild a screen from a history entry (back / forward gesture, or the
  // pending entry a refresh left behind). Routes that depend on in-memory
  // draft state are not restorable and fall back to home.
  const restoreNav = async (st) => {
    const kind = ROUTES[st?.view]?.restore
    if (!kind) { goHome(); return }
    if (st.view === 'report') {
      if (!st.rptId) { goHome(); return }
      const meta = (index.reports || []).find(r => r.id === st.rptId) || { id: st.rptId }
      await openReport(meta)
      return
    }
    if (st.view === 'project-detail') {
      if (!st.projectId) { goHome(); return }
      setActiveProjectId(st.projectId); setViewRpt(null); setView('project-detail')
      return
    }
    if (st.view === 'incident-detail') {
      const inc = st.incidentId ? (await STO.getIncidents()).find(i => i && i.id === st.incidentId) : null
      if (inc) { setCurrentIncident(inc); setView('incident-detail') } else setView('incident-log')
      return
    }
    setViewRpt(null)
    setView(st.view)
  }
  const restoredPendingRef = useRef(false)
  useEffect(() => {
    if (!profile || !initialNav.pending || restoredPendingRef.current) return
    restoredPendingRef.current = true
    restoreNav(initialNav.pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  // Bridge the FM Buildings portfolio to the project workspace: tapping a
  // building opens its Project (created on first open, matched by name), so
  // the two building-organization surfaces are layered (portfolio → site
  // workspace) rather than parallel and disconnected.
  const openBuildingProject = async (buildingId) => {
    let buildings = []
    buildings = (await STO.get(KEYS.buildings)) || []
    const b = buildings.find(x => x && x.id === buildingId)
    if (!b) return
    const proj = await getOrCreateProjectByName(b.name, { address: b.address || '', status: 'active' })
    setActiveProjectId(proj.id)
    setView('project-detail')
  }

  /**
   * What the report INDEX carries about a finalized report.
   *
   * The index used to carry `score` — the composite — which drove the
   * report list's sort order, the dashboard band pills, search results
   * and the whole portfolio roll-up. It now carries the finding census,
   * which is what those surfaces were reaching for through the number.
   *
   * Records written before this change keep their `score` key; nothing
   * reads it, and it is left in place rather than migrated so an issued
   * report's own record stays as it was issued.
   */
  const indexFindings = (zScores) => {
    const c = countFindings(zScores || [])
    return { findings: c.total, attention: c.attention, worstSeverity: worstFindingSeverity(zScores || []) }
  }

  // A finalized report needs at least one zone assessment to render. A
  // local body missing them is unusable for the report view (e.g. it was
  // overwritten by a draft-shape autosave, or never fully persisted).
  //
  // This used to also require `r.comp || r.composite`, which made the
  // presence of a composite the DEFINITION of a valid finalized report.
  // With no composite computed, that test would have failed every report
  // ever issued — the guard had quietly become the emptiness check for
  // the whole report view. Zone assessments are what the view actually
  // needs, and legacy records carry them unchanged.
  const isRenderableReport = (r) => !!(r && Array.isArray(r.zoneScores) && r.zoneScores.length > 0)

  const openReport = async (meta) => {
    // Read the local body first; if it isn't renderable as a finalized report
    // (missing/corrupt), pull the complete copy from the cloud and heal local.
    // Never let the tap die silently — surface what happened.
    let rpt = null
    try {
      const local = await STO.get(meta.id)
      rpt = local
      if (!isRenderableReport(rpt) && supabase) {
        const remote = await Storage.getRemoteAssessment(meta.id)
        if (isRenderableReport(remote) || (!rpt && remote)) {
          rpt = remote
          // Actually heal local, which this block has claimed to do since it
          // was written but never did. It only healed the VIEW, so the body
          // stayed missing on this device and every later `STO.get` for it
          // failed again — including resumeDraft's, which is how tapping
          // "Fix" could silently fail and finalize into a brand-new report.
          try { await STO.set(meta.id, rpt) } catch { /* quota — the view still works */ }
        }
      }
    } catch (e) {
      try { Sentry.captureException(e, { extra: { where: 'openReport.fetch', id: meta?.id } }) } catch { /* noop */ }
    }
    if (!rpt) {
      setReportOpenError({ name: 'ReportNotFound', message: `Report "${meta?.facility || meta?.id}" could not be loaded from this device or the cloud.`, stack: '' })
      setViewRpt(meta); setView('report')
      return
    }
    // Same backfill as resumeDraft. This is the path a customer takes to
    // re-download a report they already have, so a MINTED uid here would make
    // an old report look like a new assessment on every open — under
    // per-report pricing, a second charge for a document they already bought.
    // `ensureAssessmentUid` derives deterministically from the record id.
    if (!rpt.assessmentUid) {
      rpt = { ...rpt, assessmentUid: ensureAssessmentUid(rpt) }
      try { await STO.set(meta.id, rpt) } catch { /* quota — derived, so the next open agrees anyway */ }
    }
    setReportOpenError(null)
    trackEvent('report_viewed', { report_id: meta.id, facility: meta.facility || '', findings: meta.findings })
    setViewRpt(rpt); setPresurvey(rpt.presurvey||{}); setBldg(rpt.building||rpt.bldg||{}); setZones(rpt.zones||[]); setEquipment(rpt.equipment||[])
    setPhotos(rpt.photos||{}); setPhotoOverrides(rpt.photoOverrides||{}); setFloorPlans(await expandFloorPlans(normalizeFloorPlans(rpt))); setZoneScores(rpt.zoneScores||[]); setComp(rpt.comp||rpt.composite)
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
    // Sorted by composite until the score was removed. Findings-first is
    // the same intent: put the assessments with the most to act on at the
    // top. Legacy records carry no count, so they sort as zero rather
    // than jumping the queue.
    else if (hSort === 'findings-low') l.sort((a,b) => (a.findings||0)-(b.findings||0))
    else l.sort((a,b) => (b.findings||0)-(a.findings||0))
    return l
  }, [index.reports, hSearch, hSort])

  const qsSecs = [...new Set(qsVis.map(q=>q.sec))]
  const dtSecs = [...new Set(dtVis.map(q=>q.sec))]
  const zSecs = [...new Set(zVis.map(q=>q.sec))]

  // While the cached session resolves: a static frame of the first
  // screen in the theme's colors, so the real screen draws in the same
  // place with nothing to wait through. The brand intro that used to
  // follow a first sign-in is gone (see LaunchFrame for the reasoning).
  if (loading) return <LaunchFrame heading={homeView(userMode) === 'projects' ? 'Projects' : null} padX={padX} contentMax={contentMax} />
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
  // New user — show welcome then profile setup. Also the host for the saved-
  // profile picker / editor reached from Account (editingProfile), which used
  // to piggyback on the legacy 'dash' view and leave the user there.
  if (profile?.isNew && (view === 'dash' || editingProfile)) {
    if (!welcomeDone) return <WelcomeScreen onComplete={() => { sessionStorage.setItem('aiq_welcomed', '1'); setWelcomeDone(true) }} />
    return <ProfileScreen onLogin={async (p) => {
      if (supabase) await Storage.saveProfile(p)
      setProfile(p)
      // When this was the Account "select / edit profile" flow, return to the
      // correct home (projects for IH/CSP) rather than stranding on 'dash'.
      if (editingProfile) { setEditingProfile(false); goHome() }
    }} />
  }

  const handleModeSwitch = (m) => { persistMode(m); setUserMode(m) }

  // Mold mode is its own self-contained experience — a parallel screening
  // engine with its own intake + result surface, sharing none of the IAQ
  // zone/scoring/nav machinery. So it renders in ISOLATION here (an early
  // return in the same guard zone as the Welcome/Profile screens above), which
  // keeps the IAQ shell/nav from ever mounting in mold mode. Gated by
  // isMoldModuleEnabled(); a persisted 'mold' mode seen with the flag off falls
  // back to IH rather than stranding the user on a hidden mode.
  if (userMode === 'mold') {
    if (isMoldModuleEnabled()) {
      return <Suspense fallback={LAZY_FALLBACK}><MoldModeScreen profile={profile} onExit={() => { handleModeSwitch('ih'); setView(homeView('ih')) }} /></Suspense>
    }
    persistMode('ih'); setUserMode('ih')
  }

  // ── Question renderer (shared across quick start, zone, details) ──
  const renderQuestion = (q, data, setField, qIdx, visQs, goNext, goPrev, goTo, onFinish, finishLabel, secs, extraTop) => {
    const progress = Math.round(((qIdx + 1) / visQs.length) * 100)
    const secIdx = secs.indexOf(q.sec)
    // Address fields (ac=street-address) must contain at least one letter —
    // catches symbol-only junk like "&&@$$". Flagged only when non-empty (the
    // required gate handles empty); blocks Continue and shows a hint.
    const addrInvalid = q.t === 'text' && q.ac === 'street-address' && !!data[q.id] && !/[a-zA-Z]/.test(String(data[q.id]))
    // Section chips are tappable jump targets. Backward/current sections
    // are always reachable so the assessor can return to fix anything;
    // forward jumps are allowed only once every required question before
    // the target is answered, so the chips can't be used to skip required
    // fields ahead of where the walkthrough has actually reached.
    const answeredReq = (qq) => {
      if (!qq.req) return true
      const v = data[qq.id]
      if (Array.isArray(v)) return v.length > 0
      if (qq.t === 'ch') return v != null && v !== '' && v !== 'Other'
      return v != null && v !== ''
    }
    const sectionTarget = (s) => visQs.findIndex(qq => qq.sec === s)
    const canJumpTo = (targetIdx) => targetIdx >= 0 && (targetIdx <= qIdx || visQs.slice(0, targetIdx).every(answeredReq))
    return (
      <div style={{paddingTop:12,paddingBottom:120}}>
        {/* Progress: a caption and a thin accent bar. The bar says how far;
            a percentage beside it said the same thing twice. */}
        <div style={{marginBottom:14}}>
          <div style={{...V3.T.caption, marginBottom:8}}>Question {qIdx + 1} of {visQs.length}</div>
          <div style={{height:2,background:V3.BORDER_SUBTLE,borderRadius:1,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${progress}%`,background:ACCENT,borderRadius:1,transition:'width .4s ease'}} />
          </div>
        </div>
        {/* Sections as the same text-tab row the rest of the app uses.
            Reachable sections are jump targets; the ones ahead of the
            walkthrough sit in tertiary ink until their required answers
            are in. */}
        <div style={{display:'flex',gap:20,marginBottom:24,overflowX:'auto',scrollbarWidth:'none',borderBottom:`1px solid ${V3.BORDER_SUBTLE}`}}>
          {secs.map((s,i)=>{
            const targetIdx = sectionTarget(s)
            const reachable = canJumpTo(targetIdx)
            const isActive = i===secIdx
            const tappable = reachable && targetIdx !== qIdx && !!goTo
            return (
              <button key={s} type="button" disabled={!reachable}
                aria-current={isActive?'step':undefined}
                onClick={()=>{ if(tappable){ haptic('light'); goTo(targetIdx) } }}
                style={{flexShrink:0,padding:'6px 0 9px',background:'transparent',border:'none',borderBottom:`2px solid ${isActive?V3.TEXT_PRIMARY:'transparent'}`,marginBottom:-1,fontSize:14,fontWeight:isActive?600:500,letterSpacing:'-0.01em',fontFamily:'inherit',color:isActive?V3.TEXT_PRIMARY:reachable?V3.TEXT_SECONDARY:V3.TEXT_TERTIARY,cursor:tappable?'pointer':'default',whiteSpace:'nowrap',WebkitTapHighlightColor:'transparent'}}>{s}</button>
            )
          })}
        </div>
        <div key={q.id+'-'+curZone} style={{animation:'fadeUp .4s cubic-bezier(.22,1,.36,1)'}}>
          {/* The question leads. The icon tile that sat above it is gone. */}
          <h2 style={{...V3.T.title, margin:0, marginBottom:8}}>{q.q}</h2>
          {q.ref&&<div style={{...V3.T.caption, fontWeight:400, marginBottom:18, lineHeight:1.5}}>{q.ref}</div>}
          {!q.ref&&<div style={{height:14}} />}

          {extraTop}

          {q.t==='text'&&<><input type="text" autoComplete={q.ac||'off'} value={data[q.id]||''} onChange={e=>setField(q.id, q.ac==='street-address' ? e.target.value.replace(/[^A-Za-z0-9\s,.#/'&-]/g,'') : e.target.value)} placeholder={q.ph||'Type...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&answeredReq(q)&&!addrInvalid)goNext()}} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${addrInvalid?WARN:BORDER}`,borderRadius:12,color:TEXT,fontSize:17,fontFamily:'inherit',fontWeight:500,boxSizing:'border-box',outline:'none'}} onFocus={e=>e.target.style.borderColor=addrInvalid?WARN:ACCENT} onBlur={e=>e.target.style.borderColor=addrInvalid?WARN:BORDER} />{addrInvalid&&<div style={{fontSize:13,color:WARN,marginTop:8,fontFamily:'inherit'}}>Enter a valid address: letters required (e.g. a street name or campus ID).</div>}</>}
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
                    <input type="number" inputMode="decimal" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} placeholder={q.ph||'Enter...'} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&answeredReq(q))goNext()}} style={{width:'100%',padding:'18px 20px',paddingRight:q.u?70:20,background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:12,color:TEXT,fontSize:17,fontFamily:'inherit',fontWeight:500,boxSizing:'border-box',outline:'none'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
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
          {q.t==='date'&&<input type="date" value={data[q.id]||''} onChange={e=>setField(q.id,e.target.value)} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:'inherit',boxSizing:'border-box',colorScheme:'dark'}} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}
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
            {/* Free-text wizard input with predictive ghost-text
                completion (Gmail Smart Compose pattern). The mirror
                <div> behind a transparent textarea paints the AI's
                ghost suffix inline with the caret — Tab to accept on
                desktop, "Insert" pill on touch. Right-side padding
                fits the voice mic + InlineAi buttons as before. */}
            <TextareaWithGhost
              value={data[q.id]||''}
              onChange={e=>setField(q.id,e.target.value)}
              context={{ field: q.id, prompt: q.q || q.ph || null }}
              placeholder={q.ph||'Notes...'}
              rows={3}
              style={{width:'100%',padding:'18px 96px 18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',resize:'vertical',boxSizing:'border-box',lineHeight:1.5}}
              onFocus={e=>e.target.style.borderColor=ACCENT}
              onBlur={e=>e.target.style.borderColor=BORDER}
            />
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
          {q.t==='ch'&&q.opts&&<div style={{display:'flex',flexDirection:'column',gap:8}}>{q.opts.map((o,i)=>{const stMap=q._subtypeMap;const storedVal=stMap?stMap.find(st=>st.label===o)?.id||o:o;const sel=stMap?(data[q.id]===storedVal):(o==='Other'?isOtherChoice(q.opts,data[q.id]):(data[q.id]===o));return(<button key={o} onClick={()=>{haptic('light');if(o==='Other'&&q.other){setField(q.id,'Other')}else{setField(q.id,storedVal);setTimeout(goNext,250)}}} style={{padding:'16px 20px',textAlign:'left',background:sel?`${mix('accent', 7)}`:`${CARD}`,border:`1.5px solid ${sel?ACCENT:BORDER}`,borderRadius:12,color:sel?ACCENT:TEXT,fontSize:16,fontFamily:'inherit',fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:14,minHeight:54}}><div style={{width:24,height:24,borderRadius:'50%',border:`2px solid ${sel?ACCENT:BORDER}`,background:sel?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{sel&&<I n="check" s={12} c={ON_ACCENT} />}</div><span style={{flex:1}}>{o}</span></button>)})}
            {q.other&&isOtherChoice(q.opts,data[q.id])&&<input type="text" value={data[q.id]==='Other'?'':data[q.id]} onChange={e=>setField(q.id,e.target.value||'Other')} placeholder="Describe space use..." autoFocus style={{width:'100%',padding:'16px 20px',background:CARD,border:`1.5px solid ${ACCENT}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',boxSizing:'border-box',marginTop:4}} />}
          </div>}
          {q.t==='multi'&&q.opts&&(()=>{const arr=data[q.id]||[];const exclusiveSel=arr.find(isExclusiveMultiOpt)||null;return(<><div style={{display:'flex',flexWrap:'wrap',gap:8}}>{q.opts.map((o,i)=>{const optExclusive=isExclusiveMultiOpt(o);
            // When an exclusive choice is active, every other option is
            // locked (and shown unchecked) until it's deselected.
            const locked=exclusiveSel&&o!==exclusiveSel;const sel=exclusiveSel?o===exclusiveSel:arr.includes(o);const onClick=()=>{if(locked)return;if(optExclusive){setField(q.id,sel?[]:[o]);if(!sel)setField(`${q.id}_other`,undefined);return}setField(q.id,sel?arr.filter(x=>x!==o):[...arr.filter(x=>!isExclusiveMultiOpt(x)),o])};return(<button key={o} disabled={!!locked} aria-disabled={!!locked} onClick={onClick} style={{padding:'12px 18px',borderRadius:999,background:sel?`${mix('accent', 8)}`:CARD,border:`1.5px solid ${sel?ACCENT:BORDER}`,color:sel?ACCENT:TEXT,fontSize:14,fontFamily:'inherit',fontWeight:500,cursor:locked?'not-allowed':'pointer',opacity:locked?0.4:1,transition:'opacity .15s',minHeight:44}}>{sel?'✓ ':''}{o}</button>)})}
            {/* Write-in for a multi-select (`other:1`). Kept OUT of the
                list — stored as `<id>_other` — so the engine's option
                matches never see it; it prints as what the assessor
                recorded. Locked with the rest when an exclusive choice
                ("None …") is active; that choice clears it. The pill is
                "on" while the field exists, even empty, so the input stays
                open while the assessor types. */}
            {q.other&&(()=>{const key=`${q.id}_other`;const open=data[key]!=null;const lockedO=!!exclusiveSel;return(<button key="__other" disabled={lockedO} aria-disabled={lockedO} aria-pressed={open} onClick={()=>{if(lockedO)return;setField(key,open?undefined:'')}} style={{padding:'12px 18px',borderRadius:999,background:open?`${mix('accent', 8)}`:CARD,border:`1.5px solid ${open?ACCENT:BORDER}`,color:open?ACCENT:TEXT,fontSize:14,fontFamily:'inherit',fontWeight:500,cursor:lockedO?'not-allowed':'pointer',opacity:lockedO?0.4:1,transition:'opacity .15s',minHeight:44}}>{open?'✓ ':''}Other</button>)})()}
          </div>
          {q.other&&data[`${q.id}_other`]!=null&&!exclusiveSel&&<input type="text" value={data[`${q.id}_other`]||''} onChange={e=>setField(`${q.id}_other`,e.target.value)} placeholder="Describe it…" aria-label="Other — describe" autoFocus style={{width:'100%',padding:'16px 20px',background:CARD,border:`1.5px solid ${ACCENT}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',boxSizing:'border-box',marginTop:10}} />}
          </>)})()}
          {q.t==='combo'&&q.opts&&(()=>{const otherOpts=q.opts.filter(o=>o!=='Other');const isOther=(data[q.id]||'')==='__other__'||((data[q.id]||'')&&!otherOpts.includes(data[q.id]));return(<div><select value={isOther?'__other__':(data[q.id]||'')} onChange={e=>setField(q.id,e.target.value)} style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',boxSizing:'border-box',appearance:'auto'}}><option value="">Select or skip...</option>{otherOpts.map(o=><option key={o} value={o}>{o}</option>)}<option value="__other__">Other</option></select>{isOther&&<input type="text" value={data[q.id]==='__other__'?'':data[q.id]} onChange={e=>setField(q.id,e.target.value||'__other__')} placeholder="Type here..." autoFocus style={{width:'100%',padding:'18px 20px',background:CARD,border:`1.5px solid ${ACCENT}`,borderRadius:14,color:TEXT,fontSize:16,fontFamily:'inherit',boxSizing:'border-box',marginTop:8}} />}</div>)})()}
          {q.t==='sensors'&&<>
            <SensorScreen data={data} onChange={setField} sensorData={sensorData} isDesktop={false} showOutdoor={curZone === 0} />
            <InstrumentLogImport calibrationGas={data.pid_cal_gas} onApply={(payload)=>{
              // Apply the aggregated mean values into the zone's sensor
              // fields. Each value is rounded by the parser to its
              // parameter's natural precision.
              for (const [paramId, value] of Object.entries(payload.readings || {})) {
                if (Number.isFinite(value)) setField(paramId, String(value))
              }
            }} />
            <JasperWatchPanel data={data} context={{building: bldg, presurvey}} />
          </>}
          {q.photo&&<PhotoCapture
            assessmentId={draftId}
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
          {q.photo&&(zones[curZone]?.zn)&&<PhotoNotFeasible
            existing={photoOverrides[zones[curZone].zn]}
            onSave={reason=>setPhotoOverrides(prev=>({...prev,[zones[curZone].zn]:{reason}}))}
            onClear={()=>setPhotoOverrides(prev=>{const n={...prev};delete n[zones[curZone].zn];return n})}
          />}
        </div>
        {/* Back and Skip are text; Continue / Finish is the app's one
            primary capsule (accent fill), not a gradient — and not green
            for Finish: green is the safe / severity color.
            Both buttons gate on `canAdvance`, not just dim when it's
            false: they used to only DIM (opacity .35) while staying
            fully clickable, so a required question — the zone name,
            zone area, occupant count, survey date, assessor name — could
            be tapped past empty with no field ever populated, all the
            way to Finish. `canAdvance` reuses `answeredReq`, the same
            predicate the section chips above already use to decide what
            counts as answered, so a question isn't "answered enough to
            jump past" but "not answered enough to leave" — the ad hoc
            check this replaced also read `data[q.id]` directly, which
            treats an empty (deselected-down-to-zero) required multi-select
            array as answered (arrays are truthy even when empty). */}
        {(() => {
          const canAdvance = answeredReq(q) && !addrInvalid
          return (
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:32}}>
          <button onClick={goPrev} disabled={qIdx===0} style={{background:'none',border:'none',color:qIdx===0?DIM:SUB,fontSize:15,fontWeight:500,cursor:qIdx===0?'default':'pointer',fontFamily:'inherit',padding:'12px 0',minHeight:48}}>Back</button>
          <div style={{display:'flex',gap:18,alignItems:'center'}}>
            {q.sk&&<button onClick={goNext} style={{background:'transparent',border:'none',padding:'12px 0',color:SUB,fontSize:15,fontWeight:500,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>Skip</button>}
            {qIdx===visQs.length-1
              ? <button disabled={!canAdvance} onClick={()=>{if(!canAdvance)return;onFinish()}} style={{padding:'0 24px',background:'var(--accent-fill)',border:'none',borderRadius:999,color:'var(--on-accent-fill)',fontSize:15,fontWeight:700,cursor:canAdvance?'pointer':'not-allowed',fontFamily:'inherit',opacity:canAdvance?1:.35,minHeight:46}}>{finishLabel}</button>
              : (q.t!=='ch' || (q.other&&isOtherChoice(q.opts,data[q.id]))) ? <button disabled={!canAdvance} onClick={()=>{if(!canAdvance)return;goNext()}} style={{padding:'0 24px',background:'var(--accent-fill)',border:'none',borderRadius:999,color:'var(--on-accent-fill)',fontSize:15,fontWeight:700,cursor:canAdvance?'pointer':'not-allowed',fontFamily:'inherit',opacity:canAdvance?1:.35,minHeight:46}}>Continue</button> : null}
          </div>
        </div>
          )
        })()}
      </div>
    )
  }

  // Site-plan marks on a SAVED report, persisted the same way the archived
  // logger toggle below persists its choice. A finalized report's zones,
  // building and floor plan ride on viewRpt; marks made on the Site plan tab
  // used to update component state only, so they drove the export and then
  // vanished on reopen — the same "I attached it and it did not stick"
  // failure the logger toggle was written to fix. Patch viewRpt and the
  // stored record together, local-only like that toggle: a mark changes what
  // a re-export embeds, never a finding.
  const persistArchivedSitePlan = async (patch) => {
    if (!viewRpt) return
    setViewRpt(prev => (prev ? { ...prev, ...patch } : prev))
    try {
      const base = await STO.get(viewRpt.id)
      if (base) await STO.set(viewRpt.id, { ...base, ...patch, ua: new Date().toISOString() })
    } catch { /* keep the optimistic UI even if persistence fails */ }
  }

  // Toggle a logger graph's report inclusion from the results Logger tab.
  // Mirrors Logger Studio's "Include in report" switch but operates on the
  // live sensorData state, which is what report generation reads — so dropping
  // a graph here removes it from the exported/finalized report. Wired only on
  // the live results view (not archived reports). The captured image is left
  // intact so re-enabling restores the DOCX figure.
  const toggleLoggerInclude = (id, include, meta = {}) => {
    setSensorData(prev => {
      if (!prev) return prev
      const graphs = { ...(prev.graphs || {}) }
      const existing = graphs[id] || {}
      graphs[id] = { ...existing, include }
      if (include) {
        if (!graphs[id].title && meta.title) graphs[id].title = meta.title
        if (!graphs[id].series && meta.series) graphs[id].series = meta.series
      }
      return { ...prev, graphs }
    })
  }

  // Same include toggle, but for a SAVED report being viewed (view==='report').
  // The data rides on viewRpt, not the live sensorData state, so update it
  // optimistically and persist the patched sensorData back to the record so
  // the choice survives navigation and drives the next export. Inclusion only
  // affects which graphs future exports embed — it never alters the finalized
  // report content.
  const toggleArchivedLoggerInclude = async (id, include, meta = {}) => {
    if (!viewRpt || !viewRpt.sensorData) return
    const graphs = { ...(viewRpt.sensorData.graphs || {}) }
    const existing = graphs[id] || {}
    graphs[id] = { ...existing, include }
    if (include) {
      if (!graphs[id].title && meta.title) graphs[id].title = meta.title
      if (!graphs[id].series && meta.series) graphs[id].series = meta.series
    }
    const nextSd = { ...viewRpt.sensorData, graphs }
    setViewRpt({ ...viewRpt, sensorData: nextSd })
    try {
      const base = await STO.get(viewRpt.id)
      if (base) await STO.set(viewRpt.id, { ...base, sensorData: nextSd, ua: new Date().toISOString() })
    } catch { /* keep the optimistic UI even if persistence fails */ }
  }

  // Jump from a Readiness blocker straight to the field that fixes it.
  // Client / contact / instrument blockers live in the Assessment Details
  // step (Q_DETAILS); occupant-denominator and photo blockers are zone-scoped
  // so they open the relevant zone walkthrough. Closes the gap where the
  // panel told the assessor where to fix but gave no way to get there.
  const fixBlocker = (blocker) => {
    if (!blocker) return
    const id = blocker.id || ''
    if (id.startsWith('occupant_denom_') || id.startsWith('photo_')) {
      const zoneName = id.replace(/^(occupant_denom_|photo_)/, '')
      const zi = (zones || []).findIndex(z => (z?.zn || '') === zoneName)
      const target = zi >= 0 ? zi : 0
      // Land on the exact question. For the denominator blocker the missing
      // piece is almost always "How many affected?" ('ac') — 'oc' (Occupant
      // count) is already required/filled — so target whichever is empty,
      // preferring 'ac'. Photo blocker → first photo-capable question.
      let zoneField = '__photo__'
      if (id.startsWith('occupant_denom_')) {
        const z = zones[target] || {}
        const hasVal = v => v != null && String(v).trim() !== ''
        zoneField = !hasVal(z.ac) ? 'ac' : 'oc'
      }
      setPendingZoneFix({ zoneIndex: target, field: zoneField })
      setCurZone(target); setZqi(0); setView('zone'); return
    }
    const di = dtVis.findIndex(q => q.id === blocker.field)
    setDqi(di >= 0 ? di : 0); setView('details')
  }

  // From the read-only saved-report view, a blocker tap first resumes the
  // assessment as an editable draft (so edits autosave to the same record),
  // then jumps to the exact field. No-op target falls through to fixBlocker.
  const resumeAndFix = async (blocker) => {
    const id = viewRpt?.id
    if (id) {
      // Entering the editor without the report loaded is what produced the
      // duplicates: draftId stayed on the previous assessment, so the
      // re-finalize did not recognize this report and minted a new one.
      // Stay put and say so instead.
      const loaded = await resumeDraft(id)
      if (!loaded) {
        setReportOpenError({
          name: 'ReportNotFound',
          message: `"${viewRpt?.facility || viewRpt?.building?.fn || id}" could not be opened for editing on this device. Check your connection and try again — the report itself is unchanged.`,
          stack: '',
        })
        return
      }
      // Migration 034: an issued report's content is immutable in the cloud
      // until it is moved back to draft. The user has just chosen to reopen
      // it, so say so; the re-finalize upsert then carries report_status
      // 'final' again with the new content. Best-effort — offline, the
      // re-finalize is queued and parks as a conflict the user can resolve.
      if (supabase) { try { await Storage.reopenAssessment(id) } catch { /* best effort */ } }
      setViewRpt(null)
    }
    fixBlocker(blocker)
  }

  // ── Results renderer ──
  const renderResults = (archived) => {
    // Pre-Assessment Memo / archived report without scoring data — render
    // a friendly fallback instead of returning null. The EmptyReportRender
    // guard at the view layer otherwise converts the null into a
    // user-facing crash. The engine emits reports without scoring data
    // when no measurements were recorded — these are valid deliverables
    // (the "Pre-Assessment Memo" path documented in CLAUDE.md), not bugs.
    if (archived && viewRpt && !zoneScores.length) {
      const facilityName = viewRpt.facility || bldg.fn || 'Untitled Assessment'
      const ts = viewRpt.ts ? new Date(viewRpt.ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
      const hasNarrative = narrative && typeof narrative === 'string' && narrative.trim().length > 0
      return (
        <div style={{padding: '20px 16px 120px'}}>
          <GlassCard>
            <div style={{...V3.T.micro, color: 'var(--accent)', marginBottom: 8}}>PRE-ASSESSMENT MEMO</div>
            <div style={{...V3.T.h1, marginBottom: 4}}>{facilityName}</div>
            {ts && <div style={{...V3.T.bodyDim, marginBottom: 16}}>Created {ts}</div>}
            <div style={{...V3.T.body, color: V3.TEXT_SECONDARY}}>
              This report contains no zone assessments. No zone measurements have been recorded. The engine has rendered a pre-assessment memo for planning use. Open the source assessment to add measurements and generate a full report.
            </div>
          </GlassCard>
          {hasNarrative && (
            <div style={{marginTop: 16}}>
              <GlassCard>
                <div style={{...V3.T.micro, color: V3.TEXT_TERTIARY, marginBottom: 8}}>NOTES</div>
                <Markdown style={{...V3.T.body}}>{narrative}</Markdown>
              </GlassCard>
            </div>
          )}
        </div>
      )
    }
    if (!zoneScores.length) return null
    const zs = zoneScores[selZone]
    // Logger timelines flagged "Include in report". When viewing a saved
    // report the dataset rides on viewRpt; live results use current state.
    const loggerSd = (archived ? viewRpt?.sensorData : sensorData) || null
    // Show the Logger tab whenever the assessment carries logger readings —
    // viewing your uploaded data is decoupled from the per-graph "Include in
    // report" flag (which now governs only DOCX embedding). Handles the v2
    // multi-dataset envelope and the legacy v1 single-dataset shape.
    const hasLoggerData = !!(loggerSd && (
      (Array.isArray(loggerSd.datasets) && loggerSd.datasets.some(d => Array.isArray(d?.points) && d.points.length > 0)) ||
      (Array.isArray(loggerSd.points) && loggerSd.points.length > 0)
    ))
    const detailsFilled = Q_DETAILS.filter(q => mergedData[q.id]).length
    // Primary driver is the worst NON-complaints category (complaints are a
    // symptom, not a driver). Selection AND the severity gate live in
    // src/utils/primaryDriver.js so they are unit-testable — see the module
    // header for why the gate exists.
    const driver = resolvePrimaryDriver(zs?.cats)
    // #4 — escalation used to be evaluated ONLY on the export path, so the
    // screen could say "continue routine monitoring" beside a report warning
    // about a combustion source. Evaluate it here too and feed the verdict.
    // KNOWN GAP: complaints/history are still passed empty because the
    // complaint store is not loaded on this screen, so the medical-attention
    // and complaint-cluster rules cannot fire from here.
    const screenEscalations = evaluateEscalation({ zones, moldResults }, [], [])
    // One verdict for every surface, raised by what was found: a finding or
    // an escalation trigger. See utils/assessmentVerdict.js.
    const verdict = resolveVerdict({ zoneScores, escalationTriggers: screenEscalations })
    // Expert summary — IH-grade reasoning (complaints are pattern, not driver)
    const expertDriver = driver.label

    // ── v3 derivations for the redesigned hero / panels ──
    // Severity headline from the one verdict — a tight headline plus a
    // sentence of supporting prose. `verdict.riskLabel` and
    // `verdict.actionLabel` were read into locals here and then never used;
    // resolveVerdict still returns both for the report surfaces.
    const sevPillTone = V3.SEVERITY[verdict.severity]
    const sevPillLabel = verdict.label
    const confTone = measConf?.overall === 'High' ? V3.CONFIDENCE.high : measConf?.overall === 'Low' ? V3.CONFIDENCE.low : V3.CONFIDENCE.medium
    const headline = (() => {
      // Name the screening indicator, not a likelihood on the attribution —
      // confidence/likelihood belongs to the measurement layer, not the
      // causal-attribution layer (keeps the screening framing defensible).
      // The STRONGEST pathway, by the same rule the report's conceptual site
      // model uses — not `causalChains[0]`, which is whichever chain the
      // builder happened to push first. Two surfaces naming different
      // pathways as "the" finding for one assessment is the cross-layer
      // disagreement this codebase keeps paying for.
      const lead = pickPrimaryChain(causalChains)
      if (lead?.type) return lead.type
      if (expertDriver) return `${expertDriver}`
      // Nothing rose to a driver. Say which of the two clean cases it is —
      // "No significant findings" printed above a header reading "1 finding"
      // is its own contradiction, so a low-only result gets its own wording.
      if (driver.scored && verdict.findings.total > 0) return 'Minor observations only'
      // Voice rule 6 — a normal measurement is not automatically a finding;
      // rule 7 — when conditions are normal, say so plainly.
      if (driver.scored) return 'No significant findings identified'
      // Nothing was scored at all. That is a data gap, not a clean result, so
      // it must not read as reassurance.
      return 'Assessment complete'
    })()

    // Readiness is computed once here (pure, cheap) so the Report tab's
    // label can carry the blocker count and the panel reads the same
    // verdict. Same inputs as buildAssessmentContext, so the panel and
    // the context cannot show different gap sets for one assessment.
    const readinessAssessment = {
      assessmentMode: 'SCREENING',
      presurvey, building: bldg, client: bldg && bldg.client ? bldg.client : {},
      zones, zoneScores, recs, photos, photoOverrides,
      profile: profile ? { name: profile.name } : null,
      investigation: readinessInvestigation,
    }
    const readiness = buildReadinessVerdict(readinessAssessment)

    // Does the report agree with itself? Assembled from the SAME inputs the
    // export uses and checked section against section — summary vs table,
    // site mean vs zone rows, citations vs appendix, register completeness —
    // so a contradiction is seen here, before the document is generated,
    // rather than by a reviewer afterwards. Advisory, like every readiness
    // signal: it names the disagreement and never blocks the deliverable.
    // Only computed on the Report tab; the model is cheap but not free.
    const reportConsistency = rTab === 'report' && zoneScores.length ? (() => {
      try {
        return checkRenderModel(withAiSections({
          id: viewRpt?.id || draftId || null, building: bldg, presurvey, zones, equipment, zoneScores, comp,
          recs, causalChains, profile, photos, photoOverrides, sensorData: loggerSd, floorPlans, ts: viewRpt?.ts,
          aiSections,
        }))
      } catch (e) {
        return [{ id: 'model-error', where: 'Report', message: `The report model could not be assembled: ${e && e.message}` }]
      }
    })() : []

    // Whether the report's AI-authored sections may still be regenerated.
    // Locked at finalize (src/report/aiSections.js lockAiSections) so an
    // issued report never reads differently because someone asked the model
    // the same question again and got a different answer.
    const aiSectionsLocked = !!(aiSections && aiSections.locked)
    const aiSectionsSummaryCounts = (() => {
      const values = Object.values((aiSections && aiSections.auditSummary) || {})
      return { total: values.length, blocked: values.filter(s => s && s.supported === false).length }
    })()

    return (
      <div style={{paddingTop:20,paddingBottom:120,position:'relative',isolation:'isolate'}}>
        {/* The ambient "airflow" gradient that used to sit behind the header
            is gone — the page is the page. */}
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
          {/* Property name in the editorial serif (matches the v3
              prototype's Lora .prop-name) so the lead screen reads as a
              consultant document, not a dashboard. */}
          <div style={{...V3.T.h1, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis'}}>{bldg.fn||'Assessment'}</div>
          {bldg.fl && <div style={{...V3.T.h1Sub}}>{bldg.fl}</div>}
          {/* Senior-design metadata row: semantic status dot + counts.
              The report is persisted on this view, so the dot reads
              "Saved" (green); saving/offline color states arrive with
              the Phase-2 collapsing-nav work. */}
          {(() => {
            const zonesCount = (zoneScores||[]).length
            const findingsCount = countFindings(zoneScores).total
            return (
              // One line of secondary ink. "Saved" is a word, not a green dot.
              <div style={{...V3.T.caption, marginTop:8}}>
                Saved · {findingsCount} finding{findingsCount===1?'':'s'} · {zonesCount} zone{zonesCount===1?'':'s'}
              </div>
            )
          })()}
        </div>

        {/* ── Legacy / Standards Badge ── */}
        {viewRpt && !viewRpt.standardsManifest && (
          <div style={{padding:'8px 14px',background:`${V3.SEVERITY.medium}10`,border:`1px solid ${V3.SEVERITY.medium}28`,borderRadius:V3.R.md,marginBottom:10,fontSize:11,color:WARN}}>
            Legacy v1.x scoring: standards manifest not embedded
          </div>
        )}

        {/* ── Past Patterns (Play 2 — cross-assessment memory) ──
            Surfaces deterministic similarity matches from the assessor's
            historical localStorage assessments. Hidden when history < 3.
            Advisory only — never replaces the deterministic findings
            above; the panel renders below this point as a memory aid. */}
        <SimilarAssessmentsPanel
          currentAssessment={{
            id: viewRpt?.id || null,
            building: bldg,
            presurvey,
            comp,
            recs,
            moldResults,
          }}
          onOpenPastAssessment={(id) => {
            const meta = (index.reports || []).find(r => r.id === id) || (index.drafts || []).find(d => d.id === id)
            if (meta) openReport(meta)
          }}
        />

        {/* ── Hero: composite assessment + next recommended steps ──
            Two-column on tablet+, stacked on mobile. The left column
            is the situational summary (severity, confidence, headline
            sentence, stat strip). The right column lists up to three
            recommended next steps drawn from recs.imm so the assessor
            sees the call-to-action without scrolling. */}
        <div style={{display:'grid',gridTemplateColumns:isTablet?'minmax(0,1.4fr) minmax(0,1fr)':'minmax(0,1fr)',gap:RHYTHM.base,marginBottom:RHYTHM.base}}>
          {/* ── Assessment card — the lead card. Padding is zero on the
              wrapper because the card composes three vertical zones
              (intro, denominator line, optional advisory), each with its
              own padding rhythm.

              It carried a footer score readout — a composite indicator and
              a thin severity bar labeled /100 — beside the serif line.
              Both went with the score; the footer now shows the zone
              denominator and drills into the per-zone breakdown.

              This card is the ONE place the verdict is stated. Anything
              below it explains the verdict or lists what was found; if a
              second surface starts restating the conclusion, that is the
              duplication this comment exists to prevent. ── */}
          {/* The verdict on the page, not in a bordered card: the severity
              is a word in its color above the serif headline. */}
          <div style={{...RS_SECTION, paddingTop:18}}>
            <div>
              <div>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{...V3.T.caption, color:sevPillTone, fontWeight:600, marginBottom:6}}>{sevPillLabel}</div>
                  {/* Severity band only. The measurement-confidence badge used
                      to sit here too, directly above the diagnosis headline —
                      which read as confidence in the FINDING. It is neither:
                      evalMeasurementConfidence scores how many parameters were
                      captured, so "High Confidence" above "Ventilation
                      inadequacy" asserted certainty about a conclusion it knows
                      nothing about. It now appears only in the Professional
                      Assessment panel, where it is labeled and in context. */}
                  {/* Serif diagnosis — the screening indicator named in the
                      editorial serif (matches the prototype's Lora .diag). */}
                  <div style={V3.T.title}>{headline}</div>
                </div>
              </div>
              <div style={{...V3.T.bodyDim, lineHeight:'21px', marginTop:10}}>
                {verdict.prose}
              </div>
              {/* Footer — the zone denominator and the one link out of the
                  hero, into Actions. The verdict answers "what is wrong";
                  Actions answers "what next". The findings breakdown is the
                  default tab directly below, so it needs no link of its own. */}
              <button
                onClick={()=>{ haptic('light'); supabase && trackEvent('plan_open', { source: 'hero' }); setRTab('plan') }}
                aria-label="See the actions: recommended actions and sampling."
                {...pressFeedback('soft')}
                style={{display:'flex',alignItems:'center',gap:8,marginTop:12,width:'100%',cursor:'pointer',fontFamily:'inherit',textAlign:'left',background:'none',border:'none',padding:0,...pressFeedback.style}}>
                <span style={{flex:1,...V3.T.captionDim}}>{comp.count} {userMode === 'fm' ? (comp.count===1?'area':'areas') : (comp.count===1?'zone':'zones')} assessed</span>
                <span style={{...RS_LINK}}>See the actions <span aria-hidden="true">›</span></span>
              </button>
            </div>
            {measConf?.overall === 'Low' && (
              <div style={{...V3.T.caption, color:WARN, marginTop:10, lineHeight:1.5}}>
                Single-point measurement. Consider time-weighted sampling per AIHA strategy before drawing conclusions.
              </div>
            )}
          </div>

          {/* The "Next steps" list that sat here was the Immediate tier of
              the Actions tab, verbatim, three lines above the tab that lists
              it in full. The hero states the verdict once and links to
              Actions; it no longer carries a second list. */}
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
        {/* Completeness prompts — rows, not tinted boxes. The label carries
            the warn color; the reason is the sub-line. */}
        {!archived && (!presurvey.ps_inst_iaq || !presurvey.ps_inst_iaq_serial || !presurvey.ps_inst_iaq_cal) && (
          <button onClick={()=>{setDqi(Math.max(0, dtVis.findIndex(q=>q.id==='ps_inst_iaq')));setView('details')}} style={{width:'100%',padding:'12px 0',background:'transparent',border:'none',borderTop:`1px solid ${V3.BORDER_SUBTLE}`,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',WebkitTapHighlightColor:'transparent'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{...V3.T.bodyStrong, color:WARN}}>Add instrument data</div>
              <div style={V3.T.caption}>Required for defensible reports</div>
            </div>
            <span style={{fontSize:18,lineHeight:1,color:V3.TEXT_TERTIARY}}>›</span>
          </button>
        )}
        {!archived && detailsFilled < 5 && (
          <button onClick={()=>{setDqi(0);setView('details')}} style={{width:'100%',padding:'12px 0',marginBottom:6,background:'transparent',border:'none',borderTop:`1px solid ${V3.BORDER_SUBTLE}`,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',WebkitTapHighlightColor:'transparent'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{...V3.T.bodyStrong, color:WARN}}>Add assessment details</div>
              <div style={V3.T.caption}>Strengthens defensibility</div>
            </div>
            <span style={{fontSize:18,lineHeight:1,color:V3.TEXT_TERTIARY}}>›</span>
          </button>
        )}

        {/* ── Workflow tabs, ordered by the assessor's questions (2026-09):
            Findings ("what did we find"), Pathways ("why"), Actions ("what
            next": recommended actions and sampling), Report ("what will be
            written and what blocks sign-off": narrative and readiness). Six
            tabs became four; Sampling and Actions merged, Narrative and
            Review into Report. The old keys (sampling / actions / narrative
            / readiness) still arrive from Jasper's tab_target and are
            mapped in RESULT_TAB_ALIASES at the propose_action site.

            The Actions tab keeps the id `plan`, as Findings keeps `overview`
            and Pathways keeps `rootcause`: an id is a stable key, and
            renaming this one would churn the alias map, the `plan_open`
            analytics series and every stored draft stage for a label.

            Site plan and Logger close the strip as the two RECORD tabs —
            where the readings were taken and what the loggers saw — after
            the four that reason about them. Site plan was a header
            overflow-menu item until 2026-09, which put the floor plan
            somewhere no one looks; Logger stays last because it is the only
            conditional one, so its arrival never shifts another tab. ── */}
        <AssessmentSegmentedPillNav
          id="result-tabs-anchor"
          style={{marginBottom:16}}
          active={rTab}
          onChange={(k)=>{ setRTab(k); haptic('light') }}
          tabs={[...(userMode === 'fm'
            ? [['overview','findings','Findings'],['plan','check','Actions'],['report','notes','Report']]
            : [['overview','findings','Findings'],['rootcause','chain','Pathways'],...(KG_EVIDENCE_ENABLED&&isDesktop?[['evidence','search','Evidence']]:[]),['plan','check','Actions'],['report','notes','Report']]),
            ['locations','bldg','Site plan'],
            ...(hasLoggerData ? [['logger','chart','Logger']] : [])
          ].map(([tid,icon,label])=>({ id:tid, icon, label, badge: tid === 'report' && readiness.finalization_blockers.length > 0 ? readiness.finalization_blockers.length : undefined }))}
        />

        {rTab==='report' && (
          <div>
            {/* Sign-off first: the status word, the blockers and gaps, then
                the narrative below it. The count of blockers rides on the
                tab label so it is never hidden behind the tab. */}
            <ReadinessPanel
              assessment={readinessAssessment}
              consistency={reportConsistency}
              onFeedback={()=>openFeedback('Findings & readiness')}
              onFix={archived ? (viewRpt?.id ? resumeAndFix : undefined) : fixBlocker}
            />
            {/* AI-authored sections of the AtmosFlow DOCX itself (the client
                deliverable) — src/report/aiSections.js, src/report/evidencePackage.js.
                Distinct from "Findings narrative" below, which is a separate
                one-page share document; this is what the exported Word report
                actually renders in place of its deterministic Executive Summary,
                Discussion, Conceptual Site Model, Recommendations and per-parameter
                Background prose, for whichever of those a fresh, audit-supported
                generation covers. */}
            <div style={RS_SECTION}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,marginBottom:12,flexWrap:'wrap'}}>
                <div style={RS_HEAD}>Report sections</div>
                {aiSections && aiSectionsSummaryCounts.total > 0 && <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{...V3.T.caption, color:WARN}}>AI-generated · review required</span>
                  <FeedbackButton label="Flag" onClick={()=>openFeedback('AI report sections')} />
                </div>}
              </div>
              <div style={{...V3.T.bodyDim, maxWidth:460, marginBottom:14}}>
                Refines the Executive Summary, Discussion, Conceptual Site Model, Recommendations framing and per-parameter background prose in the exported Word report — from the same findings, criteria and action register it already contains. Measurement tables, QA/QC, citations and the action register itself are never touched.
              </div>
              {aiSectionsLocked && (
                <div style={{...V3.T.caption, color:SUB, marginBottom:10}}>This report is finalized. Its report sections are locked to what was issued.</div>
              )}
              {!reportSectionsLoading && !aiSectionsLocked && (
                <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                  <TactileButton variant="primary" size="sm" pill onClick={requestReportSections}>
                    {aiSections && aiSectionsSummaryCounts.total > 0 ? 'Regenerate report sections' : 'Generate report sections'}
                  </TactileButton>
                  <span style={V3.T.captionDim}>5 credits</span>
                </div>
              )}
              {reportSectionsLoading && <div style={{padding:'8px 0',display:'flex',alignItems:'center',gap:12}}><div style={{width:20,height:20,borderRadius:'50%',border:'2px solid transparent',borderTopColor:ACCENT,animation:'spin 1s linear infinite',flexShrink:0}} /><div style={V3.T.bodyDim}>Writing report sections from assessment data…</div></div>}
              {aiSections && aiSectionsSummaryCounts.total > 0 && !reportSectionsLoading && (
                <div style={{marginTop:14,padding:'12px 14px',borderRadius:RADII.md,border:`1px solid ${aiSectionsSummaryCounts.blocked === 0 ? 'var(--border)' : `color-mix(in srgb, ${WARN} 45%, transparent)`}`,background:`color-mix(in srgb, ${aiSectionsSummaryCounts.blocked === 0 ? 'var(--surface)' : WARN} 8%, transparent)`}}>
                  <div style={{...V3.T.caption,color:aiSectionsSummaryCounts.blocked===0?SUB:WARN,marginBottom:8}}>
                    {aiSectionsSummaryCounts.blocked === 0
                      ? `Checked against the assessment record — ${aiSectionsSummaryCounts.total} of ${aiSectionsSummaryCounts.total} section${aiSectionsSummaryCounts.total===1?'':'s'} traced and will be used in the export.`
                      : `Checked against the assessment record — ${aiSectionsSummaryCounts.blocked} of ${aiSectionsSummaryCounts.total} section${aiSectionsSummaryCounts.total===1?'':'s'} could not be supported and will use the deterministic report text instead.`}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {Object.entries(aiSections.auditSummary || {}).map(([key, summary]) => (
                      <div key={key} style={{...V3.T.bodyDim,fontSize:13,lineHeight:1.5}}>
                        <span style={{color:summary && summary.supported===false?WARN:'var(--success)',fontWeight:600}}>{summary && summary.supported===false?'⚠':'✓'} {AI_SECTION_LABELS[key] || key}</span>
                        {summary && summary.supported===false && <>{' — '}{(aiSections.audit && aiSections.audit[key] || []).map(i=>i.message).join(' ')}</>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={RS_SECTION}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,marginBottom:12,flexWrap:'wrap'}}>
                <div style={RS_HEAD}>Findings narrative</div>
                {narrative && <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{...V3.T.caption, color:WARN}}>AI-generated · review required</span>
                  <FeedbackButton label="Flag" onClick={()=>openFeedback('AI narrative')} />
                </div>}
              </div>
              {!narrative&&!narrativeLoading&&<div>
                <div style={{...V3.T.bodyDim, maxWidth:420, marginBottom:14}}>Written from the deterministic findings, not from a free reading of the data. You review and approve before delivery.</div>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <TactileButton variant="primary" size="sm" pill onClick={requestNarrative}>Generate narrative</TactileButton>
                  <span style={V3.T.captionDim}>3 credits</span>
                </div>
              </div>}
              {narrativeLoading&&<div style={{padding:'8px 0',display:'flex',alignItems:'center',gap:12}}><div style={{width:20,height:20,borderRadius:'50%',border:'2px solid transparent',borderTopColor:ACCENT,animation:'spin 1s linear infinite',flexShrink:0}} /><div style={V3.T.bodyDim}>Generating narrative from assessment data…</div></div>}
              {narrative&&<div>
                <Markdown style={{fontSize:14,color:TEXT,lineHeight:1.75}}>{narrative}</Markdown>
                {/* What the deterministic audit could not support in the prose
                    above (src/report/narrativeAudit.js). Advisory, like the
                    readiness blockers and the report-consistency panel: it
                    names the statement and the reason, and never discards the
                    draft — three credits of work suppressed silently is how
                    the old banned-language gate behaved, and the assessor
                    could not see why. */}
                {narrativeAudit && narrativeAudit.issues.length > 0 && (
                  <div style={{marginTop:14,padding:'12px 14px',borderRadius:RADII.md,border:`1px solid ${narrativeAudit.summary && narrativeAudit.summary.supported ? 'var(--border)' : `color-mix(in srgb, ${WARN} 45%, transparent)`}`,background:`color-mix(in srgb, ${narrativeAudit.summary && narrativeAudit.summary.supported ? 'var(--surface)' : WARN} 8%, transparent)`}}>
                    <div style={{...V3.T.caption,color:narrativeAudit.summary && narrativeAudit.summary.supported?SUB:WARN,marginBottom:8}}>
                      Checked against the assessment record — {narrativeAudit.summary ? narrativeAudit.summary.summary : ''}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {narrativeAudit.issues.map((iss,i)=>(
                        <div key={`${iss.id}-${i}`} style={{...V3.T.bodyDim,fontSize:13,lineHeight:1.5}}>
                          <span style={{color:iss.severity==='blocking'?WARN:SUB,fontWeight:600}}>{iss.where}</span>
                          {' — '}{iss.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {narrativeAudit && narrativeAudit.issues.length === 0 && (
                  <div style={{...V3.T.caption,color:SUB,marginTop:14}} role="status">
                    Checked against the assessment record — every figure, criterion and recommendation in this narrative traces to the report.
                  </div>
                )}
                <div style={{...V3.T.caption, fontWeight:400, marginTop:14, lineHeight:1.5}}>Generated from deterministic findings. Review, edit and approve before it goes into any client deliverable.</div>
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
            </div>
          </div>
        )}

        {rTab==='logger' && <Suspense fallback={LAZY_FALLBACK}><LoggerGraphsTab sensorData={loggerSd} editable onToggleInclude={archived ? toggleArchivedLoggerInclude : toggleLoggerInclude} /></Suspense>}

        {/* Where each set of readings was taken. Editable on a saved report
            too, which is the behavior the overflow-menu entry had: the
            marks drive what a re-export embeds, never the findings. On a
            saved report every edit is also written back to the stored
            record, the way the archived logger toggle writes its choice —
            otherwise a mark survives only until the report is reopened. */}
        {rTab==='locations' && (() => {
          const writeZones = (z) => { setZones(z); if (archived) persistArchivedSitePlan({ zones: z }) }
          const writeBuilding = (b) => { setBldg(b); if (archived) persistArchivedSitePlan({ building: b }) }
          // The record carries refs; the images are in IndexedDB under the
          // assessment's namespace (utils/floorPlans). `floorPlan: null`
          // retires the legacy single-plan field on a saved report.
          const writePlans = (p) => { setFloorPlans(p); if (archived) persistArchivedSitePlan({ floorPlans: compactFloorPlans(p), floorPlan: null }) }
          const planOwner = () => (viewRpt && viewRpt.id) || draftId || null
          return (
            <Suspense fallback={LAZY_FALLBACK}>
              <SpatialMap
                embedded
                zones={zones}
                plans={floorPlans}
                building={bldg}
                onAddPlan={async (url)=>{
                  const id = newPlanId()
                  const idbId = await storeFloorPlanImage(url, planOwner())
                  writePlans([...floorPlans, { id, label: '', image: url, idbId }])
                  return id
                }}
                onReplacePlan={async (id, url)=>{
                  const idbId = await storeFloorPlanImage(url, planOwner())
                  writePlans(floorPlans.map(p => p.id === id ? { ...p, image: url, idbId, _missingBlob: undefined } : p))
                }}
                onRenamePlan={(id, label)=>writePlans(floorPlans.map(p => p.id === id ? { ...p, label } : p))}
                onRemovePlan={(id)=>{
                  // ONE update per collection, not a loop of per-zone
                  // updates: each of those derived its zones from the same
                  // render's `zones`, so every clear but the last was lost.
                  const cleared = clearPinsOnPlan(zones, bldg, id, floorPlans)
                  writeZones(cleared.zones)
                  writeBuilding(cleared.building)
                  writePlans(floorPlans.filter(p => p.id !== id))
                }}
                onUpdateZone={(zi, update)=>{ const z=[...zones]; z[zi]={...z[zi],...update}; writeZones(z) }}
                onUpdateBuilding={(update)=>writeBuilding({...bldg, ...update})}
              />
            </Suspense>
          )
        })()}

        {rTab==='overview' && zs && (() => {
          // ── v3 Findings tab — derive panels from existing engine state ──
          // Data Gaps: combine OSHA-relevant gaps, not-scored categories
          // on the focused zone, and instrument/details prompts that
          // would erode defensibility if shipped to a report.
          const gapItems = []
          if (!presurvey.ps_inst_iaq) gapItems.push('Instrument model not recorded')
          else if (!presurvey.ps_inst_iaq_cal) gapItems.push('Instrument calibration date not recorded')
          // `c.s === null` led both of these until 2026-08 and it was the
          // clause carrying INSUFFICIENT: `s` was the category score, and a
          // category with too little data to evaluate had a null one. v3.0
          // deleted `s`, so the clause became `undefined === null` — always
          // false — and only DATA_GAP survived. DATA_GAP means NO data was
          // collected; INSUFFICIENT means some was, but not enough to
          // evaluate. The second case stopped appearing in the gap list
          // entirely, which is the quieter half of the two and the half a
          // report is more likely to ship without noticing.
          const unevaluated = (c) => c.status === 'INSUFFICIENT' || c.status === 'DATA_GAP'
          if (zs?.cats?.some(c => c.l === 'Environment' && unevaluated(c))) gapItems.push('Humidity / thermal data not logged')
          if (zs?.cats?.some(c => c.l === 'Ventilation' && unevaluated(c))) gapItems.push('Airflow / CO₂ measurement not captured')
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
          const photoCount = Object.keys(photos || {}).length

          return (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>

              {/* At a glance — what the hero does not already say: the
                  measurement confidence (comp.confidence — the worst zone's,
                  which is what the report prints under the same label), the
                  assessment basis, the evidence census and the data-gap
                  count. The driver, contributing cause, complaint pattern
                  and key indicator that used to lead this list restated the
                  headline and the first pathway in other words; the verdict
                  is stated once, above, and the pathway on its own tab. */}
              <div style={{...RS_SECTION, borderTop:'none', paddingTop:4}}>
                <div style={RS_HEAD}>At a glance</div>
                {[
                  ['Confidence', <span style={{color:confTone, fontWeight:600}}>{comp?.confidence || measConf?.overall || 'Pending'}</span>],
                  ['Basis', describeAssessmentBasis({ sensorData: loggerSd, labResults: viewRpt?.labResults })],
                  ['Evidence', `${evCount.meas} measurements · ${evCount.obs} observations · ${evCount.occ} occupant reports · ${photoCount} photo${photoCount===1?'':'s'}`],
                  ['Data gaps', dataGaps.length === 0
                    ? 'None identified'
                    : <><span style={{color:WARN, fontWeight:600}}>{dataGaps.length}</span> <button onClick={()=>{ haptic('light'); setRTab('report') }} style={{...RS_LINK, marginLeft:8}}>Review <span aria-hidden="true">›</span></button></>],
                ].map(([k, v]) => (
                  <div key={k} style={{display:'flex', gap:14, padding:'6px 0', alignItems:'baseline'}}>
                    <div style={{...V3.T.captionDim, width:120, flexShrink:0}}>{k}</div>
                    <div style={{...V3.T.body, flex:1, minWidth:0, lineHeight:'20px'}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Zones as rows: name, finding count, and the focused zone
                  named as such. Tap a row to focus it for the findings below. */}
              <div id="result-zones-anchor" style={RS_SECTION}>
                <div style={RS_HEAD}>Zones · {zoneScores.length}</div>
                {zoneScores.map((z, i) => {
                  const isFocus = selZone === i
                  const findingCount = countFindings([z]).total
                  return (
                    <button key={i} onClick={()=>setSelZone(i)} aria-pressed={isFocus} style={{display:'flex', alignItems:'center', gap:12, padding:'11px 0', textAlign:'left', background:'transparent', border:'none', borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`, cursor:'pointer', fontFamily:'inherit', width:'100%', WebkitTapHighlightColor:'transparent'}}>
                      <div style={{minWidth:0, flex:1}}>
                        <div style={{...V3.T.bodyStrong, color: isFocus ? V3.TEXT_PRIMARY : V3.TEXT_SECONDARY, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{z.zoneName}</div>
                      </div>
                      <span style={{...V3.T.captionDim, whiteSpace:'nowrap'}}>{findingCount} {findingCount===1?'finding':'findings'}</span>
                      {isFocus
                        ? <span style={{...V3.T.caption, color:'var(--accent)', whiteSpace:'nowrap'}}>Showing</span>
                        : <span style={{color:V3.TEXT_TERTIARY,fontSize:18,lineHeight:1}}>›</span>}
                    </button>
                  )
                })}
              </div>

              {/* ── Detailed findings — the legacy zone-by-category
                  drilldown for the currently focused zone. Kept as the
                  authoritative engine readout so the redesigned panels
                  above act as the executive summary, not a substitute. ── */}
              <div style={{...RS_SECTION, marginTop:4}}>
                <div style={RS_HEAD}>Findings · {zs.zoneName}</div>
              </div>
              <div key={selZone} style={{display:isTablet?'grid':'flex',gridTemplateColumns:isTablet?'1fr 1fr':'none',flexDirection:'column',gap:0}}>
          {zs.cats.map((cat,ci)=>{
            if (cat.status === 'DATA_GAP' || cat.status === 'INSUFFICIENT') {
              return(
                <div key={cat.l} style={{padding:'12px 0', borderTop: ci === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{...V3.T.bodyStrong, fontSize:15}}>{cat.l}</span>
                    <span style={V3.T.captionDim}>No data</span>
                  </div>
                  <div style={{...V3.T.captionDim, marginTop:4}}>Documentation not provided for this category</div>
                </div>
              )
            }
            // The category card's score, percentage label, FM pass/fail
            // chip and progress bar were all functions of `cat.s / cat.mx`.
            // The `pass` findings it hid below 70% are now hidden when the
            // category has anything more serious to show — the same intent,
            // expressed against the findings rather than the points.
            const SEV_RANK={critical:0,high:1,medium:2,low:3,info:4,pass:5};
            const catHasConcern = cat.r.some(r => r.sev==='critical'||r.sev==='high'||r.sev==='medium');
            const findings=cat.r.filter(r => !(r.sev === 'pass' && catHasConcern)).sort((a,b)=>(SEV_RANK[a.sev]??9)-(SEV_RANK[b.sev]??9));
            // A category is a disclosure row: name, one dot per finding in
            // its severity color, the count, a chevron. Categories with a
            // critical or high finding open by default; the rest fold, so
            // the screen shows the shape of the findings before their text.
            const catOpen = findings.some(r => r.sev==='critical' || r.sev==='high');
            return(
            <details key={cat.l} className="rs-cat" open={catOpen} style={{borderTop: ci === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`}}>
              <summary style={{display:'flex',alignItems:'center',gap:10,padding:'13px 0',cursor:'pointer',listStyle:'none',WebkitTapHighlightColor:'transparent'}}>
                <span style={{...V3.T.bodyStrong, fontSize:15, flex:1, minWidth:0}}>{cat.l}</span>
                <span aria-hidden="true" style={{display:'inline-flex',gap:3,flexShrink:0}}>
                  {findings.slice(0,8).map((r,i)=><span key={i} style={{width:6,height:6,borderRadius:'50%',background:sv(r.sev).c}} />)}
                </span>
                <span style={{...V3.T.captionDim, whiteSpace:'nowrap'}}>{findings.length}</span>
                <span className="rs-chev" aria-hidden="true" style={{color:V3.TEXT_TERTIARY,fontSize:18,lineHeight:1,display:'inline-block'}}>›</span>
              </summary>
              <div style={{paddingBottom:14}}>
              {/* Findings are sorted most-severe-first and the per-row
                  severity text pill (HIGH/MEDIUM/CRITICAL/INFO) is replaced
                  by a small color-coded dot — less label noise, easier to
                  scan. The dot carries the severity for screen readers via
                  role="img" + aria-label so the cue isn't color-only. */}
              {findings.map((r,i)=>{const s=sv(r.sev);const sevLabel=r.sev.charAt(0).toUpperCase()+r.sev.slice(1);return(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,paddingTop: i === 0 ? 0 : 11, paddingBottom: i < findings.length - 1 ? 11 : 0, borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`}}>
                  <span role="img" aria-label={`${sevLabel} severity`} style={{width:7,height:7,borderRadius:'50%',background:s.c,flexShrink:0,marginTop:7}} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{...V3.T.body, lineHeight:'20px'}}>{r.t}</div>
                    {r.std && <div style={{...V3.T.captionDim, marginTop:4, fontFamily:'var(--font-mono)', fontSize:11}}>{r.std}</div>}
                  </div>
                </div>
              )})}
              </div>
            </details>
          )})}
          {/* The "OSHA-Relevant Conditions" advisory card was removed per
              product direction — it is no longer surfaced on any report.
              (The engine still computes oshaResult.fl; it is simply not
              rendered here. Data Gaps below is unaffected.) */}
          {oshaResult?.gaps?.length>0&&<div style={RS_SECTION}>
            <div style={{...RS_HEAD, color:WARN}}>Data gaps</div>
            {oshaResult.gaps.map((g,i)=><div key={i} style={{fontSize:13,color:SUB,lineHeight:1.6,marginBottom:i<oshaResult.gaps.length-1?6:0}}>{g}</div>)}
          </div>}
          {/* Mold Findings — parallel panel, not in composite */}
          {moldResults.length>0&&<div style={RS_SECTION}>
            <div style={RS_HEAD}>Mold findings</div>
            <div style={{fontSize:11,color:DIM,marginBottom:12,lineHeight:1.5}}>Parallel assessment. Drives the IICRC S520 Conditions assessment.</div>
            {moldResults.map((m,i)=>{const moldColor=m.condition>=3?DANGER:m.condition>=2?WARN:SUB;return(
              <div key={i} style={{marginBottom:i<moldResults.length-1?12:0}}>
                <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:3,flexWrap:'wrap'}}>
                  <div style={{color:moldColor,fontWeight:700,fontSize:13,lineHeight:1.4}}>{m.label}</div>
                  {m.investigationTriggered&&<span style={{...V3.T.caption, color:WARN}}>Investigation triggered</span>}
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
                <div style={{padding:'6px 0 0'}}>
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

        {rTab==='rootcause'&&<div style={{display:'flex',flexDirection:'column',gap:0}}>
          <div style={{...V3.T.caption, fontWeight:400, lineHeight:1.5, marginBottom:6}}>Pathways correlate field observations, measurements and occupant reports. They support, but do not confirm, root-cause determination.</div>
          {causalChains.length===0?<div style={{...V3.T.bodyDim, textAlign:'center', padding:'40px 20px 0'}}>No concern pathways identified — no correlated multi-factor findings in this assessment.</div>
          :groupPathways(causalChains).map((g,i)=>{const confLabel=g.confidence==='Strong'?'High':g.confidence==='Moderate'?'Moderate':'Possible';const cc=confColor(g.confidence);const multi=g.byZone.length>1;return(
            // One row per distinct pathway, folded: the name, the zones it
            // applies to, its confidence as a word in its color. The
            // engine emits a chain per zone, so the same pathway used to
            // appear once for every zone; the fold keeps every zone's
            // hypothesis and evidence inside the row.
            <details key={g.type} className="rs-cat" style={{borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`}}>
              <summary style={{display:'flex',alignItems:'center',gap:10,padding:'13px 0',cursor:'pointer',listStyle:'none',WebkitTapHighlightColor:'transparent'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{...V3.T.bodyStrong, fontSize:15}}>{g.type}</div>
                  <div style={{...V3.T.captionDim, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{g.zones.join(' · ')}</div>
                </div>
                <span style={{...V3.T.caption, color:cc, whiteSpace:'nowrap'}}>{confLabel}</span>
                <span className="rs-chev" aria-hidden="true" style={{color:V3.TEXT_TERTIARY,fontSize:18,lineHeight:1,display:'inline-block'}}>›</span>
              </summary>
              <div style={{paddingBottom:16}}>
                {g.byZone.map((z, zi) => (
                  <div key={z.zone || zi} style={{paddingTop: zi === 0 ? 0 : 12, marginTop: zi === 0 ? 0 : 12, borderTop: zi === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`}}>
                    {multi && <div style={{...V3.T.captionDim, fontWeight:600, color:V3.TEXT_SECONDARY, marginBottom:6}}>{z.zone}{z.confidence !== g.confidence ? <span style={{color:confColor(z.confidence), fontWeight:500}}> · {z.confidence==='Strong'?'High':z.confidence==='Moderate'?'Moderate':'Possible'}</span> : null}</div>}
                    <div style={{...V3.T.body, lineHeight:'20px'}}>{z.rootCause}</div>
                    {z.evidence.length > 0 && (
                      <div style={{marginTop:8}}>
                        {z.evidence.map((e,j)=><div key={j} style={{...V3.T.caption, lineHeight:1.55, marginBottom:j<z.evidence.length-1?4:0}}>{e}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )})}
        </div>}

        {KG_EVIDENCE_ENABLED&&rTab==='evidence'&&isDesktop&&<Suspense fallback={LAZY_FALLBACK}><EvidenceMap zones={zones} zoneScores={zoneScores} causalChains={causalChains} recs={recs} assessmentId={viewRpt?.id} /></Suspense>}


        {rTab==='plan'&&(() => {
          // The plan answers "what next" in two parts: Do (the
          // recommendation tiers) and Measure (the sampling plan). Both
          // used to be tabs of their own.
          const knownZones=(zones||[]).map(z=>z.zn).filter(Boolean)
          const tiers = [{k:'imm',l:'Immediate',s:'Within 48 hours',c:'#EF4444'},{k:'eng',l:'Engineering controls',s:'1–4 weeks',c:TEXT},{k:'adm',l:'Administrative controls',s:'1–3 months',c:TEXT},{k:'mon',l:'Ongoing monitoring',s:'Continuous',c:TEXT}]
            .filter(cat=>recs?.[cat.k]?.length)
          const samples = groupSamplingPlan(samplingPlan?.plan)
          const nothing = tiers.length === 0 && samples.length === 0
          return (
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {nothing && <div style={{...V3.T.bodyDim, textAlign:'center', padding:'40px 20px 0'}}>No actions or sampling identified. Continue routine monitoring and re-assess on the next cycle.</div>}
              {tiers.map((cat,ci)=>{
                // An action appears once, with every location it applies to
                // beneath it. The engine emits an action per zone, so the
                // same sentence used to repeat under each zone heading.
                // groupActionsByText accepts the v2.8 object shape and the
                // legacy "Zone: text" strings of pre-v2.8 reports.
                const rows = groupActionsByText(recs[cat.k], knownZones)
                return (
                  <div key={cat.k} style={ci===0?undefined:RS_SECTION}>
                    <div style={{display:'flex',justifyContent:'space-between',gap:12,marginBottom:4,alignItems:'baseline'}}>
                      <div style={{color:cat.c,fontWeight:700,fontSize:16,lineHeight:1.4,letterSpacing:'-0.1px'}}>{cat.l}</div>
                      <div style={{...V3.T.caption, whiteSpace:'nowrap'}}>{cat.s}</div>
                    </div>
                    {rows.map((r, ri) => (
                      <div key={r.text} style={{padding:'10px 0', borderTop: ri === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`}}>
                        <div style={{...V3.T.body, lineHeight:'20px'}}>{r.text}</div>
                        <div style={{...V3.T.captionDim, marginTop:3}}>{r.locations.join(' · ')}</div>
                      </div>
                    ))}
                  </div>
                )
              })}
              {samples.length > 0 && (
                <div style={tiers.length===0?undefined:RS_SECTION}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:12,marginBottom:4,alignItems:'baseline'}}>
                    <div style={{color:TEXT,fontWeight:700,fontSize:16,lineHeight:1.4,letterSpacing:'-0.1px'}}>Measure</div>
                    <div style={{...V3.T.caption, whiteSpace:'nowrap'}}>{samples.length} {samples.length===1?'method':'methods'}</div>
                  </div>
                  {samples.map((p,i)=>{const pc=p.priority==='critical'?'#EF4444':p.priority==='high'?'#FB923C':'#FBBF24';const priLabel=p.priority.charAt(0).toUpperCase()+p.priority.slice(1);return(
                    // One row per method, folded: the sample type, its zones,
                    // the priority as a word in its color. The reason,
                    // method, controls and reference open beneath it.
                    <details key={`${p.type}-${i}`} className="rs-cat" style={{borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`}}>
                      <summary style={{display:'flex',alignItems:'center',gap:10,padding:'11px 0',cursor:'pointer',listStyle:'none',WebkitTapHighlightColor:'transparent'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{...V3.T.bodyStrong, fontSize:15}}>{p.type}</div>
                          <div style={{...V3.T.captionDim, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.zones.join(' · ')}</div>
                        </div>
                        <span style={{...V3.T.caption, color:pc, whiteSpace:'nowrap'}}>{priLabel}</span>
                        <span className="rs-chev" aria-hidden="true" style={{color:V3.TEXT_TERTIARY,fontSize:18,lineHeight:1,display:'inline-block'}}>›</span>
                      </summary>
                      <div style={{paddingBottom:14}}>
                        {p.hypotheses.map((h,hi)=><div key={hi} style={{...V3.T.body, lineHeight:'20px', marginBottom: hi < p.hypotheses.length-1 ? 4 : 0}}>{h}</div>)}
                        {[{l:'Method',v:p.method},{l:'Controls',v:p.controls},{l:'Reference',v:p.standard}].filter(x=>x.v).map((x)=>(
                          <div key={x.l} style={{display:'flex', gap:14, marginTop:10, alignItems:'baseline'}}>
                            <div style={{...V3.T.captionDim, width:72, flexShrink:0}}>{x.l}</div>
                            <div style={{...V3.T.caption, flex:1, minWidth:0, lineHeight:1.55}}>{x.v}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )})}
                  {samplingPlan?.outdoorGaps?.length>0&&<div style={RS_SECTION}><div style={{...RS_HEAD, color:WARN}}>Outdoor control gaps</div>{samplingPlan.outdoorGaps.map((g,i)=><div key={i} style={{fontSize:13,color:SUB,lineHeight:1.6,marginBottom:i<samplingPlan.outdoorGaps.length-1?6:0}}>{g}</div>)}</div>}
                </div>
              )}
              {/* The result-screen action bar (Word · Share · Map Zones ·
                  Review for discrepancies · Logger Studio) was retired from
                  this tab. Those actions live in the header ⋯ menu. */}
            </div>
          )
        })()}
        </div>
      </div>
    )
  }

  // ── Main render ──
  const qscq = qsVis[qsqi]
  const dtcq = dtVis[dqi]
  const zcq = zVis[zqi]
  const isAssessing = ['quickstart','zone','details'].includes(view)
  // What the header back pill names — the screen one tap returns to.
  const backLabel = (() => {
    const dest = nav.backView
    const r = ROUTES[dest]
    if (!r) return 'Back'
    if (['quickstart','zone','details','results'].includes(dest) && bldg?.fn) return bldg.fn
    if (dest === 'project-detail' && activeProjectSummary?.name) return activeProjectSummary.name
    return r.short
  })()

  // ── Layered side menu (Claude-style) ───────────────────────────────
  // The menu lives BEHIND the app; opening it transforms the whole content
  // surface into a floating card shifted right + scaled down, revealing the
  // menu underneath. `showHomeMenu` is the open flag (still toggled by the
  // header hamburger). A `go()` helper closes the menu then runs the action.
  const closeSideMenu = () => setShowHomeMenu(false)
  const go = (fn) => { setShowHomeMenu(false); haptic('light'); fn && fn() }
  // Primary destinations + a secondary "More" group so nothing is orphaned.
  // Each item highlights when its view is active.
  // Primary navigation — the three workflow anchors, always visible.
  // (Home/dashboard was dropped from nav: Projects is the landing and the
  // Start-survey flow now also lives on the Projects screen.)
  const sideMenuPrimary = [
    { label: 'Projects',     icon: 'bldg',      view: 'projects',    onClick: () => goTab('projects') },
    { label: 'Reports',      icon: 'report',    view: 'history',     onClick: () => goTab('history') },
    // The Tools hub lists every working tool (Logger Studio, Ventilation,
    // Sampling forms, Incidents, Search) — they used to be a collapsed
    // group here and nowhere else.
    { label: 'Tools',        icon: 'wrench',    view: 'tools',       onClick: () => goTab('tools') },
    { label: 'AtmosFlow AI', icon: 'jasper', renderIcon: () => <JasperBrainIcon size={20} animate={false} />, onClick: () => { supabase && trackEvent('jasper_open', { source: 'side_menu' }); setFaOpen(true) } },
  ]
  // Secondary navigation — grouped + collapsible (Linear/Arc/Notion style)
  // so the menu leads with the primaries and tucks the rest away. Trash is
  // isolated at the bottom (rare/destructive, low salience).
  const sideMenuGroups = [
    { key: 'resources', label: 'Resources', items: (userMode === 'fm'
      ? [{ label: 'Sample Air Quality Check', icon: 'play', onClick: () => runDemo() }]
      : [
          { label: 'Demo · Well-Run Office',      icon: 'play', onClick: () => runDemo('clean') },
          { label: 'Demo · Building w/ Findings', icon: 'play', onClick: () => runDemo('findings') },
        ]) },
    { key: 'support', label: 'Support', items: [
      { label: 'Settings',      icon: 'gear', view: 'settings', onClick: () => setView('settings') },
      { label: 'Help',          icon: 'help', view: 'help',     onClick: () => setView('help') },
      { label: 'Send feedback', icon: 'flag',                   onClick: () => openFeedback('Menu') },
    ] },
  ]
  const sideMenuTrash = { label: 'Trash', icon: 'trash', view: 'trash', onClick: () => setView('trash') }
  // Edge-swipe to open / swipe-left or tap to close. Discrete thresholds
  // (no live finger-follow) so it stays simple + iOS-Safari safe; the CSS
  // transition supplies the smoothness. (swipeRef is declared with the
  // other hooks at the top of the component — it must run before the
  // component's earlier conditional returns, or hook order breaks.)
  const onShellTouchStart = (e) => { const t = e.touches[0]; swipeRef.current = { x: t.clientX, y: t.clientY } }
  const onShellTouchEnd = (e) => {
    const s = swipeRef.current; swipeRef.current = null
    if (!s) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Math.abs(dy) > Math.abs(dx)) return // vertical scroll — ignore
    if (!showHomeMenu && s.x < 28 && dx > 60) setShowHomeMenu(true)
    else if (showHomeMenu && dx < -50) setShowHomeMenu(false)
  }

  const sideMenuRow = (item) => {
    const active = item.view && view === item.view
    return (
      <button
        key={item.label}
        onClick={() => go(item.onClick)}
        aria-current={active ? 'page' : undefined}
        style={{
          // Active row: the menu's neutral raised tone, the label and glyph
          // in the primary ink — the same selected state the dock draws. It
          // used to be an accent tint with an accent ring, an accent glyph
          // and an accent label: four uses of the one color on one row.
          width:'100%', display:'flex', alignItems:'center', gap:13, padding:'13px 14px',
          margin:'2px 0', borderRadius:16, border:'none', cursor:'pointer', textAlign:'left',
          fontFamily:'inherit', fontSize:15, fontWeight:active?600:500,
          color: 'var(--text)',
          background: active ? 'var(--m-ctl)' : 'transparent',
          WebkitTapHighlightColor:'transparent',
        }}>
        {/* Glyphs sit in the secondary ink; the active one in the primary
            ink. renderIcon items (the AtmosFlow AI brain) keep their own
            identity mark. */}
        {item.renderIcon ? item.renderIcon() : <I n={item.icon} s={19} c={active ? 'var(--text)' : 'var(--sub)'} w={1.7} />}
        <span style={{flex:1}}>{item.label}</span>
      </button>
    )
  }

  // Section label (Tools / Resources / Support). A static uppercase label
  // — not a control. The groups used to collapse behind a chevron, which
  // meant the phone menu opened as three rows and a lot of empty column,
  // and every secondary destination was a tap further away than it needed
  // to be. Every destination is now visible; the column scrolls if it
  // ever needs to.
  const sideMenuSectionLabel = (g) => (
    <div
      key={`h-${g.key}`}
      role="heading" aria-level={2}
      style={{
        padding:'16px 14px 6px', fontSize:11, fontWeight:700, letterSpacing:'0.6px',
        textTransform:'uppercase', color:'var(--sub)',
      }}>
      {g.label}
    </div>
  )

  return (
    <>
    {profile && (
      <nav className="af-sidemenu" aria-label="Main menu" aria-hidden={!showHomeMenu}>
        {/* Header — bold AtmosFlow wordmark left + a glass circular avatar
            right (Claude mobile style); the avatar opens the Account page. */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'2px 4px 16px',marginBottom:6,borderBottom:'1px solid var(--m-hair)'}}>
          <span style={{fontSize:23,fontWeight:800,letterSpacing:'-0.03em',color:'var(--text)'}}>AtmosFlow</span>
          <button
            onClick={() => go(() => setView('account'))}
            aria-label="Account"
            style={{
              width:40, height:40, borderRadius:'50%', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background:'var(--m-ctl)',
              backdropFilter:'blur(12px) saturate(160%)', WebkitBackdropFilter:'blur(12px) saturate(160%)',
              border:'1px solid var(--m-border)',
              boxShadow:'inset 0 1px 0 var(--m-inset)',
              color:'var(--accent)', fontSize:14, fontWeight:700, letterSpacing:'0.02em',
              cursor:'pointer', fontFamily:'inherit', overflow:'hidden', WebkitTapHighlightColor:'transparent',
            }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" aria-hidden="true" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} />
              : getInitials(profile)}
          </button>
        </div>
        {/* ── Project switcher ── persistent context chip: shows the
            project you're working in (or "All projects"), and expands an
            inline recents list. Selecting a project opens its workspace. */}
        {(() => {
          const current = activeProjectId ? menuProjects.find(p => p.id === activeProjectId) : null
          const recents = [...menuProjects].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5)
          const openProject = (id) => go(() => { setActiveProjectId(id); setView('project-detail') })
          return (
            <div style={{marginBottom:8}}>
              <button
                onClick={() => setMenuSwitcherOpen(o => !o)}
                aria-expanded={menuSwitcherOpen}
                aria-label="Switch project"
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 12px',
                  borderRadius:14, border:'1px solid var(--m-border)', cursor:'pointer', textAlign:'left',
                  fontFamily:'inherit', background:'var(--m-ctl)',
                  boxShadow:'inset 0 1px 0 var(--m-inset)',
                  WebkitTapHighlightColor:'transparent',
                }}>
                <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:'var(--accent)'}} />
                <span style={{flex:1,minWidth:0,fontSize:14,fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {current ? current.name : 'All projects'}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  style={{transform: menuSwitcherOpen ? 'rotate(180deg)' : 'none', transition:'transform 180ms cubic-bezier(.22,1,.36,1)', flexShrink:0}}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {menuSwitcherOpen && (
                <div style={{marginTop:4, padding:'2px 0 4px'}}>
                  {recents.map(p => (
                    <button key={p.id} onClick={() => openProject(p.id)} style={{
                      width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 12px 10px 22px',
                      borderRadius:12, border:'none', background:'transparent', cursor:'pointer', textAlign:'left',
                      fontFamily:'inherit', fontSize:14, fontWeight: p.id === activeProjectId ? 600 : 500,
                      color: p.id === activeProjectId ? 'var(--accent)' : 'var(--text)',
                      WebkitTapHighlightColor:'transparent',
                    }}>
                      <I n="bldg" s={15} c={p.id === activeProjectId ? 'var(--accent)' : 'var(--sub)'} w={1.7} />
                      <span style={{flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</span>
                    </button>
                  ))}
                  {recents.length === 0 && (
                    <div style={{padding:'10px 12px 8px 22px', fontSize:13, color:'var(--sub)'}}>No projects yet</div>
                  )}
                  <button onClick={() => go(() => setView('projects'))} style={{
                    width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 12px 10px 22px',
                    borderRadius:12, border:'none', background:'transparent', cursor:'pointer', textAlign:'left',
                    fontFamily:'inherit', fontSize:13, fontWeight:600, color:'var(--accent)',
                    WebkitTapHighlightColor:'transparent',
                  }}>
                    All projects ›
                  </button>
                </div>
              )}
            </div>
          )
        })()}
        <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch'}}>
          {sideMenuPrimary.map(sideMenuRow)}
          {sideMenuGroups.map(g => (
            <div key={g.key}>
              {sideMenuSectionLabel(g)}
              {g.items.map(sideMenuRow)}
            </div>
          ))}
        </div>
        {/* Trash — isolated at the bottom, muted (rare / destructive). */}
        <div style={{borderTop:'1px solid var(--m-hair)', marginTop:6, paddingTop:6}}>
          <button
            onClick={() => go(sideMenuTrash.onClick)}
            style={{width:'100%',display:'flex',alignItems:'center',gap:13,padding:'12px 14px',borderRadius:14,border:'none',background:'transparent',cursor:'pointer',textAlign:'left',fontFamily:'inherit',fontSize:14,fontWeight:500,color:'var(--sub)',WebkitTapHighlightColor:'transparent'}}>
            <I n="trash" s={18} c="var(--sub)" w={1.6} />
            <span style={{flex:1}}>Trash</span>
          </button>
        </div>
      </nav>
    )}
    {/* Desktop (>=1024px): persistent left navigation rail replacing the
        mobile bottom dock + hamburger drawer. Fed the same destination data
        as the mobile side menu so the IA is single-source. */}
    {profile && isDesktop && (
      <DesktopSidebar
        primary={sideMenuPrimary}
        groups={sideMenuGroups}
        trash={sideMenuTrash}
        activeView={view}
        groupsOpen={menuGroupsOpen}
        onToggleGroup={(k) => setMenuGroupsOpen(m => ({ ...m, [k]: !m[k] }))}
        profile={profile}
        onSelect={(it) => go(it.onClick)}
        onAccount={() => go(() => setView('account'))}
      />
    )}
    <div
      className={profile && showHomeMenu ? 'af-content-surface is-open' : 'af-content-surface'}
      onTouchStart={onShellTouchStart}
      onTouchEnd={onShellTouchEnd}
      style={{minHeight:V3.FULL_VH,background:BG,color:TEXT,fontFamily:"'inherit', system-ui, sans-serif",paddingLeft: profile && isDesktop ? SIDEBAR_W : 0}}>
      {/* Global offline banner — sits above the header so the
          offline state is impossible to miss. PendingSyncIndicator
          below stays as the source-of-truth for queue depth + last
          sync time; this banner is the binary "are we connected"
          signal. */}
      <OfflineBanner />
      <header
        data-scrolled={chromeScrolled ? 'true' : undefined}
        style={{
          position:'fixed', top:0, left: profile && isDesktop ? SIDEBAR_W : 0, right:0, zIndex:100,
          paddingTop:'env(safe-area-inset-top, 0px)',
          // Transparent at rest; a tinted, blurred bar with a hairline foot
          // once content scrolls beneath it (see chromeScrolled). The blur
          // is declared at rest too so the transition is only the tint —
          // toggling backdrop-filter itself flickers on iOS.
          background: chromeScrolled ? 'var(--chrome-glass)' : 'transparent',
          boxShadow: chromeScrolled ? '0 1px 0 var(--chrome-hair)' : '0 1px 0 transparent',
          backdropFilter:'blur(10px) saturate(130%)', WebkitBackdropFilter:'blur(10px) saturate(130%)',
          transition:'background 180ms ease, box-shadow 180ms ease',
        }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:48,padding:`0 ${padX}px`,maxWidth:contentMax,margin:'0 auto'}}>
          {/* Left cluster — hamburger menu (with its dropdown) followed
              by the "AtmosFlow" wordmark to its right. The hamburger is
              a bare icon (no bubble/border) so it sits flush at the left
              edge; the wordmark is scaled to the icon's height. The
              relative positioning anchors the dropdown menu below to
              this left cluster, so the popover opens DOWN-LEFT from the
              hamburger rather than down-right. */}
          <div style={{position:'relative',display:'flex',alignItems:'center'}}>
            {/* Back — pops the navigation stack. The label names the
                DESTINATION (iOS convention): "‹ Project" means one tap
                returns to the project workspace, "‹ Tools" to the hub. When
                the destination is an assessment screen or a project it
                names the facility / project rather than the generic word.
                Hidden on the home screens (nothing beneath). The project
                workspace used to draw its own "← Projects" and hide this
                one; it now relies on this control like every other screen. */}
            {profile && nav.backView && view!=='dash' && view!=='projects' && (
              <button
                onClick={()=>{ nav.back(); setViewRpt(null) }}
                {...triggerPress('back')}
                aria-label={`Back to ${backLabel}`}
                className="af-menu-trigger"
                // Bare: a chevron and the destination in the primary ink,
                // no capsule. The accent is for the primary action and
                // the selected state, and the way back is neither.
                style={{display:'flex',alignItems:'center',gap:2,height:36,padding:'0 8px 0 0',background:'transparent',border:'none',boxSizing:'border-box',cursor:'pointer',fontFamily:'inherit',color:V3.TEXT_PRIMARY,WebkitTapHighlightColor:'transparent', ...triggerFx('back', 1.1)}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
                <span style={{fontSize:15,fontWeight:600,letterSpacing:'-0.01em',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{backLabel}</span>
              </button>
            )}
            {profile && !isDesktop && (view==='dash' || view==='projects') && (
              <>
              <button
                ref={menuButtonRef}
                onClick={()=>{ setMenuClosing(false); setShowHomeMenu(true) }}
                {...triggerPress('menu')}
                aria-label="Open menu"
                aria-haspopup="menu"
                aria-expanded={showHomeMenu}
                className="af-menu-trigger"
                style={{
                  // A bare glyph in the primary ink; no circle, no glass.
                  width:40, height:40, marginLeft:-10,
                  padding:0, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                  background:'transparent', border:'none', color:V3.TEXT_PRIMARY,
                  boxSizing:'border-box', WebkitTapHighlightColor:'transparent',
                  ...triggerFx('menu', 1.3),
                }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="4" y1="7"  x2="20" y2="7" />
                  <line x1="4" y1="12" x2="15" y2="12" />
                  <line x1="4" y1="17" x2="11" y2="17" />
                </svg>
              </button>
              {/* AtmosFlow wordmark removed from the home header per design —
                  just the hamburger remains; branding lives in the side menu. */}
              </>
            )}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {/* The "SAVING" pill was removed from the top-right per design;
                autosave still runs, it's just no longer surfaced here. */}
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
            {/* Overflow (⋯) — context actions for the current screen,
                opened as a compact dropdown anchored to this button
                (top-right), matching the hamburger menu's popover.
                Replaces the always-on search/mic icons per the Senior
                top-bar design. Hidden on the dashboard, where the
                hamburger menu already exposes these actions. */}
            {profile && view!=='dash' && (
              <button
                type="button"
                className="af-menu-trigger"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setActionsAnchor({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
                  setActionsOpen(true)
                }}
                {...triggerPress('kebab')}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
                style={{
                  // A bare glyph in the primary ink; no circle, no glass.
                  width:40, height:40, marginRight:-10,
                  cursor:'pointer', display:'flex',
                  alignItems:'center', justifyContent:'center',
                  padding:0, boxSizing:'border-box',
                  background:'transparent', border:'none', color:V3.TEXT_PRIMARY,
                  WebkitTapHighlightColor:'transparent',
                  ...triggerFx('kebab', 1.3),
                }}>
                <I n="dots" s={22} c="currentColor" w={2} />
              </button>
            )}
          </div>
        </div>
      </header>
      <div style={{height:'calc(48px + env(safe-area-inset-top, 0px))'}} />

      {/* Context action menu — opened from the header ⋯ overflow.
          Compact dropdown anchored to the kebab button (top-right),
          same soft-glass popover as the hamburger menu; no report
          title/address header. Items are scoped to the current screen:
          on the report views they surface the report's own actions
          (search, voice, map, share); elsewhere the global search +
          voice. Every item maps to an existing handler — no
          placeholder actions. */}
      {actionsOpen && (() => {
        const onResults = view==='results' || view==='report'
        const close = closeActions
        const items = onResults ? [
          { label:'Generate reports',         icon:'notes',    onClick:()=>handleExport('docx','atmosflow') },
          { label:'Share',                    icon:'send',     onClick:()=>handleShare() },
          { label:'Send for peer review',     icon:'check',    onClick:()=>{ setActionsOpen(false); setPeerReviewOpen(true) } },
          { label:'Discrepancies Check',      icon:'findings', onClick:()=>{ setReviewError(null); setReviewChooserOpen(true) } },
          { label:'Ask AtmosFlow AI',         icon:'mic',      onClick:()=>{ supabase && trackEvent('jasper_open',{source:'report_actions'}); setVoiceCmdOpen(true) } },
        ] : [
          // Logger Studio: offer "send the included charts to a report" when
          // the user has toggled at least one graph "Include in report".
          ...(view==='sensor-data' && sensorData?.graphs && Object.values(sensorData.graphs).some(g => g && g.include)
            ? [{ label:'Send graphs to a report', icon:'send', onClick:()=>{ close(); setGraphTargetOpen(true) } }]
            : []),
          // Project workspace: "Edit details" lives here (top-right overflow)
          // rather than as a header button inside the project card.
          ...(view==='project-detail'
            ? [{ label:'Edit details', icon:'draft', onClick:()=>setProjectEditNonce(n=>n+1) }]
            : []),
          { label:'Search',             icon:'search', onClick:()=>setView('search') },
          { label:'Ask AtmosFlow AI', icon:'mic',    onClick:()=>{ supabase && trackEvent('jasper_open',{source:'header_actions'}); setVoiceCmdOpen(true) } },
        ]
        const anchor = actionsAnchor || { top: 60, right: 12 }
        return createPortal(
          <>
            <div
              className={actionsVis ? 'af-menu-backdrop is-open' : 'af-menu-backdrop'}
              onClick={close}
              onPointerDown={close} />
            <div
              role="menu"
              aria-label="Screen actions"
              className={actionsVis ? 'af-menu is-open' : 'af-menu'}
              style={{ top: anchor.top, right: anchor.right, minWidth: 220 }}>
              {items.map(item => (
                <button
                  key={item.label}
                  role="menuitem"
                  className="af-menu-item"
                  onClick={()=>{ close(); item.onClick() }}>
                  <I n={item.icon} s={18} c={SUB} w={1.6} />
                  <span style={{flex:1}}>{item.label}</span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )
      })()}

      {milestone&&<div style={{position:'fixed',inset:0,background:`${mix('bg', 94)}`,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 32px'}}><div style={{textAlign:'center',animation:'milestoneIn .5s cubic-bezier(.22,1,.36,1)'}}><div style={{marginBottom:20,display:'flex',justifyContent:'center'}}><div style={{width:80,height:80,borderRadius:22,background:`${mix('accent', 7)}`,border:`1.5px solid ${mix('accent', 19)}`,display:'flex',alignItems:'center',justifyContent:'center'}}><I n={milestone.icon} s={40} c={ACCENT} w={2} /></div></div><div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.5px',color:TEXT}}>{milestone.title}</div><div style={{fontSize:15,color:ACCENT,fontFamily:"var(--font-mono)",marginTop:10}}>{milestone.sub}</div></div></div>}
      <PeerReviewModal
        open={peerReviewOpen}
        facility={bldg?.fn || ''}
        onSend={sendForPeerReview}
        onClose={() => setPeerReviewOpen(false)}
      />
      <SaveSitePrompt
        open={!!savePromptCtx}
        bldg={bldg}
        onSave={async (siteInput) => {
          let savedSite = null
          try {
            const session = supabase ? await Storage.getSession() : null
            if (session?.access_token) {
              const resp = await fetch('/api/sites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
                body: JSON.stringify({ action: 'save', site: { ...siteInput, last_finalized_at: savePromptCtx?.ts || new Date().toISOString() } }),
              })
              const json = await resp.json().catch(() => ({}))
              if (resp.ok && json.site) {
                savedSite = json.site
                setCurrentSiteId(savedSite.id)
                // Stamp the just-finalized report with the site id so
                // future deep-links can find it via findMostRecentReportForSite.
                const rid = savePromptCtx?.rid
                if (rid) {
                  const stored = await STO.get(rid)
                  if (stored) await STO.set(rid, { ...stored, site_id: savedSite.id })
                }
              } else {
                throw new Error(siteSaveMessage(json.error, resp.status))
              }
            }
          } catch (e) {
            // Bubble up to the prompt's error display.
            throw e
          }
          emitEvent('assessment_finalized', {
            target_id: savePromptCtx?.rid || null,
            target_type: 'assessment',
            details: {
              site_id: savedSite?.id || null,
              findings: comp?.findings?.total ?? null,
              attention: comp?.findings?.attention ?? null,
              zones: zones.length,
              facility_name: bldg.fn || null,
              sampling_plan_size: (samplingPlan?.plan || []).length,
              lab_results_attached: !!(viewRpt?.labResults),
            },
          })
          setSavePromptCtx(null)
        }}
        onDismiss={() => {
          emitEvent('assessment_finalized', {
            target_id: savePromptCtx?.rid || null,
            target_type: 'assessment',
            details: {
              site_id: null,
              findings: comp?.findings?.total ?? null,
              attention: comp?.findings?.attention ?? null,
              zones: zones.length,
              declined_save: true,
              facility_name: bldg.fn || null,
              sampling_plan_size: (samplingPlan?.plan || []).length,
              lab_results_attached: !!(viewRpt?.labResults),
            },
          })
          setSavePromptCtx(null)
        }}
      />

      {/* Zone Complete bottom sheet — appears after the last question
          in a zone. Soft-glass; the existing finishAssessment() call
          is the "tap outside to dismiss" semantic equivalent (closes
          the sheet without finalizing), so onClose just sets the
          prompt state back to false without finishing. */}
      {zonePrompt && (
        <BottomSheet title="Zone complete" onClose={()=>setZonePrompt(false)} ariaLabel="Zone complete, add another or finish">
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

      {/* Remove-zone confirmation. The zone's photos go with it. */}
      {confirmRemoveZone && (
        <BottomSheet title={`Remove ${zoneLabel(zones, curZone)}?`} onClose={()=>setConfirmRemoveZone(false)} ariaLabel="Remove this zone from the assessment">
          <div style={{...V3.T.bodyDim, margin:'4px 0 18px', lineHeight:1.6}}>
            Everything recorded for this zone — answers, readings and photos — is removed from the assessment. The other zones are not affected.
          </div>
          <div style={{display:'flex',gap:10}}>
            <TactileButton variant="danger" size="lg" fullWidth haptic="heavy" onClick={removeCurrentZone}>Remove zone</TactileButton>
            <TactileButton variant="ghost" size="lg" onClick={()=>setConfirmRemoveZone(false)}>Cancel</TactileButton>
          </div>
        </BottomSheet>
      )}

      {/* Finalize found zones with nothing recorded. Strip them and go on,
          or go and fill the first one in. Both are the assessor's call;
          neither is a hard block on the deliverable. */}
      {blankZonePrompt && (
        <BottomSheet title={blankZonePrompt.length === 1 ? 'A zone has nothing recorded' : `${blankZonePrompt.length} zones have nothing recorded`} onClose={()=>setBlankZonePrompt(null)} ariaLabel="Empty zones found before finishing">
          <div style={{...V3.T.bodyDim, margin:'4px 0 12px', lineHeight:1.6}}>
            {blankZonePrompt.length === 1 ? 'This zone was added but never surveyed.' : 'These zones were added but never surveyed.'} An empty zone would still count in the findings and appear in the report.
          </div>
          <div style={{margin:'0 0 18px'}}>
            {blankZonePrompt.map(i => (
              <div key={i} style={{...V3.T.bodyStrong, padding:'6px 0', borderTop:`1px solid ${V3.BORDER_SUBTLE}`}}>{zoneLabel(zones, i)}</div>
            ))}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <TactileButton variant="primary" fullWidth size="lg" haptic="success" onClick={()=>{
              const idx = blankZonePrompt
              const next = removeZonesAt({ zones, photos, photoOverrides, equipment, curZone }, idx)
              trackEvent('blank_zones_removed', { count: idx.length, zones_remaining: next.zones.length })
              setZones(next.zones); setPhotos(next.photos); setPhotoOverrides(next.photoOverrides); setEquipment(next.equipment); setCurZone(next.curZone)
              setBlankZonePrompt(null)
              setPendingFinish(n => n + 1)
            }}>
              {blankZonePrompt.length === 1 ? 'Remove it and finish' : 'Remove them and finish'}
            </TactileButton>
            <TactileButton variant="secondary" fullWidth size="lg" onClick={()=>{
              const first = blankZonePrompt[0]
              setBlankZonePrompt(null)
              setCurZone(first); setZqi(0); setView('zone')
            }}>
              Go to {zoneLabel(zones, blankZonePrompt[0])}
            </TactileButton>
            <TactileButton variant="ghost" fullWidth onClick={()=>setBlankZonePrompt(null)}>Cancel</TactileButton>
          </div>
        </BottomSheet>
      )}

      {/* Logger Studio opened with no assessment in progress: which one
          should the logger data belong to? Listed newest first; "open
          without attaching" keeps the old behavior for a quick look at a
          file. See openTool. */}
      {attachSheet && (
        <BottomSheet title="Attach logger data to" onClose={()=>setAttachSheet(false)} ariaLabel="Choose the assessment Logger Studio should attach to">
          <div style={{...V3.T.bodyDim, margin:'4px 0 14px'}}>Session averages can be sent into a zone of the assessment you pick.</div>
          <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:'44vh',overflowY:'auto',marginBottom:12}}>
            {[...(index.drafts||[])].sort((a,b)=>String(b.ua||'').localeCompare(String(a.ua||''))).map(d => (
              <button key={d.id} type="button" onClick={()=>attachLoggerTo(d.id)}
                style={{display:'flex',alignItems:'center',gap:12,width:'100%',textAlign:'left',minHeight:52,padding:'10px 14px',borderRadius:V3.R.md,background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',cursor:'pointer',fontFamily:'inherit',WebkitTapHighlightColor:'transparent'}}>
                <I n="draft" s={18} c="var(--accent)" w={1.8} />
                <span style={{flex:1,minWidth:0}}>
                  <span style={{...V3.T.bodyStrong,display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.facility || 'Untitled draft'}</span>
                  {d.ua && <span style={{...V3.T.captionDim,display:'block',marginTop:2}}>Edited {new Date(d.ua).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>}
                </span>
                <span aria-hidden="true" style={{color:'var(--sub)',fontSize:18,lineHeight:1}}>›</span>
              </button>
            ))}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <TactileButton variant="secondary" fullWidth onClick={()=>{setAttachSheet(false);startNew()}} icon={<I n="plus" s={16} c="var(--accent)" w={1.8} />}>Start a new assessment</TactileButton>
            <TactileButton variant="secondary" fullWidth onClick={()=>{setAttachSheet(false);nav.navigate('sensor-data')}}>Open without attaching</TactileButton>
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
          {connectionToast==='offline'?'You\'re offline. Changes will sync when reconnected':'Back online, syncing data'}
        </div>
      )}

      {/* ── Pre-assessment acknowledgement — bottom sheet ──
          Two sentences on the page, one accent action, a text action
          to step back. It used to be four bordered cards under all-caps
          labels, with a shield icon and a subtitle above them, and one
          of the four described a "scoring methodology" the engine
          retired in v3.0. The limitation is stated once — the
          substantive boundary CLAUDE.md names — and the assessor's
          responsibility once; neither is repeated. Tap outside
          dismisses (the user is not committing yet); the primary
          button is the consent action. */}
      {showDisclaimer && (
        <BottomSheet
          title="Before you begin"
          onClose={()=>setShowDisclaimer(false)}
          maxWidth={460}
          ariaLabel="Pre-assessment acknowledgement"
        >
          <div style={{...V3.T.body, color:V3.TEXT_SECONDARY, lineHeight:'22px', margin:'4px 0 6px'}}>
            AtmosFlow identifies indoor air quality indicators and produces a sampling plan.
            It does not make a regulatory, compliance or medical determination.
          </div>
          <div style={{...V3.T.body, color:V3.TEXT_SECONDARY, lineHeight:'22px', marginBottom:22}}>
            You interpret the findings, review every generated output — including AI-written
            narrative — and apply your professional judgment before anything reaches a client.
          </div>
          <TactileButton variant="primary" fullWidth size="lg" pill onClick={proceedAfterDisclaimer} haptic="success">
            I understand, begin walkthrough
          </TactileButton>
          <div style={{textAlign:'center', marginTop:14}}>
            <button onClick={()=>setShowDisclaimer(false)} style={{...RS_LINK, fontSize:14}}>Not yet</button>
          </div>
          <div style={{...V3.T.captionDim, textAlign:'center', marginTop:14}}>Acknowledged for this session.</div>
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
                  <PhotoThumb photo={p} size={48} />
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

      {/* ── Feature tour — replayable walkthrough overlay ───────── */}
      {showTour && <FeatureTour onClose={closeTour} />}

      {/* Feedback sheet — opened from the menu (global) or a contextual
          Flag trigger (AI narrative, findings). v0 sends via mailto. */}
      <FeedbackSheet open={!!feedbackCtx} context={feedbackCtx} version={VER} onClose={()=>setFeedbackCtx(null)} />

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
            {/* Both routes out of this sheet mark the finalize OUTSTANDING, so
                finishDetails re-enters it once the data is in. Only the
                acknowledgement path below finalizes directly. */}
            <TactileButton variant="primary" fullWidth size="lg" onClick={()=>{setCalWarning(null);setFinalizePending(true);setDqi(Math.max(0, dtVis.findIndex(q=>q.id==='ps_inst_iaq')));setView('details')}}>
              Add instrument data
            </TactileButton>
            {savedInstruments.length > 0 && (
              <TactileButton variant="secondary" fullWidth size="lg" onClick={()=>{setCalWarning(null);setFinalizePending(true);setInstPickerOpen(true)}}>
                Use a saved instrument
              </TactileButton>
            )}
            {/* Proceeding is allowed — a credentialed assessor owns
                defensibility and AtmosFlow never hard-blocks the
                deliverable. What changed: it is now RECORDED. An
                interrupt nobody writes down is indistinguishable, after
                the fact, from an interrupt that never fired. */}
            {!calAckOpen ? (
              <TactileButton variant="ghost" fullWidth onClick={()=>setCalAckOpen(true)}>
                Continue without
              </TactileButton>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <label htmlFor="cal-ack-justification" style={{...V3.T.captionDim, textAlign:'left'}}>
                  Why are you finalizing without this? This is recorded on the report and in the audit log.
                </label>
                <textarea
                  id="cal-ack-justification"
                  data-testid="cal-ack-justification"
                  value={calAckText}
                  onChange={(e)=>setCalAckText(e.target.value)}
                  rows={3}
                  maxLength={MAX_JUSTIFICATION_LEN}
                  placeholder="e.g. Instrument calibrated 2026-01-10; certificate is in the project file and will be attached to the issued report."
                  style={{
                    width:'100%', boxSizing:'border-box', padding:'10px 12px',
                    borderRadius:RADII.md, border:`1px solid ${BORDER}`,
                    background:'var(--surface)', color:TEXT, fontSize:13,
                    fontFamily:'inherit', lineHeight:1.5, resize:'vertical',
                  }}
                />
                {calAckError && (
                  <div role="alert" style={{fontSize:11,color:WARN,lineHeight:1.5,textAlign:'left'}}>{calAckError}</div>
                )}
                <TactileButton
                  variant="ghost"
                  fullWidth
                  data-testid="cal-ack-confirm"
                  disabled={!validateJustification(calAckText).ok}
                  onClick={()=>{
                    const check = validateJustification(calAckText)
                    if (!check.ok) { setCalAckError(check.reason); return }
                    const ack = buildCalibrationAcknowledgement({
                      items: calWarning,
                      justification: calAckText,
                      assessor: { name: profile?.name, credentials: profile?.certs },
                    })
                    setCalAck(ack)
                    setCalAckError(null)
                    setCalAckOpen(false)
                    setCalAckText('')
                    setCalWarning(null)
                    finishAssessment(true, ack)
                  }}
                >
                  Record and finalize
                </TactileButton>
              </div>
            )}
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
            calibration status is mapped automatically. Confirm it on the
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
                  {isOutOfCal(inst) && <span style={{fontSize:10,fontWeight:700,color:WARN,padding:'2px 8px',borderRadius:999,background:`color-mix(in srgb, var(--warn) 12%, transparent)`,border:`1px solid color-mix(in srgb, var(--warn) 30%, transparent)`,letterSpacing:'0.3px',flexShrink:0}}>OVERDUE</span>}
                  <span style={{color:V3.TEXT_TERTIARY,fontSize:13,flexShrink:0}}>›</span>
                </button>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {reviewChooserOpen && (
        <BottomSheet
          title="Discrepancies Check"
          onClose={()=>setReviewChooserOpen(false)}
          maxWidth={420}
          ariaLabel="Discrepancies check on the report"
        >
          <div style={{...V3.T.bodyDim, lineHeight:1.6, margin:'4px 0 16px'}}>
            AtmosFlow AI scans for internal inconsistencies: narrative vs data,
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

      {genWriting && <ReportWritingOverlay label={genWriting.label} durationMs={genWriting.durationMs} />}

      {graphTargetOpen && (() => {
        const drafts = index.drafts || []
        const reports = index.reports || []
        const send = async (id) => {
          const res = await applyGraphsToReport(id)
          setGraphTargetOpen(false)
          if (res?.ok) toast.success(`Charts attached to "${res.facility || 'this report'}". They'll appear in its Word export. Open it and re-export to include them.`)
          else toast.error("Couldn't attach the charts to that report.")
        }
        return (
          <BottomSheet title="Send graphs to a report" onClose={()=>setGraphTargetOpen(false)} maxWidth={420} ariaLabel="Choose a report to receive the logger charts">
            <div style={{fontSize:13,color:SUB,margin:'4px 0 16px',lineHeight:1.55}}>The charts marked “Include in report” will be attached to the report you pick and embed in its Word export.</div>
            {drafts.length === 0 && reports.length === 0 ? (
              <div style={{fontSize:13,color:SUB,padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:V3.R.md,lineHeight:1.55}}>No reports yet. Start an assessment first, then send the charts to it.</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {drafts.length > 0 && <div style={V3.T.micro}>Drafts</div>}
                {drafts.map(d => <GraphTargetRow key={d.id} item={d} kind="Draft" onSend={send} />)}
                {reports.length > 0 && <div style={{...V3.T.micro, marginTop: drafts.length ? 6 : 0}}>Finalized</div>}
                {reports.map(r => <GraphTargetRow key={r.id} item={r} kind="Finalized report" onSend={send} />)}
              </div>
            )}
            <div style={{marginTop:14}}>
              <TactileButton variant="ghost" fullWidth onClick={()=>setGraphTargetOpen(false)}>Cancel</TactileButton>
            </div>
          </BottomSheet>
        )
      })()}

      <div style={{maxWidth:contentMax,margin:'0 auto',padding:`0 ${padX}px`,position:'relative',zIndex:1}}>
       <AnimatedPageTransition pageKey={view} mode={navDir}>

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
            { id: 'plan',      label: 'Actions',   icon: 'check' },
            { id: 'report',    label: 'Report',    icon: 'notes' },
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
                        <button onClick={()=>setView('history')} style={{background:'none',border:'none',color:V3.TEXT_PRIMARY,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>View all ›</button>
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
                <GlassCard style={{
                  padding:'28px 26px',
                  marginBottom:RHYTHM.section,
                  // Cyan neon outline (matches the HydroScan co-pilot card):
                  // a bright accent edge with a soft outer glow + faint
                  // inner sheen. Overrides the GlassCard base border/shadow.
                  border:'1px solid color-mix(in srgb, var(--accent-fill) 75%, transparent)',
                  boxShadow:'0 4px 14px rgba(0,0,0,0.35)',
                }}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                    <I n="airflow" s={18} c="var(--accent)" w={1.8} />
                    <div style={V3.T.micro}>AtmosFlow · Field co-pilot</div>
                  </div>
                  <div style={{...V3.T.h1, marginBottom:6}}>Ready to start a survey?</div>
                  <div style={{...V3.T.bodyDim, maxWidth:560, marginBottom:20}}>
                    Capture field observations, instrument readings, and zone notes.
                    AtmosFlow organizes them into a professional
                    assessment with severity, confidence, and recommended actions.
                  </div>
                  {/* Two compact pills side by side — ~25% smaller than the
                      default `sm` TactileButton (padding/font/min-height
                      overrides) so both fit on one row of the card. */}
                  <div style={{display:'flex',gap:10}}>
                    {/* Start survey is the standard cyan primary (variant
                        accent-fill + theme-aware --on-accent-fill text). Green
                        ("go") was dropped per the brand-token pass: green is
                        reserved for the safe / severity scale (ANSI Z535), not
                        chrome or generic CTAs. The primary is differentiated by
                        fill and weight, not by hue. */}
                    <TactileButton variant="primary" size="sm" pill onClick={startNew} style={{
                      padding:'8px 12px',fontSize:11,minHeight:30,
                      // No colored glow — flat fill with only the inset
                      // sheen + a faint drop shadow for tactile depth.
                      boxShadow:'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.20)',
                    }}>
                      Start survey
                    </TactileButton>
                    {/* Report an incident — secondary action, restyled to
                        the shared glass-pill language (.af-glass-control:
                        translucent glass + bright rim in dark, white capsule
                        in light) with cyan text, matching the dock + header
                        controls. Inline bg/border/shadow are cleared so the
                        class provides the glass; the variant's are dropped. */}
                    <TactileButton
                      variant="secondary"
                      size="sm"
                      pill
                      className="af-glass-control"
                      onClick={()=>setView('incident-form')}
                      style={{
                        padding:'8px 12px',
                        fontSize:11,
                        minHeight:30,
                        color:'var(--accent)',
                        background:undefined,
                        border:undefined,
                        boxShadow:undefined,
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
                    {reports.length > 3 && <button onClick={()=>setView('history')} style={{background:'none',border:'none',color:V3.TEXT_PRIMARY,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>View all ›</button>}
                  </div>
                  <div style={sgStack('tight')}>
                    {reports.slice(0, 3).map((r) => {
                      return (
                        <GlassCard key={r.id} dense onClick={()=>openReport(r)} style={{padding:'14px 16px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:12,minHeight:44}}>
                            <div style={V3.iconBox(V3.TEXT_SECONDARY)}>
                              <I n="report" s={15} c={V3.TEXT_SECONDARY} w={1.6} />
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.facility || 'Untitled'}</div>
                              <div style={{...V3.T.captionDim, fontFamily:'var(--font-mono)'}}>{fD(r.ts)}</div>
                            </div>
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

        {view==='quickstart'&&qscq&&renderQuestion(qscq,mergedData,setQSField,qsqi,qsVis,()=>{if(qsqi<qsVis.length-1)setQsqi(qsqi+1)},()=>{if(qsqi>0)setQsqi(qsqi-1)},(i)=>setQsqi(Math.max(0,Math.min(i,qsVis.length-1))),finishQuickStart,'→ HVAC Equipment',qsSecs)}

        {view==='equipment'&&<div style={{paddingTop:20,paddingBottom:120,maxWidth:contentMax,margin:'0 auto'}}>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:600,color:ACCENT,fontFamily:"var(--font-mono)",letterSpacing:'0.5px',marginBottom:6}}>STEP 2 OF 3 · HVAC EQUIPMENT</div>
            <div style={{fontSize:22,fontWeight:700,color:TEXT,letterSpacing:'-0.4px',marginBottom:6}}>Capture HVAC equipment</div>
            <div style={{fontSize:13,color:SUB,lineHeight:1.5}}>List the HVAC units serving the assessed area (AHU, RTU, FCU, ERV, etc.). Each captured unit becomes selectable when you map zones in the next step. <strong style={{color:TEXT,fontWeight:600}}>You can skip this step</strong>, equipment-scoped recommendations will surface as building-wide actions until equipment is identified.</div>
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
                  <option value="AHU">AHU: Air Handling Unit</option>
                  <option value="RTU">RTU: Rooftop Unit</option>
                  <option value="FCU">FCU: Fan Coil Unit</option>
                  <option value="VRF_INDOOR">VRF Indoor Unit</option>
                  <option value="ERV">ERV: Energy Recovery Ventilator</option>
                  <option value="MAU">MAU: Makeup Air Unit</option>
                  <option value="DOAS">DOAS: Dedicated Outdoor Air System</option>
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
            <button onClick={()=>{setView('quickstart'); setQsqi(qsVis.length-1)}} style={{background:'transparent',border:'none',padding:'12px 0',color:SUB,fontSize:15,fontWeight:500,cursor:'pointer',fontFamily:'inherit',minHeight:46}}>Back</button>
            <button onClick={finishEquipment} style={{marginLeft:'auto',padding:'0 24px',background:'var(--accent-fill)',border:'none',borderRadius:999,color:'var(--on-accent-fill)',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:46}}>{(equipment||[]).length === 0 ? 'Skip to zones' : 'Continue to zones'}</button>
          </div>
        </div>}

        {view==='zone'&&zcq&&<div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:16,marginBottom:-8}}>
            <div style={V3.T.caption}>Zone {curZone+1} · <span style={{color:V3.TEXT_PRIMARY,fontWeight:600}}>{zData.zn||'New zone'}</span></div>
            <div style={{display:'flex',gap:8}}>
              {zones.length>1&&curZone>0&&<button onClick={()=>{setCurZone(curZone-1);setZqi(0)}} style={{fontSize:14,color:SUB,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:'8px 12px',minHeight:44}}>‹ Prev</button>}
              {curZone<zones.length-1&&<button onClick={()=>{setCurZone(curZone+1);setZqi(0)}} style={{fontSize:14,color:SUB,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:'8px 12px',minHeight:44}}>Next ›</button>}
              {/* A zone can be taken back out — a mis-tapped "Add another
                  zone", a duplicate — as long as one remains. Danger ink,
                  text action, confirmed in a sheet, like "Delete project". */}
              {zones.length>1&&<button onClick={()=>setConfirmRemoveZone(true)} aria-label="Remove this zone" style={{fontSize:14,color:'var(--danger)',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:'8px 0 8px 12px',minHeight:44}}>Remove</button>}
            </div>
          </div>
          {/* Zone-equipment mapping (v2.8.0). Equipment-scoped recs
              group by these IDs at scoring time. Empty selection
              triggers the building-scoped fallback in genRecs. */}
          {zqi === 0 && (() => {
            const sel = Array.isArray(zData.servingEquipmentIds) ? zData.servingEquipmentIds : []
            // Served-by mapping as a line on the page, not a tinted box: a
            // micro heading, then the equipment as neutral toggles.
            return (
              <div style={{marginTop:14,paddingBottom:12,borderBottom:`1px solid ${V3.BORDER_SUBTLE}`}}>
                <div style={{...V3.T.micro, marginBottom:8}}>Served by HVAC equipment</div>
                {(equipment||[]).length === 0 ? (
                  <div style={{...V3.T.caption, fontWeight:400, lineHeight:1.5}}>No equipment captured; recommendations for this zone will be building-wide until it is. <button onClick={()=>setView('equipment')} style={{background:'none',border:'none',color:ACCENT,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>Add equipment ›</button></div>
                ) : (
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {equipment.map(e => {
                      const on = sel.includes(e.id)
                      return (
                        <button key={e.id} onClick={()=>toggleZoneEquipment(curZone, e.id)} style={{padding:'6px 12px',borderRadius:999,background:on?V3.RAISED:'transparent',border:`1px solid ${on?V3.BORDER_STRONG:BORDER}`,color:on?TEXT:SUB,fontSize:12,fontWeight:on?600:500,cursor:'pointer',fontFamily:'inherit',minHeight:32}}>
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
                    }} style={{padding:'6px 12px',borderRadius:999,background:sel.length===0?V3.RAISED:'transparent',border:`1px solid ${sel.length===0?V3.BORDER_STRONG:BORDER}`,color:sel.length===0?TEXT:SUB,fontSize:12,fontWeight:sel.length===0?600:500,cursor:'pointer',fontFamily:'inherit',minHeight:32}}>
                      {sel.length === 0 && <span style={{marginRight:4}}>✓</span>}Unknown
                    </button>
                  </div>
                )}
              </div>
            )
          })()}
          {renderQuestion(zcq,zData,setZF,zqi,zVis,()=>{if(zqi<zVis.length-1)setZqi(zqi+1)},()=>{if(zqi>0)setZqi(zqi-1)},(i)=>setZqi(Math.max(0,Math.min(i,zVis.length-1))),()=>{setZonePrompt(true)},'Complete Zone ✓',zSecs)}
        </div>}

        {view==='details'&&dtcq&&renderQuestion(dtcq,mergedData,setQSField,dqi,dtVis,()=>{if(dqi<dtVis.length-1)setDqi(dqi+1)},()=>{if(dqi>0)setDqi(dqi-1)},(i)=>setDqi(Math.max(0,Math.min(i,dtVis.length-1))),finishDetails,'Done ✓',dtSecs,
          dtcq.id==='ps_inst_iaq' && savedInstruments.length>0 ? (
            <button onClick={()=>setInstPickerOpen(true)} style={{width:'100%',padding:'12px 0',marginBottom:14,background:'transparent',border:'none',borderBottom:`1px solid ${V3.BORDER_SUBTLE}`,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:10,fontFamily:'inherit',WebkitTapHighlightColor:'transparent'}}>
              <span style={{flex:1,...V3.T.bodyStrong,color:ACCENT}}>Use a saved instrument</span>
              <span style={V3.T.captionDim}>{savedInstruments.length}</span>
              <span aria-hidden="true" style={{color:V3.TEXT_TERTIARY,fontSize:18,lineHeight:1}}>›</span>
            </button>
          ) : null)}

        {(view==='results'||view==='report') && (
          <ReportErrorBoundary
            key={viewRpt?.id || view}
            onBack={() => { setReportOpenError(null); setView(view==='report' ? 'history' : 'dashboard') }}
          >
            <DeferredRender render={() => {
              if (reportOpenError) { const err = new Error(reportOpenError.message); err.name = reportOpenError.name || 'ReportOpenError'; throw err }
              const out = renderResults(view==='report')
              if (out == null && view==='report') {
                const err = new Error(`Report rendered empty — render guard fell through (comp=${!!comp}, zoneScores=${zoneScores?.length || 0}, selZone=${selZone}).`)
                err.name = 'EmptyReportRender'
                throw err
              }
              return out
            }} />
          </ReportErrorBoundary>
        )}

        {view==='search'&&<SearchView
          index={index}
          onOpenReport={(r)=>openReport(r)}
          onResumeDraft={(id)=>resumeDraft(id)}
          onOpenIncident={(inc)=>{setCurrentIncident(inc);setView('incident-detail')}}
          onNavigate={(v)=> v==='dash' ? goHome() : setView(v)}
        />}

        {view==='history'&&<div style={{paddingTop:16,paddingBottom:120,maxWidth:contentMax,margin:'0 auto'}}>
          {/* ── Reports (restraint pass, 2026-09) ─────────────────────
              The heading and, when there is anything to roll up, the
              Portfolio summary as a text action. The subtitle, the cards,
              the icon tiles and the bordered empty states are gone: two
              sections as micro headings over hairlines, rows parting with
              hairlines, one line and one action when a section is empty. */}
          <div style={{marginBottom:12,display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12}}>
            <div style={V3.T.h1}>Reports</div>
            {/* Portfolio Summary — a practice-level Word rollup of every
                finalized assessment (risk-band distribution, per-site status,
                overdue reassessments, calibration). Aggregates the same index
                the dashboard reads; lazily imports the docx builder so it
                stays off the initial bundle. */}
            {((index.reports||[]).length + (index.drafts||[]).length) > 0 && (
              <button
                onClick={async () => {
                  if (portfolioBusy) return
                  setPortfolioBusy(true)
                  try {
                    const sites = (await STO.getSites?.()) || []
                    const { generatePortfolioReport } = await import('./docx/portfolio-report')
                    await generatePortfolioReport({
                      reports: index.reports || [],
                      drafts: index.drafts || [],
                      sites,
                      profile: profile || {},
                      firm: (profile && profile.firm) || 'Prudence EHS',
                    })
                    try { trackEvent('portfolio_report_exported', { assessments: (index.reports||[]).length, sites: sites.length }) } catch { /* analytics best-effort */ }
                  } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('portfolio report failed', e)
                  } finally {
                    setPortfolioBusy(false)
                  }
                }}
                style={{...RS_LINK, opacity:portfolioBusy?0.6:1, cursor:portfolioBusy?'default':'pointer'}}
              >
                {portfolioBusy ? 'Building…' : 'Portfolio summary'}
              </button>
            )}
          </div>

          {/* ── Drafts / In Progress ──────────────────────────────── */}
          <div style={{...RS_HEAD, paddingBottom:8, borderBottom:`1px solid ${V3.BORDER_SUBTLE}`, marginBottom:0}}>{userMode === 'fm' ? 'In progress' : 'Drafts'}{(index.drafts||[]).length>0?` · ${(index.drafts||[]).length}`:''}</div>
          {(index.drafts||[]).length === 0 ? (
            <div style={{padding:'12px 0 6px'}}>
              <span style={V3.T.bodyDim}>None in progress. </span>
              <button onClick={startNew} aria-label="Start new assessment" style={RS_LINK}>Start an assessment <span aria-hidden="true">›</span></button>
            </div>
          ) : (index.drafts||[]).map((d, i) => (
            <div key={d.id} style={{padding:'12px 0',borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`,display:'flex',alignItems:'center',gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{d.facility||'Untitled assessment'}</div>
                <div style={{...V3.T.captionDim, marginTop:2}}>{fD(d.ua||d.ts)}</div>
              </div>
              <button onClick={()=>resumeDraft(d.id)} style={RS_LINK}>Resume <span aria-hidden="true">›</span></button>
              <button onClick={(e)=>{e.stopPropagation();setDelConf({id:d.id,name:d.facility,type:'dft'})}} aria-label={`Delete draft ${d.facility||'Untitled assessment'}`} style={{background:'none',border:'none',padding:6,cursor:'pointer',display:'inline-flex',fontFamily:'inherit',WebkitTapHighlightColor:'transparent'}}>
                <I n="trash" s={15} c={V3.TEXT_TERTIARY} w={1.6} />
              </button>
            </div>
          ))}

          {/* ── Finalized ─────────────────────────────────────────── */}
          <div style={{...RS_HEAD, marginTop:22, paddingBottom:8, borderBottom:`1px solid ${V3.BORDER_SUBTLE}`, marginBottom:0}}>Finalized{(index.reports||[]).length>0?` · ${(index.reports||[]).length}`:''}</div>
          {(index.reports||[]).length > 0 && (
            <div style={{display:'flex',gap:10,padding:'12px 0 4px'}}>
              <input type="text" value={hSearch} onChange={e=>setHSearch(e.target.value)} placeholder="Search reports" aria-label="Search finalized reports" style={{flex:1,minWidth:0,padding:'10px 12px',background:'var(--surface)',border:`1px solid ${V3.BORDER_SUBTLE}`,borderRadius:V3.R.md,color:TEXT,fontSize:16,fontFamily:'inherit',boxSizing:'border-box',minHeight:44}} />
              <select value={hSort} onChange={e=>setHSort(e.target.value)} aria-label="Sort reports" style={{padding:'10px 12px',background:'var(--surface)',border:`1px solid ${V3.BORDER_SUBTLE}`,borderRadius:V3.R.md,color:V3.TEXT_SECONDARY,fontSize:16,fontFamily:'inherit',minHeight:44,cursor:'pointer'}}>
                <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="findings-high">Most findings</option><option value="findings-low">Fewest findings</option>
              </select>
            </div>
          )}
          {fReports.length === 0 ? (
            <div style={{padding:'12px 0 6px'}}>
              <span style={V3.T.bodyDim}>{hSearch ? 'No reports match your search.' : 'None yet. Finalize an assessment to generate a report. '}</span>
              {!hSearch && <button onClick={runDemo} style={RS_LINK}>View a sample report <span aria-hidden="true">›</span></button>}
            </div>
          ) : fReports.map((r, i) => (
            <div key={r.id} {...clickable(()=>openReport(r), { label: `Open report ${r.facility || 'Untitled'}` })} style={{padding:'12px 0',borderTop: i === 0 ? 'none' : `1px solid ${V3.BORDER_SUBTLE}`,cursor:'pointer',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',WebkitTapHighlightColor:'transparent'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.facility||'Untitled'}</div>
                <div style={{...V3.T.captionDim, marginTop:2}}>{fD(r.ts)}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();setDelConf({id:r.id,name:r.facility,type:'rpt'})}} aria-label={`Delete report ${r.facility||'Untitled'}`} style={{background:'none',border:'none',padding:6,cursor:'pointer',display:'inline-flex',fontFamily:'inherit',WebkitTapHighlightColor:'transparent'}}>
                <I n="trash" s={15} c={V3.TEXT_TERTIARY} w={1.6} />
              </button>
              <span aria-hidden="true" style={{color:V3.TEXT_TERTIARY,fontSize:18,lineHeight:1}}>›</span>
            </div>
          ))}
        </div>}
        {view==='trash'&&<TrashView onRecover={async(id)=>{await Backup.recover(id);await refreshIndex()}} onDelete={async(id)=>{await Backup.permanentDelete(id)}} />}
        {view==='tools'&&<ToolsHub onOpen={openTool} />}
        {view==='sampling-forms'&&<Suspense fallback={LAZY_FALLBACK}><SamplingFormsView profile={profile} onBack={nav.back} /></Suspense>}
        {view==='ventilation'&&<Suspense fallback={LAZY_FALLBACK}><VentilationTool /></Suspense>}
        {/* A tool carries the project it was opened from as its params
            (see ProjectDetail's onOpenLogger) — nothing in the shell
            remembers it. */}
        {view==='sensor-data'&&<Suspense fallback={LAZY_FALLBACK}><SensorDataPage value={sensorData} onChange={setSensorData} reports={index.drafts||[]} currentReportId={draftId} currentProjectId={nav.params?.projectId || null} currentZones={zones} onApplyAverages={applyAveragesToReport} onBack={nav.back} /></Suspense>}
        {view==='projects'&&<ProjectsScreen onReportIncident={()=>setView('incident-form')} onOpen={(pid)=>{setActiveProjectId(pid);setView('project-detail')}} />}
        {view==='project-detail'&&<ProjectDetail id={activeProjectId} profile={profile} editSignal={projectEditNonce} onBack={nav.back} onNewAssessment={(seed)=>startNew(seed)} onOpenReport={(r)=>openReport(r)} onOpenLogger={()=>nav.navigate('sensor-data', { projectId: activeProjectId })} onOpenSampling={()=>nav.navigate('sampling-forms', { projectId: activeProjectId })} onAskAI={()=>{ supabase && trackEvent('jasper_open', { source: 'project_workspace' }); setFaOpen(true) }} />}
        {view==='settings'&&<SettingsScreen onNavigate={(v)=>{if(v==='pricing'){setShowPricing(true)}else if(v==='tour'){setView('dash');setShowTour(true)}else if(v==='mold'){handleModeSwitch('mold')}else{setView(v)}}} adminActive={!!adminSecret} onActivateAdmin={(secret)=>{setAdminSecret(secret);setView('admin')}} />}
        {view==='account'&&<AccountScreen profile={profile} onEditProfile={()=>{sessionStorage.setItem('aiq_welcomed','1');setWelcomeDone(true);setProfile({...profile,isNew:true});setEditingProfile(true);setViewRpt(null)}} onLogout={handleLogout} onNavigate={(v)=>setView(v)} />}
        {view==='sites'&&<SitesScreen />}
        {view==='report-templates'&&<ReportTemplatesScreen />}
        {view==='tos'&&<TermsOfService onBack={()=>setView('settings')} />}
        {view==='privacy'&&<PrivacyPolicy onBack={()=>setView('settings')} />}
        {view==='help'&&<HelpView onBack={()=>setView('settings')} />}
        {view==='instrument-edit'&&<InstrumentEditView profile={profile} onSave={(updated)=>{setProfile(updated);setView('account')}} onCancel={()=>setView('account')} />}
        {view==='admin'&&adminSecret&&<Suspense fallback={LAZY_FALLBACK}><AdminDashboard onBack={()=>setView('settings')} adminSecret={adminSecret} /></Suspense>}
        {view==='incident-form'&&<IncidentForm onCancel={goHome} onSaved={(inc)=>{setCurrentIncident(inc);setView('incident-detail')}} />}
        {view==='incident-log'&&<IncidentLog profile={profile} onBack={goHome} onNewIncident={()=>setView('incident-form')} onView={(inc)=>{setCurrentIncident(inc);setView('incident-detail')}} />}
        {view==='incident-detail'&&currentIncident&&<IncidentDetail incident={currentIncident} profile={profile} onBack={()=>setView('incident-log')} onChange={setCurrentIncident} onDeleted={()=>{setCurrentIncident(null);setView('incident-log')}} />}
        {view==='properties'&&<PropertyDashboard onBack={()=>setView('dash')} onNavigate={(target,arg)=>{if(target==='building'){openBuildingProject(arg)}else{setView(target)}}} assessmentIndex={index} />}

       </AnimatedPageTransition>
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
      {!isAssessing && !milestone && !isDesktop && (() => {
        // Floating frosted-glass capsule dock (Instagram / iOS-26 Liquid
        // Glass) — see AtmosFlowFloatingDock. Icon-only, monochrome, with a
        // soft highlight tile behind the active destination. AtmosFlow AI is
        // not a tab; it floats on the right edge (JasperFloatingButton below).
        // Routing/behavior + the jasper event names are preserved exactly.
        const mkTab = (t) => ({
          id: t.id,
          label: t.label,
          icon: t.icon,
          badge: t.badge,
          ...(t.renderIcon ? { renderIcon: t.renderIcon } : {}),
          active: t.active !== undefined ? t.active : view === t.id,
          onClick: () => { haptic('light'); supabase && trackEvent('page_view', { tab: t.id }); if (t.onClick) t.onClick(); else goTab(t.id) },
        })
        // Account tab = the assessor's circular profile photo, Instagram's
        // profile destination. A plain neutral circle with a hairline edge;
        // the dock's highlight tile behind it is the active cue (so no colored
        // ring). Falls back to initials on a neutral tint when no avatar_url.
        const accountAvatarIcon = () => (
          <span aria-hidden="true" style={{
            width: 27, height: 27, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)',
            background: profile?.avatar_url ? 'transparent' : 'var(--surface)',
            color: 'var(--sub)', fontSize: 10, fontWeight: 700, letterSpacing: '-0.2px',
          }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <span>{getInitials(profile)}</span>}
          </span>
        )
        const navTabs = (userMode === 'fm' ? [
          {id:'dash',label:'Home',icon:'home'},
          {id:'properties',label:'Buildings',icon:'bldg'},
          {id:'incident-log',label:'Incidents',icon:'alert'},
          {id:'sensor-data',label:'Logger Studio',icon:'chartLine'},
        ] : [
          // Consultant dock, Project as the spine: Projects · Assess ·
          // Reports · Tools · Account. Assess continues the open assessment
          // (or starts one); Tools is the hub every working tool lives in —
          // Logger Studio moved there from its own tab. AtmosFlow AI is
          // detached from the dock and floats on the right edge (see
          // JasperFloatingButton below).
          {id:'projects',label:'Projects',icon:'bldg'},
          {id:'assess',label:'Assess',icon:'draft',active:isAssessing||view==='results',onClick:openAssess},
          {id:'history',label:'Reports',icon:'report',badge:((index.drafts||[]).length+(index.reports||[]).length)||null},
          {id:'tools',label:'Tools',icon:'wrench',active:view==='tools'||nav.within('tools')},
          {id:'account',label:'Account',icon:'user',renderIcon:accountAvatarIcon},
        ]).map(mkTab)

        return (
          <AtmosFlowFloatingDock tabs={navTabs} maxWidth={contentMax} />
        )
      })()}

      {/* AtmosFlow AI — detached floating launcher. On mobile it floats above
          the bottom dock; on desktop (no dock) it sits lower against the
          bottom-right edge. Rendered outside the dock's !isDesktop gate so it
          appears in both layouts. Consultant mode only, and hidden during the
          assessment / milestone flows just like the dock. */}
      {!isAssessing && !milestone && userMode !== 'fm' && (
        <JasperFloatingButton
          active={faOpen}
          bottomOffset={isDesktop ? 24 : 78}
          onClick={() => { haptic('light'); supabase && trackEvent('jasper_open', { source: 'floating_button' }); setFaOpen(true) }}
        />
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
        <Suspense fallback={LAZY_FALLBACK}>
        <FieldAssistant
          onClose={() => { setFaOpen(false); setVoicePrefill(null); setReviewPrefill(null); setReviewPayload(null) }}
          onNavigate={(v) => { setFaOpen(false); setVoicePrefill(null); setReviewPrefill(null); setReviewPayload(null); if (v === 'dash') goHome(); else setView(v) }}
          initialMessage={voicePrefill || reviewPrefill}
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
              // tab is correct when results mount. The model names tabs
              // by their labels and by the pre-merge keys; both map onto
              // the current four.
              if (action.tab_target) setRTab(RESULT_TAB_ALIASES[action.tab_target] || action.tab_target)
              // 'dash' from the model means "home" — consultants' home is
              // the Projects landing; FM keeps the dashboard.
              setView(target === 'dash' && userMode !== 'fm' ? 'projects' : target)
              setFaOpen(false)
              setVoicePrefill(null)
              return true
            }
            if (action.type === 'record_zone_observation') {
              // The write that closes the investigation loop. Everything
              // else Jasper can propose leaves the engine where it was.
              //
              // A FINALIZED report is a record, not a live assessment.
              // runScoring() already refuses to recompute one; writing a
              // value into it would edit an issued document's inputs while
              // its scores stayed frozen, which is worse than refusing.
              if (viewRpt) return false
              const fieldId = action.field
              if (!fieldId || action.value === undefined || action.value === null) return false
              if (action.scope === 'building') {
                setBldg((p) => ({ ...p, [fieldId]: action.value }))
              } else {
                // Zone scope goes through setZF, the same writer the
                // walkthrough uses — which is what propagates an outdoor
                // baseline (co2o / pmo / tvo / tfo / rho) to every zone
                // instead of stranding it on the one that happened to be
                // open. A direct setZones here would have written it to
                // one zone and left the rest scoring against nothing.
                if (!zones[curZone]) return false
                setZF(fieldId, action.value)
              }
              // Rescore, or the write is only half of the loop: the raw
              // value would update while zoneScores — which is what
              // deriveParameterVerdicts reads, and therefore what the
              // investigation calls evidence — kept the verdicts from
              // before the reading existed. Jasper would then be handed a
              // state that had not moved and would say so.
              //
              // Deferred to an effect rather than called here: runScoring
              // closes over `zones` and `bldg`, and the setState above has
              // not been applied yet, so calling it now would score the
              // record as it was a moment ago.
              setPendingRescore((n) => n + 1)
              return true
            }
            if (action.type === 'add_zone_note') {
              const noteText = (action.note_text || '').trim()
              if (!noteText) return false
              // Append to the current zone's notes field. If there's no
              // current zone (e.g. the user is on the dashboard), reject —
              // the model shouldn't have proposed this.
              //
              // The field is `znt` (Q_ZONE, "Zone observations / notes").
              // This wrote `nt` for its whole life, which is not in the
              // schema and which nothing reads: every note an assessor
              // accepted went into a key the wizard does not render and
              // the report does not print. `znt` is at least the field the
              // walkthrough shows back to them.
              //
              // Note the standing limitation either way: no engine reads
              // free text. A note records an observation for a human; it
              // does not move a score, a finding, or a differential. That
              // is what record_zone_observation is for.
              const zoneIdx = curZone
              const zone = zones[zoneIdx]
              if (!zone) return false
              const prevNotes = zone.znt || ''
              const nextNotes = prevNotes
                ? `${prevNotes}\n${noteText}`
                : noteText
              const nextZones = zones.slice()
              nextZones[zoneIdx] = { ...zone, znt: nextNotes }
              setZones(nextZones)
              return true
            }
            return false
          }}
          context={buildJasperContext({
            view, presurvey, bldg, zones, curZone,
            photos, sensorData,
            comp, zoneScores, recs, narrative, samplingPlan, causalChains,
            profile, draftId,
            calibrationAcknowledgement: viewRpt?.calibrationAcknowledgement || calAck || null,
            index,
            incident: currentIncident,
            report_review: reviewPayload || null,
            // Project workspace context — attached while the assessor is in
            // the project's orbit (the workspace itself, or a tool opened
            // from it), so unrelated chats aren't biased toward it.
            project_workspace: (view === 'project-detail' || nav.within('project-detail')) ? activeProjectSummary : null,
            // Portfolio index — always attached so the AI can answer
            // project questions from any view.
            projects_index: aiProjectsIndex,
          })}
        />
        </Suspense>
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
        @keyframes faBreathe{0%,100%{opacity:.38;transform:scale(.78);}50%{opacity:.92;transform:scale(1.32);}}
        @keyframes faDrift{0%{background-position:38% 0%;}50%{background-position:62% 14%;}100%{background-position:38% 0%;}}
        .fa-zone-in{animation:faZoneIn .26s cubic-bezier(.22,1,.36,1) both;}
        .fa-breathe{animation:faBreathe 3.6s ease-in-out infinite;}
        .fa-airflow{animation:faDrift 22s ease-in-out infinite;}
        /* Kalshi-style left drawer — slides in from off-screen and back
           out before unmount, with the scrim fading in step. */
        @keyframes drawerIn{from{transform:translateX(-100%);}to{transform:translateX(0);}}
        @keyframes drawerOut{from{transform:translateX(0);}to{transform:translateX(-100%);}}
        @keyframes scrimOut{from{opacity:1;}to{opacity:0;}}
        .af-drawer-in{animation:drawerIn .26s cubic-bezier(.22,1,.36,1);}
        .af-drawer-out{animation:drawerOut .22s ease-in forwards;}
        /* Theme-aware drawer surface: midnight black in dark mode, the
           light --card surface in light mode. Driven by CSS (not inline)
           so it flips with [data-theme="light"] on <html>; the contents
           use var(--text)/--sub/--border and invert with it. */
        /* Drawer surface — tied to the shared --bg token so the sliding
           menu is the SAME background color as the rest of the app in
           every palette (grayish black in dark, beige in light). No
           separate per-mode literal, so it can never drift out of sync. */
        .af-drawer-surface{background:var(--bg);}
        /* ── Claude-style layered side menu ──
           The menu sits BEHIND the content. Opening transforms the content
           surface into a floating card (shift right + scale down + rounded
           + shadow), revealing the menu beneath. The surface is a fixed
           viewport scroll container so the fixed header/dock move WITH the
           card when it transforms. */
        .af-sidemenu{
          position:fixed; top:0; left:0; bottom:0; width:280px; z-index:1;
          /* --surface-deep is defined in index.html FOR this menu (its
             comment says so) and flips to white in light mode; the rule
             used to hardcode #070809 and carry its own light override. */
          background:var(--surface-deep); display:flex; flex-direction:column;
          padding:calc(env(safe-area-inset-top, 0px) + 20px) 14px calc(env(safe-area-inset-bottom, 0px) + 18px);
          overflow:hidden;
          /* Menu-scoped glass tokens — kept dark by default; the light-theme
             override below flips the surface white and the translucent
             borders/insets to dark so the menu reads correctly in light mode.
             Text/icons use the global --text / --sub tokens (already themed). */
          --m-hair:rgba(255,255,255,0.07);
          --m-border:rgba(255,255,255,0.14);
          --m-ctl:rgba(255,255,255,0.06);
          /* Inset highlight retired with the flat pass; kept as a token so
             the call sites need no change. */
          --m-inset:transparent;
        }
        [data-theme="light"] .af-sidemenu{
          --m-hair:rgba(15,23,42,0.08);
          --m-border:rgba(15,23,42,0.12);
          --m-ctl:rgba(15,23,42,0.045);
          --m-inset:transparent;
        }
        /* Results screen disclosure rows (findings by category). */
        .rs-cat > summary::-webkit-details-marker{display:none}
        .rs-cat > summary .rs-chev{transition:transform .15s ease}
        .rs-cat[open] > summary .rs-chev{transform:rotate(90deg)}
        .af-content-surface{
          position:fixed; inset:0; z-index:2; overflow-y:auto;
          /* NOTE: deliberately NO -webkit-overflow-scrolling:touch here.
             On iOS that creates a momentum scroll layer that drags this
             container's position:fixed descendants (the header + dock) along
             with the scroll, so the floating dock would stick mid-page.
             Modern iOS keeps momentum scrolling without it. */
          transform:none; transform-origin:center;
          border-radius:0;
          transition:transform 320ms cubic-bezier(0.22,1,0.36,1),
                     border-radius 320ms cubic-bezier(0.22,1,0.36,1),
                     box-shadow 320ms ease;
          /* NO will-change/transform when closed: a persistent will-change:
             transform makes this a containing block for the fixed header/dock
             even at rest, which on iOS re-anchors them to the scroll
             container and floats the dock to the top. The transform only
             exists while open, so the containing block only forms then. */
        }
        .af-content-surface.is-open{
          transform:translateX(280px) scale(0.96);
          will-change:transform;
          /* Curve the LEFT corners (the edge facing the menu); the right
             corners ride off-screen so they stay square. */
          border-top-left-radius:28px; border-bottom-left-radius:28px;
          border-top-right-radius:0; border-bottom-right-radius:0;
          overflow:hidden;
          /* Claude-style clean card edge: a soft shadow that falls LEFT onto
             the menu (so the card reads as lifted above it) + a faint hairline
             outline. No bright glowing rim. */
          box-shadow:-12px 0 48px rgba(0,0,0,0.45),
                     0 18px 50px rgba(0,0,0,0.40),
                     inset 0 0 0 1px rgba(255,255,255,0.07);
        }
        /* Dimmed tap-to-close cover over the content card while open. */
        .af-content-cover{ position:fixed; inset:0; z-index:240; background:rgba(0,0,0,0.18); cursor:pointer; }
        @media (prefers-reduced-motion: reduce){ .af-content-surface{ transition:none; } }
        .af-scrim-in{animation:fadeIn .26s ease;}
        .af-scrim-out{animation:scrimOut .22s ease forwards;}
        /* ── Notion-style dropdown / action-menu animation ──
           Reusable classes for the three-dot / action menus: soft fade +
           slight scale + subtle vertical lift, over a blurred glass surface.
           The .is-open class is toggled on (one frame after mount) for the
           enter transition and toggled off to play the close BEFORE unmount.
           Theme-aware glass so it reads in dark (grayish black) + light
           (beige) — same translucency the spec calls for. */
        .af-menu-backdrop{
          position:fixed; inset:0; z-index:1000;
          background:rgba(0,0,0,0.22);
          -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px);
          opacity:0; transition:opacity 160ms ease;
        }
        .af-menu-backdrop.is-open{opacity:1;}
        .af-menu{
          position:fixed; z-index:1010; padding:8px;
          background:color-mix(in srgb, var(--card) 86%, transparent);
          -webkit-backdrop-filter:blur(18px) saturate(180%);
          backdrop-filter:blur(18px) saturate(180%);
          border:1px solid rgba(255,255,255,0.08);
          border-radius:18px;
          box-shadow:0 18px 45px rgba(0,0,0,0.35);
          transform-origin:top right;
          will-change:opacity, transform;
          /* Expands out of its anchor corner: scales up from 0.9 with a springy
             overshoot so the panel "grows" rather than just fading in. The
             springy curve is gated behind reduced-motion below. */
          opacity:0; transform:translateY(-4px) scale(0.9); pointer-events:none;
          transition:opacity 160ms ease, transform 200ms ease;
        }
        @media (prefers-reduced-motion: no-preference){
          .af-menu{transition:opacity 180ms ease, transform 300ms cubic-bezier(.34,1.5,.64,1);}
        }
        .af-menu.is-open{opacity:1; transform:translateY(0) scale(1); pointer-events:auto;}
        [data-theme="light"] .af-menu{border-color:rgba(15,23,42,0.10); box-shadow:0 18px 45px rgba(15,23,42,0.18);}
        .af-menu-item{
          display:flex; align-items:center; gap:14px;
          width:100%; padding:12px 14px; min-height:44px;
          background:transparent; border:none; border-radius:12px;
          text-align:left; cursor:pointer; font-family:inherit;
          color:var(--text); font-size:14px; font-weight:500;
          transition:background 140ms ease, transform 140ms ease;
        }
        .af-menu-item:hover{background:color-mix(in srgb, var(--text) 8%, transparent);}
        .af-menu-item:active{transform:scale(0.98);}
        .af-menu-item.is-active{color:var(--accent);}
        /* Header glass controls (back pill, hamburger, kebab). The sustained
           "liquid" press — grow + glow while held, spring back on release — is
           driven by React state (pressedTrigger) via triggerFx() inline styles
           so it holds for a press-and-hold and survives the re-render when the
           menu opens. position:relative is kept for stacking; the transform /
           transition / filter all come from the inline style. */
        .af-menu-trigger{position:relative;}
        /* ── Shared header control ──
           The same flat material as the bottom dock (AtmosFlowFloatingDock)
           and every card: solid card tone, hairline edge, one soft contact
           shadow. Applied to the header controls (back/title pill,
           hamburger, kebab) so header, nav and content speak one material.
           Shape (border-radius) is left to each control's inline style.
           (UI consistency pass, 2026-09: the translucent fill, blur and
           bright specular rim went — they were the brightest edges on
           screen once the cards went flat.) */
        .af-glass-control{
          background:var(--card);
          border:1px solid var(--border);
          box-shadow:0 1px 2px rgba(0,0,0,0.30);
        }
        [data-theme="light"] .af-glass-control{
          box-shadow:0 1px 2px rgba(15,23,42,0.08);
        }
        /* ── Liquid-glass "bubble" button (iOS-26 tactile control) ──
           A reusable, token-driven surface for primary CTAs, filter / nav
           pills, and circular icon buttons. The surface, glass border, layered
           shadow and inset highlights come from the --bubble-* tokens (themed
           in index.html); a control tints itself by overriding --bubble-bg /
           --bubble-glow inline. The surface props use !important so the class
           reliably governs any element it's added to (the codebase is
           inline-styled) — the per-control tint rides on custom properties, so
           there is no conflict. Press / hover / ripple are gated behind
           prefers-reduced-motion: no-preference. */
        .bubble-btn{
          position:relative; isolation:isolate;
          border-radius:var(--bubble-radius, 999px) !important;
          background:var(--bubble-bg) !important;
          border:1px solid var(--bubble-border) !important;
          box-shadow:var(--bubble-shadow), var(--bubble-inset) !important;
          /* Blur and sheen are token-driven so the theme decides whether a
             control is glass or flat; the fallbacks are the original glass
             values, for any context that does not set them. */
          -webkit-backdrop-filter:var(--bubble-blur, blur(16px) saturate(180%));
          backdrop-filter:var(--bubble-blur, blur(16px) saturate(180%));
          -webkit-tap-highlight-color:transparent; touch-action:manipulation;
          transform:translateZ(0);
        }
        /* Soft radial sheen from the top-left — the "bubble" read. z-index:-1
           keeps it above the fill but below the label/icon. */
        .bubble-btn::before{
          content:""; position:absolute; inset:0; border-radius:inherit; z-index:-1;
          background:var(--bubble-sheen, radial-gradient(120% 100% at 26% 12%, rgba(255,255,255,0.22), transparent 46%));
          pointer-events:none;
        }
        /* Cyan tap-glow — expands from center on press, fades fast. */
        .bubble-btn::after{
          content:""; position:absolute; inset:0; border-radius:inherit; z-index:-1;
          background:radial-gradient(circle at 50% 50%, var(--bubble-glow), transparent 60%);
          opacity:0; transform:scale(.8); pointer-events:none;
        }
        .bubble-btn:disabled, .bubble-btn[aria-disabled="true"]{ opacity:.5; filter:saturate(.7); }
        .bubble-btn:focus-visible{
          outline:none;
          box-shadow:var(--bubble-shadow), var(--bubble-inset), 0 0 0 3px color-mix(in srgb, var(--accent) 50%, transparent) !important;
        }
        @media (prefers-reduced-motion: no-preference){
          /* Fluid press: the transform springs back on RELEASE (slight
             overshoot, iOS-26 "liquid" settle); the :active rule below swaps
             in a near-instant press-IN so the surface tracks the finger. */
          .bubble-btn{
            transition:transform 340ms cubic-bezier(.34,1.56,.64,1), box-shadow 200ms cubic-bezier(.2,.8,.2,1), background 180ms ease, border-color 180ms ease, filter 180ms ease;
          }
          .bubble-btn::after{ transition:opacity 240ms ease, transform 240ms cubic-bezier(.34,1.56,.64,1); }
          .bubble-btn:not(:disabled):hover{ filter:brightness(1.06); }
          /* Press = the scale alone. The lift on hover and the deep inset
             on press were the last of the "liquid" read; a flat pill just
             gets slightly smaller under the finger. */
          .bubble-btn:not(:disabled):active{
            transition:transform 110ms cubic-bezier(.4,0,.2,1) !important;
            transform:scale(var(--bubble-press-scale, .96)) !important;
          }
          .bubble-btn:not(:disabled):active::after{ opacity:1; transform:scale(1.08); }
        }
        @media (prefers-reduced-motion: reduce){
          .af-menu,.af-menu-backdrop,.af-menu-item,.af-menu-trigger{transition:none !important;}
          .af-menu{transform:none !important;}
        }
        @media (prefers-reduced-motion: reduce){
          .fa-zone-in{animation:none;}
          .fa-breathe{animation:none;opacity:.55;}
          .fa-airflow{animation:none;}
          .af-drawer-in,.af-drawer-out{animation:none;}
          .af-scrim-in{animation:none;}
          .af-scrim-out{animation:none;opacity:0;}
        }
        *{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent;}
        button{font-family:inherit;-webkit-tap-highlight-color:transparent;}
        input::placeholder,textarea::placeholder{color:var(--dim);}
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=number]{-moz-appearance:textfield;}
        select option{background:${CARD};color:${SUB};}
        /* Scrollbars: hidden on touch for the clean mobile look; a slim,
           theme-aware scrollbar on desktop (fine pointer) so long screens
           don't look cut off at the fold. The content always scrolled, but
           desktop users had no visible affordance that it did. */
        @media (pointer: coarse){*{scrollbar-width:none;}::-webkit-scrollbar{width:0;height:0;}}
        @media (pointer: fine){
          *{scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
          ::-webkit-scrollbar{width:10px;height:10px;}
          ::-webkit-scrollbar-thumb{background:var(--border);border-radius:8px;border:3px solid transparent;background-clip:content-box;}
          ::-webkit-scrollbar-thumb:hover{background:var(--sub);background-clip:content-box;}
          ::-webkit-scrollbar-track{background:transparent;}
        }
        body{overscroll-behavior:none;}
      `}</style>
      {/* Tap the dimmed content card to close the side menu (Claude-style). */}
      {profile && showHomeMenu && (
        <div className="af-content-cover" onClick={closeSideMenu} onPointerDown={closeSideMenu} aria-hidden="true" />
      )}
    </div>
    </>
  )
}
