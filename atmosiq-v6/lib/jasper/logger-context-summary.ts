/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Logger Studio context summary — compact view of the user's loaded
 * sensor-logger session, suitable for embedding in Jasper's per-turn
 * context block.
 *
 * Why this exists:
 *   The Jasper agent already receives presurvey / building / zone /
 *   readiness context on every turn. It did NOT see the Logger Studio
 *   payload (`sensorData`), so questions like "is the CO₂ trending
 *   high?" or "what's the peak temperature?" had to be guessed at or
 *   ignored. The summary returned here lands in `context.logger_studio`
 *   and gives the agent factual mean / peak / range / % over-limit
 *   figures per parameter per dataset, plus quality flags and the
 *   time-range / sampling-interval.
 *
 * Token discipline (~300 tokens for a typical session):
 *   • Caps at 6 datasets, 8 parameters per dataset, 6 quality flags.
 *     A full multi-zone logger session ships in well under the budget;
 *     larger sessions truncate gracefully.
 *   • Per-parameter figures are rounded to a single useful precision.
 *   • No raw timeseries arrays are ever included — the agent gets
 *     statistics, not data.
 *
 * Screening-only positioning:
 *   The figures here are exactly what Logger Studio already shows the
 *   user on screen — they're screening data, not regulatory
 *   determinations. The role prompt instructs the agent to treat them
 *   as such and to require IH review.
 */

// sensorParser / sensorThresholds are plain JS without .d.ts; the
// shapes we consume are documented as TypeScript interfaces below
// this import block.
import { normalizeSensorData, SENSOR_PARAMS } from '../../src/utils/sensorParser.js'
import { paramReference } from '../../src/utils/sensorThresholds.js'

const MAX_DATASETS = 6
const MAX_PARAMS_PER_DATASET = 8
const MAX_QUALITY_FLAGS = 6

interface DatasetPoint {
  t?: number
  [param: string]: number | undefined
}

interface DatasetSummary {
  count?: number
  start?: number | null
  end?: number | null
  intervalSec?: number | null
  emptyRows?: number
  missing?: Record<string, number>
  stats?: Record<string, { mean: number; median: number; min: number; max: number; n: number } | null>
}

interface Dataset {
  id?: string
  role?: string
  label?: string
  fileName?: string | null
  params?: string[]
  units?: Record<string, string>
  hasTimestamps?: boolean
  points?: DatasetPoint[]
  rawCount?: number
  summary?: DatasetSummary
  quality?: { level?: string; status?: string; flags?: Array<{ msg?: string } | string> }
}

interface SensorEnvelope {
  version?: number
  datasets?: Dataset[]
  occupancyWindows?: Array<{ start: number; end: number }>
  thresholds?: Record<string, boolean>
}

export interface LoggerParameterSummary {
  key: string
  label: string
  unit: string
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
  n: number
  pct_over_limit: number | null
  limit: number | null
  limit_label: string | null
  refs: string[]
}

export interface LoggerDatasetSummary {
  label: string
  role: string
  file_name: string | null
  sample_count: number
  raw_count: number | null
  parameters: LoggerParameterSummary[]
  quality_level: string
  quality_flags: string[]
}

export interface LoggerContextSummary {
  loaded: true
  dataset_count: number
  multi_zone: boolean
  parameters_seen: string[]
  time_range: {
    start_iso: string | null
    end_iso: string | null
    duration_hours: number | null
    sampling_interval_seconds: number | null
  } | null
  occupancy_windows_count: number
  datasets: LoggerDatasetSummary[]
  notes: string
}

/**
 * Round a number to a useful precision based on magnitude:
 *   ≥ 100  → whole numbers (CO₂ ppm, PM µg/m³ at high readings)
 *   ≥ 10   → one decimal (TVOC ppb in low hundreds, temperatures)
 *   < 10   → one decimal (HCHO ppb low end, fractional percentages)
 * Returns null for non-finite inputs.
 */
function roundForDisplay(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const abs = Math.abs(value)
  if (abs >= 100) return Math.round(value)
  return Math.round(value * 10) / 10
}

function paramLabel(key: string): string {
  const entry = (SENSOR_PARAMS as Array<{ key: string; label: string; unit: string }>).find(
    (p) => p.key === key,
  )
  return entry ? entry.label : key
}

function unitFor(units: Record<string, string> | undefined, key: string): string {
  if (units && units[key]) return units[key]
  const entry = (SENSOR_PARAMS as Array<{ key: string; label: string; unit: string }>).find(
    (p) => p.key === key,
  )
  return entry ? entry.unit : ''
}

/**
 * Compute the percentage of non-null points whose value exceeds `limit`.
 * Returns null when there are no values or no limit.
 */
