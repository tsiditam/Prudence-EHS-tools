/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ReadinessPanel — surfaces the readiness verdict produced by the
 * engines/readiness-verdict orchestrator. Renders in the results-view
 * tab strip as "Review".
 *
 * Sections, top to bottom:
 *   1. Status — the verdict as a word in its colour, then the summary
 *   2. Finalization blockers — hard, must clear before export
 *   3. Recommended before sign-off — dismissible
 *   4. Defensibility gaps — resolve or disclose
 *   5. Warnings — informational
 *   6. Confidence breakdown — high / medium / low / qualitative-only
 *
 * Restraint pass (2026-09): the tinted status box with its icon circle,
 * the stripe-edged item cards, the mono count pills and the boxed
 * warnings are gone. Each section is a heading with its count, and each
 * item is a row parting from the next with a hairline; the colour lives
 * in the words (the status, a section heading, a severity, a "Fix" link),
 * not in boxes.
 *
 * Engine-sacred boundary: this component reads the assessment via the
 * readiness-verdict orchestrator. It does not import scoring or
 * threshold logic; it does not mutate the assessment.
 */

import { useMemo } from 'react'
import * as V3 from '../styles/tokens'
import { buildReadinessVerdict } from '../engines/readiness-verdict'
import FeedbackButton from './ui/FeedbackButton'

const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`

const STATUS_TONES = {
  ready:   { color: '#22C55E', label: 'Ready for sign-off' },
  gaps:    { color: '#FB923C', label: 'Defensibility gaps' },
  blocked: { color: '#EF4444', label: 'Cannot finalize yet' },
}

function Status({ status, summary }) {
  const tone = STATUS_TONES[status] || STATUS_TONES.blocked
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: tone.color, lineHeight: '24px' }}>{tone.label}</div>
      <div style={{ ...V3.T.bodyDim, marginTop: 4 }}>{summary}</div>
    </div>
  )
}

function Section({ title, count, color, children }) {
  if (count === 0) return null
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ ...V3.T.micro, color: color || V3.TEXT_TERTIARY, paddingBottom: 6, borderBottom: HAIRLINE }}>
        {title} · {count}
      </div>
      {children}
    </div>
  )
}

// A structured finalization item ({ id, field, label, message, location })
// as a row. `tone` colours the Fix link; `text` is a back-compat fallback
// when only a plain string is available. With `onFix` and a location the
// row is a button that jumps to the field that fixes it.
function FinalizationRow({ item, text, tone, onFix, first }) {
  const label = item?.label
  const message = item?.message ?? text
  const location = item?.location
  const canFix = !!(onFix && item && location)
  // `border: 'none'` must come BEFORE `borderTop`: the shorthand resets
  // every side, and with the order reversed the button's default
  // 3px currentColor top border came back as a white bar between rows.
  const rowStyle = {
    display: 'block', width: '100%', textAlign: 'left', boxSizing: 'border-box',
    padding: '12px 0', background: 'transparent',
    border: 'none', borderTop: first ? 'none' : HAIRLINE,
  }
  const body = (
    <>
      {label && <div style={{ ...V3.T.bodyStrong, fontSize: 15, color: TEXT }}>{label}</div>}
      <div style={{ ...V3.T.body, color: label ? SUB : TEXT, marginTop: label ? 2 : 0, lineHeight: '20px' }}>{message}</div>
      {location && (
        <div style={{ ...V3.T.caption, marginTop: 6, color: canFix ? tone : SUB, fontWeight: 600 }}>
          {canFix ? 'Fix' : 'Fix in'}: {location}{canFix ? ' ›' : ''}
        </div>
      )}
    </>
  )
  if (canFix) {
    return (
      <button type="button" onClick={() => onFix(item)} style={{ ...rowStyle, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
        {body}
      </button>
    )
  }
  return <div style={rowStyle}>{body}</div>
}

function GapRow({ gap, first }) {
  const tone = gap.severity === 'warn' ? '#FB923C' : '#3B82F6'
  const meta = [
    Array.isArray(gap.zones) && gap.zones.length > 0 ? `Zones: ${gap.zones.join(', ')}` : null,
    typeof gap.count === 'number' ? `Count: ${gap.count}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div style={{ padding: '12px 0', borderTop: first ? 'none' : HAIRLINE }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <div style={{ ...V3.T.bodyStrong, fontSize: 15 }}>{humanizeKind(gap.kind)}</div>
        <div style={{ ...V3.T.caption, color: tone, whiteSpace: 'nowrap' }}>{gap.severity === 'warn' ? 'Warning' : 'Note'}</div>
      </div>
      {meta && <div style={{ ...V3.T.caption, marginTop: 2 }}>{meta}</div>}
      <div style={{ ...V3.T.body, color: SUB, marginTop: 4, lineHeight: '20px' }}>{gap.why}</div>
    </div>
  )
}

