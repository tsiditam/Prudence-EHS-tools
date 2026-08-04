/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold screening engine — orchestrator.
 *
 * `assessMold(input)` projects a normalized mold assessment (zones, water
 * events, moisture readings, growth observations, spore-trap results) into a
 * deterministic, version-stamped SCREENING result: S520 water Categories,
 * suggested Conditions, comparative spore screening, and categorical findings.
 *
 * Design invariants (mirrors the Knowledge Graph builder's discipline):
 *   • PURE + deterministic — same input → identical output, sorted, no clocks.
 *   • Screening-only — no health verdict; every finding carries screeningOnly +
 *     requiresProfessionalReview and the standing disclaimer rides on the result.
 *   • Defensive — any non-array input degrades to empty; it never throws.
 *   • Parallel — imports NOTHING from the sacred IAQ engine; its own version.
 */

import { MOLD_ENGINE_VERSION } from '../../version.js'
import {
  MOLD_SCREENING_DISCLAIMER, NO_HEALTH_LIMIT_NOTE, MOLD_SOURCES,
} from '../../constants/moldStandards.js'
import { classifyWaterCategory } from './waterCategory.js'
import { classifyCondition } from './remediationCondition.js'
import { evaluateMoisture } from './moistureIndicators.js'
import { screenSpores } from './sporeScreening.js'

const arr = (v) => (Array.isArray(v) ? v : [])

// Stable category ordering for finding sort (most-material first).
const CATEGORY_ORDER = { visible_growth: 0, water_damage: 1, spore_screening: 2, moisture: 3, hvac: 4 }

function finding(id, zoneId, category, severity, summary, evidence, standardRefs) {
  return {
    id, zoneId, category, severity, summary,
    evidence: evidence.filter(Boolean),
    standardRefs: [...new Set(standardRefs.filter(Boolean))],
    screeningOnly: true,
    requiresProfessionalReview: true,
  }
}

/**
 * @param {import('../../types/mold').MoldAssessmentInput} input
 * @returns {import('../../types/mold').MoldScreeningResult}
 */
export function assessMold(input) {
  const zones = arr(input?.zones)
  const waterEvents = arr(input?.waterEvents)
  const moisture = arr(input?.moisture)
  const growth = arr(input?.growth)
  const spores = arr(input?.spores)
  const hvacInvolved = input?.hvacInvolved === true

  const zoneIds = zones.map((z) => String(z?.id)).filter(Boolean)

  const findings = []
  const limitations = []
  const standards = new Set([MOLD_SOURCES.iom, MOLD_SOURCES.acmt])

  // ── Water categories ──────────────────────────────────────────────────────
  const waterCategories = []
  waterEvents.forEach((ev, i) => {
    const zoneId = String(ev?.zoneId || '')
    const cls = classifyWaterCategory(ev?.source, { prolonged: ev?.prolonged })
    if (!cls) {
      limitations.push(`Water source "${String(ev?.source || '').trim() || '(unspecified)'}" could not be auto-classified to an IICRC S520 Category; professional classification required.`)
      return
    }
    standards.add(cls.source)
    waterCategories.push({
      zoneId, categoryId: cls.categoryId, label: cls.label,
      definition: cls.definition, mayEscalate: cls.mayEscalate, source: cls.source,
    })
    const evidence = [`Source: ${String(ev?.source || '').trim()}`, cls.label]
    if (cls.escalationFlag) evidence.push(cls.escalationNote)
    findings.push(finding(
      `mold-water_damage-${zoneId}-${i}`, zoneId, 'water_damage',
      cls.categoryId === 3 ? 'elevated_indicator' : 'screening_indicator',
      `IICRC S520 ${cls.label}`, evidence, [cls.source],
    ))
  })

  // ── Moisture (per reading) ────────────────────────────────────────────────
  const elevatedByZone = new Set()
  moisture.forEach((r, i) => {
    const zoneId = String(r?.zoneId || '')
    const m = evaluateMoisture(r)
    if (m.source) standards.add(m.source)
    if (!m.elevated) return
    elevatedByZone.add(zoneId)
    const where = r?.location ? ` (${r.location})` : ''
    findings.push(finding(
      `mold-moisture-${zoneId}-${i}`, zoneId, 'moisture', 'screening_indicator',
      `Elevated moisture in ${m.material}${where}`,
      [`Reading ${m.value}${m.unit ? ` ${m.unit}` : ''} at/above screening reference ${m.threshold}${m.unit ? ` ${m.unit}` : ''}`, m.note],
      [m.source],
    ))
  })

  // ── Growth observations (per zone) + odor ─────────────────────────────────
  const growthByZone = new Map()
  growth.forEach((g) => {
    const zoneId = String(g?.zoneId || '')
    const cur = growthByZone.get(zoneId) || { visibleGrowth: false, hiddenSuspected: false, mustyOdor: false, areaSqFt: null }
    cur.visibleGrowth = cur.visibleGrowth || g?.visibleGrowth === true
    cur.hiddenSuspected = cur.hiddenSuspected || g?.hiddenSuspected === true
    cur.mustyOdor = cur.mustyOdor || g?.mustyOdor === true
    if (Number.isFinite(g?.areaSqFt)) cur.areaSqFt = Math.max(cur.areaSqFt || 0, Number(g.areaSqFt))
    growthByZone.set(zoneId, cur)
  })
  for (const [zoneId, g] of growthByZone) {
    if (!g.visibleGrowth && !g.hiddenSuspected) continue
    standards.add(MOLD_SOURCES.s520)
    const area = g.areaSqFt != null ? ` (~${g.areaSqFt} ft²)` : ''
    findings.push(finding(
      `mold-visible_growth-${zoneId}`, zoneId, 'visible_growth',
      g.visibleGrowth ? 'elevated_indicator' : 'screening_indicator',
      g.visibleGrowth ? `Visible mold growth observed${area}` : 'Hidden mold growth suspected',
      [g.visibleGrowth ? 'Visible growth' : null, g.hiddenSuspected ? 'Hidden growth suspected' : null, g.mustyOdor ? 'Musty odor reported' : null],
      [MOLD_SOURCES.s520],
    ))
  }

  // ── Spore screening (per zone, indoor vs outdoor) ─────────────────────────
  const sporeOutcomeByZone = new Map()
  const sporeZones = [...new Set(spores.map((s) => String(s?.zoneId || '')).filter(Boolean))].sort()
  const sporeScreening = []
  for (const zoneId of sporeZones) {
    const indoor = spores.filter((s) => String(s?.zoneId) === zoneId && s?.location === 'indoor')
    const outdoor = spores.filter((s) => String(s?.zoneId) === zoneId && s?.location === 'outdoor')
    const res = screenSpores(indoor, outdoor)
    standards.add(res.source)
    sporeOutcomeByZone.set(zoneId, res.outcome)
    sporeScreening.push({ zoneId, ...res })

    if (res.outcome === 'possible-amplification-indicator') {
      findings.push(finding(
        `mold-spore_screening-${zoneId}`, zoneId, 'spore_screening', 'screening_indicator',
        'Comparative spore screening indicates possible indoor amplification',
        [
          res.indicatorGeneraIndoors.length ? `Water-damage-associated genera indoors: ${res.indicatorGeneraIndoors.join(', ')}` : null,
          res.indoorExceedsOutdoor.length ? `Indoor exceeds outdoor for: ${res.indoorExceedsOutdoor.join(', ')}` : null,
          NO_HEALTH_LIMIT_NOTE,
        ],
        [res.source],
      ))
    } else if (res.outcome === 'consistent-with-normal-ecology') {
      findings.push(finding(
        `mold-spore_screening-${zoneId}`, zoneId, 'spore_screening', 'observation',
        'Comparative spore screening consistent with a normal fungal ecology',
        [NO_HEALTH_LIMIT_NOTE], [res.source],
      ))
    } else {
      limitations.push(`Zone ${zoneId}: indoor spore sampling without a paired outdoor reference cannot be screened comparatively.`)
    }
  }

  // ── HVAC pathway ──────────────────────────────────────────────────────────
  if (hvacInvolved) {
    standards.add(MOLD_SOURCES.epaMold)
    findings.push(finding(
      'mold-hvac-system', 'system', 'hvac', 'screening_indicator',
      'HVAC implicated in the moisture / growth pathway',
      ['HVAC system flagged as a moisture source or distribution pathway; inspect coils, drain pans, and duct interiors.'],
      [MOLD_SOURCES.epaMold],
    ))
  }

  // ── Suggested Conditions (per zone) ───────────────────────────────────────
  const conditions = []
  const conditionZones = [...new Set([...zoneIds, ...growthByZone.keys(), ...sporeZones, ...elevatedByZone])].filter(Boolean).sort()
  for (const zoneId of conditionZones) {
    const g = growthByZone.get(zoneId) || {}
    const cond = classifyCondition({
      visibleGrowth: g.visibleGrowth,
      hiddenSuspected: g.hiddenSuspected,
      mustyOdor: g.mustyOdor,
      moistureElevated: elevatedByZone.has(zoneId),
      sporeOutcome: sporeOutcomeByZone.get(zoneId) || null,
    })
    standards.add(cond.source)
    conditions.push({ zoneId, ...cond })
  }

  // ── Limitations that always apply ─────────────────────────────────────────
  if (growthByZone.size && !spores.length) {
    limitations.push('No spore-trap sampling performed; findings rest on visual and moisture screening only.')
  }
  limitations.push(NO_HEALTH_LIMIT_NOTE)

  findings.sort((a, b) =>
    a.zoneId.localeCompare(b.zoneId) ||
    (CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]) ||
    a.id.localeCompare(b.id))

  return {
    version: MOLD_ENGINE_VERSION,
    waterCategories: waterCategories.sort((a, b) => a.zoneId.localeCompare(b.zoneId) || a.categoryId - b.categoryId),
    conditions,
    sporeScreening,
    findings,
    limitations: [...new Set(limitations)],
    standardsCited: [...standards].sort(),
    disclaimer: MOLD_SCREENING_DISCLAIMER,
  }
}

export { classifyWaterCategory, classifyCondition, evaluateMoisture, screenSpores }
