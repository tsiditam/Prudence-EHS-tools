/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * assessmentBasis — what the assessment actually rests on.
 *
 * The results header used to carry a hardcoded tile reading
 * "Assessment type: Screening (Non-compliance)". Two problems with it.
 *
 * It was the banned label. CLAUDE.md names "screening" as a label, chip or
 * repeated caveat specifically, and it was stripped platform-wide in
 * 2026-08: the boundary lives in the limitation statement ("not a
 * regulatory, compliance or medical determination"), not in a badge on
 * every screen. A chip that says "(Non-compliance)" is that caveat wearing
 * a different hat.
 *
 * And it was hardcoded, so it said the same thing whether the assessor had
 * taken four spot readings or had run a two-week logger deployment and
 * imported laboratory results. The one genuinely useful fact a reader wants
 * from that corner of the screen — how much evidence is behind this — was
 * the fact it did not carry.
 *
 * So it states the basis instead. A fact about the evidence, not a
 * disclaimer, and it changes when the evidence does.
 */

/**
 * True when a logger deployment contributed data the report would render.
 * Mirrors the test `buildSensorGraphsAppendix` applies: a graph counts only
 * once it is marked for inclusion.
 */
function hasContinuousMonitoring(sensorData) {
  if (!sensorData || !sensorData.graphs) return false
  return Object.values(sensorData.graphs).some((g) => g && g.include)
}

/**
 * True when analytical results were imported. Mirrors
 * `buildLabResultsAppendix` — a blob with no rows renders nothing, so it is
 * not part of the basis either.
 */
function hasLaboratoryResults(labResults) {
  return !!(labResults && Array.isArray(labResults.rows) && labResults.rows.length > 0)
}

/**
 * Plain-language description of what the assessment rests on.
 *
 * @param {object} [input]
 * @param {object} [input.sensorData]  Logger Studio session blob
 * @param {object} [input.labResults]  imported analytical results blob
 * @returns {string} e.g. "Walkthrough measurements",
 *   "Walkthrough + continuous monitoring",
 *   "Walkthrough + continuous monitoring + laboratory analysis"
 */
export function describeAssessmentBasis(input = {}) {
  const { sensorData, labResults } = input || {}
  const extra = []
  if (hasContinuousMonitoring(sensorData)) extra.push('continuous monitoring')
  if (hasLaboratoryResults(labResults)) extra.push('laboratory analysis')
  if (extra.length === 0) return 'Walkthrough measurements'
  return ['Walkthrough', ...extra].join(' + ')
}

export default describeAssessmentBasis
