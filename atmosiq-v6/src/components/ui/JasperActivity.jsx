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
 * Each `context` names an ordered phrase sequence and a phrase per stage.
 * A real stage always beats a simulated one, in two forms: a caller whose
 * pipeline reports named progress passes `stage`, and one that already
 * composes its own status text passes `phrase`. The assistant sheet uses
 * the second — a running tool describes itself ("Searching the standards
 * corpus…") and that description stands until the tool ends.
 *
 * With neither, the component walks the context's progression on a timer
 * and then cycles the LATER phrases for as long as the work runs. The
 * three request-and-response paths — the forensic reading, the findings
 * narrative, the report sections — are all one round trip with no
 * intermediate stages to report, so they use the timer. It never restarts
 * from the first phrase, and a stage that CLEARS rejoins the loop rather
 * than rewinding: a status that says "Reading the patterns…" for the third
 * time is a status the assessor has stopped believing.
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
 * nothing either. Live `phrase` text is the exception: its set is not
 * knowable, so nothing is reserved and the text wraps instead — such a
 * status stands on its own line, where wrapping costs no neighbor anything
 * and running off a phone's right edge would cost the reader the sentence.
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
// `phrases`: the phrase per STAGE, for a caller whose pipeline reports
// real progress. Stage names are the context's own — a report writer and
// a pattern reader do different work and have no shared vocabulary —
// so each context declares the ones its own pipeline can report.

// The logger-forensics stage vocabulary. Other contexts key `phrases` by
// their own stages; nothing requires one context's names on another.
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

  // The Report tab's findings narrative. The writing is the model's; the
  // findings and figures are not, so the phrases describe fitting words to
  // a record that already exists rather than working anything out.
  'report-narrative': {
    announce: 'Jasper is writing the findings narrative.',
    phrases: {
      reading: 'Reading the findings…',
      checking_evidence: 'Checking what the evidence supports…',
      tracing_figures: 'Tracing the figures to the analysis…',
      drafting: 'Drafting the narrative…',
      reviewing: 'Reviewing the wording…',
    },
    sequence: [
      'Reading the findings…',
      'Checking what the evidence supports…',
      'Tracing the figures to the analysis…',
      'Drafting the narrative…',
      'Reviewing the wording…',
    ],
    loop: [
      'Checking what the evidence supports…',
      'Tracing the figures to the analysis…',
      'Reviewing the limitations…',
      'Drafting the narrative…',
      'Reviewing the wording…',
    ],
  },

  // The five writable report sections. The progression names the actual
  // sections the one call returns, in the order the report carries them.
  'report-sections': {
    announce: 'Jasper is writing the report sections.',
    phrases: {
      reading: 'Reading the assessment record…',
      executive_summary: 'Drafting the executive summary…',
      discussion: 'Writing the discussion…',
      site_model: 'Describing the conceptual site model…',
      recommendations: 'Framing the recommendations…',
      background: 'Writing the parameter background…',
      reviewing: 'Checking each section against the record…',
    },
    sequence: [
      'Reading the assessment record…',
      'Drafting the executive summary…',
      'Writing the discussion…',
      'Describing the conceptual site model…',
      'Framing the recommendations…',
      'Checking each section against the record…',
    ],
    loop: [
      'Writing the discussion…',
      'Describing the conceptual site model…',
      'Framing the recommendations…',
      'Writing the parameter background…',
      'Checking each section against the record…',
    ],
  },

  // The assistant sheet, between the question and the first token. When a
  // TOOL is running the caller passes its live description as `phrase`
  // instead, because that is a real stage and beats a simulated one.
  assistant: {
    announce: 'AtmosFlow AI is working on your question.',
    phrases: {
      reading: 'Reading your question…',
      standards: 'Checking the standards…',
      thresholds: 'Cross-referencing thresholds…',
      weighing: 'Weighing what the record supports…',
      composing: 'Putting the answer together…',
    },
    sequence: [
      'Reading your question…',
      'Checking the standards…',
      'Cross-referencing thresholds…',
      'Weighing what the record supports…',
      'Putting the answer together…',
    ],
    loop: [
      'Checking the standards…',
      'Cross-referencing thresholds…',
      'Consulting the corpus…',
      'Weighing what the record supports…',
      'Putting the answer together…',
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
    /* Phrases stack in one grid cell; the hidden ones still size it, which
       is what keeps a swap from moving the row, so they may not wrap. Live
       text reserves nothing and can be any length, so it wraps instead of
       running off a phone's right edge. */
    .af-ja-text { display: grid; align-items: center; min-width: 0; }
    .af-ja-phrase { grid-area: 1 / 1; white-space: nowrap; }
    .af-ja-free .af-ja-phrase { white-space: normal; overflow-wrap: anywhere; }
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
 * @param {string} [props.stage] a real pipeline stage, named by the context's
 *   own `phrases` map; when supplied the phrase follows it and no timer runs
 * @param {string} [props.phrase] live status text, for a caller that already
 *   composes its own (the assistant's running tool). Outranks `stage` and the
 *   timer, and reserves no width, since the set is not known in advance
 * @param {boolean} [props.active] true while the work runs; flip to false to
 *   finish — the status brightens once, fades, then reports `onSettled`
 * @param {boolean} [props.brighten] false for an ending that is not a result
 * @param {() => void} [props.onSettled] called once the exit has finished
 * @param {{announce?: string, sequence?: string[], loop?: string[], phrases?: object}} [props.phrases]
 *   a one-off phrase set, for a surface with no registered context
 * @param {number} [props.size] the brain, in px (16 matches AiAction)
 * @param {object} [props.textStyle] merged over the status type. For a surface
 *   with its own established status face; the default is the system one
 * @param {object} [props.style]
 */
export default function JasperActivity({
  context = 'logger-forensics', stage, phrase, active = true, brighten = true,
  onSettled, phrases, size = 16, textStyle, style,
}) {
  const set = useMemo(() => ({ ...(JASPER_ACTIVITY_CONTEXTS[context] || JASPER_ACTIVITY_CONTEXTS['logger-forensics']), ...(phrases || {}) }), [context, phrases])
  const { sequence, loop } = useMemo(() => {
    const seq = set.sequence || []
    return { sequence: seq, loop: set.loop && set.loop.length ? set.loop : seq }
  }, [set])
  // Live text outranks a stage, which outranks the timer.
  const staged = phrase || (stage && set.phrases && set.phrases[stage] ? set.phrases[stage] : null)

  // The phrase showing, the one on its way out, and where the timer is in
  // the sequence. `outgoing` exists only for the swap's duration. The ref
  // mirrors `current` so a timer tick reads the phrase that is actually
  // showing without closing over a render.
  const [current, setCurrent] = useState(() => staged || sequence[0] || '')
  const [outgoing, setOutgoing] = useState(null)
  const currentRef = useRef(current)
  const stepRef = useRef(0)
  const reduced = prefersReducedMotion()

  // Every phrase this context can show, for sizing the box, deduplicated so
  // a phrase in both lists is measured once. A caller passing live text has
  // no knowable set, so nothing is reserved and only what is showing renders
  // — such a status stands on its own line, where reserving nothing costs
  // nothing.
  const all = useMemo(() => {
    if (phrase) return [current, outgoing].filter((p, i, a) => p && a.indexOf(p) === i)
    return [...new Set([...sequence, ...loop, ...Object.values(set.phrases || {})])]
  }, [phrase, current, outgoing, sequence, loop, set.phrases])

  const swapTo = useCallback((next) => {
    if (!next || next === currentRef.current) return
    setOutgoing(currentRef.current)
    currentRef.current = next
    setCurrent(next)
  }, [])

  // What to show, whenever the inputs move. Three cases, in order: a fresh
  // run opens the progression; a real stage replaces whatever is showing; a
  // stage that CLEARS (a tool finished) rejoins the timed phrases in the
  // loop, never back at the opening one — the work is further along than
  // that, and a status that rewinds reads as a status nobody is driving.
  const runRef = useRef(false)
  const stagedSeenRef = useRef(false)
  useEffect(() => {
    if (!active) { runRef.current = false; stagedSeenRef.current = false; return }
    if (!runRef.current) {
      runRef.current = true
      stepRef.current = 0
      stagedSeenRef.current = !!staged
      swapTo(staged || sequence[0])
      return
    }
    if (staged) { stagedSeenRef.current = true; swapTo(staged); return }
    if (stagedSeenRef.current) {
      stagedSeenRef.current = false
      stepRef.current = Math.max(stepRef.current, sequence.length)
      swapTo(nextLoopPhrase(loop, currentRef.current))
    }
  }, [active, staged, sequence, loop, swapTo])

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
          size, medium weight, one step below body ink. A surface with its own
          established status face passes `textStyle` rather than having this
          one imposed on it. */}
      <span className={phrase ? 'af-ja-text af-ja-free' : 'af-ja-text'} aria-hidden="true" style={{ ...V3.T.caption, fontSize: 13, lineHeight: '16px', fontWeight: 500, color: V3.TEXT_SECONDARY, ...textStyle }}>
        {all.map((p) => {
          const state = p === current ? 'in' : p === outgoing ? 'out' : 'measure'
          return <span key={p} className="af-ja-phrase" data-state={state} data-testid={state === 'in' ? 'jasper-activity-phrase' : undefined}>{p}</span>
        })}
      </span>
    </span>
  )
}
