/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * samplePoints — the locations an assessment says were sampled, derived once.
 *
 * A pin on the floor plan is a SAMPLE LOCATION. It is not a verdict, and it
 * carries no severity. Until 2026-09 all three floor-plan surfaces coloured
 * each pin by the worst finding severity in the zone and printed the zone's
 * finding count inside it, which made a site drawing into a fourth statement
 * of a conclusion the hero card, the findings table and the pathway tab had
 * already made. It also meant the number on a pin could not be the key that
 * resolves to the table beneath, because it was already a census.
 *
 * What replaced it: a sequence number, a neutral marker, and a table naming
 * the location and the parameters recorded there. Colour carries no meaning,
 * so identity never rests on it — which is also what keeps the figure legible
 * in grayscale print and to a colour-blind reader.
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

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== ''

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
    values.push({ label: short, value: String(src[f.id]).trim(), unit: f.u || '' })
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
 * @param zones            assessment zones; those with mapX/mapY are placed
 * @param opts.building    building object; `outdoorMapX` / `outdoorMapY`
 * @param opts.zoneName    (index) => display name; defaults to the zone's own
 * @returns Array<{n, kind, zoneIndex, label, use, x, y, position, readings,
 *                 readingText, values, time, duration}>
 */
export function samplePoints(zones = [], opts = {}) {
  const nameOf = opts.zoneName || ((i) => (zones[i] && zones[i].zn) || `Zone ${i + 1}`)
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
    const { names, values } = readingsOf(z, INDOOR_FIELDS)
    push({
      kind: 'zone', zoneIndex: i,
      label: nameOf(i), use: (z.zt || z.zuse || ''),
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
  if (oxy && osrc) {
    const { names, values } = readingsOf(osrc, OUTDOOR_FIELDS)
    if (names.length) {
      push({
        kind: 'outdoor', zoneIndex: null,
        label: OUTDOOR_LABEL, use: 'Outdoor baseline',
        x: oxy.x, y: oxy.y,
        readings: names, values,
        time: '', duration: '',
      })
    }
  }

  return points
}

/** True when an outdoor baseline exists to be placed on the plan. */
export function hasOutdoorBaseline(zones = []) {
  const src = outdoorSource(zones)
  return !!src && readingsOf(src, OUTDOOR_FIELDS).names.length > 0
}
