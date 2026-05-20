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

describe('CO checks', () => {
  it('flags critical at OSHA PEL (50 ppm)', () => {
    const out = evaluateLive({ co: STD.c.co.osha })
    const a = out.find(x => x.id === 'co-pel')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
    expect(a!.reference).toMatch(/OSHA/i)
  })

  it('flags warn at NIOSH REL (35 ppm)', () => {
    const out = evaluateLive({ co: STD.c.co.niosh })
    const a = out.find(x => x.id === 'co-niosh')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warn')
  })

  it('flags info at half NIOSH REL (~17.5 ppm)', () => {
    const out = evaluateLive({ co: 20 })
    const a = out.find(x => x.id === 'co-rising')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
  })

  it('does not flag CO well below half NIOSH', () => {
    const out = evaluateLive({ co: 5 })
    expect(out.find(x => x.parameter === 'co')).toBeUndefined()
  })
})

describe('Formaldehyde checks', () => {
  it('flags critical at OSHA PEL (0.75 ppm)', () => {
    const out = evaluateLive({ hc: STD.c.hcho.osha })
    const a = out.find(x => x.id === 'hcho-pel')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
  })

  it('flags warn at Action Level (0.5 ppm)', () => {
    const out = evaluateLive({ hc: STD.c.hcho.al })
    const a = out.find(x => x.id === 'hcho-action')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warn')
  })

  it('flags info above NIOSH REL ceiling (0.016 ppm)', () => {
    const out = evaluateLive({ hc: 0.05 })
    const a = out.find(x => x.id === 'hcho-niosh')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
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
  it('flags warn at Mølhave action tier (3000 µg/m³)', () => {
    const out = evaluateLive({ tv: STD.c.tvoc.act })
    const a = out.find(x => x.id === 'tvoc-action')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warn')
  })

  it('flags info at Mølhave concern tier (500 µg/m³)', () => {
    const out = evaluateLive({ tv: STD.c.tvoc.con })
    const a = out.find(x => x.id === 'tvoc-concern')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
  })

  it('every TVOC advisory cites Mølhave 1991 (the original advisory-tier paper)', () => {
    const out = evaluateLive({ tv: 800 })
    const a = out.find(x => x.parameter === 'tv')
    expect(a!.reference).toMatch(/Mølhave 1991/)
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
      tv: 600,           // info (concern)
      tf: 86,            // info (out of comfort)
      rh: 78,            // warn (rh-comfort >70)
    })
    const ids = out.map(a => a.id)
    expect(ids).toContain('co2-action')
    expect(ids).toContain('co2-no-outdoor')
    expect(ids).toContain('co-niosh')
    expect(ids).toContain('hcho-action')
    expect(ids).toContain('pm25-who')
    expect(ids).toContain('tvoc-concern')
    expect(ids).toContain('temp-comfort')
    expect(ids).toContain('rh-comfort')
  })
})
