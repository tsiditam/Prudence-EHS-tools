/**
 * "Additional criteria considered" — criteria that were deliberately NOT
 * the basis of a finding, and the reason.
 *
 * This file pins four things:
 *   • CONTEXTUAL_STANDARDS shape (id, citation, summary, rationale,
 *     appliesWhen all present and substantive)
 *   • every citation matches its claimed primary source, so a future
 *     bump cannot silently drift to an unverified value
 *   • scoping — getContextualStandards returns only the entries whose
 *     subject the assessment actually engaged
 *   • DRIFT GUARD — an entry may not claim a criterion is unapplied when
 *     src/constants/criteria.js applies it, and may not describe
 *     AtmosFlow's internals
 *
 * The drift guard is the point of this file. The previous revision
 * asserted the annual PM2.5 NAAQS was "not currently integrated into the
 * deterministic scoring path" and kept asserting it after the criterion
 * registry added `pm25_epa_annual` — a client-facing claim about our own
 * method that had quietly become false. Nothing caught it, because
 * nothing compared the two lists. Now something does.
 */
import { describe, it, expect } from 'vitest'
import {
  CONTEXTUAL_STANDARDS,
  getContextualStandards,
  measuredParameters,
} from '../../src/engines/contextualStandards.js'
import { STANDARDS_MANIFEST } from '../../src/constants/standards.js'
import { allCriteria } from '../../src/constants/criteria.js'
import { TONE_BANNED_TERMS } from '../../src/engine/report/cih-validation'

type Entry = {
  id: string
  citation: string
  summary: string
  rationale: string
  appliesWhen: (p: Set<string>) => boolean
}
const ENTRIES = CONTEXTUAL_STANDARDS as ReadonlyArray<Entry>

function find(id: string): Entry {
  const entry = ENTRIES.find((e) => e.id === id)
  if (!entry) throw new Error(`Missing entry: ${id}`)
  return entry
}

describe('CONTEXTUAL_STANDARDS shape', () => {
  it('exports the three criteria-selection notes', () => {
    const ids = ENTRIES.map((e) => e.id)
    expect(ids).toContain('ashrae-241-2023')
    expect(ids).toContain('epa-pm25-annual-naaqs-2024')
    expect(ids).toContain('acgih-tlv-2025')
  })

  it('every entry has all required fields, non-empty', () => {
    for (const entry of ENTRIES) {
      expect(typeof entry.id).toBe('string')
      expect(entry.id.length).toBeGreaterThan(0)
      expect(entry.citation.length).toBeGreaterThan(20)
      expect(entry.summary.length).toBeGreaterThan(0)
      // Rationale should be a substantive paragraph, not a tagline.
      expect(entry.rationale.length).toBeGreaterThan(120)
      expect(typeof entry.appliesWhen).toBe('function')
    }
  })

  it('the list and every entry in it are frozen', () => {
    expect(Object.isFrozen(CONTEXTUAL_STANDARDS)).toBe(true)
    for (const entry of ENTRIES) expect(Object.isFrozen(entry)).toBe(true)
  })
})

describe('citation provenance — primary source matches', () => {
  it('ASHRAE 241-2023 citation names the standard and its subject', () => {
    const e = find('ashrae-241-2023')
    expect(e.citation).toMatch(/ASHRAE\s+(?:Standard\s+)?241-2023/)
    expect(e.citation).toMatch(/Infectious Aerosols/i)
  })

  it('EPA PM2.5 NAAQS revision cites 89 FR 16202 and both dates', () => {
    const e = find('epa-pm25-annual-naaqs-2024')
    expect(e.citation).toMatch(/89 Fed\.\s?Reg\.\s?16202/)
    expect(e.citation).toMatch(/March 6,? 2024/)
    expect(e.citation).toMatch(/May 6,? 2024/)
    // Both the annual value and the unchanged 24-hour value must appear —
    // the entry exists to explain why the report used one and not the other.
    expect(e.rationale).toMatch(/9\s?µg\/m³|9\s?µg\/m3/)
    expect(e.rationale).toMatch(/35\s?µg\/m³|35\s?µg\/m3/)
  })

  it('ACGIH TLV 2025 cites the publishing body + year', () => {
    const e = find('acgih-tlv-2025')
    expect(e.citation).toMatch(/American Conference of Governmental Industrial Hygienists|ACGIH/)
    expect(e.citation).toMatch(/2025/)
  })
})

describe('drift guard — this list vs the criterion registry', () => {
  const registrySources = allCriteria()
    .map((c: { source: string }) => c.source)
    .join(' | ')

  // Subjects this file asserts were NOT applied. If one of these is ever
  // added to src/constants/criteria.js, the assertion below fails and the
  // corresponding entry must be rewritten or removed — it would otherwise
  // keep telling the client we did not use a criterion we now use.
  it('no criterion in the registry cites ASHRAE 241', () => {
    expect(registrySources).not.toMatch(/ASHRAE\s+(?:Standard\s+)?241/i)
  })

  it('no criterion in the registry cites ACGIH', () => {
    expect(registrySources).not.toMatch(/ACGIH|Threshold Limit Value/i)
  })

  // The annual PM2.5 case is different, and is why the guard exists: the
  // registry DOES carry `pm25_epa_annual`. The entry is therefore only
  // allowed to say the annual mean was not the basis of a finding —
  // which is true, and is a statement about averaging period, not about
  // whether the value is known to the system.
  it('the annual-PM2.5 entry rests on averaging period, not on absence from scoring', () => {
    const registryIds = allCriteria().map((c: { id: string }) => c.id)
    expect(registryIds).toContain('pm25_epa_annual')

    const rationale = find('epa-pm25-annual-naaqs-2024').rationale
    expect(rationale).toMatch(/annual mean/i)
    expect(rationale).not.toMatch(/not (currently )?integrated/i)
    expect(rationale).not.toMatch(/scoring path/i)
  })
})

