/**
 * The manager layer and the technical layer tell the same scientific story.
 *
 * Every case here is a contradiction a real client report shipped — the
 * Larkin Hall residence-hall assessment, reproduced from its own fixture —
 * reduced to the property that has to hold for any assessment. They are
 * written against DERIVATIONS rather than sentences wherever the defect was
 * structural, because each of these defects was a projection reading the
 * wrong source, and a string assertion would have passed on the day it
 * shipped.
 *
 * The one rule that governs all of them: a projection may re-present what the
 * engine concluded. It may not conclude more than the engine did.
 */
import { describe, it, expect } from 'vitest'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
// @ts-expect-error js
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
// @ts-expect-error js
import { genRecs } from '../../src/engines/scoring-legacy.js'
// @ts-expect-error js
import { buildCausalChains, pickPrimaryChain } from '../../src/engines/causalChains.js'
// @ts-expect-error js
import { generateSamplingPlan } from '../../src/engines/sampling.js'
// @ts-expect-error js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-expect-error js
import { checkRenderModel } from '../../src/report/modelConsistency.js'
// @ts-expect-error js
import { atmosFlowReportChildren } from '../../src/components/docx/sections-atmosflow.js'
// @ts-expect-error js
import { CRITERION_CLASS } from '../../src/constants/criteria'
import {
  DEMO_HCHO_PRESURVEY, DEMO_HCHO_BUILDING, DEMO_HCHO_ZONES, DEMO_HCHO_EQUIPMENT,
// @ts-expect-error js
} from '../../src/constants/demoDataHcho'

const require = createRequire(import.meta.url)
const { renderReportPdf } = require('../../lib/report/render-pdf.js')

/** The PDF's own text — inflated and decoded; see manager-summary.test.ts. */
function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1')
  const out: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) continue
    let chunk: string
    try { chunk = zlib.inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1') } catch { continue }
    for (const t of chunk.matchAll(/<([0-9A-Fa-f\s]+)>/g)) out.push(Buffer.from(t[1].replace(/\s+/g, ''), 'hex').toString('latin1'))
    for (const t of chunk.matchAll(/\((?:\\.|[^()\\])*\)/g)) out.push(t[0].slice(1, -1))
  }
  return out.join('')
}
const squash = (s: string) => String(s).replace(/\s+/g, '')
/**
 * Whitespace and non-ASCII removed, for comparing against extracted PDF text.
 *
 * Justified body copy is positioned word by word, so the spaces are layout;
 * and the PDF's WinAnsi runs decode to single bytes whose code points differ
 * from the source string's (an em dash is 0x97 there and U+2014 here). The
 * ASCII skeleton is what both formats genuinely share. Applied to BOTH sides,
 * which is the half the first draft of this helper got wrong.
 */
const skeleton = (s: string) => squash(String(s).replace(/[^\x20-\x7E]/g, ''))

// ── Fixtures ──────────────────────────────────────────────────────────────

function build(zones: any[], bldg: any, presurvey: any, extra: any = {}) {
  const building = { ...bldg, assessmentDate: presurvey.ps_survey_date }
  const zoneScores = zones.map((z: any) => scoreZone(z, building))
  const data = {
    id: 'AIQ-SEM', building: bldg, presurvey, zones, zoneScores,
    comp: summarizeAssessment(zoneScores),
    recs: genRecs(zoneScores, bldg, { zones, equipment: extra.equipment || [] }),
    causalChains: buildCausalChains(zones, bldg, zoneScores),
    samplingPlan: generateSamplingPlan(zones, bldg),
    profile: { name: 'A. Rivera, CIH', certs: ['CIH'] },
    ...extra,
  }
  return { data, zoneScores, model: assembleRenderModel(data, { now: new Date('2026-06-02T12:00:00Z') }) as any }
}

/** The Larkin Hall assessment, exactly as the app loads the demo. */
const larkin = () => build(DEMO_HCHO_ZONES, DEMO_HCHO_BUILDING, DEMO_HCHO_PRESURVEY, { equipment: DEMO_HCHO_EQUIPMENT })

