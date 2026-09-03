/**
 * Live Advisor — deterministic real-time advisory engine.
 *
 * Pins each rule's threshold + severity assignment + the citation
 * surfaced for the reviewing IH. The advisor reads STD scoring
 * constants from src/constants/standards.js but never modifies
 * them; this test file imports STD too so a future STD change
 * that broke an advisory would surface here, not in production.
 */
import { describe, it, expect } from 'vitest'
import { evaluateLive, __test } from '../../src/engines/liveAdvisor.js'
import { STD } from '../../src/constants/standards.js'

describe('evaluateLive — input guards', () => {
  it('returns [] for null/undefined/non-object', () => {
    expect(evaluateLive(null)).toEqual([])
    expect(evaluateLive(undefined)).toEqual([])
    expect(evaluateLive('not-an-object' as unknown as Record<string, unknown>)).toEqual([])
  })

  it('returns [] when no readings are entered', () => {
    expect(evaluateLive({})).toEqual([])
  })

  it('ignores empty-string + non-numeric values', () => {
    expect(evaluateLive({ co2: '', co: '   ', pm: 'abc' })).toEqual([])
  })
})

describe('CO2 ventilation heuristic', () => {
  it('flags critical at >= action threshold (1500 ppm)', () => {
    const out = evaluateLive({ co2: STD.v.co2.act })
    const a = out.find(x => x.id === 'co2-action')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
    expect(a!.observation).toMatch(/1500 ppm/)
    expect(a!.observation).toMatch(/action threshold/)
  })

  it('flags warn at concern threshold (1000 ppm)', () => {
    const out = evaluateLive({ co2: STD.v.co2.con })
    const a = out.find(x => x.id === 'co2-concern')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warn')
  })

  it('does not flag below 1000 ppm', () => {
    const out = evaluateLive({ co2: 900 })
    expect(out.find(x => x.id === 'co2-concern')).toBeUndefined()
    expect(out.find(x => x.id === 'co2-action')).toBeUndefined()
  })

  it('includes the indoor-outdoor delta when outdoor baseline is present', () => {
    const out = evaluateLive({ co2: 1200, co2o: 420 })
    const a = out.find(x => x.id === 'co2-concern')
    expect(a!.observation).toMatch(/Δ780 ppm above outdoor/)
  })
})

describe('Outdoor CO2 baseline reminder', () => {
  it('surfaces info advisory when indoor CO2 is entered without outdoor', () => {
    const out = evaluateLive({ co2: 800 })
    const a = out.find(x => x.id === 'co2-no-outdoor')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
    expect(a!.suggestion).toMatch(/outdoor CO₂ reading/)
  })

  it('does not fire when both indoor and outdoor are entered', () => {
    const out = evaluateLive({ co2: 800, co2o: 420 })
    expect(out.find(x => x.id === 'co2-no-outdoor')).toBeUndefined()
  })
})

