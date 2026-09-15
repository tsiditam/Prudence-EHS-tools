/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperActivity — Jasper at work, in place.
 *
 *   <JasperActivity context="logger-forensics" active={busy} onSettled={() => setBusy(false)} />
 *
 * What the assessor sees while Jasper reads a screen: the AI mark, the same
 * brain `AiAction` carries, breathing very slightly with a faint accent halo,
 * beside one short sentence about what is being looked at right now. The
 * sentence changes every couple of seconds with a quiet fade; the brain is
 * the only moving part. No spinner, no dots, no ring.
 *
 * ── Stages, and where they come from ───────────────────────────────────
 * Each `context` names an ordered stage sequence and a phrase per stage.
 * A caller whose pipeline reports real progress passes `stage`, and the
 * phrase follows it. Today no Jasper path does — the forensic reading is one
 * request with one response — so with `stage` absent the component walks
 * the context's default progression on a timer, then cycles the LATER
 * stages for as long as the work runs. It never restarts from the first
 * phrase: a status that says "Reading the patterns…" for the third time is
 * a status the assessor has stopped believing.
 *
 * The phrases describe the kind of work, never the model's reasoning. They
 * are copy, chosen here, not anything the model said.
 *
 * ── Completion ─────────────────────────────────────────────────────────
 * When `active` turns false the loop stops, the brain brightens once, and
 * the whole status fades. `onSettled` fires when the fade has finished so
 * the caller can show whatever replaces it. Pass `brighten={false}` for an
 * outcome that is not a result (an error): the status still leaves quietly
 * but does not celebrate.
 *
 * ── Layout ─────────────────────────────────────────────────────────────
 * The text box is as wide as the LONGEST phrase of its context, so a phrase
 * change never moves the caption beside it, and the box is the height of
 * the `AiAction` it stands in for, so swapping one for the other moves
 * nothing either.
 *
 * ── Assistive tech ─────────────────────────────────────────────────────
 * One live-region sentence ("Jasper is analyzing the forensic patterns.")
 * is announced once. The rotating phrases are decoration to a screen
 * reader and are hidden from it. Under prefers-reduced-motion the brain
 * neither scales nor glows and the phrases swap with no travel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JasperBrainIcon from '../JasperBrainIcon'
import * as V3 from '../../styles/tokens'

// ── Contexts ───────────────────────────────────────────────────────────
// `sequence`: the default progression, first to last, one phrase each.
// `loop`: what a long run cycles through after the sequence is spent —
// later-stage work only, so nothing reads as starting over.
// `announce`: the one sentence assistive technology hears.

export const JASPER_ACTIVITY_STAGES = [
  'reading',
  'comparing_timing',
  'tracing_relationships',
  'checking_evidence',
  'testing_interpretation',
  'building_assessment',
  'finalizing',
]

export const JASPER_ACTIVITY_CONTEXTS = {
  'logger-forensics': {
    announce: 'Jasper is analyzing the forensic patterns.',
    phrases: {
      reading: 'Reading the patterns…',
      comparing_timing: 'Comparing event timing…',
      tracing_relationships: 'Tracing relationships…',
      checking_evidence: 'Checking what the data supports…',
      testing_interpretation: 'Testing the interpretation…',
      building_assessment: 'Building the assessment…',
      finalizing: 'Building the assessment…',
    },
    sequence: [
      'Reading the patterns…',
      'Comparing event timing…',
      'Tracing relationships…',
      'Checking what the data supports…',
      'Testing the interpretation…',
      'Building the assessment…',
    ],
    loop: [
      'Tracing relationships…',
      'Reviewing coincident events…',
      'Checking what the data supports…',
      'Looking for repeated patterns…',
      'Connecting the evidence…',
      'Testing the interpretation…',
      'Building the assessment…',
    ],
  },
}

// ── Timing ─────────────────────────────────────────────────────────────
// Each phrase holds a little over two seconds; the swap itself is the
// system's exit duration (--dur-exit, 160 ms) out, then the same again in. The brain
// breathes on a two-second loop, independent of the phrase cadence so the
// two never read as one metronome. Completion: a 260 ms brighten, then the
// status fades over --dur-enter (220 ms), overlapping slightly.
export const JASPER_ACTIVITY_TIMING = {
  phraseMs: 2200,
  swapMs: 160,
  brightenMs: 260,
  fadeMs: 220,
  settleMs: 420,
}

/**
 * For whatever replaces the status: apply this class to a block that has
 * just arrived and it eases in over the system's enter duration, in step
 * with the status easing out. Nothing under reduced motion.
 */
export const JASPER_REVEAL_CLASS = 'af-ja-reveal'

