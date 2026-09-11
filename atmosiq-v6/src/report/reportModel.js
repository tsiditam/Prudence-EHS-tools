/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Report Model compiler — the single structured source of truth for the
 * fixed IAQ report renderer.
 *
 * `buildReportModel(data)` composes the raw assessment blob (the same shape
 * the DOCX/HTML renderers already receive: building, presurvey, zones,
 * zoneScores, comp, recs, causalChains, sensorData, photos, profile) into a
 * single deterministic object. The renderer reads ONLY from this model, so
 * the same data always produces the same report (controlled narrative
 * wording aside).
 *
 * Engine-sacred: this module READS engine OUTPUT (zoneScores[].cats[].r[],
 * recs, causalChains) — it does not score, and it does not modify any engine
 * file. Per-parameter outcomes are DERIVED FROM THE ENGINE'S FINDINGS for
 * the zone (severity → outcome label), never re-decided here (audit H3).
 * Until 2026-09 `paramOutcome` was a second verdict ladder — always the
 * summer temperature band, CO "acceptable" below 9 while the engine flagged
 * at 6, `>=` where the engine uses `>`, RH rated high where the engine caps
 * at medium — so the results table could contradict the finding beside it.
 * `tests/engine/cross-layer-consistency.test.ts` holds the layers together.
 */

import { STD } from '../constants/standards'
import { parsePhotoKey, photoCaption } from '../utils/photoIndex.js'
import { actionLine, HVAC_UNMAPPED_PREFIX } from '../utils/recFormatting'
import { readNumber, scoreZone } from '../engines/scoring'
import { pickPrimaryChain } from '../engines/causalChains'
import { resolveAssessmentDate } from '../utils/assessmentDate'
import * as NL from './narrativeLibrary'
import {
  REPORT_PROFILES, REPORT_STATUS, DEFAULT_PROFILE, DEFAULT_STATUS,
  reportChrome, resolveLifecycle, statusLabel, SCREENING_LIMITATION,
} from '../constants/reportLifecycle'

// Zone measurement keys (question ids) → model parameter keys.
const PARAMS = [
  { key: 'co2', zoneKey: 'co2', label: 'Carbon dioxide (CO2)', unit: 'ppm', basis: 'ASHRAE 62.1 ventilation indicator' },
  { key: 'co', zoneKey: 'co', label: 'Carbon monoxide (CO)', unit: 'ppm', basis: 'US EPA NAAQS / OSHA PEL' },
  { key: 'temperature', zoneKey: 'tf', label: 'Temperature', unit: '°F', basis: 'ASHRAE 55 comfort envelope' },
  // NOT ASHRAE 55: that standard sets only an upper humidity limit (a
  // humidity ratio) and no lower one. See STD.t.rh in constants/standards.js.
  { key: 'relativeHumidity', zoneKey: 'rh', label: 'Relative humidity', unit: '%', basis: 'US EPA moisture control (30–60%)' },
  { key: 'pm25', zoneKey: 'pm', label: 'Fine particulate (PM2.5)', unit: 'µg/m³', basis: 'US EPA NAAQS (context)' },
  // No basis, and the column says so. This read 'Mølhave (1991) advisory'
  // until 2026-08; leaving a basis in place while the outcome column says
  // Not evaluated would have the table cite a threshold the report then
  // declines to apply. TVOC is measured and reported, never judged.
  { key: 'tvoc', zoneKey: 'tv', label: 'Total VOCs (TVOC)', unit: 'µg/m³', basis: 'No applicable threshold — reported, not judged' },
]

// The engine's parser (audit H1): the cell the table prints and the value
// the engine judged are the same number, or both are null. The old local
// `parseFloat(replace(/[^0-9.\-]/g))` read '<5' as 5 and '1,180' as 1180
// while the engine read NaN and passed.
const num = readNumber

function stats(values) {
  const v = values.filter(x => x !== null)
  if (!v.length) return null
  const min = Math.min(...v), max = Math.max(...v)
  const mean = Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10
  return { min, max, mean, n: v.length }
}

// ── Outcomes derive from the engine ────────────────────────────────────
//
// Model parameter key → the `p` the engine stamps on that parameter's
// findings. TVOC has none: it is measured and reported, never judged.
const ENGINE_PARAM = { co2: 'co2', co: 'co', temperature: 'temperature', relativeHumidity: 'rh', pm25: 'pm25', tvoc: null }
// Engine severity → results-table outcome. `low`, `pass` and `info` are the
// engine's "evaluated, nothing to act on".
const SEV_TO_OUTCOME = { critical: 'priority', high: 'elevated', medium: 'advisory', low: 'acceptable', pass: 'acceptable', info: 'acceptable' }
const OUTCOME_RANK = { not_evaluated: -1, acceptable: 0, advisory: 1, elevated: 2, priority: 3 }
const worseOutcome = (a, b) => ((OUTCOME_RANK[b] ?? -1) > (OUTCOME_RANK[a] ?? -1) ? b : a)

/**
 * The engine result for zone `i`. Callers pass `zoneScores` aligned with
 * `zones` (the app always does). A caller with no scores at all — the
 * marketing sample, a preview — gets the zone scored on the spot with an
 * empty building, so the table still reads off the engine rather than off a
 * ladder of its own; a profile- or date-dependent outcome then reports the
 * gap (temperature needs a survey date) instead of guessing.
 */
function engineResult(zoneScores, zones, i) {
  if (zoneScores[i]) return zoneScores[i]
  const z = zones[i]
  return z ? scoreZone(z, {}) : null
}

/**
 * One parameter's outcome in one zone, from that zone's engine findings:
 * the worst severity among findings stamped with the parameter's `p`. No
 * finding means the engine evaluated the reading and raised nothing —
 * 'acceptable'. A `dataGap` finding (entered but unreadable, or a comfort
 * band with no date) is 'not_evaluated', as is a parameter with no engine
 * result at all.
 */
export function zoneParamOutcome(zs, key) {
  const p = ENGINE_PARAM[key]
  if (!p) return 'not_evaluated'
  if (!zs || !Array.isArray(zs.cats)) return 'not_evaluated'
  const findings = zs.cats.flatMap(c => (c.r || []).filter(r => r && r.p === p))
  if (findings.some(r => r.dataGap)) return 'not_evaluated'
  return findings.reduce((worst, r) => worseOutcome(worst, SEV_TO_OUTCOME[r.sev] || 'acceptable'), 'acceptable')
}

const zoneName = (zoneScores, zones, i) =>
  (zoneScores[i] && zoneScores[i].zoneName) || (zones[i] && zones[i].zn) || `Zone ${i + 1}`

/** Per-parameter summary: { range, mean, unit, basis, outcome } for measured params. */
export function summarizeParameters(zones = [], zoneScores = []) {
  const out = {}
  for (const p of PARAMS) {
    const values = zones.map(z => num(z && z[p.zoneKey]))
    const s = stats(values)
    if (!s) continue
    // Worst outcome across the zones that carry a reading for this parameter.
    let outcome = null
    zones.forEach((z, i) => {
      if (values[i] === null) return
      const o = zoneParamOutcome(engineResult(zoneScores, zones, i), p.key)
      outcome = outcome === null ? o : worseOutcome(outcome, o)
    })
    out[p.key] = {
      label: p.label, unit: p.unit, basis: p.basis,
      min: s.min, max: s.max, mean: s.mean, n: s.n,
      range: s.min === s.max ? `${s.min}` : `${s.min}–${s.max}`,
      outcome: outcome ?? 'not_evaluated',
    }
  }
  return out
}

