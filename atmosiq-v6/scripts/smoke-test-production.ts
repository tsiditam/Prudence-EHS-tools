/**
 * scripts/smoke-test-production.ts
 *
 * Daily production smoke test. Exercises the full signup → checkout
 * → assessment → narrative → deletion flow against the LIVE production
 * environment (Vercel, production Supabase) but with Stripe in TEST
 * MODE. Catches breakage from Supabase schema drift, deploy regressions,
 * Stripe API version changes, etc.
 *
 * Wiring (§6):
 *   • GitHub Actions cron at 6:00 UTC daily (.github/workflows/smoke-test.yml)
 *   • On failure → Slack webhook OR email to SMOKE_TEST_ALERT_EMAIL
 *   • Production Stripe is NEVER hit. STRIPE_TEST_SECRET_KEY only.
 *
 * Required env:
 *   SMOKE_TEST_BASE_URL          e.g. https://atmosflow.app
 *   SUPABASE_URL                 production Supabase
 *   SUPABASE_SERVICE_ROLE_KEY    service role for cleanup
 *   STRIPE_TEST_SECRET_KEY       Stripe test mode key (sk_test_...)
 *   SMOKE_TEST_ALERT_EMAIL       optional; alert recipient
 *   SLACK_WEBHOOK_URL            optional; alert channel
 *
 * Exit code 0 on full pass, 1 on any step failure.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface StepResult {
  step: string
  ok: boolean
  durationMs: number
  detail?: string
}

const results: StepResult[] = []

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const start = Date.now()
  try {
    const out = await fn()
    results.push({ step: name, ok: true, durationMs: Date.now() - start })
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`)
    return out
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    results.push({ step: name, ok: false, durationMs: Date.now() - start, detail: msg })
    console.error(`  ✗ ${name} (${Date.now() - start}ms): ${msg}`)
    return null
  }
}

// ─── Stripe test-mode helper ────────────────────────────────────────
async function stripeTestRequest(path: string, body: Record<string, string>): Promise<unknown> {
  const key = process.env.STRIPE_TEST_SECRET_KEY
  if (!key) throw new Error('STRIPE_TEST_SECRET_KEY not set')
  if (!key.startsWith('sk_test_')) {
    throw new Error('refusing to run smoke test — STRIPE_TEST_SECRET_KEY does not start with sk_test_')
  }
  const formBody = new URLSearchParams(body).toString()
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Stripe ${path} failed: ${resp.status} ${txt}`)
  }
  return resp.json()
}

// ─── Alert routing ──────────────────────────────────────────────────
async function alertOnFailure(failed: StepResult[]): Promise<void> {
  if (failed.length === 0) return
  const summary = failed.map(f => `• ${f.step}: ${f.detail ?? 'unknown'}`).join('\n')
  const message = `AtmosFlow production smoke test FAILED\n\n${summary}`
  const slack = process.env.SLACK_WEBHOOK_URL
  if (slack) {
    try {
      await fetch(slack, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      })
    } catch {}
  }
  // Email alerts go through Resend if SMOKE_TEST_ALERT_EMAIL is set; the
  // Resend API key is the same one /api/early-access uses.
  const alertEmail = process.env.SMOKE_TEST_ALERT_EMAIL
  const resendKey = process.env.RESEND_API_KEY
  if (alertEmail && resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'smoke-test@prudenceehs.com',
          to: [alertEmail],
          subject: `AtmosFlow smoke test FAILED — ${failed.length} step(s)`,
          text: message,
        }),
      })
    } catch {}
  }
}

// ─── Smoke test flow ────────────────────────────────────────────────
export async function runSmokeTest(): Promise<number> {
  const baseUrl = process.env.SMOKE_TEST_BASE_URL || 'https://atmosflow.app'
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    return 2
  }

  const ts = Date.now()
  const email = `smoke-test-${ts}@prudenceehs.com`
  const password = `Smoke-${ts}-Init1!`

  console.log(`\n  Production smoke test\n  base=${baseUrl}\n  email=${email}\n`)

  const admin: SupabaseClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  let userId: string | null = null
  let stripeCustomerId: string | null = null

  const cleanup = async () => {
    await step('Cleanup: hard-delete test user', async () => {
      if (userId) {
        // Best-effort cascade cleanup — analytics + ledger have FKs.
        await admin.from('analytics_events').delete().eq('user_id', userId)
        await admin.from('credits_ledger').delete().eq('user_id', userId)
        await admin.from('purchases').delete().eq('user_id', userId)
        await admin.from('narrative_generations').delete().eq('user_id', userId)
        await admin.from('assessments').delete().eq('user_id', userId)
        await admin.from('profiles').delete().eq('id', userId)
        await admin.auth.admin.deleteUser(userId)
      }
      if (stripeCustomerId) {
        try { await stripeTestRequest(`customers/${stripeCustomerId}`, {}) } catch {}
      }
    })
  }

  try {
    // 1. Signup
    const signup = await step('Sign up via admin createUser (production Supabase)', async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) throw new Error(error.message)
      if (!data.user) throw new Error('no user returned')
      return data.user
    })
    if (!signup) { await cleanup(); return 1 }
    userId = signup.id

    // 2. Login
    const session = await step('Login with new credentials', async () => {
      const { data, error } = await admin.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message)
      return data.session
    })
    if (!session) { await cleanup(); return 1 }

    // 3. Stripe test-mode checkout (Solo plan, $149)
    const stripeSession = await step('Create Stripe TEST checkout session', async () => {
      const result = await stripeTestRequest('checkout/sessions', {
        'success_url': `${baseUrl}/?stripe=success`,
        'cancel_url': `${baseUrl}/?stripe=cancel`,
        'mode': 'payment',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': 'Solo (smoke test)',
        'line_items[0][price_data][unit_amount]': '14900',
        'line_items[0][quantity]': '1',
        'metadata[user_id]': userId!,
        'metadata[credits]': '50',
        'metadata[plan]': 'solo',
      }) as { id: string; customer?: string }
      return result
    })
    if (!stripeSession) { await cleanup(); return 1 }
    if (stripeSession.customer) stripeCustomerId = stripeSession.customer

    // 4. Verify webhook would fulfill (we cannot complete the checkout
    //    without a browser; we verify the webhook idempotency table is
    //    reachable instead).
    await step('Verify stripe_webhook_events table is queryable', async () => {
      const { error } = await admin.from('stripe_webhook_events').select('event_id').limit(1)
      if (error) throw new Error(error.message)
    })

    // 5. Insert a synthetic assessment row
    await step('Save synthetic assessment', async () => {
      const { error } = await admin.from('assessments').insert({
        id: `smoke-${ts}`,
        user_id: userId,
        status: 'complete',
        facility_name: 'Smoke Test Facility',
        building: { fn: 'Smoke', fl: '123 Test St' },
        zones: [],
        photos: {},
        composite: { tot: 78, risk: 'medium' },
      } as Record<string, unknown>)
      if (error) throw new Error(error.message)
    })

    // 6. Verify narrative endpoint is reachable (without consuming budget,
    //    we just check the route is up by hitting it without a body —
    //    expecting 400)
    await step('Verify /api/narrative endpoint is reachable (expects 400 on empty body)', async () => {
      const r = await fetch(`${baseUrl}/api/narrative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      })
      if (r.status !== 400 && r.status !== 401) {
        throw new Error(`expected 400/401 on empty body, got ${r.status}`)
      }
    })

    // 7. Trigger account deletion (which is what we're verifying works
    //    in production — the GDPR pathway).
    await step('Trigger account deletion via /api/delete-account', async () => {
      const r = await fetch(`${baseUrl}/api/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      })
      if (!r.ok) {
        const txt = await r.text()
        throw new Error(`delete-account returned ${r.status}: ${txt}`)
      }
      const body = await r.json() as { status?: string; entities_purged?: string[] }
      if (body.status !== 'deleted') {
        throw new Error(`expected status=deleted, got ${JSON.stringify(body)}`)
      }
      if (!body.entities_purged?.includes('profiles')) {
        throw new Error('profiles not in entities_purged')
      }
      // Don't double-cleanup if delete-account already cleaned up.
      userId = null
    })

    // 8. Verify deletion_audit row was written
    await step('Verify deletion_audit row exists for hashed user_id', async () => {
      const crypto = await import('node:crypto')
      const hash = crypto.createHash('sha256').update(signup.id).digest('hex')
      const { data, error } = await admin
        .from('deletion_audit')
        .select('user_id_hash, entities_purged')
        .eq('user_id_hash', hash)
        .order('deleted_at', { ascending: false })
        .limit(1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('no deletion_audit row found')
      if (!data[0].entities_purged.includes('profiles')) {
        throw new Error('deletion_audit row missing profiles entity')
      }
    })
  } finally {
    await cleanup()
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n  ${results.length - failed.length} / ${results.length} steps passed\n`)
  await alertOnFailure(failed)
  return failed.length === 0 ? 0 : 1
}

// Allow the script to be loaded for testing without auto-executing.
if (process.argv[1] && process.argv[1].endsWith('smoke-test-production.ts')) {
  runSmokeTest().then(code => process.exit(code)).catch(err => {
    console.error('unhandled:', err)
    process.exit(1)
  })
}
