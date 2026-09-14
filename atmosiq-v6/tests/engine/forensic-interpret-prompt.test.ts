/**
 * The prompt and the gate must describe the SAME contract.
 *
 * The writer and the gate disagreeing is a defect class this codebase has
 * shipped three times, and it fails silently every time: the model writes
 * something the prompt permitted, a rule the prompt never mentioned throws it
 * away, and the reader gets less with nothing saying why. Every assertion here
 * reads the rule off the module that ENFORCES it rather than restating it, so
 * changing one without the other fails.
 */
import { describe, it, expect } from 'vitest'
import { FORENSIC_INTERPRET_SYSTEM_PROMPT as PROMPT } from '../../src/engines/forensicInterpret.js'
import { BOUNDED_PHRASES, FORENSIC_BANS } from '../../src/constants/forensic-language.js'
import { IMPORTANCE_VALUES, MAX_INTERPRETATIONS, MAX_TITLE_CHARS, MAX_ITEM_CHARS, MAX_LIST_ITEMS } from '../../src/utils/forensicValidate.js'

describe('the prompt offers exactly the vocabulary the gate permits', () => {
  it('quotes every bounded phrase the language layer names as the alternative', () => {
    // A model whose sentence is rejected without an alternative writes the same
    // sentence again. These are that alternative, and there is one list.
    BOUNDED_PHRASES.forEach((p) => expect(PROMPT, p).toContain(`"${p}"`))
  })

  it('names the claims the forensics language layer rejects', () => {
    const shouldAppear = ['proves', 'rules out', 'exonerates', 'caused by', 'due to', 'attributable to', 'responsible for', 'because of']
    shouldAppear.forEach((t) => expect(PROMPT, t).toContain(`"${t}"`))
    // And the verdicts, in the prompt's own words rather than as quoted terms.
    expect(PROMPT).toContain('safe')
    expect(PROMPT).toContain('adequate or inadequate')
    expect(PROMPT).toContain('health effect')
    expect(FORENSIC_BANS.length).toBe(8)
  })
})

describe('the prompt states the bounds the validator enforces', () => {
  it('offers every importance value and no other', () => {
    IMPORTANCE_VALUES.forEach((v) => expect(PROMPT, v).toContain(v))
    expect(PROMPT).toContain(IMPORTANCE_VALUES.join(' | '))
  })

  it('states the interpretation ceiling in the words the cap uses', () => {
    expect(MAX_INTERPRETATIONS).toBe(5)
    expect(PROMPT).toContain('At most five interpretations, one per pattern')
  })

  it('states the string and list caps', () => {
    expect(PROMPT).toContain(`under ${MAX_TITLE_CHARS} characters`)
    expect(PROMPT).toContain(`under ${MAX_ITEM_CHARS} characters`)
    expect(PROMPT).toContain('up to five strings')
    expect(MAX_LIST_ITEMS).toBe(5)
  })

  it('names every field of the schema the validator reads', () => {
    for (const key of [
      'pattern_id', 'title', 'importance', 'interpretation', 'alternative_explanations',
      'missing_context_ids', 'recommended_reviews', 'report_candidate', 'evidence_ids',
    ]) expect(PROMPT, key).toContain(`"${key}"`)
  })

  it('tells the model where an id may come from, scoped to the pattern', () => {
    expect(PROMPT).toContain('citable_evidence_ids')
    expect(PROMPT).toContain("THIS pattern's missing_context")
    expect(PROMPT).toContain('An id that is real elsewhere in the session but not on this pattern is not evidence')
  })
})

describe('the prompt asks for prose the arithmetic gate cannot reject', () => {
  it('tells the model to write no digits, and says why', () => {
    expect(PROMPT).toContain('NUMBERS ARE NOT YOURS')
    expect(PROMPT).toContain('Write no digits at all')
    expect(PROMPT).toContain('An interpretation with no numbers in it cannot fail that check')
  })

  it('gives the wording to use instead, since a rule without an alternative is ignored', () => {
    expect(PROMPT).toContain('on most of the recorded days')
    expect(PROMPT).toContain('Words are welcome. Digits are not.')
  })

  it('shows the separation the card renders', () => {
    expect(PROMPT).toContain('Evidence:')
    expect(PROMPT).toContain('Reading:')
  })
})

describe('the prompt itself contains no invented threshold', () => {
  it('does not name a numbered standard, and forbids the model naming one', () => {
    expect(PROMPT).toContain('Never name a numbered standard, threshold or guideline')
    for (const body of ['ASHRAE', 'ISO', 'EPA', 'OSHA', 'NIOSH', 'ACGIH', 'WHO', 'IICRC']) {
      expect(PROMPT, body).not.toMatch(new RegExp(String.raw`\b${body}\s*[-\u2011]?\s*\d`))
    }
    expect(PROMPT).not.toMatch(/\b(?:PEL|REL|TLV|NAAQS)\b/)
  })

  it('carries a unit-bearing figure ONLY on the illustrative evidence line', () => {
    // The example has to look like the card, or it does not teach the
    // separation it exists to teach. But a number loose in a prompt is a number
    // a model can copy, so it is pinned to the one line that is explicitly
    // labeled as something the DETERMINISTIC layer renders.
    const withFigures = PROMPT.split('\n').filter((l) => /\d\s*(?:ppm|ppb|µg\/m³|%|°F)/.test(l))
    expect(withFigures).toHaveLength(1)
    expect(withFigures[0].trim().startsWith('Evidence:')).toBe(true)
  })

  it('states that no HVAC schedule exists to be asked for', () => {
    // The one context input that is false by construction. A prompt that let
    // the model treat it as merely absent would have it recommending that the
    // assessor go and find a field the product cannot store.
    expect(PROMPT).toContain('this product captures no HVAC schedule anywhere')
  })
})