/** Per-zone measurement rows with a governing (worst-parameter) outcome. */
export function zoneRows(zones = [], zoneScores = []) {
  return zones.map((z, i) => {
    const zs = engineResult(zoneScores, zones, i)
    let worst = null
    const cells = {}
    for (const p of PARAMS) {
      const val = num(z && z[p.zoneKey])
      cells[p.key] = val
      if (val !== null && p.key !== 'tvoc') {
        const oc = zoneParamOutcome(zs, p.key)
        worst = worst === null ? oc : worseOutcome(worst, oc)
      }
    }
    return {
      id: zoneName(zoneScores, zones, i),
      use: (z && (z.zt || z.zuse)) || '',
      ...cells,
      // A zone with no judged reading is not "acceptable"; it was not
      // evaluated, and the row says so.
      outcome: worst ?? 'not_evaluated',
    }
  })
}

/** Peak CO2 by zone (for the bar chart) — { zone, value, outcome }. */
export function peakCo2ByZone(zones = [], zoneScores = []) {
  return zones.map((z, i) => {
    const value = num(z && z.co2)
    return value === null ? null : { zone: zoneName(zoneScores, zones, i), value, outcome: zoneParamOutcome(engineResult(zoneScores, zones, i), 'co2') }
  }).filter(Boolean)
}

/**
 * Every data-gap finding the engine raised, as a limitation line. A reading
 * that was entered but could not be read, or a comfort band that could not
 * be selected, is stated here rather than silently rendered as "—".
 */
export function collectDataGaps(zoneScores = []) {
  const lines = []
  for (const zs of zoneScores) {
    for (const cat of ((zs && zs.cats) || [])) {
      for (const r of (cat.r || [])) {
        if (r && r.dataGap) lines.push(`${zs.zoneName || 'Zone'}: ${r.t}.`)
      }
    }
  }
  return lines
}

/** Flagged findings (critical/high/medium) from engine zone scores. */
export function collectFindings(zoneScores = []) {
  const FLAG = new Set(['critical', 'high', 'medium'])
  const rows = []
  for (const zs of zoneScores) {
    for (const cat of (zs.cats || [])) {
      for (const r of (cat.r || [])) {
        if (!FLAG.has(r.sev)) continue
        rows.push({
          zone: zs.zoneName || 'Zone', category: cat.l, severity: r.sev, text: r.t, std: r.std || null,
          // The ZONE's confidence, kept for consumers that want it. It is not
          // a property of this finding and the report no longer prints it as
          // one — see `basis` below.
          confidence: zs.confidence || null,
          // What this finding actually rests on. `p` is the parameter id the
          // engine stamps on a finding derived from an instrument reading;
          // its absence means the finding came from an observation or an
          // intake answer. `qualitative_only` marks a reading from an
          // instrument outside the accuracy database.
          //
          // The report's per-finding column used to print `zs.confidence` —
          // one zone-level number copied onto every row under a heading that
          // implied it was per-finding. It read the same for all findings in a
          // zone, carried no information, and disagreed with the measurement-
          // confidence breakdown the app showed on the same assessment.
          basis: r.qualitative_only ? 'Qualitative' : (r.p ? 'Measured' : 'Observed'),
        })
      }
    }
  }
  const rank = { critical: 0, high: 1, medium: 2 }
  return rows.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
}

// ── Walkthrough observations ───────────────────────────────────────────
//
// What the assessor SAW and what occupants SAID, as a factual account,
// separate from what the engine concluded about it.
//
// A CIH review of the report (2026-09) named this the biggest structural gap:
// staining, weak airflow and symptom reports reached the reader only as
// findings or as recommendations, so the document jumped from methods
// straight to numbers with no account of the walkthrough that produced them.
// An IAQ report is read as an investigation narrative — observations, then
// measurements, then interpretation — and this section is the first of those.
//
// It deliberately restates NOTHING the engine decided. No severity, no
// citation, no verdict: those belong to Findings. A reader comparing the two
// sections should be able to see which conclusions came from what was seen.

/** Intake answers that mean "nothing to report", so the line is omitted. */
const NIL_ANSWER = new Set(['', 'None', 'No complaints', 'None identified', 'None of concern', 'None observed', 'Not assessed', 'Not tested', 'Not observed', 'Not accessible', 'Unknown', 'Comfortable', 'No known history'])
const has = (v) => typeof v === 'string' && v.trim() !== '' && !NIL_ANSWER.has(v.trim())
const hasList = (v) => Array.isArray(v) && v.filter(x => has(x)).length > 0
const listOf = (v) => (v || []).filter(x => has(x)).join(', ')

/** Per-zone environmental observations, as sentences. */
function zoneObservations(z = {}) {
  const out = []
  if (has(z.tc)) out.push(`Thermal comfort reported as ${String(z.tc).toLowerCase()}.`)
  if (has(z.hp)) out.push(`Humidity reported as ${String(z.hp).toLowerCase()}.`)
  if (has(z.vd)) out.push(`Visible dust: ${String(z.vd).toLowerCase()}.`)
  if (has(z.wd)) {
    out.push(`Water damage: ${String(z.wd).toLowerCase()}${hasList(z.wl) ? ` — ${listOf(z.wl).toLowerCase()}` : ''}.`)
  }
  if (has(z.mi)) out.push(`Mold indicators: ${String(z.mi).toLowerCase()}.`)
  if (has(z.op)) {
    out.push(`Odour: ${String(z.op).toLowerCase()}${hasList(z.ot) ? ` — ${listOf(z.ot).toLowerCase()}` : ''}.`)
  }
  if (hasList(z.src_internal)) out.push(`Potential sources within the zone: ${listOf(z.src_internal).toLowerCase()}.`)
  if (hasList(z.src_adjacent)) out.push(`Adjacent to: ${listOf(z.src_adjacent).toLowerCase()}.`)
  if (has(z.path_pressure)) out.push(`Zone pressure relative to adjacent spaces: ${String(z.path_pressure).toLowerCase()}.`)
  if (has(z.path_crosstalk)) out.push(`Cross-contamination: ${String(z.path_crosstalk).toLowerCase()}.`)
  return out
}

/** Per-zone occupant reports, as sentences. */
function zoneOccupantReports(z = {}) {
  if (z.cx !== 'Yes — complaints reported') return []
  const out = []
  const symptoms = [...(z.sy || []), ...(z.sy_other ? [z.sy_other] : [])].filter(Boolean)
  if (has(z.ac)) out.push(`${z.ac} occupants reporting symptoms.`)
  if (symptoms.length) out.push(`Symptoms reported: ${symptoms.join(', ').toLowerCase()}.`)
  if (has(z.sr)) out.push(`Symptoms away from the building: ${String(z.sr).toLowerCase()}.`)
  if (has(z.cc)) out.push(`Clustering: ${String(z.cc).toLowerCase()}.`)
  return out
}

/**
 * Building-level observations — the HVAC and envelope conditions recorded
 * once for the site rather than per zone.
 */
function buildingObservations(bldg = {}, presurvey = {}) {
  const rows = []
  const add = (label, v) => { if (has(v)) rows.push([label, v]) }
  add('HVAC system type', bldg.ht)
  add('Supply air delivery', bldg.sa)
  add('Outdoor air damper', bldg.od)
  add('Filter rating', bldg.fm)
  add('Filter condition', bldg.fc)
  add('Condensate drain pan', bldg.dp)
  add('Last HVAC service', bldg.hm)
  add('Exterior door test', bldg.bld_press_door)
  add('Building pressurization', bldg.bld_pressure)
  add('Filter change schedule', presurvey.ps_filter_schedule)
  add('History of water intrusion', presurvey.ps_water_history)
  return rows
}

/**
 * The Walkthrough Observations section, or null when nothing was recorded
 * beyond measurements — an empty heading is worse than no section.
 */
