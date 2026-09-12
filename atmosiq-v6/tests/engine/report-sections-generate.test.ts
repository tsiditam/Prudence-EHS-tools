// @vitest-environment jsdom
/**
 * generateReportSections (src/engines/reportSections.js) — the client call
 * that turns a real assessment into an evidence package, posts it to
 * /api/report-sections, and hands the audited result to
 * buildAiSectionsRecord. Mirrors the fetch-mocking pattern
 * tests/engine/narrative-assessor-notes.test.ts already uses for
 * generateNarrative.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateReportSections } from '../../src/engines/reportSections.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

function assessmentData() {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, assessmentDate: '2026-06-10' }))
  const causalChains = buildCausalChains(ZONES, BLDG, zoneScores)
  return {
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains,
    recs: { imm: [{ text: 'Verify supply airflow to the flagged zone.', scope: 'zone', zoneName: 'Zone 1', controlTier: 'engineering_control' }], eng: [], adm: [], mon: [] },
    id: 'AIQ-DEMO', ts: '2026-06-10',
  }
}

let sent: any = null
let response: any = null

beforeEach(() => {
  sent = null
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
    sent = JSON.parse(init.body)
    return { ok: true, json: async () => response }
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('generateReportSections — the request', () => {
  it('sends a wire-budgeted evidence package, never the raw model', async () => {
    response = { sections: {}, language_review: {}, model: 'claude-test' }
    await generateReportSections(assessmentData())
    expect(sent.payload.evidence).toBeTruthy()
    expect(sent.payload.evidence.criteria).toBeTruthy()
    expect(sent.payload.evidence.sections.writable).toContain('executive_summary')
    // The audit-only index and the layering diagnostic never leave the client.
    expect(sent.payload.evidence.immutable_values).toBeUndefined()
    expect(sent.payload.evidence.findings.every((f: any) => !('unjoined' in f))).toBe(true)
  })
})

describe('generateReportSections — the response', () => {
  it('returns a usable aiSections record for a fully clean response', async () => {
    response = {
      model: 'claude-test',
      language_review: { executive_summary: 'passed', discussion: 'passed' },
      sections: {
        executive_summary: 'Carbon dioxide was elevated at this site relative to the outdoor reference.\n\nThe source was not identified during the assessment.',
        discussion: 'Carbon dioxide is an indicator of outdoor-air delivery. No ventilation rate was measured directly.',
      },
    }
    const rec = await generateReportSections(assessmentData())
    expect(rec).toBeTruthy()
    expect(rec.model).toBe('claude-test')
    expect(rec.locked).toBe(false)
    expect(rec.sections.executive_summary).toContain('Carbon dioxide was elevated')
    expect(rec.sections.discussion).toContain('outdoor-air delivery')
    expect(rec.auditSummary.executive_summary.supported).toBe(true)
  })

  it('drops a section the server-side banned-language gate flagged, before it ever reaches the evidence audit', async () => {
    response = {
      model: 'claude-test',
      language_review: { executive_summary: 'failed', discussion: 'passed' },
      banned_language: { executive_summary: [{ term: 'caused by' }] },
      sections: {
        executive_summary: 'The elevated readings are caused by the adjacent renovation work.',
        discussion: 'Carbon dioxide is an indicator of outdoor-air delivery. No ventilation rate was measured directly.',
      },
    }
    const rec = await generateReportSections(assessmentData())
    expect(rec).toBeTruthy()
    expect('executive_summary' in rec.sections).toBe(false)
    expect(rec.sections.discussion).toBeTruthy()
  })

  it('drops only the flagged parameter_background entries, keyed independently', async () => {
    response = {
      model: 'claude-test',
      language_review: { 'parameter_background.co2': 'failed', 'parameter_background.thermal': 'passed' },
      sections: {
        parameter_background: {
          co2: 'This is toxic and unsafe for occupants.',
          thermal: 'Temperature did not identify a notable condition during the assessment. Relative humidity measured above the moisture-control range in both zones.',
        },
      },
    }
    const rec = await generateReportSections(assessmentData())
    expect(rec.sections.parameter_background.co2).toBeUndefined()
    expect(rec.sections.parameter_background.thermal).toBeTruthy()
  })

  it('returns null on a 429 and on any network failure, never throwing', async () => {
    response = { error: 'rate_limit_exceeded', scope: 'per_minute', retry_after_seconds: 30 }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => response })))
    expect(await generateReportSections(assessmentData())).toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await generateReportSections(assessmentData())).toBeNull()
  })

  it('returns null rather than throwing when no section came back at all', async () => {
    response = { sections: {}, language_review: {}, model: 'claude-test' }
    const rec = await generateReportSections(assessmentData())
    // buildAiSectionsRecord still runs — an empty `sections` object is a
    // legitimate (if unhelpful) record, not a failure.
    expect(rec).toBeTruthy()
    expect(Object.keys(rec.sections)).toEqual([])
  })
})
