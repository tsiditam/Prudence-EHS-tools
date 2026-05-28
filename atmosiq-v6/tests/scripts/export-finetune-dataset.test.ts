/**
 * Tests for scripts/export-finetune-dataset.mjs — the pure
 * buildTrainingRows() function. Pins three contracts:
 *
 *   1. Non-consenting users' rows are excluded.
 *   2. Thumbs-down rows are excluded unless --include-negatives.
 *   3. Each assistant turn is paired with the immediately-
 *      preceding user turn from the SAME conversation.
 *
 * The shell side (Supabase queries, argv parsing, JSONL write)
 * is intentionally not tested here — it needs a live Supabase
 * environment. The pure function carries the load-bearing
 * filtering logic.
 */

import { describe, it, expect } from 'vitest'
import { buildTrainingRows } from '../../scripts/export-finetune-dataset.mjs'

function makeMessages() {
  return [
    // Conversation c-1, user 'consenting'
    { id: 'u1', conversation_id: 'c-1', user_id: 'consenting', role: 'user',
      content: 'What is ASHRAE 62.1?', context_view: null, created_at: '2026-05-01T10:00:00Z',
      model: null, input_tokens: null, output_tokens: null, tool_rounds: null, latency_ms: null },
    { id: 'a1', conversation_id: 'c-1', user_id: 'consenting', role: 'assistant',
      content: 'A ventilation standard for IAQ.', context_view: null, created_at: '2026-05-01T10:00:01Z',
      model: 'claude-sonnet-4-6', input_tokens: 120, output_tokens: 80, tool_rounds: 1, latency_ms: 950 },

    // Conversation c-2, user 'optedout' — these should be filtered out entirely
    { id: 'u2', conversation_id: 'c-2', user_id: 'optedout', role: 'user',
      content: 'Tell me about CO2.', context_view: null, created_at: '2026-05-02T10:00:00Z',
      model: null, input_tokens: null, output_tokens: null, tool_rounds: null, latency_ms: null },
    { id: 'a2', conversation_id: 'c-2', user_id: 'optedout', role: 'assistant',
      content: 'CO2 levels above 1000 ppm signal poor ventilation.', context_view: null, created_at: '2026-05-02T10:00:01Z',
      model: 'claude-sonnet-4-6', input_tokens: 100, output_tokens: 60, tool_rounds: 0, latency_ms: 800 },

    // Conversation c-3, user 'consenting' — assistant turn rated 👎
    { id: 'u3', conversation_id: 'c-3', user_id: 'consenting', role: 'user',
      content: 'Is mold safe?', context_view: null, created_at: '2026-05-03T10:00:00Z',
      model: null, input_tokens: null, output_tokens: null, tool_rounds: null, latency_ms: null },
    { id: 'a3', conversation_id: 'c-3', user_id: 'consenting', role: 'assistant',
      content: 'No, it definitely causes cancer.', context_view: null, created_at: '2026-05-03T10:00:01Z',
      model: 'claude-sonnet-4-6', input_tokens: 90, output_tokens: 30, tool_rounds: 0, latency_ms: 700 },
  ]
}

const CONSENTING = new Set(['consenting'])

describe('buildTrainingRows', () => {
  it('excludes turns from non-consenting users', () => {
    const messages = makeMessages()
    const rows = buildTrainingRows({
      messages,
      feedbackByMessageId: new Map(),
      consentingUserIds: CONSENTING,
      includeNegatives: false,
      systemPrompt: null,
    })
    // Expect c-1 and c-3 (both consenting), but not c-2.
    expect(rows).toHaveLength(2)
    expect(rows.map((r: any) => r.metadata.conversation_id).sort()).toEqual(['c-1', 'c-3'])
  })

  it('excludes thumbs-down rows by default', () => {
    const messages = makeMessages()
    const feedbackByMessageId = new Map([['a3', { rating: 'down', reason: 'wrong claim' }]])
    const rows = buildTrainingRows({
      messages,
      feedbackByMessageId,
      consentingUserIds: CONSENTING,
      includeNegatives: false,
      systemPrompt: null,
    })
    // Only c-1 remains (c-2 opted out, c-3 thumbs-down filtered).
    expect(rows).toHaveLength(1)
    expect(rows[0].metadata.conversation_id).toBe('c-1')
  })

  it('includes thumbs-down rows when --include-negatives is set', () => {
    const messages = makeMessages()
    const feedbackByMessageId = new Map([['a3', { rating: 'down', reason: 'wrong claim' }]])
    const rows = buildTrainingRows({
      messages,
      feedbackByMessageId,
      consentingUserIds: CONSENTING,
      includeNegatives: true,
      systemPrompt: null,
    })
    expect(rows).toHaveLength(2)
    const a3Row: any = rows.find((r: any) => r.metadata.conversation_id === 'c-3')
    expect(a3Row.metadata.feedback).toBe('down')
  })

  it('pairs each assistant turn with the immediately-preceding user turn from the same conversation', () => {
    const messages = makeMessages()
    const rows = buildTrainingRows({
      messages,
      feedbackByMessageId: new Map(),
      consentingUserIds: CONSENTING,
      includeNegatives: true,
      systemPrompt: null,
    })
    const c1Row: any = rows.find((r: any) => r.metadata.conversation_id === 'c-1')
    expect(c1Row.messages[1].content).toBe('What is ASHRAE 62.1?')
    expect(c1Row.messages[2].content).toBe('A ventilation standard for IAQ.')
    const c3Row: any = rows.find((r: any) => r.metadata.conversation_id === 'c-3')
    expect(c3Row.messages[1].content).toBe('Is mold safe?')
    expect(c3Row.messages[2].content).toBe('No, it definitely causes cancer.')
  })

  it('propagates per-turn telemetry into metadata', () => {
    const messages = makeMessages()
    const rows = buildTrainingRows({
      messages,
      feedbackByMessageId: new Map(),
      consentingUserIds: CONSENTING,
      includeNegatives: true,
      systemPrompt: null,
    })
    const c1Row: any = rows.find((r: any) => r.metadata.conversation_id === 'c-1')
    expect(c1Row.metadata.model).toBe('claude-sonnet-4-6')
    expect(c1Row.metadata.input_tokens).toBe(120)
    expect(c1Row.metadata.output_tokens).toBe(80)
    expect(c1Row.metadata.latency_ms).toBe(950)
  })

  it('uses the override system prompt when supplied', () => {
    const messages = makeMessages()
    const rows = buildTrainingRows({
      messages,
      feedbackByMessageId: new Map(),
      consentingUserIds: CONSENTING,
      includeNegatives: false,
      systemPrompt: 'custom system prompt',
    })
    expect(rows[0].messages[0].content).toBe('custom system prompt')
  })
})
