/**
 * Tests for the password reset wrapper in lib/password-reset.ts.
 *
 * The wrapper provides a server-side surface around Supabase auth so the
 * reset flow can be exercised in unit tests without an actual mailbox.
 *
 * Contract pinned by these tests:
 *   • requestPasswordReset → returns ok=true on success, surfaces error message on failure
 *   • setNewPassword       → enforces minimum length, calls updateUser on success
 *   • verifyLoginWithPassword → returns userId on success, rejects on auth error
 *   • Old password no longer works after reset (round-trip via mock)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  requestPasswordReset,
  setNewPassword,
  verifyLoginWithPassword,
  type SupabaseAuthLike,
} from '../../lib/password-reset'

// ─── Mock Supabase auth client ──────────────────────────────────────
type AuthError = { message: string } | null

function makeMockClient(initialUserPassword: Record<string, string>) {
  const passwords: Record<string, string> = { ...initialUserPassword }
  let resetEmailSentTo: string | null = null
  let lastUpdateUser: { email?: string; password?: string } | null = null
  let currentSessionEmail: string | null = null
  const calls: string[] = []

  const client: SupabaseAuthLike & { _state: { passwords: Record<string, string>; resetEmailSentTo: string | null; lastUpdateUser: typeof lastUpdateUser; calls: string[] } } = {
    _state: { passwords, resetEmailSentTo, lastUpdateUser, calls },
    auth: {
      resetPasswordForEmail: async (email: string) => {
        calls.push(`resetPasswordForEmail:${email}`)
        if (!passwords[email]) {
          // Supabase returns 200 even for non-existent emails — but for tests we surface this.
          // Default: "always succeeds" matches Supabase's real behavior.
        }
        resetEmailSentTo = email
        client._state.resetEmailSentTo = email
        return { data: {}, error: null as AuthError }
      },
      updateUser: async (attrs: { password?: string; email?: string }) => {
        calls.push(`updateUser:${JSON.stringify(attrs)}`)
        if (!currentSessionEmail) return { data: { user: null }, error: { message: 'not authenticated' } }
        lastUpdateUser = attrs
        client._state.lastUpdateUser = attrs
        if (attrs.password) {
          passwords[currentSessionEmail] = attrs.password
        }
        return { data: { user: { id: 'uid-' + currentSessionEmail, email: currentSessionEmail } }, error: null as AuthError }
      },
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        calls.push(`signInWithPassword:${email}:${password === passwords[email] ? 'ok' : 'wrong'}`)
        if (passwords[email] && passwords[email] === password) {
          currentSessionEmail = email
          return { data: { user: { id: 'uid-' + email } }, error: null as AuthError }
        }
        return { data: { user: null }, error: { message: 'Invalid login credentials' } }
      },
      signOut: async () => {
        calls.push('signOut')
        currentSessionEmail = null
        return { error: null as AuthError }
      },
      // Used by the script — exposing fakeAdmin for completeness, but not required by these unit tests.
      admin: {
        createUser: async ({ email, password }: { email: string; password?: string; email_confirm?: boolean }) => {
          if (password) passwords[email] = password
          return { data: { user: { id: 'uid-' + email, email } }, error: null as AuthError }
        },
        deleteUser: async (_id: string) => ({ data: {}, error: null as AuthError }),
        generateLink: async ({ email }) => ({
          data: { properties: { action_link: `https://example.com/auth/reset#access_token=tok_${email}&refresh_token=r&type=recovery` } },
          error: null as AuthError,
        }),
      },
    },
  }
  return client
}

let client: ReturnType<typeof makeMockClient>

beforeEach(() => {
  client = makeMockClient({ 'alice@example.com': 'OldP@ssword1' })
})

// ─── tests ──────────────────────────────────────────────────────────
describe('lib/password-reset', () => {
  describe('requestPasswordReset', () => {
    it('returns ok=true and triggers a reset email', async () => {
      const r = await requestPasswordReset(client, 'alice@example.com')
      expect(r.ok).toBe(true)
      expect(client._state.resetEmailSentTo).toBe('alice@example.com')
    })

    it('rejects empty email', async () => {
      const r = await requestPasswordReset(client, '')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/email/i)
    })

    it('forwards Supabase errors', async () => {
      client.auth.resetPasswordForEmail = async () => ({ data: null, error: { message: 'rate limit' } })
      const r = await requestPasswordReset(client, 'alice@example.com')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/rate limit/)
    })
  })

  describe('setNewPassword', () => {
    it('rejects passwords shorter than 8 characters', async () => {
      // Need an active session for updateUser to work, but the length check
      // happens before the call.
      const r = await setNewPassword(client, 'short')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/8/)
    })

    it('updates password via updateUser when valid', async () => {
      // Establish session first
      await client.auth.signInWithPassword({ email: 'alice@example.com', password: 'OldP@ssword1' })
      const r = await setNewPassword(client, 'NewP@ssword1!')
      expect(r.ok).toBe(true)
      expect(client._state.lastUpdateUser?.password).toBe('NewP@ssword1!')
    })

    it('forwards Supabase errors', async () => {
      // No session active → updateUser will return error
      const r = await setNewPassword(client, 'NewP@ssword1!')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/authenticated/)
    })
  })

  describe('verifyLoginWithPassword', () => {
    it('returns userId on success', async () => {
      const r = await verifyLoginWithPassword(client, 'alice@example.com', 'OldP@ssword1')
      expect(r.ok).toBe(true)
      expect(r.userId).toBe('uid-alice@example.com')
    })

    it('rejects wrong password', async () => {
      const r = await verifyLoginWithPassword(client, 'alice@example.com', 'WrongPassword')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/invalid/i)
    })
  })

  describe('round-trip: reset, set new, login with new, old rejected', () => {
    it('full reset flow invalidates the old password', async () => {
      // 1. Request reset (Supabase sends magic link in real life)
      const a = await requestPasswordReset(client, 'alice@example.com')
      expect(a.ok).toBe(true)

      // 2. The user follows the link — simulated by signing in with old password
      //    (in real flow, the recovery session is established by the link tokens).
      await client.auth.signInWithPassword({ email: 'alice@example.com', password: 'OldP@ssword1' })

      // 3. Set new password
      const b = await setNewPassword(client, 'BrandNewP@ss!')
      expect(b.ok).toBe(true)

      // 4. New password works
      const c = await verifyLoginWithPassword(client, 'alice@example.com', 'BrandNewP@ss!')
      expect(c.ok).toBe(true)

      // 5. Old password rejected
      const d = await verifyLoginWithPassword(client, 'alice@example.com', 'OldP@ssword1')
      expect(d.ok).toBe(false)
    })
  })
})
