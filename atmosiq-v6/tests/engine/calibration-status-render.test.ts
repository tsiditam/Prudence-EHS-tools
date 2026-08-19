/**
 * Calibration status cell — no arithmetic on an unusable date.
 *
 * An issued client report carried "Current — NaN days remaining", twice
 * (Appendix E and the instrumentation table). `renderCalibrationStatus`
 * subtracted an unparseable date from `now` and formatted the result
 * without checking it. "Current" was the worse half of that string: it
 * asserted a validated calibration where there was no usable date at all.
 */
import { describe, it, expect } from 'vitest'
import { renderCalibrationStatus } from '../../src/components/docx/calibration-appendix.js'

const NOW = new Date('2026-08-19T12:00:00Z')

describe('renderCalibrationStatus', () => {
  it('never emits NaN, whatever the input', () => {
    const inputs: unknown[] = [
      'not a date', '', '   ', 'Bump-tested and calibrated', '0000-00-00',
      '2026-13-45', null, undefined, {}, [], NaN, 'Invalid Date',
    ]
    for (const bad of inputs) {
      for (const status of [undefined, 'Current', 'Factory', 'Unknown', 'Not recorded']) {
        const out = renderCalibrationStatus(bad as never, status, NOW)
        expect(out, `input ${JSON.stringify(bad)} / ${status}`).not.toMatch(/NaN|Infinity|undefined/)
      }
    }
  })

  it('reports an unparseable date as not recorded, never as Current', () => {
    expect(renderCalibrationStatus('not a date', undefined, NOW)).toBe('Date not recorded')
    // A status string does not rescue a missing date — it qualifies it.
    expect(renderCalibrationStatus('not a date', 'Current', NOW)).toBe('Current — date not recorded')
    expect(renderCalibrationStatus('not a date', 'Current', NOW)).not.toMatch(/days remaining/)
  })

  it('reports a missing date as not recorded', () => {
    expect(renderCalibrationStatus(null, undefined, NOW)).toBe('Date not recorded')
    expect(renderCalibrationStatus('', 'Unknown', NOW)).toBe('Date not recorded')
    expect(renderCalibrationStatus('', 'Not recorded', NOW)).toBe('Date not recorded')
  })

  it('counts remaining validity from a real date', () => {
    // 365-day validity; calibrated 78 days before NOW → 287 remaining.
    expect(renderCalibrationStatus('2026-06-02', 'Current', NOW)).toBe('Current — 287 days remaining')
  })

  it('does not grant more validity than the interval for a future date', () => {
    const out = renderCalibrationStatus('2027-06-02', 'Current', NOW)
    expect(out).not.toMatch(/NaN/)
    expect(out).not.toMatch(/\b(4|5|6|7|8|9)\d\d days remaining/)
  })

  it('flags an expired calibration as expired', () => {
    expect(renderCalibrationStatus('2024-01-01', 'Current', NOW)).toMatch(/EXPIRED — \d+ days overdue/)
  })
})
