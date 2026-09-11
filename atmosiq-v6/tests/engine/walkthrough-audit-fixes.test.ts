/**
 * Guards for the defects found by walking the product end-to-end as a user
 * (2026-09): Quick Start → two zones with readings → finalize → export DOCX.
 *
 * Each block below pins a property rather than a string, because every one of
 * these shipped as a template or a match that was ALLOWED to disagree with the
 * data beside it. The failure they share is the one CLAUDE.md already names:
 * every layer must say the same thing about the same data.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error js engine
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-expect-error js engine
import { genRecs } from '../../src/engines/scoring-legacy.js'
// @ts-expect-error js engine
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-expect-error js engine
import { assembleRenderModel, pickPrimaryChain, dedupeCredentials } from '../../src/report/reportModel.js'
// @ts-expect-error js engine
import { buildOverallStatement } from '../../src/report/narrativeLibrary.js'
import { Q_DETAILS, Q_QUICKSTART } from '../../src/constants/questions'

const BLDG = { fn: 'Test Tower', fl: '1 Test Way', ft: 'Commercial Office', ht: 'Central AHU — VAV' }

/** A complaint zone with readings, parameterised on the fields under test. */
const zone = (over: Record<string, unknown> = {}) => ({
  zn: 'Open Office', su: 'office', sf: '8000', oc: '40',
  cx: 'Yes — complaints reported', sy: ['Headache'], sr: 'Yes — clear pattern',
  ac: '6-10', cc: 'Yes — this zone',
  co2: '1385', co2o: '430', tf: '76.8', rh: '63', pm: '19', pmo: '9',
  ...over,
})

const recTexts = (recs: any) =>
  ['imm', 'eng', 'adm', 'mon'].flatMap(b => (recs?.[b] || []).map((a: any) => String(a.text)))

describe('water intrusion keys on the observation, not on the word "water"', () => {
  // `hasWater` was a substring match over every finding's TEXT. The engine's
  // own `Historical water staining` finding — severity `low` — contains the
  // word, so dry historical staining raised an IMMEDIATE 48-hour IICRC S500
  // repair order, an insurance-notification action, and a post-remediation
  // re-occupancy hold. None of those conditions was observed.
  const S500 = /48 hours per IICRC S500/
  const INSURANCE = /insurance notification/
  const REOCCUPANCY = /re-occupancy and clearance criteria/

  it('old staining raises none of the active-water cascade', () => {
    const z = zone({ wd: 'Old staining', wl: ['Ceiling'] })
    const texts = recTexts(genRecs([scoreZone(z, BLDG)], BLDG, { zones: [z], equipment: [] }))
    // The finding that used to trigger it is still raised, and still says "water".
    const findings = scoreZone(z, BLDG).cats.flatMap((c: any) => c.r.map((r: any) => r.t))
    expect(findings.some((t: string) => /water/i.test(t))).toBe(true)
    expect(texts.some(t => S500.test(t))).toBe(false)
    expect(texts.some(t => INSURANCE.test(t))).toBe(false)
    expect(texts.some(t => REOCCUPANCY.test(t))).toBe(false)
  })

  it('old staining still recommends something proportionate', () => {
    // An absence-only fix would leave the condition recommending nothing.
    const z = zone({ wd: 'Old staining', wl: ['Ceiling'] })
    const texts = recTexts(genRecs([scoreZone(z, BLDG)], BLDG, { zones: [z], equipment: [] }))
    expect(texts.some(t => /moisture meter/i.test(t))).toBe(true)
  })

  it('an active leak raises the full cascade', () => {
    const z = zone({ wd: 'Active leak', wl: ['Ceiling'] })
    const texts = recTexts(genRecs([scoreZone(z, BLDG)], BLDG, { zones: [z], equipment: [] }))
    expect(texts.some(t => S500.test(t))).toBe(true)
    expect(texts.some(t => INSURANCE.test(t))).toBe(true)
    expect(texts.some(t => REOCCUPANCY.test(t))).toBe(true)
  })
})

describe('HVAC does not report "acceptable" over a reported deficiency', () => {
  const hvacTexts = (z: any) =>
    scoreZone(z, BLDG).cats.find((c: any) => c.l === 'HVAC').r.map((r: any) => String(r.t))

  it('weak supply airflow produces a finding, not "conditions acceptable"', () => {
    // `Weak / reduced` produced nothing AND counted toward hasAnyData, so
    // reporting the problem was strictly worse than skipping the question.
    const t = hvacTexts(zone({ sa: 'Weak / reduced' }))
    expect(t.some(x => /acceptable/i.test(x))).toBe(false)
    expect(t.some(x => /weak \/ reduced/i.test(x))).toBe(true)
  })

  it('a closed or stuck outdoor-air damper produces a finding', () => {
    expect(hvacTexts(zone({ od: 'Closed / minimum' })).some(x => /damper/i.test(x))).toBe(true)
    expect(hvacTexts(zone({ od: 'Stuck / inoperable' })).some(x => /damper/i.test(x))).toBe(true)
  })

  it('answers that record non-inspection are not evidence of acceptability', () => {
    const t = hvacTexts(zone({ fc: 'Not accessible', dp: 'Not accessible', hm: 'Unknown', sa: 'Not assessed' }))
    expect(t.some(x => /HVAC system conditions acceptable/.test(x))).toBe(false)
  })

  it('an inspected, sound system still reports acceptable', () => {
    const t = hvacTexts(zone({ fc: 'Clean / Recent', dp: 'Clean — draining', sa: 'Normal airflow' }))
    expect(t.some(x => /HVAC system conditions acceptable/.test(x))).toBe(true)
  })
})

