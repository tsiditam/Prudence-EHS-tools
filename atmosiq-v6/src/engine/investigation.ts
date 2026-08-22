/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow — Investigation Engine
 *
 * ── What it answers ────────────────────────────────────────────────────
 * The scoring engine answers "what did we measure, and is it out of
 * range". The hypothesis engine answers "what conditions could explain
 * it". Neither answers the question an investigator actually asks in the
 * field:
 *
 *     Two explanations are still standing. Which single measurement
 *     tells them apart, and should I take it before I leave?
 *
 * That is this file. It reads what the other engines already decided and
 * arranges it into an investigation: which differentials are live, what
 * evidence bears on each, which test discriminates between the leaders,
 * what is still unknown, and the one next step that moves the
 * investigation furthest.
 *
 * ── What it must never do ──────────────────────────────────────────────
 * It derives no verdicts of its own. Every claim traces to a layer that
 * already published it:
 *
 *   • Differentials      ← deriveHypotheses()      (engine §3, 6 rules)
 *   • Per-parameter fact ← computeParameterRanges() which reads the
 *                          engine's own findings via parameter-verdicts
 *   • Root causes        ← the causal chains the app and report print
 *   • Confirmatory work  ← the sampling plan the report prints, verbatim
 *
 * There is no threshold in this file and there must never be one. A
 * threshold here would be a second opinion, and the platform has already
 * paid for those: a hardcoded comfort band in a renderer once reported
 * the same 72 °F reading as both within and outside ASHRAE 55 in one
 * document. The same discipline applies to hypothesis NAMES — the app
 * shows causal-chain labels, the report shows §3 hypothesis names, and
 * the sampling plan carries its own one-line hypothesis per item. This
 * file maps the first and third onto the second rather than minting a
 * fourth vocabulary, and `tests/engine/investigation.test.ts` fails if a
 * chain type or sampling type is added without a mapping.
 *
 * ── Purity ─────────────────────────────────────────────────────────────
 * `deriveInvestigation` is a pure function of its input. Nothing is
 * cached, stored, or carried between calls. That is deliberate: an agent
 * that remembers its own hypothesis list drifts away from the engine, and
 * a drifting agent is a contradicting agent. Callers recompute.
 */

import { deriveHypotheses, ruleKeyOf, type HypothesisRuleKey } from './hypotheses'
import {
  computeParameterRanges, LEGACY_FIELD,
  type LegacyZone, type ParameterKey, type ParameterRange, type ParameterRangeSet,
} from './report/parameter-ranges'
import type { LegacyZoneScoreLike } from './report/parameter-verdicts'
import type { CIHConfidenceTier, Hypothesis } from './types/domain'

// ── Public types ──────────────────────────────────────────────────────

/** Where the investigation currently stands. */
export type InvestigationStage =
  /** No scored assessment is loaded — nothing to reason over. */
  | 'no_assessment'
  /** Scored, but no differential fired. Nothing is being investigated. */
  | 'no_active_differential'
  /** Differentials are live and no measurement bears on any of them yet. */
  | 'screening'
  /** Two or more differentials remain live. A discriminating test applies. */
  | 'differential'
  /** One differential leads and the rest are measurement-negative. */
  | 'converging'
  /** A root cause has been synthesized and no discriminating test is open. */
  | 'concluded'

/**
 * How the measurements bear on one differential. Deliberately about
 * MEASUREMENT only: every hypothesis here already has observational
 * support, or the §3 rule would not have fired it.
 */
export type HypothesisEvidenceStatus =
  | 'supported_by_measurement'
  | 'mixed_measurement_support'
  | 'untested'
  | 'not_supported_by_measurement'

export type EvidenceDirection = 'supports' | 'opposes'
export type EvidenceSource = 'measurement' | 'observation' | 'causal_chain'

export interface InvestigationEvidence {
  readonly direction: EvidenceDirection
  readonly source: EvidenceSource
  readonly statement: string
}

export interface InvestigationHypothesis {
  readonly id: string
  readonly ruleKey: HypothesisRuleKey
  readonly name: string
  readonly status: HypothesisEvidenceStatus
  /** True for the single highest-ranked differential; absent on ties. */
  readonly leading: boolean
  /** The zones whose observations raised this explanation. */
  readonly zones: ReadonlyArray<string>
  readonly evidence: ReadonlyArray<InvestigationEvidence>
  readonly supportCount: number
  readonly opposeCount: number
  /** Parameters that bear on this differential and are not yet measured. */
  readonly untestedParameters: ReadonlyArray<ParameterKey>
  /** Confidence in the hypothesis itself, from the §3 rule that fired it. */
  readonly cihConfidenceTier: CIHConfidenceTier
  /** Root-cause statements the causal-chain engine attributed to it. */
  readonly rootCauses: ReadonlyArray<string>
}

export interface DiscriminatingTest {
  /** The two differential names the result separates. */
  readonly between: readonly [string, string]
  readonly parameter: string
  readonly method: string
  readonly controls: string | null
  readonly standard: string | null
  /** What each outcome would mean. Stated in terms of both differentials. */
  readonly discriminates: string
  readonly source: 'sampling_plan' | 'hypothesis_sampling'
}

