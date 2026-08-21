/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Claim provenance — for every quantitative claim the engine makes, what
 * it was derived from.
 *
 * ── The question this answers ──────────────────────────────────────────
 * "Where did that number come from?" Until now the honest answer was that
 * you read the emitting branch in scoring.js and worked it out. A finding
 * carried its parameter, its criterion id and its citation, but not the
 * inputs it was computed from — so nothing could check that the figure in
 * the sentence was a figure anyone had measured.
 *
 * That gap is not theoretical. A renderer once compared a temperature
 * against a comfort band it had invented and printed the verdict beside
 * the engine's opposite one; a TVOC reading was silently converted from
 * µg/m³ to ppb and rendered as a different number entirely. Both were
 * caught by a person reading output. Neither was catchable by a test,
 * because no layer knew what a claim was allowed to say.
 *
 * ── The rule ───────────────────────────────────────────────────────────
 * Every quantity a claim states must be GROUNDED — traceable to one of:
 *
 *   • a value collected in that zone, or a documented arithmetic
 *     derivation of collected values (an outdoor differential, an
 *     indoor/outdoor ratio)
 *   • a published threshold, from the criterion registry or the standards
 *     table those criteria resolve against
 *   • the seasonal or profile band the engine applied, carried on the
 *     finding itself
 *   • a duration named by the criterion's averaging period
 *
 * A quantity grounded in none of those is invented, and
 * `tests/engine/provenance.test.ts` fails the build on it.
 *
 * ── Why only unit-bearing quantities ───────────────────────────────────
 * A report is full of numbers that are not claims about the building:
 * 29 CFR 1910.1000, ASHRAE 55-2023, IICRC S520, R-07, the year in a
 * citation, "Condition 1 or 2". Scanning every digit would need an
 * exclusion list long enough to make the check vacuous — the failure mode
 * where a guard technically passes while guarding nothing.
 *
 * A number carrying a unit is different: `1450 ppm`, `38 µg/m³`, `72°F`
 * is an assertion about what was measured or what the limit is. That is
 * the set worth constraining, and it is the set that can do harm.
 *
 * ── No engine changes ──────────────────────────────────────────────────
 * Nothing here asks scoring.js to tag its emissions. Provenance is
 * DERIVED: the finding names its parameter, the field registry says which
 * intake field that parameter is stored in, and the zone record holds the
 * value. That is only possible because the registry exists, which is why
 * it came first.
 */

import { CRITERIA, AVERAGING } from '../../constants/criteria'
import { STD } from '../../constants/standards'
import { getField } from '../../constants/field-registry.js'
import { LEGACY_FIELD, type LegacyZone, type ParameterKey } from './parameter-ranges'
import type { LegacyZoneScoreLike } from './parameter-verdicts'

// ── Public shape ──────────────────────────────────────────────────────

export interface ClaimInput {
  readonly field: string
  readonly value: string
  readonly scope: string
}

export interface ClaimProvenance {
  /** Stable within one assessment: zone index, parameter, ordinal. */
  readonly claimId: string
  readonly zone: string
  readonly zoneIndex: number
  readonly parameter: ParameterKey | null
  readonly severity: string
  /** The sentence the engine emitted. */
  readonly text: string
  /** The intake values this claim was computed from. */
  readonly inputs: ReadonlyArray<ClaimInput>
  readonly criterionId: string | null
  /** The threshold the criterion resolves to, when it names one. */
  readonly criterionValue: number | null
  /** The citation the finding carries. */
  readonly source: string | null
  /** Seasonal / profile band, for the parameters that use one. */
  readonly band: readonly [number, number] | null
}

export interface Quantity {
  readonly value: number
  readonly unit: string
  /** The matched text, for a failure message someone can act on. */
  readonly matched: string
}