describe('the report does not contradict its own results table', () => {
  const model = (zones: any[]) => {
    const zoneScores = zones.map(z => scoreZone(z, BLDG))
    return assembleRenderModel({ building: BLDG, zones, zoneScores, presurvey: {}, recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }) })
  }

  it('the site-mean row never reads Acceptable while a zone row reads worse', () => {
    // It was hardcoded `sev: 'ok'`. Two Elevated zones sat above a bold
    // summary row calling a 1762 ppm site mean Acceptable.
    const m = model([zone(), zone({ zn: 'Conf 4C', su: 'conference', sf: '420', oc: '12', co2: '2140' })])
    const rows = m.results.rows
    const mean = rows[rows.length - 1]
    expect(mean.id).toBe('Site mean')
    const RANK: Record<string, number> = { ok: 0, advisory: 1, elevated: 2, priority: 3, not_evaluated: -1 }
    const worstZone = Math.max(...rows.slice(0, -1).map((r: any) => RANK[r.sev] ?? -1))
    expect(RANK[mean.sev]).toBeGreaterThanOrEqual(worstZone)
  })

  it('"Most areas" is not claimed when every area is affected', () => {
    expect(buildOverallStatement({ flaggedCount: 16, elevatedZones: ['A', 'B'], totalZones: 2 }))
      .not.toMatch(/Most areas/)
    expect(buildOverallStatement({ flaggedCount: 16, elevatedZones: ['A', 'B'], totalZones: 2 }))
      .toMatch(/Every area assessed/)
  })

  it('"Most areas" survives where it is actually true', () => {
    expect(buildOverallStatement({ flaggedCount: 2, elevatedZones: ['A'], totalZones: 6 }))
      .toMatch(/Most areas/)
  })

  it('the methodology bullet does not assert an averaging period the zones contradict', () => {
    const zones = [zone({ meas_duration: '5-minute average' })]
    const zoneScores = zones.map(z => scoreZone(z, BLDG))
    const m = assembleRenderModel({ building: BLDG, zones, zoneScores, presurvey: {}, recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }) })
    const protocol = m.methodology.bullets.join(' ')
    expect(protocol).toMatch(/5-minute averages/)
    expect(protocol).not.toMatch(/grab readings/)
  })

  it('occupant interviews are not claimed when no occupant reports were recorded', () => {
    const zones = [zone({ cx: 'No complaints', sy: undefined, sr: undefined, ac: undefined, cc: undefined })]
    const zoneScores = zones.map(z => scoreZone(z, BLDG))
    const m = assembleRenderModel({ building: BLDG, zones, zoneScores, presurvey: {}, recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }) })
    expect(m.execSummary).not.toMatch(/occupant interviews|occupant reports/)
  })
})

describe('one ventilation pathway per zone, and the strongest leads', () => {
  const chainsFor = (z: any) => buildCausalChains([z], BLDG, [scoreZone(z, BLDG)])

  it('the measured chain supersedes the complaint-only hypothesis', () => {
    // The de-dup guard tested 'Ventilation Deficiency' while the complaint
    // block pushed 'Ventilation Deficiency (Hypothesis)', so both shipped.
    const chains = chainsFor(zone({ sa: 'Weak / reduced' }))
    const vent = chains.filter((c: any) => /^Ventilation Deficiency/.test(c.type))
    expect(vent).toHaveLength(1)
    expect(vent[0].type).toBe('Ventilation Deficiency')
  })

  it('the complaint-only hypothesis stands alone when nothing measured supports it', () => {
    const chains = chainsFor(zone({ co2: '', co2o: '', pm: '', tf: '', rh: '' }))
    const vent = chains.filter((c: any) => /^Ventilation Deficiency/.test(c.type))
    expect(vent.map((c: any) => c.type)).toEqual(['Ventilation Deficiency (Hypothesis)'])
  })

  it('the primary finding is the strongest chain, not chains[0]', () => {
    const weakFirst = [
      { type: 'A (Hypothesis)', zone: 'Z', confidence: 'Moderate', evidence: ['a', 'b', 'c', 'd'] },
      { type: 'B', zone: 'Z', confidence: 'Strong', evidence: ['co2'] },
    ]
    expect(pickPrimaryChain(weakFirst)?.type).toBe('B')
  })

  it('ties break on evidence, then on order, so the pick stays deterministic', () => {
    const tied = [
      { type: 'A', confidence: 'Moderate', evidence: ['x'] },
      { type: 'B', confidence: 'Moderate', evidence: ['x', 'y'] },
    ]
    expect(pickPrimaryChain(tied)?.type).toBe('B')
    expect(pickPrimaryChain([])).toBeUndefined()
  })
})

