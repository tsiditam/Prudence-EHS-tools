/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow v2.1 — Consultant DOCX builder
 *
 * Renders a v2.1 ClientReport (or PreAssessmentMemo) into docx
 * Paragraphs/Tables. Mirrors the HTML client report layout but produces
 * Word output. Used by DocxReport.generateConsultantDocx.
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType, SectionType, PageBreak, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle } from 'docx'
import { FONTS, COLORS } from './styles'
import { borderlessLayoutTable } from './tables'

// v2.2 visual palette — slate/blue per consultant-report design
// guidance. PRIMARY (slate-900) for headings + dark text. ACCENT
// (blue-600) for accent cells + rules. FILL (slate-50) for soft
// backgrounds. SOFT_BORDER (slate-200) for hairline rules.
// Outlines render in BLACK throughout (set via blackBorder below).
const SLATE = '1E293B'
const ACCENT_BLUE = '2563EB'
const SLATE_FILL = 'F8FAFC'
const SLATE_SOFT = 'E2E8F0'
const SLATE_BODY = '334155'
// Backward-compat aliases for any helpers still using the old names
const CYAN = ACCENT_BLUE
const CYAN_DARK = SLATE
const CYAN_LIGHT = SLATE_SOFT
const CYAN_FILL = SLATE_FILL
const NAVY = ACCENT_BLUE
const NAVY_DARK = SLATE
const NAVY_LIGHT = SLATE_SOFT

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
// Per user direction — table outlines render in BLACK (CTSI style)
// while the FILLS (label cells, header bands) stay cyan. The
// previously-named cyanBorder/lightBorder constants are kept as
// aliases pointing to the same black border to minimize churn at
// every call site.
const blackBorder = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
const cyanBorder = blackBorder
const lightBorder = blackBorder
const navyBorder = blackBorder

const TOTAL_WIDTH_DXA = 9360 // standard 6.5in content width

const PRIORITY_LABEL = {
  immediate: 'Immediate',
  short_term: 'Short term',
  further_evaluation: 'Further evaluation',
  long_term: 'Long term',
}

/**
 * Format an ISO date string (YYYY-MM-DD) as long-form English
 * (e.g. "April 29, 2026"). Returns the input unchanged if it doesn't
 * parse cleanly.
 */
function formatLongDate(iso) {
  if (!iso || typeof iso !== 'string') return iso || ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  if (isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

const REVIEW_STATUS_LABEL = {
  draft_pending_professional_review: 'Draft — Pending Professional Review',
  reviewed_by_qualified_professional: 'Reviewed by Qualified Professional',
  final_issued_to_client: 'Final — Issued to Client',
}

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text: text || '', font: FONTS.body, size: opts.size || 22, color: opts.color || COLORS.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 140 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

const bullet = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text: text || '', font: FONTS.body, size: 20, color: opts.color || COLORS.body, bold: opts.bold })],
  bullet: { level: 0 },
  spacing: { after: 60 },
})

/**
 * v2.2 — lightweight CTSI-style section heading: cyan-colored bold
 * text with a cyan rule below. No box fill (per user preference).
 *
 * Returns an array of [Paragraph] — callers spread it into the
 * section children list. The single-element array preserves the same
 * call-site shape the v2.2.0a banded version used.
 */
function heading2(text) {
  return [
    new Paragraph({
      children: [new TextRun({
        text: text || '', font: FONTS.body, size: 28, bold: true, color: CYAN_DARK,
      })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 360, after: 160 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: CYAN, space: 4 },
      },
    }),
  ]
}

const heading3 = (text) => p(text, { heading: HeadingLevel.HEADING_3, bold: true, size: 24, color: CYAN_DARK, after: 100 })

function actionLine(action) {
  const priority = PRIORITY_LABEL[action.priority] || action.priority
  const std = action.standardReference ? ` — ${action.standardReference}` : ''
  return `${priority} (${action.timeframe}): ${action.action}${std}`
}

// ── Cover ──

