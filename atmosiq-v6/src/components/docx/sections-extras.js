/**
 * AtmosFlow DOCX Report — Equipment Log + Spatial Risk Summary
 * New sections added in Engine v2.3
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from 'docx'
import { FONTS, COLORS, scoreColor } from './styles'
import { buildTable } from './tables'
import { base64ToUint8Array } from './images'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 22, color: opts.color || COLORS.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

export function buildEquipmentLog(ctx) {
  const calLog = ctx.calibrationLog || []
  if (!calLog.length) return []

  const hasOutOfCal = calLog.some(c => c.outOfCal)
  const children = [
    p('Equipment & Calibration Log', { heading: HeadingLevel.HEADING_2 }),
    p('The following instruments were used during this assessment. Calibration status reflects conditions at the time of the survey.', { size: 20, color: COLORS.sub, after: 160 }),
  ]

  const rows = calLog.map(c => [
    { text: c.nickname || c.make, bold: true },
    { text: c.serial || '—', mono: true, size: 18 },
    c.sensorType,
    { text: c.lastCalDate || 'Not recorded', mono: true, size: 18 },
    { text: c.outOfCal ? 'OUT OF CAL' : 'Current', bold: true, color: c.outOfCal ? 'B91C1C' : '15803D', size: 18 },
  ])

  children.push(buildTable(
    ['Instrument', 'Serial', 'Sensor Type', 'Last Cal', 'Status'],
    rows
  ))

  if (hasOutOfCal) {
    children.push(p('Limitations of Data: One or more instruments used in this assessment were beyond their manufacturer-recommended calibration interval. Readings from out-of-calibration instruments are considered directional only and may not meet defensibility requirements for regulatory or litigation purposes.', { bold: true, size: 20, color: 'B91C1C', after: 200 }))
  }

  return children
}

export function buildSpatialRiskSummary(ctx) {
  const zones = ctx.zones || []
  const mappedZones = zones.filter(z => z.mapX != null && z.mapY != null)
  if (!mappedZones.length || !ctx.floorPlan) return []

  const children = [
    p('Spatial Risk Summary', { heading: HeadingLevel.HEADING_2 }),
    p('The following floor plan overlay illustrates zone-level risk distribution across the assessed facility. Pin colors reflect AtmosFlow risk thresholds.', { size: 20, color: COLORS.sub, after: 160 }),
  ]

  // Floor plan image
  try {
    const imgData = base64ToUint8Array(ctx.floorPlan)
    children.push(new Paragraph({
      children: [new ImageRun({ data: imgData, transformation: { width: 600, height: 400 }, type: 'png' })],
      spacing: { after: 120 },
    }))
  } catch {
    children.push(p('[Floor plan image could not be embedded]', { italics: true, color: COLORS.muted }))
  }

  // Legend
  children.push(new Paragraph({
    children: [
      new TextRun({ text: '● Low Risk (80–100)  ', font: FONTS.body, size: 18, color: '15803D' }),
      new TextRun({ text: '● Moderate (50–79)  ', font: FONTS.body, size: 18, color: 'A16207' }),
      new TextRun({ text: '● Critical (<50)', font: FONTS.body, size: 18, color: 'B91C1C' }),
    ],
    spacing: { after: 160 },
  }))

  // Zone risk table
  const rows = mappedZones.map(z => {
    const zi = zones.indexOf(z)
    const zs = ctx.zoneScores?.[zi]
    const worst = zs?.cats?.reduce((a, b) => ((a.s / a.mx) < (b.s / b.mx) ? a : b))
    return [
      { text: z.zn || 'Zone', bold: true },
      { text: `${zs?.tot ?? '—'}`, mono: true, bold: true, color: scoreColor(zs?.tot), align: AlignmentType.CENTER },
      { text: zs?.risk || '—', color: scoreColor(zs?.tot), size: 18 },
      { text: worst ? `${worst.l} (${worst.s}/${worst.mx})` : '—', size: 18, color: COLORS.sub },
    ]
  })

  children.push(buildTable(
    [{ text: 'Zone', width: 25 }, { text: 'Score', width: 15, align: AlignmentType.CENTER }, { text: 'Risk Level', width: 25 }, { text: 'Primary Concern', width: 35 }],
    rows
  ))

  children.push(p('Risk thresholds per AtmosFlow scoring methodology. Building composite reflects worst-zone override when any zone is Critical (<40).', { size: 16, color: COLORS.light, after: 200 }))

  return children
}

export function buildFMSummaryLayer(ctx) {
  if (ctx.userMode !== 'fm' || !ctx.comp) return []

  const children = []
  const tot = ctx.comp.tot
  const label = tot >= 80 ? 'Low Risk' : tot >= 60 ? 'Moderate' : tot >= 40 ? 'High Risk' : 'Critical'

  children.push(new Paragraph({
    children: [new TextRun({ text: `${tot}/100 — ${label}`, font: FONTS.body, size: 48, bold: true, color: scoreColor(tot) })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
  }))

  const desc = tot >= 70
    ? 'The air quality in this building appears to be within acceptable ranges based on the measurements taken.'
    : tot >= 50
      ? 'Some air quality concerns were identified that may benefit from attention.'
      : 'Significant air quality concerns were identified. Corrective action is recommended.'

  children.push(p(desc, { size: 24, color: COLORS.sub, align: AlignmentType.CENTER, after: 200 }))

  // Escalation triggers
  const triggers = ctx.escalationTriggers || []
  if (triggers.length > 0) {
    children.push(p('Professional Evaluation Required', { bold: true, size: 24, color: 'B91C1C', after: 80 }))
    triggers.forEach(t => {
      children.push(p(`• ${t.rationale}`, { size: 20, color: 'B91C1C' }))
    })
  }

  return children
}
