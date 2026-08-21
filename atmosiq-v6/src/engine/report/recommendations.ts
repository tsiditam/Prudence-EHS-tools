/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The recommendations register — what the client is actually asked to do.
 *
 * ── What was wrong ─────────────────────────────────────────────────────
 * A two-zone office produced fifteen recommendations. Four of them were
 * the same idea:
 *
 *   R-03  Replace air filters. Inspect filter housing for bypass…
 *   R-05  Upgrade filtration to MERV 13 or higher. Evaluate filter…
 *   R-06  Identify and mitigate indoor particulate sources. Review…
 *   R-15  Evaluate filtration adequacy and indoor particulate sources.
 *
 * Five more were confirmatory sampling, restating work the report
 * already sets out in its Recommended Sampling Plan. Several were not
 * instructions at all — "Consider TVOC/speciation sampling if the source
 * is not readily identifiable" asks the reader to make the decision the
 * consultant was hired to make.
 *
 * The cause was a one-line dedup keyed on exact action text. Two
 * recommendations saying the same thing in different words are two rows,
 * and a register that lists everything is a register nobody reads.
 *
 * ── What a recommendation has to be ────────────────────────────────────
 *   1. Traceable   — it exists because a finding produced it.
 *   2. Singular    — one intent, one row, however many findings raised it.
 *   3. Grounded    — its precondition holds in the recorded data. Telling
 *                    a client to upgrade to MERV 13 when nobody wrote
 *                    down the installed rating is advice the report
 *                    cannot support.
 *   4. Decisive    — an instruction, not a deliberation. No "consider",
 *                    no "if it turns out", no "evaluate the feasibility
 *                    of". Where the engine genuinely cannot commit, that
 *                    belongs in the findings as an open question, not
 *                    here as a hedge.
 *   5. Not a copy  — confirmatory sampling belongs in the sampling plan,
 *                    referenced once rather than restated per analyte.
 *
 * ── Ranked, and capped by construction ─────────────────────────────────
 * Folding by intent is what shortens the register; there is no arbitrary
 * "top N" that silently drops an action. Every finding that raised an
 * intent is still carried, on the entry, as its basis — so nothing is
 * lost, it is attributed.
 */

import type { ConditionType, Finding, RecommendedAction } from '../types/domain'

// ── Intents ───────────────────────────────────────────────────────────

/**
 * What a recommendation is FOR. Two findings that lead to the same
 * remedial act share an intent and therefore share a row.
 */
export type RecommendationIntent =
  | 'outdoor_air'
  /** Service the filters that are in. */
  | 'filtration_service'
  /** Change what class of filter is in. A different act, and a budget line. */
  | 'filtration_class'
  | 'particulate_source_control'
  | 'combustion_source'
  | 'voc_source_control'
  | 'odor_source'
  | 'microbial_remediation'
  | 'moisture_intrusion'
  /** Take moisture out. */
  | 'humidity_reduction'
  /** Put moisture in. The opposite act — never the same row. */
  | 'humidity_addition'
  | 'thermal_comfort'
  | 'hvac_service'
  | 'corrosion_control'
  | 'occupant_survey'
  | 'confirmatory_sampling'

/**
 * Every ConditionType maps to exactly one intent. Total by construction:
 * `tests/engine/recommendations.test.ts` fails when a ConditionType is
 * added without one, because an unmapped condition would silently keep
 * its own row and the register would start growing again.
 */
const INTENT_BY_CONDITION: Record<ConditionType, RecommendationIntent> = {
  ventilation_co2_only: 'outdoor_air',
  ventilation_inadequate_outdoor_air: 'outdoor_air',
  ventilation_observational_only: 'outdoor_air',
  hvac_outdoor_air_damper_compromised: 'outdoor_air',
  symptoms_resolve_away_from_building: 'outdoor_air',

  hvac_filter_loaded: 'filtration_service',

  hvac_filter_below_recommended_class: 'filtration_class',
  pm_above_naaqs_documented: 'filtration_class',
  pm_screening_elevated: 'filtration_class',

  pm_indoor_amplification_screening: 'particulate_source_control',

  co_above_pel_documented: 'combustion_source',
  co_screening_elevated: 'combustion_source',

  hcho_above_pel_documented: 'voc_source_control',
  hcho_screening_elevated: 'voc_source_control',
  tvoc_screening_elevated: 'voc_source_control',

  objectionable_odor: 'odor_source',

  apparent_microbial_growth: 'microbial_remediation',
  active_or_historical_water_damage: 'moisture_intrusion',

  humidity_microbial_amplification_range: 'humidity_reduction',
  humidity_above_comfort_upper_bound: 'humidity_reduction',
  humidity_below_comfort_lower_bound: 'humidity_addition',

  temperature_outside_comfort: 'thermal_comfort',

  hvac_maintenance_overdue: 'hvac_service',
  hvac_drain_pan_microbial_reservoir: 'hvac_service',


  occupant_symptoms_anecdotal: 'occupant_survey',
  occupant_cluster_anecdotal: 'occupant_survey',
}

