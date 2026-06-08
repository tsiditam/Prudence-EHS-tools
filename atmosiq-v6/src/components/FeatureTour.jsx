/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { useEffect, useRef, useState } from 'react'

/**
 * FeatureTour — a short, replayable in-app walkthrough of AtmosFlow's
 * main features.
 *
 * Pacing follows onboarding-UX research (NN/g): one concept per step,
 * short bodies people will actually read, full user control (Back / Next
 * / Skip + progress dots), and it is skippable and replayable rather than
 * a forced wall of text. Six steps is the deliberate ceiling — long tours
 * get abandoned.
 *
 * It is a theme-aware card overlay (CSS variables, so it follows the
 * light/dark toggle) — not a DOM spotlight, so it carries no fragile
 * selectors into the 2,800-line app shell. Mounted by MobileApp, which
 * owns the open/close state and the "seen" persistence.
 */

export const FEATURE_TOUR_STEPS = [
  {
    title: 'Welcome to AtmosFlow',
    body: 'A 60-second tour of how the app works. Tap Next to move through it. You can skip now and replay any time from Settings → Help.',
  },
  {
    title: 'Start an assessment',
    body: 'Tap New Assessment and AtmosFlow guides you one question at a time. Add a zone for each room or area you’re evaluating: an office, a server room, a lobby.',
  },
  {
    title: 'Set up your meter',
    body: 'Register your instrument and its last calibration date. That sets the confidence tier on every reading, and AtmosFlow flags a meter that’s overdue so your report stays defensible.',
  },
  {
    title: 'Capture readings',
    body: 'Enter measurements like CO₂, temperature, humidity, and PM2.5, answer the prompts, and attach photos. Everything saves as you go, so you can pause and resume on site.',
  },
  {
    title: 'Review your results',
    body: 'See a composite score, per-zone risk indicators, recommendations, and a suggested sampling plan. The Readiness panel surfaces any gaps and takes you straight to the field to fix them.',
  },
  {
    title: 'Generate the report & ask Jasper',
    body: 'Produce an AI findings narrative and export a Word report (always marked for IH review). Need help mid-walkthrough? Ask Jasper for standards, exposure limits, and photo analysis.',
  },
]

const card = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 18,
  padding: 28,
  maxWidth: 460,
  width: '100%',
  color: 'var(--text)',
  boxShadow: '0 12px 60px rgba(0,0,0,0.5)',
}

export default function FeatureTour({ onClose, steps = FEATURE_TOUR_STEPS, startIndex = 0 }) {
  const [idx, setIdx] = useState(startIndex)
  const primaryRef = useRef(null)

  const total = steps.length
  const isLast = idx === total - 1
  const isFirst = idx === 0
  const step = steps[idx]

  const close = () => { onClose && onClose() }
  const next = () => { if (isLast) close(); else setIdx(i => Math.min(i + 1, total - 1)) }
  const back = () => setIdx(i => Math.max(i - 1, 0))

  // Move focus to the primary action each step (keyboard + screen-reader
  // friendly) and let Escape skip the tour.
  useEffect(() => { primaryRef.current?.focus() }, [idx])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      data-testid="feature-tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-tour-title"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
      style={{
        position: 'fixed', inset: 0, background: '#000000DD', zIndex: 320,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: 'inherit',
      }}
    >
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Step {idx + 1} of {total}
          </span>
          <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} style={{ width: 18, height: 3, borderRadius: 2, background: i <= idx ? 'var(--accent)' : 'var(--border)' }} />
            ))}
          </div>
        </div>

        <h2 id="feature-tour-title" style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, lineHeight: 1.25, color: 'var(--text)' }}>
          {step.title}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 24 }}>
          {step.body}
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isFirst && (
            <button
              data-testid="feature-tour-back"
              onClick={back}
              style={{
                background: 'transparent', border: '1px solid var(--border)', color: 'var(--sub)',
                padding: '12px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
                fontFamily: 'inherit', minHeight: 44,
              }}
            >Back</button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isLast && (
              <button
                data-testid="feature-tour-skip"
                onClick={close}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--dim)',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 12px', minHeight: 44,
                }}
              >Skip</button>
            )}
            <button
              ref={primaryRef}
              data-testid="feature-tour-next"
              onClick={next}
              style={{
                padding: '14px 24px', background: 'var(--accent-fill)', color: 'var(--on-accent-fill)',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', minHeight: 48,
              }}
            >{isLast ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
