/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Tier precedence — the single place that decides how the advisory
 * compliance tier escalates. Replaces the scattered `if (tier === 'compliant')`
 * ladders and the always-escalates tautology in the original App.jsx
 * (`tier = param.acute ? 'immediate' : (tier !== 'immediate' ? 'immediate' : tier)`),
 * which both (a) read as if non-acute exceedances were handled differently
 * when they weren't, and (b) let a lower-priority branch fail to escalate a
 * legitimately higher finding because it was gated to only fire from
 * 'compliant'. escalateTier composes monotonically: the tier only ever moves
 * up to the most severe candidate, never down.
 */

import type { Tier } from '../types/engine'

export const TIER_RANK: Record<Tier, number> = {
  compliant: 0,
  monitor: 1,
  advisory: 2,
  immediate: 3,
}

/** Return the more severe of the current tier and a candidate tier. */
export function escalateTier(current: Tier, candidate: Tier): Tier {
  return TIER_RANK[candidate] > TIER_RANK[current] ? candidate : current
}

/** Reduce a set of candidate tiers to the most severe (default compliant). */
export function highestTier(tiers: Tier[]): Tier {
  return tiers.reduce<Tier>((acc, t) => escalateTier(acc, t), 'compliant')
}
