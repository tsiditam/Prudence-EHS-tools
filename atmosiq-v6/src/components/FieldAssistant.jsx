/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Bottom-sheet chat UI for Jasper — the in-app Indoor Air Quality AI
 * assistant. Mounted at MobileApp level; visibility controlled by the
 * `open` prop. Receives the assessor's current app context (view,
 * presurvey, current zone, etc.) and forwards it to the API so the
 * agent can give context-aware answers.
 *
 * Internal name kept as "FieldAssistant" (file, hook, API, tables)
 * to avoid breaking shipped data + RLS. User-facing copy reads as
 * "Jasper" throughout.
 *
 * First-run gate: when localStorage.jasper_intro_v1 is unset, the
 * sheet body renders an intro panel with three AtmosFlow-tailored
 * disclaimers + Terms / Privacy links + a "Start Chatting" button
 * that gates the input until pressed. Versioned flag so we can
 * re-prompt if the disclaimer text materially changes.
 */

import { useEffect, useRef, useState } from 'react'
import { I } from './Icons'
// Jasper brand mark: monitor → robot. See JasperRobotIcon.jsx for the
// cyan→orange→red gradient + filled silhouette spec.
import JasperRobotIcon from './JasperRobotIcon'
import VoiceInputButton, { appendWithSpace } from './VoiceInputButton'
import { useFieldAssistant } from '../hooks/useFieldAssistant'
import { mix } from '../utils/theme'

const INTRO_FLAG_KEY = 'jasper_intro_v1'

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

function MessageBubble({ role, content, photos }) {
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
        {isUser && Array.isArray(photos) && photos.length > 0 && (
          <div style={{
            marginTop: 6, display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: SUB, fontFamily: 'var(--font-mono)', opacity: 0.8,
          }}>
            <I n="paperclip" s={11} c={SUB} w={1.6} />
            <span>{photos.length} photo{photos.length === 1 ? '' : 's'} attached</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Map an Anthropic tool name + input to the user-visible status
 * line that renders while the tool is running. Keeps the wording
 * close to what a Mac user expects from a modern AI app
 * ("Searching ASHRAE 62.1…", "Analyzing photo…").
 *
 * Falls back to a generic "Working…" when the tool name isn't
 * mapped — better than silently leaking the raw tool identifier.
 */
function describeTool(tool) {
  if (!tool) return null
  const name = tool.name || ''
  const input = tool.input || {}
  if (name === 'search_iaq_corpus' || name === 'search_corpus' || name === 'lookup_corpus') {
    const q = typeof input.query === 'string' ? input.query.slice(0, 60) : ''
    return q ? `Searching standards for "${q}"…` : 'Searching the standards corpus…'
  }
  if (name === 'lookup_standard' || name === 'lookup_threshold' || name === 'standards_lookup') {
    const ref = typeof input.standard === 'string' ? input.standard
      : typeof input.name === 'string' ? input.name
      : typeof input.id === 'string' ? input.id
      : ''
    return ref ? `Looking up ${ref}…` : 'Looking up standards…'
  }
  if (name === 'analyze_photo' || name === 'vision' || name === 'photo_analysis') {
    return 'Analyzing the attached photo…'
  }
  if (name === 'evaluate_threshold' || name === 'threshold_check') {
    return 'Checking the measurement against thresholds…'
  }
  if (name === 'web_search' || name === 'browse') {
    return 'Searching the web…'
  }
  // Friendly fallback: split snake_case → spaces, sentence case.
  const friendly = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return friendly ? `Running ${friendly}…` : 'Working…'
}

/**
 * Thinking / tool-status indicator. When the agent is between
 * tokens (no active tool), renders the classic 3-dot pulse. When
 * a tool is running, renders a small spinner + a short status line
 * describing what the tool is doing. Same bubble surface either
 * way so the rhythm of the conversation doesn't jump.
 */
function ToolStatus({ tool }) {
  const status = describeTool(tool)
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        padding: status ? '10px 14px' : '12px 16px',
        borderRadius: 14, background: SURFACE,
        border: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: status ? 10 : 4,
        maxWidth: '85%',
      }}>
        {status ? (
          <>
            {/* Small inline spinner. CSS rotation only — no JS. */}
            <span
              aria-hidden="true"
              style={{
                width: 12, height: 12, borderRadius: '50%',
                border: `1.5px solid ${BORDER}`,
                borderTopColor: ACCENT,
                animation: 'faSpin 0.9s linear infinite',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, color: SUB, lineHeight: 1.4, fontStyle: 'italic' }}>
              {status}
            </span>
          </>
        ) : (
          [0, 1, 2].map(i => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: 3, background: DIM,
              animation: `faDot 1.2s ${i * 0.15}s ease-in-out infinite`,
            }} />
          ))
        )}
      </div>
    </div>
  )
}

