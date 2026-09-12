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
    // The summary is now a structured block (paragraphs + leading findings +
    // first actions) rather than one string, so the method sentence is read
    // out of its paragraphs.
    expect(m.execSummary.paragraphs.join(' ')).not.toMatch(/occupant interviews|occupant reports/)
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
    const gap = (s: any) => s.cats.flatMap((c: any) => c.r).some((r: any) => r.dataGap && /no survey date on record/.test(r.t))
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

describe('the deliverable names who it is for, and what measured what', () => {
  const build = (presurvey: Record<string, unknown>, zoneOver: Record<string, unknown> = {}) => {
    const zones = [zone(zoneOver)]
    const zoneScores = zones.map(z => scoreZone(z, BLDG))
    return assembleRenderModel({
      building: BLDG, zones, zoneScores, presurvey,
      recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }),
    })
  }

  it('renders an addressee block from the Client / Recipient intake', () => {
    // The client appeared in exactly one place — the footer of a FINAL report
    // — so every draft was a consultant report addressed to nobody, and the
    // address lines had no consumer in this deliverable at all.
    const m = build({
      ps_recipient_name: 'Dana Whitfield', ps_recipient_title: 'Director of Facilities',
      ps_recipient_organization: 'Ridgeline Property Group',
      ps_recipient_address1: '400 Kestrel Way', ps_recipient_city: 'Columbus',
      ps_recipient_state: 'OH', ps_recipient_zip: '43215',
    })
    expect(m.recipient.lines).toEqual([
      'Dana Whitfield, Director of Facilities',
      'Ridgeline Property Group',
      '400 Kestrel Way',
      'Columbus, OH 43215',
    ])
    expect(m.meta.coverRows).toContainEqual(['Prepared for', 'Ridgeline Property Group'])
    expect(m.meta.coverRows).toContainEqual(['Attention', 'Dana Whitfield, Director of Facilities'])
  })

  it('omits the block, and the cover rows, when no recipient was entered', () => {
    const m = build({})
    expect(m.recipient).toBeNull()
    expect(m.meta.coverRows.map((r: string[]) => r[0])).not.toContain('Prepared for')
  })

  it('uses the firm project number as the Report ID when one was entered', () => {
    // Assessment Details collected ps_project_number and no consumer in this
    // deliverable read it — it reached only the removed consultant report.
    expect(build({ ps_project_number: 'PSEC-2026-0188' }).meta.coverRows)
      .toContainEqual(['Report ID', 'PSEC-2026-0188'])
  })

  it('keeps the record id when there is no project number, so an issued ID never changes', () => {
    const zones = [zone()]
    const zoneScores = zones.map(z => scoreZone(z, BLDG))
    const m = assembleRenderModel({
      id: 'rpt-123', building: BLDG, zones, zoneScores, presurvey: {},
      recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }),
    })
    expect(m.meta.coverRows).toContainEqual(['Report ID', 'rpt-123'])
  })

  it('does not attribute TVOC and formaldehyde to a meter that cannot measure them', () => {
    // QA/QC listed only the primary IAQ meter, beside a formaldehyde finding
    // against the NIOSH REL and a full TVOC section.
    const m = build({ ps_inst_iaq: 'TSI Q-Trak 7575' }, { tv: '850', hc: '0.03' })
    const qa = m.qaQc.join(' | ')
    expect(qa).toMatch(/VOC \/ PID meter: TVOC readings were recorded; no PID is documented/)
    expect(qa).toMatch(/Formaldehyde meter: Formaldehyde readings were recorded; no instrument/)
    expect(m.limitations.join(' ')).toMatch(/no instrument for them is documented/)
  })

  it('names the PID when one is on record, and raises no limitation', () => {
    const m = build({ ps_inst_iaq: 'TSI Q-Trak 7575', ps_inst_pid: 'MiniRAE 3000', ps_inst_pid_cal: 'Bump-tested and calibrated' }, { tv: '850' })
    expect(m.qaQc.join(' | ')).toMatch(/VOC \/ PID meter: MiniRAE 3000 \(Bump-tested and calibrated\)/)
    expect(m.limitations.join(' ')).not.toMatch(/no instrument/)
  })

  it('says nothing about a PID when no VOC reading was taken', () => {
    const m = build({ ps_inst_iaq: 'TSI Q-Trak 7575' }, { tv: '', hc: '' })
    expect(m.qaQc.join(' | ')).not.toMatch(/PID/)
  })

  it('reports each finding’s own basis rather than the zone’s confidence', () => {
    // The column printed one zone-level value on every row of that zone.
    const m = build({})
    const rows = m.findings.rows
    const bases = new Set(rows.map((r: any) => r.basis))
    expect([...bases].every(b => ['Measured', 'Observed', 'Qualitative'].includes(b as string))).toBe(true)
    // This fixture has both an instrument finding (CO2) and an observation
    // finding (the complaint rows), so the column must not be uniform.
    expect(bases.size).toBeGreaterThan(1)
    expect(rows.find((r: any) => /CO₂/.test(r.f))?.basis).toBe('Measured')
    expect(rows.find((r: any) => /occupants reporting symptoms/.test(r.f))?.basis).toBe('Observed')
  })
})