const PLAIN_BLDG = { fn: 'Quiet Court', ft: 'Commercial Office', ht: 'Central AHU — VAV', sa: 'Normal airflow', od: 'Open — proper', fc: 'Clean / Recent', dp: 'Clean — draining' }
const PLAIN_PRE = { ps_survey_date: '2026-06-01', ps_assessor: 'A. Rivera, CIH', ps_inst_iaq: 'TSI Q-Trak 7575' }
const clean = (zn: string) => ({ zn, su: 'office', co2: '620', co2o: '412', co: '0', tf: '73', tfo: '71', rh: '45', rho: '38', pm: '6', pmo: '9', tv: '180', cx: 'No complaints', meas_duration: '15-minute average' })

const docxText = (m: any) => {
  const out: string[] = []
  const runText = (n: any, acc: string[]): void => {
    if (n == null) return
    if (typeof n === 'string') { acc.push(n); return }
    if (Array.isArray(n)) { for (const x of n) runText(x, acc); return }
    if (typeof n === 'object') {
      if (n.rootKey === 'w:t' && n.root !== undefined) { runText(n.root, acc); return }
      if (n.root !== undefined) runText(n.root, acc)
    }
  }
  const walk = (n: any): void => {
    if (n == null || typeof n !== 'object') return
    if (Array.isArray(n)) { for (const x of n) walk(x); return }
    if (n.constructor && n.constructor.name === 'Paragraph') { const a: string[] = []; runText(n, a); out.push(a.join('')); return }
    if (n.root !== undefined) walk(n.root)
  }
  for (const c of atmosFlowReportChildren(m)) walk(c)
  return out.join('\n')
}

// ── 1. The summary cannot contradict the census ───────────────────────────

describe('the overall statement answers to the findings census, not to one table', () => {
  it('cannot call an assessment clean when a finding sits outside the six-parameter table', () => {
    const { model } = larkin()
    // The precondition that made this ship: EVERY parameter in Measurement
    // Results is clean in both rooms…
    const zoneRows = model.results.rows.filter((r: any) => r.id !== 'Site mean' && r.id !== 'Outdoor reference')
    expect(zoneRows.length).toBeGreaterThan(1)
    for (const r of zoneRows) expect(r.sev).toBe('ok')
    // …while the engine raised findings the table cannot see: formaldehyde is
    // not a column, and an odor and a symptom pattern are not parameters.
    expect(model.findings.rows.length).toBeGreaterThan(0)
    expect(model.findings.rows.some((r: any) => r.parameter === 'hcho')).toBe(true)
    expect(model.findings.rows.some((r: any) => !r.parameter)).toBe(true)
    // The statement therefore may not read as an all-clear.
    expect(model.overallStatement).not.toMatch(/were within recognized references across the areas assessed/)
    expect(model.overallStatement).not.toMatch(/no corrective action is indicated/)
    // It names where, and what.
    expect(model.overallStatement).toMatch(/Conditions of note were identified in 1 of the 2 areas assessed/)
    expect(model.overallStatement).toMatch(/[Ff]ormaldehyde/)
    expect(checkRenderModel(model).filter((i: any) => i.id === 'summary-all-clear')).toEqual([])
  })

  it('still says so plainly when there is genuinely nothing to report', () => {
    const { model } = build([clean('Suite 200'), clean('Suite 210')], PLAIN_BLDG, PLAIN_PRE)
    expect(model.findings).toBeNull()
    expect(model.overallStatement).toMatch(/All measured parameters were within recognized references/)
    expect(checkRenderModel(model)).toEqual([])
  })
})

// ── 2. A spot reading is not a time-weighted exposure ─────────────────────

