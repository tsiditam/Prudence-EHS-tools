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
 * ── When, and where on the chart ───────────────────────────────────────
 * Beneath the evidence line sits a When line: the pattern's occurrence
 * window(s), rendered by `forensicPresent.patternWhen` from the detector's
 * own `occurrenceWindows` — never from the reading, which may describe a
 * time but is not the source of one. A recurring cycle shows its usual hours
 * and a representative day with the rest behind "+ N more occurrences"; an
 * aggregate shows a count and a span with "View occurrences"; an event shows
 * its window. The card stays one line; the list is opt-in.
 *
 * "View on chart" hands the page a navigation REQUEST — pattern, occurrence,
 * datasets, parameters, start, end — built by `occurrenceNavigation` from the
 * CURRENT bundle. The panel does not know how charts work and the detector
 * does not know React; `SensorDataPage` owns what happens next. Because the
 * request is resolved against the live bundle, a stale reading cannot send
 * anyone to a window the current data no longer contains.
 *
 * What this panel does not do: enter annotations (no producer exists yet), or
 * touch the per-chart "Explain this pattern" action.
 */

import { useMemo, useState } from 'react'
import * as V3 from '../../styles/tokens'
import AiAction from '../ui/AiAction'
import JasperActivity, { JASPER_REVEAL_CLASS } from '../ui/JasperActivity'
import InlineError from '../ui/InlineError'
import StatusPill from '../ui/StatusPill'
import { buildForensicBundle, forensicFreshness } from '../../utils/forensicBundle'
import { generateForensicInterpretation } from '../../engines/forensicInterpret'
import {
  patternTitle, patternEvidence, patternWhen, patternOccurrences, occurrenceNavigation,
  patternAgreement, IMPORTANCE_LABELS, REJECTION_LABELS,
} from '../../utils/forensicPresent'
import { detectTemporalRelationships, relationshipsByPattern } from '../../engines/integrity/temporal-relationship.js'
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

/**
 * The When line: one deterministic sentence, and the affordances beside it.
 *
 * `when` is `patternWhen`'s result. `onView(occurrenceId?)` navigates; absent
 * (a read-only panel) the line still states the timing and offers nothing.
 * The occurrence list is opt-in and sits BELOW the line, so a thirty-day cycle
 * never puts thirty timestamps on the card.
 */
