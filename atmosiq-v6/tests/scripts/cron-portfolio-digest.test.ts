/**
 * Tests for scripts/cron-portfolio-digest.ts.
 *
 * Pins the contract:
 *   • Profiles older than the prior-quarter start are scanned;
 *     younger profiles are filtered server-side via the SELECT predicate.
 *   • Per-user audit_log fetch is bounded to the two-quarter window.
 *   • Opt-out (email_preferences.portfolio_digest=false) skips.
 *   • Ineligible profiles (< 2 assessments) skip.
 *   • Eligible profiles get a digest enqueued with stats payload.
 *   • Re-run is a no-op for already-enqueued quarters.
 *   • Result reports {scanned, enqueued, skipped_*}.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const NOW = new Date('2026-07-01T13:00:00Z')   // first day of Q3

interface ProfileFixture {
  id: string
  created_at: string
  email_preferences: { portfolio_digest?: boolean } | null
}
interface AuditFixture {
  actor_id: string
  action: string
  created_at: string
  target_id?: string | null
  details?: Record<string, unknown> | null
}
interface QueueRow {
  id: number
  user_id: string
  template_id: string
  sent_at: string | null
  canceled_at: string | null
  payload?: Record<string, unknown>
}

function makeMockSupabase(profiles: ProfileFixture[], audit: AuditFixture[], queueSeed: QueueRow[] = []) {
  const queue: QueueRow[] = [...queueSeed]
  let nextId = (queue.length || 0) + 1
  const inserts: QueueRow[] = []

  function profilesChain() {
    const ctx: { lte?: string; range?: [number, number] } = {}
    const chain: Record<string, unknown> = {
      select() { return chain },
      lte(_col: string, val: string) { ctx.lte = val; return chain },
      range(from: number, to: number) {
        ctx.range = [from, to]
        const filtered = ctx.lte
          ? profiles.filter(p => new Date(p.created_at).getTime() <= new Date(ctx.lte!).getTime())
          : profiles
        return Promise.resolve({ data: filtered.slice(from, to + 1), error: null })
      },
    }
    return chain
  }

  function auditChain() {
    const ctx: { filters: Record<string, string>; gte?: string; lt?: string; limit?: number } = { filters: {} }
    const chain: Record<string, unknown> = {
      select() { return chain },
      eq(col: string, val: string) { ctx.filters[col] = val; return chain },
      gte(_col: string, val: string) { ctx.gte = val; return chain },
      lt(_col: string, val: string) { ctx.lt = val; return chain },
      order() { return chain },
      limit(n: number) {
        ctx.limit = n
        let out = audit.filter(a => Object.entries(ctx.filters).every(([k, v]) => (a as unknown as Record<string, string>)[k] === v))
        if (ctx.gte) out = out.filter(a => new Date(a.created_at).getTime() >= new Date(ctx.gte!).getTime())
        if (ctx.lt)  out = out.filter(a => new Date(a.created_at).getTime() <  new Date(ctx.lt!).getTime())
        return Promise.resolve({ data: out.slice(0, n), error: null })
      },
    }
    return chain
  }

  function emailQueueChain() {
    const ctx: { filters: Record<string, unknown>; mode?: 'select' | 'insert' } = { filters: {} }
    let resolved = false
    const chain: Record<string, unknown> = {
      select() { ctx.mode = 'select'; return chain },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return chain },
      insert: async (row: Record<string, unknown>) => {
        const r: QueueRow = {
          id: nextId++,
          user_id: row.user_id as string,
          template_id: row.template_id as string,
          sent_at: null,
          canceled_at: null,
          payload: row.payload as Record<string, unknown>,
        }
        queue.push(r)
        inserts.push(r)
        return { error: null }
      },
      then(resolve_: (v: unknown) => void) {
        if (resolved) return
        resolved = true
        const matches = queue.filter(r => Object.entries(ctx.filters).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v))
        resolve_({ data: matches, error: null })
      },
    }
    return chain
  }

  return {
    state: { queue, inserts },
    from(table: string) {
      if (table === 'profiles')    return profilesChain()
      if (table === 'audit_log')   return auditChain()
      if (table === 'email_queue') return emailQueueChain()
      throw new Error('unexpected table: ' + table)
    },
  }
}

let activeMock: ReturnType<typeof makeMockSupabase> | null = null
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => activeMock,
}))

import { runPortfolioDigestEnqueue } from '../../scripts/cron-portfolio-digest'

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})
afterEach(() => {
  activeMock = null
})

function finalize(actorId: string, isoTs: string, siteId?: string): AuditFixture {
  return {
    actor_id: actorId,
    action: 'assessment_finalized',
    created_at: isoTs,
    details: siteId ? { site_id: siteId } : null,
  }
}

describe('cron-portfolio-digest — happy paths', () => {
  it('enqueues a digest for an eligible user', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      created_at: '2025-01-01T00:00:00Z',
      email_preferences: null,
    }
    const audit: AuditFixture[] = [
      finalize('u1', '2026-04-10T10:00:00Z', 'site-a'),
      finalize('u1', '2026-05-15T10:00:00Z', 'site-b'),
      finalize('u1', '2026-06-20T10:00:00Z', 'site-a'),
    ]
    activeMock = makeMockSupabase([profile], audit)
    const r = await runPortfolioDigestEnqueue(NOW)
    expect(r.ok).toBe(true)
    expect(r.scanned).toBe(1)
    expect(r.enqueued).toBe(1)
    expect(activeMock!.state.inserts).toHaveLength(1)
    const payload = activeMock!.state.inserts[0].payload!
    expect(payload.quarter_key).toBe('2026-Q2')
    expect(payload.assessments_finalized).toBe(3)
    expect(payload.distinct_sites).toBe(2)
  })

  it('uses prior quarter as "this quarter" since cron fires on Q boundary', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      created_at: '2025-01-01T00:00:00Z',
      email_preferences: null,
    }
    const audit: AuditFixture[] = [
      finalize('u1', '2026-04-10T10:00:00Z'),
      finalize('u1', '2026-05-15T10:00:00Z'),
      finalize('u1', '2026-07-01T01:00:00Z'),  // Q3 — should NOT be counted
    ]
    activeMock = makeMockSupabase([profile], audit)
    const r = await runPortfolioDigestEnqueue(NOW)
    expect(r.enqueued).toBe(1)
    expect(activeMock!.state.inserts[0].payload!.quarter_label).toBe('Q2 2026')
    expect(activeMock!.state.inserts[0].payload!.assessments_finalized).toBe(2)
  })

  it('skips a user with portfolio_digest=false', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      created_at: '2025-01-01T00:00:00Z',
      email_preferences: { portfolio_digest: false },
    }
    const audit: AuditFixture[] = [
      finalize('u1', '2026-04-10T10:00:00Z'),
      finalize('u1', '2026-05-15T10:00:00Z'),
    ]
    activeMock = makeMockSupabase([profile], audit)
    const r = await runPortfolioDigestEnqueue(NOW)
    expect(r.scanned).toBe(1)
    expect(r.skipped_opt_out).toBe(1)
    expect(r.enqueued).toBe(0)
  })

  it('skips a user with < 2 assessments in the quarter', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      created_at: '2025-01-01T00:00:00Z',
      email_preferences: null,
    }
    const audit: AuditFixture[] = [
      finalize('u1', '2026-04-10T10:00:00Z'),  // only 1 in Q2
    ]
    activeMock = makeMockSupabase([profile], audit)
    const r = await runPortfolioDigestEnqueue(NOW)
    expect(r.skipped_ineligible).toBe(1)
    expect(r.enqueued).toBe(0)
  })
})

describe('cron-portfolio-digest — idempotency', () => {
  it('skipped_existing increments when a row for this quarter already exists', async () => {
    const profile: ProfileFixture = {
      id: 'u1',
      created_at: '2025-01-01T00:00:00Z',
      email_preferences: null,
    }
    const audit: AuditFixture[] = [
      finalize('u1', '2026-04-10T10:00:00Z'),
      finalize('u1', '2026-05-10T10:00:00Z'),
    ]
    const seed: QueueRow[] = [
      {
        id: 1, user_id: 'u1', template_id: 'portfolio.digest',
        sent_at: '2026-07-01T13:30:00Z', canceled_at: null,
        payload: { quarter_key: '2026-Q2' },
      },
    ]
    activeMock = makeMockSupabase([profile], audit, seed)
    const r = await runPortfolioDigestEnqueue(NOW)
    expect(r.skipped_existing).toBe(1)
    expect(r.enqueued).toBe(0)
  })
})

describe('cron-portfolio-digest — env handling', () => {
  it('returns ok=false when env is missing', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const r = await runPortfolioDigestEnqueue(NOW)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/SUPABASE_URL/)
  })
})
