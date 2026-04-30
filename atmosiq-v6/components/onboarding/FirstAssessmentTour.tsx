/**
 * FirstAssessmentTour — five-step guided overlay shown to new users.
 *
 * Triggered by useShouldShowTour() when:
 *   • profile.has_completed_first_assessment is false, AND
 *   • profile.created_at is within 7 days, AND
 *   • profile.onboarding_dismissed_at is null
 *
 * On dismiss → POST /api/profile/mark-onboarded { action: 'dismissed' }
 * On final-step CTA → close, navigate to assessment screen. The
 * has_completed_first_assessment flag is flipped server-side at
 * finalize-assessment time (api/profile/mark-onboarded with
 * action='completed' OR via the existing finalize hook).
 *
 * The activation funnel (signup → first finalized assessment) is the
 * #1 conversion metric for AtmosFlow's free tier; this component is
 * the primary instrument for moving that number.
 */

import { useEffect, useState } from 'react'

export interface OnboardingProfile {
  id?: string
  name?: string
  created_at?: string | null
  has_completed_first_assessment?: boolean
  onboarding_dismissed_at?: string | null
}

export interface FirstAssessmentTourProps {
  profile: OnboardingProfile | null
  /** Bearer token for the mark-onboarded API call. */
  accessToken?: string | null
  /** Called when the user finishes the tour (final CTA). */
  onStartAssessment?: () => void
  /** Called when the user dismisses (any step). */
  onDismiss?: () => void
  /** Override the visibility check (used in tests). */
  forceShow?: boolean
}

const PALETTE = {
  bg: '#080A0E',
  card: '#111318',
  border: '#1C1E26',
  accent: '#22D3EE',
  text: '#ECEEF2',
  sub: '#8B93A5',
  dim: '#6B7380',
}

export interface TourStep {
  title: string
  body: string
  primaryCta: string
  secondaryCta?: string
  spotlight?: 'meter' | 'zone' | 'questions' | 'finalize' | null
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: 'Welcome to AtmosFlow',
    body: 'AtmosFlow turns 6 hours of IAQ report writing into 45 minutes. Let’s run your first assessment together — it takes about 10 minutes and you’ll have a draft report at the end.',
    primaryCta: 'Start my first assessment',
    secondaryCta: 'Skip for now',
    spotlight: null,
  },
  {
    title: 'Tell us about your meter',
    body: 'AtmosFlow needs to know which instrument you’re using and when it was last calibrated. This determines the confidence tier on every measurement in your report.',
    primaryCta: 'Got it',
    spotlight: 'meter',
  },
  {
    title: 'Add your first zone',
    body: 'A zone is one room or area you’re assessing — an open office, a conference room, a server room. You can add multiple zones to a single assessment.',
    primaryCta: 'Got it',
    spotlight: 'zone',
  },
  {
    title: 'Tap through the questions',
    body: 'AtmosFlow walks you through one question at a time. Type measurement values, tap multiple-choice options, and add observations as you go. You can save and resume any time.',
    primaryCta: 'Got it',
    spotlight: 'questions',
  },
  {
    title: 'Finalize and download',
    body: 'When you’re done capturing data, tap Finalize. AtmosFlow generates a CIH-defensible draft report you can review, edit, and download as a Word document.',
    primaryCta: 'I’m ready — let’s start',
    spotlight: 'finalize',
  },
] as const

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function shouldShowTour(profile: OnboardingProfile | null, now: Date = new Date()): boolean {
  if (!profile) return false
  if (profile.has_completed_first_assessment) return false
  if (profile.onboarding_dismissed_at) return false
  if (!profile.created_at) return true // missing timestamp → show (cohort unknown but neither flag is set)
  const created = Date.parse(profile.created_at)
  if (Number.isNaN(created)) return true
  return now.getTime() - created < SEVEN_DAYS_MS
}