function buildCoverPage(cover, reviewStatus, projectNumber) {
  // v2.2 §4 sneak peek — formal cover page mirroring CTSI layout.
  // Two-line uppercase title, navy rule, label/value vertical layout
  // with section labels in small caps, project number prominently
  // displayed.
  const labelLine = (text) => p(text, {
    align: AlignmentType.CENTER, bold: true, size: 16, color: CYAN_DARK, after: 60,
  })
  const valueLine = (text, opts = {}) => p(text, {
    align: AlignmentType.CENTER, size: opts.size || 22, color: opts.color || '0F172A',
    bold: opts.bold !== false, after: opts.after !== undefined ? opts.after : 200,
  })
  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { margin: { top: 2160, right: 1440, bottom: 1440, left: 1440 } },
    },
    children: [
      // Firm name
      p(cover.preparedBy, { align: AlignmentType.CENTER, bold: true, size: 24, color: CYAN_DARK, after: 80 }),
      p('', { after: 800 }),
      // Title — two lines, all caps (slate-900)
      // v2.4 — cover title rendered as a single paragraph so .docx →
      // .txt extraction produces one contiguous "INDOOR AIR QUALITY
      // EVALUATION" line for acceptance runner needle matching.
      p('INDOOR AIR QUALITY EVALUATION', { align: AlignmentType.CENTER, bold: true, size: 48, color: '0F172A', after: 400 }),
      // Centered cyan rule (single dash run for visual)
      p('—', { align: AlignmentType.CENTER, size: 32, color: CYAN, bold: true, after: 400 }),
      // Site block
      labelLine('PERFORMED AT'),
      valueLine(cover.facility, { size: 26, after: 80, color: '0F172A' }),
      valueLine(cover.location || '', { size: 22, color: COLORS.sub, bold: false, after: 240 }),
      // Date block
      labelLine('ASSESSMENT DATE'),
      valueLine(formatLongDate(cover.date), { size: 22, color: '0F172A', bold: false, after: 240 }),
      // Project number block (if present)
      ...(projectNumber ? [
        labelLine('PSEC PROJECT NUMBER'),
        valueLine(projectNumber, { size: 22, color: '0F172A', after: 320 }),
      ] : [p('', { after: 320 })]),
      // Status pill (bold caps, cyan-dark)
      p(REVIEW_STATUS_LABEL[reviewStatus] || cover.status, { align: AlignmentType.CENTER, bold: true, size: 22, color: CYAN_DARK, after: 200 }),
      // Methodology line italic
      p(cover.methodologyLine, { align: AlignmentType.CENTER, italics: true, size: 18, color: COLORS.muted, after: 400 }),
      ...(cover.draftNotice ? [p(cover.draftNotice, { align: AlignmentType.CENTER, italics: true, size: 20, color: 'C2410C' })] : []),
    ],
  }
}

// ── Sections ──

function buildTransmittal(report) {
  // v2.2 §3 — letter-format transmittal in CTSI style. Falls back to
  // the v2.1 single-paragraph form if transmittalLetter is absent.
  if (!report.transmittalLetter) {
    return [...heading2('Transmittal'), p(report.transmittal)]
  }
  const letter = report.transmittalLetter
  const out = [
    p(formatLongDate(letter.date), { after: 280 }),
  ]

  // Recipient block — name on first line, title on second, organization
  // bold (matches CTSI), then address lines.
  const r = letter.recipient
  if (r.fullName) out.push(p(r.fullName, { after: 40 }))
  if (r.title) out.push(p(r.title, { after: 40 }))
  if (r.organization) out.push(p(r.organization, { bold: true, after: 40 }))
  if (r.addressLine1) out.push(p(r.addressLine1, { after: 40 }))
  if (r.addressLine2) out.push(p(r.addressLine2, { after: 40 }))
  const cityLine = [r.city, r.state, r.zip].filter(Boolean).join(', ')
  if (cityLine) out.push(p(cityLine, { after: 320 }))

  // RE: subject in ALL CAPS BOLD, then PROJECT # line in BOLD.
  // Strip the engine's auto-prepended "INDOOR AIR QUALITY EVALUATION
  // PERFORMED AT:" if present, since we render the RE: label
  // explicitly.
  const subject = letter.subjectLine
    .replace(/^INDOOR AIR QUALITY EVALUATION PERFORMED AT:\s*/i, '')
    .trim() || letter.subjectLine
  out.push(new Paragraph({
    children: [
      new TextRun({ text: 'RE:    ', font: FONTS.body, size: 22, bold: true, color: COLORS.text }),
      new TextRun({ text: 'INDOOR ENVIRONMENTAL QUALITY EVALUATION', font: FONTS.body, size: 22, bold: true, color: COLORS.text }),
    ],
    spacing: { after: 60 },
  }))
  out.push(new Paragraph({
    children: [
      new TextRun({ text: '         PERFORMED AT:', font: FONTS.body, size: 22, bold: true, color: COLORS.text }),
    ],
    spacing: { after: 60 },
  }))
  out.push(new Paragraph({
    children: [
      new TextRun({ text: `         ${subject.toUpperCase()}`, font: FONTS.body, size: 22, bold: true, color: COLORS.text }),
    ],
    spacing: { after: 200 },
  }))
  out.push(p(`PROJECT # ${letter.projectNumber}`, { bold: true, after: 280 }))

  // Salutation
  out.push(p(letter.salutation, { after: 200 }))

  // Body paragraphs — justified for letter formality.
  for (const para of letter.bodyParagraphs) {
    out.push(new Paragraph({
      children: [new TextRun({ text: para, font: FONTS.body, size: 22, color: COLORS.body })],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200 },
    }))
  }

  // Closing
  out.push(p(letter.closing, { after: 320 }))

  // Firm name in CAPS ITALIC BOLD (CTSI style)
  out.push(p(letter.signatoryFirm, { bold: true, italics: true, after: 800 }))

  // Two-column signature block. Each column carries: signature space,
  // rule line, name in bold, title.
  if (letter.preparedBy.length > 0) {
    const cols = letter.preparedBy.map(s => buildSignatureColumn(s))
    out.push(borderlessLayoutTable(cols))
  }

  return out
}

