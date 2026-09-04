// @vitest-environment node
/**
 * buildReportModel — the deterministic Report Model compiler. Verifies it
 * composes raw assessment data into the fixed report schema, derives
 * threshold-based parameter outcomes, and reads engine findings/recs without
 * inventing data.
 */
import { describe, it, expect } from 'vitest'
import {
  buildReportModel, summarizeParameters, zoneRows, peakCo2ByZone,
  collectFindings, recommendationsByTimeframe, buildQaQc, buildLimitations,
} from '../../src/report/reportModel'
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
import { DEMO_FINDINGS_BUILDING as DEMO_BUILDING, DEMO_FINDINGS_ZONES as DEMO_ZONES, DEMO_FINDINGS_PRESURVEY as DEMO_PRESURVEY } from '../../src/constants/demoDataFindings'

const Z = [
  { zn: 'Open Office', co2: '760', tf: '72', rh: '45', pm: '8', co: '0.4', tv: '210' },
  { zn: 'Conf 8-D', co2: '1247', tf: '75', rh: '52', pm: '14', co: '0.7', tv: '520' },
]

describe('summarizeParameters', () => {
  it('computes range/mean and threshold outcome per measured parameter', () => {
    const p = summarizeParameters(Z)
    expect(p.co2.range).toBe('760–1247')
    expect(p.co2.outcome).toBe('elevated')      // max >= 1000
    expect(p.co.outcome).toBe('acceptable')      // < 9 ppm
    // Not 'advisory' (520 >= Mølhave's 500) and pointedly not 'acceptable':
    // since 2026-08 TVOC has no threshold, so the parameter cannot be
    // called any of the three. Calling an unjudgeable reading acceptable is
    // the more dangerous of the two errors available, which is why this is
    // its own token rather than a fallback. See no-molhave.test.ts.
    expect(p.tvoc.outcome).toBe('not_evaluated')
    expect(p.tvoc.mean).toBe(365)                // still measured and reported
    expect(p.relativeHumidity.outcome).toBe('acceptable')
  })
  it('omits parameters with no data', () => {
    const p = summarizeParameters([{ zn: 'A', co2: '700' }])
    expect(p.co2).toBeTruthy()
    expect(p.pm25).toBeUndefined()
  })
})

describe('zoneRows / peakCo2ByZone', () => {
  it('returns a row per zone with a governing outcome', () => {
    const rows = zoneRows(Z)
    expect(rows).toHaveLength(2)
    expect(rows[1].outcome).toBe('elevated') // conf room CO2 governs
  })
  it('extracts numeric peak CO2 per zone for charting', () => {
    const bars = peakCo2ByZone(Z)
    expect(bars.map(b => b.value)).toEqual([760, 1247])
    expect(bars[1].outcome).toBe('elevated')
  })
})

describe('collectFindings / recommendations', () => {
  it('pulls flagged findings from engine zone scores, sorted by severity', () => {
    const f = collectFindings([
      { zoneName: 'Z1', confidence: 'Medium', cats: [{ l: 'Ventilation', r: [{ t: 'CO2 high', sev: 'medium', std: 'ASHRAE 62.1' }, { t: 'ok', sev: 'pass' }] }] },
      { zoneName: 'Z2', cats: [{ l: 'Contaminants', r: [{ t: 'Crit', sev: 'critical' }] }] },
    ])
    expect(f).toHaveLength(2)
    expect(f[0].severity).toBe('critical') // sorted first
  })
  it('groups recommendations by timeframe', () => {
    const r = recommendationsByTimeframe({ imm: ['Do A'], eng: ['Do B'], adm: ['Do C'], mon: ['Do D'] })
    expect(r.immediate).toEqual(['Do A'])
    expect(r.mediumTerm).toEqual(['Do C', 'Do D'])
  })
})

describe('qaQc / limitations', () => {
  it('discloses missing QA/QC instead of inventing it', () => {
    const qa = buildQaQc({})
    expect(qa.find(x => x.label === 'Instrument').value).toMatch(/Not documented/)
  })
  it('adds a no-logger limitation when no graphs are present', () => {
    const lim = buildLimitations({ zones: Z })
    expect(lim.some(l => /no continuous logger/i.test(l))).toBe(true)
  })
})

describe('buildReportModel (integration with demo data)', () => {
  const zoneScores = DEMO_ZONES.map(z => scoreZone(z, DEMO_BUILDING))
  const comp = summarizeAssessment(zoneScores)
  const model = buildReportModel({
    building: DEMO_BUILDING, presurvey: DEMO_PRESURVEY, zones: DEMO_ZONES, zoneScores, comp,
    recs: { imm: ['Verify outdoor-air supply.'], eng: [], adm: [], mon: [] },
    profile: { name: 'John Smith', certs: ['CIH', 'CSP'] },
  }, { mode: 'draft' })

  it('produces the fixed schema keys', () => {
    for (const k of ['reportMeta', 'projectSummary', 'parameters', 'zones', 'findings', 'recommendations', 'charts', 'qaQc', 'limitations', 'references']) {
      expect(model).toHaveProperty(k)
    }
  })
  it('carries identity + mode + brand into reportMeta', () => {
    expect(model.reportMeta.facilityName).toBe(DEMO_BUILDING.fn)
    expect(model.reportMeta.assessorName).toBe('John Smith')
    expect(model.reportMeta.mode).toBe('draft')
    expect(model.reportMeta.brandColor).toBe('#0E7490')
  })
  it('lists only references something in the report actually cited', () => {
    // Appendix A used to be an unguarded standards register: four fixed
    // references were appended whether or not anything was compared to
    // them (audit 2026-09 §5 M2). A reference now enters only when a
    // finding, causal chain or evaluated measurement cites it.
    // `referenceUsage` records, per reference, WHAT cited it (a finding or
    // causal chain) or which measured parameter was evaluated against it.
    expect(model.references.length).toBeGreaterThan(0)
    for (const ref of model.references) {
      const key = Array.isArray(ref) ? ref[0] : ref
      const usage = model.referenceUsage?.[key]
      expect(typeof usage, `reference "${key}" has no usage record`).toBe('string')
      expect(usage, `reference "${key}" is listed without anything citing it`).toMatch(/^(Cited by|Applied to measured parameter)/)
      expect(usage).not.toMatch(/screening interpretation/i)
    }
    // The retired fixed four appear only when something cited them.
    for (const fixed of ['ASHRAE 62.1-2025', 'ASHRAE 55-2023', 'US EPA NAAQS', 'OSHA PELs (29 CFR 1910.1000)']) {
      if (model.references.includes(fixed)) expect(model.referenceUsage[fixed]).toBeTruthy()
    }
  })
})
