/**
 * AtmosFlow Sufficiency Engine — v3.0
 *
 * Every category declares required inputs. Sufficiency is computed
 * BEFORE the category is assessed. Fail closed: missing data →
 * INSUFFICIENT.
 *
 * Sufficiency is about DATA COMPLETENESS — how much of what a category
 * needs was actually recorded. It survived the removal of the 100-point
 * score intact, minus the points: `maxPoints`, `maxAwardable` and the
 * "Score capped" reason went with the arithmetic they served. What a
 * category still reports is what is present, what is missing, and
 * whether that is enough to assess it.
 */

const CATEGORY_REQUIREMENTS = {
  Ventilation: {
    required: { co2: 'CO₂ reading', cfm_person: 'OA cfm/person or damper status' },
    optional: { ach: 'Air changes per hour', sa: 'Supply airflow' },
    minSufficiencyForScoring: 0.5,
    altRequired: { od: 'OA damper status' },
  },
  Contaminants: {
    required: { pm: 'PM2.5 reading', co: 'CO reading' },
    optional: { tv: 'TVOC reading', hc: 'Formaldehyde reading', vd: 'Visible dust' },
    minSufficiencyForScoring: 0.5,
  },
  HVAC: {
    required: {},
    optional: { hm: 'Last HVAC maintenance', fc: 'Filter condition' },
    minSufficiencyForScoring: 0,
  },
  Complaints: {
    required: { cx: 'Complaint status' },
    optional: { ac: 'Affected occupant count', sr: 'Symptom resolution pattern', cc: 'Clustering', sy: 'Symptom list' },
    minSufficiencyForScoring: 1.0,
    skipOptionalWhen: { cx: ['No complaints'] },
  },
  Environment: {
    required: { tf: 'Temperature', rh: 'Relative humidity' },
    optional: {},
    minSufficiencyForScoring: 1.0,
  },
}

function hasValue(data, key) {
  const v = data[key]
  if (v === undefined || v === null || v === '') return false
  if (typeof v === 'string' && v.trim() === '') return false
  return true
}

export function evaluateCategorySufficiency(categoryName, zoneData) {
  const spec = CATEGORY_REQUIREMENTS[categoryName]
  if (!spec) return { sufficiency: 1, present: [], missing: [], isInsufficient: false }

  const reqKeys = Object.keys(spec.required)
  const altKeys = Object.keys(spec.altRequired || {})
  const present = []
  const missing = []

  // Skip optional fields when condition is met (e.g., no complaints → don't penalize for missing symptom details)
  let skipOptionals = false
  if (spec.skipOptionalWhen) {
    for (const [field, values] of Object.entries(spec.skipOptionalWhen)) {
      const v = zoneData[field] || ''
      if (!v || values.some(val => v === val || v.includes(val))) skipOptionals = true
    }
  }

  const optKeys = skipOptionals ? [] : Object.keys(spec.optional || {})

  let reqMet = 0
  for (const k of reqKeys) {
    if (hasValue(zoneData, k)) { reqMet++; present.push(spec.required[k]) }
    else {
      const altSatisfied = altKeys.some(ak => hasValue(zoneData, ak))
      if (altSatisfied) { reqMet++; present.push(spec.required[k] + ' (alt)') }
      else { missing.push(spec.required[k]) }
    }
  }

  let optMet = 0
  const unmetOptional = []
  for (const k of optKeys) {
    if (hasValue(zoneData, k)) { optMet++; present.push(spec.optional[k]) }
    else { unmetOptional.push(spec.optional[k]) }
  }

  const totalFields = reqKeys.length + optKeys.length
  const metFields = reqMet + optMet
  const sufficiency = totalFields > 0 ? metFields / totalFields : 1
  const reqSufficiency = reqKeys.length > 0 ? reqMet / reqKeys.length : 1
  const isInsufficient = reqSufficiency < spec.minSufficiencyForScoring

  // Which optional inputs were not captured. This used to be phrased as
  // "Score capped: …" because the missing inputs capped the category's
  // points. There are no points; what is left is the fact itself, which
  // is what a reader needed either way.
  const capReason = (!isInsufficient && sufficiency < 1 && unmetOptional.length)
    ? `Optional inputs not captured: ${unmetOptional.join(', ')}`
    : null

  return {
    sufficiency,
    reqSufficiency,
    present,
    missing,
    unmetOptional,
    isInsufficient,
    reason: isInsufficient ? `Missing required inputs: ${missing.join(', ')}` : null,
    capReason,
  }
}

/**
 * `_overall` is the mean data completeness across categories, and it
 * drives the assessment's confidence label.
 *
 * It used to be weighted by each category's max points (25/25/20/15/15).
 * With the points gone the weighting has nothing to express — and it was
 * never obvious why an incomplete Ventilation record should count more
 * toward CONFIDENCE than an incomplete Environment one. Completeness is
 * completeness. The mean is now unweighted, which shifts `_overall` by a
 * few percent either way on a mixed record; `getConfidenceLevel` bands
 * at 0.85 / 0.6 / 0.3, so a borderline assessment can move one band.
 */
export function evaluateAllSufficiency(zoneData) {
  const results = {}
  const cats = Object.keys(CATEGORY_REQUIREMENTS)
  let sum = 0
  for (const cat of cats) {
    results[cat] = evaluateCategorySufficiency(cat, zoneData)
    sum += results[cat].sufficiency
  }
  results._overall = cats.length > 0 ? sum / cats.length : 0
  return results
}

export { CATEGORY_REQUIREMENTS }
