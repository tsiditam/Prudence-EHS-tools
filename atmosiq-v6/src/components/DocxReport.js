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
import { formatAssessmentDate, resolveAssessmentDate } from '../utils/assessmentDate'
import { BODY_SECTION_PROPERTIES, LETTER_BODY_PAGE } from './docx/page-setup'
import { DOCX_STYLES } from './docx/styles'
import { markdownToDocx } from './docx/markdownToDocx'
import { buildFooter } from './docx/sections-appendix'
import { buildTechnicalHeader, buildScopeConditions, buildInstrumentation, buildBenchmarksUsed, buildResults, buildFlaggedIndicators, buildAnalystNotes, buildLimitationsCompact } from './docx/sections-technical'
import { buildClientDocx } from './docx/sections-v21client'
import { buildAtmosFlowDoc } from './docx/sections-atmosflow'
import { assembleRenderModel } from '../report/reportModel'
import { buildLabResultsAppendix } from './docx/sections-lab-results'
import { buildSensorGraphsAppendix } from './docx/sections-sensor'
import { buildConceptualSiteModelSection } from './docx/sections-conceptual-model'
import { buildMethodologyCurrency } from './docx/sections-methodology-currency'
import { measuredParameters } from '../engines/contextualStandards'
import { buildParameterExplainers, buildReportedConcernsSection, buildFindingsConfidenceRegister } from './docx/sections-cih-reasoning'
import { buildEvidenceTraceabilityMatrix } from './docx/sections-traceability'
import { buildGraphContext } from '../../lib/context/graphContext'
import { buildCalibrationAppendix } from './docx/calibration-appendix'
import { legacyToAssessmentScore, deriveAssessmentMeta } from '../engine/bridge'
import { renderClientReport } from '../engine/report/client'
import { watermarkSectionAttachments, buildCoverNoticeParagraph } from './docx/watermark'
import { reportSectionAttachments } from './docx/report-chrome'
import { DATA_GAP_MESSAGES } from './docx/canonical-content'
import { getCalibrationBannerState } from '../utils/instrumentRegistry'

/**
 * Merge the calibration mapper's appendices B + E into a ClientReport.
 *
 * ── Why this is a MERGE and not a fallback ─────────────────────────
 *
 * This layer used to read `existing.appendixE || appendixE` on the
 * belief — stated in its own header, and encoded in
 * `tests/engine/calibration-appendix-augment.test.ts` via a fake engine
 * result that omitted both — that the engine declares appendix B/E but
 * never populates them. It populates BOTH, unconditionally
 * (`buildAppendixB` / `buildAppendixE` in src/engine/report/client.ts).
 *
 * So the fallback never fired, and every note the mapper produced was
 * dead in the issued document: the validity statement, the expired-
 * instrument warning, the unrecorded-calibration data-gap pointer, and
 * the calibration acknowledgement. Reading a generated DOCX is what
 * surfaced it; no assertion could, because the assertions supplied an
 * engine result that did not resemble the real one.
 *
 * ── What each side contributes ─────────────────────────────────────
 *
 * The engine's appendices carry structure the mapper does not have:
 * appendix B's per-zone sampling table, and the house-style headings.
 * The mapper carries everything DERIVED FROM THE DATA: the rendered
 * calibration status ("EXPIRED — 31 days overdue", "Date not
 * recorded" — the engine prints a bare em-dash), the state-dependent QA
 * notes, and the acknowledgement.
 *
 * Two specific overrides, both about truthfulness rather than taste:
 *
 *   • Appendix E's DESCRIPTION. The engine's constant reads
 *     "Calibration was verified to be within manufacturer
 *     specification at the time of survey." AtmosFlow verifies no such
 *     thing — it records a date the assessor typed, and prints that
 *     sentence even when no date exists at all. Claiming a control that
 *     was never applied is the exact failure `calibration-appendix.js`
 *     and `tests/engine/calibration-qa-notes.test.ts` exist to prevent.
 *   • Instrument STATUS cells. "Date not recorded" tells a reader
 *     something; "—" reads as a formatting artifact.
 *
 * QA notes are unioned, engine-first: its three notes are generic and
 * true statements about field method, and the mapper's are the
 * data-derived ones that must follow them.
 *
 * The engine is untouched — this is the rendering-augmentation layer
 * the mapper has always lived in.
 *
 * `calibrationAcknowledgement` — the record left when the assessor
 * finalized past the calibration interrupt — flows through to appendix
 * E's QA notes. It is threaded here rather than read from `presurvey`
 * because it is a decision ABOUT the presurvey, not part of it: the
 * presurvey can be edited afterwards; the acknowledgement must not be.
 */
