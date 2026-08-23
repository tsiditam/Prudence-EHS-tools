/**
 * The ASHRAE 55 thermal comfort band.
 *
 * What went wrong, so the next reader can see what these assertions are for:
 * `STD.t.temp` carried `summer: { min: 67, max: 82, oMin: 73, oMax: 79 }` — a
 * wide "acceptable" band with a tighter "optimal" band inside it, both
 * attributed to ASHRAE 55-2023. Three separate defects rode on that:
 *
 *   1. **67–82 °F had no source.** Every other constant in standards.js
 *      carries a paragraph of provenance; this block carried none. The
 *      project's own standards corpus states the acceptable range as ~68–76 °F
 *      winter and ~73–79 °F summer — and 73–79 is exactly what the constant
 *      filed under `oMin`/`oMax` as "optimal", so the wide band was invented
 *      around a figure that was already the right one.
 *   2. **The two-tier ladder is not in the standard.** ASHRAE 55 states one
 *      acceptability criterion (roughly 80% of occupants satisfied). An
 *      optimal/acceptable split attributed to it is the platform's own
 *      distinction wearing the standard's name.
 *   3. **The surfaces disagreed.** The Logger Studio card drew 67–82 while the
 *      engine flagged 73–79, so one 72.6 °F reading rendered as comfortably
 *      in range on one screen and as a finding on another.
 *
 * These tests pin the fix. They are deliberately literal about the numbers:
 * this is determinism core, and a silent band change is exactly what happened
 * last time.
 */
import { describe, it, expect } from 'vitest'
import { STD } from '../../src/constants/standards'
import { scoreZone } from '../../src/engines/scoring'
import { paramReference } from '../../src/utils/sensorThresholds'
import { resolveReference } from '../../src/utils/referenceProfiles'
import { CRITERION_CLASS } from '../../src/constants/criteria'

const SUMMER = Date.UTC(2026, 7, 23)   // 23 Aug
const WINTER = Date.UTC(2026, 0, 15)   // 15 Jan

const tempFindings = (tf: string, assessmentDate: string) =>
  ((scoreZone({ zn: 'Z', su: 'office', tf } as never, { assessmentDate } as never) as never as any)
    .cats.find((c: any) => c.l === 'Environment')?.r || [])
    .filter((f: any) => String(f.t).startsWith('Temperature'))

describe('the band is the corpus figure, and there is only one of it', () => {
  it('holds the sourced acceptable ranges', () => {
    expect(STD.t.temp.summer).toEqual({ min: 73, max: 79 })
    expect(STD.t.temp.winter).toEqual({ min: 68, max: 76 })
  })

  it('carries no second tier for the engine to invent a distinction from', () => {
    // `oMin`/`oMax` are gone. A reappearance means the optimal/acceptable
    // ladder is back, and with it a claim ASHRAE 55 does not make.
    for (const season of ['summer', 'winter'] as const) {
      expect(Object.keys(STD.t.temp[season]).sort()).toEqual(['max', 'min'])
    }
  })

  it('never states 67 or 82 again', () => {
    const flat = JSON.stringify(STD.t.temp)
    expect(flat).not.toContain('67')
    expect(flat).not.toContain('82')
  })
})

describe('every surface reads the one band', () => {
  // The defect that reached a screenshot: the card and the engine disagreeing
  // about the same reading. Assert agreement directly rather than asserting
  // each side's number and hoping they match.
  it('the Logger Studio card and the engine agree, in both seasons', () => {
    const cases = [
      { ts: SUMMER, date: '2026-08-23', band: STD.t.temp.summer },
      { ts: WINTER, date: '2026-01-15', band: STD.t.temp.winter },
    ]
    for (const c of cases) {
      const card = paramReference('temp', { unit: '°F', ts: c.ts }).band
      expect(card).toEqual({ min: c.band.min, max: c.band.max })

      // And the engine raises a finding exactly where the card's band ends.
      expect(tempFindings(String(c.band.min - 1), c.date)).toHaveLength(1)
      expect(tempFindings(String(c.band.min), c.date)).toEqual([])
      expect(tempFindings(String(c.band.max), c.date)).toEqual([])
      expect(tempFindings(String(c.band.max + 1), c.date)).toHaveLength(1)
    }
  })

  it('the monitoring report resolves the same band as the card', () => {
    const ref = resolveReference('temp', 'ashrae-comfort', { unit: '°F', ts: SUMMER })!
    expect(ref.band).toEqual([STD.t.temp.summer.min, STD.t.temp.summer.max])
  })

  it('72.6 °F in summer is a finding on BOTH surfaces, not one', () => {
    // The reading from the screenshot that started this. Under the old
    // constants the card said in-range and the engine said out-of-range.
    const card = paramReference('temp', { unit: '°F', ts: SUMMER }).band
    expect(72.6 < card.min).toBe(true)
    expect(tempFindings('72.6', '2026-08-23')).toHaveLength(1)
  })
})

describe('a comfort standard cannot outrank a health one', () => {
  it('caps the finding at the comfort_consensus ceiling', () => {
    // Was `high`. `comfort_consensus` declares maxSeverity `medium` precisely
    // because ASHRAE 55 is not a health-based or regulatory limit, and the
    // engine was breaking its own ceiling.
    expect(CRITERION_CLASS.comfort_consensus.maxSeverity).toBe('medium')
    for (const tf of ['60', '90']) {
      const [f] = tempFindings(tf, '2026-08-23')
      expect(f.sev, `${tf}°F`).toBe('medium')
    }
  })
})

describe('the finding says what the number rests on', () => {
  it('names the band, the season and the standard', () => {
    const [f] = tempFindings('85', '2026-08-23')
    expect(f.t).toContain('73–79°F')
    expect(f.t).toContain('summer')
    expect(f.t).toContain('ASHRAE 55')
    expect(f.std).toBe(STD.t.ref)
    expect(f.band).toEqual([73, 79])
    // "optimal" was the invented word. It must not come back in the prose
    // either — a finding that says "outside optimal" asserts a tier the
    // standard does not define.
    expect(String(f.t).toLowerCase()).not.toContain('optimal')
    expect(String(f.bandLabel).toLowerCase()).not.toContain('optimal')
  })
})
