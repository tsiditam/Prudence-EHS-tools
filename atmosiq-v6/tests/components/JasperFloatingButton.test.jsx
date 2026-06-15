// @vitest-environment jsdom
/**
 * JasperFloatingButton — the AtmosFlow AI launcher floated on the right edge,
 * detached from the dock, that scales with scroll (Instagram-style).
 *
 * Pins: it renders an accessible launcher that fires onClick; it shrinks while
 * scrolling down and grows back when scrolling up / near the top.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import JasperFloatingButton from '../../src/components/JasperFloatingButton'

function setScrollY(y) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
}

let origMM, origRAF, origCAF
beforeEach(() => {
  origMM = window.matchMedia
  origRAF = window.requestAnimationFrame
  origCAF = window.cancelAnimationFrame
  window.matchMedia = (q) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false },
  })
  // Return 0 so the component's rAF throttle guard re-arms on each scroll
  // (a real async rAF clears the handle inside the frame; the sync stub can't).
  window.requestAnimationFrame = (cb) => { cb(0); return 0 }
  window.cancelAnimationFrame = () => {}
  setScrollY(0)
})
afterEach(() => {
  cleanup()
  window.matchMedia = origMM
  window.requestAnimationFrame = origRAF
  window.cancelAnimationFrame = origCAF
})

describe('JasperFloatingButton', () => {
  it('renders an accessible launcher and fires onClick', () => {
    const onClick = vi.fn()
    render(<JasperFloatingButton onClick={onClick} />)
    const btn = screen.getByRole('button', { name: 'AtmosFlow AI' })
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('starts full-size at the top of the page', () => {
    render(<JasperFloatingButton onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'AtmosFlow AI' }).style.width).toBe('60px')
  })

  it('shrinks while scrolling down and grows back when scrolling up', () => {
    render(<JasperFloatingButton onClick={() => {}} />)
    const btn = screen.getByRole('button', { name: 'AtmosFlow AI' })

    setScrollY(240); fireEvent.scroll(window)         // scrolled down
    expect(btn.style.width).toBe('46px')

    setScrollY(120); fireEvent.scroll(window)         // scrolled up (still past top)
    expect(btn.style.width).toBe('60px')

    setScrollY(400); fireEvent.scroll(window)         // down again -> shrink
    expect(btn.style.width).toBe('46px')

    setScrollY(10); fireEvent.scroll(window)          // back near the top -> full
    expect(btn.style.width).toBe('60px')
  })
})
