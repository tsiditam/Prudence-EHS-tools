/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
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
    const sessionId = sessionStorage.getItem('or_sid') || (() => {
      const id = crypto.randomUUID()
      sessionStorage.setItem('or_sid', id)
      return id
    })()
    supabase.from('analytics_events').insert({
      session_id: sessionId,
      event_type: eventType,
      event_data: eventData,
    }).then(() => {}).catch(() => {})
  } catch {}
}
