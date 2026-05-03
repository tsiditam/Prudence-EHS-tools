/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * V21InternalPanel — operator-facing dashboard view of the AtmosFlow
 * Engine v2.1 InternalReport. Renders alongside the legacy results view
 * during Phase 2 so the two outputs can be diffed before the client-
 * facing renderers are swapped in Phase 3.
 *
 * Inputs are still legacy shapes (zoneScores, comp, zones); the panel
 * runs the bridge inline and renders the v2.1 InternalReport.
 */

import { useMemo, useState } from 'react'
import { legacyToAssessmentScore, deriveAssessmentMeta } from '../engine/bridge'
import { renderInternalReport } from '../engine/report/internal'
import { ENGINE_VERSION } from '../version'

const SURFACE = '#0D0E14'
const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const TEXT = '#ECEEF2'
const SUB = '#8B93A5'
const DIM = '#6B7380'
const SUCCESS = '#22C55E'
const WARN = '#FBBF24'
const DANGER = '#EF4444'

const SEV_COLOR = {
  critical: DANGER,
  high: '#FB923C',
  medium: WARN,
  low: '#22D3EE',
  pass: SUCCESS,
  info: SUB,
}

const CONFIDENCE_LABEL = {
  validated_defensible: 'Validated · Defensible',
  provisional_screening_level: 'Provisional · Screening',
  qualitative_only: 'Qualitative only',
  insufficient_data: 'Insufficient data',
}

const OPINION_LABEL = {
  no_significant_concerns_identified: 'No significant concerns',
  conditions_warrant_monitoring: 'Warrants monitoring',
  conditions_warrant_further_investigation: 'Warrants further investigation',
  conditions_warrant_corrective_action: 'Warrants corrective action',
}