describe('report structure follows the CIH-reviewed order', () => {
  const zones = () => [
    zone({ wd: 'Old staining', wl: ['Ceiling'], tc: 'Slightly warm', znt: 'Diffusers read low by anemometer.' }),
    zone({ zn: 'Conf 4C', su: 'conference', sf: '420', oc: '12', co2: '2140', wd: 'None', mi: 'None', op: 'None' }),
  ]
  const model = (over: Record<string, unknown> = {}) => {
    const zs = zones()
    const bldg = { ...BLDG, sa: 'Weak / reduced', od: 'Closed / minimum', ...(over.building as object || {}) }
    const zoneScores = zs.map(z => scoreZone(z, bldg))
    return assembleRenderModel({
      building: bldg, zones: zs, zoneScores, presurvey: {},
      recs: genRecs(zoneScores, bldg, { zones: zs, equipment: [] }),
      causalChains: buildCausalChains(zs, bldg, zoneScores),
      ...over,
    })
  }

  it('recounts the walkthrough before the measurements, without restating verdicts', () => {
    // The reviewer's top item: staining, weak airflow and symptom reports
    // reached the reader only as findings, so the document went from methods
    // straight to numbers with no account of the walkthrough.
    const obs = model().observations
    expect(obs).toBeTruthy()
    expect(obs.building).toContainEqual(['Supply air delivery', 'Weak / reduced'])
    expect(obs.building).toContainEqual(['Outdoor air damper', 'Closed / minimum'])
    const z1 = obs.zones[0]
    expect(z1.observed.join(' ')).toMatch(/old staining/i)
    expect(z1.occupantReports.join(' ')).toMatch(/occupants reporting symptoms/i)
    expect(z1.notes).toMatch(/anemometer/)
    // Observations are an account, not a conclusion: no severity words, no
    // citations. A reader must be able to tell them apart from findings.
    const all = [...z1.observed, ...z1.occupantReports].join(' ')
    expect(all).not.toMatch(/ASHRAE|NIOSH|Priority|Elevated|Advisory|inadequate/i)
  })

  it('omits the section rather than printing an empty one', () => {
    const zs = [{ zn: 'Bare', su: 'office', sf: '100', oc: '1' }]
    const zoneScores = zs.map(z => scoreZone(z, {}))
    const m = assembleRenderModel({ building: {}, zones: zs, zoneScores, presurvey: {}, recs: {} })
    expect(m.observations).toBeNull()
  })

  it('states the conclusion and the leading findings, not a count', () => {
    const es = model().execSummary
    // Was "The leading explanation is X — moderate confidence on the evidence
    // gathered". The confidence clause was the report's only certainty rating
    // on a causal claim, in its opening paragraph, over a methodology the
    // document never states.
    expect(es.paragraphs.join(' ')).toMatch(/is the leading working hypothesis on the observations available/)
    expect(es.paragraphs.join(' ')).toMatch(/No causal relationship has been established/)
    expect(es.paragraphs.join(' ')).not.toMatch(/confidence on the evidence gathered/)
    expect(es.paragraphs.join(' ')).not.toMatch(/flagged \d+ item/)
    expect(es.findings.length).toBeGreaterThan(0)
    expect(es.findings.length).toBeLessThanOrEqual(4)
    // Trimmed to the claim: the full CO2 finding runs to three sentences of
    // methodological caveat, which belongs in the findings table.
    for (const f of es.findings) expect(f.length).toBeLessThan(140)
  })

  it('gives one action register with location and control tier', () => {
    const reg = model().recommendations.register
    expect(reg.length).toBeGreaterThan(0)
    for (const r of reg) {
      expect(['Immediate', 'Short term', 'Medium term', 'Ongoing']).toContain(r.priority)
      expect(r.location).toBeTruthy()
      expect(r.action).toBeTruthy()
      // The unmapped-equipment caveat is a fact about location, and must not
      // lead the action text — it buried the action on every such row.
      expect(r.action).not.toMatch(/^No HVAC unit is mapped/)
    }
    expect(reg.some(r => /no HVAC unit mapped/i.test(r.location))).toBe(true)
    // Owner is a ROLE derived from the control tier; the named person and
    // the date are still the client's to assign, and the note says so.
    expect(model().recommendations.registerNote).toMatch(/client assigns named individuals and target dates/)
  })

  it('drops the conceptual site model on a single-pathway survey, keeps it when pathways compete', () => {
    // "Optional for a two-zone screening report; include it only when it adds
    // clarity beyond the findings." It answers which of several pathways is
    // leading, so it earns its place only when there is more than one.
    const one = assembleRenderModel({
      building: BLDG, zones: [zone()], zoneScores: [scoreZone(zone(), BLDG)], presurvey: {}, recs: {},
      causalChains: [{ type: 'Ventilation Deficiency', zone: 'Z', confidence: 'Strong', evidence: ['co2'] }],
    })
    expect(one.conceptualModel).toBeNull()
    expect(model().conceptualModel).toBeTruthy()
  })

  it('carries no promotional appendix', () => {
    // Removed on CIH review; attribution moved to the page footer.
    expect(model().about).toBeUndefined()
  })
})

