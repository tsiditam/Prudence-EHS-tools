/**
 * AtmosFlow — Cross-Assessment Similarity
 *
 * Pure deterministic similarity scoring for the institutional-memory
 * surface (Play 2). Given the assessor's CURRENT assessment context
 * (building characteristics + trigger reason) and the list of their
 * PAST assessments, returns a ranked set of "you've seen this
 * before" matches plus an aggregated pattern summary.
 *
 * Engine-sacred: this file is pure data shaping. No scoring engine
 * touched. Lives in src/utils/.
 *
 * Why deterministic + local. The world-class version uses RAG over
 * narrative + finding embeddings (Play 2b), but the foundation is
 * structural matching: same building type, same HVAC topology, same
 * trigger reason → "what did you find last time?" That answer is
 * useful in V1 without any AI cost. Embedding-based semantic match
 * lands as a follow-up once this base is shipping.
 *
 * Feature extraction is intentionally lossy. We don't store anything
 * the assessor didn't already enter; missing fields just don't
 * contribute to the similarity score. An assessment whose presurvey
 * + building object are incomplete will simply rank lower against
 * the current context — never throw.
 */

const TYPE_W = 0.4
const HVAC_W = 0.25
const TRIGGER_W = 0.15
const YEAR_W = 0.15
const WATER_W = 0.05
const YEAR_WINDOW = 10
const SIMILARITY_THRESHOLD = 0.4

/**
 * Extract the comparable feature vector from an assessment shape.
 * Accepts the loose runtime shape (assessment.bldg or
 * assessment.building, presurvey may be top-level or nested).
 */
export function extractFeatures(assessment) {
  if (!assessment || typeof assessment !== 'object') {
    return { facilityType: null, yearBuilt: null, hvacType: null, triggerReason: null, waterHistory: null }
  }
  const bldg = assessment.building || assessment.bldg || {}
  const ps = assessment.presurvey || {}
  const yearBuilt = Number(bldg.ba)
  return {
    facilityType: typeof bldg.ft === 'string' && bldg.ft ? bldg.ft : null,
    yearBuilt: Number.isFinite(yearBuilt) && yearBuilt > 1700 && yearBuilt < 3000 ? yearBuilt : null,
    hvacType: typeof bldg.ht === 'string' && bldg.ht ? bldg.ht : null,
    triggerReason: typeof ps.ps_reason === 'string' && ps.ps_reason ? ps.ps_reason : null,
    waterHistory: typeof ps.ps_water_history === 'string' && ps.ps_water_history ? ps.ps_water_history : null,
  }
}

/**
 * Score a single (current, past) feature pair on [0, 1]. Weights
 * sum to 1.0; each weight contributes only when BOTH sides have
 * the relevant feature populated (so a sparse past assessment gets
 * a fair partial-credit score rather than zeroing out on missing
 * fields).
 */
export function scoreSimilarity(current, past) {
  if (!current || !past) return 0
  let achieved = 0
  let possible = 0

  if (current.facilityType && past.facilityType) {
    possible += TYPE_W
    if (current.facilityType === past.facilityType) achieved += TYPE_W
  }
  if (current.hvacType && past.hvacType) {
    possible += HVAC_W
    if (current.hvacType === past.hvacType) achieved += HVAC_W
  }
  if (current.triggerReason && past.triggerReason) {
    possible += TRIGGER_W
    if (current.triggerReason === past.triggerReason) achieved += TRIGGER_W
  }
  if (typeof current.yearBuilt === 'number' && typeof past.yearBuilt === 'number') {
    possible += YEAR_W
    const gap = Math.abs(current.yearBuilt - past.yearBuilt)
    if (gap <= YEAR_WINDOW) {
      // Linear partial credit: 0 gap → full, YEAR_WINDOW gap → 0
      achieved += YEAR_W * (1 - gap / YEAR_WINDOW)
    }
  }
  if (current.waterHistory && past.waterHistory) {
    possible += WATER_W
    if (current.waterHistory === past.waterHistory) achieved += WATER_W
  }

  if (possible === 0) return 0
  // Normalize to [0, 1] over the features that BOTH sides could
  // compare. Prevents a sparse past assessment from getting a 0
  // similarity just because most of its fields are missing.
  return achieved / possible
}

