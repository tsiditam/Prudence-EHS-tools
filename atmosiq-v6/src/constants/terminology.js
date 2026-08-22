/**
 * AtmosFlow Terminology Dictionary + Mode Infrastructure
 * Runtime-switchable view layer: 'ih' (Industrial Hygienist) | 'fm' (Facility
 * Manager) | 'mold' (Mold screening — its own module with a parallel engine).
 * The IAQ scoring engine is mode-agnostic across 'ih'/'fm'; 'mold' does NOT use
 * it — mold mode renders a self-contained screen (MoldModeScreen) driven by the
 * separate mold screening engine (src/engines/mold). Missing mold keys fall
 * back to the 'ih' dictionary via t().
 */

import { KEYS } from '../utils/storageKeys'

const STORAGE_KEY = KEYS.userMode

// `composite` ('Composite Score' / 'Overall Air Quality'), the four
// `risk*` band labels and `noScoreExplainer` were removed with the
// 100-point score. The explainer in particular had become marketing for
// a feature that no longer exists: "When you measure, we score. When you
// observe, we document and flag."
//
// Severity labels are NOT here and never were — they belong to the
// findings, and the findings survive.
export const TERMINOLOGY = {
  ih: {
    assessment: 'Assessment',
    zone: 'Zone',
    zones: 'Zones',
    samplingPlan: 'Sampling Plan',
    causalChain: 'Causal Chain Analysis',
    // FINDING-level escalation: this particular finding warrants a
    // professional look. Distinct from the report's lifecycle status
    // (src/constants/reportLifecycle.js) and from the AI-provenance
    // banner — reworded off "IH Review Required" so a single flagged
    // finding no longer reads as a verdict on the whole document.
    findingReview: 'Professional Review Recommended',
    report: 'Report',
    findings: 'Findings',
    recommendation: 'Recommendation',
    escalation: 'AIHA/ABIH Referral',
    dashboard: 'Dashboard',
    newAssessment: 'New Assessment',
    demoAssessment: 'Open Demo Assessment',
    viewAll: 'View all reports',
    drafts: 'Drafts',
    reports: 'Reports',
    buildingContext: 'Building and Complaint Context',
    scopeMethods: 'Scope and Methodology',
    limitations: 'Limitations and Professional Judgment',
    confidenceHigh: 'High Confidence',
    confidenceModerate: 'Moderate Confidence',
    confidenceLow: 'Limited Confidence',
    meterPrompt: 'Primary IAQ meter make/model?',
    deviceLabel: 'Instrument',
    calibrationLabel: 'Calibration Status',
  },
  fm: {
    assessment: 'Air Quality Check',
    zone: 'Area',
    zones: 'Areas',
    samplingPlan: 'Recommended Next Steps',
    causalChain: 'Likely Causes',
    findingReview: 'Professional Review Recommended',
    report: 'Air Quality Report',
    findings: 'What We Found',
    recommendation: 'What To Do',
    escalation: 'Call a Professional',
    dashboard: 'My Buildings',
    newAssessment: 'New Air Quality Check',
    demoAssessment: 'Try a Sample Check',
    viewAll: 'View all checks',
    drafts: 'In Progress',
    reports: 'Completed Checks',
    buildingContext: 'Building Information',
    scopeMethods: 'What Was Checked',
    limitations: 'Important Notes',
    confidenceHigh: 'High Confidence',
    confidenceModerate: 'Moderate Confidence',
    confidenceLow: 'Low Confidence',
    meterPrompt: 'What are you using to measure the air?',
    deviceLabel: 'Device',
    calibrationLabel: 'Device Status',
  },
  // Mold screening mode. Only the terms that differ from 'ih' are listed; t()
  // falls back to the 'ih' dictionary for the rest. Mold mode is a
  // self-contained screen, so most IAQ terms never surface here.
  mold: {
    assessment: 'Mold Assessment',
    zone: 'Area',
    zones: 'Areas',
    report: 'Mold Assessment Report',
    findings: 'Findings',
    findingReview: 'Professional Review Recommended',
    dashboard: 'Mold Assessments',
    newAssessment: 'New Mold Assessment',
    demoAssessment: 'Open Demo Assessment',
    deviceLabel: 'Instrument',
    calibrationLabel: 'Calibration Status',
  },
}

export const FM_TRAFFIC_LIGHT = {
  'Low Risk': { color: '#22C55E', label: 'Low Risk', bg: '#22C55E15' },
  'Moderate': { color: '#FBBF24', label: 'Watch', bg: '#FBBF2415' },
  'High Risk': { color: '#FB923C', label: 'Action Required', bg: '#FB923C15' },
  'Critical': { color: '#EF4444', label: 'Critical', bg: '#EF444415' },
}

export const DEVICE_TIERS = [
  { id: 'visual', label: 'Smartphone / Visual inspection only', ceiling: 'Low' },
  { id: 'consumer', label: 'Consumer air quality monitor (AirThings, uHoo, Awair)', ceiling: 'Low' },
  { id: 'prosumer', label: 'Prosumer monitor (Temtop, Aeroqual 200, IQAir AirVisual Pro)', ceiling: 'Moderate' },
  { id: 'professional', label: 'Professional instrument (TSI, GrayWolf, Q-Trak)', ceiling: 'High' },
  { id: 'none', label: 'No instruments — just logging complaints', ceiling: null },
]

export const COMPLAINT_SYMPTOMS = [
  'Headache', 'Dizziness', 'Eye irritation', 'Throat irritation',
  'Cough', 'Shortness of breath', 'Fatigue', 'Nausea',
  'Skin irritation', 'Odor complaint', 'Temperature complaint',
  'Humidity complaint', 'Visible contamination', 'Other',
]

let _currentMode = null

export function getMode() {
  if (_currentMode) return _currentMode
  try { _currentMode = localStorage.getItem(STORAGE_KEY) || null } catch {}
  return _currentMode || 'ih'
}

export function setMode(mode) {
  _currentMode = mode
  try { localStorage.setItem(STORAGE_KEY, mode) } catch {}
}

export function t(key) {
  return TERMINOLOGY[getMode()]?.[key] || TERMINOLOGY.ih[key] || key
}

export function isFM() { return getMode() === 'fm' }
export function isIH() { return getMode() === 'ih' }

export function isMold() { return getMode() === 'mold' }

// The home view for a given mode. Mold mode lands on its own self-contained
// 'mold' view (MoldModeScreen, early-returned by MobileApp). Facility-Manager
// mode lands on the legacy 'dash' co-pilot home; everyone else (IH / CSP /
// consultant) lands on the project-centric 'projects' home. Single source of
// truth so every "go home" path agrees.
export function homeView(mode = getMode()) {
  if (mode === 'mold') return 'mold'
  return mode === 'fm' ? 'dash' : 'projects'
}
