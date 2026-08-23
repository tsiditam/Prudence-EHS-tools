/**
 * A causal chain's confidence weighs evidence. It does not count it.
 *
 * CLAUDE.md draws this rule for the professional-opinion rollup — "the opinion
 * rollup weighs findings; it does not count them" — after a defect where one
 * high-severity finding matched nothing and produced "No significant indoor
 * air quality concerns were identified". The rule was never applied to the
 * module next door, and `causalChains.js` ended every chain in some form of
 * `ev.length >= N`.
 *
 * The cross-contamination chain is where that showed:
 *
 *     const ev = ['Cross-contamination: ' + d.path_crosstalk]
 *     if (d.path_crosstalk_source) ev.push('Source: ' + d.path_crosstalk_source)
 *     ...
 *     confidence: ev.length >= 2 ? 'Moderate' : 'Possible'
 *
 * `path_crosstalk_source` is a free-text field. Typing anything into it at all
 * — "unknown", "?", a guess — pushed a second string and raised the chain from
 * Possible to Moderate. The field ELABORATES the observation the chain already
 * rests on; it is not a second, independent line of evidence. The tier moved
 * with how much the assessor typed.
 *
 * Nothing failed when this was fixed, because nothing had ever pinned it.
 * That is what this file is for.
 */
import { describe, it, expect } from 'vitest'
import { buildCausalChains } from '../../src/engines/causalChains'
import { scoreZone } from '../../src/engines/scoring'

const RANK: Record<string, number> = { Possible: 0, Moderate: 1, Strong: 2 }

const BLDG = { hm: 'Within 6 months', fc: 'Clean', assessmentDate: '2026-07-15' }

const chainsFor = (zone: Record<string, unknown>) => {
  const z = { zn: 'Z', su: 'office', ...zone }
  const zs = scoreZone(z as never, BLDG as never)
  return buildCausalChains([z] as never, BLDG as never, [zs] as never)
}

const chain = (zone: Record<string, unknown>, type: string) =>
  chainsFor(zone).find((c: any) => c.type === type)

describe('free text does not raise a tier', () => {
  const CROSSTALK = { path_crosstalk: 'Odor migration from adjacent suite' }
  const TYPE = 'Cross-Contamination Pathway'

  it('naming the source does not move the confidence', () => {
    // The exact defect. Same observation, same building, one extra sentence
    // of description — and the tier used to move.
    const bare = chain(CROSSTALK, TYPE)!
    const described = chain({ ...CROSSTALK, path_crosstalk_source: 'Adjacent tenant kitchen' }, TYPE)!
    const vague = chain({ ...CROSSTALK, path_crosstalk_source: 'unknown' }, TYPE)!

    expect(bare.confidence).toBe('Possible')
    expect(described.confidence).toBe(bare.confidence)
    expect(vague.confidence).toBe(bare.confidence)
  })

  it('but the source still reaches the reader', () => {
    // The fix must not be "drop the field". It is useful on the page; it is
    // simply not a second line of evidence.
    const described = chain({ ...CROSSTALK, path_crosstalk_source: 'Adjacent tenant kitchen' }, TYPE)!
    expect(described.evidence.join(' ')).toContain('Adjacent tenant kitchen')
    expect(described.evidence.length).toBeGreaterThan(chain(CROSSTALK, TYPE)!.evidence.length)
  })

  it('a genuinely independent observation DOES raise it', () => {
    // The positive control. Without this, a rule that never raised anything
    // would look identical to a rule that weighs correctly.
    const withPressure = chain({ ...CROSSTALK, path_pressure: 'Negative (draws in)' }, TYPE)!
    expect(RANK[withPressure.confidence]).toBeGreaterThan(RANK[chain(CROSSTALK, TYPE)!.confidence])
  })
})

describe('a hypothesis is never Strong', () => {
  // Three chains carry "(Hypothesis)" in their own type label and a rootCause
  // saying the mechanism "is a common contributor" / "remains possible". One
  // of them could reach Strong by having four complaint fields filled in.
  const COMPLAINTS = {
    cx: 'Yes — complaints reported',
    sr: 'Yes — clear pattern',
    cc: 'Yes — this zone',
    ac: '12',
    sy: ['Headache', 'Eye irritation', 'Fatigue', 'Throat irritation'],
  }

  it('caps the complaint-driven ventilation hypothesis at Moderate', () => {
    for (const c of chainsFor(COMPLAINTS).filter((x: any) => x.type.includes('(Hypothesis)'))) {
      expect(RANK[c.confidence], `${c.type} reached ${c.confidence}`)
        .toBeLessThanOrEqual(RANK.Moderate)
    }
  })

  it('every chain that says "Hypothesis" is capped, not just the one that prompted this', () => {
    const hypotheses = chainsFor(COMPLAINTS).filter((x: any) => x.type.includes('(Hypothesis)'))
    expect(hypotheses.length).toBeGreaterThanOrEqual(3)
    expect(hypotheses.every((c: any) => c.confidence !== 'Strong')).toBe(true)
  })
})

describe('confidence is monotonic in evidence', () => {
  // Better evidence must never LOWER a tier. The same property the
  // professional-opinion rollup asserts, for the same reason: a rule built out
  // of thresholds over a count can invert when the count changes shape.
  const MOISTURE_BASE = { mi: 'Visible growth <10 sq ft', ot: ['Musty / Earthy'] }

  it('adding a corroborating observation never lowers the tier', () => {
    const steps = [
      MOISTURE_BASE,
      { ...MOISTURE_BASE, sy: ['Cough'] },
      { ...MOISTURE_BASE, sy: ['Cough'], rh: '72' },
      { ...MOISTURE_BASE, sy: ['Cough'], rh: '72', wd: 'Active leak' },
    ]
    const tiers = steps.map((z) => RANK[chain(z, 'Moisture / Biological')!.confidence])
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i], `step ${i} fell below step ${i - 1}`).toBeGreaterThanOrEqual(tiers[i - 1])
    }
    // And not flat — the strongest case must actually outrank the weakest.
    expect(tiers[tiers.length - 1]).toBeGreaterThan(tiers[0])
  })

  it('a measured exceedance with a source and symptoms is Strong', () => {
    const c = chain({
      tv: '4000',
      src_internal: ['New furniture / finishes'],
      sy: ['Eye irritation', 'Headache'],
    }, 'Chemical Exposure')!
    expect(c.confidence).toBe('Strong')
  })
})

describe('every chain declares a confidence the system recognises', () => {
  it('emits only Possible, Moderate or Strong', () => {
    const zones = [
      { path_crosstalk: 'Odor migration', path_crosstalk_source: 'x' },
      { mi: 'Visible growth <10 sq ft', ot: ['Musty / Earthy'], sy: ['Cough'] },
      { tv: '4000', src_internal: ['Cleaning products'], sy: ['Headache'] },
      { cx: 'Yes — complaints reported', sr: 'Yes — clear pattern', cc: 'Yes — this zone', ac: '9', sy: ['Fatigue'] },
    ]
    const all = zones.flatMap((z) => chainsFor(z))
    expect(all.length).toBeGreaterThan(0)
    for (const c of all) {
      expect(RANK[c.confidence], `${c.type} has confidence "${c.confidence}"`).toBeDefined()
    }
  })
})
