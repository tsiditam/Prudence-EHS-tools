// @vitest-environment node
/**
 * assembleRenderModel + narrativeLibrary — the Report JSON → renderer-model
 * assembly. Verifies structure, mode chrome (Draft/Final/Sample), parameter
 * interpretation wiring, and that the deterministic prose carries no banned
 * language.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { assembleRenderModel } from '../../src/report/reportModel.js'
import * as NL from '../../src/report/narrativeLibrary.js'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
import { buildCausalChains } from '../../src/engines/causalChains.js'
import { DEMO_BUILDING, DEMO_ZONES, DEMO_PRESURVEY } from '../../src/constants/demoData.js'
const require = createRequire(import.meta.url)
const { scan } = require('../../api/_banned-language.js')

function demoData(extra) {
  const zoneScores = DEMO_ZONES.map(z => scoreZone(z, DEMO_BUILDING))
  const comp = compositeScore(zoneScores)
  const causalChains = buildCausalChains(DEMO_ZONES, DEMO_BUILDING, zoneScores)
  return {
    building: DEMO_BUILDING, presurvey: DEMO_PRESURVEY, zones: DEMO_ZONES, zoneScores, comp, causalChains,
    recs: { imm: ['Verify supply airflow to the flagged zone.'], eng: [], adm: [], mon: [] },
    profile: { name: 'John Smith', certs: ['CIH', 'CSP'], firm: 'PSEC' }, id: 'AIQ-DEMO', ts: '2026-06-10', ...extra,
  }
}

describe('assembleRenderModel', () => {
  it('produces the renderer model with the fixed sections', () => {
    const m = assembleRenderModel(demoData(), { mode: 'draft' })
    for (const k of ['meta', 'execSummary', 'findingsAtGlance', 'results', 'recommendations', 'qaQc', 'limitations', 'references', 'about']) {
      expect(m).toHaveProperty(k)
    }
    expect(m.results.parameters.length).toBeGreaterThan(0)
    expect(m.findingsAtGlance.length).toBeGreaterThan(0)
    expect(m.meta.coverRows.find(r => r[0] === 'Facility')[1]).toBe(DEMO_BUILDING.fn)
  })

  it('applies Draft chrome (watermark + IH-review review statement)', () => {
    const m = assembleRenderModel(demoData(), { mode: 'draft' })
    expect(m.meta.watermark).toBe('DRAFT')
    expect(m.meta.headerLabel).toMatch(/Draft/)
    expect(m.review.statement).toMatch(/IH Review Required/i)
  })

  it('applies Final chrome (no watermark + accountable review statement)', () => {
    const m = assembleRenderModel(demoData(), { mode: 'final' })
    expect(m.meta.watermark).toBeNull()
    expect(m.review.statement).toMatch(/undersigned has reviewed/i)
  })

  it('applies Sample chrome', () => {
    const m = assembleRenderModel(demoData(), { mode: 'sample' })
    expect(m.meta.watermark).toBe('SAMPLE')
    expect(m.meta.headerLabel).toMatch(/Sample/)
  })

  it('always emits QA/QC, and discloses missing fields rather than inventing them', () => {
    expect(assembleRenderModel(demoData(), { mode: 'draft' }).qaQc.length).toBeGreaterThan(0)
    const m = assembleRenderModel(demoData({ presurvey: {} }), { mode: 'draft' })
    expect(m.qaQc.some(q => /Not documented in project record/.test(q))).toBe(true)
  })

  it('emits no banned compliance/causation language in its deterministic prose', () => {
    const m = assembleRenderModel(demoData(), { mode: 'draft' })
    const prose = [m.execSummary, m.overallStatement, ...(m.scope.paras || []), ...m.results.parameters.flatMap(p => p.body), ...m.limitations]
    const hits = prose.flatMap(t => scan(t) || [])
    expect(hits).toEqual([])
  })
})

describe('narrativeLibrary', () => {
  it('has static explainers and severity-keyed observed templates', () => {
    expect(NL.WHAT_IS.co2).toMatch(/ventilation/i)
    const s = { range: '600–1247', mean: 856, min: 600, max: 1247, unit: 'ppm' }
    expect(NL.OBSERVED.co2(s, 'elevated')).toMatch(/consistent with possible under-ventilation/i)
    expect(NL.OBSERVED.co2(s, 'acceptable')).toMatch(/within the ventilation-indicator range/i)
  })
})