function JasperIntroPanel({ onAccept, onNavigate }) {
  const linkStyle = {
    background: 'transparent', border: 'none', padding: 0,
    color: ACCENT, fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    textDecoration: 'underline', cursor: 'pointer',
  }
  // Each child of the intro cascades in with the same 500ms reveal
  // animation, staggered ~500ms apart. The reduced-motion media query
  // in the inline <style> block at the bottom of this file nullifies
  // the cascade for users with motion sensitivity.
  const reveal = (delayMs) => ({
    animation: 'jasperReveal 500ms ease-out both',
    animationDelay: `${delayMs}ms`,
  })
  return (
    <div style={{ padding: '12px 4px 4px' }}>
      <div className="jasper-stagger"
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, ...reveal(0) }}>
        <JasperRobotIcon size={40} color="var(--accent)" />
        <div style={{ fontSize: 15, color: TEXT, lineHeight: 1.45, fontWeight: 600 }}>
          <span role="img" aria-label="waving hand">👋</span> Hi, I'm Jasper, your Indoor Air Quality AI assistant.
        </div>
      </div>

      <ul style={{
        listStyle: 'disc', paddingLeft: 20, margin: '0 0 16px',
        color: SUB, fontSize: 13, lineHeight: 1.55,
      }}>
        <li className="jasper-stagger" style={{ marginBottom: 10, ...reveal(500) }}>
          I'm an AI screening assistant — I won't make compliance, causation,
          or final IAQ calls. Those go to a qualified professional.
        </li>
        <li className="jasper-stagger" style={{ marginBottom: 10, ...reveal(1000) }}>
          Don't paste sensitive PII (SSN, medical records, banking).
          Building / client / sample names are fine.
        </li>
        <li className="jasper-stagger" style={reveal(1500)}>
          Chats are saved to your AtmosFlow account until you delete them.
          You can clear conversation history in Settings.
        </li>
      </ul>

      <div className="jasper-stagger"
        style={{ fontSize: 12, color: DIM, lineHeight: 1.55, marginBottom: 16, ...reveal(2000) }}>
        By starting this chat, you agree to the{' '}
        <button type="button" onClick={() => onNavigate?.('tos')} style={linkStyle}>
          Terms of Service
        </button>{' '}
        and acknowledge the{' '}
        <button type="button" onClick={() => onNavigate?.('privacy')} style={linkStyle}>
          Privacy Policy
        </button>.
      </div>

      <button
        type="button"
        onClick={onAccept}
        className="jasper-stagger"
        style={{
          width: '100%', padding: '12px 16px', borderRadius: 12,
          background: 'var(--accent-fill)', color: 'var(--on-accent-fill)',
          border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.2px',
          ...reveal(2500),
        }}>
        Start Chatting
      </button>
    </div>
  )
}

function readIntroFlag() {
  if (typeof window === 'undefined') return true
  try { return window.localStorage.getItem(INTRO_FLAG_KEY) !== null } catch { return true }
}

/**
 * Inline agentic-action card. Rendered in the chat when Jasper
 * has called the propose_action tool. Three visual states:
 *   - pending:  "Add note to Zone A1" + [Reject] [Apply] buttons
 *   - accepted: muted "✓ Applied"
 *   - rejected: muted "× Rejected"
 *
 * The parent passes onAccept / onReject — the actual application
 * of the action (setView / append note) lives in MobileApp via
 * the onAction prop, not here.
 */
