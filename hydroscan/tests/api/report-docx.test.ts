// @vitest-environment node
/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Phase 4 — DOCX report tests. Verifies the report model assembles the right
 * data (manifest-gated bibliography, screening notice, draft watermark) and
 * that the document packs to a valid .docx (zip) buffer without throwing.
 */

import { describe, it, expect } from 'vitest'
import { evaluateResults, buildWaterCausalChains, generateSamplingPlan, generateRecommendations } from '../../src/engine'
import { buildReportModel } from '../../src/report/report-model'
import { getReportDocxBuffer } from '../../src/report/DocxReport'

function sampleAssessment() {
  const labResults = [
    { id: 'pb', value: 22 },
    { id: 'ph', value: 6.2 },
    { id: 'no3', value: 12 },
  ]
  const evaluation = evaluateResults(labResults)
  const fd = { src_type: 'Private well — drilled', b_pipe_mat: 'Lead', b_children: 'Yes' }
  const chains = buildWaterCausalChains(fd, evaluation.findings)
  const samplingPlan = generateSamplingPlan(fd)
  const recs = generateRecommendations(evaluation.tier, evaluation.findings, chains, fd)
  return {
    assessor: { a_name: 'T. Tamakloe, CSP', a_certs: ['CSP'] },
    source: { src_type: 'Private well — drilled', dqo_purpose: 'Litigation support' },
    building: { b_pipe_mat: 'Lead', b_children: 'Yes' },
    labResults,
    evaluation,
    chains,
    samplingPlan,
    recs,
    selState: 'NJ',
    stateExceed: [],
  }
}

describe('report model', () => {
  it('assembles screening notice, draft watermark, and a manifest-gated bibliography', () => {
    const m = buildReportModel(sampleAssessment())
    expect(m.watermark.enabled).toBe(true)
    expect(m.watermark.text).toMatch(/DRAFT/)
    expect(m.screeningNotice).toMatch(/screening-level/i)
    expect(m.meta.reportId).toMatch(/^PSEC-H2O-\d{4}-\d{2}-\d{3}$/)
    // Lead + nitrate cite EPA Action Level + EPA MCL -> lcrr + sdwa sources.
    const ids = m.bibliography.map((s) => s.id)
    expect(ids).toContain('sdwa')
    expect(ids).toContain('lcrr')
    expect(ids).not.toContain('ashrae188')
  })

  it('reflects the engine compliance tier and counts', () => {
    const m = buildReportModel(sampleAssessment())
    expect(m.compliance.tier).toBe('immediate') // nitrate acute MCL + lead AL
    expect(m.compliance.counts.parameters).toBeGreaterThan(0)
  })
})

describe('docx packing', () => {
  it('packs to a valid .docx (zip) buffer', async () => {
    const buf = await getReportDocxBuffer(buildReportModel(sampleAssessment()))
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(2000)
    // .docx is a zip — magic bytes "PK".
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
  }, 20_000)

  it('does not throw on an empty (field-only) assessment', async () => {
    const m = buildReportModel({ assessor: { a_name: 'X' }, source: { src_type: 'Spring' }, evaluation: { findings: [], tier: 'compliant' } })
    const buf = await getReportDocxBuffer(m)
    expect(buf.length).toBeGreaterThan(2000)
  }, 20_000)
})
