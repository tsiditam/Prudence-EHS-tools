/**
 * propose_action dispatcher — agentic action proposal payload.
 *
 * Pins the contract the client + the API SSE layer depend on:
 *   • Valid navigate proposal → status='proposed' with action+summary
 *   • Valid add_zone_note proposal → status='proposed' with note_text
 *   • Unsupported action_type → status='rejected'
 *   • Unsupported navigation target → status='rejected'
 *   • Empty note_text → status='rejected'
 *   • Inner tab_target preserved when present + valid
 *   • Untrusted long fields are truncated
 *   • Zone-scoped proposals are bound to the open zone's stable id (zid)
 *     and refused when there is no zone to bind to
 */
import { describe, it, expect } from 'vitest'
import { dispatchTool } from '../../src/constants/field-assistant-tools.js'

/**
 * Request context as the client builds it: the open zone rides along raw, and
 * `assessorText` is what the assessor themselves typed in this thread — the
 * evidence base the attestation gate checks a quote against.
 */
const inZone = (zone: Record<string, unknown>, text = '') => ({
  assessorText: text,
  assessmentContext: { current_zone: zone },
})
const ZONE_A = { zid: 'z-a', zn: 'Conference Room B' }
// A statement and the quote drawn from it, used wherever a test needs a
// proposal to clear attestation so the BINDING is what is under test.
const SAID = 'CO2 is 1450 in here right now.'
const QUOTE = 'CO2 is 1450 in here'

describe('propose_action dispatcher', () => {
  it('accepts a valid navigate proposal', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'navigate',
      target: 'history',
      summary: 'Open Reports',
    }) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    expect(r.action).toEqual({ type: 'navigate', target: 'history' })
    expect(r.summary).toBe('Open Reports')
  })

  it('preserves inner tab_target on a valid results navigation', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'navigate',
      target: 'results',
      tab_target: 'actions',
      summary: 'Show recommendations',
    }) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    expect(r.action).toEqual({ type: 'navigate', target: 'results', tab_target: 'actions' })
  })

  it('drops invalid tab_target silently', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'navigate',
      target: 'results',
      tab_target: 'bogus_tab',
      summary: 'X',
    }) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    expect(r.action).toEqual({ type: 'navigate', target: 'results' })
  })

  it('accepts a valid add_zone_note proposal, bound to the open zone', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'add_zone_note',
      note_text: 'HVAC was running loud during the walkthrough.',
      zone_label: 'Zone A1',
      summary: 'Add note to Zone A1',
    }, inZone({ zid: 'z-a' })) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    expect((r.action as Record<string, unknown>)).toEqual({
      type: 'add_zone_note',
      note_text: 'HVAC was running loud during the walkthrough.',
      zone_label: 'Zone A1',
      zid: 'z-a',
    })
  })

  it('rejects unsupported action_type', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'delete_everything',
      summary: 'Nope',
    }) as Record<string, unknown>
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('unsupported_action_type')
  })

  it('rejects unsupported navigation target', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'navigate',
      target: 'somewhere_invented',
      summary: 'X',
    }) as Record<string, unknown>
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('unsupported_target')
  })

  it('rejects empty note_text on add_zone_note', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'add_zone_note',
      note_text: '   ',
      summary: 'X',
    }, inZone(ZONE_A)) as Record<string, unknown>
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('empty_note')
  })

  it('truncates excessively long note_text to 1000 chars', async () => {
    const huge = 'x'.repeat(2000)
    const r = await dispatchTool('propose_action', {
      action_type: 'add_zone_note',
      note_text: huge,
      summary: 'X',
    }, inZone(ZONE_A)) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    expect(((r.action as Record<string, string>).note_text || '').length).toBe(1000)
  })

  it('falls back to a generic summary when none is provided', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'navigate',
      target: 'dash',
    } as never) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    expect(typeof r.summary).toBe('string')
    expect((r.summary as string).length).toBeGreaterThan(0)
  })
})

/**
 * The binding that closes the check-then-use gap. Jasper proposes while one
 * zone is open; the assessor may have walked on before tapping Accept. The
 * proposal has to say which zone it was made for, by an identity that
 * survives navigation and removal, or it must not be proposed at all.
 */
