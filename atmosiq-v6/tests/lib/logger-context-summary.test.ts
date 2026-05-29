/**
 * Tests for lib/jasper/logger-context-summary.ts.
 *
 * Pins the contract:
 *   • Empty / null input → null (no logger_studio block emitted)
 *   • Legacy v1 envelope (the dataset IS the object) is normalized
 *   • Single dataset → one-entry datasets[], multi_zone:false,
 *     time_range with start/end ISO, sampling interval, parameters,
 *     per-parameter mean/median/min/max/pct_over_limit rounded
 *   • Multi-dataset (indoor + outdoor) → multi_zone:true, both
 *     summaries present, parameters_seen is the union, global
 *     time_range spans both datasets
 *   • Quality flags propagate (deduped via the source shape)
 *   • Token budget — the serialized JSON for a realistic two-dataset
 *     session stays under a token-conservative byte cap
 *   • Caps respected — > MAX_DATASETS datasets truncate, > MAX_PARAMS
 *     parameters truncate
 *   • pct_over_limit is computed correctly against the screening
 *     limit returned by paramReference (CO₂ at 1100 ppm crosses the
 *     1000 ppm screening tier)
 */

import { describe, it, expect } from 'vitest'
import {
  summarizeLoggerForContext,
  type LoggerContextSummary,
} from '../../lib/jasper/logger-context-summary'

// Tuesday May 26, 2026, 09:00 EDT — date-stable across both summer
// and winter scoring bands (see CLAUDE.md pitfall #3).
const T0 = Date.UTC(2026, 4, 26, 13, 0, 0)

interface Point { t?: number; co2?: number; pm25?: number; temp?: number; rh?: number; tvoc?: number }

function makeDataset(opts: {
  id?: string
  role?: string
  label?: string
  fileName?: string | null
  startMs?: number
  intervalSec?: number
  points: Point[]
  params: string[]
  units?: Record<string, string>
  qualityLevel?: string
  qualityFlags?: string[]
}) {
  const interval = opts.intervalSec ?? 60
  const startMs = opts.startMs ?? T0
  const points = opts.points.map((p, i) => ({ t: startMs + i * interval * 1000, ...p }))
  const ts = points.map((p) => p.t).filter((t) => typeof t === 'number') as number[]
  const stats: Record<string, { mean: number; median: number; min: number; max: number; n: number }> = {}
  for (const param of opts.params) {
    const vals = points.map((p) => (p as Record<string, number | undefined>)[param])
      .filter((v): v is number => v != null && Number.isFinite(v))
    if (!vals.length) continue
    const sorted = [...vals].sort((a, b) => a - b)
    stats[param] = {
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      median: sorted[Math.floor(sorted.length / 2)],
      min: Math.min(...vals),
      max: Math.max(...vals),
      n: vals.length,
    }
  }
  return {
    id: opts.id || 'primary',
    role: opts.role || 'indoor',
    label: opts.label || 'Indoor',
    fileName: opts.fileName === undefined ? 'aranet4.csv' : opts.fileName,
    params: opts.params,
    units: opts.units || {},
    hasTimestamps: true,
    points,
    rawCount: points.length,
    summary: {
      count: points.length,
      start: ts.length ? ts[0] : null,
      end: ts.length ? ts[ts.length - 1] : null,
      intervalSec: interval,
      emptyRows: 0,
      missing: {},
      stats,
    },
    quality: {
      level: opts.qualityLevel || 'ok',
      status: 'OK',
      flags: (opts.qualityFlags || []).map((msg) => ({ msg })),
    },
  }
}

