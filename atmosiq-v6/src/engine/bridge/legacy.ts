/**
 * AtmosFlow v2.1 Bridge — Legacy Scoring → AssessmentScore
 *
 * Adapts output from src/engines/scoring.js (`scoreZone`, `compositeScore`)
 * into the v2.1 `AssessmentScore` shape consumed by `report.client()` and
 * `report.internal()`.
 *
 * Design notes:
 *  - The legacy engine is the source of truth for category scores, deductions,
 *    severity, sufficiency status, and tier mapping. The bridge does not
 *    re-score; it tags each legacy finding with a v2.1 ConditionType, looks
 *    up the phrase library for approved narrative, and runs the engine's
 *    permission evaluator to derive defensibility flags.
 *  - Per-finding `deductionInternal` is derived from severity (since the
 *    legacy engine reports total category deduction, not per-finding). The
 *    bridge attempts to match the category total when severity-based math
 *    aligns; otherwise it preserves severity ordering for the prioritization
 *    queue without overstating deduction.
 *  - Confidence/tier mapping is conservative: legacy 'Medium' confidence maps
 *    to 'provisional_screening_level' (the v2.1 tier that allows screening
 *    inferences but blocks definitive language).
 */

import type {
  AssessmentScore, AssessmentMeta, ZoneScore as V21ZoneScore, CategoryScore as V21CategoryScore,
  Finding, FindingId, ZoneId, CategoryName, Tier, Severity,
  CIHConfidenceTier, EvidenceBasis, EvidenceBasisKind,
  SamplingAdequacyEvaluation, InstrumentAccuracyOutcome, RecommendedAction,
  DefensibilityFlags, ProfessionalOpinionTier,
} from '../types/domain'
import type {
  ZoneScore as LegacyZoneScore, CompositeScore as LegacyComposite,
  CategoryScore as LegacyCategoryScore, Finding as LegacyFinding, ZoneData, BuildingData, PresurveyData,
} from '../../types/assessment'
import { lookupPhrase } from '../report/phrases/index'
import { evaluatePermissions } from '../report/permissions'
import { evaluateZoneOpinion } from '../report/professional-opinion'
import { classifyCondition } from './classify'

// ── Public API ──

export interface BridgeContext {
  readonly meta: AssessmentMeta
  readonly presurvey?: PresurveyData
  readonly building?: BuildingData
}

export interface BridgeOptions {
  readonly idPrefix?: string
}

export function legacyToAssessmentScore(
  legacyZoneScores: ReadonlyArray<LegacyZoneScore>,
  legacyComposite: LegacyComposite | null,
  zonesData: ReadonlyArray<ZoneData>,
  ctx: BridgeContext,
  options: BridgeOptions = {},
): AssessmentScore {
  const idPrefix = options.idPrefix ?? 'F'
  let findingCounter = 0
  const nextFindingId = (): FindingId => `${idPrefix}-${String(++findingCounter).padStart(4, '0')}` as FindingId

  const zones: V21ZoneScore[] = legacyZoneScores.map((lz, i) => {
    const zoneData = zonesData[i] ?? {}
    const zoneId = `Z-${String(i + 1).padStart(3, '0')}` as ZoneId
    return mapZone(lz, zoneData, zoneId, nextFindingId)
  })

  const siteScore = legacyComposite?.tot ?? null
  const siteTier = mapTier(legacyComposite?.risk ?? null, siteScore)
  const confidenceBand = mapConfidence(legacyComposite?.confidence ?? deriveWorstZoneConfidence(zones))
  const confidenceValue = mapConfidenceValue(confidenceBand)
  const defensibilityFlags = computeDefensibilityFlags(zones, zonesData, ctx)

  return {
    siteScore,
    siteTier,
    zones,
    confidenceValue,
    confidenceBand,
    defensibilityFlags,
    meta: ctx.meta,
  }
}

// ── Zone Mapping ──

function mapZone(
  lz: LegacyZoneScore,
  zoneData: ZoneData,
  zoneId: ZoneId,
  nextFindingId: () => FindingId,
): V21ZoneScore {
  const categories: V21CategoryScore[] = lz.cats.map(cat =>
    mapCategory(cat, zoneData, zoneId, nextFindingId),
  )
  const composite = lz.tot
  const tier = mapTier(lz.risk, lz.tot)
  const confidence = mapConfidence(lz.confidence)
  const zoneScore: V21ZoneScore = {
    zoneId,
    zoneName: lz.zoneName || 'Zone',
    composite,
    tier,
    confidence,
    categories,
    professionalOpinion: 'no_significant_concerns_identified', // placeholder, computed below
  }
  return {
    ...zoneScore,
    professionalOpinion: evaluateZoneOpinion(zoneScore),
  }
}