describe('client-facing prose', () => {
  const allProse = ENTRIES.map((e) => `${e.summary} ${e.rationale}`).join(' ')

  it('describes criteria, not AtmosFlow internals', () => {
    // The exact vocabulary that got this section pulled from the
    // deliverable in 048f6d4.
    for (const phrase of [
      'deterministic scoring path',
      'standards manifest',
      'scoring engine',
      'AtmosFlow scoring',
      'the engine',
    ]) {
      expect(allProse.toLowerCase(), `internals language: "${phrase}"`).not.toContain(phrase.toLowerCase())
    }
  })

  it('does not reintroduce the retired "screening" label', () => {
    expect(allProse.toLowerCase()).not.toContain('screening')
  })

  it('carries no banned over-claim term', () => {
    const lower = allProse.toLowerCase()
    for (const term of TONE_BANNED_TERMS) {
      expect(lower, `banned term: "${term}"`).not.toContain(term.toLowerCase())
    }
  })
})

describe('manifest membership', () => {
  it('STANDARDS_MANIFEST has a matching bibliographic key for each entry', () => {
    expect(STANDARDS_MANIFEST['ASHRAE 241']).toBeDefined()
    expect(STANDARDS_MANIFEST['EPA PM2.5 Annual NAAQS Revision']).toBeDefined()
    expect(STANDARDS_MANIFEST['ACGIH TLVs and BEIs']).toBeDefined()
  })

  it('the pre-existing engine-relevant manifest entries are still present', () => {
    expect(STANDARDS_MANIFEST['ASHRAE 62.1']).toBeDefined()
    expect(STANDARDS_MANIFEST['OSHA Z-1 PELs']).toBeDefined()
    expect(STANDARDS_MANIFEST['EPA NAAQS']).toBeDefined()
    expect(STANDARDS_MANIFEST['IICRC S520']).toBeDefined()
    expect(STANDARDS_MANIFEST['ASHRAE 55']).toBeDefined()
    expect(STANDARDS_MANIFEST['WHO Air Quality Guidelines']).toBeDefined()
  })
})

describe('measuredParameters', () => {
  it('collects the intake keys carrying a value across all zones', () => {
    const params = measuredParameters([
      { zn: 'A', co2: '900', pm: '' },
      { zn: 'B', co: '3', tf: '72' },
    ])
    expect([...params].sort()).toEqual(['co', 'co2'])
  })

  it('treats blank, null and whitespace as not measured', () => {
    expect([...measuredParameters([{ co2: '', pm: null, co: '   ', hc: undefined }])]).toEqual([])
  })

  it('survives missing / malformed zone input', () => {
    expect([...measuredParameters(undefined)]).toEqual([])
    expect([...measuredParameters([null, 'nope', 42] as never)]).toEqual([])
  })

  it('accepts a zero reading as measured (0 ppm is a result, not a blank)', () => {
    expect([...measuredParameters([{ co: 0 }])]).toEqual(['co'])
  })
})

describe('getContextualStandards', () => {
  it('returns every entry when the caller cannot say what was measured', () => {
    for (const ctx of [undefined, null, {}, { parameters: undefined }]) {
      expect(getContextualStandards(ctx as never).map((e: Entry) => e.id)).toEqual(
        ENTRIES.map((e) => e.id),
      )
    }
  })

  // An empty collection is an ANSWER ("we know, and it was none of these"),
  // not a missing one. Reading it as unknown printed all three notes onto a
  // comfort-only walkthrough — caught end-to-end by
  // tests/components/additional-criteria-wiring.test.js.
  it('returns nothing when the caller says explicitly that none were measured', () => {
    expect(getContextualStandards({ parameters: new Set<string>() })).toEqual([])
    expect(getContextualStandards({ parameters: [] })).toEqual([])
  })

  it('returns a copy, so a caller cannot mutate the source list', () => {
    const first = getContextualStandards()
    expect(first).not.toBe(CONTEXTUAL_STANDARDS)
    first.length = 0
    expect(getContextualStandards()).toHaveLength(ENTRIES.length)
  })

  it('scopes to the parameters measured', () => {
    const ids = (p: string[]) => getContextualStandards({ parameters: p }).map((e: Entry) => e.id)
    expect(ids(['pm'])).toEqual(['epa-pm25-annual-naaqs-2024'])
    expect(ids(['co2'])).toEqual(['ashrae-241-2023'])
    expect(ids(['hc'])).toEqual(['acgih-tlv-2025'])
    expect(ids(['tv'])).toEqual(['acgih-tlv-2025'])
    expect(ids(['co2', 'pm', 'co'])).toEqual([
      'ashrae-241-2023', 'epa-pm25-annual-naaqs-2024', 'acgih-tlv-2025',
    ])
  })

  it('returns nothing for an assessment engaging none of them', () => {
    expect(getContextualStandards({ parameters: ['tf', 'rh'] })).toEqual([])
  })

  it('accepts a Set as well as an array', () => {
    expect(getContextualStandards({ parameters: new Set(['pm']) }).map((e: Entry) => e.id))
      .toEqual(['epa-pm25-annual-naaqs-2024'])
  })
})
