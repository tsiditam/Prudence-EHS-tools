/**
 * Password reset wrapper.
 *
 * Thin layer around Supabase auth so the reset flow has a single
 * server-side surface that can be tested in isolation. The Supabase
 * client is dependency-injected so tests can mock it without touching
 * the real auth backend.
 */

export interface SupabaseAuthLike {
  auth: {
    resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) => Promise<{ data: unknown; error: { message: string } | null }>
    updateUser: (attrs: { password?: string; email?: string }) => Promise<{ data: { user: { id: string; email: string } | null }; error: { message: string } | null }>
    signInWithPassword: (creds: { email: string; password: string }) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>
    signOut: () => Promise<{ error: { message: string } | null }>
    admin?: {
      createUser?: (attrs: { email: string; password?: string; email_confirm?: boolean }) => Promise<{ data: { user: { id: string; email: string } | null }; error: { message: string } | null }>
      deleteUser?: (id: string) => Promise<{ data: unknown; error: { message: string } | null }>
      generateLink?: (params: { type: 'recovery' | 'magiclink'; email: string; options?: { redirectTo?: string } }) => Promise<{ data: { properties?: { action_link?: string } }; error: { message: string } | null }>
    }
  }
}

export interface ResetPasswordResult {
  ok: boolean
  error?: string
}

export async function requestPasswordReset(
  client: SupabaseAuthLike,
  email: string,
  redirectTo?: string,
): Promise<ResetPasswordResult> {
  if (!email || typeof email !== 'string') {
    return { ok: false, error: 'email required' }
  }
  const { error } = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function setNewPassword(
  client: SupabaseAuthLike,
  newPassword: string,
): Promise<ResetPasswordResult> {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, error: 'password must be at least 8 characters' }
  }
  const { error } = await client.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function verifyLoginWithPassword(
  client: SupabaseAuthLike,
  email: string,
  password: string,
): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  if (!data.user) return { ok: false, error: 'no user returned' }
  return { ok: true, userId: data.user.id }
}