export interface OpenQuestion {
  readonly id: string
  readonly question: string
  readonly whyItMatters: string
  /** Names of the differentials this question is blocking. */
  readonly blocks: ReadonlyArray<string>
  /**
   * The legacy field ids that would answer this question, resolved through the
   * SAME `LEGACY_FIELD` map the ranges use.
   *
   * Exposed so a caller can turn a question into the field to ask for without
   * re-deriving the mapping. A second copy of it is how a parameter ends up
   * reported as untested in one place and within range in another — the defect
   * `parameter-ranges.ts` already documents on this map.
   *
   * Empty when the question is not about a single measurable field: the
   * outdoor-baseline gaps come verbatim from the sampling plan and name a
   * comparison, not a field.
   */
  readonly fields: ReadonlyArray<string>
}

export interface NextStep {
  readonly action: string
  readonly why: string
  readonly source: 'discriminating_test' | 'sampling_plan' | 'hypothesis_sampling' | 'open_question'
}

export interface InvestigationState {
  readonly stage: InvestigationStage
  /** Ranked most-supported first. */
  readonly hypotheses: ReadonlyArray<InvestigationHypothesis>
  readonly discriminatingTests: ReadonlyArray<DiscriminatingTest>
  readonly openQuestions: ReadonlyArray<OpenQuestion>
  readonly nextStep: NextStep | null
  /** One sentence explaining the stage. Safe to quote to the assessor. */
  readonly rationale: string
  /**
   * Causal chains that describe a pathway rather than one of the six §3
   * differentials — carried verbatim so nothing the app shows disappears
   * here, without inventing a seventh hypothesis to hold it.
   */
  readonly additionalConsiderations: ReadonlyArray<{
    readonly label: string
    readonly rootCause: string
    readonly zone: string | null
  }>
}

// ── Input ─────────────────────────────────────────────────────────────

/** The causal-chain shape emitted by src/engines/causalChains.js. */
export interface CausalChainLike {
  readonly zone?: unknown
  readonly type?: unknown
  readonly rootCause?: unknown
  readonly evidence?: unknown
  readonly confidence?: unknown
}

/** One row of the plan emitted by src/engines/sampling.js. */
export interface SamplingPlanItemLike {
  readonly zone?: unknown
  readonly type?: unknown
  readonly priority?: unknown
  readonly hypothesis?: unknown
  readonly method?: unknown
  readonly controls?: unknown
  readonly standard?: unknown
}

export interface SamplingPlanLike {
  readonly plan?: ReadonlyArray<SamplingPlanItemLike>
  readonly outdoorGaps?: ReadonlyArray<string>
}

export interface InvestigationInput {
  readonly zonesData: ReadonlyArray<LegacyZone>
  readonly buildingData?: Readonly<Record<string, unknown>>
  /** Legacy per-zone scores. Without them no measurement verdict exists. */
  readonly zoneScores?: ReadonlyArray<LegacyZoneScoreLike>
  readonly samplingPlan?: SamplingPlanLike | null
  readonly causalChains?: ReadonlyArray<CausalChainLike> | null
}

// ── Caps ──────────────────────────────────────────────────────────────
// The state travels in Jasper's system-context block on every turn, so it
// is bounded by construction rather than by whatever the data happens to
// produce. Caps apply uniformly, so the summary a reader sees and the
// object a tool returns are the same object — never two views that can
// disagree about which evidence mattered.

const MAX_EVIDENCE_PER_HYPOTHESIS = 4
const MAX_OBSERVATIONS_PER_HYPOTHESIS = 2
const MAX_DISCRIMINATING_TESTS = 2
const MAX_OPEN_QUESTIONS = 5
const MAX_ROOT_CAUSES_PER_HYPOTHESIS = 2
/**
 * Zone names an open question spells out before it starts counting
 * instead. A readability cap on a list, not a threshold on anything —
 * the no-magnitude guard in the test reads comparisons, so this is named
 * rather than written inline.
 */
const MAX_NAMED_ZONES_IN_QUESTION = 3

// ── Rule → evidence mapping ───────────────────────────────────────────

/**
 * Which measured parameters bear on each differential. Temperature is
 * deliberately absent: it is a comfort parameter, and no §3 differential
 * turns on it.
 */
const RULE_PARAMETERS: Record<HypothesisRuleKey, ReadonlyArray<ParameterKey>> = {
  hyp_ventilation: ['co2'],
  hyp_bioaerosol: ['rh'],
  hyp_voc: ['tvoc', 'hcho'],
  hyp_particulate: ['pm25'],
  hyp_combustion: ['co'],
}

/**
 * Every `type` label src/engines/causalChains.js can emit, mapped to the
 * §3 differential it describes. `null` means the chain describes a
 * pathway rather than a differential — it is surfaced verbatim under
 * `additionalConsiderations` instead of being forced into a rule.
 */
const CHAIN_TYPE_TO_RULE: Readonly<Record<string, HypothesisRuleKey | null>> = {
  'Ventilation Deficiency': 'hyp_ventilation',
  'Ventilation Deficiency (Hypothesis)': 'hyp_ventilation',
  'Microbial / Bioaerosol (Hypothesis)': 'hyp_bioaerosol',
  'Moisture / Biological': 'hyp_bioaerosol',
  'VOC Source (Hypothesis)': 'hyp_voc',
  'Chemical Exposure': 'hyp_voc',
  'Cross-Contamination Pathway': null,
  // Both pressurization chains describe a PATHWAY — how outdoor air
  // reaches the space — rather than a differential about what is in it.
  // They are surfaced verbatim under `additionalConsiderations`, which
  // is the right place for the consolidating one in particular: it
  // exists to say that several differentials already in the report may
  // share an explanation, so forcing it into one of them would undo it.
  'Building Pressurization (Mechanism)': null,
  'Building Pressurization — Not Evaluated': null,
}

