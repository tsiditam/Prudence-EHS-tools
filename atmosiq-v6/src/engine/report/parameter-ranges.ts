/**
 * AtmosFlow Engine v2.2 §9 — Per-Parameter Range Computation
 *
 * Walks the legacy zone-data shapes (string-encoded fields like
 * zone.co2, zone.pm, etc.) and computes per-parameter low/high/average
 * ranges for the Results section's per-parameter prose summaries.
 *
 * v2.0 design note: this lives next to the renderer, NOT inside the
 * engine's scoring path. Parameter ranges are a presentational concern
 * derived from the same input data the scoring engine consumes; they
 * do not feed scoring.
 *
 * 2026-08: this file used to compute `withinStandards` and
 * `elevatedInZones` from its OWN hardcoded thresholds — a second,
 * invisible threshold engine that knew nothing about `STD`, the criterion
 * registry, the comfort season, or the building-profile overrides. It
 * disagreed with the real engine on a live report, which said both
 * "within the ASHRAE 55 comfort range" and "outside typical comfort
 * ranges defined by ASHRAE 55" about the same 72 °F reading.
 *
 * Both judgements now come from `deriveParameterVerdicts`, which reads
 * what the engine actually concluded. Ranges are arithmetic; verdicts are
 * interpretation; this file does the first and reads the second. Do not
 * reintroduce a threshold here — see parameter-verdicts.ts.
 */

import { deriveParameterVerdicts, type LegacyZoneScoreLike, type ParameterVerdictSet } from './parameter-verdicts'

export type ParameterKey =
  | 'co2'
  | 'co'
  | 'hcho'
  | 'tvoc'
  | 'pm25'
  | 'pm10'
  | 'temperature'
  | 'rh'

export interface ParameterRange {
  readonly low: number
  readonly high: number
  readonly average: number
  readonly unit: string
  readonly count: number
  readonly withinStandards: boolean | null
  readonly elevatedInZones?: ReadonlyArray<string>
  readonly outdoorReference?: number
}

export type ParameterRangeSet = Partial<Record<ParameterKey, ParameterRange>>

// Legacy zone-data field name(s) per parameter, in order of preference.
const LEGACY_FIELD: Record<ParameterKey, ReadonlyArray<string>> = {
  co2: ['co2'],
  co: ['co'],
  hcho: ['hc'],
  tvoc: ['tv'],
  pm25: ['pm'],
  pm10: ['pm10'],
  temperature: ['tf'],
  rh: ['rh'],
}

const OUTDOOR_FIELD: Partial<Record<ParameterKey, string>> = {
  co2: 'co2o',
  pm25: 'pmo',
  tvoc: 'tvo',
  temperature: 'tfo',
  rh: 'rho',
}

const PARAMETER_UNIT: Record<ParameterKey, string> = {
  co2: 'ppm',
  co: 'ppm',
  hcho: 'ppm',
  tvoc: 'µg/m³',
  pm25: 'µg/m³',
  pm10: 'µg/m³',
  temperature: '°F',
  rh: '%',
}

export interface LegacyZone {
  readonly zn?: string
  readonly [key: string]: unknown
}

/**
 * Compute per-parameter ranges across an array of legacy zone-data
 * objects.
 *
 * `withinStandards` and `elevatedInZones` are NOT computed here. They are
 * read from the engine's own findings via `deriveParameterVerdicts`, so
 * the Results prose can never disagree with the Zone Findings about the
 * same measurement. See parameter-verdicts.ts for why.
 *
 * @param zones       legacy zone intake records
 * @param zoneScores  the engine's per-zone scores. Omit only in unit tests
 *                    that exercise the arithmetic alone: without them no
 *                    interpretation exists, so `withinStandards` is null
 *                    and the prose makes no within/outside claim.
 */
export function computeParameterRanges(
  zones: ReadonlyArray<LegacyZone>,
  zoneScores?: ReadonlyArray<LegacyZoneScoreLike>,
): ParameterRangeSet {
  const result: ParameterRangeSet = {}
  // Absent zoneScores there is no engine verdict to read, and this file is
  // forbidden from inventing one.
  const verdicts: ParameterVerdictSet | null = zoneScores
    ? deriveParameterVerdicts(zoneScores, zones as ReadonlyArray<{ zn?: unknown }>)
    : null

  for (const param of Object.keys(LEGACY_FIELD) as ParameterKey[]) {
    const fields = LEGACY_FIELD[param]
    const values: number[] = []

    for (const zone of zones) {
      let raw: unknown
      for (const f of fields) {
        if (zone[f] !== undefined && zone[f] !== '') {
          raw = zone[f]
          break
        }
      }
      if (raw === undefined) continue
      const num = typeof raw === 'number' ? raw : parseFloat(String(raw))
      if (!Number.isFinite(num)) continue
      values.push(num)
    }

    if (values.length === 0) continue

    const low = Math.min(...values)
    const high = Math.max(...values)
    const average = round2(values.reduce((s, v) => s + v, 0) / values.length)
    const outdoorField = OUTDOOR_FIELD[param]
    let outdoorReference: number | undefined
    if (outdoorField) {
      for (const zone of zones) {
        const raw = zone[outdoorField]
        if (raw !== undefined && raw !== '') {
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw))
          if (Number.isFinite(num)) { outdoorReference = num; break }
        }
      }
    }

    const verdict = verdicts ? verdicts[param] : undefined
    // A measured parameter the engine flagged nowhere is within range —
    // silence from the engine is a verdict, not an absence of one. Null
    // only when no engine output was supplied at all.
    const withinStandards = verdicts ? !(verdict?.hasFinding ?? false) : null
    const elevatedInZones = verdict?.zones ?? []

    result[param] = {
      low: round2(low),
      high: round2(high),
      average,
      unit: PARAMETER_UNIT[param],
      count: values.length,
      withinStandards,
      elevatedInZones: elevatedInZones.length > 0 ? elevatedInZones.slice() : undefined,
      outdoorReference: outdoorReference !== undefined ? round2(outdoorReference) : undefined,
    }
  }

  return result
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
