/**
 * The assessor's notes reach the narrative.
 *
 * `4ffca8e` collected every free-text answer in the walkthrough into
 * AssessmentContext.narrative_inputs — budgeted, typed and tested — and
 * then nothing read it. The AI drafting the client's report built its
 * payload from the structured findings alone, so the model had never seen
 * a word the assessor typed on site. Two zone notes describing a smell in
 * a specific room, and a complaint narrative naming who reported what,
 * were carried the whole way to the request and dropped.
 *
 * Two halves are pinned here, because either alone is useless: the prose
 * reaching the payload, and the prompt rule governing what may be done
 * with it. A note is an observation the assessor recorded, not a
 * measurement and not a conclusion.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateNarrative, REASONING_SYSTEM_PROMPT as P } from '../../src/engines/narrative.js'

const ZONES = [
  { zn: 'Front Office', co2: '1450', znt: 'Musty smell strongest near the window wall, worse after rain.' },
  { zn: 'Conference', co2: '900' },
]
const ZONE_SCORES = [
  { zoneName: 'Front Office', cats: [{ l: 'Ventilation', r: [{ t: 'CO2 elevated', sev: 'high', std: 'Persily 2021' }] }] },
  { zoneName: 'Conference', cats: [{ l: 'Ventilation', r: [{ t: 'ok', sev: 'pass' }] }] },
]
const BLDG = { fn: 'Summani Plaza', ft: 'Commercial Office' }

let sent: any = null

beforeEach(() => {
  sent = null
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
    sent = JSON.parse(init.body)
    return { ok: true, json: async () => ({ text: 'draft' }) }
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

const payloadFor = async (presurvey: any, zones: any = ZONES) => {
  await generateNarrative(BLDG, zones, ZONE_SCORES, [], presurvey)
  return sent.payload
}

describe('the prose reaches the request', () => {
  it('carries zone notes, labelled with the zone the assessor was standing in', async () => {
    const p = await payloadFor({})
    expect(p.assessorNotes.zone_notes).toEqual([
      { zone_index: 0, zone_label: 'Front Office', text: 'Musty smell strongest near the window wall, worse after rain.' },
    ])
  })

  it('carries the free-text answers from the pre-survey', async () => {
    const p = await payloadFor({
      ps_complaint_narrative: 'Three staff on the north side, headaches since the roof work in June.',
    })
    const f = p.assessorNotes.fields.find((x: any) => x.field_id === 'ps_complaint_narrative')
    expect(f.text).toContain('headaches since the roof work')
    expect(f.label).toBeTruthy()
  })

  it('reports truncation rather than silently shortening', async () => {
    const p = await payloadFor({ ps_complaint_narrative: 'x'.repeat(5000) })
    expect(p.assessorNotes.truncated).toBe(true)
  })

  it('does not disturb what the payload already carried', async () => {
    const p = await payloadFor({ ps_complaint_narrative: 'Something.' })
    expect(p.facility).toBe('Summani Plaza')
    expect(p.zones).toHaveLength(2)
    expect(p.zones[0].findings[0].text).toBe('CO2 elevated')
    expect(p.standardsManifest).toBeTruthy()
  })
})

describe('nothing written means nothing sent', () => {
  it('omits the key entirely rather than sending an empty object', async () => {
    // An `assessorNotes: {}` reads to the model as "the assessor wrote
    // nothing", which is a claim about the site. The prompt's fourth limit
    // says silence in the notes means nothing, so we do not assert it.
    const p = await payloadFor({}, [{ zn: 'Front Office', co2: '1450' }, { zn: 'Conference' }])
    expect('assessorNotes' in p).toBe(false)
  })

  it('whitespace is not prose', async () => {
    const p = await payloadFor({ ps_complaint_narrative: '   \n  ' }, [{ zn: 'A', znt: '  ' }])
    expect('assessorNotes' in p).toBe(false)
  })

  it('still sends the narrative when the prose cannot be derived', async () => {
    // The draft is worth more than the notes.
    const p = await payloadFor({ get ps_complaint_narrative() { throw new Error('boom') } })
    expect(p.facility).toBe('Summani Plaza')
    expect('assessorNotes' in p).toBe(false)
  })
})

describe('the prompt governs what may be done with a note', () => {
  it('names the input and says what it is for', () => {
    expect(P).toMatch(/assessorNotes/)
    expect(P).toMatch(/observations, not conclusions/)
  })

  it('forbids a note becoming a measurement or meeting a criterion', () => {
    expect(P).toMatch(/A note is an observation, never a measurement/)
    expect(P).toMatch(/never gets compared to a criterion/)
  })

  it("forbids carrying the assessor's inference through as a conclusion", () => {
    expect(P).toMatch(/The assessor's inference is not your conclusion/)
    expect(P).toMatch(/repeating the assessor's causal claim is still a causal claim/)
  })

  it('forbids verbatim quotation into client prose', () => {
    expect(P).toMatch(/Never quote a note verbatim/)
  })

  it('forbids reading an empty note as a clean result', () => {
    expect(P).toMatch(/Silence in the notes means nothing/)
  })

  it('says what to do when a note and a measurement disagree', () => {
    expect(P).toMatch(/is not resolved by picking one/)
  })
})
