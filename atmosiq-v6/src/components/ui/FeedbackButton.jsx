/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * FeedbackButton — a subtle inline trigger for contextual feedback. Drop it
 * beside an output the assessor reviews (e.g. the AI narrative, findings) and
 * wire onClick to open the FeedbackSheet with that section's context.
 */
import { I } from '../Icons'

export default function FeedbackButton({ onClick, label = 'Feedback', style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Send feedback about this section`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--sub)',
        padding: '4px 6px', borderRadius: 8, ...style,
      }}
    >
      <I n="flag" s={12} c="var(--sub)" w={1.7} />
      <span>{label}</span>
    </button>
  )
}
