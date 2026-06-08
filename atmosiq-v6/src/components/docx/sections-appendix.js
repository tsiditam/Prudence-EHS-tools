/**
 * AtmosFlow DOCX Report — Appendices A & B + Footer
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { FONTS, COLORS, scoreColor } from './styles'
import { buildTable } from './tables'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 22, color: opts.color || COLORS.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

export function buildAppendixB(ctx) {
  const children = [
    p('Appendix B — Transparent Scoring Summary', { heading: HeadingLevel.HEADING_2 }),
    p('This report applies a deterministic scoring methodology against published occupational and environmental health standards. The composite score uses a priority-weighted mean across assessed zones, with mission-critical zones carrying additional weight. If any zone scores Critical (<40), the composite equals the worst zone score — ensuring a single failing area cannot be masked by otherwise acceptable conditions. The building confidence rating reflects the lowest-confidence zone assessed. All category weights, thresholds, and overrides are fixed and published — no AI judgment is applied in scoring.', { size: 18, color: COLORS.muted, after: 160 }),
  ]

  // Scoring methodology table
  children.push(buildTable(
    [{ text: 'Category', width: 20 }, { text: 'Max Points', width: 15, align: AlignmentType.CENTER }, { text: 'Evaluation Basis', width: 65 }],
    [
      [{ text: 'Ventilation', bold: true }, { text: '25', mono: true, align: AlignmentType.CENTER }, 'CO₂ differential vs ASHRAE 62.1, outdoor air damper status, supply airflow adequacy, complaint correlation'],
      [{ text: 'Contaminants', bold: true }, { text: '25', mono: true, align: AlignmentType.CENTER }, 'PM2.5 (EPA/WHO), CO (OSHA/NIOSH), HCHO (OSHA/NIOSH), TVOCs, visible mold, odors, visible dust'],
      [{ text: 'HVAC', bold: true }, { text: '20', mono: true, align: AlignmentType.CENTER }, 'Maintenance recency, filter condition/type, airflow adequacy, drain pan condition'],
      [{ text: 'Complaints', bold: true }, { text: '15', mono: true, align: AlignmentType.CENTER }, 'Complaint presence, affected occupant count, symptom pattern clarity, clustering, symptom types'],
      [{ text: 'Environment', bold: true }, { text: '15', mono: true, align: AlignmentType.CENTER }, 'Temperature (ASHRAE 55 summer/winter), relative humidity, water damage indicators, mold indicators'],
    ]
  ))

  // Zone score summary
  children.push(p('Zone Score Summary', { heading: HeadingLevel.HEADING_3 }))

  if (ctx.zoneScores && ctx.zoneScores.length > 0) {
    const zoneRows = ctx.zoneScores.map(zs => [
      { text: zs.zoneName, bold: true },
      { text: `${zs.tot}`, mono: true, bold: true, color: scoreColor(zs.tot), align: AlignmentType.CENTER },
      ...zs.cats.map(c => ({ text: `${c.s}/${c.mx}`, mono: true, size: 18, align: AlignmentType.CENTER })),
      { text: zs.risk, bold: true, color: scoreColor(zs.tot), size: 18 },
    ])

    // Composite row
    if (ctx.comp) {
      zoneRows.push([
        { text: 'Composite', bold: true },
        { text: `${ctx.comp.tot}`, mono: true, bold: true, color: scoreColor(ctx.comp.tot), align: AlignmentType.CENTER },
        { text: `Avg: ${ctx.comp.avg} · Worst: ${ctx.comp.worst} · Worst-zone override when Critical (<40)`, size: 16, color: COLORS.muted },
        '', '', '', // fill remaining cat columns
        { text: ctx.comp.risk || '', bold: true, color: scoreColor(ctx.comp.tot), size: 18 },
      ])
    }

    children.push(buildTable(
      ['Zone', { text: 'Score', align: AlignmentType.CENTER }, 'Ventilation', 'Contaminants', 'HVAC', 'Complaints', 'Environment', 'Risk Level'],
      zoneRows
    ))
  }

  children.push(p('Score bands: 80–100 Low Risk · 60–79 Moderate · 40–59 High Risk · 0–39 Critical', { size: 16, color: COLORS.light, after: 200 }))

  return children
}

export function buildFooter(ctx) {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: `${ctx.firmName} — ${ctx.firmAddress}`, font: FONTS.body, size: 16, color: COLORS.light }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 40 },
      border: { top: { style: 'single', size: 1, color: COLORS.border, space: 8 } },
    }),
    p(`© 2026 All rights reserved. Assessor: ${ctx.assessor} | Report ID: ${ctx.reportId} | Generated: ${ctx.reportDate}`, { align: AlignmentType.CENTER, size: 14, color: COLORS.light, after: 40 }),
    p('This report is intended for the client identified above and should not be distributed to third parties without authorization.', { align: AlignmentType.CENTER, size: 14, color: COLORS.light, italics: true }),
  ]
}
