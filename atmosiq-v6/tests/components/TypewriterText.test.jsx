// @vitest-environment jsdom
/**
 * TypewriterText — the looping hero typewriter.
 *
 * Pins: it types one char at a time, holds the full phrase, deletes, pauses and
 * retypes (loops); exposes a stable phrase for screen readers; applies the cyan
 * accent; honors prefers-reduced-motion; and cleans up timers on unmount.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import TypewriterText from '../../src/components/TypewriterText'

function mockReducedMotion(matches) {
  window.matchMedia = (q) => ({
    matches: /prefers-reduced-motion/.test(q) ? matches : false,
    media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false },
  })
}

const visible = () => screen.getByTestId('tw-visible').textContent

beforeEach(() => {
  vi.useFakeTimers()
  mockReducedMotion(false)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TypewriterText', () => {
  it('types one character at a time, then holds the full phrase', () => {
    render(<TypewriterText text="abc" typingSpeed={50} holdDuration={3000} />)
    expect(visible()).toBe('|') // only the cursor before the first tick
    act(() => vi.advanceTimersByTime(50)); expect(visible()).toBe('a|')
    act(() => vi.advanceTimersByTime(50)); expect(visible()).toBe('ab|')
    act(() => vi.advanceTimersByTime(50)); expect(visible()).toBe('abc|')
    act(() => vi.advanceTimersByTime(1000)); expect(visible()).toBe('abc|') // still holding
  })

  it('deletes after the hold, pauses, then retypes (loops forever)', () => {
    render(
      <TypewriterText text="ab" typingSpeed={50} deletingSpeed={30} holdDuration={1000} pauseDuration={500} />
    )
    act(() => vi.advanceTimersByTime(50)) // a
    act(() => vi.advanceTimersByTime(50)) // ab
    expect(visible()).toBe('ab|')
    act(() => vi.advanceTimersByTime(1000)) // hold elapses -> deleting
    act(() => vi.advanceTimersByTime(30)); expect(visible()).toBe('a|')
    act(() => vi.advanceTimersByTime(30)); expect(visible()).toBe('|')
    act(() => vi.advanceTimersByTime(500)) // pause elapses -> typing again
    act(() => vi.advanceTimersByTime(50)); expect(visible()).toBe('a|') // looped
  })

  it('exposes a stable phrase for screen readers and hides the animated text', () => {
    const { container } = render(<TypewriterText text="in minutes" />)
    expect(container.querySelector('.tw-sr').textContent).toBe('in minutes')
    expect(screen.getByTestId('tw-visible').getAttribute('aria-hidden')).toBe('true')
  })

  it('applies the cyan accent color', () => {
    const { container } = render(<TypewriterText text="x" color="#06B6D4" />)
    expect(container.querySelector('.tw').style.color).toBe('rgb(6, 182, 212)')
  })

  it('respects prefers-reduced-motion (full text, no typing loop)', () => {
    mockReducedMotion(true)
    render(<TypewriterText text="in minutes" />)
    act(() => vi.advanceTimersByTime(0))
    expect(visible()).toBe('in minutes|')
  })

  it('cleans up timers on unmount', () => {
    const { unmount } = render(<TypewriterText text="abc" typingSpeed={50} />)
    act(() => vi.advanceTimersByTime(50))
    unmount()
    expect(() => act(() => vi.advanceTimersByTime(5000))).not.toThrow()
  })
})
