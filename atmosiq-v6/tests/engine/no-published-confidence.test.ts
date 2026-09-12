// @vitest-environment node
/**
 * No causal pathway carries a published confidence rating.
 *
 * The report used to print Possible / Moderate / Strong on its causal chains —
 * in the opening summary sentence ("— moderate confidence on the evidence
 * gathered"), in a bold teal 'Confidence' row of the conceptual-site-model
 * table, and on a colored pill in the print view. The weighing behind it is
 * real (`weighChain`: measured vs corroborating, Strong unreachable for a
 * hypothesis, monotonicity pinned by chain-confidence.test.ts) but the report
 * never states it, so the label was quasi-quantitative with nothing a reader
 * could check. A client could reasonably ask what makes a pathway Moderate
 * rather than Low, and the document had no answer.
 *
 * What the report states instead is what it can defend: the evidence, that no
 * causal relationship is established, and what would verify it. Severity and
 * prioritization on ACTIONS are untouched — those rank what to do about a
 * measured condition, not how sure anyone is about a cause.
 *
 * The weighing itself stays. It ranks the chains (`pickPrimaryChain`) and it
 * constrains what a narrative may assert about one (`evidencePackage.js`).
 * Removing it would weaken a guardrail to fix a wording problem. The rule is
 * narrower than "delete confidence": it is not PUBLISHED and it does not reach
 * the writer.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildCausalChains, pickPrimaryChain } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { buildEvidencePackage, packageForWriter } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const ROOT = join(__dirname, '..', '..')
const GRADE = /\b(?:possible|moderate|strong|high|low)\s+confidence\b|\bconfidence\s*[:=]/i

function build() {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, assessmentDate: '2026-06-10' }))
  const causalChains = buildCausalChains(ZONES, BLDG, zoneScores)
  const model = assembleRenderModel({
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains,
    recs: { imm: [], eng: [], adm: [], mon: [] }, id: 'AIQ-DEMO', ts: '2026-06-10',
  }, { now: new Date('2026-06-11T12:00:00Z') })
  return { model, causalChains, zoneScores }
}

/** Every string the AtmosFlow render model would print, flattened. */
function renderedText(model: any): string {
  const out: string[] = []
  const walk = (v: any) => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk({
    execSummary: model.execSummary,
    conceptualModel: model.conceptualModel,
    workingHypotheses: model.workingHypotheses,
    discussion: model.discussion,
    findings: model.findings,
  })
  return out.join(' \n ')
}

describe('the report states no confidence rating on a causal pathway', () => {
  it('the summary conclusion names a working hypothesis, not a confidence', () => {
    const { model } = build()
    const summary = model.execSummary.paragraphs.join(' ')
    expect(summary).toMatch(/is the leading working hypothesis on the observations available/)
    expect(summary).toMatch(/No causal relationship has been established/)
    expect(summary).not.toMatch(/confidence on the evidence gathered/)
  })

  it('the conceptual-site-model table states status and verification instead of a grade', () => {
    const { model } = build()
    const cm = model.conceptualModel
    // Guard the guard: if this fixture stops producing a site model the
    // assertions below pass vacuously.
    expect(cm, 'the fixture produced no conceptual site model').toBeTruthy()
    const labels = cm.rows.map((r: any[]) => String(r[0]))
    expect(labels).not.toContain('Confidence')
    expect(labels).toContain('Status')
    expect(cm.rows.find((r: any[]) => r[0] === 'Status')[1]).toMatch(/no causal relationship has been established/i)
    expect(cm.intro).toMatch(/working hypothesis, not an established cause/)
  })

  it('no rendered string anywhere grades a pathway', () => {
    const { model } = build()
    const text = renderedText(model)
    expect(text.length).toBeGreaterThan(400)
    const hit = GRADE.exec(text)
    expect(hit && hit[0], `the report prints a confidence grade: ${hit && hit[0]}`).toBeFalsy()
  })

  it('the print view labels a chain a working hypothesis rather than pilling its confidence', () => {
    const src = readFileSync(join(ROOT, 'src/components/PrintReport.jsx'), 'utf8')
    // The chain SECTION, not the table-of-contents entry that names it first.
    const start = src.indexOf('<div class="chain-card">')
    expect(start).toBeGreaterThan(-1)
    const section = src.slice(src.lastIndexOf('Causal Chain Analysis', start), start + 2000)
    expect(section).not.toMatch(/ch\.confidence/)
    expect(section).toMatch(/Working hypothesis/)
    expect(section).toMatch(/No causal relationship has been established/)
  })
})

describe('what replaces it: every pathway names the verification it requires', () => {
  it('the engine stamps a verification clause on each chain', () => {
    const { causalChains } = build()
    expect(causalChains.length).toBeGreaterThan(0)
    for (const c of causalChains) {
      expect(typeof c.verification, `${c.type} carries no verification`).toBe('string')
      expect(c.verification.length).toBeGreaterThan(20)
      // A lowercase clause, so one string serves the summary sentence, the
      // table cell and the bullet.
      expect(c.verification[0]).toBe(c.verification[0].toLowerCase())
    }
  })

  it('the Working Hypotheses section keeps the promise its intro has always made', () => {
    // The intro has said "each names the verification it requires" since the
    // section was written. It never did: `refutableBy` was declared on the
    // type and read by reportModel.js, and causalChains.js — the only producer
    // of chains — never set it. Every report printed the promise over bare
    // root-cause sentences.
    const { model } = build()
    const wh = model.workingHypotheses
    expect(wh, 'the fixture produced no working hypotheses').toBeTruthy()
    expect(wh.intro).toMatch(/each names the verification it requires/)
    for (const item of wh.items) expect(item, item).toMatch(/Verification: /)
  })
})

describe('the weighing survives — it is unpublished, not deleted', () => {
  it('still ranks the chains, so the report leads with the best-supported one', () => {
    const { causalChains } = build()
    for (const c of causalChains) expect(['Possible', 'Moderate', 'Strong']).toContain(c.confidence)
    // The property pickPrimaryChain exists for: a measured chain outranks a
    // complaint-only hypothesis, whatever order the file pushed them in.
    const primary = pickPrimaryChain(causalChains)
    const rank: Record<string, number> = { Possible: 1, Moderate: 2, Strong: 3 }
    for (const c of causalChains) expect(rank[primary.confidence]).toBeGreaterThanOrEqual(rank[c.confidence])
  })

  it('never reaches the writer, because the report has no rating for it to echo', () => {
    const { model, causalChains, zoneScores } = build()
    const wire = packageForWriter(buildEvidencePackage(model, { zoneScores, causalChains }))
    for (const p of wire.pathways) expect(p.confidence).toBeUndefined()
    expect(JSON.stringify(wire)).not.toMatch(/"confidence"/)
    expect(wire.pathway_rule).toMatch(/Do NOT rate, rank, score or grade a pathway/)
  })
})
