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
 *   1. Status — the verdict as a word in its color, then the summary
 *   2. Sign-off blockers — the hard items; advisory, not an export gate
 *   3. Recommended before sign-off — dismissible
 *   4. Defensibility gaps — resolve or disclose
 *   5. Report consistency — where the assembled report disagrees with
 *      itself (src/report/modelConsistency.js); empty when it agrees
 *   6. Warnings — informational
 *   7. Confidence breakdown — high / medium / low / qualitative-only
 *
 * Restraint pass (2026-09): the tinted status box with its icon circle,
 * the stripe-edged item cards, the mono count pills and the boxed
 * warnings are gone. Each section is a heading with its count, and each
 * item is a row parting from the next with a hairline; the color lives
 * in the words (the status, a severity, a "Fix" link), not in boxes.
 *
 * Finishing pass (2026-09, with the results-page rhythm): the panel now
 * speaks the results screen's own dialect. The status is the hero's
 * pattern — a colored eyebrow over a sentence in the primary ink — rather
 * than a bold red banner; section heads are neutral micro labels with
 * their count, on the same 18px rhythm as every other results section;
 * the fix affordance is the app's text action ("Fix ›" in the primary
 * ink) with the location as a quiet caption beneath it; every color reads
 * the severity tokens instead of its own hex; and the confidence
 * breakdown is three counts, not a green-to-orange bar — a colored ladder
 * reads as a score, which is the impression v3.0 removed.
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

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`
// The results screen's section: 18px each side of the rule (MobileApp
// RS_SECTION), a neutral micro head with its count.
const SECTION = { paddingTop: 18, borderTop: HAIRLINE }
const HEAD = { ...V3.T.micro, marginBottom: 4 }

const STATUS_TONES = {
  ready:   { color: V3.SEVERITY.pass, label: 'Ready for sign-off' },
  gaps:    { color: V3.SEVERITY.high, label: 'Defensibility gaps' },
  // NOT "Cannot finalize yet". Report issuance has not been gated since
  // 2026-05-27 — this panel is advisory, and it renders on reports that are
  // already finalized and already exported, where the old label was simply
  // untrue. It names what is outstanding, not a block that does not exist.
  blocked: { color: V3.SEVERITY.critical, label: 'Not ready for sign-off' },
}

// The status as the hero states its verdict: the word in its color as an
// eyebrow, the sentence beneath it in the primary ink.
function Status({ status, summary }) {
  const tone = STATUS_TONES[status] || STATUS_TONES.blocked
  return (
    <div style={{ paddingBottom: 18 }}>
      <div style={{ ...V3.T.caption, color: tone.color, fontWeight: 600, marginBottom: 6 }}>{tone.label}</div>
      <div style={{ ...V3.T.body, color: TEXT, lineHeight: '21px' }}>{summary}</div>
    </div>
  )
}

function Section({ title, count, children }) {
  if (count === 0) return null
  return (
    <div style={SECTION}>
      <div style={HEAD}>{title} · {count}</div>
      {children}
    </div>
  )
}

// A structured finalization item ({ id, field, label, message, location })
// as a row. `text` is a back-compat fallback when only a plain string is
// available. With `onFix` and a location the row is a button that jumps to
// the field that fixes it; the action is the app's text link in the primary
// ink and the location the quiet caption beneath it.
function FinalizationRow({ item, text, onFix, first }) {
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
        <div style={{ marginTop: 8 }}>
          {canFix && <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: '18px' }}>Fix <span aria-hidden="true">›</span></div>}
          <div style={{ ...V3.T.captionDim, marginTop: canFix ? 2 : 0 }}>{canFix ? location : `Fix in: ${location}`}</div>
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
  const warn = gap.severity === 'warn'
  const meta = [
    Array.isArray(gap.zones) && gap.zones.length > 0 ? `Zones: ${gap.zones.join(', ')}` : null,
    typeof gap.count === 'number' ? `Count: ${gap.count}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div style={{ padding: '12px 0', borderTop: first ? 'none' : HAIRLINE }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <div style={{ ...V3.T.bodyStrong, fontSize: 15 }}>{humanizeKind(gap.kind)}</div>
        {/* The severity word in its color, as the zone rows carry their
            outcome; a note is neutral. */}
        <div style={{ ...V3.T.caption, color: warn ? V3.SEVERITY.high : V3.TEXT_TERTIARY, whiteSpace: 'nowrap' }}>{warn ? 'Warning' : 'Note'}</div>
      </div>
      {meta && <div style={{ ...V3.T.captionDim, marginTop: 2 }}>{meta}</div>}
      <div style={{ ...V3.T.body, color: SUB, marginTop: 4, lineHeight: '20px' }}>{gap.why}</div>
    </div>
  )
}

