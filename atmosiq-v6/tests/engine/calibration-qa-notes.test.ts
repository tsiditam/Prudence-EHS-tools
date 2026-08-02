/**
 * The calibration appendix's QA notes are client-facing assertions about
 * AtmosFlow's own controls, so they have to be literally true.
 *
 * Two of them were not, and shipped for some time:
 *
 *   1. "AtmosFlow blocks report finalization when any listed instrument
 *      is past validity." It never did. Nothing gates report generation
 *      on calibration state — expiry produces an appendix row and an
 *      in-app banner, and that is all.
 *
 *   2. "Finalization was permitted only via the documented override
 *      path." Doubly untrue: finalization was never blocked, and the
 *      override it named is unreachable — `data.ihOverride` is set by no
 *      caller, because the preflight modal that populated it was removed
 *      by product decision.
 *
 * Claiming a control that does not exist is worse than claiming none: it
 * invites a client, or an opposing expert, to rely on a safeguard that
 * was never applied. These tests exist so neither sentence can return.
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
    expect(text).toMatch(/does not gate report issuance/i)
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
