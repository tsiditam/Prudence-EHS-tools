/**
 * Dedicated tests for scoring-legacy.js (audit 2026-09, test quality):
 * evalOSHA, calcVent, evalMold, detectSBSPattern, and the genRecs rules the
 * audit named under M5 — HEPA only on a particulate finding, pressurization
 * keyed on the structured observation, one water action per zone.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { scoreZone, evalOSHA, calcVent, evalMold, detectSBSPattern, genRecs } from '../../src/engines/scoring'
import { STD } from '../../src/constants/standards.js'

const texts = (recs: any, bucket?: string) =>
  (bucket ? recs[bucket] : ['imm', 'eng', 'adm', 'mon'].flatMap((b) => recs[b]))
    .map((a: any) => (typeof a === 'string' ? a : a.text))

describe('evalOSHA — occupational flags come from the criterion registry (audit H2)', () => {
  it('flags CO above the PEL value with the averaging-period limitation, not a bare exceedance', () => {
    const r = evalOSHA({ co: '55' })
    expect(r.flag).toBe(true)
    const co = r.fl.find((f: string) => f.startsWith('CO '))
    expect(co).toBeDefined()
    expect(co).toMatch(/above the OSHA PEL of 50 ppm/)
    expect(co).toMatch(/8-hour time-weighted average/)
    expect(co).toMatch(/cannot establish compliance/)
    expect(co).not.toMatch(/above OSHA PEL threshold/)
  })

  it('does not raise the PEL flag at the PEL value or below it (registry `>`), nor on the NIOSH REL tier', () => {
    expect(evalOSHA({ co: '50' }).fl.some((f: string) => f.startsWith('CO '))).toBe(false)
    expect(evalOSHA({ co: '40' }).fl.some((f: string) => f.startsWith('CO '))).toBe(false)
  })

  it('flags formaldehyde above the PEL and the STEL tier above that', () => {
    expect(evalOSHA({ hc: '1.0' }).fl.find((f: string) => f.startsWith('Formaldehyde'))).toMatch(/OSHA PEL of 0.75 ppm/)
    expect(evalOSHA({ hc: '2.5' }).fl.find((f: string) => f.startsWith('Formaldehyde'))).toMatch(/OSHA STEL of 2 ppm/)
    expect(evalOSHA({ hc: '0.6' }).fl.some((f: string) => f.startsWith('Formaldehyde'))).toBe(false)
  })

  it('reads numbers through the one parser — a non-numeric reading flags nothing and counts as no instrument data', () => {
    const r = evalOSHA({ co: 'abc', co2: '>5000', tf: '' })
    expect(r.fl).toEqual([])
    expect(r.gaps).toContain('No instrument data')
    expect(evalOSHA({ co: '1,000' }).fl.some((f: string) => f.startsWith('CO '))).toBe(true)
  })

  it('CO₂ above the concern indicator is a ventilation flag', () => {
    expect(evalOSHA({ co2: '1200' }).fl).toContain('Ventilation-related concern pattern')
    expect(evalOSHA({ co2: '1000' }).fl).toEqual([])
  })

  it('complaints are a flag only alongside a measured indicator', () => {
    expect(evalOSHA({ cx: 'Yes — complaints reported' }).fl).toEqual([])
    expect(evalOSHA({ cx: 'Yes — complaints reported', co2: '1200' }).fl[0]).toBe('Documented complaint pattern with concurrent hazard indicators')
  })

  it('widespread symptom pattern requires resolution-away AND a large affected count', () => {
    expect(evalOSHA({ sr: 'Yes — clear pattern', ac: '6-10' }).fl).toContain('Building-related symptom pattern — widespread')
    expect(evalOSHA({ sr: 'Yes — clear pattern', ac: '1-2' }).fl).toEqual([])
  })
})

describe('calcVent — ASHRAE 62.1 ventilation-rate procedure', () => {
  it('returns null for missing inputs or an unknown space use', () => {
    expect(calcVent(undefined, 500, 10)).toBeNull()
    expect(calcVent('office', 0, 10)).toBeNull()
    expect(calcVent('office', 500, 0)).toBeNull()
    expect(calcVent('spaceship', 500, 10)).toBeNull()
  })

  it('sums the people and area components from STD.v.oa', () => {
    const r = calcVent('office', 1000, 20)
    expect(r.pOA).toBe(STD.v.oa.office.pp * 20)
    expect(r.aOA).toBe(STD.v.oa.office.ps * 1000)
    expect(r.tot).toBe(r.pOA + r.aOA)
    expect(r.pp).toBe(r.tot / 20)
    expect(r.ref).toBe(STD.v.ref)
  })

  it('enclosed parking has no per-person component — a genuine zero, not a missing value', () => {
    const r = calcVent('parking', 1000, 4)
    expect(r.pOA).toBe(0)
    expect(r.aOA).toBe(STD.v.oa.parking.ps * 1000)
  })
})

describe('evalMold', () => {
  it('returns null with no indicator', () => {
    expect(evalMold({})).toBeNull()
    expect(evalMold({ mi: 'None' })).toBeNull()
  })
  it('Condition 3 for every growth option, with the EPA extent band and the visual caveat', () => {
    const r = evalMold({ mi: 'Moderate (10-100 sq ft)', mia: '40' })
    expect(r.condition).toBe(3)
    expect(r.label).toBe('IICRC S520 Condition 3 (actual growth)')
    expect(r.extent).toBe('10–100 ft²')
    expect(r.sqft).toBe(40)
    expect(r.caveat).toMatch(/Visual observation only/)
  })
  it('parses the area through the one parser', () => {
    expect(evalMold({ mi: 'Small (< 10 sq ft)', mia: '1,200' }).sqft).toBe(1200)
    expect(evalMold({ mi: 'Small (< 10 sq ft)', mia: 'lots' }).sqft).toBeNull()
  })
})

describe('detectSBSPattern', () => {
  it('needs two independent signals', () => {
    expect(detectSBSPattern({})).toBe(false)
    expect(detectSBSPattern({ sr: 'Yes — clear pattern' })).toBe(false)
    expect(detectSBSPattern({ sr: 'Yes — clear pattern', cc: 'Yes — this zone' })).toBe(true)
    expect(detectSBSPattern({ cx: 'Yes — complaints reported', ac: '3-5', sy: ['Headache', 'Fatigue'] })).toBe(true)
  })
  it('does not count a 1–2 occupant complaint as a spread signal', () => {
    expect(detectSBSPattern({ cx: 'Yes — complaints reported', ac: '1-2', sy: ['Headache'] })).toBe(false)
  })
})

describe('genRecs — recommendations state only what was observed (audit M5)', () => {
  const CLUSTER = { zn: 'Z', su: 'office', cx: 'Yes — complaints reported', sr: 'Yes — clear pattern', ac: 'More than 10', sy: ['Headache', 'Fatigue'], pm: '5', co: '2' }
  const BLDG = { hm: 'Within 6 months', assessmentDate: '2026-07-15' }

  it('offers portable HEPA units only when a particulate finding exists', () => {
    const noPm = genRecs([scoreZone(CLUSTER, BLDG)], BLDG, { zones: [CLUSTER] })
    expect(texts(noPm).some((t: string) => /portable HEPA/.test(t))).toBe(false)
    // The relocation action for a symptom cluster is unaffected.
    expect(texts(noPm, 'adm').some((t: string) => /temporary relocation/.test(t))).toBe(true)

    const withPm = { ...CLUSTER, pm: '40' }
    const recs = genRecs([scoreZone(withPm, BLDG)], BLDG, { zones: [withPm] })
    expect(texts(recs, 'imm').some((t: string) => /portable HEPA/.test(t))).toBe(true)
  })

  it('keys the pressurization remedy on the structured zone observation, never on the word "negative" in a finding', () => {
    const neg = { zn: 'Z', su: 'office', path_pressure: 'Negative (draws in)', pm: '5', co: '2' }
    const recs = genRecs([scoreZone(neg, BLDG)], BLDG, { zones: [neg] })
    expect(texts(recs, 'eng').some((t: string) => /Correct building pressurization/.test(t))).toBe(true)

    const notNeg = { zn: 'Z', su: 'office', path_pressure: 'Positive (pushes out)', pm: '5', co: '2' }
    expect(texts(genRecs([scoreZone(notNeg, BLDG)], BLDG, { zones: [notNeg] })).some((t: string) => /Correct building pressurization/.test(t))).toBe(false)

    // A finding whose TEXT says "negative" must not trigger it.
    const zs = scoreZone(notNeg, BLDG)
    zs.cats[0].r.push({ t: 'Context: pharmacy operates under negative pressure for hazardous compounding', sev: 'info' })
    expect(texts(genRecs([zs], BLDG, { zones: [notNeg] })).some((t: string) => /Correct building pressurization/.test(t))).toBe(false)
  })

  it('also honours the pressurization module\'s own zonesNegative list', () => {
    const z = { zn: 'Lobby', su: 'office', pm: '5', co: '2' }
    const recs = genRecs([scoreZone(z, BLDG)], BLDG, { zones: [z], pressurization: { zonesNegative: ['Lobby'] } })
    expect(texts(recs, 'eng').some((t: string) => /Correct building pressurization/.test(t))).toBe(true)
  })

  it('emits ONE immediate water action per zone for extensive water damage', () => {
    const z = { zn: 'Z', su: 'office', wd: 'Extensive damage', pm: '5', co: '2' }
    const imm = texts(genRecs([scoreZone(z, BLDG)], BLDG, { zones: [z] }), 'imm').filter((t: string) => /water intrusion/i.test(t))
    expect(imm).toHaveLength(1)
    expect(imm[0]).toMatch(/IICRC S500/)
  })

  it('a drain pan holding water gets the two drain-pan actions and no water-intrusion action', () => {
    const z = { zn: 'Z', su: 'office', dp: 'Standing water', pm: '5', co: '2' }
    const recs = genRecs([scoreZone(z, BLDG)], BLDG, { zones: [z] })
    const all = texts(recs)
    expect(all.some((t: string) => /Address drain pan condition immediately/.test(t))).toBe(true)
    expect(all.some((t: string) => /Clean the drain pan/.test(t))).toBe(true)
    expect(all.some((t: string) => /water intrusion/i.test(t))).toBe(false)
  })
})
