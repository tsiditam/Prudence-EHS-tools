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
  it('summary-scope — a count the findings census does not support', () => expectRule('summary-scope', m => {
    // The statement claims more affected areas than the census names. The
    // rule reads the CENSUS, not the six-parameter results table, which is
    // how its predecessor agreed with the contradiction it should have caught.
    m.overallStatement = 'Conditions of note were identified in 9 of the 2 areas assessed: A. 3 items are flagged for follow-up.'
  }))
  it('summary-scope — "Every area" while findings name only one', () => expectRule('summary-scope', m => {
    m.overallStatement = 'Every area assessed carries at least one condition of note: A.'
    for (const r of m.findings.rows) { r.zones = ['4th Floor Open Office — North']; r.z = '4th Floor Open Office — North' }
  }))
  it('summary-all-clear — the all-clear sentence over a report with findings', () => expectRule('summary-all-clear', m => {
    // The Larkin Hall contradiction as an invariant: every parameter in the
    // measurement table was clean while four findings stood in one room, and
    // the report opened by calling the assessment clean.
    m.overallStatement = 'All measured parameters were within recognized references during the assessment window. Routine operation and periodic reassessment are appropriate; no corrective action is indicated at this time.'
  }))
  // ── The semantic invariants (2026-09) ──────────────────────────────────
  //
  // Each of these is a real contradiction a live report shipped, reduced to
  // the shape that produced it. They read STRUCTURED FIELDS wherever the
  // defect is structural — `determinative`, the chain selection — and prose
  // only where the claim is the prose.
  it('unsettled-comparison — a non-determinative finding whose row does not say so', () => expectRule('unsettled-comparison', m => {
    // A 15-minute reading against a 10-hour TWA. The engine knows it cannot
    // settle the comparison; the management row has to say so.
    m.findings.rows[0].determinative = false
    m.findings.rows[0].averaging = 'hour10'
    m.managerSummary.attention.items[0].zones = [m.findings.rows[0].z]
    m.managerSummary.attention.items[0].whyItMatters = 'An occupational exposure limit.'
  }))
  it('exposure-asserted — prose upgrading a comparison to an exceedance', () => expectRule('exposure-asserted', m => {
    m.findings.rows[0].determinative = false
    m.managerSummary.attention.items[0].whyItMatters = 'The reading exceeded the REL for this compound.'
  }))
  it('hypothesis-disagreement — summary and manager layer name different pathways', () => expectRule('hypothesis-disagreement', m => {
    // Both read the same chains, so they can only differ by HOW they choose.
    // They did: the summary used `pickPrimaryChain` and the manager layer
    // took the first chain in array order.
    m.execSummary.paragraphs = ['Chemical exposure in 4th Floor Open Office — North is the leading working hypothesis on the observations available.']
    m.managerSummary.attention.items[0].status = 'Corrective action recommended. Working hypothesis: ventilation deficiency — no causal relationship has been established.'
  }))
  it('cause-asserted — an established cause', () => expectRule('cause-asserted', m => {
    m.overallStatement = 'The identified source of the complaints is the new furniture.'
  }))
  it('screening-as-identification — TVOC naming a compound', () => expectRule('screening-as-identification', m => {
    m.overallStatement = 'TVOC readings identified formaldehyde as the compound present.'
  }))
  it('context-as-compliance — a contextual reference as a pass', () => expectRule('context-as-compliance', m => {
    m.overallStatement = 'Indoor particulate complies with the EPA NAAQS.'
  }))
  it('absence-as-safety — no findings read as proof of safety', () => expectRule('absence-as-safety', m => {
    m.overallStatement = 'Nothing was flagged, so the building is safe for occupancy.'
  }))

  it('does not fire on the report DISCLAIMING the same claim', () => {
    // The conceptual-site-model intro ends "The chain is a working
    // hypothesis, not an established cause" — the report doing exactly the
    // right thing, and what a bare /established cause/ matched on its first
    // run. A rule that fires on the sentence disclaiming the claim trains a
    // reader to ignore it, and the pressure becomes to delete the disclaimer.
    const m = clone(base())
    m.overallStatement = 'The chain is a working hypothesis, not an established cause, and no source has been established.'
    expect(ids(m)).not.toContain('cause-asserted')
    const n = clone(base())
    n.overallStatement = 'Indoor particulate does not comply with the EPA NAAQS.'
    expect(ids(n)).not.toContain('context-as-compliance')
  })

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
  const planFigure = (pins: any[]) => ({ heading: 'Site plan and sampling locations', figures: [{ id: 'p1', label: 'Floor plan', imageDataUrl: 'data:image/png;base64,AAAA', figure: { width: 10, height: 10 }, pins }], note: null })
  it('floorplan-pin', () => expectRule('floorplan-pin', m => {
    m.floorPlans = planFigure([{ n: 1, zone: 'Mezzanine (not assessed)', use: '' }])
  }))
  it('floorplan-pin passes when every pin names a results row', () => {
    const m = clone(base())
    m.floorPlans = planFigure([{ n: 1, zone: 'Conf 4C', use: '' }])
    expect(ids(m)).not.toContain('floorplan-pin')
  })
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
