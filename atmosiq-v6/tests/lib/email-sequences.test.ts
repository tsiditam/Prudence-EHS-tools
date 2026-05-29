/**
 * Tests for the email-sequences + email-triggers modules.
 *
 * Pins the contract:
 *   • Free-tier signup enqueues 3 templates at 0d / 2d / 5d intervals
 *   • Paid-tier signup enqueues 3 templates at 0d / 3d / 14d intervals
 *   • assessment_completed cancels free.sample and free.activation if unsent
 *   • assessment_completed enqueues free.success ONLY for free tier
 *   • Templates render with the user's first_name interpolated
 *   • Subscription cancel is a no-op (TODO follow-up)
 */

import { describe, it, expect } from 'vitest'
import {
  FREE_TIER_TEMPLATES,
  PAID_TIER_TEMPLATES,
  templatesForPlan,
  getTemplate,
  type UserContext,
} from '../../lib/email-sequences'
import {
  enqueueSignupSequence,
  onAssessmentCompleted,
  onSubscriptionCanceled,
  enqueueReassessmentReminder,
  enqueueCalibrationReminder,
  enqueuePortfolioDigest,
  type SupabaseLike,
} from '../../lib/email-triggers'

// ─── Mock supabase ──────────────────────────────────────────────────
function makeSupabaseMock(initial: { queue?: any[] } = {}) {
  const state = {
    queue: [...(initial.queue || [])] as any[],
    inserts: [] as any[],
    updates: [] as any[],
  }
  let nextId = (state.queue.length || 0) + 1
  const client: SupabaseLike & { state: typeof state } = {
    state,
    from: (table: string) => {
      const ctx: any = { _filters: {} as Record<string, any>, _patch: undefined as any, _selectFields: '*' }
      const buildSelectMatch = () => {
        if (table !== 'email_queue') return []
        return state.queue.filter(r => {
          for (const [k, v] of Object.entries(ctx._filters)) {
            if (k.startsWith('__in__')) {
              const col = k.slice(6)
              if (!Array.isArray(v) || !(v as any[]).includes(r[col])) return false
            } else if (k.startsWith('__is__')) {
              const col = k.slice(6)
              if (r[col] !== v) return false
            } else {
              if (r[k] !== v) return false
            }
          }
          return true
        })
      }

      const chain: any = {
        select: (s?: string) => {
          if (s) ctx._selectFields = s
          // Return chain so we can keep filtering with eq, in, is, then end via the result of update().
          return chain
        },
        eq: (col: string, val: any) => { ctx._filters[col] = val; return chain },
        in: (col: string, vals: any[]) => { ctx._filters['__in__' + col] = vals; return chain },
        is: (col: string, val: any) => { ctx._filters['__is__' + col] = val; return chain },
        update: (patch: any) => { ctx._patch = patch; return chain },
        insert: async (rows: any) => {
          const arr = Array.isArray(rows) ? rows : [rows]
          for (const r of arr) {
            const row = { id: nextId++, sent_at: null, canceled_at: null, ...r }
            state.queue.push(row)
            state.inserts.push(row)
          }
          return { data: null, error: null }
        },
      }

      // Make chain awaitable to handle the update().eq().in().is().is().select() pattern
      ;(chain as any).then = async (resolve: any) => {
        if (ctx._patch !== undefined) {
          const matched = buildSelectMatch()
          for (const m of matched) Object.assign(m, ctx._patch)
          state.updates.push({ table, filters: { ...ctx._filters }, patch: ctx._patch, count: matched.length })
          resolve({ data: matched.map(m => ({ id: m.id })), error: null })
          return
        }
        // Otherwise it's a select
        resolve({ data: buildSelectMatch(), error: null })
      }

      return chain
    },
  }
  return client
}

const ONE_DAY = 24 * 60 * 60 * 1000
const SIGNUP_AT = new Date('2026-04-30T12:00:00Z')

const freeUser: UserContext = { user_id: 'u_free', email: 'f@ex.com', first_name: 'Alex', plan: 'free' }
const paidUser: UserContext = { user_id: 'u_pro', email: 'p@ex.com', first_name: 'Sam',  plan: 'pro'  }

