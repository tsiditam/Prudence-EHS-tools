/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Applied references — ONE standard per parameter, the way the Indoor
 * Environmental Monitoring Report has always done it.
 *
 * ── The problem this replaces ──────────────────────────────────────────
 * The consultant report printed a benchmark table listing every criterion
 * the platform knows — seven for carbon monoxide alone, from a NIOSH
 * ceiling of 200 ppm down to a WHO 24-hour guideline of 6 ppm. A reader
 * looking for "what was this measured against" had to work it out. Logger
 * Studio never had that problem: the assessor picks one reference per
 * parameter and that single choice drives the chart line, the summary, the
 * statement, and the reference table (`src/utils/referenceProfiles.js`).
 *
 * ── Why this is not just "use the Logger Studio default" ───────────────
 * Because the two would disagree, in the same way Results and Zone Findings
 * used to disagree about 72 °F. Two examples, both live:
 *
 *   • Logger Studio's temperature default resolves the ASHRAE 55 ACCEPTABLE
 *     range (67–82 °F). `scoreEnv` also flags against the tighter seasonal
 *     OPTIMAL band (73–79 °F in summer). Print 67–82 next to a finding on a
 *     72 °F reading and the table contradicts the finding.
 *   • Logger Studio's CO default is the EPA 8-hour NAAQS, 9 ppm. The engine's
 *     ladder reaches down to the WHO 24-hour indoor guideline at 6 ppm. A
 *     7 ppm reading produces a finding while a fixed 9 ppm reference says
 *     the reading is under the bar.
 *
 * ── The rule ───────────────────────────────────────────────────────────
 * Cite the criterion the conclusion actually rests on:
 *
 *   flagged      → the criterion behind the most severe finding, taken from
 *                  the engine's own output (parameter-verdicts.ts)
 *   not flagged  → the parameter's default reference profile — the yardstick
 *                  it was compared against and cleared
 *
 * Contradiction-free by construction. When nothing fired, the reading
 * cleared every criterion including the default, so "within" is true of
 * both. When something fired, the report cites the thing it exceeded.
 *
 * This changes what the report CITES, never what the engine concludes: the
 * ladder still evaluates in full, and this module only reports which rung
 * governed.
 */

import { allCriteria } from '../../constants/criteria'
import { resolveReference, defaultProfileId, parametersWithProfiles } from '../../utils/referenceProfiles'
import { deriveParameterVerdicts } from '../../engine/report/parameter-verdicts'
import {
  CLASS_PRESENTATION, RECOMMENDED_PRESENTATION, BAND_PRESENTATION, isRecommendedNotEnforceable,
} from './canonical-content'

// Report-facing parameter order and display names. Ventilation first, then
// contaminants, then the comfort parameters — the order the Results section
// already uses, so a reader reads the same sequence twice.
const PARAMETERS = [
  ['co2', 'Carbon dioxide (CO₂)', 'co2'],
  ['co', 'Carbon monoxide (CO)', 'co'],
  ['hcho', 'Formaldehyde (HCHO)', 'hcho'],
  ['tvoc', 'Total VOCs', 'tvoc'],
  ['pm25', 'PM2.5', 'pm25'],
  ['pm10', 'PM10', 'pm10'],
  // referenceProfiles keys the comfort parameters 'temp'/'rh'; the engine
  // and the range set key temperature as 'temperature'.
  ['temperature', 'Temperature', 'temp'],
  ['rh', 'Relative humidity', 'rh'],
]

// Intake fields that mean "this parameter was measured".
const INTAKE_FIELD = {
  co2: 'co2', co: 'co', hcho: 'hc', tvoc: 'tv',
  pm25: 'pm', pm10: 'pm10', temperature: 'tf', rh: 'rh',
}

const OUTDOOR_FIELD = { co2: 'co2o', pm25: 'pmo', tvoc: 'tvo' }

// The unit each parameter is CAPTURED in (src/constants/questions.js). This
// is not cosmetic: resolveReference projects a published value into the unit
// it is given, so omitting it is not "no unit" but a silent conversion —
// TVOC's 500 µg/m³ came back as 218 (ppb, via isobutylene molecular weight)
// and formaldehyde's ppm value would follow the same path. The report reads
// these fields in the units below, so that is what must be asked for.
const REPORT_UNIT = {
  co2: 'ppm', co: 'ppm', hcho: 'ppm',
  tvoc: 'ug/m3', pm25: 'ug/m3', pm10: 'ug/m3',
  temperature: '\u00b0F', rh: '%',
}

// How the unit is PRINTED, once the value is resolved in it.
const DISPLAY_UNIT = {
  co2: 'ppm', co: 'ppm', hcho: 'ppm',
  tvoc: '\u00b5g/m\u00b3', pm25: '\u00b5g/m\u00b3', pm10: '\u00b5g/m\u00b3',
  temperature: '\u00b0F', rh: '%',
}

const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : String(n))

/**
 * Profile labels carry their value in a trailing parenthetical — useful in a
 * dropdown, redundant beside a Value column ("Mølhave advisory (500 µg/m³)"
 * next to "500 µg/m³"). Strip it only when it is a bare value, never when it
 * carries qualifying words like "(summer)" or "(chronic)".
 */
