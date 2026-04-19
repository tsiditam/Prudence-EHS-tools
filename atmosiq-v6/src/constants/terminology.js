/**
 * AtmosFlow Terminology Dictionary + Mode Infrastructure
 * Runtime-switchable view layer: 'ih' (Industrial Hygienist) | 'fm' (Facility Manager)
 * Scoring engine is mode-agnostic — same inputs, same outputs regardless of mode.
 */

const STORAGE_KEY = 'atmosflow:userMode'

export const TERMINOLOGY = {
  ih: {
    assessment: 'Assessment',
    zone: 'Zone',
    zones: 'Zones',
    samplingPlan: 'Sampling Plan',
    causalChain: 'Causal Chain Analysis',
    composite: 'Composite Score',
    findingReview: 'IH Review Required',
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
    riskLow: 'Low Risk',
    riskModerate: 'Moderate',
    riskHigh: 'High Risk',
    riskCritical: 'Critical',
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
    composite: 'Overall Air Quality',
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
    riskLow: 'Low Risk',
    riskModerate: 'Watch',
    riskHigh: 'Action Required',
    riskCritical: 'Critical',
    confidenceHigh: 'High Confidence',
    confidenceModerate: 'Moderate Confidence',
    confidenceLow: 'Low Confidence',
    noScoreExplainer: 'AtmosFlow does not generate scores from observational data alone. When you measure, we score. When you observe, we document and flag. This is a deliberate design choice to ensure every AtmosFlow score is defensible.',
    meterPrompt: 'What are you using to measure the air?',
    deviceLabel: 'Device',
    calibrationLabel: 'Device Status',
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