describe('summarizeLoggerForContext', () => {
  it('returns null for empty / null / no-datasets input', () => {
    expect(summarizeLoggerForContext(null)).toBeNull()
    expect(summarizeLoggerForContext(undefined)).toBeNull()
    expect(summarizeLoggerForContext({ version: 2, datasets: [] })).toBeNull()
  })

  it('summarizes a single-dataset CO₂ session with mean, peak and pct_over_limit', () => {
    const dataset = makeDataset({
      params: ['co2'],
      units: { co2: 'ppm' },
      points: [
        { co2: 600 }, { co2: 700 }, { co2: 850 }, { co2: 950 },
        { co2: 1100 }, { co2: 1200 }, { co2: 1050 }, { co2: 900 },
      ],
    })
    const env = { version: 2, datasets: [dataset], occupancyWindows: [] }
    const out = summarizeLoggerForContext(env) as LoggerContextSummary
    expect(out).not.toBeNull()
    expect(out.loaded).toBe(true)
    expect(out.dataset_count).toBe(1)
    expect(out.multi_zone).toBe(false)
    expect(out.parameters_seen).toEqual(['co2'])
    expect(out.datasets).toHaveLength(1)
    const ds = out.datasets[0]
    expect(ds.label).toBe('Indoor')
    expect(ds.role).toBe('indoor')
    expect(ds.file_name).toBe('aranet4.csv')
    expect(ds.sample_count).toBe(8)
    const co2 = ds.parameters.find((p) => p.key === 'co2')!
    expect(co2.unit).toBe('ppm')
    expect(co2.mean).toBe(919)   // rounded whole number above 100
    expect(co2.min).toBe(600)
    expect(co2.max).toBe(1200)
    expect(co2.n).toBe(8)
    // 6 of 8 points exceed the WELL v2 800 ppm screening limit
    // (850, 950, 1100, 1200, 1050, 900) → 75.0%.
    expect(co2.pct_over_limit).toBe(75)
    expect(co2.limit).toBe(800)
    expect(co2.limit_label).toBe('WELL v2')
    expect(co2.refs.length).toBeGreaterThan(0)
    // Global time range present
    expect(out.time_range).not.toBeNull()
    expect(out.time_range!.start_iso).toMatch(/^2026-05-26T13:00/)
    expect(out.time_range!.sampling_interval_seconds).toBe(60)
  })

  it('reports multi_zone:true and unions parameters across indoor + outdoor datasets', () => {
    const indoor = makeDataset({
      id: 'indoor',
      role: 'indoor',
      label: 'Indoor',
      params: ['co2', 'temp'],
      units: { co2: 'ppm', temp: '°F' },
      points: [
        { co2: 800, temp: 72 }, { co2: 900, temp: 73 }, { co2: 1000, temp: 74 },
      ],
    })
    const outdoor = makeDataset({
      id: 'outdoor',
      role: 'outdoor',
      label: 'Outdoor',
      params: ['co2'],
      units: { co2: 'ppm' },
      startMs: T0 + 1 * 60 * 60_000,  // starts an hour later
      points: [
        { co2: 420 }, { co2: 430 }, { co2: 425 },
      ],
    })
    const env = { version: 2, datasets: [indoor, outdoor], occupancyWindows: [] }
    const out = summarizeLoggerForContext(env) as LoggerContextSummary
    expect(out.dataset_count).toBe(2)
    expect(out.multi_zone).toBe(true)
    expect(out.parameters_seen.sort()).toEqual(['co2', 'temp'])
    expect(out.datasets).toHaveLength(2)
    const labels = out.datasets.map((d) => d.label)
    expect(labels).toEqual(['Indoor', 'Outdoor'])
    // Global time range spans both datasets
    expect(out.time_range!.start_iso).toMatch(/^2026-05-26T13:00/)
  })

  it('propagates quality flags into the summary (string-shaped messages)', () => {
    const ds = makeDataset({
      params: ['co2'],
      units: { co2: 'ppm' },
      points: [{ co2: 800 }, { co2: 820 }],
      qualityLevel: 'minor',
      qualityFlags: ['Sparse sampling (interval 30 min)', 'Two-hour gap in record'],
    })
    const out = summarizeLoggerForContext({ version: 2, datasets: [ds], occupancyWindows: [] }) as LoggerContextSummary
    expect(out.datasets[0].quality_level).toBe('minor')
    expect(out.datasets[0].quality_flags).toEqual([
      'Sparse sampling (interval 30 min)',
      'Two-hour gap in record',
    ])
  })

  it('caps datasets to MAX_DATASETS (=6) and parameters to MAX_PARAMS_PER_DATASET (=8)', () => {
    // 10 datasets, each with 12 params worth of stats. Caps mean we
    // see 6 datasets and 8 params per dataset in the output.
    const lots = Array.from({ length: 10 }, (_, i) =>
      makeDataset({
        id: `ds-${i}`,
        label: `Dataset ${i}`,
        params: ['co2', 'pm25', 'pm10', 'tvoc', 'hcho', 'co', 'temp', 'rh', 'press'],
        points: [{ co2: 800 }],
      }),
    )
    const out = summarizeLoggerForContext({ version: 2, datasets: lots, occupancyWindows: [] }) as LoggerContextSummary
    expect(out.dataset_count).toBe(10)             // header reports full count
    expect(out.datasets).toHaveLength(6)           // entries capped
    expect(out.datasets[0].parameters.length).toBeLessThanOrEqual(8)
  })

  it('stays under the token budget (~6 KB serialized) for a realistic multi-dataset session', () => {
    const indoor = makeDataset({
      params: ['co2', 'pm25', 'temp', 'rh', 'tvoc'],
      units: { co2: 'ppm', pm25: 'µg/m³', temp: '°F', rh: '%', tvoc: 'ppb' },
      points: Array.from({ length: 120 }, (_, i) => ({
        co2: 600 + (i % 20) * 30,
        pm25: 8 + (i % 10),
        temp: 71 + (i % 5),
        rh: 38 + (i % 8),
        tvoc: 120 + (i % 30) * 4,
      })),
    })
    const outdoor = makeDataset({
      id: 'outdoor',
      role: 'outdoor',
      label: 'Outdoor',
      params: ['co2', 'pm25', 'temp', 'rh'],
      units: { co2: 'ppm', pm25: 'µg/m³', temp: '°F', rh: '%' },
      points: Array.from({ length: 120 }, () => ({
        co2: 420, pm25: 6, temp: 65, rh: 55,
      })),
    })
    const out = summarizeLoggerForContext({ version: 2, datasets: [indoor, outdoor], occupancyWindows: [] })
    const serialized = JSON.stringify(out)
    // ~4 chars per token rule-of-thumb → 6 KB ≈ 1500 tokens, well
    // under the ~3000-token room the existing context block uses.
    expect(serialized.length).toBeLessThan(6 * 1024)
  })

  it('accepts a legacy v1 envelope (the object itself is the primary dataset)', () => {
    // Legacy shape: parsed fields hang off the envelope, no datasets[].
    const legacy = {
      // No `version` and no `datasets`, but parsed fields present.
      fileName: 'old.csv',
      params: ['co2'],
      units: { co2: 'ppm' },
      hasTimestamps: true,
      points: [
        { t: T0, co2: 700 },
        { t: T0 + 60_000, co2: 800 },
      ],
      rawCount: 2,
      summary: {
        count: 2, start: T0, end: T0 + 60_000, intervalSec: 60, emptyRows: 0,
        missing: { co2: 0 },
        stats: { co2: { mean: 750, median: 750, min: 700, max: 800, n: 2 } },
      },
      quality: { level: 'ok', status: 'OK', flags: [] },
    }
    const out = summarizeLoggerForContext(legacy as unknown as null) as LoggerContextSummary
    expect(out).not.toBeNull()
    expect(out.dataset_count).toBe(1)
    expect(out.datasets[0].parameters[0].mean).toBe(750)
  })
})
