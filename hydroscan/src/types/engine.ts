/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Shared type surface for the HydroScan water-quality engine. The engine
 * is screening-only: it flags risk indicators and composes sampling /
 * remediation guidance, but never issues a regulatory compliance
 * determination. Tiers are advisory.
 */

export type Tier = 'compliant' | 'monitor' | 'advisory' | 'immediate'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'pass' | 'info'

/** A single regulatory / advisory exceedance attached to a finding. */
export interface Violation {
  std: string
  threshold: string
  desc: string
  severity: Severity
}

export type Advisory = Violation

/** A standards parameter record from src/constants/standards.js. */
export interface Param {
  id: string
  name: string
  unit: string
  cat: string
  health?: string
  mcl?: number | string | null
  mclg?: number | null
  al?: number | null
  mrdl?: number | null
  smcl?: number | { min: number; max: number } | null
  who?: number | string | { min: number; max: number } | null
  healthAdv?: number | null
  epaAdv?: number | null
  crc?: string | null
  acute?: boolean
  pfasHI?: boolean
  hiDenom?: number
  [key: string]: unknown
}

/** A lab result entered by the assessor. */
export interface LabResult {
  id: string
  value: number | string | null
  unit?: string
  qualifier?: string | null
}

/** The evaluated outcome for one parameter. */
export interface Finding {
  param: Param
  value: number | string
  qualifier: string | null
  violations: Violation[]
  advisories: Advisory[]
  notes: string[]
  // Defensibility propagation (Phase 3): every finding is screening-level;
  // field-meter-derived values (pH, chlorine read in the field vs. lab) are
  // additionally flagged qualitative-only so the report can caveat them.
  screening_only?: boolean
  qualitative_only?: boolean
}

/** A state-program exceedance surfaced by the state-limit overlay. */
export interface StateExceedance {
  state: string
  program: string
  parameter: string
  value: number
  stateLimit: number
  unit: string
  stricterThanFederal: boolean
}

export interface ComplianceResult {
  findings: Finding[]
  tier: Tier
}

/** A causal-chain hypothesis linking field observations to lab findings. */
export interface CausalChain {
  type: string
  evidence: string[]
  confidence: 'Strong' | 'Moderate' | 'Preliminary'
  /** Weighted-evidence score (0–1) behind the confidence label. */
  confidenceScore?: number
  /** What additional data would raise confidence (screening transparency). */
  dataGaps?: string[]
  severity: Severity
  recommendation: string
}

/** One recommended sampling event. */
export interface SamplingPlanItem {
  test: string
  method: string
  params: string
  trigger: string
  hold: string
  notes: string
  std: string
}

export interface Recommendations {
  immediate: string[]
  shortTerm: string[]
  longTerm: string[]
  monitoring: string[]
}
