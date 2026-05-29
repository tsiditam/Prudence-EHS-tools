/**
 * Vercel Serverless Function — /api/sites
 *
 * CRUD for the user's site library (migration 017). Three actions on
 * one handler — matches the convention from
 * api/field-assistant-history.ts and api/report-templates.ts.
 *
 *   POST { action: 'list' }
 *     → 200 { sites: Site[] } sorted by created_at desc.
 *
 *   POST { action: 'save', site: SiteInput }
 *     Upsert. If `site.id` is provided, updates that row (RLS guards
 *     ownership). Otherwise inserts a new row. The server recomputes
 *     `next_due_at` from `last_finalized_at + reassessment_interval_months`
 *     so the SPA never has to do date arithmetic.
 *     → 200 { site: Site }
 *
 *   POST { action: 'delete', id }
 *     Hard delete (RLS guards ownership). To pause reminders without
 *     losing the row, use save with `disabled: true` instead.
 *     → 200 { ok: true }
 *
 * Auth: same Bearer-token pattern as /api/report-templates — caller
 * forwards the Supabase access token; we validate via auth.getUser;
 * RLS on public.sites enforces user_id ownership as a second layer.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Site, SiteInput } from '../lib/sites/types'

const MAX_NAME_LEN = 200
const MAX_ADDRESS_LEN = 500
const MAX_NOTES_LEN = 2000
const MIN_INTERVAL_MONTHS = 1
const MAX_INTERVAL_MONTHS = 60

let _supabaseClient: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env not configured')
  _supabaseClient = createClient(url, key)
  return _supabaseClient
}

interface ActionBody {
  action?: unknown
  site?: unknown
  id?: unknown
}

type Res = import('http').ServerResponse & {
  status: (n: number) => Res
  json: (body: unknown) => void
}

type Req = import('http').IncomingMessage & {
  body?: ActionBody | string
  headers: Record<string, string | string[] | undefined>
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  const n = Math.round(v)
  if (n < min) return min
  if (n > max) return max
  return n
}

function clampStr(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.slice(0, maxLen)
}

/**
 * Compute next_due_at from a last-finalized timestamp + interval.
 * Returns null when there's no last_finalized_at (no assessment has
 * referenced this site yet). Pure function for testability.
 */
export function computeNextDueAt(
  lastFinalizedAt: string | null,
  intervalMonths: number,
): string | null {
  if (!lastFinalizedAt) return null
  const last = new Date(lastFinalizedAt)
  if (isNaN(last.getTime())) return null
  // Add months. setMonth handles month-end edge cases natively
  // (Jan 31 + 1 month → Mar 3 / Feb 28 depending on year).
  const due = new Date(last.getTime())
  due.setMonth(due.getMonth() + intervalMonths)
  return due.toISOString()
}

async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({ error: 'not_authenticated' })
    return
  }

  let body: ActionBody
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body) as ActionBody }
    catch { res.status(400).json({ error: 'bad_input' }); return }
  } else {
    body = (req.body || {}) as ActionBody
  }

  const action = typeof body.action === 'string' ? body.action : ''
  if (!['list', 'save', 'delete'].includes(action)) {
    res.status(400).json({ error: 'bad_action' })
    return
  }

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )
  if (authErr || !user) {
    res.status(401).json({ error: 'invalid_token' })
    return
  }

  if (action === 'list')   return handleList(supabase, user.id, res)
  if (action === 'save')   return handleSave(supabase, user.id, body, res)
  if (action === 'delete') return handleDelete(supabase, user.id, body, res)
}

async function handleList(
  supabase: SupabaseClient,
  userId: string,
  res: Res,
) {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    res.status(500).json({ error: 'query_failed', message: error.message })
    return
  }
  res.status(200).json({ sites: (data || []) as Site[] })
}

async function handleSave(
  supabase: SupabaseClient,
  userId: string,
  body: ActionBody,
  res: Res,
) {
  const input = (body.site && typeof body.site === 'object' && !Array.isArray(body.site))
    ? body.site as Partial<SiteInput> & { last_finalized_at?: unknown }
    : null
  if (!input) {
    res.status(400).json({ error: 'site_required' })
    return
  }
  const name = clampStr(input.name, MAX_NAME_LEN)
  if (!name) {
    res.status(400).json({ error: 'name_required' })
    return
  }

  const intervalMonths = clampInt(
    input.reassessment_interval_months, 12, MIN_INTERVAL_MONTHS, MAX_INTERVAL_MONTHS,
  )

  // The SPA may pass last_finalized_at when saving from the finalize
  // hook (so the row is created already pinned to the just-completed
  // assessment). Accept it but never trust the SPA to compute
  // next_due_at — server recomputes from interval.
  const lastFinalizedAt = (input as { last_finalized_at?: unknown }).last_finalized_at
  const lastFinalizedStr = (typeof lastFinalizedAt === 'string') ? lastFinalizedAt : null

  const row: Record<string, unknown> = {
    user_id: userId,
    name,
    address: clampStr(input.address, MAX_ADDRESS_LEN),
    building_type: clampStr(input.building_type, MAX_NAME_LEN),
    notes: clampStr(input.notes, MAX_NOTES_LEN),
    reassessment_interval_months: intervalMonths,
    disabled_at: input.disabled === true ? new Date().toISOString() : null,
  }

  if (lastFinalizedStr) {
    row.last_finalized_at = lastFinalizedStr
    row.next_due_at = computeNextDueAt(lastFinalizedStr, intervalMonths)
  }

  // Upsert by id when provided; insert otherwise. RLS guards
  // ownership on update — a foreign-id update simply finds no rows
  // and the response carries no data.
  let saved: Site | null = null
  const inputId = typeof input.id === 'string' ? input.id : null
  if (inputId) {
    const { data, error } = await supabase
      .from('sites')
      .update(row)
      .eq('id', inputId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle()
    if (error) {
      res.status(500).json({ error: 'update_failed', message: error.message })
      return
    }
    if (!data) {
      res.status(404).json({ error: 'site_not_found' })
      return
    }
    saved = data as Site
  } else {
    const { data, error } = await supabase
      .from('sites')
      .insert(row)
      .select('*')
      .single()
    if (error) {
      res.status(500).json({ error: 'insert_failed', message: error.message })
      return
    }
    saved = data as Site
  }

  res.status(200).json({ site: saved })
}

async function handleDelete(
  supabase: SupabaseClient,
  userId: string,
  body: ActionBody,
  res: Res,
) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) {
    res.status(400).json({ error: 'id_required' })
    return
  }
  const { error } = await supabase
    .from('sites')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) {
    res.status(500).json({ error: 'delete_failed', message: error.message })
    return
  }
  res.status(200).json({ ok: true })
}

export default handler

// Test injection points — same convention as
// api/field-assistant-feedback.ts.
export const __test = {
  MAX_NAME_LEN,
  MAX_INTERVAL_MONTHS,
  computeNextDueAt,
  setSupabase(client: SupabaseClient | null) { _supabaseClient = client },
  reset() { _supabaseClient = null },
}
