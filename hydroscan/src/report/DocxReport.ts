/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DOCX report builder — renders a ReportModel into a Word document via the
 * `docx` package (Buffer/Blob output). Screening-only positioning rides every
 * page (draft watermark in the header + a limitations section). The bibliography
 * is citation-tracker-gated by the model (only manifest-backed sources appear).
 *
 * This is the built-in report (path A). User-supplied .docx templates render
 * through a separate docxtemplater endpoint (path B) so heavy deps never land
 * on the Marlow hot path.
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer, PageNumber,
} from 'docx'
import type { ReportModel } from './report-model'

const ACCENT = '0D9488'
const MUTED = '6B7380'
const DANGER = 'B91C1C'

function h1(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true })] })
}
function h2(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 }, children: [new TextRun({ text, bold: true, color: ACCENT })] })
}
function p(text: string, opts: { bold?: boolean; color?: string; italics?: boolean; size?: number } = {}) {
  return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, bold: opts.bold, color: opts.color, italics: opts.italics, size: opts.size })] })
}
function bullet(text: string) {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text })] })
}
function kv(label: string, value: string) {
  return new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value || '—' })] })
}

const cellBorder = { style: BorderStyle.SINGLE, size: 2, color: 'D9DEE5' }
function cell(text: string, opts: { bold?: boolean; color?: string; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
    children: [new Paragraph({ children: [new TextRun({ text: text ?? '', bold: opts.bold, color: opts.color, size: 18 })] })],
  })
}
function table(header: string[], rows: string[][], widths?: number[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, { bold: true, color: 'FFFFFF', width: widths?.[i] })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { width: widths?.[i] })) })),
    ],
  })
}

function findingStatus(f: ReportModel['findings'][number]): string {
  if (f.violations.length) return 'VIOLATION'
  if (f.advisories.length) return 'Advisory'
  return 'Within limits'
}
function findingLimit(f: ReportModel['findings'][number]): string {
  const v = f.violations[0] || f.advisories[0]
  return v ? `${v.std} ${v.threshold}` : '—'
}

