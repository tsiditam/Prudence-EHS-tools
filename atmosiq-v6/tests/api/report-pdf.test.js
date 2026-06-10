// @vitest-environment node
/**
 * api/report-pdf.js — the PDF render endpoint. Verifies model validation, the
 * banned-language guard (no compliance/causation claim can reach a PDF), and
 * a successful render returning application/pdf bytes.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const handler = require('../../api/report-pdf.js')

function mockRes() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    end(b) { this.body = b },
  }
}
const run = async (req) => { const res = mockRes(); await handler(req, res); return res }

const goodModel = {
  meta: { coverRows: [['Facility', 'X']], firm: 'PSEC', reportId: 'AIQ-OK01' },
  execSummary: 'Conditions are consistent with acceptable ventilation during the assessment window.',
  recommendations: { immediate: ['Verify supply airflow.'], shortTerm: [], mediumTerm: [] },
}

describe('POST /api/report-pdf', () => {
  it('rejects non-POST', async () => {
    const res = await run({ method: 'GET' })
    expect(res.statusCode).toBe(405)
  })

  it('400 when no model', async () => {
    const res = await run({ method: 'POST', body: {} })
    expect(res.statusCode).toBe(400)
  })

  it('renders application/pdf for a clean model', async () => {
    const res = await run({ method: 'POST', body: { model: goodModel } })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(Buffer.isBuffer(res.body)).toBe(true)
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-')
  })

  it('422-blocks a model containing banned compliance/causation language', async () => {
    const bad = { ...goodModel, execSummary: 'The elevated CO2 was caused by the HVAC system and the building is noncompliant with OSHA.' }
    const res = await run({ method: 'POST', body: { model: bad } })
    expect(res.statusCode).toBe(422)
    const j = JSON.parse(res.body)
    expect(j.error).toBe('banned_language')
    expect(j.hits.length).toBeGreaterThan(0)
  })
})
