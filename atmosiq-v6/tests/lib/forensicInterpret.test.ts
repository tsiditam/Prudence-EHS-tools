/**
 * The wire projection and the generation path.
 *
 * Two questions, both deterministic and both testable without a model: does
 * the payload say the same thing the bundle says, and does what comes back
 * still have to clear the gate?
 */
import { describe, it, expect, vi } from 'vitest'
import { buildForensicBundle } from '../../src/utils/forensicBundle.js'
import { bundleForWriter, WIRE_BUDGET_CHARS } from '../../src/utils/forensicWire.js'
import { evidenceScopeForPattern } from '../../src/utils/forensicValidate.js'
import { generateForensicInterpretation } from '../../src/engines/forensicInterpret.js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0)
const Q = 15 * 60_000

const multiDay = (days: number, f: (d: number, h: number, i: number) => any) => {
  const pts: any[] = []
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 96; i++) pts.push({ t: T0 + d * DAY + i * Q, ...f(d, Math.floor((i * 15) / 60), i) })
  }
  return pts
}
const mkDataset = (id: string, role: string, label: string, points: any[], params: string[], units: any = {}) => ({
  id, role, label, points, params, units, hasTimestamps: true, fileName: `${id}.csv`,
  summary: { start: points[0]?.t, end: points[points.length - 1]?.t, intervalSec: 900, count: points.length },
})