/**
 * Intents whose actions are a SEQUENCE, not a restatement.
 *
 * Folding an intent to a single row is right when its actions say the
 * same thing at different volumes. It is wrong when they are successive
 * steps: "Arrest active water intrusion" and "Conduct moisture mapping…
 * Remediate damaged materials per IICRC S520" are stop-the-bleeding and
 * fix-it, and collapsing them deletes the substantive remediation
 * instruction from the report. The first version of this file did
 * exactly that, and reading the rendered output is how it surfaced.
 *
 * A sequential intent keeps one row per priority tier. Everything else
 * keeps its highest tier only.
 */
const SEQUENTIAL_INTENTS: ReadonlySet<RecommendationIntent> = new Set<RecommendationIntent>([
  'moisture_intrusion',
  'microbial_remediation',
])

// ── Ordering ──────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<string, number> = {
  immediate: 3, short_term: 2, further_evaluation: 1, long_term: 0,
}

/**
 * Confirmatory work — collecting a sample or deploying an instrument to
 * settle a question the walkthrough could only raise.
 *
 * Recognised by the verb the engine's own action texts use. This is not a
 * guess about wording: every action in `phrases/` that prescribes lab or
 * logged measurement begins `Collect` or `Deploy`, and
 * `tests/engine/recommendations.test.ts` asserts that stays true, so a
 * new sampling action phrased differently fails rather than silently
 * landing back in the register.
 */
const SAMPLING_VERB = /^(Collect|Deploy)\b/

// ── Decisiveness ──────────────────────────────────────────────────────

/**
 * Constructions that turn an instruction back into a question. A client
 * paying for a professional opinion should not be handed the decision.
 *
 * Deliberately narrow: soft VERBS are fine — "Verify the damper
 * position" and "Investigate the odour source" are things a person does
 * on Monday. What is not fine is a conditional or a deferral, where the
 * action only applies if the reader concludes something first.
 */
const HEDGE_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly why: string }> = [
  { pattern: /\bconsider\b/i, why: '"consider" hands the decision back to the reader' },
  { pattern: /\bfeasibility of\b/i, why: '"evaluate the feasibility of X" defers X rather than instructing it' },
  { pattern: /\bas appropriate\b/i, why: '"as appropriate" leaves the scope to the reader' },
  // Any subordinate `if` clause. Narrower patterns kept missing real
  // cases — "Evaluate humidification options if occupant complaints are
  // persistent" puts the condition four words after the `if`. An
  // instruction that applies only when the reader concludes something
  // first is not an instruction, however the clause is arranged.
  { pattern: /\bif\b/i, why: 'a conditional makes the action contingent on the reader deciding something first' },
  { pattern: /\bwhere possible\b/i, why: '"where possible" is not a scope' },
  { pattern: /\bmay (?:want|wish|consider)\b/i, why: 'suggestion, not instruction' },
  { pattern: /\bin zones where\b/i, why: 'the report knows which zones; naming the condition instead of the zones defers the work' },
]

export interface DecisivenessHit {
  readonly action: string
  readonly why: string
}

/** Hedges in an action's text. Empty for a well-formed recommendation. */
export function findHedges(action: string): DecisivenessHit[] {
  return HEDGE_PATTERNS
    .filter((h) => h.pattern.test(action))
    .map((h) => ({ action, why: h.why }))
}

// ── Preconditions ─────────────────────────────────────────────────────

