/**
 * modelConsistency — the report agrees with itself, and every rule bites.
 *
 * Two halves. The first runs `checkRenderModel` over real assembled models
 * and expects silence. The second takes a clean model, breaks ONE thing, and
 * expects the matching rule to speak — because a check that cannot be shown
 * to fail on a deliberately broken model is not a check. A closing assertion
 * confirms every rule id has a negative case here, so a rule cannot be added
 * without a proof that it works.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error js
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
// @ts-expect-error js
import { genRecs } from '../../src/engines/scoring-legacy.js'
// @ts-expect-error js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-expect-error js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-expect-error js
import { checkRenderModel, RULE_IDS } from '../../src/report/modelConsistency.js'

const BLDG = { fn: 'Consistency Tower', ft: 'Commercial Office', ht: 'Central AHU — VAV', sa: 'Weak / reduced', od: 'Closed / minimum' }

function build(zones: any[], presurvey: any = { ps_survey_date: '2026-07-15' }, extra: any = {}) {
  const bldg = { ...BLDG, assessmentDate: presurvey.ps_survey_date }
  const zoneScores = zones.map(z => scoreZone(z, bldg))
  return assembleRenderModel({
    id: 'rpt-x', building: bldg, presurvey, zones, zoneScores,
    comp: summarizeAssessment(zoneScores),
    recs: genRecs(zoneScores, bldg, { zones, equipment: [] }),
    causalChains: buildCausalChains(zones, bldg, zoneScores),
    profile: { name: 'T. Tester, CIH', certs: ['CIH'] },
    ...extra,
  }, { now: new Date('2026-09-01T12:00:00Z') })
}

const COMPLAINT = {
  zn: '4th Floor Open Office — North', su: 'office', sf: '8200', oc: '46',
  cx: 'Yes — complaints reported', sy: ['Headache'], sr: 'Yes — clear pattern', ac: '6-10', cc: 'Yes — this zone',
  tc: 'Slightly warm', wd: 'Old staining', wl: ['Ceiling'],
  co2: '1385', co2o: '430', tf: '76.8', tfo: '84', rh: '63', rho: '70', pm: '19', pmo: '9', co: '1.5', tv: '850', hc: '0.03',
  meas_duration: '5-minute average', znt: 'Diffusers read low.',
}
const CLEAN = { zn: 'Z1', su: 'office', co2: '600', co2o: '420', co: '2', tf: '74', rh: '45', pm: '5', cx: 'No complaints' }

// Deep clone so a mutation never leaks between cases.
const clone = (m: any) => JSON.parse(JSON.stringify(m))

describe('an assembled report agrees with itself', () => {
  const cases: Array<[string, any[]]> = [
    ['a clean single zone', [CLEAN]],
    ['a complaint-driven zone with every parameter', [COMPLAINT]],
    ['the walked two-zone scenario', [COMPLAINT, { ...CLEAN, zn: 'Conf 4C', su: 'conference', co2: '2140', tc: 'Too hot', cx: 'Yes — complaints reported', sy: ['Headache'], sr: 'Yes — clear pattern', ac: '3-5', cc: 'Yes — this zone' }]],
    ['a zone with a data gap (no survey date)', [{ ...CLEAN, tf: '70' }]],
    ['a zone with TVOC and no PID on file', [{ ...CLEAN, tv: '800' }]],
    ['three zones, one clean', [COMPLAINT, { ...COMPLAINT, zn: 'Zone B' }, { ...CLEAN, zn: 'Zone C' }]],
  ]
  for (const [name, zones] of cases) {
    it(name, () => {
      const presurvey = name.includes('no survey date') ? {} : { ps_survey_date: '2026-07-15' }
      expect(checkRenderModel(build(zones, presurvey))).toEqual([])
    })
  }
})

describe('every rule bites on a deliberately broken model', () => {
  const base = () => build([COMPLAINT, { ...CLEAN, zn: 'Conf 4C' }])
  const ids = (m: any) => checkRenderModel(m).map((i: any) => i.id)
  const exercised = new Set<string>()
  const expectRule = (id: string, mutate: (m: any) => void) => {
    const m = clone(base())
    mutate(m)
    expect(ids(m), id).toContain(id)
    exercised.add(id)
  }

  it('site-mean-rank', () => expectRule('site-mean-rank', m => { m.results.rows.find((r: any) => r.id === 'Site mean').sev = 'ok' }))
  it('summary-scope — "Most areas" over a fully affected table', () => expectRule('summary-scope', m => {
    m.overallStatement = 'Most areas presented acceptable ventilation, comfort, and air-quality indicators, with 3 items flagged for follow-up.'
    for (const r of m.results.rows) if (r.id !== 'Site mean' && r.id !== 'Outdoor reference') r.sev = 'elevated'
  }))
  it('summary-scope — "Every area" with a clean row', () => expectRule('summary-scope', m => {
    m.overallStatement = 'Every area assessed presented at least one condition of note, with 3 items flagged for follow-up.'
    m.results.rows.find((r: any) => r.id === 'Conf 4C').sev = 'ok'
  }))
  it('summary-finding-orphan', () => expectRule('summary-finding-orphan', m => { m.execSummary.findings.push('4th Floor Open Office — North — Radon 9 pCi/L') }))
  it('citation-missing', () => expectRule('citation-missing', m => { m.findings.rows[0].std = 'ISO 16000-99'; m.findings.rows[0].cite = '' }))
  it('citation-number', () => expectRule('citation-number', m => { const r = m.findings.rows.find((x: any) => x.cite); r.cite = '[99]' }))
  it('reference-orphan', () => expectRule('reference-orphan', m => { m.references.push(['ISO 16000-99', 'Basis', undefined, 9]) }))
  it('register-location', () => expectRule('register-location', m => { m.recommendations.register[0].location = '' }))
  it('register-owner', () => expectRule('register-owner', m => { m.recommendations.register[0].owner = '' }))
  it('register-evidence', () => expectRule('register-evidence', m => { m.recommendations.register[0].evidence = '' }))
  it('register-action', () => expectRule('register-action', m => { m.recommendations.register[0].action = '' }))
  it('register-timeframe — a text deadline tighter than its bucket', () => expectRule('register-timeframe', m => {
    const r = m.recommendations.register.find((x: any) => x.priority === 'Short term')
    r.action = 'Verify OA damper position within 24–72 hours.'
  }))
  it('register-timeframe passes a deadline inside its bucket', () => {
    const m = clone(base())
    const r = m.recommendations.register.find((x: any) => x.priority === 'Immediate')
    r.action = 'Assess affected materials within 48 hours per IICRC S500.'
    expect(ids(m)).not.toContain('register-timeframe')
  })
  it('qa-tvoc', () => expectRule('qa-tvoc', m => { m.qaQc = m.qaQc.filter((q: string) => !/PID/.test(q)) }))
  it('qa-tvoc-limitation', () => expectRule('qa-tvoc-limitation', m => { m.limitations = m.limitations.filter((l: string) => !/no instrument/.test(l)) }))
  it('qa-hcho-limitation', () => expectRule('qa-hcho-limitation', m => { m.limitations = m.limitations.filter((l: string) => !/no instrument/.test(l)) }))
  it('observation-verdict', () => expectRule('observation-verdict', m => { m.observations.zones[0].observed.push('CO₂ inadequate per ASHRAE 62.1.') }))
  it('limitation-photos', () => expectRule('limitation-photos', m => { m.photos = { items: [{ imageDataUrl: 'data:image/png;base64,AAAA' }] } }))
  it('limitation-logger', () => expectRule('limitation-logger', m => { m.loggerImages = { images: [{ imageDataUrl: 'data:image/png;base64,AAAA' }] } }))
  it('gap-undisclosed', () => expectRule('gap-undisclosed', m => {
    m.findingsAtGlance.find((g: any) => g.parameter === 'Temperature').outcome = 'not_evaluated'
    m.limitations = m.limitations.filter((l: string) => !/Temperature/.test(l))
  }))
  it('conclusion-vs-site-model', () => expectRule('conclusion-vs-site-model', m => {
    m.conceptualModel = { heading: 'Moisture / Biological — Somewhere', rows: [] }
    m.execSummary.paragraphs[1] = 'The leading explanation is ventilation deficiency in Z — strong confidence.'
  }))

  it('every rule id has a negative case above', () => {
    for (const id of RULE_IDS) expect(exercised.has(id), `no negative case for ${id}`).toBe(true)
  })

  it('a throwing rule is reported, not swallowed', () => {
    // `results.rows` as a non-array breaks the first rule's `.find`.
    const m = clone(base()); m.results.rows = 42
    expect(ids(m)).toContain('rule-error')
  })
})
