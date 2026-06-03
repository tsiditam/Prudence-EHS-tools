/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Report data model — pure assembly of an assessment into the shape the DOCX
 * builder renders. Reads engine outputs (findings, chains, sampling plan,
 * recommendations, state exceedances) and composes the manifest-gated
 * bibliography, readiness verdict, and screening-only positioning. No I/O,
 * no docx — just data, so it's trivially testable.
 */

import { bibliographyFor, buildReadiness, SCREENING_NOTICE, DRAFT_WATERMARK } from '../engine'
import { ENGINE_VERSION, STANDARDS_MANIFEST_VERSION } from '../version.js'
import type {
  Finding,
  CausalChain,
  SamplingPlanItem,
  Recommendations,
  StateExceedance,
  Tier,
} from '../types/engine'

export interface ReportAssessment {
  assessor?: Record<string, any>
  source?: Record<string, any>
  building?: Record<string, any>
  labResults?: any[]
  evaluation?: { findings: Finding[]; tier: Tier } | null
  chains?: CausalChain[]
  samplingPlan?: SamplingPlanItem[]
  recs?: Recommendations | null
  stateExceed?: StateExceedance[]
  selState?: string
  coc?: any
  /** Optional AI narrative sections (the narrative layer), woven into the DOCX. */
  narrative?: { executiveSummary?: string; keyFindings?: string; causal?: string; recommended?: string } | null
}

function reportId(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const seq = String(Math.floor(now.getTime() / 1000) % 1000).padStart(3, '0')
  return `PSEC-H2O-${y}-${m}-${seq}`
}

const TIER_TEXT: Record<Tier, string> = {
  immediate: 'Immediate Action',
  advisory: 'Advisory',
  monitor: 'Monitor',
  compliant: 'Compliant (screening)',
}

export function buildReportModel(a: ReportAssessment) {
  const now = new Date()
  const assessor = a.assessor || {}
  const source = a.source || {}
  const building = a.building || {}
  const findings = a.evaluation?.findings || []
  const tier: Tier = a.evaluation?.tier || 'compliant'

  const violations = findings.filter((f) => f.violations.length > 0)
  const advisories = findings.filter((f) => f.advisories.length > 0)

  return {
    meta: {
      reportId: reportId(now),
      generatedAt: now,
      engineVersion: ENGINE_VERSION,
      standardsManifestVersion: STANDARDS_MANIFEST_VERSION,
      title: 'Drinking Water Quality Assessment — Screening Report',
      preparedBy: 'Prudence Safety & Environmental Consulting, LLC',
    },
    watermark: DRAFT_WATERMARK,
    screeningNotice: SCREENING_NOTICE,
    site: {
      sourceType: source.src_type || 'Not recorded',
      pwsName: source.src_pws || null,
      pwsId: source.src_pws_id || null,
      buildingType: building.b_type || 'Not recorded',
      yearBuilt: building.b_year || null,
      serviceLine: building.b_pipe_mat || 'Unknown',
      interiorPlumbing: building.b_int_pipe || 'Unknown',
    },
    assessor: {
      name: assessor.a_name || 'Not recorded',
      certifications: Array.isArray(assessor.a_certs) ? assessor.a_certs.join(', ') : '',
      experience: assessor.a_exp || '',
    },
    dqo: {
      purpose: source.dqo_purpose || 'Not specified',
      detection: source.dqo_detection || 'Not specified',
      dataPackage: source.dqo_data_pkg || 'Not specified',
      rationale: source.dqo_rationale || '',
    },
    compliance: {
      tier,
      tierLabel: TIER_TEXT[tier],
      counts: { parameters: findings.length, violations: violations.length, advisories: advisories.length },
    },
    findings,
    chains: a.chains || [],
    samplingPlan: a.samplingPlan || [],
    recommendations: a.recs || { immediate: [], shortTerm: [], longTerm: [], monitoring: [] },
    stateExceedances: a.stateExceed || [],
    coc: a.coc || null,
    narrative: a.narrative || null,
    bibliography: bibliographyFor(findings),
    readiness: buildReadiness({ assessor, source, building, labResults: a.labResults, evaluation: a.evaluation }),
  }
}

export type ReportModel = ReturnType<typeof buildReportModel>
