/**
 * Vercel Serverless Function — /api/field-assistant-feedback
 *
 * Records a user's thumbs-up / thumbs-down rating on a single
 * assistant message (plus an optional free-text reason for 👎).
 * Backs the inline feedback affordance under each assistant turn
 * in the AtmosFlow AI sheet.
 *
 * The rating drives the fine-tuning export pipeline:
 *   scripts/export-finetune-dataset.mjs only includes 👍 + unrated
 *   turns by default. 👎 turns are excluded unless --include-negatives
 *   is passed (for preference-pair training later).
 *
 * Auth: same Bearer-token pattern as /api/field-assistant — caller
 * forwards the Supabase access token; we validate via auth.getUser;
 * RLS on field_assistant_feedback enforces user_id ownership as a
 * second layer of defense.
 *
 * Endpoint:
 *   POST /api/field-assistant-feedback
 *     body: { message_id: string, rating: 'up'|'down', reason?: string }
 *     → 200 { ok: true } | 400 { error: 'bad_input' }
 *       | 401 { error: 'invalid_token' }
 *       | 404 { error: 'message_not_found' }
 *
 * UPSERT semantics — the field_assistant_feedback table has UNIQUE
 * (message_id), so re-rating just overwrites the previous value
 * instead of stacking. Lets the UI toggle thumbs without orphan rows.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const MAX_REASON_LEN = 1000

let _supabaseClient: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env not configured')
  _supabaseClient = createClient(url, key)
  return _supabaseClient
}

interface FeedbackBody {
  message_id?: unknown
  rating?: unknown
  reason?: unknown
}

async function handler(req: import('http').IncomingMessage & {
  body?: FeedbackBody | string
  headers: Record<string, string | string[] | undefined>
}, res: import('http').ServerResponse & {
  status: (n: number) => typeof res
  json: (body: unknown) => void
}) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  // Body parsing — Vercel auto-parses JSON, but tests inject a
  // string. Tolerate both.
  let body: FeedbackBody
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body) as FeedbackBody }
    catch { res.status(400).json({ error: 'bad_input' }); return }
  } else {
    body = (req.body || {}) as FeedbackBody
  }

  const messageId = typeof body.message_id === 'string' ? body.message_id : ''
  const rating = body.rating === 'up' || body.rating === 'down' ? body.rating : null
  if (!messageId || !rating) {
    res.status(400).json({ error: 'bad_input' })
    return
  }
  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim().slice(0, MAX_REASON_LEN)
    : null

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )
  if (authErr || !user) {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  // Defense-in-depth: verify the message belongs to the caller AND
  // capture its conversation_id (the feedback row mirrors it so a
  // per-conversation aggregation query doesn't need a join). RLS
  // would catch a foreign-message attempt too; explicit is better.
  const { data: msg, error: msgErr } = await supabase
    .from('field_assistant_messages')
    .select('id, conversation_id, user_id, role')
    .eq('id', messageId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (msgErr) {
    console.error('[fa-feedback] message lookup failed:', msgErr.message)
    res.status(500).json({ error: 'query_failed' })
    return
  }
  if (!msg) {
    res.status(404).json({ error: 'message_not_found' })
    return
  }
  if ((msg as { role: string }).role !== 'assistant') {
    // Feedback is only meaningful on assistant turns. Reject
    // attempts to rate a user message.
    res.status(400).json({ error: 'not_an_assistant_message' })
    return
  }

  const { error: upErr } = await supabase
    .from('field_assistant_feedback')
    .upsert(
      {
        message_id: messageId,
        conversation_id: (msg as { conversation_id: string }).conversation_id,
        user_id: user.id,
        rating,
        reason,
      },
      { onConflict: 'message_id' },
    )
  if (upErr) {
    console.error('[fa-feedback] upsert failed:', upErr.message)
    res.status(500).json({ error: 'write_failed' })
    return
  }

  res.status(200).json({ ok: true })
}

export default handler

// Test injection points — same convention as api/field-assistant-history.ts.
export const __test = {
  MAX_REASON_LEN,
  setSupabase(client: SupabaseClient | null) { _supabaseClient = client },
  reset() { _supabaseClient = null },
}
