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
 */
import { describe, it, expect } from 'vitest'
import { dispatchTool } from '../../src/constants/field-assistant-tools.js'

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

  it('accepts a valid add_zone_note proposal', async () => {
    const r = await dispatchTool('propose_action', {
      action_type: 'add_zone_note',
      note_text: 'HVAC was running loud during the walkthrough.',
      zone_label: 'Zone A1',
      summary: 'Add note to Zone A1',
    }) as Record<string, unknown>
    expect(r.status).toBe('proposed')
    expect((r.action as Record<string, unknown>)).toEqual({
      type: 'add_zone_note',
      note_text: 'HVAC was running loud during the walkthrough.',
      zone_label: 'Zone A1',
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
    }) as Record<string, unknown>
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('empty_note')
  })

  it('truncates excessively long note_text to 1000 chars', async () => {
    const huge = 'x'.repeat(2000)
    const r = await dispatchTool('propose_action', {
      action_type: 'add_zone_note',
      note_text: huge,
      summary: 'X',
    }) as Record<string, unknown>
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
