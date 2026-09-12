/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * samplePoints — the locations an assessment says were sampled, derived once.
 *
 * A pin on the floor plan is a SAMPLE LOCATION. It is not a verdict, and it
 * carries no severity. Until 2026-09 all three floor-plan surfaces colored
 * each pin by the worst finding severity in the zone and printed the zone's
 * finding count inside it, which made a site drawing into a fourth statement
 * of a conclusion the hero card, the findings table and the pathway tab had
 * already made. It also meant the number on a pin could not be the key that
 * resolves to the table beneath, because it was already a census.
 *
 * What replaced it: a sequence number, a neutral marker, and a table naming
 * the location and the parameters recorded there. Color carries no meaning,
 * so identity never rests on it — which is also what keeps the figure legible
 * in grayscale print and to a color-blind reader.
 *
 * One derivation, three consumers: the assessor's mapping screen
 * (components/SpatialMap.jsx), the Word report figure (report/reportModel.js
 * via utils/floorPlanFigure.js) and the HTML print path
 * (components/PrintReport.jsx). They agree because they call this.
 *
 * The OUTDOOR REFERENCE is a sample location too, and had no way to be
 * placed. Its position relative to loading docks, exhaust stacks and outdoor-
 * air intakes is what makes the indoor-versus-outdoor delta interpretable, so
 * a sampling plan that omits it is incomplete. It is site-wide rather than
 * per-zone (SENSOR_FIELDS `outdoor:1`), so its coordinates live on the
 * building object rather than on a zone.
 */

import { SENSOR_FIELDS } from '../constants/questions'
import { resolvePlanId } from './floorPlans'

/** The outdoor baseline's label wherever it is listed. */
export const OUTDOOR_LABEL = 'Outdoor reference'

/**
 * Short parameter names, matching the measurement-results table headers in
 * the report so the plan and the table name the same parameter the same way.
 * Every measured SENSOR_FIELD must appear here; `sample-points.test.ts`
 * fails if a field is added without one, so a new sensor cannot quietly go
 * unnamed on the plan.
 */
export const PARAM_SHORT = {
  co2: 'CO₂', tf: 'T', rh: 'RH', pm: 'PM2.5', co: 'CO', tv: 'TVOC', hc: 'HCHO',
  co2o: 'CO₂', tfo: 'T', rho: 'RH', pmo: 'PM2.5', tvo: 'TVOC',
}

export const INDOOR_FIELDS = SENSOR_FIELDS.filter((f) => !f.outdoor)
export const OUTDOOR_FIELDS = SENSOR_FIELDS.filter((f) => f.outdoor)

// The questionnaire keys its units in ASCII ('ug/m3') so they survive any
// keyboard; a reader gets the symbol. Every other surface that prints a mass
// concentration already writes it this way (sensorParser, sensorThresholds).
const UNIT_LABEL = { 'ug/m3': 'µg/m³' }
const unitLabel = (u) => UNIT_LABEL[u] || u || ''

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== ''

/**
 * A zone's space use, as the questionnaire records it (`su`), made readable.
 * Option ids are lowercase and some carry underscores ('data_center'), so
 * the value is spaced and sentence-cased; a free-text "Other" answer is
 * stored in the same field and passes through unchanged.
 *
 * Until 2026-09 the Use column of the measurement-results table and of the
 * pin table read `zt` / `zuse`, which nothing writes, and so printed an em
 * dash on every row of every report. The observations builder read `su`
 * correctly one function away — the field was never missing, only misnamed.
 */
