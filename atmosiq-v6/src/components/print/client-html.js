/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow v2.1 — Client Report HTML Renderer
 *
 * Pure function: ClientReportResult → HTML string. No DOM, no React.
 * Used by both:
 *   - the in-app "print" path (PrintReport.generatePrintHTML)
 *   - any server-side / share-sheet flow that needs the same output
 *
 * The renderer assumes the report has already passed engine validation
 * (no internal fields, no banned terms). It will additionally call
 * validateClientReport at render time as a safety net.
 */

import { validateClientReport } from '../../engine/report/validators'

const esc = (str) => {
  if (str === null || str === undefined) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const PRIORITY_LABEL = {
  immediate: 'Immediate',
  short_term: 'Short term',
  further_evaluation: 'Further evaluation',
  long_term: 'Long term',
}

/**
 * Format an ISO date string (YYYY-MM-DD) as long-form English
 * (e.g. "April 29, 2026"). Returns the input unchanged if it doesn't
 * parse cleanly so callers don't get surprised by silent fallback.
 */
function formatLongDate(iso) {
  if (!iso || typeof iso !== 'string') return iso || ''
  // Strict ISO parse — avoid Date(string) timezone surprises by
  // splitting and constructing locally.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [_, y, mo, d] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  if (isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

const REVIEW_STATUS_LABEL = {
  draft_pending_professional_review: 'Draft — Pending Professional Review',
  reviewed_by_qualified_professional: 'Reviewed by Qualified Professional',
  final_issued_to_client: 'Final — Issued to Client',
}

const PAGE_STYLES = `
  /* v2.2 visual upgrade — slate/blue palette per consultant-report
     design guidance. Source Serif 4 body (Google Fonts) with
     Cambria fallback. Section + divider + callout pattern.
     Recommendations register stays as a table for column-level
     defensibility (Priority / Timeframe / Action / Reference). */
  /* Source Serif 4 import — Google Fonts. Cambria fallback for offline
     rendering / print drivers without network access. */
  @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Source Serif 4', Cambria, Georgia, 'Times New Roman', serif;
    font-size: 12pt; color: #334155; line-height: 1.7;
    padding: 0.85in 0.95in; max-width: 8.5in; margin: 0 auto; background: #fff;
    font-feature-settings: 'liga' on, 'kern' on;
  }
  h1 {
    font-family: 'Source Serif 4', Cambria, Georgia, serif;
    font-size: 24pt; font-weight: 700; color: #1E293B;
    margin-bottom: 4px; letter-spacing: -0.3px;
  }
  h2 {
    /* Section heading: slate text, no box fill, thin slate rule below. */
    font-family: 'Source Serif 4', Cambria, Georgia, serif;
    font-size: 16pt; font-weight: 700; color: #1E293B;
    margin: 32px 0 16px; letter-spacing: 0.2px;
    padding-bottom: 8px;
    border-bottom: 1px solid #1E293B;
    page-break-after: avoid;
  }
  h3 {
    font-family: 'Source Serif 4', Cambria, Georgia, serif;
    font-size: 13pt; font-weight: 600; color: #1E293B;
    margin: 22px 0 10px; letter-spacing: 0.1px;
  }
  p { margin-bottom: 11px; line-height: 1.7; text-align: justify; hyphens: auto; }
  ul, ol { margin: 8px 0 14px 28px; }
  li { margin-bottom: 6px; line-height: 1.65; text-align: justify; }
  strong { color: #1E293B; }
  a { color: #2563EB; }

  /* Section + divider + callout patterns */
  .section { margin-bottom: 28px; }
  .divider { border-bottom: 1px solid #E2E8F0; margin: 16px 0; }
  .callout {
    background: #F8FAFC; border-left: 3px solid #2563EB;
    padding: 16px 20px; margin: 14px 0;
  }

  table { width: 100%; border-collapse: collapse; font-family: Cambria, 'Times New Roman', serif; margin: 8px 0 18px; }
  /* Major data tables — cyan band headers, BLACK cell borders (CTSI). */
  table.data-table th {
    background: #2563EB; color: #fff; text-transform: uppercase; letter-spacing: 0.6px;
    font-size: 10pt; font-weight: 700; padding: 9px 10px; text-align: left; border: 1px solid #000;
  }
  table.data-table td { padding: 8px 10px; border: 1px solid #000; font-size: 10.5pt; vertical-align: top; }
  table.data-table tbody tr:nth-child(even) td { background: #F8FAFC; }
  th { text-align: left; padding: 8px 10px; background: #F8FAFC; font-size: 10pt; font-weight: 700; color: #1E293B; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #000; }
  td { padding: 8px 10px; border-bottom: 1px solid #000; font-size: 11pt; vertical-align: top; }

  /* ── Cover page ── */
  .cover {
    text-align: center; padding: 1.4in 0 0.8in; border-bottom: 3px double #2563EB;
    margin-bottom: 0.5in; page-break-after: always;
  }
  .cover-firm { font-size: 14pt; font-weight: 700; color: #1E293B; letter-spacing: 0.5px; margin-bottom: 6px; }
  .cover-firm-sub { font-size: 11pt; color: #5C6F7E; margin-bottom: 36px; }
  .cover-title {
    font-size: 28pt; font-weight: 700; color: #0F172A;
    margin: 0.4in 0 8px; letter-spacing: 0.4px;
  }
  .cover-rule { width: 60px; height: 3px; background: #2563EB; margin: 32px auto; }
  .cover-meta { font-size: 11pt; color: #2D3A4A; line-height: 2; }
  .cover-meta strong { color: #0F172A; font-weight: 700; }
  .cover-status {
    display: inline-block; padding: 6px 16px; background: #F8FAFC; color: #1E293B;
    border: 1px solid #2563EB;
    border-radius: 2px; font-size: 10pt; font-weight: 700;
    margin-top: 18px; letter-spacing: 0.7px; text-transform: uppercase;
  }
  .cover-methodology { font-size: 10pt; color: #5C6F7E; margin-top: 0.4in; font-style: italic; }
  .draft-notice { padding: 12px 16px; background: #FFFBEB; border: 1px solid #FBBF24; border-radius: 4px; font-size: 11pt; color: #92400E; margin-top: 20px; line-height: 1.6; }
  .draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 96pt; color: rgba(251, 191, 36, 0.10); font-weight: 800; pointer-events: none; z-index: 0; letter-spacing: 6px; }

  /* ── Verbatim engine paragraph (Methodology Disclosure) ── */
  .verbatim {
    padding: 14px 20px; background: #F8FAFC; border-left: 4px solid #2563EB;
    margin-bottom: 18px; font-size: 12pt; line-height: 1.75; font-style: italic;
  }

  /* ── Executive Summary metadata — simple Label:Value list ── */
  /* Per design guidance, replaces the 4×4 banded table with a
     vertical list. Reads cleanly without visual noise. */
  .exec-meta-list { margin: 8px 0 22px; padding: 0; list-style: none; }
  .exec-meta-list li {
    display: flex; gap: 12px; padding: 5px 0; line-height: 1.6;
    border-bottom: 1px solid #E2E8F0;
  }
  .exec-meta-list li:last-child { border-bottom: none; }
  .exec-meta-list .label {
    font-weight: 700; color: #1E293B; min-width: 160px;
    text-transform: none; letter-spacing: 0;
    border-bottom: none; padding: 0; margin: 0;
  }
  .exec-meta-list .value { color: #334155; flex: 1; }

  /* ── Findings grouped by domain (Air Quality / HVAC / etc.) ── */
  .finding-group { margin: 14px 0 18px; }
  .finding-group-name {
    font-weight: 700; color: #1E293B; font-size: 12pt;
    margin-bottom: 8px; letter-spacing: 0.2px;
  }
  .finding-group-list {
    margin: 0 0 0 20px; padding: 0; list-style: disc;
  }
  .finding-group-list li {
    margin-bottom: 5px; line-height: 1.65;
    text-align: left;
  }
  .finding-group-list .lead-term {
    font-weight: 700; color: #1E293B;
  }

  /* ── Executive Summary narrative blocks (Scope/Results/Obs/Recs) ── */
  /* These ARE bands by design — they're sub-sections WITHIN the
     executive summary, the CTSI "card" pattern. The user-listed
     top-level h2 sections (Methodology Disclosure, Scope and
     Methodology, Sampling Methodology, etc.) are plain headings. */
  .exec-block { margin-bottom: 22px; border: 1px solid #000; }
  .exec-block-header {
    background: #2563EB; color: #fff; font-weight: 700;
    font-size: 12pt; padding: 9px 14px; letter-spacing: 0.4px;
  }
  .exec-block-body { padding: 14px 18px; background: #fff; }
  .exec-block-body ul { margin-left: 24px; }

  /* ── Letter-format transmittal ── */
  .letter { margin: 0 0.1in 32px; }
  .letter-date { margin-bottom: 22px; font-size: 12pt; }
  .letter-recipient { margin-bottom: 22px; font-size: 12pt; line-height: 1.55; }
  .letter-recipient .org { font-weight: 700; }
  .letter-re-block { margin-bottom: 22px; font-size: 12pt; line-height: 1.7; }
  .letter-re-block .re-label { font-weight: 700; display: inline-block; min-width: 50px; }
  .letter-re-block .re-text { font-weight: 700; text-transform: uppercase; }
  .letter-project-line { margin-top: 6px; font-weight: 700; }
  .letter-salutation { margin: 22px 0 14px; font-size: 12pt; }
  .letter-body { margin-bottom: 14px; font-size: 12pt; line-height: 1.7; text-align: justify; hyphens: auto; }
  .letter-closing { margin: 28px 0 6px; font-size: 12pt; }
  .letter-firm {
    margin-bottom: 0.6in; font-size: 12pt; font-weight: 700;
    font-style: italic; letter-spacing: 0.5px;
  }
  .letter-signatories { display: flex; gap: 0.4in; flex-wrap: wrap; }
  .signature-line { flex: 1; min-width: 240px; margin-bottom: 18px; }
  .signature-image-area { height: 0.5in; margin-bottom: 4px; }
  .signature-rule {
    margin-bottom: 5px; border-bottom: 1px solid #1E293B; height: 1px; width: 80%;
  }
  .signature-name { font-size: 12pt; font-weight: 700; color: #0F172A; }
  .signature-title { font-size: 11pt; color: #2D3A4A; }
  .signature-meta { font-size: 10pt; color: #5C6F7E; margin-top: 2px; }

  /* ── Professional opinion call-out (Executive Summary) ── */
  .opinion-card {
    padding: 18px 22px; background: #F8FAFC; border: 1px solid #E2E8F0;
    border-left: 4px solid #2563EB; margin: 0 0 22px; page-break-inside: avoid;
  }
  .opinion-tier {
    font-size: 10pt; font-weight: 700; color: #1E293B;
    text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;
  }
  .opinion-text { font-size: 12pt; line-height: 1.7; color: #1f2937; font-weight: 600; }

  /* ── Zone cards ── */
  .zone-card {
    border: 1px solid #E2E8F0; border-top: 3px solid #2563EB;
    padding: 22px 24px; margin-bottom: 22px; page-break-inside: avoid;
  }
  .zone-name { font-size: 14pt; font-weight: 700; color: #0F172A; margin-bottom: 12px; }
  .label {
    font-size: 10pt; font-weight: 700; color: #1E293B;
    text-transform: uppercase; letter-spacing: 0.6px;
    margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #E2E8F0;
  }

  /* ── Signatory block ── */
  .signatory {
    padding: 24px 26px; background: #F8FAFC; border: 1px solid #E2E8F0;
    border-top: 3px solid #2563EB; margin-top: 30px; page-break-inside: avoid;
  }
  .signatory-row { display: flex; gap: 0.4in; margin-bottom: 14px; }
  .signatory-block { flex: 1; }
  .signatory-name { font-size: 13pt; font-weight: 700; color: #0F172A; margin-bottom: 3px; }
  .signatory-creds { font-size: 11pt; color: #2D3A4A; margin-bottom: 6px; }
  .signatory-meta { font-size: 10pt; color: #5C6F7E; line-height: 1.6; }

  /* ── Methodology / Sampling section ── */
  .methodology-instrument { margin-bottom: 12px; }

  /* ── Recommendations Register table ── */
  .rec-table { width: 100%; border-collapse: collapse; margin: 6px 0 18px; border: 1px solid #000; }
  .rec-table th {
    background: #2563EB; color: #fff; text-align: left;
    font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    padding: 9px 12px; border: 1px solid #000;
  }
  .rec-table td { padding: 9px 12px; border: 1px solid #000; font-size: 10.5pt; vertical-align: top; line-height: 1.5; }
  .rec-table tr.priority-row td {
    background: #F8FAFC; font-weight: 700; color: #1E293B;
    text-transform: uppercase; letter-spacing: 0.5px; font-size: 10pt;
    padding: 7px 12px;
  }
  .rec-table .col-priority { width: 16%; font-weight: 700; color: #1E293B; }
  .rec-table .col-timeframe { width: 14%; color: #2D3A4A; }
  .rec-table .col-action { width: 50%; }
  .rec-table .col-ref { width: 20%; font-style: italic; color: #5C6F7E; font-size: 10pt; }

  .footer {
    margin-top: 0.4in; padding-top: 14px; border-top: 1px solid #E2E8F0;
    font-size: 9pt; color: #5C6F7E; text-align: center; line-height: 1.8;
  }
  .pg-break { page-break-before: always; }

  @page {
    margin: 0.85in 0.95in;
    @bottom-center { content: "Indoor Air Quality Evaluation — PSEC Project " counter(page) " of " counter(pages); font-family: Cambria, serif; font-size: 9pt; color: #5C6F7E; }
  }
  @media print {
    body { padding: 0; font-size: 11pt; }
    h2 { page-break-after: avoid; }
    .zone-card, .signatory, .opinion-card, .exec-block, .letter, .rec-table { page-break-inside: avoid; }
    .draft-watermark { position: fixed; }
  }
`

export function generateClientReportHTML(result, options = {}) {
  if (result.kind === 'pre_assessment_memo') {
    return generateMemoHTML(result.memo, result.reasons || [])
  }
  return generateFullClientHTML(result.report, options)
}

function generateFullClientHTML(report, options) {
  // Defensive: validate the report at render time. If anything internal leaks,
  // the renderer throws rather than silently producing a non-defensible report.
  const allFindings = [] // ClientReport itself doesn't carry findings; permissions
  // are baked into approvedNarrativeIntent. Pass [] — the no-internal-fields
  // assertion still runs across the whole report tree.
  validateClientReport(report, allFindings)

  const cover = report.cover
  const showWatermark = report.signatoryBlock.draftWatermark

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(cover.title)} — ${esc(cover.facility)}</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  ${showWatermark ? '<div class="draft-watermark">DRAFT</div>' : ''}

  ${renderCover(cover, report.reviewStatus, report.transmittalLetter?.projectNumber || report.meta?.projectNumber)}

  ${report.transmittalLetter ? renderTransmittalLetter(report.transmittalLetter) : `<h2>Transmittal</h2><div class="verbatim">${esc(report.transmittal)}</div>`}

  ${report.methodologyDisclosure ? `<h2>Methodology Disclosure</h2><div class="verbatim">${esc(report.methodologyDisclosure)}</div>` : ''}

  <h2>Executive Summary</h2>
  ${renderExecSummary(report.executiveSummary)}

  <h2>Scope and Methodology</h2>
  <div class="verbatim">${esc(report.scopeAndMethodology)}</div>

  ${report.samplingMethodology ? renderSamplingMethodology(report.samplingMethodology) : ''}

  <h2>Building and System Context</h2>
  <p>${esc(report.buildingAndSystemContext)}</p>

  ${renderBuildingConditions(report.buildingAndSystemConditions)}

  <h2>Zone Findings</h2>
  ${report.zoneSections.map(renderZoneSection).join('')}

  ${renderRecommendationsRegister(report.recommendationsRegister)}

  <h2>Limitations and Professional Judgment</h2>
  <p>${esc(report.limitationsAndProfessionalJudgment)}</p>

  ${renderSignatoryBlock(report.signatoryBlock)}

  ${report.appendix.assessmentIndexInformationalOnly ? renderAssessmentIndexAppendix(report.appendix.assessmentIndexInformationalOnly) : ''}

  <div class="footer">
    Generated by AtmosFlow Engine ${esc(report.engineVersion)} on ${new Date(report.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
  </div>
</body>
</html>`
}

function renderCover(cover, reviewStatus, projectNumber) {
  // v2.2 §4 sneak peek — formal cover page mirroring CTSI layout.
  // Larger title, double rule, project number prominently displayed,
  // status pill in PSEC navy.
  return `<div class="cover">
    <div class="cover-firm">${esc(cover.preparedBy)}</div>
    <div class="cover-title">INDOOR AIR QUALITY</div>
    <div class="cover-title" style="margin-top:0;">EVALUATION</div>
    <div class="cover-rule"></div>
    <div class="cover-meta">
      <div style="text-transform:uppercase; letter-spacing:0.6px; font-size:9pt; color:#5C6F7E; margin-bottom:6px;">Performed at</div>
      <div style="font-size:13pt; font-weight:700; color:#0F172A; margin-bottom:6px;">${esc(cover.facility)}</div>
      <div style="font-size:11pt; color:#2D3A4A; margin-bottom:24px;">${esc(cover.location) || ''}</div>
      <div style="text-transform:uppercase; letter-spacing:0.6px; font-size:9pt; color:#5C6F7E; margin-bottom:6px;">Assessment Date</div>
      <div style="font-size:11pt; color:#0F172A; margin-bottom:20px;">${esc(formatLongDate(cover.date))}</div>
      ${projectNumber ? `<div style="text-transform:uppercase; letter-spacing:0.6px; font-size:9pt; color:#5C6F7E; margin-bottom:6px;">PSEC Project Number</div>
      <div style="font-size:11pt; color:#0F172A; font-weight:600; margin-bottom:0;">${esc(projectNumber)}</div>` : ''}
    </div>
    <div class="cover-status">${esc(REVIEW_STATUS_LABEL[reviewStatus] || cover.status)}</div>
    <div class="cover-methodology">${esc(cover.methodologyLine)}</div>
    ${cover.draftNotice ? `<div class="draft-notice">${esc(cover.draftNotice)}</div>` : ''}
  </div>`
}

function renderExecSummary(summary) {
  // v2.2 visual upgrade — Label:Value list metadata, opinion call-out,
  // four narrative blocks. The Findings block (formerly "Observations")
  // renders findings grouped by domain with bold lead terms;
  // empty groups are omitted.
  const md = summary.metadataTable
  const metadataList = md ? `
    <ul class="exec-meta-list">
      <li><span class="label">Client Name:</span><span class="value">${esc(md.clientName)}</span></li>
      <li><span class="label">Project Number:</span><span class="value">${esc(md.projectNumber)}</span></li>
      <li><span class="label">Project Address:</span><span class="value">${esc(md.projectAddress)}</span></li>
      <li><span class="label">Survey Area:</span><span class="value">${esc(md.surveyArea)}</span></li>
      <li><span class="label">Report Date:</span><span class="value">${esc(md.reportDate)}</span></li>
      <li><span class="label">Survey Date(s):</span><span class="value">${esc(md.surveyDate)}</span></li>
      <li><span class="label">Requested By:</span><span class="value">${esc(md.requestedBy)}</span></li>
      <li><span class="label">Site Contact:</span><span class="value">${esc(md.siteContact)}</span></li>
    </ul>` : ''

  const opinionCard = `
    <div class="opinion-card">
      <div class="opinion-tier">Overall Professional Opinion</div>
      <div class="opinion-text">${esc(summary.overallProfessionalOpinionLanguage)}</div>
    </div>`

  const block = (title, body) => `
    <div class="exec-block">
      <div class="exec-block-header">${esc(title)}</div>
      <div class="exec-block-body">${body}</div>
    </div>`

  const scopeBlock = summary.scopeOfWork
    ? block('Scope of Work', `<p>${esc(summary.scopeOfWork)}</p>`)
    : ''
  const resultsBlock = summary.resultsNarrative
    ? block('Results', `<p>${esc(summary.resultsNarrative)}</p>`)
    : ''

  // v2.2 — grouped findings render. Falls back to flat observations
  // list if findingsByGroup is absent (e.g., older ClientReport
  // shapes or no significant findings).
  const findingsBlock = summary.findingsByGroup && summary.findingsByGroup.length > 0
    ? block('Summary of Findings', summary.findingsByGroup.map(g => `
        <div class="finding-group">
          <div class="finding-group-name">${esc(g.groupName)}</div>
          <ul class="finding-group-list">
            ${g.observations.map(o => `<li><span class="lead-term">${esc(o.leadTerm)}:</span> ${esc(o.statement)}</li>`).join('')}
          </ul>
        </div>`).join(''))
    : (summary.observations && summary.observations.length > 0
        ? block('Summary of Findings', `<ul>${summary.observations.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`)
        : '')

  const recBlock = summary.recommendations && summary.recommendations.length > 0
    ? block('Recommendations', `<ul>${summary.recommendations.map(a => `<li><strong>${esc(PRIORITY_LABEL[a.priority] || a.priority)}</strong> (${esc(a.timeframe)}): ${esc(a.action)}${a.standardReference ? ` <em>— ${esc(a.standardReference)}</em>` : ''}</li>`).join('')}</ul>`)
    : ''

  return `${metadataList}${opinionCard}${scopeBlock}${resultsBlock}${findingsBlock}${recBlock}`
}

function renderTransmittalLetter(letter) {
  // v2.2 §3 — letter-format transmittal in CTSI style: date, recipient
  // block (organization in bold), RE: subject in ALL CAPS BOLD,
  // PROJECT # line in BOLD, salutation, justified body, italicized
  // firm name in caps, two-column signature lines with space for wet
  // signatures.
  const r = letter.recipient
  const subjectClean = letter.subjectLine
    .replace(/^INDOOR AIR QUALITY EVALUATION PERFORMED AT:\s*/i, '')
    .trim()
  // Recipient block — only render lines we actually have. Avoids the
  // stray empty <div> that produces a visible box in some PDF
  // viewers when a field is missing. Each populated field is its own
  // line; organization is bold per CTSI letter convention.
  const recipientLines = []
  if (r.fullName) recipientLines.push(`<div>${esc(r.fullName)}</div>`)
  if (r.title) recipientLines.push(`<div>${esc(r.title)}</div>`)
  if (r.organization) recipientLines.push(`<div class="org">${esc(r.organization)}</div>`)
  if (r.addressLine1) recipientLines.push(`<div>${esc(r.addressLine1)}</div>`)
  if (r.addressLine2) recipientLines.push(`<div>${esc(r.addressLine2)}</div>`)
  const cityStateZip = [r.city, r.state, r.zip].filter(Boolean).join(', ')
  if (cityStateZip) recipientLines.push(`<div>${esc(cityStateZip)}</div>`)
  const recipientBlock = recipientLines.length > 0
    ? `<div class="letter-recipient">${recipientLines.join('')}</div>`
    : ''
  const sigLines = letter.preparedBy.map(s => `
    <div class="signature-line">
      <div class="signature-image-area"></div>
      <div class="signature-rule"></div>
      <div class="signature-name">${esc(s.fullName)}${s.credentials.length > 0 ? `, ${esc(s.credentials.join(', '))}` : ''}</div>
      <div class="signature-title">${esc(s.title)}</div>
      ${s.licenseNumbers && s.licenseNumbers.length > 0 ? `<div class="signature-meta">License: ${esc(s.licenseNumbers.join(', '))}</div>` : ''}
    </div>`).join('')
  return `
    <div class="letter">
      <div class="letter-date">${esc(formatLongDate(letter.date))}</div>
      ${recipientBlock}
      <div class="letter-re-block">
        <span class="re-label">RE:</span> <span class="re-text">${esc(subjectClean || letter.subjectLine)}</span>
        <div class="letter-project-line">PROJECT # ${esc(letter.projectNumber)}</div>
      </div>
      <div class="letter-salutation">${esc(letter.salutation)}</div>
      ${letter.bodyParagraphs.map(p => `<p class="letter-body">${esc(p)}</p>`).join('')}
      <p class="letter-closing">${esc(letter.closing)}</p>
      <div class="letter-firm">${esc(letter.signatoryFirm)}</div>
      <div class="letter-signatories">${sigLines}</div>
    </div>`
}

function renderSamplingMethodology(section) {
  // v2.2 §7 — Sampling Methodology section (auto-generated from
  // AssessmentMeta.instrumentsUsed).
  const instruments = section.instrumentParagraphs.map(p => `<p>${esc(p)}</p>`).join('')
  return `<h2>Sampling Methodology</h2>
    ${instruments}
    <p>${esc(section.overallParagraph)}</p>`
}

function renderBuildingConditions(section) {
  if (!section) return ''
  const conds = section.observedConditions.length > 0
    ? `<ul>${section.observedConditions.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`
    : ''
  const limitations = section.dataLimitations.length > 0
    ? `<div class="label">Data limitations</div><ul>${section.dataLimitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
    : ''
  const actions = section.recommendedActions.length > 0
    ? `<div class="label">Recommended actions</div><ul>${section.recommendedActions.map(a => `<li><strong>${esc(PRIORITY_LABEL[a.priority] || a.priority)}</strong> (${esc(a.timeframe)}): ${esc(a.action)}${a.standardReference ? ` <em>— ${esc(a.standardReference)}</em>` : ''}</li>`).join('')}</ul>`
    : ''
  return `<h2>Building and System Conditions</h2>
    <div class="zone-card">
      <div class="label" style="margin-top:0;">Observed conditions</div>
      ${conds}
      ${limitations}
      ${actions}
    </div>`
}

function renderZoneSection(zone) {
  const conds = zone.observedConditions.length > 0
    ? `<ul>${zone.observedConditions.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '<p><em>No significant conditions identified within the stated limitations.</em></p>'
  const limitations = zone.dataLimitations.length > 0
    ? `<div class="label">Data limitations</div><ul>${zone.dataLimitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
    : ''
  const actions = zone.recommendedActions.length > 0
    ? `<div class="label">Recommended actions</div><ul>${zone.recommendedActions.map(a => `<li><strong>${esc(PRIORITY_LABEL[a.priority] || a.priority)}</strong> (${esc(a.timeframe)}): ${esc(a.action)}${a.standardReference ? ` <em>— ${esc(a.standardReference)}</em>` : ''}</li>`).join('')}</ul>`
    : ''
  return `<div class="zone-card">
    <div class="zone-name">${esc(zone.zoneName)}</div>
    <div class="label">Observed conditions</div>
    ${conds}
    <div class="label">Interpretation</div>
    <p>${esc(zone.interpretation)}</p>
    ${limitations}
    ${actions}
  </div>`
}

function renderRecommendationsRegister(reg) {
  // v2.2 visual upgrade — Recommendations Register as a single table
  // with Priority / Timeframe / Action / Reference columns. Priority
  // group rows separate the priority tiers within the table.
  const groups = [
    ['Immediate', reg.immediate],
    ['Short term', reg.shortTerm],
    ['Further evaluation', reg.furtherEvaluation],
    ['Long term (optional)', reg.longTermOptional],
  ].filter(([, list]) => list.length > 0)
  if (groups.length === 0) return ''

  const rows = groups.flatMap(([title, list]) => [
    `<tr class="priority-row"><td colspan="4">${esc(title)}</td></tr>`,
    ...list.map(a => `
      <tr>
        <td class="col-priority">${esc(PRIORITY_LABEL[a.priority] || a.priority)}</td>
        <td class="col-timeframe">${esc(a.timeframe)}</td>
        <td class="col-action">${esc(a.action)}</td>
        <td class="col-ref">${a.standardReference ? esc(a.standardReference) : '—'}</td>
      </tr>`),
  ])

  return `<h2>Recommendations Register</h2>
    <table class="rec-table">
      <thead>
        <tr>
          <th class="col-priority">Priority</th>
          <th class="col-timeframe">Timeframe</th>
          <th class="col-action">Action</th>
          <th class="col-ref">Reference</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>`
}

function renderSignatoryBlock(sig) {
  return `<div class="signatory">
    <div class="label" style="margin-top:0;">Signatory</div>
    <div class="signatory-row">
      <div class="signatory-block">
        <div class="signatory-name">${esc(sig.preparedBy.name)}</div>
        <div class="signatory-creds">${esc(sig.preparedBy.credentials)}</div>
        <div class="signatory-meta">${esc(sig.preparedBy.firm)}<br>${esc(sig.preparedBy.contact)}</div>
        <div class="label">Prepared by</div>
      </div>
      ${sig.reviewedBy ? `
      <div class="signatory-block">
        <div class="signatory-name">${esc(sig.reviewedBy.name)}</div>
        <div class="signatory-creds">${esc(sig.reviewedBy.credentials)}</div>
        ${sig.reviewedBy.licenseNumbers ? `<div class="signatory-meta">License: ${esc(sig.reviewedBy.licenseNumbers)}</div>` : ''}
        <div class="label">Reviewed by qualified professional</div>
      </div>` : ''}
    </div>
    <div class="signatory-meta">Status: ${esc(REVIEW_STATUS_LABEL[sig.status] || sig.status)}</div>
  </div>`
}

function renderAssessmentIndexAppendix(idx) {
  return `<div class="pg-break"></div>
    <h2>Appendix — Assessment Index (Informational Only)</h2>
    <p><em>${esc(idx.disclaimer)}</em></p>
    <table>
      <tr><th>Zone</th><th>Index</th><th>Tier</th></tr>
      ${idx.zoneScores.map(z => `<tr><td>${esc(z.zoneName)}</td><td>${z.composite}</td><td>${esc(z.tier)}</td></tr>`).join('')}
      <tr><td><strong>Site</strong></td><td><strong>${idx.siteScore}</strong></td><td><strong>${esc(idx.siteTier)}</strong></td></tr>
    </table>`
}

function generateMemoHTML(memo, reasons) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Pre-Assessment Memo — ${esc(memo.cover.facility)}</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  ${renderCover(memo.cover, 'draft_pending_professional_review')}

  <div class="draft-notice"><strong>Notice:</strong> ${esc(memo.notice)}</div>

  <h2>Purpose</h2>
  <p>${esc(memo.purposeStatement)}</p>

  <h2>Identified Data Gaps</h2>
  <ul>
    ${memo.dataGaps.map(g => `<li><strong>${esc(g.trigger)}:</strong> ${esc(g.description)}</li>`).join('')}
  </ul>

  ${reasons.length > 0 ? `<h2>Reasons for Memo (Refusal-to-Issue Triggers)</h2><ul>${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}

  <h2>Recommended Follow-Up</h2>
  <ul>
    ${memo.recommendedFollowUp.map(r => `<li>${esc(r)}</li>`).join('')}
  </ul>

  ${renderSignatoryBlock(memo.signatoryBlock)}

  <div class="footer">
    Generated by AtmosFlow Engine ${esc(memo.engineVersion)} on ${new Date(memo.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
  </div>
</body>
</html>`
}
