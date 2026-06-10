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
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return null
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null }
}

function json(res, code, obj) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(obj))
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  try {
    const body = await readBody(req)
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
    json(res, 500, { error: 'render_failed', message: String((e && e.message) || e) })
  }
}

module.exports.__test = { collectProse }
