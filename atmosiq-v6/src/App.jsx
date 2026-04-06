/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import STO from './utils/storage'
import { STD, VER, PLAT_MODULES, Bus } from './constants/standards'
import { Q_PRESURVEY, Q_BUILDING, Q_ZONE, SENSOR_FIELDS } from './constants/questions'
import { scoreZone, compositeScore, evalOSHA, calcVent, genRecs } from './engines/scoring'
import { generateSamplingPlan } from './engines/sampling'
import { buildCausalChains } from './engines/causalChains'
import { generateNarrative } from './engines/narrative'
import { I } from './components/Icons'
import Particles from './components/Particles'
import Loading from './components/Loading'
import ScoreRing from './components/ScoreRing'
import PhotoCapture from './components/PhotoCapture'
import SensorScreen from './components/SensorScreen'

const CSS = {
  bg: '#080A0E',
  card: '#0C1017',
  border: '#1A2030',
  accent: '#22D3EE',
  accentDim: '#22D3EE20',
  text: '#F0F4F8',
  muted: '#5E6578',
  danger: '#EF4444',
  warn: '#FBBF24',
  success: '#22C55E',
}

const btn = (primary) => ({
  padding: '14px 28px',
  background: primary ? CSS.accent : 'transparent',
  color: primary ? '#080A0E' : CSS.text,
  border: primary ? 'none' : `1px solid ${CSS.border}`,
  borderRadius: 12,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all .2s',
})

