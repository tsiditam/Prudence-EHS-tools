/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Client helper: build the renderer model from assessment data and download
 * the fixed IAQ report PDF from /api/report-pdf. The model (and thus the
 * report's words/numbers) is assembled client-side; the server only lays it
 * out with the shared pdfkit renderer, so the on-screen data and the PDF are
 * guaranteed consistent and the design matches the sample exactly.
 */

import { assembleRenderModel } from '../report/reportModel'
import { supabase } from './supabaseClient'

export async function downloadReportPdf(reportData, opts = {}) {
  const model = assembleRenderModel(reportData, opts)
  // The render endpoint now requires a valid Supabase session (it used to
  // accept any request). Attach the bearer token.
  let token = null
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession()
      token = data && data.session && data.session.access_token
    } catch { /* no session — the request will 401 and surface below */ }
  }
  const res = await fetch('/api/report-pdf', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ model }),
  })
  if (!res.ok) {
    let msg = res.status === 401 ? 'Please sign in again to generate the report.' : `Report generation failed (${res.status})`
    try {
      const j = await res.json()
      if (j.error === 'banned_language') msg = `Report blocked: unsupported language detected${j.hits && j.hits[0] ? ` ("${j.hits[0].term}")` : ''}. Edit the narrative and retry.`
      else if (j.message) msg = j.message
    } catch { /* non-JSON error body */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = String(reportData?.building?.fn || 'Assessment').replace(/[^\w-]+/g, '-').slice(0, 60)
  a.download = `AtmosFlow-Report-${safe}.pdf`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return model
}
