/**
 * scripts/verify-password-reset.ts
 *
 * End-to-end verification that the Supabase password-reset flow works
 * against the live production project. Run nightly as part of the
 * smoke-test suite (§6).
 *
 * Flow:
 *   1. Create a test user via Supabase admin API (email_confirm = true so
 *      we don't need to verify the signup email).
 *   2. Trigger password reset via auth.resetPasswordForEmail.
 *   3. Use admin.generateLink to get the recovery link directly (faster
 *      than polling the inbox; same code path, same token format).
 *   4. Extract the access_token from the recovery link.
 *   5. Use that token to authenticate, then call updateUser({ password })
 *      to set a new password.
 *   6. Verify the new password works via signInWithPassword.
 *   7. Verify the OLD password no longer works.
 *   8. Clean up — delete the test user.
 *
 * Env vars required:
 *   SUPABASE_URL                   — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY      — service-role key (admin operations)
 *   SUPABASE_REDIRECT_URL          — production reset URL, e.g. https://app/auth/reset
 *   PASSWORD_RESET_TEST_EMAIL_SEED — optional; default 'pwreset-smoke-{ts}@example.test'
 *
 * Exit code: 0 on full pass, 1 on any step failure. Each failure logs
 * a structured line so CI can surface it.
 */

import { createClient } from '@supabase/supabase-js'

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

async function main(): Promise<number> {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const redirectTo = process.env.SUPABASE_REDIRECT_URL || 'https://atmosflow.app/auth/reset-password'

  if (!url || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    return 2
  }

  const ts = Date.now()
  const seed = process.env.PASSWORD_RESET_TEST_EMAIL_SEED || `pwreset-smoke-${ts}@example.test`
  const ORIGINAL_PASSWORD = `Init-${ts}-original!`
  const NEW_PASSWORD = `Init-${ts}-rotated!`

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  console.log(`\n  Verifying password reset flow for ${seed}\n`)

  // 1. Create test user
  const created = await step('Create test user', async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: seed,
      password: ORIGINAL_PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('no user returned')
    return data.user
  })
  if (!created) return 1
  const userId = created.id

  let cleanedUp = false
  const cleanup = async () => {
    if (cleanedUp) return
    cleanedUp = true
    await step('Cleanup: delete test user', async () => {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw new Error(error.message)
    })
  }

  try {
    // 2. Confirm original password works (baseline)
    await step('Login with original password', async () => {
      const { error } = await admin.auth.signInWithPassword({ email: seed, password: ORIGINAL_PASSWORD })
      if (error) throw new Error(error.message)
      await admin.auth.signOut()
    })

    // 3. Trigger password reset
    await step('Trigger password reset email', async () => {
      const { error } = await admin.auth.resetPasswordForEmail(seed, { redirectTo })
      if (error) throw new Error(error.message)
    })

    // 4. Generate the recovery link directly (admin-side, no inbox polling)
    const recoveryLink = await step('Generate recovery link via admin API', async () => {
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: seed,
        options: { redirectTo },
      })
      if (error) throw new Error(error.message)
      const link = data.properties?.action_link
      if (!link) throw new Error('no action_link in generateLink response')
      return link
    })
    if (!recoveryLink) { await cleanup(); return 1 }

    // 5. Extract access_token from the recovery link fragment
    //    Supabase recovery links look like: {redirectTo}#access_token=...&refresh_token=...&type=recovery
    const accessToken = await step('Extract access_token from recovery link', async () => {
      const url = new URL(recoveryLink)
      const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
      const params = new URLSearchParams(fragment)
      const tok = params.get('access_token')
      if (!tok) {
        // Some Supabase configs put the token in the query string
        const qtok = url.searchParams.get('access_token')
        if (qtok) return qtok
        throw new Error('access_token not found in link')
      }
      return tok
    })
    if (!accessToken) { await cleanup(); return 1 }

    // 6. Set new password using the recovery session
    await step('Set new password via recovery session', async () => {
      const sessionClient = createClient(url, serviceKey, { auth: { persistSession: false } })
      const { data: sess, error: setErr } = await sessionClient.auth.setSession({
        access_token: accessToken,
        refresh_token: 'unused',
      })
      if (setErr) throw new Error(`setSession: ${setErr.message}`)
      if (!sess.user) throw new Error('no user in recovery session')
      const { error } = await sessionClient.auth.updateUser({ password: NEW_PASSWORD })
      if (error) throw new Error(error.message)
      await sessionClient.auth.signOut()
    })

    // 7. New password works
    await step('Login with new password', async () => {
      const { error } = await admin.auth.signInWithPassword({ email: seed, password: NEW_PASSWORD })
      if (error) throw new Error(error.message)
      await admin.auth.signOut()
    })

    // 8. Old password rejected
    await step('Old password rejected', async () => {
      const { error } = await admin.auth.signInWithPassword({ email: seed, password: ORIGINAL_PASSWORD })
      if (!error) throw new Error('old password was still accepted — reset did not invalidate it')
    })
  } finally {
    await cleanup()
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n  ${results.length - failed.length} / ${results.length} steps passed\n`)
  return failed.length === 0 ? 0 : 1
}

main().then(code => process.exit(code)).catch(err => {
  console.error('unhandled:', err)
  process.exit(1)
})
