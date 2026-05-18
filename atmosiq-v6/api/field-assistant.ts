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
import { FIELD_ASSISTANT_ROLE_PROMPT } from '../src/constants/field-assistant-prompt'
import { STANDARDS_FOR_AGENT, FAQ_FOR_AGENT } from '../src/constants/field-assistant-corpus'
import { FIELD_ASSISTANT_TOOLS, MAX_TOOL_ROUNDS } from '../src/constants/field-assistant-tools'
import { STANDARDS_MANIFEST, STD } from '../src/constants/standards'
import { scrubPii } from '../lib/sentry'
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS shared helper
const { auditLog } = require('./_audit')

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

const MAX_OUTPUT_TOKENS = 800
const MAX_USER_MESSAGE_LEN = 4000
const TITLE_TRUNCATE_LEN = 80
// Cap conversation history sent to the model. Going further back hurts
// latency without improving answer quality for field-triage questions.
const MAX_HISTORY_TURNS = 20

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

function buildSystemBlocks(context: RequestContext) {
  const contextBlock = context
    ? `Current assessor context (passed at request time, do not assume any other state):\n${JSON.stringify(
        context,
        null,
        2,
      )}`
    : 'No assessment context provided — the assessor is asking a general question.'
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
  tools: unknown,
): Promise<Response> {
  const fetchFn = getFetch()
  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: true,
    system: systemBlocks,
    messages,
  }
  if (tools) body.tools = tools
  return fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  }) as Promise<Response>
}

function writeSse(res: VercelLikeResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

interface ToolUseBlock {
  id: string
  name: string
  input: unknown
}

interface StreamResult {
  text: string
  toolUses: ToolUseBlock[]
  inputTokens: number | null
  outputTokens: number | null
  cacheCreate: number | null
  cacheRead: number | null
  stopReason: string | null
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
    toolUses: [],
    inputTokens: null,
    outputTokens: null,
    cacheCreate: null,
    cacheRead: null,
    stopReason: null,
  }
  // Tool-use blocks arrive as: content_block_start (with id+name),
  // then a sequence of content_block_delta with input_json_delta
  // (partial JSON of the input arg), then content_block_stop. We
  // accumulate partial JSON per block index, then JSON.parse at stop.
  const toolInputBuffers: Record<number, { id: string; name: string; json: string }> = {}

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
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
      if (payload.type === 'content_block_start' && payload.content_block?.type === 'tool_use') {
        const block = payload.content_block
        toolInputBuffers[payload.index] = { id: block.id, name: block.name, json: '' }
      } else if (
        payload.type === 'content_block_delta' &&
        payload.delta?.type === 'input_json_delta'
      ) {
        const buf2 = toolInputBuffers[payload.index]
        if (buf2) buf2.json += payload.delta.partial_json || ''
      } else if (payload.type === 'content_block_stop') {
        const tb = toolInputBuffers[payload.index]
        if (tb) {
          let parsed: unknown = {}
          try {
            parsed = tb.json ? JSON.parse(tb.json) : {}
          } catch {
            parsed = { _parse_error: tb.json }
          }
          acc.toolUses.push({ id: tb.id, name: tb.name, input: parsed })
          delete toolInputBuffers[payload.index]
        }
      } else if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
        const tok = payload.delta.text as string
        acc.text += tok
        writeSse(res, 'token', { text: tok })
      } else if (payload.type === 'message_start' && payload.message?.usage) {
        const u = payload.message.usage
        acc.inputTokens = (acc.inputTokens || 0) + (u.input_tokens || 0)
        acc.cacheCreate = u.cache_creation_input_tokens ?? null
        acc.cacheRead = u.cache_read_input_tokens ?? null
      } else if (payload.type === 'message_delta' && payload.usage) {
        const u = payload.usage
        acc.outputTokens = (acc.outputTokens || 0) + (u.output_tokens || 0)
        if (payload.delta?.stop_reason) acc.stopReason = payload.delta.stop_reason
      }
    }
  }
  return acc
}

// ── Tool implementations ──────────────────────────────────────────
// Plain shape (no discriminated union) so call sites don't need
// narrowing helpers — keeps the tool-loop code readable.
interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
}

async function toolGetAssessment(
  supabase: SupabaseClient,
  userId: string,
  input: { assessment_id?: string },
): Promise<ToolResult> {
  const id = input?.assessment_id
  if (!id) return { ok: false, error: 'assessment_id is required' }
  const { data, error } = await supabase
    .from('assessments')
    .select(
      'id, status, facility_name, facility_address, presurvey, building, zones, zone_scores, composite, recommendations, sampling_plan, score, risk, updated_at',
    )
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (error || !data) return { ok: false, error: 'Assessment not found in your account.' }
  return { ok: true, data }
}

