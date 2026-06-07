/**
 * Vercel Serverless Function — /api/field-assistant
 *
 * Streaming conversational endpoint that powers the in-app Field
 * Assistant agent. Modeled on /api/narrative.js (same auth, same
 * rate-limit + ledger shape) with two material differences:
 *
 *   1. Response is Server-Sent Events (SSE), not a single JSON body —
 *      the UI streams tokens for a chat-quality experience.
 *   2. Conversation history persists in field_assistant_conversations
 *      and field_assistant_messages so the assessor can resume a
 *      conversation across sessions.
 *
 * The grounding corpus (role + standards + FAQ) is sent as Anthropic
 * cache_control:'ephemeral' system blocks so the bulk of input tokens
 * (~25–35K) hit the cache after the first warm request.
 *
 * Hard constraints (engine-sacred):
 *   • This handler MUST NOT import from src/engines/* or src/engine/*.
 *   • The agent never assigns scores or risk classifications — that's
 *     the engine's domain. Refusal phrasing lives in the role prompt.
 *
 * Quota (per user, per generation_type='field_assistant'):
 *   • 15 messages / 60s rolling window  (burst protection)
 *   • 150 messages / 24h rolling window (daily ceiling)
 *   • 10 messages / 24h on the free plan
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { FIELD_ASSISTANT_ROLE_PROMPT } from '../src/constants/field-assistant-prompt.js'
import { STANDARDS_FOR_AGENT, FAQ_FOR_AGENT } from '../src/constants/field-assistant-corpus.js'
import { FIELD_ASSISTANT_TOOLS, dispatchTool } from '../src/constants/field-assistant-tools.js'
// IMPORTANT: do NOT import lib/report-templates/render here. That
// pulls docxtemplater + pizzip into every Jasper cold-start, and an
// earlier attempt at that wiring crashed the function in production.
// The generate_report tool now returns a render PROPOSAL — the
// client invokes /api/report-templates-render on its own (mirrors
// the propose_action pattern). Heavy deps stay in their dedicated
// endpoint and the Jasper hot path stays lean.
import { scrubPii } from '../lib/sentry.js'
import { auditLog } from './_audit.js'
import { hasUnlimitedUsage } from '../lib/unlimited-usage.js'
import { lintJasperOutput, checkUnbackedThresholds, buildRevisionInstruction, SAFE_FALLBACK } from './_jasper-lint.js'

// ── Quota / model / pricing ────────────────────────────────────────
const PER_MINUTE_LIMIT = 15
const PER_DAY_LIMIT = 150
const FREE_TIER_DAILY_CAP = 10
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const GENERATION_TYPE = 'field_assistant'
// $/M tokens — keep in sync with Anthropic pricing.
const COST_INPUT_PER_M = 3
const COST_OUTPUT_PER_M = 15
// Cache reads bill at 10% of regular input; cache writes at 125%.
const COST_CACHE_READ_PER_M = 0.3
const COST_CACHE_WRITE_PER_M = 3.75

// Raised from 800 → 1800: real four-section answers were truncating
// mid-sentence in "Recommended next steps". Output bills at $15/M, so the
// extra ~1000-token headroom adds at most ~$0.015 per turn worst case.
const MAX_OUTPUT_TOKENS = 1800
const MAX_USER_MESSAGE_LEN = 4000
const TITLE_TRUNCATE_LEN = 80
// Cap conversation history sent to the model. Going further back hurts
// latency without improving answer quality for field-triage questions.
const MAX_HISTORY_TURNS = 20
// Hard cap on the agent's tool-use loop per request. The agent
// typically resolves an answer in 1–2 tool calls; >4 indicates a stuck
// loop and we cut it off rather than spend tokens spinning.
const MAX_TOOL_ROUNDS = 4
// L4 photo attachments. Caps keep the request body under Vercel's
// ~4.5MB hobby-tier limit and protect against accidental large uploads.
const MAX_PHOTOS_PER_REQUEST = 5
const MAX_PHOTO_BYTES = 2_000_000 // ~2MB per photo, base64-decoded estimate

interface VercelLikeRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  socket?: { remoteAddress?: string }
}
interface VercelLikeResponse {
  status: (code: number) => VercelLikeResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
  write: (chunk: string) => void
  end: () => void
}

type FaMessageRow = { role: 'user' | 'assistant'; content: string; created_at: string }
type RequestContext = Record<string, unknown> | undefined

// ── Test injection hooks (mirrors api/narrative.js pattern) ────────
let _supabase: SupabaseClient | null = null
let _fetch: typeof fetch | null = null
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createClient(url, key)
}
function getFetch(): typeof fetch {
  return _fetch || (global.fetch as typeof fetch)
}

function friendlyUpstreamError(raw: string): string {
  if (raw.includes('credit balance')) {
    return 'The AI assistant is temporarily unavailable due to a billing issue. Please contact your administrator.'
  }
  if (raw.startsWith('upstream_429')) {
    return 'The AI assistant is receiving too many requests. Please wait a moment and try again.'
  }
  if (raw.startsWith('upstream_401')) {
    return 'AI assistant authentication failed. Please contact your administrator.'
  }
  if (raw.startsWith('upstream_5')) {
    return 'The AI service is temporarily unavailable. Please try again in a few minutes.'
  }
  if (raw.startsWith('upstream_')) {
    return 'The AI assistant encountered an unexpected error. Please try again.'
  }
  return raw
}

function estimateCost(
  inputTokens: number | null,
  outputTokens: number | null,
  cacheCreate: number | null,
  cacheRead: number | null,
): number | null {
  if (inputTokens == null || outputTokens == null) return null
  const usd =
    (inputTokens * COST_INPUT_PER_M +
      outputTokens * COST_OUTPUT_PER_M +
      (cacheCreate || 0) * COST_CACHE_WRITE_PER_M +
      (cacheRead || 0) * COST_CACHE_READ_PER_M) /
    1_000_000
  return Math.round(usd * 10000) / 10000
}

async function countRowsSince(
  supabase: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('narrative_generations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('generation_type', GENERATION_TYPE)
    .gte('generated_at', sinceIso)
  if (error) throw new Error(error.message)
  return count || 0
}

async function findOldestSince(
  supabase: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('narrative_generations')
    .select('generated_at')
    .eq('user_id', userId)
    .eq('generation_type', GENERATION_TYPE)
    .gte('generated_at', sinceIso)
    .order('generated_at', { ascending: true })
    .limit(1)
    .single()
  return data && data.generated_at ? data.generated_at : null
}

interface RateLimitResult {
  ok: boolean
  scope?: 'per_minute' | 'per_day' | 'free_tier_daily'
  retry_after?: number
}

async function checkRateLimits(
  supabase: SupabaseClient,
  userId: string,
  plan: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const oneMinAgo = new Date(now - 60_000).toISOString()
  const oneDayAgo = new Date(now - 24 * 60 * 60_000).toISOString()

  const minuteCount = await countRowsSince(supabase, userId, oneMinAgo)
  if (minuteCount >= PER_MINUTE_LIMIT) {
    const oldest = await findOldestSince(supabase, userId, oneMinAgo)
    const retryAt = oldest ? new Date(oldest).getTime() + 60_000 : now + 60_000
    const retryAfter = Math.max(1, Math.ceil((retryAt - now) / 1000))
    return { ok: false, scope: 'per_minute', retry_after: retryAfter }
  }

  const dayCount = await countRowsSince(supabase, userId, oneDayAgo)
  if (plan === 'free' && dayCount >= FREE_TIER_DAILY_CAP) {
    return { ok: false, scope: 'free_tier_daily', retry_after: 24 * 60 * 60 }
  }
  if (dayCount >= PER_DAY_LIMIT) {
    return { ok: false, scope: 'per_day', retry_after: 24 * 60 * 60 }
  }
  return { ok: true }
}

async function loadHistory(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<FaMessageRow[]> {
  const { data, error } = await supabase
    .from('field_assistant_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY_TURNS * 2 + 10)
  if (error) return []
  return (data || []) as FaMessageRow[]
}

async function ensureConversation(
  supabase: SupabaseClient,
  conversationId: string | null,
  userId: string,
  firstMessage: string,
): Promise<string> {
  if (conversationId) return conversationId
  const title = firstMessage.slice(0, TITLE_TRUNCATE_LEN)
  const { data, error } = await supabase
    .from('field_assistant_conversations')
    .insert({ user_id: userId, title })
    .select('id')
    .single()
  if (error || !data) {
    throw new Error('failed_to_create_conversation: ' + (error?.message || 'unknown'))
  }
  return data.id as string
}

function buildSystemBlocks(
  context: RequestContext,
  photoIndex: Array<{ id: string; label: string | null }> = [],
) {
  const baseContext = context
    ? `Current assessor context (passed at request time, do not assume any other state):\n${JSON.stringify(
        context,
        null,
        2,
      )}`
    : 'No assessment context provided — the assessor is asking a general question.'
  const photoBlock =
    photoIndex.length > 0
      ? `\n\nAvailable photos in this conversation (call analyze_photo with one of these IDs):\n${photoIndex
          .map((p) => `  - id: "${p.id}"${p.label ? `  (label: "${p.label}")` : ''}`)
          .join('\n')}`
      : '\n\nNo photos are attached to this conversation. analyze_photo will return no_photos_attached if called.'
  const contextBlock = baseContext + photoBlock
  return [
    { type: 'text', text: FIELD_ASSISTANT_ROLE_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: STANDARDS_FOR_AGENT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: FAQ_FOR_AGENT, cache_control: { type: 'ephemeral' } },
    // Dynamic block (uncached) — kept last so the cached prefix above
    // is identical across requests within a user's session.
    { type: 'text', text: contextBlock },
  ]
}

function buildAnthropicMessages(history: FaMessageRow[], userMessage: string) {
  // Drop the oldest turns past the cap so the prompt size stays bounded.
  const trimmed = history.slice(-MAX_HISTORY_TURNS * 2)
  return [
    ...trimmed.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage },
  ]
}

async function callAnthropicStream(
  apiKey: string,
  systemBlocks: unknown,
  messages: unknown,
): Promise<Response> {
  const fetchFn = getFetch()
  return fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Low temperature: this is a defensibility tool. We want consistent,
      // conservative output, not creative variance. Facts, citations, and
      // the four-section format must stay intact across runs.
      temperature: 0.2,
      stream: true,
      system: systemBlocks,
      messages,
      tools: FIELD_ASSISTANT_TOOLS,
    }),
  }) as Promise<Response>
}

function writeSse(res: VercelLikeResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * Slim down tool input for the tool_start SSE event so the UI can
 * show a specific status line ("Searching for: CO₂ thresholds")
 * without us shipping photo blobs or huge JSON payloads through
 * the stream. Returns only short string / number / boolean fields.
 */
