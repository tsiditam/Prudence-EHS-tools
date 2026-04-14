/**
 * AtmosFlow DOCX Report — Causal Chain Analysis
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx'
import { FONTS, COLORS } from './styles'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 22, color: opts.color || COLORS.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

const confColor = (conf) => conf === 'Strong' ? '15803D' : conf === 'Moderate' ? 'A16207' : COLORS.muted

export function buildCausalChainAnalysis(ctx) {
  if (!ctx.causalChains || ctx.causalChains.length === 0) return []

  const children = [
    p('Causal Chain Analysis', { heading: HeadingLevel.HEADING_2 }),
    p('The following concern pathways were identified through correlation of field observations, instrument measurements, and occupant reports. These are presented as structured evidence chains rather than confirmed root-cause determinations. Confidence levels reflect the strength and consistency of supporting evidence.', { size: 20, color: COLORS.sub, after: 200 }),
  ]

  ctx.causalChains.forEach(ch => {
    // Chain type + confidence
    children.push(new Paragraph({
      children: [
        new TextRun({ text: ch.type, font: FONTS.body, size: 24, bold: true, color: COLORS.text }),
        new TextRun({ text: `    ${ch.confidence}`, font: FONTS.body, size: 18, bold: true, color: confColor(ch.confidence) }),
      ],
      spacing: { before: 240, after: 60 },
    }))

    // Zone
    children.push(p(ch.zone, { size: 20, color: COLORS.accent, after: 80 }))

    // Root cause — with left border
    children.push(new Paragraph({
      children: [new TextRun({ text: ch.rootCause, font: FONTS.body, size: 22, color: '334155' })],
      border: { left: { style: BorderStyle.SINGLE, size: 3, color: COLORS.accent, space: 8 } },
      indent: { left: 200 },
      spacing: { after: 100 },
    }))

    // Supporting evidence
    children.push(p('Supporting evidence:', { size: 18, bold: true, color: COLORS.muted, after: 40 }))
    ch.evidence.forEach(e => {
      children.push(new Paragraph({
        children: [new TextRun({ text: e, font: FONTS.body, size: 20, color: COLORS.sub })],
        border: { left: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border, space: 8 } },
        indent: { left: 200 },
        spacing: { after: 40 },
      }))
    })

    // Closing sentence
    children.push(p('This pathway would warrant targeted follow-up to confirm contributing conditions.', { italics: true, size: 18, color: COLORS.muted, after: 200 }))
  })

  return children
}
