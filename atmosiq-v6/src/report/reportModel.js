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
import { parsePhotoKey, photoCaption } from '../utils/photoIndex.js'
import { actionLine } from '../utils/recFormatting'
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

/** Standard limitations + project-specific additions. */
export function buildLimitations(data) {
  const base = [
    'Reflects conditions on the assessment date only.',
    'Not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.',
    'Direct-reading instruments are indicative tools; TVOC and PM2.5 are non-specific indicators.',
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
      assessmentDate: data.ts ? fmt(new Date(data.ts)) : fmt(now),
      reportDate: fmt(now),
      assessorName: profile.name || ps.ps_assessor || 'Assessor',
      assessorCredentials: (profile.certs || []).join(', '),
      companyName: profile.firm || 'Prudence Safety & Environmental Consulting, LLC',
      reportId: data.id || `AIQ-${Date.now().toString(36).toUpperCase().slice(-6)}`,
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
  const client = (data.presurvey && (data.presurvey.ps_recipient_org || data.presurvey.ps_recipient_name)) || null
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
