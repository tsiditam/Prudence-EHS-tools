/**
 * AtmosFlow DOCX Report — Entry Point
 *
 * Builds two Word documents from assessment data:
 * 1. AtmosFlow report (the client deliverable; `assembleRenderModel` →
 *    sections-atmosflow)
 * 2. Technical report (structured findings, score matrix, data gaps; legacy
 *    operator-facing path)
 *
 * The **consultant report was removed in 2026-08** at the product owner's
 * direction — it had accumulated too many defects to keep as a deliverable.
 * It was the v2.1 ClientReport path (bridge → renderClientReport →
 * sections-v21client) and one of two parallel client deliverables; the
 * AtmosFlow report is the survivor and was already the one behind both PDF
 * paths. Share and peer review now attach the AtmosFlow DOCX.
 *
 * `renderClientReport` and `src/engine/report/` are DELIBERATELY RETAINED —
 * PrintReport.jsx renders the HTML print view from them and the investigation
 * agent shares several of their modules — but this file no longer imports
 * them. Only the DOCX deliverable went. See docs/CRITERIA.md.
 */

import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx'
import { formatAssessmentDate } from '../utils/assessmentDate'
import { BODY_SECTION_PROPERTIES } from './docx/page-setup'
import { DOCX_STYLES } from './docx/styles'
import { markdownToDocx } from './docx/markdownToDocx'
import { buildFooter } from './docx/sections-appendix'
import { buildTechnicalHeader, buildScopeConditions, buildInstrumentation, buildBenchmarksUsed, buildResults, buildFlaggedIndicators, buildAnalystNotes, buildLimitationsCompact } from './docx/sections-technical'
import { buildAtmosFlowDoc } from './docx/sections-atmosflow'
import { assembleRenderModel } from '../report/reportModel'

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
 * callers go through `generateAtmosFlowOnly` / `getAtmosFlowDocxBlob` /
 * `generateTechnicalOnly`.
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

export async function buildAtmosFlowDocument(data) {
  const model = assembleRenderModel(data || {})
  return buildAtmosFlowDoc(model)
}

/**
 * Generate and download the AtmosFlow assessment DOCX.
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

export async function generateTechnicalOnly(data) {
  const ctx = buildContext(data)
  await generateTechnicalDocx(ctx)
}

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
