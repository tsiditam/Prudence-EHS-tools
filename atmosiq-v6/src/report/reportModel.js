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
import * as NL from './narrativeLibrary'

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

// ── Render-model assembly (Report JSON + narrative library → renderer) ──

const OUTCOME_TO_SEV = { acceptable: 'ok', advisory: 'advisory', elevated: 'elevated', priority: 'priority' }
const ENGINE_SEV_TO_SEV = { critical: 'priority', high: 'elevated', medium: 'advisory', low: 'ok', pass: 'ok', info: 'ok' }
const REF_BASIS = {
  'ASHRAE 62.1-2025': 'Ventilation and Acceptable Indoor Air Quality. Ventilation-indicator basis for CO2 (prescribes airflow, not a CO2 limit).',
  'ASHRAE 55-2023': 'Thermal Environmental Conditions for Human Occupancy. Comfort envelope for temperature and relative humidity.',
  'US EPA NAAQS': 'National Ambient Air Quality Standards. CO 9 ppm (8-hr); PM2.5 35 µg/m³ (24-hr). Outdoor/population standards, cited for context.',
  'OSHA PELs (29 CFR 1910.1000)': 'Permissible Exposure Limits. CO PEL 50 ppm (8-hr TWA); CO2 PEL 5,000 ppm (industrial context).',
}
const titleCaseKey = (k) => String(k).replace(/^z\d+-/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

function modeChrome(mode, reportId, firm, client) {
  if (mode === 'sample') return { headerLabel: 'Sample — Evaluation Use Only', watermark: 'SAMPLE', coverStatusChip: 'Sample — Evaluation Use Only', footerNote: `${reportId}  ·  Sample — for evaluation use only`, coverDisclaimer: 'This document is a sample produced to illustrate AtmosFlow report structure and tone.' }
  if (mode === 'final') return { headerLabel: 'Confidential — Final', watermark: null, coverStatusChip: 'Final', footerNote: `${reportId}  ·  Confidential — prepared for ${client || 'the client'}`, coverDisclaimer: null }
  return { headerLabel: 'Draft — IH Review Required', watermark: 'DRAFT', coverStatusChip: 'Draft — IH Review Required', footerNote: `${reportId}  ·  Draft — pending professional review`, coverDisclaimer: 'This draft has not been finalized and should not be distributed as a professional opinion.' }
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
  const client = (data.presurvey && (data.presurvey.ps_recipient_org || data.presurvey.ps_recipient_name)) || null
  const chrome = modeChrome(mode, reportId, firm, client)

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
    resultsRows.push({
      id: 'Site mean', use: '',
      co2: params.co2 ? params.co2.mean : null, co: params.co ? params.co.mean : null, t: params.temperature ? params.temperature.mean : null,
      rh: params.relativeHumidity ? params.relativeHumidity.mean : null, pm: params.pm25 ? params.pm25.mean : null, tvoc: params.tvoc ? params.tvoc.mean : null,
      sev: 'ok', __bold: true,
    })
  }

  // Per-parameter interpretation (what it is + observed), thermal combined.
  const interp = []
  if (params.co2) interp.push({ title: 'Carbon dioxide (CO2) — ventilation indicator', body: [`What it is and why we measure it: ${NL.WHAT_IS.co2}`, NL.OBSERVED.co2(params.co2, params.co2.outcome)] })
  if (params.co) interp.push({ title: 'Carbon monoxide (CO)', body: [`What it is and why we measure it: ${NL.WHAT_IS.co}`, NL.OBSERVED.co(params.co, params.co.outcome)] })
  if (params.temperature || params.relativeHumidity) {
    const body = [`What it is and why we measure it: ${NL.WHAT_IS.tempRh}`]
    if (params.temperature) body.push(NL.OBSERVED.temperature(params.temperature, params.temperature.outcome))
    if (params.relativeHumidity) body.push(NL.OBSERVED.relativeHumidity(params.relativeHumidity, params.relativeHumidity.outcome))
    interp.push({ title: 'Thermal comfort — temperature & relative humidity', body })
  }
  if (params.pm25) interp.push({ title: 'Fine particulate (PM2.5)', body: [`What it is and why we measure it: ${NL.WHAT_IS.pm25}`, NL.OBSERVED.pm25(params.pm25, params.pm25.outcome)] })
  if (params.tvoc) interp.push({ title: 'Total volatile organic compounds (TVOC)', body: [`What it is and why we measure it: ${NL.WHAT_IS.tvoc}`, NL.OBSERVED.tvoc(params.tvoc, params.tvoc.outcome)] })

  // Logger Studio chart images (real assessments embed the PNGs).
  const imageCharts = rd.charts.filter(c => c.type === 'image')
  const src = (data.sensorData && data.sensorData.fileName) || null
  const loggerImages = imageCharts.length ? {
    disclaimer: 'The following timelines were generated from uploaded sensor logger data for screening and documentation purposes. Interpretation should be reviewed by a qualified IAQ professional; AtmosFlow does not make compliance determinations.',
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
    z: f.zone, sev: ENGINE_SEV_TO_SEV[f.severity] || 'advisory', conf: f.confidence || '—', f: f.text,
  }))

  // Conceptual site model + hypotheses from the primary causal chain.
  const chains = (data.causalChains || []).filter(Boolean)
  const primary = chains[0]
  const conceptualModel = primary ? {
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
  const workingHypotheses = chains.length ? {
    intro: 'The screening data support the hypotheses below. None is a confirmed cause; each names the verification it requires.',
    items: chains.slice(0, 4).map(c => `${c.rootCause || c.name || c.type}${c.refutableBy ? ` Verification: ${c.refutableBy}` : ''}`),
  } : null

  // QA/QC as bullet strings; limitations already paragraph strings.
  const qaQc = rd.qaQc.map(q => `${q.label}: ${q.value}`)

  // References as [ref, basis] pairs.
  const references = rd.references.map(ref => [ref, REF_BASIS[ref] || 'Referenced in screening interpretation.'])

  // Photos.
  let photos = null
  const pObj = data.photos || {}
  const pItems = []
  Object.keys(pObj).forEach(k => (pObj[k] || []).forEach(ph => { if (ph && ph.src && pItems.length < 8) pItems.push({ title: titleCaseKey(k), sub: '', imageDataUrl: ph.src }) }))
  if (pItems.length) photos = { intro: 'Field photographs captured during the assessment.', items: pItems }
  else photos = { intro: 'No project photographs were uploaded.', items: [] }

  const flagged = rd.findings.length
  const elevatedZones = [...new Set(rd.findings.filter(f => f.severity === 'critical' || f.severity === 'high').map(f => f.zone))]

  const review = mode === 'final'
    ? { statement: 'The undersigned has reviewed the measurements, findings, and recommendations and accepts responsibility for the professional interpretation presented in this report.', signatureName: meta.assessorName, signatureTitle: meta.assessorCredentials || 'Reviewing Professional', signatureFirm: firm, signatureMeta: `Report ID ${reportId}  ·  ${meta.reportDate}` }
    : { statement: 'This report was generated by AtmosFlow from the assessment data and requires review by a qualified industrial hygienist or EHS professional before issuance. IH Review Required.', signatureName: meta.assessorName, signatureTitle: meta.assessorCredentials || 'Preparing Assessor', signatureFirm: firm, signatureMeta: `Report ID ${reportId}  ·  ${meta.reportDate}  ·  Draft` }

  return {
    meta: {
      docTitle: `AtmosFlow — IAQ Assessment Report — ${meta.facilityName}`,
      reportTitle: 'Screening-Level IAQ Assessment Report',
      coverSubtitle: 'Direct-reading evaluation of carbon dioxide, comfort, and particulate / VOC indicators',
      coverRows: [
        ['Facility', meta.facilityName], ['Address', meta.address || '—'], ['Scope', meta.scope || `${rd.projectSummary.numberOfZones} area(s)`],
        ['Assessment date', meta.assessmentDate], ['Assessor of record', `${meta.assessorName}${meta.assessorCredentials ? `, ${meta.assessorCredentials}` : ''}`], ['Report ID', reportId],
      ],
      coverFooter: 'Screening-level evaluation — not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.',
      firm, brandColor: meta.brandColor,
      ...chrome,
    },
    execSummary: NL.buildExecSummary({ firm, facility: meta.facilityName, date: meta.assessmentDate, numberOfZones: rd.projectSummary.numberOfZones, purpose: rd.projectSummary.assessmentPurpose, flaggedCount: flagged, topOutcome: null }),
    findingsAtGlance,
    showSeverityLegend: true,
    severityLegendNote: NL.SEVERITY_LEGEND_NOTE,
    overallStatement: NL.buildOverallStatement({ flaggedCount: flagged, elevatedZones }),
    scope: {
      paras: [
        `The assessment covered ${rd.projectSummary.numberOfZones} zone${rd.projectSummary.numberOfZones === 1 ? '' : 's'} at ${meta.facilityName}${rd.projectSummary.buildingDescription ? ` (${rd.projectSummary.buildingDescription})` : ''}${rd.projectSummary.hvacDescription ? `, served by ${rd.projectSummary.hvacDescription}` : ''}. ${rd.projectSummary.assessmentPurpose ? `The assessment was prompted by ${String(rd.projectSummary.assessmentPurpose).toLowerCase()}.` : ''}`.trim(),
        'The objective was a screening characterization of indoor air quality indicators to confirm whether observed conditions fall within recognized comfort and ventilation references, identify any zones warranting follow-up, and provide a defensible, prioritized action list.',
      ],
      showFloorPlanSchematic: false,
    },
    methodology: {
      bullets: NL.methodologyBullets(data.presurvey && data.presurvey.ps_inst_iaq, data.presurvey && data.presurvey.ps_inst_iaq_cal_status),
      referenceFramework: NL.REFERENCE_FRAMEWORK,
    },
    results: {
      intro: 'The table below summarizes representative occupied-hours readings by zone, with the site arithmetic mean for context. Values are direct-reading grab measurements unless otherwise noted.',
      rows: resultsRows,
      note: resultsRows.length ? 'Site mean is the arithmetic mean of the measured zones. Outcome reflects the zone’s governing parameter.' : null,
      perParamIntro: 'Each indicator below is introduced briefly — what it is and why it is measured — followed by what was observed at this site.',
      parameters: interp,
    },
    loggerImages,
    co2Bars,
    findings: findingRows.length ? {
      intro: 'Findings are screening observations, ranked by recommended response and carried with a confidence rating. No finding constitutes a regulatory exposure determination.',
      rows: findingRows,
    } : null,
    conceptualModel,
    workingHypotheses,
    recommendations: {
      intro: 'Recommendations follow a verify-before-invest ladder: confirm the suspected cause, correct it, re-test, and only then consider permanent monitoring or capital changes.',
      immediate: rd.recommendations.immediate,
      shortTerm: rd.recommendations.shortTerm,
      mediumTerm: rd.recommendations.mediumTerm,
    },
    qaQc,
    limitations: rd.limitations,
    review,
    references,
    about: { title: 'Appendix B — About AtmosFlow', text: NL.ABOUT_ATMOSFLOW },
    photos,
  }
}
