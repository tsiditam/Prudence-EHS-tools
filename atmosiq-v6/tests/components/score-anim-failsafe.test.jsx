// @vitest-environment jsdom
/**
 * Regression: animated scores must always settle on the correct value, even
 * when requestAnimationFrame is throttled/paused (mobile Safari does this
 * during scroll, view transitions, and when backgrounded). Without the
 * timer-based failsafe the number froze at 0 or a stale prior value while the
 * band/color stayed correct — the "scores show 0 / random numbers" incident.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import CountUp from '../../src/components/ui/CountUp'
import ScoreRing from '../../src/components/ScoreRing'

function setReducedMotion(matches) {
  window.matchMedia = (q) => ({ matches, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false } })
}

describe('animated score failsafe (rAF stalled)', () => {
  beforeEach(() => {
    setReducedMotion(false)
    vi.useFakeTimers()
    // Simulate a device where rAF never fires its callback (throttled/paused).
    globalThis.requestAnimationFrame = () => 1
    globalThis.cancelAnimationFrame = () => {}
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('CountUp still reaches its value via the timer failsafe', () => {
    render(<CountUp value={19} />)
    expect(screen.queryByText('19')).toBeNull() // not yet (would be a flash of 0)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByText('19')).toBeTruthy()
  })

  it('ScoreRing still reaches its value via the timer failsafe', () => {
    render(<ScoreRing value={60} color="#f00" />)
    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.queryByText('60')).toBeTruthy()
  })
})
