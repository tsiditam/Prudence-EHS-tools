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
import { BODY_SECTION_PROPERTIES, LETTER_BODY_PAGE } from './docx/page-setup'
import { DOCX_STYLES } from './docx/styles'
import { markdownToDocx } from './docx/markdownToDocx'
import { buildFooter } from './docx/sections-appendix'
import { buildTechnicalHeader, buildScopeConditions, buildInstrumentation, buildBenchmarksUsed, buildResults, buildFlaggedIndicators, buildAnalystNotes, buildLimitationsCompact } from './docx/sections-technical'
import { buildClientDocx } from './docx/sections-v21client'
import { buildLabResultsAppendix } from './docx/sections-lab-results'
import { buildSensorGraphsAppendix } from './docx/sections-sensor'
import { buildMethodologyCurrency } from './docx/sections-methodology-currency'
import { buildCalibrationAppendix } from './docx/calibration-appendix'
import { legacyToAssessmentScore, deriveAssessmentMeta } from '../engine/bridge'
import { renderClientReport } from '../engine/report/client'
import { watermarkSectionAttachments, buildCoverNoticeParagraph } from './docx/watermark'
import { reportSectionAttachments } from './docx/report-chrome'
import { DATA_GAP_MESSAGES } from './docx/canonical-content'
import { getCalibrationBannerState } from '../utils/instrumentRegistry'
import { applyOverrideToScore } from '../utils/consultantReportOverride'
import { buildOverrideCoverNoticeParagraph, buildOverrideSectionAttachments } from './docx/override-watermark'

/**
 * Spread-merge calibration appendices into a ClientReport result.
 *
 * The engine (src/engine/report/client.ts) declares appendixB +
 * appendixE as optional readonly fields on ClientReportAppendix but
 * never populates them. The DOCX renderer at sections-v21client.js
 * gates rendering on `if (ap.appendixB)`, so without this layer the
 * appendices are silently absent from the client deliverable —
 * calibration data exists in presurvey but the client never sees it.
 * This layer fills the gap from presurvey without touching engine code.
 *
 * Engine output wins when present (forward-compat with a future
 * engine version that populates these fields itself).
 */
export function augmentWithCalibrationAppendices(result, presurvey) {
  if (!result || result.kind === 'pre_assessment_memo' || !result.report) return result
  const { appendixB, appendixE } = buildCalibrationAppendix(presurvey)
  if (!appendixB && !appendixE) return result
  const existing = result.report.appendix || {}
  return {
    ...result,
    report: {
      ...result.report,
      appendix: {
        ...existing,
        appendixB: existing.appendixB || appendixB || undefined,
        appendixE: existing.appendixE || appendixE || undefined,
      },
    },
  }
}

function pickStr(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined) continue
    const s = typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '')
    if (s) return s
  }
  return null
}

/**
 * Build the DOCX render context from caller `data`.
 *
 * Two-source pattern (connectivity layer PR C):
 *   • `data.assessmentContext` (optional) — the normalized
 *     AssessmentContext produced by `lib/context/buildAssessmentContext`.
 *     When present, its identity fields (facility name, address,
 *     assessor, client) are PREFERRED, so DocxReport reads the same
 *     shape Jasper and the future server-side revalidator read.
 *   • Legacy `data.building` / `data.presurvey` / `data.profile` /
 *     `data.zones` / etc. — still consumed; remain the source for
 *     fields the connectivity layer does not (yet) normalize
 *     (calibration, firm branding, narrative, engine outputs).
 *
 * If `assessmentContext` is absent the function falls back to the
 * legacy fields end-to-end — old call sites (e.g. resumed-report
 * exports from before this PR) keep working unchanged.
 *
 * @internal Exported only for the parity test
 * (`tests/components/DocxReport-context.test.ts`). Production
 * callers go through `generateDocx` / `generateConsultantOnly` /
 * `generateTechnicalOnly` / `getConsultantDocxBlob`.
 */
