/**
 * The durable identity of an assessment.
 *
 * Record ids are not durable. `resolveFinalizeTarget` mints a fresh
 * `rpt-<timestamp>` the first time a `draft-<timestamp>` session finalizes,
 * so the id an assessment is known by CHANGES exactly once in its life — at
 * the moment it becomes a deliverable. That is fine for storage, which is all
 * it was ever asked to do, and it is why this module exists instead of a
 * change to `finalizeTarget.js`: record ids are load-bearing across six
 * call sites in `supabaseStorage.js` that split drafts from reports on the
 * id/status shape, and the duplicate-reports bug already lives in that
 * neighbourhood. The uid rides ALONGSIDE the record id. Nothing else moves.
 *
 * ── Why anything needs this ───────────────────────────────────────────────
 * Per-report pricing sells one assessment, once, with unlimited regenerations
 * forever. That requires a key that survives draft → finalize → re-open →
 * re-finalize, or the thing a customer paid for stops being findable at the
 * moment they paid for it.
 *
 * ── deriveLegacyUid is a money bug if it is not pure ──────────────────────
 * Every assessment that already exists has no uid. If opening one MINTS a
 * uid instead of DERIVING it, the record's identity changes on every open —
 * and under per-report pricing that means every re-open of an old report is a
 * fresh charge. A customer who downloads last month's report again pays
 * again, silently.
 *
 * So the rule is: existing uid, else DERIVE deterministically from the record
 * id, and only mint when there is neither. `deriveLegacyUid` is a pure
 * function of its input with no clock, no randomness and no I/O. It must
 * return the same uid for the same record id on every device, forever.
 *
 * Known and accepted: a legacy DRAFT's derived uid changes when it finalizes,
 * because its record id does. Acceptable because nothing is sold against a
 * draft — the paywall only bites once a deliverable exists.
 */

/** RFC 4122 field layout, applied to 16 bytes from any source. */
function formatUuid(bytes) {
  const b = Uint8Array.from(bytes)
  b[6] = (b[6] & 0x0f) | 0x40 // version 4/5 nibble
  b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * A new uid for an assessment that has never had one.
 *
 * `crypto.randomUUID` is unavailable on http:// origins and on some older
 * iOS WebViews, and this app is a PWA that people install — so the fallback
 * is not theoretical. It is only ever used for a BRAND-NEW assessment, never
 * to re-identify an existing one, so a weaker source of entropy costs
 * collision resistance and nothing else.
 */
export function newAssessmentUid() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    return formatUuid(c.getRandomValues(new Uint8Array(16)))
  }
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  return formatUuid(bytes)
}

/**
 * The uid a pre-existing record has always implicitly had.
 *
 * PURE. Same record id in, same uid out, on every device, forever. Read the
 * header before changing anything here — a non-deterministic result charges
 * customers twice.
 *
 * FNV-1a over the id, expanded to 16 bytes by re-hashing with a per-block
 * salt. Not cryptographic and does not need to be: it is a namespacing
 * function over strings this app itself minted (`draft-…` / `rpt-…`), where
 * the only requirement is determinism and a negligible collision rate across
 * one user's records. It is deliberately dependency-free and synchronous so
 * it can run inside a render path; SubtleCrypto is async and would not.
 */
export function deriveLegacyUid(recordId) {
  const s = String(recordId == null ? '' : recordId)
  const bytes = new Uint8Array(16)
  for (let block = 0; block < 4; block++) {
    // FNV-1a 32-bit, salted per block so the four words differ.
    let h = 0x811c9dc5
    h = Math.imul(h ^ (block + 1), 0x01000193) >>> 0
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
    }
    bytes[block * 4 + 0] = (h >>> 24) & 0xff
    bytes[block * 4 + 1] = (h >>> 16) & 0xff
    bytes[block * 4 + 2] = (h >>> 8) & 0xff
    bytes[block * 4 + 3] = h & 0xff
  }
  return formatUuid(bytes)
}

/**
 * The uid for a record, in priority order:
 *   1. the one it already carries — never re-derived, never re-minted
 *   2. derived from its record id — the legacy path, deterministic
 *   3. minted — only when the record has neither
 *
 * Order 1 before 2 matters as much as 2 before 3: once a record has been
 * stamped, a later change to `deriveLegacyUid` must not silently re-identify
 * it and orphan whatever was bought against it.
 */
export function ensureAssessmentUid(record) {
  const r = record && typeof record === 'object' ? record : {}
  if (typeof r.assessmentUid === 'string' && r.assessmentUid) return r.assessmentUid
  if (typeof r.id === 'string' && r.id) return deriveLegacyUid(r.id)
  return newAssessmentUid()
}
