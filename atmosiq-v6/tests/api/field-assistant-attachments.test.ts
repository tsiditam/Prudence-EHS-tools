/**
 * The attachment contract on the Jasper handler.
 *
 * Two properties matter here and neither is obvious from reading the
 * handler:
 *
 *   1. The digest goes in the USER turn, not the system prompt. The system
 *      blocks carry `cache_control: ephemeral`, so anything appended to
 *      them changes the cached prefix and every turn in the session pays a
 *      cache miss. It is also the correct place on the merits: a digest is
 *      content the user supplied, not an instruction.
 *
 *   2. The system block tells the model the summary is good for THIS turn
 *      only. Nothing persists the digest, so a model that believes it can
 *      re-read the file next turn will promise something it cannot do.
 */
import { describe, it, expect } from 'vitest'
// Namespace import so the named `__test` export comes through alongside
// the default handler export.
import * as handlerMod from '../../api/field-assistant'

const { buildSystemBlocks, buildAnthropicMessages } = (handlerMod as any).__test

const DIGEST = '[Attached logger dataset — log.csv]\nReadings: 500\nParameters measured:\n  - co2: mean 812 ppm'

describe('buildAnthropicMessages with attachments', () => {
  it('appends the digest to the current user turn', () => {
    const msgs: any[] = buildAnthropicMessages([], 'Does this look like a ventilation issue?', DIGEST)
    const last = msgs[msgs.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toContain('Does this look like a ventilation issue?')
    expect(last.content).toContain('Readings: 500')
  })

  it('leaves the turn untouched when nothing is attached', () => {
    const msgs: any[] = buildAnthropicMessages([], 'Plain question')
    expect(msgs[msgs.length - 1].content).toBe('Plain question')
  })

  it('does not rewrite prior history turns', () => {
    const history = [
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'reply' },
    ] as any
    const msgs: any[] = buildAnthropicMessages(history, 'now', DIGEST)
    expect(msgs[0].content).toBe('earlier')
    expect(msgs[1].content).toBe('reply')
    expect(msgs[2].content).toContain('Readings: 500')
  })
})

describe('buildSystemBlocks with attachments', () => {
  const cached = (blocks: any[]) => blocks.filter((b) => b.cache_control)

  it('keeps the digest OUT of the system blocks', () => {
    const blocks: any[] = buildSystemBlocks({ a: 1 }, [], [{ name: 'log.csv', kind: 'sensor' }])
    const all = blocks.map((b) => b.text).join('\n')
    expect(all).not.toContain('Readings: 500')
  })

  it('leaves the cached prefix byte-identical whether or not files are attached', () => {
    const without: any[] = buildSystemBlocks({ a: 1 }, [], [])
    const withFiles: any[] = buildSystemBlocks({ a: 1 }, [], [{ name: 'log.csv', kind: 'sensor' }])
    expect(cached(withFiles).map((b) => b.text)).toEqual(cached(without).map((b) => b.text))
  })

  it('names the attached files so the model knows what it was given', () => {
    const blocks: any[] = buildSystemBlocks(undefined, [], [
      { name: 'log.csv', kind: 'sensor' },
      { name: 'emsl.pdf', kind: 'pdf' },
    ])
    const dynamic = blocks[blocks.length - 1].text
    expect(dynamic).toContain('log.csv (sensor)')
    expect(dynamic).toContain('emsl.pdf (pdf)')
    expect(dynamic).toContain('2 files')
  })

  it('states the summary is available for this turn only', () => {
    const blocks: any[] = buildSystemBlocks(undefined, [], [{ name: 'x.csv', kind: 'sensor' }])
    expect(blocks[blocks.length - 1].text).toMatch(/this turn only/i)
  })

  it('holds the screening-only line — no scoring, no cause', () => {
    const blocks: any[] = buildSystemBlocks(undefined, [], [{ name: 'x.csv', kind: 'sensor' }])
    const dynamic = blocks[blocks.length - 1].text
    expect(dynamic).toMatch(/do not score/i)
    expect(dynamic).toMatch(/compliance threshold/i)
    expect(dynamic).toMatch(/state a cause/i)
  })

  it('adds nothing at all when no file is attached', () => {
    const blocks: any[] = buildSystemBlocks({ a: 1 }, [])
    expect(blocks[blocks.length - 1].text).not.toMatch(/attached \d+ file/i)
  })
})