/**
 * Every `type` label src/engines/sampling.js can emit, mapped to the §3
 * differential the sample would bear on. Used so the next step Jasper
 * proposes is an item the report already prints, word for word.
 */
const SAMPLING_TYPE_TO_RULE: Readonly<Record<string, HypothesisRuleKey>> = {
  Bioaerosol: 'hyp_bioaerosol',
  'Moisture / Bioaerosol': 'hyp_bioaerosol',
  'Hidden Bioaerosol': 'hyp_bioaerosol',
  Formaldehyde: 'hyp_voc',
  'VOC Speciation': 'hyp_voc',
  'Sewer Gas': 'hyp_voc',
  'Combustion Gas': 'hyp_combustion',
}

/**
 * Reader-facing parameter names. Editorial — no threshold semantics.
 *
 * Exported because the readiness gaps quote untested parameters back to
 * the assessor, and "the measurement that bears on it — co — was not
 * taken" is an internal key leaking into a sentence a professional reads.
 * One label map, not two.
 */
export const PARAMETER_LABEL: Record<ParameterKey, string> = {
  co2: 'carbon dioxide',
  co: 'carbon monoxide',
  hcho: 'formaldehyde',
  tvoc: 'total VOCs',
  pm25: 'PM2.5',
  pm10: 'PM10',
  temperature: 'temperature',
  rh: 'relative humidity',
}

/**
 * What each parameter settles, in the assessor's terms. Used to write the
 * `discriminates` sentence. These describe what the measurement MEANS,
 * not where its threshold sits — the threshold belongs to the criterion
 * registry and is never restated here.
 */
const PARAMETER_MEANING: Record<ParameterKey, string> = {
  co2: 'Carbon dioxide read against an outdoor reference at peak occupancy shows whether outdoor-air delivery is keeping up with the occupant load. A contaminant source does not move it.',
  co: 'Carbon monoxide is specific to combustion. Nothing else in a commercial building produces it.',
  hcho: 'Formaldehyde measured on its own separates a single dominant off-gassing source from a general VOC mixture.',
  tvoc: 'Total VOCs, then speciation, names the compound present — and the compound points at the material or process producing it.',
  pm25: 'PM2.5 measured indoors and outdoors at the same time separates a particulate source inside the building from ambient air drawn through the intake.',
  pm10: 'PM10 captures the coarse fraction that settles quickly, which points to a nearby source rather than one carried in on the air.',
  temperature: 'Temperature bears on comfort complaints rather than on any contaminant differential.',
  rh: 'Sustained relative humidity establishes whether the space can support fungal growth at all.',
}

/**
 * How to measure each parameter directly. These name the method, never a
 * threshold — the threshold belongs to the criterion registry.
 *
 * This table exists because the first version reached into the leading
 * hypothesis's `suggestedSampling` and fuzzy-matched on the parameter
 * name. When nothing matched it fell back to the first entry, which told
 * an assessor to measure relative humidity with an Andersen impactor. A
 * method is not interchangeable with another method that happens to sit
 * nearby in the same list.
 */
const PARAMETER_METHOD: Record<ParameterKey, string> = {
  co2: 'NDIR direct-reading instrument, read indoors and at the outdoor-air intake at peak occupancy (the ASHRAE 62.1 surrogate approach).',
  co: 'Electrochemical direct-reading instrument, logged at one-minute resolution in the occupied zone.',
  hcho: 'NIOSH Method 2016 — DNPH cartridge with HPLC analysis.',
  tvoc: 'PID survey to locate the source, then EPA Method TO-17 sorbent tube with GC/MS for speciation.',
  pm25: 'Optical aerosol monitor indoors and outdoors at the same time, with gravimetric verification per NIOSH 0600 if the result will be challenged.',
  pm10: 'Optical aerosol monitor indoors and outdoors at the same time, sized for the coarse fraction.',
  temperature: 'Calibrated thermometer at seated occupant height, per ASHRAE 55 measurement practice.',
  rh: 'Calibrated thermohygrometer logged across an occupied cycle rather than read once.',
}

/** What the reading needs alongside it to mean anything. Null where none. */
const PARAMETER_CONTROL: Record<ParameterKey, string | null> = {
  co2: 'Concurrent outdoor reading at the intake — the differential, not the absolute, is what bears on outdoor-air delivery.',
  co: 'Concurrent outdoor reading, and map the gradient toward any suspected source (parking structure, loading dock, boiler room).',
  hcho: 'Concurrent outdoor sample. Note any recent furniture, carpet, or composite-wood installation.',
  tvoc: 'Concurrent outdoor sample. A PID cannot identify individual compounds — naming them requires the laboratory method.',
  pm25: 'Concurrent outdoor sample. The indoor-to-outdoor ratio is what separates an indoor source from ambient air drawn in.',
  pm10: 'Concurrent outdoor sample, taken at the same time as the indoor reading.',
  temperature: null,
  rh: 'Log across an occupied cycle. A single reading cannot establish whether the condition is sustained.',
}