function computePctOverLimit(
  points: DatasetPoint[] | undefined,
  paramKey: string,
  limit: number | null,
): number | null {
  if (limit == null || !Array.isArray(points) || points.length === 0) return null
  let over = 0
  let total = 0
  for (const p of points) {
    const v = p[paramKey]
    if (v == null || !Number.isFinite(v as number)) continue
    total += 1
    if ((v as number) > limit) over += 1
  }
  if (total === 0) return null
  return Math.round((over / total) * 1000) / 10
}

function summarizeDataset(ds: Dataset, datasetTs: number | null): LoggerDatasetSummary {
  const summary = ds.summary || {}
  const stats = summary.stats || {}
  const activeParams = (ds.params || []).slice(0, MAX_PARAMS_PER_DATASET)
  const parameters: LoggerParameterSummary[] = activeParams.map((key) => {
    const stat = stats[key] || null
    const unit = unitFor(ds.units, key)
    let limit: number | null = null
    let limitLabel: string | null = null
    let refs: string[] = []
    try {
      const ref = paramReference(key, { unit, ts: datasetTs }) as {
        limit: number | null
        limitLabel: string | null
        refs: string[]
      }
      limit = ref.limit
      limitLabel = ref.limitLabel
      refs = Array.isArray(ref.refs) ? ref.refs.slice(0, 2) : []
    } catch {
      /* paramReference is defensive; ignore lookup failures */
    }
    return {
      key,
      label: paramLabel(key),
      unit,
      mean: stat ? roundForDisplay(stat.mean) : null,
      median: stat ? roundForDisplay(stat.median) : null,
      min: stat ? roundForDisplay(stat.min) : null,
      max: stat ? roundForDisplay(stat.max) : null,
      n: stat ? stat.n : 0,
      pct_over_limit: computePctOverLimit(ds.points, key, limit),
      limit: roundForDisplay(limit),
      limit_label: limitLabel,
      refs,
    }
  })
  const flagsRaw = ds.quality?.flags || []
  const quality_flags = flagsRaw
    .map((f) => (typeof f === 'string' ? f : f && f.msg ? f.msg : ''))
    .filter(Boolean)
    .slice(0, MAX_QUALITY_FLAGS)
  return {
    label: ds.label || ds.id || 'Dataset',
    role: ds.role || 'indoor',
    file_name: ds.fileName || null,
    sample_count: summary.count ?? 0,
    raw_count: ds.rawCount ?? null,
    parameters,
    quality_level: ds.quality?.level || 'ok',
    quality_flags,
  }
}

/**
 * Build a compact, token-disciplined summary of the user's Logger
 * Studio session for inclusion in Jasper's context block. Returns
 * null when no usable data is present.
 */
export function summarizeLoggerForContext(
  sensorData: SensorEnvelope | null | undefined,
): LoggerContextSummary | null {
  if (!sensorData) return null
  const env = normalizeSensorData(sensorData) as SensorEnvelope
  if (!env || !Array.isArray(env.datasets) || env.datasets.length === 0) return null
  const datasets = env.datasets.slice(0, MAX_DATASETS)
  // Aggregate global time range across all datasets.
  let globalStart: number | null = null
  let globalEnd: number | null = null
  let intervalSec: number | null = null
  const paramsSeen = new Set<string>()
  for (const ds of datasets) {
    const s = ds.summary?.start ?? null
    const e = ds.summary?.end ?? null
    if (s != null) globalStart = globalStart == null ? s : Math.min(globalStart, s)
    if (e != null) globalEnd = globalEnd == null ? e : Math.max(globalEnd, e)
    if (intervalSec == null && ds.summary?.intervalSec != null) intervalSec = ds.summary.intervalSec
    for (const p of ds.params || []) paramsSeen.add(p)
  }
  const datasetTs = globalStart || globalEnd || null
  const time_range = (globalStart || globalEnd)
    ? {
        start_iso: globalStart ? new Date(globalStart).toISOString() : null,
        end_iso: globalEnd ? new Date(globalEnd).toISOString() : null,
        duration_hours:
          globalStart && globalEnd
            ? Math.round(((globalEnd - globalStart) / 3600_000) * 10) / 10
            : null,
        sampling_interval_seconds:
          intervalSec != null ? Math.round(intervalSec * 10) / 10 : null,
      }
    : null
  const summarized = datasets.map((ds) => summarizeDataset(ds, datasetTs))
  return {
    loaded: true,
    dataset_count: env.datasets.length,
    multi_zone: env.datasets.length > 1,
    parameters_seen: [...paramsSeen],
    time_range,
    occupancy_windows_count: Array.isArray(env.occupancyWindows)
      ? env.occupancyWindows.length
      : 0,
    datasets: summarized,
    notes:
      'Screening-only stats from the user\'s Logger Studio session. Treat mean / median / min / max / pct_over_limit as factual and cite the limit_label when relevant; do NOT invent figures outside this block. Any interpretation requires IH review.',
  }
}