function safeInputPreview(input: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && v.length <= 200) out[k] = v
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
  }
  return out
}

interface ToolUseBlock {
  id: string
  name: string
  inputJson: string
}

interface StreamResult {
  text: string
  inputTokens: number | null
  outputTokens: number | null
  cacheCreate: number | null
  cacheRead: number | null
  stopReason: string | null
  /**
   * Content blocks the agent emitted in order — preserved so we can
   * round-trip them back as an `assistant` message when running a
   * tool-use turn. Anthropic requires the assistant message echo
   * before tool_result blocks are accepted.
   */
  contentBlocks: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >
  toolUses: ToolUseBlock[]
}

async function pumpAnthropicStream(
  upstream: Response,
  res: VercelLikeResponse,
): Promise<StreamResult> {
  if (!upstream.body) throw new Error('anthropic returned no body')
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const acc: StreamResult = {
    text: '',
    inputTokens: null,
    outputTokens: null,
    cacheCreate: null,
    cacheRead: null,
    stopReason: null,
    contentBlocks: [],
    toolUses: [],
  }
  // Per-content-block scratchpad indexed by Anthropic's block index.
  const blockState = new Map<
    number,
    { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; inputJson: string }
  >()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    // Anthropic SSE frames are separated by \n\n.
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))
      if (!dataLine) continue
      let payload: any
      try {
        payload = JSON.parse(dataLine.slice(6))
      } catch {
        continue
      }
      if (payload.type === 'content_block_start') {
        const i = payload.index as number
        const block = payload.content_block
        if (block?.type === 'text') {
          blockState.set(i, { type: 'text', text: '' })
        } else if (block?.type === 'tool_use') {
          blockState.set(i, {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            inputJson: '',
          })
        }
      } else if (payload.type === 'content_block_delta') {
        const i = payload.index as number
        let state = blockState.get(i)
        // Tolerant: production streams always emit content_block_start
        // before a delta, but some test fixtures skip it. Auto-init
        // as a text block if a text_delta arrives unannounced.
        if (!state && payload.delta?.type === 'text_delta') {
          state = { type: 'text', text: '' }
          blockState.set(i, state)
        }
        if (!state) continue
        if (payload.delta?.type === 'text_delta' && state.type === 'text') {
          const tok = payload.delta.text as string
          state.text += tok
          acc.text += tok
          writeSse(res, 'token', { text: tok })
        } else if (payload.delta?.type === 'input_json_delta' && state.type === 'tool_use') {
          state.inputJson += payload.delta.partial_json || ''
        }
      } else if (payload.type === 'content_block_stop') {
        const i = payload.index as number
        const state = blockState.get(i)
        if (!state) continue
        if (state.type === 'text') {
          acc.contentBlocks.push({ type: 'text', text: state.text })
        } else if (state.type === 'tool_use') {
          let input: Record<string, unknown> = {}
          try {
            input = state.inputJson ? JSON.parse(state.inputJson) : {}
          } catch {
            // Malformed tool input — let the dispatcher handle it.
            input = {}
          }
          acc.contentBlocks.push({ type: 'tool_use', id: state.id, name: state.name, input })
          acc.toolUses.push({ id: state.id, name: state.name, inputJson: state.inputJson })
        }
      } else if (payload.type === 'message_start' && payload.message?.usage) {
        const u = payload.message.usage
        acc.inputTokens = (acc.inputTokens || 0) + (u.input_tokens || 0)
        acc.cacheCreate = (acc.cacheCreate || 0) + (u.cache_creation_input_tokens || 0)
        acc.cacheRead = (acc.cacheRead || 0) + (u.cache_read_input_tokens || 0)
      } else if (payload.type === 'message_delta' && payload.usage) {
        const u = payload.usage
        acc.outputTokens = (acc.outputTokens || 0) + (u.output_tokens || 0)
        if (payload.delta?.stop_reason) acc.stopReason = payload.delta.stop_reason
      }
    }
  }
  return acc
}

