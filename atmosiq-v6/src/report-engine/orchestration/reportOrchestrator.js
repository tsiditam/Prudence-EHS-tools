/**
 * Atmosflow Technical Report Authoring Engine
 * Report Orchestrator — orchestrates the full report generation pipeline
 *
 * Flow:
 * 1. Build canonical reportPayload from upstream engine outputs
 * 2. Run each section-writing module against the payload
 * 3. Run QA checks on each section
 * 4. If QA fails, rewrite with corrections
 * 5. Assemble approved sections into locked template
 * 6. Render final HTML/PDF
 *
 * CRITICAL: This layer NEVER recalculates scores, findings, or causal chains.
 * All analytical data comes from upstream engines via reportPayload.
 */

import { buildReportPayload } from './payloadBuilder'
import { writeCoverPage } from '../modules/coverPage'
import { writeExecutiveSummary } from '../modules/executiveSummary'
import { writeScopeMethodology } from '../modules/scopeMethodology'
import { writeBuildingContext } from '../modules/buildingContext'
import { writeFindingsDashboard } from '../modules/findingsDashboard'
import { writeZoneInterpretation } from '../modules/zoneInterpretation'
import { writeCausalAnalysis } from '../modules/causalAnalysis'
import { writeRecommendations } from '../modules/recommendations'
import { writeSamplingPlan } from '../modules/samplingPlan'
import { writeLimitations } from '../modules/limitations'
import { formatAppendices } from '../modules/appendices'
import { runQA } from '../qa/qaRunner'

/**
 * Main orchestration function
 * @param assessmentData - Raw data from MobileApp (building, presurvey, zones, etc.)
 * @param engineOutputs - Outputs from scoring, causal, sampling, OSHA engines
 * @returns ReportOutput with all sections and QA scores
 */
export async function generateReport(assessmentData, engineOutputs) {
  // Step 1: Build canonical payload (single source of truth)
  const payload = buildReportPayload(assessmentData, engineOutputs)

  // Step 2: Run section-writing modules (deterministic first, AI-assisted second)
  const sections = []

  // Deterministic sections (no AI, pure template + data)
  sections.push(writeCoverPage(payload))
  sections.push(writeScopeMethodology(payload))
  sections.push(writeBuildingContext(payload))
  sections.push(writeFindingsDashboard(payload))
  sections.push(formatAppendices(payload))

  // AI-assisted sections (use prompts constrained by payload)
  sections.push(await writeExecutiveSummary(payload))
  for (let i = 0; i < payload.scoring.zones.length; i++) {
    sections.push(await writeZoneInterpretation(payload, i))
  }
  sections.push(await writeCausalAnalysis(payload))
  sections.push(await writeRecommendations(payload))
  sections.push(await writeSamplingPlan(payload))
  sections.push(writeLimitations(payload))

  // Step 3: Run QA on every section
  const qaResults = sections.map(section => runQA(section, payload))

  // Step 4: Rewrite any section that fails QA (max 1 retry)
  for (let i = 0; i < qaResults.length; i++) {
    if (qaResults[i].status === 'qa_failed' && qaResults[i].qaScore < 60) {
      // Rewrite with QA feedback injected into prompt
      const rewritten = await rewriteSection(sections[i], qaResults[i].qaIssues, payload)
      const recheck = runQA(rewritten, payload)
      sections[i] = rewritten
      qaResults[i] = recheck
    }
  }

  // Step 5: Calculate overall QA score
  const overallQa = Math.round(
    qaResults.reduce((sum, r) => sum + r.qaScore, 0) / qaResults.length
  )

  return {
    payload,
    sections: qaResults,
    overallQaScore: overallQa,
    readyForRender: overallQa >= 70 && qaResults.every(r => r.status !== 'qa_failed'),
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Build the canonical payload from raw assessment + engine outputs
 */
export function buildReportPayload(data, engines) {
  const { building, presurvey, zones, profile } = data
  const { zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative } = engines

  return {
    meta: {
      reportId: `RPT-${Date.now().toString(36).toUpperCase()}`,
      reportVersion: 'v1.0',
      reportStatus: 'draft',
      generatedAt: new Date().toISOString(),
      platformVersion: '6.0.0',
      assessmentDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      reportDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    },
    facility: {
      name: building?.fn || 'Facility',
      address: building?.fl || '',
      type: building?.ft || '',
      building: building || {},
    },
    assessor: {
      name: profile?.name || presurvey?.ps_assessor || 'Assessor',
      credentials: profile?.certs || presurvey?.ps_assessor_certs || [],
      experience: profile?.experience || presurvey?.ps_assessor_exp || '',
      instrument: profile?.iaq_meter || presurvey?.ps_inst_iaq || '',
      instrumentSerial: presurvey?.ps_inst_iaq_serial || '',
      calibrationStatus: profile?.iaq_cal_status || presurvey?.ps_inst_iaq_cal_status || '',
      calibrationDate: presurvey?.ps_inst_iaq_cal || '',
      pidMeter: profile?.pid_meter || presurvey?.ps_inst_pid || '',
      pidCalibration: presurvey?.ps_inst_pid_cal || '',
    },
    context: {
      reason: presurvey?.ps_reason || '',
      complaintNarrative: presurvey?.ps_complaint_narrative || '',
      complaintSeverity: presurvey?.ps_complaint_severity || '',
      priorAssessments: presurvey?.ps_prior || '',
      waterHistory: presurvey?.ps_water_history || '',
      affectedAreas: presurvey?.ps_affected_areas || '',
    },
    scoring: {
      composite: comp,
      zones: zoneScores,
      osha: oshaResult,
    },
    zoneData: zones || [],
    analysis: {
      causalChains: causalChains || [],
      samplingPlan: samplingPlan || { plan: [], outdoorGaps: [] },
      recommendations: recs || { imm: [], eng: [], adm: [], mon: [] },
      ventCalcs: [], // populated if calcVent was run
    },
    narrative: narrative || null,
    standards: [
      'ASHRAE 62.1-2025',
      'ASHRAE 55-2023',
      'OSHA 29 CFR 1910.1000',
      'EPA NAAQS',
      'WHO Air Quality Guidelines',
    ],
  }
}
