#!/usr/bin/env node
/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * check-env — lists the server-side environment variables that are
 * missing before the API layer is started. Every variable named here is
 * read by something under api/, lib/ or server/ (grep `process.env.`);
 * `.env.example` and docs/ENVIRONMENT.md carry the one-line description
 * of each.
 *
 * Usage:
 *   node scripts/check-env.mjs            # exit 1 and list what is missing
 *   node scripts/check-env.mjs --warn     # report only, always exit 0
 *   npm run check:env
 *
 * Programmatic:
 *   import { checkEnv } from './scripts/check-env.mjs'
 *   const { missing, optionalMissing } = checkEnv(process.env)
 *
 * The container entrypoint (server/index.js) calls this at boot and logs
 * the result; it does not refuse to start, because a partially configured
 * container that serves the SPA is more useful than one that exits, and
 * each handler already 500s with a "not configured" message for its own
 * secrets.
 */

/** Without these the core product (auth, assessments, billing) cannot work. */
export const REQUIRED_SERVER_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
  'CRON_SECRET',
]

/** Read by a subset of routes; missing ones degrade that feature only. */
export const OPTIONAL_SERVER_VARS = [
  'ADMIN_SECRET',
  'RESEND_API_KEY',
  'RESEND_FROM_ADDRESS',
  'SENTRY_DSN',
  'UNLIMITED_USAGE_EMAILS',
  'STRIPE_PRICE_SOLO_MONTHLY',
  'STRIPE_PRICE_SOLO_ANNUAL',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_ANNUAL',
  'STRIPE_PRICE_PRACTICE_MONTHLY',
  'STRIPE_PRICE_PRACTICE_ANNUAL',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_ENV',
  'NODE_ENV',
  'PORT',
]

const isSet = (v) => typeof v === 'string' && v.trim().length > 0

/**
 * Pure check. SUPABASE_URL may be supplied as VITE_SUPABASE_URL (every
 * handler falls back to it), so either satisfies that requirement.
 */
export function checkEnv(env = process.env) {
  const missing = REQUIRED_SERVER_VARS.filter((k) => {
    if (k === 'SUPABASE_URL') return !isSet(env.SUPABASE_URL) && !isSet(env.VITE_SUPABASE_URL)
    return !isSet(env[k])
  })
  const optionalMissing = OPTIONAL_SERVER_VARS.filter((k) => !isSet(env[k]))
  return { ok: missing.length === 0, missing, optionalMissing }
}

export function formatReport({ missing, optionalMissing }) {
  const lines = []
  if (missing.length === 0) lines.push('[check-env] all required server variables are set')
  else {
    lines.push(`[check-env] MISSING required server variables (${missing.length}):`)
    for (const k of missing) lines.push(`  - ${k}`)
  }
  if (optionalMissing.length) lines.push(`[check-env] optional, unset: ${optionalMissing.join(', ')}`)
  return lines.join('\n')
}

const isMain = process.argv[1] && /check-env\.mjs$/.test(process.argv[1])
if (isMain) {
  const result = checkEnv(process.env)
  console.log(formatReport(result))
  if (!result.ok && !process.argv.includes('--warn')) process.exit(1)
}