export default function V21InternalPanel({
  zoneScores,
  comp,
  zones,
  profile,
  presurvey,
  bldg,
  assessmentDate,
}) {
  const [expanded, setExpanded] = useState(false)

  const internal = useMemo(() => {
    if (!zoneScores?.length) return null
    try {
      const meta = deriveAssessmentMeta({
        profile,
        presurvey,
        building: bldg,
        assessmentDate,
      })
      const score = legacyToAssessmentScore(zoneScores, comp, zones, {
        meta,
        presurvey,
        building: bldg,
      })
      return { score, report: renderInternalReport(score) }
    } catch (e) {
      // Surface bridge errors in the panel without crashing the results view.
      return { error: e?.message || String(e) }
    }
  }, [zoneScores, comp, zones, profile, presurvey, bldg, assessmentDate])

  if (!internal) return null

  const titleBar = (
    <button
      onClick={() => setExpanded(e => !e)}
      style={{
        width: '100%', padding: '10px 14px', background: SURFACE,
        border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 10,
        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center',
        gap: 10, fontFamily: 'inherit',
      }}
    >
      <span style={{
        padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700,
        background: `${ACCENT}15`, color: ACCENT, letterSpacing: '0.4px',
      }}>v{ENGINE_VERSION} ENGINE</span>
      <span style={{ fontSize: 11, color: TEXT, fontWeight: 600 }}>
        Internal report (operator dashboard)
      </span>
      <span style={{ marginLeft: 'auto', fontSize: 11, color: SUB }}>
        {expanded ? '▾ Collapse' : '▸ Expand'}
      </span>
    </button>
  )

  if (!expanded) return titleBar

  if (internal.error) {
    return (
      <>
        {titleBar}
        <div style={{
          padding: '12px 14px', background: `${DANGER}10`, border: `1px solid ${DANGER}30`,
          borderRadius: 10, marginBottom: 10, fontSize: 11, color: DANGER, fontFamily: "var(--font-mono), monospace",
        }}>
          Bridge error: {internal.error}
        </div>
      </>
    )
  }

  const { score, report } = internal

  return (
    <>
      {titleBar}
      <div style={{ padding: 12, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 12 }}>
        <Section label="Site rollup">
          <Grid>
            <Stat label="Site score" value={report.siteScore ?? '—'} suffix={report.siteScore != null ? '/100' : ''} />
            <Stat label="Tier" value={report.siteTier ?? '—'} />
            <Stat label="Confidence" value={CONFIDENCE_LABEL[report.confidenceBand]} />
            <Stat label="Engine" value={report.engineVersion} mono />
          </Grid>
        </Section>

        <Section label="Defensibility flags">
          <FlagGrid flags={report.defensibilityFlags} />
        </Section>

        {report.missingDataFlags.length > 0 && (
          <Section label="Missing data">
            {report.missingDataFlags.map((m, i) => (
              <div key={i} style={{
                padding: '8px 10px', background: `${WARN}08`, border: `1px solid ${WARN}25`,
                borderRadius: 6, marginBottom: 6, fontSize: 11, color: WARN,
              }}>{m}</div>
            ))}
          </Section>
        )}

        {report.prioritizationQueue.length > 0 && (
          <Section label={`Prioritization queue (${report.prioritizationQueue.length})`}>
            {report.prioritizationQueue.slice(0, 12).map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                borderBottom: i < Math.min(report.prioritizationQueue.length, 12) - 1 ? `1px solid ${BORDER}` : 'none',
              }}>
                <span style={{ fontSize: 10, color: DIM, fontFamily: "var(--font-mono), monospace", minWidth: 22 }}>#{i + 1}</span>
                <span style={{ fontSize: 11, color: TEXT, flex: 1, lineHeight: 1.3 }}>
                  <strong>{p.zone}</strong>
                  <span style={{ color: SUB }}> · {findingTitleFromQueue(score, p.findingId)}</span>
                </span>
                <span style={{
                  padding: '1px 6px', fontSize: 9, fontWeight: 700, borderRadius: 3,
                  background: `${tierColor(p.deduction)}15`, color: tierColor(p.deduction),
                }}>−{p.deduction}</span>
                <span style={{ fontSize: 9, color: DIM, fontFamily: "var(--font-mono), monospace", minWidth: 50, textAlign: 'right' }}>
                  p={p.priority.toFixed(1)}
                </span>
              </div>
            ))}
          </Section>
        )}

        <Section label="Zones">
          {report.zones.map((z, i) => (
            <div key={z.zoneId} style={{
              padding: '10px 12px', background: SURFACE, border: `1px solid ${BORDER}`,
              borderRadius: 8, marginBottom: i < report.zones.length - 1 ? 8 : 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{z.zoneName}</span>
                <span style={{ fontSize: 10, color: DIM, fontFamily: "var(--font-mono), monospace" }}>{z.zoneId}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: TEXT, fontFamily: "var(--font-mono), monospace" }}>
                  {z.composite ?? '—'}{z.composite != null ? '/100' : ''}
                </span>
                <span style={{
                  padding: '1px 6px', fontSize: 9, fontWeight: 700, borderRadius: 3,
                  background: `${tierColorByLabel(z.tier)}18`, color: tierColorByLabel(z.tier),
                }}>{z.tier ?? 'N/A'}</span>
              </div>
              <div style={{ fontSize: 10, color: SUB, marginBottom: 8 }}>
                {CONFIDENCE_LABEL[z.confidence]}
                {' · '}
                <span style={{ color: opinionColor(score.zones[i]?.professionalOpinion) }}>
                  {OPINION_LABEL[score.zones[i]?.professionalOpinion] || '—'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {z.categories.map(c => (
                  <div key={c.category} style={{ fontSize: 10, color: SUB, fontFamily: "var(--font-mono), monospace" }}>
                    {c.category}: {c.cappedScore}/{c.maxScore}{' '}
                    <span style={{ color: statusColor(c.status) }}>[{c.status}]</span>
                  </div>
                ))}
              </div>
              {z.categories.flatMap(c => c.findings).length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 10, color: SUB, cursor: 'pointer' }}>
                    {z.categories.flatMap(c => c.findings).length} finding(s) — show
                  </summary>
                  <div style={{ marginTop: 6 }}>
                    {z.categories.flatMap(c =>
                      c.findings.map(f => (
                        <FindingRow key={f.id} f={f} category={c.category} />
                      )),
                    )}
                  </div>
                </details>
              )}
            </div>
          ))}
        </Section>

        <div style={{ marginTop: 8, fontSize: 9, color: DIM, fontFamily: "var(--font-mono), monospace", textAlign: 'right' }}>
          Bridged from legacy scoring · {new Date(report.generatedAt).toLocaleTimeString()}
        </div>
      </div>
    </>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 9, fontWeight: 600, color: SUB, textTransform: 'uppercase',
        letterSpacing: '0.6px', marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  )
}

