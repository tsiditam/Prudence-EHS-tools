// @vitest-environment jsdom
/**
 * DevPreviewButton — floating tap target to the non-prod KG preview.
 * Pins that it renders a real link to /dev/evidence-map with an a11y label.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DevPreviewButton from '../../src/components/dev/DevPreviewButton'

afterEach(cleanup)

describe('DevPreviewButton', () => {
  it('links to the dev preview route with an accessible label', () => {
    render(<DevPreviewButton />)
    const link = screen.getByLabelText('Open Knowledge Graph preview') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/dev/evidence-map')
    expect(link.textContent).toMatch(/KG Preview/)
  })
})
