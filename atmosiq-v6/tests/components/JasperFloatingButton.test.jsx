// @vitest-environment jsdom
/**
 * JasperFloatingButton — the AtmosFlow AI launcher floated on the right edge,
 * detached from the dock, that scales with scroll (Instagram-style).
 *
 * Pins: it renders an accessible launcher that fires onClick; it shrinks while
 * scrolling down and grows back when scrolling up / near the top.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import JasperFloatingButton, { clampToViewport } from '../../src/components/JasperFloatingButton'
import { KEYS } from '../../src/utils/storageKeys'

// jsdom gives every element a zero-size rect, so a pointerdown at (x, y)
// grabs the button at offset (x, y). Press at the origin to keep the grab
// offset zero and the arithmetic in these tests obvious.
function dragTo(btn, { from = { x: 0, y: 0 }, to }) {
  fireEvent.pointerDown(btn, { clientX: from.x, clientY: from.y, pointerId: 1 })
  fireEvent.pointerMove(btn, { clientX: to.x, clientY: to.y, pointerId: 1 })
  fireEvent.pointerUp(btn, { clientX: to.x, clientY: to.y, pointerId: 1 })
}

function setViewport(w, h) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}

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
  setViewport(1024, 768)
  window.localStorage.removeItem(KEYS.jasperButtonPos)
})
afterEach(() => {
  cleanup()
  window.matchMedia = origMM
  window.requestAnimationFrame = origRAF
  window.cancelAnimationFrame = origCAF
  window.localStorage.removeItem(KEYS.jasperButtonPos)
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

  describe('free placement', () => {
    it('rests at the bottom-right anchor until it is dragged', () => {
      render(<JasperFloatingButton onClick={() => {}} bottomOffset={78} />)
      const btn = screen.getByRole('button', { name: 'AtmosFlow AI' })
      expect(btn.style.right).toBe('16px')
      expect(btn.style.bottom).toContain('78px')
      expect(btn.style.left).toBe('')
      expect(btn.style.top).toBe('')
    })

    it('moves anywhere in the viewport and drops the corner anchor', () => {
      render(<JasperFloatingButton onClick={() => {}} />)
      const btn = screen.getByRole('button', { name: 'AtmosFlow AI' })

      dragTo(btn, { to: { x: 300, y: 120 } })

      expect(btn.style.left).toBe('300px')
      expect(btn.style.top).toBe('120px')
      // The anchor must be released, or right/bottom would fight left/top.
      expect(btn.style.right).toBe('')
      expect(btn.style.bottom).toBe('')
    })

    it('does not fire onClick when the pointer was dragged', () => {
      const onClick = vi.fn()
      render(<JasperFloatingButton onClick={onClick} />)
      const btn = screen.getByRole('button', { name: 'AtmosFlow AI' })

      dragTo(btn, { to: { x: 240, y: 240 } })
      fireEvent.click(btn)
      expect(onClick).not.toHaveBeenCalled()
    })

    it('treats sub-threshold pointer travel as a tap, not a drag', () => {
      const onClick = vi.fn()
      render(<JasperFloatingButton onClick={onClick} />)
      const btn = screen.getByRole('button', { name: 'AtmosFlow AI' })

      dragTo(btn, { from: { x: 100, y: 100 }, to: { x: 102, y: 101 } })  // ~2px
      fireEvent.click(btn)

      expect(onClick).toHaveBeenCalledTimes(1)
      expect(btn.style.left).toBe('')        // still anchored
    })

    it('remembers the chosen spot across mounts', () => {
      const { unmount } = render(<JasperFloatingButton onClick={() => {}} />)
      dragTo(screen.getByRole('button', { name: 'AtmosFlow AI' }), { to: { x: 200, y: 90 } })
      unmount()

      render(<JasperFloatingButton onClick={() => {}} />)
      const btn = screen.getByRole('button', { name: 'AtmosFlow AI' })
      expect(btn.style.left).toBe('200px')
      expect(btn.style.top).toBe('90px')
    })

    it('re-clamps a stored spot that no longer fits the viewport', () => {
      window.localStorage.setItem(KEYS.jasperButtonPos, JSON.stringify({ x: 980, y: 700 }))
      render(<JasperFloatingButton onClick={() => {}} />)
      const btn = screen.getByRole('button', { name: 'AtmosFlow AI' })

      act(() => { setViewport(390, 700); fireEvent(window, new Event('resize')) })

      // 390 − 60 (button) − 8 (margin) = 322; 700 − 60 − 8 = 632.
      expect(btn.style.left).toBe('322px')
      expect(btn.style.top).toBe('632px')
    })

    it('ignores a malformed stored position instead of throwing', () => {
      window.localStorage.setItem(KEYS.jasperButtonPos, '{ not json')
      render(<JasperFloatingButton onClick={() => {}} />)
      expect(screen.getByRole('button', { name: 'AtmosFlow AI' }).style.right).toBe('16px')
    })
  })

  describe('clampToViewport', () => {
    it('holds a position inside the viewport', () => {
      expect(clampToViewport({ x: -50, y: -50 }, 60, 1024, 768)).toEqual({ x: 8, y: 8 })
      expect(clampToViewport({ x: 5000, y: 5000 }, 60, 1024, 768)).toEqual({ x: 956, y: 700 })
      expect(clampToViewport({ x: 400, y: 300 }, 60, 1024, 768)).toEqual({ x: 400, y: 300 })
    })

    it('keeps the button visible on a viewport too small to hold it', () => {
      expect(clampToViewport({ x: 200, y: 200 }, 60, 50, 50)).toEqual({ x: 8, y: 8 })
    })
  })
})
