/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ForensicsPanel — the Forensics view of Logger Studio.
 *
 * Two authors on one surface, kept apart on purpose:
 *
 *   Evidence   the deterministic layer. Every pattern the detector found, with
 *              its figures on their own line — copied from the bundle through
 *              `forensicPresent.js`, never typed by a model.
 *   Reading    Jasper's interpretation of that pattern, beside it. Words only:
 *              what it is consistent with, what it cannot separate, what would
 *              settle it. The validator rejects a reading that states a number.
 *
 * The evidence renders with no model at all. The reading is asked for once,
 * stored on the envelope (`forensicInterpretation`, beside `monitoringReport`),
 * and shown again on every visit — regenerating is never the price of
 * reopening, the same rule the narrative and the report sections follow. A
 * stored reading whose fingerprint no longer matches the session is shown,
 * labeled stale, with the offer to read again; it is never silently reused
 * and never silently dropped.
 *
 * ── Acceptance is the third fact, and it is the assessor's ─────────────
 * A validated reading means the model produced it and the gates passed it. It
 * does NOT mean anyone agreed with it, and nothing reaches the monitoring
 * report until somebody with a credential says so here. Accept, dismiss and
 * reopen write `forensicReview` (see `forensicReview.js`); the report reads
 * only accepted decisions that are still about this session and still describe
 * the reading on offer.
 *
 * What this panel does not do: enter annotations (no producer exists yet), or
 * touch the per-chart "Explain this pattern" action.
 */

import { useMemo, useState } from 'react'
import * as V3 from '../../styles/tokens'
import AiAction from '../ui/AiAction'
import InlineError from '../ui/InlineError'
import StatusPill from '../ui/StatusPill'
import { buildForensicBundle, forensicFreshness } from '../../utils/forensicBundle'
import { generateForensicInterpretation } from '../../engines/forensicInterpret'
import {
  patternTitle, patternEvidence, IMPORTANCE_LABELS, REJECTION_LABELS,
} from '../../utils/forensicPresent'
import {
  reviewedPatterns, acceptInterpretation, dismissInterpretation, reopenInterpretation,
} from '../../utils/forensicReview'
import { siteOffsetMinutes } from './MonitoringReportSheet'

const TEXT = 'var(--text)', SUB = 'var(--sub)', BORDER = 'var(--border)', ACCENT = 'var(--accent)'

// Importance is how much of the reviewer's attention a pattern is worth — not
// a severity, and not colored like one. Gray, the accent, and the same amber
// the data-quality verdict uses for "look at this".
const IMPORTANCE_TONE = { routine: V3.STATUS.draft, worth_review: ACCENT, priority_review: '#FBBF24' }

/**
 * The bundle input, from what the page already holds.
 *
 * The deployment context comes from the last monitoring report's session when
 * one was generated — that is where the assessor typed where the instrument
 * sat and what it was spanned against — and is blank otherwise. Nothing here
 * is fetched or guessed; a blank context produces a bundle with no deployment
 * block, which is the honest description of a session nobody has described.
 */
export function forensicInputFromEnvelope(env, { calibrationGas = '' } = {}) {
  const e = env && typeof env === 'object' ? env : null
  const session = (e && e.monitoringReport && e.monitoringReport.session) || null
  const primary = e && Array.isArray(e.datasets) ? (e.datasets.find((d) => d && d.role === 'indoor') || e.datasets[0]) : null
  const start = primary && primary.summary ? primary.summary.start : null
  return {
    sensorData: e,
    annotations: (e && e.events) || [],
    context: session ? {
      objective: session.objective,
      location: session.location,
      instrument: session.instrument,
      calibration: session.calibration,
    } : {},
    utcOffsetMin: session && Number.isFinite(session.utcOffsetMin) ? session.utcOffsetMin : siteOffsetMinutes(start),
    calibrationGas: calibrationGas || (session && session.calibration && session.calibration.gas) || '',
  }
}

/**
 * The deterministic line under a pattern heading.
 *
 * Each fragment is one unbreakable unit and the separator TRAILS the fragment
 * before it, never leads the next one — at phone width the line wraps, and a
 * continuation line beginning with a lone middle dot reads as a bullet list
 * that lost its first item.
 */
