/**
 * AtmosFlow DOCX Report — Footer
 *
 * "Appendix B — Transparent Scoring Summary" lived here: the category
 * weight table, the per-zone score matrix and the composite formula. It
 * went with the 100-point score, which the platform no longer computes.
 * It had no production importer at the time of removal — `DocxReport.js`
 * imports only `buildFooter` — and `client.ts` builds its own, unrelated
 * Appendix B locally.
 */

import { Paragraph, TextRun, AlignmentType } from 'docx'
import { FONTS, COLORS } from './styles'

import { p } from './paragraphs'

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
