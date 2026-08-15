/**
 * AtmosFlow — Editorial Suppressions
 *
 * Pure data + pure functions: no React, no storage, no network.
 *
 * An "editorial suppression" is a single piece of report content that the
 * reviewing professional chose to CUT from the client deliverable, after an
 * editorial-review pass proposed it. This module is the persisted record of
 * those human-approved cuts and the membership test the report renderer uses
 * to honor them.
 *
 * Design boundaries, on purpose:
 *   - The MODEL is authored by the engine and is untouched. Suppressions do
 *     not change what the engine produces; they change what the client-facing
 *     renderer emits. The engine remains the source of truth for what COULD be
 *     said; the reviewing professional decides what the report SHOWS.
 *   - Because a human approves each cut and no model writes client text, an
 *     applied suppression carries no AI-provenance obligation. The record just
 *     stores which content the reviewer removed, who removed it, and when.
 *   - Targets are stable content identifiers, never free text to be matched
 *     loosely: finding ids and zone ids are stable/branded; section anchors
 *     are stable; results subsections and recommendations have no engine id, so
 *     they key on a normalized heading / (priority + action) respectively.
 *
 * Mirrors the shape and discipline of calibrationAcknowledgement.js.
 */

export const EDITORIAL_SUPPRESSIONS_VERSION = 1

// Allowed target kinds. Keep in step with makeTargetKey and the renderer.
export const SUPPRESSION_KINDS = Object.freeze([
  'finding',           // { kind:'finding', findingId }
  'zone',              // { kind:'zone', zoneId }
  'resultsSubsection', // { kind:'resultsSubsection', heading }
  'recommendation',    // { kind:'recommendation', priority, action }
  'section',           // { kind:'section', anchorId }
])

function norm(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Canonical string key for a target, used for O(1) membership tests. Returns
 * null for a malformed/unknown target so callers can drop it.
 */
export function makeTargetKey(target) {
  if (!target || typeof target !== 'object') return null
  switch (target.kind) {
    case 'finding':
      return target.findingId ? `finding:${target.findingId}` : null
    case 'zone':
      return target.zoneId ? `zone:${target.zoneId}` : null
    case 'resultsSubsection':
      return target.heading ? `results:${norm(target.heading)}` : null
    case 'recommendation':
      return target.priority && target.action
        ? `rec:${norm(target.priority)}:${norm(target.action)}`
        : null
    case 'section':
      return target.anchorId ? `section:${norm(target.anchorId)}` : null
    default:
      return null
  }
}

/**
 * Build a persisted suppressions record from a list of approved cuts.
 * Each cut is { target, label?, rationale?, source? }. Returns null when no
 * valid target survives, so an empty approval never writes a record.
 *
 * @param {object} input
 * @param {Array}  input.cuts        approved cuts (target + optional metadata)
 * @param {string} [input.approvedBy] name/id of the reviewing professional
 * @param {string} [input.approvedAt] ISO timestamp (caller supplies the clock)
 */
export function buildEditorialSuppressions(input = {}) {
  const cuts = Array.isArray(input.cuts) ? input.cuts : []
  const seen = new Set()
  const targets = []
  for (const cut of cuts) {
    const target = cut && cut.target ? cut.target : cut
    const key = makeTargetKey(target)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const entry = { kind: target.kind }
    // Copy only the identifying fields for the kind.
    if (target.findingId) entry.findingId = target.findingId
    if (target.zoneId) entry.zoneId = target.zoneId
    if (target.heading) entry.heading = target.heading
    if (target.priority) entry.priority = target.priority
    if (target.action) entry.action = target.action
    if (target.anchorId) entry.anchorId = target.anchorId
    if (cut && typeof cut.label === 'string') entry.label = cut.label
    if (cut && typeof cut.rationale === 'string') entry.rationale = cut.rationale
    targets.push(entry)
  }
  if (targets.length === 0) return null
  const record = { version: EDITORIAL_SUPPRESSIONS_VERSION, targets }
  if (typeof input.approvedBy === 'string' && input.approvedBy) record.approvedBy = input.approvedBy
  if (typeof input.approvedAt === 'string' && input.approvedAt) record.approvedAt = input.approvedAt
  return record
}

/**
 * Normalize a possibly-legacy / partial raw record into the canonical shape,
 * or null when there is nothing usable. Tolerates a bare array of targets.
 */
export function normalizeEditorialSuppressions(raw) {
  if (!raw) return null
  const targets = Array.isArray(raw) ? raw : (Array.isArray(raw.targets) ? raw.targets : [])
  const seen = new Set()
  const out = []
  for (const t of targets) {
    const key = makeTargetKey(t)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  if (out.length === 0) return null
  const record = { version: EDITORIAL_SUPPRESSIONS_VERSION, targets: out }
  if (raw && typeof raw.approvedBy === 'string') record.approvedBy = raw.approvedBy
  if (raw && typeof raw.approvedAt === 'string') record.approvedAt = raw.approvedAt
  return record
}

/**
 * Build a fast membership index from a suppressions record (or raw shape).
 * Returns an object with a `has(target)` predicate and the underlying Set.
 * Always returns a usable index (empty when there are no suppressions), so
 * the renderer can call `.has(...)` unconditionally.
 */
export function makeSuppressionIndex(raw) {
  const record = normalizeEditorialSuppressions(raw)
  const keys = new Set()
  if (record) {
    for (const t of record.targets) {
      const key = makeTargetKey(t)
      if (key) keys.add(key)
    }
  }
  return {
    size: keys.size,
    keys,
    has(target) {
      const key = makeTargetKey(target)
      return key ? keys.has(key) : false
    },
  }
}

/** Convenience: is a single target suppressed by the given index? */
export function isSuppressed(index, target) {
  return !!(index && typeof index.has === 'function' && index.has(target))
}
