/**
 * IH Professional-Judgment Override watermark — docx-side.
 *
 * When the consultant DOCX is generated under an `ihOverride` (the
 * preflight modal collected a typed justification from the licensed IH
 * after the engine refused to issue), every page must carry a visible
 * notice so a downstream reader sees the override at a glance.
 *
 * Distinct from the free-tier watermark in `watermark.js`:
 *   • free-tier watermark = commercial gating signal
 *   • override watermark  = defensibility audit-trail signal
 *
 * Both helpers can coexist on the same report (e.g., a free-tier user
 * issuing under IH override). The override notice sits on the cover;
 * the per-page header carries the short override marker.
 */

import { Header, Footer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx'

const OVERRIDE_HEADER_TEXT = 'ISSUED UNDER DOCUMENTED PROFESSIONAL JUDGMENT'
const OVERRIDE_FOOTER_TEXT = 'Issued under documented professional judgment by the reviewing industrial hygienist — see cover page for justification.'
const OVERRIDE_COLOR = 'B45309' // amber-700; high-contrast warning tone, prints legibly

function isOverrideActive(ihOverride) {
  return !!(ihOverride && Array.isArray(ihOverride.triggers) && ihOverride.triggers.length > 0)
}

function buildOverrideHeader(ihOverride) {
  if (!isOverrideActive(ihOverride)) return null
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: OVERRIDE_HEADER_TEXT,
            color: OVERRIDE_COLOR,
            size: 18,
            font: 'Inter',
            bold: true,
          }),
        ],
      }),
    ],
  })
}

function buildOverrideFooter(ihOverride) {
  if (!isOverrideActive(ihOverride)) return null
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: OVERRIDE_FOOTER_TEXT,
            color: OVERRIDE_COLOR,
            size: 16,
            font: 'Inter',
            italics: true,
          }),
        ],
      }),
    ],
  })
}

/**
 * Returns an array of Paragraph blocks to splice into the cover page
 * children. Empty array when no override is active.
 *
 * @param {object} ihOverride   { triggers: string[], justification: string, overriddenAt?: string }
 * @param {Array}  mutations    Output of applyOverrideToScore.mutations
 */
export function buildOverrideCoverNoticeParagraph(ihOverride, mutations) {
  if (!isOverrideActive(ihOverride)) return []
  const overriddenAt = ihOverride.overriddenAt || new Date().toISOString()
  const justification = ihOverride.justification || '(no justification recorded)'
  const mutationLines = (mutations || []).map(m => `• ${m.id}: ${m.what}`)

  const heading = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 360, after: 120 },
    border: {
      top:    { style: BorderStyle.SINGLE, size: 12, color: OVERRIDE_COLOR },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: OVERRIDE_COLOR },
      left:   { style: BorderStyle.SINGLE, size: 12, color: OVERRIDE_COLOR },
      right:  { style: BorderStyle.SINGLE, size: 12, color: OVERRIDE_COLOR },
    },
    children: [
      new TextRun({
        text: 'ISSUED UNDER DOCUMENTED PROFESSIONAL JUDGMENT',
        color: OVERRIDE_COLOR,
        size: 22,
        font: 'Inter',
        bold: true,
      }),
    ],
  })

  const explanation = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 120, after: 80 },
    children: [
      new TextRun({
        text:
          'This report was issued under documented professional judgment by ' +
          'the reviewing industrial hygienist. One or more standard ' +
          'defensibility requirements were not fully satisfied at the time ' +
          'of issuance; the reviewing IH has elected to proceed under their ' +
          'professional licensure, accepting responsibility for the ' +
          'conclusions drawn from the available data. Recipients should ' +
          'weight this report\'s conclusions accordingly.',
        color: OVERRIDE_COLOR,
        size: 18,
        font: 'Inter',
      }),
    ],
  })

  const triggersHeader = new Paragraph({
    spacing: { before: 80, after: 40 },
    children: [
      new TextRun({
        text: 'Defensibility requirements issued under documented professional judgment:',
        color: OVERRIDE_COLOR,
        size: 18,
        font: 'Inter',
        bold: true,
      }),
    ],
  })
  const triggersBody = mutationLines.length > 0
    ? mutationLines.map(line => new Paragraph({
        spacing: { after: 20 },
        children: [new TextRun({ text: line, color: OVERRIDE_COLOR, size: 16, font: 'Inter' })],
      }))
    : [new Paragraph({
        children: [new TextRun({ text: '(no mutations recorded)', color: OVERRIDE_COLOR, italics: true, size: 16, font: 'Inter' })],
      })]

  const justificationBlock = new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [
      new TextRun({ text: 'Assessor justification: ', color: OVERRIDE_COLOR, size: 18, font: 'Inter', bold: true }),
      new TextRun({ text: `"${justification}"`, color: OVERRIDE_COLOR, size: 18, font: 'Inter', italics: true }),
    ],
  })

  const timestamp = new Paragraph({
    spacing: { before: 40, after: 240 },
    children: [
      new TextRun({ text: `Override applied at: ${overriddenAt}`, color: OVERRIDE_COLOR, size: 16, font: 'Inter' }),
    ],
  })

  return [heading, explanation, triggersHeader, ...triggersBody, justificationBlock, timestamp]
}

/**
 * Returns an object suitable for spreading into Section options.
 * Empty object when no override is active.
 */
export function buildOverrideSectionAttachments(ihOverride) {
  if (!isOverrideActive(ihOverride)) return {}
  return {
    headers: { default: buildOverrideHeader(ihOverride) },
    footers: { default: buildOverrideFooter(ihOverride) },
  }
}