export function buildObservations(data = {}) {
  const zones = data.zones || []
  const bldg = data.building || data.bldg || {}
  const presurvey = data.presurvey || {}
  const building = buildingObservations(bldg, presurvey)
  const zoneBlocks = zones.map((z, i) => ({
    zone: (z && z.zn) || `Zone ${i + 1}`,
    use: (z && z.su) || '',
    area: (z && z.sf) || '',
    occupants: (z && z.oc) || '',
    observed: zoneObservations(z),
    occupantReports: zoneOccupantReports(z),
    notes: (z && typeof z.znt === 'string' && z.znt.trim()) || '',
  })).filter(b => b.observed.length || b.occupantReports.length || b.notes)
  if (!building.length && !zoneBlocks.length) return null
  return {
    intro: 'Conditions recorded during the walkthrough, before interpretation. Occupant reports are what was described to the assessor; they are not a medical finding. Measurements appear in the following section and the engine’s conclusions in Discussion and Conclusions.',
    building,
    zones: zoneBlocks,
  }
}

/** Recommendations grouped by timeframe (flattened to plain strings). */
export function recommendationsByTimeframe(recs = {}) {
  const lines = (arr) => (arr || []).map(r => typeof r === 'string' ? r : actionLine(r)).filter(Boolean)
  return {
    immediate: lines(recs.imm),
    shortTerm: lines(recs.eng),
    mediumTerm: [...lines(recs.adm), ...lines(recs.mon)],
  }
}

// Control tier → the reader-facing name for what kind of control an action is.
const TIER_LABEL = {
  source_management: 'Source management',
  engineering_control: 'Engineering',
  administrative_control: 'Administrative',
}

/**
 * Recommendations as ONE action register rather than three bullet lists.
 *
 * The CIH review asked for a single table with finding, action, priority,
 * responsible party, deadline and verification. Four of those six are in the
 * data and are built here. **Responsible party and deadline are NOT**: no
 * intake field, engine output or stored column carries an owner or a due
 * date anywhere in this platform, and a report that invented them would be
 * asserting a commitment nobody made. They are left to the owner as a
 * product decision — see the note returned alongside the rows.
 *
 * Emitted ALONGSIDE the flattened `immediate` / `shortTerm` / `mediumTerm`
 * strings, which other consumers still read, rather than replacing them.
 */
export function actionRegister(recs = {}) {
  const bucket = (arr, priority, timeframe) => (arr || []).map(r => {
    const a = typeof r === 'string' ? { text: r, scope: 'building' } : r
    const where = a.scope === 'equipment'
      ? (a.equipmentLabel || a.equipmentId || 'Equipment')
      : a.scope === 'zone'
        ? (a.zoneName || a.zoneId || '')
        : (a.affectedZoneNames && a.affectedZoneNames.length ? a.affectedZoneNames.join(', ') : 'Building-wide')
    // The unmapped-equipment caveat is a fact about WHERE the action applies,
    // and the register has a Location column for that. Glued to the front of
    // the action text — which is where the flattened bullet list had to put
    // it — it led every such row with a caveat and buried the action itself.
    const unmapped = String(a.text || '').startsWith(HVAC_UNMAPPED_PREFIX)
    const text = unmapped ? String(a.text).slice(HVAC_UNMAPPED_PREFIX.length) : String(a.text || '')
    return {
      priority, timeframe,
      action: text,
      location: `${where || 'Building-wide'}${unmapped ? ' (no HVAC unit mapped)' : ''}`,
      // `null` for a data-gap action: an investigation step is not a control,
      // and the hierarchy has no honest slot for one (see CONTROL_TIER).
      control: a.controlTier ? (TIER_LABEL[a.controlTier] || a.controlTier) : 'Investigation',
    }
  })
  return [
    ...bucket(recs.imm, 'Immediate', '0–7 days'),
    ...bucket(recs.eng, 'Short term', '7–30 days'),
    ...bucket(recs.adm, 'Medium term', '30–90 days'),
    ...bucket(recs.mon, 'Ongoing', 'Continuous'),
  ]
}

// Reader-facing names for the engine's parameter keys, for the Appendix A
// usage column.
const PARAM_LABEL = { co2: 'CO₂', co: 'CO', hcho: 'formaldehyde', pm25: 'PM2.5', temperature: 'temperature', rh: 'relative humidity', multi_oel: 'multiple contaminants' }
const FLAGGED = new Set(['critical', 'high', 'medium'])
// The first clause of a finding sentence — "CO 55 ppm", "Visible mold growth
// (Small (< 10 sq ft))" — for the usage column.
const headline = (t) => String(t || '').split(' — ')[0].split('. ')[0].trim().slice(0, 90)

/**
 * The references this report actually cites, with what cited each one.
 *
 * Appendix A used to be an unguarded standards register: four references
 * were appended whatever the report measured, and every row read
 * "Referenced in screening interpretation." A reference now enters ONLY
 * when a flagged finding cites it (`f.std`), a causal chain cites it, or a
 * measured parameter was evaluated against a registry criterion carrying it
 * (a non-flagged engine finding with `std` and `p`). The citation comes off
 * the finding — i.e. off the criterion that evaluated the reading — never
 * from a fixed per-parameter default (citations handoff §1; CLAUDE.md).
 *
 * @returns {{ refs: string[], usage: Record<string,string> }}
 */
export function collectReferenceUsage(findings = [], causalChains = [], zoneScores = []) {
  const usage = new Map()
  const add = (ref, line) => {
    if (!ref) return
    if (!usage.has(ref)) usage.set(ref, { cited: new Set(), applied: new Set() })
    if (line) usage.get(ref)[line.kind].add(line.text)
  }
  findings.forEach(f => add(f.std, { kind: 'cited', text: `${f.zone} — ${headline(f.text)}` }))
  ;(causalChains || []).forEach(c => {
    const s = c.std || c.citation
    if (s) add(s, { kind: 'cited', text: `causal chain — ${c.type || c.name || 'primary finding'}` })
  })
  for (const zs of zoneScores) {
    for (const cat of ((zs && zs.cats) || [])) {
      for (const r of (cat.r || [])) {
        if (!r || !r.std || FLAGGED.has(r.sev) || r.dataGap) continue
        add(r.std, { kind: 'applied', text: `${PARAM_LABEL[r.p] || headline(r.t)} (${zs.zoneName || 'Zone'})` })
      }
    }
  }
  const out = {}
  for (const [ref, u] of usage) {
    const parts = []
    if (u.cited.size) parts.push(`Cited by: ${[...u.cited].join('; ')}`)
    if (u.applied.size) parts.push(`Applied to measured parameter: ${[...u.applied].join('; ')}`)
    out[ref] = parts.join('. ') + '.'
  }
  return { refs: [...usage.keys()], usage: out }
}

/** Distinct references actually cited by findings, causal chains or evaluated parameters. */
export function collectReferences(findings = [], causalChains = [], zoneScores = []) {
  return collectReferenceUsage(findings, causalChains, zoneScores).refs
}

/** QA/QC manifest from presurvey instrument fields; missing → disclosed. */
/**
 * Who the report is addressed to, from the Client / Recipient intake.
 *
 * Every one of these fields was collected by Assessment Details and then
 * dropped: the AtmosFlow DOCX named the client in exactly one place, the
 * footer of a Final-status report, so a draft — which is what every report
 * starts as — was addressed to nobody. The address lines had no consumer at
 * all in this deliverable.
 *
 * Returns `{}` when nothing was entered, so the caller can omit the block
 * rather than print an empty one. Every field is optional and the shape
 * degrades a line at a time.
 */
