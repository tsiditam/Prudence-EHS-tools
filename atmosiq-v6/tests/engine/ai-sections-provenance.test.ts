// @vitest-environment node
/**
 * AI-provenance labeling for the AtmosFlow DOCX's AI-authored sections.
 *
 * `tests/engine/ai-provenance-banner.test.ts` guards the ORIGINAL answer to
 * CLAUDE.md's standing rule — a hard banner in `sections-core.js`'s
 * Executive Summary builder. That file has had no production importer since
 * the consultant report was removed (reportModel.js:1210). This is the
 * counterpart for the LIVE path: five sections in `sections-atmosflow.js`
 * (the one client deliverable) may now carry AI-authored prose
 * (`src/report/aiSections.js`), and each one that does must be
 * distinguishable from the assessor's own words, in the actual document a
 * client receives — not only in a renderer nothing calls.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { Packer } from 'docx'
import JSZip from 'jszip'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { buildEvidencePackage } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { buildAiSectionsRecord, applyAiSections } from '../../src/report/aiSections.js'
// @ts-ignore js
import { buildAtmosFlowDoc } from '../../src/components/docx/sections-atmosflow.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const NOTE = 'AI-assisted — verify before issue.'

function build() {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, assessmentDate: '2026-06-10' }))
  const causalChains = buildCausalChains(ZONES, BLDG, zoneScores)
  const data = {
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains,
    recs: { imm: [{ text: 'Verify supply airflow to the flagged zone.', scope: 'zone', zoneName: 'Zone 1', controlTier: 'engineering_control' }], eng: [], adm: [], mon: [] },
    id: 'AIQ-DEMO', ts: '2026-06-10',
  }
  const model = assembleRenderModel(data, { now: new Date('2026-06-11T12:00:00Z') })
  const pkg = buildEvidencePackage(model, { zoneScores, causalChains })
  return { model, pkg }
}

function goodResponse() {
  return {
    executive_summary: 'Carbon dioxide stood out at this site.\n\nThe source was not identified during the assessment.',
    discussion: 'Carbon dioxide is an indicator of outdoor-air delivery. No ventilation rate was measured directly.',
    conceptual_site_model: 'The evidence points to reduced outdoor-air delivery reaching the flagged zone.',
    recommendations_prose: 'The steps below verify the suspected cause before any corrective work begins.',
    parameter_background: {
      co2: 'Carbon dioxide is a gauge of how much fresh air is reaching a room. No ventilation rate was measured directly; the reading is an indicator only.',
      thermal: 'Temperature did not identify a notable condition during the assessment. Relative humidity measured above the moisture-control range in both zones.',
    },
  }
}

async function renderXml(model: any): Promise<string> {
  const doc = buildAtmosFlowDoc(model)
  const buf = await Packer.toBuffer(doc)
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

describe('the live DOCX marks every AI-authored section, and nothing else', () => {
  it('a fully deterministic report carries no AI-provenance note anywhere', async () => {
    const { model } = build()
    const xml = await renderXml(model)
    expect(xml).not.toContain(NOTE)
  })

  it('an active, fully-supported record marks every key it authored, including per-parameter background entries', async () => {
    const { model, pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(), pkg)
    const withAi = applyAiSections(model, rec, pkg)
    expect(withAi.aiAuthoredSections.sort()).toEqual([
      'conceptual_site_model', 'discussion', 'executive_summary',
      'parameter_background.co2', 'parameter_background.thermal', 'recommendations_prose',
    ].sort())
    const xml = await renderXml(withAi)
    // One note per authored section — not fewer (a missed slot), not more
    // (a slot marked that renders no AI text).
    const count = xml.split(NOTE).length - 1
    expect(count).toBe(withAi.aiAuthoredSections.length)
  })

  it('a section a blocking audit finding fell back on carries no note — it is deterministic prose again', async () => {
    const { model, pkg } = build()
    const raw = goodResponse()
    raw.executive_summary = raw.executive_summary.replace('Carbon dioxide stood out at this site.', 'Carbon dioxide measured 9999 ppm at this site.')
    const rec = buildAiSectionsRecord(raw, pkg)
    const withAi = applyAiSections(model, rec, pkg)
    expect(withAi.aiAuthoredSections).not.toContain('executive_summary')
    const xml = await renderXml(withAi)
    const count = xml.split(NOTE).length - 1
    expect(count).toBe(withAi.aiAuthoredSections.length)
    // goodResponse() authors 6 keys (4 sections + 2 parameter-background
    // groups); blocking the exec summary alone leaves 5.
    expect(count).toBe(5)
  })

  it('a stale record marks nothing — the whole document falls back silently', async () => {
    const { model, pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(), pkg)
    const { pkg: laterPkg } = (() => {
      const zoneScores = ZONES.map((z: any, i: number) => scoreZone(i === 0 ? { ...z, co2: '2200' } : z, { ...BLDG, assessmentDate: '2026-06-10' }))
      const causalChains = buildCausalChains(ZONES, BLDG, zoneScores)
      const m = assembleRenderModel({ building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains, recs: { imm: [], eng: [], adm: [], mon: [] }, id: 'AIQ-DEMO', ts: '2026-06-10' }, { now: new Date('2026-06-11T12:00:00Z') })
      return { pkg: buildEvidencePackage(m, { zoneScores, causalChains }) }
    })()
    const withAi = applyAiSections(model, rec, laterPkg)
    expect(withAi.aiSectionsStatus).toBe('stale')
    expect(withAi.aiAuthoredSections).toEqual([])
    const xml = await renderXml(withAi)
    expect(xml).not.toContain(NOTE)
  })
})

describe('the acceptance gate covers the live path, not only the orphaned renderer', () => {
  it('the criterion checks sections-atmosflow.js in addition to sections-core.js', () => {
    // The original guard (ai-provenance-banner.test.ts) only ever exercised
    // sections-core.js, which has had no production importer since the
    // consultant report was removed — exactly the "guard checks a file
    // nothing reaches" trap CLAUDE.md names elsewhere. This asserts the
    // acceptance config was widened rather than left pointed at dead code.
    const require = createRequire(import.meta.url)
    const config = require('../../scripts/acceptance/prod-ready.json')
    const criterion = config.criteria.find((c: any) => c.id === 'NARRATIVE-AI-PROVENANCE-BANNER')
    const paths = criterion.checks.flatMap((c: any) => c.paths || [])
    expect(paths).toContain('src/components/docx/sections-atmosflow.js')
  })
})
