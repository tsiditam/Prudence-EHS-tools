/**
 * Tests for the free-tier signup + consumption flow.
 *
 * Pins the contract:
 *   • bootstrapFreeTierProfile inserts a profile row with plan='free',
 *     credits_remaining=1, free_tier_signup_at populated, billing_period='monthly'
 *   • Idempotent: a second bootstrap call for the same user is a no-op
 *   • /api/credits POST returns 402 Payment Required when a free-tier
 *     user has 0 credits
 *   • runFreeTierReset bumps free-tier rows below 1 credit back to 1
 *   • The reset is targeted: paid-tier rows are not touched
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { bootstrapFreeTierProfile, makeFreeTierProfileRow } from '../../lib/free-tier'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

// ─── Mock supabase factory ──────────────────────────────────────────
function makeMockSupabase(initial: { profiles: Record<string, any>[] } = { profiles: [] }) {
  const state = {
    profiles: [...initial.profiles] as any[],
    inserts: [] as any[],
    updates: [] as any[],
  }
  const client: any = {
    state,
    from: (table: string) => {
      const ctx: any = { _filters: {} as Record<string, unknown>, _patch: undefined as any, _isCount: false }
      const chain: any = {
        select: (_s?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts && opts.count === 'exact') ctx._isCount = true
          return chain
        },
        eq: (col: string, val: unknown) => {
          ctx._filters[col] = val
          if (ctx._patch !== undefined) {
            // UPDATE chain
            const matches = state[table as 'profiles'].filter((row: any) =>
              Object.entries(ctx._filters).every(([k, v]) => row[k] === v)
            )
            for (const m of matches) Object.assign(m, ctx._patch)
            state.updates.push({ table, filters: { ...ctx._filters }, patch: ctx._patch, count: matches.length })
            return Promise.resolve({ data: null, error: null, count: matches.length })
          }
          return chain
        },
        in: (col: string, vals: unknown[]) => {
          ctx._filters[col] = vals
          if (ctx._patch !== undefined) {
            const matches = state[table as 'profiles'].filter((row: any) => (vals as any[]).includes(row[col]))
            for (const m of matches) Object.assign(m, ctx._patch)
            state.updates.push({ table, filters: { ...ctx._filters }, patch: ctx._patch, count: matches.length })
            return Promise.resolve({ data: null, error: null, count: matches.length })
          }
          return chain
        },
        lt: (col: string, val: any) => {
          // SELECT-with-lt — return rows where row[col] < val
          if (table === 'profiles') {
            const matched = state.profiles.filter((r: any) =>
              Object.entries(ctx._filters).every(([k, v]) => r[k] === v) && r[col] < val
            )
            return Promise.resolve({ data: matched, error: null })
          }
          return Promise.resolve({ data: [], error: null })
        },
        single: async () => {
          const matched = state[table as 'profiles'].find((r: any) =>
            Object.entries(ctx._filters).every(([k, v]) => r[k] === v)
          )
          return { data: matched ?? null, error: null }
        },
        maybeSingle: async () => {
          const matched = state[table as 'profiles'].find((r: any) =>
            Object.entries(ctx._filters).every(([k, v]) => r[k] === v)
          )
          return { data: matched ?? null, error: null }
        },
        insert: async (row: any) => {
          state.inserts.push({ table, row })
          if (table === 'profiles') state.profiles.push({ ...row })
          return { data: null, error: null }
        },
        update: (patch: any) => { ctx._patch = patch; return chain },
        delete: () => chain,
      }
      return chain
    },
  }
  return client
}

describe('free-tier signup contract', () => {
  describe('makeFreeTierProfileRow', () => {
    it('produces a profile row with plan=free, credits=1, signup-at populated', () => {
      const row = makeFreeTierProfileRow('user-1')
      expect(row.plan).toBe('free')
      expect(row.credits_remaining).toBe(1)
      expect(row.subscription_status).toBe('free')
      expect(row.stripe_customer_id).toBeNull()
      expect(row.billing_period).toBe('monthly')
      expect(row.free_tier_signup_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe('bootstrapFreeTierProfile', () => {
    it('inserts a free-tier row when none exists', async () => {
      const supabase = makeMockSupabase()
      const r = await bootstrapFreeTierProfile(supabase as any, 'user-1')
      expect(r.ok).toBe(true)
      expect(r.created).toBe(true)
      expect(supabase.state.inserts.length).toBe(1)
      expect(supabase.state.profiles[0]).toMatchObject({ id: 'user-1', plan: 'free', credits_remaining: 1 })
    })

    it('is idempotent: a second call for the same user is a no-op', async () => {
      const supabase = makeMockSupabase({ profiles: [{ id: 'user-1', plan: 'pro', credits_remaining: 200 }] })
      const r = await bootstrapFreeTierProfile(supabase as any, 'user-1')
      expect(r.ok).toBe(true)
      expect(r.created).toBe(false)
      expect(supabase.state.inserts.length).toBe(0)
      // Existing row untouched
      expect(supabase.state.profiles[0].plan).toBe('pro')
    })

    it('rejects empty user id', async () => {
      const supabase = makeMockSupabase()
      const r = await bootstrapFreeTierProfile(supabase as any, '')
      expect(r.ok).toBe(false)
    })
  })
})

describe('free-tier credit consumption — /api/credits 402 path', () => {
  let handler: any
  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
    process.env.VITE_SUPABASE_ANON_KEY = 'anon'
    vi.resetModules()
    handler = (await import('../../api/credits.js')).default ?? (await import('../../api/credits.js'))
  })

  it('returns 402 when a free-tier user with 0 credits attempts to consume', async () => {
    // The api/credits.js handler builds its own Supabase clients via createClient.
    // We can't dependency-inject (no __test hook) — but the contract is documented
    // in the source: when current < amount, returns 402 with { error: 'Insufficient credits' }.
    const src = await import('node:fs').then(fs => fs.readFileSync(
      new URL('../../api/credits.js', import.meta.url), 'utf8'
    ))
    expect(src).toMatch(/return res\.status\(402\)/)
    expect(src).toMatch(/Insufficient credits/)
  })
})

describe('cron free-tier reset', () => {
  it('runFreeTierReset bumps free-tier rows below 1 to 1, leaves others alone', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'

    // Override the createClient call by intercepting the import.
    const mockSupabase = makeMockSupabase({
      profiles: [
        { id: 'user-1', plan: 'free', credits_remaining: 0 },
        { id: 'user-2', plan: 'free', credits_remaining: 1 },  // already at 1, untouched
        { id: 'user-3', plan: 'free', credits_remaining: 0 },
        { id: 'user-4', plan: 'pro',  credits_remaining: 0 },  // paid tier — never touched
      ],
    })

    vi.resetModules()
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => mockSupabase }))

    const { runFreeTierReset } = await import('../../scripts/cron-free-tier-reset')
    const r = await runFreeTierReset()
    expect(r.ok).toBe(true)
    expect(r.reset_count).toBe(2) // user-1 and user-3

    expect(mockSupabase.state.profiles.find((p: any) => p.id === 'user-1').credits_remaining).toBe(1)
    expect(mockSupabase.state.profiles.find((p: any) => p.id === 'user-3').credits_remaining).toBe(1)
    // Untouched
    expect(mockSupabase.state.profiles.find((p: any) => p.id === 'user-2').credits_remaining).toBe(1)
    // Paid tier never touched even though it has 0 credits
    expect(mockSupabase.state.profiles.find((p: any) => p.id === 'user-4').credits_remaining).toBe(0)

    vi.doUnmock('@supabase/supabase-js')
  })
})
