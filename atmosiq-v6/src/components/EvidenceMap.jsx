/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * EvidenceMap — read-only Evidence Map tab (KG stage 3, spec §13).
 *
 * Renders, per finding, the knowledge-graph relationships the deterministic
 * engine produced: supporting evidence (measurements / observations /
 * occupant reports), conflicting evidence, linked standards (with their
 * screening framing), suggested pathways, generated recommendations, and any
 * missing data — each finding flagged for IH review.
 *
 * Pure presentation over a derived projection. It reads buildGraphContext()
 * (the same summarizer Jasper consumes) and writes nothing back. The engine
 * is not touched; confidence stays categorical, and standards framed
 * is_health_limit=false are labeled as screening references, never limits.
 */
import { useMemo } from 'react'
import { I } from './Icons'
import { buildGraphContext } from '../../lib/context/graphContext'
import KnowledgeGraphView from './KnowledgeGraphView'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const ACCENT = 'var(--accent)'
const SUCCESS = 'var(--success)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'
const BORDER_SUBTLE = 'var(--border-subtle, rgba(255,255,255,0.06))'

const CARD_LABEL = { fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600, marginBottom: 5 }

// Categorical confidence → tone + label. Mirrors the single confidence scale
// the engine and graph share; there is no numeric confidence to render.
const CONF = {
  validated: { c: SUCCESS, l: 'Validated' },
  provisional: { c: ACCENT, l: 'Provisional' },
  qualitative: { c: WARN, l: 'Qualitative' },
}

// Engine severity → tone. '#FB923C' for high mirrors the Sampling tab.
const SEV = {
  critical: { c: DANGER, l: 'Critical' },
  high: { c: '#FB923C', l: 'High' },
  medium: { c: WARN, l: 'Medium' },
  low: { c: ACCENT, l: 'Low' },
}

// Evidence node kind → icon + human label.
const KIND = {
  measurement: { icon: 'airflow', label: 'Measurement' },
  observation: { icon: 'search', label: 'Observation' },
  complaint: { icon: 'people', label: 'Occupant report' },
}
const kindOf = (k) => KIND[k] || { icon: 'clip', label: 'Evidence' }

function Pill({ tone, children }) {
  return (
    <span style={{ padding: '3px 10px', background: `${tone}1F`, border: `1px solid ${tone}59`, borderRadius: 5, fontSize: 11, fontWeight: 700, color: tone, letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function EvidenceRow({ kind, label, confidence }) {
  const k = kindOf(kind)
  const tone = confidence && CONF[confidence] ? CONF[confidence].c : SUB
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 7 }}>
      <div style={{ flex: '0 0 auto', marginTop: 1 }}><I n={k.icon} s={13} c={tone} w={1.7} /></div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, color: SUB, lineHeight: 1.5 }}>{label}</div>
        <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>{k.label}{confidence ? ` · ${confidence}` : ''}</div>
      </div>
    </div>
  )
}

