/**
 * AtmosFlow DOCX Report — Entry Point
 * Builds a Word document from assessment data and triggers download.
 */

import { Document, Packer, SectionType } from 'docx'
import { DOCX_STYLES } from './docx/styles'
import { buildCoverPage, buildTransparencyPanel, buildExecutiveSummary, buildScopeMethodology, buildBuildingContext, buildFindingsDashboard } from './docx/sections-core'
import { buildZoneHeader, buildZoneSection } from './docx/sections-zone'
import { buildCausalChainAnalysis } from './docx/sections-causal'
import { buildSamplingPlan, buildRecommendations, buildLimitations } from './docx/sections-recommendations'
import { buildAppendixA, buildAppendixB, buildFooter } from './docx/sections-appendix'

function buildContext(data) {
  const { building, presurvey, zones, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos, version } = data
  const bldg = building || {}
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const assessDate = data.ts ? new Date(data.ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : now

  return {
    facilityName: bldg.fn || 'Facility',
    address: bldg.fl || '—',
    assessDate,
    reportDate: now,
    assessor: profile?.name || presurvey?.ps_assessor || 'Assessor',
    reportId: data.id || `AIQ-${Date.now().toString(36).toUpperCase().slice(-6)}`,
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
    reason: presurvey?.ps_reason || '',
    instrument: presurvey?.ps_inst_iaq || '',
    instrumentSerial: presurvey?.ps_inst_iaq_serial || '',
    calibration: presurvey?.ps_inst_iaq_cal_status || 'Not recorded',
    pidMeter: presurvey?.ps_inst_pid || '',
    pidCal: presurvey?.ps_inst_pid_cal || '',
  }
}

export async function generateDocx(data) {
  const ctx = buildContext(data)

  // Build all content sections
  const mainChildren = [
    ...buildTransparencyPanel(ctx),
    ...buildExecutiveSummary(ctx),
    ...buildScopeMethodology(ctx),
    ...buildBuildingContext(ctx),
    ...buildFindingsDashboard(ctx),
    ...buildZoneHeader(ctx),
  ]

  // Zone sections
  for (let i = 0; i < ctx.zoneScores.length; i++) {
    mainChildren.push(...buildZoneSection(ctx, i))
  }

  // Causal chains
  mainChildren.push(...buildCausalChainAnalysis(ctx))

  // Sampling plan (before recommendations)
  mainChildren.push(...buildSamplingPlan(ctx))

  // Recommendations
  mainChildren.push(...buildRecommendations(ctx))

  // Limitations
  mainChildren.push(...buildLimitations(ctx))

  // Appendices
  mainChildren.push(...buildAppendixA(ctx))
  mainChildren.push(...buildAppendixB(ctx))

  // Footer
  mainChildren.push(...buildFooter(ctx))

  const doc = new Document({
    creator: 'AtmosFlow — Prudence Safety & Environmental Consulting, LLC',
    title: `IAQ Assessment Report — ${ctx.facilityName}`,
    description: 'Indoor Air Quality Assessment Report',
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
  a.download = `AtmosFlow-Report-${ctx.facilityName}.docx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