function Grid({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>{children}</div>
  )
}

function Stat({ label, value, suffix, mono }) {
  return (
    <div style={{ padding: '6px 8px', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, color: DIM, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 600, color: TEXT, marginTop: 2,
        fontFamily: mono ? "var(--font-mono), monospace" : 'inherit',
      }}>
        {value}{suffix && <span style={{ fontSize: 9, color: DIM, fontWeight: 500 }}>{suffix}</span>}
      </div>
    </div>
  )
}

function FlagGrid({ flags }) {
  const items = [
    ['Instrument data', flags.hasInstrumentData],
    ['Calibration records', flags.hasCalibrationRecords],
    ['Zone coverage', flags.hasSufficientZoneCoverage],
    ['Qualified assessor', flags.hasQualifiedAssessor],
    ['Overall defensible', flags.overallDefensible],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
      {items.map(([label, ok]) => (
        <div key={label} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
          background: ok ? `${SUCCESS}10` : `${WARN}10`,
          border: `1px solid ${ok ? SUCCESS : WARN}25`, borderRadius: 6,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: 4, background: ok ? SUCCESS : WARN, flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: ok ? TEXT : WARN, flex: 1 }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

function FindingRow({ f, category }) {
  const sevColor = SEV_COLOR[f.severityInternal] || SUB
  return (
    <div style={{
      padding: '6px 8px', borderLeft: `2px solid ${sevColor}`,
      background: `${sevColor}06`, marginBottom: 4, borderRadius: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{
          fontSize: 8, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
          background: `${sevColor}20`, color: sevColor, letterSpacing: '0.3px',
        }}>{f.severityInternal.toUpperCase()}</span>
        <span style={{ fontSize: 9, color: DIM, fontFamily: "var(--font-mono), monospace" }}>
          {category} · {f.conditionType}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: DIM }}>−{f.deductionInternal}</span>
      </div>
      <div style={{ fontSize: 11, color: TEXT, lineHeight: 1.35 }}>{f.titleInternal}</div>
      <div style={{ marginTop: 4, display: 'flex', gap: 8, fontSize: 9, color: DIM, flexWrap: 'wrap' }}>
        <span>{CONFIDENCE_LABEL[f.confidenceTier]}</span>
        <span>·</span>
        <span style={{ color: f.permissions.definitiveConclusionAllowed ? SUCCESS : DIM }}>
          definitive: {f.permissions.definitiveConclusionAllowed ? '✓' : '—'}
        </span>
        <span style={{ color: f.permissions.causationSupported ? SUCCESS : DIM }}>
          causation: {f.permissions.causationSupported ? '✓' : '—'}
        </span>
        <span style={{ color: f.permissions.regulatoryConclusionAllowed ? SUCCESS : DIM }}>
          regulatory: {f.permissions.regulatoryConclusionAllowed ? '✓' : '—'}
        </span>
      </div>
    </div>
  )
}

function findingTitleFromQueue(score, findingId) {
  for (const z of score.zones) {
    for (const c of z.categories) {
      const f = c.findings.find(x => x.id === findingId)
      if (f) return f.titleInternal
    }
  }
  return findingId
}

function tierColor(deduction) {
  if (deduction >= 12) return DANGER
  if (deduction >= 7) return '#FB923C'
  if (deduction >= 3) return WARN
  return SUB
}

function tierColorByLabel(tier) {
  switch (tier) {
    case 'Critical': return DANGER
    case 'High Risk': return '#FB923C'
    case 'Moderate': return WARN
    case 'Low Risk': return SUCCESS
    default: return SUB
  }
}

function statusColor(status) {
  switch (status) {
    case 'scored': return SUCCESS
    case 'insufficient': return WARN
    case 'data_gap': return WARN
    case 'suppressed': return DIM
    default: return SUB
  }
}

function opinionColor(opinion) {
  switch (opinion) {
    case 'conditions_warrant_corrective_action': return DANGER
    case 'conditions_warrant_further_investigation': return '#FB923C'
    case 'conditions_warrant_monitoring': return WARN
    case 'no_significant_concerns_identified': return SUCCESS
    default: return SUB
  }
}