describe('propose_action zone binding', () => {
  it('binds record_zone_observation in zone scope to the open zone by zid', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'co2',
      value: 1450,
      quote: QUOTE,
      summary: 'Record CO2',
    }, inZone(ZONE_A, SAID)) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    const action = r.action as Record<string, unknown>
    expect(action.scope).toBe('zone')
    expect(action.zid).toBe('z-a')
  })

  it('names the bound zone on the card, over the label the model believed', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'co2',
      value: 1450,
      quote: QUOTE,
      zone_label: 'Room 204',
      summary: 'Record CO2',
    }, inZone(ZONE_A, SAID)) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    // The card says where the write lands; that is the bound zone's name.
    expect((r.action as Record<string, unknown>).zone_label).toBe('Conference Room B')
  })

  it('keeps the model label only when the bound zone has no name', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'add_zone_note',
      note_text: 'Loud return grille.',
      zone_label: 'Zone A1',
      summary: 'X',
    }, inZone({ zid: 'z-a', zn: '   ' }, 'Loud return grille.')) as Record<string, unknown>
    expect((r.action as Record<string, unknown>).zone_label).toBe('Zone A1')
    expect((r.action as Record<string, unknown>).zid).toBe('z-a')
  })

  it('refuses a zone-scoped write with no zone open — never "whichever zone is open at tap time"', async () => {
    // Every entry carries the assessor's words, so attestation passes and the
    // missing binding is the only thing left to refuse the proposal. (With no
    // context at all a record proposal is refused earlier still, for having no
    // quote to check — asserted separately above.)
    const nowhere = [
      { assessorText: SAID },
      { assessorText: SAID, assessmentContext: {} },
      inZone({ zn: 'Named but id-less' }, SAID),
      inZone({ zid: '  ' }, SAID),
    ]
    for (const ctx of nowhere) {
      const note = await dispatchTool('propose_action', {
        action_type: 'add_zone_note',
        note_text: 'Loud return grille.',
        summary: 'X',
      }, ctx as never) as Record<string, unknown>
      expect(note.status).toBe('rejected')
      expect(note.reason).toBe('no_zone_binding')
      // The quote clears attestation, so the only thing left to refuse it is
      // the missing binding — which is what this asserts.
      const record = await dispatchTool('propose_action', {
        action_type: 'record_zone_observation',
        field: 'co2',
        value: 1450,
        quote: QUOTE,
        summary: 'X',
      }, ctx as never) as Record<string, unknown>
      expect(record.status).toBe('rejected')
      expect(record.reason).toBe('no_zone_binding')
    }
    // And with no request context whatsoever, a note — which needs no quote —
    // still has nowhere to land.
    const bare = await dispatchTool('propose_action', {
      action_type: 'add_zone_note',
      note_text: 'Loud return grille.',
      summary: 'X',
    }) as Record<string, unknown>
    expect(bare.status).toBe('rejected')
    expect(bare.reason).toBe('no_zone_binding')
  })

  it('binds ask_zone_question to the zone its eligibility was judged in', async () => {
    // The question was screened against ONE zone's record — its display
    // condition and its unanswered-ness were read there. Opening it anywhere
    // else asks a question that zone was never judged to need.
    const r = await dispatchTool('propose_action', {
      action_type: 'ask_zone_question',
      question_id: 'cx',
      summary: 'Ask about complaints',
    }, inZone(ZONE_A, 'People keep mentioning headaches in here.')) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    const action = r.action as Record<string, unknown>
    expect(action.question_id).toBe('cx')
    expect(action.zid).toBe('z-a')
  })

  it('does not bind a building-scoped observation or a navigation, and needs no zone for them', async () => {
    // A building-scoped field names no room, so it proposes with no zone
    // open at all — requiring one would refuse a proposal correct anywhere.
    const building = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation',
      field: 'dp',
      value: 'Standing water',
      quote: 'standing water in the drain pan',
      summary: 'X',
    }, { assessorText: "There's standing water in the drain pan." }) as Record<string, unknown>
    if (building.status !== 'proposed') throw new Error(`expected a building-scoped field to propose: ${JSON.stringify(building)}`)
    expect((building.action as Record<string, unknown>).scope).toBe('building')
    expect((building.action as Record<string, unknown>).zid).toBeUndefined()

    const nav = await dispatchTool('propose_action', {
      action_type: 'navigate',
      target: 'results',
      summary: 'X',
    }, inZone(ZONE_A, SAID)) as Record<string, unknown>
    expect(nav.status).toBe('proposed')
    expect(nav.action).toEqual({ type: 'navigate', target: 'results' })
  })
})