export function buildRecipient(presurvey = {}) {
  const t = (v) => (typeof v === 'string' ? v.trim() : '')
  const name = t(presurvey.ps_recipient_name)
  const title = t(presurvey.ps_recipient_title)
  const organization = t(presurvey.ps_recipient_organization)
  const cityLine = [
    [t(presurvey.ps_recipient_city), t(presurvey.ps_recipient_state)].filter(Boolean).join(', '),
    t(presurvey.ps_recipient_zip),
  ].filter(Boolean).join(' ')
  const addressLines = [
    t(presurvey.ps_recipient_address1),
    t(presurvey.ps_recipient_address2),
    cityLine,
  ].filter(Boolean)
  if (!name && !organization && !addressLines.length) return {}
  return {
    name, title, organization, addressLines,
    // "Attention" is the person plus their role — the line a reader scans to
    // know who owns this. Title alone is not an addressee.
    attention: [name, title].filter(Boolean).join(', '),
    // The block as rendered, top to bottom.
    lines: [
      [name, title].filter(Boolean).join(', '),
      organization,
      ...addressLines,
    ].filter(Boolean),
  }
}

// Which instrument a measured parameter comes from. The primary IAQ meter
// covers the standard suite; TVOC needs a PID; formaldehyde needs a meter of
// its own, and the intake has no field for one (`ps_inst_other` is free text).
const PARAM_INSTRUMENT = {
  co2: 'iaq', co2o: 'iaq', tf: 'iaq', tfo: 'iaq', rh: 'iaq', rho: 'iaq',
  pm: 'iaq', pmo: 'iaq', co: 'iaq',
  tv: 'pid', tvo: 'pid',
  hc: 'hcho',
}
// One name per INSTRUMENT family: an indoor and an outdoor TVOC reading come
// off the same PID, so listing both would name the same gap twice.
const PARAM_READABLE = { tv: 'TVOC', tvo: 'TVOC', hc: 'Formaldehyde' }

/**
 * The QA/QC record: what measured what, and what has nothing behind it.
 *
 * It used to list the primary IAQ meter and nothing else. A report could
 * therefore carry a formaldehyde finding against the NIOSH REL and a full
 * TVOC interpretation section while the only instrument on record was a
 * CO2/temp/RH meter that measures neither. Naming one instrument beside
 * readings it could not have produced attributes them to it by implication.
 *
 * Rows for the PID and for formaldehyde appear only when the assessment
 * actually recorded those readings, and say plainly when no instrument is on
 * file for them. Same principle as the `qualitative_only` propagation: a
 * measurement with no instrument behind it is disclosed, not dressed up.
 */
export function buildQaQc(presurvey = {}, zones = []) {
  const NA = 'Not documented in project record.'
  const f = (v) => (v && String(v).trim()) || NA
  const measured = (field) => zones.some(z => z && num(z[field]) !== null)
  const rows = [
    { label: 'Primary IAQ meter', value: f(presurvey.ps_inst_iaq) },
    { label: 'Serial number', value: f(presurvey.ps_inst_iaq_serial) },
    { label: 'Calibration', value: presurvey.ps_inst_iaq_cal_status ? `${presurvey.ps_inst_iaq_cal_status}${presurvey.ps_inst_iaq_cal ? ` (${presurvey.ps_inst_iaq_cal})` : ''}` : NA },
  ]
  if (measured('tv') || measured('tvo')) {
    rows.push({
      label: 'VOC / PID meter',
      value: presurvey.ps_inst_pid
        ? `${String(presurvey.ps_inst_pid).trim()}${presurvey.ps_inst_pid_cal ? ` (${presurvey.ps_inst_pid_cal})` : ''}`
        : 'TVOC readings were recorded; no PID is documented in the project record.',
    })
  }
  if (measured('hc')) {
    // No intake field exists for a formaldehyde meter, so the honest answer
    // points at whatever the assessor wrote under "Other instruments" and
    // says outright when that is empty.
    rows.push({
      label: 'Formaldehyde meter',
      value: (presurvey.ps_inst_other && String(presurvey.ps_inst_other).trim())
        || 'Formaldehyde readings were recorded; no instrument for them is documented in the project record.',
    })
  }
  rows.push({ label: 'Assessor review', value: 'Draft — requires qualified-professional review before issuance.' })
  return rows
}

/**
 * A limitation naming every measured parameter with no instrument on record.
 * Empty when everything measured has something behind it.
 */
export function unattributedParameters(presurvey = {}, zones = []) {
  const have = { iaq: !!presurvey.ps_inst_iaq, pid: !!presurvey.ps_inst_pid, hcho: !!(presurvey.ps_inst_other && String(presurvey.ps_inst_other).trim()) }
  const orphans = new Set()
  for (const z of zones) {
    for (const [field, inst] of Object.entries(PARAM_INSTRUMENT)) {
      if (num(z && z[field]) === null) continue
      if (!have[inst]) orphans.add(PARAM_READABLE[field] || field)
    }
  }
  return [...orphans]
}

/** Standard limitations + project-specific additions. */
export function buildLimitations(data) {
  const base = [
    'Reflects conditions on the assessment date only.',
    'Not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.',
    'Direct-reading instruments are indicative tools; TVOC and PM2.5 are non-specific indicators.',
  ]
  const extra = []
  const hasLogger = !!(data.sensorData && data.sensorData.graphs && Object.values(data.sensorData.graphs).some(g => g && g.include))
  if (!hasLogger) extra.push('No continuous logger data was collected; values reflect readings taken during the site visit.')
  if (!(data.zones || []).some(z => num(z && z.co2) !== null)) extra.push('Limited quantitative measurements were available for this assessment.')
  // A reading with no instrument behind it is disclosed, not attributed by
  // implication to whichever meter the QA/QC table happens to name first.
  const orphans = unattributedParameters(data.presurvey || {}, data.zones || [])
  if (orphans.length) {
    const list = orphans.length > 1 ? `${orphans.slice(0, -1).join(', ')} and ${orphans[orphans.length - 1]}` : orphans[0]
    extra.push(`${list} ${orphans.length === 1 ? 'was' : 'were'} recorded, but no instrument for ${orphans.length === 1 ? 'it' : 'them'} is documented in the project record; ${orphans.length === 1 ? 'that reading is' : 'those readings are'} reported without instrument attribution.`)
  }
  return [...base, ...extra, ...collectDataGaps(data.zoneScores || [])]
}

/**
 * @param {object} data
 * @param {object} [opts]
 * @param {Date}   [opts.now]  The clock for the generated-at stamp
 *   (`reportDate`), the undated-record fallback for `assessmentDate`, and
 *   the no-id Report ID fallback. Injected so the same input renders the
 *   same document (audit H6); `tests/engine/render-determinism.test.ts`
 *   pins it. It defaults to the real clock HERE and only here — this is the
 *   outermost model builder; DocxReport / downloadReportPdf call in without
 *   `now` and get today, which is the one caller for which today is right.
 */
