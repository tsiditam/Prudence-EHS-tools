/**
 * Free-tier signup + consumption helpers.
 *
 * Centralizes the profile-bootstrap step that runs after Supabase auth
 * creates a new user: a profiles row is inserted with plan='free',
 * credits_remaining=1, free_tier_signup_at=NOW(). This is the single
 * source of truth so the post-signup hook (client) and any backfill
 * scripts (server) cannot drift.
 *
 * Free-tier users get 1 credit per calendar month, replenished by the
 * scripts/cron-free-tier-reset.ts cron. The /api/credits endpoint
 * returns 402 Payment Required when a free-tier user has 0 credits;
 * the SPA opens the pricing sheet on that response.
 */

import { TIER_CREDITS } from './stripe-prices'

export interface SupabaseLike {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
    upsert?: (row: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
    select: (s?: string) => {
      eq: (col: string, val: unknown) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
        maybeSingle?: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
      }
    }
  }
}

export interface FreeTierProfile {
  id: string
  plan: 'free'
  credits_remaining: 1
  subscription_status: 'free'
  stripe_customer_id: null
  billing_period: 'monthly'
  free_tier_signup_at: string
}

export function makeFreeTierProfileRow(userId: string, now: Date = new Date()): FreeTierProfile {
  return {
    id: userId,
    plan: 'free',
    credits_remaining: TIER_CREDITS.free as 1,
    subscription_status: 'free',
    stripe_customer_id: null,
    billing_period: 'monthly',
    free_tier_signup_at: now.toISOString(),
  }
}

/**
 * Idempotent: if a profile row already exists for this user, the call
 * is a no-op (returns ok=true, created=false). Otherwise inserts a
 * fresh free-tier row.
 */
export async function bootstrapFreeTierProfile(
  supabase: SupabaseLike,
  userId: string,
  now: Date = new Date(),
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  if (!userId) return { ok: false, created: false, error: 'userId required' }

  // Check for existing row first.
  const sel = supabase.from('profiles').select('id').eq('id', userId)
  const lookup = sel.maybeSingle ? await sel.maybeSingle() : await sel.single()
  if (lookup.data) return { ok: true, created: false }

  const row = makeFreeTierProfileRow(userId, now)
  const { error } = await supabase.from('profiles').insert(row as unknown as Record<string, unknown>)
  if (error) return { ok: false, created: false, error: error.message }
  return { ok: true, created: true }
}
