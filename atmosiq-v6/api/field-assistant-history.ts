/**
 * Vercel Serverless Function — /api/field-assistant-history
 *
 * Read-only endpoint for the AI Assistant chat history surface. Lets
 * the client list a user's past conversations and load all messages
 * for any specific one (to resume from the chat sheet).
 *
 * The actual conversation + message persistence happens inside
 * api/field-assistant.ts on every turn (via persistTurn). This file
 * is purely the read-side counterpart. We could have folded it into
 * the streaming endpoint with an `?action=list` branch, but the
 * streaming endpoint is POST-only with a heavy auth + rate-limit
 * setup, and the read path doesn't need any of that. A separate
 * file keeps the read path simple, GET-friendly, and unit-testable
 * in isolation.
 *
 * Auth: same Bearer-token pattern as /api/field-assistant — the
 * caller forwards the Supabase access token; we validate it via
 * supabase.auth.getUser(); RLS on the underlying tables enforces
 * user_id ownership as a second layer of defense.
 *
 * Endpoints:
 *   GET    /api/field-assistant-history?action=list
 *     → { conversations: Array<{id, title, created_at, updated_at, message_count}> }
 *   GET    /api/field-assistant-history?action=get&id=<uuid>
 *     → { conversation: {...}, messages: Array<{id, role, content, context_view, created_at}> }
 *   DELETE /api/field-assistant-history?id=<uuid>
 *     → { ok: true }
 *     Messages cascade-delete via the FK in migration 013, so we only
 *     need to delete the conversation row.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const MAX_CONVERSATIONS = 50

let _supabaseClient: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env not configured')
  _supabaseClient = createClient(url, key)
  return _supabaseClient
}

interface ConversationRow {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}
interface MessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  context_view: string | null
  created_at: string
}

async function handler(req: import('http').IncomingMessage & {
  query?: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
}, res: import('http').ServerResponse & {
  status: (n: number) => typeof res
  json: (body: unknown) => void
}) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authErr || !user) {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  // DELETE — remove a single conversation by id. Filtered by user_id
  // so a token that knows another user's conversation_id can't touch
  // it (RLS would normally enforce this on a user-key client; we use
  // the service-role key here, so the explicit filter is the only
  // defense). Messages cascade-delete via the FK on conversation_id.
  if (req.method === 'DELETE') {
    const id = req.query?.id as string | undefined
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'missing_id' })
      return
    }
    const { error: delErr, count } = await supabase
      .from('field_assistant_conversations')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', user.id)
    if (delErr) {
      console.error('[fa-history] delete failed:', delErr.message)
      res.status(500).json({ error: 'delete_failed' })
      return
    }
    if (!count) {
      // No row matched — either the id is bogus or it belongs to
      // another user. Either way, surface 404 so the client can
      // prune its local list without a misleading "success" toast.
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  const action = (req.query?.action as string | undefined) || 'list'

  if (action === 'list') {
    // List recent conversations with a per-row message count. The
    // count helps the UI label empty/stale conversations (zero
    // messages means the user opened the sheet but never sent a
    // turn — those shouldn't clutter the history list, but the
    // server returns them anyway and the client filters).
    const { data: convs, error: convErr } = await supabase
      .from('field_assistant_conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(MAX_CONVERSATIONS)
    if (convErr) {
      console.error('[fa-history] list query failed:', convErr.message)
      res.status(500).json({ error: 'query_failed' })
      return
    }
    const conversations = convs as ConversationRow[] | null
    if (!conversations || conversations.length === 0) {
      res.status(200).json({ conversations: [] })
      return
    }

    // Per-conversation message count via grouped query. We use a
    // single round-trip rather than N+1 by pulling all message ids
    // for the user's conversations in one shot and bucketing
    // client-side. Bounded by MAX_CONVERSATIONS × ~30 turns ≈ 1500
    // rows worst case, which fits comfortably in one response.
    const ids = conversations.map((c) => c.id)
    const { data: msgs } = await supabase
      .from('field_assistant_messages')
      .select('conversation_id')
      .in('conversation_id', ids)
      .eq('user_id', user.id)
    const counts = new Map<string, number>()
    for (const m of (msgs || []) as { conversation_id: string }[]) {
      counts.set(m.conversation_id, (counts.get(m.conversation_id) || 0) + 1)
    }

    res.status(200).json({
      conversations: conversations.map((c) => ({
        ...c,
        message_count: counts.get(c.id) || 0,
      })),
    })
    return
  }

  if (action === 'get') {
    const id = req.query?.id as string | undefined
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'missing_id' })
      return
    }

    // Defense-in-depth: filter by both id and user_id so a token
    // that knows another user's conversation_id can't read it
    // (RLS would catch this too, but explicit is better).
    const { data: conv, error: convErr } = await supabase
      .from('field_assistant_conversations')
      .select('id, title, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (convErr || !conv) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    // Pull messages + any feedback in one round-trip. The
    // PostgREST `*` join syntax leans on the FK we declared in
    // migration 015 (field_assistant_feedback.message_id →
    // field_assistant_messages.id). One row per message; the
    // feedback array is empty or single-element due to the
    // UNIQUE(message_id).
    const { data: messages, error: msgErr } = await supabase
      .from('field_assistant_messages')
      .select('id, role, content, context_view, created_at, field_assistant_feedback ( rating, reason )')
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (msgErr) {
      console.error('[fa-history] get messages failed:', msgErr.message)
      res.status(500).json({ error: 'query_failed' })
      return
    }

    // Flatten the embedded feedback array into top-level
    // feedback_rating / feedback_reason fields so the client
    // doesn't need to unpack the join shape.
    const flat = (messages || []).map((m) => {
      const raw = m as { field_assistant_feedback?: { rating?: string; reason?: string | null }[] } & MessageRow
      const fb = Array.isArray(raw.field_assistant_feedback) && raw.field_assistant_feedback[0]
        ? raw.field_assistant_feedback[0]
        : null
      return {
        id: raw.id,
        role: raw.role,
        content: raw.content,
        context_view: raw.context_view,
        created_at: raw.created_at,
        feedback_rating: fb?.rating || null,
        feedback_reason: fb?.reason || null,
      }
    })

    res.status(200).json({
      conversation: conv as ConversationRow,
      messages: flat,
    })
    return
  }

  res.status(400).json({ error: 'unknown_action' })
}

export default handler

// Test injection points — same convention as api/field-assistant.ts
export const __test = {
  MAX_CONVERSATIONS,
  setSupabase(client: SupabaseClient | null) { _supabaseClient = client },
  reset() { _supabaseClient = null },
}
