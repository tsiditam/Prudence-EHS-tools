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
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Cambria, 'Times New Roman', serif; font-size: 12px; color: #2D3A4A; line-height: 1.7; padding: 48px 56px; max-width: 820px; margin: 0 auto; background: #fff; }
  h1 { font-size: 22px; font-weight: 700; color: #1B2A41; margin-bottom: 4px; letter-spacing: -0.3px; }
  h2 { font-size: 13px; font-weight: 700; color: #1B2A41; margin: 30px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #D1D5DB; text-transform: uppercase; letter-spacing: 0.8px; }
  h3 { font-size: 12px; font-weight: 700; color: #2D3A4A; margin: 22px 0 8px; }
  p { margin-bottom: 10px; line-height: 1.75; }
  ul, ol { margin: 8px 0 12px 24px; }
  li { margin-bottom: 4px; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; font-family: Cambria, 'Times New Roman', serif; margin-bottom: 16px; }
  th { text-align: left; padding: 8px 10px; background: #F3F4F6; font-size: 10px; font-weight: 700; color: #5C6F7E; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #D1D5DB; }
  td { padding: 8px 10px; border-bottom: 1px solid #E5E7EB; font-size: 11px; vertical-align: top; }
  .cover { text-align: center; padding: 100px 0 60px; border-bottom: 2px solid #1B2A41; margin-bottom: 36px; }
  .cover-firm { font-size: 14px; font-weight: 700; color: #1B2A41; letter-spacing: 0.5px; margin-bottom: 6px; }
  .cover-firm-sub { font-size: 11px; color: #5C6F7E; margin-bottom: 36px; }
  .cover-title { font-size: 26px; font-weight: 700; color: #1B2A41; margin-bottom: 6px; letter-spacing: 0.3px; }
  .cover-rule { width: 44px; height: 2px; background: #1B2A41; margin: 30px auto; }
  .cover-meta { font-size: 11px; color: #5C6F7E; line-height: 2; }
  .cover-meta strong { color: #1B2A41; font-weight: 600; }
  .cover-status { display: inline-block; padding: 4px 12px; border: 1px solid #1B2A41; border-radius: 3px; font-size: 10px; font-weight: 700; color: #1B2A41; margin-top: 12px; letter-spacing: 0.5px; text-transform: uppercase; }
  .cover-methodology { font-size: 10px; color: #94A3B8; margin-top: 28px; font-style: italic; }
  .draft-notice { padding: 12px 16px; background: #FFFBEB; border: 1px solid #FBBF24; border-radius: 4px; font-size: 11px; color: #92400E; margin-top: 20px; line-height: 1.6; }
  .draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 90px; color: #FBBF2418; font-weight: 800; pointer-events: none; z-index: 0; letter-spacing: 4px; }
  .verbatim { padding: 14px 18px; background: #F8FAFC; border-left: 3px solid #1B2A41; margin-bottom: 16px; font-size: 12px; line-height: 1.8; }
  .opinion-card { padding: 18px 20px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; margin-bottom: 18px; page-break-inside: avoid; }
  .opinion-tier { font-size: 11px; font-weight: 700; color: #1B2A41; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
  .opinion-text { font-size: 12px; line-height: 1.7; color: #2D3A4A; }
  .zone-card { border: 1px solid #E2E8F0; border-radius: 6px; padding: 22px; margin-bottom: 24px; page-break-inside: avoid; }
  .zone-name { font-size: 13px; font-weight: 700; color: #1B2A41; margin-bottom: 10px; }
  .label { font-size: 10px; font-weight: 700; color: #5C6F7E; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 14px; margin-bottom: 6px; }
  .signatory { padding: 22px 24px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; margin-top: 24px; page-break-inside: avoid; }
  .signatory-row { display: flex; gap: 28px; margin-bottom: 16px; }
  .signatory-block { flex: 1; }
  .signatory-name { font-size: 13px; font-weight: 700; color: #1B2A41; margin-bottom: 2px; }
  .signatory-creds { font-size: 11px; color: #5C6F7E; margin-bottom: 4px; }
  .signatory-meta { font-size: 10px; color: #94A3B8; line-height: 1.6; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 9px; color: #94A3B8; text-align: center; line-height: 1.8; }
  .pg-break { page-break-before: always; }
  @page { margin: 1in; }
  @media print { body { padding: 0; font-size: 11px; } h2 { page-break-after: avoid; } .zone-card, .signatory, .opinion-card { page-break-inside: avoid; } .draft-watermark { position: fixed; } }
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

  ${renderCover(cover, report.reviewStatus)}

  <h2>Transmittal</h2>
  <div class="verbatim">${esc(report.transmittal)}</div>

  <h2>Executive Summary</h2>
  <p>${esc(report.executiveSummary.overview)}</p>
  ${renderExecSummary(report.executiveSummary)}

  <h2>Scope and Methodology</h2>
  <div class="verbatim">${esc(report.scopeAndMethodology)}</div>

  <h2>Building and System Context</h2>
  <p>${esc(report.buildingAndSystemContext)}</p>

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

function renderCover(cover, reviewStatus) {
  return `<div class="cover">
    <div class="cover-firm">${esc(cover.preparedBy)}</div>
    <div class="cover-title">${esc(cover.title)}</div>
    <div class="cover-rule"></div>
    <div class="cover-meta">
      <strong>Site:</strong> ${esc(cover.facility)}<br>
      <strong>Location:</strong> ${esc(cover.location) || '—'}<br>
      <strong>Assessment Date:</strong> ${esc(cover.date)}<br>
    </div>
    <div class="cover-status">${esc(REVIEW_STATUS_LABEL[reviewStatus] || cover.status)}</div>
    <div class="cover-methodology">${esc(cover.methodologyLine)}</div>
    ${cover.draftNotice ? `<div class="draft-notice">${esc(cover.draftNotice)}</div>` : ''}
  </div>`
}

function renderExecSummary(summary) {
  const findings = summary.summaryOfFindings.length > 0
    ? `<h3>Summary of Conditions Identified</h3><ul>${summary.summaryOfFindings.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`
    : ''
  const priorityActions = summary.priorityActions.length > 0
    ? `<h3>Priority Actions</h3><ul>${summary.priorityActions.map(a => `<li><strong>${esc(PRIORITY_LABEL[a.priority] || a.priority)}</strong> (${esc(a.timeframe)}): ${esc(a.action)}${a.standardReference ? ` <em>— ${esc(a.standardReference)}</em>` : ''}</li>`).join('')}</ul>`
    : ''
  return `${findings}
    <div class="opinion-card">
      <div class="opinion-tier">Overall Professional Opinion</div>
      <div class="opinion-text">${esc(summary.overallProfessionalOpinionLanguage)}</div>
    </div>
    ${priorityActions}`
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
  const sections = [
    ['Immediate', reg.immediate],
    ['Short term', reg.shortTerm],
    ['Further evaluation', reg.furtherEvaluation],
    ['Long term (optional)', reg.longTermOptional],
  ].filter(([, list]) => list.length > 0)
  if (sections.length === 0) return ''
  return `<h2>Recommendations Register</h2>
    ${sections.map(([title, list]) => `
      <h3>${esc(title)}</h3>
      <ul>${list.map(a => `<li><strong>${esc(a.timeframe)}:</strong> ${esc(a.action)}${a.standardReference ? ` <em>— ${esc(a.standardReference)}</em>` : ''}</li>`).join('')}</ul>
    `).join('')}`
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
