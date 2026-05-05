/**
 * Unit tests for the dashboard subscription-status helper.
 *
 * Phase 1 (current): the helper returns null on every input because
 * BILLING_MODE defaults to 'beta'. These tests pin that contract so a
 * future Phase-2 commit can't accidentally start rendering billing
 * chrome inside the in-product surface without flipping the mode flag
 * first.
 *
 * The wider test surface (Solo / Firm / Enterprise tiers, payment-
 * failed states, beta-end-soon warnings) lands in Phase 2 alongside
 * the Stripe webhook handlers that populate profile.subscription_*.
 */
import { describe, it, expect } from 'vitest'
import {
  getSubscriptionBannerState,
  getSubscriptionRowSubtitle,
  BILLING_MODE,
} from '../../src/utils/subscriptionState'

const FIXED_NOW = new Date('2026-05-04T12:00:00Z')

describe('getSubscriptionBannerState — beta mode (Phase 1)', () => {
  it('defaults to beta when VITE_BILLING_MODE is unset', () => {
    expect(BILLING_MODE).toBe('beta')
  })

  it('returns null for an empty profile', () => {
    expect(getSubscriptionBannerState({}, FIXED_NOW)).toBeNull()
  })

  it('returns null for a fully populated profile (beta is always quiet)', () => {
    const profile = {
      id: 'user-123',
      name: 'J. Smith, CIH',
      certs: ['CIH', 'CSP'],
      iaq_meter: 'TSI Q-Trak 7575',
    }
    expect(getSubscriptionBannerState(profile, FIXED_NOW)).toBeNull()
  })

  it('returns null even when subscription_* fields are present (Phase 1 ignores them)', () => {
    // Phase 2 will branch on these; today they're inert.
    const profile = {
      id: 'user-123',
      subscription_status: 'past_due',
      subscription_tier: 'solo',
      subscription_currentPeriodEnd: '2026-06-03',
    }
    expect(getSubscriptionBannerState(profile, FIXED_NOW)).toBeNull()
  })

  it('null profile is safe — no crash', () => {
    expect(getSubscriptionBannerState(null, FIXED_NOW)).toBeNull()
    expect(getSubscriptionBannerState(undefined, FIXED_NOW)).toBeNull()
  })
})

describe('getSubscriptionRowSubtitle — beta mode (Phase 1)', () => {
  it("returns 'Beta · all access' regardless of profile contents", () => {
    expect(getSubscriptionRowSubtitle({})).toBe('Beta · all access')
    expect(getSubscriptionRowSubtitle({ id: 'user-123' })).toBe('Beta · all access')
    expect(getSubscriptionRowSubtitle(null)).toBe('Beta · all access')
  })
})
