/**
 * Vercel Serverless Function — /api/report-templates-render
 *
 * Renders a user-uploaded DOCX template against an assessment
 * context, returning the rendered .docx bytes inline. Invoked by the
 * Jasper `generate_report` tool dispatcher.
 *
 * Body:
 *   POST {
 *     template_id: string,
 *     assessment_context: object,
 *     file_name?: string,             // optional, defaults to "Report.docx"
 *     response_mode?: 'bytes'|'base64' // 'bytes' = stream the file,
 *                                      // 'base64' = JSON-wrap for the
 *                                      //  Jasper tool result (default
 *                                      //  for application/json clients)
 *   }
 *
 * The default response_mode is "bytes" when the caller advertises
 * Accept: application/octet-stream (browser download), and "base64"
 * otherwise so the Jasper tool dispatcher gets a JSON envelope it
 * can forward in the tool_result content block.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  renderTemplate,
  TemplateRenderError,
} from '../lib/report-templates/render'

const MAX_FILENAME_LEN = 200
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

interface RenderBody {
  template_id?: unknown
  assessment_context?: unknown
  file_name?: unknown
  response_mode?: unknown
}

type Res = import('http').ServerResponse & {
  status: (n: number) => Res
  json: (body: unknown) => void
  setHeader: (k: string, v: string) => void
  end: (body?: Buffer | string) => void
}

type Req = import('http').IncomingMessage & {
  body?: RenderBody | string
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

  let body: RenderBody
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body) as RenderBody }
    catch { res.status(400).json({ error: 'bad_input' }); return }
  } else {
    body = (req.body || {}) as RenderBody
  }

  const templateId = typeof body.template_id === 'string' ? body.template_id : ''
  const assessmentContext =
    body.assessment_context && typeof body.assessment_context === 'object'
      ? (body.assessment_context as Record<string, unknown>)
      : {}
  if (!templateId) {
    res.status(400).json({ error: 'template_id_required' }); return
  }

  // file_name sanitisation — strip path separators, trim to length,
  // append .docx if missing.
  let fileName =
    typeof body.file_name === 'string' && body.file_name.trim()
      ? body.file_name.trim()
      : 'Report.docx'
  fileName = fileName.replace(/[\\/]/g, '_').slice(0, MAX_FILENAME_LEN)
  if (!/\.docx$/i.test(fileName)) fileName = `${fileName}.docx`

  const responseMode =
    body.response_mode === 'bytes' || body.response_mode === 'base64'
      ? body.response_mode
      : null

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )
  if (authErr || !user) {
    res.status(401).json({ error: 'invalid_token' }); return
  }

  // Owner check via the catalog row — RLS would catch a cross-user
  // attempt too, but the explicit query gives us a clean 403/404
  // split for the chat client.
  const { data: row, error: lookupErr } = await supabase
    .from('report_templates')
    .select('id, user_id, name, storage_path')
    .eq('id', templateId)
    .maybeSingle()
  if (lookupErr) {
    console.error('[report-templates-render] lookup failed:', lookupErr.message)
    res.status(500).json({ error: 'query_failed' }); return
  }
  if (!row) {
    res.status(404).json({ error: 'not_found' }); return
  }
  if ((row as { user_id: string }).user_id !== user.id) {
    res.status(403).json({ error: 'forbidden' }); return
  }

  const storagePath = (row as { storage_path: string }).storage_path
  const { data: dl, error: dlErr } = await supabase.storage.from(BUCKET).download(storagePath)
  if (dlErr || !dl) {
    console.error('[report-templates-render] storage download failed:', dlErr?.message)
    res.status(500).json({ error: 'storage_download_failed' }); return
  }

  // Convert the Blob → Buffer (works in Node 18+ runtimes).
  const templateBuffer = Buffer.from(await dl.arrayBuffer())

  let result
  try {
    result = renderTemplate(templateBuffer, assessmentContext)
  } catch (err) {
    if (err instanceof TemplateRenderError) {
      res.status(422).json({
        error: err.code,
        message: err.message,
        detail: err.detail,
      })
      return
    }
    console.error('[report-templates-render] render failed:', err)
    res.status(500).json({ error: 'render_failed' }); return
  }

  // Default the response mode based on Accept header. octet-stream
  // means a browser is asking for a download; everything else gets
  // a JSON envelope.
  const accept =
    typeof req.headers.accept === 'string' ? req.headers.accept : ''
  const effectiveMode =
    responseMode || (accept.includes('application/octet-stream') ? 'bytes' : 'base64')

  if (effectiveMode === 'bytes') {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/"/g, '')}"`,
    )
    res.status(200)
    res.end(result.buffer)
    return
  }

  res.status(200).json({
    ok: true,
    file_name: fileName,
    base64: result.buffer.toString('base64'),
    tokens_filled: result.tokens_filled,
    tokens_empty: result.tokens_empty,
    tokens_unknown: result.tokens_unknown,
  })
}

export default handler

export const __test = {
  BUCKET,
  setSupabase(client: SupabaseClient | null) { _supabaseClient = client },
  reset() { _supabaseClient = null },
}
