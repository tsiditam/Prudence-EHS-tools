/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * EditorialReviewPanel — the human-applied editorial-review pass. Renders in
 * the results-view Review tab, under the readiness verdict.
 *
 * A senior-CIH-editor agent (api/report-editorial-review) reads a digest of
 * the report's CUTTABLE content plus the case facts and proposes which items
 * to cut — the case-specific over-production the deterministic report rules
 * cannot catch. The reviewing professional ticks the cuts to apply; the
 * approved set is saved onto the report record and the DOCX renderer omits
 * them on the next export.
 *
 * Boundary: no model text enters the report — the agent only proposes which
 * existing, engine-authored content to omit, and a human approves it. So the
 * deliverable carries no AI-provenance obligation. The engine and the stored
 * assessment are never mutated; only what the renderer emits changes.
 */

import { useState } from 'react'
import { I } from './Icons'
import { makeTargetKey, buildEditorialSuppressions } from '../utils/editorialSuppressions'
import { buildEditorialReviewPayload } from '../utils/editorialReviewDigest'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const ACCENT = 'var(--accent)'

const CONF = {
  high: { c: '#22C55E', label: 'High confidence' },
  medium: { c: '#FB923C', label: 'Medium confidence' },
  low: { c: 'var(--dim)', label: 'Low confidence' },
}

function ConfidenceChip({ level }) {
  const t = CONF[level] || CONF.medium
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: t.c, background: `color-mix(in srgb, ${t.c} 15%, transparent)`,
      padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', letterSpacing: '0.3px',
    }}>
      {t.label}
    </span>
  )
}

