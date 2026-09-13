// @vitest-environment jsdom
/**
 * DrawnCheck — a check mark that draws itself.
 *
 * Pins: a decorative SVG with a ring and a tick, each carrying the drawing
 * class (the dash animation lives in the injected stylesheet), sized and
 * toned as asked.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import DrawnCheck from '../../src/components/ui/DrawnCheck'

afterEach(cleanup)

describe('DrawnCheck', () => {
  it('renders a decorative ring and tick in the requested size and tone', () => {
    const { container } = render(<DrawnCheck size={72} tone="#22C55E" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('width')).toBe('72')
    expect(svg.getAttribute('stroke')).toBe('#22C55E')
    expect(container.querySelector('.af-check-ring')).toBeTruthy()
    expect(container.querySelector('.af-check-tick')).toBeTruthy()
    expect(document.getElementById('afdc-style')).toBeTruthy()
  })
})
