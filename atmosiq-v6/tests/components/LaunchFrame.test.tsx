// @vitest-environment jsdom
/**
 * LaunchFrame — the static first-screen frame shown while the session
 * resolves, and LazyPlaceholder, the in-place Suspense fallback.
 *
 * Pins: the frame is a theme surface (no hardcoded black), it draws no
 * canvas and runs no animation, it announces itself as loading, and it
 * carries the home heading so the real screen draws in the same place.
 * The placeholder is in place, not fixed over the page.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import LaunchFrame, { LazyPlaceholder } from '../../src/components/LaunchFrame'

afterEach(cleanup)

describe('LaunchFrame', () => {
  it('is a theme surface with the home heading and no motion', () => {
    const { container } = render(<LaunchFrame heading="Projects" />)
    const frame = screen.getByRole('status', { name: 'Loading' })
    expect(frame.style.background).toBe('var(--bg)')
    expect(frame.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('Projects')).toBeTruthy()
    expect(container.querySelector('canvas')).toBeNull()
    const styles = Array.from(container.querySelectorAll('*')).map((el) => el.getAttribute('style') || '')
    expect(styles.some((s) => /animation/.test(s))).toBe(false)
    expect(styles.some((s) => /#000|black/i.test(s))).toBe(false)
  })

  it('omits the heading when the home screen has none', () => {
    render(<LaunchFrame heading={null} />)
    expect(screen.queryByText('Projects')).toBeNull()
  })
})

describe('LazyPlaceholder', () => {
  it('renders in place, announced as loading, with no fixed cover', () => {
    render(<LazyPlaceholder />)
    const el = screen.getByRole('status')
    expect(el.textContent).toBe('Loading…')
    expect(el.style.position).not.toBe('fixed')
  })
})
