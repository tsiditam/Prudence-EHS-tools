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

export function deriveFMSummary(findings, composite, mode) {
  const compBand = composite ? getRiskBand(composite.tot) : null
  const findingsBand = findings.length > 0 ? findingsToBand(findings) : null
  const override = findingsBand && compBand && findingsBand.severity > compBand.severity
  const finalBand = override ? findingsBand : (compBand || findingsBand || INSUFFICIENT_BAND)

  const headlines = {
    LOW: 'Conditions appear within acceptable ranges based on available data.',
    MODERATE: 'Some concerns were identified that may benefit from attention.',
    HIGH: 'Significant concerns identified. Corrective action is recommended.',
    CRITICAL: 'Critical concerns identified. Immediate action is recommended.',
    INSUFFICIENT: 'Insufficient data to determine air quality status.',
  }

  const nextSteps = {
    LOW: 'Continue routine monitoring. No immediate corrective actions required at this time.',
    MODERATE: 'Review the findings below and address identified concerns within 30 days.',
    HIGH: 'Address the findings below within 7 days. Consider professional evaluation.',
    CRITICAL: 'Take immediate corrective action. Professional evaluation strongly recommended.',
    INSUFFICIENT: 'Additional data collection is required before conclusions can be drawn.',
  }

  return {
    band: finalBand,
    label: finalBand.label,
    color: finalBand.color,
    headline: headlines[finalBand.id] || headlines.INSUFFICIENT,
    nextSteps: nextSteps[finalBand.id] || nextSteps.INSUFFICIENT,
    override,
    overrideMessage: override ? `Composite score of ${composite?.tot} reflects category averages; however, a ${findingsBand.label.toLowerCase()} finding requires prioritized attention regardless.` : null,
  }
}

export const ASSESSMENT_MODES = {
  SCREENING: {
    id: 'SCREENING',
    produces: 'SCREENING_SNAPSHOT',
    requiresInstruments: false,
    emitsComposite: false,
    reportHeader: 'IAQ SCREENING SNAPSHOT',
    disclaimer: 'SCREENING ONLY — NOT A COMPLIANCE ASSESSMENT',
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
