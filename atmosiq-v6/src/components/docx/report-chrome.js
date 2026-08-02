/**
 * Formal report chrome — running header + footer for the consultant DOCX.
 *
 * Paid consultant reports previously carried no running header/footer
 * (the watermark modules own those slots only for the free tier and the
 * IH-override path). This module supplies the formal chrome:
 *   • Header (every body page): firm name (left) · "Project No. N" (right)
 *   • Footer (every body page): "CONFIDENTIAL — Prepared for {client}"
 *     (left) · "Page X of Y" (right)
 *
 * Attached as the BASE of the section-attachment merge in DocxReport.js,
 * so the free-tier watermark and IH-override attachments still take
 * precedence for their slots when present (their whole-object spread
 * replaces this chrome). The chrome therefore appears on the paid
 * deliverable without altering free-tier or override behavior.
 */

import { Header, Footer, Paragraph, TextRun, TabStopType, PageNumber, BorderStyle } from 'docx'
import { FONTS } from './styles'
import { CONTENT_WIDTH_DXA } from './page-setup'

const CHROME_GRAY = '64748B'
const HAIRLINE = 'E2E8F0'
const CHROME_SIZE = 16 // 8pt

/**
 * The running header.
 *
 * `ribbon` replaces the firm/project line with a set of short facts — the
 * project, the building, the dates. A page pulled out of the binder on its
 * own should still say what it is; without that, page 6 of a monitoring
 * report is a chart of numbers belonging to nobody.
 */
export function buildReportHeader({ firm, projectNumber, ribbon } = {}) {
  const facts = (ribbon || []).filter(Boolean)
  const children = facts.length
    ? [
        new TextRun({ text: facts.join('   ·   '), font: FONTS.body, size: CHROME_SIZE, color: CHROME_GRAY }),
        new TextRun({ text: '\t', font: FONTS.body, size: CHROME_SIZE }),
        new TextRun({ text: 'AtmosFlow', font: FONTS.body, size: CHROME_SIZE, color: CHROME_GRAY, bold: true }),
      ]
    : [
        new TextRun({ text: firm || '', font: FONTS.body, size: CHROME_SIZE, color: CHROME_GRAY }),
        new TextRun({ text: '\t', font: FONTS.body, size: CHROME_SIZE }),
        new TextRun({
          text: projectNumber ? `Project No. ${projectNumber}` : '',
          font: FONTS.body, size: CHROME_SIZE, color: CHROME_GRAY,
        }),
      ]
  return new Header({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_DXA }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE, space: 2 } },
      spacing: { after: 60 },
      children,
    })],
  })
}

/**
 * The running footer.
 *
 * ── Why the page total is a choice ─────────────────────────────────────
 * `TOTAL_PAGES_IN_SECTION` emits the SECTIONPAGES field. The consultant
 * report needs it, because its cover is a section of its own and must not be
 * counted. But SECTIONPAGES is one of the fields many readers never resolve,
 * and an unresolved field renders as NOTHING — which is why a single-section
 * report shows "Page 6 of " with the total simply missing.
 *
 * So a single-section document asks for NUMPAGES instead, via
 * `sectionRelativeTotal: false`. Same intent, a field every reader knows.
 */
export function buildReportFooter({ clientName, title, sectionRelativeTotal = true } = {}) {
  // The understated three-part line is OPT-IN, taken only when a caller names
  // the report. Without a title this returns the original wording verbatim:
  // the consultant deliverable has shipped with that footer, and restyling
  // someone else's paid report is not a side effect this function gets to
  // have.
  const left = title
    ? [title, 'Confidential', clientName ? `Prepared for ${clientName}` : null].filter(Boolean).join('   ·   ')
    : clientName
      ? `CONFIDENTIAL — Prepared for ${clientName}`
      : 'CONFIDENTIAL — For client use only'
  return new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_DXA }],
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE, space: 2 } },
      spacing: { before: 60 },
      children: [
        new TextRun({ text: left, font: FONTS.body, size: CHROME_SIZE, color: CHROME_GRAY }),
        new TextRun({ text: '\t', font: FONTS.body, size: CHROME_SIZE }),
        new TextRun({
          children: [
            'Page ', PageNumber.CURRENT, ' of ',
            sectionRelativeTotal ? PageNumber.TOTAL_PAGES_IN_SECTION : PageNumber.TOTAL_PAGES,
          ],
          font: FONTS.body, size: CHROME_SIZE, color: CHROME_GRAY,
        }),
      ],
    })],
  })
}

/**
 * Object suitable for spreading into a docx Section's options:
 *   { headers: { default: Header }, footers: { default: Footer } }
 */
export function reportSectionAttachments({
  firm, projectNumber, clientName, title, ribbon, sectionRelativeTotal = true,
} = {}) {
  return {
    headers: { default: buildReportHeader({ firm, projectNumber, ribbon }) },
    footers: { default: buildReportFooter({ clientName, title, sectionRelativeTotal }) },
  }
}
