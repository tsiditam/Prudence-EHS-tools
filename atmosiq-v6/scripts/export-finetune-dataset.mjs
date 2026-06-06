#!/usr/bin/env node
/**
 * scripts/export-finetune-dataset.mjs
 *
 * Read-only export of the AtmosFlow AI conversation corpus, shaped
 * as JSONL training rows for fine-tuning a domain-specific Jasper
 * checkpoint.
 *
 * Filters applied by default (defense-in-depth):
 *   1. Only users with profiles.ai_training_consent = true.
 *      Migration 015 defaults this to TRUE, but the column is
 *      honoured here so flipped users drop out immediately.
 *   2. Only conversations that still exist (cascade-deleted rows
 *      are excluded by the inner-join shape).
 *   3. Conversations containing a 'down'-rated turn are EXCLUDED
 *      (whole conversation) unless the caller passes
 *      --include-negatives (the right mode for preference-pair / DPO
 *      training later).
 *   4. Conversations with ANY output-linter hit are EXCLUDED
 *      unconditionally — sourced from the jasper_asked audit rows
 *      (details.lint.tripped). We must not train on the defects the
 *      linter just corrected, even via --include-negatives.
 *
 * Per-row schema (one JSON object per line):
 *   {
 *     "messages": [
 *       { "role": "system",    "content": "..." },
 *       { "role": "user",      "content": "..." },
 *       { "role": "assistant", "content": "..." }
 *     ],
 *     "metadata": {
 *       "conversation_id": "...",
 *       "model": "claude-sonnet-4-6",
 *       "input_tokens": N, "output_tokens": N, "tool_rounds": N,
 *       "latency_ms": N, "feedback": "up" | "down" | null,
 *       "context_view": "...", "created_at": "..."
 *     }
 *   }
 *
 * Flags:
 *   --since YYYY-MM-DD       Earliest message created_at to include
 *   --out path.jsonl         Output path (default: dataset.jsonl)
 *   --dry-run                Count rows only, don't write
 *   --include-negatives      Include 👎 turns
 *   --system-prompt path     System prompt to embed at messages[0]
 *                            (default: a screening-only IAQ stub —
 *                             not the production system prompt
 *                             which lives in api/field-assistant.ts;
 *                             promote it before a real training run)
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env. The
 * service-role key reads past RLS — that's the only sane way to do
 * a cross-user batch — so do NOT run this from a user's terminal
 * without admin authorisation.
 *
 * Exit codes:
 *   0  success
 *   1  bad arguments / missing env / write error
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const FALLBACK_SYSTEM = (
  'You are AtmosFlow AI, an indoor air quality screening assistant ' +
  'for industrial hygienists. You are screening-only: do not make ' +
  'compliance, causation, or final IAQ calls; those go to a ' +
  'qualified professional.'
)

function parseArgs(argv) {
  const args = { since: null, out: 'dataset.jsonl', dryRun: false, includeNegatives: false, systemPrompt: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--since') args.since = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--include-negatives') args.includeNegatives = true
    else if (a === '--system-prompt') args.systemPrompt = argv[++i]
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
    else { console.error(`Unknown flag: ${a}`); printHelp(); process.exit(1) }
  }
  return args
}

function printHelp() {
  console.error(`Usage: node scripts/export-finetune-dataset.mjs [flags]
  --since YYYY-MM-DD       earliest created_at
  --out path.jsonl         output path (default dataset.jsonl)
  --dry-run                count only, don't write
  --include-negatives      include 👎 turns
  --system-prompt path     system prompt file (default: built-in stub)`)
}

/**
 * Walk a flat array of message rows (ordered by conversation_id +
 * created_at) and emit one training example per assistant turn.
 * Pairs each assistant turn with the immediately-preceding user
 * turn in the same conversation. Unpaired assistant turns
 * (shouldn't happen but defensive) are skipped.
 *
 * Exported separately so tests can drive it without a Supabase
 * round-trip.
 */
