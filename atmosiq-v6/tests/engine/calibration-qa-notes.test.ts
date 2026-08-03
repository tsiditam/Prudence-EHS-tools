/**
 * The calibration appendix's QA notes are client-facing assertions about
 * AtmosFlow's own controls, so they have to be literally true.
 *
 * Two of them were not, and shipped for some time:
 *
 *   1. "AtmosFlow blocks report finalization when any listed instrument
 *      is past validity." Overstated. Stale calibration INTERRUPTS
 *      finalization (MobileApp.finishAssessment) with a warning listing
 *      what is missing — but the assessor could proceed, and report
 *      EXPORT is not gated at all. "Blocks" promised a hard control that
 *      is really a speed bump.
 *
 *   2. "Finalization was permitted only via the documented override
 *      path." Doubly untrue: finalization was never blocked, and the
 *      override it named is unreachable, and has since been deleted
 *      outright: engine v2.9 removed the refusal it existed to bypass,
 *      which turned it into a way of SUPPRESSING data-gap disclosures.
 *
 * Claiming a control that does not exist is worse than claiming none: it
 * invites a client, or an opposing expert, to rely on a safeguard that
 * was never applied. These tests exist so neither sentence can return.
 *
 * The second half of the file covers what REPLACED that override: the
 * calibration acknowledgement. It runs the opposite risk — a record that
 * looks like it excuses the gap — so those tests assert that every
 * existing disclosure survives alongside it.
 */
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — calibration-appendix is a .js module without type declarations
import { buildCalibrationAppendix } from '../../src/components/docx/calibration-appendix'

const NOW = new Date('2026-08-02T12:00:00Z')
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10)

/** Presurvey with one IAQ meter at a given calibration date. */
const presurvey = (calDate: string | undefined) => ({
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_serial: 'QT-1234',
  ...(calDate ? { ps_inst_iaq_cal: calDate } : {}),
})

const notesFor = (calDate: string | undefined): string[] => {
  const out = buildCalibrationAppendix(presurvey(calDate), { now: NOW }) as {
    appendixE?: { qaNotes?: string[] } | null
  }
  return out.appendixE?.qaNotes || []
}

/** Every note, joined — the text a reader actually sees. */
const textFor = (calDate: string | undefined) => notesFor(calDate).join(' ')

describe('the appendix never claims a control that does not exist', () => {
  for (const [label, cal] of [
    ['current', daysAgo(30)],
    ['expiring', daysAgo(360)],
    ['expired', daysAgo(400)],
    ['unrecorded', undefined],
  ] as Array<[string, string | undefined]>) {
    it(`does not claim issuance is blocked (${label})`, () => {
      const text = textFor(cal)
      expect(text).not.toMatch(/blocks report finalization/i)
      expect(text).not.toMatch(/\bblocks?\b.*\bfinaliz/i)
    })

    it(`does not claim an override path was used (${label})`, () => {
      const text = textFor(cal)
      expect(text).not.toMatch(/override path/i)
      expect(text).not.toMatch(/permitted only via/i)
    })
  }
})

describe('what the notes do say', () => {
  it('states the validity window and that it does not gate issuance', () => {
    const text = textFor(daysAgo(30))
    expect(text).toMatch(/Calibration validity: \d+ days/)
    // States the interrupt accurately: it stops you and makes you look,
    // it does not prevent you. Understating it is as wrong as
    // overstating it — CLAUDE.md calls this gate a litigation defense,
    // and a note saying it does nothing would invite its removal.
    expect(text).toMatch(/interrupt assessment finalization/i)
    // Since the acknowledgement shipped, proceeding costs a written
    // justification. That is a stronger claim than the old wording, so
    // it has to stay true: if the textarea in MobileApp's calWarning
    // sheet ever becomes optional, this assertion is the thing that
    // should fail before a client reads the promise.
    expect(text).toMatch(/requires a written acknowledgement/i)
    // The judgement is the assessor's, which is the standing product
    // position — AtmosFlow surfaces, the credentialed assessor decides.
    expect(text).toMatch(/assessor of record determines/i)
  })

  it('tells the reader what to do about an expired instrument', () => {
    const text = textFor(daysAgo(400))
    expect(text).toMatch(/PAST calibration validity/)
    expect(text).toMatch(/screening-only/i)
    expect(text).toMatch(/re-confirmed with an instrument within validity/i)
  })

  it('points an unrecorded calibration at the data-gap warning it really triggers', () => {
    // This is the one calibration condition with a report-level
    // consequence: the engine trigger reads the same presurvey fields.
    const text = textFor(undefined)
    expect(text).toMatch(/no recorded calibration date/i)
    expect(text).toMatch(/Limitations on Reliance/)
  })

  it('does not warn about expiry when the instrument is current', () => {
    const text = textFor(daysAgo(30))
    expect(text).not.toMatch(/PAST calibration validity/)
    expect(text).not.toMatch(/warning window/i)
  })
})

// ── The acknowledgement ────────────────────────────────────────────────

