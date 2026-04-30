// @vitest-environment jsdom
/**
 * Tests for the public landing page (pages/index.tsx).
 *
 * Pins the contract:
 *   • All required sections render
 *   • "Start free" CTA links to /signup (configurable via prop)
 *   • "Request access" form POSTs to /api/early-access
 *   • "See sample report" link points to /sample-report.pdf
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import LandingPage from '../../pages/index'

const mockFetch = vi.fn()
beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  ;(globalThis as any).fetch = mockFetch
})
afterEach(() => cleanup())

describe('LandingPage', () => {
  it('renders without throwing', () => {
    const { container } = render(<LandingPage />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders all required sections', () => {
    render(<LandingPage />)
    expect(screen.getByTestId('section-why')).toBeTruthy()
    expect(screen.getByTestId('section-pricing')).toBeTruthy()
    expect(screen.getByTestId('section-built-for')).toBeTruthy()
    expect(screen.getByTestId('section-early-access')).toBeTruthy()
    expect(screen.getByTestId('landing-footer')).toBeTruthy()
  })

  it('hero "Start free" CTA links to /signup by default', () => {
    render(<LandingPage />)
    const cta = screen.getByTestId('hero-cta-signup') as HTMLAnchorElement
    expect(cta.getAttribute('href')).toBe('/signup')
    expect(cta.textContent).toMatch(/Start free/)
  })

  it('hero CTA respects an override signupHref', () => {
    render(<LandingPage signupHref="/auth/register" />)
    const cta = screen.getByTestId('hero-cta-signup') as HTMLAnchorElement
    expect(cta.getAttribute('href')).toBe('/auth/register')
  })

  it('"See sample report" link points to /sample-report.pdf', () => {
    render(<LandingPage />)
    const sample = screen.getByTestId('hero-cta-sample') as HTMLAnchorElement
    expect(sample.getAttribute('href')).toBe('/sample-report.pdf')
  })

  it('Early-access form POSTs the email to /api/early-access', async () => {
    render(<LandingPage />)
    const input = screen.getByTestId('early-access-email') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'a@firm.com' } })
    fireEvent.click(screen.getByTestId('early-access-submit'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/early-access',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: expect.stringContaining('a@firm.com'),
      })
    )
  })

  it('respects override earlyAccessEndpoint', async () => {
    render(<LandingPage earlyAccessEndpoint="/api/marketing/wait-list" />)
    const input = screen.getByTestId('early-access-email') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'b@firm.com' } })
    fireEvent.click(screen.getByTestId('early-access-submit'))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(mockFetch.mock.calls[0][0]).toBe('/api/marketing/wait-list')
  })

  it('pricing section lists all four tiers', () => {
    render(<LandingPage />)
    const section = screen.getByTestId('section-pricing')
    expect(section.textContent).toMatch(/Free/)
    expect(section.textContent).toMatch(/Solo/)
    expect(section.textContent).toMatch(/Pro/)
    expect(section.textContent).toMatch(/Practice/)
  })
})
