/**
 * AtmosFlow — assessment modes and data-confidence levels.
 *
 * This file was "Risk Bands — Single Source of Truth" through v2.9. The
 * bands went with the 100-point score; see the note below.
 */

// RISK_BANDS, getRiskBand, INSUFFICIENT_BAND, SEVERITY_TO_BAND and
// findingsToBand lived here, under a header claiming this file was the
// "Single Source of Truth — no string literals for risk labels anywhere
// else in the codebase". It was not: six band ladders existed, with
// four different sets of thresholds, and they disagreed. All of them are
// gone with the score.
//
// What is left is data CONFIDENCE, which was never a band over a score:
// it is a statement about how complete the record is.

export const ASSESSMENT_MODES = {
  SCREENING: {
    id: 'SCREENING',
    produces: 'SCREENING_SNAPSHOT',
    requiresInstruments: false,
    reportHeader: 'IAQ ASSESSMENT SNAPSHOT',
    disclaimer: 'NOT A COMPLIANCE ASSESSMENT',
  },
  WALKTHROUGH: {
    id: 'WALKTHROUGH',
    produces: 'WALKTHROUGH_REPORT',
    requiresInstruments: true,
    reportHeader: 'IAQ WALKTHROUGH REPORT',
    disclaimer: null,
  },
  FULL_ASSESSMENT: {
    id: 'FULL_ASSESSMENT',
    produces: 'IAQ_ASSESSMENT_REPORT',
    requiresInstruments: true,
    requiresCalibration: true,
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