// A single proposed cut. Tapping the card toggles approval — the whole card is
// the tap target (≥44px) so it works on a phone in the field.
function SuggestionCard({ suggestion, approved, onToggle }) {
  const tone = approved ? ACCENT : BORDER
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={approved}
      style={{
        display: 'block', width: '100%', textAlign: 'left', boxSizing: 'border-box',
        minHeight: 44, padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
        background: approved ? `color-mix(in srgb, ${ACCENT} 10%, ${CARD})` : CARD,
        border: `1px solid ${approved ? `color-mix(in srgb, ${ACCENT} 55%, transparent)` : BORDER}`,
        borderLeft: `3px solid ${approved ? ACCENT : 'var(--border)'}`,
        borderRadius: 8, fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
          border: `1.5px solid ${approved ? ACCENT : 'var(--border)'}`,
          background: approved ? ACCENT : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {approved && <I n="check" s={13} c="var(--on-accent-fill)" w={3} />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{suggestion.label}</span>
            <ConfidenceChip level={suggestion.confidence} />
          </div>
          {suggestion.rationale && (
            <div style={{ fontSize: 12, lineHeight: 1.5, color: SUB }}>{suggestion.rationale}</div>
          )}
        </div>
      </div>
    </button>
  )
}

export default function EditorialReviewPanel({ reportData, existingSuppressions, onApply, extraFacts }) {
  const [status, setStatus] = useState('idle') // idle | loading | ready | error | applied
  const [suggestions, setSuggestions] = useState([])
  const [approved, setApproved] = useState(() => new Set())
  const [error, setError] = useState('')

  const appliedCount = (existingSuppressions && Array.isArray(existingSuppressions.targets))
    ? existingSuppressions.targets.length : 0

  async function runReview() {
    setStatus('loading')
    setError('')
    try {
      const { getConsultantReportResult } = await import('./DocxReport')
      const result = getConsultantReportResult(reportData)
      const report = result && result.kind === 'report' ? result.report : null
      if (!report) {
        setError('This assessment has no issued report content to review yet.')
        setStatus('error')
        return
      }
      const payload = buildEditorialReviewPayload(report, extraFacts)
      if (!payload.reportDigest.items.length) {
        setSuggestions([])
        setStatus('ready')
        return
      }
      const cloud = (await import('../utils/cloudStorage')).default
      const session = await cloud.getSession()
      if (!session || !session.access_token) {
        setError('Please sign in to run the editorial review.')
        setStatus('error')
        return
      }
      const res = await fetch('/api/report-editorial-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ payload }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError((b && (b.message || b.error)) || `Editorial review failed (${res.status}).`)
        setStatus('error')
        return
      }
      const data = await res.json()
      const list = Array.isArray(data.suggestions) ? data.suggestions : []
      setSuggestions(list)
      setApproved(new Set())
      setStatus('ready')
    } catch (e) {
      setError((e && e.message) || 'Editorial review failed.')
      setStatus('error')
    }
  }

  function toggle(target) {
    const key = makeTargetKey(target)
    if (!key) return
    setApproved((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function apply() {
    const cuts = suggestions
      .filter((s) => approved.has(makeTargetKey(s.target)))
      .map((s) => ({ target: s.target, label: s.label, rationale: s.rationale }))
    onApply?.(buildEditorialSuppressions({ cuts }))
    setStatus('applied')
  }

  const approvedCount = approved.size

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Editorial review</div>
        {appliedCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
            padding: '1px 8px', borderRadius: 10,
          }}>
            {appliedCount} cut{appliedCount === 1 ? '' : 's'} applied
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: SUB, lineHeight: 1.55, marginBottom: 14 }}>
        A senior-CIH editorial pass reviews the draft for over-production and proposes content to cut for a cleaner,
        more defensible client report. You approve each cut; approved cuts apply to the Word report on your next export.
        The engine and your stored data are never changed.
      </div>

      {(status === 'idle' || status === 'error' || status === 'applied') && (
        <button
          type="button"
          onClick={runReview}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', minHeight: 44, padding: '12px 16px', marginBottom: 12,
            background: 'var(--accent-fill)', color: 'var(--on-accent-fill)',
            border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <I n="brain" s={16} c="var(--on-accent-fill)" w={2.2} />
          {status === 'applied' ? 'Run editorial review again' : appliedCount > 0 ? 'Re-run editorial review' : 'Run editorial review'}
        </button>
      )}

      {status === 'loading' && (
        <div role="status" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', marginBottom: 12,
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
        }}>
          <div className="er-spin" style={{
            width: 16, height: 16, borderRadius: 8, flexShrink: 0,
            border: `2px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`, borderTopColor: ACCENT,
          }} aria-hidden="true" />
          <span style={{ fontSize: 13, color: SUB }}>Reviewing the draft for over-production…</span>
          <style>{`@keyframes er-spin{to{transform:rotate(360deg)}}.er-spin{animation:er-spin .8s linear infinite}@media (prefers-reduced-motion: reduce){.er-spin{animation:none}}`}</style>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', marginBottom: 12,
          background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)', borderRadius: 8,
        }}>
          <I n="alert" s={16} c="var(--danger)" w={2.2} />
          <span style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{error}</span>
        </div>
      )}

      {status === 'applied' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 12,
          background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${ACCENT} 40%, transparent)`, borderRadius: 8,
        }}>
          <I n="check" s={16} c={ACCENT} w={2.4} />
          <span style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
            Applied. The cuts take effect the next time you export the Word report.
          </span>
        </div>
      )}

      {status === 'ready' && suggestions.length === 0 && (
        <div style={{
          padding: '14px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
          fontSize: 13, color: SUB, lineHeight: 1.5,
        }}>
          No cuts proposed — the draft reads lean for this investigation.
        </div>
      )}

      {status === 'ready' && suggestions.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
            Proposed cuts — tap to approve
          </div>
          {suggestions.map((s, i) => (
            <SuggestionCard
              key={makeTargetKey(s.target) || i}
              suggestion={s}
              approved={approved.has(makeTargetKey(s.target))}
              onToggle={() => toggle(s.target)}
            />
          ))}
          <button
            type="button"
            onClick={apply}
            disabled={approvedCount === 0}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', minHeight: 44, padding: '12px 16px', marginTop: 6,
              background: approvedCount === 0 ? 'var(--surface)' : 'var(--accent-fill)',
              color: approvedCount === 0 ? DIM : 'var(--on-accent-fill)',
              border: approvedCount === 0 ? `1px solid ${BORDER}` : 'none',
              borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              cursor: approvedCount === 0 ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            {approvedCount === 0 ? 'Select cuts to apply' : `Apply ${approvedCount} cut${approvedCount === 1 ? '' : 's'}`}
          </button>
        </>
      )}

      {appliedCount > 0 && status !== 'applied' && (
        <button
          type="button"
          onClick={() => onApply?.(null)}
          style={{
            display: 'block', width: '100%', minHeight: 40, marginTop: 10, padding: '10px 16px',
            background: 'transparent', color: SUB, border: `1px solid ${BORDER}`, borderRadius: 10,
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Clear applied cuts
        </button>
      )}
    </div>
  )
}
