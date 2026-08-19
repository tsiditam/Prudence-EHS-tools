/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Per-parameter verdicts — the single authoritative reading of what the
 * engine concluded about each measured parameter.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 * A report shipped saying both of these about the same 72 °F reading:
 *
 *   Results:       "Temperature ranged from 72°F to 73°F … Conditions are
 *                   within the ASHRAE 55 comfort range for typical office
 *                   activity."
 *   Zone Findings: "Measured temperature was outside typical comfort
 *                   ranges defined by ASHRAE 55.  Observed: 72°F"
 *
 * Both sentences were correct about their own threshold and wrong about
 * each other. `scoreEnv` compares against the SEASONAL band from
 * `STD.t.temp` (summer optimal 73–79, so 72 °F is outside it and emits a
 * finding). `parameter-ranges.ts` compared against a hardcoded 68–78 that
 * knew nothing about the season, `STD`, the criterion registry, or the
 * building-profile overrides — a second threshold engine, invisible
 * because it lived in the renderer and agreed with the first often enough
 * to look right. The finding propagated into the Executive Summary and
 * the Conclusions; the Results paragraph did not.
 *
 * ── The rule ───────────────────────────────────────────────────────────
 * One interpretation is authoritative for a given measurement, and it is
 * the engine's. The renderer does not re-derive it; it reads it. So:
 *
 *   withinStandards = the engine emitted no actionable finding for this
 *                     parameter in any zone
 *
 * `pass` and `info` entries are the engine's own way of recording "looked
 * at it, nothing to report", so they do not make a parameter out of range.
 * Everything else does. There is no threshold in this file, and there must
 * never be one — a threshold here is by definition a second opinion.
 *
 * Findings carry their parameter in the `p` field, tagged at each emission
 * site in `src/engines/scoring.js`. Matching on finding TEXT was rejected:
 * `bridge/classify.ts` already routes on substrings and CLAUDE.md flags
 * that as fragile; re-using the technique to fix a correctness bug would
 * have made the next wording change break the interpretation again.
 */

import type { ParameterKey } from './parameter-ranges'

/** Severities the engine uses to say "evaluated, nothing to report". */
const NON_FINDING_SEVERITIES: ReadonlySet<string> = new Set(['pass', 'info'])

export interface ParameterVerdict {
  /** At least one actionable finding was emitted for this parameter. */
  readonly hasFinding: boolean
  /** Zone names carrying one, in zone order, de-duplicated. */
  readonly zones: ReadonlyArray<string>
}

export type ParameterVerdictSet = Partial<Record<ParameterKey, ParameterVerdict>>

interface LegacyFinding {
  readonly p?: unknown
  readonly sev?: unknown
}
interface LegacyCategory {
  readonly r?: ReadonlyArray<LegacyFinding>
}
export interface LegacyZoneScoreLike {
  readonly zoneName?: unknown
  readonly cats?: ReadonlyArray<LegacyCategory>
}
interface ZoneDataLike {
  readonly zn?: unknown
}

/**
 * Collect the engine's verdict per parameter across every zone.
 *
 * @param zoneScores  legacy per-zone score objects (cats[].r[] findings)
 * @param zonesData   raw zone intake, used only to name a zone when the
 *                    score object has no `zoneName`
 */
export function deriveParameterVerdicts(
  zoneScores: ReadonlyArray<LegacyZoneScoreLike> | undefined,
  zonesData: ReadonlyArray<ZoneDataLike> = [],
): ParameterVerdictSet {
  const out: Record<string, { hasFinding: boolean; zones: string[] }> = {}

  ;(zoneScores || []).forEach((zs, i) => {
    const name = typeof zs?.zoneName === 'string' && zs.zoneName
      ? zs.zoneName
      : (typeof zonesData[i]?.zn === 'string' && zonesData[i]!.zn ? String(zonesData[i]!.zn) : 'Unnamed zone')

    for (const cat of zs?.cats || []) {
      for (const f of cat?.r || []) {
        if (typeof f?.p !== 'string' || !f.p) continue
        const entry = out[f.p] || (out[f.p] = { hasFinding: false, zones: [] })
        if (NON_FINDING_SEVERITIES.has(String(f.sev))) continue
        entry.hasFinding = true
        if (!entry.zones.includes(name)) entry.zones.push(name)
      }
    }
  })

  const frozen: Record<string, ParameterVerdict> = {}
  for (const [k, v] of Object.entries(out)) {
    frozen[k] = Object.freeze({ hasFinding: v.hasFinding, zones: Object.freeze(v.zones.slice()) })
  }
  return frozen as ParameterVerdictSet
}
