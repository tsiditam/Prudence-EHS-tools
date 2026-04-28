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

import { Paragraph, TextRun, HeadingLevel, AlignmentType, SectionType, PageBreak } from 'docx'
import { FONTS, COLORS } from './styles'
import { borderlessLayoutTable } from './tables'

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

const heading2 = (text) => p(text, { heading: HeadingLevel.HEADING_2, bold: true, size: 26, color: COLORS.text })
const heading3 = (text) => p(text, { heading: HeadingLevel.HEADING_3, bold: true, size: 24, color: '334155' })

function actionLine(action) {
  const priority = PRIORITY_LABEL[action.priority] || action.priority
  const std = action.standardReference ? ` — ${action.standardReference}` : ''
  return `${priority} (${action.timeframe}): ${action.action}${std}`
}

// ── Cover ──

function buildCoverPage(cover, reviewStatus) {
  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { margin: { top: 2160, right: 1440, bottom: 1440, left: 1440 } },
    },
    children: [
      p(cover.preparedBy, { align: AlignmentType.CENTER, bold: true, size: 26, color: COLORS.text, after: 80 }),
      p(cover.title, { align: AlignmentType.CENTER, bold: true, size: 48, color: COLORS.text, after: 400 }),
      p('', { after: 600 }),
      p(`Site: ${cover.facility}`, { align: AlignmentType.CENTER, size: 22, color: COLORS.text, after: 60 }),
      p(`Location: ${cover.location || '—'}`, { align: AlignmentType.CENTER, size: 22, color: COLORS.sub, after: 60 }),
      p(`Assessment Date: ${cover.date}`, { align: AlignmentType.CENTER, size: 22, color: COLORS.sub, after: 320 }),
      p(REVIEW_STATUS_LABEL[reviewStatus] || cover.status, { align: AlignmentType.CENTER, bold: true, size: 22, color: COLORS.text, after: 200 }),
      p(cover.methodologyLine, { align: AlignmentType.CENTER, italics: true, size: 18, color: COLORS.muted, after: 400 }),
      ...(cover.draftNotice ? [p(cover.draftNotice, { align: AlignmentType.CENTER, italics: true, size: 20, color: 'C2410C' })] : []),
    ],
  }
}

// ── Sections ──

function buildTransmittal(report) {
  return [
    heading2('Transmittal'),
    p(report.transmittal),
  ]
}

function buildExecutiveSummary(report) {
  const summary = report.executiveSummary
  const out = [
    heading2('Executive Summary'),
    p(summary.overview),
  ]
  if (summary.summaryOfFindings.length > 0) {
    out.push(heading3('Summary of Conditions Identified'))
    summary.summaryOfFindings.forEach(f => out.push(bullet(f)))
  }
  out.push(heading3('Overall Professional Opinion'))
  out.push(p(summary.overallProfessionalOpinionLanguage))
  if (summary.priorityActions.length > 0) {
    out.push(heading3('Priority Actions'))
    summary.priorityActions.forEach(a => out.push(bullet(actionLine(a))))
  }
  return out
}

function buildScope(report) {
  return [
    heading2('Scope and Methodology'),
    p(report.scopeAndMethodology),
  ]
}

function buildBuildingContext(report) {
  return [
    heading2('Building and System Context'),
    p(report.buildingAndSystemContext),
  ]
}

function buildZoneSections(report) {
  const out = [heading2('Zone Findings')]
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
  const out = [heading2('Recommendations Register')]
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
    heading2('Limitations and Professional Judgment'),
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
    heading2('Signatory'),
    borderlessLayoutTable([preparedCol, reviewedCol]),
    p(`Status: ${REVIEW_STATUS_LABEL[sig.status] || sig.status}`, { italics: true, size: 18, color: COLORS.muted }),
  ]
}

function buildAssessmentIndexAppendix(idx) {
  const out = [
    new Paragraph({ children: [new PageBreak()] }),
    heading2('Appendix — Assessment Index (Informational Only)'),
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
  const cover = buildCoverPage(report.cover, report.reviewStatus)
  const main = [
    ...buildTransmittal(report),
    ...buildExecutiveSummary(report),
    ...buildScope(report),
    ...buildBuildingContext(report),
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
  const cover = buildCoverPage(memo.cover, 'draft_pending_professional_review')
  const main = [
    p(`Notice: ${memo.notice}`, { italics: true, color: 'C2410C', after: 240 }),
    heading2('Purpose'),
    p(memo.purposeStatement),
    heading2('Identified Data Gaps'),
    ...memo.dataGaps.map(g => bullet(`${g.trigger}: ${g.description}`)),
    ...(reasons.length > 0
      ? [heading2('Reasons for Memo (Refusal-to-Issue Triggers)'), ...reasons.map(r => bullet(r))]
      : []),
    heading2('Recommended Follow-Up'),
    ...memo.recommendedFollowUp.map(r => bullet(r)),
    ...buildSignatory({ signatoryBlock: memo.signatoryBlock }),
    new Paragraph({ children: [new PageBreak()] }),
    p(`Generated by AtmosFlow Engine ${memo.engineVersion} on ${new Date(memo.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, {
      align: AlignmentType.CENTER, italics: true, size: 16, color: COLORS.light,
    }),
  ]
  return { cover, main }
}
