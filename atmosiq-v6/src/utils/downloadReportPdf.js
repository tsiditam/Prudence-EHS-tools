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

export async function downloadReportPdf(reportData, opts = {}) {
  const model = assembleRenderModel(reportData, opts)
  const res = await fetch('/api/report-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
  })
  if (!res.ok) {
    let msg = `Report generation failed (${res.status})`
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
