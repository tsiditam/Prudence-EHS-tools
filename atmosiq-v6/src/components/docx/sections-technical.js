/**
 * AtmosFlow DOCX Report — Technical Report Sections
 * Structured findings format for peer IH review and facility engineering.
 * No prose — every section is a table or structured list.
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { FONTS, COLORS, SEV_COLORS, scoreColor, riskLabel } from './styles'
import { buildTable, kvTable, headerCell, dataCell } from './tables'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 20, color: opts.color || COLORS.sub, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

export function buildTechnicalMetadata(ctx) {
  return [
    p('Assessment Metadata', { heading: HeadingLevel.HEADING_2 }),
    kvTable([
      ['Facility', ctx.facilityName],
      ['Address', ctx.address],
      ['Assessment date', ctx.assessDate],
      ['Report date', ctx.reportDate],
      ['Assessor', ctx.assessor],
      ['Report ID', ctx.reportId],
      ['Engine version', `AtmosFlow v${ctx.version}`],
      ['Zones assessed', `${ctx.zoneCount}`],
      ['Composite score', ctx.comp ? `${ctx.comp.tot}/100 — ${ctx.comp.risk}` : 'Not scored'],
      ['Confidence', ctx.confidence],
      ['Primary instrument', ctx.instrument || 'Not recorded'],
      ['Serial number', ctx.instrumentSerial || 'Not recorded'],
      ['Calibration status', ctx.calibration],
      ['PID meter', ctx.pidMeter || 'N/A'],
      ['PID calibration', ctx.pidCal || 'N/A'],
      ['Assessment trigger', ctx.reason || 'Not specified'],
      ['Firm', ctx.firmName],
    ]),
  ]
}

export function buildFindingsRegister(ctx) {
  const children = [
    p('Findings Register', { heading: HeadingLevel.HEADING_2 }),
    p('Every finding from all assessed zones, with standard reference, severity, and source category.', { size: 18, color: COLORS.muted, after: 160 }),
  ]

  let idx = 0
  const rows = []
  ;(ctx.zoneScores || []).forEach((zs, zi) => {
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
    children.push(p('No findings above informational level.', { italics: true, color: COLORS.muted }))
  } else {
    children.push(buildTable(
      [
        { text: 'ID', width: 6 },
        { text: 'Zone', width: 14 },
        { text: 'Category', width: 12 },
        { text: 'Finding', width: 38 },
        { text: 'Severity', width: 10 },
        { text: 'Standard', width: 20 },
      ],
      rows
    ))
    children.push(p(`${idx} finding${idx !== 1 ? 's' : ''} identified across ${ctx.zoneCount} zone${ctx.zoneCount !== 1 ? 's' : ''}.`, { size: 18, color: COLORS.muted, after: 60 }))
  }

  return children
}

export function buildCategoryScoresSummary(ctx) {
  const children = [
    p('Category Scores Summary', { heading: HeadingLevel.HEADING_2 }),
    p('Per-zone scores across five assessment categories. Scores reflect sufficiency-adjusted deterministic evaluation.', { size: 18, color: COLORS.muted, after: 160 }),
  ]

  const rows = (ctx.zoneScores || []).map(zs => {
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

  children.push(buildTable(
    [
      { text: 'Zone', width: 22 },
      { text: 'Vent', width: 9 },
      { text: 'Cont', width: 9 },
      { text: 'HVAC', width: 9 },
      { text: 'Comp', width: 9 },
      { text: 'Env', width: 9 },
      { text: 'Total', width: 9 },
      { text: 'Risk', width: 14 },
    ],
    rows
  ))

  if (ctx.comp) {
    children.push(p(`Composite: ${ctx.comp.tot}/100 (${ctx.comp.risk}) — ${ctx.comp.logic === 'worst-zone-override' ? 'worst-zone override (AIHA)' : 'priority-weighted mean'}. Confidence: ${ctx.confidence}.`, { size: 18, color: COLORS.muted, after: 60 }))
  }

  return children
}

export function buildDataGapRegister(ctx) {
  const children = [
    p('Data Gap Register', { heading: HeadingLevel.HEADING_2 }),
  ]

  const gaps = []
  ;(ctx.zoneScores || []).forEach(zs => {
    zs.cats.forEach(cat => {
      if (cat.status === 'DATA_GAP') gaps.push([zs.zoneName, cat.l, 'DATA_GAP', 'No data collected for this category'])
      if (cat.status === 'INSUFFICIENT') gaps.push([zs.zoneName, cat.l, 'INSUFFICIENT', cat.reason || 'Required data not provided'])
      if (cat.capped && cat.sufficiency?.sufficiency < 0.5) gaps.push([zs.zoneName, cat.l, 'PARTIAL', `Sufficiency ${Math.round(cat.sufficiency.sufficiency * 100)}% — score capped at ${cat.s}/${cat.mx}`])
    })
  })

  if (gaps.length === 0) {
    children.push(p('No data gaps identified. All categories fully evaluated.', { italics: true, color: COLORS.muted }))
  } else {
    children.push(buildTable(
      [{ text: 'Zone', width: 20 }, { text: 'Category', width: 15 }, { text: 'Status', width: 15 }, { text: 'Detail', width: 50 }],
      gaps.map(g => g.map(v => ({ text: v, size: 18 })))
    ))
  }

  return children
}

export function buildInstrumentLog(ctx) {
  const children = [
    p('Instrument Log', { heading: HeadingLevel.HEADING_2 }),
  ]

  const instruments = []
  if (ctx.instrument) instruments.push(['Primary IAQ Meter', ctx.instrument, ctx.instrumentSerial || '—', ctx.presurvey?.ps_inst_iaq_cal || '—', ctx.calibration])
  if (ctx.pidMeter) instruments.push(['PID / VOC Meter', ctx.pidMeter, '—', '—', ctx.pidCal || '—'])
  if (ctx.presurvey?.ps_inst_other) instruments.push(['Other', ctx.presurvey.ps_inst_other, '—', '—', '—'])

  if (instruments.length === 0) {
    children.push(p('No instruments documented. Findings generated from this assessment have reduced defensibility.', { italics: true, color: SEV_COLORS.medium }))
  } else {
    children.push(buildTable(
      [{ text: 'Type', width: 18 }, { text: 'Make / Model', width: 28 }, { text: 'Serial', width: 16 }, { text: 'Last Cal Date', width: 16 }, { text: 'Cal Status', width: 22 }],
      instruments.map(row => row.map(v => ({ text: v, size: 18 })))
    ))
  }

  return children
}

export function buildOutdoorBaseline(ctx) {
  const children = [
    p('Outdoor Baseline Summary', { heading: HeadingLevel.HEADING_2 }),
    p('Indoor measurements compared against outdoor baselines where available. Delta values indicate building contribution.', { size: 18, color: COLORS.muted, after: 160 }),
  ]

  const rows = []
  ;(ctx.zones || []).forEach((z, i) => {
    const zName = z.zn || `Zone ${i + 1}`
    const fields = [
      { label: 'CO₂', indoor: z.co2, outdoor: z.co2o, unit: 'ppm' },
      { label: 'Temperature', indoor: z.tf, outdoor: z.tfo, unit: '°F' },
      { label: 'RH', indoor: z.rh, outdoor: z.rho, unit: '%' },
      { label: 'PM2.5', indoor: z.pm, outdoor: z.pmo, unit: 'µg/m³' },
      { label: 'TVOCs', indoor: z.tv, outdoor: z.tvo, unit: 'µg/m³' },
    ]
    fields.forEach(f => {
      if (!f.indoor) return
      const delta = f.indoor && f.outdoor ? String(Math.round((+f.indoor - +f.outdoor) * 10) / 10) : '—'
      rows.push([
        { text: zName, size: 18 },
        { text: f.label, size: 18 },
        { text: `${f.indoor} ${f.unit}`, size: 18, align: AlignmentType.CENTER },
        { text: f.outdoor ? `${f.outdoor} ${f.unit}` : 'Not measured', size: 18, color: f.outdoor ? COLORS.body : SEV_COLORS.medium, align: AlignmentType.CENTER },
        { text: delta, size: 18, align: AlignmentType.CENTER },
      ])
    })
  })

  if (rows.length === 0) {
    children.push(p('No measurement data available.', { italics: true, color: COLORS.muted }))
  } else {
    children.push(buildTable(
      [{ text: 'Zone', width: 18 }, { text: 'Parameter', width: 14 }, { text: 'Indoor', width: 18 }, { text: 'Outdoor', width: 18 }, { text: 'Delta', width: 12 }],
      rows
    ))
  }

  return children
}
