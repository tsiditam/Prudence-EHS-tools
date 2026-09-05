/**
 * @vitest-environment jsdom
 *
 * Offline sync queue — the cloud round trip (audit 2026-09 §4: C2, H3,
 * H5, H6, M5, M13, L1).
 *
 * supabaseClient is replaced with a scripted fake so every PostgREST
 * outcome (undefined column, unique violation, 034 conflict, expired
 * session, plain failure) can be produced on demand and every request
 * the storage layer makes is recorded with its row and filters.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type Call = {
  table: string
  op: string | null
  args: any
  select: string | null
  filters: Array<[string, ...any[]]>
}
type Outcome = { data?: any; error?: any }

const fake = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    user: { id: 'u-1', email: 'jane.doe@example.com', user_metadata: {} } as any,
    getUserError: null as any,
    handler: (async () => ({})) as (c: Call) => Promise<Outcome> | Outcome,
    signUpResult: null as any,
  }
  const client = {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.getUserError }),
      signUp: async () => state.signUpResult,
    },
    from(table: string) {
      const call: Call = { table, op: null, args: null, select: null, filters: [] }
      const builder: any = {}
      const run = async () => {
        state.calls.push(call)
        const r = await state.handler(call)
        return { data: null, error: null, ...(r || {}) }
      }
      const snap = (v: any) => JSON.parse(JSON.stringify(v ?? null))
      builder.upsert = (row: any) => { call.op = 'upsert'; call.args = snap(row); return builder }
      builder.insert = (row: any) => { call.op = 'insert'; call.args = snap(row); return builder }
      builder.update = (row: any) => { call.op = 'update'; call.args = snap(row); return builder }
      builder.delete = () => { call.op = 'delete'; return builder }
      builder.select = (cols?: string) => { if (!call.op) call.op = 'select'; call.select = cols ?? '*'; return builder }
      for (const f of ['eq', 'neq', 'like', 'order', 'range']) {
        builder[f] = (...a: any[]) => { call.filters.push([f, ...a]); return builder }
      }
      builder.single = () => run()
      builder.maybeSingle = () => run()
      builder.then = (res: any, rej: any) => run().then(res, rej)
      return builder
    },
  }
  return { state, client }
})

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: fake.client,
  trackEvent: () => {},
}))

const QUEUE_KEY = 'atmosiq-sync-queue'
const STATE_KEY = 'atmosiq-sync-state'
const CONFLICTS_KEY = 'atmosflow:sync-conflicts'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const CENSUS = { count: 2, findings: { total: 3, attention: 1, bySeverity: { critical: 0, high: 1, medium: 0, low: 2 } }, confidence: 'High', partialData: false }

function assessment(id: string, extra: Record<string, any> = {}) {
  return {
    id,
    status: 'draft',
    building: { fn: 'Plaza' },
    presurvey: {},
    zones: [{ zn: 'Zone A' }],
    photos: { 'z0-dp': [{ src: PNG, ts: '2026-05-19T10:00:00Z' }] },
    assessmentUid: '11111111-1111-4111-8111-111111111111',
    comp: CENSUS,
    ver: '6.0.0-beta (Engine v3.0.0)',
    ...extra,
  }
}

const queue = () => JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
const conflicts = () => JSON.parse(localStorage.getItem(CONFLICTS_KEY) || '[]')
const upserts = () => fake.state.calls.filter(c => c.table === 'assessments' && c.op === 'upsert')
const ok = (updated_at = '2026-06-01T00:00:00.000000+00:00') => ({ data: [{ updated_at }] })

async function load() {
  const { __test } = await import('../../src/utils/photoBlobStore.js')
  __test.setBackend(new Map())
  const mod = await import('../../src/utils/supabaseStorage.js')
  return mod
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  fake.state.calls = []
  fake.state.user = { id: 'u-1', email: 'jane.doe@example.com', user_metadata: {} }
  fake.state.getUserError = null
  fake.state.handler = async () => ok()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── C2 / H6: failures are surfaced and queued, never dropped ─────────

describe('saveAssessment — cloud failure handling (C2)', () => {
  it('returns { ok: true } when the upsert lands', async () => {
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment(assessment('draft-1'))
    expect(r.ok).toBe(true)
    expect(queue()).toHaveLength(0)
  })

  it('returns { ok: false, error, queued } and queues on a PostgREST error', async () => {
    fake.state.handler = async (c) => c.op === 'upsert' ? { error: { code: 'PGRST301', message: 'JWT expired' } } : {}
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment(assessment('draft-1'))
    expect(r.ok).toBe(false)
    expect(r.queued).toBe(true)
    expect(r.error.code).toBe('PGRST301')
    expect(queue()).toHaveLength(1)
    expect(queue()[0]).toMatchObject({ type: 'assessment', data: { id: 'draft-1' } })
  })

  it('queues when auth.getUser() returns no user while online (expired refresh token)', async () => {
    fake.state.user = null
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment(assessment('draft-1'))
    expect(r.ok).toBe(false)
    expect(r.queued).toBe(true)
    expect(r.error.code).toBe('no_user')
    expect(queue()).toHaveLength(1)
    expect(upserts()).toHaveLength(0)
  })

  it('queues the COMPACTED copy (photo refs, no inline base64)', async () => {
    fake.state.user = null
    const { default: Storage } = await load()
    await Storage.saveAssessment(assessment('draft-1'))
    const item = queue()[0]
    expect(item.data.photos['z0-dp'][0].src).toBeUndefined()
    expect(item.data.photos['z0-dp'][0].idbId).toMatch(/^atmosflow:draft-1:/)
  })

  it('replaces the queue entry for the same id instead of appending', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { default: Storage } = await load()
    await Storage.saveAssessment(assessment('draft-1', { building: { fn: 'First' } }))
    await Storage.saveAssessment(assessment('draft-1', { building: { fn: 'Second' } }))
    await Storage.saveAssessment(assessment('draft-2'))
    const q = queue()
    expect(q).toHaveLength(2)
    expect(q.map((i: any) => i.data.id)).toEqual(['draft-1', 'draft-2'])
    expect(q[0].data.building.fn).toBe('Second')
  })

  it('a queued delete supersedes a queued save of the same id', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { default: Storage } = await load()
    await Storage.saveAssessment(assessment('draft-1'))
    await Storage.deleteAssessment('draft-1')
    const q = queue()
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ type: 'delete', data: { id: 'draft-1' } })
  })

  it('surfaces a localStorage quota failure as lastError: storage_quota', async () => {
    const { default: Storage } = await load()
    const { default: STO } = await import('../../src/utils/storage.js')
    const realSet = STO.set.bind(STO)
    vi.spyOn(STO, 'set').mockImplementation(async (k: string, v: any) => (k === 'draft-1' ? false : realSet(k, v)))
    const r = await Storage.saveAssessment(assessment('draft-1'))
    expect(r.localOk).toBe(false)
    const s = await Storage.getSyncState()
    expect(s.lastError).toBe('storage_quota')
  })
})

describe('saveProfile — cloud failure handling (C2 / L1)', () => {
  it('returns { ok: false, error, queued } on a PostgREST error', async () => {
    fake.state.handler = async (c) => c.table === 'profiles' ? { error: { code: '42501', message: 'permission denied' } } : {}
    const { default: Storage } = await load()
    const r = await Storage.saveProfile({ name: 'Jane', plan: 'pro', credits_remaining: 99 })
    expect(r.ok).toBe(false)
    expect(r.queued).toBe(true)
    expect(queue()[0].type).toBe('profile')
  })

  it('never sends plan or credits_remaining (server-owned since 033)', async () => {
    const { default: Storage } = await load()
    const r = await Storage.saveProfile({ name: 'Jane', firm: 'ACME', plan: 'pro', credits_remaining: 99 })
    expect(r.ok).toBe(true)
    const up = fake.state.calls.find(c => c.table === 'profiles' && c.op === 'upsert')!
    expect(up.args.name).toBe('Jane')
    expect('plan' in up.args).toBe(false)
    expect('credits_remaining' in up.args).toBe(false)
  })
})

describe('deleteAssessment — checks { error } (C2)', () => {
  it('queues a delete when the cloud delete returns an error', async () => {
    fake.state.handler = async (c) => c.op === 'delete' ? { error: { code: 'PGRST301', message: 'JWT expired' } } : ok()
    const { default: Storage } = await load()
    await Storage.saveAssessment(assessment('draft-1'))
    const r = await Storage.deleteAssessment('draft-1')
    expect(r.ok).toBe(false)
    expect(r.queued).toBe(true)
    expect(queue()).toEqual([expect.objectContaining({ type: 'delete', data: { id: 'draft-1' } })])
  })

  it('returns { ok: true } when the delete lands', async () => {
    const { default: Storage } = await load()
    const r = await Storage.deleteAssessment('draft-1')
    expect(r.ok).toBe(true)
    expect(queue()).toHaveLength(0)
  })
})

// ── H6: the drain ───────────────────────────────────────────────────

describe('processSyncQueue — drain semantics (H6)', () => {
  it('keeps failed items in the queue and never calls _queueSync from inside the drain', async () => {
    fake.state.handler = async (c) => {
      if (c.op === 'upsert' && c.args.id === 'draft-bad') return { error: { code: '42501', message: 'permission denied' } }
      return ok()
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify([
      { type: 'assessment', data: assessment('draft-bad'), queuedAt: 't' },
      { type: 'assessment', data: assessment('draft-good'), queuedAt: 't' },
      { type: 'delete', data: { id: 'draft-gone' }, queuedAt: 't' },
    ]))
    const { default: Storage } = await load()
    const spy = vi.spyOn(Storage, '_queueSync')
    await Storage.processSyncQueue()
    expect(spy).not.toHaveBeenCalled()
    const q = queue()
    expect(q).toHaveLength(1)
    expect(q[0].data.id).toBe('draft-bad')
    const s = await Storage.getSyncState()
    expect(s.lastError).toMatch(/42501/)
    expect(s.inFlight).toBe(false)
  })

  it('re-expands compacted photos before pushing', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { default: Storage } = await load()
    await Storage.saveAssessment(assessment('draft-1'))
    expect(queue()[0].data.photos['z0-dp'][0].idbId).toBeDefined()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    await Storage.processSyncQueue()
    expect(queue()).toHaveLength(0)
    const up = upserts()[0]
    expect(up.args.photos['z0-dp'][0].src).toBe(PNG)
    expect(up.args.photos['z0-dp'][0].idbId).toBeUndefined()
  })

  it('stops after the first no-user failure and preserves the whole queue', async () => {
    fake.state.user = null
    localStorage.setItem(QUEUE_KEY, JSON.stringify([
      { type: 'assessment', data: assessment('draft-1'), queuedAt: 't' },
      { type: 'assessment', data: assessment('draft-2'), queuedAt: 't' },
    ]))
    const { default: Storage } = await load()
    await Storage.processSyncQueue()
    expect(queue()).toHaveLength(2)
    expect(upserts()).toHaveLength(0)
  })

  it('single-flight guard is in memory and goes stale after DRAIN_STALE_MS', async () => {
    let release!: () => void
    const gate = new Promise<void>(res => { release = res })
    fake.state.handler = async () => { await gate; return ok() }
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ type: 'assessment', data: assessment('draft-1'), queuedAt: 't' }]))
    const { default: Storage, DRAIN_STALE_MS } = await load()

    const first = Storage.processSyncQueue()
    await new Promise(r => setTimeout(r, 0))
    expect((await Storage.getSyncState()).inFlight).toBe(true)
    // inFlight is NOT persisted — a killed tab leaves nothing behind.
    expect(JSON.parse(localStorage.getItem(STATE_KEY)!).inFlight).toBe(false)

    // A second call while in flight is a no-op (one upsert so far).
    await Storage.processSyncQueue()
    expect(upserts()).toHaveLength(1)

    // Past the stale window the guard releases.
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + DRAIN_STALE_MS + 1)
    expect((await Storage.getSyncState()).inFlight).toBe(false)
    release()
    await first
    expect((await Storage.getSyncState()).inFlight).toBe(false)
  })

  it('clears a persisted inFlight flag left by an older build on load', async () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ inFlight: true, lastAttempt: 't' }))
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ type: 'assessment', data: assessment('draft-1'), queuedAt: 't' }]))
    const { default: Storage } = await load()
    await new Promise(r => setTimeout(r, 0))
    expect(JSON.parse(localStorage.getItem(STATE_KEY)!).inFlight).toBe(false)
    expect((await Storage.getSyncState()).inFlight).toBe(false)
    // …and the drain is not blocked by it.
    await Storage.processSyncQueue()
    expect(queue()).toHaveLength(0)
  })
})

// ── H3: retry semantics keyed on the Postgres error code ────────────

describe('upsert recovery (H3)', () => {
  it('drops ONLY the column named by an undefined-column error, then retries', async () => {
    let n = 0
    fake.state.handler = async (c) => {
      if (c.op !== 'upsert') return {}
      n++
      if (n === 1) return { error: { code: 'PGRST204', message: "Could not find the 'finalized_at' column of 'assessments' in the schema cache" } }
      return ok()
    }
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment(assessment('rpt-1', { status: 'complete', ts: '2026-05-01T00:00:00Z' }))
    expect(r.ok).toBe(true)
    const ups = upserts()
    expect(ups).toHaveLength(2)
    expect('finalized_at' in ups[0].args).toBe(true)
    expect('finalized_at' in ups[1].args).toBe(false)
    // The other optional columns survive the retry.
    expect(ups[1].args.payload).toBeTruthy()
    expect(ups[1].args.assessment_uid).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('handles the Postgres 42703 message form too', async () => {
    let n = 0
    fake.state.handler = async (c) => {
      if (c.op !== 'upsert') return {}
      n++
      if (n === 1) return { error: { code: '42703', message: 'column "base_updated_at" of relation "assessments" does not exist' } }
      return ok()
    }
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment(assessment('draft-1'))
    expect(r.ok).toBe(true)
    expect('base_updated_at' in upserts()[1].args).toBe(false)
    expect(upserts()[1].args.payload).toBeTruthy()
  })

  it('does NOT drop columns on an unrelated error — the item is queued as-is', async () => {
    fake.state.handler = async (c) => c.op === 'upsert' ? { error: { code: '42501', message: 'new row violates row-level security policy' } } : {}
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment(assessment('draft-1'))
    expect(r.ok).toBe(false)
    expect(upserts()).toHaveLength(1)
    expect(queue()).toHaveLength(1)
  })

  it('on 23505 deletes the stale draft- row carrying the uid and retries with payload intact', async () => {
    let n = 0
    fake.state.handler = async (c) => {
      if (c.op === 'upsert') {
        n++
        if (n === 1) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "assessments_user_assessment_uid_key"' } }
        return ok()
      }
      return {}
    }
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment(assessment('rpt-9', { status: 'complete', ts: '2026-05-01T00:00:00Z' }))
    expect(r.ok).toBe(true)
    const del = fake.state.calls.find(c => c.table === 'assessments' && c.op === 'delete')!
    expect(del).toBeTruthy()
    expect(del.filters).toEqual(expect.arrayContaining([
      ['eq', 'user_id', 'u-1'],
      ['eq', 'assessment_uid', '11111111-1111-4111-8111-111111111111'],
      ['neq', 'id', 'rpt-9'],
      ['like', 'id', 'draft-%'],
    ]))
    const ups = upserts()
    expect(ups).toHaveLength(2)
    expect(ups[1].args.payload).toBeTruthy()
    expect(ups[1].args.assessment_uid).toBe('11111111-1111-4111-8111-111111111111')
    // The delete happened between the two upserts.
    const order = fake.state.calls.filter(c => c.table === 'assessments').map(c => c.op)
    expect(order).toEqual(['upsert', 'delete', 'upsert'])
  })

  it('retries the unique violation only once', async () => {
    fake.state.handler = async (c) => c.op === 'upsert'
      ? { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
      : {}
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment(assessment('rpt-9'))
    expect(r.ok).toBe(false)
    expect(upserts()).toHaveLength(2)
    expect(queue()).toHaveLength(1)
  })
})

// ── H5: multi-device conflicts ──────────────────────────────────────

describe('multi-device conflicts (H5)', () => {
  it('sends base_updated_at from the local copy and records the returned updated_at', async () => {
    const { default: Storage } = await load()
    localStorage.setItem('draft-1', JSON.stringify({ id: 'draft-1', cloudUpdatedAt: 'T1' }))
    const local = await Storage.getAssessment('draft-1')
    fake.state.handler = async (c) => c.op === 'upsert' ? ok('T2') : {}
    const r = await Storage.saveAssessment({ ...assessment('draft-1'), cloudUpdatedAt: local!.cloudUpdatedAt })
    expect(r.ok).toBe(true)
    expect(upserts()[0].args.base_updated_at).toBe('T1')
    expect(JSON.parse(localStorage.getItem('draft-1')!).cloudUpdatedAt).toBe('T2')
    // Bookkeeping never rides inside the payload snapshot.
    expect('cloudUpdatedAt' in upserts()[0].args.payload).toBe(false)
  })

  it('sends base_updated_at: null on a first push', async () => {
    const { default: Storage } = await load()
    await Storage.saveAssessment(assessment('draft-1'))
    expect(upserts()[0].args.base_updated_at).toBeNull()
  })

  it('on the 034 refusal keeps the local copy, does not queue, and exposes the conflict', async () => {
    fake.state.handler = async (c) => c.op === 'upsert'
      ? { error: { code: '23514', message: 'ATMOSFLOW_CONFLICT: assessment draft-1 was changed on another device' } }
      : {}
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment({ ...assessment('draft-1'), cloudUpdatedAt: 'T1' })
    expect(r.ok).toBe(false)
    expect(r.conflict).toBe(true)
    expect(queue()).toHaveLength(0)
    expect(upserts()).toHaveLength(1) // no blind retry
    expect(JSON.parse(localStorage.getItem('draft-1')!).building.fn).toBe('Plaza')
    const s = await Storage.getSyncState()
    expect(s.conflictCount).toBe(1)
    expect(s.conflicts[0]).toMatchObject({ id: 'draft-1', reason: 'conflict', baseUpdatedAt: 'T1' })
  })

  it('a conflict found during a drain leaves the queue and joins the conflicts list', async () => {
    fake.state.handler = async (c) => c.op === 'upsert'
      ? { error: { code: '23514', message: 'ATMOSFLOW_CONFLICT: moved on' } }
      : {}
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ type: 'assessment', data: assessment('draft-1'), queuedAt: 't' }]))
    const { default: Storage } = await load()
    await Storage.processSyncQueue()
    expect(queue()).toHaveLength(0)
    expect(conflicts().map((c: any) => c.id)).toEqual(['draft-1'])
  })

  it("resolveConflict('keep_local') pushes without a base and clears the conflict", async () => {
    localStorage.setItem(CONFLICTS_KEY, JSON.stringify([{ id: 'draft-1', reason: 'conflict' }]))
    localStorage.setItem('draft-1', JSON.stringify({ ...assessment('draft-1'), photos: {}, cloudUpdatedAt: 'T1' }))
    const { default: Storage } = await load()
    const r = await Storage.resolveConflict('draft-1', 'keep_local')
    expect(r.ok).toBe(true)
    expect(upserts()[0].args.base_updated_at).toBeNull()
    expect(conflicts()).toHaveLength(0)
  })

  it("resolveConflict('keep_cloud') pulls the cloud copy over local", async () => {
    localStorage.setItem(CONFLICTS_KEY, JSON.stringify([{ id: 'draft-1', reason: 'conflict' }]))
    localStorage.setItem('draft-1', JSON.stringify({ id: 'draft-1', building: { fn: 'Local' }, photos: {} }))
    fake.state.handler = async (c) => c.op === 'select'
      ? { data: { id: 'draft-1', status: 'draft', updated_at: 'T9', photos: {}, payload: { id: 'draft-1', building: { fn: 'Cloud' } } } }
      : {}
    const { default: Storage } = await load()
    const r = await Storage.resolveConflict('draft-1', 'keep_cloud')
    expect(r.ok).toBe(true)
    expect(JSON.parse(localStorage.getItem('draft-1')!).building.fn).toBe('Cloud')
    expect(conflicts()).toHaveLength(0)
  })

  it('an immutable-report refusal is parked (reason: immutable), not retried', async () => {
    fake.state.handler = async (c) => c.op === 'upsert'
      ? { error: { code: '23514', message: 'ATMOSFLOW_IMMUTABLE: assessment rpt-1 is final' } }
      : {}
    const { default: Storage } = await load()
    const r = await Storage.saveAssessment(assessment('rpt-1', { status: 'complete' }))
    expect(r.ok).toBe(false)
    expect(r.immutable).toBe(true)
    expect(queue()).toHaveLength(0)
    expect(conflicts()[0]).toMatchObject({ id: 'rpt-1', reason: 'immutable' })
  })

  it('reopenAssessment moves the cloud row back to draft', async () => {
    const { default: Storage } = await load()
    const r = await Storage.reopenAssessment('rpt-1')
    expect(r.ok).toBe(true)
    const up = fake.state.calls.find(c => c.op === 'update')!
    expect(up.args).toEqual({ report_status: 'draft' })
    expect(up.filters).toEqual([['eq', 'id', 'rpt-1']])
  })
})

// ── M4 / M5: the row shape ──────────────────────────────────────────

describe('row shape (M4 / M5)', () => {
  it('writes the v3 census to payload.census and no longer writes composite', async () => {
    const { default: Storage } = await load()
    await Storage.saveAssessment(assessment('rpt-1', { status: 'complete', ts: '2026-05-01T00:00:00Z' }))
    const row = upserts()[0].args
    expect('composite' in row).toBe(false)
    expect(row.payload.census).toEqual(CENSUS)
  })

  it('writes finalized_at from the finalize timestamp for a complete report and null for a draft', async () => {
    const { default: Storage } = await load()
    await Storage.saveAssessment(assessment('rpt-1', { status: 'complete', ts: '2026-05-01T00:00:00Z' }))
    await Storage.saveAssessment(assessment('draft-2'))
    expect(upserts()[0].args.finalized_at).toBe('2026-05-01T00:00:00Z')
    expect(upserts()[0].args.report_status).toBe('final')
    expect(upserts()[1].args.finalized_at).toBeNull()
  })
})

// ── M13 / L7: fullSync ──────────────────────────────────────────────

describe('fullSync (M13 / L7)', () => {
  function row(i: number, status = 'complete') {
    return {
      id: `rpt-${i}`, user_id: 'u-1', status, facility_name: `Site ${i}`,
      updated_at: `2026-06-0${(i % 9) + 1}T00:00:00Z`,
      finalized_at: status === 'complete' ? '2026-05-15T00:00:00Z' : null,
      payload: { id: `rpt-${i}`, building: { fn: `Site ${i}` }, census: CENSUS, ver: '6.0.0-beta (Engine v3.0.0)' },
    }
  }

  it('selects explicit columns without photos, pages by 500, and maps findings from the payload', async () => {
    const pages: Call[] = []
    fake.state.handler = async (c) => {
      if (c.table === 'profiles') return { data: { id: 'u-1', name: 'Jane' } }
      if (c.table === 'assessments' && c.op === 'select') {
        pages.push(c)
        const range = c.filters.find(f => f[0] === 'range')!
        const from = range[1] as number
        if (from === 0) return { data: Array.from({ length: 500 }, (_, i) => row(i)) }
        return { data: [row(500, 'draft')] }
      }
      return {}
    }
    const { default: Storage } = await load()
    await Storage.fullSync()

    expect(pages).toHaveLength(2)
    expect(pages[0].filters).toEqual(expect.arrayContaining([['range', 0, 499]]))
    expect(pages[1].filters).toEqual(expect.arrayContaining([['range', 500, 999]]))
    const cols = pages[0].select!.split(',')
    expect(cols).not.toContain('photos')
    expect(cols).not.toContain('findings')
    expect(cols).not.toContain('attention')
    expect(cols).toEqual(expect.arrayContaining(['id', 'status', 'payload', 'finalized_at', 'updated_at']))

    const idx = JSON.parse(localStorage.getItem('atmosiq-idx')!)
    expect(idx.reports).toHaveLength(500)
    expect(idx.drafts).toHaveLength(1)
    expect(idx.reports[0]).toMatchObject({ id: 'rpt-0', facility: 'Site 0', findings: 3, attention: 1, ts: '2026-05-15T00:00:00Z' })

    // Local copy restored without photos, flagged for the lazy fetch.
    const local = JSON.parse(localStorage.getItem('rpt-0')!)
    expect(local._photosPending).toBe(true)
    expect(local.photos).toEqual({})
    expect(local.cloudUpdatedAt).toBe('2026-06-01T00:00:00Z')
  })

  it('getAssessment fetches the photos column for a pending copy, then clears the flag', async () => {
    localStorage.setItem('rpt-0', JSON.stringify({ id: 'rpt-0', status: 'complete', photos: {}, _photosPending: true }))
    fake.state.handler = async (c) => {
      if (c.op === 'select' && c.select === 'photos') return { data: { photos: { 'z0-dp': [{ src: PNG, ts: 't' }] } } }
      return {}
    }
    const { default: Storage } = await load()
    const a = await Storage.getAssessment('rpt-0')
    expect(a!.photos['z0-dp'][0].src).toBe(PNG)
    expect(a!._photosPending).toBeUndefined()
    const sel = fake.state.calls.find(c => c.select === 'photos')!
    expect(sel.filters).toEqual([['eq', 'id', 'rpt-0']])
    const local = JSON.parse(localStorage.getItem('rpt-0')!)
    expect(local._photosPending).toBeUndefined()
    expect(local.photos['z0-dp'][0].idbId).toMatch(/^atmosflow:rpt-0:/)
  })

  it('a copy still waiting for its photos omits the photos column on save', async () => {
    const { default: Storage } = await load()
    await Storage.saveAssessment({ id: 'rpt-0', status: 'complete', zones: [], photos: {}, _photosPending: true })
    const row = upserts()[0].args
    expect('photos' in row).toBe(false)
    expect('_photosPending' in row.payload).toBe(false)
  })

  it('drops a not-yet-migrated column from the select and re-requests the page', async () => {
    let n = 0
    fake.state.handler = async (c) => {
      if (c.table === 'profiles') return { data: null }
      if (c.table === 'assessments' && c.op === 'select') {
        n++
        if (n === 1) return { error: { code: '42703', message: 'column assessments.finalized_at does not exist' } }
        return { data: [row(1)] }
      }
      return {}
    }
    const { default: Storage } = await load()
    await Storage.fullSync()
    const selects = fake.state.calls.filter(c => c.table === 'assessments' && c.op === 'select')
    expect(selects).toHaveLength(2)
    expect(selects[1].select!.split(',')).not.toContain('finalized_at')
    expect(JSON.parse(localStorage.getItem('atmosiq-idx')!).reports).toHaveLength(1)
  })

  it('does not overwrite a local copy that has an unsynced change in the queue', async () => {
    localStorage.setItem('rpt-1', JSON.stringify({ id: 'rpt-1', building: { fn: 'Local edit' }, photos: {} }))
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ type: 'assessment', data: { id: 'rpt-1', building: { fn: 'Local edit' }, photos: {} }, queuedAt: 't' }]))
    fake.state.handler = async (c) => {
      if (c.table === 'profiles') return { data: null }
      if (c.table === 'assessments' && c.op === 'select') return { data: [row(1)] }
      return ok()
    }
    const { default: Storage } = await load()
    await Storage.fullSync()
    // The drain pushed the local edit; the pull did not clobber it first.
    const pushed = upserts()[0].args
    expect(pushed.building.fn).toBe('Local edit')
  })
})

// ── L1: signup profile bootstrap ────────────────────────────────────

describe('signUp profile bootstrap (L1)', () => {
  it('supplies a name derived from the email and omits plan / credits_remaining', async () => {
    fake.state.signUpResult = { data: { user: { id: 'u-9', email: 'jane.doe@example.com', user_metadata: {} }, session: null }, error: null }
    fake.state.handler = async (c) => (c.table === 'profiles' && c.op === 'select') ? { data: null } : {}
    const { default: Storage } = await load()
    await Storage.signUp('jane.doe@example.com', 'pw')
    const ins = fake.state.calls.find(c => c.table === 'profiles' && c.op === 'insert')!
    expect(ins.args.name).toBe('jane.doe')
    expect(ins.args.id).toBe('u-9')
    expect('plan' in ins.args).toBe(false)
    expect('credits_remaining' in ins.args).toBe(false)
  })

  it('prefers a name from user metadata when present', async () => {
    fake.state.signUpResult = { data: { user: { id: 'u-9', email: 'jane.doe@example.com', user_metadata: { full_name: 'Jane Doe' } }, session: null }, error: null }
    fake.state.handler = async (c) => (c.table === 'profiles' && c.op === 'select') ? { data: null } : {}
    const { default: Storage } = await load()
    await Storage.signUp('jane.doe@example.com', 'pw')
    const ins = fake.state.calls.find(c => c.table === 'profiles' && c.op === 'insert')!
    expect(ins.args.name).toBe('Jane Doe')
  })
})

describe('profile push — under-migrated project', () => {
  // "Sync had errors: 1 pending" in the field, with a queue that never
  // drained. toProfileRow writes seven columns added by migrations 019 and
  // 020; on a project missing either, the whole profile upsert failed and
  // requeued forever — the assessor's name, firm and credentials held
  // hostage by an absent calibration column. The assessment path had this
  // recovery from the start; the profile path did not.
  it('drops only the named optional column and still saves the profile', async () => {
    const { default: Storage } = await load()
    let n = 0
    fake.state.handler = async (c) => {
      if (c.table !== 'profiles') return {}
      n++
      if (n === 1) return { error: { code: 'PGRST204', message: "Could not find the 'iaq_cal_status' column of 'profiles' in the schema cache" } }
      if (n === 2) return { error: { code: '42703', message: 'column "email_preferences" of relation "profiles" does not exist' } }
      return {}
    }
    const res = await Storage.saveProfile({
      name: 'Jane Doe', firm: 'PSEC', certs: ['CIH'],
      iaq_cal_status: 'current', email_preferences: { reassessment: true },
    })

    expect(res.ok).toBe(true)
    expect(queue()).toHaveLength(0)

    const rows = fake.state.calls.filter(c => c.table === 'profiles' && c.op === 'upsert')
    expect(rows).toHaveLength(3)
    // Each attempt gives up exactly the column the error named…
    expect(rows[1].args.iaq_cal_status).toBeUndefined()
    expect(rows[2].args.email_preferences).toBeUndefined()
    // …and never the identity fields the report is signed with.
    expect(rows[2].args.name).toBe('Jane Doe')
    expect(rows[2].args.firm).toBe('PSEC')
    expect(rows[2].args.certs).toEqual(['CIH'])
  })

  it('still queues when a column outside the optional set is missing', async () => {
    const { default: Storage } = await load()
    fake.state.handler = async (c) => {
      if (c.table !== 'profiles') return {}
      return { error: { code: '42703', message: 'column "name" of relation "profiles" does not exist' } }
    }
    const res = await Storage.saveProfile({ name: 'Jane Doe' })
    expect(res.ok).toBe(false)
    expect(res.queued).toBe(true)
    // One attempt, then surfaced: a missing required column means the
    // project is too far behind for this build, and mangling the row to
    // "succeed" would write a profile with no assessor on it.
    expect(fake.state.calls.filter(c => c.table === 'profiles' && c.op === 'upsert')).toHaveLength(1)
  })
})