/** Sampling priority order, worst first. */
const PRIORITY_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }

/** Rank used to order the differentials. Higher leads. */
const STATUS_RANK: Record<HypothesisEvidenceStatus, number> = {
  supported_by_measurement: 3,
  mixed_measurement_support: 2,
  untested: 1,
  not_supported_by_measurement: 0,
}

const CONFIDENCE_RANK: Record<string, number> = {
  validated_defensible: 3,
  provisional_screening_level: 2,
  qualitative_only: 1,
  insufficient_data: 0,
}

/** Statuses that keep a differential in play. */
const LIVE_STATUSES: ReadonlySet<HypothesisEvidenceStatus> = new Set<HypothesisEvidenceStatus>([
  'supported_by_measurement',
  'mixed_measurement_support',
  'untested',
])

// ── Small readers ─────────────────────────────────────────────────────

const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

const hasField = (zones: ReadonlyArray<LegacyZone>, field: string): boolean =>
  zones.some((z) => z && z[field] !== undefined && z[field] !== '' && z[field] !== null)

/** True when the parameter was recorded in at least one zone. */
function wasMeasured(zones: ReadonlyArray<LegacyZone>, param: ParameterKey): boolean {
  return LEGACY_FIELD[param].some((f) => hasField(zones, f))
}

function rangePhrase(range: ParameterRange): string {
  const span = range.low === range.high
    ? `${range.low} ${range.unit}`
    : `${range.low}–${range.high} ${range.unit}`
  return range.outdoorReference !== undefined
    ? `${span} (outdoor reference ${range.outdoorReference} ${range.unit})`
    : span
}

/**
 * Say what the engine flagged, and where, without letting the site-wide
 * range stand in for the flagged reading.
 *
 * The first version wrote "flagged carbon dioxide in Suite 200 at
 * 400–1450 ppm" when two zones were measured and only one was flagged.
 * Both halves were true and the sentence was not: the 400 belonged to the
 * zone the engine had cleared. Where the flag covers a subset, the range
 * is labelled as the site's rather than the finding's.
 */
function flaggedStatement(label: string, range: ParameterRange): string {
  const zones = range.elevatedInZones ?? []
  const span = rangePhrase(range)
  if (zones.length === 0) return `The engine flagged ${label}. Site readings ran ${span}.`
  if (range.count === 1) return `The engine flagged ${label} in ${zones[0]} at ${span}.`
  if (zones.length >= range.count) {
    return `The engine flagged ${label} in all ${range.count} zones measured, at ${span}.`
  }
  return `The engine flagged ${label} in ${zones.join(', ')}. Across the ${range.count} zones measured it ran ${span}.`
}

// ── Evidence assembly ─────────────────────────────────────────────────

interface Assembled {
  readonly evidence: InvestigationEvidence[]
  readonly supportCount: number
  readonly opposeCount: number
  readonly untested: ParameterKey[]
  readonly status: HypothesisEvidenceStatus
}

/**
 * Turn the engine's per-parameter verdicts into evidence for or against
 * one differential. `withinStandards` is the engine's own reading of its
 * own findings — this function decides direction, never magnitude.
 */
function assembleEvidence(
  ruleKey: HypothesisRuleKey,
  hypothesis: Hypothesis,
  /** Ranges computed over the hypothesis's OWN zones, never the site. */
  ranges: ParameterRangeSet,
  /** The same subset, for telling "never measured" from "measured, clear". */
  zonesData: ReadonlyArray<LegacyZone>,
  rootCauses: ReadonlyArray<string>,
): Assembled {
  const supports: InvestigationEvidence[] = []
  const opposes: InvestigationEvidence[] = []
  const untested: ParameterKey[] = []
  let flagged = 0
  let cleared = 0

  for (const param of RULE_PARAMETERS[ruleKey]) {
    const range = ranges[param]
    if (!range || range.count === 0) {
      // Not in the range set at all: the value was never recorded.
      if (!wasMeasured(zonesData, param)) untested.push(param)
      continue
    }
    const label = PARAMETER_LABEL[param]
    if (range.withinStandards === null) {
      // Measured, but no engine output was supplied to interpret it. The
      // reading is not evidence in either direction — saying otherwise
      // would be this file forming its own opinion.
      untested.push(param)
      continue
    }
    if (range.withinStandards === false) {
      flagged += 1
      supports.push({
        direction: 'supports',
        source: 'measurement',
        statement: flaggedStatement(label, range),
      })
    } else {
      cleared += 1
      opposes.push({
        direction: 'opposes',
        source: 'measurement',
        statement: `Measured ${label} at ${rangePhrase(range)} carried no finding, so it does not support this explanation.`,
      })
    }
  }

  const status: HypothesisEvidenceStatus =
    flagged > 0 && cleared > 0 ? 'mixed_measurement_support'
      : flagged > 0 ? 'supported_by_measurement'
        : cleared > 0 ? 'not_supported_by_measurement'
          : 'untested'

  const observations: InvestigationEvidence[] = hypothesis.basis
    .slice(0, MAX_OBSERVATIONS_PER_HYPOTHESIS)
    .map((statement) => ({ direction: 'supports' as const, source: 'observation' as const, statement }))

  const chains: InvestigationEvidence[] = rootCauses
    .slice(0, MAX_ROOT_CAUSES_PER_HYPOTHESIS)
    .map((statement) => ({ direction: 'supports' as const, source: 'causal_chain' as const, statement }))

  // Measurement first: it is the most probative and the least likely to
  // be trimmed by the cap. Opposing evidence outranks observations for
  // the same reason — what argues AGAINST the reading is what an
  // investigator most needs to see.
  const evidence = [...supports, ...opposes, ...chains, ...observations]
    .slice(0, MAX_EVIDENCE_PER_HYPOTHESIS)

  return {
    evidence,
    supportCount: supports.length + chains.length + observations.length,
    opposeCount: opposes.length,
    untested,
    status,
  }
}