// ─── Templates ──────────────────────────────────────────────────────
describe('email-sequences templates', () => {
  it('renders free.welcome with the first name interpolated', () => {
    const tpl = getTemplate('free.welcome')!
    const r = tpl.render(freeUser)
    expect(r.subject).toMatch(/Welcome to AtmosFlow/)
    expect(r.body).toMatch(/Hi Alex/)
    expect(r.body).toMatch(/atmosflow.net/)
  })

  it('falls back to "there" when first_name is null', () => {
    const tpl = getTemplate('free.welcome')!
    const r = tpl.render({ ...freeUser, first_name: null })
    expect(r.body).toMatch(/Hi there/)
  })

  it('paid.welcome includes the right tier label and credit count', () => {
    const tpl = getTemplate('paid.welcome')!
    expect(tpl.render({ ...paidUser, plan: 'solo' }).body).toMatch(/Solo.*50 assessment/s)
    expect(tpl.render({ ...paidUser, plan: 'pro' }).body).toMatch(/Pro.*200 assessment/s)
    expect(tpl.render({ ...paidUser, plan: 'practice' }).body).toMatch(/Practice.*500 assessment/s)
  })

  it('templatesForPlan returns the timed sequence (excludes reactive ones)', () => {
    const free = templatesForPlan('free')
    expect(free.map(t => t.id)).toEqual(['free.welcome', 'free.sample', 'free.activation'])
    const paid = templatesForPlan('pro')
    expect(paid.map(t => t.id)).toEqual(['paid.welcome', 'paid.tips', 'paid.feedback'])
  })

  it('FREE_TIER_TEMPLATES has the expected delays', () => {
    const byId = Object.fromEntries(FREE_TIER_TEMPLATES.map(t => [t.id, t]))
    expect(byId['free.welcome'].delayMs).toBe(0)
    expect(byId['free.sample'].delayMs).toBe(2 * ONE_DAY)
    expect(byId['free.activation'].delayMs).toBe(5 * ONE_DAY)
  })

  it('PAID_TIER_TEMPLATES has the expected delays', () => {
    const byId = Object.fromEntries(PAID_TIER_TEMPLATES.map(t => [t.id, t]))
    expect(byId['paid.welcome'].delayMs).toBe(0)
    expect(byId['paid.tips'].delayMs).toBe(3 * ONE_DAY)
    expect(byId['paid.feedback'].delayMs).toBe(14 * ONE_DAY)
  })
})

// ─── Triggers ──────────────────────────────────────────────────────
describe('email-triggers — enqueueSignupSequence', () => {
  it('enqueues 3 free-tier templates at 0/2/5 days from signup', async () => {
    const supabase = makeSupabaseMock()
    const r = await enqueueSignupSequence(supabase, { user_id: freeUser.user_id, plan: 'free', signup_at: SIGNUP_AT })
    expect(r.enqueued).toBe(3)
    expect(r.template_ids).toEqual(['free.welcome', 'free.sample', 'free.activation'])

    expect(supabase.state.queue.length).toBe(3)
    expect(supabase.state.queue[0].scheduled_for).toBe(SIGNUP_AT.toISOString())
    expect(supabase.state.queue[1].scheduled_for).toBe(new Date(SIGNUP_AT.getTime() + 2 * ONE_DAY).toISOString())
    expect(supabase.state.queue[2].scheduled_for).toBe(new Date(SIGNUP_AT.getTime() + 5 * ONE_DAY).toISOString())
  })

  it('enqueues 3 paid-tier templates at 0/3/14 days', async () => {
    const supabase = makeSupabaseMock()
    const r = await enqueueSignupSequence(supabase, { user_id: paidUser.user_id, plan: 'pro', signup_at: SIGNUP_AT })
    expect(r.enqueued).toBe(3)
    expect(supabase.state.queue.map(q => q.template_id)).toEqual(['paid.welcome', 'paid.tips', 'paid.feedback'])
    expect(supabase.state.queue[2].scheduled_for).toBe(new Date(SIGNUP_AT.getTime() + 14 * ONE_DAY).toISOString())
  })
})

