/**
 * AtmosFlow DOCX Report — Technical Report Sections (Internal Use)
 *
 * Lean internal-triage layout. No cover page, no prose narrative — a
 * one-line header block followed by compact tables and an internal
 * analyst-notes block. Screening-only positioning still holds even in
 * the internal document (no compliance determinations).
 *
 * Structure (per the technical-report redesign):
 *   1. Header block (one line)            buildTechnicalHeader
 *   2. Scope & Conditions (T1, merged)    buildScopeConditions
 *   3. Instrumentation & Calibration (T2) buildInstrumentation
 *   4. Benchmarks Used (T3, measured only)buildBenchmarksUsed
 *   5. Results: matrix + figure panel (T4)buildResults
 *   6. Flagged Indicators (T5)            buildFlaggedIndicators
 *   7. Analyst Notes (internal only)      buildAnalystNotes
 *   8. Limitations + IH-Review (~3 lines) buildLimitationsCompact
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx'
import { FONTS, COLORS, SEV_COLORS, scoreColor, riskLabel } from './styles'
import { buildTable, kvTable } from './tables'
import { BENCHMARK_ROWS } from './canonical-content'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 20, color: opts.color || COLORS.sub, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

// Does the assessor hold a CIH credential on file? Drives the
// requires_cih_review flag — a CSP (e.g. CSP #38426) is not a CIH, so a
// screening assessment still requires CIH sign-off before external use.
const hasCIH = (ctx) => (ctx.assessorCerts || []).some(c => /\bCIH\b/i.test(String(c)))

const RED = SEV_COLORS.critical || COLORS.body
const AMBER = SEV_COLORS.high || COLORS.body

// ── 1. Header block (one line, not a cover page) ──
export function buildTechnicalHeader(ctx) {
  const certs = (ctx.assessorCerts || []).filter(Boolean).join(', ')
  const assessorLine = certs ? `${ctx.assessor}, ${certs}` : ctx.assessor
  const cihFlag = hasCIH(ctx) ? 'CIH review: on file (sign-off required)' : 'requires_cih_review: TRUE'
  return [
    new Paragraph({
      spacing: { after: 30 },
      children: [
        new TextRun({ text: ctx.facilityName, bold: true, size: 22, color: COLORS.body, font: FONTS.body }),
        new TextRun({ text: `  ·  ID ${ctx.reportId}  ·  ${ctx.assessDate}  ·  ${assessorLine}`, size: 17, color: COLORS.sub, font: FONTS.body }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { color: 'D0D5DD', size: 6, space: 6, style: BorderStyle.SINGLE } },
      children: [
        new TextRun({ text: 'INTERNAL USE ONLY', bold: true, size: 16, color: RED, font: FONTS.body }),
        new TextRun({ text: `   ·   ${cihFlag}   ·   AtmosFlow engine v${ctx.version}`, size: 15, color: COLORS.muted, font: FONTS.body }),
      ],
    }),
  ]
}

// ── 2. Scope & Conditions → T1 (merged, one compact table) ──
export function buildScopeConditions(ctx) {
  const ps = ctx.presurvey || {}
  const bldg = ctx.building || {}
  const occTotal = (ctx.zones || []).reduce((n, z) => n + (parseInt(z.oc, 10) || 0), 0)
  const occStr = occTotal > 0
    ? `${occTotal} occupant${occTotal !== 1 ? 's' : ''} across ${ctx.zoneCount} zone${ctx.zoneCount !== 1 ? 's' : ''}`
    : 'Not recorded'
  const oz = (ctx.zones || []).find(z => z.tfo || z.rho)
  const wxTemp = oz ? [oz.tfo ? `${oz.tfo}°F` : null, oz.rho ? `${oz.rho}% RH` : null].filter(Boolean).join(', ') : ''
  const wxSky = [ps.wx_sky, ps.wx_precip && ps.wx_precip !== 'None in past 48 hours' ? ps.wx_precip : null].filter(Boolean).join('; ')
  const weather = [wxSky, wxTemp].filter(Boolean).join(' · ') || 'Not recorded'
  return [
    p('Scope & Conditions', { heading: HeadingLevel.HEADING_2 }),
    kvTable([
      ['Assessment date', ctx.assessDate],
      ['Address', ctx.address],
      ['Facility type', bldg.ft || 'Not recorded'],
      ['Zones assessed', `${ctx.zoneCount} — ${(ctx.zoneNames || []).join(', ') || 'none'}`],
      ['Occupancy', occStr],
      ['HVAC type', bldg.ht || ps.ht || 'Not recorded'],
      ['Outdoor weather', weather],
      ['Assessment trigger', ctx.reason || 'Not specified'],
    ]),
  ]
}

// ── 3. Instrumentation & Calibration → T2 (kept — provenance) ──
export function buildInstrumentation(ctx) {
  const children = [p('Instrumentation & Calibration', { heading: HeadingLevel.HEADING_2 })]
  const instruments = []
  if (ctx.instrument) instruments.push(['Primary IAQ Meter', ctx.instrument, ctx.instrumentSerial || '—', ctx.presurvey?.ps_inst_iaq_cal || '—', ctx.calibration])
  if (ctx.pidMeter) instruments.push(['PID / VOC Meter', ctx.pidMeter, '—', '—', ctx.pidCal || '—'])
  if (ctx.presurvey?.ps_inst_other) instruments.push(['Other', ctx.presurvey.ps_inst_other, '—', '—', '—'])

  if (instruments.length === 0) {
    children.push(p('No instruments documented. Findings from this assessment have reduced defensibility.', { italics: true, color: AMBER }))
  } else {
    children.push(buildTable(
      [{ text: 'Type', width: 18 }, { text: 'Make / Model', width: 28 }, { text: 'Serial', width: 16 }, { text: 'Last Cal Date', width: 16 }, { text: 'Cal Status', width: 22 }],
      instruments.map(row => row.map(v => ({ text: v, size: 18 })))
    ))
  }
  return children
}

// ── 4. Benchmarks Used → T3 (only the parameters actually measured) ──
const benchParam = (label) =>
  label.startsWith('CO₂') ? 'co2' :
  label.startsWith('Temperature') ? 'tf' :
  label.startsWith('Relative Humidity') ? 'rh' :
  label.startsWith('PM2.5') ? 'pm' :
  label.startsWith('CO (') ? 'co' :
  label.startsWith('HCHO') ? 'hc' :
  label.startsWith('TVOC') ? 'tv' : null

export function buildBenchmarksUsed(ctx) {
  const children = [p('Benchmarks Used', { heading: HeadingLevel.HEADING_2 })]
  const measured = new Set()
  ;(ctx.zones || []).forEach(z => {
    if (z.co2) measured.add('co2'); if (z.tf) measured.add('tf'); if (z.rh) measured.add('rh')
    if (z.pm) measured.add('pm'); if (z.tv) measured.add('tv'); if (z.co) measured.add('co'); if (z.hc) measured.add('hc')
  })
  const rows = BENCHMARK_ROWS
    .filter(r => measured.has(benchParam(r[0])))
    .map(r => [
      { text: r[0], size: 16, bold: true },
      { text: r[1], size: 16 },
      { text: r[2], size: 16, color: COLORS.muted },
      { text: r[3], size: 16, color: COLORS.muted },
    ])

  if (rows.length === 0) {
    children.push(p('No parameters measured — benchmarks not applicable for this assessment.', { italics: true, color: COLORS.muted }))
  } else {
    children.push(buildTable(
      [{ text: 'Parameter', width: 24 }, { text: 'Benchmark', width: 30 }, { text: 'Source', width: 22 }, { text: 'Type', width: 24 }],
      rows
    ))
    children.push(p('Condensed to measured parameters. Occupational limits are enforceable; public-health guidelines and comfort criteria are advisory; screening / concern thresholds are investigative triggers, not compliance determinations.', { size: 14, color: COLORS.muted, after: 60 }))
  }
  return children
}

// ── 5. Results → T4 (per-zone matrix + compact figure panel) ──
export function buildResults(ctx) {
  const children = [p('Results', { heading: HeadingLevel.HEADING_2 })]

  // 5a. Per-zone category score matrix.
  const matrixRows = (ctx.zoneScores || []).map(zs => {
    const cols = [{ text: zs.zoneName, bold: true, size: 18 }]
    zs.cats.forEach(cat => {
      if (cat.s === null || cat.status === 'DATA_GAP' || cat.status === 'INSUFFICIENT') {
        cols.push({ text: '—', size: 18, color: COLORS.muted, align: AlignmentType.CENTER })
      } else if (cat.status === 'SUPPRESSED') {
        cols.push({ text: 'N/A', size: 18, color: COLORS.muted, align: AlignmentType.CENTER })
      } else {
        cols.push({ text: `${cat.s}/${cat.mx}`, size: 18, bold: true, color: scoreColor(Math.round((cat.s / cat.mx) * 100)), align: AlignmentType.CENTER })
      }
    })
    cols.push({ text: zs.tot !== null ? `${zs.tot}` : '—', size: 18, bold: true, color: zs.tot !== null ? scoreColor(zs.tot) : COLORS.muted, align: AlignmentType.CENTER })
    cols.push({ text: zs.tot !== null ? riskLabel(zs.tot) : 'No data', size: 16, color: zs.tot !== null ? scoreColor(zs.tot) : COLORS.muted })
    return cols
  })
  if (matrixRows.length === 0) {
    children.push(p('No zones scored.', { italics: true, color: COLORS.muted }))
  } else {
    children.push(buildTable(
      [
        { text: 'Zone', width: 22 }, { text: 'Vent', width: 9 }, { text: 'Cont', width: 9 },
        { text: 'HVAC', width: 9 }, { text: 'Comp', width: 9 }, { text: 'Env', width: 9 },
        { text: 'Total', width: 9 }, { text: 'Risk', width: 14 },
      ],
      matrixRows
    ))
    if (ctx.comp) {
      children.push(p(`Composite ${ctx.comp.tot}/100 (${ctx.comp.risk}). Confidence: ${ctx.confidence}.`, { size: 16, color: COLORS.muted, after: 160 }))
    }
  }

  // 5b. Compact figure panel — per-zone indoor / outdoor / delta readings.
  const figRows = []
  ;(ctx.zones || []).forEach((z, i) => {
    const zName = z.zn || `Zone ${i + 1}`
    const fields = [
      { label: 'CO₂', indoor: z.co2, outdoor: z.co2o, unit: 'ppm' },
      { label: 'Temp', indoor: z.tf, outdoor: z.tfo, unit: '°F' },
      { label: 'RH', indoor: z.rh, outdoor: z.rho, unit: '%' },
      { label: 'PM2.5', indoor: z.pm, outdoor: z.pmo, unit: 'µg/m³' },
      { label: 'TVOC', indoor: z.tv, outdoor: z.tvo, unit: 'µg/m³' },
    ]
    fields.forEach(f => {
      if (!f.indoor) return
      const delta = f.indoor && f.outdoor ? String(Math.round((+f.indoor - +f.outdoor) * 10) / 10) : '—'
      figRows.push([
        { text: zName, size: 16 },
        { text: f.label, size: 16 },
        { text: `${f.indoor} ${f.unit}`, size: 16, align: AlignmentType.CENTER },
        { text: f.outdoor ? `${f.outdoor} ${f.unit}` : '—', size: 16, color: f.outdoor ? COLORS.body : COLORS.muted, align: AlignmentType.CENTER },
        { text: delta, size: 16, align: AlignmentType.CENTER },
      ])
    })
  })
  if (figRows.length > 0) {
    children.push(p('Figure Panel — Key Measurements (indoor vs outdoor)', { size: 18, bold: true, color: COLORS.body, after: 80 }))
    children.push(buildTable(
      [{ text: 'Zone', width: 24 }, { text: 'Param', width: 14 }, { text: 'Indoor', width: 20 }, { text: 'Outdoor', width: 20 }, { text: 'Δ', width: 12 }],
      figRows
    ))
  }
  return children
}

// ── 6. Flagged Indicators → T5 ──
export function buildFlaggedIndicators(ctx) {
  const children = [p('Flagged Indicators', { heading: HeadingLevel.HEADING_2 })]
  let idx = 0
  const rows = []
  ;(ctx.zoneScores || []).forEach(zs => {
    zs.cats.forEach(cat => {
      cat.r.forEach(r => {
        if (r.sev === 'pass' || r.sev === 'info') return
        idx++
        rows.push([
          { text: `F-${String(idx).padStart(2, '0')}`, mono: true, size: 16, color: COLORS.muted },
          { text: zs.zoneName, size: 18 },
          { text: cat.l, size: 18, bold: true },
          { text: r.t, size: 18 },
          { text: r.sev.toUpperCase(), size: 16, bold: true, color: SEV_COLORS[r.sev] || COLORS.body },
          { text: r.std || '—', size: 16, color: COLORS.muted },
        ])
      })
    })
  })
  if (rows.length === 0) {
    children.push(p('No indicators above informational level.', { italics: true, color: COLORS.muted }))
  } else {
    children.push(buildTable(
      [
        { text: 'ID', width: 6 }, { text: 'Zone', width: 14 }, { text: 'Category', width: 12 },
        { text: 'Indicator', width: 38 }, { text: 'Severity', width: 10 }, { text: 'Standard', width: 20 },
      ],
      rows
    ))
    children.push(p(`${idx} indicator${idx !== 1 ? 's' : ''} flagged across ${ctx.zoneCount} zone${ctx.zoneCount !== 1 ? 's' : ''}.`, { size: 16, color: COLORS.muted, after: 60 }))
  }
  return children
}

// ── 7. Analyst Notes (internal-only) — candid triage / follow-up / priority ──
export function buildAnalystNotes(ctx) {
  const tot = ctx.comp ? ctx.comp.tot : null
  const priority = tot == null ? 'P3 — Review (no composite)'
    : tot < 30 ? 'P1 — Critical'
    : tot < 50 ? 'P2 — High'
    : tot < 70 ? 'P3 — Moderate'
    : 'P4 — Routine'
  const priColor = tot == null ? COLORS.muted : tot < 30 ? RED : tot < 50 ? AMBER : tot < 70 ? (SEV_COLORS.medium || AMBER) : (SEV_COLORS.pass || COLORS.body)

  const zs = ctx.zoneScores || []
  const worstZone = zs.length
    ? zs.reduce((a, b) => (a.tot == null ? b : b.tot == null ? a : (a.tot <= b.tot ? a : b)))
    : null
  const worstCat = worstZone
    ? (worstZone.cats || []).filter(c => c.s != null && c.mx).reduce((a, b) => (!a ? b : ((a.s / a.mx) <= (b.s / b.mx) ? a : b)), null)
    : null
  let critHigh = 0
  zs.forEach(z => z.cats.forEach(c => c.r.forEach(r => { if (r.sev === 'critical' || r.sev === 'high') critHigh++ })))

  const triage = worstZone
    ? `${worstZone.zoneName} drives the composite (${worstZone.tot ?? '—'}/100${worstCat ? `; weakest category ${worstCat.l} at ${worstCat.s}/${worstCat.mx}` : ''}). ${critHigh} critical/high indicator${critHigh !== 1 ? 's' : ''} flagged.`
    : 'No scored zones — capture field measurements before triage.'

  const followUp = tot == null
    ? 'Schedule a field visit to capture baseline measurements before drawing conclusions.'
    : tot < 50
      ? 'Recommend confirmatory sampling and an HVAC engineering review within ~5 business days; flag for IH callback.'
      : tot < 70
        ? 'Targeted improvements; re-survey on the next monitoring cycle.'
        : 'Within screening range; continue routine monitoring.'

  return [
    p('Analyst Notes (Internal Only)', { heading: HeadingLevel.HEADING_2 }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'Priority: ', bold: true, size: 18, color: COLORS.body, font: FONTS.body }),
        new TextRun({ text: priority, bold: true, size: 18, color: priColor, font: FONTS.body }),
      ],
    }),
    p(`Triage: ${triage}`, { size: 18, color: COLORS.body, after: 60 }),
    p(`Follow-up call: ${followUp}`, { size: 18, color: COLORS.body, after: 80 }),
    p('Analyst notes: ____________________________________________________________________', { size: 16, color: COLORS.muted, after: 160 }),
  ]
}

// ── 8. Limitations + IH-Review flag (collapsed to ~3 lines) ──
export function buildLimitationsCompact(ctx) {
  const cih = hasCIH(ctx)
    ? 'A CIH credential is on file; final CIH sign-off is still required before external release.'
    : 'Requires CIH review and sign-off before any external distribution.'
  return [
    p('Limitations & IH Review', { heading: HeadingLevel.HEADING_2 }),
    p('Screening-level only: identifies risk indicators against published benchmarks — not a compliance determination, certified measurement, or professional opinion.', { size: 16, color: COLORS.sub, after: 40 }),
    p('Point-in-time data; uncalibrated instruments or documented data gaps reduce defensibility.', { size: 16, color: COLORS.sub, after: 40 }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'IH review: ', bold: true, size: 16, color: COLORS.body, font: FONTS.body }),
        new TextRun({ text: cih, bold: true, size: 16, color: AMBER, font: FONTS.body }),
      ],
    }),
  ]
}
