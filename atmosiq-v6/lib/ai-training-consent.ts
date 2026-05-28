/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Single source of truth for "may we use this user's data for AI
 * fine-tuning?". Read by scripts/export-finetune-dataset.mjs and
 * any future internal data-mining path so consent state is checked
 * in exactly one place.
 *
 * Does NOT gate persistence — chats are always saved (the
 * user-visible "Chats are saved to your account" promise depends
 * on it). This helper only controls whether the saved rows make
 * it into a training export.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface TrainingConsentRow {
  ai_training_consent: boolean
  ai_training_consent_updated_at: string | null
}

/**
 * Returns true when the user's profile row has
 * ai_training_consent = true. Returns false on missing row,
 * query error, or explicit opt-out — fail-closed so a transient
 * Supabase error can't silently include a non-consenting user's
 * data in a training run.
 */
export async function userConsentsToTraining(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId) return false
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_training_consent')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return false
  return data.ai_training_consent === true
}

/**
 * Batch variant — returns the set of user ids (from the input)
 * whose profile carries ai_training_consent = true. Used by the
 * export script to filter a large message-row dump in one query
 * instead of one round-trip per user.
 */
export async function filterConsentingUserIds(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, ai_training_consent')
    .in('id', userIds)
    .eq('ai_training_consent', true)
  if (error || !data) return new Set()
  return new Set((data as { id: string }[]).map((r) => r.id))
}
