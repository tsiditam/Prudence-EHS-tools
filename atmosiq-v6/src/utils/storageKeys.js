/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Single source of truth for localStorage keys.
 *
 * AtmosFlow's stored keys span two historical namespaces:
 *   • 'atmosiq-*'  — core/legacy data written since the app's original
 *     name (atmosiq-v6): the reports/drafts index, profile, cached auth
 *     session, sync queue/state, trash, and saved profiles.
 *   • 'atmosflow:*' — feature data added after the product rename:
 *     incidents, buildings, projects, mode, instruments, etc.
 *
 * The key STRINGS are intentionally preserved exactly as written — they
 * hold live user data in the field, so renaming one would orphan every
 * existing install unless paired with a migration. Centralizing them here
 * removes the scattered magic strings and stops further namespace drift;
 * it does NOT change any stored data.
 *
 * RULE FOR NEW KEYS: use the 'atmosflow:' namespace, add the constant
 * here, and reference KEYS.x — never an inline string literal elsewhere.
 *
 * Out of scope: per-record keys generated from an entity id (e.g.
 * 'rpt-...', 'draft-...', 'bld-...') are addressed by their id, not a
 * fixed namespace, and are not listed here.
 *
 * A future prefix unification would live here too: add the new key and a
 * one-time copy-forward migration (mirroring STO._migrateComplaints in
 * storage.js) so existing data is preserved.
 */

export const KEYS = {
  // ── Core / legacy ('atmosiq-*') — do not rename without a migration ──
  index: 'atmosiq-idx',              // { reports: [], drafts: [] } report/draft index
  visited: 'atmosiq-visited',        // first-run flag
  profile: 'atmosiq-profile',        // active user profile (auth-synced)
  cachedSession: 'atmosiq-cached-session', // offline-restore auth session cache
  trash: 'atmosiq-trash',            // soft-deleted reports/drafts
  profiles: 'atmosiq-profiles',      // saved assessor profiles
  activeProfile: 'atmosiq-active-profile',
  syncQueue: 'atmosiq-sync-queue',   // pending Supabase writes
  syncState: 'atmosiq-sync-state',

  // ── Feature data ('atmosflow:*') ──
  incidents: 'atmosflow:incidents',
  complaintsMigrated: 'atmosflow:complaints-migrated',
  // Site library — local cache of /api/sites (habit-loop PR 1).
  // Cloud is authoritative; this mirror lets the dashboard / FAB
  // read sites without a fresh fetch.
  sites: 'atmosflow:sites',
  userMode: 'atmosflow:userMode',    // 'ih' | 'fm'
  buildings: 'atmosflow:buildings',  // FM portfolio
  projects: 'atmosflow:projects',    // Project / Site Folders
  premiumOverride: 'atmosflow:premiumOverride',
  instruments: 'atmosflow:instruments',
  labCsvTemplates: 'atmosflow:lab_csv_templates',
}

// Per-building complaint lists are stored under a building-scoped key.
export const complaintsKey = (buildingId) => `atmosflow:complaints:${buildingId}`

// Prefix used to enumerate all per-building complaint lists (migration).
export const COMPLAINTS_PREFIX = 'atmosflow:complaints:'

export default KEYS
