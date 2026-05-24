/**
 * Shared section-heading helper for the consultant DOCX.
 *
 * Single source of truth for the v2.2 section / appendix heading style
 * (slate body font, size 28 bold, blue bottom rule). Both the canonical
 * v2.1 section builder and the supplemental appendices (lab results,
 * sensor graphs, standards currency) render through this so every
 * section heading is visually identical — no per-file heading drift.
 */

import { Paragraph, TextRun, HeadingLevel, BorderStyle } from 'docx'
import { FONTS } from './styles'

// v2.2 palette — kept in sync with sections-v21client.js (SLATE / ACCENT_BLUE).
const HEADING_COLOR = '1E293B'
const RULE_COLOR = '2563EB'

export function sectionHeading2(text) {
  return new Paragraph({
    children: [new TextRun({ text: text || '', font: FONTS.body, size: 28, bold: true, color: HEADING_COLOR })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RULE_COLOR, space: 4 } },
  })
}
