// @vitest-environment jsdom
/**
 * Soft-glass UI primitives — behavioral regression tests.
 *
 * Pins the contract that:
 *   • BottomSheet dismisses on backdrop tap (not on inner-content tap)
 *     — the exact bug pattern that bit us in the hamburger menu where
 *     a backdrop with too-low z-index was being intercepted by other
 *     content on the page
 *   • BottomSheet dismisses on Escape
 *   • BottomSheet locks body scroll while open
 *   • TactileButton fires the haptic pattern on press (light by default;
 *     silent for ghost; explicit overrides win)
 *   • TactileButton respects `disabled` and doesn't fire haptic or
 *     onClick when disabled
 *   • GlassCard renders the accent rail when the accent prop is set
 *   • GlassCard fires onClick when clicked and applies tactile press
 *     handlers
 *   • StatusPill renders with the tone's color contract
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import BottomSheet from '../../src/components/ui/BottomSheet'
import TactileButton from '../../src/components/ui/TactileButton'
import GlassCard from '../../src/components/ui/GlassCard'
import StatusPill from '../../src/components/ui/StatusPill'

describe('BottomSheet', () => {
  afterEach(() => { cleanup() })

  it('renders nothing when open is false', () => {
    const { container } = render(<BottomSheet open={false} onClose={() => {}}>body</BottomSheet>)
    expect(container.firstChild).toBeNull()
  })

  it('renders title and children when open', () => {
    render(<BottomSheet open title="Hello world" onClose={() => {}}><span>inside</span></BottomSheet>)
    expect(screen.getByText('Hello world')).not.toBeNull()
    expect(screen.getByText('inside')).not.toBeNull()
  })

  it('calls onClose when the backdrop is tapped', () => {
    const onClose = vi.fn()
    render(<BottomSheet open title="Sheet" onClose={onClose}><span>inside</span></BottomSheet>)
    const dialog = screen.getByRole('dialog')
    // Fire on the backdrop (the dialog element itself). The handler
    // only closes when e.target === e.currentTarget, so we need to
    // dispatch the click directly on the backdrop, not bubble from
    // a child.
    fireEvent.click(dialog, { target: dialog, currentTarget: dialog })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when the inner sheet content is tapped', () => {
    const onClose = vi.fn()
    render(<BottomSheet open title="Sheet" onClose={onClose}><span data-testid="content">inside</span></BottomSheet>)
    fireEvent.click(screen.getByTestId('content'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<BottomSheet open title="Sheet" onClose={onClose}>x</BottomSheet>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('locks body scroll while open and restores on unmount', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(<BottomSheet open title="x" onClose={() => {}}>x</BottomSheet>)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })
})

describe('TactileButton', () => {
  let vibrateSpy
  beforeEach(() => {
    vibrateSpy = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true, writable: true })
  })
  afterEach(() => { cleanup() })

  it('fires light haptic on pointerdown by default (primary)', () => {
    render(<TactileButton variant="primary" onClick={() => {}}>Go</TactileButton>)
    fireEvent.pointerDown(screen.getByText('Go').closest('button'))
    expect(vibrateSpy).toHaveBeenCalledWith(12)
  })

  it('stays silent for ghost variant by default', () => {
    render(<TactileButton variant="ghost" onClick={() => {}}>Cancel</TactileButton>)
    fireEvent.pointerDown(screen.getByText('Cancel').closest('button'))
    expect(vibrateSpy).not.toHaveBeenCalled()
  })

  it('respects haptic={false} override', () => {
    render(<TactileButton variant="primary" haptic={false} onClick={() => {}}>Quiet</TactileButton>)
    fireEvent.pointerDown(screen.getByText('Quiet').closest('button'))
    expect(vibrateSpy).not.toHaveBeenCalled()
  })

  it('fires heavy haptic when haptic="heavy" is passed', () => {
    render(<TactileButton haptic="heavy" onClick={() => {}}>Confirm</TactileButton>)
    fireEvent.pointerDown(screen.getByText('Confirm').closest('button'))
    expect(vibrateSpy).toHaveBeenCalledWith([30, 20, 30])
  })

  it('fires success haptic when haptic="success" is passed', () => {
    render(<TactileButton haptic="success" onClick={() => {}}>Done</TactileButton>)
    fireEvent.pointerDown(screen.getByText('Done').closest('button'))
    expect(vibrateSpy).toHaveBeenCalledWith([10, 30, 10, 30, 10])
  })

  it('does not fire onClick or haptic when disabled', () => {
    const onClick = vi.fn()
    render(<TactileButton variant="primary" disabled onClick={onClick}>Nope</TactileButton>)
    fireEvent.pointerDown(screen.getByText('Nope').closest('button'))
    fireEvent.click(screen.getByText('Nope').closest('button'))
    expect(vibrateSpy).not.toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('swallows errors from navigator.vibrate (iOS Safari behavior)', () => {
    vibrateSpy.mockImplementation(() => { throw new Error('iOS rejects outside user gesture') })
    expect(() => {
      render(<TactileButton variant="primary" onClick={() => {}}>X</TactileButton>)
      fireEvent.pointerDown(screen.getByText('X').closest('button'))
    }).not.toThrow()
  })
})

describe('GlassCard', () => {
  afterEach(() => { cleanup() })

  it('renders children', () => {
    render(<GlassCard><span>hello</span></GlassCard>)
    expect(screen.getByText('hello')).not.toBeNull()
  })

  it('paints the accent rail when accent prop is set', () => {
    const { container } = render(<GlassCard accent="#ff0000">x</GlassCard>)
    const card = container.firstChild
    expect(card.style.borderTop).toMatch(/#ff0000|2px/)
  })

  it('fires onClick when tapped', () => {
    const onClick = vi.fn()
    render(<GlassCard onClick={onClick}><span>tap me</span></GlassCard>)
    fireEvent.click(screen.getByText('tap me').parentElement)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies cursor:pointer when interactive', () => {
    const { container } = render(<GlassCard onClick={() => {}}>x</GlassCard>)
    expect(container.firstChild.style.cursor).toBe('pointer')
  })

  it('does NOT apply cursor:pointer when no onClick', () => {
    const { container } = render(<GlassCard>x</GlassCard>)
    expect(container.firstChild.style.cursor).toBe('')
  })
})

describe('StatusPill', () => {
  afterEach(() => { cleanup() })

  it('renders children with tone color', () => {
    render(<StatusPill tone="#22D3EE">Active</StatusPill>)
    const pill = screen.getByText('Active')
    expect(pill).not.toBeNull()
    // Color contract: tone is applied as the text color
    expect(pill.style.color.toLowerCase()).toMatch(/22d3ee|#22d3ee|rgb\(34/)
  })

  it('uses larger padding when size="lg"', () => {
    const { container: sm } = render(<StatusPill tone="#FFF">x</StatusPill>)
    const smPad = sm.firstChild.style.padding
    cleanup()
    const { container: lg } = render(<StatusPill tone="#FFF" size="lg">x</StatusPill>)
    const lgPad = lg.firstChild.style.padding
    // lg padding is "6px 12px"; sm is "4px 10px"
    expect(lgPad).toContain('12px')
    expect(smPad).toContain('10px')
  })

  it('softens the tone and drops the inner highlight when dim', () => {
    const { container: bright } = render(<StatusPill tone="#22D3EE">x</StatusPill>)
    const brightColor = bright.firstChild.style.color
    const brightShadow = bright.firstChild.style.boxShadow
    cleanup()
    const { container: dimmed } = render(<StatusPill tone="#22D3EE" dim>x</StatusPill>)
    const dimEl = dimmed.firstChild
    // dim removes the inner-highlight glow that gives the pill its neon look
    expect(dimEl.style.boxShadow).toBe('none')
    expect(brightShadow).not.toBe('none')
    // and shifts the text off the raw bright tone
    expect(dimEl.style.color).not.toBe(brightColor)
  })
})
