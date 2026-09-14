/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Stable identity for the things the evidence package makes referable.
 *
 * ── What was wrong ─────────────────────────────────────────────────────
 * Findings were `find-<zone-slug>-<i>` and recommendations `rec-<i>-<slug>`,
 * where `i` indexes the whole list. For findings the index runs across ALL
 * zones, so the zone prefix implied a per-zone scoping it never had: adding
 * a finding in the first zone re-pointed the id of every finding after it,
 * including ones in other zones. Both were positional ids wearing content's
 * clothing.
 *
 * That was survivable while nothing referred to them — the package is
 * rebuilt on every call and nothing persists an id. It stops being
 * survivable the moment anything REFERENCES one: an authoring plan naming
 * `find-zone-3` means a different finding after an unrelated edit, and the
 * reference resolves successfully to the wrong thing, which is worse than
 * failing.
 *
 * ── The rule ───────────────────────────────────────────────────────────
 * Identity is derived from the fields that define WHAT the thing is, and
 * never from fields describing WHEN or HOW it was generated.
 *
 * Excluded, deliberately: array position, generation timestamp, severity
 * (it can legitimately change while the finding stays the same finding),
 * provider and model, the report fingerprint, and display ordering.
 *
 * Included for a finding: the zone, the parameter, the criterion or
 * evidence basis, and the canonical finding text. The criterion matters on
 * its own — "PM2.5 exceeded criterion A" and "PM2.5 exceeded criterion B"
 * are not the same finding merely because their reader-facing sentence
 * happens to match.
 *
 * ── Hashed from a structured tuple, never a joined string ──────────────
 * `stableStringify` first, then the hash. A concatenated string invites
 * delimiter ambiguity — a zone called "A" with parameter "B|C" and a zone
 * called "A|B" with parameter "C" would collide under any separator that
 * can appear in the data. This matches the discipline the semantic layer
 * already applies.
 *
 * ── The version is explicit on purpose ─────────────────────────────────
 * `IDENTITY_VERSION` and `IDENTITY_ALGORITHM` are exported and asserted by
 * test. If these ids ever become a durable or wire-visible contract, a
 * later tidy-up must not silently redefine every id in the product; it has
 * to change a constant that something is watching.
 */

import { fnv1aHex } from '../utils/forensicEvents.js'

/** Bumped when the identity TUPLE changes — a new id for the same thing. */
export const IDENTITY_VERSION = 1

/** Named so a change of hash is a deliberate, visible act. */
export const IDENTITY_ALGORITHM = 'fnv1a-32'

/**
 * Deterministic serialization, sorted at every level.
 *
 * `JSON.stringify`'s array-form replacer filters keys at EVERY nesting
 * level, not just the top — a well-known trap. With no key also appearing
 * as a nested field name, that would have stringified every nested object
 * as `{}`. This sorts keys at each level instead, recursively, so the same
 * content always serializes to the same string.
 *
 * Lives here rather than in `evidencePackage.js` because two things now
 * depend on it — the freshness fingerprint and these ids — and a second
 * copy is how two serializers start disagreeing about the same object.
 */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const str = (v) => (v === null || v === undefined ? '' : String(v))

/**
 * Text reduced to what it CLAIMS, so cosmetic reformatting is not a new
 * identity.
 *
 * Whitespace is collapsed — a line break introduced by rewrapping is not a
 * different finding. Case is preserved: engine sentences come from
 * `buildStatement` rather than being hand-typed, so case carries meaning
 * (unit symbols, standard names) and folding it would risk collapsing
 * findings that differ only in a proper noun.
 */
export const canonicalText = (text) => str(text).replace(/\s+/g, ' ').trim()

/**
 * The most stable handle available for a zone.
 *
 * A real zone id is preferred and is NOT currently reachable here:
 * `scoreZone` returns `zoneName` and drops `zid`, so the normalized name is
 * what actually runs today. The order is written out anyway so that wiring
 * `zid` through later needs no change at this end — and so the fallback is
 * visible as a fallback rather than looking like the design.
 *
 * Normalization is deliberately light: trimmed, whitespace-collapsed,
 * case-folded. Renaming a zone DOES change its findings' ids, which is
 * correct — without a stable id there is nothing else to hold on to, and
 * pretending otherwise would be worse than saying so.
 */
export function zoneIdentity(source) {
  const s = source && typeof source === 'object' ? source : { name: source }
  const explicit = str(s.zone_id || s.zid || s.id).trim()
  if (explicit) return explicit
  return canonicalText(s.zone || s.zoneName || s.name).toLowerCase()
}

