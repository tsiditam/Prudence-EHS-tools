/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * PreReviewCheckPanel — surfaces deterministic discrepancies the
 * IH should resolve (or at least eyeball) before submitting the
 * report to the CIH. Runs Layer 1 of the pre-review validator
 * (src/utils/preReviewValidator.js).
 *
 *   <PreReviewCheckPanel ctx={ctx} onJump={(anchor) => focus(anchor)} />
 *
 * UX:
 *   - "Run pre-review check" button when there are no issues / not
 *     yet checked.
 *   - After run: collapsed list of issues grouped by severity
 *     (🔴 blocking · 🟡 warning · 🔵 suggestion). Each row expands
 *     for the detail text + a "Jump to" link when the anchor points
 *     at something the parent can navigate to.
 *   - Re-run after fix re-runs the validator on the latest ctx.
 *   - All-clear state shows a calm green confirmation card.
 *
 * Layer 1 is fully deterministic — runs in <50ms on a typical
 * assessment so no spinner is needed for the synchronous path.
 */

import { useMemo, useState } from 'react'
import { runPreReviewChecks, summarizeIssues } from '../utils/preReviewValidator'

const SEVERITY_META = {
  blocking: {
    label: 'Blocking',
    color: 'var(--danger, #EF4444)',
    background: 'color-mix(in srgb, #EF4444 10%, transparent)',
    border: 'color-mix(in srgb, #EF4444 35%, transparent)',
    glyph: '●',
    note: 'Must be resolved before sending to the CIH.',
  },
  warning: {
    label: 'Warning',
    color: 'var(--warn, #F59E0B)',
    background: 'color-mix(in srgb, #F59E0B 10%, transparent)',
    border: 'color-mix(in srgb, #F59E0B 35%, transparent)',
    glyph: '●',
    note: 'Likely a defect — review before submitting.',
  },
  suggestion: {
    label: 'Suggestion',
    color: 'var(--accent, #22D3EE)',
    background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
    border: 'color-mix(in srgb, var(--accent) 28%, transparent)',
    glyph: '●',
    note: 'Defensibility nudge — won\'t block submission.',
  },
}

export default function PreReviewCheckPanel({ ctx, onJump, onSubmitToCih }) {
  const [hasRun, setHasRun] = useState(false)
  const [issues, setIssues] = useState([])
  const [expanded, setExpanded] = useState(() => new Set())

  const summary = useMemo(() => summarizeIssues(issues), [issues])

  const runCheck = () => {
    const next = runPreReviewChecks(ctx || {})
    setIssues(next)
    setHasRun(true)
    setExpanded(new Set())
  }

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: hasRun ? 14 : 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            Pre-review check
          </div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2, lineHeight: 1.5 }}>
            Catches duplicates, missing photo refs, citation anti-patterns, and other discrepancies before the report goes to the CIH.
          </div>
        </div>
        <button
          type="button"
          onClick={runCheck}
          style={{
            background: hasRun ? 'transparent' : 'var(--accent-fill)',
            border: hasRun ? '1px solid var(--border)' : 'none',
            borderRadius: 10,
            color: hasRun ? 'var(--accent)' : 'var(--on-accent-fill)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', padding: '8px 14px', flexShrink: 0,
            letterSpacing: '-0.1px',
            WebkitTapHighlightColor: 'transparent',
          }}>
          {hasRun ? 'Re-run check' : 'Run check'}
        </button>
      </div>

      {hasRun && summary.totalCount === 0 && (
        <div style={{
          padding: '12px 14px',
          background: 'color-mix(in srgb, var(--success, #22C55E) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--success, #22C55E) 32%, transparent)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'var(--success, #22C55E)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            ✓
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
              No discrepancies found
            </div>
            <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>
              Pre-review check passed. Final IH judgment still required before delivery.
            </div>
          </div>
          {onSubmitToCih && (
            <button
              type="button"
              onClick={onSubmitToCih}
              style={{
                background: 'var(--accent-fill)', border: 'none',
                borderRadius: 10, color: 'var(--on-accent-fill)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', padding: '8px 14px', flexShrink: 0,
                letterSpacing: '-0.1px',
              }}>
              Submit for CIH review
            </button>
          )}
        </div>
      )}

      {hasRun && summary.totalCount > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <SeverityBadge severity="blocking" count={summary.blockingCount} />
            <SeverityBadge severity="warning" count={summary.warningCount} />
            <SeverityBadge severity="suggestion" count={summary.suggestionCount} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                expanded={expanded.has(issue.id)}
                onToggle={() => toggle(issue.id)}
                onJump={onJump}
              />
            ))}
          </div>

          {onSubmitToCih && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--sub)', lineHeight: 1.5 }}>
                {summary.hasBlockers
                  ? `${summary.blockingCount} blocking issue${summary.blockingCount === 1 ? '' : 's'} must be resolved before submission.`
                  : 'No blocking issues — you can submit. Warnings + suggestions will be logged in the audit trail.'}
              </div>
              <button
                type="button"
                onClick={onSubmitToCih}
                disabled={summary.hasBlockers}
                style={{
                  background: summary.hasBlockers ? 'var(--card)' : 'var(--accent-fill)',
                  border: summary.hasBlockers ? '1px solid var(--border)' : 'none',
                  borderRadius: 10,
                  color: summary.hasBlockers ? 'var(--dim)' : 'var(--on-accent-fill)',
                  fontSize: 12, fontWeight: 700, cursor: summary.hasBlockers ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', padding: '8px 14px', flexShrink: 0,
                  letterSpacing: '-0.1px',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                Submit for CIH review
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SeverityBadge({ severity, count }) {
  const meta = SEVERITY_META[severity]
  if (!meta || count === 0) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px',
      background: meta.background,
      border: `1px solid ${meta.border}`,
      borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      color: meta.color,
      letterSpacing: '0.3px',
    }}>
      <span style={{ color: meta.color, fontSize: 8 }}>{meta.glyph}</span>
      {count} {meta.label.toUpperCase()}
    </span>
  )
}

function IssueRow({ issue, expanded, onToggle, onJump }) {
  const meta = SEVERITY_META[issue.severity] || SEVERITY_META.suggestion
  const canJump = !!onJump && !!issue.anchor
  return (
    <div style={{
      background: meta.background,
      border: `1px solid ${meta.border}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left',
          padding: '10px 12px',
          background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 10,
          WebkitTapHighlightColor: 'transparent',
        }}>
        <span style={{
          color: meta.color, fontSize: 10, flexShrink: 0,
        }}>{meta.glyph}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.4 }}>
          {issue.title}
        </span>
        <span style={{
          fontSize: 10, color: 'var(--sub)', flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
        }}>▾</span>
      </button>
      {expanded && (
        <div style={{
          padding: '0 12px 12px 30px',
          fontSize: 12, color: 'var(--sub)', lineHeight: 1.55,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          <div>{issue.detail}</div>
          {canJump && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onJump(issue.anchor) }}
              style={{
                marginTop: 8, background: 'transparent', border: 'none',
                color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                textDecoration: 'underline',
              }}>
              Jump to {issue.anchor.zone || issue.anchor.type}
            </button>
          )}
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--dim)', fontStyle: 'italic' }}>
            {meta.note}
          </div>
        </div>
      )}
    </div>
  )
}