export function buildContext(data) {
  const { building, presurvey, zones, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos, floorPlan, version, standardsManifest, assessmentContext } = data
  const bldg = building || {}
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const assessDate = data.ts ? new Date(data.ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : now

  // Normalized identity fields from the connectivity layer (when
  // present). The builder already applies the same precedence rules
  // (building → presurvey → client) so DocxReport stays consistent
  // with Jasper.
  const ctxBuilding = assessmentContext && assessmentContext.building
  const ctxProject = assessmentContext && assessmentContext.project

  return {
    facilityName: pickStr(ctxBuilding && ctxBuilding.name, bldg.fn) || 'Facility',
    address: pickStr(ctxBuilding && ctxBuilding.address, bldg.fl) || '—',
    assessDate,
    reportDate: now,
    assessor: pickStr(profile?.name, ctxProject && ctxProject.requested_by, presurvey?.ps_assessor) || 'Assessor',
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
    // Pass-through so section builders that need richer context
    // (logger summary, readiness verdict, photo index) can read the
    // same normalized shape without re-deriving it.
    assessmentContext: assessmentContext || null,
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

/**
 * Build the DOCX-layer instrument accuracy/calibration note input from
 * presurvey data. Reuses getCalibrationBannerState (the live calibration
 * gate helper) for the staleness line — no threshold is duplicated here.
 * Returns null when no primary IAQ instrument was recorded.
 */
function buildInstrumentAccuracyInfo(presurvey) {
  const ps = presurvey || {}
  const name = ps.ps_inst_iaq
  if (!name) return null
  const calDate = ps.ps_inst_iaq_cal || null
  const banner = getCalibrationBannerState(name, calDate)
  let calibrationLine
  if (!calDate) calibrationLine = `${name} calibration date not recorded.`
  else if (banner && banner.kind === 'expired') calibrationLine = `${banner.message} (as of the report date).`
  else if (banner && banner.kind === 'expiring') calibrationLine = `${banner.message}.`
  else calibrationLine = `${name} calibration is current as of the report date.`
  return {
    iaqName: name,
    iaqSerial: ps.ps_inst_iaq_serial || '',
    iaqAccuracy: ps.ps_inst_iaq_accuracy || '',
    calDate,
    calStatus: ps.ps_inst_iaq_cal_status || '',
    calibrationLine,
    pidName: ps.ps_inst_pid || '',
    pidAccuracy: ps.ps_inst_pid_accuracy || '',
    pidCalStatus: ps.ps_inst_pid_cal || '',
  }
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
  const engineResult = renderClientReport(score, {
    includeAssessmentIndexAppendix: !!data.includeAssessmentIndexAppendix,
  })
  // Augment with calibration appendices B + E. The engine declares both as
  // optional readonly fields but does not populate them today; this layer
  // fills them from presurvey data and preserves engine output if a future
  // engine version starts emitting them itself. No engine files modified.
  const result = augmentWithCalibrationAppendices(engineResult, data.presurvey)

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
    instrumentAccuracy: buildInstrumentAccuracyInfo(data.presurvey),
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
        // Restart page numbering at 1 for the body so the cover (its own
        // section) is not counted in the "Page X of Y" footer.
        properties: { ...BODY_SECTION_PROPERTIES, page: { ...LETTER_BODY_PAGE, pageNumbers: { start: 1 } } },
        children: main,
        ...bodyAttachments,
      },
    ],
  })
}

async function generateTechnicalDocx(ctx) {
  const mainChildren = [
    ...buildTechnicalHeader(ctx),
    ...buildScopeConditions(ctx),
    ...buildInstrumentation(ctx),
    ...buildBenchmarksUsed(ctx),
    ...buildResults(ctx),
    ...buildFlaggedIndicators(ctx),
    ...buildAnalystNotes(ctx),
    ...buildLimitationsCompact(ctx),
    ...buildFooter(ctx),
  ]

  const doc = new Document({
    creator: 'AtmosFlow — Prudence EHS',
    title: `IAQ Technical Report (Internal) — ${ctx.facilityName}`,
    description: 'Indoor Air Quality Technical Assessment — Internal Use',
    styles: DOCX_STYLES,
    sections: [
      {
        // One section, no cover page — lean internal-triage layout.
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
    // Render the narrative's markdown (headings / bullets / tables) as
    // real docx blocks. This file uses the Inter face, so pass it
    // through.
    ...markdownToDocx(String(narrative || ''), { font: 'Inter' }),
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
