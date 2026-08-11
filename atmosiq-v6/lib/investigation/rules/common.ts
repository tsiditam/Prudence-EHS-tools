/**
 * AtmosFlow 3.0 — shared rule scaffolding (Stage 2).
 *
 * ZoneObservation mirrors the legacy zone field shape (terse keys) so the
 * Investigation Decision Framework consumes the SAME input the legacy engine
 * does — making it a true version-routed alternative, not a parallel data
 * model. Domain rule modules import these helpers to emit InvestigationFinding
 * objects deterministically (no Date.now / Math.random — ids and timestamps
 * come from context).
 */

import {
  ConfidenceReasonCode,
  DataQualityAssessment,
  EvidenceItem,
  EvidenceStrength,
  EvidenceType,
  FindingStatus,
  InvestigationDomain,
  InvestigationFinding,
  InvestigationPriority,
  NextAction,
  ReferenceAssessment,
  TechnicalCitation,
  AveragingPeriod,
} from '../types'
import { deriveConfidence } from '../confidence'

/** Legacy-shaped zone observation (terse keys, all optional). */
export interface ZoneObservation {
  zid?: string
  zn?: string
  su?: string // space use
  // ventilation
  cfm_person?: string | number
  ach?: string | number
  co2?: string | number
  co2o?: string | number
  sa?: string // supply airflow
  od?: string // OA damper
  // contaminants
  pm?: string | number
  pmo?: string | number
  co?: string | number
  hc?: string | number // formaldehyde
  tv?: string | number // TVOC
  tvo?: string | number
  op?: string // odor level
  ot?: string[] // odor types
  vd?: string // visible dust
  mi?: string // mold indicators
  // hvac
  hm?: string // maintenance
  fc?: string // filter condition
  fm?: string // filter class
  dp?: string // drain pan
  // thermal / environment
  tf?: string | number
  rh?: string | number
  tc?: string // thermal comfort
  hp?: string // humidity perception
  wd?: string // water damage
  wl?: string[]
  // occupant
  cx?: string // complaint status
  ac?: string // affected count
  sy?: string[] // symptoms
  sr?: string // symptom resolution
  cc?: string // clustering
  // sources / pathways
  src_adjacent?: string[]
  src_internal?: string[]
  path_pressure?: string
  path_crosstalk?: string
  // measurement context
  meas_duration?: string
  meas_occ?: string
  meas_conditions?: string
}

export interface InvestigationContext {
  engineVersion: string
  /** ISO timestamp stamped onto findings (injected for determinism). */
  now: string
  /** Instrument calibration status for direct measurements in this assessment. */
  calibrationStatus?: 'current' | 'expired' | 'unknown' | 'not_applicable'
  /** Whether instrument accuracy is known (in the accuracy database). */
  instrumentAccuracyKnown?: boolean
  /** Whether occupancy was documented (vs estimated). */
  occupancyDocumented?: boolean
}

export function num(v: string | number | undefined | null): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

export function present(v: unknown): boolean {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

let evidenceSeq = 0
/** Deterministic-ish evidence id scoped to a zone+parameter (stable within a run). */
export function evidenceId(zoneId: string, parameter: string): string {
  evidenceSeq += 1
  return `ev:${zoneId}:${parameter}:${evidenceSeq}`
}

export function measurementEvidence(
  zoneId: string,
  parameter: string,
  observation: string,
  ctx: InvestigationContext,
  opts: {
    type?: EvidenceType
    averagingPeriod?: AveragingPeriod
    durationMinutes?: number
    outdoorReferenceAvailable?: boolean
  } = {},
): EvidenceItem {
  return {
    id: evidenceId(zoneId, parameter),
    type: opts.type ?? EvidenceType.DIRECT_MEASUREMENT,
    source: 'field measurement',
    observation,
    zoneId,
    calibrationStatus: ctx.calibrationStatus,
    averagingPeriod: opts.averagingPeriod ?? AveragingPeriod.GRAB,
    samplingDurationMinutes: opts.durationMinutes,
    occupancyState: ctx.occupancyDocumented ? 'documented' : 'estimated',
    outdoorReferenceAvailable: opts.outdoorReferenceAvailable,
  }
}

export function observationEvidence(
  zoneId: string,
  parameter: string,
  observation: string,
  type: EvidenceType,
): EvidenceItem {
  return { id: evidenceId(zoneId, parameter), type, source: type, observation, zoneId }
}

/** Standard confidence reason codes contributed by instrument/context state. */
export function contextReasons(ctx: InvestigationContext): ConfidenceReasonCode[] {
  const r: ConfidenceReasonCode[] = []
  if (ctx.calibrationStatus === 'expired') r.push('INSTRUMENT_CALIBRATION_EXPIRED')
  if (ctx.calibrationStatus === 'unknown') r.push('INSTRUMENT_CALIBRATION_UNKNOWN')
  if (ctx.instrumentAccuracyKnown === false) r.push('INSTRUMENT_ACCURACY_UNKNOWN')
  if (ctx.occupancyDocumented === false) r.push('OCCUPANCY_ESTIMATED')
  return r
}

export interface FindingSpec {
  ruleId: string
  domain: InvestigationDomain
  parameter?: string
  observedCondition: string
  evidence: EvidenceItem[]
  evidenceStrength: EvidenceStrength
  dataQuality: DataQualityAssessment
  referenceAssessment?: ReferenceAssessment
  findingStatus: FindingStatus
  confidenceReasons: ConfidenceReasonCode[]
  investigationPriority: InvestigationPriority
  limitations: string[]
  prohibitedInterpretations: string[]
  recommendedNextActions: NextAction[]
  citations: TechnicalCitation[]
  professionalReviewRequired: boolean
}

let findingSeq = 0
export function buildFinding(zoneId: string, ctx: InvestigationContext, spec: FindingSpec): InvestigationFinding {
  findingSeq += 1
  return {
    id: `${spec.ruleId}:${zoneId}:${findingSeq}`,
    ruleId: spec.ruleId,
    engineVersion: ctx.engineVersion,
    domain: spec.domain,
    parameter: spec.parameter,
    observedCondition: spec.observedCondition,
    evidence: spec.evidence,
    evidenceStrength: spec.evidenceStrength,
    dataQuality: spec.dataQuality,
    referenceAssessment: spec.referenceAssessment,
    findingStatus: spec.findingStatus,
    confidence: deriveConfidence({ evidenceStrength: spec.evidenceStrength, reasons: spec.confidenceReasons }),
    confidenceReasons: Array.from(new Set(spec.confidenceReasons)),
    investigationPriority: spec.investigationPriority,
    limitations: spec.limitations,
    prohibitedInterpretations: spec.prohibitedInterpretations,
    recommendedNextActions: spec.recommendedNextActions,
    citations: spec.citations,
    professionalReviewRequired: spec.professionalReviewRequired,
    createdAt: ctx.now,
  }
}

let actionSeq = 0
export function nextAction(spec: Omit<NextAction, 'id'>): NextAction {
  actionSeq += 1
  return { id: `act:${actionSeq}`, ...spec }
}

/** Reset internal sequence counters (call at the start of an assessment for stable ids). */
export function resetSequences(): void {
  evidenceSeq = 0
  findingSeq = 0
  actionSeq = 0
}