describe('a short-duration measurement is not an exposure determination', () => {
  const { model } = larkin()
  const hcho = () => model.findings.rows.find((r: any) => r.parameter === 'hcho')

  it('carries the engine’s own verdict on whether the comparison can be settled', () => {
    const f = hcho()
    // 0.032 ppm, a 15-minute walkthrough average, against a 10-hour TWA.
    expect(f.averaging).toBe('hour10')
    expect(f.evidenceBasis).toBe('screening_grab')
    expect(f.determinative).toBe(false)
    // The finding names the averaging period and claims no exceedance of it.
    expect(f.f).toMatch(/which is a 10-hour time-weighted average/)
    expect(f.f).not.toMatch(/exceed/i)
  })

  it('says in the management layer what the measurement cannot settle', () => {
    const row = model.managerSummary.attention.items.find((i: any) => i.zones.includes(hcho().z))
    expect(row.whyItMatters).toContain('cannot settle a comparison against')
    expect(row.whyItMatters).toContain('identifies a condition rather than establishing an exposure')
    // And it states what KIND of reference this is, in the registry's words.
    expect(row.whyItMatters).toContain(CRITERION_CLASS.regulatory_oel.framing)
  })

  it('never states an exceedance of the reference’s exposure limit anywhere a reader looks', () => {
    const text = docxText(model)
    for (const claim of [/exposure limit (?:was |is )?exceeded/i, /exceeded the (?:PEL|REL|TLV)/i, /demonstrated exceedance/i, /10-hour exposure/i]) {
      expect(text).not.toMatch(claim)
    }
    expect(checkRenderModel(model).filter((i: any) => i.id === 'exposure-asserted' || i.id === 'unsettled-comparison')).toEqual([])
  })
})

// ── 3. No subset label masquerades as a room verdict ──────────────────────

describe('the measurement table does not label the room', () => {
  it('prints no Outcome column, and no replacement verdict', () => {
    const { model } = larkin()
    const text = docxText(model)
    const idx = text.indexOf('4. Measurement Results')
    const section = text.slice(idx, text.indexOf('MEASUREMENT OVERVIEW', idx))
    expect(idx).toBeGreaterThan(-1)
    // The column heading is gone from the per-zone table…
    expect(section).not.toContain('Outcome')
    // …and nothing replaced it with a whole-zone word.
    for (const verdict of ['Acceptable', 'Elevated', 'Priority', 'Advisory']) {
      expect(section).not.toContain(verdict)
    }
    // The measurements themselves are all still there.
    expect(section).toContain('618')
    expect(section).toContain('605')
  })

  it('keeps `sev` on the model, because the consistency invariants read it', () => {
    const { model } = larkin()
    const mean = model.results.rows.find((r: any) => r.id === 'Site mean')
    expect(mean.sev).toBeTruthy()
    expect(checkRenderModel(model).filter((i: any) => i.id === 'site-mean-rank')).toEqual([])
  })
})

// ── 4. One evidence set, one leading hypothesis ───────────────────────────

describe('the summary and the manager layer choose the same primary chain', () => {
  it('projects the engine’s pick, not array order', () => {
    const { model, data } = larkin()
    const zoneChains = data.causalChains.filter((c: any) => c.zone === DEMO_HCHO_ZONES[0].zn && !c.notEvaluated)
    // The precondition: more than one chain covers the room, and the first in
    // array order is NOT the one the engine ranks first.
    expect(zoneChains.length).toBeGreaterThan(1)
    const primary = pickPrimaryChain(zoneChains)
    expect(zoneChains[0].type).not.toBe(primary.type)
    const row = model.managerSummary.attention.items[0]
    const named = primary.type.replace(/\s*\((?:Hypothesis|Mechanism)\)\s*$/, '').toLowerCase()
    expect(row.status.toLowerCase()).toContain(named)
    // The executive summary names the same one.
    expect(model.execSummary.paragraphs.join(' ').toLowerCase()).toContain(named)
    expect(checkRenderModel(model).filter((i: any) => i.id === 'hypothesis-disagreement')).toEqual([])
  })

  it('keeps it a hypothesis, in both layers', () => {
    const { model } = larkin()
    const row = model.managerSummary.attention.items[0]
    expect(row.status).toContain('Working hypothesis')
    expect(row.status).toContain('no causal relationship has been established')
    expect(row.whyItMatters).toContain('No source has been established')
    expect(model.execSummary.paragraphs.join(' ')).toContain('No causal relationship has been established')
  })

  it('does not let a comparison room establish a cause', () => {
    const { model } = larkin()
    // Room 108 is the comparison area and carries no finding of its own.
    expect(model.managerSummary.attention.items.every((i: any) => !i.location.startsWith('Room 108'))).toBe(true)
    const claims = checkRenderModel(model).filter((i: any) => i.id === 'cause-asserted')
    expect(claims).toEqual([])
  })
})

// ── 5. Why it matters explains the decision, and nothing more ─────────────

