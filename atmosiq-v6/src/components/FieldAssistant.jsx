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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { I } from './Icons'
import STO from '../utils/storage'
import JasperBrainIcon from './JasperBrainIcon'
import VoiceInputButton, { appendWithSpace } from './VoiceInputButton'
import { useFieldAssistant, MAX_PHOTOS_PER_REQUEST } from '../hooks/useFieldAssistant'
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS_PER_REQUEST } from '../utils/chatAttachments'
import { mix } from '../utils/theme'
import { STD } from '../constants/standards'
// Phase 4 — design-system primitives + tokens extracted out of this
// file so JasperWatchPanel and other future AI surfaces can adopt the
// same feel without re-copying inline styles.
import JasperPromptPill from './ui/JasperPromptPill'
import JasperFeedbackRow from './ui/JasperFeedbackRow'
import JasperMessageActions from './ui/JasperMessageActions'
import Markdown from './Markdown'
import { AI_DISCLAIMER_LINE } from '../constants/field-assistant-prompt'
import { splitTrailingDisclaimer } from '../utils/jasperDisclaimer'
import {
  JASPER_SPRING,
  JASPER_EASE_OUT,
  JASPER_DURATION,
  jasperAtmosphere,
  JASPER_SHEET_SHADOW,
  jasperComposerFocusShadow,
  JASPER_KEYFRAMES_CSS,
} from '../styles/jasper-tokens'

const INTRO_FLAG_KEY = 'jasper_intro_v1'

// Header control: a 36px round ghost button; `on` tints it accent (the
// history toggle while the panel is open).
const HEADER_BTN = (on) => ({
  width: 36, height: 36, borderRadius: 18,
  background: on ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
  border: `1px solid ${on ? 'var(--accent)' : 'transparent'}`,
  color: on ? 'var(--accent)' : 'var(--sub)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit', flexShrink: 0, WebkitTapHighlightColor: 'transparent',
})

// Desktop (>=1024): the assistant is a PAGE beside the navigation rail,
// not a phone sheet floating over a scrim. It pins to the content area
// right of the sidebar at full width (the transcript centers itself in a
// reading column below), drops the border and shadow, and fades in instead
// of rising — a page opens in place; only a sheet slides up. Everything
// else about the surface (header, composer, footer) is shared with the
// phone layout, so the two never drift.
const desktopPageStyle = (leftInset) => ({
  left: leftInset, right: 0, maxWidth: 'none',
  border: 'none', boxShadow: 'none',
  padding: '12px 24px',
  paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
  paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
  animation: `jasperPageIn ${JASPER_DURATION.enter}ms ${JASPER_EASE_OUT} both`,
})

// Reading column for the desktop transcript. 800px holds roughly 75–90
// characters of 16px Inter per line, the upper end of the range where
// line length stops costing reading speed (Dyson & Haselgrove 2001;
// Nielsen Norman Group's line-length guidance). Wider, and a paragraph of
// AI prose sprawls across a 1440px window the way it did before this pass.
const DESKTOP_COLUMN = 800

const CARD = 'var(--card)'
const SURFACE = 'var(--surface)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const DANGER = 'var(--danger)'

// What each parsed attachment is called on its chip. The kind is decided
// by the file's CONTENT, not its name, so this is what tells the user
// whether their "results.csv" was read as logger data or as lab results.
const ATTACHMENT_KIND_LABEL = {
  sensor: 'Logger data',
  lab: 'Lab results',
  pdf: 'PDF',
  docx: 'Word report',
  text: 'Document',
}

// "Thinking" status treatment — the indicator shown while the agent is
// reasoning cycles through these phrases instead of a static "Thinking".
// Wording stays screening-safe (research / analyze / cross-reference —
// never "diagnose" or "determine"). Rendered in Bitcount Grid Single
// (a free pixel/dot-matrix Google Font, loaded in index.html), then the
// bold jasper stack as fallback. Color is the bright thinking-cyan that
// matches the neon brain.
const THINKING_CYAN = '#22E0F2'
const THINKING_FONT = "'Bitcount Grid Single', var(--font-jasper)"
const THINKING_PHRASES = [
  'Searching standards manifest',
  'Analyzing data',
  'Researching standards',
  'Cross-referencing thresholds',
  'Reviewing measurements',
  'Consulting the corpus',
  'Synthesizing findings',
]

// Serif face for AtmosFlow AI response copy — gives Jasper's answers
// an editorial, "considered" feel distinct from the sans UI chrome and
// the user's own (sans) messages. System serif first (New York on
// iOS/Mac, the platform AtmosFlow ships to), then broadly available
// fallbacks. Applied only to the assistant message container; code
// spans/blocks keep their monospace (Markdown sets that itself).
const RESPONSE_SERIF = "ui-serif, 'New York', Georgia, Cambria, 'Times New Roman', serif"

// Empty-state prompt row (Grok / ChatGPT capability-pill pattern): a
// horizontally scrolling row of short labels just above the composer.
// `label` is what the pill says. A pill either sends `text` as the
// first message, or opens the attach picker (`attach: true`) — lab
// results and photos are read from the file, so the question is the
// file. The verbs are the assessor's own jobs on the open assessment
// (draft, recommend, analyze), not sample IAQ trivia.
const SUGGESTIONS = [
  { label: 'Draft report',       text: 'Draft the report narrative for this assessment: the findings, what they indicate, and the limitations.' },
  { label: 'Recommendations',    text: 'What recommendations should this assessment make, and where should each one apply?' },
  { label: 'Analyze lab report', attach: true },
  { label: 'Analyze a photo',    attach: true },
]

// The one caption style on the surface: secondary ink, 13px.
const jasperCaption = { fontSize: 13, lineHeight: '18px', color: 'var(--sub)' }

/**
 * Phase-2 context awareness — derives a short list of chips from the
 * `context` payload that MobileApp already builds and ships to the
 * assistant API. No new wiring; this is a pure read of context so
 * the assistant sheet visually mirrors what the agent is told.
 *
 * Chips currently surfaced:
 *   - Facility (always when present) — anchors the panel to the
 *     active assessment.
 *   - Status — "Draft" vs "Finalized" (tone shifts to success on
 *     finalized so the user can spot when they've crossed the line).
 *   - Zone — current zone's name/id when the assessor is mid-walk
 *     (wizard / zones / sensors view).
 *   - Measurement signals — CO₂ / RH / PM₂.₅ from the current
 *     zone's intake fields, compared to the thresholds in
 *     src/constants/standards.js (which is the SAME source the
 *     engine reads). The engine itself stays sacred — we only read
 *     the published threshold table, not its scoring code paths.
 *
 * Output is an ordered array of { id, label, tone, icon } records.
 * Tone maps to a CSS class on the chip; 'accent' = cyan default,
 * 'warn' = elevated reading, 'success' = finalized.
 */
function buildContextChips(context) {
  if (!context || typeof context !== 'object') return []
  const out = []

  const active = context.active_assessment
  if (active && active.facility) {
    out.push({ id: 'facility', label: active.facility, tone: 'accent', icon: 'bldg' })
    if (active.status) {
      const finalized = /finalized/i.test(active.status)
      out.push({
        id: 'status',
        label: active.status,
        tone: finalized ? 'success' : 'accent',
        icon: finalized ? 'check' : 'draft',
      })
    }
  }

  const zone = context.current_zone
  // Zone chips only make sense in walk-through views — on the
  // dashboard or report, the assessor isn't looking AT a zone.
  const inWalk = context.view === 'wizard'
  if (inWalk && zone && typeof zone === 'object') {
    const zoneLabel = zone.n || zone.zid || (typeof context.zones_count === 'number' ? `Zone ${(context.current_zone_idx ?? 0) + 1}` : null)
    if (zoneLabel) out.push({ id: 'zone', label: zoneLabel, tone: 'accent', icon: 'location' })

    // Measurement signals — only added when a numeric reading is
    // actually present AND it crosses a published threshold. We
    // never invent a chip from a missing value.
    const co2 = Number(zone.co2)
    if (Number.isFinite(co2)) {
      const act = STD?.co2?.act ?? 1500
      const con = STD?.co2?.con ?? 1000
      if (co2 >= act)      out.push({ id: 'co2',  label: 'CO₂ action level', tone: 'warn', icon: 'wind' })
      else if (co2 >= con) out.push({ id: 'co2',  label: 'CO₂ elevated',     tone: 'warn', icon: 'wind' })
    }
    const rh = Number(zone.rh)
    if (Number.isFinite(rh)) {
      if (rh >= 60)      out.push({ id: 'rh', label: 'Humidity high', tone: 'warn', icon: 'droplet' })
      else if (rh <= 30) out.push({ id: 'rh', label: 'Humidity low',  tone: 'warn', icon: 'droplet' })
    }
    const pm = Number(zone.pm)
    if (Number.isFinite(pm) && pm >= 12) {
      out.push({ id: 'pm', label: 'PM₂.₅ elevated', tone: 'warn', icon: 'cloud' })
    }
    // No TVOC chip, deliberately (2026-08). One fired at >= 500 µg/m³ and read
    // "TVOC elevated" — Mølhave's advisory tier, rendered as a warning badge
    // beside chips backed by real limits. Elevated relative to what is the
    // question the platform no longer answers for TVOC; the value is shown in
    // the readings, unlabelled.
  }

  return out
}

