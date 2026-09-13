/**
 * Phase 2 on the Jasper proposal channel.
 *
 * The spike's guarantees only matter if the production path runs the SAME
 * gates. It would be easy — and invisible — for the dispatcher to grow a
 * laxer copy: a quote checked loosely here, an eligibility rule approximated
 * there, and the envelope would still pass its own tests while nothing it
 * promises held in the app. So these tests exercise `dispatchTool`, the real
 * entry point, and assert the gate outcomes rather than the plumbing.
 */
import { describe, it, expect } from 'vitest'
import { dispatchTool } from '../../src/constants/field-assistant-tools.js'
import { screenFact } from '../../src/engines/intake-interpreter.js'

const turn = (assessorText: string, zone: Record<string, unknown> | null = { zn: 'Room 214' }) => ({
  assessorText,
  assessmentContext: { current_zone: zone },
})

describe('record_zone_observation runs the attestation gates', () => {
  it('records a value the assessor actually stated', async () => {
    const said = 'There is an active leak under the sill.'
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'wd', value: 'Active leak', quote: 'active leak under the sill',
      summary: 'Record water damage',
    }, turn(said))
    expect(r.status).toBe('proposed')
    expect(r.action).toMatchObject({ field: 'wd', value: 'Active leak' })
    // The words ride along to the card: the assessor is signing an evidence
    // record and the sentence it rests on is part of what they are signing.
    expect(r.action.quote).toBe('active leak under the sill')
  })

  it('refuses a severity the assessor never graded, and says why', async () => {
    const said = 'There is a musty odor in here.'
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'op', value: 'Strong / overpowering', quote: 'There is a musty odor in here',
      summary: 'Record odor',
    }, turn(said))
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('value_not_stated')
    // A bare rejection is what a model retries blindly. The message has to
    // point at the alternative, or the channel reads as an outage.
    expect(r.message).toMatch(/structured question/i)
  })

  it('refuses a quote the assessor never wrote', async () => {
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'wd', value: 'Active leak', quote: 'active leak under the sill',
      summary: 'Record water damage',
    }, turn('The room smells musty.'))
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('quote_not_in_text')
  })

  it('refuses a proposal with no quote at all', async () => {
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'wd', value: 'Active leak', summary: 'Record water damage',
    }, turn('There is an active leak under the sill.'))
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('missing_quote')
  })

  it('attests across the whole thread, not just the latest message', async () => {
    // They said it two turns ago and answered a clarifying question since.
    const thread = 'CO2 is about 1450 in here.\nYes, the east conference room.'
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'co2', value: 1450, quote: 'CO2 is about 1450 in here',
      summary: 'Record CO2',
    }, turn(thread))
    expect(r.status).toBe('proposed')
  })

  it('will not re-litigate a field the assessor already answered', async () => {
    const said = 'There is an active leak under the sill.'
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'wd', value: 'Active leak', quote: 'active leak under the sill',
      summary: 'Record water damage',
    }, turn(said, { zn: 'Room 214', wd: 'Old staining' }))
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('field_already_answered')
  })

  it('attests a BUILDING-scoped field too', async () => {
    // The writable catalog spans scopes. `dp` is declared in the building
    // interview, and an empty vocabulary there would refuse every one of
    // them silently — which reads as the model failing to propose.
    const said = "There's standing water in the drain pan."
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'dp', value: 'Standing water', quote: 'standing water in the drain pan',
      summary: 'Record drain pan',
    }, turn(said))
    expect(r.status).toBe('proposed')
    expect(r.action.scope).toBe('building')
  })

  it('fails closed when the words support two values of a single-select field', async () => {
    const said = 'The damper is stuck at minimum.'
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'od', value: 'Stuck / inoperable', quote: 'The damper is stuck at minimum',
      summary: 'Record damper',
    }, turn(said))
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('ambiguous_attestation')
  })
})

describe('ask_zone_question is the other half, not a consolation prize', () => {
  it('proposes a question the walkthrough would ask right now', async () => {
    const r: any = await dispatchTool('propose_action', {
      action_type: 'ask_zone_question',
      question_id: 'op',
      summary: 'Ask about odor strength',
    }, turn('There is a musty odor in here.'))
    expect(r.status).toBe('proposed')
    expect(r.action).toMatchObject({ type: 'ask_zone_question', question_id: 'op' })
    expect(r.action.question).toBeTruthy()
    // Accepting opens the question. It must not read as having an answer.
    expect(r.message).toMatch(/records nothing/i)
  })

  it('refuses a question the condition rules out, and lists what is eligible', async () => {
    // `sy_time` is gated on cx === 'Yes — complaints reported'. Nobody has
    // said that, so the walkthrough would not ask it — and neither may the
    // model. The condition is the app's, not a rule invented here.
    const r: any = await dispatchTool('propose_action', {
      action_type: 'ask_zone_question', question_id: 'sy_time', summary: 'Ask when',
    }, turn('People seem worse in the afternoon.'))
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('not_eligible')
    // The rejection carries what IS askable, so the model can correct rather
    // than guess again.
    expect(r.eligible_question_ids).toContain('cx')
    expect(r.eligible_question_ids).not.toContain('sy_time')
  })

  it('lets the same question through once its condition is satisfied', async () => {
    const zone = { zn: 'Room 214', cx: 'Yes — complaints reported' }
    const r: any = await dispatchTool('propose_action', {
      action_type: 'ask_zone_question', question_id: 'sy_time', summary: 'Ask when',
    }, turn('People seem worse in the afternoon.', zone))
    expect(r.status).toBe('proposed')
  })

  it('refuses a question that is already answered', async () => {
    const r: any = await dispatchTool('propose_action', {
      action_type: 'ask_zone_question', question_id: 'wd', summary: 'Ask about water',
    }, turn('anything', { zn: 'Room 214', wd: 'Active leak' }))
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('not_eligible')
  })

  it('refuses a question the catalog does not contain', async () => {
    const r: any = await dispatchTool('propose_action', {
      action_type: 'ask_zone_question', question_id: 'invented_field', summary: 'Ask',
    }, turn('anything'))
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('not_eligible')
  })

  it('refuses when no zone is open rather than guessing one', async () => {
    const r: any = await dispatchTool('propose_action', {
      action_type: 'ask_zone_question', question_id: 'op', summary: 'Ask',
    }, turn('There is a musty odor.', null))
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('no_active_zone')
  })

  it('the rejected fact and the eligible question are the SAME case', async () => {
    // The point of wiring both halves: "musty odor" cannot record a strength,
    // and the question that would settle it is open. A channel that only
    // rejected would leave the assessor with nothing.
    const said = 'There is a musty odor in here.'
    const rejected: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'op', value: 'Strong / overpowering', quote: said, summary: 'Record',
    }, turn(said))
    const asked: any = await dispatchTool('propose_action', {
      action_type: 'ask_zone_question', question_id: 'op', summary: 'Ask',
    }, turn(said))
    expect(rejected.status).toBe('rejected')
    expect(asked.status).toBe('proposed')
  })
})

describe('the dispatcher holds no second copy of the gate', () => {
  it('agrees with screenFact on the same proposal', async () => {
    const said = 'There is a musty odor in here.'
    const proposal = { field: 'op', value: 'Strong / overpowering', quote: said }
    const direct = screenFact(proposal, { zone: { zn: 'Room 214' }, text: said })
    const viaTool: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation', ...proposal, summary: 'Record',
    }, turn(said))
    expect(direct.ok).toBe(false)
    expect(viaTool.reason).toBe((direct as any).reason)
    expect(viaTool.message).toBe((direct as any).message)
  })
})