function WhenLine({ when, expanded, onToggle, onView }) {
  if (!when) return null
  const many = when.count > 1
  const link = { background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 600, color: ACCENT, cursor: 'pointer', whiteSpace: 'nowrap' }
  return (
    <div data-testid="forensic-when">
      <div style={{ ...V3.T.caption, marginTop: 4, lineHeight: '18px', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12 }}>
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span style={{ ...V3.T.micro, marginRight: 8, lineHeight: '18px' }}>When</span>
          <span style={{ color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{when.primary}</span>
        </span>
        {onView && when.representative && (
          <button type="button" style={link} onClick={() => onView(when.representative.id)}>View on chart</button>
        )}
        {many && (
          <button type="button" style={link} onClick={onToggle} aria-expanded={expanded}>
            {expanded ? 'Hide occurrences' : (when.secondary || 'View occurrences')}
          </button>
        )}
      </div>
      {expanded && many && (
        <ul data-testid="forensic-occurrences" style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none' }}>
          {when.occurrences.map((w) => (
            <li key={w.id} style={{ ...V3.T.caption, display: 'flex', alignItems: 'baseline', gap: 12, lineHeight: '22px' }}>
              <span style={{ color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
                {w.label}{w.representative ? <span style={{ color: SUB }}> · representative</span> : null}
              </span>
              {onView && <button type="button" style={link} onClick={() => onView(w.id)}>View</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Where a reported complaint period and this pattern's occurrences agree.
 *
 * One line, and only when the comparison reached an answer — see
 * `patternAgreement`, which returns null for everything else so that a
 * session whose zone-to-logger association is unknown, which is most of
 * them, shows nothing here rather than a row of caveats.
 */
function AgreementLine({ agreement }) {
  if (!agreement) return null
  return (
    <div style={{ ...V3.T.caption, marginTop: 4, lineHeight: '18px', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline' }} data-testid="forensic-agreement">
      <span style={{ ...V3.T.micro, marginRight: 8, lineHeight: '18px' }}>{agreement.label}</span>
      {agreement.parts.map((part, i) => (
        <span key={i} style={{ color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
          {part}
          {i < agreement.parts.length - 1 && <span style={{ color: SUB, margin: '0 6px' }} aria-hidden="true">·</span>}
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
function Reading({ item, pattern, row, onAccept, onDismiss, onReopen, arriving = false }) {
  const gaps = new Map((pattern.missingContext || []).map((m) => [m.id, m]))
  const named = (item.missing_context_ids || []).map((id) => gaps.get(id)).filter(Boolean)
  const status = row ? row.status : 'unreviewed'
  const notes = row && status === 'accepted' ? row.ineligible : []
  return (
    <div
      // A reading that has just been produced eases in as the activity
      // status eases out; one reopened from storage simply renders.
      className={arriving ? JASPER_REVEAL_CLASS : undefined}
      style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${V3.BORDER_ACCENT}` }} data-testid="forensic-reading">
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
 * @param {object[]} [props.zones] the walkthrough zones, for reconciling a
 *   reported complaint period against when a pattern occurred. Absent, no
 *   reconciliation is attempted and no agreement line renders.
 * @param {object|null} [props.investigation] the derived investigation state,
 *   read only to decide whether a parameter is linked to a live differential
 * @param {(request: object) => void} [props.onNavigate] take the assessor to a
 *   chart window: `{ patternId, occurrenceId, datasetIds, params, start, end,
 *   eventIds, windows, title, label }`. Absent, no chart actions are offered.
 * @param {Function} [props.generate] injection seam; defaults to the real generation path
 */
export default function ForensicsPanel({ env, calibrationGas = '', zones = [], investigation = null, onPersist, onReview, onNavigate, generate = generateForensicInterpretation }) {
  // What Jasper is doing at the foot of the panel: nothing, reading, or
  // finishing. `done` and `failed` are the moment between the answer
  // arriving and the activity status having faded — the status owns that
  // exit and reports when it is over. The request itself is one round trip
  // with no intermediate stages, so the status keeps its own time.
  const [phase, setPhase] = useState('idle')
  const busy = phase !== 'idle'
  const [error, setError] = useState(null)
  // Which patterns have their occurrence list open. Keyed by pattern id so a
  // re-analysis that keeps a pattern keeps its list open too.
  const [expanded, setExpanded] = useState({})

  const input = useMemo(() => forensicInputFromEnvelope(env, { calibrationGas }), [env, calibrationGas])
  // The bundle is deterministic and pure, so it is rebuilt from the envelope
  // rather than stored: the evidence on this screen is always the evidence
  // for the data that is actually loaded.
  const bundle = useMemo(() => {
    try { return buildForensicBundle(input) } catch { return null }
  }, [input])
  // Cross-evidence reconciliation, derived like everything else on this
  // screen and stored nowhere. Read-only over the bundle: it adds no
  // pattern, changes no window, and cannot make one exist.
  const relationships = useMemo(() => {
    if (!bundle) return new Map()
    try { return relationshipsByPattern(detectTemporalRelationships({ zones, forensics: bundle, investigation })) } catch { return new Map() }
  }, [bundle, zones, investigation])
  const stored = (env && env.forensicInterpretation) || null
  const review = (env && env.forensicReview) || null
  const freshness = useMemo(() => (stored && bundle ? forensicFreshness(stored, bundle) : null), [stored, bundle])
  // One row per detected pattern: what was found, what was said about it, what
  // the assessor decided, and whether that decision still counts.
  const rows = useMemo(() => (bundle ? reviewedPatterns({ bundle, record: stored, review }) : []), [bundle, stored, review])
  const patterns = (bundle && bundle.patterns) || []
  const acceptedCount = rows.filter((r) => r.eligible).length

  const run = async () => {
    setPhase('reading'); setError(null)
    let produced = false
    try {
      const r = await generate(input)
      if (r && r.record) { onPersist(r.record); produced = true }
      if (r && r.error) setError(r.error)
    } catch {
      setError('This session could not be interpreted. Please try again.')
    } finally {
      setPhase(produced ? 'done' : 'failed')
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
  // A navigation request, resolved against the CURRENT pattern. An occurrence
  // that is not one of this pattern's windows resolves to nothing, so a link
  // built against earlier data cannot land on a time it no longer describes.
  const view = (pattern) => (occurrenceId) => {
    if (typeof onNavigate !== 'function') return
    const req = occurrenceNavigation(pattern, occurrenceId)
    if (!req) return
    const occ = patternOccurrences(pattern, bundle).find((w) => w.id === req.occurrenceId)
    onNavigate({ ...req, title: patternTitle(pattern), label: occ ? occ.label : null })
  }

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
                item={item} pattern={p} row={row} arriving={busy}
                onAccept={stale || !onReview ? null : () => accept(row)}
                onDismiss={() => dismiss(row)}
                onReopen={() => reopen(row)}
              />
            )
            return (
              <div key={row.patternId} style={{ paddingTop: 14, paddingBottom: 14, borderTop: `1px solid ${V3.BORDER_SUBTLE}` }} data-testid="forensic-pattern">
                <div style={V3.T.bodyStrong}>{patternTitle(p)}</div>
                <EvidenceLine parts={patternEvidence(p, bundle)} />
                <WhenLine
                  when={patternWhen(p, bundle)}
                  expanded={!!expanded[row.patternId]}
                  onToggle={() => setExpanded((e) => ({ ...e, [row.patternId]: !e[row.patternId] }))}
                  onView={typeof onNavigate === 'function' ? view(p) : null}
                />
                <AgreementLine agreement={patternAgreement(relationships.get(row.patternId))} />
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
            {busy ? (
              <JasperActivity
                context="logger-forensics"
                active={phase === 'reading'}
                brighten={phase === 'done'}
                onSettled={() => setPhase('idle')}
              />
            ) : (
              <AiAction
                label={stored ? 'Read again' : 'Read the patterns'}
                title="Ask Jasper to read the patterns"
                onClick={run}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
