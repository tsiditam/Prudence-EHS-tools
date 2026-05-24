/**
 * isOtherChoice — single-choice "Other" detection.
 *
 * Regression: when "Other" is NOT the last option (PID lamp energy ends
 * with "No PID used"), selecting the genuine last option must NOT also
 * select "Other".
 */

import { describe, it, expect } from 'vitest'
import { isOtherChoice } from '../../src/utils/choiceOther'

const PID_OPTS = ['10.6 eV', '11.7 eV', '9.8 eV', 'Other', 'No PID used']

describe('isOtherChoice', () => {
  it('does NOT flag Other when a non-Other option (even the last) is chosen', () => {
    expect(isOtherChoice(PID_OPTS, 'No PID used')).toBe(false)
    expect(isOtherChoice(PID_OPTS, '10.6 eV')).toBe(false)
    expect(isOtherChoice(PID_OPTS, '9.8 eV')).toBe(false)
  })

  it('flags Other for the literal "Other" sentinel and for custom free-text', () => {
    expect(isOtherChoice(PID_OPTS, 'Other')).toBe(true)
    expect(isOtherChoice(PID_OPTS, '8.4 eV custom')).toBe(true)
  })

  it('is false for empty / missing values and tolerant of missing opts', () => {
    expect(isOtherChoice(PID_OPTS, '')).toBe(false)
    expect(isOtherChoice(PID_OPTS, undefined)).toBe(false)
    expect(isOtherChoice(undefined, 'anything')).toBe(true)
  })
})