// ── Grounding sources that do not vary per claim ──────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Every numeric leaf of an object graph. */
function numericLeaves(node: unknown, out: Set<number>, depth = 0): Set<number> {
  if (depth > 8 || node == null) return out
  if (typeof node === 'number') { if (Number.isFinite(node)) out.add(round2(node)); return out }
  if (Array.isArray(node)) { for (const v of node) numericLeaves(v, out, depth + 1); return out }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) numericLeaves(v, out, depth + 1)
  }
  return out
}

/**
 * Every published threshold the platform can legitimately state.
 *
 * `STD` is the table; `CRITERIA` resolves against it but also carries
 * derived figures (unit conversions, tier boundaries), so both are walked.
 * A criterion's `resolve` is called rather than read, because that is how
 * the engine obtains the value it compares against.
 */
function publishedValues(): Set<number> {
  const out = new Set<number>()
  numericLeaves(STD, out)
  const walk = (node: unknown, depth = 0): void => {
    if (depth > 6 || node == null || typeof node !== 'object') return
    const rec = node as Record<string, unknown>
    if (typeof rec.resolve === 'function') {
      try {
        const v = (rec.resolve as () => unknown)()
        if (typeof v === 'number' && Number.isFinite(v)) out.add(round2(v))
      } catch { /* a criterion that cannot resolve grounds nothing */ }
    }
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1))
      else walk(v, depth + 1)
    }
  }
  walk(CRITERIA)
  // Averaging periods: "a 10-hour time-weighted average", "24-hour
  // standard". The duration is part of what the criterion means.
  numericLeaves(AVERAGING, out)
  for (const a of Object.values(AVERAGING as Record<string, { label?: unknown }>)) {
    for (const m of String(a?.label ?? '').matchAll(/(\d+(?:\.\d+)?)/g)) out.add(round2(Number(m[1])))
  }
  return out
}

/** Computed once: the tables do not change within a process. */
const PUBLISHED_VALUES: ReadonlySet<number> = publishedValues()

/**
 * Units that mark a number as a claim about the building rather than a
 * citation. Ordered longest-first so `µg/m³` is not shadowed by `g`.
 */
const UNITS: ReadonlyArray<string> = [
  'cfm/person', 'µg/m³', 'ug/m3', 'mg/m³', 'mg/m3', 'sq ft', 'ppm', 'ppb',
  '°F', '°C', 'ACH', 'hours', 'hour', 'minutes', 'minute', 'days', 'day', '%',
]

const UNIT_ALTERNATION = UNITS
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const NUMBER = '\\d[\\d,]*(?:\\.\\d+)?'

/**
 * Quantities stated in a sentence: a number carrying a unit.
 *
 * The leading group handles a RANGE — `73–79°F`, `30–60%` — where only
 * the upper bound is adjacent to the unit. Reading just the adjacent
 * number would have left the lower bound unchecked, which is the half of
 * a comfort band a renderer is most likely to get wrong: the defect this
 * whole file exists for printed `68–78` against a seasonal band of
 * `73–79`, and both wrong figures sit on the low side of the dash.
 */
export function extractQuantities(text: string): Quantity[] {
  const out: Quantity[] = []
  const re = new RegExp(
    `(?:(${NUMBER})\\s*(?:–|—|-|to)\\s*)?(${NUMBER})\\s*(${UNIT_ALTERNATION})`,
    'g',
  )
  for (const m of text.matchAll(re)) {
    const unit = m[3]
    for (const raw of [m[1], m[2]]) {
      if (raw === undefined) continue
      const value = Number(raw.replace(/,/g, ''))
      if (!Number.isFinite(value)) continue
      out.push({ value: round2(value), unit, matched: `${raw} ${unit}`.trim() })
    }
  }
  return out
}

// ── Deriving provenance ───────────────────────────────────────────────

interface LegacyFindingLike {
  readonly t?: unknown
  readonly sev?: unknown
  readonly p?: unknown
  readonly cid?: unknown
  readonly std?: unknown
  readonly band?: unknown
}

export interface ProvenanceInput {
  readonly zoneScores: ReadonlyArray<LegacyZoneScoreLike>
  readonly zonesData: ReadonlyArray<LegacyZone>
  readonly buildingData?: Readonly<Record<string, unknown>>
}