// Exported for tests (render assertion on the styled trailing disclaimer).
export function MessageBubble({
  role, content, photos, files,
  // Feedback wiring — only populated for assistant turns. dbId is
  // the field_assistant_messages row id, threaded from the SSE
  // meta event's assistant_message_id. submitFeedback comes from
  // useFieldAssistant. `streaming` is true while tokens are still
  // arriving for THIS turn — the feedback row stays hidden until
  // the response settles so users don't rate a half-formed answer.
  dbId, feedbackRating, submitFeedback, streaming,
}) {
  const isUser = role === 'user'
  // User stays in the right-aligned cyan bubble (per request — no
  // change to the question state). Assistant goes edge-to-edge,
  // no bubble, no border, no fill — same pattern as Claude.ai /
  // ChatGPT where the response IS the page.
  // The user's turn is a neutral capsule on the right (Grok / iMessage
  // received-bubble tone): a step of the surface ladder with a hairline,
  // no accent — the accent is for controls, not for what the assessor
  // typed.
  const userStyle = {
    maxWidth: '85%',
    padding: '10px 16px',
    borderRadius: 20,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    color: TEXT,
    fontSize: 15,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }
  const assistantStyle = {
    width: '100%',
    padding: '2px 2px 4px',
    color: TEXT,
    // Serif for the response body (see RESPONSE_SERIF). Cascades into
    // the <Markdown> output via inherit; code keeps its own monospace.
    fontFamily: RESPONSE_SERIF,
    fontSize: 15,
    lineHeight: 1.65,
    // No whiteSpace:'pre-wrap' — the assistant message renders through
    // <Markdown>, which owns block layout (and honors single newlines
    // via remark-breaks). User messages keep pre-wrap (userStyle).
    wordBreak: 'break-word',
    // No background, no border, no radius — flow with the sheet
    // surface so the response feels like the canvas, not a card.
  }
  // The trailing AI-assistance disclaimer renders smaller + italic +
  // muted so it reads as a footnote label, distinct from the answer body.
  const disclaimerStyle = {
    marginTop: 10,
    fontSize: 12,
    fontStyle: 'italic',
    color: SUB,
    lineHeight: 1.4,
    letterSpacing: '0.1px',
  }
  // Peel the closing disclaimer line off assistant content so it can be
  // styled separately. Body still renders through <Markdown>; the stored
  // `content` is untouched, so Copy / Share still carry the plain line.
  const { body, disclaimer } = (!isUser && typeof content === 'string')
    ? splitTrailingDisclaimer(content, AI_DISCLAIMER_LINE)
    : { body: content, disclaimer: null }
  return (
    <div className="jasper-msg-in" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      // Assistant text gets more breathing room below it so the
      // next turn doesn't crowd. User bubbles keep the tighter gap
      // the existing transcript rhythm uses.
      marginBottom: isUser ? 12 : 18,
    }}>
      <div style={isUser ? userStyle : assistantStyle}>
        {/* Assistant responses render markdown (headings/bullets/tables).
            User messages stay plain — they're what the assessor typed. */}
        {!isUser && typeof content === 'string'
          ? <>
              {body && <Markdown>{body}</Markdown>}
              {disclaimer && <div style={disclaimerStyle}>{disclaimer}</div>}
            </>
          : content}
        {isUser && ((Array.isArray(photos) && photos.length > 0) || (Array.isArray(files) && files.length > 0)) && (
          <div style={{
            marginTop: 6, display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: SUB, fontFamily: 'var(--font-mono)', opacity: 0.8,
          }}>
            <I n="paperclip" s={11} c={SUB} w={1.6} />
            <span>
              {[
                photos && photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : null,
                // Named rather than counted: which file was asked about
                // is the thing worth being able to see later.
                ...(files || []).map((f) => f.name),
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
      </div>
      {/* Action cluster under a settled assistant turn. Copy / Share
          only need the response text, so they appear whenever content
          exists; the feedback thumbs additionally require the persisted
          row id (dbId) + submitFeedback wiring. */}
      {!isUser && !streaming && typeof content === 'string' && content.trim() && (
        <div style={{
          marginTop: 6, width: '100%',
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
        }}>
          <JasperMessageActions text={content} />
          {dbId && submitFeedback && (
            <JasperFeedbackRow
              dbId={dbId}
              rating={feedbackRating || null}
              submitFeedback={submitFeedback}
            />
          )}
        </div>
      )}
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
  if (name === 'assess_investigation') {
    return 'Reviewing the investigation…'
  }
  if (name === 'lookup_exposure_limit' || name === 'lookup_sampling_method' || name === 'lookup_health_effects') {
    const a = typeof input.analyte === 'string' ? input.analyte.slice(0, 40) : ''
    return a ? `Looking up ${a}…` : 'Looking up the analyte…'
  }
  if (name === 'search_standards_corpus' || name === 'search_iaq_corpus' || name === 'search_corpus' || name === 'lookup_corpus') {
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
  // Cycle the "thinking" phrases on a steady cadence. The hook runs on
  // every render (before the tool-status early-return below) so hook
  // order stays stable whether or not a tool is active.
  const [phraseIdx, setPhraseIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setPhraseIdx(i => (i + 1) % THINKING_PHRASES.length), 1900)
    return () => clearInterval(id)
  }, [])
  const status = describeTool(tool)
  // Both states are bubble-less — no background, no border — so the
  // indicator flows on the sheet canvas instead of jumping into a card.
  // Tool-running keeps a small spinner + status line ("Searching…");
  // the plain "thinking" state is the neon-cyan brain that flickers
  // while the system reasons.
  if (status) {
    return (
      <div
        className="jasper-msg-in"
        role="status"
        style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, padding: '2px 2px' }}>
        {/* Small inline spinner. CSS rotation only — no JS. */}
        <span
          aria-hidden="true"
          style={{
            width: 13, height: 13, borderRadius: '50%',
            border: `1.5px solid ${BORDER}`,
            borderTopColor: ACCENT,
            animation: 'faSpin 0.9s linear infinite',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, color: THINKING_CYAN, fontFamily: THINKING_FONT, fontWeight: 700, lineHeight: 1.4, letterSpacing: '0.2px' }}>
          {status}
        </span>
      </div>
    )
  }
  // Bubble-less neon brain. NEON_CYAN is hard-coded (not the themeable
  // --accent) so the glow reads as an intentional "thinking" signal in
  // both light and dark themes. The flicker + glow pulse live in
  // faBrainFlicker / faBrainGlow keyframes at the bottom of this file;
  // Neon runs THROUGH the brain's grooves: a dim base outline sits
  // underneath, and a bright cyan layer traces each stroke on in
  // sequence (stroke-dashoffset), holds fully lit, then loops. The
  // brain therefore wakes from dim → fully energized continuously
  // while the system thinks. pathLength="100" normalizes every path
  // so they trace at a uniform rate regardless of true length.
  const NEON_CYAN = '#22E0F2'
  const BRAIN_PATHS = [
    'M12 18V5',
    'M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4',
    'M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5',
    'M17.997 5.125a4 4 0 0 1 2.526 5.77',
    'M18 18a4 4 0 0 0 2-7.464',
    'M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517',
    'M6 18a4 4 0 0 1-2-7.464',
    'M6.003 5.125a4 4 0 0 0-2.526 5.77',
  ]
  // One full run-through, staggered across the paths.
  const TRACE_DURATION = 2.6
  const TRACE_STAGGER = 0.12
  return (
    <div
      className="jasper-msg-in"
      role="status"
      aria-label="Thinking"
      style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, padding: '2px 2px' }}>
      <span
        aria-hidden="true"
        className="jasper-brain"
        style={{
          display: 'inline-flex',
          // Tight glow that hugs the strokes. A wider blur blooms into
          // the gaps between grooves and reads as a tinted box around
          // the icon; keeping it to ~1.5px traces the neon edge only,
          // so just the brain shows.
          filter: `drop-shadow(0 0 1.5px ${NEON_CYAN})`,
        }}>
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke={NEON_CYAN}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round">
          {/* Dim base layer — the unlit neon tube. Always faintly
              visible so the brain reads as "off / idle" before the
              run-through energizes it. */}
          <g stroke={NEON_CYAN} opacity={0.22}>
            {BRAIN_PATHS.map((d, i) => <path key={`base-${i}`} d={d} />)}
          </g>
          {/* Bright trace layer — neon races through each groove. */}
          <g className="jasper-brain-trace">
            {BRAIN_PATHS.map((d, i) => (
              <path
                key={`trace-${i}`}
                d={d}
                pathLength="100"
                style={{
                  strokeDasharray: 100,
                  strokeDashoffset: 100,
                  animation: `jasperBrainTrace ${TRACE_DURATION}s ease-in-out infinite`,
                  animationDelay: `${i * TRACE_STAGGER}s`,
                }}
              />
            ))}
          </g>
        </svg>
      </span>
      <span
        key={phraseIdx}
        aria-hidden="true"
        style={{ fontSize: 12, color: THINKING_CYAN, fontFamily: THINKING_FONT, fontWeight: 700, lineHeight: 1.4, letterSpacing: '0.2px', animation: 'fadeIn .35s ease' }}>
        {THINKING_PHRASES[phraseIdx]}…
      </span>
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
        {/* Brain mark omitted here — the sheet header already shows it,
            so repeating it on the welcome line read as redundant. */}
        <div style={{ fontSize: 15, color: TEXT, lineHeight: 1.45, fontWeight: 600 }}>
          <span role="img" aria-label="waving hand">👋</span> Welcome to AtmosFlow AI, your indoor air quality assistant.
        </div>
      </div>

      <ul style={{
        listStyle: 'disc', paddingLeft: 20, margin: '0 0 16px',
        color: SUB, fontSize: 13, lineHeight: 1.55,
      }}>
        <li className="jasper-stagger" style={{ marginBottom: 10, ...reveal(500) }}>
          I'm an AI screening assistant. I won't make compliance, causation,
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
 * Human-readable stage labels. The engine's stage names are precise but
 * written for code; these are what an assessor reads on the card.
 */