// ── Category Mapping ──

const CATEGORY_NAME_MAP: Record<string, CategoryName> = {
  Ventilation: 'Ventilation',
  Contaminants: 'Contaminants',
  HVAC: 'HVAC',
  Complaints: 'Complaints',
  Environment: 'Environment',
}

function mapCategory(
  cat: LegacyCategoryScore,
  zoneData: ZoneData,
  zoneId: ZoneId,
  nextFindingId: () => FindingId,
): V21CategoryScore {
  const category = CATEGORY_NAME_MAP[cat.l] ?? 'Environment'
  const status = mapCategoryStatus(cat)
  const rawScoreNum = cat.s ?? 0
  const cappedScoreNum = cat.capped ? Math.min(cat.s ?? 0, cat.mx) : rawScoreNum
  const sufficiencyRatio = cat.sufficiency?.sufficiency ?? (cat.s !== null ? 1 : 0)

  const findings: Finding[] = (cat.r ?? [])
    .filter(f => f.t && f.t.trim().length > 0)
    .map(legacyF => mapFinding(legacyF, category, zoneData, zoneId, cat, nextFindingId()))

  return {
    category,
    rawScore: rawScoreNum,
    cappedScore: cappedScoreNum,
    maxScore: cat.mx,
    status,
    findings,
    sufficiencyRatio,
  }
}

function mapCategoryStatus(cat: LegacyCategoryScore): V21CategoryScore['status'] {
  if (cat.suppressed || cat.status === 'SUPPRESSED') return 'suppressed'
  if (cat.status === 'INSUFFICIENT') return 'insufficient'
  if (cat.status === 'DATA_GAP') return 'data_gap'
  return 'scored'
}

// ── Finding Mapping ──

const SEVERITY_DEDUCTION: Record<Severity, number> = {
  critical: 15,
  high: 10,
  medium: 5,
  low: 2,
  pass: 0,
  info: 0,
}

// v2.2 §1a — observational ConditionTypes whose `severityInternal` MUST be
// capped at 'high'. Critical is reserved for measured exceedances of
// regulatory limits with documented evidence basis. Visual / olfactory /
// occupant-report findings cannot reach 'critical' because the rollup in
// professional-opinion.ts treats severity=critical as sufficient by itself
// to land at conditions_warrant_corrective_action — a tier that should
// require documented measurement, not observation.
const OBSERVATIONAL_CONDITION_TYPES: ReadonlySet<string> = new Set([
  'apparent_microbial_growth',
  'objectionable_odor',
  'possible_corrosive_environment',
  'particle_screening_only',
  'hvac_maintenance_overdue',
  'hvac_filter_loaded',
  'hvac_filter_below_recommended_class',
  'hvac_outdoor_air_damper_compromised',
  'hvac_drain_pan_microbial_reservoir',
  'occupant_symptoms_anecdotal',
  'occupant_cluster_anecdotal',
  'symptoms_resolve_away_from_building',
  'active_or_historical_water_damage',
  'ventilation_observational_only',
])

// v2.2 §1b — building-scoped ConditionTypes that describe building-level
// conditions (HVAC system, water management) and should render once at
// the building level rather than be exploded across every zone the
// system serves.
const BUILDING_SCOPED_CONDITION_TYPES: ReadonlySet<string> = new Set([
  'hvac_maintenance_overdue',
  'hvac_filter_loaded',
  'hvac_filter_below_recommended_class',
  'hvac_outdoor_air_damper_compromised',
  'hvac_drain_pan_microbial_reservoir',
])

function capObservationalSeverity(conditionType: string, sev: Severity): Severity {
  if (sev === 'critical' && OBSERVATIONAL_CONDITION_TYPES.has(conditionType)) {
    return 'high'
  }
  return sev
}

function deriveScope(conditionType: string): Finding['scope'] {
  if (BUILDING_SCOPED_CONDITION_TYPES.has(conditionType)) return 'hvac_system'
  return 'zone'
}

