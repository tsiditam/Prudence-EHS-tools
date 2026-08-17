// @vitest-environment jsdom
/**
 * MoldPreviewButton — floating tap target to the non-prod mold screening
 * preview. Pins that it renders a real link to /dev/mold-screening with an
 * accessible label.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import MoldPreviewButton from '../../src/components/dev/MoldPreviewButton'

afterEach(cleanup)

describe('MoldPreviewButton', () => {
  it('links to the mold preview route with an accessible label', () => {
    render(<MoldPreviewButton />)
    const link = screen.getByLabelText('Open mold assessment preview') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/dev/mold-screening')
    expect(link.textContent).toMatch(/Mold Preview/)
  })
})