function WarningRow({ text, first }) {
  return (
    <div style={{ ...V3.T.body, color: SUB, padding: '10px 0', borderTop: first ? 'none' : HAIRLINE, lineHeight: '20px' }}>{text}</div>
  )
}

function ConfidenceBar({ confidence }) {
  const total = confidence.high + confidence.medium + confidence.low + confidence.qualitative_only
  if (total === 0) return null
  const segs = [
    { label: 'High',    n: confidence.high,            color: '#22C55E' },
    { label: 'Medium',  n: confidence.medium,          color: '#FBBF24' },
    { label: 'Low',     n: confidence.low,             color: '#FB923C' },
    { label: 'Qualitative', n: confidence.qualitative_only, color: '#94A3B8' },
  ]
  return (
    <Section title="Confidence" count={total}>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', margin: '12px 0 8px', background: 'var(--surface)' }}>
        {segs.map((s) => s.n > 0 && (
          <div key={s.label} style={{ flex: s.n, background: s.color }} title={`${s.label}: ${s.n}`} />
        ))}
      </div>
      <div style={{ ...V3.T.caption, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {segs.filter((s) => s.n > 0).map((s) => (
          <span key={s.label}><span style={{ color: s.color, fontWeight: 600 }}>{s.n}</span> {s.label}</span>
        ))}
      </div>
    </Section>
  )
}

function humanizeKind(kind) {
  return {
    missing_outdoor_co2:           'Missing outdoor CO₂ baseline',
    missing_hvac_status:           'Missing HVAC operating status',
    missing_occupancy_duration:    'Missing occupancy + measurement duration',
    mold_concern_without_moisture: 'Mold indicator without moisture context',
    recommendation_without_location: 'Recommendation missing location',
    qualitative_only_propagated:   'Qualitative-only findings',
    differential_unresolved:       'Competing explanations unresolved',
    untested_differential:         'Explanation never measured against',
  }[kind] || kind
}

export default function ReadinessPanel({ assessment, onFeedback, onFix }) {
  const verdict = useMemo(() => buildReadinessVerdict(assessment || {}), [assessment])

  return (
    <div style={{ paddingTop: 4, paddingBottom: 16 }}>
      <Status status={verdict.status} summary={verdict.summary} />

      <Section title="Finalization blockers" count={verdict.finalization_blockers.length} color="#EF4444">
        {(verdict.finalization_blocker_details && verdict.finalization_blocker_details.length > 0
          ? verdict.finalization_blocker_details.map((item, i) => (
              <FinalizationRow key={item.id} item={item} tone="#EF4444" onFix={onFix} first={i === 0} />
            ))
          : verdict.finalization_blockers.map((text, i) => (
              <FinalizationRow key={i} text={text} tone="#EF4444" first={i === 0} />
            )))}
      </Section>

      <Section title="Recommended before sign-off" count={(verdict.finalization_dismissible || []).length} color="#FB923C">
        {(verdict.finalization_dismissible || []).map((item, i) => (
          <FinalizationRow key={item.id} item={item} tone="#FB923C" onFix={onFix} first={i === 0} />
        ))}
      </Section>

      <Section title="Defensibility gaps" count={verdict.defensibility_gaps.length} color="#FB923C">
        {verdict.defensibility_gaps.map((gap, i) => (
          <GapRow key={`${gap.kind}-${i}`} gap={gap} first={i === 0} />
        ))}
      </Section>

      <Section title="Warnings" count={verdict.finalization_warnings.length} color={DIM}>
        {verdict.finalization_warnings.map((text, i) => (
          <WarningRow key={i} text={text} first={i === 0} />
        ))}
      </Section>

      <ConfidenceBar confidence={verdict.confidence} />

      {onFeedback && (
        <div style={{ marginTop: 18 }}>
          <FeedbackButton label="Flag a finding" onClick={onFeedback} />
        </div>
      )}
    </div>
  )
}