function mapFinding(
  legacyF: LegacyFinding,
  category: CategoryName,
  zoneData: ZoneData,
  zoneId: ZoneId,
  cat: LegacyCategoryScore,
  id: FindingId,
): Finding {
  const conditionType = classifyCondition(legacyF, category, zoneData)
  const phrase = lookupPhrase(conditionType)
  const evidenceBasis = inferEvidenceBasis(conditionType, legacyF, zoneData)
  const samplingAdequacy = inferSamplingAdequacy(conditionType, evidenceBasis.kind)
  const instrumentAccuracyConsidered = makeInstrumentAccuracyOutcome()

  // v2.2 §1a — cap observational severity before any downstream consumer
  // (deduction, confidence inference, rollup) sees a 'critical' that
  // shouldn't exist for visual/olfactory/occupant-report findings.
  const cappedSeverity = capObservationalSeverity(conditionType, legacyF.sev)
  const scope = deriveScope(conditionType)

  const confidenceTier = inferFindingConfidence(conditionType, { ...legacyF, sev: cappedSeverity }, evidenceBasis.kind, samplingAdequacy)

  // Build a draft finding with input claims; then run evaluatePermissions to harden.
  const claimsCausation = phrase.causationSupportRequires.length === 0 ||
    phrase.causationSupportRequires.every(req => req === evidenceBasis.kind)
  const claimsRegulatory = phrase.regulatoryConclusionRequires.length > 0 &&
    phrase.regulatoryConclusionRequires.every(req => req === evidenceBasis.kind)

  const observed = extractObserved(legacyF, conditionType, zoneData)

  const draft: Finding = {
    id,
    category,
    zoneId: scope === 'hvac_system' ? null : zoneId,
    scope,
    severityInternal: cappedSeverity,
    titleInternal: deriveTitle(legacyF, conditionType),
    observationInternal: legacyF.t,
    deductionInternal: SEVERITY_DEDUCTION[cappedSeverity],
    conditionType,
    confidenceTier,
    definitiveConclusionAllowed: false,
    causationSupported: claimsCausation && cappedSeverity !== 'pass' && cappedSeverity !== 'info',
    regulatoryConclusionAllowed: claimsRegulatory,
    approvedNarrativeIntent: phrase.intentTemplate,
    evidenceBasis,
    samplingAdequacy,
    instrumentAccuracyConsidered,
    limitations: phrase.defaultLimitations,
    recommendedActions: phrase.defaultRecommendedActions as ReadonlyArray<RecommendedAction>,
    thresholdSource: legacyF.std ?? deriveThresholdSourceFromPhrase(phrase.defaultRecommendedActions),
    observedValue: observed.value,
    thresholdValue: observed.threshold,
  }

  const permissions = evaluatePermissions(draft)
  return {
    ...draft,
    definitiveConclusionAllowed: permissions.definitiveConclusionAllowed,
    causationSupported: permissions.causationSupported,
    regulatoryConclusionAllowed: permissions.regulatoryConclusionAllowed,
  }
}

// ── Helper Inferences ──

function deriveTitle(f: LegacyFinding, conditionType: string): string {
  // Use up to first 80 chars of the legacy text; fall back to condition type.
  const t = f.t.replace(/\s+/g, ' ').trim()
  if (!t) return conditionType.replace(/_/g, ' ')
  if (t.length <= 80) return t
  return t.slice(0, 77).trimEnd() + '…'
}

function inferEvidenceBasis(
  conditionType: string,
  f: LegacyFinding,
  _zone: ZoneData,
): EvidenceBasis {
  let kind: EvidenceBasisKind = 'screening_grab'
  let rationale = 'Direct-reading screening measurement collected during walkthrough.'

  if (conditionType.startsWith('hvac_') || conditionType === 'apparent_microbial_growth' ||
      conditionType === 'objectionable_odor' || conditionType === 'possible_corrosive_environment' ||
      conditionType === 'particle_screening_only' || conditionType === 'active_or_historical_water_damage') {
    kind = 'visual_olfactory_screening'
    rationale = 'Visual or olfactory observation captured during walkthrough; no laboratory or instrument confirmation.'
  } else if (conditionType.startsWith('occupant_') || conditionType === 'symptoms_resolve_away_from_building') {
    kind = 'occupant_report_anecdotal'
    rationale = 'Occupant statements collected informally during the assessment, not via a structured survey instrument.'
  } else if (conditionType === 'pm_above_naaqs_documented' || conditionType === 'pm_indoor_amplification_screening') {
    kind = 'screening_continuous'
    rationale = 'Continuous direct-reading PM2.5 measurement collected during walkthrough.'
  } else if (conditionType === 'co_above_pel_documented' || conditionType === 'hcho_above_pel_documented') {
    // The bridge cannot promote a screening-grab to a documented 8hr TWA without
    // explicit chain-of-custody. Keep at screening_continuous to be conservative;
    // the validator will still permit phrase library content but block PEL claims.
    kind = 'screening_continuous'
    rationale = 'Direct-reading continuous measurement; not an OSHA 8-hour TWA. Bridge does not promote screening data to documented TWA without chain-of-custody evidence.'
  } else if (conditionType === 'tvoc_screening_elevated' || conditionType === 'hcho_screening_elevated' ||
             conditionType === 'co_screening_elevated' || conditionType === 'pm_screening_elevated') {
    kind = 'screening_continuous'
    rationale = 'Direct-reading screening measurement collected during walkthrough.'
  } else if (conditionType.startsWith('temperature_') || conditionType.startsWith('humidity_') ||
             conditionType.startsWith('ventilation_')) {
    kind = 'screening_continuous'
    rationale = 'Direct-reading screening measurement collected during walkthrough.'
  }

  const citationRefs = f.std ? [f.std] : []
  return { kind, rationale, citationRefs }
}

