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

const REVIEW_STATUS_LABEL = {
  draft_pending_professional_review: 'Draft — Pending Professional Review',
  reviewed_by_qualified_professional: 'Reviewed by Qualified Professional',
  final_issued_to_client: 'Final — Issued to Client',
}

const PAGE_STYLES = `
  /* v2.2 visual upgrade — CTSI-format polish using PSEC cyan palette
     (matches in-app accent #22D3EE). Lightweight h2 headings with a
     cyan rule (no heavy band fill). Section bands retained ONLY for
     the executive-summary sub-blocks (Scope of Work / Results /
     Observations / Recommendations) since those define the CTSI
     exec-summary card pattern. Recommendations register renders as
     a table. */
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Cambria, 'Times New Roman', serif;
    font-size: 12pt; color: #1f2937; line-height: 1.55;
    padding: 0.85in 0.95in; max-width: 8.5in; margin: 0 auto; background: #fff;
  }
  h1 { font-size: 22pt; font-weight: 700; color: #155E75; margin-bottom: 4px; letter-spacing: -0.3px; }
  h2 {
    /* Lightweight CTSI-style heading: cyan text + cyan rule below.
       No box fill. */
    font-size: 14pt; font-weight: 700; color: #155E75;
    margin: 28px 0 14px; letter-spacing: 0.4px;
    padding-bottom: 6px;
    border-bottom: 2px solid #0891B2;
    page-break-after: avoid;
  }
  h3 { font-size: 12pt; font-weight: 700; color: #155E75; margin: 20px 0 8px; letter-spacing: 0.2px; }
  p { margin-bottom: 11px; line-height: 1.7; text-align: justify; hyphens: auto; }
  ul, ol { margin: 8px 0 14px 28px; }
  li { margin-bottom: 5px; line-height: 1.65; text-align: justify; }
  strong { color: #0F172A; }

  table { width: 100%; border-collapse: collapse; font-family: Cambria, 'Times New Roman', serif; margin: 8px 0 18px; }
  /* Major data tables — cyan band headers with white text. */
  table.data-table th {
    background: #0891B2; color: #fff; text-transform: uppercase; letter-spacing: 0.6px;
    font-size: 10pt; font-weight: 700; padding: 9px 10px; text-align: left; border: 1px solid #0E7490;
  }
  table.data-table td { padding: 8px 10px; border: 1px solid #A5F3FC; font-size: 10.5pt; vertical-align: top; }
  table.data-table tbody tr:nth-child(even) td { background: #ECFEFF; }
  th { text-align: left; padding: 8px 10px; background: #ECFEFF; font-size: 10pt; font-weight: 700; color: #155E75; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #A5F3FC; }
  td { padding: 8px 10px; border-bottom: 1px solid #E0F2FE; font-size: 11pt; vertical-align: top; }

  /* ── Cover page ── */
  .cover {
    text-align: center; padding: 1.4in 0 0.8in; border-bottom: 3px double #0891B2;
    margin-bottom: 0.5in; page-break-after: always;
  }
  .cover-firm { font-size: 14pt; font-weight: 700; color: #155E75; letter-spacing: 0.5px; margin-bottom: 6px; }
  .cover-firm-sub { font-size: 11pt; color: #5C6F7E; margin-bottom: 36px; }
  .cover-title {
    font-size: 28pt; font-weight: 700; color: #0F172A;
    margin: 0.4in 0 8px; letter-spacing: 0.4px;
  }
  .cover-rule { width: 60px; height: 3px; background: #0891B2; margin: 32px auto; }
  .cover-meta { font-size: 11pt; color: #2D3A4A; line-height: 2; }
  .cover-meta strong { color: #0F172A; font-weight: 700; }
  .cover-status {
    display: inline-block; padding: 6px 16px; background: #E0F2FE; color: #155E75;
    border: 1px solid #0891B2;
    border-radius: 2px; font-size: 10pt; font-weight: 700;
    margin-top: 18px; letter-spacing: 0.7px; text-transform: uppercase;
  }
  .cover-methodology { font-size: 10pt; color: #5C6F7E; margin-top: 0.4in; font-style: italic; }
  .draft-notice { padding: 12px 16px; background: #FFFBEB; border: 1px solid #FBBF24; border-radius: 4px; font-size: 11pt; color: #92400E; margin-top: 20px; line-height: 1.6; }
  .draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 96pt; color: rgba(251, 191, 36, 0.10); font-weight: 800; pointer-events: none; z-index: 0; letter-spacing: 6px; }

  /* ── Verbatim engine paragraph (Methodology Disclosure) ── */
  .verbatim {
    padding: 14px 20px; background: #ECFEFF; border-left: 4px solid #0891B2;
    margin-bottom: 18px; font-size: 12pt; line-height: 1.75; font-style: italic;
  }

  /* ── Executive Summary metadata table (CTSI 4-row) ── */
  .exec-meta-table { margin: 14px 0 22px; border: 1px solid #0891B2; }
  .exec-meta-table td {
    font-size: 11pt; padding: 9px 14px; border: 1px solid #A5F3FC;
    line-height: 1.45;
  }
  /* Label cells (1st and 3rd column) get the cyan band fill */
  .exec-meta-table td.label {
    background: #0891B2; color: #fff; font-weight: 700;
    text-transform: none; letter-spacing: 0.3px; width: 18%;
  }
  .exec-meta-table td.value { width: 32%; color: #1f2937; }

  /* ── Executive Summary narrative blocks (Scope/Results/Obs/Recs) ── */
  /* These ARE bands by design — they're sub-sections WITHIN the
     executive summary, the CTSI "card" pattern. The user-listed
     top-level h2 sections (Methodology Disclosure, Scope and
     Methodology, Sampling Methodology, etc.) are plain headings. */
  .exec-block { margin-bottom: 22px; border: 1px solid #A5F3FC; }
  .exec-block-header {
    background: #0891B2; color: #fff; font-weight: 700;
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
    margin-bottom: 5px; border-bottom: 1px solid #155E75; height: 1px; width: 80%;
  }
  .signature-name { font-size: 12pt; font-weight: 700; color: #0F172A; }
  .signature-title { font-size: 11pt; color: #2D3A4A; }
  .signature-meta { font-size: 10pt; color: #5C6F7E; margin-top: 2px; }

  /* ── Professional opinion call-out (Executive Summary) ── */
  .opinion-card {
    padding: 18px 22px; background: #ECFEFF; border: 1px solid #A5F3FC;
    border-left: 4px solid #0891B2; margin: 0 0 22px; page-break-inside: avoid;
  }
  .opinion-tier {
    font-size: 10pt; font-weight: 700; color: #155E75;
    text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;
  }
  .opinion-text { font-size: 12pt; line-height: 1.7; color: #1f2937; font-weight: 600; }

  /* ── Zone cards ── */
  .zone-card {
    border: 1px solid #A5F3FC; border-top: 3px solid #0891B2;
    padding: 22px 24px; margin-bottom: 22px; page-break-inside: avoid;
  }
  .zone-name { font-size: 14pt; font-weight: 700; color: #0F172A; margin-bottom: 12px; }
  .label {
    font-size: 10pt; font-weight: 700; color: #155E75;
    text-transform: uppercase; letter-spacing: 0.6px;
    margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #A5F3FC;
  }

  /* ── Signatory block ── */
  .signatory {
    padding: 24px 26px; background: #ECFEFF; border: 1px solid #A5F3FC;
    border-top: 3px solid #0891B2; margin-top: 30px; page-break-inside: avoid;
  }
  .signatory-row { display: flex; gap: 0.4in; margin-bottom: 14px; }
  .signatory-block { flex: 1; }
  .signatory-name { font-size: 13pt; font-weight: 700; color: #0F172A; margin-bottom: 3px; }
  .signatory-creds { font-size: 11pt; color: #2D3A4A; margin-bottom: 6px; }
  .signatory-meta { font-size: 10pt; color: #5C6F7E; line-height: 1.6; }

  /* ── Methodology / Sampling section ── */
  .methodology-instrument { margin-bottom: 12px; }

  /* ── Recommendations Register table ── */
  .rec-table { width: 100%; border-collapse: collapse; margin: 6px 0 18px; }
  .rec-table th {
    background: #0891B2; color: #fff; text-align: left;
    font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    padding: 9px 12px; border: 1px solid #0E7490;
  }
  .rec-table td { padding: 9px 12px; border: 1px solid #A5F3FC; font-size: 10.5pt; vertical-align: top; line-height: 1.5; }
  .rec-table tr.priority-row td {
    background: #ECFEFF; font-weight: 700; color: #155E75;
    text-transform: uppercase; letter-spacing: 0.5px; font-size: 10pt;
    padding: 7px 12px;
  }
  .rec-table .col-priority { width: 16%; font-weight: 700; color: #155E75; }
  .rec-table .col-timeframe { width: 14%; color: #2D3A4A; }
  .rec-table .col-action { width: 50%; }
  .rec-table .col-ref { width: 20%; font-style: italic; color: #5C6F7E; font-size: 10pt; }

  .footer {
    margin-top: 0.4in; padding-top: 14px; border-top: 1px solid #A5F3FC;
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
      <div style="font-size:11pt; color:#0F172A; margin-bottom:20px;">${esc(cover.date)}</div>
      ${projectNumber ? `<div style="text-transform:uppercase; letter-spacing:0.6px; font-size:9pt; color:#5C6F7E; margin-bottom:6px;">PSEC Project Number</div>
      <div style="font-size:11pt; color:#0F172A; font-weight:600; margin-bottom:0;">${esc(projectNumber)}</div>` : ''}
    </div>
    <div class="cover-status">${esc(REVIEW_STATUS_LABEL[reviewStatus] || cover.status)}</div>
    <div class="cover-methodology">${esc(cover.methodologyLine)}</div>
    ${cover.draftNotice ? `<div class="draft-notice">${esc(cover.draftNotice)}</div>` : ''}
  </div>`
}

