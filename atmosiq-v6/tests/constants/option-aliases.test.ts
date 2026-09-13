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
import { ALIASES, deriveVariants, resolveOptions, variantsFor, fieldOptions } from '../../src/constants/option-aliases.js'

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
  it('every alias names a writable field and an option that field defines', () => {
    for (const [fieldId, byOption] of Object.entries(ALIASES)) {
      const opts = fieldOptions(fieldId)
      expect(opts, `${fieldId} is not a writable field with options`).toBeTruthy()
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
      const opts = fieldOptions(fieldId) || []
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

describe('resolveOptions reads the words, not the proposal', () => {
  it('matches at phrase boundaries only', () => {
    expect(resolveOptions('ot', 'A sweetener spill by the machine.')).toEqual([])
    expect(resolveOptions('ot', 'A sweet smell by the machine.')).toEqual(['Sweet'])
    // "too dry" must not be found inside "laundry".
    expect(resolveOptions('hp', 'the laundry room')).toEqual([])
  })

  it('prefers the longer phrase when one match contains another', () => {
    // "no complaints" contains "complaints"; only the longer phrase says
    // what the sentence says.
    expect(resolveOptions('cx', 'No complaints were reported.')).toEqual(['No complaints'])
    expect(resolveOptions('cx', 'Two occupants complained.')).toEqual(['Yes — complaints reported'])
  })

  it('drops a phrase the words before it deny', () => {
    expect(resolveOptions('op', 'The odor was not strong.')).toEqual([])
    expect(resolveOptions('op', "The odor isn't strong.")).toEqual([])
    expect(resolveOptions('op', 'A strong chemical odor.')).toEqual(['Strong / overpowering'])
  })

  it('does not mistake a negation INSIDE an option for a denial of it', () => {
    // "no odor" is how the None option is stated, not a denial of it.
    expect(resolveOptions('op', 'No odor detected.')).toEqual(['None'])
  })

  it('returns every option the words support, and lets the caller decide', () => {
    // Resolution reports; it does not adjudicate. A single-select caller
    // treats two as ambiguous, a multi-select caller treats two as a set.
    expect(resolveOptions('tc', 'some said too hot, others too cold')).toEqual(['Too hot', 'Too cold'])
  })

  it('is empty for an unknown field or empty quote', () => {
    expect(resolveOptions('nonexistent_field', 'anything')).toEqual([])
    expect(resolveOptions('cx', '')).toEqual([])
  })
})
