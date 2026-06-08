/**
 * AtmosFlow DOCX Report — shared paragraph helper.
 *
 * `p()` was previously defined byte-for-byte identically in nine section
 * files; this is the single canonical copy they now import. The variants
 * in sections-technical.js, sections-sensor.js, and sections-v21client.js
 * intentionally differ (different default size / color / spacing) and keep
 * their own local definitions.
 */
import { Paragraph, TextRun, AlignmentType } from 'docx'
import { FONTS, COLORS } from './styles'

export const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 22, color: opts.color || COLORS.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})
