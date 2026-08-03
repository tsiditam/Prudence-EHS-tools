/**
 * The calibration acknowledgement model.
 *
 * This record is the difference between an undocumented dismissal and a
 * defensible judgement call, so the properties pinned here are the ones
 * that make it worth anything in a dispute:
 *
 *   • It cannot exist without reasoning. A record with no justification
 *     is not an acknowledgement — it is the click-through it replaces.
 *   • It is a SNAPSHOT. The items are stored as the assessor saw them,
 *     never re-derived, so a later presurvey edit cannot rewrite the
 *     history of the decision.
 *   • It ADDS disclosure and never removes any. Nothing here suppresses
 *     a data gap, a warning, or an appendix row.
 */
import { describe, it, expect } from 'vitest'
import {
  CAL_ACK_VERSION,
  MIN_JUSTIFICATION_LEN,
  MAX_JUSTIFICATION_LEN,
  validateJustification,
  buildCalibrationAcknowledgement,
  hasAcknowledgement,
  normalizeAcknowledgement,
  acknowledgementSummary,
  acknowledgementNotes,
} from '../../src/utils/calibrationAcknowledgement.js'

const GOOD = 'Rental unit; vendor calibration certificate to follow within five business days.'
const ITEMS = ['IAQ meter: calibration date not recorded', 'PID: serial number not recorded']

describe('validateJustification', () => {
  it('rejects nothing at all', () => {
    for (const v of [undefined, null, '', '   ', 42, {}]) {
      expect(validateJustification(v).ok, `should reject ${JSON.stringify(v)}`).toBe(false)
    }
  })

  it('rejects a token answer', () => {
    // "ok" and "." are exactly what an assessor types to make a modal go
    // away. If those qualify, the control is decorative.
    for (const v of ['ok', '.', 'n/a', 'fine']) {
      const r = validateJustification(v) as { ok: boolean; reason?: string }
      expect(r.ok, `should reject "${v}"`).toBe(false)
      expect(r.reason).toMatch(new RegExp(String(MIN_JUSTIFICATION_LEN)))
    }
  })

  it('accepts real reasoning', () => {
    expect(validateJustification(GOOD)).toEqual({ ok: true })
    expect(validateJustification('x'.repeat(MIN_JUSTIFICATION_LEN)).ok).toBe(true)
  })

  it('rejects an essay past the cap', () => {
    expect(validateJustification('x'.repeat(MAX_JUSTIFICATION_LEN + 1)).ok).toBe(false)
  })

  it('explains why rather than returning a bare false', () => {
    // The UI disables the proceed button on this; an assessor who cannot
    // see why is an assessor who abandons the assessment.
    const r = validateJustification('')
    expect(r.ok).toBe(false)
    expect(typeof (r as { reason: string }).reason).toBe('string')
    expect((r as { reason: string }).reason.length).toBeGreaterThan(10)
  })
})