const ACK = {
  version: 1,
  items: ['IAQ meter: calibration date not recorded'],
  justification: 'Rental unit; vendor calibration certificate to follow within five business days.',
  assessorName: 'Tsidi Tamakloe',
  assessorCredentials: 'CSP',
  acknowledgedAt: '2026-08-02T12:00:00.000Z',
}

const build = (calDate: string | undefined, ack: unknown) =>
  buildCalibrationAppendix(presurvey(calDate), {
    now: NOW,
    calibrationAcknowledgement: ack,
  }) as {
    appendixB?: { instrumentRows?: unknown[] } | null
    appendixE?: { description?: string; calibrationRecords?: unknown[]; qaNotes?: string[] } | null
  }

const CAL_STATES: Array<[string, string | undefined]> = [
  ['current', daysAgo(30)],
  ['expiring', daysAgo(360)],
  ['expired', daysAgo(400)],
  ['unrecorded', undefined],
]

describe('the acknowledgement renders in every calibration state', () => {
  for (const [label, cal] of CAL_STATES) {
    it(`prints who, when and why (${label})`, () => {
      const text = (build(cal, ACK).appendixE?.qaNotes || []).join(' ')
      expect(text).toMatch(/Instrument-record exception acknowledged/)
      expect(text).toMatch(/Tsidi Tamakloe, CSP/)
      expect(text).toMatch(/on 2026-08-02\b/)
      expect(text).not.toMatch(/T12:00:00/)
      expect(text).toContain(ACK.justification)
    })

    it(`comes last, after the gap it responds to (${label})`, () => {
      // A reader must meet the problem before the explanation.
      const notes = build(cal, ACK).appendixE?.qaNotes || []
      expect(notes[notes.length - 1]).toMatch(/Stated basis/)
    })
  }
})

describe('the acknowledgement adds disclosure and removes none', () => {
  it('leaves the expired-instrument warning in place', () => {
    const withAck = (build(daysAgo(400), ACK).appendixE?.qaNotes || []).join(' ')
    expect(withAck).toMatch(/PAST calibration validity/)
    expect(withAck).toMatch(/screening-only/i)
  })

  it('leaves the unrecorded-calibration data-gap pointer in place', () => {
    const withAck = (build(undefined, ACK).appendixE?.qaNotes || []).join(' ')
    expect(withAck).toMatch(/no recorded calibration date/i)
    expect(withAck).toMatch(/Limitations on Reliance/)
  })

  it('is strictly additive — every note without it survives with it', () => {
    for (const [label, cal] of CAL_STATES) {
      const without = build(cal, null).appendixE?.qaNotes || []
      const withAck = build(cal, ACK).appendixE?.qaNotes || []
      expect(withAck.slice(0, without.length), `${label} lost a note`).toEqual(without)
      expect(withAck.length, `${label} gained nothing`).toBeGreaterThan(without.length)
    }
  })

  it('leaves the instrument table untouched', () => {
    const rows = build(daysAgo(400), ACK).appendixE?.calibrationRecords || []
    expect(rows).toEqual(build(daysAgo(400), null).appendixE?.calibrationRecords)
    expect(rows.length).toBe(1)
  })
})

describe('the acknowledgement survives an empty instrument record', () => {
  // The interrupt that produces an acknowledgement fires on MISSING
  // instrument metadata — which is exactly the presurvey that yields no
  // appendix rows. Dropping it here would lose the record in the one
  // case it most needs printing.
  it('still emits appendix E when there are no instruments at all', () => {
    const out = buildCalibrationAppendix({}, { now: NOW, calibrationAcknowledgement: ACK }) as {
      appendixB: unknown
      appendixE: { description: string; calibrationRecords: unknown[]; qaNotes: string[] }
    }
    expect(out.appendixB).toBeNull()
    expect(out.appendixE).not.toBeNull()
    expect(out.appendixE.calibrationRecords).toEqual([])
    expect(out.appendixE.qaNotes.join(' ')).toContain(ACK.justification)
    expect(out.appendixE.description).toMatch(/No instrument calibration records were available/)
  })

  it('emits nothing at all when there is neither an instrument nor an acknowledgement', () => {
    const out = buildCalibrationAppendix({}, { now: NOW }) as {
      appendixB: unknown
      appendixE: unknown
    }
    expect(out.appendixB).toBeNull()
    expect(out.appendixE).toBeNull()
  })
})

describe('a hollow acknowledgement is treated as none', () => {
  // A record with no reasoning is the undocumented click-through this
  // feature replaced. Printing "an exception was acknowledged" with no
  // stated basis would be worse than printing nothing: it implies a
  // judgement was made and recorded when it was not.
  for (const hollow of [null, undefined, {}, { items: ['x'] }, { justification: '   ' }]) {
    it(`renders nothing for ${JSON.stringify(hollow) ?? 'undefined'}`, () => {
      const withHollow = build(daysAgo(400), hollow).appendixE?.qaNotes || []
      const without = build(daysAgo(400), null).appendixE?.qaNotes || []
      expect(withHollow).toEqual(without)
      expect(withHollow.join(' ')).not.toMatch(/exception acknowledged/i)
    })
  }
})
