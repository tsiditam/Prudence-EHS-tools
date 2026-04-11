/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 */

import { useState } from 'react'
import DesktopSidebar from './DesktopSidebar'
import { I } from './Icons'
import ScoreRing from './ScoreRing'
import { CSS, mono, btn, cardStyle, cardHoverHandlers, btnPressHandlers, FONT_DESKTOP, FONT_MOBILE } from '../styles/tokens'

const SevBadge = ({ sev, dk }) => {
  const colors = { critical: '#EF4444', high: '#FB923C', medium: '#FBBF24', low: '#22D3EE', pass: '#22C55E', info: '#8B5CF6' }
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: (colors[sev] || '#5E6578') + '20', color: colors[sev] || '#5E6578', ...(dk ? mono : {}) }}>{sev}</span>
}

export default function ReportView({
  dk, step, setStep, saveDraft, setShowHistory, setShowLanding,
  report, building, setReport, setIsDemo, version,
}) {
  const [expandedCats, setExpandedCats] = useState({})
  const crd = cardStyle(dk)
  const cardHover = cardHoverHandlers(dk)
  const btnPress = btnPressHandlers

  const { comp, zoneScores, oshaEvals, recs, ventCalcs, samplingPlan, causalChains, narrative } = report

  return (
    <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: dk ? FONT_DESKTOP : FONT_MOBILE }}>
      {dk && <DesktopSidebar step={step} setStep={setStep} saveDraft={saveDraft} setShowHistory={setShowHistory} onHome={() => setShowLanding(true)} version={version} />}
      <div style={{ ...(dk ? { marginLeft: 320, padding: '40px 48px', maxWidth: 1100 } : { maxWidth: 700, margin: '0 auto', padding: 20 }) }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: dk ? 36 : 24, paddingBottom: dk ? 24 : 0, borderBottom: dk ? `1px solid ${CSS.border}` : 'none' }}>
          <div>
            <div style={{ fontSize: dk ? 28 : 22, fontWeight: 800, letterSpacing: '-0.02em' }}>atmos<span style={{ color: CSS.accent }}>flow</span> Report</div>
            <div style={{ fontSize: 12, color: CSS.muted, marginTop: 4 }}>{building.fn} &mdash; {new Date(report.ts).toLocaleString()}</div>
          </div>
          <button onClick={() => { setStep(0); setReport(null); setIsDemo(false) }} style={{ ...btn(false, dk), padding: '8px 16px' }} {...btnPress}>New Assessment</button>
        </div>

        {/* Composite Score */}
        {comp && (
          <div style={{ ...crd, textAlign: 'center', padding: dk ? 48 : 30, position: 'relative', overflow: 'hidden' }}>
            {dk && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, position: 'relative' }}>
              <ScoreRing value={comp.tot} color={comp.rc} size={dk ? 200 : 160} />
            </div>
            <div style={{ fontSize: dk ? 22 : 18, fontWeight: 700, color: comp.rc, position: 'relative' }}>{comp.risk}</div>
            <div style={{ fontSize: 13, color: CSS.muted, marginTop: 4, ...(dk ? mono : {}), position: 'relative' }}>
              Avg: {comp.avg} | Worst: {comp.worst} | Zones: {comp.count}
            </div>
          </div>
        )}

        {/* AI Narrative */}
        {narrative && (
          <div style={crd} {...cardHover}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <I n="send" s={16} c={CSS.accent} /> AI Findings Narrative
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: '#C8D0DC', whiteSpace: 'pre-wrap' }}>{narrative}</div>
          </div>
        )}

        {/* Zone Scores */}
        <div style={{ display: dk ? 'grid' : 'block', gridTemplateColumns: dk ? 'repeat(auto-fill, minmax(460px, 1fr))' : undefined, gap: dk ? 24 : undefined }}>
          {zoneScores?.map((zs, zi) => (
            <div key={zi} style={crd} {...cardHover}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{zs.zoneName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ScoreRing value={zs.tot} color={zs.rc} size={60} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: zs.rc }}>{zs.risk}</span>
                </div>
              </div>
              {zs.cats.map((c, ci) => (
                <div key={ci} style={{ marginBottom: 8 }}>
                  <div onClick={() => setExpandedCats(prev => ({ ...prev, [`${zi}-${ci}`]: !prev[`${zi}-${ci}`] }))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: CSS.bg, borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{c.l}</span>
                    <span style={{ fontSize: 13, color: CSS.muted, ...(dk ? mono : {}) }}>{c.s}/{c.mx}</span>
                  </div>
                  {dk ? (
                    <div style={{ overflow: 'hidden', maxHeight: expandedCats[`${zi}-${ci}`] ? 1000 : 0, opacity: expandedCats[`${zi}-${ci}`] ? 1 : 0, transition: 'max-height 0.3s ease, opacity 0.2s ease 0.1s' }}>
                      <div style={{ padding: '8px 12px' }}>
                        {c.r.map((r, ri) => (
                          <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                            <SevBadge sev={r.sev} dk={dk} />
                            <span style={{ color: '#C8D0DC' }}>{r.t}</span>
                            {r.std && <span style={{ fontSize: 11, color: CSS.muted }}>({r.std})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    expandedCats[`${zi}-${ci}`] && (
                      <div style={{ padding: '8px 12px' }}>
                        {c.r.map((r, ri) => (
                          <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                            <SevBadge sev={r.sev} dk={dk} />
                            <span style={{ color: '#C8D0DC' }}>{r.t}</span>
                            {r.std && <span style={{ fontSize: 11, color: CSS.muted }}>({r.std})</span>}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              ))}
              {oshaEvals?.[zi] && (
                <div style={{ marginTop: 8, padding: '10px 12px', background: oshaEvals[zi].flag ? '#EF444415' : '#22C55E15', borderRadius: 8, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: oshaEvals[zi].flag ? CSS.danger : CSS.success }}>
                    <I n="shield" s={14} c={oshaEvals[zi].flag ? CSS.danger : CSS.success} /> OSHA Defensibility: {oshaEvals[zi].conf}
                  </div>
                  {oshaEvals[zi].fl.map((f, fi) => <div key={fi} style={{ color: CSS.danger, marginTop: 2 }}>&excl; {f}</div>)}
                  {oshaEvals[zi].gaps.map((g, gi) => <div key={gi} style={{ color: CSS.warn, marginTop: 2 }}>Gap: {g}</div>)}
                </div>
              )}
              {ventCalcs?.[zi] && (
                <div style={{ marginTop: 8, padding: '10px 12px', background: CSS.bg, borderRadius: 8, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: CSS.accent, marginBottom: 4 }}>Ventilation Requirement ({ventCalcs[zi].ref})</div>
                  <div style={{ color: '#C8D0DC', ...(dk ? mono : {}), fontSize: 12 }}>
                    People OA: {ventCalcs[zi].pOA.toFixed(1)} CFM | Area OA: {ventCalcs[zi].aOA.toFixed(1)} CFM | Total: {ventCalcs[zi].tot.toFixed(1)} CFM ({ventCalcs[zi].pp.toFixed(1)} CFM/person)
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Causal Chains */}
        {causalChains?.length > 0 && (
          <div style={crd} {...cardHover}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              <I n="chain" s={16} c={CSS.accent} /> Causal Chains
            </div>
            <div style={{ display: dk ? 'grid' : 'block', gridTemplateColumns: dk ? 'repeat(auto-fill, minmax(340px, 1fr))' : undefined, gap: dk ? 16 : undefined }}>
              {causalChains.map((ch, i) => (
                <div key={i} style={{ marginBottom: dk ? 0 : 12, padding: 12, background: CSS.bg, borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ch.zone}: {ch.type}</div>
                  <div style={{ fontSize: 13, color: CSS.warn, marginTop: 4 }}>Confidence: {ch.confidence}</div>
                  <div style={{ fontSize: 13, color: '#C8D0DC', marginTop: 4 }}>Root cause: {ch.rootCause}</div>
                  <div style={{ marginTop: 4 }}>
                    {ch.evidence.map((e, ei) => <div key={ei} style={{ fontSize: 12, color: CSS.muted }}>&bull; {e}</div>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sampling Plan */}
        {samplingPlan?.plan?.length > 0 && (
          <div style={crd} {...cardHover}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              <I n="flask" s={16} c={CSS.accent} /> Recommended Sampling Plan
            </div>
            <div style={{ display: dk ? 'grid' : 'block', gridTemplateColumns: dk ? 'repeat(auto-fill, minmax(340px, 1fr))' : undefined, gap: dk ? 16 : undefined }}>
              {samplingPlan.plan.map((p, i) => (
                <div key={i} style={{ marginBottom: dk ? 0 : 12, padding: 12, background: CSS.bg, borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{p.zone}: {p.type}</span>
                    <SevBadge sev={p.priority} dk={dk} />
                  </div>
                  <div style={{ fontSize: 13, color: '#C8D0DC' }}>{p.hypothesis}</div>
                  <div style={{ fontSize: 12, color: CSS.muted, marginTop: 4 }}>Method: {p.method}</div>
                  <div style={{ fontSize: 12, color: CSS.muted }}>Controls: {p.controls}</div>
                  <div style={{ fontSize: 11, color: CSS.accent, marginTop: 2, ...(dk ? mono : {}) }}>{p.standard}</div>
                </div>
              ))}
            </div>
            {samplingPlan.outdoorGaps?.length > 0 && (
              <div style={{ padding: 10, background: '#FBBF2415', borderRadius: 8, marginTop: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: CSS.warn, marginBottom: 4 }}>Data Gaps</div>
                {samplingPlan.outdoorGaps.map((g, i) => <div key={i} style={{ fontSize: 12, color: CSS.warn }}>&excl; {g}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {recs && (
          <div style={crd} {...cardHover}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              <I n="findings" s={16} c={CSS.accent} /> Recommendations
            </div>
            {[
              { key: 'imm', label: 'Immediate Actions', color: CSS.danger },
              { key: 'eng', label: 'Engineering Controls', color: CSS.warn },
              { key: 'adm', label: 'Administrative Controls', color: CSS.accent },
              { key: 'mon', label: 'Monitoring', color: CSS.muted },
            ].map(({ key, label, color }) => recs[key]?.length > 0 && (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color, marginBottom: 4 }}>{label}</div>
                {recs[key].map((r, i) => <div key={i} style={{ fontSize: 13, color: '#C8D0DC', padding: '2px 0' }}>&bull; {r}</div>)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
