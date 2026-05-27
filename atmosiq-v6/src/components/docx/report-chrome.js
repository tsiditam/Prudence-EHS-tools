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

export function buildReportHeader({ firm, projectNumber } = {}) {
  const right = projectNumber ? `Project No. ${projectNumber}` : ''
  return new Header({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_DXA }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE, space: 2 } },
      spacing: { after: 60 },
      children: [
        new TextRun({ text: firm || '', font: FONTS.body, size: CHROME_SIZE, color: CHROME_GRAY }),
        new TextRun({ text: '\t', font: FONTS.body, size: CHROME_SIZE }),
        new TextRun({ text: right, font: FONTS.body, size: CHROME_SIZE, color: CHROME_GRAY }),
      ],
    })],
  })
}

export function buildReportFooter({ clientName } = {}) {
  const left = clientName
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
          // Section-relative total so the cover (its own section) is not
          // counted; the body restarts at page 1 (see DocxReport.js).
          children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES_IN_SECTION],
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
export function reportSectionAttachments({ firm, projectNumber, clientName } = {}) {
  return {
    headers: { default: buildReportHeader({ firm, projectNumber }) },
    footers: { default: buildReportFooter({ clientName }) },
  }
}