// ── Discriminating tests ──────────────────────────────────────────────

/**
 * Given the two leading differentials, find measurements that bear on
 * exactly one of them and have not been taken. Those are the tests whose
 * result changes the answer — a test both explanations predict equally
 * discriminates nothing, however defensible it is.
 */
function buildDiscriminatingTests(
  a: InvestigationHypothesis,
  b: InvestigationHypothesis,
  /** Ranges per hypothesis id — a test is about the owner's zones. */
  rangesById: ReadonlyMap<string, ParameterRangeSet>,
  planByRule: ReadonlyMap<HypothesisRuleKey, SamplingPlanItemLike[]>,
): DiscriminatingTest[] {
  const setA = new Set(RULE_PARAMETERS[a.ruleKey])
  const setB = new Set(RULE_PARAMETERS[b.ruleKey])
  const out: DiscriminatingTest[] = []

  for (const [owner, other, ownerSet, otherSet] of [
    [a, b, setA, setB] as const,
    [b, a, setB, setA] as const,
  ]) {
    for (const param of ownerSet) {
      if (otherSet.has(param)) continue
      const range = rangesById.get(owner.id)?.[param]
      const measured = !!range && range.count > 0 && range.withinStandards !== null
      if (measured) continue
      if (out.length >= MAX_DISCRIMINATING_TESTS) break
      out.push({
        between: [owner.name, other.name],
        parameter: PARAMETER_LABEL[param],
        method: PARAMETER_METHOD[param],
        controls: PARAMETER_CONTROL[param],
        standard: null,
        discriminates: `${PARAMETER_MEANING[param]} A flagged result supports "${owner.name}"; a result the engine does not flag weakens it and leaves "${other.name}" standing.`,
        source: 'hypothesis_sampling',
      })
    }
  }

  if (out.length >= MAX_DISCRIMINATING_TESTS) return out.slice(0, MAX_DISCRIMINATING_TESTS)

  // No unmeasured parameter separates them. Fall back to confirmatory
  // sampling the report already prescribes for exactly one of the two.
  for (const [owner, other] of [[a, b] as const, [b, a] as const]) {
    for (const item of planByRule.get(owner.ruleKey) ?? []) {
      if (out.length >= MAX_DISCRIMINATING_TESTS) break
      const type = asString(item.type)
      if ((planByRule.get(other.ruleKey) ?? []).some((i) => asString(i.type) === type)) continue
      out.push({
        between: [owner.name, other.name],
        parameter: type || 'Confirmatory sample',
        method: asString(item.method) || 'See the sampling plan for this item.',
        controls: asString(item.controls) || null,
        standard: asString(item.standard) || null,
        discriminates: `This sample bears on "${owner.name}" only; "${other.name}" predicts nothing about the result either way.`,
        source: 'sampling_plan',
      })
    }
  }

  return out.slice(0, MAX_DISCRIMINATING_TESTS)
}

// ── Open questions ────────────────────────────────────────────────────