export function buildReportDocument(model: ReportModel): Document {
  const m = model
  const d = m.meta.generatedAt
  const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const sections: Array<Paragraph | Table> = []

  // ── Cover / Transmittal ──
  sections.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 40 }, children: [new TextRun({ text: 'HydroScan', bold: true, size: 44, color: ACCENT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: m.meta.title, size: 26 })] }),
    kv('Report ID', m.meta.reportId),
    kv('Date', dateStr),
    kv('Prepared by', m.meta.preparedBy),
    kv('Assessor', `${m.assessor.name}${m.assessor.certifications ? ' — ' + m.assessor.certifications : ''}`),
    kv('Source type', m.site.sourceType),
    ...(m.site.pwsName ? [kv('Public water system', `${m.site.pwsName}${m.site.pwsId ? ' (' + m.site.pwsId + ')' : ''}`)] : []),
    kv('Engine / standards', `Engine ${m.meta.engineVersion} · Standards manifest ${m.meta.standardsManifestVersion}`),
    new Paragraph({ spacing: { before: 160, after: 80 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: ACCENT } }, children: [new TextRun({ text: 'SCREENING NOTICE', bold: true, color: DANGER })] }),
    p(m.screeningNotice, { italics: true, color: MUTED }),
  )

  // ── Scope & Limitations + DQO ──
  sections.push(h1('1. Scope, Methodology & Data Quality Objectives'))
  sections.push(p('This screening evaluates entered laboratory and field results against the hardcoded HydroScan standards manifest (EPA SDWA 40 CFR 141, WHO GDWQ, LCRR, PFAS NPDWR, ASHRAE 188). Tier classifications are advisory and do not constitute a regulatory compliance determination.'))
  sections.push(h2('Data Quality Objectives'))
  sections.push(kv('Purpose / legal context', m.dqo.purpose), kv('Required detection level', m.dqo.detection), kv('Lab data package', m.dqo.dataPackage))
  if (m.dqo.rationale) sections.push(kv('Analyte rationale', m.dqo.rationale))
  sections.push(h2('Limitations'))
  sections.push(
    bullet('Screening only — risk indicators and sampling guidance, not definitive compliance or causation.'),
    bullet('Field-meter values (pH, chlorine, turbidity) are qualitative-only without current NIST-traceable calibration.'),
    bullet('Results reflect only the parameters submitted; absence of a parameter is not evidence of its absence in the water.'),
  )

  // ── Compliance Summary ──
  sections.push(h1('2. Compliance Summary'))
  sections.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: m.compliance.tierLabel.toUpperCase(), bold: true, size: 32, color: m.compliance.tier === 'compliant' ? ACCENT : DANGER })] }))
  sections.push(p(`${m.compliance.counts.parameters} parameters analyzed · ${m.compliance.counts.violations} violations · ${m.compliance.counts.advisories} advisories.`))

  // ── Findings Register ──
  sections.push(h1('3. Results & Findings Register'))
  if (m.findings.length) {
    sections.push(table(
      ['Parameter', 'Result', 'Unit', 'Reference', 'Status'],
      m.findings.map((f) => [f.param.name, String(f.value), f.param.unit || '', findingLimit(f), findingStatus(f)]),
      [32, 14, 12, 28, 14],
    ))
  } else {
    sections.push(p('No laboratory results were entered; this is a field-only screening memo.', { italics: true, color: MUTED }))
  }

  // ── State exceedances ──
  if (m.stateExceedances.length) {
    sections.push(h2(`State Limit Exceedances — ${m.stateExceedances[0].state}`))
    m.stateExceedances.forEach((x) => sections.push(bullet(`${x.parameter}: ${x.value} ${x.unit} exceeds ${x.program} limit of ${x.stateLimit} ${x.unit}${x.stricterThanFederal ? ' (stricter than federal)' : ''}`)))
  }

  // ── Causal-chain analysis ──
  sections.push(h1('4. Causal-Chain Analysis'))
  if (m.chains.length) {
    m.chains.forEach((c) => {
      sections.push(h2(`${c.type} — ${c.confidence} confidence${c.confidenceScore != null ? ` (${c.confidenceScore})` : ''}`))
      c.evidence.forEach((e) => sections.push(bullet(e)))
      if (c.dataGaps && c.dataGaps.length) {
        sections.push(p('Data gaps to raise confidence:', { bold: true, size: 18 }))
        c.dataGaps.forEach((g) => sections.push(bullet(g)))
      }
      sections.push(p(`Recommendation: ${c.recommendation}`, { italics: true }))
    })
  } else {
    sections.push(p('No causal pathways were indicated by the available evidence.', { italics: true, color: MUTED }))
  }

  // ── Sampling plan ──
  sections.push(h1('5. Recommended Sampling Plan'))
  if (m.samplingPlan.length) {
    sections.push(table(
      ['Test', 'Method', 'Hold / Preservation', 'Standard'],
      m.samplingPlan.map((s) => [s.test, s.method, s.hold, s.std]),
      [26, 24, 28, 22],
    ))
  } else {
    sections.push(p('No additional sampling indicated from the current assessment.', { italics: true, color: MUTED }))
  }

  // ── Recommendations ──
  sections.push(h1('6. Recommendations'))
  const recGroups: Array<[string, string[]]> = [
    ['Immediate', m.recommendations.immediate],
    ['Short-term (≤ 30 days)', m.recommendations.shortTerm],
    ['Long-term', m.recommendations.longTerm],
    ['Monitoring', m.recommendations.monitoring],
  ]
  let anyRec = false
  recGroups.forEach(([label, items]) => {
    if (items && items.length) {
      anyRec = true
      sections.push(h2(label))
      items.forEach((r) => sections.push(bullet(r)))
    }
  })
  if (!anyRec) sections.push(p('No actions indicated beyond routine monitoring.', { italics: true, color: MUTED }))

  // ── Readiness (advisory) ──
  if (m.readiness.blockers.length) {
    sections.push(h1('7. Readiness Review (advisory)'))
    sections.push(p(m.readiness.ready ? 'No blocking gaps; the following are advisory.' : 'Review the following documentation gaps before issuance (advisory — not a hard block):'))
    m.readiness.blockers.forEach((b) => sections.push(bullet(`[${b.tier}] ${b.message} — ${b.fixLocation}`)))
  }

  // ── Bibliography (citation-tracker-gated) ──
  sections.push(h1('Appendix — Standards Bibliography'))
  if (m.bibliography.length) {
    m.bibliography.forEach((s) => sections.push(bullet(`${s.title} — ${s.citation}`)))
  } else {
    sections.push(p('No standards were cited in this screening.', { italics: true, color: MUTED }))
  }

  return new Document({
    creator: m.meta.preparedBy,
    title: m.meta.title,
    description: `HydroScan screening report ${m.meta.reportId}`,
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: m.watermark.enabled ? m.watermark.text : '', bold: true, color: DANGER, size: 18 })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${m.meta.reportId} · `, size: 16, color: MUTED }), new TextRun({ children: ['Page ', PageNumber.CURRENT], size: 16, color: MUTED })] })],
          }),
        },
        children: sections,
      },
    ],
  })
}

/** Pack the report to a Node Buffer (used by tests / server paths). */
export function getReportDocxBuffer(model: ReportModel): Promise<Buffer> {
  return Packer.toBuffer(buildReportDocument(model))
}

/** Pack the report to a Blob (browser download path). */
export function getReportDocxBlob(model: ReportModel): Promise<Blob> {
  return Packer.toBlob(buildReportDocument(model))
}
