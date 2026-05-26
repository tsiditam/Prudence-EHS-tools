/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * FeedbackSheet — lightweight in-app feedback capture.
 *
 * v0 transport is a prefilled mailto: the sheet collects a category +
 * message and hands them to the user's mail client along with a context
 * line (where in the app they were) and the app/engine version. The UI is
 * transport-agnostic, so swapping mailto for a Supabase endpoint later is a
 * one-function change in `send()` — no consumer changes.
 */
import { useState } from 'react'
import BottomSheet from './BottomSheet'
import SegmentedControl from './SegmentedControl'
import TactileButton from './TactileButton'

const SUPPORT_EMAIL = 'support@prudenceehs.com'
const CATEGORIES = [
  { value: 'Idea', label: 'Idea' },
  { value: 'Bug', label: 'Bug' },
  { value: 'Other', label: 'Other' },
]

export default function FeedbackSheet({ open, onClose, context, version }) {
  const [category, setCategory] = useState('Idea')
  const [message, setMessage] = useState('')

  if (!open) return null

  const send = () => {
    const subject = `AtmosFlow feedback — ${category}`
    const body = [
      message.trim(),
      '',
      '———',
      context ? `Context: ${context}` : null,
      version ? `Version: ${version}` : null,
    ].filter((l) => l != null).join('\n')
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setMessage('')
    onClose?.()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Send feedback" ariaLabel="Send feedback">
      {context && (
        <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 12 }}>About: {context}</div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>Type</div>
      <SegmentedControl ariaLabel="Feedback type" value={category} onChange={setCategory} options={CATEGORIES} />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={5}
        placeholder="What's working, what isn't, or an idea to improve it…"
        style={{ width: '100%', marginTop: 12, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.55, boxSizing: 'border-box' }}
      />
      <div style={{ fontSize: 12, color: 'var(--dim)', margin: '8px 0 14px', lineHeight: 1.5 }}>
        Opens your email app with the details prefilled. We read every note.
      </div>
      <TactileButton variant="primary" fullWidth size="md" disabled={!message.trim()} onClick={send}>
        Send feedback
      </TactileButton>
    </BottomSheet>
  )
}
