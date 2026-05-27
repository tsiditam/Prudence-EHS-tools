/**
 * AtmosFlow DOCX Report — Entry Point
 *
 * Builds two Word documents from assessment data:
 * 1. Consultant report (CIH-defensible client deliverable; v2.1 engine path)
 * 2. Technical report (structured findings, score matrix, data gaps; legacy
 *    operator-facing path)
 *
 * Phase 3: the consultant path was switched from the legacy section
 * builders to a v2.1 ClientReport pipeline (bridge → renderClientReport →
 * sections-v21client). Technical DOCX intentionally remains on the legacy
 * path because it is operator-facing, not client-facing.
 */

import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx'
import { BODY_SECTION_PROPERTIES } from './docx/page-setup'
import { DOCX_STYLES } from './docx/styles'
import { buildCoverPage } from './docx/sections-core'
import { buildSamplingPlan, buildRecommendations } from './docx/sections-recommendations'
import { buildAppendixB, buildFooter } from './docx/sections-appendix'
import { buildTechnicalMetadata, buildFindingsRegister, buildCategoryScoresSummary, buildDataGapRegister, buildInstrumentLog, buildOutdoorBaseline } from './docx/sections-technical'
import { buildClientDocx } from './docx/sections-v21client'
import { buildLabResultsAppendix } from './docx/sections-lab-results'
import { buildSensorGraphsAppendix } from './docx/sections-sensor'
import { buildMethodologyCurrency } from './docx/sections-methodology-currency'
import { legacyToAssessmentScore, deriveAssessmentMeta } from '../engine/bridge'
import { renderClientReport } from '../engine/report/client'
import { watermarkSectionAttachments, buildCoverNoticeParagraph } from './docx/watermark'
import { reportSectionAttachments } from './docx/report-chrome'
import { DATA_GAP_MESSAGES } from './docx/canonical-content'
import { applyOverrideToScore } from '../utils/consultantReportOverride'
import { buildOverrideCoverNoticeParagraph, buildOverrideSectionAttachments } from './docx/override-watermark'

function buildContext(data) {
  const { building, presurvey, zones, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos, floorPlan, version, standardsManifest } = data
  const bldg = building || {}
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const assessDate = data.ts ? new Date(data.ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : now

  return {
    facilityName: bldg.fn || 'Facility',
    address: bldg.fl || '—',
    assessDate,
    reportDate: now,
    assessor: profile?.name || presurvey?.ps_assessor || 'Assessor',
    reportId: data.id || (() => { const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 3; i++) s += chars[Math.floor(Math.random() * chars.length)]; return `PSEC-IAQ-${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${s}` })(),
    version: version || '6.0.0',
    building: bldg,
    presurvey: presurvey || {},
    zones: zones || [],
    zoneScores: zoneScores || [],
    zoneCount: (zones || []).length,
    zoneNames: (zones || []).map(z => z.zn || 'Unnamed zone'),
    comp,
    oshaResult: oshaResult || {},
    confidence: oshaResult?.conf || 'Not evaluated',
    completeness: Math.round(((zones || []).filter(z => z.zn).length / Math.max((zones || []).length, 1)) * 100),
    recs: recs || null,
    samplingPlan: samplingPlan || null,
    causalChains: causalChains || [],
    narrative: narrative || null,
    photos: photos || {},
    floorPlan: floorPlan || null,
    reason: presurvey?.ps_reason || '',
    instrument: presurvey?.ps_inst_iaq || '',
    instrumentSerial: presurvey?.ps_inst_iaq_serial || '',
    calibration: presurvey?.ps_inst_iaq_cal_status || 'Not recorded',
    pidMeter: presurvey?.ps_inst_pid || '',
    pidCal: presurvey?.ps_inst_pid_cal || '',
    standardsManifest: standardsManifest || null,
    // v2.7 Fix 8: trim company-name input as belt-and-suspenders
    // against a historical trailing-space concat bug in the firm
    // string. Regression guard: tests/engine/company-name-no-trailing-space.test.ts
    firmName: (profile?.firm || 'Prudence EHS').trim(),
    firmAddress: (profile?.firm_address || '660 Quince Orchard Road, #1136, Gaithersburg, MD 20878').trim(),
    firmPhone: (profile?.firm_phone || '(301) 541-8362').trim(),
    firmEmail: (profile?.email || 'support@prudenceehs.com').trim(),
    // Optional branding assets. When set, the cover renders the
    // firm logo above the wordmark and the PE / CIH seal as a small
    // credential mark above the confidential footer. License line
    // (e.g. "WV IH License #12345") renders under the firm address
    // so it's part of the identity block.
    firmLogo: typeof profile?.firm_logo_dataurl === 'string' ? profile.firm_logo_dataurl : null,
    firmLicense: typeof profile?.firm_license === 'string' ? profile.firm_license.trim() : '',
    peSeal: typeof profile?.pe_seal_dataurl === 'string' ? profile.pe_seal_dataurl : null,
    assessorCerts: profile?.certs || [],
  }
}

