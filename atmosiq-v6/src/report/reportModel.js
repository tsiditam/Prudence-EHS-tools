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
 * recs, causalChains) and recognized reference values from STD — it does not
 * score, and it does not modify any engine file. Per-parameter screening
 * outcomes are threshold comparisons against STD (the single source of truth
 * for thresholds), framed as screening indicators, never compliance verdicts.
 */

import { STD } from '../constants/standards'
import { actionLine } from '../utils/recFormatting'

// Zone measurement keys (question ids) → model parameter keys.
const PARAMS = [
  { key: 'co2', zoneKey: 'co2', label: 'Carbon dioxide (CO2)', unit: 'ppm', basis: 'ASHRAE 62.1 ventilation indicator' },
  { key: 'co', zoneKey: 'co', label: 'Carbon monoxide (CO)', unit: 'ppm', basis: 'US EPA NAAQS / OSHA PEL' },
  { key: 'temperature', zoneKey: 'tf', label: 'Temperature', unit: '°F', basis: 'ASHRAE 55 comfort envelope' },
  { key: 'relativeHumidity', zoneKey: 'rh', label: 'Relative humidity', unit: '%', basis: 'ASHRAE 55 (30–60%)' },
  { key: 'pm25', zoneKey: 'pm', label: 'Fine particulate (PM2.5)', unit: 'µg/m³', basis: 'US EPA NAAQS (context)' },
  { key: 'tvoc', zoneKey: 'tv', label: 'Total VOCs (TVOC)', unit: 'µg/m³', basis: 'Mølhave (1991) advisory' },
]

const OUTCOME = { acceptable: 0, advisory: 1, elevated: 2 }
const OUTCOME_LABEL = ['Acceptable', 'Advisory', 'Elevated']

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function stats(values) {
  const v = values.filter(x => x !== null)
  if (!v.length) return null
  const min = Math.min(...v), max = Math.max(...v)
  const mean = Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10
  return { min, max, mean, n: v.length }
}

// Threshold-based screening outcome per parameter (worst across the range).
function paramOutcome(key, s) {
  if (!s) return null
  const { min, max } = s
  switch (key) {
    case 'co2': return max >= STD.v.co2.con ? 'elevated' : max >= 800 ? 'advisory' : 'acceptable'
    case 'co': return max >= STD.c.co.osha ? 'elevated' : max >= STD.c.co.epa ? 'advisory' : 'acceptable'
    case 'temperature': return (max > STD.t.temp.summer.max || min < STD.t.temp.summer.min) ? 'advisory' : 'acceptable'
    case 'relativeHumidity': return (max > 70 || min < 20) ? 'elevated' : (max > STD.t.rh.max || min < STD.t.rh.min) ? 'advisory' : 'acceptable'
    case 'pm25': return max >= STD.c.pm25.epa ? 'elevated' : max >= STD.c.pm25.who ? 'advisory' : 'acceptable'
    case 'tvoc': return max >= STD.c.tvoc.act ? 'elevated' : max >= STD.c.tvoc.con ? 'advisory' : 'acceptable'
    default: return 'acceptable'
  }
}

const zoneName = (zoneScores, zones, i) =>
  (zoneScores[i] && zoneScores[i].zoneName) || (zones[i] && zones[i].zn) || `Zone ${i + 1}`

/** Per-parameter summary: { range, mean, unit, basis, outcome } for measured params. */
export function summarizeParameters(zones = []) {
  const out = {}
  for (const p of PARAMS) {
    const s = stats(zones.map(z => num(z && z[p.zoneKey])))
    if (!s) continue
    out[p.key] = {
      label: p.label, unit: p.unit, basis: p.basis,
      min: s.min, max: s.max, mean: s.mean, n: s.n,
      range: s.min === s.max ? `${s.min}` : `${s.min}–${s.max}`,
      outcome: paramOutcome(p.key, s),
    }
  }
  return out
}

/** Per-zone measurement rows with a governing (worst-parameter) outcome. */
export function zoneRows(zones = [], zoneScores = []) {
  return zones.map((z, i) => {
    let worst = -1
    const cells = {}
    for (const p of PARAMS) {
      const val = num(z && z[p.zoneKey])
      cells[p.key] = val
      if (val !== null) {
        const oc = paramOutcome(p.key, { min: val, max: val })
        if (OUTCOME[oc] > worst) worst = OUTCOME[oc]
      }
    }
    return {
      id: zoneName(zoneScores, zones, i),
      use: (z && (z.zt || z.zuse)) || '',
      ...cells,
      outcome: worst >= 0 ? OUTCOME_LABEL[worst].toLowerCase() : 'acceptable',
    }
  })
}