/**
 * Run the agent's tool-use loop. Streams every assistant turn's text
 * to the SSE response. On a tool_use stop_reason we dispatch the
 * tool(s), append assistant + tool_result messages, and call the
 * model again with the same tools array — up to MAX_TOOL_ROUNDS to
 * prevent runaway loops. The final assistant text is the
 * concatenation of all text the model emitted across turns (so the
 * persisted history reflects the full answer even when intermediate
 * tool turns produced partial text).
 */
interface PhotoEntry {
  id: string
  dataUrl: string
  label?: string | null
}
interface VisionUsageRecord {
  photo_id: string
  focus: string
  input_tokens: number | null
  output_tokens: number | null
  confidence: string
}
interface ToolDispatchContext {
  photos: Map<string, PhotoEntry>
  anthropicApiKey: string
  fetchFn: typeof fetch
  recordVisionUsage: (u: VisionUsageRecord) => void
  // generate_report support — the dispatcher RESOLVES which template
  // (via supabase) and returns a structured proposal. The actual
  // .docx render happens client-side via /api/report-templates-render
  // so docxtemplater never bundles into this function. No renderer
  // is injected here.
  supabase: SupabaseClient
  userId: string
  assessmentContext: Record<string, unknown> | undefined
}

async function runAgentLoop(
  apiKey: string,
  systemBlocks: unknown,
  initialMessages: Array<{ role: string; content: unknown }>,
  res: VercelLikeResponse,
  toolCtx: ToolDispatchContext,
): Promise<StreamResult & {
  rounds: number
  toolCalls: Array<{ name: string; input: unknown; resultStatus: string }>
  // Final message history (incl. tool_use / tool_result blocks) so the
  // output-safety retry can append a revision turn and reuse tool results
  // without re-running the agent loop.
  messages: Array<{ role: string; content: unknown }>
}> {
  const messages: Array<{ role: string; content: unknown }> = initialMessages.slice()
  const toolCalls: Array<{ name: string; input: unknown; resultStatus: string }> = []
  let combinedText = ''
  let totalInput = 0
  let totalOutput = 0
  let totalCacheCreate = 0
  let totalCacheRead = 0
  let lastStopReason: string | null = null
  let rounds = 0

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds += 1
    const upstream = await callAnthropicStream(apiKey, systemBlocks, messages)
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '')
      throw new Error(`upstream_${upstream.status}: ${errText || 'no_body'}`)
    }
    const turn = await pumpAnthropicStream(upstream, res)
    combinedText += turn.text
    totalInput += turn.inputTokens || 0
    totalOutput += turn.outputTokens || 0
    totalCacheCreate += turn.cacheCreate || 0
    totalCacheRead += turn.cacheRead || 0
    lastStopReason = turn.stopReason

    if (turn.stopReason !== 'tool_use' || turn.toolUses.length === 0) {
      // Final turn — agent is done.
      break
    }

    // Echo the assistant turn (text + tool_use blocks, in order).
    messages.push({ role: 'assistant', content: turn.contentBlocks })

    // Dispatch every tool the model requested in this turn, then
    // append a single user message containing all tool_result blocks
    // (Anthropic requires one tool_result per tool_use_id, in any
    // order, but all in one message).
    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
    for (const block of turn.contentBlocks) {
      if (block.type !== 'tool_use') continue
      // Emit a tool_start event BEFORE awaiting the tool so the UI
      // can render "Searching ASHRAE 62.1…" / "Analyzing photo…"
      // while the dispatcher is still running. Without this the
      // tool_call event only arrives after the tool finishes, and
      // the user just sees a blank thinking indicator while it
      // works. Paired with the existing tool_call (completion)
      // event below.
      writeSse(res, 'tool_start', {
        id: block.id,
        name: block.name,
        // Echo a small, JSON-safe subset of inputs so the UI can
        // be more specific ("Searching for: CO2 thresholds") if it
        // wants to. We avoid echoing photos or large blobs.
        input: safeInputPreview(block.input),
      })
      const result = await dispatchTool(block.name, block.input, toolCtx)
      toolCalls.push({ name: block.name, input: block.input, resultStatus: (result && (result as any).status) || 'unknown' })
      writeSse(res, 'tool_call', {
        id: block.id,
        name: block.name,
        status: (result && (result as any).status) || 'unknown',
      })
      // Side-channel SSE event for agentic propose_action results.
      // The tool returns a structured action payload that the
      // client uses to render an Accept / Reject card inline in
      // the chat. The tool_call (completion) event above tells the
      // UI that the agent has finished its tool call; this
      // proposed_action event carries the actual proposal so the
      // client can construct the card without parsing the
      // model's free-text follow-up.
      if (
        block.name === 'propose_action'
        && result
        && (result as any).status === 'proposed'
        && (result as any).action
      ) {
        writeSse(res, 'proposed_action', {
          id: block.id,
          action: (result as any).action,
          summary: (result as any).summary || '',
        })
      }
      // Side-channel SSE event for generate_report results. The
      // dispatcher returns a render PROPOSAL — template metadata
      // only, no bytes. The client picks up this event and calls
      // /api/report-templates-render on its own (mirrors the
      // propose_action pattern). This keeps docxtemplater out of
      // the Jasper hot path entirely.
      if (
        block.name === 'generate_report'
        && result
        && (result as any).status === 'render_proposed'
        && (result as any).template_id
      ) {
        writeSse(res, 'render_proposed', {
          id: block.id,
          template_id: (result as any).template_id,
          template_name: (result as any).template_name || null,
          file_name: (result as any).file_name || 'Report.docx',
        })
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  if (rounds >= MAX_TOOL_ROUNDS && lastStopReason === 'tool_use') {
    // We hit the loop cap — surface a graceful note in the stream so
    // the assessor knows the agent didn't finish on its own.
    const note = '\n\n(Agent reached its tool-call budget for this turn; finalize the answer with the data already retrieved.)'
    writeSse(res, 'token', { text: note })
    combinedText += note
  }

  return {
    text: combinedText,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheCreate: totalCacheCreate || null,
    cacheRead: totalCacheRead || null,
    stopReason: lastStopReason,
    contentBlocks: [],
    toolUses: [],
    rounds,
    toolCalls,
    messages,
  }
}

// ── Output safety: buffered revision + linter ──────────────────────────
// Non-streamed single model call at a fixed temperature, used only for
// the output-safety retry. tool_choice 'none' forces a textual final
// answer (no tool use), and the full tool array is still sent because the
// message history contains tool_use/tool_result blocks.
async function callAnthropicOnce(
  apiKey: string,
  systemBlocks: unknown,
  messages: unknown,
  opts: { temperature: number; maxTokens: number },
): Promise<{ text: string; inputTokens: number; outputTokens: number; cacheRead: number; cacheCreate: number }> {
  const fetchFn = getFetch()
  const upstream = (await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      stream: false,
      system: systemBlocks,
      messages,
      tools: FIELD_ASSISTANT_TOOLS,
      tool_choice: { type: 'none' },
    }),
  })) as Response
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '')
    throw new Error(`upstream_${upstream.status}: ${errText || 'no_body'}`)
  }
  const data: any = await upstream.json().catch(() => null)
  const blocks: any[] = data && Array.isArray(data.content) ? data.content : []
  const text = blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
  const u = (data && data.usage) || {}
  return {
    text,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
  }
}