const VALUE_PARENTHETICAL = /\s*\((?:[\d,.]+(?:\s*[–-]\s*[\d,.]+)?)\s*[^)]{0,12}\)\s*$/
const trimValueSuffix = (label) => String(label || '').replace(VALUE_PARENTHETICAL, '').trim() || String(label || '')

function criterionById(id) {
  return allCriteria().find((c) => c.id === id) || null
}

/**
 * Benchmark type + purpose for a criterion, resolved from its CLASS — the
 * same mapping the full benchmark table uses, so the two can never label the
 * same criterion differently. The distinction is load-bearing: the report's
 * closing note explains that occupational exposure limits are enforceable
 * while guidelines and indicators are not, and a table without the column
 * would leave that note explaining a taxonomy it no longer shows.
 */
function presentationFor(criterion) {
  let [type, purpose] = CLASS_PRESENTATION[criterion.class] || ['Indicator', 'Investigative indicator']
  if (isRecommendedNotEnforceable(criterion.source) && type === 'Occupational exposure limit') {
    ;[type, purpose] = RECOMMENDED_PRESENTATION
  }
  return { type, purpose }
}

function measured(zones, field) {
  for (const z of zones || []) {
    if (!z || typeof z !== 'object') continue
    const v = z[field]
    if (v !== undefined && v !== null && String(v).trim() !== '') return true
  }
  return false
}

function firstNumber(zones, field) {
  for (const z of zones || []) {
    if (!z || typeof z !== 'object') continue
    const n = parseFloat(String(z[field]))
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/**
 * The single reference each measured parameter was evaluated against.
 *
 * @param {Array<object>} zones       raw zone intake
 * @param {Array<object>} zoneScores  the engine's per-zone scores
 * @param {object} [opts]
 * @param {string|number} [opts.assessmentDate] governs the seasonal comfort band
 * @returns {Array<{param,label,reference,value,type,source,note,basis}>}
 *   `basis` is 'applied' when a finding rests on it, 'compared' when the
 *   reading cleared it. Empty when nothing was measured.
 */
export function deriveAppliedReferences(zones, zoneScores, opts = {}) {
  const verdicts = deriveParameterVerdicts(zoneScores, zones)
  const profileParams = new Set(parametersWithProfiles())
  const ts = opts.assessmentDate ? Date.parse(String(opts.assessmentDate)) : undefined
  const rows = []

  for (const [param, label, profileKey] of PARAMETERS) {
    if (!measured(zones, INTAKE_FIELD[param])) continue
    const governing = verdicts[param] && verdicts[param].governing

    // ── Flagged: cite what the finding rests on ──────────────────────
    if (governing) {
      if (governing.cid) {
        const c = criterionById(governing.cid)
        if (c) {
          const period = c.averagingLabel && c.averagingLabel !== 'instantaneous' ? `, ${c.averagingLabel}` : ''
          const { type } = presentationFor(c)
          rows.push({
            param, label,
            reference: trimValueSuffix(c.label),
            value: `${fmt(c.resolve())} ${c.unit}${period}`,
            type,
            source: c.source,
            note: c.action || null,
            basis: 'applied',
          })
          continue
        }
      }
      if (governing.band) {
        rows.push({
          param, label,
          reference: trimValueSuffix(governing.bandLabel) || 'Applied band',
          value: `${fmt(governing.band[0])}–${fmt(governing.band[1])} ${governing.bandUnit || ''}`.trim(),
          type: (BAND_PRESENTATION[param] || ['Indicator'])[0],
          source: governing.source || '',
          note: null,
          basis: 'applied',
        })
        continue
      }
    }

    // ── Cleared: cite the yardstick it was compared against ───────────
    if (!profileParams.has(profileKey)) continue
    const ctx = { ts, unit: REPORT_UNIT[param] || '' }
    const outdoorField = OUTDOOR_FIELD[param]
    if (outdoorField) {
      const baseline = firstNumber(zones, outdoorField)
      if (baseline !== undefined) ctx.outdoorBaseline = baseline
    }
    const resolved = resolveReference(profileKey, defaultProfileId(profileKey), ctx)
    if (!resolved || resolved.unavailable) continue
    const unit = DISPLAY_UNIT[param] || resolved.unit || ''
    const value = resolved.band
      ? `${fmt(resolved.band[0])}–${fmt(resolved.band[1])} ${unit}`.trim()
      : Number.isFinite(resolved.limit)
        ? `${fmt(resolved.limit)} ${unit}`.trim()
        : ''
    if (!value) continue
    // The profile carries its registry criterion id, so the type resolves
    // exactly rather than by matching the citation string.
    const linked = resolved.criterionId ? criterionById(resolved.criterionId) : null
    const type = linked
      ? presentationFor(linked).type
      : (BAND_PRESENTATION[param] || ['Indicator'])[0]
    rows.push({
      param, label,
      reference: trimValueSuffix(resolved.label),
      value,
      type,
      source: resolved.source || '',
      note: resolved.note || null,
      basis: 'compared',
    })
  }

  return rows
}
