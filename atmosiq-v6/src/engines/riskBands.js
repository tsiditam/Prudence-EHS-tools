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

/**
 * Data confidence, from how complete the record is.
 *
 * ── Why this is not the composite in another costume ───────────────────
 * It is a ladder over a number, so it deserves the question. The
 * difference is what the number MEANS. The composite mixed severity
 * deductions, category weights, a normalization against whatever was
 * captured, and a worst-zone override, and no one could say in a
 * sentence what 68/100 was. `sufficiency` is a plain completeness
 * fraction: the share of the inputs a category expects that were
 * actually recorded. You can show your work on it by listing the
 * missing fields — `evaluateCategorySufficiency` already returns
 * `present` and `missing` — and it says nothing whatever about the
 * building. It rates the RECORD, not the site.
 *
 * It WAS coupled to the score, and that coupling is gone: `_overall`
 * used to be weighted by each category's max points (25/25/20/15/15),
 * so confidence silently inherited the scoring weight vector. Engine
 * v3.0 made it an unweighted mean — see the note on
 * `evaluateAllSufficiency` in sufficiency.js.
 *
 * ── One ladder, in one place ───────────────────────────────────────────
 * A `CONFIDENCE_LEVELS` constant sat above this function carrying the
 * same four thresholds as `{ label, min }` pairs. Nothing in the
 * repository ever read it, while the function hardcoded its own copy —
 * so editing the constant to move a boundary would have changed
 * nothing. That is the six-inconsistent-ladders failure in miniature,
 * in the file whose old header claimed to be their single source of
 * truth. The thresholds now exist once, here.
 */
const CONFIDENCE_BANDS = [
  [0.85, 'High'],
  [0.6, 'Medium'],
  [0.3, 'Low'],
]

/**
 * @param {number} sufficiency Mean completeness across categories, 0-1.
 *   Named `weightedSufficiency` until v3.0 removed the weighting.
 */
export function getConfidenceLevel(sufficiency) {
  for (const [min, label] of CONFIDENCE_BANDS) {
    if (sufficiency >= min) return label
  }
  return 'Insufficient'
}