const INVESTIGATION_STAGE_LABEL = {
  no_assessment: 'No assessment loaded',
  no_active_differential: 'Nothing to test',
  screening: 'Screening',
  differential: 'Two explanations open',
  converging: 'Narrowing',
  concluded: 'Settled',
}

const HYPOTHESIS_STATUS_LABEL = {
  supported_by_measurement: 'Measurements support it',
  mixed_measurement_support: 'Measurements are split',
  untested: 'Not measured yet',
  not_supported_by_measurement: 'Measured, nothing flagged',
}

/**
 * Inline investigation card — rendered when Jasper has called
 * assess_investigation. It shows the engine's own reading: where the
 * investigation stands, which explanations are live and how the
 * measurements bear on each, and the one next step.
 *
 * Why a card and not just prose: the model writes the conversation, but
 * the differentials and their status are the ENGINE's, and a card
 * rendered straight from the tool payload cannot drift from them the way
 * a paraphrase can. Everything here is read from the event — nothing is
 * re-derived, re-ordered, or re-worded on the client.
 */
function InvestigationCard({ state }) {
  const hyps = Array.isArray(state.hypotheses) ? state.hypotheses : []
  const next = state.next_step || null
  const stageLabel = INVESTIGATION_STAGE_LABEL[state.stage] || 'Investigation'
  return (
    <div className="jasper-msg-in" style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        maxWidth: '90%',
        padding: '12px 14px',
        borderRadius: 14,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
      }}>
        <div style={{
          fontSize: 10, color: 'var(--accent)', fontWeight: 700,
          letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4,
        }}>
          Investigation · {stageLabel}
        </div>
        {state.rationale && (
          <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5, marginBottom: hyps.length ? 10 : 0 }}>
            {state.rationale}
          </div>
        )}

        {hyps.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: next ? 10 : 0 }}>
            {hyps.map((h) => (
              <div
                key={h.id}
                style={{
                  padding: '7px 9px',
                  borderRadius: 8,
                  background: CARD,
                  border: h.leading
                    ? '1px solid color-mix(in srgb, var(--accent) 36%, transparent)'
                    : `1px solid ${BORDER}`,
                }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.35 }}>
                    {h.name}
                  </span>
                  {h.leading && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.4px',
                      textTransform: 'uppercase', color: 'var(--accent)',
                    }}>
                      Leading
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: DIM, lineHeight: 1.45, marginTop: 2 }}>
                  {HYPOTHESIS_STATUS_LABEL[h.status] || h.status}
                </div>
              </div>
            ))}
          </div>
        )}

        {next && (
          <div style={{
            padding: '9px 10px', borderRadius: 8,
            background: mix('accent', 6),
            border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.4px',
              textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 3,
            }}>
              Next step
            </div>
            <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.45 }}>{next.action}</div>
            {next.why && (
              <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, marginTop: 4 }}>{next.why}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
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
  const isRecord = action?.type === 'record_zone_observation'
  const glyph =
    action?.type === 'navigate'
      ? 'M9 18l6-6-6-6' // chevron-right
      : isRecord
        ? 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' // clipboard-check
        : 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' // pencil-square
  return (
    <div className="jasper-msg-in" style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
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
              {isAccepted
                ? (isRecord ? 'Recorded' : 'Applied')
                : status === 'rejected' ? 'Rejected'
                  : isRecord ? 'Record this observation' : 'Proposed action'}
            </div>
            <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.4, fontWeight: 600 }}>
              {summary || (action?.type === 'navigate' ? 'Open a screen' : isRecord ? 'Record an observation' : 'Add a note')}
            </div>
            {/* The write is shown field-by-value rather than as prose. It
                is going into the assessor's evidence record, and they are
                the one signing it — what lands has to be legible before
                they tap, not paraphrased into a sentence. */}
            {isRecord && action.field_label && (
              <div style={{
                fontSize: 12, lineHeight: 1.5, marginTop: 6,
                padding: '8px 10px', background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 8,
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ color: DIM }}>{action.field_label}</span>
                  <span style={{ color: TEXT, fontWeight: 600 }}>{action.display_value}</span>
                </div>
                <div style={{ color: DIM, marginTop: 4, fontSize: 11 }}>
                  {action.scope === 'building'
                    ? 'Applies to the whole building'
                    : `Applies to ${action.zone_label || 'the zone you have open'}`}
                </div>
              </div>
            )}
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
              {isRecord ? "Don't record" : 'Reject'}
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
              {isRecord ? 'Record' : 'Apply'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * DownloadCard — inline affordance for a rendered DOCX deliverable.
 * Appears after Jasper invokes the generate_report tool. The base64
 * payload lives in client memory only (never persisted to the
 * messages row); clicking Download materializes it as a Blob and
 * triggers a browser download.
 */
function DownloadCard({ report, onDownload }) {
  const downloaded = report.status === 'downloaded'
  const rendering = report.status === 'rendering'
  const errored   = report.status === 'error'
  const ready     = report.status === 'ready'
  const handle = () => {
    try {
      const byteString = atob(report.base64)
      const bytes = new Uint8Array(byteString.length)
      for (let i = 0; i < byteString.length; i += 1) bytes[i] = byteString.charCodeAt(i)
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = report.file_name || 'Report.docx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      onDownload?.(report.id)
    } catch (err) {
      console.warn('[FieldAssistant] download failed:', err)
    }
  }
  const tokensSummary = (() => {
    const filled = (report.tokens_filled || []).length
    const empty = (report.tokens_empty || []).length
    const unknown = (report.tokens_unknown || []).length
    if (!filled && !empty && !unknown) return ''
    const parts = [`${filled} filled`]
    if (empty) parts.push(`${empty} blank`)
    if (unknown) parts.push(`${unknown} unknown`)
    return parts.join(' · ')
  })()
  const eyebrow = downloaded ? 'Downloaded'
    : errored ? 'Render failed'
    : rendering ? 'Preparing report…'
    : 'Report ready'
  return (
    <div className="jasper-msg-in" style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        maxWidth: '90%',
        padding: '12px 14px',
        borderRadius: 14,
        background: downloaded ? mix('accent', 6) : SURFACE,
        border: downloaded
          ? `1px solid ${BORDER}`
          : errored
            ? `1px solid ${mix('danger', 25)}`
            : `1px solid color-mix(in srgb, var(--accent) 36%, transparent)`,
        transition: 'background 0.15s, border-color 0.15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: ready || errored ? 10 : 0 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            background: downloaded
              ? 'var(--accent-fill)'
              : errored
                ? mix('danger', 12)
                : 'color-mix(in srgb, var(--accent) 12%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={downloaded ? 'var(--on-accent-fill)' : errored ? DANGER : 'var(--accent)'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {downloaded
                ? <polyline points="20 6 9 17 4 12" />
                : errored
                  ? <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
                  : <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>}
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, color: errored ? DANGER : 'var(--accent)', fontWeight: 700,
              letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2,
            }}>
              {eyebrow}
            </div>
            <div style={{
              fontSize: 14, color: TEXT, lineHeight: 1.4, fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {report.file_name}
            </div>
            {errored && (
              <div style={{ fontSize: 11, color: DANGER, marginTop: 4 }}>
                {report.error || 'Render failed.'}
              </div>
            )}
            {!errored && (
              <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>
                {report.template_name ? `${report.template_name}${tokensSummary ? ' · ' : ''}` : ''}{tokensSummary}
              </div>
            )}
          </div>
        </div>
        {ready && (
          <button onClick={handle} style={{
            width: '100%', padding: '8px 12px',
            background: 'var(--accent-fill)', border: 'none',
            borderRadius: 8, color: 'var(--on-accent-fill)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', minHeight: 36, letterSpacing: '-0.1px',
            WebkitTapHighlightColor: 'transparent',
          }}>
            Download
          </button>
        )}
      </div>
    </div>
  )
}

