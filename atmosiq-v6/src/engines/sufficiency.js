/**
 * AtmosFlow Sufficiency Engine — v2.3
 * Every category declares required inputs. Sufficiency is computed
 * BEFORE scoring, not after. Fail closed: missing data → INSUFFICIENT.
 */

const CATEGORY_REQUIREMENTS = {
  Ventilation: {
    maxPoints: 25,
    required: { co2: 'CO₂ reading', cfm_person: 'OA cfm/person or damper status' },
    optional: { ach: 'Air changes per hour', bld_pressure: 'Building pressure', sa: 'Supply airflow' },
    minSufficiencyForScoring: 0.5,
    altRequired: { od: 'OA damper status' },
  },
  Contaminants: {
    maxPoints: 25,
    required: { pm: 'PM2.5 reading', co: 'CO reading' },
    optional: { tv: 'TVOC reading', hc: 'Formaldehyde reading', mi: 'Mold indicators', od_smell: 'Odor assessment', vd: 'Visible dust' },
    minSufficiencyForScoring: 0.5,
  },
  HVAC: {
    maxPoints: 20,
    required: { hm: 'Last HVAC maintenance' },
    optional: { fc: 'Filter condition', sa: 'Supply airflow', dp: 'Drain pan condition', fm: 'Filter type', od: 'Damper status' },
    minSufficiencyForScoring: 1.0,
  },
  Complaints: {
    maxPoints: 15,
    required: { cx: 'Complaint status' },
    optional: { ac: 'Affected occupant count', sr: 'Symptom resolution pattern', cc: 'Clustering', sy: 'Symptom list' },
    minSufficiencyForScoring: 1.0,
    skipOptionalWhen: { cx: ['No complaints'] },
  },
  Environment: {
    maxPoints: 15,
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
  for (const k of optKeys) {
    if (hasValue(zoneData, k)) { optMet++; present.push(spec.optional[k]) }
  }

  const totalFields = reqKeys.length + optKeys.length
  const metFields = reqMet + optMet
  const sufficiency = totalFields > 0 ? metFields / totalFields : 1
  const reqSufficiency = reqKeys.length > 0 ? reqMet / reqKeys.length : 1
  const isInsufficient = reqSufficiency < spec.minSufficiencyForScoring

  return {
    sufficiency,
    reqSufficiency,
    present,
    missing,
    isInsufficient,
    maxAwardable: isInsufficient ? 0 : Math.round(sufficiency * spec.maxPoints),
    reason: isInsufficient ? `Missing required inputs: ${missing.join(', ')}` : null,
  }
}

export function evaluateAllSufficiency(zoneData) {
  const results = {}
  let totalWeight = 0, weightedSum = 0
  for (const cat of Object.keys(CATEGORY_REQUIREMENTS)) {
    const spec = CATEGORY_REQUIREMENTS[cat]
    results[cat] = evaluateCategorySufficiency(cat, zoneData)
    totalWeight += spec.maxPoints
    weightedSum += results[cat].sufficiency * spec.maxPoints
  }
  results._overall = totalWeight > 0 ? weightedSum / totalWeight : 0
  return results
}

export function getMaxAwardable(categoryName, zoneData) {
  const s = evaluateCategorySufficiency(categoryName, zoneData)
  return s.isInsufficient ? null : s.maxAwardable
}

export { CATEGORY_REQUIREMENTS }