interface LintOutcome {
  tripped: boolean
  phrases: string[]
  retried: boolean
  retry_fixed: boolean
  fallback_used: boolean
}

/**
 * Deterministic output linter for the streamed Jasper answer. Runs on the
 * fully-assembled text AFTER the stream completes and BEFORE persistence.
 *
 * The answer was already streamed token-by-token and cannot be un-sent, so
 * on a lint hit we: (1) retry once at temperature 0 with a revision
 * instruction appended to the loop's message history, (2) re-lint, and if
 * it still trips, substitute a screening-safe fallback. The final text is
 * emitted to the client via a `replace` SSE event (the client swaps the
 * rendered bubble) and ONLY the clean/fallback text is persisted. Retry
 * token usage is returned so the ledger/cost reflect reality.
 */
async function enforceJasperOutputSafety(
  apiKey: string,
  systemBlocks: unknown,
  result: Awaited<ReturnType<typeof runAgentLoop>>,
  res: VercelLikeResponse,
  // Whether a retrieval tool (lookup_exposure_limit / search_standards_corpus)
  // ran THIS turn — satisfies the tool-backed-threshold requirement. Stays
  // constant across the retry (the retry reuses the turn's tool results).
  retrievalUsed: boolean,
): Promise<{
  finalText: string
  lint: LintOutcome
  extraInput: number
  extraOutput: number
  extraCacheRead: number
  extraCacheCreate: number
}> {
  // Combine prohibited-language hits with unbacked-threshold hits.
  const lintFor = (text: string) => [
    ...lintJasperOutput(text),
    ...checkUnbackedThresholds(text, { retrievalUsed }),
  ]
  const firstHits = lintFor(result.text)
  const lint: LintOutcome = {
    tripped: firstHits.length > 0,
    phrases: Array.from(new Set(firstHits.map((h: { term: string }) => h.term))),
    retried: false,
    retry_fixed: false,
    fallback_used: false,
  }
  const zero = { extraInput: 0, extraOutput: 0, extraCacheRead: 0, extraCacheCreate: 0 }
  if (firstHits.length === 0) {
    return { finalText: result.text, lint, ...zero }
  }

  console.warn('[field-assistant] output lint tripped:', lint.phrases.join(', '))
  lint.retried = true

  const revisionMessages = [
    ...result.messages,
    { role: 'assistant', content: result.text },
    { role: 'user', content: buildRevisionInstruction(firstHits) },
  ]

  let retry: Awaited<ReturnType<typeof callAnthropicOnce>> | null = null
  try {
    retry = await callAnthropicOnce(apiKey, systemBlocks, revisionMessages, {
      temperature: 0,
      maxTokens: MAX_OUTPUT_TOKENS,
    })
  } catch (err) {
    console.error('[field-assistant] revision call failed:', err instanceof Error ? err.message : String(err))
  }

  const extra = retry
    ? {
        extraInput: retry.inputTokens,
        extraOutput: retry.outputTokens,
        extraCacheRead: retry.cacheRead,
        extraCacheCreate: retry.cacheCreate,
      }
    : zero

  let finalText: string
  if (retry && retry.text && lintFor(retry.text).length === 0) {
    finalText = retry.text
    lint.retry_fixed = true
  } else {
    finalText = SAFE_FALLBACK
    lint.fallback_used = true
  }

  // The violating text was already streamed; tell the client to replace
  // the rendered bubble with the corrected / fallback answer.
  writeSse(res, 'replace', { text: finalText })
  return { finalText, lint, ...extra }
}

