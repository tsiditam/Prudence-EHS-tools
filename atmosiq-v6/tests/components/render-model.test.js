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
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
import { buildCausalChains } from '../../src/engines/causalChains.js'
import { DEMO_FINDINGS_BUILDING as DEMO_BUILDING, DEMO_FINDINGS_ZONES as DEMO_ZONES, DEMO_FINDINGS_PRESURVEY as DEMO_PRESURVEY } from '../../src/constants/demoDataFindings'
const require = createRequire(import.meta.url)
const { scan } = require('../../api/_banned-language.js')

function demoData(extra) {
  const zoneScores = DEMO_ZONES.map(z => scoreZone(z, DEMO_BUILDING))
  const comp = summarizeAssessment(zoneScores)
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

  it('applies Draft chrome (watermark + not-yet-reviewed statement)', () => {
    const m = assembleRenderModel(demoData(), { mode: 'draft' })
    expect(m.meta.watermark).toBe('DRAFT')
    expect(m.meta.headerLabel).toMatch(/Draft/)
    // Reworded with the report lifecycle: a draft says it has not
    // completed review, without the blanket "IH Review Required" stamp
    // that made every AtmosFlow report read as unfinished.
    expect(m.review.statement).toMatch(/has not completed professional review/i)
    expect(m.review.statement).not.toMatch(/IH Review Required/i)
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

describe('photo appendix captions', () => {
  const PHOTOS = {
    'z1-mi': [{ src: 'data:image/jpeg;base64,AAAA', ts: 1755000000000 }],
    'z0-wd': [{ src: 'data:image/jpeg;base64,BBBB', ts: 1755000001000 }],
  }

  it('captions a photo with the question it answers and its zone, not the field code', () => {
    // The caption used to be `titleCaseKey('z1-mi')` — literally "Mi".
    const m = assembleRenderModel(demoData({ photos: PHOTOS }), { mode: 'draft' })
    const titles = m.photos.items.map((p) => p.title)
    expect(titles).toHaveLength(2)
    for (const t of titles) {
      expect(t).not.toMatch(/^(Mi|Wd|Dp)$/)
      expect(t).toContain('—')
      expect(t.length).toBeGreaterThan(6)
    }
  })

  it('orders the appendix by zone so it reads as a walk through the building', () => {
    const m = assembleRenderModel(demoData({ photos: PHOTOS }), { mode: 'draft' })
    const zoneNames = DEMO_ZONES.map((z) => z.zn)
    const idx = m.photos.items.map((p) => zoneNames.findIndex((n) => p.title.includes(n)))
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  })

  it('does not put the photo AI analysis into the report', () => {
    // Model-authored prose must not enter a client deliverable while the DOCX
    // AI-provenance banner has no render site. See src/report/reportModel.js.
    const withAnalysis = {
      'z0-wd': [{
        src: 'data:image/jpeg;base64,AAAA', ts: 1755000000000,
        aiAnalysis: { observed: 'UNIQUE_AI_SENTINEL_TEXT', confidence: 'medium' },
      }],
    }
    const m = assembleRenderModel(demoData({ photos: withAnalysis }), { mode: 'draft' })
    expect(JSON.stringify(m)).not.toContain('UNIQUE_AI_SENTINEL_TEXT')
  })
})
