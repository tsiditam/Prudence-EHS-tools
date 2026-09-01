/**
 * The durable identity of an assessment — and the one property that, if it
 * breaks, charges customers twice.
 *
 * Under per-report pricing a purchase is keyed on the assessment uid. Every
 * assessment that existed before the uid did has none, so opening one has to
 * DERIVE its uid from the record id rather than mint a fresh one. If that
 * derivation is not pure, the record's identity changes on every open, the
 * entitlement stops matching, and re-downloading last month's report bills
 * the customer again — silently, because from the code's point of view it is
 * simply a different assessment.
 *
 * That is why the derivation tests come first and are the strictest here.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  newAssessmentUid,
  deriveLegacyUid,
  ensureAssessmentUid,
} from '../../src/billing/assessmentUid'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('deriveLegacyUid is pure — the money bug', () => {
  it('returns the same uid for the same record id, every time', () => {
    const id = 'rpt-1789234567890'
    const first = deriveLegacyUid(id)
    for (let i = 0; i < 50; i++) {
      expect(deriveLegacyUid(id), `call ${i} disagreed`).toBe(first)
    }
  })

  it('depends on nothing but its argument', () => {
    // No clock, no randomness, no I/O. Two calls straddling a time change
    // and a different call order must agree.
    const a = deriveLegacyUid('rpt-abc')
    const b = deriveLegacyUid('draft-zzz')
    const c = deriveLegacyUid('rpt-abc')
    expect(c).toBe(a)
    expect(b).not.toBe(a)
  })

  it('distinguishes record ids that differ by one character', () => {
    // Real ids are `rpt-` + Date.now(), so consecutive assessments differ in
    // the last digits only. Collisions there would merge two customers'
    // purchases.
    const ids = Array.from({ length: 200 }, (_, i) => `rpt-17892345678${String(i).padStart(2, '0')}`)
    const uids = new Set(ids.map(deriveLegacyUid))
    expect(uids.size).toBe(ids.length)
  })

  it('separates the draft and report forms of the same timestamp', () => {
    expect(deriveLegacyUid('draft-1789234567890')).not.toBe(deriveLegacyUid('rpt-1789234567890'))
  })

  it('emits a well-formed RFC 4122 uuid', () => {
    // The Supabase column is `uuid`; a malformed value is rejected at write
    // time, which would surface as a failed purchase.
    for (const id of ['rpt-1', 'draft-x', 'rpt-1789234567890', '']) {
      expect(deriveLegacyUid(id), id).toMatch(UUID_RE)
    }
  })

  it('does not throw on a missing or non-string id', () => {
    for (const bad of [null, undefined, 0, {}, []]) {
      expect(() => deriveLegacyUid(bad as never)).not.toThrow()
      expect(deriveLegacyUid(bad as never)).toMatch(UUID_RE)
    }
  })
})

describe('newAssessmentUid', () => {
  it('is a well-formed uuid', () => {
    expect(newAssessmentUid()).toMatch(UUID_RE)
  })

  it('is different every time', () => {
    const seen = new Set(Array.from({ length: 500 }, newAssessmentUid))
    expect(seen.size).toBe(500)
  })

  it('still works where crypto.randomUUID is unavailable', () => {
    // http:// origins and older iOS WebViews. This app installs as a PWA, so
    // the fallback is not theoretical. `globalThis.crypto` is getter-only in
    // Node, hence stubGlobal rather than assignment.
    try {
      vi.stubGlobal('crypto', {
        getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = (i * 7) % 256; return a },
      })
      expect(newAssessmentUid()).toMatch(UUID_RE)

      vi.stubGlobal('crypto', undefined)
      expect(newAssessmentUid(), 'no crypto at all').toMatch(UUID_RE)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('ensureAssessmentUid resolves in the right order', () => {
  it('keeps an existing uid untouched', () => {
    // Order 1 before 2 matters as much as 2 before 3: a later change to the
    // derivation must not re-identify a record already stamped and orphan
    // whatever was bought against it.
    const rec = { id: 'rpt-123', assessmentUid: '11111111-1111-4111-8111-111111111111' }
    expect(ensureAssessmentUid(rec)).toBe('11111111-1111-4111-8111-111111111111')
    expect(ensureAssessmentUid(rec)).not.toBe(deriveLegacyUid('rpt-123'))
  })

  it('derives from the record id when there is no uid — twice, identically', () => {
    // The exact re-open case that would otherwise re-charge.
    const rec = { id: 'rpt-1789234567890' }
    expect(ensureAssessmentUid(rec)).toBe(deriveLegacyUid('rpt-1789234567890'))
    expect(ensureAssessmentUid(rec)).toBe(ensureAssessmentUid({ ...rec }))
  })

  it('mints only when there is neither a uid nor an id', () => {
    const a = ensureAssessmentUid({})
    const b = ensureAssessmentUid({})
    expect(a).toMatch(UUID_RE)
    expect(b).not.toBe(a)
  })

  it('treats an empty-string uid as absent rather than valid', () => {
    expect(ensureAssessmentUid({ id: 'rpt-9', assessmentUid: '' })).toBe(deriveLegacyUid('rpt-9'))
  })

  it('survives a malformed record', () => {
    for (const bad of [null, undefined, 'record', 42]) {
      expect(ensureAssessmentUid(bad as never)).toMatch(UUID_RE)
    }
  })
})

describe('the lifecycle it exists to survive', () => {
  it('a stamped draft keeps its uid through finalize, when carried', () => {
    // finalize mints a NEW record id (`resolveFinalizeTarget`), which is the
    // whole reason the uid must be copied across rather than re-derived.
    const draft = { id: 'draft-1789234567890', assessmentUid: newAssessmentUid() }
    const finalized = { id: 'rpt-1789299999999', assessmentUid: draft.assessmentUid }
    expect(ensureAssessmentUid(finalized)).toBe(draft.assessmentUid)
  })

  it('but a re-derive across that boundary would NOT — which is the trap', () => {
    // Demonstrates why `:1645` must copy the draft's uid instead of calling
    // ensureAssessmentUid on the fresh report record.
    expect(deriveLegacyUid('rpt-1789299999999')).not.toBe(deriveLegacyUid('draft-1789234567890'))
  })

  it('a finalized record re-opened and re-finalized keeps one uid', () => {
    // resolveFinalizeTarget REUSES the id on the second finalize, so both the
    // carried and the derived path agree here — belt and braces.
    const report = { id: 'rpt-1789234567890', assessmentUid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
    const reopened = { ...report }
    const refinalized = { ...reopened }
    expect(ensureAssessmentUid(refinalized)).toBe(report.assessmentUid)
  })
})