describe('email-triggers — onAssessmentCompleted', () => {
  it('cancels unsent free.sample + free.activation; enqueues free.success', async () => {
    const supabase = makeSupabaseMock({
      queue: [
        { id: 1, user_id: freeUser.user_id, template_id: 'free.welcome',    scheduled_for: SIGNUP_AT.toISOString(), sent_at: SIGNUP_AT.toISOString(), canceled_at: null },
        { id: 2, user_id: freeUser.user_id, template_id: 'free.sample',     scheduled_for: SIGNUP_AT.toISOString(), sent_at: null, canceled_at: null },
        { id: 3, user_id: freeUser.user_id, template_id: 'free.activation', scheduled_for: SIGNUP_AT.toISOString(), sent_at: null, canceled_at: null },
      ],
    })
    const r = await onAssessmentCompleted(supabase, { user_id: freeUser.user_id, plan: 'free', completed_at: new Date('2026-05-01T10:00:00Z') })
    expect(r.canceled).toBe(2) // sample + activation
    expect(r.enqueued).toEqual(['free.success'])

    // sample + activation now have canceled_at set
    expect(supabase.state.queue.find(q => q.id === 2).canceled_at).toBeTruthy()
    expect(supabase.state.queue.find(q => q.id === 3).canceled_at).toBeTruthy()
    expect(supabase.state.queue.find(q => q.id === 2).cancel_reason).toBe('first_assessment_completed')
    // welcome was already sent — not touched
    expect(supabase.state.queue.find(q => q.id === 1).canceled_at).toBeNull()

    // success was enqueued
    const success = supabase.state.queue.find(q => q.template_id === 'free.success')
    expect(success).toBeTruthy()
  })

  it('paid-tier completion does NOT enqueue free.success', async () => {
    const supabase = makeSupabaseMock()
    const r = await onAssessmentCompleted(supabase, { user_id: paidUser.user_id, plan: 'pro', completed_at: new Date() })
    expect(r.enqueued).toEqual([])
    expect(supabase.state.queue.length).toBe(0)
  })
})

describe('email-triggers — onSubscriptionCanceled is a no-op (TODO)', () => {
  it('returns enqueued: 0 without writing anything', async () => {
    const supabase = makeSupabaseMock()
    const r = await onSubscriptionCanceled(supabase, { user_id: 'u_x', plan: 'pro', canceled_at: new Date() })
    expect(r.enqueued).toBe(0)
    expect(supabase.state.queue.length).toBe(0)
  })
})

// ─── Re-assessment reminder (habit-loop PR 1) ──────────────────────

describe('email-triggers — enqueueReassessmentReminder', () => {
  const baseEvent = {
    user_id: 'u_free',
    site_id: 'site-acme',
    site_name: 'Acme HQ',
    due_at: new Date('2027-05-29T12:00:00Z'),
  }

  it('throws when required fields are missing', async () => {
    const supabase = makeSupabaseMock()
    await expect(enqueueReassessmentReminder(supabase, { ...baseEvent, user_id: '' })).rejects.toThrow()
    await expect(enqueueReassessmentReminder(supabase, { ...baseEvent, site_id: '' })).rejects.toThrow()
    await expect(enqueueReassessmentReminder(supabase, { ...baseEvent, site_name: '' })).rejects.toThrow()
  })

  it('inserts a single queue row scheduled for due_at with payload', async () => {
    const supabase = makeSupabaseMock()
    const r = await enqueueReassessmentReminder(supabase, baseEvent)
    expect(r.canceled).toBe(0)
    expect(r.enqueued).toBe(1)
    expect(supabase.state.inserts).toHaveLength(1)
    const row = supabase.state.inserts[0]
    expect(row.template_id).toBe('reassessment.reminder')
    expect(row.user_id).toBe('u_free')
    expect(row.scheduled_for).toBe(baseEvent.due_at.toISOString())
    expect(row.payload).toEqual({
      site_id: 'site-acme',
      site_name: 'Acme HQ',
      due_at: baseEvent.due_at.toISOString(),
    })
  })

  it('idempotency: re-enqueueing for the same site cancels the prior unsent row', async () => {
    const supabase = makeSupabaseMock()
    await enqueueReassessmentReminder(supabase, baseEvent)
    expect(supabase.state.queue.filter(r => r.sent_at == null && r.canceled_at == null)).toHaveLength(1)

    // Move the due date forward (e.g. user re-finalized the same site).
    const later = new Date('2027-08-29T12:00:00Z')
    const r2 = await enqueueReassessmentReminder(supabase, { ...baseEvent, due_at: later })
    expect(r2.canceled).toBe(1)
    expect(r2.enqueued).toBe(1)
    // One unsent row remains — the new one.
    const live = supabase.state.queue.filter(r => r.sent_at == null && r.canceled_at == null)
    expect(live).toHaveLength(1)
    expect(live[0].scheduled_for).toBe(later.toISOString())
  })

  it('does NOT cancel reminders for OTHER sites belonging to the same user', async () => {
    const supabase = makeSupabaseMock()
    await enqueueReassessmentReminder(supabase, baseEvent)
    await enqueueReassessmentReminder(supabase, { ...baseEvent, site_id: 'site-other', site_name: 'Other HQ' })

    // Re-enqueue for acme — should cancel only acme's prior row.
    const r3 = await enqueueReassessmentReminder(supabase, { ...baseEvent, due_at: new Date('2028-01-01T00:00:00Z') })
    expect(r3.canceled).toBe(1)
    const live = supabase.state.queue.filter(r => r.sent_at == null && r.canceled_at == null)
    expect(live).toHaveLength(2)
    const siteIds = live.map(r => r.payload?.site_id).sort()
    expect(siteIds).toEqual(['site-acme', 'site-other'])
  })
})