function buildOpenQuestions(
  ranked: ReadonlyArray<InvestigationHypothesis>,
  zonesData: ReadonlyArray<LegacyZone>,
  outdoorGaps: ReadonlyArray<string>,
): OpenQuestion[] {
  const out: OpenQuestion[] = []
  const live = ranked.filter((h) => LIVE_STATUSES.has(h.status))

  // A live differential nobody has measured against is the sharpest kind
  // of open question: the investigation cannot close while it stands.
  const byParameter = new Map<ParameterKey, { names: string[]; zones: Set<string> }>()
  for (const h of live) {
    for (const param of h.untestedParameters) {
      const entry = byParameter.get(param) ?? { names: [], zones: new Set<string>() }
      entry.names.push(h.name)
      for (const z of h.zones) entry.zones.add(z)
      byParameter.set(param, entry)
    }
  }
  for (const [param, entry] of byParameter) {
    // Name the zones. "Has relative humidity been measured anywhere on
    // site?" is the wrong question — the answer can be yes while the
    // zone that raised the explanation still has no reading, which is
    // exactly how a clean floor used to clear a mouldy basement.
    const named = entry.zones.size
    const where = named === 0
      ? ''
      : named <= MAX_NAMED_ZONES_IN_QUESTION
        ? ` in ${[...entry.zones].join(', ')}`
        : ` in the ${named} zones that raised it`
    out.push({
      id: `untested_${param}`,
      question: `Has ${PARAMETER_LABEL[param]} been measured${where}?`,
      whyItMatters: PARAMETER_MEANING[param],
      blocks: entry.names,
      fields: LEGACY_FIELD[param],
    })
  }

  // Ventilation is the one differential whose defining measurement is not
  // a contaminant. CO2 is a surrogate; delivered outdoor air is the thing
  // itself, and without it the ventilation read stays indirect.
  const ventilation = live.find((h) => h.ruleKey === 'hyp_ventilation')
  if (ventilation && !hasField(zonesData, 'cfm_person') && !hasField(zonesData, 'ach')) {
    out.push({
      id: 'ventilation_not_quantified',
      question: 'Was outdoor-air delivery measured at the terminal (CFM per person or air changes per hour)?',
      whyItMatters:
        'Carbon dioxide is a surrogate for outdoor-air delivery, not a measurement of it. Without airflow at the terminal the ventilation finding stays indirect and cannot be compared to a design rate.',
      blocks: [ventilation.name],
      fields: ['cfm_person', 'ach'],
    })
  }

  for (const gap of outdoorGaps) {
    out.push({
      id: `outdoor_gap_${out.length}`,
      question: gap,
      whyItMatters:
        'Without a paired outdoor reading an indoor elevation cannot be attributed to the building rather than to ambient air.',
      blocks: [],
      fields: [],
    })
  }

  // Order by WHICH differential a question holds up, then by how many.
  // Counting alone put five questions about trailing explanations ahead of
  // the one holding up the leading one, and the cap then dropped the only
  // question that mattered. Rank position is the tie-break that counting
  // cannot supply.
  const position = new Map(ranked.map((h, i) => [h.name, i]))
  const bestRank = (q: OpenQuestion): number =>
    q.blocks.length === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.min(...q.blocks.map((n) => position.get(n) ?? Number.MAX_SAFE_INTEGER))
  out.sort((x, y) => (bestRank(x) - bestRank(y)) || (y.blocks.length - x.blocks.length))
  return out.slice(0, MAX_OPEN_QUESTIONS)
}

// ── Entry point ───────────────────────────────────────────────────────

const EMPTY_STATE: InvestigationState = Object.freeze({
  stage: 'no_assessment',
  hypotheses: Object.freeze([]),
  discriminatingTests: Object.freeze([]),
  openQuestions: Object.freeze([]),
  nextStep: null,
  rationale: 'No scored assessment is loaded, so there is nothing to investigate yet.',
  additionalConsiderations: Object.freeze([]),
}) as InvestigationState

/**
 * Derive the current state of the investigation from what the engines
 * have already concluded. Pure: same input, same output, every time.
 */
