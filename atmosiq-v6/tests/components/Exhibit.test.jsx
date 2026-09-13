// @vitest-environment jsdom
/**
 * Exhibit — a photo or plan presented as evidence.
 *
 * Pins: a framed image with the glaze overlay, a caption row (title and
 * where-and-when), a placeholder while a photo record has no source, and
 * a button wrapper when the exhibit is clickable.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Exhibit, { ExhibitFrame } from '../../src/components/ui/Exhibit'

afterEach(cleanup)

describe('Exhibit', () => {
  it('frames a plain src with a glaze and a caption row', () => {
    const { container } = render(<Exhibit src="data:image/png;base64,AAAA" alt="Water damage" title="Water damage" meta="Conference Room · 10:42" />)
    const img = screen.getByAltText('Water damage')
    expect(img.style.objectFit).toBe('cover')
    expect(container.querySelector('figure')).toBeTruthy()
    expect(screen.getByText('Water damage', { selector: 'div' })).toBeTruthy()
    expect(screen.getByText('Conference Room · 10:42')).toBeTruthy()
    // The glaze sits over the image, decorative, and never intercepts a tap.
    const glazes = [...container.querySelectorAll('span[aria-hidden="true"]')].filter((el) => el.style.pointerEvents === 'none')
    expect(glazes.length).toBe(1)
  })

  it('shows a placeholder for a photo record with no resolvable source', () => {
    const { container } = render(<Exhibit photo={{ idbId: 'missing' }} title="Photo" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('div[aria-hidden="true"]')).toBeTruthy()
  })

  it('becomes a button when clickable', () => {
    const onClick = vi.fn()
    render(<Exhibit src="data:image/png;base64,AAAA" alt="Plan" title="Level 2" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('exposes the bare frame for surfaces that draw their own contents', () => {
    const { container } = render(<ExhibitFrame><div>pins</div></ExhibitFrame>)
    expect(screen.getByText('pins')).toBeTruthy()
    expect(container.firstChild.style.overflow).toBe('hidden')
  })
})