const input = {
  sensorData: {
    version: 2,
    datasets: [
      mkDataset('primary', 'indoor', 'Indoor', multiDay(4, (_d, h, i) => ({
        co2: 500 + 200 * Math.cos(((h - 14) / 24) * 2 * Math.PI),
        pm: i === 50 ? 180 : 10 + (i % 5),
      })), ['co2', 'pm'], { co2: 'ppm', pm: 'µg/m³' }),
      mkDataset('ds-out', 'outdoor', 'Outdoor', multiDay(4, (_d, _h, i) => ({ pm: 9 + (i % 5) })), ['pm'], { pm: 'µg/m³' }),
    ],
    occupancyWindows: [{ id: 'occ-1', start: T0 + 9 * 3600_000, end: T0 + 17 * 3600_000, kind: 'occupied' }],
    graphs: {}, thresholds: {},
  },
  annotations: [{ id: 'e1', t: T0 + 50 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted', note: 'turned the fan up' }],
  context: { objective: 'x', location: { building: 'N' }, instrument: { make: 'A' }, calibration: { date: '2026-01-15' } },
  utcOffsetMin: 0,
  generatedAt: '2026-03-10T00:00:00.000Z',
}
const bundle: any = buildForensicBundle(input)

describe('the wire form is a projection of the bundle, never a second reading of it', () => {
  const wire: any = bundleForWriter(bundle)

  it('carries the fingerprint, the patterns and the registry unchanged', () => {
    expect(wire.fingerprint).toBe(bundle.fingerprint)
    expect(wire.patterns).toHaveLength(bundle.patterns.length)
    expect(wire.events).toHaveLength(bundle.events.length)
    expect(wire.evidence).toEqual(bundle.evidence)
    expect(wire.omitted).toEqual([])
  })

  it('gives each pattern the citable set the validator will hold it to', () => {
    for (const p of wire.patterns) {
      const scope = evidenceScopeForPattern(bundle, p.id)
      expect(p.citable_evidence_ids, p.id).toEqual([...scope.ids].sort())
    }
  })

  it('copies figures rather than recomputing them', () => {
    const co2 = bundle.parameters.find((p: any) => p.param === 'co2')
    const wired = wire.parameters.find((p: any) => p.id === co2.id)
    expect(wired.unit).toBe(co2.unit)
    expect(wired.stats.n).toBe(co2.stats.n)
    expect(wired.stats.mean).toBe(Math.round(co2.stats.mean * 1000) / 1000)
    expect(wired.stats.max).toBe(Math.round(co2.stats.max * 1000) / 1000)
  })

  it('carries the annotation note, because the fingerprint protects a version of it', () => {
    expect(wire.context.annotations[0].note).toBe('turned the fan up')
  })

  it('says that no HVAC schedule is available, which is true by construction', () => {
    expect(wire.context.available.hvac_schedule).toBe(false)
  })
})

describe('trimming only ever removes, and says what it removed', () => {
  it('sheds elaboration in order until the payload fits', () => {
    const tight: any = bundleForWriter(bundle, { budgetChars: 1200 })
    expect(tight.omitted.length).toBeGreaterThan(0)
    expect(tight.omitted[0]).toBe('per_day_cycle_detail')
    // The per-day rows go; the cycle and its aggregate figures stay.
    const cycle = tight.patterns.find((p: any) => p.kind === 'recurring_cycle')
    expect(cycle.summary.days).toBeUndefined()
    expect(cycle.summary.daysObserved).toBe(4)
  })

  it('never sheds a pattern, an event, an id or a context gap', () => {
    const tight: any = bundleForWriter(bundle, { budgetChars: 500 })
    expect(tight.patterns).toHaveLength(bundle.patterns.length)
    expect(tight.events).toHaveLength(bundle.events.length)
    expect(tight.evidence).toEqual(bundle.evidence)
    tight.patterns.forEach((p: any, i: number) => {
      expect(p.missing_context.map((m: any) => m.id)).toEqual(bundle.patterns[i].missingContext.map((m: any) => m.id))
      expect(p.citable_evidence_ids.length).toBeGreaterThan(0)
    })
  })

  it('keeps the occupancy COUNT when it drops the window list', () => {
    // `context.available.occupancy` and every occupancy statistic depend on
    // windows existing. Dropping the list without saying how many there were
    // would leave the model reading a session that looks unoccupied.
    const tight: any = bundleForWriter(bundle, { budgetChars: 500 })
    expect(tight.omitted).toContain('occupancy_window_list')
    expect(tight.context.occupancy_windows).toEqual([])
    expect(tight.context.occupancy_window_count).toBe(1)
    expect(tight.context.available.occupancy).toBe(true)
  })

  it('agrees with the handler about the budget', () => {
    const api = require('../../api/forensic-interpret.js')
    expect(WIRE_BUDGET_CHARS).toBe(api.__test.MAX_PAYLOAD_CHARS)
  })

  it('does not throw on a bundle that is not one', () => {
    expect(() => bundleForWriter(null as never)).not.toThrow()
    expect(bundleForWriter(undefined as never).patterns).toEqual([])
  })
})

describe('the generation path gates what comes back', () => {
  const cycle = bundle.patterns.find((p: any) => p.kind === 'recurring_cycle')
  const reply = (interpretations: any[], model = 'claude-sonnet-4-6') => vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ output: { interpretations }, parse: { status: 'ok' }, model }),
  }))
  const replyRaw = (body: any) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }))
  const good = (over: any = {}) => ({
    pattern_id: cycle.id,
    title: 'Repeating daily swing',
    importance: 'worth_review',
    interpretation: 'The recurring shape is consistent with scheduled occupancy. It cannot distinguish that from mechanical operation and requires confirmation.',
    alternative_explanations: ['A timed system start may contribute to the same shape.'],
    missing_context_ids: [],
    recommended_reviews: ['Compare the pattern against the operating schedule; this warrants review.'],
    report_candidate: true,
    evidence_ids: [],
    ...over,
  })

  it('validates a good reading and persists a record bound to this session', async () => {
    const r: any = await generateForensicInterpretation(input, { fetch: reply([good()]), supabase: null })
    expect(r.error).toBe(null)
    expect(r.validation.status).toBe('validated')
    expect(r.record.fingerprint).toBe(bundle.fingerprint)
    expect(r.record.interpretations).toHaveLength(1)
    expect(r.record.model.name).toBe('claude-sonnet-4-6')
  })

  it('rejects a reading that cites another pattern’s evidence, even after the server passed it', async () => {
    // The handler runs the liability floor only. This is the different
    // question, and it is the reason the client gate is not optional.
    const pmEvent = bundle.evidence.eventIds.find((id: string) => id.includes('-pm-'))
    const r: any = await generateForensicInterpretation(input, { fetch: reply([good({ evidence_ids: [pmEvent] })]), supabase: null })
    expect(r.validation.status).toBe('rejected')
    expect(r.validation.rejected[0].reason).toBe('evidence_not_on_pattern')
    expect(r.record.interpretations).toEqual([])
  })

  it('rejects a number the session does not carry', async () => {
    const r: any = await generateForensicInterpretation(input, {
      fetch: reply([good({ interpretation: 'The correlation was 0.93, which warrants review and requires confirmation.' })]),
      supabase: null,
    })
    expect(r.validation.rejected[0].reason).toBe('digits_in_prose')
  })

  it('persists a valid empty response as empty', async () => {
    const r: any = await generateForensicInterpretation(input, { fetch: reply([]), supabase: null })
    expect(r.error).toBe(null)
    expect(r.validation.status).toBe('empty')
    expect(r.record.validation.status).toBe('empty')
    expect(r.record.validation.reasons).toEqual([])
  })

  it('persists a response the handler could not parse as rejected, never as empty', async () => {
    // Invalid JSON, a missing list, and the wrong top-level type. The model
    // tried and what came back was unusable — the opposite of a model that
    // read the session and validly raised nothing.
    const cases: Array<[any, string, string]> = [
      [{ status: 'unparseable', detail: 'invalid_json' }, 'unparseable_output', 'invalid_json'],
      [{ status: 'malformed', detail: 'missing_interpretations' }, 'malformed_output', 'missing_interpretations'],
      [{ status: 'malformed', detail: 'not_an_object' }, 'malformed_output', 'not_an_object'],
    ]
    for (const [parse, reason, detail] of cases) {
      const r: any = await generateForensicInterpretation(input, { fetch: replyRaw({ output: null, parse, model: 'm' }), supabase: null })
      expect(r.error, reason).toBe(null)
      expect(r.validation.status, reason).toBe('rejected')
      expect(r.validation.rejected, reason).toEqual([{ reason, detail }])
      expect(r.record.validation.status, reason).toBe('rejected')
      expect(r.record.validation.reasons, reason).toEqual([reason])
      expect(r.record.interpretations, reason).toEqual([])
      expect(r.record.fingerprint, reason).toBe(bundle.fingerprint)
    }
  })

  it('does not trust an output the handler sent alongside a failed parse', async () => {
    const r: any = await generateForensicInterpretation(input, {
      fetch: replyRaw({ output: { interpretations: [good()] }, parse: { status: 'malformed', detail: 'not_an_object' }, model: 'm' }),
      supabase: null,
    })
    expect(r.validation.status).toBe('rejected')
  })

  it('sends the wire form, not the bundle', async () => {
    const f = reply([])
    await generateForensicInterpretation(input, { fetch: f, supabase: null })
    const body = JSON.parse((f.mock.calls[0] as any)[1].body)
    expect(body.payload.bundle.fingerprint).toBe(bundle.fingerprint)
    expect(body.payload.bundle.patterns[0].citable_evidence_ids).toBeTruthy()
    expect(JSON.stringify(body).length).toBeLessThanOrEqual(WIRE_BUDGET_CHARS)
  })

  it('does not spend a generation when nothing was detected', async () => {
    const f = vi.fn()
    const r: any = await generateForensicInterpretation({ sensorData: { version: 2, datasets: [] } }, { fetch: f, supabase: null })
    expect(f).not.toHaveBeenCalled()
    expect(r.record).toBe(null)
    expect(r.error).toContain('No forensic patterns were detected')
    // Not "repeating": most forensic patterns are not recurrence patterns.
    expect(r.error).not.toContain('repeating')
  })

  it('surfaces the server’s own message rather than a bare try-again', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 402, json: async () => ({ error: 'upstream_400', message: 'The AI service account needs attention.' }) }))
    const r: any = await generateForensicInterpretation(input, { fetch: f, supabase: null })
    expect(r.record).toBe(null)
    expect(r.error).toBe('The AI service account needs attention.')
    // The bundle still comes back, so the deterministic surface stands.
    expect(r.bundle.fingerprint).toBe(bundle.fingerprint)
  })

  it('survives the service being unreachable', async () => {
    const f = vi.fn(async () => { throw new Error('network down') })
    const r: any = await generateForensicInterpretation(input, { fetch: f, supabase: null })
    expect(r.record).toBe(null)
    expect(r.error).toContain('could not be reached')
  })
})