function inferSamplingAdequacy(
  conditionType: string,
  evidenceKind: EvidenceBasisKind,
): SamplingAdequacyEvaluation {
  if (evidenceKind === 'occupant_report_anecdotal') {
    return {
      forConclusion: false,
      forScreening: false,
      forHypothesis: true,
      rationale: ['Occupant feedback was collected informally; supports hypothesis generation only.'],
    }
  }
  if (evidenceKind === 'visual_olfactory_screening') {
    return {
      forConclusion: false,
      forScreening: false,
      forHypothesis: true,
      rationale: ['Visual or olfactory observation supports hypothesis and presence-of screening only.'],
    }
  }
  if (evidenceKind === 'screening_continuous' || evidenceKind === 'screening_grab') {
    return {
      forConclusion: false,
      forScreening: true,
      forHypothesis: true,
      rationale: ['Screening-level measurement supports inference at screening confidence; not adequate for definitive conclusion.'],
    }
  }
  if (evidenceKind === 'documented_8hr_twa' || evidenceKind === 'laboratory_speciation') {
    return {
      forConclusion: true,
      forScreening: true,
      forHypothesis: true,
      rationale: ['Documented full-shift sampling or laboratory analysis supports definitive conclusion.'],
    }
  }
  return {
    forConclusion: false,
    forScreening: false,
    forHypothesis: true,
    rationale: ['Default conservative adequacy: hypothesis only.'],
  }
}

function makeInstrumentAccuracyOutcome(): InstrumentAccuracyOutcome {
  return {
    checked: false,
    withinNoiseFloor: false,
    note: 'Instrument accuracy was not evaluated during legacy bridging. Findings treated as screening-level until instrument context is supplied.',
  }
}

function inferFindingConfidence(
  conditionType: string,
  f: LegacyFinding,
  evidenceKind: EvidenceBasisKind,
  sampling: SamplingAdequacyEvaluation,
): CIHConfidenceTier {
  if (f.sev === 'pass' || f.sev === 'info') {
    if (evidenceKind === 'visual_olfactory_screening' || evidenceKind === 'occupant_report_anecdotal') {
      return 'qualitative_only'
    }
    return 'provisional_screening_level'
  }
  if (sampling.forConclusion) return 'validated_defensible'
  if (sampling.forScreening) return 'provisional_screening_level'
  if (sampling.forHypothesis) return 'qualitative_only'
  return 'insufficient_data'
}

function deriveThresholdSourceFromPhrase(actions: ReadonlyArray<RecommendedAction>): string {
  const action = actions.find(a => a.standardReference)
  return action?.standardReference ?? 'AtmosFlow Engine v2.1 (consensus screening reference)'
}

function extractObserved(
  f: LegacyFinding,
  conditionType: string,
  zone: ZoneData,
): { value?: string; threshold?: string } {
  const text = f.t

  // CO2 — handle the "₂" subscript
  if (matches(text, ['co₂', 'co2'])) {
    const ppm = matchNumber(text, /(\d{2,5})\s*ppm/i)
    return { value: ppm ? `${ppm} ppm` : zone.co2 ? `${zone.co2} ppm` : undefined }
  }
  if (conditionType === 'co_above_pel_documented' || conditionType === 'co_screening_elevated') {
    const v = matchNumber(text, /([\d.]+)\s*ppm/i)
    return { value: v ? `${v} ppm` : zone.co ? `${zone.co} ppm` : undefined, threshold: '50 ppm (OSHA PEL)' }
  }
  if (conditionType === 'hcho_above_pel_documented' || conditionType === 'hcho_screening_elevated') {
    const v = matchNumber(text, /([\d.]+)\s*ppm/i)
    return { value: v ? `${v} ppm` : zone.hc ? `${zone.hc} ppm` : undefined, threshold: '0.75 ppm (OSHA PEL TWA)' }
  }
  if (conditionType.startsWith('pm_')) {
    const v = matchNumber(text, /([\d.]+)\s*µg\/m³/i)
    return { value: v ? `${v} µg/m³` : zone.pm ? `${zone.pm} µg/m³` : undefined, threshold: '35 µg/m³ (EPA NAAQS 24-hr)' }
  }
  if (conditionType === 'tvoc_screening_elevated') {
    const v = matchNumber(text, /([\d.]+)\s*µg\/m³/i)
    return { value: v ? `${v} µg/m³` : zone.tv ? `${zone.tv} µg/m³` : undefined }
  }
  if (conditionType.startsWith('temperature_')) {
    const v = matchNumber(text, /([\d.]+)\s*°?\s*F/i)
    return { value: v ? `${v}°F` : zone.tf ? `${zone.tf}°F` : undefined }
  }
  if (conditionType.startsWith('humidity_')) {
    const v = matchNumber(text, /([\d.]+)\s*%/)
    return { value: v ? `${v}%` : zone.rh ? `${zone.rh}%` : undefined }
  }
  return {}
}