function renderExecSummary(summary) {
  // v2.2 §6 — CTSI-format Executive Summary: 4-row metadata table with
  // navy label cells, four narrative blocks each in their own framed
  // section with PSEC-navy header bands (mirrors CTSI sage bands).
  const md = summary.metadataTable
  const metadataTable = md ? `
    <table class="exec-meta-table">
      <tr>
        <td class="label">Client Name</td><td class="value">${esc(md.clientName)}</td>
        <td class="label">Report Date</td><td class="value">${esc(md.reportDate)}</td>
      </tr>
      <tr>
        <td class="label">Project Number</td><td class="value">${esc(md.projectNumber)}</td>
        <td class="label">Survey Date(s)</td><td class="value">${esc(md.surveyDate)}</td>
      </tr>
      <tr>
        <td class="label">Project Address</td><td class="value">${esc(md.projectAddress)}</td>
        <td class="label">Survey Area</td><td class="value">${esc(md.surveyArea)}</td>
      </tr>
      <tr>
        <td class="label">Requested By</td><td class="value">${esc(md.requestedBy)}</td>
        <td class="label">Site Contact</td><td class="value">${esc(md.siteContact)}</td>
      </tr>
    </table>` : ''

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
  const obsBlock = summary.observations && summary.observations.length > 0
    ? block('Observations', `<ul>${summary.observations.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`)
    : ''
  const recBlock = summary.recommendations && summary.recommendations.length > 0
    ? block('Recommendations', `<ul>${summary.recommendations.map(a => `<li><strong>${esc(PRIORITY_LABEL[a.priority] || a.priority)}</strong> (${esc(a.timeframe)}): ${esc(a.action)}${a.standardReference ? ` <em>— ${esc(a.standardReference)}</em>` : ''}</li>`).join('')}</ul>`)
    : ''

  return `${metadataTable}${opinionCard}${scopeBlock}${resultsBlock}${obsBlock}${recBlock}`
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
  const recipientBlock = `
    <div class="letter-recipient">
      ${r.fullName ? `<div>${esc(r.fullName)}${r.title ? `<br>${esc(r.title)}` : ''}</div>` : ''}
      ${r.organization ? `<div class="org">${esc(r.organization)}</div>` : ''}
      ${r.addressLine1 ? `<div>${esc(r.addressLine1)}</div>` : ''}
      ${r.addressLine2 ? `<div>${esc(r.addressLine2)}</div>` : ''}
      ${r.city || r.state || r.zip ? `<div>${esc([r.city, r.state, r.zip].filter(Boolean).join(', '))}</div>` : ''}
    </div>`
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
      <div class="letter-date">${esc(letter.date)}</div>
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
