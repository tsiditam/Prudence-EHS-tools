/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Unlimited-usage allowlist for AI endpoints. Reads the
 * UNLIMITED_USAGE_EMAILS environment variable — a comma-separated
 * list of email addresses that should bypass the per-minute /
 * per-day / free-tier rate limits in api/narrative.js,
 * api/field-assistant.ts, and api/photo-analyze.js.
 *
 * Purpose: lets the operator give internal test accounts effectively
 * unlimited AI usage without granting an admin-secret bypass or
 * minting fake Stripe subscriptions. Set the env var on Vercel
 * (Project Settings → Environment Variables) to a comma-separated
 * list, e.g.:
 *
 *   UNLIMITED_USAGE_EMAILS=mujuflystudio@gmail.com,qa@example.com
 *
 * The check is case-insensitive and tolerates whitespace around
 * commas. Missing or empty env var means no one is allowlisted —
 * the original rate limits apply to every account.
 *
 * Authored as CommonJS so api/narrative.js and api/photo-analyze.js
 * can require() it, and the TypeScript api/field-assistant.ts can
 * import it via the .js extension (the established pattern; see
 * lib/sentry.ts being imported as '../lib/sentry.js').
 */

'use strict'

function parseAllowlist(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * @param {string | null | undefined} email
 * @returns {boolean} true if the email is in UNLIMITED_USAGE_EMAILS.
 */
function hasUnlimitedUsage(email) {
  if (!email || typeof email !== 'string') return false
  const list = parseAllowlist(process.env.UNLIMITED_USAGE_EMAILS)
  if (list.length === 0) return false
  return list.includes(email.trim().toLowerCase())
}

/**
 * Plans whose deliverables are not metered per credit. `practice` is the
 * top self-serve tier (500 credits/month — lib/stripe-prices.ts) and is
 * treated as unlimited for the server-side deliverable gate; there is no
 * separate "unlimited" plan value in the profiles_plan_check constraint
 * (migration 009) but the name is accepted defensively.
 */
const UNMETERED_PLANS = new Set(['practice', 'unlimited'])

/**
 * Server-side gate for anything that produces a client deliverable (the
 * fixed PDF, a rendered DOCX template). Audit 2026-09 H3: nothing on the
 * server read credits_remaining — deduction was a separate client-initiated
 * POST, so a client that omitted it got every deliverable free. This does
 * NOT deduct; it only decides whether the handler may produce the artifact.
 *
 * @param {{ plan?: string|null, credits_remaining?: number|null }|null} profile
 * @param {string|null|undefined} email
 * @returns {boolean}
 */
function hasDeliverableEntitlement(profile, email) {
  if (hasUnlimitedUsage(email)) return true
  if (!profile) return false
  const plan = typeof profile.plan === 'string' ? profile.plan.toLowerCase() : ''
  if (UNMETERED_PLANS.has(plan)) return true
  const credits = Number(profile.credits_remaining)
  return Number.isFinite(credits) && credits > 0
}

module.exports = { hasUnlimitedUsage, parseAllowlist, hasDeliverableEntitlement, UNMETERED_PLANS }