async function notifyMarkOnboarded(action: 'completed' | 'dismissed', accessToken?: string | null): Promise<void> {
  if (!accessToken) return
  try {
    await fetch('/api/profile/mark-onboarded', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action }),
    })
  } catch {
    // Best-effort; the tour state is best-effort UX, not a contract gate.
  }
}

export default function FirstAssessmentTour({
  profile,
  accessToken = null,
  onStartAssessment,
  onDismiss,
  forceShow,
}: FirstAssessmentTourProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [closed, setClosed] = useState(false)

  const visible = forceShow !== undefined ? forceShow : shouldShowTour(profile)

  useEffect(() => {
    setStepIdx(0)
    setClosed(false)
  }, [profile?.id])

  if (!visible || closed) return null

  const step = TOUR_STEPS[stepIdx]
  const isLast = stepIdx === TOUR_STEPS.length - 1
  const isFirst = stepIdx === 0
  const firstName = (profile?.name || '').split(/\s+/)[0]
  const titleWithName = isFirst && firstName
    ? `Welcome to AtmosFlow, ${firstName}`
    : step.title

  const handleAdvance = () => {
    if (isLast) {
      setClosed(true)
      void notifyMarkOnboarded('completed', accessToken)
      onStartAssessment && onStartAssessment()
      return
    }
    setStepIdx(stepIdx + 1)
  }

  const handleDismiss = () => {
    setClosed(true)
    void notifyMarkOnboarded('dismissed', accessToken)
    onDismiss && onDismiss()
  }

  return (
    <div
      data-testid="onboarding-tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{
        position: 'fixed', inset: 0, background: '#000000DD', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: "'Outfit', system-ui",
      }}
    >
      <div
        style={{
          background: PALETTE.card,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 18,
          padding: 28,
          maxWidth: 460,
          width: '100%',
          color: PALETTE.text,
          boxShadow: '0 12px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: PALETTE.dim, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Step {stepIdx + 1} of {TOUR_STEPS.length}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 18, height: 3, borderRadius: 2,
                  background: i <= stepIdx ? PALETTE.accent : PALETTE.border,
                }}
              />
            ))}
          </div>
        </div>

        <h2
          id="onboarding-title"
          style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, lineHeight: 1.25, color: PALETTE.text }}
        >
          {titleWithName}
        </h2>
        <p style={{ fontSize: 14, color: PALETTE.sub, lineHeight: 1.6, marginBottom: 24 }}>
          {step.body}
        </p>

        {step.spotlight && (
          <div
            data-testid={`spotlight-${step.spotlight}`}
            style={{
              padding: 16, marginBottom: 24,
              background: `${PALETTE.accent}10`,
              border: `1px dashed ${PALETTE.accent}`,
              borderRadius: 12,
              fontSize: 12, color: PALETTE.accent,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {step.spotlight === 'meter' && '→ Highlighting: Calibration date field'}
            {step.spotlight === 'zone' && '→ Highlighting: “+ Add zone” button'}
            {step.spotlight === 'questions' && '→ Highlighting: One-question-at-a-time prompt screen'}
            {step.spotlight === 'finalize' && '→ Highlighting: Finalize button on results screen'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          {step.secondaryCta && (
            <button
              data-testid="onboarding-skip"
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                border: `1px solid ${PALETTE.border}`,
                color: PALETTE.sub,
                padding: '12px 20px',
                borderRadius: 10,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                minHeight: 44,
              }}
            >{step.secondaryCta}</button>
          )}
          <button
            data-testid="onboarding-dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss onboarding tour"
            style={{
              background: 'transparent', border: 'none', color: PALETTE.dim,
              fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 12px', minHeight: 36,
            }}
          >Dismiss</button>
          <button
            data-testid="onboarding-advance"
            onClick={handleAdvance}
            style={{
              flex: step.secondaryCta ? '0 0 auto' : 1,
              padding: '14px 22px',
              background: PALETTE.accent,
              color: '#031216',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: 48,
            }}
          >{step.primaryCta}</button>
        </div>
      </div>
    </div>
  )
}
