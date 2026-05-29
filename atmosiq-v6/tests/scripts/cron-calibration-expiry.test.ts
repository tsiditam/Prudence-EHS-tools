/**
 * Tests for scripts/cron-calibration-expiry.ts.
 *
 * Pins the contract:
 *   • Skips profiles with no instruments.
 *   • Skips profiles that opted out (email_preferences.calibration_expiry=false).
 *   • Enqueues 'expiring' when daysToExpiry in [0, CAL_WARN_DAYS].
 *   • Enqueues 'expired' when daysToExpiry < 0.
 *   • Does NOT enqueue when calibration is fresh.
 *   • Both IAQ and PID instruments are evaluated independently.
 *   • Idempotent across runs (no double-enqueue for same cal_date).
 *   • Reports counters (scanned / enqueued / skipped_opt_out / skipped_existing).
 *
 * The supabase mock here is intentionally lighter than the api/events
 * one — only the queries this cron makes (profiles select.range,
 * email_queue select/insert/update) need to be supported.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CAL_VALIDITY_DAYS, CAL_WARN_DAYS } from '../../lib/calibration/banner-state'

const NOW = new Date('2026-05-29T12:00:00Z')

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10)
}

interface ProfileFixture {
  id: string
  iaq_meter: string | null
  iaq_cal_date: string | null
  pid_meter: string | null
  pid_cal_date: string | null
  email_preferences: { calibration_expiry?: boolean } | null
}

interface QueueRow {
  id: number
  user_id: string
  template_id: string
  scheduled_for?: string
  sent_at: string | null
  canceled_at: string | null
  payload?: { instrument_key?: string; cal_date?: string; kind?: string; meter?: string; days_to_expiry?: number }
}

function makeMockSupabase(profiles: ProfileFixture[], queueSeed: QueueRow[] = []) {
  const queue: QueueRow[] = [...queueSeed]
  let nextId = (queue.length || 0) + 1
  const inserts: QueueRow[] = []
  const updates: Array<{ ids: number[]; patch: Partial<QueueRow> }> = []

  function profilesChain() {
    const ctx: { range?: [number, number] } = {}
    const chain: Record<string, unknown> = {
      select() { return chain },
      range(from: number, to: number) {
        ctx.range = [from, to]
        return Promise.resolve({ data: profiles.slice(from, to + 1), error: null })
      },
    }
    return chain
  }

  function emailQueueChain() {
    const ctx: { filters: Record<string, unknown>; mode?: 'select' | 'update' | 'insert'; patch?: Partial<QueueRow>; inIds?: number[] } = { filters: {} }
    let resolved = false
    const chain: Record<string, unknown> = {
      select() { ctx.mode = 'select'; return chain },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return chain },
      update(patch: Partial<QueueRow>) { ctx.mode = 'update'; ctx.patch = patch; return chain },
      in(_col: string, vals: number[]) {
        ctx.inIds = vals
        if (ctx.mode === 'update' && ctx.patch) {
          for (const id of vals) {
            const row = queue.find(r => r.id === id)
            if (row) Object.assign(row, ctx.patch)
          }
          updates.push({ ids: [...vals], patch: { ...ctx.patch } })
        }
        resolved = true
        return Promise.resolve({ data: null, error: null }) as unknown as Record<string, unknown>
      },
      insert: async (row: Record<string, unknown>) => {
        const r: QueueRow = {
          id: nextId++,
          user_id: row.user_id as string,
          template_id: row.template_id as string,
          scheduled_for: row.scheduled_for as string,
          sent_at: null,
          canceled_at: null,
          payload: row.payload as QueueRow['payload'],
        }
        queue.push(r)
        inserts.push(r)
        return { error: null }
      },
      then(resolve: (v: unknown) => void) {
        if (resolved) return
        resolved = true
        // select() path
        const matches = queue.filter(r => Object.entries(ctx.filters).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v))
        resolve({ data: matches, error: null })
      },
    }
    return chain
  }

  return {
    state: { queue, inserts, updates },
    from(table: string) {
      if (table === 'profiles')    return profilesChain()
      if (table === 'email_queue') return emailQueueChain()
      throw new Error('unexpected table: ' + table)
    },
  }
}

// We mock @supabase/supabase-js so the cron's createClient returns
// our hand-rolled mock instead of trying to talk to the network.
let activeMock: ReturnType<typeof makeMockSupabase> | null = null
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => activeMock,
}))

import { runCalibrationExpiryScan } from '../../scripts/cron-calibration-expiry'

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})
afterEach(() => {
  activeMock = null
})

describe('cron-calibration-expiry — happy paths', () => {
  it('enqueues an "expiring" reminder when iaq is in the warn window', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      iaq_meter: 'Graywolf IQ-610',
      iaq_cal_date: daysAgoIso(CAL_VALIDITY_DAYS - 10),  // 10 days to expiry
      pid_meter: null,
      pid_cal_date: null,
      email_preferences: null,
    }
    activeMock = makeMockSupabase([profile])
    const r = await runCalibrationExpiryScan(NOW)
    expect(r.ok).toBe(true)
    expect(r.scanned).toBe(1)
    expect(r.enqueued).toBe(1)
    expect(activeMock!.state.inserts[0].template_id).toBe('calibration.expiring')
    expect(activeMock!.state.inserts[0].payload?.kind).toBe('expiring')
  })

  it('enqueues an "expired" reminder when iaq is past expiry', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      iaq_meter: 'Graywolf IQ-610',
      iaq_cal_date: daysAgoIso(CAL_VALIDITY_DAYS + 5),
      pid_meter: null,
      pid_cal_date: null,
      email_preferences: null,
    }
    activeMock = makeMockSupabase([profile])
    const r = await runCalibrationExpiryScan(NOW)
    expect(r.ok).toBe(true)
    expect(r.enqueued).toBe(1)
    expect(activeMock!.state.inserts[0].template_id).toBe('calibration.expired')
  })

  it('enqueues independently for IAQ and PID when both are out', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      iaq_meter: 'TSI 7575',
      iaq_cal_date: daysAgoIso(CAL_VALIDITY_DAYS - 5),
      pid_meter: 'RAE MiniRAE',
      pid_cal_date: daysAgoIso(CAL_VALIDITY_DAYS + 10),
      email_preferences: null,
    }
    activeMock = makeMockSupabase([profile])
    const r = await runCalibrationExpiryScan(NOW)
    expect(r.enqueued).toBe(2)
    const templates = activeMock!.state.inserts.map(i => i.template_id).sort()
    expect(templates).toEqual(['calibration.expired', 'calibration.expiring'])
  })

  it('does NOT enqueue when calibration is fresh', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      iaq_meter: 'TSI 7575',
      iaq_cal_date: daysAgoIso(100),  // 265 days remaining
      pid_meter: null, pid_cal_date: null,
      email_preferences: null,
    }
    activeMock = makeMockSupabase([profile])
    const r = await runCalibrationExpiryScan(NOW)
    expect(r.enqueued).toBe(0)
    expect(activeMock!.state.inserts).toHaveLength(0)
  })
})

describe('cron-calibration-expiry — opt-out + filters', () => {
  it('skips a profile with email_preferences.calibration_expiry=false', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      iaq_meter: 'TSI 7575',
      iaq_cal_date: daysAgoIso(CAL_VALIDITY_DAYS - 1),
      pid_meter: null, pid_cal_date: null,
      email_preferences: { calibration_expiry: false },
    }
    activeMock = makeMockSupabase([profile])
    const r = await runCalibrationExpiryScan(NOW)
    expect(r.skipped_opt_out).toBe(1)
    expect(r.enqueued).toBe(0)
  })

  it('skips a profile with no recorded instruments', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      iaq_meter: null, iaq_cal_date: null,
      pid_meter: null, pid_cal_date: null,
      email_preferences: null,
    }
    activeMock = makeMockSupabase([profile])
    const r = await runCalibrationExpiryScan(NOW)
    expect(r.enqueued).toBe(0)
    expect(r.scanned).toBe(1)
  })

  it('skips an instrument with meter set but no cal_date (no signal to act on)', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      iaq_meter: 'TSI 7575', iaq_cal_date: null,
      pid_meter: null, pid_cal_date: null,
      email_preferences: null,
    }
    activeMock = makeMockSupabase([profile])
    const r = await runCalibrationExpiryScan(NOW)
    expect(r.enqueued).toBe(0)
  })
})

describe('cron-calibration-expiry — idempotency', () => {
  it('reports skipped_existing when re-run finds a row already covering this cal_date', async () => {
    const calDate = daysAgoIso(CAL_VALIDITY_DAYS - 5)
    const profile: ProfileFixture = {
      id: 'u1',
      iaq_meter: 'TSI 7575', iaq_cal_date: calDate,
      pid_meter: null, pid_cal_date: null,
      email_preferences: null,
    }
    const seed: QueueRow[] = [
      {
        id: 1, user_id: 'u1', template_id: 'calibration.expiring',
        sent_at: '2026-05-28T13:00:00Z',  // already sent yesterday
        canceled_at: null,
        payload: { instrument_key: 'iaq', cal_date: calDate },
      },
    ]
    activeMock = makeMockSupabase([profile], seed)
    const r = await runCalibrationExpiryScan(NOW)
    expect(r.enqueued).toBe(0)
    expect(r.skipped_existing).toBe(1)
  })
})

describe('cron-calibration-expiry — env handling', () => {
  it('returns ok=false when env is missing', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const r = await runCalibrationExpiryScan(NOW)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/SUPABASE_URL/)
  })
})
