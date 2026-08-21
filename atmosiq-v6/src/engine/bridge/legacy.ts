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
import { computeParameterRanges, type LegacyZone } from '../report/parameter-ranges'
import type { LegacyZoneScoreLike } from '../report/parameter-verdicts'
import { deriveCausalChains } from '../causal-chains'
import { deriveHypotheses } from '../hypotheses'

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

  // v2.4 §2 — compute per-parameter range/average summaries from the
  // legacy zone-data so the renderer's Results section can emit
  // standards-anchored prose without re-walking the raw fields.
  //
  // The zone scores are passed so `withinStandards` reads the engine's own
  // findings instead of re-deriving them from a second set of thresholds.
  // That duplication is what let one report call the same 72 °F reading
  // both within and outside the ASHRAE 55 comfort range.
  const parameterRanges = computeParameterRanges(
    zonesData as unknown as ReadonlyArray<LegacyZone>,
    legacyZoneScores as unknown as ReadonlyArray<LegacyZoneScoreLike>,
  )

  // v2.6 §2 + §3 — invoke the diagnostic-reasoning passes so the
  // resulting AssessmentScore carries populated causalChains and
  // hypotheses arrays. Both engines are pure functions of (zones,
  // findings) / (zonesData, buildingData, findings); calling them
  // here means every consumer of legacyToAssessmentScore (bridge
  // tests, fixture renderer, runtime) gets the same contract.
  const allFindings = zones.flatMap(z => z.categories.flatMap(c => c.findings))
  const causalChains = deriveCausalChains(zones, allFindings)
  const hypotheses = deriveHypotheses({
    zonesData,
    buildingData: ctx.building ?? {},
    findings: allFindings,
    zones,
  })

  return {
    siteScore,
    siteTier,
    zones,
    confidenceValue,
    confidenceBand,
    defensibilityFlags,
    meta: ctx.meta,
    parameterRanges,
    legacyZonesData: zonesData,
    legacyBuilding: ctx.building ?? {},
    causalChains,
    hypotheses,
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

// ─── Qualitative-only flag propagation (Fix 5 / engine v2.7) ────────
// Findings derived from instruments not in the manufacturer-certified
// accuracy database carry confidenceTier === 'qualitative_only'. The
// flag is set upstream in src/engine/instruments/accuracy.ts; here we
// surface it at the rendering boundary by:
//   1. Appending a "(qualitative — not for regulatory comparison)"
//      qualifier after the first numeric+unit token in the narrative
//      intent.
//   2. Prepending a canonical limitation bullet so the per-finding
//      Limitations list explicitly states the qualitative status.
//
// The site-level range summary (parameter-prose summaryTemplate) is
// a multi-zone aggregation and is NOT augmented here — when the same
// parameter is qualitative in some zones and quantitative in others,
// a blanket flag at the site-level would be misleading. That case
// remains a TODO for v2.7.1.
const QUALITATIVE_QUALIFIER = ' (qualitative — not for regulatory comparison)'
const NUM_UNIT_REGEX = /\d+(?:\.\d+)?\s*(?:µg\/m³|mg\/m³|ppm|ppb|°F|°C|%)/
const QUALITATIVE_LIMITATION =
  'Finding derived from instrument(s) not in the manufacturer-certified accuracy database; values are qualitative only and not suitable for regulatory exposure comparison or compliance determination.'

function appendQualitativeQualifier(text: string): string {
  if (text.includes('(qualitative —')) return text
  const match = NUM_UNIT_REGEX.exec(text)
  if (!match) return text
  const insertAt = match.index + match[0].length
  return text.slice(0, insertAt) + QUALITATIVE_QUALIFIER + text.slice(insertAt)
}

/**
 * Build a rich narrative for PM2.5 indoor-amplification findings that
 * states absolute indoor and outdoor values, the computed I/O ratio,
 * the tier interpretation, and the Chen & Zhao 2011 citation inline.
 *
 * Returns null when zone data lacks the indoor or outdoor PM2.5
 * measurement, so callers fall back to the static phrase template.
 *
 * Tier interpretation thresholds:
 *   I/O ≤ 1.0       — no indoor source
 *   1.0 < I/O ≤ 2.0 — indoor source likely, monitoring recommended
 *   I/O > 2.0       — significant indoor source, investigation warranted
 */
function derivePmIORatioNarrative(zone: ZoneData): string | null {
  const indoor = zone.pm != null && zone.pm !== '' ? Number(zone.pm) : NaN
  const outdoor = zone.pmo != null && zone.pmo !== '' ? Number(zone.pmo) : NaN
  if (!Number.isFinite(indoor) || !Number.isFinite(outdoor) || outdoor <= 0) {
    return null
  }
  const ratio = Math.round((indoor / outdoor) * 100) / 100
  let interpretation: string
  if (ratio <= 1.0) {
    interpretation = 'The I/O ratio is at or below 1.0, consistent with no significant indoor particulate source (Chen & Zhao 2011).'
  } else if (ratio <= 2.0) {
    interpretation = `The I/O ratio is between 1.0 and 2.0, indicating indoor contribution above the outdoor baseline; continued monitoring is recommended (Chen & Zhao 2011).`
  } else {
    interpretation = 'The I/O ratio exceeds the 2.0 threshold commonly cited for significant indoor source contribution (Chen & Zhao 2011).'
  }
  return `Indoor PM2.5 ${indoor} µg/m³ vs. outdoor reference ${outdoor} µg/m³, indoor/outdoor ratio ${ratio.toFixed(2)}. ${interpretation}`
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

  // Pass/info findings represent parameters that were measured and
  // came back within applicable benchmarks. They carry no observed
  // condition (filtered out of zone display) and therefore should not
  // contribute follow-up recommendations either — otherwise a zone
  // with "No significant conditions identified" still renders 4–6
  // recommended actions, which is internally contradictory.
  // Phrase-library default actions only fire when severity is
  // significant.
  const isSignificant = cappedSeverity !== 'pass' && cappedSeverity !== 'info'
  // Propagate the parent finding's zoneId into each recommendation's
  // location. Building-scoped findings (e.g. hvac_system) populate
  // `system` instead of `zone_id`. The phrase library's default
  // actions are untouched; we wrap them with location data here.
  const actionLocation = scope === 'hvac_system'
    ? { system: 'HVAC system', zone_id: null, surface_or_asset: null, free_text: null }
    : { zone_id: zoneId as string, system: null, surface_or_asset: null, free_text: null }
  const recommendedActions: ReadonlyArray<RecommendedAction> = isSignificant
    ? (phrase.defaultRecommendedActions as ReadonlyArray<RecommendedAction>).map(a => ({
        ...a,
        location: a.location ?? actionLocation,
      }))
    : []

  // Build base narrative — PM I/O findings get rich numeric narrative,
  // others use the static phrase template.
  const baseNarrative = conditionType === 'pm_indoor_amplification_screening'
    ? (derivePmIORatioNarrative(zoneData) ?? phrase.intentTemplate)
    : phrase.intentTemplate

  // Qualitative-only propagation: when an instrument lacks accuracy
  // database coverage, every derived finding inherits the flag. The
  // rendered narrative gets an inline qualifier at the first numeric
  // value + unit pair; a canonical qualitative-only limitation is
  // prepended to the per-finding Limitations list.
  const isQualitativeFinding = confidenceTier === 'qualitative_only'
  const narrativeIntent = isQualitativeFinding
    ? appendQualitativeQualifier(baseNarrative)
    : baseNarrative
  const baseLimitations = phrase.defaultLimitations
  const limitations = isQualitativeFinding
    && !baseLimitations.some(l => l.startsWith('Finding derived from instrument(s) not in the manufacturer-certified'))
    ? [QUALITATIVE_LIMITATION, ...baseLimitations]
    : baseLimitations

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
    approvedNarrativeIntent: narrativeIntent,
    evidenceBasis,
    samplingAdequacy,
    instrumentAccuracyConsidered,
    limitations,
    recommendedActions,
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

/**
 * Measurement types the assessor can record, mapped to what they are.
 *
 * `meas_duration` is a Q_ZONE field the walkthrough already collects. Only
 * "Continuous logging" is continuous monitoring; everything else — a spot
 * check, a five-minute average — is a grab reading however long the
 * assessor stood there.
 */
/**
 * How the assessor recorded each zone's instrument readings.
 *
 * Every instrument-read condition used to be hardcoded to
 * `screening_continuous` with the rationale "Direct-reading measurement
 * collected during walkthrough" — a sentence that describes a grab
 * reading while labelling it continuous. `pm_above_naaqs_documented`
 * carried it further and told the reader the finding was "supported by
 * continuous monitoring" when a single spot check was all anyone took.
 *
 * The zone record has known the answer all along: `meas_duration`. The
 * `zone` parameter was passed to `inferEvidenceBasis` and never read.
 *
 * `evaluatePermissions` blocked the downstream claims either way — only
 * `documented_8hr_twa` and `laboratory_speciation` unlock definitive,
 * causal or regulatory language — so the mislabel never opened the
 * compliance gate. It was still the report describing evidence it did
 * not have.
 *
 * The split is instantaneous vs. integrated, which is the distinction
 * `EvidenceBasisKind` actually draws. A 15-minute average is a logged
 * series, so calling it a grab reading is the same defect pointing the
 * other way — and it costs something real: `AVERAGING.min15` is
 * determinative from a continuous basis and only indicative from a grab
 * one, so a recorded STEL average would have been downgraded to
 * "indicative" against the STEL it was taken to evaluate.
 *
 * Keys are the verbatim `meas_duration` options from `questions.js`.
 * `evidence-basis.test.ts` asserts this table covers every one of them,
 * so adding an option to the questionnaire cannot silently fall through
 * to the unrecorded default.
 */
const MEASUREMENT_BASIS: Readonly<Record<string, { kind: EvidenceBasisKind; rationale: string }>> =
  Object.freeze({
    'Spot check (instantaneous)': {
      kind: 'screening_grab',
      rationale:
        'Direct-reading measurement collected during walkthrough; a single instantaneous reading, not a logged series.',
    },
    '5-minute average': {
      kind: 'screening_continuous',
      rationale:
        'Direct-reading measurement integrated over a 5-minute average during the walkthrough.',
    },
    '15-minute average': {
      kind: 'screening_continuous',
      rationale:
        'Direct-reading measurement integrated over a 15-minute average during the walkthrough.',
    },
    '1-hour average': {
      kind: 'screening_continuous',
      rationale:
        'Direct-reading measurement integrated over a 1-hour average during the walkthrough.',
    },
    'Continuous logging': {
      kind: 'screening_continuous',
      rationale: 'Continuous direct-reading measurement logged across the assessment period.',
    },
  })

/**
 * What the assessor recorded when `meas_duration` is absent. Treated as a
 * grab reading and said so plainly: an unrecorded measurement type is not
 * evidence of a logged series, and the field is skippable, so this is the
 * common case on legacy records rather than an edge case.
 */
const UNRECORDED_MEASUREMENT: { kind: EvidenceBasisKind; rationale: string } = Object.freeze({
  kind: 'screening_grab',
  rationale:
    'Direct-reading measurement collected during walkthrough; the measurement type was not recorded, so it is treated as a single reading rather than a logged series.',
})

function measurementBasis(zone: ZoneData): { kind: EvidenceBasisKind; rationale: string } {
  const recorded = String((zone as Record<string, unknown>)?.meas_duration ?? '')
  return MEASUREMENT_BASIS[recorded] ?? UNRECORDED_MEASUREMENT
}

function inferEvidenceBasis(
  conditionType: string,
  f: LegacyFinding,
  zone: ZoneData,
): EvidenceBasis {
  const { kind: instrumentKind, rationale: instrumentRationale } = measurementBasis(zone)

  let kind: EvidenceBasisKind = instrumentKind
  let rationale = instrumentRationale

  if (conditionType.startsWith('hvac_') || conditionType === 'apparent_microbial_growth' ||
      conditionType === 'objectionable_odor' || conditionType === 'active_or_historical_water_damage') {
    kind = 'visual_olfactory_screening'
    rationale = 'Visual or olfactory observation captured during walkthrough; no laboratory or instrument confirmation.'
  } else if (conditionType.startsWith('occupant_') || conditionType === 'symptoms_resolve_away_from_building') {
    kind = 'occupant_report_anecdotal'
    rationale = 'Occupant statements collected informally during the assessment, not via a structured survey instrument.'
  } else if (conditionType === 'co_above_pel_documented' || conditionType === 'hcho_above_pel_documented') {
    // The bridge cannot promote a direct reading to a documented 8-hour TWA
    // without chain-of-custody, whether or not it was logged. The basis stays
    // whatever the instrument actually produced; `evaluatePermissions` blocks
    // the PEL claim from either.
    kind = instrumentKind
    rationale = `${instrumentRationale} Not an OSHA 8-hour TWA: the bridge does not promote direct-reading data to a documented TWA without chain-of-custody evidence.`
  }
  // Every other instrument-read condition — PM, TVOC, HCHO, CO, temperature,
  // humidity, ventilation — keeps `instrumentKind`, which reflects what the
  // assessor recorded rather than what the condition type is called.

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
      rationale: ['Visual or olfactory observation supports hypothesis and presence only.'],
    }
  }
  if (evidenceKind === 'screening_continuous' || evidenceKind === 'screening_grab') {
    return {
      forConclusion: false,
      forScreening: true,
      forHypothesis: true,
      rationale: ['Direct-reading measurement supports inference at provisional confidence; not adequate for definitive conclusion.'],
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
    note: 'Instrument accuracy was not evaluated during legacy bridging. Findings treated as provisional until instrument context is supplied.',
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
  return action?.standardReference ?? 'AtmosFlow Engine v2.1 (consensus reference)'
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