const STYLE_ID = 'af-jasper-activity-style'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    .af-ja { opacity: 1; }
    .af-ja-brain { position: relative; display: inline-flex; flex-shrink: 0; transform-origin: 50% 50%; will-change: transform; }
    /* The halo: a soft disc four pixels wider than the icon on every side,
       in the dimmed accent the system already uses for tinted fills. */
    .af-ja-brain::before {
      content: ''; position: absolute; inset: -4px; border-radius: 50%; pointer-events: none;
      background: radial-gradient(circle, ${V3.CSS.accentDim} 0%, transparent 80%);
      opacity: 0.7;
    }
    .af-ja-active .af-ja-brain { animation: afjaBreathe 2s ease-in-out infinite; }
    .af-ja-active .af-ja-brain::before { animation: afjaHalo 2s ease-in-out infinite; }
    .af-ja-done .af-ja-brain { animation: afjaBright ${JASPER_ACTIVITY_TIMING.brightenMs}ms var(--ease-out) both; }
    .af-ja-done .af-ja-brain::before { animation: afjaHaloBright ${JASPER_ACTIVITY_TIMING.brightenMs}ms var(--ease-out) both; }
    .af-ja-leaving { animation: afjaLeave ${JASPER_ACTIVITY_TIMING.fadeMs}ms ease ${JASPER_ACTIVITY_TIMING.settleMs - JASPER_ACTIVITY_TIMING.fadeMs}ms both; }
    .af-ja-leaving.af-ja-quiet { animation-delay: 0ms; }
    /* Phrases stack in one grid cell; the hidden ones still size it. */
    .af-ja-text { display: grid; align-items: center; min-width: 0; }
    .af-ja-phrase { grid-area: 1 / 1; white-space: nowrap; }
    /* The new phrase waits for the old one to clear, so the two never
       overprint: out, then in, each over one swap. */
    .af-ja-phrase[data-state="in"] { animation: afjaPhraseIn ${JASPER_ACTIVITY_TIMING.swapMs}ms var(--ease-out) ${JASPER_ACTIVITY_TIMING.swapMs}ms both; }
    .af-ja-phrase[data-state="out"] { animation: afjaPhraseOut ${JASPER_ACTIVITY_TIMING.swapMs}ms ease both; }
    .af-ja-phrase[data-state="measure"] { visibility: hidden; }
    .af-ja-reveal { animation: afjaReveal var(--dur-enter) var(--ease-out) both; }
    @keyframes afjaReveal { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
    @keyframes afjaBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
    @keyframes afjaHalo { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
    @keyframes afjaBright { 0% { transform: scale(1); filter: brightness(1); } 40% { transform: scale(1.04); filter: brightness(1.35); } 100% { transform: scale(1); filter: brightness(1); } }
    @keyframes afjaHaloBright { 0% { opacity: 0.7; } 40% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes afjaLeave { from { opacity: 1; } to { opacity: 0; } }
    @keyframes afjaPhraseIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
    @keyframes afjaPhraseOut { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-3px); } }
    @media (prefers-reduced-motion: reduce) {
      .af-ja-brain, .af-ja-done .af-ja-brain { animation: none !important; transform: none !important; filter: none !important; }
      .af-ja-brain::before { display: none !important; }
      .af-ja-leaving, .af-ja-reveal { animation: none !important; }
      .af-ja-phrase[data-state="in"], .af-ja-phrase[data-state="out"] { animation: none !important; transform: none !important; }
      .af-ja-phrase[data-state="out"] { visibility: hidden; }
    }
  `
  document.head.appendChild(s)
}

export function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

/**
 * The phrase after `current` for a run that has outlived its sequence:
 * the loop in order, never repeating what is showing.
 */
function nextLoopPhrase(loop, current) {
  if (!loop.length) return current
  const at = loop.indexOf(current)
  const next = loop[(at + 1) % loop.length]
  return next === current && loop.length > 1 ? loop[(at + 2) % loop.length] : next
}

/**
 * @param {object} props
 * @param {string} [props.context] which phrase set — a key of JASPER_ACTIVITY_CONTEXTS
 * @param {string} [props.stage] a real pipeline stage, one of JASPER_ACTIVITY_STAGES;
 *   when supplied the phrase follows it and the timer is not used
 * @param {boolean} [props.active] true while the work runs; flip to false to
 *   finish — the status brightens once, fades, then reports `onSettled`
 * @param {boolean} [props.brighten] false for an ending that is not a result
 * @param {() => void} [props.onSettled] called once the exit has finished
 * @param {{announce?: string, sequence?: string[], loop?: string[], phrases?: object}} [props.phrases]
 *   a one-off phrase set, for a surface with no registered context
 * @param {number} [props.size] the brain, in px (16 matches AiAction)
 * @param {object} [props.style]
 */
export default function JasperActivity({
  context = 'logger-forensics', stage, active = true, brighten = true, onSettled, phrases, size = 16, style,
}) {
  const set = useMemo(() => ({ ...(JASPER_ACTIVITY_CONTEXTS[context] || JASPER_ACTIVITY_CONTEXTS['logger-forensics']), ...(phrases || {}) }), [context, phrases])
  const { sequence, loop } = useMemo(() => {
    const seq = set.sequence || []
    return { sequence: seq, loop: set.loop && set.loop.length ? set.loop : seq }
  }, [set])
  const staged = stage && set.phrases && set.phrases[stage] ? set.phrases[stage] : null

  // The phrase showing, the one on its way out, and where the timer is in
  // the sequence. `outgoing` exists only for the swap's duration. The ref
  // mirrors `current` so a timer tick reads the phrase that is actually
  // showing without closing over a render.
  const [current, setCurrent] = useState(() => staged || sequence[0] || '')
  const [outgoing, setOutgoing] = useState(null)
  const currentRef = useRef(current)
  const stepRef = useRef(0)
  const reduced = prefersReducedMotion()

  // Every phrase this context can show, for sizing the box. Deduplicated
  // so a phrase in both lists is measured once.
  const all = useMemo(() => [...new Set([...sequence, ...loop, ...Object.values(set.phrases || {})])], [sequence, loop, set.phrases])

  const swapTo = useCallback((phrase) => {
    if (!phrase || phrase === currentRef.current) return
    setOutgoing(currentRef.current)
    currentRef.current = phrase
    setCurrent(phrase)
  }, [])

  // A fresh run starts the progression over; a real stage wins over the
  // timer whenever it is supplied.
  useEffect(() => {
    if (active) { stepRef.current = 0; swapTo(staged || sequence[0]) }
  }, [active, staged, sequence, swapTo])

  // The timed progression, only while active and only with no real stage.
  useEffect(() => {
    if (!active || staged) return undefined
    const id = setInterval(() => {
      stepRef.current += 1
      const step = stepRef.current
      swapTo(step < sequence.length ? sequence[step] : nextLoopPhrase(loop, currentRef.current))
    }, JASPER_ACTIVITY_TIMING.phraseMs)
    return () => clearInterval(id)
  }, [active, staged, sequence, loop, swapTo])

  // Drop the outgoing phrase once the whole swap — out, then in — has run.
  useEffect(() => {
    if (outgoing == null) return undefined
    const id = setTimeout(() => setOutgoing(null), reduced ? 0 : 2 * JASPER_ACTIVITY_TIMING.swapMs)
    return () => clearTimeout(id)
  }, [outgoing, reduced])

  // Completion: hold for the brighten and the fade, then hand back.
  const settledRef = useRef(onSettled)
  settledRef.current = onSettled
  useEffect(() => {
    if (active) return undefined
    const wait = reduced ? 0 : (brighten ? JASPER_ACTIVITY_TIMING.settleMs : JASPER_ACTIVITY_TIMING.fadeMs)
    const id = setTimeout(() => { if (typeof settledRef.current === 'function') settledRef.current() }, wait)
    return () => clearTimeout(id)
  }, [active, brighten, reduced])

  const className = [
    'af-ja',
    active ? 'af-ja-active' : 'af-ja-leaving',
    !active && brighten ? 'af-ja-done' : '',
    !active && !brighten ? 'af-ja-quiet' : '',
  ].filter(Boolean).join(' ')

  return (
    <span
      role="status"
      className={className}
      data-testid="jasper-activity"
      data-active={active ? 'true' : 'false'}
      style={{
        // AiAction's box, so the two swap without moving the row.
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px 0 8px',
        flexShrink: 0, minWidth: 0, ...style,
      }}>
      <span className="af-ja-brain" aria-hidden="true">
        <JasperBrainIcon size={size} animate={false} />
      </span>
      {/* The one sentence assistive technology hears, once. */}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        {set.announce || 'Jasper is working.'}
      </span>
      {/* System activity, not a heading: the caption face at the action's
          size, medium weight, one step below body ink. */}
      <span className="af-ja-text" aria-hidden="true" style={{ ...V3.T.caption, fontSize: 13, lineHeight: '16px', fontWeight: 500, color: V3.TEXT_SECONDARY }}>
        {all.map((p) => {
          const state = p === current ? 'in' : p === outgoing ? 'out' : 'measure'
          return <span key={p} className="af-ja-phrase" data-state={state} data-testid={state === 'in' ? 'jasper-activity-phrase' : undefined}>{p}</span>
        })}
      </span>
    </span>
  )
}