/**
 * Pull a short list of past-assessment highlights useful for
 * pattern summarization. Defensive against missing nested data.
 */
export function summarizePastAssessment(assessment) {
  if (!assessment || typeof assessment !== 'object') return null
  const bldg = assessment.building || assessment.bldg || {}
  const composite = assessment.comp || assessment.composite || {}
  const recs = assessment.recs || {}
  const immRaw = Array.isArray(recs.imm) ? recs.imm : []
  const immText = immRaw
    .map(r => (typeof r === 'string' ? r : (r && (r.text || r.action)) || ''))
    .filter(Boolean)
    .slice(0, 3)
  const composedAt = assessment.ts || assessment.updatedAt || null
  return {
    id: assessment.id || null,
    facilityName: bldg.fn || 'Untitled site',
    facilityType: bldg.ft || null,
    composedAt,
    score: typeof composite.tot === 'number' ? composite.tot : null,
    immediateActions: immText,
    immediateCount: immRaw.length,
    moldDetected: !!(assessment.moldResults && assessment.moldResults.detected),
  }
}

/**
 * Aggregate a list of similar past assessments into a pattern
 * summary the UI can render as advisory hints.
 */
export function aggregatePatterns(currentFeatures, similarMatches) {
  const matches = Array.isArray(similarMatches) ? similarMatches : []
  if (matches.length === 0) {
    return {
      matchCount: 0,
      averageScore: null,
      commonImmediateActions: [],
      moldRate: null,
      facilityTypeLabel: currentFeatures && currentFeatures.facilityType,
    }
  }

  const scores = matches
    .map(m => m.summary && typeof m.summary.score === 'number' ? m.summary.score : null)
    .filter(s => s !== null)
  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null

  const actionCounts = new Map()
  for (const m of matches) {
    const acts = (m.summary && m.summary.immediateActions) || []
    for (const a of acts) {
      const key = String(a).trim()
      if (!key) continue
      actionCounts.set(key, (actionCounts.get(key) || 0) + 1)
    }
  }
  const commonImmediateActions = Array.from(actionCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([action, count]) => ({ action, count }))

  const moldHits = matches.filter(m => m.summary && m.summary.moldDetected).length
  const moldRate = matches.length > 0 ? Math.round((moldHits / matches.length) * 100) : null

  return {
    matchCount: matches.length,
    averageScore,
    commonImmediateActions,
    moldRate,
    facilityTypeLabel: currentFeatures && currentFeatures.facilityType,
  }
}

/**
 * Top-level entry. Takes the current assessment context + a list of
 * past assessments and returns the ranked matches above the
 * similarity threshold plus the aggregate pattern summary.
 *
 * @param {object} currentAssessment  the in-flight assessment
 * @param {Array}  pastAssessments    the assessor's historical assessments
 * @param {object} [opts]
 * @param {number} [opts.threshold]   custom similarity cut-off (default 0.4)
 * @param {number} [opts.limit]       max matches to surface (default 5)
 * @param {string} [opts.excludeId]   exclude an assessment id (e.g., the current one)
 */
export function findSimilarAssessments(currentAssessment, pastAssessments, opts = {}) {
  const current = extractFeatures(currentAssessment)
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : SIMILARITY_THRESHOLD
  const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : 5
  const excludeId = opts.excludeId || (currentAssessment && currentAssessment.id) || null

  const past = Array.isArray(pastAssessments) ? pastAssessments : []
  const matches = []
  for (const candidate of past) {
    if (!candidate || candidate.id === excludeId) continue
    const features = extractFeatures(candidate)
    const score = scoreSimilarity(current, features)
    if (score >= threshold) {
      matches.push({ score, features, summary: summarizePastAssessment(candidate), id: candidate.id || null })
    }
  }
  matches.sort((a, b) => b.score - a.score)
  const top = matches.slice(0, limit)
  const patterns = aggregatePatterns(current, top)
  return { currentFeatures: current, matches: top, patterns }
}

export const __test = {
  TYPE_W,
  HVAC_W,
  TRIGGER_W,
  YEAR_W,
  WATER_W,
  YEAR_WINDOW,
  SIMILARITY_THRESHOLD,
}
