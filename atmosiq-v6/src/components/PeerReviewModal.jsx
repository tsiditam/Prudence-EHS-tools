/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * PeerReviewModal — "Send for peer review" sheet rendered from the
 * results screen (habit-loop PR 4). The assessor fills in the
 * reviewer's name + email + optional message; on submit the parent
 * is responsible for:
 *   1. Generating the consultant DOCX blob (via existing
 *      getConsultantDocxBlob).
 *   2. POSTing /api/peer-review with the base64 attachment.
 *
 * This component knows nothing about Supabase / Resend. It's a
 * pure form + a callback. That keeps the API surface here flexible
 * (e.g. swappable transport in tests).
 */

import { useState } from 'react'
import * as V3 from '../styles/tokens'
import { I } from './Icons'
import GlassCard from './ui/GlassCard'
import TactileButton from './ui/TactileButton'

/**
 * Props:
 *   open:      boolean — show/hide
 *   facility:  string — for the header (e.g. "Acme HQ")
 *   onSend:    async ({ reviewer_name, reviewer_email, message })
 *              → caller does the DOCX + POST; throws on failure
 *   onClose:   () => void
 */
export default function PeerReviewModal({ open, facility, onSend, onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  if (!open) return null

  const reset = () => {
    setName(''); setEmail(''); setMessage('')
    setError(null); setSent(false); setSending(false)
  }
  const close = () => { reset(); onClose && onClose() }

  const submit = async () => {
    setError(null)
    if (!name.trim()) { setError('Reviewer name is required.'); return }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid reviewer email.')
      return
    }
    setSending(true)
    try {
      await onSend({
        reviewer_name: name.trim(),
        reviewer_email: email.trim(),
        message: message.trim() || null,
      })
      setSent(true)
    } catch (e) {
      setError((e && e.message) || 'Send failed. Try again or contact support.')
      setSending(false)
      return
    }
    setSending(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send for peer review"
      style={{
        position: 'fixed', inset: 0, zIndex: 350,
        background: 'rgba(8, 10, 14, 0.78)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 12px',
      }}
    >
      <GlassCard
        style={{
          width: '100%', maxWidth: 560,
          margin: 'auto 0 calc(env(safe-area-inset-bottom, 0px) + 16px)',
          padding: 22, borderRadius: 18,
          animation: 'fadeUp .28s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:'var(--accent-soft, rgba(34,211,238,0.12))',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <I n="send" s={20} c="var(--accent)" w={1.8} />
          </div>
          <div style={{...V3.T.h2}}>
            {sent ? 'Sent for review' : 'Send for peer review'}
          </div>
        </div>

        {sent ? (
          <>
            <div style={{...V3.T.bodyDim, marginBottom: 14}}>
              The report is on its way to <strong style={{color:'var(--text)'}}>{name}</strong>.
              You'll get an email back when they respond (approve,
              request changes, or comment).
            </div>
            <TactileButton variant="primary" fullWidth size="lg" onClick={close} haptic="success">Done</TactileButton>
          </>
        ) : (
          <>
            <div style={{...V3.T.bodyDim, marginBottom: 14}}>
              Send the finalized {facility ? <>report for <strong style={{color:'var(--text)'}}>{facility}</strong></> : <>this finalized report</>} to a colleague for peer review.
              They'll receive the Word document plus a link to record
              their response — no AtmosFlow account required.
            </div>

            <label style={{display:'block', marginBottom: 10}}>
              <div style={{...V3.T.captionDim, marginBottom: 6}}>Reviewer name</div>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dr. Pat Smith, CIH"
                style={inputStyle}
              />
            </label>

            <label style={{display:'block', marginBottom: 10}}>
              <div style={{...V3.T.captionDim, marginBottom: 6}}>Reviewer email</div>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="reviewer@firm.com"
                style={inputStyle}
              />
            </label>

            <label style={{display:'block', marginBottom: 14}}>
              <div style={{...V3.T.captionDim, marginBottom: 6}}>Note for the reviewer (optional)</div>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                placeholder="Anything specific you want them to look at?"
                rows={3}
                style={{...inputStyle, resize:'vertical', minHeight: 72}}
              />
            </label>

            {error && (
              <div style={{...V3.T.captionDim, color:'#F59E0B', marginBottom: 10}}>{error}</div>
            )}

            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
              <TactileButton
                variant="primary"
                fullWidth size="lg"
                disabled={sending}
                onClick={submit}
                haptic="success"
                icon={<I n="send" s={16} c="var(--primary-cta-icon, #0B1014)" w={2} />}
              >
                {sending ? 'Sending…' : 'Send for review'}
              </TactileButton>
              <TactileButton variant="ghost" fullWidth disabled={sending} onClick={close}>
                Cancel
              </TactileButton>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '12px 14px',
  borderRadius: 10,
  border: '1.5px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 15, fontFamily: 'inherit',
  minHeight: 46,
}