export function spaceUse(z) {
  const v = z && typeof z.su === 'string' ? z.su.trim() : ''
  if (!v) return ''
  const s = v.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** `mapX` / `mapY` as a percentage pair, or null when not placed. */
function coords(mx, my) {
  if (mx == null || my == null) return null
  const x = Number(mx)
  const y = Number(my)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/** What was actually recorded at a point: short names, and values with units. */
function readingsOf(src, fields) {
  const names = []
  const values = []
  if (!src) return { names, values }
  for (const f of fields) {
    if (!filled(src[f.id])) continue
    const short = PARAM_SHORT[f.id]
    if (!short) continue
    if (!names.includes(short)) names.push(short)
    values.push({ label: short, value: String(src[f.id]).trim(), unit: unitLabel(f.u) })
  }
  return { names, values }
}

/** The zone carrying the site's outdoor baseline, which runScoring propagates. */
export function outdoorSource(zones = []) {
  return zones.find((z) => z && OUTDOOR_FIELDS.some((f) => filled(z[f.id]))) || null
}

/**
 * Every sample location placed on the floor plan, numbered in the order a
 * reader meets it: zones in assessment order, then the outdoor reference.
 *
 * Numbering runs across the whole site — zone order, then the outdoor
 * reference — whatever plan a pin is on, so "Pin 4" names one location in a
 * report with three plans. Each point says which plan it is on (`plan`),
 * and a consumer drawing one plan filters on it (`pointsOnPlan`).
 *
 * @param zones            assessment zones; those with mapX/mapY are placed
 * @param opts.building    building object; `outdoorMapX` / `outdoorMapY`
 * @param opts.zoneName    (index) => display name; defaults to the zone's own
 * @param opts.plans       the assessment's floor plans (utils/floorPlans);
 *                         a pin on a plan the list does not carry is not a
 *                         pin. Omitted: every placed pin counts, and `plan`
 *                         is whatever the pin recorded.
 * @returns Array<{n, kind, zoneIndex, label, use, plan, x, y, position,
 *                 readings, readingText, values, time, duration}>
 */
export function samplePoints(zones = [], opts = {}) {
  const nameOf = opts.zoneName || ((i) => (zones[i] && zones[i].zn) || `Zone ${i + 1}`)
  const plans = Array.isArray(opts.plans) ? opts.plans : null
  const planOf = (assigned) => (plans ? resolvePlanId(assigned, plans) : (assigned || null))
  const points = []

  const push = (p) => points.push({
    ...p,
    n: points.length + 1,
    // Percent of plan width and height from the top-left corner, as recorded.
    // Printed only when the pins could not be drawn onto the image, so the
    // placement the assessor made is still in the record.
    position: `${Math.round(p.x)}% across, ${Math.round(p.y)}% down`,
    readingText: p.readings.length ? p.readings.join(', ') : 'None recorded',
  })

  zones.forEach((z, i) => {
    const xy = coords(z && z.mapX, z && z.mapY)
    if (!xy) return
    const plan = planOf(z.mapPlan)
    if (plans && !plan) return
    const { names, values } = readingsOf(z, INDOOR_FIELDS)
    push({
      kind: 'zone', zoneIndex: i,
      label: nameOf(i), use: spaceUse(z), plan,
      x: xy.x, y: xy.y,
      readings: names, values,
      time: z.meas_time || '', duration: z.meas_duration || '',
    })
  })

  // The outdoor reference, last, and only when a baseline was actually taken.
  // A pin for readings that do not exist would point at nothing, and the
  // report's own outdoor results row is built from these same fields.
  const b = opts.building || {}
  const oxy = coords(b.outdoorMapX, b.outdoorMapY)
  const osrc = outdoorSource(zones)
  const oplan = planOf(b.outdoorMapPlan)
  if (oxy && osrc && !(plans && !oplan)) {
    const { names, values } = readingsOf(osrc, OUTDOOR_FIELDS)
    if (names.length) {
      push({
        kind: 'outdoor', zoneIndex: null,
        label: OUTDOOR_LABEL, use: 'Outdoor baseline', plan: oplan,
        x: oxy.x, y: oxy.y,
        readings: names, values,
        time: '', duration: '',
      })
    }
  }

  return points
}

/** The points on one plan, numbers intact. */
export function pointsOnPlan(points = [], planId) {
  return points.filter((p) => p && p.plan === planId)
}

/** True when an outdoor baseline exists to be placed on the plan. */
export function hasOutdoorBaseline(zones = []) {
  const src = outdoorSource(zones)
  return !!src && readingsOf(src, OUTDOOR_FIELDS).names.length > 0
}