export default function EvidenceMap({ zones, zoneScores, causalChains, recs, assessmentId }) {
  const ctx = useMemo(
    () => buildGraphContext({ zones, zoneScores, causalChains, recs, id: assessmentId }),
    [zones, zoneScores, causalChains, recs, assessmentId],
  )

  const findings = ctx?.findings || []

  if (findings.length === 0) {
    return (
      <div style={{ padding: 36, textAlign: 'center', background: CARD, borderRadius: 10, border: `1px solid ${BORDER}` }}>
        <I n="search" s={24} c={DIM} w={1.4} />
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12, marginBottom: 4, color: SUB }}>No evidence map yet</div>
        <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>The evidence map appears once the assessment has scored findings.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KnowledgeGraphView zones={zones} zoneScores={zoneScores} causalChains={causalChains} recs={recs} assessmentId={assessmentId} />
      <div style={{ fontSize: 11, color: DIM, lineHeight: 1.5, marginBottom: 4 }}>
        The graph above shows each finding with the measurements, observations, and occupant reports that support or conflict with it, plus the standards, pathways, and recommendations it links to. The cards below list the same relationships. Everything is derived from deterministic scoring — it supports, but does not confirm, interpretation. Every finding requires IH review.
      </div>

      {findings.map((f, i) => (
        <div key={i} style={{ padding: '16px 16px 18px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
          {/* ── Finding + confidence ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={CARD_LABEL}>Finding</div>
              <div style={{ color: TEXT, fontWeight: 700, fontSize: 14, lineHeight: 1.4 }}>{f.finding}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <Pill tone={(CONF[f.confidence] || CONF.provisional).c}>{(CONF[f.confidence] || CONF.provisional).l}</Pill>
              {f.severity && SEV[f.severity] && <Pill tone={SEV[f.severity].c}>{SEV[f.severity].l}</Pill>}
            </div>
          </div>

          {/* ── Supporting evidence ── */}
          {f.supported_by.length > 0 && (
            <div style={{ paddingTop: 12, borderTop: `1px solid ${BORDER_SUBTLE}` }}>
              <div style={CARD_LABEL}>Supporting evidence</div>
              {f.supported_by.map((e, j) => <EvidenceRow key={j} {...e} />)}
            </div>
          )}

          {/* ── Conflicting evidence — surfaced, never suppressed ── */}
          {f.contradicted_by.length > 0 && (
            <div style={{ marginTop: 12, padding: '12px 14px', background: `${WARN}10`, border: `1px solid ${WARN}33`, borderRadius: 10 }}>
              <div style={{ ...CARD_LABEL, color: WARN, marginBottom: 7 }}>Conflicting evidence</div>
              {f.contradicted_by.map((e, j) => <EvidenceRow key={j} {...e} />)}
            </div>
          )}

          {/* ── Suggested pathways ── */}
          {f.pathways.length > 0 && (
            <div style={{ paddingTop: 12, marginTop: 12, borderTop: `1px solid ${BORDER_SUBTLE}` }}>
              <div style={CARD_LABEL}>Suggested pathways</div>
              {f.pathways.map((p, j) => (
                <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <I n="chain" s={13} c={ACCENT} w={1.7} />
                  <span style={{ fontSize: 13, color: SUB, lineHeight: 1.5 }}>{p.pathway}</span>
                  {p.confidence && <span style={{ fontSize: 10, color: DIM }}>· {p.confidence}</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── Standards — framing carried so a screening reference is never
              read as a health limit ── */}
          {f.standards.length > 0 && (
            <div style={{ paddingTop: 12, marginTop: 12, borderTop: `1px solid ${BORDER_SUBTLE}` }}>
              <div style={CARD_LABEL}>Standards referenced</div>
              {f.standards.map((s, j) => (
                <div key={j} style={{ marginBottom: j < f.standards.length - 1 ? 9 : 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: TEXT, fontWeight: 600, lineHeight: 1.4 }}>{s.label}</span>
                    {!s.is_health_limit && (
                      <span style={{ fontSize: 9, color: ACCENT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '2px 7px', border: `1px solid ${ACCENT}40`, borderRadius: 4 }}>
                        Screening reference — not a health limit
                      </span>
                    )}
                  </div>
                  {s.framing && <div style={{ fontSize: 11, color: DIM, lineHeight: 1.5, marginTop: 3 }}>{s.framing}</div>}
                </div>
              ))}
            </div>
          )}

          {/* ── Recommendations ── */}
          {f.recommendations.length > 0 && (
            <div style={{ paddingTop: 12, marginTop: 12, borderTop: `1px solid ${BORDER_SUBTLE}` }}>
              <div style={CARD_LABEL}>Recommendations</div>
              {f.recommendations.map((r, j) => (
                <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ flex: '0 0 auto', marginTop: 1 }}><I n="check" s={13} c={SUCCESS} w={1.8} /></div>
                  <span style={{ fontSize: 13, color: SUB, lineHeight: 1.5 }}>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Missing data ── */}
          {f.missing_data.length > 0 && (
            <div style={{ paddingTop: 12, marginTop: 12, borderTop: `1px solid ${BORDER_SUBTLE}` }}>
              <div style={CARD_LABEL}>Missing data</div>
              {f.missing_data.map((m, j) => (
                <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ flex: '0 0 auto', marginTop: 1 }}><I n="gap" s={13} c={DIM} w={1.7} /></div>
                  <span style={{ fontSize: 13, color: DIM, lineHeight: 1.5 }}>{m}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── IH review flag ── */}
          {f.ih_review_required && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
              <I n="shield" s={12} c={WARN} w={1.8} />
              <span style={{ fontSize: 11, color: WARN, fontWeight: 700, letterSpacing: '0.3px' }}>IH Review Required</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