export function buildReportModel(data = {}, opts = {}) {
  const bldg = data.building || {}
  const ps = data.presurvey || {}
  const zones = data.zones || []
  const zoneScores = data.zoneScores || []
  const profile = data.profile || {}
  const now = opts.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date()
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  // The survey date the assessor entered, then the finalize timestamp —
  // the same resolution scoring and the print path use.
  const surveyIso = resolveAssessmentDate(data)
  const findings = collectFindings(zoneScores)
  const referenceUsage = collectReferenceUsage(findings, data.causalChains || [], zoneScores)
  // Lifecycle: explicit opts win, then whatever the stored record
  // carries, then the legacy `status` column, then screening/draft.
  //
  // One backward-compatibility rule. A caller that explicitly passes the
  // legacy `mode` ('draft' | 'final') and no profile is the CONSULTANT
  // report path (api/report-pdf.js, src/utils/downloadReportPdf.js) —
  // that deliverable has always carried the professional accountability
  // statement, and quietly reclassifying it as screening would swap the
  // signature block on a shipped document. Only genuinely new callers
  // fall through to the screening default.
  const legacyModeCaller = opts.mode === 'draft' || opts.mode === 'final'
  const LIFECYCLE = resolveLifecycle({
    report_profile:
      opts.reportProfile || data.report_profile || data.reportProfile ||
      (legacyModeCaller ? REPORT_PROFILES.PROFESSIONAL : undefined),
    report_status: opts.reportStatus || data.report_status || data.reportStatus,
    status: data.status,
  })

  const graphs = (data.sensorData && data.sensorData.graphs)
    ? Object.values(data.sensorData.graphs)
        .filter(g => g && g.include && typeof g.imageDataUrl === 'string' && g.imageDataUrl.startsWith('data:image'))
        .map(g => ({ type: 'image', title: g.title || 'Logger chart', imageDataUrl: g.imageDataUrl, caption: g.caption || '' }))
    : []
  const co2Bars = peakCo2ByZone(zones, zoneScores)
  const charts = [...graphs]
  if (co2Bars.length) charts.push({ type: 'barCo2ByZone', title: 'Peak CO2 by zone', data: co2Bars, threshold: STD.v.co2.con })

  return {
    reportMeta: {
      reportTitle: 'Indoor Air Quality Assessment Report',
      facilityName: bldg.fn || 'Facility',
      address: bldg.fl || '',
      scope: (zones.length ? `${zones.length} area${zones.length === 1 ? '' : 's'}` : ''),
      assessmentDate: surveyIso ? fmt(new Date(`${surveyIso}T12:00:00`)) : fmt(now),
      reportDate: fmt(now),
      assessorName: profile.name || ps.ps_assessor || 'Assessor',
      // Only the credentials the name does not already carry. Assessors write
      // their post-nominals into the name field ("T. Tamakloe, CIH, CSP")
      // because that is how a signature block reads, and the profile also
      // stores them as a list — so the report printed "T. Tamakloe, CIH, CSP,
      // CIH" wherever the two were concatenated.
      assessorCredentials: dedupeCredentials(profile.name || ps.ps_assessor || '', profile.certs || []),
      companyName: profile.firm || 'Prudence Safety & Environmental Consulting, LLC',
      // The Report ID a client quotes back when they ring about a document.
      // `data.id` is the record this export is of; the fallback is for a
      // caller that has no record at all — the marketing sample, a preview.
      //
      // Until 2026-08 NO caller passed `id`, so the fallback ran every time
      // and the SAME report printed a different Report ID on every export.
      // Regenerate after a typo fix and the client is holding two documents
      // that disagree about which one they are. `Date.now()` is a timestamp,
      // not an identity: it changes on re-issue, which is precisely when a
      // stable id matters most.
      // The firm's own project number wins when the assessor entered one.
      // Assessment Details has collected `ps_project_number` all along and no
      // consumer in this deliverable ever read it — it reached only
      // engine/bridge/meta.ts, which feeds the consultant report that was
      // removed in 2026-08. So the field a firm uses to tie a report to its
      // file was discarded, and the client quoted back an internal record id.
      //
      // The fallback is DELIBERATELY still the raw record id rather than a
      // prettier derived string. Reformatting it would change the printed
      // identity of every report already issued — the exact failure the note
      // below describes, arriving from the other direction. A project number
      // is the supported way to put a human identifier on the document.
      reportId: (typeof ps.ps_project_number === 'string' && ps.ps_project_number.trim())
        || data.id
        || `AIQ-${now.getTime().toString(36).toUpperCase().slice(-6)}`,
      mode: opts.mode || 'draft', // 'draft' | 'final' | 'sample'
      // Report lifecycle. `mode` above is the legacy switch and is kept
      // because 'sample' has no lifecycle equivalent (it is a marketing
      // artifact, not a report); profile + status drive everything else.
      // Resolved from opts, then from the record, then defaults — so a
      // caller that knows nothing about the lifecycle still renders.
      reportProfile: LIFECYCLE.profile,
      reportStatus: LIFECYCLE.status,
      reviewer: opts.reviewer || data.reviewer || null,
      brandColor: opts.brandColor || profile.brandColor || '#0E7490',
    },
    projectSummary: {
      assessmentPurpose: ps.ps_reason || '',
      buildingDescription: [bldg.ft, bldg.ba ? `built ~${bldg.ba}` : null].filter(Boolean).join(', '),
      hvacDescription: bldg.ht || '',
      numberOfZones: zones.length,
    },
    parameters: summarizeParameters(zones, zoneScores),
    zones: zoneRows(zones, zoneScores),
    findings,
    recommendations: recommendationsByTimeframe(data.recs || {}),
    charts,
    photos: data.photos || {},
    qaQc: buildQaQc(ps, zones),
    limitations: buildLimitations(data),
    references: referenceUsage.refs,
    referenceUsage: referenceUsage.usage,
    composite: data.comp || null,
  }
}

// ── Render-model assembly (Report JSON + narrative library → renderer) ──

// `not_evaluated` maps to itself rather than falling through to `'ok'` —
// the `|| 'ok'` at each call site would otherwise print "Acceptable" for a
// parameter this platform has no basis to judge. See paramOutcome / TVOC.
const OUTCOME_TO_SEV = { acceptable: 'ok', advisory: 'advisory', elevated: 'elevated', priority: 'priority', not_evaluated: 'not_evaluated' }
// Worst first. `not_evaluated` is deliberately absent: it is not a rung on
// this ladder, so a parameter the engine declined to judge never becomes the
// governing outcome of a row. See the site-mean row below.
const SEV_RANK_ORDER = ['priority', 'elevated', 'advisory', 'ok']

/**
 * Credentials from the profile list that the name string does not already
 * state, joined for display. Word-boundary matched and case-insensitive, so
 * "CIH" in "T. Tamakloe, CIH, CSP" is caught but "CIH" inside another token
 * is not. Returns '' when the name already carries them all.
 */