// ─── Calibration expiry reminder (habit-loop PR 2) ──────────────────

describe('email-triggers — enqueueCalibrationReminder', () => {
  const baseEvent = {
    user_id: 'u_free',
    instrument_key: 'iaq',
    meter: 'Graywolf IQ-610',
    cal_date: '2025-06-01',
    kind: 'expiring' as const,
    days_to_expiry: 25,
  }

  it('throws on missing required fields', async () => {
    const supabase = makeSupabaseMock()
    await expect(enqueueCalibrationReminder(supabase, { ...baseEvent, user_id: '' })).rejects.toThrow()
    await expect(enqueueCalibrationReminder(supabase, { ...baseEvent, instrument_key: '' })).rejects.toThrow()
    await expect(enqueueCalibrationReminder(supabase, { ...baseEvent, meter: '' })).rejects.toThrow()
    await expect(enqueueCalibrationReminder(supabase, { ...baseEvent, cal_date: '' })).rejects.toThrow()
  })

  it('throws on invalid kind', async () => {
    const supabase = makeSupabaseMock()
    await expect(enqueueCalibrationReminder(supabase, { ...baseEvent, kind: 'whatever' as never })).rejects.toThrow()
  })

  it('inserts an expiring reminder with payload', async () => {
    const supabase = makeSupabaseMock()
    const r = await enqueueCalibrationReminder(supabase, baseEvent)
    expect(r).toEqual({ canceled: 0, enqueued: 1, skipped: false })
    expect(supabase.state.inserts).toHaveLength(1)
    const row = supabase.state.inserts[0]
    expect(row.template_id).toBe('calibration.expiring')
    expect(row.user_id).toBe('u_free')
    expect(row.payload).toEqual({
      instrument_key: 'iaq',
      meter: 'Graywolf IQ-610',
      cal_date: '2025-06-01',
      kind: 'expiring',
      days_to_expiry: 25,
    })
  })

  it('uses the expired template when kind is expired', async () => {
    const supabase = makeSupabaseMock()
    await enqueueCalibrationReminder(supabase, { ...baseEvent, kind: 'expired', days_to_expiry: -3 })
    expect(supabase.state.inserts[0].template_id).toBe('calibration.expired')
  })

  it('skips when a row for this cal_date is already queued (idempotency)', async () => {
    const supabase = makeSupabaseMock()
    await enqueueCalibrationReminder(supabase, baseEvent)
    expect(supabase.state.inserts).toHaveLength(1)

    // Cron re-runs the next day — same cal_date.
    const r = await enqueueCalibrationReminder(supabase, { ...baseEvent, days_to_expiry: 24 })
    expect(r).toEqual({ canceled: 0, enqueued: 0, skipped: true })
    expect(supabase.state.inserts).toHaveLength(1)  // no second insert
  })

  it('cancels stale unsent rows when cal_date advances (re-calibration)', async () => {
    const supabase = makeSupabaseMock()
    // First cycle.
    await enqueueCalibrationReminder(supabase, baseEvent)
    const firstId = supabase.state.queue[0].id

    // User re-calibrates → cal_date is now newer; cron sees a new cycle.
    const r = await enqueueCalibrationReminder(supabase, {
      ...baseEvent,
      cal_date: '2026-05-15',
      days_to_expiry: 14,
    })
    expect(r.canceled).toBe(1)
    expect(r.enqueued).toBe(1)
    const live = supabase.state.queue.filter(x => x.sent_at == null && x.canceled_at == null)
    expect(live).toHaveLength(1)
    // The cancelled row is the original
    const cancelled = supabase.state.queue.find(x => x.id === firstId)
    expect(cancelled?.canceled_at).not.toBeNull()
  })

  it('does NOT cancel reminders for OTHER instruments on the same user', async () => {
    const supabase = makeSupabaseMock()
    await enqueueCalibrationReminder(supabase, baseEvent)
    await enqueueCalibrationReminder(supabase, {
      ...baseEvent,
      instrument_key: 'pid',
      meter: 'RAE MiniRAE',
      cal_date: '2025-08-01',
      days_to_expiry: 10,
    })
    const live = supabase.state.queue.filter(x => x.sent_at == null && x.canceled_at == null)
    expect(live).toHaveLength(2)
    const keys = live.map(r => r.payload?.instrument_key).sort()
    expect(keys).toEqual(['iaq', 'pid'])
  })

  it('skips when a previously-sent row covers this cal_date (no re-send)', async () => {
    const supabase = makeSupabaseMock({
      queue: [
        // Pre-existing sent row.
        {
          id: 99, user_id: 'u_free', template_id: 'calibration.expiring',
          sent_at: '2026-05-29T13:00:00Z', canceled_at: null,
          payload: { instrument_key: 'iaq', cal_date: '2025-06-01' },
        },
      ],
    })
    const r = await enqueueCalibrationReminder(supabase, baseEvent)
    expect(r).toEqual({ canceled: 0, enqueued: 0, skipped: true })
  })
})