describe('what a reviewer of the rendered report could not see', () => {
  // A CIH-grade review done from the RENDERED report (not the data)
  // re-derived the outdoor baseline from the CO2 differential and then
  // flagged its own derivation as unverified; stripped credentials that were
  // on record; and could not tell which limitations were real. Each of
  // these is the report failing to show something the record held.
  const build = (zoneOver: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const zones = [zone(zoneOver)]
    const zoneScores = zones.map(z => scoreZone(z, BLDG))
    return assembleRenderModel({
      building: BLDG, zones, zoneScores, presurvey: {},
      recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }), ...extra,
    })
  }

  it('prints the outdoor baseline beside the zones it is compared against', () => {
    const rows = build().results.rows
    const od = rows.find((r: any) => r.id === 'Outdoor reference')
    expect(od).toBeTruthy()
    expect(od.co2).toBe(430)
    expect(od.pm).toBe(9)
    // A reference, never a verdict.
    expect(od.sev).toBe('reference')
    // …and it sits before the site mean, which stays last.
    expect(rows[rows.length - 1].id).toBe('Site mean')
    expect(rows.indexOf(od)).toBe(rows.length - 2)
  })

  it('omits the outdoor row when nothing outdoor was recorded', () => {
    const rows = build({ co2o: '', pmo: '' }).results.rows
    expect(rows.some((r: any) => r.id === 'Outdoor reference')).toBe(false)
  })

  it('numbers citations so a finding resolves to its appendix entry', () => {
    const m = build()
    const cited = m.findings.rows.filter((r: any) => r.cite)
    expect(cited.length).toBeGreaterThan(0)
    for (const r of cited) {
      const n = Number(r.cite.replace(/[[\]]/g, ''))
      // The number is the fourth element; the name stays the exact criterion
      // string so cross-layer-consistency can match it against findings.
      expect(m.references[n - 1][3]).toBe(n)
    }
    // The CO2 finding cites the ASHRAE position document; the number on the
    // row must be the number on that appendix entry.
    const co2 = m.findings.rows.find((r: any) => /CO₂ 1385/.test(r.f))
    const n = Number(co2.cite.replace(/[[\]]/g, ''))
    expect(m.references[n - 1][0]).toMatch(/ASHRAE Position Document/)
  })

  it('proposes an owner ROLE and completion evidence for every action, and invents no person or date', () => {
    const reg = build().recommendations.register
    for (const r of reg) {
      expect(['Facilities', 'Facilities / HVAC contractor', 'Facilities / assessor', 'Assessor']).toContain(r.owner)
      expect(r.evidence).toBeTruthy()
      expect(r).not.toHaveProperty('deadline')
      expect(r).not.toHaveProperty('assignee')
    }
    expect(build().recommendations.registerNote).toMatch(/client assigns named individuals and target dates/)
  })

  it('derives limitations from what the record shows was not done', () => {
    const lim = build().limitations.join(' ')
    expect(lim).toMatch(/No quantified ventilation-rate measurement/)
    expect(lim).toMatch(/No full-shift or personal exposure sampling/)
    expect(lim).toMatch(/No photographs are included/)
    expect(lim).toMatch(/apply to the 1 area assessed/)
    // …and each disappears when the record says otherwise.
    const withVent = build({ cfm_person: '18' }).limitations.join(' ')
    expect(withVent).not.toMatch(/No quantified ventilation-rate measurement/)
    const withPhoto = build({}, { photos: { 'z0-wd': [{ imageDataUrl: 'data:image/png;base64,AAAA' }] } }).limitations.join(' ')
    expect(withPhoto).not.toMatch(/No photographs are included/)
  })
})