function WarningRow({ text, first }) {
  return (
    <div style={{ ...V3.T.body, color: SUB, padding: '10px 0', borderTop: first ? 'none' : HAIRLINE, lineHeight: '20px' }}>{text}</div>
  )
}

// Three counts, not a bar. The segmented green-to-orange bar this replaced
// read as a score of the assessment; these are counts of findings by the
// evidence behind them, and the numbers say that on their own.
function ConfidenceCounts({ confidence }) {
  const total = confidence.high + confidence.medium + confidence.low + confidence.qualitative_only
  if (total === 0) return null
  const items = [
    { label: 'High', n: confidence.high },
    { label: 'Medium', n: confidence.medium },
    { label: 'Low', n: confidence.low },
    { label: 'Qualitative', n: confidence.qualitative_only },
  ].filter((s) => s.n > 0)
  return (
    <Section title="Confidence" count={total}>
      <div style={{ ...V3.T.body, color: SUB, padding: '8px 0 0', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {items.map((s) => (
          <span key={s.label}><span style={{ color: TEXT, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.n}</span> {s.label}</span>
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
    complaint_zone_without_comparison: 'No comparison area recorded',
    logger_without_deployment:     'Logger data without a deployment record',
  }[kind] || kind
}

export default function ReadinessPanel({ assessment, consistency = [], onFeedback, onFix }) {
  const verdict = useMemo(() => buildReadinessVerdict(assessment || {}), [assessment])

  return (
    <div style={{ paddingTop: 4 }}>
      <Status status={verdict.status} summary={verdict.summary} />

      <Section title="Sign-off blockers" count={verdict.finalization_blockers.length}>
        {(verdict.finalization_blocker_details && verdict.finalization_blocker_details.length > 0
          ? verdict.finalization_blocker_details.map((item, i) => (
              <FinalizationRow key={item.id} item={item} onFix={onFix} first={i === 0} />
            ))
          : verdict.finalization_blockers.map((text, i) => (
              <FinalizationRow key={i} text={text} first={i === 0} />
            )))}
      </Section>

      <Section title="Recommended before sign-off" count={(verdict.finalization_dismissible || []).length}>
        {(verdict.finalization_dismissible || []).map((item, i) => (
          <FinalizationRow key={item.id} item={item} onFix={onFix} first={i === 0} />
        ))}
      </Section>

      <Section title="Defensibility gaps" count={verdict.defensibility_gaps.length}>
        {verdict.defensibility_gaps.map((gap, i) => (
          <GapRow key={`${gap.kind}-${i}`} gap={gap} first={i === 0} />
        ))}
      </Section>

      {/* The assembled report checked against itself. A row here is a
          section of the document contradicting another — the class of
          defect a reviewer catches after the fact and this catches before
          export. The rule id is shown so the disagreement can be pointed at. */}
      <Section title="Report consistency" count={consistency.length}>
        {consistency.map((c, i) => (
          <div key={`${c.id}-${i}`} style={{ padding: '12px 0', borderTop: i === 0 ? 'none' : HAIRLINE }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <div style={{ ...V3.T.bodyStrong, fontSize: 15 }}>{c.where}</div>
              <div style={{ ...V3.T.captionDim, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{c.id}</div>
            </div>
            <div style={{ ...V3.T.body, color: SUB, marginTop: 4, lineHeight: '20px' }}>{c.message}</div>
          </div>
        ))}
      </Section>

      <Section title="Warnings" count={verdict.finalization_warnings.length}>
        {verdict.finalization_warnings.map((text, i) => (
          <WarningRow key={i} text={text} first={i === 0} />
        ))}
      </Section>

      <ConfidenceCounts confidence={verdict.confidence} />

      {onFeedback && (
        <div style={{ paddingTop: 18, paddingBottom: 18, borderTop: HAIRLINE }}>
          <FeedbackButton label="Flag a finding" onClick={onFeedback} />
        </div>
      )}
    </div>
  )
}