describe('email-sequences — calibration templates', () => {
  it('calibration.expiring renders with meter + days', () => {
    const tpl = getTemplate('calibration.expiring')!
    expect(tpl).toBeTruthy()
    const ctx: UserContext = { user_id: 'u', email: 'a@b', first_name: 'Jamie', plan: 'pro' }
    const r = tpl.render(ctx, { meter: 'TSI 7575', days_to_expiry: 14 })
    expect(r.subject).toMatch(/TSI 7575/)
    expect(r.subject).toMatch(/expires soon/)
    expect(r.body).toMatch(/in 14 days/)
    expect(r.body).toMatch(/Hi Jamie/)
  })

  it('calibration.expired renders with meter + absolute days-since', () => {
    const tpl = getTemplate('calibration.expired')!
    const ctx: UserContext = { user_id: 'u', email: 'a@b', first_name: null, plan: 'free' }
    const r = tpl.render(ctx, { meter: 'Graywolf IQ-610', days_to_expiry: -5 })
    expect(r.subject).toMatch(/has expired/)
    expect(r.body).toMatch(/5 days ago/)
    expect(r.body).toMatch(/Hi there/)
  })

  it('falls back to generic copy when payload is missing', () => {
    const expiring = getTemplate('calibration.expiring')!.render({ user_id: 'u', email: 'a', first_name: null, plan: 'free' })
    expect(expiring.subject).toMatch(/your instrument/)
    const expired = getTemplate('calibration.expired')!.render({ user_id: 'u', email: 'a', first_name: null, plan: 'free' })
    expect(expired.subject).toMatch(/your instrument/)
  })

  it('are registered in ALL_TEMPLATES so the cron can find them', () => {
    expect(getTemplate('calibration.expiring')).toBeTruthy()
    expect(getTemplate('calibration.expired')).toBeTruthy()
  })

  it('are NOT in templatesForPlan (cron-scheduled, not signup sequence)', () => {
    const freeIds = templatesForPlan('free').map(t => t.id)
    const proIds = templatesForPlan('pro').map(t => t.id)
    expect(freeIds).not.toContain('calibration.expiring')
    expect(freeIds).not.toContain('calibration.expired')
    expect(proIds).not.toContain('calibration.expiring')
    expect(proIds).not.toContain('calibration.expired')
  })
})

// ─── Portfolio digest (habit-loop PR 3) ─────────────────────────────