/** Resolve a criterion's threshold by id, or null when it names none. */
export function criterionValueById(id: string): number | null {
  let found: number | null = null
  const walk = (node: unknown, depth = 0): void => {
    if (found !== null || depth > 6 || node == null || typeof node !== 'object') return
    const rec = node as Record<string, unknown>
    if (rec.id === id && typeof rec.resolve === 'function') {
      try {
        const v = (rec.resolve as () => unknown)()
        if (typeof v === 'number' && Number.isFinite(v)) { found = round2(v); return }
      } catch { /* unresolvable */ }
    }
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1))
      else walk(v, depth + 1)
    }
  }
  walk(CRITERIA)
  return found
}

const readField = (
  zone: LegacyZone, building: Readonly<Record<string, unknown>>, field: string,
): string => {
  const zv = zone[field]
  if (zv !== undefined && zv !== null && zv !== '') return String(zv)
  const bv = building[field]
  if (bv !== undefined && bv !== null && bv !== '') return String(bv)
  return ''
}

/**
 * The intake values a claim about `parameter` was computed from: the
 * parameter's own field, and its outdoor counterpart where one exists —
 * a differential or a ratio is a claim about both readings.
 */
function inputsForParameter(
  parameter: ParameterKey, zone: LegacyZone, building: Readonly<Record<string, unknown>>,
): ClaimInput[] {
  const out: ClaimInput[] = []
  const OUTDOOR: Partial<Record<ParameterKey, string>> = {
    co2: 'co2o', pm25: 'pmo', tvoc: 'tvo', temperature: 'tfo', rh: 'rho',
  }
  const candidates = [...(LEGACY_FIELD[parameter] || []), OUTDOOR[parameter]].filter(Boolean) as string[]
  for (const field of candidates) {
    const value = readField(zone, building, field)
    if (!value) continue
    out.push({ field, value, scope: getField(field)?.scope ?? 'unknown' })
  }
  return out
}

/**
 * Numeric intake fields collected in a zone, as claim inputs.
 *
 * Used for findings that state a quantity without declaring a parameter —
 * `OA delivery 3 cfm/person` is computed from `cfm_person`, which maps to
 * no ParameterKey. Grounding those against everything the zone collected
 * is weaker than grounding against a named field, and deliberately so:
 * the alternative is either a false failure on a correct claim, or an
 * engine change to invent parameter keys for quantities that are not
 * report parameters.
 *
 * The weakness is not hidden. `untaggedQuantitativeClaims` reports every
 * finding relying on this path, and the test pins that list, so the set
 * cannot grow without someone deciding it should.
 */
function allCollectedInputs(
  zone: LegacyZone, building: Readonly<Record<string, unknown>>,
): ClaimInput[] {
  const out: ClaimInput[] = []
  const seen = new Set<string>()
  for (const [field, value] of [...Object.entries(building), ...Object.entries(zone)]) {
    if (seen.has(field) || value === undefined || value === null || value === '') continue
    const contract = getField(field)
    if (!contract) continue
    const text = String(value)
    if (!/\d/.test(text)) continue
    seen.add(field)
    out.push({ field, value: text, scope: contract.scope })
  }
  return out
}

/**
 * Derive a provenance record for every finding the engine emitted.
 *
 * Findings with no `p` are usually observational — "Moderate odor",
 * "Symptoms resolve away from building" — and state no measured quantity.
 * The ones that DO state a quantity fall back to the zone's collected
 * values; see allCollectedInputs.
 */