async function toolGetZoneReadings(
  supabase: SupabaseClient,
  userId: string,
  input: { assessment_id?: string; zone_index?: number },
): Promise<ToolResult> {
  if (!input?.assessment_id || typeof input.zone_index !== 'number') {
    return { ok: false, error: 'assessment_id and zone_index are required' }
  }
  const { data, error } = await supabase
    .from('assessments')
    .select('zones, zone_scores')
    .eq('id', input.assessment_id)
    .eq('user_id', userId)
    .single()
  if (error || !data) return { ok: false, error: 'Assessment not found in your account.' }
  const zones = (data.zones as unknown[]) || []
  const zone = zones[input.zone_index]
  if (!zone) return { ok: false, error: `Zone index ${input.zone_index} not found in assessment.` }
  const zoneScores = (data.zone_scores as Record<string, unknown>) || {}
  const score = zoneScores?.[String(input.zone_index)] || null
  return { ok: true, data: { zone, score } }
}

function toolLookupStandard(input: { name?: string }): ToolResult {
  const name = (input?.name || '').trim()
  if (!name) return { ok: false, error: 'name is required' }
  const manifestKeys = Object.keys(STANDARDS_MANIFEST).filter(
    (k) => k !== 'engineVersion' && k !== 'manifestUpdated',
  )
  // Match either exact or case-insensitive substring on the manifest keys.
  const lower = name.toLowerCase()
  const match = manifestKeys.find((k) => k.toLowerCase() === lower) ||
    manifestKeys.find((k) => k.toLowerCase().includes(lower)) ||
    manifestKeys.find((k) => lower.includes(k.toLowerCase()))
  if (!match) return { ok: false, error: `"${name}" not found in the standards manifest.` }
  const version = (STANDARDS_MANIFEST as Record<string, string>)[match]
  // Bring in the threshold slice if we have one (STD) — keyed by short label.
  let thresholds: unknown = null
  const lowerMatch = match.toLowerCase()
  if (lowerMatch.includes('ashrae 62.1') || lowerMatch.includes('ashrae 55')) {
    thresholds = lowerMatch.includes('62.1') ? STD.v : STD.t
  } else if (lowerMatch.includes('osha') || lowerMatch.includes('niosh') ||
             lowerMatch.includes('naaqs') || lowerMatch.includes('molhave')) {
    thresholds = STD.c
  }
  return { ok: true, data: { name: match, version, thresholds } }
}

