/**
 * Reporting voice — findings carry material qualification; standards framing
 * and definitional context live once in Appendix D.
 *
 * See docs/REPORTING_VOICE.md. These pin the two structural guarantees the
 * policy rests on, not the wording of any individual sentence.
 */
import { describe, it, expect } from 'vitest'
import { PHRASE_LIBRARY } from '../../src/engine/report/phrases/index'
import type { ConditionType } from '../../src/engine/types/domain'
import { PARAMETER_PROSE } from '../../src/engine/report/parameter-prose/index'

// Derived from the library itself so a newly added ConditionType is covered
// automatically rather than needing to be listed here too.
const ALL_CONDITION_TYPES = Object.keys(PHRASE_LIBRARY) as ConditionType[]

describe('reporting voice — phrase library', () => {
  it('never strips a condition of all its material qualification', () => {
    // The guarantee that stopped the context split going too far: a PM
    // exceedance whose only note was "NAAQS is an ambient standard applied
    // here as a benchmark" must keep it — that note is what tells the reader
    // the benchmark is not an indoor regulatory limit.
    for (const ct of ALL_CONDITION_TYPES) {
      expect(PHRASE_LIBRARY[ct].defaultLimitations.length,
        `${ct} has no inline limitation left`).toBeGreaterThan(0)
    }
  })

  it('keeps standards framing out of the inline limitations', () => {
    // Phrases that explain what a benchmark *is*, or what a parameter cannot
    // establish on its own, belong in Appendix D — not restated under every
    // finding of that type.
    const relocated = [
      'CO₂ is a ventilation effectiveness indicator',
      'Mølhave (1991) TVOC tiers are advisory benchmarks',
      'The presence of an odor does not necessarily indicate',
      'Spatial clustering alone does not establish causation',
    ]
    for (const ct of ALL_CONDITION_TYPES) {
      const entry = PHRASE_LIBRARY[ct]
      for (const line of entry.defaultLimitations) {
        for (const moved of relocated) {
          expect(line, `${ct} still states "${moved}" inline`).not.toContain(moved)
        }
      }
    }
  })

  it('relocates rather than deletes — moved context is still on an entry', () => {
    const allContext = ALL_CONDITION_TYPES
      .flatMap(ct => PHRASE_LIBRARY[ct].technicalContext || [])
    expect(allContext.length).toBeGreaterThan(0)
    expect(allContext.some(l => l.includes('CO₂ is a ventilation effectiveness indicator'))).toBe(true)
  })
})

describe('reporting voice — parameter summaries', () => {
  const NORMAL = {
    low: 420, high: 610, average: 505, unit: 'ppm', count: 12,
    withinStandards: true, outdoorReference: 550,
  }

  it('states a normal result plainly, with no exposure-limit framing', () => {
    const summary = PARAMETER_PROSE.co2.summaryTemplate(NORMAL as never)

    expect(summary).toContain('within the 700 ppm differential reference')
    expect(summary).toContain('no evidence of occupant-related accumulation')
    // Voice rule 11 — an OSHA PEL is an occupational exposure limit and has
    // no business framing a routine indoor screening value.
    expect(summary).not.toMatch(/OSHA|PEL|5,000/)
    // Voice rule 9 — no reflexive hedging on a normal result.
    expect(summary).not.toMatch(/at the time of measurement|should not be|does not necessarily/i)
  })

  it('does not recite standards history inside the summary', () => {
    for (const key of Object.keys(PARAMETER_PROSE) as Array<keyof typeof PARAMETER_PROSE>) {
      const summary = PARAMETER_PROSE[key].summaryTemplate({
        ...NORMAL, unit: PARAMETER_PROSE[key].parameter.includes('Temperature') ? '°F' : 'ppm',
      } as never)
      // The background prose runs 180+ words; a summary that long has
      // swallowed it again.
      expect(summary.split(/\s+/).length, `${key} summary is too long`).toBeLessThan(60)
    }
  })

  it('keeps the full standards background available for Appendix D', () => {
    // Relocated, not deleted.
    expect(PARAMETER_PROSE.co2.standardsBackground).toMatch(/ASHRAE Standard 62.1/)
    expect(PARAMETER_PROSE.co2.standardsBackground).toMatch(/Persily/)
  })
})