export function augmentWithCalibrationAppendices(result, presurvey, opts = {}) {
  if (!result || result.kind === 'pre_assessment_memo' || !result.report) return result
  const { appendixB, appendixE } = buildCalibrationAppendix(presurvey, {
    calibrationAcknowledgement: opts.calibrationAcknowledgement,
  })
  if (!appendixB && !appendixE) return result
  const existing = result.report.appendix || {}
  return {
    ...result,
    report: {
      ...result.report,
      appendix: {
        ...existing,
        appendixB: mergeAppendixB(existing.appendixB, appendixB),
        appendixE: mergeAppendixE(existing.appendixE, appendixE),
      },
    },
  }
}

/** Union preserving order, first occurrence wins. */
function unionNotes(...lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const note of Array.isArray(list) ? list : []) {
      const key = String(note || '').trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(note)
    }
  }
  return out
}

function mergeAppendixB(engine, mapped) {
  if (!engine) return mapped || undefined
  if (!mapped) return engine
  return {
    ...engine,
    // Mapper rows carry the rendered calibration status; engine rows
    // carry a bare em-dash. Same instruments either way — both derive
    // from the same presurvey fields via the same two slots.
    instrumentRows: mapped.instrumentRows?.length ? mapped.instrumentRows : engine.instrumentRows,
    // Only the engine builds the per-zone sampling table.
    zoneRows: engine.zoneRows?.length ? engine.zoneRows : mapped.zoneRows,
  }
}

