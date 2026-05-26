/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * labCsvTemplates — per-lab column-mapping templates that the IH
 * can save once and re-apply to subsequent CSVs from the same lab.
 * Stored in localStorage so the templates survive across sessions
 * without a server round-trip.
 *
 * Storage shape:
 *   {
 *     templates: [
 *       {
 *         id: string,
 *         name: string,                  // user-supplied label, e.g. "EMSL Standard"
 *         laboratory: string|null,       // detected lab id (used for auto-apply)
 *         mapping: Record<string,string>, // { rawHeader: canonicalField }
 *         createdAt: string,
 *         updatedAt: string,
 *       },
 *       ...
 *     ]
 *   }
 *
 * The mapping is the same shape the parser's `overrides` opt accepts,
 * so applying a template is `parseLabResultsCsv(text, { overrides: t.mapping })`.
 */

import { KEYS } from './storageKeys'

const STORAGE_KEY = KEYS.labCsvTemplates

function readStore() {
  if (typeof localStorage === 'undefined') return { templates: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { templates: [] }
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.templates)) return { templates: [] }
    return parsed
  } catch {
    return { templates: [] }
  }
}

function writeStore(next) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota exceeded / private browsing — best-effort; the templates
    // just won't persist this session.
  }
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `tpl-${crypto.randomUUID().slice(0, 8)}`
  }
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Return all saved templates, newest-first.
 */
export function listTemplates() {
  return readStore().templates.slice().sort((a, b) => {
    const ta = a.updatedAt || a.createdAt || ''
    const tb = b.updatedAt || b.createdAt || ''
    return tb.localeCompare(ta)
  })
}

/**
 * Find the best template for an auto-detected laboratory string.
 * Returns null when no match is found — the caller should fall back
 * to auto-detect with an empty overrides map.
 *
 * Matching is case-insensitive substring match against the
 * template's saved `laboratory` field. Multiple matches return the
 * most-recently-updated template (so the user's iterations win over
 * stale saves).
 */
export function findTemplateForLab(laboratory) {
  if (!laboratory || typeof laboratory !== 'string') return null
  const needle = laboratory.toLowerCase()
  const matches = readStore().templates.filter((t) =>
    t && typeof t.laboratory === 'string'
    && t.laboratory.toLowerCase().includes(needle),
  )
  if (matches.length === 0) return null
  matches.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
  return matches[0]
}

/**
 * Persist a new template or update an existing one (matched by id
 * when supplied, otherwise by case-insensitive name). Returns the
 * saved template with timestamps.
 *
 * @param {{ id?: string, name: string, laboratory?: string|null, mapping: Record<string,string> }} input
 */
export function saveTemplate(input) {
  if (!input || typeof input !== 'object') throw new Error('saveTemplate_invalid_input')
  const name = String(input.name || '').trim()
  if (!name) throw new Error('saveTemplate_empty_name')
  const mapping = (input.mapping && typeof input.mapping === 'object') ? input.mapping : {}
  const now = new Date().toISOString()
  const store = readStore()

  let existingIdx = -1
  if (input.id) {
    existingIdx = store.templates.findIndex((t) => t.id === input.id)
  }
  if (existingIdx === -1) {
    existingIdx = store.templates.findIndex((t) =>
      typeof t.name === 'string' && t.name.toLowerCase() === name.toLowerCase(),
    )
  }

  const next = {
    id: existingIdx === -1 ? makeId() : store.templates[existingIdx].id,
    name,
    laboratory: input.laboratory || null,
    mapping,
    createdAt: existingIdx === -1 ? now : (store.templates[existingIdx].createdAt || now),
    updatedAt: now,
  }
  if (existingIdx === -1) store.templates.push(next)
  else store.templates[existingIdx] = next
  writeStore(store)
  return next
}

/**
 * Remove a template by id. Returns true when a row was removed,
 * false when the id wasn't found.
 */
export function deleteTemplate(id) {
  if (!id) return false
  const store = readStore()
  const before = store.templates.length
  store.templates = store.templates.filter((t) => t.id !== id)
  if (store.templates.length === before) return false
  writeStore(store)
  return true
}

/**
 * Wipe all templates. Used by the Settings → Reset / dev tooling.
 */
export function clearAllTemplates() {
  writeStore({ templates: [] })
}

// Test-only — exported under __test so production code doesn't
// accidentally bypass the public API.
export const __test = {
  readStore,
  writeStore,
  STORAGE_KEY,
}
