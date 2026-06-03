/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * User-profile helpers over the RLS-scoped user_profiles table (migration 001).
 * The profile carries the assessor defaults (name/firm/phone/instrument) that
 * auto-populate assessments. Degrades to null when Supabase is unconfigured.
 */

import { supabase } from './supabaseClient'

export async function getProfile(userId) {
  if (!supabase || !userId) return null
  try {
    const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).single()
    return data || null
  } catch {
    return null
  }
}

/** Create or update the signed-in user's profile. */
export async function upsertProfile(userId, email, fields = {}) {
  if (!supabase || !userId) return null
  try {
    const row = {
      id: userId,
      email,
      full_name: fields.name ?? fields.full_name ?? null,
      firm: fields.firm ?? null,
      phone: fields.phone ?? null,
      instrument: fields.instrument ?? null,
      calibration_date: fields.calDate || fields.calibration_date || null,
      updated_at: new Date().toISOString(),
    }
    const { data } = await supabase.from('user_profiles').upsert(row).select('*').single()
    return data || null
  } catch {
    return null
  }
}