function mergeAppendixE(engine, mapped) {
  if (!engine) return mapped || undefined
  if (!mapped) return engine
  return {
    ...engine,
    // See the header: the engine's constant asserts a verification that
    // never happens.
    description: mapped.description || engine.description,
    calibrationRecords: mapped.calibrationRecords?.length
      ? mapped.calibrationRecords
      : engine.calibrationRecords,
    qaNotes: unionNotes(engine.qaNotes, mapped.qaNotes),
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
  const { building, presurvey, zones, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos, floorPlan, version, standardsManifest, assessmentContext, escalationTriggers } = data
  const bldg = building || {}
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  // The date the survey was CONDUCTED, not the day the report was finalized.
  // Shared resolver so this report, the DOCX and scoring all answer alike.
  const assessDate = formatAssessmentDate(data) || now

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
    // Needed by the shared verdict so DOCX triage matches the app.
    escalationTriggers: escalationTriggers || [],
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
  // Distinct from the AtmosFlow report's file name (AtmosFlow-Report-…):
  // both used to download as the same name, so the two different documents
  // were indistinguishable on disk and one masked the other.
  a.download = `AtmosFlow-Consultant-Report-${ctx.facilityName}.docx`
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

/**
 * Build just the engine ClientReport result for an assessment — the same
 * meta → score → renderClientReport pipeline buildConsultantDocument uses,
 * stopping at the model. The editorial-review pass uses this to build a digest
 * of cuttable content whose ids match EXACTLY what the DOCX renders, so an
 * approved cut resolves to a real, renderer-honored suppression. Read-only:
 * it does not mutate the engine or the assessment.
 */
export function getConsultantReportResult(data) {
  const meta = deriveAssessmentMeta({
    profile: data.profile,
    presurvey: data.presurvey,
    building: data.building,
    assessmentDate: resolveAssessmentDate(data) || undefined,
  })
  const score = legacyToAssessmentScore(
    data.zoneScores || [],
    data.comp || null,
    data.zones || [],
    { meta, presurvey: data.presurvey, building: data.building },
  )
  return renderClientReport(score, {
    includeAssessmentIndexAppendix: !!data.includeAssessmentIndexAppendix,
  })
}

async function buildConsultantDocument(ctx, data) {
  // v2.1 path: bridge legacy scoring data → AssessmentScore → ClientReport
  // → docx. CIH-defensible deliverable.
  const meta = deriveAssessmentMeta({
    profile: data.profile,
    presurvey: data.presurvey,
    building: data.building,
    assessmentDate: resolveAssessmentDate(data) || undefined,
  })
  let score = legacyToAssessmentScore(
    data.zoneScores || [],
    data.comp || null,
    data.zones || [],
    { meta, presurvey: data.presurvey, building: data.building },
  )

  // ── The IH score-override path was REMOVED (engine v2.9) ────────
  //
  // It existed to bypass the engine's refusal-to-issue: it mutated the
  // score so the refusal triggers stopped firing, and a cover notice
  // recorded what had been overridden. Since v2.9 the engine does not
  // refuse — it always issues, carrying the fired triggers as
  // `dataGapWarnings` rendered on the cover and under "Limitations on
  // Reliance".
  //
  // That makes the old mechanism not merely unused but WRONG. Flipping
  // `hasCalibrationRecords` (its calibration branch) would stop trigger
  // 4 firing, which would now DELETE a real data gap from the issued
  // report rather than disclose it. There is no longer anything to
  // bypass, and suppressing a disclosure is the opposite of the intent.
  //
  // What the assessor actually needs — a record when they proceed past
  // the calibration interrupt — is served by the calibration
  // ACKNOWLEDGEMENT (src/utils/calibrationAcknowledgement.js), which
  // adds an audit artifact instead of removing a warning.
  const engineResult = renderClientReport(score, {
    includeAssessmentIndexAppendix: !!data.includeAssessmentIndexAppendix,
  })
  // Augment with calibration appendices B + E. The engine declares both as
  // optional readonly fields but does not populate them today; this layer
  // fills them from presurvey data and preserves engine output if a future
  // engine version starts emitting them itself. No engine files modified.
  const result = augmentWithCalibrationAppendices(engineResult, data.presurvey, {
    calibrationAcknowledgement: data.calibrationAcknowledgement,
  })

  // Supplemental sections are folded into the canonical model by
  // buildClientDocx (sections-supplemental.js) rather than appended after
  // the fact, so they share the section heading style, sit in the right
  // position, get continuous appendix letters (after the engine's
  // Appendix F), and register in the Table of Contents:
  //   • Additional Criteria Considered — published criteria a reader could
  //     expect to see applied to this data that were NOT the basis of any
  //     finding, each with the reason (→ after Limitations). Scoped to the
  //     parameters actually measured, so an assessment with no particulate
  //     data carries no particulate note and the section disappears
  //     entirely when it would engage nothing.
  //     History: this rendered as "Standards Currency" and was REMOVED in
  //     048f6d4 because its prose described AtmosFlow's own scoring
  //     internals ("standards manifest", "deterministic scoring path") —
  //     implementation detail, not client content. It returns having been
  //     rewritten as criteria-selection rationale addressed to the reader;
  //     the objection was to the prose, not to the subject, and "why 35
  //     µg/m³ and not 9" is a question the report otherwise invites and
  //     leaves unanswered.
  //   • Laboratory Analytical Results — closes the CoC loop when the
  //     assessor imported analytical CSV results (→ Appendix G).
  //   • Environmental Evidence Graphs — report-ready IAQ timelines the
  //     assessor flagged on the Sensor Data screen (→ Appendix H).
  // Each builder returns null when it has nothing to render.
  // The "CIH reasoning" report style (data.reportStyle === 'cih') adds four
  // body sections, all derived from data the engine already emits (no
  // engine edits): parameter explainers, the reported-concerns → evidence
  // map, the Conceptual Site Model (source → pathway → receptor chains from
  // causalChains), and a findings register carrying the engine's per-zone
  // data confidence. Standard style omits all four.
  const cihSections = data.reportStyle === 'cih'
    ? [
        buildParameterExplainers(data.zones),
        buildReportedConcernsSection(data.presurvey, data.zones, data.zoneScores),
        buildConceptualSiteModelSection(data.causalChains),
        buildFindingsConfidenceRegister(data.zoneScores),
        // Evidence Traceability Matrix (§17): finding -> evidence -> standard
        // chain of custody, derived from the same knowledge-graph projection
        // the Evidence Map UI and Jasper read. Null when no flagged findings.
        buildEvidenceTraceabilityMatrix(buildGraphContext({
          id: data.id, zones: data.zones, zoneScores: data.zoneScores,
          causalChains: data.causalChains, recs: data.recs,
        })),
      ]
    : []
  const supplemental = {
    bodySections: [
      ...cihSections,
      buildMethodologyCurrency({ parameters: measuredParameters(data.zones) }),
    ].filter(Boolean),
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
    // Human-approved editorial cuts from the review pass (may be absent).
    editorialSuppressions: data.editorialSuppressions,
  })

  // Free-tier watermark: pass watermarkConfig from caller (e.g. resolved
  // from the user's profile.plan upstream). When tier === 'free', adds
  // header on every page, footer on every page, and a notice on the
  // cover. Paid tier gets no header/footer/notice.
  const watermarkConfig = data.watermarkConfig || null
  const sectionWatermark = watermarkSectionAttachments(watermarkConfig)
  const coverNotice = buildCoverNoticeParagraph(watermarkConfig)

  const coverChildren = [
    ...(cover.children || []),
    ...(coverNotice ? [coverNotice] : []),
  ]

  // Formal running header/footer (firm · project no. / "Confidential —
  // Prepared for {client}" · Page X of Y). Used as the BASE of the body
  // merge so the free-tier watermark attachments still take precedence
  // for their slots when present (their whole-object spread replaces
  // this chrome). Paid reports — which previously had
  // no running header/footer — get the formal chrome.
  const reportChrome = reportSectionAttachments({
    firm: meta.issuingFirm?.name,
    projectNumber: meta.projectNumber,
    clientName: meta.transmittalRecipient?.organization
      || meta.transmittalRecipient?.fullName
      || ctx.facilityName,
  })

  // Cover keeps only the watermark attachments (no formal running
  // chrome on the title page); the body gets the chrome with the
  // watermark layered on top.
  const coverAttachments = {
    ...sectionWatermark,
  }
  const bodyAttachments = {
    ...reportChrome,
    ...sectionWatermark,
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

/**
 * Build the AtmosFlow assessment DOCX — the EDITABLE, WATERMARK-FREE Word
 * deliverable, built 1:1 to the AtmosFlow Figma design.
 *
 * The RENDER MODEL is assembled here exactly as the PDF client path does
 * (src/utils/downloadReportPdf.js): `assembleRenderModel(data, opts)` from
 * src/report/reportModel.js — so every value (facility, ranges, findings,
 * recommendations, signature, chrome) comes from the real assessment. `mode`
 * is left as the default ('draft') — it is NEVER 'sample', a marketing
 * artifact. The Word document never draws a diagonal watermark regardless of
 * the report's status; that is the whole point of the editable deliverable.
 *
 * The document (Open Sans face, spectrum cover bar, teal section labels, page
 * geometry, running header/footer, numbering) is fully owned by
 * sections-atmosflow.js via `buildAtmosFlowDoc(model)`.
 *
 * Editorial suppressions do NOT apply here: the render-model carries no engine
 * findingIds, so there is nothing to suppress against. (Editorial suppression
 * remains on the Consultant Report, sections-v21client.js.)
 */
export async function buildAtmosFlowDocument(data) {
  const model = assembleRenderModel(data || {})
  return buildAtmosFlowDoc(model)
}

/**
 * Generate and download the AtmosFlow assessment DOCX. Mirrors
 * generateConsultantDocx's download side-effect.
 */
export async function generateAtmosFlowOnly(data) {
  const ctx = buildContext(data)
  const doc = await buildAtmosFlowDocument(data)
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
 * Build the AtmosFlow assessment DOCX and return it as a Blob without
 * triggering a download (for the Share path).
 */
export async function getAtmosFlowDocxBlob(data) {
  const ctx = buildContext(data)
  const doc = await buildAtmosFlowDocument(data)
  const blob = await Packer.toBlob(doc)
  return {
    blob,
    fileName: `AtmosFlow-Report-${ctx.facilityName}.docx`,
  }
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
    // Distinct from the AtmosFlow report — see generateConsultantDocx.
    fileName: `AtmosFlow-Consultant-Report-${ctx.facilityName}.docx`,
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
