// @vitest-environment jsdom
/**
 * Tests for FirstAssessmentTour.
 *
 * Pins the contract:
 *   • shouldShowTour returns true only when (no completion + no dismiss
 *     + within 7 days of created_at)
 *   • The component renders all 5 steps and advances correctly
 *   • Each step renders the right copy + spotlight
 *   • Dismiss POSTs to /api/profile/mark-onboarded with action='dismissed'
 *   • Final CTA POSTs with action='completed' and calls onStartAssessment
 *   • A user who already completed first assessment never sees the tour
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FirstAssessmentTour, {
  shouldShowTour,
  TOUR_STEPS,
  type OnboardingProfile,
} from '../../components/onboarding/FirstAssessmentTour'

const mockFetch = vi.fn()
beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  ;(globalThis as any).fetch = mockFetch
})

afterEach(() => {
  cleanup()
})

const baseProfile: OnboardingProfile = {
  id: 'u_1',
  name: 'Alex Smith',
  created_at: new Date().toISOString(),
  has_completed_first_assessment: false,
  onboarding_dismissed_at: null,
}

describe('shouldShowTour', () => {
  it('returns true for a fresh free-tier signup within 7 days', () => {
    expect(shouldShowTour(baseProfile)).toBe(true)
  })

  it('returns false when has_completed_first_assessment is true', () => {
    expect(shouldShowTour({ ...baseProfile, has_completed_first_assessment: true })).toBe(false)
  })

  it('returns false when onboarding_dismissed_at is set', () => {
    expect(shouldShowTour({ ...baseProfile, onboarding_dismissed_at: new Date().toISOString() })).toBe(false)
  })

  it('returns false when created_at is older than 7 days', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    expect(shouldShowTour({ ...baseProfile, created_at: old })).toBe(false)
  })

  it('returns false when profile is null', () => {
    expect(shouldShowTour(null)).toBe(false)
  })
})

describe('FirstAssessmentTour rendering', () => {
  it('does NOT render when shouldShowTour returns false', () => {
    const { container } = render(
      <FirstAssessmentTour
        profile={{ ...baseProfile, has_completed_first_assessment: true }}
      />
    )
    expect(container.querySelector('[data-testid="onboarding-tour"]')).toBeNull()
  })

  it('renders step 1 with the user’s first name interpolated', () => {
    render(<FirstAssessmentTour profile={baseProfile} />)
    expect(screen.getByText(/Welcome to AtmosFlow, Alex/)).toBeTruthy()
    expect(screen.getByText(/Step 1 of 5/)).toBeTruthy()
    // Primary CTA matches step 1
    expect(screen.getByTestId('onboarding-advance').textContent).toMatch(/Start my first assessment/)
    // Step 1 has the secondary "Skip for now" CTA
    expect(screen.getByTestId('onboarding-skip')).toBeTruthy()
  })

  it('advances through all 5 steps when the primary CTA is clicked', () => {
    render(<FirstAssessmentTour profile={baseProfile} />)
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      expect(screen.getByText(new RegExp(`Step ${i + 1} of 5`))).toBeTruthy()
      fireEvent.click(screen.getByTestId('onboarding-advance'))
    }
    // After 4 advances we should be on step 5
    expect(screen.getByText(/Step 5 of 5/)).toBeTruthy()
    // Final step CTA wording
    expect(screen.getByTestId('onboarding-advance').textContent).toMatch(/let’s start/)
  })

  it('renders the right spotlight indicator at each step', () => {
    render(<FirstAssessmentTour profile={baseProfile} />)
    // Step 1 has no spotlight
    expect(screen.queryByTestId('spotlight-meter')).toBeNull()
    // Advance to step 2 → meter spotlight
    fireEvent.click(screen.getByTestId('onboarding-advance'))
    expect(screen.getByTestId('spotlight-meter')).toBeTruthy()
    // Step 3 → zone
    fireEvent.click(screen.getByTestId('onboarding-advance'))
    expect(screen.getByTestId('spotlight-zone')).toBeTruthy()
    // Step 4 → questions
    fireEvent.click(screen.getByTestId('onboarding-advance'))
    expect(screen.getByTestId('spotlight-questions')).toBeTruthy()
    // Step 5 → finalize
    fireEvent.click(screen.getByTestId('onboarding-advance'))
    expect(screen.getByTestId('spotlight-finalize')).toBeTruthy()
  })
})

describe('FirstAssessmentTour callbacks', () => {
  it('Dismiss button POSTs action="dismissed" and fires onDismiss', () => {
    const onDismiss = vi.fn()
    render(
      <FirstAssessmentTour
        profile={baseProfile}
        accessToken="token-x"
        onDismiss={onDismiss}
      />
    )
    fireEvent.click(screen.getByTestId('onboarding-dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/profile/mark-onboarded',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-x' }),
        body: expect.stringContaining('"action":"dismissed"'),
      })
    )
  })

  it('"Skip for now" on step 1 also dismisses', () => {
    const onDismiss = vi.fn()
    render(<FirstAssessmentTour profile={baseProfile} accessToken="t" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTestId('onboarding-skip'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('final CTA POSTs action="completed" and fires onStartAssessment', () => {
    const onStart = vi.fn()
    render(
      <FirstAssessmentTour
        profile={baseProfile}
        accessToken="token-y"
        onStartAssessment={onStart}
      />
    )
    // Advance to last step
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      fireEvent.click(screen.getByTestId('onboarding-advance'))
    }
    fireEvent.click(screen.getByTestId('onboarding-advance'))
    expect(onStart).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/profile/mark-onboarded',
      expect.objectContaining({
        body: expect.stringContaining('"action":"completed"'),
      })
    )
  })

  it('does not POST to mark-onboarded when accessToken is null', () => {
    render(<FirstAssessmentTour profile={baseProfile} accessToken={null} />)
    fireEvent.click(screen.getByTestId('onboarding-dismiss'))
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