/**
 * Build a single signature column for the letter signatory block.
 * Returns an array of Paragraphs to be placed inside a TableCell via
 * borderlessLayoutTable.
 */
function buildSignatureColumn(s) {
  const credentials = s.credentials.length > 0 ? `, ${s.credentials.join(', ')}` : ''
  return [
    // Signature image area — 4-line space for wet signature.
    p('', { after: 60, size: 22 }),
    p('', { after: 60, size: 22 }),
    p('', { after: 60, size: 22 }),
    // Rule line under signature space
    new Paragraph({
      children: [new TextRun({ text: '____________________________', font: FONTS.body, size: 20, color: COLORS.text })],
      spacing: { after: 80 },
    }),
    p(`${s.fullName}${credentials}`, { bold: true, size: 22, after: 40 }),
    p(s.title, { size: 20, color: COLORS.sub, after: 40 }),
    ...(s.licenseNumbers && s.licenseNumbers.length > 0
      ? [p(`License: ${s.licenseNumbers.join(', ')}`, { size: 18, color: COLORS.muted, after: 40 })]
      : []),
  ]
}

function buildMethodologyDisclosure(report) {
  if (!report.methodologyDisclosure) return []
  return [...heading2('Methodology Disclosure'), p(report.methodologyDisclosure)]
}

/**
 * v2.2 §5 — Table of Contents.
 *
 * Renders a static text TOC matching the rendered section order.
 * Page numbers are not embedded — Word users can replace this
 * section with Insert > Table of Contents to get an auto-numbered
 * TOC that keys off the heading styles used elsewhere in the doc.
 *
 * Static rendering avoids a Word-only field that fails silently in
 * non-Word renderers (LibreOffice, Google Docs upload, web preview).
 */
function buildTableOfContents(report) {
  const toc = report.tableOfContents
  if (!toc || !toc.entries || toc.entries.length === 0) return []
  const out = [...heading2(toc.title || 'Table of Contents')]
  for (const entry of toc.entries) {
    const indent = entry.level === 2 ? 360 : 0
    out.push(new Paragraph({
      children: [new TextRun({
        text: entry.title,
        font: FONTS.body,
        size: entry.level === 2 ? 20 : 22,
        color: SLATE,
        bold: entry.level === 1,
      })],
      indent: { left: indent },
      spacing: { after: 80 },
      border: {
        bottom: { style: BorderStyle.DOTTED, size: 4, color: SLATE_SOFT, space: 2 },
      },
    }))
  }
  out.push(p('', { after: 200 }))
  return out
}

function buildSamplingMethodologyDocx(report) {
  if (!report.samplingMethodology) return []
  const out = [...heading2('Sampling Methodology')]
  for (const para of report.samplingMethodology.instrumentParagraphs) {
    out.push(p(para))
  }
  out.push(p(report.samplingMethodology.overallParagraph))
  return out
}

function buildExecutiveSummary(report) {
  // v2.2 visual upgrade — Label:Value metadata list (no banded grid),
  // opinion call-out, narrative blocks. The Findings block renders
  // findings grouped by domain with bold lead terms; empty groups
  // are omitted.
  const summary = report.executiveSummary
  const out = [...heading2('Executive Summary')]
  const md = summary.metadataTable
  if (md) {
    out.push(...buildExecMetadataList(md))
    out.push(p('', { after: 160 }))
  }

  // Overall opinion call-out — bordered card with accent left rule.
  out.push(buildOpinionCard(summary.overallProfessionalOpinionLanguage))

  // Narrative blocks each in an accent-banded framed section.
  if (summary.scopeOfWork) {
    out.push(buildExecBlock('Scope of Work', [p(summary.scopeOfWork, { align: AlignmentType.JUSTIFIED })]))
  }
  if (summary.resultsNarrative) {
    out.push(buildExecBlock('Results', [p(summary.resultsNarrative, { align: AlignmentType.JUSTIFIED })]))
  }
  // Findings — grouped by domain when findingsByGroup is populated.
  if (summary.findingsByGroup && summary.findingsByGroup.length > 0) {
    const groupChildren = []
    for (const g of summary.findingsByGroup) {
      groupChildren.push(p(g.groupName, { bold: true, size: 22, color: SLATE, after: 60 }))
      for (const obs of g.observations) {
        groupChildren.push(buildLeadTermBullet(obs.leadTerm, obs.statement))
      }
      groupChildren.push(p('', { after: 80 }))
    }
    out.push(buildExecBlock('Summary of Findings', groupChildren))
  } else if (summary.observations && summary.observations.length > 0) {
    out.push(buildExecBlock('Summary of Findings', summary.observations.map(o => bullet(o))))
  }
  if (summary.recommendations && summary.recommendations.length > 0) {
    out.push(buildExecBlock('Recommendations', summary.recommendations.map(a => bullet(actionLine(a)))))
  }
  return out
}