describe('CO checks — through the criterion registry (audit H2 / M7)', () => {
  // The advisor used to compare with `>=` against bare STD numbers and say
  // "at or above OSHA PEL" of a grab reading. It now takes the criterion,
  // the sentence and the comparison from evaluateCriteria: strictly `>`,
  // like the registry and the engine, and the statement carries the
  // averaging-period limitation.
  it('flags critical ABOVE the OSHA PEL value (50 ppm), not at it', () => {
    const at = evaluateLive({ co: STD.c.co.osha })
    expect(at.find(x => x.id === 'co-pel')).toBeUndefined()
    expect(at.find(x => x.id === 'co-niosh')?.severity).toBe('warn')   // the tier below
    const out = evaluateLive({ co: STD.c.co.osha + 1 })
    const a = out.find(x => x.id === 'co-pel')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
    expect(a!.reference).toMatch(/OSHA/i)
    expect(a!.criterionId).toBe('co_osha_pel')
    expect(a!.determinative).toBe(false)
    expect(a!.observation).not.toMatch(/at or above OSHA PEL/)
    expect(a!.observation).toMatch(/8-hour time-weighted average/)
    expect(a!.observation).toMatch(/cannot establish compliance/)
  })

  it('flags warn above the NIOSH REL (35 ppm)', () => {
    expect(evaluateLive({ co: STD.c.co.niosh }).find(x => x.id === 'co-niosh')).toBeUndefined()
    const out = evaluateLive({ co: STD.c.co.niosh + 1 })
    const a = out.find(x => x.id === 'co-niosh')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warn')
  })

  it('flags info above the EPA 8-hour NAAQS (9 ppm) — the tier "half of NIOSH" used to hide', () => {
    const out = evaluateLive({ co: 20 })
    const a = out.find(x => x.id === 'co-naaqs-8h')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
    expect(out.find(x => x.id === 'co-rising')).toBeUndefined()
  })

  it('does not flag CO at indoor background', () => {
    const out = evaluateLive({ co: 5 })
    expect(out.find(x => x.parameter === 'co')).toBeUndefined()
  })
})

describe('Formaldehyde checks — through the criterion registry', () => {
  it('flags critical above the OSHA PEL (0.75 ppm), not at it', () => {
    expect(evaluateLive({ hc: STD.c.hcho.osha }).find(x => x.id === 'hcho-pel')).toBeUndefined()
    const out = evaluateLive({ hc: 0.8 })
    const a = out.find(x => x.id === 'hcho-pel')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
    expect(a!.observation).toMatch(/8-hour time-weighted average/)
  })

  it('flags warn above the Action Level (0.5 ppm)', () => {
    const out = evaluateLive({ hc: 0.6 })
    const a = out.find(x => x.id === 'hcho-action')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warn')
  })

  it('flags info above the NIOSH REL (0.016 ppm) and calls it a REL, not a ceiling', () => {
    // The REL is a 10-hour TWA; the NIOSH ceiling for formaldehyde is
    // 0.1 ppm. The advisory used to label 0.016 the "NIOSH REL ceiling".
    const out = evaluateLive({ hc: 0.05 })
    const a = out.find(x => x.id === 'hcho-niosh')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
    expect(a!.observation).not.toMatch(/ceiling/i)
    expect(a!.observation).toMatch(/NIOSH REL of 0.016 ppm/)
    expect(a!.observation).toMatch(/10-hour time-weighted average/)
  })

  it('does not flag HCHO at or below NIOSH REL', () => {
    const out = evaluateLive({ hc: STD.c.hcho.niosh })
    expect(out.find(x => x.parameter === 'hc')).toBeUndefined()
  })
})

describe('PM2.5 checks', () => {
  it('flags EPA 24-hr exceedance (>35 µg/m³)', () => {
    const out = evaluateLive({ pm: 40 })
    const a = out.find(x => x.id === 'pm25-epa-24hr')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warn')
  })

  it('flags WHO guideline exceedance (>15) but below EPA (35)', () => {
    const out = evaluateLive({ pm: 20 })
    expect(out.find(x => x.id === 'pm25-who')).toBeDefined()
    expect(out.find(x => x.id === 'pm25-epa-24hr')).toBeUndefined()
  })

  it('flags I/O ratio when indoor > 2× outdoor + above 5 µg/m³', () => {
    const out = evaluateLive({ pm: 20, pmo: 5 })
    const a = out.find(x => x.id === 'pm25-io-ratio')
    expect(a).toBeDefined()
    expect(a!.observation).toMatch(/4\.0×/)
  })

  it('does not flag I/O ratio when indoor PM is very low (< 5 µg/m³)', () => {
    const out = evaluateLive({ pm: 4, pmo: 1 })
    expect(out.find(x => x.id === 'pm25-io-ratio')).toBeUndefined()
  })
})