function matchNumber(text: string, re: RegExp): string | null {
  const m = re.exec(text)
  return m ? m[1] : null
}

const matches = (text: string, needles: ReadonlyArray<string>): boolean => {
  const t = text.toLowerCase()
  return needles.some(n => t.includes(n.toLowerCase()))
}

// ── Confidence / Tier / Defensibility ──

function mapConfidence(legacy: string | undefined): CIHConfidenceTier {
  switch (legacy) {
    case 'High': return 'validated_defensible'
    case 'Medium': return 'provisional_screening_level'
    case 'Low': return 'qualitative_only'
    case 'Insufficient': return 'insufficient_data'
    default: return 'qualitative_only'
  }
}

function mapConfidenceValue(band: CIHConfidenceTier): number {
  switch (band) {
    case 'validated_defensible': return 1.0
    case 'provisional_screening_level': return 0.7
    case 'qualitative_only': return 0.4
    case 'insufficient_data': return 0.1
  }
}

function deriveWorstZoneConfidence(zones: ReadonlyArray<V21ZoneScore>): string {
  const order: Record<CIHConfidenceTier, number> = {
    validated_defensible: 3,
    provisional_screening_level: 2,
    qualitative_only: 1,
    insufficient_data: 0,
  }
  let worst: CIHConfidenceTier = 'validated_defensible'
  for (const z of zones) {
    if (order[z.confidence] < order[worst]) worst = z.confidence
  }
  return reverseConfidence(worst)
}

function reverseConfidence(tier: CIHConfidenceTier): string {
  switch (tier) {
    case 'validated_defensible': return 'High'
    case 'provisional_screening_level': return 'Medium'
    case 'qualitative_only': return 'Low'
    case 'insufficient_data': return 'Insufficient'
  }
}

function mapTier(legacy: string | null | undefined, score: number | null | undefined): Tier | null {
  if (score === null || score === undefined) return null
  if (!legacy) return null
  // Legacy emits the same labels we use, but defensively map known synonyms.
  switch (legacy) {
    case 'Critical': return 'Critical'
    case 'High Risk': return 'High Risk'
    case 'Moderate': return 'Moderate'
    case 'Low Risk': return 'Low Risk'
  }
  if (score < 40) return 'Critical'
  if (score < 60) return 'High Risk'
  if (score < 80) return 'Moderate'
  return 'Low Risk'
}

function computeDefensibilityFlags(
  zones: ReadonlyArray<V21ZoneScore>,
  zonesData: ReadonlyArray<ZoneData>,
  ctx: BridgeContext,
): DefensibilityFlags {
  const hasInstrumentData = zonesData.some(z =>
    !!(z.co2 || z.pm || z.co || z.hc || z.tv || z.tf || z.rh || z.cfm_person || z.ach),
  )
  const hasCalibrationRecords = !!(ctx.presurvey?.['ps_inst_iaq_cal'] || ctx.presurvey?.['ps_inst_iaq_cal_status'])
  const hasSufficientZoneCoverage = zones.length > 0 && zones.every(z => z.composite !== null)
  const assessorCerts = ctx.meta.preparingAssessor.credentials.map(c => c.toUpperCase())
  const hasQualifiedAssessor = ['CIH', 'CSP', 'PE', 'ROH'].some(c => assessorCerts.includes(c))
  const overallDefensible = hasInstrumentData && hasCalibrationRecords && hasSufficientZoneCoverage && hasQualifiedAssessor
  return {
    hasInstrumentData,
    hasCalibrationRecords,
    hasSufficientZoneCoverage,
    hasQualifiedAssessor,
    overallDefensible,
  }
}

// Re-export types from the public bridge surface.
export type { ConditionType } from '../types/domain'