export function deriveClaimProvenance(input: ProvenanceInput): ClaimProvenance[] {
  const building = input.buildingData ?? {}
  const out: ClaimProvenance[] = []

  input.zoneScores.forEach((zs, zoneIndex) => {
    const zone = input.zonesData[zoneIndex] ?? {}
    const zoneName = typeof zs?.zoneName === 'string' && zs.zoneName
      ? zs.zoneName
      : (typeof zone.zn === 'string' && zone.zn ? zone.zn : `Zone ${zoneIndex + 1}`)
    let ordinal = 0
    for (const cat of zs?.cats || []) {
      for (const raw of (cat?.r || []) as ReadonlyArray<LegacyFindingLike>) {
        const text = typeof raw?.t === 'string' ? raw.t : ''
        if (!text) continue
        const parameter = typeof raw.p === 'string' && raw.p ? (raw.p as ParameterKey) : null
        const criterionId = typeof raw.cid === 'string' && raw.cid ? raw.cid : null
        const band = Array.isArray(raw.band) && raw.band.length === 2
          && raw.band.every((n) => typeof n === 'number')
          ? ([raw.band[0], raw.band[1]] as [number, number])
          : null
        out.push(Object.freeze({
          claimId: `Z${zoneIndex}-${parameter ?? 'obs'}-${ordinal++}`,
          zone: zoneName,
          zoneIndex,
          parameter,
          severity: String(raw.sev ?? ''),
          text,
          inputs: Object.freeze(
            parameter
              ? inputsForParameter(parameter, zone, building)
              : (/\d/.test(text) ? allCollectedInputs(zone, building) : []),
          ),
          criterionId,
          criterionValue: criterionId ? criterionValueById(criterionId) : null,
          source: typeof raw.std === 'string' && raw.std ? raw.std : null,
          band,
        }))
      }
    }
  })

  return out
}

// ── Grounding ─────────────────────────────────────────────────────────

/**
 * Every quantity this claim is entitled to state.
 *
 * Derivations are enumerated, not inferred: an outdoor differential and
 * an indoor/outdoor ratio are the two the engine computes, and listing
 * them keeps the check honest. A derivation nobody declared is a number
 * nobody can explain.
 */
export function groundingSet(claim: ClaimProvenance): Set<number> {
  const out = new Set<number>(PUBLISHED_VALUES)
  const numeric: number[] = []

  for (const i of claim.inputs) {
    const n = parseFloat(i.value)
    if (Number.isFinite(n)) { out.add(round2(n)); numeric.push(n) }
    // Option strings carry their own figures — "Small (< 10 sq ft)". A
    // claim quoting the value it was given is quoting an input.
    for (const m of i.value.matchAll(/(\d+(?:\.\d+)?)/g)) out.add(round2(Number(m[1])))
  }

  // Indoor against outdoor: the differential and the ratio.
  if (numeric.length >= 2) {
    const [indoor, outdoor] = numeric
    out.add(round2(indoor - outdoor))
    out.add(round2(outdoor - indoor))
    if (outdoor !== 0) out.add(round2(indoor / outdoor))
  }

  if (claim.band) { out.add(round2(claim.band[0])); out.add(round2(claim.band[1])) }
  if (claim.criterionValue !== null) out.add(claim.criterionValue)

  return out
}

/**
 * Quantities the claim states that nothing entitles it to. Empty is the
 * only acceptable result for a shipped finding.
 */
export function ungroundedQuantities(claim: ClaimProvenance): Quantity[] {
  const grounded = groundingSet(claim)
  return extractQuantities(claim.text).filter((q) => !grounded.has(q.value))
}

/**
 * Claims that state a quantity without declaring which parameter it is
 * about. Each one is grounded against everything its zone collected
 * rather than against a named field, so the check over it is weaker.
 *
 * This is the register for that weakness. A finding that states
 * `1450 ppm` and tags `p: 'co2'` is checkable against one value; a
 * finding that states `3 cfm/person` and tags nothing is checkable only
 * against the whole zone. Pinning the list means the second kind cannot
 * quietly become the norm.
 */
export function untaggedQuantitativeClaims(
  claims: ReadonlyArray<ClaimProvenance>,
): ClaimProvenance[] {
  return claims.filter((c) => c.parameter === null && extractQuantities(c.text).length > 0)
}

export const __testing = { publishedValues, numericLeaves, allCollectedInputs, UNITS, round2 }
