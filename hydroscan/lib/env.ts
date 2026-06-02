/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Typed environment accessors for the `/api/*` serverless functions.
 * Centralizes the "url + service-role key" lookup (with the VITE_*
 * fallbacks the client build uses) and the Anthropic key, so handlers
 * don't each re-derive them. Server-only — never import from the SPA.
 */

export interface SupabaseServerEnv {
  url: string
  serviceRoleKey: string
}

/** Returns the server Supabase config, or null when unconfigured. */
export function getSupabaseServerEnv(): SupabaseServerEnv | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) return null
  return { url, serviceRoleKey }
}

/** Anthropic API key for the Marlow assistant, or null when unset. */
export function getAnthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || null
}

/** Comma-separated allowlist of emails granted unlimited usage. */
export function getUnlimitedUsageEmails(): string[] {
  return (process.env.UNLIMITED_USAGE_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}
