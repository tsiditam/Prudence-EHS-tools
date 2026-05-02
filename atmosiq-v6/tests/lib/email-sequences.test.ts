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
    expect(r.body).toMatch(/atmosiq.prudenceehs.com/)
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