function ActionCard({ action, summary, status, onAccept, onReject }) {
  const isPending = status === 'pending'
  const isAccepted = status === 'accepted'
  const glyph =
    action?.type === 'navigate'
      ? 'M9 18l6-6-6-6' // chevron-right
      : 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' // pencil-square
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        maxWidth: '90%',
        padding: '12px 14px',
        borderRadius: 14,
        background: isAccepted ? mix('accent', 6) : SURFACE,
        border: isPending
          ? `1px solid color-mix(in srgb, var(--accent) 36%, transparent)`
          : `1px solid ${BORDER}`,
        opacity: status === 'rejected' ? 0.6 : 1,
        transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isPending ? 10 : 0 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            background: isAccepted
              ? 'var(--accent-fill)'
              : 'color-mix(in srgb, var(--accent) 12%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={isAccepted ? 'var(--on-accent-fill)' : 'var(--accent)'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {isAccepted ? <polyline points="20 6 9 17 4 12" /> : <path d={glyph} />}
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, color: 'var(--accent)', fontWeight: 700,
              letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2,
            }}>
              {isAccepted ? 'Applied' : status === 'rejected' ? 'Rejected' : 'Proposed action'}
            </div>
            <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.4, fontWeight: 600 }}>
              {summary || (action?.type === 'navigate' ? 'Open a screen' : 'Add a note')}
            </div>
            {action?.type === 'add_zone_note' && action.note_text && (
              <div style={{
                fontSize: 12, color: SUB, lineHeight: 1.5, marginTop: 6,
                padding: '8px 10px', background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {action.note_text}
              </div>
            )}
          </div>
        </div>
        {isPending && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={onReject}
              style={{
                flex: 1, padding: '8px 12px',
                background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 8, color: SUB,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', minHeight: 36,
                WebkitTapHighlightColor: 'transparent',
              }}>
              Reject
            </button>
            <button
              type="button"
              onClick={onAccept}
              style={{
                flex: 1, padding: '8px 12px',
                background: 'var(--accent-fill)', border: 'none',
                borderRadius: 8, color: 'var(--on-accent-fill)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', minHeight: 36, letterSpacing: '-0.1px',
                WebkitTapHighlightColor: 'transparent',
              }}>
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FieldAssistant({ onClose, context, onNavigate, initialMessage, onAction }) {
  const {
    messages,
    sending,
    error,
    quota,
    attachedPhotos,
    conversationId,
    activeTool,
    proposedActions,
    sendMessage,
    stop,
    attachPhoto,
    removePhoto,
    listConversations,
    loadConversation,
    newConversation,
    markActionAccepted,
    markActionRejected,
  } = useFieldAssistant()
  const [input, setInput] = useState('')
  // History panel state. `historyOpen` toggles the panel overlay
  // inside the sheet (replacing the chat transcript view). `historyList`
  // caches the most-recent fetch so reopening the panel is instant;
  // we refresh on every open to pick up new turns from the current
  // session.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyList, setHistoryList] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [introAccepted, setIntroAccepted] = useState(readIntroFlag)
  // Focus-within state for the unified composer container so its
  // border + soft glow can react to the textarea getting focus.
  // CSS :focus-within would also work, but we render via inline
  // styles for the rest of the surface, so this stays consistent.
  const [composerFocused, setComposerFocused] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const onPickPhotos = async (e) => {
    const files = Array.from(e.target.files || [])
    // Reset the input so re-picking the same file fires onChange again.
    if (e.target) e.target.value = ''
    for (const file of files) {
      await attachPhoto(file)
    }
  }

  const acceptIntro = () => {
    try { window.localStorage.setItem(INTRO_FLAG_KEY, new Date().toISOString()) } catch { /* ignore quota / private-mode */ }
    setIntroAccepted(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  useEffect(() => {
    // Auto-scroll to bottom on new messages and as tokens stream in.
    // Tracks total content length (across all messages) so streaming
    // updates re-trigger the scroll.
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, sending])

  // Auto-resize the textarea as the user types so the composer grows
  // up to MAX_COMPOSER_HEIGHT (then scrolls internally). Mirrors the
  // standard Claude / ChatGPT pattern. Resetting height to 0 first
  // forces scrollHeight to reflect the current content rather than
  // the previously-fitted height.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    const next = Math.min(el.scrollHeight, 200)
    el.style.height = next + 'px'
  }, [input])

  // Initial-message auto-send. When the sheet is opened by the
  // voice-command modal with a transcribed question, we don't want
  // the user to have to tap Send — speak → done. Fires once on
  // mount when initialMessage is set and the intro gate is already
  // accepted. If the user has never seen the intro, we surface it
  // first and the initial message becomes the input value so they
  // can review + send after accepting.
  const initialMessageRef = useRef(null)
  useEffect(() => {
    if (!initialMessage || initialMessageRef.current === initialMessage) return
    initialMessageRef.current = initialMessage
    if (!introAccepted) {
      // Intro not yet accepted — drop it into the input so the
      // user can review it after tapping Start Chatting.
      setInput(initialMessage)
      return
    }
    // Already accepted — auto-send. sendMessage handles its own
    // disabled-while-sending guard, so a stray double-trigger
    // won't double-send.
    sendMessage(initialMessage, context)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, introAccepted])

  useEffect(() => {
    inputRef.current?.focus()
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Show the "thinking…" dots only before the first token arrives.
  // Once the assistant bubble exists, the streaming text serves as
  // the visual indicator that something is happening.
  const lastRole = messages[messages.length - 1]?.role
  const showThinking = sending && lastRole !== 'assistant'

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
    <>
      {/* Backdrop — separated from the sheet so the sheet can be
          explicitly positioned with bottom/left/right instead of
          relying on flex-centering inside the backdrop. On iOS PWA
          the flex-centered pattern was producing a sheet wider than
          the visual viewport during URL-bar collapse transitions,
          which leaked content past both side edges (the original
          bug report showed the robot icon's left ear cut off and
          "Terms · Privacy · AI · REVIEW REQUIRED" bleeding past
          both screen edges). */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'fixed', inset: 0, background: '#000000DD', zIndex: 260,
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 'env(safe-area-inset-left, 0px)',
          right: 'env(safe-area-inset-right, 0px)',
          zIndex: 261,
          maxWidth: 640,
          marginLeft: 'auto',
          marginRight: 'auto',
          background: CARD,
          border: `1px solid ${BORDER}`, borderBottom: 'none',
          borderRadius: '20px 20px 0 0',
          padding: '12px 16px',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          animation: 'fadeUp .3s ease',
          maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}>
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER, margin: '0 auto 10px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <JasperRobotIcon size={22} color="var(--accent)" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.2 }}>AI Assistant</div>
              <div style={{
                fontSize: 11, color: SUB, lineHeight: 1.3, marginTop: 1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                Indoor Air Quality AI assistant
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* New chat — only meaningful when the current transcript
                has at least one turn, otherwise the button is a no-op
                that just re-resets empty state. Hidden in that case
                so the header stays uncluttered for first-time users. */}
            {messages.length > 0 && !historyOpen && (
              <button
                onClick={() => { newConversation(); setHistoryOpen(false) }}
                aria-label="Start a new conversation"
                title="New chat"
                style={{
                  background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8,
                  width: 32, height: 32, cursor: 'pointer', color: SUB,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit',
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
            {/* History — toggles the past-conversations browser. Open
                state both swaps the panel content AND tints the
                button so the affordance is obvious. */}
            <button
              onClick={async () => {
                const next = !historyOpen
                setHistoryOpen(next)
                if (next) {
                  setHistoryLoading(true)
                  const list = await listConversations()
                  setHistoryList(list)
                  setHistoryLoading(false)
                }
              }}
              aria-label={historyOpen ? 'Back to chat' : 'View past conversations'}
              title={historyOpen ? 'Back to chat' : 'History'}
              style={{
                background: historyOpen ? `${ACCENT}22` : 'transparent',
                border: `1px solid ${historyOpen ? ACCENT : BORDER}`,
                borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
                color: historyOpen ? ACCENT : SUB,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
            </button>
            <button
              onClick={onClose}
              aria-label="Close AI Assistant"
              style={{
                background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8,
                width: 32, height: 32, cursor: 'pointer', color: SUB,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontFamily: 'inherit', lineHeight: 1,
              }}>×</button>
          </div>
        </div>

        {/* History panel — replaces the chat transcript when open.
            Renders past conversations grouped by recency. Empty
            conversations (zero messages) are hidden because they're
            usually accidental sheet opens that never produced a
            turn. Tapping a row resumes that conversation and snaps
            back to the chat view. */}
        {historyOpen && (
          <div style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            padding: '8px 2px', minHeight: 200,
            minWidth: 0, boxSizing: 'border-box',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: SUB, letterSpacing: '0.3px',
              textTransform: 'uppercase', padding: '6px 4px 10px',
            }}>
              Past conversations
            </div>
            {historyLoading && (
              <div style={{ padding: 20, textAlign: 'center', color: SUB, fontSize: 12 }}>
                Loading…
              </div>
            )}
            {!historyLoading && historyList.filter((c) => (c.message_count || 0) > 0).length === 0 && (
              <div style={{ padding: '20px 4px', color: SUB, fontSize: 13, lineHeight: 1.6 }}>
                No past conversations yet. When you chat with the AI Assistant, your turns are saved here automatically so you can revisit or continue them later.
              </div>
            )}
            {!historyLoading && historyList
              .filter((c) => (c.message_count || 0) > 0)
              .map((c) => {
                const isCurrent = c.id === conversationId
                const updated = c.updated_at ? new Date(c.updated_at) : null
                const dateLabel = updated
                  ? updated.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                  : ''
                return (
                  <button
                    key={c.id}
                    onClick={async () => {
                      const ok = await loadConversation(c.id)
                      if (ok) setHistoryOpen(false)
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '12px 14px',
                      background: isCurrent ? `${ACCENT}10` : 'transparent',
                      border: `1px solid ${isCurrent ? ACCENT + '40' : BORDER}`,
                      borderRadius: 10, marginBottom: 8,
                      cursor: 'pointer', fontFamily: 'inherit', color: TEXT,
                    }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, lineHeight: 1.3, marginBottom: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {c.title || 'Untitled conversation'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: SUB }}>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{dateLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.message_count} message{c.message_count === 1 ? '' : 's'}</span>
                      {isCurrent && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span style={{ color: ACCENT, fontWeight: 600 }}>Current</span>
                        </>
                      )}
                    </div>
                  </button>
                )
              })}
          </div>
        )}

        {/* Message list / empty state */}
        {!historyOpen && (<>
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            padding: '8px 2px', minHeight: 200,
            minWidth: 0, boxSizing: 'border-box', wordBreak: 'break-word',
          }}>
          {!introAccepted && (
            <JasperIntroPanel onAccept={acceptIntro} onNavigate={onNavigate} />
          )}

          {introAccepted && messages.length === 0 && !sending && (
            <div style={{ padding: '16px 4px', color: SUB, fontSize: 13, lineHeight: 1.6 }}>
              <div className="jasper-stagger"
                style={{ marginBottom: 12, animation: 'jasperReveal 500ms ease-out both', animationDelay: '0ms' }}>
                Ask anything about the standards, the readings you're seeing, or
                what to sample next. I won't assign scores — that's the engine's call.
              </div>
              <div className="jasper-stagger"
                style={{ fontSize: 11, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8,
                  animation: 'jasperReveal 500ms ease-out both', animationDelay: '500ms' }}>
                Try
              </div>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s, context)}
                  disabled={sending}
                  className="jasper-stagger"
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 12px', marginBottom: 6,
                    background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10,
                    color: TEXT, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                    animation: 'jasperReveal 500ms ease-out both',
                    animationDelay: `${1000 + i * 700}ms`,
                  }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} photos={m.photos} />
          ))}

          {/* Proposed action cards — rendered AFTER the message
              loop so they always appear at the bottom of the
              transcript next to Jasper's follow-up text. The
              parent (MobileApp) supplies onAction; success/
              failure marks the card via the hook callbacks. */}
          {proposedActions.map((p) => (
            <ActionCard
              key={p.id}
              action={p.action}
              summary={p.summary}
              status={p.status}
              onAccept={() => {
                const ok = onAction?.(p.action)
                // onAction may return false to veto (e.g. nav target
                // not reachable from the current view). In that
                // case mark as rejected so the user sees a clean
                // outcome rather than a perpetual Apply button.
                if (ok === false) markActionRejected(p.id)
                else markActionAccepted(p.id)
              }}
              onReject={() => markActionRejected(p.id)}
            />
          ))}

          {showThinking && <ToolStatus tool={activeTool} />}

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

        {/* Offline banner — only shown when network is actually down */}
        {!online && (
          <div style={{
            padding: '8px 12px', marginTop: 6,
            background: mix('warn', 8), border: `1px solid ${mix('warn', 25)}`,
            borderRadius: 8, color: 'var(--warn)', fontSize: 12, lineHeight: 1.4,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--warn)' }} />
            You're offline. The assistant will work again when you're back online.
          </div>
        )}

        {/* Unified Claude-style composer. One rounded surface holds
            three stacked regions: attached-photo chips at the top,
            the textarea in the middle, and an action toolbar at the
            bottom (paperclip + mic on the left, send on the right).
            Borders on individual children removed — the container
            border is the only visible boundary, and it brightens to
            ACCENT with a soft glow on focus-within. AtmosFlow colors
            throughout: SURFACE background, ACCENT focus / send-fill,
            DIM idle icon foreground. */}
        <div
          style={{
            marginTop: 10,
            background: SURFACE,
            border: `1.5px solid ${composerFocused ? ACCENT : BORDER}`,
            borderRadius: 18,
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            boxShadow: composerFocused
              ? `0 0 0 4px ${mix('accent', 12)}, 0 1px 2px rgba(0,0,0,0.06)`
              : '0 1px 2px rgba(0,0,0,0.04)',
            opacity: introAccepted ? 1 : 0.55,
            minWidth: 0, boxSizing: 'border-box',
          }}
        >
          {/* L4 — staged photo chips. Sit inside the composer at the
              top so they read as "things attached to this message"
              rather than a separate region. Hidden when nothing is
              attached so the container collapses back to its compact
              form. */}
          {attachedPhotos.length > 0 && (
            <div
              data-testid="attached-photos"
              style={{
                display: 'flex', flexWrap: 'wrap', gap: 6,
                padding: '10px 12px 0',
              }}
            >
              {attachedPhotos.map((p) => (
                <div
                  key={p.id}
                  style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 28px 4px 4px',
                    background: CARD, border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                  }}
                >
                  <img
                    src={p.dataUrl}
                    alt={p.label || 'attached photo'}
                    style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', display: 'block' }}
                  />
                  <span
                    style={{
                      fontSize: 11, color: SUB, maxWidth: 140,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    title={p.label || ''}
                  >
                    {p.label || 'photo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    aria-label={`Remove ${p.label || 'photo'}`}
                    disabled={sending}
                    style={{
                      position: 'absolute', top: 2, right: 2,
                      width: 20, height: 20, borderRadius: 10,
                      background: 'transparent', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: sending ? 'not-allowed' : 'pointer',
                      color: DIM,
                    }}
                  >
                    <I n="x" s={12} c={DIM} w={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Hidden file input — the visible paperclip button below
              drives it. multiple + accept restrict to the formats
              the backend parses; the hook validates again before
              the actual upload. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onPickPhotos}
            style={{ display: 'none' }}
            data-testid="photo-file-input"
            aria-hidden="true"
          />

          {/* Textarea — transparent, no border, no outline. Visually
              the textarea IS the container content; the container
              owns all the chrome. Auto-resizes via the useEffect
              above (up to 200px, then internal scroll). */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            disabled={sending || !introAccepted}
            placeholder={introAccepted ? 'Ask Jasper anything…' : 'Tap "Start Chatting" above to begin'}
            rows={1}
            style={{
              width: '100%',
              padding: '14px 16px 6px',
              background: 'transparent',
              border: 'none',
              color: TEXT, fontSize: 15, fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
              minHeight: 48, maxHeight: 200, lineHeight: 1.5,
              resize: 'none',
              display: 'block',
            }}
          />

          {/* Action toolbar — paperclip + mic on the left as ghost
              icon buttons, send on the right as a small accent
              circle that lights up only when there's content. Sits
              inside the same rounded container so the whole thing
              reads as one surface. */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 8px 8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || !introAccepted || attachedPhotos.length >= 5}
                aria-label="Attach photo"
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'transparent', border: 'none',
                  cursor: sending || !introAccepted || attachedPhotos.length >= 5 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', flexShrink: 0,
                  opacity: sending || !introAccepted ? 0.55 : 1,
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <I n="paperclip" s={18} c={attachedPhotos.length > 0 ? ACCENT : SUB} w={1.8} />
              </button>
              {/* Voice dictation — same hook as before, but the
                  button is rendered as a ghost (no border, no
                  background) so it sits flush with the paperclip
                  inside the composer container. The pulse +
                  listening fill from the component itself still
                  fire as expected. */}
              <VoiceInputButton
                ariaLabel="Dictate message"
                disabled={sending || !introAccepted}
                size={36}
                style={{ border: 'none', borderRadius: 10, background: 'transparent' }}
                idleBorder="transparent"
                onTranscript={(text) => setInput((v) => appendWithSpace(v, text))}
              />
            </div>
            {/* Send / Stop toggle. While the agent is streaming
                (sending=true) the same circle holds a Stop glyph
                that aborts the in-flight request. After Stop the
                partial assistant turn already on screen stays
                visible so the user can read what was produced
                before they interrupted. Modern AI chat pattern —
                ChatGPT, Claude, Gemini, Granola all do this. */}
            {sending ? (
              <button
                onClick={stop}
                aria-label="Stop generating"
                title="Stop generating"
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  background: 'var(--accent-fill)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', flexShrink: 0,
                  transition: 'background 0.15s, transform 0.1s',
                  WebkitTapHighlightColor: 'transparent',
                  animation: 'faStopIn 140ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}>
                {/* Filled square — universal "stop" glyph in AI
                    chat UIs. Sized to read at 36px. */}
                <span style={{
                  display: 'block', width: 12, height: 12, borderRadius: 2,
                  background: 'var(--on-accent-fill)',
                }} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!input.trim() || !introAccepted}
                aria-label="Send"
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  background: input.trim() && introAccepted ? 'var(--accent-fill)' : CARD,
                  border: 'none',
                  cursor: input.trim() && introAccepted ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', flexShrink: 0,
                  transition: 'background 0.15s, transform 0.1s',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <I n="send" s={16} c={input.trim() && introAccepted ? 'var(--on-accent-fill)' : DIM} w={1.8} />
              </button>
            )}
          </div>
        </div>
        </>)}

        {/* Always-on legal + defensibility footer. Terms / Privacy stay one
            tap away after the intro is dismissed; the mono REVIEW REQUIRED
            chip carries the screening-only positioning. */}
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 10, color: DIM, gap: 8, flexWrap: 'wrap',
          minWidth: 0, boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => onNavigate?.('tos')}
              style={{ background: 'transparent', border: 'none', padding: 0, color: SUB, fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>
              Terms
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onNavigate?.('privacy')}
              style={{ background: 'transparent', border: 'none', padding: 0, color: SUB, fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>
              Privacy
            </button>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.3px' }}>AI · REVIEW REQUIRED</span>
        </div>

        {/* Quota footer — only shown after the first response when the
            backend has reported per-user usage. Free-tier users see a
            soft upgrade nudge once they're past 80% of the daily cap. */}
        {quota && (
          <div style={{
            marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 11, color: DIM, fontFamily: 'var(--font-mono)', letterSpacing: '0.3px',
          }}>
            <span>{quota.used_today} / {quota.limit_today} messages today</span>
            {quota.plan === 'free' && quota.used_today >= Math.floor(quota.limit_today * 0.8) && (
              <span style={{ color: ACCENT, fontFamily: 'inherit', fontWeight: 600 }}>
                Upgrade for more →
              </span>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes faDot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes faSpin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes faStopIn {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes jasperReveal {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .jasper-stagger {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </>
  )
}
