/**
 * The vocabulary that decides whether a structured option was STATED.
 *
 * Two properties keep this data honest, and both matter more than the
 * entries themselves:
 *
 *   1. An alias must name a field and an option the schema actually has.
 *      An alias for an option that was renamed away silently attests
 *      nothing, which looks identical to having no alias at all.
 *   2. No alias may point at two options of the same field. An ambiguous
 *      term supports NEITHER option — listing it for one is a coin flip
 *      dressed as a rule.
 */
import { describe, it, expect } from 'vitest'
import { ALIASES, deriveVariants, variantsFor, zoneFieldOptions } from '../../src/constants/option-aliases.js'

describe('derived variants read the option string', () => {
  it('keeps the full option', () => {
    expect(deriveVariants('Moderate persistent')).toContain('moderate persistent')
  })

  it('splits an alternation into either word', () => {
    const v = deriveVariants('Faint / intermittent')
    expect(v).toContain('faint')
    expect(v).toContain('intermittent')
  })

  it('drops a defining parenthetical', () => {
    const v = deriveVariants('Small (< 10 sq ft)')
    expect(v).toContain('small')
    expect(v.some((x) => x.includes('sq ft') && x !== 'small (< 10 sq ft)')).toBe(false)
  })

  it('drops fragments too short to mean anything', () => {
    // "no" would attest half the language.
    expect(deriveVariants('No / none')).not.toContain('no')
  })

  it('is empty for an empty option', () => {
    expect(deriveVariants('')).toEqual([])
    expect(deriveVariants(null as never)).toEqual([])
  })
})

describe('the curated aliases are real and unambiguous', () => {
  it('every alias names a field and option that exist in the zone schema', () => {
    for (const [fieldId, byOption] of Object.entries(ALIASES)) {
      const opts = zoneFieldOptions(fieldId)
      expect(opts, `${fieldId} is not a zone question with options`).toBeTruthy()
      for (const option of Object.keys(byOption)) {
        expect(opts, `${fieldId}."${option}" is not an option of that field`).toContain(option)
      }
    }
  })

  it('no alias points at two options of the same field', () => {
    for (const [fieldId, byOption] of Object.entries(ALIASES)) {
      const seen = new Map<string, string>()
      for (const [option, aliases] of Object.entries(byOption)) {
        for (const a of aliases as string[]) {
          const prior = seen.get(a)
          expect(prior, `${fieldId}: "${a}" attests both "${prior}" and "${option}"`).toBeUndefined()
          seen.set(a, option)
        }
      }
    }
  })

  it('no DERIVED variant collides across options of one field either', () => {
    // The same trap, arriving from the schema rather than the curation.
    for (const fieldId of Object.keys(ALIASES)) {
      const opts = zoneFieldOptions(fieldId) || []
      const seen = new Map<string, string>()
      for (const option of opts) {
        for (const v of variantsFor(fieldId, option)) {
          const prior = seen.get(v)
          expect(prior, `${fieldId}: "${v}" attests both "${prior}" and "${option}"`).toBeUndefined()
          seen.set(v, option)
        }
      }
    }
  })

  it('aliases are lexical, not inferential', () => {
    // A symptom is not a synonym for "a complaint was reported" — that step
    // is a judgement, and judgements belong to the assessor.
    const cx = ALIASES.cx['Yes — complaints reported']
    expect(cx).not.toContain('headache')
    expect(cx).not.toContain('symptoms')
    expect(cx).toContain('complaints')
  })
})

describe('variantsFor', () => {
  it('unions the derived and curated vocabularies', () => {
    const v = variantsFor('wd', 'Active leak')
    expect(v).toContain('active leak')
    expect(v).toContain('actively leaking')
  })

  it('returns only derived variants for a field with no curation', () => {
    expect(variantsFor('nonexistent_field', 'Some Option')).toEqual(['some option'])
  })
})