describe('report metadata', () => {
  it('credentials already in the name are not repeated', () => {
    // Printed "T. Tamakloe, CIH, CSP, CIH".
    expect(dedupeCredentials('T. Tamakloe, CIH, CSP', ['CIH'])).toBe('')
    expect(dedupeCredentials('T. Tamakloe, CIH', ['CIH', 'CSP'])).toBe('CSP')
    expect(dedupeCredentials('J. Smith', ['CIH', 'CSP'])).toBe('CIH, CSP')
    // A substring inside another token is not a match.
    expect(dedupeCredentials('Michio Tanaka', ['CIH'])).toBe('CIH')
  })

  it('the client organization resolves from the field the form actually writes', () => {
    // reportModel read `ps_recipient_org`; the question id is
    // `ps_recipient_organization` and the short key exists nowhere else, so
    // the organization could never resolve and the report fell through to the
    // recipient's personal name. Asserted on a FINAL report, which is the one
    // chrome that prints the client (see reportLifecycle.reportChrome) — the
    // report still has no transmittal block, which is tracked separately.
    const zones = [zone()]
    const zoneScores = zones.map(z => scoreZone(z, BLDG))
    const build = (presurvey: Record<string, string>) => assembleRenderModel({
      building: BLDG, zones, zoneScores, presurvey, report_status: 'final',
      recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }),
    })
    const both = build({ ps_recipient_organization: 'Ridgeline Property Group', ps_recipient_name: 'Dana Whitfield' })
    expect(both.meta.footerNote).toMatch(/prepared for Ridgeline Property Group/)
    // With no organization on file it still falls back to the person.
    const nameOnly = build({ ps_recipient_name: 'Dana Whitfield' })
    expect(nameOnly.meta.footerNote).toMatch(/prepared for Dana Whitfield/)
  })
})

describe('the survey date is reachable from the mobile walkthrough', () => {
  it('Assessment Details asks for it', () => {
    // It lived only in Q_PRESURVEY (the desktop long form), so no Quick Start
    // assessment ever had one — and with no date comfortSeason returns null,
    // so TEMPERATURE WAS NEVER EVALUATED on the mobile path while the report
    // stated the assessment date three times.
    expect(Q_DETAILS.some(q => q.id === 'ps_survey_date')).toBe(true)
  })

  it('temperature is evaluated once a date is present, and reports the gap without one', () => {
    const z = zone({ tf: '76.8' })
    const withDate = scoreZone(z, { ...BLDG, assessmentDate: '2026-07-15' })
    const noDate = scoreZone(z, BLDG)
    const gap = (s: any) => s.cats.flatMap((c: any) => c.r).some((r: any) => r.dataGap && /assessment date not recorded/.test(r.t))
    expect(gap(withDate)).toBe(false)
    expect(gap(noDate)).toBe(true)
  })

  it('Quick Start still does not ask for it — it is stamped, not prompted', () => {
    expect(Q_QUICKSTART.some(q => q.id === 'ps_survey_date')).toBe(false)
  })
})

describe('working hypotheses', () => {
  it('do not repeat one mechanism once per zone', () => {
    // The chains are built per zone, so two zones sharing a hypothesis carry
    // identical rootCause text. The list printed the sentence twice.
    const zones = [zone(), zone({ zn: 'Conf 4C', su: 'conference', sf: '420', oc: '12', co2: '2140' })]
    const zoneScores = zones.map(z => scoreZone(z, BLDG))
    const m = assembleRenderModel({
      building: BLDG, zones, zoneScores, presurvey: {},
      causalChains: buildCausalChains(zones, BLDG, zoneScores),
      recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }),
    })
    const items = m.workingHypotheses?.items || []
    expect(items.length).toBeGreaterThan(0)
    expect(new Set(items).size).toBe(items.length)
  })

  it('do not restate the primary finding, which is set out in full above them', () => {
    const zones = [zone({ sa: 'Weak / reduced' })]
    const zoneScores = zones.map(z => scoreZone(z, BLDG))
    const chains = buildCausalChains(zones, BLDG, zoneScores)
    const m = assembleRenderModel({
      building: BLDG, zones, zoneScores, presurvey: {}, causalChains: chains,
      recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }),
    })
    const primary = pickPrimaryChain(chains)
    expect(m.workingHypotheses?.items || []).not.toContain(primary.rootCause)
  })
})