async function generateConsultantDocx(ctx, data) {
  const doc = await buildConsultantDocument(ctx, data)
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AtmosFlow-Report-${ctx.facilityName}.docx`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * Build the consultant DOCX as a `docx` Document. Same content
 * pipeline as generateConsultantDocx, factored out so callers that
 * need the blob (e.g. handleShare → navigator.share) can avoid the
 * download-as-side-effect.
 */
/**
 * Derive client-facing SCIENTIFIC data gaps from the assessment itself
 * (what was not measured / not available) — distinct from the internal
 * readiness blockers in src/engines/validation.js. Returns an ordered
 * list of plain-language gap statements (canonical, linter-clean).
 */
function deriveScientificDataGaps(data) {
  const zones = Array.isArray(data?.zones) ? data.zones : []
  const anyZoneHas = (key) => zones.some(z => z && String(z[key] ?? '').trim() !== '')
  const gaps = []
  if (!anyZoneHas('hc')) gaps.push(DATA_GAP_MESSAGES.hcho)
  if (!anyZoneHas('co')) gaps.push(DATA_GAP_MESSAGES.co)
  if (!anyZoneHas('tv')) gaps.push(DATA_GAP_MESSAGES.tvoc)
  const hasOutdoor = ['co2o', 'tfo', 'rho', 'pmo', 'tvo'].some(anyZoneHas)
  if (!hasOutdoor) gaps.push(DATA_GAP_MESSAGES.outdoor)
  const hasSensor = Array.isArray(data?.sensorData) ? data.sensorData.length > 0 : !!data?.sensorData
  if (!hasSensor) gaps.push(DATA_GAP_MESSAGES.continuous)
  const lab = data?.labResults
  const hasLab = Array.isArray(lab) ? lab.length > 0 : (lab && typeof lab === 'object' ? Object.keys(lab).length > 0 : false)
  if (!hasLab) gaps.push(DATA_GAP_MESSAGES.lab)
  return gaps
}

async function buildConsultantDocument(ctx, data) {
  // v2.1 path: bridge legacy scoring data → AssessmentScore → ClientReport
  // → docx. CIH-defensible deliverable.
  const meta = deriveAssessmentMeta({
    profile: data.profile,
    presurvey: data.presurvey,
    building: data.building,
    assessmentDate: data.ts ? data.ts.slice(0, 10) : undefined,
  })
  let score = legacyToAssessmentScore(
    data.zoneScores || [],
    data.comp || null,
    data.zones || [],
    { meta, presurvey: data.presurvey, building: data.building },
  )

  // IH professional-judgment override: the SPA's preflight modal
  // surfaced the engine's refusal triggers, the IH typed a
  // justification, and elected to issue under override. We mutate the
  // engine's INPUT (the score) to bypass the requested triggers, leaving
  // the engine itself untouched. The cover notice below records what
  // was overridden so the deliverable speaks plainly to its reader.
  let overrideMutations = []
  if (data.ihOverride && Array.isArray(data.ihOverride.triggers) && data.ihOverride.triggers.length > 0) {
    const result = applyOverrideToScore(score, data.ihOverride)
    score = result.score
    overrideMutations = result.mutations
  }
  const result = renderClientReport(score, {
    includeAssessmentIndexAppendix: !!data.includeAssessmentIndexAppendix,
  })

  // Supplemental sections are folded into the canonical model by
  // buildClientDocx (sections-supplemental.js) rather than appended after
  // the fact, so they share the section heading style, sit in the right
  // position, get continuous appendix letters (after the engine's
  // Appendix F), and register in the Table of Contents:
  //   • Standards Currency — methodology-currency body section documenting
  //     references NOT in the deterministic scoring path (ASHRAE 241-2023,
  //     EPA PM2.5 annual NAAQS 2024, ACGIH TLV 2025). Renders after
  //     Limitations/Professional Judgment. Engine-sacred respected.
  //   • Laboratory Analytical Results — closes the CoC loop when the
  //     assessor imported analytical CSV results (→ Appendix G).
  //   • Environmental Evidence Graphs — report-ready IAQ timelines the
  //     assessor flagged on the Sensor Data screen (→ Appendix H).
  // Each builder returns null when it has nothing to render.
  const supplemental = {
    bodySections: [buildMethodologyCurrency()].filter(Boolean),
    appendices: [
      buildLabResultsAppendix(data.labResults),
      buildSensorGraphsAppendix(data.sensorData),
    ].filter(Boolean),
  }
  const { cover, main } = buildClientDocx(result, {
    photos: data.photos || ctx.photos || {},
    supplemental,
    dataGaps: deriveScientificDataGaps(data),
  })

  // Free-tier watermark: pass watermarkConfig from caller (e.g. resolved
  // from the user's profile.plan upstream). When tier === 'free', adds
  // header on every page, footer on every page, and a notice on the
  // cover. Paid tier gets no header/footer/notice.
  const watermarkConfig = data.watermarkConfig || null
  const sectionWatermark = watermarkSectionAttachments(watermarkConfig)
  const coverNotice = buildCoverNoticeParagraph(watermarkConfig)

  // IH override watermark — independent of free-tier watermark, fires
  // only when data.ihOverride was attached upstream by the preflight
  // modal. The cover notice is prepended (visible before the report
  // title); the per-page header/footer marks every page.
  const overrideAttachments = buildOverrideSectionAttachments(data.ihOverride)
  const overrideNoticeBlocks = buildOverrideCoverNoticeParagraph(data.ihOverride, overrideMutations)

  const coverChildren = [
    ...overrideNoticeBlocks,
    ...(cover.children || []),
    ...(coverNotice ? [coverNotice] : []),
  ]

  // Formal running header/footer (firm · project no. / "Confidential —
  // Prepared for {client}" · Page X of Y). Used as the BASE of the body
  // merge so the free-tier watermark and IH-override attachments still
  // take precedence for their slots when present (their whole-object
  // spread replaces this chrome). Paid reports — which previously had
  // no running header/footer — get the formal chrome.
  const reportChrome = reportSectionAttachments({
    firm: meta.issuingFirm?.name,
    projectNumber: meta.projectNumber,
    clientName: meta.transmittalRecipient?.organization
      || meta.transmittalRecipient?.fullName
      || ctx.facilityName,
  })

  // Cover keeps only the watermark/override attachments (no formal
  // running chrome on the title page); the body gets the chrome with
  // watermark/override layered on top.
  const coverAttachments = {
    ...sectionWatermark,
    ...overrideAttachments,
  }
  const bodyAttachments = {
    ...reportChrome,
    ...sectionWatermark,
    ...overrideAttachments,
  }

  return new Document({
    creator: 'AtmosFlow — Prudence EHS',
    title: `IAQ Assessment Report — ${ctx.facilityName}`,
    description: 'Indoor Air Quality Assessment Report',
    styles: DOCX_STYLES,
    sections: [
      { ...cover, children: coverChildren, ...coverAttachments },
      {
        // v2.5.1 — explicit Letter portrait + 1-inch margins so the
        // body fills the 6.5-inch content area on US Letter paper.
        properties: BODY_SECTION_PROPERTIES,
        children: main,
        ...bodyAttachments,
      },
    ],
  })
}

async function generateTechnicalDocx(ctx) {
  const mainChildren = [
    ...buildTechnicalMetadata(ctx),
    ...buildFindingsRegister(ctx),
    ...buildCategoryScoresSummary(ctx),
    ...buildDataGapRegister(ctx),
    ...buildInstrumentLog(ctx),
    ...buildOutdoorBaseline(ctx),
    ...buildSamplingPlan(ctx),
    ...buildRecommendations(ctx),
    ...buildAppendixB(ctx),
    ...buildFooter(ctx),
  ]

  const doc = new Document({
    creator: 'AtmosFlow — Prudence EHS',
    title: `IAQ Technical Report — ${ctx.facilityName}`,
    description: 'Indoor Air Quality Technical Assessment Report — Structured Findings',
    styles: DOCX_STYLES,
    sections: [
      buildCoverPage(ctx),
      {
        // v2.5.1 — explicit Letter portrait + 1-inch margins.
        properties: BODY_SECTION_PROPERTIES,
        children: mainChildren,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AtmosFlow-Technical-${ctx.facilityName}.docx`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function generateDocx(data) {
  const ctx = buildContext(data)
  await generateConsultantDocx(ctx, data)
  await generateTechnicalDocx(ctx)
}

export async function generateConsultantOnly(data) {
  const ctx = buildContext(data)
  await generateConsultantDocx(ctx, data)
}

export async function generateTechnicalOnly(data) {
  const ctx = buildContext(data)
  await generateTechnicalDocx(ctx)
}

/**
 * Build the full consultant DOCX and return it as a Blob without
 * triggering a download. Used by the result-screen Share button so
 * the assessor can hand off the same file the Word export produces
 * via navigator.share() (iOS Files, Mail, Slack, etc.) rather than
 * a side-of-the-road HTML print preview.
 */
export async function getConsultantDocxBlob(data) {
  const ctx = buildContext(data)
  const doc = await buildConsultantDocument(ctx, data)
  const blob = await Packer.toBlob(doc)
  return {
    blob,
    fileName: `AtmosFlow-Report-${ctx.facilityName}.docx`,
  }
}

/**
 * Build a lightweight narrative-only DOCX (no cover ladder, no
 * appendices, no per-zone tables — just the AI-generated findings
 * narrative as a clean, shareable Word document with a header that
 * pins the facility and assessor and the same "Professional review
 * required" advisory the in-app view shows). Used by the Share
 * narrative button on the Narrative result tab.
 *
 * Kept structurally simple so it fits in messaging apps (small file
 * size, no embedded images) and reads as a draft for the reviewing
 * IH rather than as a finalized deliverable.
 */
export async function getNarrativeDocxBlob({ facility, narrative, profile, ts }) {
  const facilityName = (facility && (typeof facility === 'string' ? facility : facility.fn)) || 'Assessment'
  const dateStr = ts ? new Date(ts).toLocaleDateString() : new Date().toLocaleDateString()
  const assessorName = (profile && profile.name) || ''
  const assessorCerts = (profile && Array.isArray(profile.certs) && profile.certs.length)
    ? ` · ${profile.certs.join(', ')}`
    : ''

  // Split the narrative on blank lines so each paragraph renders as
  // its own Paragraph block (single \n inside a paragraph would lose
  // the line break in Word; \n\n becomes a real paragraph break).
  const paragraphs = String(narrative || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)

  const children = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'IAQ Findings Narrative', bold: true, size: 32, font: 'Inter' })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: facilityName, size: 22, font: 'Inter' })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: `${dateStr}${assessorName ? ` · ${assessorName}${assessorCerts}` : ''}`, size: 18, color: '6B7280', font: 'Inter' })],
    }),
    // "Professional review required" advisory mirrors the in-app
    // banner so the reviewing IH never receives a narrative without
    // the framing that says it must be reviewed before delivery.
    new Paragraph({
      spacing: { before: 80, after: 280 },
      children: [
        new TextRun({ text: 'AI-generated · Professional review required. ', bold: true, color: 'B45309', size: 18, font: 'Inter' }),
        new TextRun({ text: 'This narrative was generated from deterministic scoring output. Review, edit, and approve before including in any client deliverable.', color: 'B45309', size: 18, font: 'Inter' }),
      ],
    }),
    ...paragraphs.map(p => new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: p, size: 22, font: 'Inter' })],
    })),
  ]

  const doc = new Document({
    creator: 'AtmosFlow — Prudence EHS',
    title: `IAQ Findings Narrative — ${facilityName}`,
    description: 'AI-generated findings narrative — review required before client delivery.',
    styles: DOCX_STYLES,
    sections: [{ properties: BODY_SECTION_PROPERTIES, children }],
  })

  const blob = await Packer.toBlob(doc)
  return {
    blob,
    fileName: `AtmosFlow-Narrative-${facilityName}.docx`,
  }
}
