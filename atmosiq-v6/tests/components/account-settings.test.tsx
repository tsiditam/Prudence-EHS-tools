// @vitest-environment jsdom
/**
 * Tests for AccountSettings component.
 *
 * Pins the contract:
 *   • Renders for an authenticated user with the correct plan, credits, renewal
 *   • "Manage subscription" button POSTs to /api/customer-portal
 *   • Free-tier user sees "Upgrade plan" link instead of Manage subscription
 *   • Delete uses two-step confirmation
 *   • Final delete confirmation POSTs to /api/delete-account
 *   • 404 from customer-portal surfaces an error message
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import AccountSettings, { type AccountProfile } from '../../components/account/AccountSettings'

const baseProfile: AccountProfile = {
  id: 'u_1',
  email: 'alex@firm.com',
  name: 'Alex Smith',
  firm: 'Smith IH',
  plan: 'pro',
  billing_period: 'annual',
  credits_remaining: 178,
  annual_renewal_at: '2027-04-30T00:00:00.000Z',
  subscription_status: 'active',
  stripe_customer_id: 'cus_x',
}

let mockFetch: ReturnType<typeof vi.fn>
beforeEach(() => {
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ url: 'https://billing.stripe.com/p/cus_x' }),
    text: async () => '',
  })
})
afterEach(() => cleanup())

describe('AccountSettings', () => {
  it('renders for an authenticated user with the right summary', () => {
    render(<AccountSettings profile={baseProfile} accessToken="t" fetcher={mockFetch as any} />)
    expect(screen.getByTestId('account-settings')).toBeTruthy()
    expect(screen.getByTestId('plan-label').textContent).toBe('Pro')
    expect(screen.getByTestId('credits-label').textContent).toBe('178')
    expect(screen.getByTestId('renewal-label').textContent).toMatch(/2027/)
  })

  it('Manage subscription button POSTs to /api/customer-portal', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '', origin: 'https://atmosiq.prudenceehs.com' },
    })

    render(<AccountSettings profile={baseProfile} accessToken="token-x" fetcher={mockFetch as any} />)
    fireEvent.click(screen.getByTestId('manage-subscription'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/customer-portal',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-x' }),
      })
    )
  })

  it('shows "Upgrade plan" instead of "Manage subscription" for free tier', () => {
    const free: AccountProfile = { ...baseProfile, plan: 'free', billing_period: 'monthly', credits_remaining: 1, stripe_customer_id: null, annual_renewal_at: null }
    render(<AccountSettings profile={free} accessToken="t" fetcher={mockFetch as any} />)
    expect(screen.queryByTestId('manage-subscription')).toBeNull()
    expect(screen.getByTestId('upgrade-cta')).toBeTruthy()
  })

  it('surfaces a 404 from customer-portal as a friendly message', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}), text: async () => '' })
    render(<AccountSettings profile={baseProfile} accessToken="t" fetcher={mockFetch as any} />)
    fireEvent.click(screen.getByTestId('manage-subscription'))
    await waitFor(() => expect(screen.getByTestId('portal-error')).toBeTruthy())
    expect(screen.getByTestId('portal-error').textContent).toMatch(/No active subscription/i)
  })

  it('Delete account uses two-step confirmation before firing', async () => {
    render(<AccountSettings profile={baseProfile} accessToken="t" fetcher={mockFetch as any} />)
    // Step 0: only "Delete account" button visible
    expect(screen.getByTestId('delete-start')).toBeTruthy()
    expect(screen.queryByTestId('delete-confirm-final')).toBeNull()

    // Step 1: first click → first confirmation
    fireEvent.click(screen.getByTestId('delete-start'))
    expect(screen.getByTestId('delete-confirm-1')).toBeTruthy()

    // Step 2: continue → second confirmation
    fireEvent.click(screen.getByTestId('delete-confirm-1-yes'))
    expect(screen.getByTestId('delete-confirm-2')).toBeTruthy()

    // Final delete fires the API
    fireEvent.click(screen.getByTestId('delete-confirm-final'))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/delete-account',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer t' }),
        body: expect.stringContaining('"user_id":"u_1"'),
      })
    )
  })

  it('Cancel at any stage exits the delete flow', () => {
    render(<AccountSettings profile={baseProfile} accessToken="t" fetcher={mockFetch as any} />)
    fireEvent.click(screen.getByTestId('delete-start'))
    expect(screen.getByTestId('delete-confirm-1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('delete-cancel-1'))
    expect(screen.queryByTestId('delete-confirm-1')).toBeNull()
    expect(screen.getByTestId('delete-start')).toBeTruthy()
  })

  it('Save profile fires onProfileSaved callback with the latest values', async () => {
    const onSaved = vi.fn()
    render(
      <AccountSettings
        profile={baseProfile}
        accessToken="t"
        onProfileSaved={onSaved}
        fetcher={mockFetch as any}
      />
    )
    const nameInput = screen.getByTestId('profile-name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alex S.' } })
    fireEvent.click(screen.getByTestId('profile-save'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alex S.', firm: 'Smith IH' }))
  })
})
