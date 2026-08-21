#!/usr/bin/env node
/**
 * SPIKE A — is conversational intake viable for a walkthrough?
 *
 * TEMPORARY. This is spike code: delete it once Spike A has a written
 * go/no-go. It is committed only because it needs credentials this
 * environment does not have, so somebody else has to run it.
 *
 * ── What it answers ───────────────────────────────────────────────────
 * Decision 1 of the guided-agent plan ("agent drives, wizard is the
 * record") rests on an untested assumption: that an assessor will answer
 * ~116 questionnaire fields in conversation. Three things could make that
 * false. Two are arithmetic and already answered (below). This measures
 * the third.
 *
 *   A1 QUOTA — answered, and it fails.
 *      api/field-assistant.ts: PER_MINUTE_LIMIT 15, PER_DAY_LIMIT 150,
 *      FREE_TIER_DAILY_CAP 10. At one question per turn, 116 fields is
 *      ~77% of a paid assessor's DAILY quota — two guided walkthroughs in
 *      one day is impossible — and dies after 10 questions on free tier.
 *      15/min also imposes a ~8 minute floor of pure rate-limit waiting.
 *
 *   A1b COST — answered offline, and it is worse than the quota.
 *      The dynamic context block is deliberately UNCACHED and kept last so
 *      the cached system prefix stays byte-identical across a session
 *      (api/field-assistant.ts buildSystemBlocks). It is therefore re-sent
 *      in full on every turn, and it grows linearly with zones:
 *
 *          2 zones   ~16.8k tokens/turn
 *          4 zones   ~30.7k
 *          8 zones   ~58.7k
 *         12 zones   ~86.6k
 *
 *      At 8 zones × 116 turns that is ~6.8M input tokens per walkthrough,
 *      roughly $20 at Sonnet input pricing, to re-send a payload that
 *      barely changes between turns.
 *
 *      Three contributors are pure waste and worth fixing before anything
 *      else in Stage 1:
 *        • `readiness` and `readiness_verdict` are BYTE-IDENTICAL. The
 *          same object ships twice on every turn.
 *        • Findings are serialised THREE times — raw under
 *          engine_outputs.zone_scores[].cats[].r[], rolled up under
 *          walkthrough_findings, and again under knowledge_graph.findings
 *          (31k chars on its own, ~39% of a 2-zone context).
 *        • knowledge_graph and engine_outputs change only when a write
 *          lands, not every turn.
 *
 *      The fix is the pattern this codebase already uses: serve large,
 *      slow-changing state through a TOOL rather than pushing it in the
 *      prompt, exactly as `assess_investigation` serves the investigation
 *      state. See the plan.
 *
 *   A2 LATENCY — what this script measures. Needs a live endpoint.
 *   A3 ACCURACY — measured in the same run: does what the agent proposes
 *      to write match what the wizard would have stored?
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *   node scripts/spike/guided-latency.mjs \
 *     --base https://atmosflow.net \
 *     --token "$SUPABASE_ACCESS_TOKEN" \
 *     [--turns 20] [--wizard-seconds 45] [--json out.json]
 *
 * Get a token from a signed-in browser session:
 *   JSON.parse(localStorage.getItem(
 *     Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
 *   )).access_token
 *
 * ── Reading the result ────────────────────────────────────────────────
 * Rate-limit waiting is measured SEPARATELY from latency and excluded
 * from the per-turn figures. A harness that sleeps through a 429 and
 * counts it as latency measures the rate limiter, not the model.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// ── Go/no-go thresholds, from the plan ────────────────────────────────
const MAX_MEAN_TURN_MS = 4000
const WIZARD_RATIO_LIMIT = 2.0

// ── The scripted assessor ─────────────────────────────────────────────
/**
 * Ordinary field speech, not prompt-engineered sentences. Each turn
 * declares what the engine SHOULD end up storing, so the same run
 * measures accuracy (A3) as well as latency (A2).
 *
 * `expect: null` means the turn is a question to the agent rather than an
 * observation, so no write should be proposed. A proposal there is a
 * false positive and is reported.
 *
 * Field ids and their accepted values come from src/constants/questions.js
 * via src/constants/observable-fields.js — a value outside the schema is
 * rejected by validateObservation before an Accept button is ever shown,
 * so a mismatch here means mis-attribution, not a malformed value.
 */
