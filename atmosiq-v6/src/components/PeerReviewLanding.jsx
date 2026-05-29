/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * PeerReviewLanding — public landing page for the magic-link URL
 * the reviewer receives by email (?review_token=<uuid>). Habit-loop
 * PR 4.
 *
 * Mounted from App.jsx BEFORE the AuthProvider so the reviewer can
 * access it without an AtmosFlow account. Renders:
 *   • Loading state while fetching token metadata.
 *   • Context block (assessor name + facility + sent date + optional note).
 *   • Three response buttons: Approve / Request changes / Comment.
 *   • Optional notes textarea.
 *   • Error states: invalid_token / expired / already_reviewed.
 *
 * The page calls /api/peer-review-respond with the token; no
 * Supabase client is loaded here.
 */

import { useEffect, useState } from 'react'

const BG = '#080A0E'
const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const TEXT = '#ECEEF2'
const SUB = '#8B93A5'
const DIM = '#6B7380'
const DANGER = '#F87171'
const SUCCESS = '#34D399'

export default function PeerReviewLanding({ token }) {
  const [phase, setPhase] = useState('loading')  // loading | ready | submitting | done | error
  const [view, setView] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [status, setStatus] = useState(null)
  const [notes, setNotes] = useState('')
  const [submittedStatus, setSubmittedStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resp = await fetch('/api/peer-review-respond?token=' + encodeURIComponent(token), { method: 'GET' })
        const json = await resp.json().catch(() => ({}))
        if (cancelled) return
        if (!resp.ok) {
          setErrorCode(json.error || 'unknown')
          setPhase('error')
          return
        }
        setView(json.view)
        setPhase('ready')
      } catch {
        if (!cancelled) { setErrorCode('network'); setPhase('error') }
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const submit = async () => {
    if (!status) return
    setPhase('submitting')
    try {
      const resp = await fetch('/api/peer-review-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, status, notes: notes.trim() || null }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setErrorCode(json.error || 'unknown')
        setPhase('error')
        return
      }
      setSubmittedStatus(json.status || status)
      setPhase('done')
    } catch {
      setErrorCode('network')
      setPhase('error')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: BG, color: TEXT,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      padding: '24px 16px', display: 'flex', justifyContent: 'center',
    }}>
      <div style={{maxWidth: 600, width: '100%'}}>
        <div style={{...header, marginBottom: 24}}>
          <span style={{color: ACCENT, fontWeight: 800}}>AtmosFlow</span>
          <span style={{color: SUB, marginLeft: 8}}>· Peer Review</span>
        </div>

        {phase === 'loading' && (
          <div style={cardStyle}>
            <div style={{...muted}}>Loading review request…</div>
          </div>
        )}

        {phase === 'error' && (
          <div style={cardStyle}>
            <div style={{color: DANGER, fontWeight: 700, marginBottom: 8}}>
              {errorCode === 'invalid_token' ? 'This link is no longer valid.'
                : errorCode === 'expired' ? 'This review request has expired.'
                : errorCode === 'already_reviewed' ? 'This review has already been recorded.'
                : 'Something went wrong loading this request.'}
            </div>
            <div style={muted}>
              If the assessor needs your review, they can resend a fresh link from AtmosFlow.
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div style={cardStyle}>
            <div style={{color: SUCCESS, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8}}>
              <span aria-hidden="true">✓</span>
              <span>Review recorded</span>
            </div>
            <div style={muted}>
              Thanks. {view?.assessor_name || 'The assessor'} has been notified
              {submittedStatus === 'approved' ? ' that you approved this assessment.'
                : submittedStatus === 'changes_requested' ? ' and will see your requested changes.'
                : ' and will see your comment.'}
            </div>
          </div>
        )}

        {(phase === 'ready' || phase === 'submitting') && view && (
          <>
            <div style={cardStyle}>
              <div style={{...muted, marginBottom: 8}}>Review request from</div>
              <div style={{fontSize: 18, fontWeight: 700, marginBottom: 14}}>{view.assessor_name}</div>
              {view.facility_name && (
                <>
                  <div style={muted}>Facility</div>
                  <div style={{fontSize: 15, marginBottom: 14}}>{view.facility_name}</div>
                </>
              )}
              <div style={muted}>Sent</div>
              <div style={{fontSize: 15, marginBottom: 14}}>{new Date(view.requested_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
              {view.message && (
                <>
                  <div style={muted}>Note from the assessor</div>
                  <div style={{fontSize: 15, marginBottom: 4, padding: '10px 12px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, fontStyle: 'italic'}}>
                    {view.message}
                  </div>
                </>
              )}
              <div style={{...muted, marginTop: 14, fontSize: 12}}>
                The Word document is attached to the email this link came from.
                Open it, review the assessment, then choose your response below.
              </div>
            </div>

            <div style={{...cardStyle, marginTop: 16}}>
              <div style={{fontSize: 16, fontWeight: 700, marginBottom: 12}}>Your response</div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14}}>
                {[
                  { id: 'approved', label: 'Approve', sub: 'Report is fit for client delivery.' },
                  { id: 'changes_requested', label: 'Request changes', sub: 'Specific revisions needed.' },
                  { id: 'commented', label: 'Comment only', sub: 'Observations, no approval implied.' },
                ].map(o => (
                  <button
                    key={o.id}
                    onClick={() => setStatus(o.id)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: `1.5px solid ${status === o.id ? ACCENT : BORDER}`,
                      background: status === o.id ? 'rgba(34,211,238,0.08)' : CARD,
                      color: TEXT,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{fontWeight: 700}}>{o.label}</div>
                    <div style={{...muted, fontSize: 12, marginTop: 2}}>{o.sub}</div>
                  </button>
                ))}
              </div>
              <label style={{display: 'block', marginBottom: 14}}>
                <div style={{...muted, marginBottom: 6}}>Notes (optional, ≤ 4000 chars)</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 4000))}
                  rows={4}
                  placeholder="Specific feedback, citations, requested edits, etc."
                  style={{
                    width: '100%', padding: '12px 14px',
                    borderRadius: 10, border: `1.5px solid ${BORDER}`,
                    background: BG, color: TEXT, fontSize: 14,
                    fontFamily: 'inherit', resize: 'vertical', minHeight: 100,
                  }}
                />
              </label>
              <button
                onClick={submit}
                disabled={!status || phase === 'submitting'}
                style={{
                  width: '100%', padding: '14px 0',
                  borderRadius: 10, border: 'none',
                  background: ACCENT, color: BG,
                  fontWeight: 800, fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: status ? 'pointer' : 'not-allowed',
                  opacity: status ? (phase === 'submitting' ? 0.6 : 1) : 0.4,
                  minHeight: 48,
                }}
              >
                {phase === 'submitting' ? 'Recording response…' : 'Submit response'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const header = { fontSize: 14 }
const muted = { color: SUB, fontSize: 12 }
const cardStyle = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  padding: 18,
  color: TEXT,
}

// Export for App.jsx to know what URL param to look for.
export const PEER_REVIEW_TOKEN_PARAM = 'review_token'