/**
 * v2.2 — render a finding observation as a bullet with a bold lead
 * term followed by the statement. "PM2.5 (screening-level): Elevated..."
 */
function buildLeadTermBullet(leadTerm, statement) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${leadTerm}: `, font: FONTS.body, size: 20, bold: true, color: SLATE }),
      new TextRun({ text: statement || '', font: FONTS.body, size: 20, color: SLATE_BODY }),
    ],
    bullet: { level: 0 },
    spacing: { after: 60 },
  })
}

/**
 * v2.2 — render the executive summary metadata as a sequence of
 * "Label: Value" Paragraphs instead of a 4×4 banded table. Reads
 * cleanly without visual noise.
 */
function buildExecMetadataList(md) {
  const row = (label, value) => new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, font: FONTS.body, size: 22, bold: true, color: SLATE }),
      new TextRun({ text: value || '—', font: FONTS.body, size: 22, color: SLATE_BODY }),
    ],
    spacing: { after: 80 },
  })
  return [
    row('Client Name', md.clientName),
    row('Project Number', md.projectNumber),
    row('Project Address', md.projectAddress),
    row('Survey Area', md.surveyArea),
    row('Report Date', md.reportDate),
    row('Survey Date(s)', md.surveyDate),
    row('Requested By', md.requestedBy),
    row('Site Contact', md.siteContact),
  ]
}

/**
 * v2.2 §6 — CTSI-style metadata table: 4 rows × 4 cols, label cells in
 * navy with white text, value cells white with navy border.
 */
function buildExecMetadataTable(md) {
  const labelCellWidth = Math.round(TOTAL_WIDTH_DXA * 0.18)
  const valueCellWidth = Math.round(TOTAL_WIDTH_DXA * 0.32)
  const labelCell = (text) => new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONTS.body, size: 20, bold: true, color: 'FFFFFF' })],
      spacing: { after: 0 },
    })],
    shading: { type: ShadingType.CLEAR, fill: NAVY },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    width: { size: labelCellWidth, type: WidthType.DXA },
    borders: { top: navyBorder, bottom: navyBorder, left: navyBorder, right: navyBorder },
  })
  const valueCell = (text) => new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: text || '—', font: FONTS.body, size: 20, color: COLORS.body })],
      spacing: { after: 0 },
    })],
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    width: { size: valueCellWidth, type: WidthType.DXA },
    borders: { top: navyBorder, bottom: navyBorder, left: navyBorder, right: navyBorder },
  })
  return new Table({
    rows: [
      new TableRow({ children: [labelCell('Client Name'), valueCell(md.clientName), labelCell('Report Date'), valueCell(md.reportDate)] }),
      new TableRow({ children: [labelCell('Project Number'), valueCell(md.projectNumber), labelCell('Survey Date(s)'), valueCell(md.surveyDate)] }),
      new TableRow({ children: [labelCell('Project Address'), valueCell(md.projectAddress), labelCell('Survey Area'), valueCell(md.surveyArea)] }),
      new TableRow({ children: [labelCell('Requested By'), valueCell(md.requestedBy), labelCell('Site Contact'), valueCell(md.siteContact)] }),
    ],
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [labelCellWidth, valueCellWidth, labelCellWidth, valueCellWidth],
    borders: { top: navyBorder, bottom: navyBorder, left: navyBorder, right: navyBorder, insideHorizontal: navyBorder, insideVertical: navyBorder },
  })
}

/**
 * v2.2 §6 — Narrative-block framed section with navy header band.
 * Renders the section as a Table whose first row is the navy band
 * header and second row is the body content.
 */
function buildExecBlock(title, bodyChildren) {
  const headerCell = new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: title, font: FONTS.body, size: 22, bold: true, color: 'FFFFFF' })],
      spacing: { after: 0 },
    })],
    shading: { type: ShadingType.CLEAR, fill: NAVY },
    margins: { top: 100, bottom: 100, left: 180, right: 180 },
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
    borders: { top: lightBorder, bottom: lightBorder, left: lightBorder, right: lightBorder },
  })
  const bodyCell = new TableCell({
    children: bodyChildren.length > 0 ? bodyChildren : [p('')],
    margins: { top: 140, bottom: 140, left: 200, right: 200 },
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
    borders: { top: lightBorder, bottom: lightBorder, left: lightBorder, right: lightBorder },
  })
  return new Table({
    rows: [
      new TableRow({ children: [headerCell] }),
      new TableRow({ children: [bodyCell] }),
    ],
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [TOTAL_WIDTH_DXA],
    borders: { top: lightBorder, bottom: lightBorder, left: lightBorder, right: lightBorder, insideHorizontal: lightBorder, insideVertical: lightBorder },
  })
}

/**
 * v2.2 §6 — Overall Professional Opinion call-out card. Bordered cell
 * with navy left rule and a label header.
 */
function buildOpinionCard(opinionLanguage) {
  const cell = new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: 'OVERALL PROFESSIONAL OPINION', font: FONTS.body, size: 18, bold: true, color: NAVY })],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: opinionLanguage || '', font: FONTS.body, size: 22, color: COLORS.body, bold: true })],
        spacing: { after: 0 },
      }),
    ],
    shading: { type: ShadingType.CLEAR, fill: CYAN_FILL },
    margins: { top: 200, bottom: 200, left: 240, right: 240 },
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
    borders: {
      top: lightBorder, bottom: lightBorder, right: lightBorder,
      left: { style: BorderStyle.SINGLE, size: 16, color: NAVY },
    },
  })
  return new Table({
    rows: [new TableRow({ children: [cell] })],
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [TOTAL_WIDTH_DXA],
    borders: { top: lightBorder, bottom: lightBorder, left: lightBorder, right: lightBorder, insideHorizontal: lightBorder, insideVertical: lightBorder },
  })
}

function buildScope(report) {
  return [
    ...heading2('Scope and Methodology'),
    p(report.scopeAndMethodology),
  ]
}

function buildBuildingContext(report) {
  return [
    ...heading2('Building and System Context'),
    p(report.buildingAndSystemContext),
  ]
}

// v2.4 §2 — Results section: per-parameter standards-anchored prose
// subsections. Renders between Sampling Methodology and Building and
// System Context.
function buildResultsSection(report) {
  const r = report.resultsSection
  if (!r || !Array.isArray(r.subsections) || r.subsections.length === 0) return []
  const out = [...heading2(r.title || 'Results')]
  for (const sub of r.subsections) {
    out.push(heading3(sub.heading))
    if (sub.standardsBackground) {
      out.push(p(sub.standardsBackground, { align: AlignmentType.JUSTIFIED }))
    }
    if (sub.measurementSummary) {
      out.push(p(sub.measurementSummary, { align: AlignmentType.JUSTIFIED }))
    }
  }
  return out
}

// v2.4 §3 — Six structured appendices. Each renders a heading,
// description, and any tabular content. Engine version line lives
// only in Appendix D.
function buildAppendices(report) {
  const ap = report.appendix || {}
  const out = []
  if (ap.appendixA) {
    out.push(...heading2(ap.appendixA.title))
    if (ap.appendixA.description) out.push(p(ap.appendixA.description, { align: AlignmentType.JUSTIFIED }))
    if (Array.isArray(ap.appendixA.rows) && ap.appendixA.rows.length > 0) {
      out.push(buildSimpleTable(
        ['Zone', 'Parameter', 'Value', 'Unit', 'Outdoor Ref.'],
        ap.appendixA.rows.map(r => [r.zoneName, r.parameter, r.value, r.unit, r.outdoorReference]),
      ))
    }
  }
  if (ap.appendixB) {
    out.push(...heading2(ap.appendixB.title))
    if (ap.appendixB.description) out.push(p(ap.appendixB.description, { align: AlignmentType.JUSTIFIED }))
    if (Array.isArray(ap.appendixB.instrumentRows) && ap.appendixB.instrumentRows.length > 0) {
      out.push(p('Instruments used:', { bold: true, after: 60 }))
      out.push(buildSimpleTable(
        ['Model', 'Serial', 'Last Calibration', 'Status'],
        ap.appendixB.instrumentRows.map(r => [r.model, r.serial || '—', r.lastCalibration || '—', r.calibrationStatus || '—']),
      ))
    }
    if (Array.isArray(ap.appendixB.zoneRows) && ap.appendixB.zoneRows.length > 0) {
      out.push(p('Per-zone sampling detail:', { bold: true, before: 120, after: 60 }))
      out.push(buildSimpleTable(
        ['Zone', 'Sampling Duration', 'Sample Locations', 'Outdoor Ref.'],
        ap.appendixB.zoneRows.map(r => [r.zoneName, r.samplingDuration, r.sampleLocations, r.outdoorReferenceTaken ? 'Yes' : 'No']),
      ))
    }
  }
  if (ap.appendixC) {
    out.push(...heading2(ap.appendixC.title))
    if (ap.appendixC.description) out.push(p(ap.appendixC.description, { align: AlignmentType.JUSTIFIED }))
    if (Array.isArray(ap.appendixC.photos) && ap.appendixC.photos.length > 0) {
      for (const photo of ap.appendixC.photos) {
        out.push(bullet(`${photo.caption} (${photo.zoneName}) — ${photo.relativePath}`))
      }
    }
  }
  if (ap.appendixD) {
    out.push(...heading2(ap.appendixD.title))
    if (ap.appendixD.description) out.push(p(ap.appendixD.description, { align: AlignmentType.JUSTIFIED }))
    if (Array.isArray(ap.appendixD.citations) && ap.appendixD.citations.length > 0) {
      for (const c of ap.appendixD.citations) {
        out.push(bullet(`${c.source}${c.edition ? ` (${c.edition})` : ''}${c.authority ? ` — ${c.authority}` : ''}`))
      }
    }
    if (ap.appendixD.engineVersionLine) {
      out.push(p(ap.appendixD.engineVersionLine, { italics: true, size: 18, color: COLORS.light, before: 200 }))
    }
  }
  if (ap.appendixE) {
    out.push(...heading2(ap.appendixE.title))
    if (ap.appendixE.description) out.push(p(ap.appendixE.description, { align: AlignmentType.JUSTIFIED }))
    if (Array.isArray(ap.appendixE.calibrationRecords) && ap.appendixE.calibrationRecords.length > 0) {
      out.push(buildSimpleTable(
        ['Instrument', 'Serial', 'Last Calibration', 'Status'],
        ap.appendixE.calibrationRecords.map(r => [r.instrumentModel, r.serial || '—', r.lastCalibration || '—', r.status || '—']),
      ))
    }
    if (Array.isArray(ap.appendixE.qaNotes) && ap.appendixE.qaNotes.length > 0) {
      for (const note of ap.appendixE.qaNotes) {
        out.push(bullet(note))
      }
    }
  }
  if (ap.appendixF) {
    out.push(...heading2(ap.appendixF.title))
    if (ap.appendixF.description) out.push(p(ap.appendixF.description, { align: AlignmentType.JUSTIFIED }))
    if (Array.isArray(ap.appendixF.entries) && ap.appendixF.entries.length > 0) {
      for (const e of ap.appendixF.entries) {
        out.push(new Paragraph({
          children: [
            new TextRun({ text: `${e.term}: `, bold: true, font: FONTS.body, size: 22, color: SLATE }),
            new TextRun({ text: e.definition, font: FONTS.body, size: 22, color: SLATE_BODY }),
          ],
          spacing: { after: 80 },
        }))
      }
    }
  }
  return out
}

function buildSimpleTable(headers, rows) {
  const headerRow = new TableRow({
    children: headers.map(h => new TableCell({
      width: { size: Math.floor(TOTAL_WIDTH_DXA / headers.length), type: WidthType.DXA },
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      shading: { fill: SLATE_FILL, type: ShadingType.CLEAR, color: 'auto' },
      children: [new Paragraph({
        children: [new TextRun({ text: h, bold: true, font: FONTS.body, size: 20, color: SLATE })],
      })],
      borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
    })),
    tableHeader: true,
  })
  const bodyRows = rows.map(cells => new TableRow({
    children: cells.map(cell => new TableCell({
      width: { size: Math.floor(TOTAL_WIDTH_DXA / cells.length), type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text: String(cell || ''), font: FONTS.body, size: 20, color: SLATE_BODY })],
      })],
      borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
    })),
  }))
  return new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: headers.map(() => Math.floor(TOTAL_WIDTH_DXA / headers.length)),
    borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder, insideHorizontal: blackBorder, insideVertical: blackBorder },
  })
}

// v2.3 §2 — Building and System Conditions section is omitted entirely
// (no header, no body, no TOC entry) when the engine signals
// rendered=false. The omittedReason was already appended to Scope of
// Work in client.ts. We render nothing here.
function buildBuildingConditionsSection(report) {
  const section = report.buildingAndSystemConditions
  if (!section || !section.rendered) return []
  const out = [...heading2('Building and System Conditions')]
  for (const f of (section.findings || [])) {
    out.push(...buildInlineFindingDocx(f))
  }
  return out
}

// v2.3 §5 — Zone section. Findings render as RenderedFinding blocks.
// Empty zones render exactly the prescribed single sentence.
function buildZoneSections(report) {
  const out = [...heading2('Zone Findings')]
  for (const zone of report.zoneSections) {
    out.push(heading3(zone.zoneName))
    if (zone.zoneDescription) {
      out.push(p(zone.zoneDescription, { size: 22, color: COLORS.body }))
    }
    if (zone.samplingSummary) {
      out.push(p(zone.samplingSummary, { size: 20, color: COLORS.sub, italics: true }))
    }
    const findings = zone.findings || []
    if (findings.length === 0) {
      out.push(p(
        'No conditions warranting elevated concern were identified in this zone within the stated limitations.',
        { size: 22, color: COLORS.body },
      ))
      continue
    }
    for (const f of findings) {
      out.push(...buildInlineFindingDocx(f))
    }
    if (zone.interpretation) {
      out.push(p('Interpretation', { bold: true, size: 20, color: COLORS.sub, after: 60 }))
      out.push(p(zone.interpretation))
    }
  }
  return out
}

/**
 * v2.3 §3 / §7 — render a self-contained RenderedFinding block as a
 * sequence of docx Paragraphs. Narrative → optional Observed line →
 * inline Limitations sublist (italic, indented) → Recommended
 * actions sublist. 12pt below the block before the next finding.
 */
function buildInlineFindingDocx(rf) {
  if (!rf) return []
  const out = []
  out.push(p(rf.narrative || '', { align: AlignmentType.JUSTIFIED, after: 80 }))
  if (rf.observedValue) {
    out.push(new Paragraph({
      children: [
        new TextRun({ text: 'Observed: ', font: FONTS.body, size: 20, bold: true, color: SLATE }),
        new TextRun({ text: rf.observedValue, font: FONTS.body, size: 20, color: SLATE_BODY }),
      ],
      spacing: { after: 80 },
    }))
  }
  if (rf.limitations && rf.limitations.length > 0) {
    out.push(p('Limitations of this finding:', {
      italics: true, bold: true, size: 18, color: SLATE, after: 40,
    }))
    for (const l of rf.limitations) {
      out.push(new Paragraph({
        children: [new TextRun({
          text: l, font: FONTS.body, size: 18, italics: true, color: COLORS.sub,
        })],
        bullet: { level: 0 },
        indent: { left: 360 },
        spacing: { after: 40 },
      }))
    }
  }
  if (rf.recommendedActions && rf.recommendedActions.length > 0) {
    out.push(p('Recommended actions:', {
      bold: true, size: 18, color: SLATE, after: 40,
    }))
    for (const a of rf.recommendedActions) {
      out.push(new Paragraph({
        children: [new TextRun({
          text: actionLine(a), font: FONTS.body, size: 20, color: COLORS.body,
        })],
        bullet: { level: 0 },
        indent: { left: 360 },
        spacing: { after: 40 },
      }))
    }
  }
  out.push(p('', { after: 240 })) // 12pt block-spacer
  return out
}

function buildRecommendationsRegister(report) {
  // v2.2 visual upgrade — table form with Priority / Timeframe /
  // Action / Reference columns. Priority group rows separate the
  // priority tiers (cyan-tinted band rows within the table).
  const reg = report.recommendationsRegister
  const groups = [
    ['Immediate', reg.immediate],
    ['Short term', reg.shortTerm],
    ['Further evaluation', reg.furtherEvaluation],
    ['Long term (optional)', reg.longTermOptional],
  ].filter(([, list]) => list.length > 0)
  if (groups.length === 0) return []

  return [...heading2('Recommendations Register'), buildRecommendationsTable(groups)]
}

function buildRecommendationsTable(groups) {
  // Column widths roughly: Priority 16% / Timeframe 14% / Action 50% / Ref 20%
  const COL_PRIORITY = Math.round(TOTAL_WIDTH_DXA * 0.16)
  const COL_TIMEFRAME = Math.round(TOTAL_WIDTH_DXA * 0.14)
  const COL_ACTION = Math.round(TOTAL_WIDTH_DXA * 0.50)
  const COL_REF = Math.round(TOTAL_WIDTH_DXA * 0.20)

  // Header row — cyan band, white text
  const headerCell = (text, width) => new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONTS.body, size: 18, bold: true, color: 'FFFFFF' })],
      spacing: { after: 0 },
    })],
    shading: { type: ShadingType.CLEAR, fill: CYAN },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    width: { size: width, type: WidthType.DXA },
    borders: { top: cyanBorder, bottom: cyanBorder, left: cyanBorder, right: cyanBorder },
  })

  // Priority group divider row — cyan-tinted, single cell spanning all columns
  const groupRow = (title) => new TableRow({
    children: [new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: title.toUpperCase(), font: FONTS.body, size: 18, bold: true, color: CYAN_DARK })],
        spacing: { after: 0 },
      })],
      shading: { type: ShadingType.CLEAR, fill: CYAN_FILL },
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
      columnSpan: 4,
      width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
      borders: { top: cyanBorder, bottom: cyanBorder, left: cyanBorder, right: cyanBorder },
    })],
  })

  // Body row
  const bodyCell = (text, width, opts = {}) => new TableCell({
    children: [new Paragraph({
      children: [new TextRun({
        text: text || '—', font: FONTS.body, size: 18,
        color: opts.color || COLORS.body,
        bold: opts.bold || false, italics: opts.italics || false,
      })],
      spacing: { after: 0 },
    })],
    margins: { top: 90, bottom: 90, left: 140, right: 140 },
    width: { size: width, type: WidthType.DXA },
    borders: { top: lightBorder, bottom: lightBorder, left: lightBorder, right: lightBorder },
  })

  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('Priority', COL_PRIORITY),
        headerCell('Timeframe', COL_TIMEFRAME),
        headerCell('Action', COL_ACTION),
        headerCell('Reference', COL_REF),
      ],
    }),
  ]

  for (const [title, list] of groups) {
    rows.push(groupRow(title))
    for (const a of list) {
      rows.push(new TableRow({
        children: [
          bodyCell(PRIORITY_LABEL[a.priority] || a.priority, COL_PRIORITY, { bold: true, color: CYAN_DARK }),
          bodyCell(a.timeframe, COL_TIMEFRAME),
          bodyCell(a.action, COL_ACTION),
          bodyCell(a.standardReference || '—', COL_REF, { italics: true, color: COLORS.sub }),
        ],
      }))
    }
  }

  return new Table({
    rows,
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [COL_PRIORITY, COL_TIMEFRAME, COL_ACTION, COL_REF],
    borders: { top: cyanBorder, bottom: cyanBorder, left: cyanBorder, right: cyanBorder, insideHorizontal: lightBorder, insideVertical: lightBorder },
  })
}

function buildLimitations(report) {
  return [
    ...heading2('Limitations and Professional Judgment'),
    p(report.limitationsAndProfessionalJudgment),
  ]
}

function buildSignatory(report) {
  const sig = report.signatoryBlock
  const preparedCol = [
    p('Prepared by', { bold: true, size: 18, color: COLORS.sub, after: 40 }),
    p(sig.preparedBy.name, { bold: true, size: 22, color: COLORS.text, after: 40 }),
    p(sig.preparedBy.credentials, { size: 20, color: COLORS.sub, after: 40 }),
    p(sig.preparedBy.firm, { size: 18, color: COLORS.muted, after: 20 }),
    p(sig.preparedBy.contact || '', { size: 18, color: COLORS.muted, after: 0 }),
  ]
  const reviewedCol = sig.reviewedBy
    ? [
        p('Reviewed by qualified professional', { bold: true, size: 18, color: COLORS.sub, after: 40 }),
        p(sig.reviewedBy.name, { bold: true, size: 22, color: COLORS.text, after: 40 }),
        p(sig.reviewedBy.credentials, { size: 20, color: COLORS.sub, after: 40 }),
        ...(sig.reviewedBy.licenseNumbers ? [p(`License: ${sig.reviewedBy.licenseNumbers}`, { size: 18, color: COLORS.muted, after: 0 })] : []),
      ]
    : [p('', { after: 0 })]
  return [
    ...heading2('Signatory'),
    borderlessLayoutTable([preparedCol, reviewedCol]),
    p(`Status: ${REVIEW_STATUS_LABEL[sig.status] || sig.status}`, { italics: true, size: 18, color: COLORS.muted }),
  ]
}

function buildAssessmentIndexAppendix(idx) {
  const out = [
    new Paragraph({ children: [new PageBreak()] }),
    ...heading2('Appendix — Assessment Index (Informational Only)'),
    p(idx.disclaimer, { italics: true, color: COLORS.sub }),
  ]
  // Flat list — keeps the appendix simple and avoids the validators tripping
  // on tier label text inside table cells.
  for (const z of idx.zoneScores) {
    out.push(p(`${z.zoneName}: ${z.composite} (${z.tier})`, { size: 20 }))
  }
  out.push(p(`Site: ${idx.siteScore} (${idx.siteTier})`, { bold: true, size: 22, color: COLORS.text }))
  return out
}

// v2.4 §7 — engine version line moved to Appendix D (last line).
// The body footer is now empty; page footers in the docx section
// properties carry "Indoor Air Quality Evaluation — PSEC Project
// [n] — Page X of Y" instead.
function buildFooter(report) {
  return []
}

// ── Public ──

/**
 * Build the cover section + main-children array for a docx Document
 * from a ClientReportResult. Caller wraps the result in a Document
 * with the two sections.
 */
export function buildClientDocx(result) {
  if (result.kind === 'pre_assessment_memo') {
    return buildMemoDocx(result.memo, result.reasons || [])
  }
  const report = result.report
  const cover = buildCoverPage(report.cover, report.reviewStatus, report.transmittalLetter?.projectNumber || report.meta?.projectNumber)
  const main = [
    ...buildTransmittal(report),
    ...buildTableOfContents(report),
    ...buildMethodologyDisclosure(report),
    ...buildExecutiveSummary(report),
    ...buildScope(report),
    ...buildSamplingMethodologyDocx(report),
    ...buildResultsSection(report),
    ...buildBuildingContext(report),
    ...buildBuildingConditionsSection(report),
    ...buildZoneSections(report),
    ...buildRecommendationsRegister(report),
    ...buildLimitations(report),
    ...buildSignatory(report),
    ...buildAppendices(report),
    ...(report.appendix.assessmentIndexInformationalOnly
      ? buildAssessmentIndexAppendix(report.appendix.assessmentIndexInformationalOnly)
      : []),
    ...buildFooter(report),
  ]
  return { cover, main }
}

function buildMemoDocx(memo, reasons) {
  const cover = buildCoverPage(memo.cover, 'draft_pending_professional_review', memo.meta?.projectNumber)
  const main = [
    p(`Notice: ${memo.notice}`, { italics: true, color: 'C2410C', after: 240 }),
    ...heading2('Purpose'),
    p(memo.purposeStatement),
    ...heading2('Identified Data Gaps'),
    ...memo.dataGaps.map(g => bullet(`${g.trigger}: ${g.description}`)),
    ...(reasons.length > 0
      ? [...heading2('Reasons for Memo (Refusal-to-Issue Triggers)'), ...reasons.map(r => bullet(r))]
      : []),
    ...heading2('Recommended Follow-Up'),
    ...memo.recommendedFollowUp.map(r => bullet(r)),
    ...buildSignatory({ signatoryBlock: memo.signatoryBlock }),
    new Paragraph({ children: [new PageBreak()] }),
    p(`Engine version: ${memo.engineVersion}.`, {
      align: AlignmentType.CENTER, italics: true, size: 16, color: COLORS.light,
    }),
  ]
  return { cover, main }
}
