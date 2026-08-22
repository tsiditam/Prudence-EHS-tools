/**
 * AtmosFlow Risk Bands — Single Source of Truth
 * Every label, color, severity, and band in the app derives from here.
 * No string literals for risk labels anywhere else in the codebase.
 */

export const RISK_BANDS = [
  { min: 80, max: 100, id: 'LOW',      label: 'Low Risk',  color: '#15803D', bg: '#15803D12', severity: 1 },
  { min: 60, max: 79,  id: 'MODERATE', label: 'Moderate',  color: '#A16207', bg: '#A1620712', severity: 2 },
  { min: 40, max: 59,  id: 'HIGH',     label: 'High Risk', color: '#C2410C', bg: '#C2410C12', severity: 3 },
  { min: 0,  max: 39,  id: 'CRITICAL', label: 'Critical',  color: '#B91C1C', bg: '#B91C1C12', severity: 4 },
]

const INSUFFICIENT_BAND = { id: 'INSUFFICIENT', label: 'Insufficient Data', color: '#6B7380', bg: '#6B738012', severity: 0 }

export function getRiskBand(score) {
  if (score === null || score === undefined) return INSUFFICIENT_BAND
  return RISK_BANDS.find(b => score >= b.min && score <= b.max) || RISK_BANDS[RISK_BANDS.length - 1]
}

export const SEVERITY_TO_BAND = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MODERATE',
  low: 'LOW',
  info: 'LOW',
  pass: 'LOW',
}

export function findingsToBand(findings) {
  let worst = 0
  for (const f of findings) {
    const bandId = SEVERITY_TO_BAND[f.sev] || 'LOW'
    const band = RISK_BANDS.find(b => b.id === bandId)
    if (band && band.severity > worst) worst = band.severity
  }
  return RISK_BANDS.find(b => b.severity === worst) || RISK_BANDS[0]
}

// `deriveFMSummary` lived here: an FM-mode headline + next-steps block
// that blended the composite band with a findings band and emitted an
// override message quoting the composite number. It went with the score.
// It had no callers at the time of removal — the FM result surface reads
// `resolveVerdict` (src/utils/assessmentVerdict.js), which answers the
// same question from findings and escalation triggers.

export const ASSESSMENT_MODES = {
  SCREENING: {
    id: 'SCREENING',
    produces: 'SCREENING_SNAPSHOT',
    requiresInstruments: false,
    emitsComposite: false,
    reportHeader: 'IAQ ASSESSMENT SNAPSHOT',
    disclaimer: 'NOT A COMPLIANCE ASSESSMENT',
  },
  WALKTHROUGH: {
    id: 'WALKTHROUGH',
    produces: 'WALKTHROUGH_REPORT',
    requiresInstruments: true,
    emitsComposite: true,
    reportHeader: 'IAQ WALKTHROUGH REPORT',
    disclaimer: null,
  },
  FULL_ASSESSMENT: {
    id: 'FULL_ASSESSMENT',
    produces: 'IAQ_ASSESSMENT_REPORT',
    requiresInstruments: true,
    requiresCalibration: true,
    emitsComposite: true,
    reportHeader: 'IAQ ASSESSMENT REPORT',
    disclaimer: null,
  },
}

export const CONFIDENCE_LEVELS = {
  HIGH: { label: 'High', min: 0.85 },
  MEDIUM: { label: 'Medium', min: 0.6 },
  LOW: { label: 'Low', min: 0.3 },
  INSUFFICIENT: { label: 'Insufficient', min: 0 },
}

export function getConfidenceLevel(weightedSufficiency) {
  if (weightedSufficiency >= 0.85) return 'High'
  if (weightedSufficiency >= 0.6) return 'Medium'
  if (weightedSufficiency >= 0.3) return 'Low'
  return 'Insufficient'
}