/** Peak CO2 by zone (for the bar chart) — { zone, value, outcome }. */
export function peakCo2ByZone(zones = [], zoneScores = []) {
  return zones.map((z, i) => {
    const value = num(z && z.co2)
    return value === null ? null : { zone: zoneName(zoneScores, zones, i), value, outcome: paramOutcome('co2', { min: value, max: value }) }
  }).filter(Boolean)
}

/** Flagged findings (critical/high/medium) from engine zone scores. */
export function collectFindings(zoneScores = []) {
  const FLAG = new Set(['critical', 'high', 'medium'])
  const rows = []
  for (const zs of zoneScores) {
    for (const cat of (zs.cats || [])) {
      for (const r of (cat.r || [])) {
        if (!FLAG.has(r.sev)) continue
        rows.push({ zone: zs.zoneName || 'Zone', category: cat.l, severity: r.sev, text: r.t, std: r.std || null, confidence: zs.confidence || null })
      }
    }
  }
  const rank = { critical: 0, high: 1, medium: 2 }
  return rows.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
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

/** Distinct references cited in findings + causal chains, plus the base set. */
export function collectReferences(findings = [], causalChains = []) {
  const set = new Set()
  findings.forEach(f => { if (f.std) set.add(f.std) })
  ;(causalChains || []).forEach(c => { const s = c.std || c.citation; if (s) set.add(s) })
  ;['ASHRAE 62.1-2025', 'ASHRAE 55-2023', 'US EPA NAAQS', 'OSHA PELs (29 CFR 1910.1000)'].forEach(s => set.add(s))
  return [...set]
}

/** QA/QC manifest from presurvey instrument fields; missing → disclosed. */
export function buildQaQc(presurvey = {}) {
  const NA = 'Not documented in project record.'
  const f = (v) => (v && String(v).trim()) || NA
  return [
    { label: 'Instrument', value: f(presurvey.ps_inst_iaq) },
    { label: 'Serial number', value: f(presurvey.ps_inst_iaq_serial) },
    { label: 'Calibration', value: presurvey.ps_inst_iaq_cal_status ? `${presurvey.ps_inst_iaq_cal_status}${presurvey.ps_inst_iaq_cal ? ` (${presurvey.ps_inst_iaq_cal})` : ''}` : NA },
    { label: 'Assessor review', value: 'Draft — requires qualified-professional review before issuance.' },
  ]
}

/** Standard screening limitations + project-specific additions. */
export function buildLimitations(data) {
  const base = [
    'Screening-level evaluation reflecting conditions on the assessment date only.',
    'Not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.',
    'Direct-reading instruments are screening tools; TVOC and PM2.5 are non-specific indicators.',
  ]
  const extra = []
  const hasLogger = !!(data.sensorData && data.sensorData.graphs && Object.values(data.sensorData.graphs).some(g => g && g.include))
  if (!hasLogger) extra.push('No continuous logger data was collected; values reflect grab readings during the site visit.')
  if (!(data.zones || []).some(z => num(z && z.co2) !== null)) extra.push('Limited quantitative measurements were available for this assessment.')
  return [...base, ...extra]
}

export function buildReportModel(data = {}, opts = {}) {
  const bldg = data.building || {}
  const ps = data.presurvey || {}
  const zones = data.zones || []
  const zoneScores = data.zoneScores || []
  const profile = data.profile || {}
  const now = new Date()
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const findings = collectFindings(zoneScores)

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
      reportTitle: 'Indoor Air Quality — Screening Summary',
      facilityName: bldg.fn || 'Facility',
      address: bldg.fl || '',
      scope: (zones.length ? `${zones.length} area${zones.length === 1 ? '' : 's'}` : ''),
      assessmentDate: data.ts ? fmt(new Date(data.ts)) : fmt(now),
      reportDate: fmt(now),
      assessorName: profile.name || ps.ps_assessor || 'Assessor',
      assessorCredentials: (profile.certs || []).join(', '),
      companyName: profile.firm || 'Prudence Safety & Environmental Consulting, LLC',
      reportId: data.id || `AIQ-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      mode: opts.mode || 'draft', // 'draft' | 'final' | 'sample'
      brandColor: opts.brandColor || profile.brandColor || '#0E7490',
    },
    projectSummary: {
      assessmentPurpose: ps.ps_reason || '',
      buildingDescription: [bldg.ft, bldg.ba ? `built ~${bldg.ba}` : null].filter(Boolean).join(', '),
      hvacDescription: bldg.ht || '',
      numberOfZones: zones.length,
    },
    parameters: summarizeParameters(zones),
    zones: zoneRows(zones, zoneScores),
    findings,
    recommendations: recommendationsByTimeframe(data.recs || {}),
    charts,
    photos: data.photos || {},
    qaQc: buildQaQc(ps),
    limitations: buildLimitations(data),
    references: collectReferences(findings, data.causalChains || []),
    composite: data.comp || null,
  }
}