describe('TVOC checks', () => {
  // There is no TVOC check. `checkTVOC` compared the reading against
  // Mølhave's concern (500 µg/m³) and action (3,000 µg/m³) tiers and told the
  // assessor, in the field, that the value was "at or above" one of them —
  // a judgement against a limit that does not exist. It went in 2026-08 with
  // every other TVOC threshold; see tests/engine/no-molhave.test.ts.
  //
  // Worth naming what the advisory got RIGHT, because it is the reason this
  // was a defect rather than merely noise: its advice was to speciate via
  // EPA TO-15/TO-17, which is sound. Sound advice attached to an unsound
  // trigger is still an unsound finding, and the advice survives where a
  // recorded SOURCE warrants it (`sampling.js`).

  it('issues nothing at any TVOC value, across every tier boundary it used', () => {
    for (const tv of [0, 1, 199, 200, 499, 500, 501, 2999, 3000, 3001, 25000, 99999]) {
      const out = evaluateLive({ tv })
      expect(out, `tv=${tv}`).toEqual([])
    }
  })

  it('a TVOC reading does not alter the advisories other parameters produce', () => {
    // Fully inert, not merely silent.
    const base = { co2: 1600, rh: 78 }
    const without = JSON.stringify(evaluateLive(base))
    for (const tv of [500, 3000, 25000]) {
      expect(JSON.stringify(evaluateLive({ ...base, tv })), `tv=${tv}`).toBe(without)
    }
  })
})

describe('Temperature + RH checks', () => {
  it('flags temperature outside 67-82°F as info', () => {
    expect(evaluateLive({ tf: 65 }).find(x => x.id === 'temp-comfort')).toBeDefined()
    expect(evaluateLive({ tf: 85 }).find(x => x.id === 'temp-comfort')).toBeDefined()
    expect(evaluateLive({ tf: 75 }).find(x => x.id === 'temp-comfort')).toBeUndefined()
  })

  it('flags low RH (< 30%) as info', () => {
    const a = evaluateLive({ rh: 20 }).find(x => x.id === 'rh-comfort')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
    expect(a!.suggestion).toMatch(/Low RH/)
  })

  it('flags high RH (> 70%) as warn (mold-growth precursor)', () => {
    const a = evaluateLive({ rh: 75 }).find(x => x.id === 'rh-comfort')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warn')
    expect(a!.suggestion).toMatch(/mold growth/)
  })
})

describe('Ordering', () => {
  it('sorts critical before warn before info', () => {
    const out = evaluateLive({ co: 60, co2: 1100, pm: 20 })
    const severities = out.map(a => a.severity)
    expect(severities.indexOf('critical')).toBeLessThan(severities.indexOf('warn'))
    expect(severities.indexOf('warn')).toBeLessThan(severities.indexOf('info'))
  })

  it('SEVERITY_ORDER is critical < warn < info', () => {
    expect(__test.SEVERITY_ORDER.critical).toBeLessThan(__test.SEVERITY_ORDER.warn)
    expect(__test.SEVERITY_ORDER.warn).toBeLessThan(__test.SEVERITY_ORDER.info)
  })
})

describe('Multi-rule combination', () => {
  it('produces every applicable advisory for a complex reading set', () => {
    const out = evaluateLive({
      co2: 1600,         // critical
      co: 36,            // warn (niosh)
      hc: 0.6,           // warn (al)
      pm: 18,            // info (who)
      tv: 600,           // nothing — TVOC raises no advisory (2026-08)
      tf: 86,            // info (out of comfort)
      rh: 78,            // warn (rh-comfort >70)
    })
    const ids = out.map(a => a.id)
    expect(ids).toContain('co2-action')
    expect(ids).toContain('co2-no-outdoor')
    expect(ids).toContain('co-niosh')
    expect(ids).toContain('hcho-action')
    expect(ids).toContain('pm25-who')
    expect(ids).not.toContain('tvoc-concern')
    expect(ids).toContain('temp-comfort')
    expect(ids).toContain('rh-comfort')
  })
})
