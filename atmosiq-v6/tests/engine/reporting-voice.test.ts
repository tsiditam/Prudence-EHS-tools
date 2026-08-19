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

    // Was: asserts "within the 700 ppm differential reference" and "no
    // evidence of occupant-related accumulation". A CIH review rejected
    // both. The first treats a figure from a REMOVED informative appendix
    // as a line to pass — the error Persily 2021 exists to correct, and one
    // CLAUDE.md already lists as an anti-pattern. The second claims absence
    // of accumulation rather than reporting the differential measured.
    expect(summary).toContain('differential')
    expect(summary).not.toMatch(/within the 700 ppm differential reference/)
    expect(summary).not.toMatch(/no evidence of occupant-related accumulation/)
    // CO2 must still be framed as a ventilation index, not a contaminant.
    expect(summary).toMatch(/not a contaminant measurement/)
    // Voice rule 11 — an OSHA PEL is an occupational exposure limit and has
    // no business framing a routine indoor value.
    expect(summary).not.toMatch(/OSHA|PEL|5,000/)
    // Voice rule 9 — no reflexive hedging. "should not be" / "does not
    // necessarily" add nothing to a normal result and stay banned.
    expect(summary).not.toMatch(/should not be|does not necessarily/i)
  })

  it('keeps the temporal qualifier where it changes what the reader may conclude', () => {
    // Voice rule 9 previously banned "at the time of measurement" outright,
    // as reflexive hedging. On a clean result that reads on absence of a
    // SOURCE it is not hedging — it is the difference between "nothing was
    // detected while we were there" and "nothing is there". A CIH review
    // flagged exactly that over-reach ("with no indication of a combustion
    // source" from a single 1 ppm CO reading), so the qualifier is required
    // where the sentence would otherwise imply a source conclusion.
    //
    // The governing principle is unchanged: qualify only where the
    // qualification changes how the reader should understand or act on the
    // result. Here it does.
    const co = PARAMETER_PROSE.co.summaryTemplate({
      low: 1, high: 1, average: 1, unit: 'ppm', count: 4, withinStandards: true,
    } as never)
    expect(co).not.toMatch(/no indication of a combustion source/)
    expect(co).toMatch(/single time-point readings/i)

    const pm = PARAMETER_PROSE.pm25.summaryTemplate({
      low: 6, high: 7, average: 6.5, unit: 'µg/m³', count: 4,
      withinStandards: true, outdoorReference: 6,
    } as never)
    expect(pm).not.toMatch(/no indication of an indoor particulate source/)
    expect(pm).toMatch(/at the time of measurement/)
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
