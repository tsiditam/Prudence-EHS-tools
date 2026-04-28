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

import { Document, Packer, SectionType } from 'docx'
import { DOCX_STYLES } from './docx/styles'
import { buildCoverPage } from './docx/sections-core'
import { buildSamplingPlan, buildRecommendations } from './docx/sections-recommendations'
import { buildAppendixB, buildFooter } from './docx/sections-appendix'
import { buildTechnicalMetadata, buildFindingsRegister, buildCategoryScoresSummary, buildDataGapRegister, buildInstrumentLog, buildOutdoorBaseline } from './docx/sections-technical'
import { buildClientDocx } from './docx/sections-v21client'
import { legacyToAssessmentScore, deriveAssessmentMeta } from '../engine/bridge'
import { renderClientReport } from '../engine/report/client'

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
    firmName: profile?.firm || 'Prudence Safety & Environmental Consulting, LLC',
    firmAddress: profile?.firm_address || 'Germantown, Maryland',
    firmPhone: profile?.firm_phone || '(301) 541-8362',
    firmEmail: profile?.email || 'support@prudenceehs.com',
    assessorCerts: profile?.certs || [],
  }
}

async function generateConsultantDocx(ctx, data) {
  // v2.1 path: bridge legacy scoring data → AssessmentScore → ClientReport
  // → docx. CIH-defensible deliverable.
  const meta = deriveAssessmentMeta({
    profile: data.profile,
    presurvey: data.presurvey,
    building: data.building,
    assessmentDate: data.ts ? data.ts.slice(0, 10) : undefined,
  })
  const score = legacyToAssessmentScore(
    data.zoneScores || [],
    data.comp || null,
    data.zones || [],
    { meta, presurvey: data.presurvey, building: data.building },
  )
  const result = renderClientReport(score, {
    includeAssessmentIndexAppendix: !!data.includeAssessmentIndexAppendix,
  })
  const { cover, main } = buildClientDocx(result)

  const doc = new Document({
    creator: 'AtmosFlow — Prudence Safety & Environmental Consulting, LLC',
    title: `IAQ Assessment Report — ${ctx.facilityName}`,
    description: 'Indoor Air Quality Assessment Report',
    styles: DOCX_STYLES,
    sections: [
      cover,
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        children: main,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AtmosFlow-Report-${ctx.facilityName}.docx`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
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
    creator: 'AtmosFlow — Prudence Safety & Environmental Consulting, LLC',
    title: `IAQ Technical Report — ${ctx.facilityName}`,
    description: 'Indoor Air Quality Technical Assessment Report — Structured Findings',
    styles: DOCX_STYLES,
    sections: [
      buildCoverPage(ctx),
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
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
