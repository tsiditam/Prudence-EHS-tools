/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ReadinessPanel — surfaces the readiness verdict produced by the
 * engines/readiness-verdict orchestrator. Renders in the results-view
 * tab strip between Findings and Pathways.
 *
 * Sections, top to bottom:
 *   1. Status pill (Ready / Defensibility gaps / Cannot finalize yet)
 *   2. Finalization blockers — hard, red, must clear before export
 *   3. Defensibility gaps — soft, amber, resolve or disclose
 *   4. Finalization warnings — soft, dim, informational
 *   5. Confidence breakdown — high / medium / low / qualitative-only counts
 *   6. CTA — "Ask the copilot what's next" → opens the Field Assistant
 *      sheet with the readiness verdict attached to its context
 *
 * Engine-sacred boundary: this component reads the assessment via the
 * readiness-verdict orchestrator. It does not import scoring or
 * threshold logic; it does not mutate the assessment.
 */

import { useMemo } from 'react'
import { buildReadinessVerdict } from '../engines/readiness-verdict'
import { I } from './Icons'

const CARD = 'var(--card)'
const SURFACE = 'var(--surface)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const ACCENT = 'var(--accent)'

const STATUS_TONES = {
  ready:   { color: '#22C55E', label: 'Ready for sign-off',     icon: 'check' },
  gaps:    { color: '#FB923C', label: 'Defensibility gaps',     icon: 'alert' },
  blocked: { color: '#EF4444', label: 'Cannot finalize yet',    icon: 'alert' },
}

function StatusPill({ status, summary }) {
  const tone = STATUS_TONES[status] || STATUS_TONES.blocked
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
      background: `${tone.color}15`, border: `1px solid ${tone.color}40`,
      borderRadius: 10, marginBottom: 16,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 18, background: `${tone.color}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <I n={tone.icon} s={18} c={tone.color} w={2.2} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tone.color, marginBottom: 2 }}>
          {tone.label}
        </div>
        <div style={{ fontSize: 12, color: SUB, lineHeight: 1.4 }}>
          {summary}
        </div>
      </div>
    </div>
  )
}

function Section({ title, count, color, children }) {
  if (count === 0) return null
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: color || DIM, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          {title}
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: color || DIM,
          background: `${color || DIM}15`, padding: '1px 7px', borderRadius: 10,
          fontFamily: 'var(--font-mono)',
        }}>
          {count}
        </div>
      </div>
      {children}
    </div>
  )
}

function BlockerCard({ text }) {
  return (
    <div style={{
      padding: '11px 14px', background: CARD, border: `1px solid #EF444440`,
      borderLeft: '3px solid #EF4444', borderRadius: 8, marginBottom: 6,
      fontSize: 13, lineHeight: 1.5, color: TEXT,
    }}>
      {text}
    </div>
  )
}

function GapCard({ gap }) {
  const tone = gap.severity === 'warn' ? '#FB923C' : '#3B82F6'
  return (
    <div style={{
      padding: '12px 14px', background: CARD, border: `1px solid ${tone}40`,
      borderLeft: `3px solid ${tone}`, borderRadius: 8, marginBottom: 8,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 4, gap: 8,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
          {humanizeKind(gap.kind)}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: tone, fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase', letterSpacing: '0.4px',
        }}>
          {gap.severity}
        </div>
      </div>
      {Array.isArray(gap.zones) && gap.zones.length > 0 && (
        <div style={{ fontSize: 11, color: SUB, marginBottom: 6, lineHeight: 1.4 }}>
          Zones: {gap.zones.join(', ')}
        </div>
      )}
      {typeof gap.count === 'number' && (
        <div style={{ fontSize: 11, color: SUB, marginBottom: 6, lineHeight: 1.4 }}>
          Count: {gap.count}
        </div>
      )}
      <div style={{ fontSize: 12, color: SUB, lineHeight: 1.5 }}>
        {gap.why}
      </div>
    </div>
  )
}

function WarningRow({ text }) {
  return (
    <div style={{
      padding: '8px 12px', background: SURFACE, border: `1px solid ${BORDER}`,
      borderRadius: 8, marginBottom: 5, fontSize: 12, color: SUB, lineHeight: 1.5,
    }}>
      {text}
    </div>
  )
}

function ConfidenceBar({ confidence }) {
  const total = confidence.high + confidence.medium + confidence.low + confidence.qualitative_only
  if (total === 0) return null
  const segs = [
    { label: 'High',    n: confidence.high,            color: '#22C55E' },
    { label: 'Medium',  n: confidence.medium,          color: '#FBBF24' },
    { label: 'Low',     n: confidence.low,             color: '#FB923C' },
    { label: 'Qual.',   n: confidence.qualitative_only, color: '#94A3B8' },
  ]
  return (
    <Section title="Confidence breakdown" count={total} color={SUB}>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8, background: SURFACE }}>
        {segs.map((s) => s.n > 0 && (
          <div key={s.label} style={{ flex: s.n, background: s.color }} title={`${s.label}: ${s.n}`} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: SUB }}>
        {segs.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            <span style={{ fontWeight: 600, color: TEXT }}>{s.n}</span>
            <span>{s.label}</span>
          </div>
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
  }[kind] || kind
}

export default function ReadinessPanel({ assessment, onAskCopilot }) {
  const verdict = useMemo(() => buildReadinessVerdict(assessment || {}), [assessment])

  return (
    <div style={{ paddingTop: 8, paddingBottom: 16 }}>
      <StatusPill status={verdict.status} summary={verdict.summary} />

      <Section title="Finalization blockers" count={verdict.finalization_blockers.length} color="#EF4444">
        {verdict.finalization_blockers.map((text, i) => (
          <BlockerCard key={i} text={text} />
        ))}
      </Section>

      <Section title="Defensibility gaps" count={verdict.defensibility_gaps.length} color="#FB923C">
        {verdict.defensibility_gaps.map((gap, i) => (
          <GapCard key={`${gap.kind}-${i}`} gap={gap} />
        ))}
      </Section>

      <Section title="Warnings" count={verdict.finalization_warnings.length} color={DIM}>
        {verdict.finalization_warnings.map((text, i) => (
          <WarningRow key={i} text={text} />
        ))}
      </Section>

      <ConfidenceBar confidence={verdict.confidence} />

      <button
        type="button"
        onClick={() => onAskCopilot?.(verdict)}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: 12,
          background: 'var(--accent-fill)', color: 'var(--on-accent-fill)',
          border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.2px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 8,
        }}>
        <I n="sparkle" s={16} c="var(--on-accent-fill)" w={1.8} />
        Ask the copilot what's next
      </button>
      <div style={{ fontSize: 11, color: DIM, textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>
        AI · REVIEW REQUIRED · The copilot will walk you through the gaps using AtmosFlow's standards corpus.
      </div>
    </div>
  )
}