export function deriveInvestigation(input: InvestigationInput): InvestigationState {
  const zonesData = Array.isArray(input.zonesData) ? input.zonesData : []
  if (zonesData.length === 0) return EMPTY_STATE

  const buildingData = input.buildingData ?? {}
  const zoneScores = input.zoneScores

  /**
   * Parameter verdicts computed over ONE hypothesis's zones.
   *
   * Site-wide ranges were the original mistake and a serious one: a
   * basement with visible mold and an active leak reported "nothing to
   * investigate" because a clean top floor had normal humidity. The
   * bioaerosol differential came back `not_supported_by_measurement`
   * with `untestedParameters: []`, claiming a reading had been taken
   * where none had. A measurement bears on an explanation only where the
   * explanation was raised.
   */
  const scopeFor = (zones: ReadonlyArray<string>): {
    ranges: ParameterRangeSet; zonesData: ReadonlyArray<LegacyZone>
  } => {
    const wanted = new Set(zones)
    const idx: number[] = []
    zonesData.forEach((z, i) => {
      const name = typeof z?.zn === 'string' && z.zn ? z.zn : `Zone ${i + 1}`
      if (wanted.has(name)) idx.push(i)
    })
    // A hypothesis whose trigger zones cannot be matched back — a legacy
    // record, a renamed zone — falls back to the whole site rather than
    // to nothing. Too wide is a weaker check; empty would silently mark
    // every parameter untested and manufacture open questions.
    if (idx.length === 0) return { ranges: computeParameterRanges(zonesData, zoneScores), zonesData }
    const subset = idx.map((i) => zonesData[i])
    const subsetScores = zoneScores ? idx.map((i) => zoneScores[i]).filter(Boolean) : undefined
    return { ranges: computeParameterRanges(subset, subsetScores), zonesData: subset }
  }

  // The differentials. Findings are passed empty: the §3 rules read
  // observations, and `relatedFindingIds` is the only field that would
  // differ — it is not consumed here.
  const hypotheses = deriveHypotheses({ zonesData, buildingData, findings: [] })
  const hypothesesById = new Map(hypotheses.map((h) => [h.id as string, h]))

  // Causal chains, bucketed onto the differential each describes.
  const rootCausesByRule = new Map<HypothesisRuleKey, string[]>()
  const additionalConsiderations: InvestigationState['additionalConsiderations'][number][] = []
  const addConsideration = (label: string, rootCause: string, zone: string | null): void => {
    if (additionalConsiderations.some((c) => c.label === label && c.rootCause === rootCause)) return
    additionalConsiderations.push({ label, rootCause, zone })
  }
  // Chains that DO map to a differential, held until we know which
  // differentials actually fired.
  const mappedChains: Array<{
    rule: HypothesisRuleKey; label: string; rootCause: string; zone: string | null
  }> = []
  for (const chain of input.causalChains ?? []) {
    const type = asString(chain.type)
    const rootCause = asString(chain.rootCause)
    if (!type || !rootCause) continue
    const zone = asString(chain.zone) || null
    const rule = Object.prototype.hasOwnProperty.call(CHAIN_TYPE_TO_RULE, type)
      ? CHAIN_TYPE_TO_RULE[type]
      : undefined
    if (rule) {
      mappedChains.push({ rule, label: type, rootCause, zone })
      const list = rootCausesByRule.get(rule) ?? []
      if (!list.includes(rootCause)) list.push(rootCause)
      rootCausesByRule.set(rule, list)
    } else {
      // Both `null` (a known pathway chain) and `undefined` (a chain type
      // added since this map was written) land here. Surfacing it verbatim
      // is the safe failure: the assessor still sees it, and nothing is
      // silently attributed to a differential it does not describe.
      addConsideration(type, rootCause, zone)
    }
  }

  // Sampling plan, bucketed the same way and ordered worst-priority first.
  const planByRule = new Map<HypothesisRuleKey, SamplingPlanItemLike[]>()
  for (const item of input.samplingPlan?.plan ?? []) {
    const rule = SAMPLING_TYPE_TO_RULE[asString(item.type)]
    if (!rule) continue
    const list = planByRule.get(rule) ?? []
    list.push(item)
    planByRule.set(rule, list)
  }
  for (const list of planByRule.values()) {
    list.sort((x, y) => (PRIORITY_RANK[asString(y.priority)] ?? 0) - (PRIORITY_RANK[asString(x.priority)] ?? 0))
  }

  // Assemble one entry per differential.
  const assembled: InvestigationHypothesis[] = []
  /** Each hypothesis's own ranges, for the discriminating test below. */
  const scopedRanges = new Map<string, ParameterRangeSet>()
  for (const h of hypotheses) {
    const ruleKey = ruleKeyOf(h)
    if (!ruleKey) continue
    const rootCauses = rootCausesByRule.get(ruleKey) ?? []
    const scope = scopeFor(h.triggerZones)
    scopedRanges.set(h.id as string, scope.ranges)
    const a = assembleEvidence(ruleKey, h, scope.ranges, scope.zonesData, rootCauses)
    assembled.push({
      id: h.id as string,
      ruleKey,
      name: h.name,
      status: a.status,
      leading: false,
      zones: Object.freeze([...h.triggerZones]),
      evidence: Object.freeze(a.evidence),
      supportCount: a.supportCount,
      opposeCount: a.opposeCount,
      untestedParameters: Object.freeze(a.untested),
      cihConfidenceTier: h.cihConfidenceTier,
      rootCauses: Object.freeze(rootCauses.slice(0, MAX_ROOT_CAUSES_PER_HYPOTHESIS)),
    })
  }

  // A chain can describe a differential that did not fire. The two engines
  // trigger on different things — `buildCausalChains` raises a VOC and a
  // bioaerosol pathway off a complaint pattern alone, while the §3 rules
  // want an odor or a moisture indicator — so the chain has a root cause
  // and no hypothesis to attach it to. Bucketed by rule and never read
  // back, it vanished: the app's Pathways tab showed "VOC Source
  // (Hypothesis)" while the investigation state mentioned nothing about
  // VOCs at all. Anything the app displays has to survive the trip here,
  // under its own label if it has nowhere else to go.
  const firedRules = new Set(assembled.map((h) => h.ruleKey))
  for (const c of mappedChains) {
    if (firedRules.has(c.rule)) continue
    addConsideration(c.label, c.rootCause, c.zone)
  }

  // Rank: measurement status, then how many independent indicators the §3
  // rule found, then the rule's own confidence. Ties break on name so the
  // order is stable across runs.
  const rank = (h: InvestigationHypothesis): readonly number[] => [
    STATUS_RANK[h.status],
    h.supportCount - h.opposeCount,
    CONFIDENCE_RANK[h.cihConfidenceTier] ?? 0,
  ]
  const ranked = assembled.slice().sort((x, y) => {
    const rx = rank(x)
    const ry = rank(y)
    for (let i = 0; i < rx.length; i++) if (ry[i] !== rx[i]) return ry[i] - rx[i]
    return x.name.localeCompare(y.name)
  })

  // "Leading" requires a strict win. Two differentials that the evidence
  // cannot separate are exactly the case a discriminating test is for —
  // naming one of them the leader would paper over that.
  if (ranked.length > 0 && LIVE_STATUSES.has(ranked[0].status)) {
    const top = rank(ranked[0])
    const runnerUp = ranked.length > 1 ? rank(ranked[1]) : null
    // The list is already sorted, so the leader can only be ahead of or
    // level with the runner-up. Level means the evidence does not separate
    // them — which is precisely what a discriminating test is for, and
    // naming one of them the leader would paper over it.
    const tied = !!runnerUp && top.every((v, i) => v === runnerUp[i])
    if (!tied) ranked[0] = { ...ranked[0], leading: true }
  }

  const live = ranked.filter((h) => LIVE_STATUSES.has(h.status))
  const discriminatingTests = live.length >= 2
    ? buildDiscriminatingTests(live[0], live[1], scopedRanges, planByRule)
    : []
  const openQuestions = buildOpenQuestions(ranked, zonesData, input.samplingPlan?.outdoorGaps ?? [])

  const nextStep = deriveNextStep(live, discriminatingTests, openQuestions, planByRule, hypothesesById)
  const stage = deriveStage(ranked, live, discriminatingTests, nextStep)

  return Object.freeze({
    stage,
    hypotheses: Object.freeze(ranked),
    discriminatingTests: Object.freeze(discriminatingTests),
    openQuestions: Object.freeze(openQuestions),
    nextStep,
    rationale: STAGE_RATIONALE[stage](live),
    additionalConsiderations: Object.freeze(additionalConsiderations),
  }) as InvestigationState
}