describe('email-triggers — enqueuePortfolioDigest', () => {
  const baseEvent = {
    user_id: 'u1',
    quarter_key: '2026-Q2',
    stats: {
      quarter_label: 'Q2 2026',
      assessments_finalized: 5,
      delta_finalized: 2,
    },
  }

  it('throws on missing required fields', async () => {
    const supabase = makeSupabaseMock()
    await expect(enqueuePortfolioDigest(supabase, { ...baseEvent, user_id: '' })).rejects.toThrow()
    await expect(enqueuePortfolioDigest(supabase, { ...baseEvent, quarter_key: '' })).rejects.toThrow()
  })

  it('inserts one row carrying the stats in payload', async () => {
    const supabase = makeSupabaseMock()
    const r = await enqueuePortfolioDigest(supabase, baseEvent)
    expect(r).toEqual({ enqueued: 1, skipped: false })
    expect(supabase.state.inserts).toHaveLength(1)
    const row = supabase.state.inserts[0]
    expect(row.template_id).toBe('portfolio.digest')
    expect(row.payload).toMatchObject({
      quarter_key: '2026-Q2',
      assessments_finalized: 5,
      delta_finalized: 2,
    })
  })

  it('idempotency: re-running same quarter is a no-op', async () => {
    const supabase = makeSupabaseMock()
    await enqueuePortfolioDigest(supabase, baseEvent)
    const r = await enqueuePortfolioDigest(supabase, baseEvent)
    expect(r).toEqual({ enqueued: 0, skipped: true })
    expect(supabase.state.inserts).toHaveLength(1)
  })

  it('skips when a sent row for this quarter already exists', async () => {
    const supabase = makeSupabaseMock({
      queue: [
        {
          id: 1, user_id: 'u1', template_id: 'portfolio.digest',
          sent_at: '2026-07-01T13:30:00Z', canceled_at: null,
          payload: { quarter_key: '2026-Q2' },
        },
      ],
    })
    const r = await enqueuePortfolioDigest(supabase, baseEvent)
    expect(r).toEqual({ enqueued: 0, skipped: true })
  })

  it('does NOT skip when prior row was canceled', async () => {
    const supabase = makeSupabaseMock({
      queue: [
        {
          id: 1, user_id: 'u1', template_id: 'portfolio.digest',
          sent_at: null, canceled_at: '2026-06-30T00:00:00Z',
          payload: { quarter_key: '2026-Q2' },
        },
      ],
    })
    const r = await enqueuePortfolioDigest(supabase, baseEvent)
    expect(r.enqueued).toBe(1)
    expect(r.skipped).toBe(false)
  })

  it('does NOT collide across different quarters for the same user', async () => {
    const supabase = makeSupabaseMock()
    await enqueuePortfolioDigest(supabase, baseEvent)
    const r = await enqueuePortfolioDigest(supabase, { ...baseEvent, quarter_key: '2026-Q3', stats: { quarter_label: 'Q3 2026' } })
    expect(r.enqueued).toBe(1)
    expect(supabase.state.inserts).toHaveLength(2)
  })
})