describe('why it matters carries decision significance only', () => {
  const { model } = larkin()
  const rows = () => model.managerSummary.attention.items

  it('is assembled from fields the engine stamped, with no new ranking', () => {
    for (const row of rows()) {
      expect(row.whyItMatters).toBeTruthy()
      // Every clause traces to a criterion class, a `determinative` flag, a
      // missing criterion, or a chain — nothing else is reachable.
      const known = [
        ...Object.values(CRITERION_CLASS).map((c: any) => c.framing),
        'cannot settle a comparison against',
        'rests on what was observed and reported during the walkthrough',
        'No source has been established.',
      ]
      expect(known.some((k) => row.whyItMatters.includes(k))).toBe(true)
    }
  })

  it('makes no health, exposure, compliance, severity or causal claim', () => {
    const text = rows().map((r: any) => r.whyItMatters).join(' ')
    for (const forbidden of [
      /health (?:risk|hazard|effect)/i, /\bhazardous\b/i, /\btoxic/i, /\bunsafe\b/i,
      /\bcompl(?:y|ies|iant)\b/i, /\bviolat/i, /\bcaused? by\b/i, /\bwill (?:cause|result)/i,
      /\b(?:high|low|moderate) risk\b/i,
    ]) {
      expect(text, forbidden.source).not.toMatch(forbidden)
    }
  })

  it('says plainly when a row rests on the walkthrough rather than an instrument', () => {
    const { model: m2 } = build(
      [{ ...clean('Room 9'), op: 'Moderate persistent', ot: ['Chemical'] }],
      PLAIN_BLDG, PLAIN_PRE,
    )
    const row = m2.managerSummary.attention.items[0]
    expect(row.whyItMatters).toContain('rests on what was observed and reported during the walkthrough')
  })
})

// ── 6. References keep their own meaning ──────────────────────────────────

describe('a reference does not become something it is not', () => {
  it('attributes no CO2 limit to ASHRAE 62.1, and draws no unsupported threshold', () => {
    const { model } = larkin()
    expect(model.co2Bars === null || model.co2Bars.threshold === null).toBe(true)
    if (model.co2Bars) {
      expect(model.co2Bars.thresholdLabel).toBeNull()
      expect(model.co2Bars.caption).not.toMatch(/advisory|1,?000 ppm/i)
    }
    const text = docxText(model)
    expect(text).not.toMatch(/ASHRAE 62\.1 advisory/)
    expect(text).not.toMatch(/1,000 ppm advisory/)
    // The report's own correct statement survives.
    expect(text).toMatch(/ASHRAE 62\.1 \(ventilation, used as an indicator basis for CO2 — not a CO2 contaminant limit\)/)
  })

  it('keeps TVOC measured and unjudged', () => {
    const { model } = larkin()
    const tvoc = model.findingsAtGlance.find((g: any) => /TVOC/.test(g.parameter))
    expect(tvoc.outcome).toBe('not_evaluated')
    expect(model.findings.rows.some((r: any) => r.parameter === 'tvoc')).toBe(false)
    expect(checkRenderModel(model).filter((i: any) => i.id === 'screening-as-identification')).toEqual([])
  })

  it('does not present a contextual ambient reference as a compliance result', () => {
    const { model } = larkin()
    expect(checkRenderModel(model).filter((i: any) => i.id === 'context-as-compliance')).toEqual([])
    expect(docxText(model)).not.toMatch(/compl(?:y|ies|iant) with the (?:EPA )?NAAQS/i)
  })
})

// ── 7. Instruments are not invented ───────────────────────────────────────

describe('the methods section does not attribute readings to an instrument that did not take them', () => {
  it('asserts no parameter list for the primary meter', () => {
    const { model } = larkin()
    const methods = model.methodology.bullets.join(' ')
    expect(methods).toContain('TSI Q-Trak 7575')
    // The hardcoded six-parameter claim is gone: the Q-Trak was credited with
    // PM2.5 and TVOC while QA/QC named a ppbRAE, a Formaldemeter and a logger.
    expect(methods).not.toMatch(/fine particulate \(PM2\.5\), and total VOCs captured as available/)
    expect(methods).toMatch(/listed under Quality assurance \/ quality control/)
  })

  it('still names every instrument the record carries, once, in QA\/QC', () => {
    const { model } = larkin()
    const qa = model.qaQc.join(' | ')
    expect(qa).toContain('TSI Q-Trak 7575')
    expect(qa).toContain('RAE Systems ppbRAE 3000')
    expect(qa).toContain('Formaldemeter')
    expect(qa).toMatch(/Continuous monitoring/)
  })
})

