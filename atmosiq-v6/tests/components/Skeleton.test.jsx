// @vitest-environment jsdom
/**
 * Skeleton — the shape of content that has not arrived.
 *
 * Pins: a bar is decorative (aria-hidden) and sized as asked; a row group is
 * one live status region labeled for assistive tech with the requested
 * number of rows, each in the list-row layout (dot, title, caption, pill).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Skeleton, { SkeletonRows } from '../../src/components/ui/Skeleton'

afterEach(cleanup)

describe('Skeleton', () => {
  it('renders a decorative bar at the requested size', () => {
    const { container } = render(<Skeleton w={120} h={10} />)
    const bar = container.querySelector('.af-skeleton')
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect(bar.style.width).toBe('120px')
    expect(bar.style.height).toBe('10px')
  })

  it('renders rows as one labeled status region in the list-row layout', () => {
    render(<SkeletonRows rows={3} label="Loading projects" />)
    const region = screen.getByRole('status', { name: 'Loading projects' })
    expect(region.getAttribute('aria-busy')).toBe('true')
    // Three rows × (dot + title + caption + pill) = twelve bars.
    expect(region.querySelectorAll('.af-skeleton')).toHaveLength(12)
  })
})
