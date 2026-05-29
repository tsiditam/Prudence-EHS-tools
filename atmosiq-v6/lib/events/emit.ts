/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * emitEvent — browser-side helper for the event spine. POSTs to
 * /api/events, which validates the EventName allowlist and forwards
 * into auditLog().
 *
 * Best-effort semantics: every error is swallowed. A logging miss
 * must never break the user action that triggered it. Mirrors the
 * established trackEvent() pattern in src/utils/supabaseClient.js.
 *
 * Auth: piggybacks on the existing supabase client session. The
 * endpoint reads the Bearer token and derives actor_id server-side;
 * the body can never specify the actor.
 *
 * For server-side emit, call `auditLog()` (api/_audit.js) directly
 * with `action: EventName` — no extra helper needed there, the
 * typed enum is the unifying piece.
 */

import { supabase } from '../../src/utils/supabaseClient'
import type { EmitEventInput, EventName } from './types'

/**
 * Fire-and-forget emit. Resolves true on a 2xx response, false on
 * any failure (no session, network error, non-2xx, exception). Never
 * throws.
 */
export async function emitEvent(name: EventName, input: EmitEventInput = {}): Promise<boolean> {
  try {
    if (!supabase) return false
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return false

    const res = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name,
        target_id: input.target_id ?? null,
        target_type: input.target_type ?? null,
        details: input.details ?? null,
      }),
      // Keep the request alive if the page unloads mid-flight
      // (e.g. export → page navigation). Browsers that don't support
      // it ignore the option silently.
      keepalive: true,
    })
    return res.ok
  } catch {
    return false
  }
}

export type { EmitEventInput, EventName } from './types'
export { KNOWN_EVENTS } from './types'