/**
 * Recorded state a recommendation depends on being true.
 *
 * "Upgrade filtration to MERV 13 or higher" is sound advice only when
 * somebody wrote down what is installed and it is below MERV 13. With
 * the rating unrecorded — which is the common case — the report is
 * telling a client to buy something on the strength of a fact it does
 * not have. The substitute says the honest thing instead.
 */
export interface RegisterContext {
  /** Building record, for the fields a precondition reads. */
  readonly building?: Readonly<Record<string, unknown>>
}

const MERV_RANK: Readonly<Record<string, number>> = {
  'MERV 8 or lower': 8, 'MERV 11': 11, 'MERV 13': 13, 'MERV 14+': 14, HEPA: 17,
}

interface Precondition {
  readonly appliesTo: RegExp
  readonly holds: (ctx: RegisterContext) => boolean
  readonly substitute: string
  readonly why: string
}

const PRECONDITIONS: ReadonlyArray<Precondition> = [
  {
    appliesTo: /MERV 13 or higher/i,
    holds: (ctx) => {
      const fm = String(ctx.building?.fm ?? '')
      const rank = MERV_RANK[fm]
      return rank !== undefined && rank < 13
    },
    substitute:
      'Establish the installed filter rating and confirm it against the design specification before specifying a filtration upgrade.',
    why:
      'the installed filter rating was not recorded, or is already at or above MERV 13, so an upgrade cannot be specified from this assessment',
  },
]

export interface PreconditionSubstitution {
  readonly original: string
  readonly substitute: string
  readonly why: string
}

// ── The register ──────────────────────────────────────────────────────

export interface RegisterEntry {
  readonly intent: RecommendationIntent
  readonly priority: RecommendedAction['priority']
  readonly timeframe: string
  readonly action: string
  readonly standardReference?: string
  readonly location?: RecommendedAction['location']
  /** Every finding that raised this intent. Nothing is dropped, only folded. */
  readonly basisConditionTypes: ReadonlyArray<ConditionType>
  /** Actions folded into this one. Carried for the internal report. */
  readonly foldedActions: ReadonlyArray<string>
}

export interface RegisterResult {
  readonly entries: ReadonlyArray<RegisterEntry>
  /** True when confirmatory sampling was collapsed to a pointer. */
  readonly samplingFolded: boolean
  readonly substitutions: ReadonlyArray<PreconditionSubstitution>
  /** Hedges that survived into the final register. Should be empty. */
  readonly hedges: ReadonlyArray<DecisivenessHit>
}

/** The single row that replaces per-analyte sampling recommendations. */
const SAMPLING_POINTER: Omit<RegisterEntry, 'basisConditionTypes' | 'foldedActions'> = {
  intent: 'confirmatory_sampling',
  priority: 'further_evaluation',
  timeframe: '30–90 days',
  action:
    'Carry out the confirmatory sampling set out in the Recommended Sampling Plan, including the outdoor controls each method requires.',
}

const isSamplingAction = (a: RecommendedAction): boolean => SAMPLING_VERB.test(a.action.trim())

/**
 * More specific wins. Within an intent the register keeps the action that
 * says the most: highest priority first, and on a tie the longer text,
 * which is the one naming the standard or the parameter rather than
 * gesturing at the topic. "Upgrade filtration to MERV 13 or higher.
 * Evaluate filter housing for bypass." beats "Evaluate filtration
 * adequacy and indoor particulate sources."
 */
function moreSpecific(a: RecommendedAction, b: RecommendedAction): number {
  const byPriority = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
  if (byPriority !== 0) return byPriority
  const byStandard = Number(!!b.standardReference) - Number(!!a.standardReference)
  if (byStandard !== 0) return byStandard
  const byLength = b.action.length - a.action.length
  if (byLength !== 0) return byLength
  return a.action.localeCompare(b.action)
}

function applyPreconditions(
  action: string, ctx: RegisterContext, out: PreconditionSubstitution[],
): string {
  for (const p of PRECONDITIONS) {
    if (!p.appliesTo.test(action)) continue
    if (p.holds(ctx)) continue
    out.push({ original: action, substitute: p.substitute, why: p.why })
    return p.substitute
  }
  return action
}

/**
 * Build the register from the findings that produced it.
 *
 * @param findings           every finding in the assessment
 * @param ctx                recorded state a precondition may read
 * @param hasSamplingPlan    whether the report renders a Recommended
 *                           Sampling Plan. Confirmatory actions collapse
 *                           to a pointer only when there is something to
 *                           point at; otherwise they stay, because a
 *                           reference to a section that is not there is
 *                           worse than a repeated instruction.
 */
