/**
 * Shared AI-usage ledger helpers for the rate-limited endpoints
 * (api/narrative.js, api/photo-analyze.js, api/inline-ai.js,
 * api/inline-complete.js, api/pre-review-semantic.js, api/field-assistant.ts).
 *
 * Why this exists — the check-then-act hole (audit 2026-09, H7). Every AI
 * handler counted rows in narrative_generations, called Anthropic, and only
 * THEN inserted its ledger row. N parallel requests all passed the count,
 * and a failed upstream call was never counted at all. The fix is to
 * RESERVE: insert the ledger row BEFORE the upstream call (zero tokens),
 * then either finalize it with the real token counts or release it when
 * the upstream call fails. The row counts against the window from the
 * moment the request is admitted, so a burst is bounded by the limit rather
 * than by how fast the model answers.
 *
 * narrative_generations has no `status` column (migrations 008 / 012), so a
 * reservation is simply a normal row with input_tokens = output_tokens = 0
 * and estimated_cost_usd = 0 — the same row the handler would have written,
 * written early. A reservation that is never finalized (handler crash after
 * the upstream call) stays as a zero-token row: it still counts for the
 * limit, which is the conservative failure.
 *
 * Every insert reads `{ error }`. supabase-js resolves with an error rather
 * than throwing, and not reading it is exactly how three endpoints ran with
 * no working rate limit for months (their generation_type violated the
 * CHECK constraint and the insert silently landed nothing — audit §2.5).
 *
 * CommonJS so both the .js handlers and the .ts handler can load it
 * (imported as './_rate-limit.js', the api/_audit.js pattern).
 */

'use strict'

const TABLE = 'narrative_generations'

/**
 * Rolling-window counter shared by every endpoint. Filters on the caller's
 * own generation_type so surfaces never share a budget (audit: narrative
 * and photo-analyze used to count every type, so a photo burst could lock
 * out narrative generation).
 */
async function countRowsSince(supabase, userId, generationType, sinceIso) {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('generation_type', generationType)
    .gte('generated_at', sinceIso)
  if (error) throw new Error(error.message)
  return count || 0
}

async function findOldestSince(supabase, userId, generationType, sinceIso) {
  const { data } = await supabase
    .from(TABLE)
    .select('generated_at')
    .eq('user_id', userId)
    .eq('generation_type', generationType)
    .gte('generated_at', sinceIso)
    .order('generated_at', { ascending: true })
    .limit(1)
    .single()
  return data && data.generated_at ? data.generated_at : null
}

/**
 * Standard three-gate check (per-minute burst, free-tier daily, per-day).
 * Returns { ok: true } or { ok: false, scope, retry_after }.
 */
async function checkRateLimits(supabase, userId, plan, limits, generationType, now = Date.now()) {
  const oneMinAgo = new Date(now - 60_000).toISOString()
  const oneDayAgo = new Date(now - 24 * 60 * 60_000).toISOString()

  const [minuteCount, dayCount] = await Promise.all([
    countRowsSince(supabase, userId, generationType, oneMinAgo),
    countRowsSince(supabase, userId, generationType, oneDayAgo),
  ])
  if (minuteCount >= limits.perMinute) {
    const oldest = await findOldestSince(supabase, userId, generationType, oneMinAgo)
    const retryAt = oldest ? new Date(oldest).getTime() + 60_000 : now + 60_000
    const retryAfter = Math.max(1, Math.ceil((retryAt - now) / 1000))
    return { ok: false, scope: 'per_minute', retry_after: retryAfter }
  }
  if (plan === 'free' && dayCount >= limits.freeTierDaily) {
    return { ok: false, scope: 'free_tier_daily', retry_after: 24 * 60 * 60 }
  }
  if (dayCount >= limits.perDay) {
    return { ok: false, scope: 'per_day', retry_after: 24 * 60 * 60 }
  }
  return { ok: true }
}

/**
 * Insert the reservation row. Returns { id } (id may be null when the
 * client did not return one). Throws Error('ledger_reserve_failed') when
 * the insert errors — callers fail CLOSED on that, because a limiter that
 * cannot write its own ledger is not limiting anything.
 */
async function reserveGeneration(supabase, { userId, generationType, tag }) {
  const label = tag || generationType
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      generation_type: generationType,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
    })
    .select('id')
    .single()
  if (error) {
    console.error(`[${label}] ledger_reserve_failed:`, error.message)
    throw new Error('ledger_reserve_failed')
  }
  return { id: data && data.id != null ? data.id : null }
}

/**
 * Upstream call succeeded — write the real token counts onto the
 * reservation. Never throws; a failed finalize leaves a zero-token row
 * that still counts for the limit.
 */
async function finalizeGeneration(supabase, id, { inputTokens, outputTokens, cost }, tag) {
  if (id == null) return
  try {
    const { error } = await supabase
      .from(TABLE)
      .update({
        input_tokens: inputTokens == null ? 0 : inputTokens,
        output_tokens: outputTokens == null ? 0 : outputTokens,
        estimated_cost_usd: cost == null ? 0 : cost,
      })
      .eq('id', id)
    if (error) console.error(`[${tag}] ledger_finalize_failed:`, error.message)
  } catch (err) {
    console.error(`[${tag}] ledger_finalize_threw:`, err && err.message)
  }
}

/**
 * Upstream call failed — the user got nothing, so the reservation is
 * released. Never throws; a stuck reservation only makes the limiter more
 * conservative.
 */
async function releaseGeneration(supabase, id, tag) {
  if (id == null) return
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) console.error(`[${tag}] ledger_release_failed:`, error.message)
  } catch (err) {
    console.error(`[${tag}] ledger_release_threw:`, err && err.message)
  }
}

module.exports = {
  TABLE,
  countRowsSince,
  findOldestSince,
  checkRateLimits,
  reserveGeneration,
  finalizeGeneration,
  releaseGeneration,
}