export function dedupeCredentials(name, certs) {
  const n = String(name || '')
  return (certs || [])
    .filter(Boolean)
    .filter(c => !new RegExp(`(^|[^A-Za-z0-9])${String(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, 'i').test(n))
    .join(', ')
}

// The lead-chain rule lives with the chains (engines/causalChains.js) so the
// results hero and this model cannot disagree about which pathway leads.
// Re-exported for the callers that already reach for it here.
export { pickPrimaryChain }
const ENGINE_SEV_TO_SEV = { critical: 'priority', high: 'elevated', medium: 'advisory', low: 'ok', pass: 'ok', info: 'ok' }
const REF_BASIS = {
  'ASHRAE 62.1-2025': 'Ventilation and Acceptable Indoor Air Quality. Ventilation-indicator basis for CO2 (prescribes airflow, not a CO2 limit).',
  'ASHRAE 55-2023': 'Thermal Environmental Conditions for Human Occupancy. Seasonal operative-temperature comfort range; it sets no lower humidity limit, so the relative-humidity band is cited separately.',
  'US EPA — Mold, Moisture and Your Home': 'Indoor moisture-control guidance. Keep relative humidity below 60%, ideally 30–50%.',
  'US EPA NAAQS': 'National Ambient Air Quality Standards. CO 9 ppm (8-hr); PM2.5 35 µg/m³ (24-hr). Outdoor/population standards, cited for context.',
  'OSHA PELs (29 CFR 1910.1000)': 'Permissible Exposure Limits. CO PEL 50 ppm (8-hr TWA); CO2 PEL 5,000 ppm (industrial context).',
}

/**
 * Document chrome — header, watermark, cover chip, footer, disclaimer.
 *
 * A thin adapter over `reportChrome` in src/constants/reportLifecycle.js,
 * which is the single source of truth. Two things are resolved here that
 * the lifecycle module deliberately does not know about:
 *
 *   • 'sample' is NOT a lifecycle state. It is a marketing artifact that
 *     illustrates report structure, and it has no profile, no status and
 *     no reviewer. It stays a mode and is handled first, unchanged.
 *
 *   • The legacy `mode: 'final'` opt is still honoured. Callers that
 *     predate the lifecycle pass it, and silently demoting their report
 *     to a draft would be a visible regression in shipped code paths
 *     (api/report-pdf.js, src/utils/downloadReportPdf.js).
 */
function modeChrome(mode, reportId, firm, client, profile, status, reviewer) {
  if (mode === 'sample') {
    return {
      headerLabel: 'Sample — Evaluation Use Only',
      watermark: 'SAMPLE',
      coverStatusChip: 'Sample — Evaluation Use Only',
      footerNote: `${reportId}  ·  Sample — for evaluation use only`,
      coverDisclaimer: 'This document is a sample produced to illustrate AtmosFlow report structure and tone.',
    }
  }
  // A caller still saying mode:'final' means Final, whatever the record's
  // status column happens to hold.
  const effectiveStatus = mode === 'final' ? REPORT_STATUS.FINAL : status
  return reportChrome(profile, effectiveStatus, { reportId, client, reviewer })
}

/**
 * The signature / review block on the closing page.
 *
 * This is where the old "IH Review Required" sentence lived, and it was
 * wrong in the same way the watermark was: it told every reader that the
 * document in their hands still needed a professional before it could be
 * issued, including for screening work that was never going to have one.
 *
 * What replaces it depends on what the report actually is:
 *
 *   • SCREENING — the limitation statement. It states the scope honestly
 *     (measured conditions vs the selected criteria) without implying the
 *     document is unfinished and without claiming a compliance
 *     determination. The screening-only positioning rests here now.
 *   • PROFESSIONAL / COMPLIANCE, once reviewed — the reviewer's
 *     acceptance, signed with THEIR name, credentials and organization,
 *     plus the approval id and review date. Falls back to the assessor
 *     only when no reviewer record exists.
 *   • Anything still in draft or review — says so plainly, without
 *     asserting the report is defective.
 */
function buildReviewBlock({ profile, status, reviewer, meta, firm, reportId, mode }) {
  const stamp = `Report ID ${reportId}  ·  ${meta.reportDate}`
  const r = reviewer || {}
  const reviewed = status === REPORT_STATUS.REVIEWED || status === REPORT_STATUS.FINAL

  // A sample is a marketing artifact, not a report in a lifecycle. Its
  // signature block must agree with its cover — saying "Sample" on the
  // header and "Draft" on the signature reads as a mistake.
  if (mode === 'sample') {
    return {
      statement: SCREENING_LIMITATION,
      signatureName: meta.assessorName,
      signatureTitle: meta.assessorCredentials || 'Assessor of Record',
      signatureFirm: firm,
      signatureMeta: `${stamp}  ·  Sample`,
    }
  }

  if (profile === REPORT_PROFILES.SCREENING) {
    return {
      statement: SCREENING_LIMITATION,
      signatureName: meta.assessorName,
      signatureTitle: meta.assessorCredentials || 'Assessor of Record',
      signatureFirm: firm,
      signatureMeta: reviewed ? stamp : `${stamp}  ·  ${statusLabel(profile, status)}`,
    }
  }

  if (reviewed && r.name) {
    const approval = r.approvalId ? `  ·  Approval ${r.approvalId}` : ''
    const on = r.reviewDate ? `  ·  Reviewed ${r.reviewDate}` : ''
    return {
      statement: 'The undersigned has reviewed the measurements, findings, and recommendations and accepts responsibility for the professional interpretation presented in this report.',
      signatureName: r.name,
      signatureTitle: r.credentials || 'Reviewing Professional',
      signatureFirm: r.organization || firm,
      signatureMeta: `${stamp}${on}${approval}`,
    }
  }

  if (reviewed) {
    // Final without a recorded reviewer: the assessor signs their own
    // work. Do NOT claim a professional review that has no record.
    return {
      statement: 'The undersigned has reviewed the measurements, findings, and recommendations and accepts responsibility for the professional interpretation presented in this report.',
      signatureName: meta.assessorName,
      signatureTitle: meta.assessorCredentials || 'Assessor of Record',
      signatureFirm: firm,
      signatureMeta: stamp,
    }
  }

  return {
    statement: 'This report is in preparation and has not completed professional review. It should not be distributed as a professional opinion in its current form.',
    signatureName: meta.assessorName,
    signatureTitle: meta.assessorCredentials || 'Preparing Assessor',
    signatureFirm: firm,
    signatureMeta: `${stamp}  ·  ${statusLabel(profile, status)}`,
  }
}

/**
 * Assemble the renderer model from raw assessment data: builds the Report
 * JSON (buildReportModel) and clothes it in controlled narrative from the
 * library. Output feeds renderReportPdf (lib/report/render-pdf.js) verbatim.
 * Deterministic and complete without AI; an optional AI pass may later refine
 * the prose under the banned-language gate, never changing facts.
 */
export function assembleRenderModel(data = {}, opts = {}) {
  const rd = buildReportModel(data, opts)
  const meta = rd.reportMeta
  const params = rd.parameters
  const mode = meta.mode
  const firm = meta.companyName
  const reportId = meta.reportId
  // `ps_recipient_org` was a dead key — the question id is
  // `ps_recipient_organization` and the short form appears nowhere else in
  // the codebase, so the organization could never resolve and the report
  // always fell through to the recipient's personal name. Meanwhile
  // validation.js raised a HARD blocker pointing the assessor at "Recipient
  // organization", a field the deliverable then ignored.
  const client = (data.presurvey && (data.presurvey.ps_recipient_organization || data.presurvey.ps_recipient_name)) || null
  const recipient = buildRecipient(data.presurvey)
  const reportProfile = meta.reportProfile || DEFAULT_PROFILE
  const reportStatus = meta.reportStatus || DEFAULT_STATUS
  const reviewer = meta.reviewer || null
  const chrome = modeChrome(mode, reportId, firm, client, reportProfile, reportStatus, reviewer)

  // Findings at a glance (per parameter).
  const findingsAtGlance = Object.values(params).map(pp => ({
    parameter: pp.label, range: `${pp.range} ${pp.unit}`, basis: pp.basis, outcome: OUTCOME_TO_SEV[pp.outcome] || 'ok',
  }))

  // Measurement results rows (+ site mean).
  const resultsRows = rd.zones.map(z => ({
    id: z.id, use: z.use || '', co2: z.co2, co: z.co, t: z.temperature, rh: z.relativeHumidity, pm: z.pm25, tvoc: z.tvoc,
    sev: OUTCOME_TO_SEV[z.outcome] || 'ok',
  }))
  if (resultsRows.length) {
    // The site-mean row's Outcome was hardcoded `sev: 'ok'` — it rendered
    // "Acceptable" whatever the numbers beside it. In a two-zone assessment
    // where BOTH zones read Elevated, the bold summary row under them
    // reported a site mean CO2 of 1762 ppm as Acceptable. It is the last row
    // of the table and the one a client's eye lands on.
    //
    // The outcome now comes from the per-parameter outcomes already computed
    // for "Findings at a glance", worst-first, so the two tables cannot
    // disagree about the same site. `not_evaluated` is skipped rather than
    // ranked: a parameter the engine declined to judge is not evidence of
    // acceptability, and it is not evidence of a problem either.
    const meanSev = SEV_RANK_ORDER.find(s =>
      Object.values(params).some(pp => (OUTCOME_TO_SEV[pp.outcome] || 'ok') === s),
    ) || 'ok'
    resultsRows.push({
      id: 'Site mean', use: '',
      co2: params.co2 ? params.co2.mean : null, co: params.co ? params.co.mean : null, t: params.temperature ? params.temperature.mean : null,
      rh: params.relativeHumidity ? params.relativeHumidity.mean : null, pm: params.pm25 ? params.pm25.mean : null, tvoc: params.tvoc ? params.tvoc.mean : null,
      sev: meanSev, __bold: true,
    })
  }

  // Per-parameter interpretation (what it is + observed), thermal combined.
  // The narrative library's OBSERVED templates branch on the outcome; a
  // parameter the engine did NOT evaluate (a data gap) gets a plain
  // statement of the reading and the gap instead of either verdict branch.
  const observed = (key, s) => s.outcome === 'not_evaluated'
    ? `Observed: ${s.label.toLowerCase()} ranged ${s.range} ${s.unit} (site mean ${s.mean} ${s.unit}). The reading was recorded but not evaluated — see Limitations.`
    : NL.OBSERVED[key](s, s.outcome)
  const interp = []
  if (params.co2) interp.push({ title: 'Carbon dioxide (CO2) — ventilation indicator', body: [`What it is and why we measure it: ${NL.WHAT_IS.co2}`, observed('co2', params.co2)] })
  if (params.co) interp.push({ title: 'Carbon monoxide (CO)', body: [`What it is and why we measure it: ${NL.WHAT_IS.co}`, observed('co', params.co)] })
  if (params.temperature || params.relativeHumidity) {
    const body = [`What it is and why we measure it: ${NL.WHAT_IS.tempRh}`]
    if (params.temperature) body.push(observed('temperature', params.temperature))
    if (params.relativeHumidity) body.push(observed('relativeHumidity', params.relativeHumidity))
    interp.push({ title: 'Thermal comfort — temperature & relative humidity', body })
  }
  if (params.pm25) interp.push({ title: 'Fine particulate (PM2.5)', body: [`What it is and why we measure it: ${NL.WHAT_IS.pm25}`, observed('pm25', params.pm25)] })
  if (params.tvoc) interp.push({ title: 'Total volatile organic compounds (TVOC)', body: [`What it is and why we measure it: ${NL.WHAT_IS.tvoc}`, NL.OBSERVED.tvoc(params.tvoc, params.tvoc.outcome)] })

  // Logger Studio chart images (real assessments embed the PNGs).
  const imageCharts = rd.charts.filter(c => c.type === 'image')
  const src = (data.sensorData && data.sensorData.fileName) || null
  const loggerImages = imageCharts.length ? {
    disclaimer: 'The following timelines were generated from uploaded sensor logger data for documentation and interpretation purposes. Interpretation should be reviewed by a qualified IAQ professional; AtmosFlow does not make compliance determinations.',
    dataSource: src ? `Data source: ${src}` : null,
    images: imageCharts.map(c => ({ title: c.title, imageDataUrl: c.imageDataUrl, caption: c.caption })),
  } : null

  // Peak-CO2-by-zone bar (walkthrough data).
  const bar = rd.charts.find(c => c.type === 'barCo2ByZone')
  const co2Bars = bar && bar.data.length > 1 ? {
    data: bar.data.map(b => ({ zone: b.zone, value: b.value, outcome: OUTCOME_TO_SEV[b.outcome] || 'ok' })),
    threshold: bar.threshold, thresholdLabel: `ASHRAE 62.1 advisory (${bar.threshold} ppm)`,
    caption: 'Highest CO2 reading per area against the ASHRAE 62.1 ventilation indicator. Bar color reflects the screening outcome.',
  } : null

  // Findings table.
  const findingRows = rd.findings.map(f => ({
    z: f.zone, sev: ENGINE_SEV_TO_SEV[f.severity] || 'advisory', basis: f.basis || '—', conf: f.confidence || '—', f: f.text,
  }))

  // Conceptual site model + hypotheses from the primary causal chain.
  const chains = (data.causalChains || []).filter(Boolean)
  const primary = pickPrimaryChain(chains)
  // A source → pathway → receptor model earns its place when the pathways
  // COMPETE — that is the question it answers. On a two-zone survey with one
  // mechanism in play it restates the primary finding in a table, which is
  // what the CIH review meant by "optional for a screening report; include it
  // only when it adds clarity beyond the findings".
  const distinctPathways = new Set(chains.map(c => String(c.type || '').replace(/\s*\(Hypothesis\)\s*$/, '').trim())).size
  const siteModelEarnsIts = distinctPathways > 1 || (data.zones || []).length > 2
  const conceptualModel = primary && siteModelEarnsIts ? {
    intro: 'Following standard IAQ investigation logic, the primary finding is expressed as a source → pathway → receptor chain with its supporting evidence and confidence.',
    heading: `${primary.type || primary.name || 'Primary finding'}${primary.zone ? ` — ${primary.zone}` : ''}`,
    rows: [
      ['Pathway / concern', primary.type || primary.name || '—'],
      ['Receptor (location)', primary.zone || (Array.isArray(primary.contributingZones) ? primary.contributingZones.join(', ') : '—')],
      ['Source & mechanism', primary.rootCause || '—'],
      ['Evidence', Array.isArray(primary.evidence) ? primary.evidence.join('; ') : (primary.evidence || '—')],
      ['Confidence', primary.confidence || (primary.causationSupported ? 'Supported' : 'Screening') ],
    ],
  } : null
  // The primary is already set out in full immediately above, with its own
  // evidence and confidence. Repeating its root cause as the first bullet of
  // the list below said the same thing twice — and when the primary was
  // picked by array order it was the ONLY chain stated twice while a stronger
  // one went unmentioned.
  // Deduped by the sentence, because a hypothesis is a statement about a
  // MECHANISM and the chains are built per zone: two zones with the same
  // concealed-moisture hypothesis produce two chains carrying identical
  // rootCause text, and the list printed the sentence twice. The zones are
  // named in the pathway table, not here.
  const secondary = chains.filter(c => c !== primary)
  const items = [...new Set(secondary.map(c =>
    `${c.rootCause || c.name || c.type}${c.refutableBy ? ` Verification: ${c.refutableBy}` : ''}`,
  ))]
  const workingHypotheses = items.length ? {
    intro: 'The data support the hypotheses below. None is a confirmed cause; each names the verification it requires.',
    items: items.slice(0, 4),
  } : null

  // QA/QC as bullet strings; limitations already paragraph strings.
  const qaQc = rd.qaQc.map(q => `${q.label}: ${q.value}`)

  // References as [ref, basis, usage] tuples. `usage` says what in this
  // report cited the reference (the renderer prefers it); `basis` is the
  // standing description where one exists. Nothing here adds a row on its
  // own — see collectReferenceUsage.
  const references = rd.references.map(ref => [ref, REF_BASIS[ref] || 'Cited by a finding or an evaluated measurement in this report.', rd.referenceUsage[ref]])

  // Photos.
  let photos = null
  const pObj = data.photos || {}
  const pItems = []
  // Photos are keyed `z{zoneIndex}-{fieldId}`. The caption used to be that key
  // run through a title-caser, which stripped the zone prefix and rendered a
  // zone-3 mould photo as literally "Mi" — a field code, in a client report.
  // `photoCaption` resolves the label from FIELD_REGISTRY, and thus from the
  // question the assessor actually answered, and names the zone.
  //
  // Ordered by zone, then by the order the photo questions appear in the
  // walkthrough, so the appendix reads as a walk through the building rather
  // than in whatever order the keys happened to land.
  const PHOTO_FIELD_ORDER = ['wd', 'mi', 'dp']
  Object.keys(pObj)
    .map((k) => ({ k, parsed: parsePhotoKey(k) }))
    .filter((e) => e.parsed)
    .sort((a, b) => (a.parsed.zoneIndex - b.parsed.zoneIndex)
      || (PHOTO_FIELD_ORDER.indexOf(a.parsed.fieldId) - PHOTO_FIELD_ORDER.indexOf(b.parsed.fieldId))
      || a.parsed.fieldId.localeCompare(b.parsed.fieldId))
    .forEach(({ k }) => (pObj[k] || []).forEach(ph => {
      if (!ph || !ph.src || pItems.length >= 8) return
      // `sub` stays deterministic on purpose. The photo's AI analysis is NOT
      // rendered here: it is model-authored prose, and the DOCX AI-provenance
      // banner (`aiProvenanceBanner`, sections-core.js) has had no production
      // importer since the consultant report was removed. Putting AI text into
      // a client report before the label that marks it renders is the defect
      // this codebase keeps re-learning.
      pItems.push({
        title: photoCaption(k, data.zones) || k,
        sub: ph.ts ? new Date(ph.ts).toLocaleString() : '',
        imageDataUrl: ph.src,
      })
    }))
  if (pItems.length) photos = { intro: 'Field photographs captured during the assessment.', items: pItems }
  else photos = { intro: 'No project photographs were uploaded.', items: [] }

  const flagged = rd.findings.length
  const elevatedZones = [...new Set(rd.findings.filter(f => f.severity === 'critical' || f.severity === 'high').map(f => f.zone))]

  const review = buildReviewBlock({
    profile: reportProfile,
    status: mode === 'final' ? REPORT_STATUS.FINAL : reportStatus,
    reviewer,
    meta,
    firm,
    reportId,
    mode,
  })

  return {
    meta: {
      docTitle: `AtmosFlow — IAQ Assessment Report — ${meta.facilityName}`,
      reportTitle: 'Indoor Air Quality Assessment Report',
      coverSubtitle: 'Direct-reading evaluation of carbon dioxide, comfort, and particulate / VOC indicators',
      coverRows: [
        ['Facility', meta.facilityName], ['Address', meta.address || '—'], ['Scope', meta.scope || `${rd.projectSummary.numberOfZones} area(s)`],
        // Who the report is FOR. A consultant report with no addressee
        // anywhere is not a deliverable, and until now the client appeared in
        // exactly one place — the footer of a Final-status report — so a draft
        // named nobody at all. Omitted rather than shown empty when the
        // recipient fields have not been filled in; the readiness panel is
        // already asking for them.
        ...(recipient.organization ? [['Prepared for', recipient.organization]] : []),
        ...(recipient.attention ? [['Attention', recipient.attention]] : []),
        ['Assessment date', meta.assessmentDate], ['Assessor of record', `${meta.assessorName}${meta.assessorCredentials ? `, ${meta.assessorCredentials}` : ''}`], ['Report ID', reportId],
      ],
      coverFooter: 'Not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.',
      firm, brandColor: meta.brandColor,
      // Carried onto the assembled model so downstream consumers (the
      // PDF renderer, the UI status badge, the client portal) read the
      // lifecycle from the model rather than re-deriving it.
      reportProfile, reportStatus, reviewer,
      ...chrome,
    },
    // The addressee block, or null when no recipient details were entered.
    // The renderer omits the section rather than printing an empty heading.
    recipient: recipient.lines && recipient.lines.length ? recipient : null,
    execSummary: NL.buildExecSummary({
      firm, facility: meta.facilityName, date: meta.assessmentDate,
      numberOfZones: rd.projectSummary.numberOfZones,
      purpose: rd.projectSummary.assessmentPurpose,
      flaggedCount: flagged, topOutcome: null,
      hasOccupantReports: (data.zones || []).some(z => z && z.cx === 'Yes — complaints reported'),
      // The conclusion the rest of the report supports, named once, at the
      // top. `primary` is the strongest causal chain (pickPrimaryChain).
      conclusion: primary
        ? `The leading explanation is ${String(primary.type).replace(/\s*\(Hypothesis\)\s*$/, '').toLowerCase()} in ${primary.zone || 'the assessed area'} — ${String(primary.confidence || 'Possible').toLowerCase()} confidence on the evidence gathered.`
        : null,
      // The substance a count cannot carry: the worst findings, and the
      // actions that open the register. Already ranked upstream.
      // `headline` trims a finding to its claim. The full CO2 finding runs to
      // three sentences of methodological caveat, which is right in the
      // findings table and wrong in a summary the CIH review asked to be "3–5
      // substantive findings" — a 60-word bullet is not a summary.
      leadFindings: findingRows.slice(0, 4).map(f => `${f.z} — ${headline(f.f)}`),
      // From the REGISTER, not the flattened bullet strings, so the summary
      // and section 6 phrase the same action the same way — including having
      // the unmapped-equipment caveat out of the action text.
      leadActions: actionRegister(data.recs || {})
        .filter(r => r.priority === 'Immediate')
        .slice(0, 3)
        .map(r => `${r.location}: ${r.action}`),
    }),
    findingsAtGlance,
    showSeverityLegend: true,
    severityLegendNote: NL.SEVERITY_LEGEND_NOTE,
    overallStatement: NL.buildOverallStatement({ flaggedCount: flagged, elevatedZones, totalZones: rd.projectSummary.numberOfZones }),
    scope: {
      paras: [
        `The assessment covered ${rd.projectSummary.numberOfZones} zone${rd.projectSummary.numberOfZones === 1 ? '' : 's'} at ${meta.facilityName}${rd.projectSummary.buildingDescription ? ` (${rd.projectSummary.buildingDescription})` : ''}${rd.projectSummary.hvacDescription ? `, served by ${rd.projectSummary.hvacDescription}` : ''}. ${rd.projectSummary.assessmentPurpose ? `The assessment was prompted by ${String(rd.projectSummary.assessmentPurpose).toLowerCase()}.` : ''}`.trim(),
        'The objective was to characterize indoor air quality indicators, confirm whether observed conditions fall within recognized comfort and ventilation references, identify any zones warranting follow-up, and provide a defensible, prioritized action list.',
      ],
      showFloorPlanSchematic: false,
    },
    methodology: {
      bullets: NL.methodologyBullets(
        data.presurvey && data.presurvey.ps_inst_iaq,
        data.presurvey && data.presurvey.ps_inst_iaq_cal_status,
        (data.zones || []).map(z => z && z.meas_duration).filter(Boolean),
      ),
      referenceFramework: NL.REFERENCE_FRAMEWORK,
    },
    results: {
      intro: 'The table below summarizes representative occupied-hours readings by zone, with the site arithmetic mean for context. Values are direct-reading measurements; the averaging period recorded for each zone is stated under Methodology.',
      rows: resultsRows,
      note: resultsRows.length ? 'Site mean is the arithmetic mean of the measured zones. Outcome reflects the zone’s governing parameter.' : null,
      perParamIntro: 'Each indicator below is introduced briefly — what it is and why it is measured — followed by what was observed at this site.',
      parameters: interp,
    },
    loggerImages,
    co2Bars,
    findings: findingRows.length ? {
      intro: 'Findings are ranked by recommended response. Basis states whether a finding rests on an instrument reading or on an observation made during the walkthrough. No finding constitutes a regulatory exposure determination.',
      rows: findingRows,
    } : null,
    conceptualModel,
    workingHypotheses,
    // Observations come BEFORE measurements in the rendered order: the
    // investigation is read as walkthrough → readings → interpretation.
    observations: buildObservations(data),
    recommendations: {
      intro: 'Recommendations follow a verify-before-invest ladder: confirm the suspected cause, correct it, re-test, and only then consider permanent monitoring or capital changes.',
      immediate: rd.recommendations.immediate,
      shortTerm: rd.recommendations.shortTerm,
      mediumTerm: rd.recommendations.mediumTerm,
      // One register instead of three bullet lists. Carries what the data
      // supports; see actionRegister for what it deliberately does not.
      register: actionRegister(data.recs || {}),
      registerNote: 'Responsible party and target date are for the client to assign; AtmosFlow records neither.',
    },
    qaQc,
    limitations: rd.limitations,
    review,
    references,
    photos,
  }
}
