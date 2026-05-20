/**
 * AtmosFlow DOCX Report — Standards Currency section
 *
 * Renders a small "Standards Currency" section that documents the
 * bibliographic references NOT integrated into AtmosFlow's
 * deterministic scoring engine — the layer that lets a reviewing IH
 * see explicitly what's IN scoring vs what's available as additional
 * context. Sits between the Limitations + Professional Judgment
 * section and the appendices in the consultant DOCX.
 *
 * Source of truth: src/engines/contextualStandards.js
 * (CONTEXTUAL_STANDARDS array). Each entry contributes a heading 3
 * + citation row + rationale paragraph.
 *
 * Engine-sacred audit: this section reads only from src/engines/
 * (plural, orchestration layer); the underlying scoring constants
 * in STD remain unchanged.
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { FONTS, COLORS } from './styles'
import { getContextualStandards } from '../../engines/contextualStandards.js'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 22, color: opts.color || COLORS.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

/**
 * Build the Standards Currency section.
 *
 * @param {object} [ctx]  forwarded to getContextualStandards for
 *                        any future conditional rendering
 * @returns {Array} DOCX children (heading + intro + per-entry blocks)
 */
export function buildMethodologyCurrency(ctx) {
  const entries = getContextualStandards(ctx)
  if (!entries || entries.length === 0) return []

  const out = [
    p('Standards Currency', { heading: HeadingLevel.HEADING_2 }),
    p(
      'AtmosFlow scores the assessment against the standards manifest summarized in Appendix D and the deterministic thresholds documented in the engine version note. Several adjacent or recently-revised standards are NOT integrated into the deterministic scoring path but are referenced here so the reviewing industrial hygienist can consider them in context. None of the items below alter the scoring outcomes presented in the body of this report.',
      { size: 20, color: COLORS.sub, align: AlignmentType.JUSTIFIED, after: 200 },
    ),
  ]

  for (const entry of entries) {
    out.push(p(entry.summary, { heading: HeadingLevel.HEADING_3 }))
    out.push(p(entry.citation, { size: 18, color: COLORS.muted, italics: true, after: 80 }))
    out.push(p(entry.rationale, { size: 20, color: COLORS.body, align: AlignmentType.JUSTIFIED, after: 160 }))
  }

  return out
}