const SCRIPT = [
  { say: "starting the walkthrough in the front office", expect: null },
  { say: "CO2's about fourteen fifty in here", expect: { field: 'co2', value: '1450' } },
  { say: "outdoor's four twenty", expect: { field: 'co2o', value: '420' } },
  { say: "temp is seventy four", expect: { field: 'tf', value: '74' } },
  { say: "humidity fifty two percent", expect: { field: 'rh', value: '52' } },
  { say: "what does that CO2 number mean for ventilation?", expect: null },
  { say: "PM two five reads twelve", expect: { field: 'pm', value: '12' } },
  { say: "carbon monoxide is one", expect: { field: 'co', value: '1' } },
  { say: "there's a musty smell, pretty steady", expect: { field: 'op', value: null } },
  { say: "no visible mould that I can see", expect: { field: 'mi', value: null } },
  { say: "supply air feels weak at the diffuser", expect: { field: 'sa', value: null } },
  { say: "occupants here have been complaining of headaches", expect: { field: 'sy', value: null } },
  { say: "should I be measuring formaldehyde as well?", expect: null },
  { say: "TVOC is four hundred", expect: { field: 'tv', value: '400' } },
  { say: "filters look heavily loaded in the AHU", expect: { field: 'fc', value: null } },
  { say: "moving to the conference room now", expect: null },
  { say: "CO2 in here is nine hundred", expect: { field: 'co2', value: '900' } },
  { say: "temp seventy one", expect: { field: 'tf', value: '71' } },
  { say: "humidity forty eight", expect: { field: 'rh', value: '48' } },
  { say: "what's still open on this investigation?", expect: null },
]

// ── Arg parsing ───────────────────────────────────────────────────────
function args() {
  const a = process.argv.slice(2)
  const get = (name, fallback = null) => {
    const i = a.indexOf(`--${name}`)
    return i >= 0 && a[i + 1] ? a[i + 1] : fallback
  }
  return {
    base: (get('base') || process.env.ATMOSFLOW_BASE_URL || '').replace(/\/$/, ''),
    token: get('token') || process.env.ATMOSFLOW_TOKEN || '',
    turns: Number(get('turns', String(SCRIPT.length))),
    wizardSeconds: get('wizard-seconds') ? Number(get('wizard-seconds')) : null,
    json: get('json'),
  }
}

// ── One turn ──────────────────────────────────────────────────────────
/**
 * Returns { latencyMs, ttftMs, rateLimitWaitMs, events, conversationId }.
 *
 * A 429 is retried after the server's own Retry-After, and the waiting is
 * reported separately so it never contaminates the latency figure.
 */