describe('email-sequences — portfolio.digest template', () => {
  const baseStats = {
    quarter_label: 'Q2 2026',
    prior_label: 'Q1 2026',
    assessments_finalized: 5,
    assessments_finalized_prior: 3,
    delta_finalized: 2,
    reports_exported: 5,
    distinct_sites: 3,
  }

  it('renders with stats interpolated and a positive delta phrase', () => {
    const tpl = getTemplate('portfolio.digest')!
    const ctx: UserContext = { user_id: 'u', email: 'a@b', first_name: 'Jamie', plan: 'pro' }
    const r = tpl.render(ctx, baseStats)
    expect(r.subject).toMatch(/Q2 2026/)
    expect(r.subject).toMatch(/5 assessments/)
    expect(r.body).toMatch(/Hi Jamie/)
    expect(r.body).toMatch(/Assessments finalized: 5/)
    expect(r.body).toMatch(/Reports exported:\s+5/)
    expect(r.body).toMatch(/Sites assessed:\s+3/)
    expect(r.body).toMatch(/2 more than Q1 2026/)
  })

  it('renders a "fewer" delta phrase when current < prior', () => {
    const tpl = getTemplate('portfolio.digest')!
    const ctx: UserContext = { user_id: 'u', email: 'a@b', first_name: null, plan: 'free' }
    const r = tpl.render(ctx, { ...baseStats, assessments_finalized: 2, assessments_finalized_prior: 5, delta_finalized: -3 })
    expect(r.body).toMatch(/3 fewer than Q1 2026/)
  })

  it('renders "same as" when delta is zero', () => {
    const tpl = getTemplate('portfolio.digest')!
    const ctx: UserContext = { user_id: 'u', email: 'a@b', first_name: null, plan: 'free' }
    const r = tpl.render(ctx, { ...baseStats, assessments_finalized: 3, assessments_finalized_prior: 3, delta_finalized: 0 })
    expect(r.body).toMatch(/Same as Q1 2026/)
  })

  it('handles 0 prior with positive current as "more than ... (no assessments)"', () => {
    const tpl = getTemplate('portfolio.digest')!
    const ctx: UserContext = { user_id: 'u', email: 'a@b', first_name: null, plan: 'free' }
    const r = tpl.render(ctx, { ...baseStats, assessments_finalized: 2, assessments_finalized_prior: 0, delta_finalized: 2 })
    expect(r.body).toMatch(/no assessments recorded that quarter/)
  })

  it('omits the sites line when distinct_sites is 0', () => {
    const tpl = getTemplate('portfolio.digest')!
    const ctx: UserContext = { user_id: 'u', email: 'a@b', first_name: null, plan: 'free' }
    const r = tpl.render(ctx, { ...baseStats, distinct_sites: 0 })
    expect(r.body).not.toMatch(/Sites assessed/)
  })

  it('is registered and NOT in templatesForPlan', () => {
    expect(getTemplate('portfolio.digest')).toBeTruthy()
    expect(templatesForPlan('free').map(t => t.id)).not.toContain('portfolio.digest')
    expect(templatesForPlan('pro').map(t => t.id)).not.toContain('portfolio.digest')
  })
})

describe('email-sequences — reassessment.reminder template', () => {
  it('renders with the site_name from the payload', () => {
    const tpl = getTemplate('reassessment.reminder')!
    expect(tpl).toBeTruthy()
    const ctx: UserContext = { user_id: 'u', email: 'a@b', first_name: 'Jamie', plan: 'pro' }
    const r = tpl.render(ctx, { site_name: 'Acme HQ', site_id: 'site-1', due_at: '2027-05-29T12:00:00Z' })
    expect(r.subject).toBe('Re-assessment due at Acme HQ')
    expect(r.body).toMatch(/Hi Jamie/)
    expect(r.body).toMatch(/Acme HQ is due for re-assessment/)
    expect(r.body).toMatch(/start=site&id=site-1/)
  })

  it('falls back to generic copy when payload is empty', () => {
    const tpl = getTemplate('reassessment.reminder')!
    const ctx: UserContext = { user_id: 'u', email: 'a@b', first_name: null, plan: 'free' }
    const r = tpl.render(ctx)
    expect(r.subject).toMatch(/Re-assessment due at one of your sites/)
    expect(r.body).toMatch(/Hi there/)
  })

  it('is registered in ALL_TEMPLATES so the cron can find it', () => {
    expect(getTemplate('reassessment.reminder')).toBeTruthy()
  })

  it('is NOT in templatesForPlan (event-scheduled, not signup sequence)', () => {
    const freeIds = templatesForPlan('free').map(t => t.id)
    const proIds = templatesForPlan('pro').map(t => t.id)
    expect(freeIds).not.toContain('reassessment.reminder')
    expect(proIds).not.toContain('reassessment.reminder')
  })
})

// ─── Cron processor: drain idempotency ─────────────────────────────
describe('cron-email-queue-processor — basic drain + idempotency', () => {
  // We test only that the processor's SELECT filter is correct by reading
  // the source. Actual Resend integration is mocked at the Vercel handler
  // level in production; here we verify the state-machine guarantee:
  // no row is sent twice.

  it('source enforces sent_at IS NULL and canceled_at IS NULL filters', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync(
      new URL('../../scripts/cron-email-queue-processor.ts', import.meta.url),
      'utf8'
    )
    expect(src).toMatch(/\.is\('sent_at',\s*null\)/)
    expect(src).toMatch(/\.is\('canceled_at',\s*null\)/)
    expect(src).toMatch(/sent_at:\s*now\.toISOString\(\)/)
  })
})
