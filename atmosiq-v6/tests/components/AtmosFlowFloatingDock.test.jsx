// @vitest-environment jsdom
/**
 * AtmosFlowFloatingDock — the floating glass bottom dock with macOS/Fiverr
 * "magnetic" magnification.
 *
 * Pins:
 *  - dockMagnet(): the pure proximity->{scale,lift} curve (breakpoints,
 *    monotonicity, symmetry, clamping).
 *  - Rendering + a11y: tablist/tab roles, the active tab's aria-selected /
 *    aria-current and its visible label; clicking a tab navigates.
 *  - Magnetic glide: a pointer glide writes an inline transform to every tab
 *    and clears it when the pointer leaves; reduced-motion disables it.
 *  - Tap vs glide: a tap navigates, but a drag (glide) past the threshold is
 *    swallowed so it never selects a tab.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import AtmosFlowFloatingDock, { dockMagnet } from '../../src/components/ui/AtmosFlowFloatingDock'

// matchMedia is absent in jsdom; mock it with a per-query reduced-motion flag.
function mockMatchMedia({ reduce = false } = {}) {
  window.matchMedia = (q) => ({
    matches: /prefers-reduced-motion/.test(q) ? reduce : false,
    media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false },
  })
}

// Dispatch a pointer-ish event the listeners can read clientX from. (jsdom's
// PointerEvent is patchy; a MouseEvent with an arbitrary type carries clientX.)
function pointer(el, type, clientX) {
  el.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true, cancelable: true }))
}

const tabs = (active = 'projects') => ([
  { id: 'projects', label: 'Projects', icon: 'bldg', active: active === 'projects', onClick: vi.fn() },
  { id: 'sensor-data', label: 'Logger Studio', icon: 'chartLine', active: active === 'sensor-data', onClick: vi.fn() },
  { id: 'history', label: 'Reports', icon: 'report', active: active === 'history', onClick: vi.fn() },
  { id: 'account', label: 'Account', icon: 'user', active: active === 'account', onClick: vi.fn() },
])

let origMM, origRAF, origCAF, origRect
beforeEach(() => {
  origMM = window.matchMedia
  origRAF = window.requestAnimationFrame
  origCAF = window.cancelAnimationFrame
  origRect = Element.prototype.getBoundingClientRect
  mockMatchMedia({ reduce: false })
  // Run rAF synchronously so a pointer event applies transforms immediately.
  // Return 0 so the component's `if (!raf)` throttle guard re-arms each call
  // (a real async rAF clears the handle inside the frame; the sync stub can't).
  window.requestAnimationFrame = (cb) => { cb(0); return 0 }
  window.cancelAnimationFrame = () => {}
  // Give each tab a deterministic 40px-wide box at x=0 so distance math runs.
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40, x: 0, y: 0 }
  }
})
afterEach(() => {
  cleanup()
  window.matchMedia = origMM
  window.requestAnimationFrame = origRAF
  window.cancelAnimationFrame = origCAF
  Element.prototype.getBoundingClientRect = origRect
})

describe('dockMagnet (proximity curve)', () => {
  it('hits the spec breakpoints', () => {
    expect(dockMagnet(0).scale).toBeCloseTo(1.28, 5)
    expect(dockMagnet(40).scale).toBeCloseTo(1.15, 5)
    expect(dockMagnet(80).scale).toBeCloseTo(1.05, 5)
    expect(dockMagnet(120).scale).toBe(1)
  })
  it('lifts up to -6px at the center and 0 past the radius', () => {
    expect(dockMagnet(0).lift).toBeCloseTo(-6, 5)
    expect(dockMagnet(120).lift).toBe(0)
    expect(dockMagnet(200).lift).toBe(0)
  })
  it('decreases monotonically and clamps to 1 beyond 120px', () => {
    expect(dockMagnet(0).scale).toBeGreaterThan(dockMagnet(40).scale)
    expect(dockMagnet(40).scale).toBeGreaterThan(dockMagnet(80).scale)
    expect(dockMagnet(80).scale).toBeGreaterThan(dockMagnet(120).scale)
    expect(dockMagnet(500).scale).toBe(1)
  })
  it('is symmetric in sign (left/right of a tab behave the same)', () => {
    expect(dockMagnet(-40).scale).toBeCloseTo(dockMagnet(40).scale, 10)
    expect(dockMagnet(-90).scale).toBeCloseTo(dockMagnet(90).scale, 10)
  })
})

describe('AtmosFlowFloatingDock — rendering & navigation', () => {
  it('renders a tablist with every tab and shows only the active label', () => {
    render(<AtmosFlowFloatingDock tabs={tabs('projects')} maxWidth={620} />)
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    // All tabs expose their name via aria-label even when icon-only.
    expect(screen.getByRole('tab', { name: 'Logger Studio' })).toBeTruthy()
    // Only the active tab renders a visible text label.
    expect(screen.getByText('Projects')).toBeTruthy()
    expect(screen.queryByText('Logger Studio')).toBeNull()
  })

  it('marks the active tab with aria-selected and aria-current', () => {
    render(<AtmosFlowFloatingDock tabs={tabs('history')} maxWidth={620} />)
    const active = screen.getByRole('tab', { name: 'Reports' })
    expect(active.getAttribute('aria-selected')).toBe('true')
    expect(active.getAttribute('aria-current')).toBe('page')
    const inactive = screen.getByRole('tab', { name: 'Account' })
    expect(inactive.getAttribute('aria-selected')).toBe('false')
  })

  it('navigates on a plain tap (click)', () => {
    const t = tabs('projects')
    render(<AtmosFlowFloatingDock tabs={t} maxWidth={620} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Logger Studio' }))
    expect(t[1].onClick).toHaveBeenCalledTimes(1)
  })
})

describe('AtmosFlowFloatingDock — magnetic glide', () => {
  it('applies an inline transform to tabs while gliding and clears it on leave', () => {
    render(<AtmosFlowFloatingDock tabs={tabs()} maxWidth={620} />)
    const list = screen.getByRole('tablist')
    const tab = screen.getAllByRole('tab')[0]
    pointer(list, 'pointermove', 20)
    expect(tab.style.transform).toMatch(/scale\(/)
    pointer(list, 'pointerleave', 20)
    expect(tab.style.transform).toBe('')
  })

  it('does nothing under prefers-reduced-motion', () => {
    mockMatchMedia({ reduce: true })
    render(<AtmosFlowFloatingDock tabs={tabs()} maxWidth={620} />)
    const list = screen.getByRole('tablist')
    const tab = screen.getAllByRole('tab')[0]
    pointer(list, 'pointermove', 20)
    expect(tab.style.transform).toBe('')
  })
})

describe('AtmosFlowFloatingDock — tap vs glide selection', () => {
  it('swallows the click after a drag (glide never selects)', () => {
    const t = tabs('projects')
    render(<AtmosFlowFloatingDock tabs={t} maxWidth={620} />)
    const list = screen.getByRole('tablist')
    const target = screen.getByRole('tab', { name: 'Reports' })
    pointer(list, 'pointerdown', 10)
    pointer(list, 'pointermove', 90) // moved > 10px threshold => a glide
    pointer(list, 'pointerup', 90)
    fireEvent.click(target)
    expect(t[2].onClick).not.toHaveBeenCalled()
  })

  it('still navigates on a tap that does not move past the threshold', () => {
    const t = tabs('projects')
    render(<AtmosFlowFloatingDock tabs={t} maxWidth={620} />)
    const list = screen.getByRole('tablist')
    const target = screen.getByRole('tab', { name: 'Account' })
    pointer(list, 'pointerdown', 12)
    pointer(list, 'pointermove', 14) // within threshold => still a tap
    pointer(list, 'pointerup', 14)
    fireEvent.click(target)
    expect(t[3].onClick).toHaveBeenCalledTimes(1)
  })
})
