/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * captureRender — the report sentences and rows that read the structured
 * walkthrough records (docs/WALKTHROUGH_CAPTURE.md): the event timeline,
 * the zone role, source detail cards, the occupant interview's timing, the
 * checks performed, the airflow measurement, the logger deployment and its
 * event log, and the sampling plan.
 *
 * Every function here is pure and editorial: it restates what the record
 * says in the report's voice and decides nothing. No severity word, no
 * citation, no threshold — `modelConsistency.observationsCarryNoVerdict`
 * reads the observation lines these produce and fails the report if one
 * ever carries a verdict.
 */

import { primaryDataset, SENSOR_PARAMS } from '../utils/sensorParser'
import { timelineKindLabel, loggerEventLabel, zoneCheckLabel, tickedSources } from '../constants/captureVocab'
import { readNumber } from '../engines/scoring'

const str = (v) => (v === null || v === undefined ? '' : String(v).trim())
const has = (v) => str(v) !== '' && !/^unknown$/i.test(str(v))

/** "May 15, 2026" from an ISO date, or the raw string when it is not one. */
export function longDate(iso) {
  const s = str(iso)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return s
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/** "May 25, 2026 09:00" from a datetime-local value, or the date alone. */
export function longDateTime(v) {
  const s = str(v)
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(s)
  if (!m) return longDate(s)
  return `${longDate(m[1])} ${m[2]}`
}

const lower = (s) => str(s).toLowerCase()
// Lower-case only the leading letter, so "Particleboard / MDF furniture"
// reads "particleboard / MDF furniture" mid-sentence and an acronym keeps
// its case.
const lead = (s) => { const t = str(s); return t ? t.charAt(0).toLowerCase() + t.slice(1) : '' }

// ── Zone role ──────────────────────────────────────────────────────────

const ROLE_LABEL = {
  'Complaint / affected area': 'Affected area',
  'Comparison area (no complaint)': 'Comparison area',
  'Representative area': 'Representative area',
}

/** The short role label for a zone, or null when none was recorded. */
export function zoneRoleLabel(zone = {}) {
  return ROLE_LABEL[str(zone && zone.zone_role)] || null
}

export const isComparisonZone = (zone = {}) => str(zone && zone.zone_role) === 'Comparison area (no complaint)'

// ── Site history (section 1) ───────────────────────────────────────────

/**
 * The dated sequence the site background states, from the presurvey
 * timeline and the trigger's own capture card. Empty when nothing dated
 * was recorded; the scope paragraph then reads as it always has.
 */
export function siteHistoryParagraphs(presurvey = {}) {
  const ps = presurvey || {}
  const out = []

  // The renovation card: what went in, when the space came back, whether
  // it was flushed.
  const reno = []
  const materials = [...(Array.isArray(ps.ps_reno_materials) ? ps.ps_reno_materials : []), ...(has(ps.ps_reno_materials_other) ? [ps.ps_reno_materials_other] : [])].filter(has)
  const scope = (Array.isArray(ps.ps_reno_scope) ? ps.ps_reno_scope : []).filter(has)
  if (scope.length) reno.push(`The renovation covered ${scope.map(lead).join(', ')}`)
  if (materials.length) reno.push(`${scope.length ? 'and installed' : 'The renovation installed'} ${materials.map(lead).join(', ')}`)
  let renoSentence = reno.join(' ')
  if (renoSentence) renoSentence += '.'
  if (has(ps.ps_reno_completion)) renoSentence += ` It was completed ${lower(ps.ps_reno_completion)}.`
  if (has(ps.ps_reno_reoccupied)) renoSentence += ` The space was re-occupied on ${longDate(ps.ps_reno_reoccupied)}.`
  if (has(ps.ps_reno_flushout)) {
    const f = str(ps.ps_reno_flushout)
    renoSentence += f === 'Yes — documented' ? ' A flush-out ventilation period before re-occupancy is documented.'
      : f === 'Partial' ? ' A partial flush-out ventilation period preceded re-occupancy.'
      : f === 'No' ? ' No flush-out ventilation period preceded re-occupancy.' : ''
  }
  if (has(ps.ps_reno_containment) && !/^unknown$/i.test(str(ps.ps_reno_containment))) {
    renoSentence += ` Containment during the work: ${lower(ps.ps_reno_containment)}.`
  }
  if (renoSentence.trim()) out.push(renoSentence.trim())

  // The complaint card: when they began and when in the day they are worst.
  const cx = []
  if (has(ps.ps_complaint_timeline)) cx.push(`Complaints began ${lower(ps.ps_complaint_timeline)}`)
  if (has(ps.ps_complaint_pattern) && !/no pattern/i.test(str(ps.ps_complaint_pattern))) cx.push(`${cx.length ? 'and are' : 'Complaints are'} reported as worst in the ${lower(ps.ps_complaint_pattern).replace(/ \/ /g, ' or ')}`)
  if (cx.length) out.push(`${cx.join(' ')}.`)

  // The timeline, in date order.
  const rows = (Array.isArray(ps.ps_timeline) ? ps.ps_timeline : [])
    .filter(r => r && (has(r.date) || has(r.description) || has(r.kind)))
    .slice()
    .sort((a, b) => str(a.date).localeCompare(str(b.date)))
  if (rows.length) {
    const items = rows.map(r => {
      const when = has(r.date) ? longDate(r.date) : null
      const what = has(r.description) ? str(r.description) : timelineKindLabel(r.kind)
      const kind = has(r.description) && has(r.kind) && r.kind !== 'other' ? ` (${lower(timelineKindLabel(r.kind))})` : ''
      return `${when ? `${when} — ` : ''}${what}${kind}`
    })
    out.push(`Sequence of events as recorded: ${items.join('; ')}.`)
  }
  return out
}

// ── Zone observation lines ─────────────────────────────────────────────

/** One sentence per ticked source that carries a detail card. */
export function sourceDetailLines(zone = {}) {
  const details = zone && zone.src_detail && typeof zone.src_detail === 'object' ? zone.src_detail : {}
  const out = []
  for (const src of tickedSources(zone)) {
    const d = details[src]
    if (!d || !(has(d.what) || has(d.installedOn) || has(d.extent))) continue
    const parts = []
    if (has(d.what)) parts.push(str(d.what))
    const qual = []
    if (has(d.installedOn)) qual.push(`installed or began ${longDate(d.installedOn)}`)
    if (has(d.extent)) qual.push(lead(d.extent))
    out.push(`${src}: ${parts.join(' ')}${qual.length ? ` (${qual.join('; ')})` : ''}.`)
  }
  return out
}

/** The pathway checks made in the zone, one sentence. */
export function checksPerformedLines(zone = {}) {
  const checks = zone && zone.zone_checks && typeof zone.zone_checks === 'object' ? zone.zone_checks : {}
  const items = Object.entries(checks)
    .filter(([, c]) => c && has(c.result))
    .map(([id, c]) => `${lower(zoneCheckLabel(id))}: ${lead(c.result)}${has(c.method) ? ` (${lower(c.method)})` : ''}`)
  return items.length ? [`Checks performed: ${items.join('; ')}.`] : []
}

/** A measured supply or outdoor-air flow, as recorded. */
export function airflowLines(zone = {}) {
  const cfm = readNumber(zone && zone.oa_flow_cfm)
  if (cfm === null) return []
  const oc = readNumber(zone && zone.oc)
  const per = oc && oc > 0 ? ` (${Math.round((cfm / oc) * 10) / 10} cfm per occupant at the recorded count)` : ''
  return [`Measured supply / outdoor-air flow: ${cfm} cfm${per}.`]
}

/** Interval text for a logger: "hourly", "15-minute", or nothing. */
function intervalText(minutes) {
  const m = readNumber(minutes)
  if (m === null || m <= 0) return null
  if (m === 60) return 'hourly'
  if (m === 1440) return 'daily'
  return `${m}-minute`
}

/** The logger deployment in this zone, one sentence. */
export function loggerDeploymentLines(zone = {}) {
  const d = zone && zone.logger_deployment
  if (!d || typeof d !== 'object' || !d.placed) return []
  const parts = []
  const inst = [has(d.instrument) ? str(d.instrument) : 'A continuous logger', has(d.serial) ? `S/N ${str(d.serial)}` : null].filter(Boolean).join(', ')
  parts.push(inst)
  const where = [has(d.position) ? lower(d.position) : null, readNumber(d.height_m) !== null ? `${readNumber(d.height_m)} m` : null].filter(Boolean)
  if (where.length) parts.push(`at ${where.join(', ')}`)
  const period = [has(d.start) ? `from ${longDateTime(d.start)}` : null, has(d.end) ? `to ${longDateTime(d.end)}` : null].filter(Boolean)
  if (period.length) parts.push(period.join(' '))
  const iv = intervalText(d.interval_min)
  if (iv) parts.push(`${iv} averages`)
  return [`Continuous logger: ${parts.join(', ')}.`]
}

/** Events recorded during the logging period, as sentences. */
export function loggerEventLines(zone = {}) {
  const d = zone && zone.logger_deployment
  const events = d && Array.isArray(d.events) ? d.events : []
  const items = events
    .filter(e => e && (has(e.at) || has(e.description) || has(e.kind)))
    .slice()
    .sort((a, b) => str(a.at).localeCompare(str(b.at)))
    .map(e => `${has(e.at) ? `${longDateTime(e.at)} — ` : ''}${has(e.description) ? str(e.description) : loggerEventLabel(e.kind)}${has(e.description) && has(e.kind) && e.kind !== 'other' ? ` (${lower(loggerEventLabel(e.kind))})` : ''}`)
  return items.length ? [`Events during the logging period: ${items.join('; ')}.`] : []
}

/** The interview's timing and relief answers, as sentences. */
export function interviewLines(zone = {}) {
  const z = zone || {}
  if (z.cx !== 'Yes — complaints reported') return []
  const out = []
  if (has(z.sy_onset)) out.push(`Onset: ${lower(z.sy_onset)}.`)
  const timing = []
  if (has(z.sy_time) && !/no pattern/i.test(str(z.sy_time))) timing.push(`worst in the ${lower(z.sy_time).replace(/ \/ /g, ' or ')}`)
  if (has(z.sy_days) && !/no pattern/i.test(str(z.sy_days))) timing.push(lower(z.sy_days))
  if (timing.length) out.push(`Pattern: ${timing.join('; ')}.`)
  if (has(z.sy_where)) out.push(`Reported at: ${str(z.sy_where)}.`)
  const relief = [...(Array.isArray(z.sy_relief) ? z.sy_relief : []), ...(has(z.sy_relief_other) ? [z.sy_relief_other] : [])].filter(has)
  if (relief.length) out.push(`Relieved by: ${relief.map(lower).join(', ')}.`)
  return out
}

// ── Conceptual site model rows ─────────────────────────────────────────

/** A zone's walkthrough readings as "label value unit" pairs. */
function readingsText(zone = {}, params = []) {
  return params
    .map(p => ({ p, v: readNumber(zone[p.zoneKey]) }))
    .filter(x => x.v !== null)
    .map(x => `${x.p.label.replace(/\s*\(.*\)$/, '').replace('Total VOCs', 'TVOC')} ${x.v} ${x.p.unit}`)
    .concat(readNumber(zone.hc) !== null ? [`Formaldehyde ${readNumber(zone.hc)} ppm`] : [])
    .join(', ')
}

/**
 * The comparison areas' readings, for the site model's evidence table.
 * Returns [label, text] or null. The readings are stated, not judged: the
 * pairing is the reader's, and the engine's outcomes stay in section 5.
 */
export function comparisonRow(zones = [], params = []) {
  const comps = (zones || []).filter(isComparisonZone)
  if (!comps.length) return null
  const text = comps.map(z => `${str(z.zn) || 'Comparison area'}: ${readingsText(z, params) || 'no readings recorded'}`).join('. ')
  return ['Comparison area', `${text}.`]
}

/** The checks already made in the primary zone, for the site model. */
export function checksRow(zones = [], zoneName) {
  const z = (zones || []).find(x => x && str(x.zn) === str(zoneName))
  if (!z) return null
  const lines = checksPerformedLines(z)
  if (!lines.length) return null
  const text = lines[0].replace(/^Checks performed: /, '')
  return ['Checks performed', text.charAt(0).toUpperCase() + text.slice(1)]
}

// ── QA/QC rows ─────────────────────────────────────────────────────────

/** One "Continuous monitoring" row per zone that carried a logger. */
export function continuousMonitoringRows(zones = []) {
  const out = []
  for (const z of zones || []) {
    const line = loggerDeploymentLines(z)[0]
    if (!line) continue
    out.push({ label: 'Continuous monitoring', value: `${str(z.zn) || 'Zone'} — ${line.replace(/^Continuous logger: /, '')}` })
  }
  return out
}

/** The airflow instrument row, when a flow was measured. */
export function airflowInstrumentRow(presurvey = {}, zones = []) {
  const measured = (zones || []).some(z => readNumber(z && z.oa_flow_cfm) !== null)
  if (!measured) return null
  const inst = str(presurvey && presurvey.ps_inst_flow)
  return { label: 'Airflow instrument', value: inst || 'Airflow was measured; no instrument for it is documented in the project record.' }
}

// ── Logger captions ────────────────────────────────────────────────────

const GRAPH_PARAMS = { co2: ['co2'], tempRh: ['temp', 'rh'], pm: ['pm25', 'pm10'], co: ['co'], tvoc: ['tvoc'], hcho: ['hcho'] }

const fmtNum = (v, dp) => (typeof v === 'number' && Number.isFinite(v) ? (dp === 0 ? Math.round(v) : Math.round(v * 10) / 10) : null)

/**
 * A factual caption for an included logger timeline that has none: the
 * location the logger record names, the count and interval, the period,
 * each parameter's median and range in the dataset's own unit, and the
 * events recorded inside the period. It compares nothing to anything —
 * that is the chart's reference line and the engine's job.
 */
export function autoLoggerCaption(graphId, sensorData, zones = []) {
  const ds = primaryDataset(sensorData)
  if (!ds || !ds.summary || !ds.summary.stats) return null
  const params = graphId === 'multi'
    ? (Array.isArray(sensorData && sensorData.graphs && sensorData.graphs.multi && sensorData.graphs.multi.params) ? sensorData.graphs.multi.params : (ds.params || []).slice(0, 3))
    : (GRAPH_PARAMS[graphId] || [])
  const stats = params.filter(p => ds.summary.stats[p]).map(p => {
    const spec = SENSOR_PARAMS.find(s => s.key === p) || { label: p, unit: '' }
    const unit = (ds.units && ds.units[p]) || spec.unit
    const s = ds.summary.stats[p]
    const dp = p === 'co2' || p === 'tvoc' || p === 'hcho' ? 0 : 1
    return `${spec.label} median ${fmtNum(s.median, dp)} ${unit}, range ${fmtNum(s.min, dp)}–${fmtNum(s.max, dp)} ${unit}`
  })
  if (!stats.length) return null
  const loggerZone = (zones || []).find(z => z && z.logger_deployment && z.logger_deployment.placed)
  const where = loggerZone ? str(loggerZone.zn) : (ds.label && ds.label !== 'Indoor' ? str(ds.label) : 'logger location')
  const n = ds.summary.count || (ds.points || []).length
  const iv = ds.summary.intervalSec ? intervalText(Math.round(ds.summary.intervalSec / 60)) : null
  const period = ds.summary.start && ds.summary.end
    ? ` from ${new Date(ds.summary.start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} to ${new Date(ds.summary.end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : ''
  const head = `${where}: ${n} ${iv ? `${iv} ` : ''}readings${period}.`
  const events = loggerZone ? loggerEventLines(loggerZone) : []
  return [head, `${stats.join('; ')}.`, ...events].join(' ')
}

// ── Sampling plan (section 6.1) ────────────────────────────────────────

/**
 * The confirmatory sampling the engine proposed, as the report's own
 * table. Read verbatim from `samplingPlan.plan`; the app's Actions tab
 * already shows it and the DOCX did not.
 */
export function buildSamplingSection(samplingPlan) {
  const plan = samplingPlan && Array.isArray(samplingPlan.plan) ? samplingPlan.plan.filter(Boolean) : []
  if (!plan.length) return null
  const cap = (s) => { const t = str(s); return t ? t.charAt(0).toUpperCase() + t.slice(1) : '' }
  return {
    intro: 'Confirmatory sampling proposed for the findings above. Each method names the hypothesis it tests and the control sample it needs; the direct-reading values in this report do not substitute for it.',
    rows: plan.map(p => ({
      zone: str(p.zone), type: str(p.type), priority: cap(p.priority), hypothesis: str(p.hypothesis),
      method: str(p.method), controls: str(p.controls), standard: str(p.standard),
    })),
    outdoorGaps: Array.isArray(samplingPlan.outdoorGaps) ? samplingPlan.outdoorGaps.filter(Boolean).map(str) : [],
  }
}