export function buildRecommendationRegister(
  findings: ReadonlyArray<Finding>,
  ctx: RegisterContext = {},
  hasSamplingPlan = false,
): RegisterResult {
  interface Bucket {
    actions: RecommendedAction[]
    conditions: Set<ConditionType>
  }
  const buckets = new Map<RecommendationIntent, Bucket>()
  const samplingConditions = new Set<ConditionType>()
  const samplingActions: string[] = []

  for (const f of findings) {
    const intent = INTENT_BY_CONDITION[f.conditionType]
    for (const a of f.recommendedActions) {
      if (!a || typeof a.action !== 'string' || !a.action.trim()) continue
      if (hasSamplingPlan && isSamplingAction(a)) {
        samplingConditions.add(f.conditionType)
        if (!samplingActions.includes(a.action)) samplingActions.push(a.action)
        continue
      }
      // An unmapped ConditionType keeps its own row rather than being
      // discarded. The test fails on it; the report never loses it.
      const key = intent ?? (`unmapped:${f.conditionType}` as RecommendationIntent)
      const bucket = buckets.get(key) ?? { actions: [], conditions: new Set() }
      bucket.actions.push(a)
      bucket.conditions.add(f.conditionType)
      buckets.set(key, bucket)
    }
  }

  const substitutions: PreconditionSubstitution[] = []
  const entries: RegisterEntry[] = []

  for (const [intent, bucket] of buckets) {
    const ranked = [...bucket.actions].sort(moreSpecific)
    // A sequential intent keeps its steps; everything else keeps the one
    // action that says the most.
    const tiers = SEQUENTIAL_INTENTS.has(intent)
      ? [...new Set(ranked.map((a) => a.priority))]
      : [ranked[0].priority]
    for (const tier of tiers) {
      const inTier = ranked.filter((a) => a.priority === tier)
      const winner = inTier[0]
      const action = applyPreconditions(winner.action, ctx, substitutions)
      entries.push({
        intent,
        priority: winner.priority,
        timeframe: winner.timeframe,
        action,
        ...(winner.standardReference ? { standardReference: winner.standardReference } : {}),
        ...(winner.location ? { location: winner.location } : {}),
        basisConditionTypes: Object.freeze([...bucket.conditions].sort()),
        foldedActions: Object.freeze(
          (tiers.length > 1 ? inTier.slice(1) : ranked.slice(1))
            .map((a) => a.action).filter((t) => t !== action),
        ),
      })
    }
  }

  if (samplingActions.length > 0) {
    entries.push({
      ...SAMPLING_POINTER,
      basisConditionTypes: Object.freeze([...samplingConditions].sort()),
      foldedActions: Object.freeze(samplingActions),
    })
  }

  entries.sort((a, b) =>
    ((PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0))
    || a.intent.localeCompare(b.intent))

  return {
    entries: Object.freeze(entries),
    samplingFolded: samplingActions.length > 0,
    substitutions: Object.freeze(substitutions),
    hedges: Object.freeze(entries.flatMap((e) => findHedges(e.action))),
  }
}

/** The register as the renderer consumes it: four priority groups. */
export function toPriorityGroups(result: RegisterResult): {
  immediate: RecommendedAction[]
  shortTerm: RecommendedAction[]
  furtherEvaluation: RecommendedAction[]
  longTermOptional: RecommendedAction[]
} {
  const asAction = (e: RegisterEntry): RecommendedAction => ({
    priority: e.priority,
    timeframe: e.timeframe,
    action: e.action,
    ...(e.standardReference ? { standardReference: e.standardReference } : {}),
    ...(e.location ? { location: e.location } : {}),
  })
  const of = (p: string) => result.entries.filter((e) => e.priority === p).map(asAction)
  return {
    immediate: of('immediate'),
    shortTerm: of('short_term'),
    furtherEvaluation: of('further_evaluation'),
    longTermOptional: of('long_term'),
  }
}

export const __testing = { INTENT_BY_CONDITION, SEQUENTIAL_INTENTS, HEDGE_PATTERNS, SAMPLING_VERB, MERV_RANK, moreSpecific }