function deriveStage(
  ranked: ReadonlyArray<InvestigationHypothesis>,
  live: ReadonlyArray<InvestigationHypothesis>,
  tests: ReadonlyArray<DiscriminatingTest>,
  nextStep: NextStep | null,
): InvestigationStage {
  if (ranked.length === 0 || live.length === 0) return 'no_active_differential'
  // A test that separates two live explanations defines the stage,
  // measured or not: the assessor is choosing between them right now.
  if (tests.length > 0) return 'differential'
  if (live.every((h) => h.status === 'untested')) return 'screening'
  const leader = live.find((h) => h.leading)
  // No strict leader and nothing that separates the field: still a
  // differential, just one this assessment has no test for.
  if (!leader) return 'differential'
  // Concluded means the investigation has somewhere to stop — a
  // synthesized root cause and no outstanding work of any kind. An open
  // question or a prescribed sample keeps it converging.
  if (leader.rootCauses.length > 0 && nextStep === null) return 'concluded'
  return 'converging'
}

const STAGE_RATIONALE: Record<
  InvestigationStage,
  (live: ReadonlyArray<InvestigationHypothesis>) => string
> = {
  no_assessment: () => 'No scored assessment is loaded, so there is nothing to investigate yet.',
  no_active_differential: () =>
    'Nothing in the walkthrough raised an explanation to test, or every explanation raised has since been measured against and cleared.',
  screening: (live) =>
    `${live.length === 1 ? 'One explanation is' : `${live.length} explanations are`} on the table from what was observed, and no measurement bears on any of them yet.`,
  differential: (live) =>
    `${live.length} explanations are still standing. The measurements taken so far do not separate them.`,
  converging: (live) => {
    const leader = live.find((h) => h.leading)
    return leader
      ? `The evidence points to ${leader.name} more than to anything else on the list, and confirmatory work is still outstanding.`
      : 'One explanation is ahead of the others, and confirmatory work is still outstanding.'
  },
  concluded: (live) => {
    const leader = live.find((h) => h.leading)
    return leader
      ? `${leader.name} accounts for what was measured, and no open test would change that.`
      : 'The measurements are accounted for, and no open test would change the reading.'
  },
}

function deriveNextStep(
  live: ReadonlyArray<InvestigationHypothesis>,
  tests: ReadonlyArray<DiscriminatingTest>,
  questions: ReadonlyArray<OpenQuestion>,
  planByRule: ReadonlyMap<HypothesisRuleKey, SamplingPlanItemLike[]>,
  hypothesesById: ReadonlyMap<string, Hypothesis>,
): NextStep | null {
  if (live.length === 0) return null

  // A test that separates the two leaders is worth more than confirming
  // the one already in front — confirming the leader cannot rule the
  // other one out.
  if (tests.length > 0) {
    const t = tests[0]
    return {
      action: `Measure ${t.parameter}. ${t.method}`,
      why: t.discriminates,
      source: 'discriminating_test',
    }
  }

  const leader = live.find((h) => h.leading) ?? live[0]
  if (leader) {
    const item = (planByRule.get(leader.ruleKey) ?? [])[0]
    if (item) {
      const zone = asString(item.zone)
      return {
        action: `${asString(item.type)}${zone ? ` in ${zone}` : ''}. ${asString(item.method)}`,
        why: `This is the confirmatory sample the assessment already prescribes for ${leader.name}${
          asString(item.hypothesis) ? `: ${asString(item.hypothesis)}` : ''
        }.`,
        source: 'sampling_plan',
      }
    }
  }

  // A leader the engine flagged on a direct-reading instrument still needs
  // a defensible measurement behind it. The sampling plan does not carry
  // an item for every parameter — an office with elevated PM2.5 produces
  // none — so fall through to the confirmatory method the §3 rule itself
  // prescribes, which is the same text the report prints for it.
  if (leader && (leader.status === 'supported_by_measurement' || leader.status === 'mixed_measurement_support')) {
    const suggested = hypothesesById.get(leader.id)?.suggestedSampling[0]
    if (suggested) {
      return {
        action: `${suggested.parameter}. ${suggested.method}`,
        why: suggested.rationale,
        source: 'hypothesis_sampling',
      }
    }
  }

  if (questions.length > 0) {
    const q = questions[0]
    return { action: q.question, why: q.whyItMatters, source: 'open_question' }
  }

  return null
}

// Internals exposed for tests so the mapping tables can be checked
// against what the source engines actually emit.
export const __testing = {
  RULE_PARAMETERS,
  CHAIN_TYPE_TO_RULE,
  SAMPLING_TYPE_TO_RULE,
  PARAMETER_LABEL,
  PARAMETER_MEANING,
  PARAMETER_METHOD,
  PARAMETER_CONTROL,
  STATUS_RANK,
  LIVE_STATUSES,
}
