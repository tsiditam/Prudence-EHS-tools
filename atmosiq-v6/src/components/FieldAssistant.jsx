/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Field Assistant — bottom-sheet chat UI for the in-app conversational
 * agent. Mounted at MobileApp level; visibility controlled by the
 * `open` prop. Receives the assessor's current app context (view,
 * presurvey, current zone, etc.) and forwards it to the API so the
 * agent can give context-aware answers.
 *
 * Layout uses the established bottom-sheet pattern (see e.g. the photo
 * selector at MobileApp.jsx:1483–1511 and PricingSheet): backdrop +
 * rounded-top panel, 85vh max height, env(safe-area-inset-bottom) at
 * the bottom of the inner panel.
 *
 * Commit 2/3: buffered render — assistant message appears in full when
 * the stream completes. A "Thinking…" placeholder shows while sending.
 * Commit 3/3 will swap for incremental token render.
 */

import { useEffect, useRef, useState } from 'react'
import { I } from './Icons'
import { useFieldAssistant } from '../hooks/useFieldAssistant'
import { mix } from '../utils/theme'

const CARD = 'var(--card)'
const SURFACE = 'var(--surface)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const DANGER = 'var(--danger)'

const SUGGESTIONS = [
  'What does ASHRAE 62.1 say about CO₂ in offices?',
  'Indoor CO₂ at 1,400 ppm — what does that imply?',
  'When should I sample for TVOCs?',
]

function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '10px 14px',
        borderRadius: 14,
        background: isUser ? mix('accent', 14) : SURFACE,
        border: isUser ? `1px solid ${mix('accent', 25)}` : `1px solid ${BORDER}`,
        color: TEXT,
        fontSize: 14,
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {content}
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        padding: '12px 16px', borderRadius: 14, background: SURFACE,
        border: `1px solid ${BORDER}`, display: 'flex', gap: 4,
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: 3, background: DIM,
            animation: `faDot 1.2s ${i * 0.15}s ease-in-out infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

export default function FieldAssistant({ onClose, context }) {
  const { messages, sending, error, sendMessage } = useFieldAssistant()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    // Auto-scroll to bottom on new messages / sending changes.
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, sending])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async () => {
    const text = input
    if (!text.trim() || sending) return
    setInput('')
    await sendMessage(text, context)
  }

  const handleKey = (e) => {
    // Enter sends, Shift+Enter inserts newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose?.()
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', inset: 0, background: '#000000DD', zIndex: 260,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div style={{
        width: '100%', maxWidth: 640, background: CARD,
        border: `1px solid ${BORDER}`, borderBottom: 'none',
        borderRadius: '20px 20px 0 0',
        padding: '12px 16px',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        animation: 'fadeUp .3s ease',
        maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER, margin: '0 auto 10px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <I n="sparkle" s={18} c={ACCENT} w={1.8} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Field Assistant</div>
              <div style={{ fontSize: 10, color: DIM, fontFamily: 'var(--font-mono)', letterSpacing: '0.3px' }}>
                AI · REVIEW REQUIRED
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close field assistant"
            style={{
              background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8,
              width: 32, height: 32, cursor: 'pointer', color: SUB,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontFamily: 'inherit', lineHeight: 1,
            }}>×</button>
        </div>

        {/* Message list / empty state */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '8px 2px',
            minHeight: 200,
          }}>
          {messages.length === 0 && !sending && (
            <div style={{ padding: '16px 4px', color: SUB, fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ marginBottom: 12 }}>
                Ask anything about the standards, the readings you're seeing, or
                what to sample next. I won't assign scores — that's the engine's call.
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                Try
              </div>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s, context)}
                  disabled={sending}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 12px', marginBottom: 6,
                    background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10,
                    color: TEXT, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                  }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}

          {sending && <ThinkingDots />}

          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: mix('danger', 8), border: `1px solid ${mix('danger', 25)}`,
              color: DANGER, fontSize: 12, lineHeight: 1.5, marginTop: 4,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Input row */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-end',
          paddingTop: 10, borderTop: `1px solid ${BORDER}`, marginTop: 8,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={sending}
            placeholder="Ask the field assistant…"
            rows={1}
            style={{
              flex: 1, resize: 'none',
              padding: '10px 14px',
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              color: TEXT, fontSize: 14, fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
              minHeight: 42, maxHeight: 120, lineHeight: 1.5,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT }}
            onBlur={(e) => { e.currentTarget.style.borderColor = BORDER }}
          />
          <button
            onClick={submit}
            disabled={!input.trim() || sending}
            aria-label="Send"
            style={{
              width: 42, height: 42, borderRadius: 12,
              background: input.trim() && !sending ? 'var(--accent-fill)' : SURFACE,
              border: input.trim() && !sending ? 'none' : `1px solid ${BORDER}`,
              cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit', flexShrink: 0,
              transition: 'background 0.15s, border-color 0.15s',
            }}>
            <I n="send" s={16} c={input.trim() && !sending ? 'var(--on-accent-fill)' : DIM} w={1.8} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes faDot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  )
}