const card = { background: CSS.card, border: `1px solid ${CSS.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }

const STEPS = ['presurvey', 'building', 'zones', 'review', 'report']
const STEP_LABELS = ['Pre-Survey', 'Building', 'Zones', 'Review', 'Report']

export default function App() {
  const [loading, setLoading] = useState(true)
  const [visited, setVisited] = useState(false)
  const [step, setStep] = useState(0)
  const [presurvey, setPresurvey] = useState({})
  const [building, setBuilding] = useState({})
  const [zones, setZones] = useState([{}])
  const [photos, setPhotos] = useState({})
  const [curZone, setCurZone] = useState(0)
  const [report, setReport] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [savedReports, setSavedReports] = useState([])
  const [savedDrafts, setSavedDrafts] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [viewReport, setViewReport] = useState(null)
  const [expandedCats, setExpandedCats] = useState({})

  useEffect(() => {
    (async () => {
      const v = await STO.hasVisited()
      setVisited(!!v)
      const idx = await STO.getIndex()
      setSavedReports(idx.reports || [])
      setSavedDrafts(idx.drafts || [])
    })()
  }, [])

  const handleLoadingDone = useCallback(() => {
    setLoading(false)
    STO.markVisited()
  }, [])

  // Question rendering
  const renderQ = (q, data, setData, prefix = '') => {
    if (q.cond) {
      const { f, eq, ne } = q.cond
      if (eq && data[f] !== eq) return null
      if (ne && data[f] === ne) return null
    }
    if (q.t === 'sensors') {
      return (
        <div key={q.id} style={card}>
          <div style={{ fontSize: 16, fontWeight: 600, color: CSS.text, marginBottom: 12 }}>{q.ic} {q.q}</div>
          <SensorScreen data={data} onChange={(id, v) => setData({ ...data, [id]: v })} />
        </div>
      )
    }
    const val = data[q.id] || ''
    const update = (v) => setData({ ...data, [q.id]: v })
    return (
      <div key={q.id} style={{ ...card, borderColor: q.req && !val ? '#EF444440' : CSS.border }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: CSS.text, marginBottom: 8 }}>
          {q.ic} {q.q} {q.req && <span style={{ color: CSS.danger, fontSize: 12 }}>*</span>}
        </div>
        {q.ref && <div style={{ fontSize: 12, color: CSS.muted, marginBottom: 8 }}>{q.ref}</div>}
        {q.t === 'combo' && q.opts && (() => {
          const otherOpts = q.opts.filter(o => o !== 'Other')
          const isOther = val === '__other__' || (val && !otherOpts.includes(val) && val !== '')
          const selectVal = isOther ? '__other__' : (val || '')
          const customText = isOther && val !== '__other__' ? val : ''
          return (
            <div>
              <select value={selectVal} onChange={e => { update(e.target.value) }}
                style={{ width: '100%', padding: '12px 14px', background: CSS.bg, border: `1px solid ${CSS.border}`, borderRadius: 8, color: selectVal ? CSS.text : CSS.muted, fontSize: 15, outline: 'none', boxSizing: 'border-box', appearance: 'auto', cursor: 'pointer' }}>
                <option value="" style={{ color: CSS.muted }}>Select...</option>
                {otherOpts.map(o => <option key={o} value={o} style={{ color: CSS.text, background: CSS.bg }}>{o}</option>)}
                <option value="__other__" style={{ color: CSS.text, background: CSS.bg }}>Other (type in)</option>
              </select>
              {isOther && (
                <input type="text" value={customText} onChange={e => update(e.target.value || '__other__')} placeholder={q.ph || 'Type here...'}
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', background: CSS.bg, border: `1px solid ${CSS.accent}`, borderRadius: 8, color: CSS.text, fontSize: 15, outline: 'none', boxSizing: 'border-box', marginTop: 8 }} />
              )}
            </div>
          )
        })()}
        {q.t === 'text' && (
          <input type="text" value={val} onChange={e => update(e.target.value)} placeholder={q.ph || ''}
            style={{ width: '100%', padding: '12px 14px', background: CSS.bg, border: `1px solid ${CSS.border}`, borderRadius: 8, color: CSS.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
        )}
        {q.t === 'num' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" value={val} onChange={e => update(e.target.value)} placeholder={q.ph || ''}
              style={{ flex: 1, padding: '12px 14px', background: CSS.bg, border: `1px solid ${CSS.border}`, borderRadius: 8, color: CSS.text, fontSize: 15, outline: 'none' }} />
            {q.u && <span style={{ fontSize: 13, color: CSS.muted }}>{q.u}</span>}
          </div>
        )}
        {q.t === 'date' && (
          <div>
            <input type="date" value={val} onChange={e => {
              const d = e.target.value
              if (d) {
                const [y, m, dy] = d.split('-')
                update(d)
              } else update('')
            }}
              style={{ width: '100%', padding: '12px 14px', background: CSS.bg, border: `1px solid ${CSS.border}`, borderRadius: 8, color: CSS.text, fontSize: 15, outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }} />
            {val && <div style={{ fontSize: 13, color: CSS.accent, marginTop: 6 }}>
              {new Date(val + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>}
          </div>
        )}
        {q.t === 'ta' && (
          <textarea value={val} onChange={e => update(e.target.value)} placeholder={q.ph || ''} rows={3}
            style={{ width: '100%', padding: '12px 14px', background: CSS.bg, border: `1px solid ${CSS.border}`, borderRadius: 8, color: CSS.text, fontSize: 15, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        )}
        {q.t === 'ch' && q.opts && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {q.opts.map(o => (
              <button key={o} onClick={() => update(o)}
                style={{ padding: '10px 14px', background: val === o ? CSS.accentDim : CSS.bg, border: `1px solid ${val === o ? CSS.accent : CSS.border}`, borderRadius: 8, color: val === o ? CSS.accent : CSS.text, fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
                {o}
              </button>
            ))}
          </div>
        )}
        {q.t === 'multi' && q.opts && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {q.opts.map(o => {
              const arr = val || []
              const sel = arr.includes(o)
              return (
                <button key={o} onClick={() => update(sel ? arr.filter(x => x !== o) : [...arr, o])}
                  style={{ padding: '8px 12px', background: sel ? CSS.accentDim : CSS.bg, border: `1px solid ${sel ? CSS.accent : CSS.border}`, borderRadius: 8, color: sel ? CSS.accent : CSS.text, fontSize: 13, cursor: 'pointer' }}>
                  {sel ? '✓ ' : ''}{o}
                </button>
              )
            })}
          </div>
        )}
        {q.photo && (
          <PhotoCapture
            photos={photos[prefix + q.id] || []}
            onAdd={p => setPhotos(prev => ({ ...prev, [prefix + q.id]: [...(prev[prefix + q.id] || []), p] }))}
            onRemove={i => setPhotos(prev => ({ ...prev, [prefix + q.id]: (prev[prefix + q.id] || []).filter((_, j) => j !== i) }))}
          />
        )}
      </div>
    )
  }

  // Group questions by section
  const groupBySection = (qs) => {
    const groups = []
    qs.forEach(q => {
      const last = groups[groups.length - 1]
      if (last && last.sec === q.sec) last.items.push(q)
      else groups.push({ sec: q.sec, items: [q] })
    })
    return groups
  }

  // Generate report
  const generateReport = async () => {
    setGenerating(true)
    try {
      const zoneScores = zones.map(z => scoreZone(z, building))
      const comp = compositeScore(zoneScores)
      const oshaEvals = zones.map((z, i) => evalOSHA({ ...building, ...z }, zoneScores[i].tot))
      const recs = genRecs(zoneScores, building)
      const ventCalcs = zones.map(z => calcVent(z.su, z.sf, z.oc))
      const samplingPlan = generateSamplingPlan(zones, building)
      const causalChains = buildCausalChains(zones, building, zoneScores)
      let narrative = null
      try {
        narrative = await generateNarrative(building, zones, zoneScores, comp?.tot, oshaEvals, recs)
      } catch (e) { console.warn('Narrative generation skipped:', e) }
      const rpt = {
        id: 'rpt-' + Date.now(),
        ts: new Date().toISOString(),
        ver: VER,
        presurvey, building, zones, photos,
        zoneScores, comp, oshaEvals, recs, ventCalcs,
        samplingPlan, causalChains, narrative,
      }
      setReport(rpt)
      await STO.set(rpt.id, rpt)
      await STO.addReportToIndex({ id: rpt.id, ts: rpt.ts, facility: building.fn, score: comp?.tot })
      const idx = await STO.getIndex()
      setSavedReports(idx.reports || [])
      setStep(4)
    } catch (e) {
      console.error('Report generation error:', e)
      alert('Error generating report: ' + e.message)
    }
    setGenerating(false)
  }

  // Save draft
  const saveDraft = async () => {
    const id = 'draft-' + Date.now()
    const draft = { id, ts: new Date().toISOString(), presurvey, building, zones, photos, step, curZone }
    await STO.set(id, draft)
    await STO.addDraftToIndex({ id, ts: draft.ts, facility: building.fn || 'Untitled' })
    const idx = await STO.getIndex()
    setSavedDrafts(idx.drafts || [])
    alert('Draft saved!')
  }

  // Load draft
  const loadDraft = async (id) => {
    const d = await STO.get(id)
    if (!d) return
    setPresurvey(d.presurvey || {})
    setBuilding(d.building || {})
    setZones(d.zones || [{}])
    setPhotos(d.photos || {})
    setStep(d.step || 0)
    setCurZone(d.curZone || 0)
    setShowHistory(false)
  }

  // Load report
  const loadReport = async (id) => {
    const r = await STO.get(id)
    if (!r) return
    setReport(r)
    setPresurvey(r.presurvey || {})
    setBuilding(r.building || {})
    setZones(r.zones || [{}])
    setPhotos(r.photos || {})
    setStep(4)
    setShowHistory(false)
  }

  // Severity badge
  const sevBadge = (sev) => {
    const colors = { critical: '#EF4444', high: '#FB923C', medium: '#FBBF24', low: '#22D3EE', pass: '#22C55E', info: '#8B5CF6' }
    return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: (colors[sev] || '#5E6578') + '20', color: colors[sev] || '#5E6578' }}>{sev}</span>
  }

  if (loading) return <Loading onDone={handleLoadingDone} fast={visited} />

  // History view
  if (showHistory) {
    return (
      <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: 'Outfit, sans-serif', padding: 20, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowHistory(false)} style={{ ...btn(false), padding: '8px 16px' }}>← Back</button>
          <h2 style={{ margin: 0, fontSize: 20 }}>History</h2>
        </div>
        {savedReports.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, color: CSS.accent, marginBottom: 12 }}>Completed Reports</h3>
            {savedReports.map(r => (
              <div key={r.id} onClick={() => loadReport(r.id)} style={{ ...card, cursor: 'pointer' }}>
                <div style={{ fontWeight: 600 }}>{r.facility || 'Untitled'}</div>
                <div style={{ fontSize: 12, color: CSS.muted }}>{new Date(r.ts).toLocaleString()}</div>
                {r.score != null && <div style={{ fontSize: 13, color: CSS.accent, marginTop: 4 }}>Score: {r.score}/100</div>}
              </div>
            ))}
          </>
        )}
        {savedDrafts.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, color: CSS.warn, marginBottom: 12, marginTop: 20 }}>Drafts</h3>
            {savedDrafts.map(d => (
              <div key={d.id} onClick={() => loadDraft(d.id)} style={{ ...card, cursor: 'pointer' }}>
                <div style={{ fontWeight: 600 }}>{d.facility || 'Untitled'}</div>
                <div style={{ fontSize: 12, color: CSS.muted }}>{new Date(d.ts).toLocaleString()}</div>
              </div>
            ))}
          </>
        )}
        {!savedReports.length && !savedDrafts.length && (
          <div style={{ textAlign: 'center', color: CSS.muted, marginTop: 40 }}>No saved reports or drafts yet.</div>
        )}
      </div>
    )
  }

  // Report view
  if (step === 4 && report) {
    const { comp, zoneScores, oshaEvals, recs, ventCalcs, samplingPlan, causalChains, narrative } = report
    return (
      <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: 'Outfit, sans-serif', padding: 20, maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>atmos<span style={{ color: CSS.accent }}>IQ</span> Report</div>
            <div style={{ fontSize: 12, color: CSS.muted }}>{building.fn} — {new Date(report.ts).toLocaleString()}</div>
          </div>
          <button onClick={() => { setStep(0); setReport(null) }} style={{ ...btn(false), padding: '8px 16px' }}>New Assessment</button>
        </div>

        {/* Composite Score */}
        {comp && (
          <div style={{ ...card, textAlign: 'center', padding: 30 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <ScoreRing value={comp.tot} color={comp.rc} size={160} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: comp.rc }}>{comp.risk}</div>
            <div style={{ fontSize: 13, color: CSS.muted, marginTop: 4 }}>
              Avg: {comp.avg} | Worst: {comp.worst} | Zones: {comp.count}
            </div>
          </div>
        )}

        {/* AI Narrative */}
        {narrative && (
          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <I n="send" s={16} c={CSS.accent} /> AI Findings Narrative
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: '#C8D0DC', whiteSpace: 'pre-wrap' }}>{narrative}</div>
          </div>
        )}

        {/* Zone Scores */}
        {zoneScores?.map((zs, zi) => (
          <div key={zi} style={card}>
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
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: CSS.bg, borderRadius: 8, cursor: 'pointer' }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{c.l}</span>
                  <span style={{ fontSize: 13, color: CSS.muted }}>{c.s}/{c.mx}</span>
                </div>
                {expandedCats[`${zi}-${ci}`] && (
                  <div style={{ padding: '8px 12px' }}>
                    {c.r.map((r, ri) => (
                      <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                        {sevBadge(r.sev)}
                        <span style={{ color: '#C8D0DC' }}>{r.t}</span>
                        {r.std && <span style={{ fontSize: 11, color: CSS.muted }}>({r.std})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* OSHA */}
            {oshaEvals?.[zi] && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: oshaEvals[zi].flag ? '#EF444415' : '#22C55E15', borderRadius: 8, fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: oshaEvals[zi].flag ? CSS.danger : CSS.success }}>
                  <I n="shield" s={14} c={oshaEvals[zi].flag ? CSS.danger : CSS.success} /> OSHA Defensibility: {oshaEvals[zi].conf}
                </div>
                {oshaEvals[zi].fl.map((f, fi) => <div key={fi} style={{ color: CSS.danger, marginTop: 2 }}>⚠ {f}</div>)}
                {oshaEvals[zi].gaps.map((g, gi) => <div key={gi} style={{ color: CSS.warn, marginTop: 2 }}>Gap: {g}</div>)}
              </div>
            )}
            {/* Ventilation calc */}
            {ventCalcs?.[zi] && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: CSS.bg, borderRadius: 8, fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: CSS.accent, marginBottom: 4 }}>Ventilation Requirement ({ventCalcs[zi].ref})</div>
                <div style={{ color: '#C8D0DC' }}>
                  People OA: {ventCalcs[zi].pOA.toFixed(1)} CFM | Area OA: {ventCalcs[zi].aOA.toFixed(1)} CFM | Total: {ventCalcs[zi].tot.toFixed(1)} CFM ({ventCalcs[zi].pp.toFixed(1)} CFM/person)
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Causal Chains */}
        {causalChains?.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              <I n="chain" s={16} c={CSS.accent} /> Causal Chains
            </div>
            {causalChains.map((ch, i) => (
              <div key={i} style={{ marginBottom: 12, padding: 12, background: CSS.bg, borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{ch.zone}: {ch.type}</div>
                <div style={{ fontSize: 13, color: CSS.warn, marginTop: 4 }}>Confidence: {ch.confidence}</div>
                <div style={{ fontSize: 13, color: '#C8D0DC', marginTop: 4 }}>Root cause: {ch.rootCause}</div>
                <div style={{ marginTop: 4 }}>
                  {ch.evidence.map((e, ei) => <div key={ei} style={{ fontSize: 12, color: CSS.muted }}>• {e}</div>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sampling Plan */}
        {samplingPlan?.plan?.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              <I n="flask" s={16} c={CSS.accent} /> Recommended Sampling Plan
            </div>
            {samplingPlan.plan.map((p, i) => (
              <div key={i} style={{ marginBottom: 12, padding: 12, background: CSS.bg, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.zone}: {p.type}</span>
                  {sevBadge(p.priority)}
                </div>
                <div style={{ fontSize: 13, color: '#C8D0DC' }}>{p.hypothesis}</div>
                <div style={{ fontSize: 12, color: CSS.muted, marginTop: 4 }}>Method: {p.method}</div>
                <div style={{ fontSize: 12, color: CSS.muted }}>Controls: {p.controls}</div>
                <div style={{ fontSize: 11, color: CSS.accent, marginTop: 2 }}>{p.standard}</div>
              </div>
            ))}
            {samplingPlan.outdoorGaps?.length > 0 && (
              <div style={{ padding: 10, background: '#FBBF2415', borderRadius: 8, marginTop: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: CSS.warn, marginBottom: 4 }}>Data Gaps</div>
                {samplingPlan.outdoorGaps.map((g, i) => <div key={i} style={{ fontSize: 12, color: CSS.warn }}>⚠ {g}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {recs && (
          <div style={card}>
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
                {recs[key].map((r, i) => <div key={i} style={{ fontSize: 13, color: '#C8D0DC', padding: '2px 0' }}>• {r}</div>)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Wizard steps
  const canAdvance = () => {
    if (step === 0) {
      return Q_PRESURVEY.filter(q => q.req).every(q => presurvey[q.id])
    }
    if (step === 1) {
      return Q_BUILDING.filter(q => q.req).every(q => building[q.id])
    }
    if (step === 2) {
      return zones.every(z => Q_ZONE.filter(q => q.req).every(q => z[q.id]))
    }
    return true
  }

  return (
    <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: 'Outfit, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${CSS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: CSS.bg, zIndex: 100 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>
          atmos<span style={{ color: CSS.accent }}>IQ</span>
          <span style={{ fontSize: 10, color: CSS.muted, marginLeft: 8 }}>v{VER}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowHistory(true)} style={{ ...btn(false), padding: '6px 12px', fontSize: 13 }}>
            <I n="clock" s={14} c={CSS.muted} /> History
          </button>
          <button onClick={saveDraft} style={{ ...btn(false), padding: '6px 12px', fontSize: 13 }}>
            Save Draft
          </button>
        </div>
      </div>

      {/* Progress */}
      <div style={{ padding: '12px 20px', display: 'flex', gap: 4, alignItems: 'center' }}>
        {STEP_LABELS.slice(0, 4).map((label, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: '100%', height: 3, borderRadius: 2, background: i <= step ? CSS.accent : CSS.border, transition: 'background .3s' }} />
            <span style={{ fontSize: 11, color: i <= step ? CSS.accent : CSS.muted }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
        {/* Step 0: Pre-Survey */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Pre-Survey Questionnaire</h2>
            {groupBySection(Q_PRESURVEY).map(g => (
              <div key={g.sec}>
                <div style={{ fontSize: 13, fontWeight: 600, color: CSS.accent, marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1 }}>{g.sec}</div>
                {g.items.map(q => renderQ(q, presurvey, setPresurvey))}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Building */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Building Assessment</h2>
            {groupBySection(Q_BUILDING).map(g => (
              <div key={g.sec}>
                <div style={{ fontSize: 13, fontWeight: 600, color: CSS.accent, marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1 }}>{g.sec}</div>
                {g.items.map(q => renderQ(q, building, setBuilding))}
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Zones */}
        {step === 2 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>Zone {curZone + 1} of {zones.length}</h2>
              <button onClick={() => { setZones([...zones, {}]); setCurZone(zones.length) }}
                style={{ ...btn(false), padding: '6px 14px', fontSize: 13 }}>+ Add Zone</button>
            </div>
            {zones.length > 1 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                {zones.map((_, i) => (
                  <button key={i} onClick={() => setCurZone(i)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${i === curZone ? CSS.accent : CSS.border}`, background: i === curZone ? CSS.accentDim : 'transparent', color: i === curZone ? CSS.accent : CSS.muted, fontSize: 13, cursor: 'pointer' }}>
                    {zones[i].zn || `Zone ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
            {groupBySection(Q_ZONE).map(g => (
              <div key={g.sec}>
                <div style={{ fontSize: 13, fontWeight: 600, color: CSS.accent, marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1 }}>{g.sec}</div>
                {g.items.map(q => renderQ(q, zones[curZone] || {}, (d) => {
                  const nz = [...zones]
                  nz[curZone] = d
                  setZones(nz)
                }, `z${curZone}_`))}
              </div>
            ))}
            {zones.length > 1 && (
              <button onClick={() => {
                const nz = zones.filter((_, i) => i !== curZone)
                setZones(nz)
                setCurZone(Math.max(0, curZone - 1))
              }} style={{ ...btn(false), padding: '8px 16px', fontSize: 13, color: CSS.danger, borderColor: CSS.danger, marginTop: 12 }}>
                Remove This Zone
              </button>
            )}
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Review & Generate Report</h2>
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Facility</div>
              <div style={{ fontSize: 14, color: '#C8D0DC' }}>{building.fn || '—'}, {building.fl || '—'}</div>
              <div style={{ fontSize: 13, color: CSS.muted }}>{building.ft} | HVAC: {building.ht}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Assessor</div>
              <div style={{ fontSize: 14, color: '#C8D0DC' }}>{presurvey.ps_assessor || '—'}</div>
              <div style={{ fontSize: 13, color: CSS.muted }}>Trigger: {presurvey.ps_reason || '—'}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Zones ({zones.length})</div>
              {zones.map((z, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: i < zones.length - 1 ? `1px solid ${CSS.border}` : 'none', fontSize: 14, color: '#C8D0DC' }}>
                  {z.zn || `Zone ${i + 1}`} — {z.su || '?'} — {z.oc || '?'} occupants — {z.sf || '?'} sq ft
                </div>
              ))}
            </div>
            <button onClick={generateReport} disabled={generating}
              style={{ ...btn(true), width: '100%', marginTop: 12, opacity: generating ? 0.6 : 1 }}>
              {generating ? 'Generating Report...' : 'Generate Report'}
            </button>
          </div>
        )}

        {/* Navigation */}
        {step < 4 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingBottom: 40 }}>
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              style={{ ...btn(false), opacity: step === 0 ? 0.3 : 1 }}>← Back</button>
            {step < 3 && (
              <button onClick={() => setStep(step + 1)} disabled={!canAdvance()}
                style={{ ...btn(true), opacity: canAdvance() ? 1 : 0.4 }}>
                Next →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
