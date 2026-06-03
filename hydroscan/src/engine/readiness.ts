/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Readiness gate — ADVISORY ONLY. Surfaces documentation gaps that weaken a
 * deliverable's defensibility (missing assessor identity, missing source
 * characterization, litigation DQO without a Level IV data package, etc.) so
 * the assessor can fix them. It never hard-blocks report issuance: a
 * credentialed assessor owns the call. Each blocker names the exact field and
 * where to fix it.
 */

export type BlockerTier = 'hard' | 'dismissible'

export interface ReadinessBlocker {
  id: string
  tier: BlockerTier
  message: string
  field: string
  fixLocation: string
}

export interface ReadinessVerdict {
  /** True when there are no HARD blockers. Advisory — does not gate issuance. */
  ready: boolean
  blockers: ReadinessBlocker[]
}

interface AssessmentLike {
  assessor?: Record<string, any>
  source?: Record<string, any>
  building?: Record<string, any>
  labResults?: any[]
  evaluation?: { findings?: any[]; tier?: string } | null
}

const blank = (v: any) => v == null || (typeof v === 'string' && v.trim() === '')

export function buildReadiness(state: AssessmentLike): ReadinessVerdict {
  const a = state.assessor || {}
  const s = state.source || {}
  const blockers: ReadinessBlocker[] = []

  // ── HARD (advisory) — identity + scope ──
  if (blank(a.a_name)) {
    blockers.push({ id: 'assessor_name', tier: 'hard', message: 'Assessor name and credentials are missing.', field: 'a_name', fixLocation: 'Assessor → name & credentials' })
  }
  if (blank(s.src_type)) {
    blockers.push({ id: 'source_type', tier: 'hard', message: 'Water source type is not recorded.', field: 'src_type', fixLocation: 'Water Source → source type' })
  }

  // ── DISMISSIBLE — provenance + data quality ──
  if (s.src_type === 'Public water system' && blank(s.src_pws)) {
    blockers.push({ id: 'pws_name', tier: 'dismissible', message: 'Public water system name is not recorded.', field: 'src_pws', fixLocation: 'Water Source → PWS name' })
  }
  // Litigation / regulatory DQO should carry a Level IV lab data package.
  const litigation = ['Litigation support', 'Regulatory response'].includes(s.dqo_purpose)
  if (litigation && !(s.dqo_data_pkg || '').includes('Level IV')) {
    blockers.push({ id: 'data_package_level', tier: 'dismissible', message: 'Litigation/regulatory DQO selected but the lab data package is below Level IV.', field: 'dqo_data_pkg', fixLocation: 'Data Quality → lab data package level' })
  }
  if (!Array.isArray(state.labResults) || state.labResults.length === 0) {
    blockers.push({ id: 'no_lab_results', tier: 'dismissible', message: 'No lab results have been entered — the report will be a field-only screening memo.', field: 'labResults', fixLocation: 'Lab Results → add results' })
  }
  // Field-meter values present but calibration status unrecorded.
  const hasFieldReadings = ['f_ph', 'f_chlorine', 'f_turbidity', 'f_temp'].some((k) => !blank(state.building?.[k]))
  if (hasFieldReadings && blank(state.building?.f_meter_cal)) {
    blockers.push({ id: 'meter_calibration', tier: 'dismissible', message: 'Field-meter readings recorded without a calibration status — qualitative-only without it.', field: 'f_meter_cal', fixLocation: 'Meter Calibration → calibration status' })
  }

  const ready = !blockers.some((b) => b.tier === 'hard')
  return { ready, blockers }
}
