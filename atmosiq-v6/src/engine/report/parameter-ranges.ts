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
 */

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
 * objects. The withinStandards judgement is computed against the
 * applicable threshold for that parameter:
 *   co2: 700 ppm differential above outdoor (if outdoor available),
 *        else 1000 ppm absolute as a sedentary-office screening cap
 *   co: 9 ppm 8-hour TWA (ASHRAE 62.1) — conservative
 *   hcho: 0.1 ppm screening trigger (NIOSH REL ceiling = 0.016 ppm,
 *         but direct-reading instruments are ±0.02 ppm so the
 *         meaningful screening trigger is ~0.1 ppm)
 *   tvoc: 500 µg/m³ (Mølhave 1991 advisory)
 *   pm25: 35 µg/m³ (EPA NAAQS 24-hour)
 *   pm10: 150 µg/m³ (EPA NAAQS 24-hour)
 *   temperature: 68–78°F (ASHRAE 55 office comfort)
 *   rh: 30–60% (ASHRAE 55 office comfort, NYC DOHMH mold cap)
 */
export function computeParameterRanges(zones: ReadonlyArray<LegacyZone>): ParameterRangeSet {
  const result: ParameterRangeSet = {}

  for (const param of Object.keys(LEGACY_FIELD) as ParameterKey[]) {
    const fields = LEGACY_FIELD[param]
    const values: number[] = []
    const elevatedInZones: string[] = []

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
      const zoneName = zone.zn || 'Unnamed zone'
      if (isElevated(param, num, zones)) elevatedInZones.push(zoneName)
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

    const withinStandards = computeWithinStandards(param, { low, high, average, outdoor: outdoorReference })

    result[param] = {
      low: round2(low),
      high: round2(high),
      average,
      unit: PARAMETER_UNIT[param],
      count: values.length,
      withinStandards,
      elevatedInZones: elevatedInZones.length > 0 ? elevatedInZones : undefined,
      outdoorReference: outdoorReference !== undefined ? round2(outdoorReference) : undefined,
    }
  }

  return result
}

function isElevated(param: ParameterKey, value: number, zones: ReadonlyArray<LegacyZone>): boolean {
  switch (param) {
    case 'co2': {
      // Elevated relative to outdoor differential (>700 ppm above outdoor)
      // OR absolute >1000 ppm if no outdoor baseline.
      const outdoor = readNumberFromZones(zones, 'co2o')
      if (outdoor !== null) return value - outdoor > 700
      return value > 1000
    }
    case 'co': return value > 9
    case 'hcho': return value > 0.1
    case 'tvoc': return value > 500
    case 'pm25': return value > 35
    case 'pm10': return value > 150
    case 'temperature': return value < 68 || value > 78
    case 'rh': return value < 30 || value > 60
  }
}

function computeWithinStandards(
  param: ParameterKey,
  stats: { low: number; high: number; average: number; outdoor?: number },
): boolean {
  switch (param) {
    case 'co2': {
      const cap = stats.outdoor !== undefined ? stats.outdoor + 700 : 1000
      return stats.high <= cap
    }
    case 'co': return stats.high <= 9
    case 'hcho': return stats.high <= 0.1
    case 'tvoc': return stats.high <= 500
    case 'pm25': return stats.high <= 35
    case 'pm10': return stats.high <= 150
    case 'temperature': return stats.low >= 68 && stats.high <= 78
    case 'rh': return stats.low >= 30 && stats.high <= 60
  }
}

function readNumberFromZones(zones: ReadonlyArray<LegacyZone>, field: string): number | null {
  for (const z of zones) {
    const raw = z[field]
    if (raw === undefined || raw === '') continue
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw))
    if (Number.isFinite(num)) return num
  }
  return null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
