/**
 * Vercel Serverless Function — /api/report-templates
 *
 * CRUD for user-uploaded DOCX report templates. Backs the Report
 * Templates panel in Settings AND the lookup the Jasper
 * `generate_report` tool uses to find a template by name.
 *
 * Three actions on one handler (matches the convention from
 * api/field-assistant-history.ts):
 *
 *   POST { action: 'upload', name, base64 }
 *     Validates MIME / size, runs token discovery via
 *     discoverTokens(), uploads to the `report-templates` Storage
 *     bucket at `{user_id}/{template_id}.docx`, inserts a catalog
 *     row.
 *     → 200 { id, name, tokens_found, tokens_unknown }
 *
 *   POST { action: 'list' }
 *     → 200 { templates: [{ id, name, tokens_found, tokens_unknown,
 *               size_bytes, created_at }] }
 *
 *   POST { action: 'delete', id }
 *     Removes the Storage object AND the catalog row.
 *     → 200 { ok: true }
 *
 * Auth: same Bearer-token pattern as /api/field-assistant — caller
 * forwards the Supabase access token; we validate via auth.getUser;
 * RLS on report_templates + storage.objects enforces ownership as
 * a second layer of defense.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// NOTE: ../lib/report-templates/render pulls in docxtemplater + pizzip at
// module load. Only the `upload` action needs token discovery, so it is
// imported lazily inside handleUpload (see below) — `list` and `delete`
// must not drag those heavy deps into their cold start. This mirrors the
// CLAUDE.md "Jasper hot path stays lean" rule (pitfall #5): keeping the
// DOCX bundle off the light paths avoids cold-start 500s on Vercel.

const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_NAME_LEN = 120
const BUCKET = 'report-templates'

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
  name?: unknown
  base64?: unknown
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

async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({ error: 'Not authenticated' })
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
  if (!['upload', 'list', 'delete'].includes(action)) {
    res.status(400).json({ error: 'bad_action' })
    return
  }

  // Everything past this point can throw at runtime (Supabase init on a
  // missing env var, an unexpected client error). Without this guard those
  // throws surface as a bare Vercel 500 with no JSON body — which is what
  // the Settings panel reported as "Failed to load templates (500)". Catch
  // them and return a JSON error with a stable diagnostic `code` so the
  // failing stage is identifiable from the response alone.
  try {
    const supabase = getSupabase()
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authErr || !user) {
      res.status(401).json({ error: 'invalid_token' })
      return
    }

    if (action === 'upload') { await handleUpload(supabase, user.id, body, res); return }
    if (action === 'list')   { await handleList(supabase, user.id, res); return }
    if (action === 'delete') { await handleDelete(supabase, user.id, body, res); return }
  } catch (err) {
    console.error('[report-templates] unhandled error:', (err as Error)?.message)
    if (!res.headersSent) {
      res.status(500).json({ error: 'server_error', code: 'rt_init' })
    }
  }
}

async function handleUpload(
  supabase: SupabaseClient,
  userId: string,
  body: ActionBody,
  res: Res,
) {
  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  const base64 = typeof body.base64 === 'string' ? body.base64 : ''
  if (!rawName) { res.status(400).json({ error: 'name_required' }); return }
  if (!base64) { res.status(400).json({ error: 'base64_required' }); return }
  const name = rawName.slice(0, MAX_NAME_LEN)

  // base64 payload — tolerate a data: URL prefix if the client sent one.
  const stripped = base64.replace(/^data:[^;]+;base64,/, '')
  let buffer: Buffer
  try {
    buffer = Buffer.from(stripped, 'base64')
  } catch {
    res.status(400).json({ error: 'bad_base64' }); return
  }
  if (buffer.length === 0) {
    res.status(400).json({ error: 'empty_file' }); return
  }
  if (buffer.length > MAX_TEMPLATE_BYTES) {
    res.status(400).json({
      error: 'file_too_large',
      max_bytes: MAX_TEMPLATE_BYTES,
    })
    return
  }

  // Discover tokens (also serves as a "is this actually a .docx?" check).
  // Lazy import: docxtemplater + pizzip only load on the upload path, never
  // for list/delete (see the import note at the top of this file).
  const { discoverTokens, TemplateRenderError } = await import('../lib/report-templates/render')
  let tokens: { found: string[]; unknown: string[] }
  try {
    tokens = discoverTokens(buffer)
  } catch (err) {
    if (err instanceof TemplateRenderError) {
      res.status(400).json({ error: err.code, message: err.message, detail: err.detail })
      return
    }
    res.status(400).json({ error: 'parse_failed' }); return
  }

  // Insert the catalog row first to get the id (storage path uses it).
  // RLS still enforces user_id = auth.uid() via the service-role
  // bypass we explicitly set here.
  const { data: row, error: insErr } = await supabase
    .from('report_templates')
    .insert({
      user_id: userId,
      name,
      storage_path: 'pending', // patched below once we know the id
      tokens_found: tokens.found,
      tokens_missing: tokens.unknown,
      size_bytes: buffer.length,
    })
    .select('id')
    .single()
  if (insErr || !row) {
    console.error('[report-templates] insert failed:', insErr?.message)
    res.status(500).json({ error: 'write_failed' }); return
  }

  const id = (row as { id: string }).id
  const storagePath = `${userId}/${id}.docx`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    })
  if (upErr) {
    console.error('[report-templates] storage upload failed:', upErr.message)
    // Roll back the catalog row so we don't leak an orphan.
    await supabase.from('report_templates').delete().eq('id', id)
    res.status(500).json({ error: 'storage_upload_failed' }); return
  }

  const { error: pathErr } = await supabase
    .from('report_templates')
    .update({ storage_path: storagePath })
    .eq('id', id)
  if (pathErr) {
    console.error('[report-templates] path update failed:', pathErr.message)
    // Best-effort cleanup.
    await supabase.storage.from(BUCKET).remove([storagePath])
    await supabase.from('report_templates').delete().eq('id', id)
    res.status(500).json({ error: 'write_failed' }); return
  }

  res.status(200).json({
    id,
    name,
    tokens_found: tokens.found,
    tokens_unknown: tokens.unknown,
    size_bytes: buffer.length,
  })
}

async function handleList(supabase: SupabaseClient, userId: string, res: Res) {
  const { data, error } = await supabase
    .from('report_templates')
    .select('id, name, tokens_found, tokens_missing, size_bytes, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[report-templates] list failed:', error.message)
    res.status(500).json({ error: 'query_failed' }); return
  }
  res.status(200).json({ templates: data || [] })
}

async function handleDelete(
  supabase: SupabaseClient,
  userId: string,
  body: ActionBody,
  res: Res,
) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) { res.status(400).json({ error: 'id_required' }); return }

  const { data: row, error: lookupErr } = await supabase
    .from('report_templates')
    .select('id, user_id, storage_path')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (lookupErr) {
    console.error('[report-templates] lookup failed:', lookupErr.message)
    res.status(500).json({ error: 'query_failed' }); return
  }
  if (!row) {
    res.status(404).json({ error: 'not_found' }); return
  }

  const storagePath = (row as { storage_path: string }).storage_path
  // Order: storage first, then catalog. If storage delete fails the
  // catalog row still points at a (possibly-stale) path, but the user
  // can re-issue the delete; that's preferable to having an orphan
  // file with no row to find it from.
  const { error: stErr } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (stErr) {
    console.error('[report-templates] storage delete failed:', stErr.message)
    // Don't abort — the catalog row delete still proceeds so the user
    // isn't stuck with an undeletable row when Storage is flaky.
  }

  const { error: delErr } = await supabase
    .from('report_templates')
    .delete()
    .eq('id', id)
  if (delErr) {
    console.error('[report-templates] catalog delete failed:', delErr.message)
    res.status(500).json({ error: 'delete_failed' }); return
  }

  res.status(200).json({ ok: true })
}

export default handler

// Test injection points — same convention as field-assistant-feedback.
export const __test = {
  MAX_TEMPLATE_BYTES,
  MAX_NAME_LEN,
  BUCKET,
  setSupabase(client: SupabaseClient | null) { _supabaseClient = client },
  reset() { _supabaseClient = null },
}
