/**
 * Audit 2026-09 — engine-logic pins for H1, H4, H7, M7, M8, M10 and the
 * "Low" items. Each block names the finding it closes and asserts the
 * resulting severity or finding, not merely that nothing threw.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { scoreZone, readNumber, isEntered } from '../../src/engines/scoring'
// @ts-expect-error — JS module without TS types
import { generateSamplingPlan } from '../../src/engines/sampling'
// @ts-expect-error — JS module without TS types
import { evaluateMoisture } from '../../src/engines/mold/moistureIndicators.js'
// @ts-expect-error — JS module without TS types
import { MOISTURE_INDICATORS, MOLD_SOURCES } from '../../src/constants/moldStandards.js'
// @ts-expect-error — JS module without TS types
import { paramReference } from '../../src/utils/sensorThresholds'
import { allCriteria } from '../../src/constants/criteria.js'
import { STD } from '../../src/constants/standards.js'

const D = { assessmentDate: '2026-07-15', hm: 'Within 6 months' }
const cat = (zone: Record<string, unknown>, name: string, bldg: Record<string, unknown> = D) =>
  scoreZone({ zn: 'Z', su: 'office', ...zone }, bldg).cats.find((c: any) => c.l === name)
const findings = (zone: Record<string, unknown>, name: string, bldg?: Record<string, unknown>) => cat(zone, name, bldg).r as any[]

// ── H1 ────────────────────────────────────────────────────────────────
describe('H1 — one numeric parser, and a garbage reading is a data gap, never a pass', () => {
  it('readNumber accepts numbers and numeric strings with thousands separators', () => {
    expect(readNumber(1180)).toBe(1180)
    expect(readNumber('1180')).toBe(1180)
    expect(readNumber('1,180')).toBe(1180)
    expect(readNumber(' 45.5 ')).toBe(45.5)
    expect(readNumber('-3')).toBe(-3)
    expect(readNumber('0')).toBe(0)
    expect(readNumber('.5')).toBe(0.5)
  })
  it('readNumber rejects everything else as null', () => {
    for (const raw of ['<5', '>x', 'abc', '', '   ', undefined, null, NaN, Infinity, true, {}, '1,18', '5 ppm', '1e3'])
      expect(readNumber(raw as never), String(raw)).toBeNull()
  })
  it('isEntered distinguishes "not captured" from "captured but unreadable"', () => {
    expect(isEntered('')).toBe(false); expect(isEntered('  ')).toBe(false); expect(isEntered(undefined)).toBe(false)
    expect(isEntered('abc')).toBe(true); expect(isEntered(0)).toBe(true)
  })

  const GARBAGE: Array<[string, string, string]> = [
    ['co2', 'Ventilation', 'co2'], ['cfm_person', 'Ventilation', 'cfm_person'], ['ach', 'Ventilation', 'ach'],
    ['pm', 'Contaminants', 'pm25'], ['co', 'Contaminants', 'co'], ['hc', 'Contaminants', 'hcho'],
    ['tf', 'Environment', 'temperature'], ['rh', 'Environment', 'rh'],
  ]
  for (const [field, category, p] of GARBAGE) {
    it(`${field} = 'abc' → a Data Gap finding for ${p}, no pass, no echo of the text`, () => {
      const r = findings({ [field]: 'abc' }, category)
      const gap = r.filter((f) => f.dataGap && f.p === p)
      expect(gap).toHaveLength(1)
      expect(gap[0].sev).toBe('info')
      expect(gap[0].t).toMatch(/entered but not numeric — Data Gap/)
      expect(r.some((f) => f.p === p && f.sev === 'pass')).toBe(false)
      expect(r.every((f) => !String(f.t).includes('abc'))).toBe(true)
    })
  }

  it('"<5" for CO is a data gap, not a 5 ppm reading and not a pass', () => {
    const r = findings({ co: '<5', pm: '5' }, 'Contaminants')
    expect(r.find((f) => f.p === 'co')?.dataGap).toBe(true)
    expect(r.some((f) => f.p === 'co' && f.sev === 'pass')).toBe(false)
  })

  it('"1,180" for CO₂ reads as 1180 and produces the high ventilation finding', () => {
    const r = findings({ co2: '1,180' }, 'Ventilation')
    const co2 = r.find((f) => f.p === 'co2')
    expect(co2.sev).toBe('high')
    expect(co2.t).toContain('CO₂ 1180 ppm')
  })

  it('an empty field keeps the "not captured" behaviour (no data-gap finding)', () => {
    expect(findings({ co2: '', tf: '', rh: '' }, 'Ventilation').some((f) => f.dataGap)).toBe(false)
    expect(findings({ co2: '', tf: '', rh: '' }, 'Environment').some((f) => f.dataGap)).toBe(false)
  })

  it('a data gap caps confidence at Medium, like any other gap in the record', () => {
    const full = { zn: 'Z', su: 'office', tf: '74', rh: '45', pm: '5', co: '2', tv: '100', hc: '0.01', vd: 'None', co2: '600', cfm_person: '20', ach: '6', sa: 'Normal', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean', assessmentDate: '2026-07-15' }
    expect(scoreZone(full, bldg).confidence).toBe('High')
    expect(scoreZone({ ...full, pm: 'n/a' }, bldg).confidence).toBe('Medium')
  })
})

// ── H4 ────────────────────────────────────────────────────────────────
describe('H4 — CO₂ is evaluated whether or not airflow was measured', () => {
  it('3,000 ppm beside a cfm/person figure is a high finding, not an info line', () => {
    const r = findings({ co2: '3000', cfm_person: '20' }, 'Ventilation')
    const co2 = r.find((f) => f.p === 'co2')
    expect(co2.sev).toBe('high')
    expect(co2.cid).toBe('co2_action')
    expect(co2.t).toMatch(/severely elevated/)
    expect(r.some((f) => /confirmatory ventilation indicator/.test(f.t))).toBe(false)
    // The airflow finding is additional, not replaced.
    expect(r.some((f) => /OA delivery 20 cfm\/person/.test(f.t))).toBe(true)
  })
  it('3,000 ppm beside ACH is likewise high', () => {
    expect(findings({ co2: '3000', ach: '6' }, 'Ventilation').find((f) => f.p === 'co2').sev).toBe('high')
  })
  it('a within-range CO₂ beside airflow is a pass, and the CO₂-only confidence note is not added', () => {
    const r = findings({ co2: '600', cfm_person: '20' }, 'Ventilation')
    expect(r.find((f) => f.p === 'co2').sev).toBe('pass')
    expect(r.some((f) => /assessed from CO₂ only/.test(f.t))).toBe(false)
    expect(findings({ co2: '600' }, 'Ventilation').some((f) => /assessed from CO₂ only/.test(f.t))).toBe(true)
  })
  it('the no-outdoor-baseline tier fires: 900 ppm with no outdoor reading is low, with a measured Δ>500 it is medium', () => {
    const noOutdoor = findings({ co2: '900' }, 'Ventilation').find((f) => f.p === 'co2')
    expect(noOutdoor.sev).toBe('low')
    expect(noOutdoor.t).toMatch(/no outdoor baseline for differential/)
    const withOutdoor = findings({ co2: '950', co2o: '400' }, 'Ventilation').find((f) => f.p === 'co2')
    expect(withOutdoor.sev).toBe('medium')
    expect(withOutdoor.t).toMatch(/Δ550 ppm above outdoor 400/)
    const withSmallDelta = findings({ co2: '900', co2o: '450' }, 'Ventilation').find((f) => f.p === 'co2')
    expect(withSmallDelta.sev).toBe('pass')
  })
})

// ── M7 ────────────────────────────────────────────────────────────────
describe('M7 — meeting the ASHRAE 62.1 minimum exactly is compliant', () => {
  it('cfm/person equal to the requirement is a pass, one below is high, half is critical', () => {
    const req = STD.v.oa.office.pp
    const at = findings({ cfm_person: String(req) }, 'Ventilation').find((f) => /OA delivery/.test(f.t))
    expect(at.sev).toBe('pass')
    expect(at.t).toMatch(/meets the ASHRAE 62.1 minimum/)
    expect(findings({ cfm_person: String(req - 1) }, 'Ventilation').find((f) => /OA delivery/.test(f.t)).sev).toBe('high')
    expect(findings({ cfm_person: String(req / 2 - 0.1) }, 'Ventilation').find((f) => /OA delivery/.test(f.t)).sev).toBe('critical')
  })
  it('ACH equal to the minimum is a pass', () => {
    const at = findings({ ach: '4' }, 'Ventilation').find((f) => /^ACH/.test(f.t))
    expect(at.sev).toBe('pass')
    expect(findings({ ach: '3.9' }, 'Ventilation').find((f) => /^ACH/.test(f.t)).sev).toBe('high')
    expect(findings({ ach: '6' }, 'Ventilation', { ...D, su: 'healthcare' }).find((f) => /^ACH/.test(f.t)).sev).toBe('pass')
  })
})

// ── Low ───────────────────────────────────────────────────────────────
describe('Low — defaults that changed a conclusion', () => {
  it('enclosed parking (pp = 0) is not treated as a 5 cfm/person office', () => {
    const r = findings({ su: 'parking', cfm_person: '0' }, 'Ventilation').find((f) => /OA delivery/.test(f.t))
    expect(r.sev).toBe('pass')
    expect(r.t).toContain('minimum (0)')
    // An unknown space use still defaults to the office rate.
    expect(findings({ su: 'unknown_use', cfm_person: '4' }, 'Ventilation').find((f) => /OA delivery/.test(f.t)).t).toContain('minimum (5)')
  })
  it('a blank or Unknown affected count does not read as "1–2 occupants"', () => {
    for (const ac of [undefined, '', 'Unknown']) {
      const r = findings({ cx: 'Yes — complaints reported', ac }, 'Complaints')[0]
      expect(r.t).toMatch(/number of affected occupants not captured/)
      expect(r.t).not.toMatch(/1–2 occupants/)
      expect(r.sev).toBe('medium')
      expect(r.dataGap).toBe(true)
    }
    expect(findings({ cx: 'Yes — complaints reported', ac: '1-2' }, 'Complaints')[0].t).toBe('1–2 occupants reporting symptoms')
  })
  it('RH beyond 70% / below 20% is medium — the cap, with no dead high tier behind it', () => {
    for (const rh of ['75', '85', '15', '5']) {
      const r = findings({ rh, tf: '74' }, 'Environment').find((f) => f.p === 'rh')
      expect(r.sev).toBe('medium')
    }
  })
})

// ── H7 / M8 ───────────────────────────────────────────────────────────
describe('H7 — drywall moisture is qualitative only', () => {
  it('no numeric gypsum reading flags elevated, whatever the meter shows', () => {
    for (const value of [1, 15, 40, 99]) {
      const m = evaluateMoisture({ material: 'drywall', value })
      expect(m.elevated).toBe(false)
      expect(m.threshold).toBeNull()
      expect(m.value).toBe(value)
      expect(m.note).toMatch(/no published numeric threshold/i)
    }
    expect(MOISTURE_INDICATORS.drywall.qualitativeOnly).toBe(true)
    expect(MOISTURE_INDICATORS.drywall.elevatedAtOrAbovePct).toBeNull()
  })
  it('wood and concrete still compare numerically', () => {
    expect(evaluateMoisture({ material: 'wood', value: 16 }).elevated).toBe(true)
    expect(evaluateMoisture({ material: 'wood', value: 15.9 }).elevated).toBe(false)
    expect(evaluateMoisture({ material: 'concrete', value: 75 }).elevated).toBe(true)
    expect(evaluateMoisture({ material: 'concrete', value: 70 }).elevated).toBe(false)
  })
})

describe('M8 — one wood-moisture figure, correctly attributed', () => {
  it('wood is 16% MC from IICRC S500; the sampling plan reads the same constant', () => {
    expect(MOISTURE_INDICATORS.wood.elevatedAtOrAbovePct).toBe(16)
    expect(MOISTURE_INDICATORS.wood.source).toBe(MOLD_SOURCES.s500)
    expect(MOLD_SOURCES.s500).toMatch(/IICRC S500/)
    const { plan } = generateSamplingPlan([{ zn: 'Z', wd: 'Active leak' }], {})
    const moisture = plan.find((p: any) => p.type === 'Moisture / Bioaerosol')
    expect(moisture.method).toContain('16% MC')
    expect(moisture.method).toContain('IICRC S500')
    expect(moisture.method).not.toContain('19%')
  })
  it('gypsum and the 75% in-slab RH figure are not attributed to EPA (2008)', () => {
    expect(MOISTURE_INDICATORS.drywall.source).toBeNull()
    expect(MOISTURE_INDICATORS.concrete.source).toBe(MOLD_SOURCES.astmF2170)
    expect(MOLD_SOURCES.astmF2170).toMatch(/ASTM F2170/)
    for (const key of ['wood', 'drywall', 'concrete'] as const) {
      expect(MOISTURE_INDICATORS[key].source).not.toBe(MOLD_SOURCES.epaMold)
    }
  })
  it('sampling readings go through the one parser', () => {
    const { plan } = generateSamplingPlan([{ zn: 'Z', co: 'abc', hc: '<0.1' }], {})
    expect(plan.some((p: any) => p.type === 'Combustion Gas' || p.type === 'Formaldehyde')).toBe(false)
    const { plan: ok } = generateSamplingPlan([{ zn: 'Z', co: '1,000' }], {})
    expect(ok.find((p: any) => p.type === 'Combustion Gas').priority).toBe('critical')
  })
})

// ── M10 ───────────────────────────────────────────────────────────────
describe('M10 — the 1,500 ppm CO₂ criterion has its own label', () => {
  it('does not cite the 1,000 ppm indicator as its source', () => {
    const action = allCriteria().find((c) => c.id === 'co2_action') as any
    const concern = allCriteria().find((c) => c.id === 'co2_concern') as any
    expect(action.value).toBe(1500)
    expect(action.source).not.toBe(concern.source)
    expect(action.source).toMatch(/1,500 ppm/)
    expect(action.source).not.toMatch(/^NIOSH indoor-ventilation indicator \(~1,000 ppm\)/)
    expect(action.source).toMatch(/not a published limit/i)
  })
})

// ── H5 (Logger card) ──────────────────────────────────────────────────
describe('H5 — the Logger card season is the engine\'s comfortSeason', () => {
  it('draws the winter band for January and the summer band for July', () => {
    expect(paramReference('temp', { unit: '°F', ts: Date.UTC(2026, 0, 15) }).band).toEqual({ min: STD.t.temp.winter.min, max: STD.t.temp.winter.max })
    expect(paramReference('temp', { unit: '°F', ts: Date.UTC(2026, 6, 15) }).band).toEqual({ min: STD.t.temp.summer.min, max: STD.t.temp.summer.max })
  })
  it('draws NO band without a timestamp instead of defaulting to summer', () => {
    const r = paramReference('temp', { unit: '°F' })
    expect(r.band).toBeNull()
    expect(r.refs[0]).toMatch(/no timestamp to select the season/)
    expect(r.note).toMatch(/seasonal/)
  })
})
