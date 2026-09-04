/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Supabase client — single instance shared across the app
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** Analytics — fire-and-forget, never blocks UI */
export function trackEvent(eventType, eventData = {}) {
  if (!supabase) return
  try {
    const sessionId = sessionStorage.getItem('aiq_sid') || (() => {
      const id = crypto.randomUUID()
      sessionStorage.setItem('aiq_sid', id)
      return id
    })()
    // Migration 033 requires user_id = auth.uid() on direct inserts, so an
    // event is attributed to the signed-in user or not written at all
    // (anonymous rows used to be unbounded and un-erasable — audit §4 M2).
    supabase.auth.getSession()
      .then(({ data }) => {
        const userId = data && data.session && data.session.user && data.session.user.id
        if (!userId) return
        return supabase.from('analytics_events').insert({
          user_id: userId,
          session_id: sessionId,
          event_type: eventType,
          event_data: eventData,
        })
      })
      .then(() => {}).catch(() => {})
  } catch {}
}