interface TurnTelemetry {
  model?: string
  inputTokens?: number | null
  outputTokens?: number | null
  toolRounds?: number | null
  latencyMs?: number | null
}

async function persistTurn(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  contextView: string | null,
  // Optional: explicit row id (UUID). Pre-generated by the handler
  // so the SSE meta event can hand the client the DB-row id of the
  // upcoming assistant turn — that's what the feedback affordance
  // attaches its thumbs-up / thumbs-down rating to.
  id?: string,
  // Optional: telemetry columns added in migration 015 so the
  // export pipeline reads model + token + latency from the row
  // itself (no audit-log join required). User-turn calls don't
  // populate this; assistant-turn calls populate everything.
  telemetry?: TurnTelemetry,
): Promise<void> {
  // Scrub PII on the persisted copy. The in-flight copy already sent
  // to Anthropic is raw — assessors expect facility-specific answers.
  const scrubbed = scrubPii({ content }).content
  const row: Record<string, unknown> = {
    conversation_id: conversationId,
    user_id: userId,
    role,
    content: scrubbed,
    context_view: contextView,
  }
  if (id) row.id = id
  if (telemetry) {
    if (telemetry.model)         row.model         = telemetry.model
    if (telemetry.inputTokens  != null) row.input_tokens  = telemetry.inputTokens
    if (telemetry.outputTokens != null) row.output_tokens = telemetry.outputTokens
    if (telemetry.toolRounds   != null) row.tool_rounds   = telemetry.toolRounds
    if (telemetry.latencyMs    != null) row.latency_ms    = telemetry.latencyMs
  }
  await supabase.from('field_assistant_messages').insert(row)
}

