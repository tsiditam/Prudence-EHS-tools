// @vitest-environment jsdom
/**
 * CountUp — the animated-number microinteraction.
 *
 * Pins that:
 *   • under prefers-reduced-motion it snaps straight to the final value
 *     (no flash of 0, no animation) — the accessibility contract
 *   • non-numeric values pass through untouched
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import CountUp from '../../src/components/ui/CountUp'

function setReducedMotion(matches) {
  window.matchMedia = (q) => ({
    matches, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false },
  })
}

describe('CountUp', () => {
  const orig = window.matchMedia
  afterEach(() => { cleanup(); window.matchMedia = orig })

  it('snaps to the final value under prefers-reduced-motion', () => {
    setReducedMotion(true)
    render(<CountUp value={82} />)
    // Reduced motion → the initial render already shows the final value,
    // never a flash of 0.
    expect(screen.getByText('82')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('rounds to whole numbers by default', () => {
    setReducedMotion(true)
    render(<CountUp value={1.46} />)
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('respects the decimals prop', () => {
    setReducedMotion(true)
    render(<CountUp value={1.46} decimals={1} />)
    expect(screen.getByText('1.5')).toBeTruthy()
  })

  it('passes non-numeric values through untouched', () => {
    setReducedMotion(true)
    render(<CountUp value="N/A" />)
    expect(screen.getByText('N/A')).toBeTruthy()
  })
})