// ── 8. It generalizes ─────────────────────────────────────────────────────

describe('the fixes are not Larkin-specific', () => {
  const cases: Array<[string, () => any]> = [
    ['clean / no findings', () => build([clean('Suite 200'), clean('Suite 210')], PLAIN_BLDG, PLAIN_PRE).model],
    ['multi-zone', () => build([clean('A'), { ...clean('B'), co2: '1385' }, { ...clean('C'), rh: '68' }, clean('D')], PLAIN_BLDG, PLAIN_PRE).model],
    ['no formaldehyde', () => build(DEMO_HCHO_ZONES.map((z: any) => { const c = { ...z }; delete c.hc; return c }), DEMO_HCHO_BUILDING, DEMO_HCHO_PRESURVEY).model],
    ['no occupant complaints', () => build(DEMO_HCHO_ZONES.map((z: any) => ({ ...z, cx: 'No complaints', sy: [], sr: '', ac: '', cc: '' })), DEMO_HCHO_BUILDING, DEMO_HCHO_PRESURVEY).model],
    ['no logger data', () => build(DEMO_HCHO_ZONES.map((z: any) => { const c = { ...z }; delete c.logger_deployment; return c }), DEMO_HCHO_BUILDING, DEMO_HCHO_PRESURVEY).model],
    ['a single zone', () => build([{ ...clean('Only Room'), co2: '1385' }], PLAIN_BLDG, PLAIN_PRE).model],
  ]

  for (const [name, make] of cases) {
    it(`${name}: the report agrees with itself`, () => {
      const model = make()
      expect(checkRenderModel(model)).toEqual([])
    })

    it(`${name}: the summary and the census agree about whether anything was found`, () => {
      const model = make()
      const hasFindings = !!(model.findings && model.findings.rows.length)
      const readsClean = /All measured parameters were within recognized references/.test(model.overallStatement)
      expect(readsClean).toBe(!hasFindings)
      // And the manager layer agrees with both.
      expect(model.managerSummary.attention.items.length > 0).toBe(hasFindings)
    })

    it(`${name}: every non-determinative comparison is disclosed as one`, () => {
      const model = make()
      const rows = (model.findings && model.findings.rows) || []
      for (const r of rows.filter((x: any) => x.determinative === false)) {
        const row = model.managerSummary.attention.items.find((i: any) => (i.zones || []).some((z: string) => (r.zones || [r.z]).includes(z)))
        expect(row, `no management row for ${r.f}`).toBeTruthy()
        expect(row.whyItMatters).toContain('cannot settle a comparison against')
      }
    })
  }
})

// ── 9. Both deliverables carry the corrections ────────────────────────────

describe('the Word report and the PDF tell the same corrected story', () => {
  it('carries every changed element in both, and the removed ones in neither', async () => {
    const { model } = larkin()
    const docx = docxText(model)
    const pdf = pdfText(await renderReportPdf(model))
    const row = model.managerSummary.attention.items[0]

    // Present in both: the corrected statement, the new column, the status.
    for (const needle of [model.overallStatement, row.whyItMatters, row.status, 'Why it matters']) {
      expect(squash(docx).includes(squash(String(needle))), `DOCX: ${String(needle).slice(0, 50)}`).toBe(true)
      expect(skeleton(pdf).includes(skeleton(needle)), `PDF: ${String(needle).slice(0, 50)}`).toBe(true)
    }

    // Absent from both: the misattributed threshold, the invented parameter
    // list, and the wording that read as an all-clear.
    for (const gone of [
      'ASHRAE 62.1 advisory',
      '1,000 ppm advisory',
      'and total VOCs captured as available',
      'were within recognized references across the areas assessed',
      'Outcome reflects the zone',
    ]) {
      expect(squash(docx)).not.toContain(squash(gone))
      expect(skeleton(pdf)).not.toContain(skeleton(gone))
    }
  })
})
