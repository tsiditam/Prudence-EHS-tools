/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * POST /api/report-pdf — renders the fixed IAQ report.
 *
 * Body: { model } — the renderer model produced client-side by
 * assembleRenderModel (src/report/reportModel.js). The model is the single
 * source of truth; this endpoint only lays it out (pdfkit, pure Node — no
 * headless browser, Vercel-serverless-friendly).
 *
 * Screening-only guard: before rendering, every model prose field is scanned
 * for banned compliance/medical/causation language with the SAME scanner the
 * AI narrative path uses (api/_banned-language.js). Banned hits → 422, so an
 * unsupported claim can never reach a PDF.
 *
 * Returns application/pdf bytes.
 */

const { renderReportPdf } = require('../lib/report/render-pdf.js')
const { scan } = require('./_banned-language.js')
const { createClient } = require('@supabase/supabase-js')
const { hasDeliverableEntitlement } = require('../lib/unlimited-usage.js')
const { withSentry } = require('./_with-sentry-cjs.js')

// Cap the raw request body (self-hosted Express path; Vercel already enforces
// its own ~4.5 MB limit). Report models can embed photos, so this is generous.
const MAX_BODY_BYTES = 8 * 1024 * 1024

// Auth client, lazily built and test-injectable. Verifies the caller's Supabase
// JWT — this endpoint previously accepted ANY request, letting an unauthenticated
// caller drive unmetered server-side rendering.
let _supabase = null
function getSupabase() {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _supabase = createClient(url, key)
  return _supabase
}

async function requireUser(req, res) {
  const raw = (req.headers && (req.headers.authorization || req.headers.Authorization)) || ''
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  if (!token) { json(res, 401, { error: 'unauthorized' }); return null }
  const supabase = getSupabase()
  if (!supabase) { json(res, 500, { error: 'server_not_configured' }); return null }
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data || !data.user) { json(res, 401, { error: 'unauthorized' }); return null }
    return data.user
  } catch {
    json(res, 401, { error: 'unauthorized' })
    return null
  }
}

// Flatten the AUTHORED narrative for the language scan.
//
// The gate governs the prose AtmosFlow writes (the narrative library and any
// future AI refinement) — that text must never overreach. It deliberately
// does NOT scan engine-authored content (finding strings from scoring.js,
// recommendations, causal chains, reported concerns): that is the sacred
// engine's authoritative screening output, already governed by the engine's
// own CIH validation, and a descriptive word like "violation" in an engine
// finding must not block the client's report. (No edit UI exists yet, so a
// hard block on engine text would dead-end the user.)
function collectProse(model) {
  const out = []
  const push = (v) => { if (typeof v === 'string' && v.trim()) out.push(v) }
  push(model.execSummary)
  push(model.overallStatement)
  ;(model.scope && model.scope.paras || []).forEach(push)
  push(model.scope && model.scope.text)
  push(model.methodology && model.methodology.referenceFramework)
  ;(model.methodology && model.methodology.bullets || []).forEach(push)
  push(model.results && model.results.intro)
  push(model.results && model.results.perParamIntro)
  ;(model.results && model.results.parameters || []).forEach(p => (p.body || []).forEach(push))
  ;(model.limitations || []).forEach(push)
  push(model.review && model.review.statement)
  push(model.about && model.about.text)
  return out
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return null } }
  const chunks = []
  let total = 0
  for await (const c of req) {
    total += c.length
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error('payload_too_large'), { _tooLarge: true })
    chunks.push(c)
  }
  if (!chunks.length) return null
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null }
}

function json(res, code, obj) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(obj))
}

// Server-side credit gate (audit 2026-09 H3). Nothing on the server used
// to read credits_remaining — deduction was a separate client POST — so a
// client that omitted it got every PDF free. This GATES only; the debit
// stays where it is (/api/credits, consume_credits RPC). A missing profile
// row is treated as no entitlement; a lookup ERROR fails closed too.
async function requireEntitlement(user, res) {
  const supabase = getSupabase()
  if (!supabase) { json(res, 500, { error: 'server_not_configured' }); return false }
  let profile = null
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('plan, credits_remaining')
      .eq('id', user.id)
      .maybeSingle()
    if (error) {
      console.error('[report-pdf] entitlement lookup failed:', error.message)
      json(res, 500, { error: 'entitlement_lookup_failed' })
      return false
    }
    profile = data || null
  } catch (e) {
    console.error('[report-pdf] entitlement lookup threw:', e && e.message)
    json(res, 500, { error: 'entitlement_lookup_failed' })
    return false
  }
  if (!hasDeliverableEntitlement(profile, user.email)) {
    json(res, 402, { error: 'insufficient_credits' })
    return false
  }
  return true
}

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  const user = await requireUser(req, res)
  if (!user) return
  if (!(await requireEntitlement(user, res))) return
  let body
  try {
    body = await readBody(req)
  } catch (e) {
    if (e && e._tooLarge) return json(res, 413, { error: 'payload_too_large' })
    return json(res, 400, { error: 'bad_request' })
  }
  try {
    const model = body && body.model
    if (!model || typeof model !== 'object') return json(res, 400, { error: 'model_required' })

    const hits = []
    for (const text of collectProse(model)) { for (const h of (scan(text) || [])) hits.push(h) }
    if (hits.length) return json(res, 422, { error: 'banned_language', hits })

    const buffer = await renderReportPdf(model)
    const name = (model.meta && model.meta.reportId) || 'AtmosFlow-Report'
    res.statusCode = 200
    res.setHeader('content-type', 'application/pdf')
    res.setHeader('content-disposition', `attachment; filename="${String(name).replace(/[^\w.-]+/g, '-')}.pdf"`)
    res.setHeader('content-length', String(buffer.length))
    res.end(buffer)
  } catch (e) {
    console.error('[report-pdf] render failed:', e && (e.stack || e.message) ? e.stack || e.message : e)
    json(res, 500, { error: 'render_failed' })
  }
}

module.exports = withSentry(handler, { route: 'report-pdf' })
module.exports.__test = {
  collectProse,
  requireEntitlement,
  setSupabase(mock) { _supabase = mock },
  reset() { _supabase = null },
}