export function buildTrainingRows({
  messages, feedbackByMessageId, consentingUserIds,
  includeNegatives, systemPrompt, excludedConversationIds = new Set(),
}) {
  const out = []
  let lastUserByConv = new Map()
  for (const m of messages) {
    if (!consentingUserIds.has(m.user_id)) {
      // Reset the rolling user-turn so a non-consenting user's
      // turn can't be paired with someone else's assistant turn
      // later (defensive — query orders by conv id then time, so
      // this shouldn't matter, but cheap insurance).
      lastUserByConv.delete(m.conversation_id)
      continue
    }
    // Conversation-level exclusion: drop the WHOLE conversation when it
    // had a lint hit (the defect we just fixed — never train on it) or a
    // thumbs-down (see main(); skipped when --include-negatives).
    if (excludedConversationIds.has(m.conversation_id)) {
      lastUserByConv.delete(m.conversation_id)
      continue
    }
    if (m.role === 'user') {
      lastUserByConv.set(m.conversation_id, m)
      continue
    }
    if (m.role !== 'assistant') continue
    const userTurn = lastUserByConv.get(m.conversation_id)
    if (!userTurn) continue
    const feedback = feedbackByMessageId.get(m.id) || null
    if (feedback?.rating === 'down' && !includeNegatives) continue
    out.push({
      messages: [
        { role: 'system',    content: systemPrompt || FALLBACK_SYSTEM },
        { role: 'user',      content: userTurn.content },
        { role: 'assistant', content: m.content },
      ],
      metadata: {
        conversation_id: m.conversation_id,
        model: m.model || null,
        input_tokens: m.input_tokens ?? null,
        output_tokens: m.output_tokens ?? null,
        tool_rounds: m.tool_rounds ?? null,
        latency_ms: m.latency_ms ?? null,
        feedback: feedback?.rating || null,
        context_view: m.context_view || null,
        created_at: m.created_at,
      },
    })
    // Don't drop the user turn — a long assistant turn might be
    // followed by a follow-up user turn that pairs with the NEXT
    // assistant turn. The user-turn slot is overwritten on the
    // next user row.
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Pull messages in time order. Limit columns to what the export
  // needs. We do NOT paginate here — 50 conv-cap × ~30 turns puts
  // us well under the Supabase response cap; if usage grows past
  // that, add range-based paging.
  let q = supabase
    .from('field_assistant_messages')
    .select('id, conversation_id, user_id, role, content, context_view, created_at, model, input_tokens, output_tokens, tool_rounds, latency_ms')
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true })
  if (args.since) q = q.gte('created_at', args.since)
  const { data: messages, error: msgErr } = await q
  if (msgErr) { console.error('messages query failed:', msgErr.message); process.exit(1) }

  // Per-user consent — single query, filtered to users we actually saw.
  const userIds = Array.from(new Set((messages || []).map(m => m.user_id)))
  let consentingUserIds = new Set()
  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, ai_training_consent')
      .in('id', userIds)
      .eq('ai_training_consent', true)
    if (pErr) { console.error('consent query failed:', pErr.message); process.exit(1) }
    consentingUserIds = new Set((profiles || []).map(p => p.id))
  }

  // Feedback — one batch keyed by message_id.
  const messageIds = (messages || []).filter(m => m.role === 'assistant').map(m => m.id)
  const feedbackByMessageId = new Map()
  if (messageIds.length > 0) {
    const { data: feedback, error: fErr } = await supabase
      .from('field_assistant_feedback')
      .select('message_id, rating, reason')
      .in('message_id', messageIds)
    if (fErr) { console.error('feedback query failed:', fErr.message); process.exit(1) }
    for (const f of (feedback || [])) feedbackByMessageId.set(f.message_id, f)
  }

  // Lint-tripped conversations — never train on a turn the output linter
  // flagged (the defect we just fixed). Sourced from the jasper_asked
  // audit rows (details.lint.tripped), keyed by target_id = conversation.
  // This exclusion is UNCONDITIONAL (not affected by --include-negatives).
  const lintTrippedConvIds = new Set()
  {
    let aq = supabase
      .from('audit_log')
      .select('target_id, details, created_at')
      .eq('action', 'jasper_asked')
      .eq('target_type', 'field_assistant_conversation')
    if (args.since) aq = aq.gte('created_at', args.since)
    const { data: auditRows, error: aErr } = await aq
    if (aErr) { console.error('audit query failed:', aErr.message); process.exit(1) }
    for (const r of (auditRows || [])) {
      if (r && r.target_id && r.details && r.details.lint && r.details.lint.tripped) {
        lintTrippedConvIds.add(r.target_id)
      }
    }
  }

  // Thumbs-down conversations — exclude the WHOLE conversation unless the
  // caller wants negatives (DPO). buildTrainingRows still drops individual
  // 👎 turns by default; the spec escalates that to the whole conversation.
  const downConvIds = new Set()
  for (const m of (messages || [])) {
    if (m.role !== 'assistant') continue
    const fb = feedbackByMessageId.get(m.id)
    if (fb && fb.rating === 'down') downConvIds.add(m.conversation_id)
  }

  const excludedConversationIds = new Set(lintTrippedConvIds)
  if (!args.includeNegatives) for (const id of downConvIds) excludedConversationIds.add(id)

  const rows = buildTrainingRows({
    messages: messages || [],
    feedbackByMessageId,
    consentingUserIds,
    includeNegatives: args.includeNegatives,
    systemPrompt: null,
    excludedConversationIds,
  })

  console.log(`Eligible training rows: ${rows.length}`)
  console.log(`  Users in dataset: ${consentingUserIds.size} / ${userIds.length} (rest opted out)`)
  console.log(`  👎 rows included: ${args.includeNegatives ? 'yes' : 'no'}`)
  console.log(`  Excluded conversations: ${excludedConversationIds.size} (lint-tripped ${lintTrippedConvIds.size}` +
    `${args.includeNegatives ? '' : `, 👎 ${downConvIds.size}`})`)
  console.log(`  Since: ${args.since || 'beginning of time'}`)

  if (args.dryRun) {
    console.log('Dry-run — no file written.')
    return
  }

  const jsonl = rows.map(r => JSON.stringify(r)).join('\n') + '\n'
  writeFileSync(args.out, jsonl, 'utf-8')
  console.log(`Wrote ${rows.length} rows to ${args.out}`)
}

// Run when invoked directly; stays import-safe for tests.
const isDirect = import.meta.url === `file://${process.argv[1]}`
if (isDirect) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err)
    process.exit(1)
  })
}