export default function FieldAssistant({ onClose, context, onNavigate, initialMessage, onAction, desktop = false, leftInset = 0, newChatNonce = 0 }) {
  const {
    messages,
    sending,
    error,
    quota,
    attachedPhotos,
    conversationId,
    activeTool,
    proposedActions,
    renderedReports,
    investigations,
    sendMessage,
    stop,
    attachPhoto,
    removePhoto,
    attachments,
    attachAny,
    removeAttachment,
    pendingResize,
    confirmResize,
    cancelResize,
    listConversations,
    loadConversation,
    deleteConversation,
    submitFeedback,
    newConversation,
    markActionAccepted,
    markActionRejected,
    markReportDownloaded,
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
  // Inline two-step delete: tapping the trash icon arms a row for
  // ~4s; a second tap (on the matching Delete button) commits.
  // Only one row can be armed at a time so the affordance is
  // unambiguous.
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  // Failure copy for the history panel (a conversation that could not be
  // deleted). Local to the panel: the chat-level `error` from the hook is
  // about the stream, and this component never owned a setter for it —
  // the old `setError(...)` call here was a ReferenceError at runtime.
  const [historyError, setHistoryError] = useState(null)
  const pendingDeleteTimerRef = useRef(null)
  // Context-switch override. When the user picks a different
  // assessment via the facility-chip picker, this object replaces
  // the prop-derived active_assessment in BOTH the chip strip and
  // the API context payload. Zone-derived chips are dropped (we
  // don't have that assessment's zones loaded into app state).
  // null = follow whatever the app is currently showing.
  const [overrideAssessment, setOverrideAssessment] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerIndex, setPickerIndex] = useState({ reports: [], drafts: [] })
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

  // Effective context — the prop-derived context layered with any
  // user-picked override. Used by BOTH the chip strip and the
  // sendMessage payload so what the assessor sees in the chip row
  // is exactly what Jasper is told. When an override is active we
  // drop current_zone so zone-derived measurement chips don't
  // misrepresent a different assessment's readings.
  const effectiveContext = useMemo(() => {
    if (!overrideAssessment) return context
    return {
      ...(context || {}),
      active_assessment: {
        facility: overrideAssessment.facility,
        status: overrideAssessment.status,
        id: overrideAssessment.id,
      },
      current_zone: null,
      // Tag the override on the payload so the API/agent prompt
      // can distinguish "the user is mid-walk on this report" from
      // "the user asked about a different report from the chat
      // sheet". Backend doesn't need to do anything with this
      // today; the field is informational.
      context_override: { source: overrideAssessment.source || 'picker' },
    }
  }, [context, overrideAssessment])
  const contextChips = useMemo(() => buildContextChips(effectiveContext), [effectiveContext])
  // The facility chip is the user's entry point to switch which
  // assessment Jasper is talking about; it lives in the composer. The
  // rest are read-only signals shown above the transcript.
  const facilityChip = contextChips.find((c) => c.id === 'facility') || null
  const signalChips = contextChips.filter((c) => c.id !== 'facility')
  // Nothing said yet: the open canvas with the watermark and prompt row.
  const isEmptyCanvas = introAccepted && messages.length === 0 && !sending
  // Horizontal padding that centers a DESKTOP_COLUMN-wide column inside
  // the full-width scroll panels, so the scrollbar stays at the page edge
  // (ChatGPT / Claude) while the text sits in a reading column.
  const colPad = desktop ? `max(2px, calc(50% - ${DESKTOP_COLUMN / 2}px))` : '2px'

  // Every intake route — paperclip, drop, paste — funnels through the
  // same call, so a CSV behaves identically however it arrived.
  const takeFiles = useCallback(
    async (files) => {
      for (const file of files) {
        if (!file) continue
        // Sequential rather than parallel: a photo may open the resize
        // prompt, and two prompts racing each other would lose one.
        await attachAny(file)
      }
    },
    [attachAny],
  )

  const onPickPhotos = async (e) => {
    const files = Array.from(e.target.files || [])
    // Reset the input so re-picking the same file fires onChange again.
    if (e.target) e.target.value = ''
    await takeFiles(files)
  }

  // ── Drag and drop ────────────────────────────────────────────────
  // Counted rather than boolean: dragging across a child element fires
  // dragleave on the parent, so a naive flag flickers the overlay off
  // while the pointer is still inside the sheet.
  const [dragDepth, setDragDepth] = useState(0)
  const dragging = dragDepth > 0 && introAccepted && !sending
  const attachSlotsFull =
    attachedPhotos.length >= MAX_PHOTOS_PER_REQUEST &&
    attachments.length >= MAX_ATTACHMENTS_PER_REQUEST

  const hasFiles = (e) => {
    const dt = e.dataTransfer
    if (!dt) return false
    if (dt.types && Array.from(dt.types).includes('Files')) return true
    return !!(dt.files && dt.files.length)
  }

  const onDragEnter = useCallback((e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDragDepth((d) => d + 1)
  }, [])

  const onDragOver = useCallback((e) => {
    if (!hasFiles(e)) return
    // Without preventDefault the browser navigates to the dropped file.
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDragLeave = useCallback((e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDragDepth((d) => Math.max(0, d - 1))
  }, [])

  const onDrop = useCallback(
    async (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragDepth(0)
      if (!introAccepted || sending) return
      await takeFiles(Array.from(e.dataTransfer.files || []))
    },
    [introAccepted, sending, takeFiles],
  )

  // ── Clipboard paste ──────────────────────────────────────────────
  // Screenshotting a psychrometric chart and pressing Cmd+V is the
  // fastest path there is; it should not require finding the paperclip.
  const onPaste = useCallback(
    async (e) => {
      const items = e.clipboardData && e.clipboardData.files
      if (!items || !items.length) return
      const files = Array.from(items)
      if (!files.length) return
      // Only swallow the event when we actually take something, so
      // pasting text into the composer still works normally.
      e.preventDefault()
      await takeFiles(files)
    },
    [takeFiles],
  )

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
  // Desktop rail "New chat" while the page is already open: start a fresh
  // conversation (the label promises one). The ref starts at the mounted
  // value so a bump that happened while the page was closed is not
  // replayed on mount — a fresh mount is already a fresh conversation.
  const newChatRef = useRef(newChatNonce)
  useEffect(() => {
    if (newChatNonce === newChatRef.current) return
    newChatRef.current = newChatNonce
    if (messages.length > 0 || sending) newConversation()
    setHistoryOpen(false)
    setPickerOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newChatNonce])
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
    sendMessage(initialMessage, effectiveContext)
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
      // Clear any armed-delete timer so unmount can't fire setState
      // on a stale component.
      if (pendingDeleteTimerRef.current) {
        clearTimeout(pendingDeleteTimerRef.current)
        pendingDeleteTimerRef.current = null
      }
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
    await sendMessage(text, effectiveContext)
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

  // Open the assessment picker. Loads the local index lazily so a
  // sheet open doesn't pay the storage read cost upfront.
  const openAssessmentPicker = async () => {
    setPickerOpen(true)
    setPickerLoading(true)
    try {
      const idx = await STO.getIndex()
      setPickerIndex({
        reports: Array.isArray(idx?.reports) ? idx.reports : [],
        drafts:  Array.isArray(idx?.drafts)  ? idx.drafts  : [],
      })
    } catch {
      setPickerIndex({ reports: [], drafts: [] })
    } finally {
      setPickerLoading(false)
    }
  }
  const pickAssessment = (entry, kind) => {
    setOverrideAssessment({
      id: entry.id,
      facility: entry.facility || 'Untitled',
      status: kind === 'report' ? 'Finalized report' : 'Draft assessment',
      source: 'picker',
    })
    setPickerOpen(false)
  }
  const clearOverride = () => {
    setOverrideAssessment(null)
    setPickerOpen(false)
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
          both screen edges).

          Phase-3 depth: scrim drops from solid #000DD to a softer
          rgba 0.55 + 8px backdrop blur, so the page behind reads
          as a defocused hint of the assessment instead of a black
          void. Matches the iOS / macOS sheet pattern (Messages,
          Mail, ChatGPT iOS) and reinforces the sheet's elevation. */}
      {/* No scrim on desktop: the page sits beside the rail, and the rail
          stays usable (clicking a destination there closes the chat). */}
      {!desktop && (
      <div
        onClick={handleBackdropClick}
        className="jasper-backdrop"
        style={{
          position: 'fixed', inset: 0,
          // The sheet is a page now (full height on a phone), so the
          // scrim only shows beside the 640px column on wide screens.
          // Plain dim, no blur — nothing to defocus.
          background: 'rgba(0, 0, 0, 0.55)',
          zIndex: 260,
          animation: 'jasperBackdropIn 280ms ease-out both',
        }}
      />
      )}
      <div
        onClick={(e) => e.stopPropagation()}
        // Drop and paste are bound to the whole sheet, not the composer:
        // aiming at a 40px textarea while holding a file is fiddly, and
        // anywhere inside the chat is an unambiguous target.
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPaste={onPaste}
        className="jasper-sheet"
        style={{
          position: 'fixed',
          // Sheet-as-page: pinned to every edge of the viewport, the way
          // the app's own fixed header is (top:0 + safe-area padding),
          // rather than a height computed from the viewport unit and
          // anchored at the bottom — that arithmetic put the header
          // under the iPhone status bar in Safari. The padding, not the
          // position, keeps the wordmark clear of the notch / Dynamic
          // Island; with no inset it is a plain 10px.
          top: 0,
          bottom: 0,
          left: 'env(safe-area-inset-left, 0px)',
          right: 'env(safe-area-inset-right, 0px)',
          zIndex: 261,
          maxWidth: 640,
          marginLeft: 'auto',
          marginRight: 'auto',
          // Fabrica is the chat's typeface. Set once on the sheet; every
          // descendant uses fontFamily:'inherit', so the whole AI surface
          // (messages, composer, intro, action rows) picks it up. Falls
          // back to the Inter stack via --font-jasper until the licensed
          // Fabrica files are dropped into public/fonts/.
          fontFamily: 'var(--font-jasper)',
          // Atmospheric surface — token-driven (jasper-tokens.js).
          // The same gradient is available to any future AI surface.
          // The page tone, not the card tone: on a phone the sheet IS the
          // screen now, and the composer / pills sit on it as surfaces.
          background: jasperAtmosphere('var(--bg)'),
          border: `1px solid ${BORDER}`, borderBottom: 'none',
          borderRadius: 0,
          padding: '10px 16px',
          paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          // Motion + depth — token-driven so the iOS spring + sheet
          // shadow are tuned in one place.
          animation: `jasperSheetIn ${JASPER_DURATION.sheet}ms ${JASPER_SPRING} both`,
          boxShadow: JASPER_SHEET_SHADOW,
          display: 'flex', flexDirection: 'column',
          boxSizing: 'border-box',
          overflow: 'hidden',
          ...(desktop ? desktopPageStyle(leftInset) : null),
        }}>
        {/* Drop target overlay. Covers the sheet while a file is over
            it so there is no question about where to let go.
            pointerEvents:none — the overlay must not intercept the
            drop it is advertising, or dragleave fires on the element
            underneath and the overlay flickers. */}
        {dragging && (
          <div
            data-testid="drop-overlay"
            style={{
              position: 'absolute', inset: 8,
              zIndex: 12, pointerEvents: 'none',
              borderRadius: 16,
              border: `2px dashed ${ACCENT}`,
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
          >
            <I n="upload" s={26} c={ACCENT} w={1.8} />
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Drop to attach</div>
            <div style={{ fontSize: 11.5, color: SUB, textAlign: 'center', padding: '0 24px', lineHeight: 1.45 }}>
              Photos, reports (DOCX/PDF), logger exports (CSV/XLSX), or lab results
            </div>
          </div>
        )}

        {/* Header — a wordmark on the left (mark + name, no subtitle:
            the page is the product now, the way Grok's header is just
            "Grok"), and the three controls on the right as round ghost
            buttons. No drag handle: a page is dismissed with its close
            control, not dragged away. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
            <JasperBrainIcon size={26} />
            <div style={{ fontSize: 19, fontWeight: 700, color: TEXT, lineHeight: 1.2, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>AtmosFlow AI</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {/* New chat — only meaningful when the current transcript
                has at least one turn, otherwise the button is a no-op
                that just re-resets empty state. Hidden in that case
                so the header stays uncluttered for first-time users. */}
            {messages.length > 0 && !historyOpen && (
              <button
                onClick={() => { newConversation(); setHistoryOpen(false) }}
                aria-label="Start a new conversation"
                title="New chat"
                style={HEADER_BTN(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
              style={HEADER_BTN(historyOpen)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
            </button>
            {/* Close — a filled circle so it reads as the dismiss control
                beside the ghost history / new-chat buttons. A crisp
                stroked X (the "×" text glyph renders inconsistently). */}
            <button
              onClick={onClose}
              aria-label="Close AtmosFlow AI"
              title="Close"
              style={{ ...HEADER_BTN(false), background: SURFACE, color: TEXT }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Phase-2 context chip strip — replaces the single
            facility/status pill with a richer row that reflects
            what's actually in the context payload the agent
            receives: facility, draft/finalized status, current
            zone, and measurement signals from that zone (CO₂
            elevated, humidity high, etc.). The user can see at a
            glance what Jasper knows about their current situation.
            Hidden while the history panel is open. */}
        {/* What the AI knows about the situation, as one quiet line —
            "Draft assessment · Room 101 · CO₂ elevated" — not a row of
            tinted chips. The facility itself is the chip in the composer,
            the one the user acts on. A warn-toned signal keeps its color;
            the rest is secondary ink. */}
        {!historyOpen && !pickerOpen && signalChips.length > 0 && (
          <div aria-label="AtmosFlow AI context" style={{ ...jasperCaption, marginBottom: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {signalChips.map((c, i) => (
              <span key={c.id}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <span style={c.tone === 'warn' ? { color: 'var(--warn)' } : undefined}>{c.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* History panel — replaces the chat transcript when open.
            Renders past conversations grouped by recency. Empty
            conversations (zero messages) are hidden because they're
            usually accidental sheet opens that never produced a
            turn. Tapping a row resumes that conversation and snaps
            back to the chat view. */}
        {historyOpen && (
          <div style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            padding: `8px ${colPad}`, minHeight: 200,
            minWidth: 0, boxSizing: 'border-box',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: SUB, letterSpacing: '0.3px',
              textTransform: 'uppercase', padding: '6px 4px 10px',
            }}>
              Past conversations
            </div>
            {historyError && (
              <div role="alert" style={{ padding: '8px 4px 12px', color: DANGER, fontSize: 12, lineHeight: 1.5 }}>
                {historyError}
              </div>
            )}
            {historyLoading && (
              <div style={{ padding: 20, textAlign: 'center', color: SUB, fontSize: 12 }}>
                Loading…
              </div>
            )}
            {!historyLoading && historyList.filter((c) => (c.message_count || 0) > 0).length === 0 && (
              <div style={{ padding: '20px 4px', color: SUB, fontSize: 13, lineHeight: 1.6 }}>
                No past conversations yet. When you chat with AtmosFlow AI, your turns are saved here automatically so you can revisit or continue them later.
              </div>
            )}
            {!historyLoading && historyList
              .filter((c) => (c.message_count || 0) > 0)
              .map((c) => {
                const isCurrent = c.id === conversationId
                const isPendingDelete = c.id === pendingDeleteId
                const isDeleting = c.id === deletingId
                const updated = c.updated_at ? new Date(c.updated_at) : null
                const dateLabel = updated
                  ? updated.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                  : ''

                const armDelete = () => {
                  // Cancel any prior armed row, then arm this one
                  // with a 4s auto-disarm so a forgotten tap doesn't
                  // sit there indefinitely.
                  if (pendingDeleteTimerRef.current) {
                    clearTimeout(pendingDeleteTimerRef.current)
                    pendingDeleteTimerRef.current = null
                  }
                  setPendingDeleteId(c.id)
                  pendingDeleteTimerRef.current = setTimeout(() => {
                    setPendingDeleteId((cur) => (cur === c.id ? null : cur))
                    pendingDeleteTimerRef.current = null
                  }, 4000)
                }
                const cancelDelete = () => {
                  if (pendingDeleteTimerRef.current) {
                    clearTimeout(pendingDeleteTimerRef.current)
                    pendingDeleteTimerRef.current = null
                  }
                  setPendingDeleteId(null)
                }
                const commitDelete = async () => {
                  if (pendingDeleteTimerRef.current) {
                    clearTimeout(pendingDeleteTimerRef.current)
                    pendingDeleteTimerRef.current = null
                  }
                  setDeletingId(c.id)
                  setPendingDeleteId(null)
                  const ok = await deleteConversation(c.id)
                  setDeletingId(null)
                  if (!ok) {
                    setHistoryError('Could not delete that conversation. Please try again.')
                    return
                  }
                  setHistoryError(null)
                  // Optimistically prune from the in-memory list.
                  setHistoryList((list) => list.filter((row) => row.id !== c.id))
                  // If we just deleted the conversation the chat
                  // view is pointed at, drop it so the next send
                  // starts a fresh row instead of trying to append
                  // to a missing one.
                  if (isCurrent) newConversation()
                }

                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex', alignItems: 'stretch', gap: 0,
                      background: isCurrent ? `${ACCENT}10` : 'transparent',
                      border: `1px solid ${isCurrent ? ACCENT + '40' : BORDER}`,
                      borderRadius: 10, marginBottom: 8,
                      overflow: 'hidden',
                      opacity: isDeleting ? 0.55 : 1,
                      transition: 'opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease',
                    }}>
                    {isPendingDelete ? (
                      // Inline confirmation row — the original
                      // title/metadata is hidden so the action is
                      // unambiguous. "Cancel" returns the row to
                      // its normal state; "Delete" commits.
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        flex: 1, padding: '10px 12px',
                      }}>
                        <span style={{ flex: 1, fontSize: 13, color: TEXT, lineHeight: 1.35 }}>
                          Delete this conversation?
                        </span>
                        <button
                          type="button"
                          onClick={cancelDelete}
                          style={{
                            padding: '6px 12px', borderRadius: 8,
                            background: 'transparent', border: `1px solid ${BORDER}`,
                            color: SUB, fontSize: 12, fontWeight: 600,
                            fontFamily: 'inherit', cursor: 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                          }}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={commitDelete}
                          style={{
                            padding: '6px 12px', borderRadius: 8,
                            background: mix('danger', 18),
                            border: `1px solid ${mix('danger', 35)}`,
                            color: DANGER, fontSize: 12, fontWeight: 700,
                            fontFamily: 'inherit', cursor: 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                          }}>
                          Delete
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={async () => {
                            if (isDeleting) return
                            const ok = await loadConversation(c.id)
                            if (ok) setHistoryOpen(false)
                          }}
                          style={{
                            flex: 1, display: 'block', textAlign: 'left',
                            padding: '12px 14px',
                            background: 'transparent', border: 'none',
                            cursor: isDeleting ? 'wait' : 'pointer',
                            fontFamily: 'inherit', color: TEXT,
                            WebkitTapHighlightColor: 'transparent',
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
                        <button
                          type="button"
                          onClick={armDelete}
                          disabled={isDeleting}
                          aria-label={`Delete ${c.title || 'conversation'}`}
                          title="Delete conversation"
                          style={{
                            flexShrink: 0,
                            width: 44,
                            background: 'transparent', border: 'none',
                            borderLeft: `1px solid ${BORDER}`,
                            cursor: isDeleting ? 'wait' : 'pointer',
                            color: DIM,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'inherit',
                            WebkitTapHighlightColor: 'transparent',
                            transition: 'color 0.15s ease, background 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (isDeleting) return
                            e.currentTarget.style.color = 'var(--danger)'
                            e.currentTarget.style.background = mix('danger', 8)
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = DIM
                            e.currentTarget.style.background = 'transparent'
                          }}>
                          <I n="trash" s={15} c="currentColor" w={1.8} />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
          </div>
        )}

        {/* Assessment picker — same swap-the-body pattern the
            history panel uses, so the BottomSheet z-index doesn't
            need to clear the Jasper sheet's own 261. Opens via
            the facility chip; commits via row tap; resets via
            the "Use current view" row at the top (only shown when
            an override is active). */}
        {pickerOpen && (
          <div style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            padding: `8px ${colPad}`, minHeight: 200,
            minWidth: 0, boxSizing: 'border-box',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 4px 10px', gap: 8,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: SUB,
                letterSpacing: '0.3px', textTransform: 'uppercase',
              }}>
                Pick an assessment
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label="Close picker"
                style={{
                  background: 'transparent', border: 'none', padding: '4px 8px',
                  color: SUB, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>
                Cancel
              </button>
            </div>

            {overrideAssessment && (
              <button
                type="button"
                onClick={clearOverride}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', textAlign: 'left',
                  padding: '12px 14px', marginBottom: 10,
                  background: mix('accent', 6),
                  border: `1px dashed ${mix('accent', 30)}`,
                  borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'inherit', color: TEXT,
                }}>
                <I n="refresh" s={14} c={ACCENT} w={1.8} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                  Use current view
                </span>
                <span style={{ fontSize: 11, color: SUB }}>
                  Reset to what the app is showing
                </span>
              </button>
            )}

            {pickerLoading && (
              <div style={{ padding: 20, textAlign: 'center', color: SUB, fontSize: 12 }}>
                Loading…
              </div>
            )}

            {!pickerLoading && pickerIndex.reports.length === 0 && pickerIndex.drafts.length === 0 && (
              <div style={{ padding: '20px 4px', color: SUB, fontSize: 13, lineHeight: 1.6 }}>
                No saved assessments yet. Once you have drafts or finalized reports, they'll show up here so you can ask AtmosFlow AI about any of them.
              </div>
            )}

            {!pickerLoading && pickerIndex.reports.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: DIM,
                  letterSpacing: '0.55px', textTransform: 'uppercase',
                  padding: '8px 4px 6px',
                }}>
                  Finalized reports
                </div>
                {pickerIndex.reports.slice(0, 12).map((r) => {
                  const isPicked = overrideAssessment?.id === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => pickAssessment(r, 'report')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', textAlign: 'left',
                        padding: '11px 14px', marginBottom: 6,
                        background: isPicked ? `${ACCENT}10` : 'transparent',
                        border: `1px solid ${isPicked ? ACCENT + '40' : BORDER}`,
                        borderRadius: 10, cursor: 'pointer',
                        fontFamily: 'inherit', color: TEXT,
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      <I n="check" s={14} c={isPicked ? ACCENT : 'var(--success)'} w={2} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontSize: 13.5, fontWeight: 600,
                          lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {r.facility || 'Untitled report'}
                        </span>
                        <span style={{ fontSize: 11, color: SUB, fontFamily: 'var(--font-mono)' }}>
                          {r.ts ? new Date(r.ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                          {typeof r.score === 'number' ? ` · Score ${r.score}` : ''}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </>
            )}

            {!pickerLoading && pickerIndex.drafts.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: DIM,
                  letterSpacing: '0.55px', textTransform: 'uppercase',
                  padding: '14px 4px 6px',
                }}>
                  Drafts in progress
                </div>
                {pickerIndex.drafts.slice(0, 12).map((d) => {
                  const isPicked = overrideAssessment?.id === d.id
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => pickAssessment(d, 'draft')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', textAlign: 'left',
                        padding: '11px 14px', marginBottom: 6,
                        background: isPicked ? `${ACCENT}10` : 'transparent',
                        border: `1px solid ${isPicked ? ACCENT + '40' : BORDER}`,
                        borderRadius: 10, cursor: 'pointer',
                        fontFamily: 'inherit', color: TEXT,
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      <I n="draft" s={14} c={isPicked ? ACCENT : SUB} w={1.8} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontSize: 13.5, fontWeight: 600,
                          lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {d.facility || 'Untitled draft'}
                        </span>
                        <span style={{ fontSize: 11, color: SUB, fontFamily: 'var(--font-mono)' }}>
                          {d.ua ? new Date(d.ua).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </>
            )}

            <div style={{
              fontSize: 11, color: DIM, padding: '14px 4px 0', lineHeight: 1.5,
            }}>
              Tip: switching here only changes what Jasper knows about. To open
              an assessment in the app, use the dashboard.
            </div>
          </div>
        )}

        {/* Message list / empty state */}
        {!historyOpen && !pickerOpen && (<>
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            padding: `8px ${colPad}`, minHeight: 120,
            minWidth: 0, boxSizing: 'border-box', wordBreak: 'break-word',
            // Empty canvas: center the watermark. Flex only in that state
            // so a transcript still flows from the top.
            ...(isEmptyCanvas ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}),
          }}>
          {!introAccepted && (
            <JasperIntroPanel onAccept={acceptIntro} onNavigate={onNavigate} />
          )}

          {/* Empty canvas — a faint, still mark in the middle of an open
              page (Grok's watermark). The headline, body copy and "Try
              one of these" label are gone: the prompt row above the
              composer says what to ask, and the composer says where. */}
          {isEmptyCanvas && !desktop && (
            <div aria-hidden="true" style={{ opacity: 0.22, filter: 'grayscale(1)' }}>
              <JasperBrainIcon size={72} animate={false} />
            </div>
          )}
          {/* Desktop empty canvas — a greeting over the composer, the way
              Claude / ChatGPT / Grok open a new chat: the page asks the
              question and the composer, pulled up toward the middle of
              the window, is where it gets answered. */}
          {isEmptyCanvas && desktop && (
            <div data-testid="jasper-desktop-greeting" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', maxWidth: 560, padding: '0 16px' }}>
              <JasperBrainIcon size={44} animate={false} />
              <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', color: TEXT, lineHeight: 1.2, marginTop: 6 }}>What can I help you investigate?</div>
              <div style={{ ...jasperCaption, fontSize: 14, lineHeight: '20px' }}>Ask about this assessment, drop in a logger export or lab report, or have the narrative drafted from the findings.</div>
            </div>
          )}

          {messages.map((m, idx) => {
            // A turn is "streaming" only if it's the LAST assistant
            // message AND the hook is still sending. We hide the
            // feedback row in that window so users don't rate a
            // half-formed answer.
            const isLast = idx === messages.length - 1
            const turnStreaming = sending && isLast && m.role === 'assistant'
            return (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                photos={m.photos}
                files={m.files}
                dbId={m.dbId}
                feedbackRating={m.feedbackRating}
                submitFeedback={submitFeedback}
                streaming={turnStreaming}
              />
            )
          })}

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

          {/* Investigation card — assess_investigation tool result,
              rendered from the tool payload rather than parsed out of
              Jasper's prose, so the card and the answer are two views
              of one object and cannot disagree. Only the latest is
              kept; the state is re-derived on every call. */}
          {investigations.map((inv) => (
            <InvestigationCard key={inv.id} state={inv} />
          ))}

          {/* Rendered-report download cards — generate_report tool
              results. base64 lives only on the client; clicking
              Download materializes it as a Blob and triggers a
              browser download. */}
          {renderedReports.map((r) => (
            <DownloadCard
              key={r.id}
              report={r}
              onDownload={markReportDownloaded}
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

        {/* Composer column. Full width on a phone; on desktop a centered
            DESKTOP_COLUMN so the composer lines up under the transcript.
            With nothing on the canvas it also lifts toward the middle of
            the window (the new-chat pose of every current AI app) and
            settles to the bottom edge once the first turn lands. */}
        <div style={{
          width: '100%', maxWidth: desktop ? DESKTOP_COLUMN : 'none', margin: '0 auto',
          flexShrink: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
          paddingBottom: desktop && isEmptyCanvas ? '18vh' : 0,
          transition: 'padding-bottom 220ms ease',
        }}>
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

        {/* Prompt row — the Grok capability pills. One horizontally
            scrolling line just above the composer, empty canvas only:
            once a conversation exists the row goes and the transcript
            has the page. Bleeds to the sheet edges so the last pill
            peeks in from the right, which is what says "scrolls". */}
        {isEmptyCanvas && (
          <div
            aria-label="Suggested prompts"
            className="jasper-prompt-row"
            style={{
              display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden',
              margin: '0 -16px', padding: '4px 16px 10px',
              scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
              flexShrink: 0,
            }}>
            {SUGGESTIONS.map((s) => (
              <JasperPromptPill
                key={s.label}
                label={s.label}
                disabled={sending || (s.attach && attachSlotsFull)}
                onClick={s.attach
                  ? () => fileInputRef.current?.click()
                  : () => sendMessage(s.text, effectiveContext)}
              />
            ))}
          </div>
        )}

        {/* Composer — Grok's two-row surface. Row one is the text;
            row two is a toolbar: [+] and the facility chip on the left
            (the slot Grok gives its "Fast" mode chip — ours says which
            assessment the AI is talking about), and on the right the
            primary capsule: "Speak" (dictation) while the box is empty,
            the accent send circle once there is text, Stop while
            streaming. One rounded surface; the container owns the
            border, which turns accent on focus-within. */}
        <div
          style={{
            marginTop: 2,
            background: SURFACE,
            border: `1px solid ${composerFocused ? ACCENT : BORDER}`,
            borderRadius: 24,
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            boxShadow: composerFocused
              ? jasperComposerFocusShadow()
              : '0 2px 12px rgba(0,0,0,0.06)',
            opacity: introAccepted ? 1 : 0.55,
            minWidth: 0, boxSizing: 'border-box', flexShrink: 0,
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
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 11, color: SUB, maxWidth: 140,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      title={p.label || ''}
                    >
                      {p.label || 'photo'}
                    </span>
                    {/* When the file was altered to fit, say so on the
                        chip. An evidence photo that quietly changed
                        between the camera and the report is exactly the
                        thing this product cannot do. */}
                    {p.note && (
                      <span style={{ fontSize: 10, color: DIM, whiteSpace: 'nowrap' }}>{p.note}</span>
                    )}
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

          {/* Staged data files — logger exports, lab results, PDFs.
              Rendered as text rows rather than thumbnails because
              there is nothing to look at; what matters is what the
              file turned out to CONTAIN, which is the second line. */}
          {attachments.length > 0 && (
            <div
              data-testid="attached-files"
              style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '10px 12px 0',
              }}
            >
              {attachments.map((a) => (
                <div
                  key={a.id}
                  style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 30px 7px 9px',
                    background: CARD, border: `1px solid ${BORDER}`,
                    borderRadius: 8, minWidth: 0,
                  }}
                >
                  <I n={a.kind === 'sensor' ? 'chartLine' : a.kind === 'lab' ? 'flask' : 'notes'} s={15} c={ACCENT} w={1.8} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: 12, color: TEXT,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      title={a.name}
                    >
                      {a.name}
                    </span>
                    <span style={{ fontSize: 10.5, color: DIM, whiteSpace: 'nowrap' }}>
                      {ATTACHMENT_KIND_LABEL[a.kind] || 'File'} · {a.summary}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    aria-label={`Remove ${a.name}`}
                    disabled={sending}
                    style={{
                      position: 'absolute', top: '50%', right: 4, transform: 'translateY(-50%)',
                      width: 22, height: 22, borderRadius: 11,
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

          {/* Resize confirmation. A photo over the send limit is held
              here rather than resized on arrival: the pixels are
              evidence, and altering them is the assessor's call. */}
          {pendingResize && (
            <div
              data-testid="resize-prompt"
              style={{
                margin: '10px 12px 0', padding: '10px 12px',
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.45 }}>
                {pendingResize.reason}
              </div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 4, lineHeight: 1.45 }}>
                Resizing reduces the image before sending. The original file on your device is not changed.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={confirmResize}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none',
                    background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  Resize and attach
                </button>
                <button
                  type="button"
                  onClick={cancelResize}
                  style={{
                    padding: '6px 12px', borderRadius: 8,
                    border: `1px solid ${BORDER}`, background: 'transparent',
                    color: SUB, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Hidden file input — the visible paperclip button below
              drives it. The accept list covers photos plus the data
              files the browser parses locally (logger exports, lab
              results, PDFs); the hook validates again before send. */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
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
            placeholder={introAccepted ? 'Ask AI' : 'Tap "Start Chatting" above to begin'}
            rows={1}
            style={{
              width: '100%',
              padding: '14px 18px 4px',
              background: 'transparent',
              border: 'none',
              color: TEXT, fontSize: 17, fontFamily: 'inherit', boxSizing: 'border-box',
              // The rounded container above owns the focus affordance: it
              // draws a 1.5px ACCENT border and a glow while `composerFocused`,
              // which is what satisfies WCAG 2.4.7 here. The global
              // :focus-visible ring is suppressed on this ONE element because
              // it drew a second rectangle inside the container's own.
              outline: 'none',
              minHeight: 40, maxHeight: 200, lineHeight: 1.5,
              resize: 'none',
              display: 'block',
            }}
          />

          {/* Toolbar row. Left: the attach circle and the facility chip.
              Right: the one primary capsule. */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 10px 10px', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                // Full only when BOTH lanes are full — a user who has
                // five photos staged can still attach a logger export.
                disabled={sending || !introAccepted || attachSlotsFull}
                aria-label="Attach photo or file"
                title="Attach a photo, report (DOCX/PDF), logger export, or lab results"
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: CARD, border: `1px solid ${BORDER}`,
                  cursor: sending || !introAccepted || attachSlotsFull ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', flexShrink: 0,
                  opacity: sending || !introAccepted ? 0.55 : 1,
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <I n="plus" s={20} c={attachedPhotos.length > 0 || attachments.length > 0 ? ACCENT : TEXT} w={2} />
              </button>
              {/* Which assessment the AI is talking about — tap to switch.
                  A neutral capsule with the facility name; the accent is
                  reserved for the primary control beside it. */}
              {facilityChip && (
                <button
                  type="button"
                  onClick={openAssessmentPicker}
                  aria-label={`${facilityChip.label}: tap to switch assessment`}
                  title="Switch assessment"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 40, padding: '0 12px 0 11px', borderRadius: 20,
                    background: CARD, border: `1px solid ${BORDER}`,
                    color: TEXT, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                    cursor: 'pointer', minWidth: 0, maxWidth: 180,
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  <I n="bldg" s={15} c={SUB} w={2} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{facilityChip.label}</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={SUB} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              )}
            </div>
            {/* Primary capsule. While the agent is streaming it is Stop
                (the partial answer stays on screen); with text in the box
                it is the accent send circle; otherwise "Speak" — the
                dictation button as a labeled capsule, Grok's standing
                voice affordance. */}
            {sending ? (
              <button
                onClick={stop}
                aria-label="Stop generating"
                title="Stop generating"
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: 'var(--accent-fill)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', flexShrink: 0,
                  transition: 'background 0.15s, transform 0.1s',
                  WebkitTapHighlightColor: 'transparent',
                  animation: 'faStopIn 140ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}>
                {/* Filled square — universal "stop" glyph in AI chat UIs. */}
                <span style={{
                  display: 'block', width: 13, height: 13, borderRadius: 3,
                  background: 'var(--on-accent-fill)',
                }} />
              </button>
            ) : input.trim() ? (
              <button
                onClick={submit}
                disabled={!introAccepted}
                aria-label="Send"
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: 'var(--accent-fill)',
                  border: 'none',
                  cursor: introAccepted ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', flexShrink: 0,
                  transition: 'background 0.15s, transform 0.1s',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <I n="arrowUp" s={20} c="var(--on-accent-fill)" w={2.6} />
              </button>
            ) : (
              <VoiceInputButton
                label="Speak"
                ariaLabel="Speak your question"
                disabled={sending || !introAccepted}
                size={40}
                onTranscript={(text) => setInput((v) => appendWithSpace(v, text))}
              />
            )}
          </div>
        </div>
        </div>
        </>)}

        {/* Footer — one recessive line. The review note carries the
            positioning; the legal links stay one tap away. */}
        <div style={{
          marginTop: 8,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          fontSize: 10.5, color: DIM, gap: 8, flexWrap: 'wrap',
          minWidth: 0, boxSizing: 'border-box', lineHeight: 1.3,
        }}>
          <span style={{ color: SUB, letterSpacing: '0.2px' }}>AI output requires professional review</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onNavigate?.('tos')}
            style={{ background: 'transparent', border: 'none', padding: 0, color: DIM, fontFamily: 'inherit', fontSize: 10.5, cursor: 'pointer' }}>
            Terms
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onNavigate?.('privacy')}
            style={{ background: 'transparent', border: 'none', padding: 0, color: DIM, fontFamily: 'inherit', fontSize: 10.5, cursor: 'pointer' }}>
            Privacy
          </button>
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
        /* Surface-local keyframes — used only by this file's
           thinking-dot pulse, tool-spinner, and Stop-button entrance.
           Anything reusable across AI surfaces lives in jasper-tokens. */
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
        /* Desktop page entrance — a fade with a 6px settle, no rise. */
        @keyframes jasperPageIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .jasper-sheet { animation: none !important; }
        }
        /* Neon-brain "thinking" indicator. The bright trace layer draws
           through each groove (stroke-dashoffset 100 → 0), holds fully
           lit, then fades the stroke back so the loop restarts from the
           dim base. Per-path animation-delay staggers the fill so the
           neon appears to RUN through the brain rather than every groove
           lighting at once. */
        @keyframes jasperBrainTrace {
          0%   { stroke-dashoffset: 100; opacity: 0.35; }
          45%  { stroke-dashoffset: 0;   opacity: 1; }
          80%  { stroke-dashoffset: 0;   opacity: 1; }
          100% { stroke-dashoffset: 0;   opacity: 0.15; }
        }
        /* Respect motion sensitivity: hold the brain fully lit + steady. */
        @media (prefers-reduced-motion: reduce) {
          .jasper-brain-trace path {
            animation: none !important;
            stroke-dashoffset: 0 !important;
            opacity: 1 !important;
          }
        }
        ${JASPER_KEYFRAMES_CSS}
      `}</style>
    </>
  )
}