describe('buildCalibrationAcknowledgement', () => {
  it('refuses to build without acceptable reasoning', () => {
    const build = buildCalibrationAcknowledgement as (input?: unknown) => unknown
    expect(build({ items: ITEMS, justification: 'ok' })).toBeNull()
    expect(build({ items: ITEMS })).toBeNull()
    expect(build()).toBeNull()
  })

  it('captures what was flagged, who accepted it, and when', () => {
    const ack = buildCalibrationAcknowledgement({
      items: ITEMS,
      justification: GOOD,
      assessor: { name: 'Tsidi Tamakloe', credentials: ['CSP', 'OSH'] },
      at: '2026-08-02T12:00:00.000Z',
    })
    expect(ack).toEqual({
      version: CAL_ACK_VERSION,
      items: ITEMS,
      justification: GOOD,
      assessorName: 'Tsidi Tamakloe',
      assessorCredentials: 'CSP, OSH',
      acknowledgedAt: '2026-08-02T12:00:00.000Z',
    })
  })

  it('stamps a timestamp when the caller does not supply one', () => {
    const ack = buildCalibrationAcknowledgement({ items: ITEMS, justification: GOOD })
    expect(ack.acknowledgedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('survives a missing assessor identity without inventing one', () => {
    const ack = buildCalibrationAcknowledgement({ items: ITEMS, justification: GOOD })
    expect(ack.assessorName).toBeNull()
    expect(ack.assessorCredentials).toBeNull()
  })

  it('does not alias the caller’s item array', () => {
    // The record is a snapshot. If it shares an array with live state, a
    // later presurvey edit rewrites what the assessor is recorded as
    // having seen — which is the fabrication this feature prevents.
    const items = [...ITEMS]
    const ack = buildCalibrationAcknowledgement({ items, justification: GOOD })
    items.push('added later')
    expect(ack.items).toEqual(ITEMS)
  })

  it('drops empty items rather than storing blanks', () => {
    const ack = buildCalibrationAcknowledgement({
      items: ['  real item  ', '', '   ', null],
      justification: GOOD,
    })
    expect(ack.items).toEqual(['real item'])
  })

  it('truncates rather than storing an unbounded justification', () => {
    const ack = buildCalibrationAcknowledgement({
      items: ITEMS,
      justification: 'y'.repeat(MAX_JUSTIFICATION_LEN),
    })
    expect(ack.justification.length).toBe(MAX_JUSTIFICATION_LEN)
  })
})

describe('normalizeAcknowledgement', () => {
  it('treats a record with no reasoning as no record', () => {
    for (const v of [null, undefined, {}, { items: ITEMS }, { justification: '  ' }, 'nope']) {
      expect(hasAcknowledgement(v)).toBe(false)
      expect(normalizeAcknowledgement(v)).toBeNull()
    }
  })

  it('round-trips a built record unchanged', () => {
    const ack = buildCalibrationAcknowledgement({
      items: ITEMS,
      justification: GOOD,
      assessor: { name: 'Tsidi Tamakloe', credentials: 'CSP' },
      at: '2026-08-02T12:00:00.000Z',
    })
    expect(normalizeAcknowledgement(ack)).toEqual(ack)
    expect(normalizeAcknowledgement(JSON.parse(JSON.stringify(ack)))).toEqual(ack)
  })

  it('tolerates a stored record missing the optional fields', () => {
    const out = normalizeAcknowledgement({ justification: GOOD })
    expect(out).toEqual({
      version: CAL_ACK_VERSION,
      items: [],
      justification: GOOD,
      assessorName: null,
      assessorCredentials: null,
      acknowledgedAt: null,
    })
  })
})

describe('acknowledgementSummary', () => {
  it('is null when there is nothing to summarize', () => {
    expect(acknowledgementSummary(null)).toBeNull()
  })

  it('names the professional and counts the items', () => {
    const ack = buildCalibrationAcknowledgement({
      items: ITEMS,
      justification: GOOD,
      assessor: { name: 'Tsidi Tamakloe', credentials: 'CSP' },
    })
    expect(acknowledgementSummary(ack)).toBe('2 instrument items acknowledged by Tsidi Tamakloe, CSP')
  })

  it('singularizes one item', () => {
    const ack = buildCalibrationAcknowledgement({ items: ['one'], justification: GOOD })
    expect(acknowledgementSummary(ack)).toBe('1 instrument item acknowledged by the assessor')
  })
})

describe('acknowledgementNotes — the client-facing sentences', () => {
  const ack = buildCalibrationAcknowledgement({
    items: ITEMS,
    justification: GOOD,
    assessor: { name: 'Tsidi Tamakloe', credentials: 'CSP' },
    at: '2026-08-02T12:00:00.000Z',
  })

  it('renders nothing when no acknowledgement exists', () => {
    expect(acknowledgementNotes(null)).toEqual([])
    expect(acknowledgementNotes({ items: ITEMS })).toEqual([])
  })

  it('answers what, who, when and why', () => {
    const text = acknowledgementNotes(ack).join(' ')
    expect(text).toMatch(/IAQ meter: calibration date not recorded/)
    expect(text).toMatch(/Tsidi Tamakloe, CSP/)
    // The stored record keeps the full instant; the client-facing
    // sentence prints the date only — a raw ISO timestamp mid-sentence
    // reads as a machine leaking into a professional document.
    expect(text).toMatch(/on 2026-08-02\b/)
    expect(text).not.toMatch(/T12:00:00/)
    expect(text).toContain(GOOD)
  })

  it('quotes the justification verbatim rather than paraphrasing it', () => {
    // Paraphrasing a professional's stated basis would put words in
    // their mouth in a client deliverable.
    expect(acknowledgementNotes(ack).some((n: string) => n.includes(`"${GOOD}"`))).toBe(true)
  })

  it('never claims the gap is resolved or excused', () => {
    const text = acknowledgementNotes(ack).join(' ').toLowerCase()
    expect(text).toMatch(/does not resolve the underlying gap/)
    for (const bad of ['waived', 'resolved the', 'no longer applies', 'may be disregarded', 'satisfies']) {
      expect(text, `must not say "${bad}"`).not.toContain(bad)
    }
  })

  it('falls back to a neutral actor rather than a blank name', () => {
    const anon = buildCalibrationAcknowledgement({ items: ITEMS, justification: GOOD })
    expect(acknowledgementNotes(anon).join(' ')).toMatch(/The assessor of record/)
  })

  it('omits the item sentence when no items were captured', () => {
    const out = acknowledgementNotes({ justification: GOOD })
    expect(out.join(' ')).not.toMatch(/Items outstanding/)
    expect(out.length).toBe(2)
  })
})