/** `prefix-<hash>` over a structured tuple. Never over a joined string. */
const idFrom = (prefix, tuple) => `${prefix}-${fnv1aHex(stableStringify(tuple))}`

/**
 * What a finding IS.
 *
 * `evidence_basis` stands in where no criterion applied — an observation or
 * an intake answer still has a basis, and two findings resting on different
 * bases are different findings even when the sentence matches.
 */
export function findingIdentity(finding) {
  const f = finding && typeof finding === 'object' ? finding : {}
  return idFrom('find', {
    zone: zoneIdentity(f),
    parameter: str(f.parameter),
    criterion_id: str(f.criterion_id),
    evidence_basis: str(f.basis),
    text: canonicalText(f.text),
  })
}

/**
 * What a recommendation IS.
 *
 * Action and location only, and the omissions are the substance.
 * `priority` and `timeframe` are the register bucket — the same action made
 * more urgent is the same action, so they are metadata by the test "would a
 * professional call this a different recommendation, or the same one with
 * updated scheduling". `control`, `owner` and `evidence` are all derived
 * from one `controlTier` field and describe how the action is categorized
 * rather than what it is.
 *
 * There is no linked-finding id to include: `evidence` on a register row is
 * per-tier boilerplate, not a reference to the condition. If that link is
 * ever built, it belongs in this tuple.
 */
export function recommendationIdentity(rec) {
  const r = rec && typeof rec === 'object' ? rec : {}
  return idFrom('rec', {
    action: canonicalText(r.action),
    location: canonicalText(r.location),
  })
}

/**
 * The whole row reduced to canonical content, for disambiguation only.
 *
 * Keys sorted by `stableStringify`, string values put through
 * `canonicalText`, and `id` excluded so the function never depends on a
 * value it is helping to compute.
 */
function canonicalRow(row) {
  const out = {}
  for (const key of Object.keys(row || {})) {
    if (key === 'id') continue
    const v = row[key]
    out[key] = typeof v === 'string' ? canonicalText(v) : v
  }
  return out
}

/**
 * Stamp ids onto a list, without letting position back in anywhere.
 *
 * ── The trap this avoids, which the first version walked into ──────────
 * An earlier draft suffixed collisions with an occurrence count — `-2`,
 * `-3` — on the reasoning that two rows sharing an identity tuple must be
 * the same thing, so their order could not matter. That reasoning is
 * wrong, and the case is real rather than theoretical: two rows can match
 * on identity while differing in the fields identity deliberately EXCLUDES.
 * "Clean the condensate pan @ AHU-4, Immediate" and the same action at
 * "Ongoing" are a normal pattern — remediate now, keep watching — and they
 * are plainly distinguishable rows. Under an occurrence count, reordering
 * the register swapped their two ids.
 *
 * ── The rule ───────────────────────────────────────────────────────────
 * Rows that collide on identity are either collapsed deliberately as the
 * same thing, or told apart by additional canonical CONTENT. Never by
 * array position and never by how many like it came before.
 *
 * So a collision is broken by hashing the row's full canonical content.
 * That is a pure function of the row, so the pair above gets two fixed ids
 * whichever order they arrive in.
 *
 * ── When content is identical too ──────────────────────────────────────
 * Then the rows are the same row listed twice, they receive the SAME id,
 * and that is the deliberate collapse rather than an oversight: there is no
 * way to tell two identical things apart except by position, which is the
 * thing being removed. If it ever happens the fix belongs upstream — a
 * register should not propose one action twice — so the package asserts by
 * test that no such pair exists rather than papering over it here.
 *
 * (Measured: 19/19 and 11/11 distinct identities on the two demo
 * registers, so collision handling is a safety net, not a routine path.)
 */
export function assignStableIds(rows, identityFor) {
  const list = Array.isArray(rows) ? rows : []
  const bases = list.map((row) => identityFor(row))
  // Counted over the WHOLE list before anything is stamped, so whether a
  // row is "in a collision" does not depend on where it sits.
  const shared = new Map()
  for (const b of bases) shared.set(b, (shared.get(b) || 0) + 1)
  return list.map((row, i) => {
    const base = bases[i]
    if (shared.get(base) === 1) return { ...row, id: base }
    return { ...row, id: `${base}-${fnv1aHex(stableStringify(canonicalRow(row)))}` }
  })
}
