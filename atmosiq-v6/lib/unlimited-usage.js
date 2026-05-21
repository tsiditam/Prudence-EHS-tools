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

module.exports = { hasUnlimitedUsage, parseAllowlist }