async function recordGeneration(
  supabase: SupabaseClient,
  userId: string,
  inputTokens: number | null,
  outputTokens: number | null,
  cost: number | null,
): Promise<void> {
  try {
    await supabase.from('narrative_generations').insert({
      user_id: userId,
      generation_type: GENERATION_TYPE,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[field-assistant] failed to record generation:', msg)
  }
}

// ── Handler ────────────────────────────────────────────────────────
async function handler(req: VercelLikeRequest, res: VercelLikeResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Server misconfigured — missing API key', code: 'fa_init_000' })
    return
  }

  const authHeader =
    (req.headers.authorization as string | undefined) ||
    (req.headers.Authorization as string | undefined)
  if (!authHeader) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  // Supabase client construction — fails fast if env is missing so
  // we don't get an uncaught 500 with no body. Every implicit-throw
  // path below the SSE-headers point gets a `code` so the next time
  // a user reports "Server error (500)" we can match it to a path
  // by reading the response body in DevTools.
  let supabase: SupabaseClient
  try {
    supabase = getSupabase()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[field-assistant] supabase init failed:', msg)
    res.status(500).json({ error: 'supabase_init_failed', code: 'fa_init_001', detail: msg })
    return
  }

  let user: { id: string; email?: string } | null = null
  try {
    const result = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (result.error || !result.data.user) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    user = result.data.user as { id: string; email?: string }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[field-assistant] auth lookup threw:', msg)
    res.status(500).json({ error: 'auth_lookup_failed', code: 'fa_init_002', detail: msg })
    return
  }

  // Body validation
  const body = (req.body || {}) as {
    conversation_id?: string | null
    message?: string
    context?: RequestContext
    photos?: Array<{ id?: string; dataUrl?: string; label?: string }>
  }
  const userMessage = typeof body.message === 'string' ? body.message.trim() : ''
  if (!userMessage) {
    res.status(400).json({ error: 'Missing message in request body' })
    return
  }
  if (userMessage.length > MAX_USER_MESSAGE_LEN) {
    res.status(400).json({ error: `Message exceeds ${MAX_USER_MESSAGE_LEN} characters` })
    return
  }

  // L4 photos — validate, build the per-request photo map, and assemble
  // a short list of {id, label} entries to expose to Claude via the
  // dynamic context block so it knows which IDs are callable.
  const photoMap = new Map<string, PhotoEntry>()
  const photoIndex: Array<{ id: string; label: string | null }> = []
  if (Array.isArray(body.photos) && body.photos.length > 0) {
    if (body.photos.length > MAX_PHOTOS_PER_REQUEST) {
      res.status(400).json({
        error: `photos array exceeds ${MAX_PHOTOS_PER_REQUEST} entries`,
      })
      return
    }
    for (const p of body.photos) {
      if (!p || typeof p.id !== 'string' || !p.id || typeof p.dataUrl !== 'string') continue
      // Estimate decoded byte size — base64 ≈ 3/4 of encoded length.
      const encodedLen = p.dataUrl.length
      const decodedEst = Math.floor((encodedLen * 3) / 4)
      if (decodedEst > MAX_PHOTO_BYTES) {
        res.status(400).json({
          error: `photo ${p.id} exceeds ${MAX_PHOTO_BYTES} bytes (~${Math.round(MAX_PHOTO_BYTES / 1_000_000)}MB) decoded size`,
        })
        return
      }
      const label = typeof p.label === 'string' && p.label ? p.label.slice(0, 200) : null
      photoMap.set(p.id, { id: p.id, dataUrl: p.dataUrl, label })
      photoIndex.push({ id: p.id, label })
    }
  }

  // Plan lookup (free tier has tighter cap)
  let plan = 'free'
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()
    plan = (profile && profile.plan) || 'free'
  } catch {
    // Profile missing → treat as free.
  }

  // Unlimited-usage allowlist (UNLIMITED_USAGE_EMAILS env var). Skip
  // rate-limit gates for allowlisted internal test accounts. The
  // quota footer block below still computes against PER_DAY_LIMIT so
  // the UI doesn't crash on a missing limit; for an allowlisted user
  // it just shows used_today / PER_DAY_LIMIT as if they were on a
  // paid plan, which is fine for testing.
  const userEmail = (user && user.email) || ''
  const unlimited = hasUnlimitedUsage(userEmail)

  // Rate limit
  let limitCheck: RateLimitResult = { ok: true }
  if (!unlimited) {
    try {
      limitCheck = await checkRateLimits(supabase, user.id, plan)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[field-assistant] rate limit check failed:', msg)
      res.status(500).json({ error: 'rate_limit_check_failed', code: 'fa_init_005', detail: msg })
      return
    }
  }
  if (!limitCheck.ok) {
    res.setHeader('Retry-After', String(limitCheck.retry_after))
    res.status(429).json({
      error: 'rate_limit_exceeded',
      retry_after_seconds: limitCheck.retry_after,
      scope: limitCheck.scope,
      message:
        'Field assistant rate limit reached. Please wait a moment, or upgrade your plan for higher limits.',
    })
    return
  }

  // Conversation + history
  let conversationId: string
  try {
    conversationId = await ensureConversation(supabase, body.conversation_id || null, user.id, userMessage)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[field-assistant] conversation init failed:', msg)
    res.status(500).json({ error: 'conversation_init_failed', code: 'fa_init_003', detail: msg })
    return
  }
  let history: FaMessageRow[] = []
  if (body.conversation_id) {
    try {
      history = await loadHistory(supabase, conversationId, user.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[field-assistant] history load failed:', msg)
      res.status(500).json({ error: 'history_load_failed', code: 'fa_init_004', detail: msg })
      return
    }
  }
  // Legacy request-id (pre-existing field on the SSE meta event).
  // Retained for any old clients / tests that still read it.
  const messageId = (globalThis as any).crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
  // Pre-generate DB-row ids for both turns so the client receives
  // the assistant turn's id in the meta event (lets it attach
  // thumbs-up/down feedback once the response streams in).
  const newUuid = () =>
    (globalThis as any).crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`
  const userTurnId = newUuid()
  const assistantTurnId = newUuid()
  const contextView =
    (body.context && typeof body.context === 'object' && (body.context as Record<string, unknown>).view) ||
    null

  // SSE headers + meta event
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  writeSse(res, 'meta', {
    conversation_id: conversationId,
    message_id: messageId,
    // Pre-emitted DB row id of the assistant turn this request will
    // produce. The client stores it alongside the streaming bubble
    // so the thumbs-up / thumbs-down feedback affordance can POST
    // /api/field-assistant-feedback with the right message_id once
    // the response settles.
    assistant_message_id: assistantTurnId,
  })

  // Persist the user turn before calling upstream so any handler crash
  // still leaves the message in history.
  try {
    await persistTurn(supabase, conversationId, user.id, 'user', userMessage, contextView as string | null, userTurnId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[field-assistant] user-turn persist failed:', msg)
  }

  // Call Anthropic and pump the stream (with tool-use loop)
  const systemBlocks = buildSystemBlocks(body.context, photoIndex)
  const initialMessages = buildAnthropicMessages(history, userMessage)

  // Collect L4 vision usage so we can write per-photo audit details
  // and add the per-photo cost to the ledger row.
  const visionUsages: VisionUsageRecord[] = []
  const toolCtx: ToolDispatchContext = {
    photos: photoMap,
    anthropicApiKey: apiKey,
    fetchFn: getFetch(),
    recordVisionUsage: (u: VisionUsageRecord) => {
      visionUsages.push(u)
    },
    supabase,
    userId: user.id,
    assessmentContext:
      (body.context && typeof body.context === 'object'
        ? (body.context as Record<string, unknown>)
        : undefined),
  }

  // Wall-clock latency around the upstream call + tool loop.
  // Recorded on the assistant message row so the export pipeline
  // can filter on response speed without an audit-log join.
  const agentStartedAt = Date.now()
  let result: Awaited<ReturnType<typeof runAgentLoop>>
  try {
    result = await runAgentLoop(apiKey, systemBlocks, initialMessages, res, toolCtx)
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'agent_loop_failed'
    const msg = friendlyUpstreamError(raw)
    writeSse(res, 'error', { error: msg })
    res.end()
    return
  }
  const latencyMs = Date.now() - agentStartedAt

  // Deterministic output-safety enforcement: lint the assembled answer +
  // check that any numeric threshold is tool-backed, retry once at temp 0
  // on a hit, fall back if still unsafe, and emit a `replace` event so the
  // client swaps the already-streamed bubble.
  const retrievalUsed = result.toolCalls.some(
    (tc) => tc.name === 'lookup_exposure_limit' || tc.name === 'search_standards_corpus',
  )
  const safety = await enforceJasperOutputSafety(apiKey, systemBlocks, result, res, retrievalUsed)
  const finalText = safety.finalText
  // Fold retry token usage into the totals so cost + ledger reflect reality.
  const totalInputTokens = (result.inputTokens || 0) + safety.extraInput
  const totalOutputTokens = (result.outputTokens || 0) + safety.extraOutput
  const totalCacheRead = (result.cacheRead || 0) + safety.extraCacheRead
  const totalCacheCreate = (result.cacheCreate || 0) + safety.extraCacheCreate

  const cost = estimateCost(totalInputTokens, totalOutputTokens, totalCacheCreate, totalCacheRead)

  // Persist assistant turn + ledger row + audit log. Failures logged
  // but never block the response — the assessor already has the text.
  // NOTE: finalText (clean / fallback) is persisted, never the violating
  // text — the lint contract is that prohibited phrasing never reaches
  // field_assistant_messages.
  try {
    await persistTurn(
      supabase, conversationId, user.id, 'assistant', finalText,
      contextView as string | null,
      assistantTurnId,
      {
        model: ANTHROPIC_MODEL,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        toolRounds: result.rounds,
        latencyMs,
      },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[field-assistant] assistant-turn persist failed:', msg)
  }
  await recordGeneration(supabase, user.id, totalInputTokens, totalOutputTokens, cost)

  // Compute remaining-quota figure for the day so the UI can show a
  // "N of M today" footer. Counts the just-inserted row so the number
  // reflects post-call state. Failure here is non-fatal — we'll just
  // omit the quota block from the done event.
  let quotaBlock: { used_today: number; limit_today: number; plan: string } | null = null
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    const usedToday = await countRowsSince(supabase, user.id, oneDayAgo)
    const limitToday = plan === 'free' ? FREE_TIER_DAILY_CAP : PER_DAY_LIMIT
    quotaBlock = { used_today: usedToday, limit_today: limitToday, plan }
  } catch {
    /* ignore — quota footer just won't show */
  }

  // Renamed `field_assistant.message` → `jasper_asked` (connectivity
  // PR D EventName allowlist). No external consumer reads the old
  // string today; the new name lines up with KNOWN_EVENTS so the
  // event-spine vocabulary is consistent across browser + server.
  await auditLog({
    action: 'jasper_asked',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'field_assistant_conversation',
    target_id: conversationId,
    details: {
      model: ANTHROPIC_MODEL,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_read_input_tokens: totalCacheRead,
      cache_creation_input_tokens: totalCacheCreate,
      estimated_cost_usd: cost,
      stop_reason: result.stopReason,
      context_view: contextView,
      plan,
      tool_rounds: result.rounds,
      tool_calls: result.toolCalls.map((t) => ({ name: t.name, status: t.resultStatus })),
      vision_usages: visionUsages,
      photos_attached: photoIndex.length,
      // Output-linter telemetry so we can measure leakage + retry efficacy.
      lint: safety.lint,
    },
    req,
  })

  // PR D event spine: one `photo_analyzed` row per successful vision
  // call this turn. Wrapped in try/catch — a logging failure must
  // never break the user response (we've already written the
  // jasper_asked row above for forensic).
  for (const u of visionUsages) {
    try {
      await auditLog({
        action: 'photo_analyzed',
        actor_id: user.id,
        actor_email: user.email,
        target_type: 'photo',
        target_id: u.photo_id,
        details: {
          focus: u.focus,
          confidence: u.confidence,
          input_tokens: u.input_tokens,
          output_tokens: u.output_tokens,
        },
        req,
      })
    } catch {
      // best-effort
    }
  }

  writeSse(res, 'done', {
    usage: {
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cache_read_input_tokens: result.cacheRead,
      cache_creation_input_tokens: result.cacheCreate,
      estimated_cost_usd: cost,
    },
    quota: quotaBlock,
    tool_calls: result.toolCalls.map((t) => ({ name: t.name, status: t.resultStatus })),
  })
  res.end()
}

export default handler

// Test-only injection points. Tests import from handler.__test rather
// than depending on env vars or live Supabase.
export const __test = {
  estimateCost,
  checkRateLimits,
  buildSystemBlocks,
  buildAnthropicMessages,
  runAgentLoop,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  ANTHROPIC_MODEL,
  GENERATION_TYPE,
  MAX_HISTORY_TURNS,
  MAX_USER_MESSAGE_LEN,
  MAX_TOOL_ROUNDS,
  setSupabase(mock: unknown) {
    _supabase = mock as SupabaseClient
  },
  setFetch(mock: unknown) {
    _fetch = mock as typeof fetch
  },
  resetSupabase() {
    _supabase = null
  },
  resetFetch() {
    _fetch = null
  },
}