async function executeTool(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  input: unknown,
): Promise<ToolResult> {
  try {
    if (name === 'get_assessment') {
      return await toolGetAssessment(supabase, userId, input as { assessment_id?: string })
    }
    if (name === 'get_zone_readings') {
      return await toolGetZoneReadings(
        supabase,
        userId,
        input as { assessment_id?: string; zone_index?: number },
      )
    }
    if (name === 'lookup_standard') {
      return toolLookupStandard(input as { name?: string })
    }
    return { ok: false, error: `Unknown tool: ${name}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'tool_execution_failed'
    return { ok: false, error: msg }
  }
}

// ── Tool loop ────────────────────────────────────────────────────
// Encodes the assistant's content for the next round in Anthropic's
// expected shape: array of text + tool_use blocks.
function buildAssistantContent(text: string, toolUses: ToolUseBlock[]) {
  const content: unknown[] = []
  if (text) content.push({ type: 'text', text })
  for (const tu of toolUses) {
    content.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input })
  }
  return content
}

interface TurnAggregate {
  finalText: string
  inputTokens: number
  outputTokens: number
  cacheRead: number | null
  cacheCreate: number | null
  toolCalls: { name: string; ok: boolean }[]
  rounds: number
  stopReason: string | null
}

async function runConversationTurn(
  apiKey: string,
  systemBlocks: unknown,
  initialMessages: unknown[],
  supabase: SupabaseClient,
  userId: string,
  res: VercelLikeResponse,
): Promise<TurnAggregate> {
  const messages = [...initialMessages]
  const agg: TurnAggregate = {
    finalText: '',
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: null,
    cacheCreate: null,
    toolCalls: [],
    rounds: 0,
    stopReason: null,
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS + 1; round++) {
    agg.rounds = round + 1
    const upstream = await callAnthropicStream(apiKey, systemBlocks, messages, FIELD_ASSISTANT_TOOLS)
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '')
      throw new Error(`upstream_${upstream.status}: ${errText || 'error'}`)
    }
    const result = await pumpAnthropicStream(upstream, res)
    agg.inputTokens += result.inputTokens || 0
    agg.outputTokens += result.outputTokens || 0
    // Cache stats reflect the most recent round (each round is a fresh
    // request; later rounds typically hit cache fully).
    if (result.cacheRead != null) agg.cacheRead = (agg.cacheRead || 0) + result.cacheRead
    if (result.cacheCreate != null) agg.cacheCreate = (agg.cacheCreate || 0) + result.cacheCreate
    agg.stopReason = result.stopReason
    if (result.text) agg.finalText = result.text  // the final round's text

    if (result.stopReason !== 'tool_use' || result.toolUses.length === 0) break
    if (round >= MAX_TOOL_ROUNDS) {
      // Cap hit — append a synthetic apology so the user gets a clean close.
      agg.finalText += '\n\n(Stopped after reaching the tool-call cap. Try a more specific question.)'
      break
    }

    // Echo the assistant message into history, run the tool calls, then
    // append a user message carrying the tool_result blocks.
    messages.push({
      role: 'assistant',
      content: buildAssistantContent(result.text, result.toolUses),
    })
    const toolResultBlocks: unknown[] = []
    for (const tu of result.toolUses) {
      writeSse(res, 'tool_use', { name: tu.name, input: tu.input })
      const tr = await executeTool(supabase, userId, tu.name, tu.input)
      agg.toolCalls.push({ name: tu.name, ok: tr.ok })
      writeSse(res, 'tool_result', { name: tu.name, ok: tr.ok })
      let resultPayload: unknown
      if (tr.ok) resultPayload = tr.data
      else resultPayload = { error: tr.error }
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(resultPayload),
        is_error: !tr.ok,
      })
    }
    messages.push({ role: 'user', content: toolResultBlocks })
  }

  return agg
}

async function persistTurn(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  contextView: string | null,
): Promise<void> {
  // Scrub PII on the persisted copy. The in-flight copy already sent
  // to Anthropic is raw — assessors expect facility-specific answers.
  const scrubbed = scrubPii({ content }).content
  await supabase.from('field_assistant_messages').insert({
    conversation_id: conversationId,
    user_id: userId,
    role,
    content: scrubbed,
    context_view: contextView,
  })
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
    res.status(500).json({ error: 'Server misconfigured — missing API key' })
    return
  }

  const authHeader =
    (req.headers.authorization as string | undefined) ||
    (req.headers.Authorization as string | undefined)
  if (!authHeader) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  const supabase = getSupabase()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  // Body validation
  const body = (req.body || {}) as {
    conversation_id?: string | null
    message?: string
    context?: RequestContext
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

  // Rate limit
  let limitCheck: RateLimitResult
  try {
    limitCheck = await checkRateLimits(supabase, user.id, plan)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[field-assistant] rate limit check failed:', msg)
    res.status(500).json({ error: 'rate_limit_check_failed' })
    return
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
    res.status(500).json({ error: 'conversation_init_failed' })
    return
  }
  const history = body.conversation_id ? await loadHistory(supabase, conversationId, user.id) : []
  const messageId = (globalThis as any).crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
  const contextView =
    (body.context && typeof body.context === 'object' && (body.context as Record<string, unknown>).view) ||
    null

  // SSE headers + meta event
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  writeSse(res, 'meta', { conversation_id: conversationId, message_id: messageId })

  // Persist the user turn before calling upstream so any handler crash
  // still leaves the message in history.
  try {
    await persistTurn(supabase, conversationId, user.id, 'user', userMessage, contextView as string | null)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[field-assistant] user-turn persist failed:', msg)
  }

  // Call Anthropic with the tool loop (single round if no tools used,
  // up to MAX_TOOL_ROUNDS + 1 calls if Claude chains tool requests).
  const systemBlocks = buildSystemBlocks(body.context)
  const initialMessages = buildAnthropicMessages(history, userMessage)

  let turn: TurnAggregate
  try {
    turn = await runConversationTurn(apiKey, systemBlocks, initialMessages, supabase, user.id, res)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'turn_failed'
    writeSse(res, 'error', { error: msg })
    res.end()
    return
  }

  const cost = estimateCost(turn.inputTokens, turn.outputTokens, turn.cacheCreate, turn.cacheRead)

  // Persist assistant turn + ledger row + audit log. Failures logged
  // but never block the response — the assessor already has the text.
  try {
    await persistTurn(supabase, conversationId, user.id, 'assistant', turn.finalText, contextView as string | null)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[field-assistant] assistant-turn persist failed:', msg)
  }
  await recordGeneration(supabase, user.id, turn.inputTokens, turn.outputTokens, cost)

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

  await auditLog({
    action: 'field_assistant.message',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'field_assistant_conversation',
    target_id: conversationId,
    details: {
      model: ANTHROPIC_MODEL,
      input_tokens: turn.inputTokens,
      output_tokens: turn.outputTokens,
      cache_read_input_tokens: turn.cacheRead,
      cache_creation_input_tokens: turn.cacheCreate,
      estimated_cost_usd: cost,
      stop_reason: turn.stopReason,
      context_view: contextView,
      plan,
      rounds: turn.rounds,
      tool_calls: turn.toolCalls,
    },
    req,
  })

  writeSse(res, 'done', {
    usage: {
      input_tokens: turn.inputTokens,
      output_tokens: turn.outputTokens,
      cache_read_input_tokens: turn.cacheRead,
      cache_creation_input_tokens: turn.cacheCreate,
      estimated_cost_usd: cost,
    },
    quota: quotaBlock,
    rounds: turn.rounds,
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
  executeTool,
  toolGetAssessment,
  toolGetZoneReadings,
  toolLookupStandard,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  ANTHROPIC_MODEL,
  GENERATION_TYPE,
  MAX_HISTORY_TURNS,
  MAX_USER_MESSAGE_LEN,
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
