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

const NAVY = '1B2A41'
const NAVY_DARK = '0F1A2A'
const NAVY_LIGHT = 'B8C4D6'

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const navyBorder = { style: BorderStyle.SINGLE, size: 4, color: NAVY }
const lightBorder = { style: BorderStyle.SINGLE, size: 4, color: NAVY_LIGHT }

const TOTAL_WIDTH_DXA = 9360 // standard 6.5in content width

const PRIORITY_LABEL = {
  immediate: 'Immediate',
  short_term: 'Short term',
  further_evaluation: 'Further evaluation',
  long_term: 'Long term',
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
 * v2.2 — section band heading: full-width navy fill with white text,
 * followed by a small spacer paragraph to restore vertical rhythm.
 * Mirrors the CTSI sage-band section dividers.
 *
 * Returns an array [Table, Paragraph] — callers spread it into the
 * section children list.
 */
function heading2(text) {
  const cell = new TableCell({
    children: [new Paragraph({
      children: [new TextRun({
        text: text || '', font: FONTS.body, size: 26, bold: true, color: 'FFFFFF',
      })],
      spacing: { before: 0, after: 0 },
      alignment: AlignmentType.LEFT,
    })],
    shading: { type: ShadingType.CLEAR, fill: NAVY },
    margins: { top: 140, bottom: 140, left: 220, right: 220 },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
  })
  const band = new Table({
    rows: [new TableRow({ children: [cell] })],
    width: { size: TOTAL_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [TOTAL_WIDTH_DXA],
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
  })
  // Spacer paragraph — gives breathing room before the next section
  // body paragraph and ensures docx renders a proper paragraph break
  // between Table and following content.
  const spacer = new Paragraph({
    children: [new TextRun({ text: '' })],
    spacing: { before: 0, after: 140 },
  })
  return [band, spacer]
}

const heading3 = (text) => p(text, { heading: HeadingLevel.HEADING_3, bold: true, size: 24, color: NAVY, after: 100 })

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
    align: AlignmentType.CENTER, bold: true, size: 16, color: COLORS.sub, after: 60,
  })
  const valueLine = (text, opts = {}) => p(text, {
    align: AlignmentType.CENTER, size: opts.size || 22, color: opts.color || COLORS.text,
    bold: opts.bold !== false, after: opts.after !== undefined ? opts.after : 200,
  })
  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { margin: { top: 2160, right: 1440, bottom: 1440, left: 1440 } },
    },
    children: [
      // Firm name
      p(cover.preparedBy, { align: AlignmentType.CENTER, bold: true, size: 24, color: COLORS.text, after: 80 }),
      p('', { after: 800 }),
      // Title — two lines, all caps
      p('INDOOR AIR QUALITY', { align: AlignmentType.CENTER, bold: true, size: 56, color: COLORS.text, after: 100 }),
      p('EVALUATION', { align: AlignmentType.CENTER, bold: true, size: 56, color: COLORS.text, after: 400 }),
      // Centered navy rule (single dash run for visual)
      p('—', { align: AlignmentType.CENTER, size: 32, color: NAVY, bold: true, after: 400 }),
      // Site block
      labelLine('PERFORMED AT'),
      valueLine(cover.facility, { size: 26, after: 80 }),
      valueLine(cover.location || '', { size: 22, color: COLORS.sub, bold: false, after: 240 }),
      // Date block
      labelLine('ASSESSMENT DATE'),
      valueLine(cover.date, { size: 22, color: COLORS.text, bold: false, after: 240 }),
      // Project number block (if present)
      ...(projectNumber ? [
        labelLine('PSEC PROJECT NUMBER'),
        valueLine(projectNumber, { size: 22, color: COLORS.text, after: 320 }),
      ] : [p('', { after: 320 })]),
      // Status pill (bold caps)
      p(REVIEW_STATUS_LABEL[reviewStatus] || cover.status, { align: AlignmentType.CENTER, bold: true, size: 22, color: COLORS.text, after: 200 }),
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
    p(letter.date, { after: 280 }),
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
  // v2.2 §6 — CTSI-format Executive Summary: 4-row metadata table
  // (label cells navy-banded with white text, value cells white with
  // navy border) + narrative blocks each in their own framed section
  // with a navy header band (mirroring CTSI sage bands).
  const summary = report.executiveSummary
  const out = [...heading2('Executive Summary')]
  const md = summary.metadataTable
  if (md) {
    out.push(buildExecMetadataTable(md))
    out.push(p('', { after: 200 }))
  }

  // Overall opinion call-out — bordered card with navy left rule.
  out.push(buildOpinionCard(summary.overallProfessionalOpinionLanguage))

  // Four narrative blocks each in a navy-banded framed section.
  if (summary.scopeOfWork) {
    out.push(buildExecBlock('Scope of Work', [p(summary.scopeOfWork, { align: AlignmentType.JUSTIFIED })]))
  }
  if (summary.resultsNarrative) {
    out.push(buildExecBlock('Results', [p(summary.resultsNarrative, { align: AlignmentType.JUSTIFIED })]))
  }
  if (summary.observations && summary.observations.length > 0) {
    out.push(buildExecBlock('Observations', summary.observations.map(o => bullet(o))))
  }
  if (summary.recommendations && summary.recommendations.length > 0) {
    out.push(buildExecBlock('Recommendations', summary.recommendations.map(a => bullet(actionLine(a)))))
  }
  return out
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
    shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
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

function buildBuildingConditionsSection(report) {
  const section = report.buildingAndSystemConditions
  if (!section) return []
  const out = [...heading2('Building and System Conditions')]
  out.push(p('Observed conditions', { bold: true, size: 20, color: COLORS.sub, after: 60 }))
  if (section.observedConditions.length > 0) {
    section.observedConditions.forEach(c => out.push(bullet(c)))
  } else {
    out.push(p('No building or system conditions identified within the stated limitations.', { italics: true, color: COLORS.sub }))
  }
  if (section.dataLimitations.length > 0) {
    out.push(p('Data limitations', { bold: true, size: 20, color: COLORS.sub, after: 60 }))
    section.dataLimitations.forEach(l => out.push(bullet(l)))
  }
  if (section.recommendedActions.length > 0) {
    out.push(p('Recommended actions', { bold: true, size: 20, color: COLORS.sub, after: 60 }))
    section.recommendedActions.forEach(a => out.push(bullet(actionLine(a))))
  }
  return out
}

function buildZoneSections(report) {
  const out = [...heading2('Zone Findings')]
  for (const zone of report.zoneSections) {
    out.push(heading3(zone.zoneName))
    out.push(p('Observed conditions', { bold: true, size: 20, color: COLORS.sub, after: 60 }))
    if (zone.observedConditions.length > 0) {
      zone.observedConditions.forEach(c => out.push(bullet(c)))
    } else {
      out.push(p('No significant conditions identified within the stated limitations.', { italics: true, color: COLORS.sub }))
    }
    out.push(p('Interpretation', { bold: true, size: 20, color: COLORS.sub, after: 60 }))
    out.push(p(zone.interpretation))
    if (zone.dataLimitations.length > 0) {
      out.push(p('Data limitations', { bold: true, size: 20, color: COLORS.sub, after: 60 }))
      zone.dataLimitations.forEach(l => out.push(bullet(l)))
    }
    if (zone.recommendedActions.length > 0) {
      out.push(p('Recommended actions', { bold: true, size: 20, color: COLORS.sub, after: 60 }))
      zone.recommendedActions.forEach(a => out.push(bullet(actionLine(a))))
    }
  }
  return out
}

function buildRecommendationsRegister(report) {
  const reg = report.recommendationsRegister
  const groups = [
    ['Immediate', reg.immediate],
    ['Short term', reg.shortTerm],
    ['Further evaluation', reg.furtherEvaluation],
    ['Long term (optional)', reg.longTermOptional],
  ].filter(([, list]) => list.length > 0)
  if (groups.length === 0) return []
  const out = [...heading2('Recommendations Register')]
  for (const [title, list] of groups) {
    out.push(heading3(title))
    list.forEach(a => {
      const std = a.standardReference ? ` — ${a.standardReference}` : ''
      out.push(bullet(`${a.timeframe}: ${a.action}${std}`))
    })
  }
  return out
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

function buildFooter(report) {
  return [
    new Paragraph({ children: [new PageBreak()] }),
    p(`Generated by AtmosFlow Engine ${report.engineVersion} on ${new Date(report.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, {
      align: AlignmentType.CENTER, italics: true, size: 16, color: COLORS.light,
    }),
  ]
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
    ...buildMethodologyDisclosure(report),
    ...buildExecutiveSummary(report),
    ...buildScope(report),
    ...buildSamplingMethodologyDocx(report),
    ...buildBuildingContext(report),
    ...buildBuildingConditionsSection(report),
    ...buildZoneSections(report),
    ...buildRecommendationsRegister(report),
    ...buildLimitations(report),
    ...buildSignatory(report),
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
    p(`Generated by AtmosFlow Engine ${memo.engineVersion} on ${new Date(memo.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, {
      align: AlignmentType.CENTER, italics: true, size: 16, color: COLORS.light,
    }),
  ]
  return { cover, main }
}