function EvidenceLine({ parts }) {
  if (!parts.length) return null
  return (
    <div style={{ ...V3.T.caption, marginTop: 4, lineHeight: '18px', display: 'flex', flexWrap: 'wrap', columnGap: 0 }}>
      <span style={{ ...V3.T.micro, marginRight: 8, lineHeight: '18px' }}>Evidence</span>
      {parts.map((part, i) => (
        <span key={i} style={{ whiteSpace: 'nowrap', color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
          {part}
          {i < parts.length - 1 && <span style={{ color: SUB, margin: '0 6px' }} aria-hidden="true">·</span>}
        </span>
      ))}
    </div>
  )
}

const DECISION_TONE = { accepted: V3.STATUS.ready, dismissed: V3.STATUS.draft }
const DECISION_LABEL = { accepted: 'Accepted for report', dismissed: 'Dismissed' }
const INELIGIBLE_NOTE = {
  stale: 'Accepted against an earlier version of this session, so it will not be included.',
  superseded: 'Accepted against different wording than the reading above, so it will not be included.',
  digits_in_prose: 'The accepted wording states a figure, so it will not be included. Figures come from the analysis.',
}

/** A text action in the row's own idiom — the page uses these throughout. */
const RowAction = ({ onClick, children, tone }) => (
  <button type="button" onClick={onClick} style={{
    background: 'none', border: 'none', padding: '6px 0', font: 'inherit', fontSize: 12,
    fontWeight: 600, color: tone || ACCENT, cursor: 'pointer', minHeight: 32,
  }}>{children}</button>
)

/** Jasper's reading of one pattern. Words, with the missing context named. */
function Reading({ item, pattern, row, onAccept, onDismiss, onReopen }) {
  const gaps = new Map((pattern.missingContext || []).map((m) => [m.id, m]))
  const named = (item.missing_context_ids || []).map((id) => gaps.get(id)).filter(Boolean)
  const status = row ? row.status : 'unreviewed'
  const notes = row && status === 'accepted' ? row.ineligible : []
  return (
    <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${V3.BORDER_ACCENT}` }} data-testid="forensic-reading">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={V3.T.bodyStrong}>{item.title}</div>
        <StatusPill tone={IMPORTANCE_TONE[item.importance] || V3.STATUS.draft}>{IMPORTANCE_LABELS[item.importance] || item.importance}</StatusPill>
      </div>
      <div style={{ ...V3.T.body, marginTop: 6, lineHeight: 1.55 }}>{item.interpretation}</div>
      {item.alternative_explanations && item.alternative_explanations.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={V3.T.micro}>Also consistent with</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {item.alternative_explanations.map((a, i) => <li key={i} style={{ ...V3.T.caption, color: TEXT, lineHeight: 1.6 }}>{a}</li>)}
          </ul>
        </div>
      )}
      {named.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={V3.T.micro}>Would help separate them</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {named.map((m) => <li key={m.id} style={{ ...V3.T.caption, color: TEXT, lineHeight: 1.6 }}><strong style={{ fontWeight: 600 }}>{m.label}.</strong> {m.why}</li>)}
          </ul>
        </div>
      )}
      {item.recommended_reviews && item.recommended_reviews.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={V3.T.micro}>To settle it</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {item.recommended_reviews.map((r, i) => <li key={i} style={{ ...V3.T.caption, color: TEXT, lineHeight: 1.6 }}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* The assessor's decision. Nothing reaches the report without one. */}
      {onAccept && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }} data-testid="forensic-decision">
          {status === 'unreviewed' ? (
            <>
              <RowAction onClick={onAccept}>Accept for report</RowAction>
              <RowAction onClick={onDismiss} tone={SUB}>Dismiss</RowAction>
            </>
          ) : (
            <>
              <StatusPill tone={DECISION_TONE[status]} dim={status === 'dismissed'}>{DECISION_LABEL[status]}</StatusPill>
              <RowAction onClick={onReopen} tone={SUB}>Reopen</RowAction>
            </>
          )}
        </div>
      )}
      {notes.map((r) => (
        <div key={r} role="status" style={{ ...V3.T.captionDim, marginTop: 6, lineHeight: 1.5 }}>{INELIGIBLE_NOTE[r]}</div>
      ))}
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.env the normalized sensor envelope
 * @param {string} [props.calibrationGas] the PID span gas the page already holds
 * @param {(record: object) => void} props.onPersist store the record on the envelope
 * @param {(review: object) => void} [props.onReview] store the review on the envelope
 * @param {Function} [props.generate] injection seam; defaults to the real generation path
 */
export default function ForensicsPanel({ env, calibrationGas = '', onPersist, onReview, generate = generateForensicInterpretation }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const input = useMemo(() => forensicInputFromEnvelope(env, { calibrationGas }), [env, calibrationGas])
  // The bundle is deterministic and pure, so it is rebuilt from the envelope
  // rather than stored: the evidence on this screen is always the evidence
  // for the data that is actually loaded.
  const bundle = useMemo(() => {
    try { return buildForensicBundle(input) } catch { return null }
  }, [input])
  const stored = (env && env.forensicInterpretation) || null
  const review = (env && env.forensicReview) || null
  const freshness = useMemo(() => (stored && bundle ? forensicFreshness(stored, bundle) : null), [stored, bundle])
  // One row per detected pattern: what was found, what was said about it, what
  // the assessor decided, and whether that decision still counts.
  const rows = useMemo(() => (bundle ? reviewedPatterns({ bundle, record: stored, review }) : []), [bundle, stored, review])
  const patterns = (bundle && bundle.patterns) || []
  const acceptedCount = rows.filter((r) => r.eligible).length

  const run = async () => {
    setBusy(true); setError(null)
    try {
      const r = await generate(input)
      if (r && r.record) onPersist(r.record)
      if (r && r.error) setError(r.error)
    } catch {
      setError('This session could not be interpreted. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const status = stored && stored.validation ? stored.validation.status : null
  const stale = !!(stored && freshness && !freshness.fresh)
  const reasons = stored && stored.validation ? [...new Set(stored.validation.reasons || [])] : []

  const decide = (fn) => (row) => {
    if (typeof onReview !== 'function') return
    onReview(fn(review, {
      patternId: row.patternId,
      interpretation: row.interpretation,
      fingerprint: bundle && bundle.fingerprint,
      interpretationVersion: stored && stored.version,
    }))
  }
  const accept = decide(acceptInterpretation)
  const dismiss = decide(dismissInterpretation)
  const reopen = (row) => { if (typeof onReview === 'function') onReview(reopenInterpretation(review, row.patternId)) }

  return (
    <div>
      {/* What was found — deterministic, always shown. */}
      <div style={{ ...V3.T.micro, margin: '22px 0 2px' }}>Patterns detected</div>
      {patterns.length === 0 ? (
        <div style={{ paddingTop: 12, borderTop: `1px solid ${V3.BORDER_SUBTLE}` }}>
          <div style={V3.T.bodyDim}>No forensic patterns were detected in this session.</div>
          <div style={{ ...V3.T.captionDim, marginTop: 6, lineHeight: 1.5 }}>
            A pattern needs a trace long enough to show a repeating shape, an abrupt change, or a comparison against
            an outdoor or zone dataset. Add a comparison dataset or mark occupancy under Analysis and this view updates.
          </div>
        </div>
      ) : (
        <div style={{ paddingTop: 4 }}>
          {rows.map((row) => {
            const p = row.pattern
            const item = row.interpretation
            // A stale RECORD is dimmed and offers no decision: accepting a
            // reading of a session that no longer exists is not a decision
            // anyone should be able to make by mistake.
            const reading = item && (
              <Reading
                item={item} pattern={p} row={row}
                onAccept={stale || !onReview ? null : () => accept(row)}
                onDismiss={() => dismiss(row)}
                onReopen={() => reopen(row)}
              />
            )
            return (
              <div key={row.patternId} style={{ paddingTop: 14, paddingBottom: 14, borderTop: `1px solid ${V3.BORDER_SUBTLE}` }} data-testid="forensic-pattern">
                <div style={V3.T.bodyStrong}>{patternTitle(p)}</div>
                <EvidenceLine parts={patternEvidence(p, bundle)} />
                {stale ? <div style={{ opacity: 0.6 }}>{reading}</div> : reading}
              </div>
            )
          })}
        </div>
      )}

      {/* The reading — asked for once, stored, labeled. */}
      {patterns.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
          {error && <InlineError style={{ marginBottom: 10 }}>{error}</InlineError>}

          {stale && (
            <div role="status" style={{ ...V3.T.caption, marginBottom: 10, lineHeight: 1.5 }}>
              This reading describes an earlier version of this session — the data, occupancy or a comparison
              dataset has changed since it was produced. It is shown dimmed until it is read again.
            </div>
          )}
          {!stale && status === 'empty' && (
            <div role="status" style={{ ...V3.T.caption, marginBottom: 10, lineHeight: 1.5 }}>
              Jasper read this session and found nothing that needed raising beyond the evidence above.
            </div>
          )}
          {!stale && status === 'rejected' && (
            <div role="status" style={{ marginBottom: 10 }}>
              <div style={{ ...V3.T.caption, color: TEXT, lineHeight: 1.5 }}>Jasper&apos;s response could not be used. Nothing from it is shown.</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {reasons.map((r) => <li key={r} style={{ ...V3.T.captionDim, lineHeight: 1.6 }}>{REJECTION_LABELS[r] || r}</li>)}
              </ul>
            </div>
          )}
          {!stale && status === 'partial' && (
            <div role="status" style={{ marginBottom: 10 }}>
              <div style={{ ...V3.T.caption, lineHeight: 1.5 }}>
                {stored.validation.rejected} of {stored.validation.accepted + stored.validation.rejected} readings were set aside:
              </div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {reasons.map((r) => <li key={r} style={{ ...V3.T.captionDim, lineHeight: 1.6 }}>{REJECTION_LABELS[r] || r}</li>)}
              </ul>
            </div>
          )}

          {/* The caption and the action stack on a phone rather than squeezing
              the sentence into a six-line column beside a two-word button. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ ...V3.T.captionDim, lineHeight: 1.5, minWidth: 220, flex: 1 }}>
              {stored && !stale
                ? `AI-assisted reading — verify before use. The figures above come from the analysis; the reading is an interpretation of them. ${acceptedCount ? `${acceptedCount} accepted for the monitoring report.` : 'Nothing enters the monitoring report until you accept it.'}`
                : 'Jasper reads the patterns above and says what each is consistent with, what it cannot separate, and what would settle it. It states no figures; those stay on the evidence lines.'}
            </div>
            <AiAction
              label={busy ? 'Reading…' : stored ? 'Read again' : 'Read the patterns'}
              title={busy ? 'Reading the patterns' : 'Ask Jasper to read the patterns'}
              disabled={busy}
              onClick={run}
            />
          </div>
        </div>
      )}
    </div>
  )
}
