/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperFeedbackRow — inline thumbs-up / thumbs-down row rendered
 * under each settled assistant turn in the AtmosFlow AI sheet.
 * Lucide icons (NOT emoji) so the look matches the rest of the
 * assistant chrome (arrow-up send, trash, refresh, etc.).
 *
 * Tap thumbs-up → records 'up' immediately.
 * Tap thumbs-down → expands a one-line reason input + Submit / Skip;
 *   Skip records 'down' with no reason; Submit records 'down' with
 *   the typed text (trimmed, capped server-side at 1000 chars).
 * Tap the active rating again → re-opens the reason input for the
 *   thumbs-down case so the user can edit; no-op for thumbs-up.
 *
 * Backed by useFieldAssistant.submitFeedback (parent supplies via
 * the submitFeedback prop) → POST /api/field-assistant-feedback.
 */

import { useState } from 'react'
import { I } from '../Icons'
import { mix } from '../../utils/theme'

const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const SURFACE = 'var(--surface)'
const BORDER = 'var(--border)'
const CARD = 'var(--card)'

export default function JasperFeedbackRow({ dbId, rating, submitFeedback }) {
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reasonText, setReasonText] = useState('')
  const isUp = rating === 'up'
  const isDown = rating === 'down'
  const onUp = () => {
    if (isUp) return
    submitFeedback(dbId, 'up')
    setReasonOpen(false)
  }
  const onDown = () => {
    if (isDown) { setReasonOpen(true); return }
    submitFeedback(dbId, 'down')
    setReasonOpen(true)
  }
  const onSubmitReason = () => {
    const text = reasonText.trim()
    if (text) submitFeedback(dbId, 'down', text)
    setReasonOpen(false)
    setReasonText('')
  }
  const onSkipReason = () => {
    setReasonOpen(false)
    setReasonText('')
  }

  const btnStyle = (active) => ({
    width: 30, height: 30, borderRadius: 8,
    background: active ? mix('accent', 14) : 'transparent',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: active ? ACCENT : DIM,
    opacity: active ? 1 : 0.6,
    transition: 'background 160ms ease, opacity 160ms ease, color 160ms ease',
    WebkitTapHighlightColor: 'transparent',
  })
  return (
    // display:contents so the thumbs flow inline with the Copy/Share
    // actions in the parent action row, while the reason input below
    // can still claim its own full-width line (flexBasis:100%).
    <div data-testid="jasper-feedback-row" style={{ display: 'contents' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          type="button"
          onClick={onUp}
          aria-label="Helpful"
          aria-pressed={isUp}
          title="Helpful"
          style={btnStyle(isUp)}>
          <I n="thumbsUp" s={15} c="currentColor" w={1.8} />
        </button>
        <button
          type="button"
          onClick={onDown}
          aria-label="Not helpful"
          aria-pressed={isDown}
          title="Not helpful"
          style={btnStyle(isDown)}>
          <I n="thumbsDown" s={15} c="currentColor" w={1.8} />
        </button>
      </div>
      {reasonOpen && (
        <div data-testid="jasper-feedback-reason" style={{
          marginTop: 6, flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px', borderRadius: 8,
          background: SURFACE, border: `1px solid ${BORDER}`,
        }}>
          <input
            type="text"
            placeholder="What was wrong? (optional)"
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmitReason() }}
            maxLength={1000}
            autoFocus
            data-testid="jasper-feedback-reason-input"
            style={{
              flex: 1, minWidth: 0,
              background: 'transparent', border: 'none', outline: 'none',
              color: TEXT, fontSize: 13, fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={onSkipReason}
            style={{
              padding: '4px 10px', borderRadius: 6,
              background: 'transparent', border: 'none',
              color: SUB, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            Skip
          </button>
          <button
            type="button"
            onClick={onSubmitReason}
            disabled={!reasonText.trim()}
            style={{
              padding: '4px 10px', borderRadius: 6,
              background: reasonText.trim() ? 'var(--accent-fill)' : CARD,
              border: 'none',
              color: reasonText.trim() ? 'var(--on-accent-fill)' : DIM,
              fontSize: 12, fontWeight: 700, cursor: reasonText.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}>
            Submit
          </button>
        </div>
      )}
    </div>
  )
}
