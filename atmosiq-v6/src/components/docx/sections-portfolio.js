/**
 * AtmosFlow DOCX — IAQ Portfolio Summary section builder.
 *
 * Lays out the portfolio model (`assemblePortfolioModel`) as a compact
 * practice-level Word report: a KPI row, the risk-band distribution, a
 * per-site status table, an attention queue, and a single basis/limitations
 * note. Pure layout — it renders only what the model provides and derives
 * nothing.
 *
 * Reuses the house report chrome and table utilities (Aptos body face via
 * FONTS.body, shared buildTable / p / sectionHeading2) so it reads as a
 * sibling of the consultant and monitoring reports. The face is only ever
 * named through FONTS.body — never a quoted literal — so the DOCX font guard
 * (tests/components/docx-fonts.test.js) stays green.
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { FONTS, COLORS } from './styles'
import { buildTable } from './tables'
import { p } from './paragraphs'
import { sectionHeading2 } from './headings'

const CENTER = AlignmentType.CENTER
const hex = (c) => String(c || '').replace('#', '')

function titleBlock(meta) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 60 },
      children: [new TextRun({ text: meta.reportTitle || 'IAQ Portfolio Summary', font: FONTS.body, size: 40, bold: true, color: COLORS.text })],
    }),
    p(`${meta.firm}  ·  ${meta.portfolioScope}`, { size: 20, color: COLORS.sub, after: 20 }),
    p(`${meta.periodLabel}  ·  Generated ${meta.generatedLabel}${meta.reportId ? `  ·  ${meta.reportId}` : ''}`, {
      size: 18,
      color: COLORS.muted,
      after: 220,
    }),
  ]
}

function kpiRow(k) {
  const headers = [
    { text: 'Assessments', width: 25 },
    { text: 'Distinct sites', width: 25 },
    { text: 'Avg composite', width: 25 },
    { text: 'Drafts in progress', width: 25 },
  ]
  const delta = k.deltaFinalized === null || k.deltaFinalized === undefined ? '' : ` (${k.deltaFinalized >= 0 ? '+' : ''}${k.deltaFinalized} vs prior)`
  const avgTxt = k.avgScore === null ? '—' : `${k.avgScore}${k.avgScoreBand ? ` · ${k.avgScoreBand.label}` : ''}`
  const avgColor = k.avgScoreBand ? hex(k.avgScoreBand.color) : COLORS.text
  const row = [
    { text: `${k.assessmentsFinalized}${delta}`, bold: true, size: 26, color: COLORS.text },
    { text: String(k.distinctSites), bold: true, size: 26, color: COLORS.text },
    { text: avgTxt, bold: true, size: 26, color: avgColor },
    { text: String(k.draftsInProgress), bold: true, size: 26, color: COLORS.text },
  ]
  return buildTable(headers, [row])
}

function riskTable(dist) {
  if (!dist || !dist.length) return []
  const headers = [
    { text: 'Risk band', width: 50 },
    { text: 'Assessments', width: 25, align: CENTER },
    { text: 'Share', width: 25, align: CENTER },
  ]
  const rows = dist.map((d) => [
    { text: d.label, bold: true, color: hex(d.color) },
    { text: String(d.count), align: CENTER },
    { text: `${d.pct}%`, align: CENTER },
  ])
  return [sectionHeading2('Risk distribution'), buildTable(headers, rows)]
}

function siteTable(rows) {
  if (!rows || !rows.length) return []
  const headers = [
    { text: 'Site', width: 28 },
    { text: 'Assess.', width: 10, align: CENTER },
    { text: 'Last assessed', width: 17 },
    { text: 'Score', width: 10, align: CENTER },
    { text: 'Risk', width: 15 },
    { text: 'Reassessment', width: 20 },
  ]
  const body = rows.map((r) => [
    { text: r.facility, bold: true },
    { text: String(r.assessments), align: CENTER },
    { text: r.lastAssessed },
    { text: r.score === null || r.score === undefined ? '—' : String(r.score), align: CENTER },
    { text: r.band.label, bold: true, color: hex(r.band.color) },
    { text: r.reassessment ? r.reassessment.label : '—', size: 18 },
  ])
  return [sectionHeading2('Portfolio by site'), buildTable(headers, body)]
}

function attentionBlock(q, hasAttention) {
  const out = [sectionHeading2('Needs attention')]
  if (!hasAttention) {
    out.push(p('Nothing needs attention right now — no overdue reassessments, calibration current, and no stale drafts.', { color: COLORS.sub }))
    return out
  }
  if (q.calibration) {
    const toneColor = q.calibration.tone === 'danger' ? 'B91C1C' : 'A16207'
    out.push(p(`Calibration — ${q.calibration.message}.`, { bold: true, color: toneColor, after: 100 }))
  }
  if (q.overdueReassessments && q.overdueReassessments.length) {
    out.push(p('Overdue reassessments', { bold: true, size: 22, color: COLORS.text, after: 40 }))
    q.overdueReassessments.forEach((o) =>
      out.push(p(`•  ${o.facility} — ${o.dueLabel}${o.daysOverdue != null ? ` (${o.daysOverdue} days overdue)` : ''}`, { color: COLORS.body, after: 30 })),
    )
  }
  if (q.staleDrafts && q.staleDrafts.length) {
    out.push(p('Stale drafts', { bold: true, size: 22, color: COLORS.text, after: 40 }))
    q.staleDrafts.forEach((d) => out.push(p(`•  ${d.facility} — last touched ${d.daysStale} days ago`, { color: COLORS.body, after: 30 })))
  }
  return out
}

function limitationsBlock(lims) {
  return [sectionHeading2('Basis & limitations'), ...(lims || []).map((l) => p(l, { size: 20, color: COLORS.sub }))]
}

/**
 * Build the children array for the single portfolio-report section.
 * @param {object} model  the output of assemblePortfolioModel
 */
export function portfolioReportChildren(model) {
  if (!model) return []
  const out = [...titleBlock(model.meta || {})]
  if (model.isEmpty) {
    out.push(
      p('No assessments have been finalized yet. Once you finalize assessments in AtmosFlow, this summary rolls them up by site and risk band.', { color: COLORS.sub, after: 200 }),
    )
    out.push(...limitationsBlock(model.limitations))
    return out
  }
  out.push(kpiRow(model.kpis))
  out.push(...riskTable(model.riskDistribution))
  out.push(...siteTable(model.siteRows))
  out.push(...attentionBlock(model.attentionQueue, model.hasAttention))
  out.push(...limitationsBlock(model.limitations))
  return out
}