async function turn({ base, token }, message, conversationId) {
  let rateLimitWaitMs = 0

  for (let attempt = 0; attempt < 4; attempt++) {
    const started = Date.now()
    const res = await fetch(`${base}/api/field-assistant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        context: CONTEXT,
      }),
    })

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}))
      const waitS = Number(res.headers.get('retry-after') || body.retry_after_seconds || 60)
      if (body.scope === 'per_day' || body.scope === 'free_tier_daily') {
        throw new Error(
          `DAILY QUOTA EXHAUSTED after ${waitS}s retry-after (scope: ${body.scope}). ` +
          'This is the A1 finding, hit live: the daily cap cannot carry a guided walkthrough.',
        )
      }
      process.stderr.write(`   rate limited, waiting ${waitS}s…\n`)
      await new Promise((r) => setTimeout(r, waitS * 1000))
      rateLimitWaitMs += waitS * 1000
      continue
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
    }

    // Parse the SSE stream, timestamping the first token.
    const events = []
    let ttftMs = null
    let buf = ''
    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let sep
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        const evLine = frame.split('\n').find((l) => l.startsWith('event: '))
        const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))
        if (!evLine) continue
        const name = evLine.slice(7).trim()
        let data = null
        try { data = dataLine ? JSON.parse(dataLine.slice(6)) : null } catch { /* keep null */ }
        if (name === 'token' && ttftMs === null) ttftMs = Date.now() - started
        events.push({ name, data })
      }
    }

    return {
      latencyMs: Date.now() - started,
      ttftMs,
      rateLimitWaitMs,
      events,
      conversationId: events.find((e) => e.name === 'meta')?.data?.conversation_id || conversationId,
    }
  }
  throw new Error('gave up after 4 rate-limit retries')
}

// ── Stats ─────────────────────────────────────────────────────────────
const pct = (xs, p) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

// ── Context ───────────────────────────────────────────────────────────
const CONTEXT = JSON.parse(
  fs.readFileSync(path.join(HERE, 'context-fixture.json'), 'utf8'),
)
const CONTEXT_CHARS = JSON.stringify(CONTEXT).length

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const cfg = args()
  if (!cfg.base || !cfg.token) {
    process.stderr.write(
      'Missing --base and/or --token.\n\n' +
      'Usage: node scripts/spike/guided-latency.mjs --base https://atmosflow.net --token "$JWT"\n' +
      'See the header of this file for how to get a token.\n',
    )
    process.exit(2)
  }

  const script = SCRIPT.slice(0, cfg.turns)
  process.stderr.write(
    `Spike A — ${script.length} turns against ${cfg.base}\n` +
    `Context payload: ${CONTEXT_CHARS.toLocaleString()} chars ` +
    `(~${Math.round(CONTEXT_CHARS / 4).toLocaleString()} tokens) sent uncached each turn, 2-zone fixture\n\n`,
  )

  const runStarted = Date.now()
  let conversationId = null
  const results = []

  for (const [i, step] of script.entries()) {
    process.stderr.write(`${String(i + 1).padStart(2)}/${script.length}  "${step.say}"\n`)
    let r
    try {
      r = await turn(cfg, step.say, conversationId)
    } catch (err) {
      process.stderr.write(`\nABORTED: ${err.message}\n`)
      break
    }
    conversationId = r.conversationId

    const proposals = r.events
      .filter((e) => e.name === 'proposed_action')
      .map((e) => e.data?.action)
      .filter(Boolean)
    const tools = r.events.filter((e) => e.name === 'tool_call').map((e) => e.data?.name)

    // A3 — did the agent propose the write the wizard would have stored?
    let accuracy = 'n/a'
    if (step.expect === null) {
      accuracy = proposals.length === 0 ? 'ok' : `false-positive:${proposals.map((p) => p.field).join(',')}`
    } else {
      const hit = proposals.find((p) => p.field === step.expect.field)
      if (!hit) accuracy = `missed:${step.expect.field}`
      else if (step.expect.value !== null && String(hit.value) !== step.expect.value) {
        accuracy = `wrong-value:${step.expect.field}=${hit.value} want ${step.expect.value}`
      } else accuracy = 'ok'
    }

    results.push({
      i: i + 1, say: step.say, latencyMs: r.latencyMs, ttftMs: r.ttftMs,
      rateLimitWaitMs: r.rateLimitWaitMs, tools, proposals, accuracy,
    })
    process.stderr.write(
      `      ${r.latencyMs}ms total, ttft ${r.ttftMs ?? '—'}ms, ` +
      `tools [${tools.join(',') || '-'}], ${accuracy}\n`,
    )
  }

  // ── Report ──────────────────────────────────────────────────────────
  const lat = results.map((r) => r.latencyMs)
  const ttft = results.map((r) => r.ttftMs).filter((x) => typeof x === 'number')
  const waitMs = results.reduce((n, r) => n + r.rateLimitWaitMs, 0)
  const wallMs = Date.now() - runStarted
  const meanTurn = mean(lat)
  const misses = results.filter((r) => r.accuracy !== 'ok' && r.accuracy !== 'n/a')

  const line = (k, v) => `${k.padEnd(34)}${v}\n`
  let out = `\n${'='.repeat(64)}\nSPIKE A RESULT — ${results.length} turns\n${'='.repeat(64)}\n`
  out += line('mean turn', `${meanTurn} ms`)
  out += line('median turn', `${pct(lat, 50)} ms`)
  out += line('p95 turn', `${pct(lat, 95)} ms`)
  out += line('mean time-to-first-token', `${mean(ttft)} ms`)
  const secs = (ms) => `${(ms / 1000).toFixed(1)} s`
  out += line('sum of latencies', secs(lat.reduce((a, b) => a + b, 0)))
  out += line('rate-limit waiting (excluded)', secs(waitMs))
  out += line('wall clock', secs(wallMs))
  out += line('context per turn', `~${Math.round(CONTEXT_CHARS / 4).toLocaleString()} tokens`)

  out += `\nA2 LATENCY\n`
  const latencyPass = meanTurn <= MAX_MEAN_TURN_MS
  out += line('  mean turn <= 4000 ms', latencyPass ? `PASS (${meanTurn})` : `FAIL (${meanTurn})`)
  if (cfg.wizardSeconds) {
    const ratio = (lat.reduce((a, b) => a + b, 0) / 1000) / cfg.wizardSeconds
    out += line(`  vs wizard (${cfg.wizardSeconds}s)`,
      `${ratio.toFixed(1)}x  ${ratio <= WIZARD_RATIO_LIMIT ? 'PASS' : 'FAIL'}`)
  } else {
    out += '  vs wizard                       not measured — pass --wizard-seconds N\n'
  }

  out += `\nA3 ACCURACY\n`
  out += line('  turns matching the wizard', `${results.length - misses.length}/${results.length}`)
  if (misses.length) {
    out += '  DISQUALIFYING until fixed — a silently wrong zone or field is worse than a form:\n'
    for (const m of misses) out += `    ${String(m.i).padStart(2)}. ${m.accuracy}  "${m.say}"\n`
  }

  out += `\nA1 QUOTA (arithmetic, not measured here)\n`
  const perDay = 150
  out += line('  turns per guided walkthrough', '~116 at one question per turn')
  out += line('  share of the 150/day cap', `${Math.round((116 / perDay) * 100)}%`)
  out += line('  free tier (10/day)', 'dies after 10 questions')
  out += line('  8-zone context cost', '~6.8M input tokens/walkthrough (~$20)')

  out += `\nVERDICT\n`
  if (!latencyPass || misses.length) {
    out += '  Decision 1 should narrow: let the agent drive only the\n'
    out += '  decision-relevant fields (it already knows which, from\n'
    out += '  openQuestions/untestedParameters) and leave bulk capture to\n'
    out += '  the wizard.\n'
  } else {
    out += '  Latency and accuracy clear the bar. The binding constraint is\n'
    out += '  A1: quota and per-turn context cost. Batch questions and serve\n'
    out += '  large slow-changing context by tool before building the loop.\n'
  }
  out += '='.repeat(64) + '\n'

  process.stdout.write(out)
  if (cfg.json) {
    fs.writeFileSync(cfg.json, JSON.stringify({
      meanTurn, medianTurn: pct(lat, 50), p95Turn: pct(lat, 95), meanTtft: mean(ttft),
      rateLimitWaitMs: waitMs, wallMs, contextChars: CONTEXT_CHARS,
      latencyPass, misses: misses.length, results,
    }, null, 2))
    process.stderr.write(`\nwrote ${cfg.json}\n`)
  }
  process.exit(latencyPass && misses.length === 0 ? 0 : 1)
}

main().catch((err) => {
  process.stderr.write(`\n${err.stack || err.message}\n`)
  process.exit(1)
})
