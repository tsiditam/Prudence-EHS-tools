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
  // Per-issue IH overrides. The deterministic validator's "blocking"
  // tier is a heuristic — sometimes wrong, sometimes the IH has
  // domain context the rule can't see (e.g. the placeholder name
  // pattern matches a real assessor whose initials genuinely are
  // "X" + period). Allowing an explicit, justified override keeps
  // the licensed IH in control while logging the override to the
  // audit trail so the CIH reviewer sees what was bypassed and why.
  //
  // Shape: Map<issueId, { justification, overriddenAt }>
  const [overrides, setOverrides] = useState(() => new Map())
  // Which issue (if any) has the inline justification textarea open.
  const [overrideEditing, setOverrideEditing] = useState(null)
  const [overrideDraft, setOverrideDraft] = useState('')

  const summary = useMemo(() => summarizeIssues(issues), [issues])

  // Effective blocker count = total blockers - those overridden.
  // Submit enables when this hits 0 (zero unblocked blockers).
  const effectiveBlockers = useMemo(() => {
    return summary.blocking.filter((i) => !overrides.has(i.id)).length
  }, [summary.blocking, overrides])
  const overriddenBlockers = summary.blockingCount - effectiveBlockers
  const canSubmit = effectiveBlockers === 0

  const runCheck = () => {
    const next = runPreReviewChecks(ctx || {})
    setIssues(next)
    setHasRun(true)
    setExpanded(new Set())
    // Re-running invalidates prior overrides — issue IDs are
    // derived from content, so if the underlying defect is fixed
    // the override naturally drops with the issue. If the defect
    // is unchanged, the same id will reappear and the override is
    // re-applied. Conservative default: clear overrides on re-run
    // so the IH consciously re-acknowledges each one.
    setOverrides(new Map())
    setOverrideEditing(null)
    setOverrideDraft('')
  }

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startOverride = (id) => {
    setOverrideEditing(id)
    setOverrideDraft('')
    // Ensure the row is expanded so the textarea is visible.
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }
  const cancelOverride = () => {
    setOverrideEditing(null)
    setOverrideDraft('')
  }
  const saveOverride = (id) => {
    const justification = overrideDraft.trim()
    if (!justification) return
    setOverrides((prev) => {
      const next = new Map(prev)
      next.set(id, {
        justification,
        overriddenAt: new Date().toISOString(),
      })
      return next
    })
    setOverrideEditing(null)
    setOverrideDraft('')
  }
  const removeOverride = (id) => {
    setOverrides((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  // When the IH submits, hand the parent the full audit context so
  // it can log the override decisions alongside the report.
  const handleSubmit = () => {
    if (!canSubmit) return
    const overrideList = Array.from(overrides.entries()).map(([id, meta]) => {
      const issue = issues.find((i) => i.id === id) || null
      return { id, issue, justification: meta.justification, overriddenAt: meta.overriddenAt }
    })
    onSubmitToCih?.({ issues, overrides: overrideList })
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
              onClick={handleSubmit}
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
                override={overrides.get(issue.id) || null}
                overrideEditing={overrideEditing === issue.id}
                overrideDraft={overrideDraft}
                onChangeOverrideDraft={setOverrideDraft}
                onStartOverride={() => startOverride(issue.id)}
                onSaveOverride={() => saveOverride(issue.id)}
                onCancelOverride={cancelOverride}
                onRemoveOverride={() => removeOverride(issue.id)}
              />
            ))}
          </div>

          {onSubmitToCih && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--sub)', lineHeight: 1.5 }}>
                {!summary.hasBlockers
                  ? 'No blocking issues — you can submit. Warnings + suggestions will be logged in the audit trail.'
                  : canSubmit
                    ? `${overriddenBlockers} blocker${overriddenBlockers === 1 ? '' : 's'} overridden with justification. The override${overriddenBlockers === 1 ? '' : 's'} will appear in the audit trail and on the CIH review.`
                    : `${effectiveBlockers} blocking issue${effectiveBlockers === 1 ? '' : 's'} remaining. Resolve or override each before submission.`}
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  background: !canSubmit ? 'var(--card)' : 'var(--accent-fill)',
                  border: !canSubmit ? '1px solid var(--border)' : 'none',
                  borderRadius: 10,
                  color: !canSubmit ? 'var(--dim)' : 'var(--on-accent-fill)',
                  fontSize: 12, fontWeight: 700, cursor: !canSubmit ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', padding: '8px 14px', flexShrink: 0,
                  letterSpacing: '-0.1px',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {overriddenBlockers > 0 ? 'Submit with overrides' : 'Submit for CIH review'}
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

function IssueRow({
  issue, expanded, onToggle, onJump,
  override, overrideEditing, overrideDraft,
  onChangeOverrideDraft, onStartOverride, onSaveOverride, onCancelOverride, onRemoveOverride,
}) {
  const meta = SEVERITY_META[issue.severity] || SEVERITY_META.suggestion
  const canJump = !!onJump && !!issue.anchor
  const isOverridable = issue.severity === 'blocking'
  const isOverridden = !!override
  return (
    <div data-testid={`issue-row-${issue.id}`} style={{
      background: meta.background,
      border: `1px solid ${meta.border}`,
      borderRadius: 10,
      overflow: 'hidden',
      // Visually dim an overridden blocker so the IH sees at a
      // glance which rows are still active vs which have been
      // acknowledged and waived through.
      opacity: isOverridden ? 0.7 : 1,
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
          {isOverridden && (
            <span data-testid={`override-pill-${issue.id}`} style={{
              marginLeft: 8,
              padding: '1px 8px',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--sub) 18%, transparent)',
              color: 'var(--sub)',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.3px',
              textTransform: 'uppercase',
              verticalAlign: 'middle',
            }}>
              Overridden
            </span>
          )}
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

          {/* When the IH has overridden this blocker, show the
              justification + a Remove-override link. */}
          {isOverridden && (
            <div data-testid={`override-note-${issue.id}`} style={{
              marginTop: 10, padding: '8px 10px',
              background: 'color-mix(in srgb, var(--sub) 8%, transparent)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 10, color: 'var(--sub)', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 4 }}>
                Override · IH justification
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', fontStyle: 'normal', lineHeight: 1.55 }}>
                {override.justification}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemoveOverride?.() }}
                style={{
                  marginTop: 8, background: 'transparent', border: 'none',
                  color: 'var(--accent)', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                  textDecoration: 'underline',
                }}>
                Remove override (re-block)
              </button>
            </div>
          )}

          {/* Inline justification textarea — opened by clicking
              the row's Override button. Save requires a non-empty
              trimmed justification (forces deliberation, satisfies
              the audit trail's "why" field). */}
          {overrideEditing && (
            <div style={{
              marginTop: 10, padding: 10,
              background: 'var(--card)',
              border: `1px solid ${meta.border}`,
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, color: 'var(--sub)', fontWeight: 600, marginBottom: 6 }}>
                Why is this OK to override?
              </div>
              <textarea
                value={overrideDraft}
                onChange={(e) => onChangeOverrideDraft?.(e.target.value)}
                placeholder="Explain why this blocker doesn't apply or has been mitigated outside the system. The justification appears in the audit trail and on the CIH review."
                rows={3}
                data-testid={`override-textarea-${issue.id}`}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '8px 10px', fontSize: 12, lineHeight: 1.5,
                  background: 'var(--surface)', color: 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  fontFamily: 'inherit', resize: 'vertical', minHeight: 60,
                  outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCancelOverride?.() }}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--sub)', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', padding: '6px 10px',
                  }}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSaveOverride?.() }}
                  disabled={!overrideDraft.trim()}
                  data-testid={`override-save-${issue.id}`}
                  style={{
                    background: overrideDraft.trim() ? 'var(--accent-fill)' : 'var(--card)',
                    border: overrideDraft.trim() ? 'none' : '1px solid var(--border)',
                    color: overrideDraft.trim() ? 'var(--on-accent-fill)' : 'var(--dim)',
                    fontSize: 11, fontWeight: 700,
                    cursor: overrideDraft.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit', padding: '6px 12px',
                    borderRadius: 6, letterSpacing: '-0.1px',
                  }}>
                  Save override
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {canJump && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onJump(issue.anchor) }}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                  textDecoration: 'underline',
                }}>
                Jump to {issue.anchor.zone || issue.anchor.type}
              </button>
            )}
            {/* Override button — visible only for blocking issues
                that aren't yet overridden and aren't currently
                being edited. Other severities (warning /
                suggestion) don't gate submission so they don't
                need overrides. */}
            {isOverridable && !isOverridden && !overrideEditing && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onStartOverride?.() }}
                data-testid={`override-start-${issue.id}`}
                style={{
                  background: 'transparent',
                  border: `1px solid ${meta.border}`,
                  color: meta.color, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  padding: '4px 10px', borderRadius: 6,
                }}>
                Override blocker
              </button>
            )}
          </div>

          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--dim)', fontStyle: 'italic' }}>
            {meta.note}
          </div>
        </div>
      )}
    </div>
  )
}
