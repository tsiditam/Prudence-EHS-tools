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
import { useMediaQuery } from './hooks/useMediaQuery'

// ── Design Tokens ──────────────────────────────────────────────────────────
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
  cardGlass: 'rgba(12, 16, 23, 0.7)',
  cardGlassBorder: 'rgba(34, 211, 238, 0.08)',
  surfaceHover: '#0F1520',
  glowAccent: '0 0 20px rgba(34,211,238,0.15)',
  shadow1: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
  shadow2: '0 4px 14px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.2)',
  shadow3: '0 10px 30px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.25)',
}

const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }

const mono = { fontFamily: 'DM Mono, monospace' }

const btn = (primary, dk) => ({
  padding: dk ? '14px 32px' : '14px 28px',
  background: primary ? CSS.accent : 'transparent',
  color: primary ? '#080A0E' : CSS.text,
  border: primary ? 'none' : `1px solid ${CSS.border}`,
  borderRadius: dk ? 14 : 12,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all .2s cubic-bezier(0.4,0,0.2,1)',
  boxShadow: primary && dk ? CSS.glowAccent : 'none',
})

const cardStyle = (dk) => ({
  background: dk ? CSS.cardGlass : CSS.card,
  backdropFilter: dk ? 'blur(16px)' : 'none',
  WebkitBackdropFilter: dk ? 'blur(16px)' : 'none',
  border: `1px solid ${dk ? CSS.cardGlassBorder : CSS.border}`,
  borderRadius: dk ? 16 : 14,
  padding: dk ? 24 : 20,
  marginBottom: dk ? 20 : 16,
  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
  boxShadow: dk ? CSS.shadow1 : 'none',
})

const STEPS = ['presurvey', 'building', 'zones', 'review', 'report']
const STEP_LABELS = ['Pre-Survey', 'Building', 'Zones', 'Review']
const STEP_ICONS = ['clip', 'bldg', 'search', 'findings']

// ── Sidebar ────────────────────────────────────────────────────────────────
function DesktopSidebar({ step, setStep, saveDraft, setShowHistory }) {
  return (
    <div style={{
      position: 'fixed', left: 0, top: 0, bottom: 0, width: 280,
      background: 'linear-gradient(180deg, #0A0D14 0%, #080A0E 100%)',
      borderRight: `1px solid ${CSS.border}`,
      display: 'flex', flexDirection: 'column',
      padding: '0', zIndex: 200,
      boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
    }}>
      {/* Gradient accent line */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, #22D3EE, #06B6D4, transparent)', flexShrink: 0 }} />

      {/* Brand */}
      <div style={{ padding: '32px 28px 24px', borderBottom: `1px solid ${CSS.border}` }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
          atmos<span style={{ color: CSS.accent }}>IQ</span>
        </div>
        <div style={{ fontSize: 11, color: CSS.muted, marginTop: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Indoor Air Quality Intelligence
        </div>
        <div style={{ fontSize: 10, color: CSS.accent, marginTop: 8, ...mono, opacity: 0.6 }}>v{VER}</div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, padding: '20px 0', overflowY: 'auto' }}>
        <div style={{ padding: '0 16px', marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: CSS.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assessment Steps</div>
        </div>
        {STEP_LABELS.map((label, i) => {
          const active = i === step
          const completed = i < step
          const clickable = i <= step
          return (
            <div key={i} onClick={() => clickable && setStep(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 28px', margin: '2px 12px', borderRadius: 10,
                cursor: clickable ? 'pointer' : 'default',
                background: active ? CSS.accentDim : 'transparent',
                borderLeft: active ? `3px solid ${CSS.accent}` : '3px solid transparent',
                transition: 'all 0.2s ease',
                opacity: clickable ? 1 : 0.4,
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? CSS.accent : completed ? CSS.accent + '30' : CSS.border,
                color: active ? '#080A0E' : completed ? CSS.accent : CSS.muted,
                fontSize: 13, fontWeight: 700, ...mono,
                transition: 'all 0.2s ease',
              }}>
                {completed ? <I n="check" s={14} c={CSS.accent} /> : i + 1}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? CSS.text : completed ? CSS.accent : CSS.muted }}>
                  {label}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div style={{ padding: '16px 20px', borderTop: `1px solid ${CSS.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={saveDraft} style={{
          width: '100%', padding: '10px 16px', background: 'transparent',
          border: `1px solid ${CSS.border}`, borderRadius: 10, color: CSS.text,
          fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
          <I n="save" s={14} c={CSS.muted} /> Save Draft
        </button>
        <button onClick={() => setShowHistory(true)} style={{
          width: '100%', padding: '10px 16px', background: 'transparent',
          border: `1px solid ${CSS.border}`, borderRadius: 10, color: CSS.text,
          fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
          <I n="clock" s={14} c={CSS.muted} /> History
        </button>
      </div>

      {/* Footer */}
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${CSS.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: CSS.muted, lineHeight: 1.5 }}>Prudence Safety &amp;</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: CSS.muted, lineHeight: 1.5 }}>Environmental Consulting</div>
        <div style={{ fontSize: 9, color: CSS.muted, marginTop: 4, opacity: 0.5 }}>© 2026 All rights reserved</div>
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const { isDesktop } = useMediaQuery()
  const dk = isDesktop
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
  const [animKey, setAnimKey] = useState(0)

  useEffect(() => {
    (async () => {
      const v = await STO.hasVisited()
      setVisited(!!v)
      const idx = await STO.getIndex()
      setSavedReports(idx.reports || [])
      setSavedDrafts(idx.drafts || [])
    })()
  }, [])

  useEffect(() => { setAnimKey(k => k + 1) }, [step])

  const handleLoadingDone = useCallback(() => {
    setLoading(false)
    STO.markVisited()
  }, [])

  const crd = cardStyle(dk)

  // ── Hover helpers ──
  const cardHover = dk ? {
    onMouseEnter: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = CSS.shadow2; e.currentTarget.style.borderColor = 'rgba(34,211,238,0.15)' },
    onMouseLeave: (e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = CSS.shadow1; e.currentTarget.style.borderColor = CSS.cardGlassBorder },
  } : {}

  const inputStyle = {
    width: '100%', padding: '12px 14px', background: CSS.bg,
    border: `1px solid ${CSS.border}`, borderRadius: 8, color: CSS.text,
    fontSize: 15, outline: 'none', boxSizing: 'border-box',
    transition: 'all 0.2s ease',
  }

  const inputFocus = {
    onFocus: (e) => { e.target.style.borderColor = CSS.accent; e.target.style.boxShadow = CSS.glowAccent },
    onBlur: (e) => { e.target.style.borderColor = CSS.border; e.target.style.boxShadow = 'none' },
  }

  const btnPress = {
    onMouseDown: (e) => { e.currentTarget.style.transform = 'scale(0.97)' },
    onMouseUp: (e) => { e.currentTarget.style.transform = 'scale(1)' },
  }

  // ── Question rendering ──
  const renderQ = (q, data, setData, prefix = '') => {
    if (q.cond) {
      const { f, eq, ne } = q.cond
      if (eq && data[f] !== eq) return null
      if (ne && data[f] === ne) return null
    }
    if (q.t === 'sensors') {
      return (
        <div key={q.id} style={crd} {...cardHover}>
          <div style={{ fontSize: 16, fontWeight: 600, color: CSS.text, marginBottom: 12 }}>{q.ic} {q.q}</div>
          <SensorScreen data={data} onChange={(id, v) => setData({ ...data, [id]: v })} isDesktop={dk} />
        </div>
      )
    }
    const val = data[q.id] || ''
    const update = (v) => setData({ ...data, [q.id]: v })
    return (
      <div key={q.id} style={{ ...crd, borderColor: q.req && !val ? '#EF444440' : crd.borderColor }} {...cardHover}>
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
                style={{ ...inputStyle, appearance: 'auto', cursor: 'pointer' }} {...inputFocus}>
                <option value="" style={{ color: CSS.muted }}>Select...</option>
                {otherOpts.map(o => <option key={o} value={o} style={{ color: CSS.text, background: CSS.bg }}>{o}</option>)}
                <option value="__other__" style={{ color: CSS.text, background: CSS.bg }}>Other (type in)</option>
              </select>
              {isOther && (
                <input type="text" value={customText} onChange={e => update(e.target.value || '__other__')} placeholder={q.ph || 'Type here...'}
                  autoFocus style={{ ...inputStyle, borderColor: CSS.accent, marginTop: 8 }} {...inputFocus} />
              )}
            </div>
          )
        })()}
        {q.t === 'text' && (
          <input type="text" value={val} onChange={e => update(e.target.value)} placeholder={q.ph || ''}
            style={inputStyle} {...inputFocus} />
        )}
        {q.t === 'num' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" value={val} onChange={e => update(e.target.value)} placeholder={q.ph || ''}
              style={{ ...inputStyle, flex: 1, ...mono }} {...inputFocus} />
            {q.u && <span style={{ fontSize: 13, color: CSS.muted, ...mono }}>{q.u}</span>}
          </div>
        )}
        {q.t === 'date' && (
          <div>
            <input type="date" value={val} onChange={e => update(e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }} {...inputFocus} />
            {val && <div style={{ fontSize: 13, color: CSS.accent, marginTop: 6 }}>
              {new Date(val + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>}
          </div>
        )}
        {q.t === 'ta' && (
          <textarea value={val} onChange={e => update(e.target.value)} placeholder={q.ph || ''} rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} {...inputFocus} />
        )}
        {q.t === 'ch' && q.opts && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {q.opts.map(o => (
              <button key={o} onClick={() => update(o)}
                style={{
                  padding: '10px 14px',
                  background: val === o ? CSS.accentDim : CSS.bg,
                  border: `1px solid ${val === o ? CSS.accent : CSS.border}`,
                  borderRadius: 8, color: val === o ? CSS.accent : CSS.text,
                  fontSize: 14, cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}>
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
                  style={{
                    padding: '8px 12px',
                    background: sel ? CSS.accentDim : CSS.bg,
                    border: `1px solid ${sel ? CSS.accent : CSS.border}`,
                    borderRadius: 8, color: sel ? CSS.accent : CSS.text,
                    fontSize: 13, cursor: 'pointer', transition: 'all 0.15s ease',
                  }}>
                  {sel ? '✓ ' : ''}{o}
                </button>
              )
            })}
          </div>
        )}
        {q.photo && (
          <PhotoCapture isDesktop={dk}
            photos={photos[prefix + q.id] || []}
            onAdd={p => setPhotos(prev => ({ ...prev, [prefix + q.id]: [...(prev[prefix + q.id] || []), p] }))}
            onRemove={i => setPhotos(prev => ({ ...prev, [prefix + q.id]: (prev[prefix + q.id] || []).filter((_, j) => j !== i) }))}
          />
        )}
      </div>
    )
  }

  const groupBySection = (qs) => {
    const groups = []
    qs.forEach(q => {
      const last = groups[groups.length - 1]
      if (last && last.sec === q.sec) last.items.push(q)
      else groups.push({ sec: q.sec, items: [q] })
    })
    return groups
  }

  // ── Generate report ──
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
      try { narrative = await generateNarrative(building, zones, zoneScores, comp?.tot, oshaEvals, recs) }
      catch (e) { console.warn('Narrative generation skipped:', e) }
      const rpt = {
        id: 'rpt-' + Date.now(), ts: new Date().toISOString(), ver: VER,
        presurvey, building, zones, photos, zoneScores, comp, oshaEvals, recs, ventCalcs,
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

  const saveDraft = async () => {
    const id = 'draft-' + Date.now()
    const draft = { id, ts: new Date().toISOString(), presurvey, building, zones, photos, step, curZone }
    await STO.set(id, draft)
    await STO.addDraftToIndex({ id, ts: draft.ts, facility: building.fn || 'Untitled' })
    const idx = await STO.getIndex()
    setSavedDrafts(idx.drafts || [])
    alert('Draft saved!')
  }

  const loadDraft = async (id) => {
    const d = await STO.get(id)
    if (!d) return
    setPresurvey(d.presurvey || {}); setBuilding(d.building || {})
    setZones(d.zones || [{}]); setPhotos(d.photos || {})
    setStep(d.step || 0); setCurZone(d.curZone || 0); setShowHistory(false)
  }

  const loadReport = async (id) => {
    const r = await STO.get(id)
    if (!r) return
    setReport(r); setPresurvey(r.presurvey || {}); setBuilding(r.building || {})
    setZones(r.zones || [{}]); setPhotos(r.photos || {}); setStep(4); setShowHistory(false)
  }

  const sevBadge = (sev) => {
    const colors = { critical: '#EF4444', high: '#FB923C', medium: '#FBBF24', low: '#22D3EE', pass: '#22C55E', info: '#8B5CF6' }
    return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: (colors[sev] || '#5E6578') + '20', color: colors[sev] || '#5E6578', ...mono }}>{sev}</span>
  }

  const sectionHeader = (text) => (
    <div style={{
      fontSize: dk ? 14 : 13, fontWeight: 600, color: CSS.accent,
      marginBottom: 8, marginTop: dk ? 24 : 16,
      textTransform: 'uppercase', letterSpacing: 1,
      borderLeft: dk ? `3px solid ${CSS.accent}` : 'none',
      paddingLeft: dk ? 12 : 0,
    }}>{text}</div>
  )

  if (loading) return <Loading onDone={handleLoadingDone} fast={visited} />

  // ── History View ──
  if (showHistory) {
    return (
      <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: 'Outfit, sans-serif' }}>
        {dk && <DesktopSidebar step={step} setStep={setStep} saveDraft={saveDraft} setShowHistory={setShowHistory} />}
        <div style={{ marginLeft: dk ? 280 : 0, padding: dk ? '40px 48px' : 20, maxWidth: dk ? 900 : 600, margin: dk ? undefined : '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button onClick={() => setShowHistory(false)} style={{ ...btn(false, dk), padding: '8px 16px' }}>← Back</button>
            <h2 style={{ margin: 0, fontSize: dk ? 24 : 20, fontWeight: 700, letterSpacing: '-0.02em' }}>History</h2>
          </div>
          {savedReports.length > 0 && (
            <>
              <h3 style={{ fontSize: 16, color: CSS.accent, marginBottom: 12 }}>Completed Reports</h3>
              <div style={{ display: dk ? 'grid' : 'block', gridTemplateColumns: dk ? 'repeat(auto-fill, minmax(300px, 1fr))' : undefined, gap: dk ? 20 : undefined }}>
                {savedReports.map(r => (
                  <div key={r.id} onClick={() => loadReport(r.id)} style={{ ...crd, cursor: 'pointer' }} {...cardHover}>
                    <div style={{ fontWeight: 600 }}>{r.facility || 'Untitled'}</div>
                    <div style={{ fontSize: 12, color: CSS.muted }}>{new Date(r.ts).toLocaleString()}</div>
                    {r.score != null && <div style={{ fontSize: 13, color: CSS.accent, marginTop: 4, ...mono }}>Score: {r.score}/100</div>}
                  </div>
                ))}
              </div>
            </>
          )}
          {savedDrafts.length > 0 && (
            <>
              <h3 style={{ fontSize: 16, color: CSS.warn, marginBottom: 12, marginTop: 20 }}>Drafts</h3>
              <div style={{ display: dk ? 'grid' : 'block', gridTemplateColumns: dk ? 'repeat(auto-fill, minmax(300px, 1fr))' : undefined, gap: dk ? 20 : undefined }}>
                {savedDrafts.map(d => (
                  <div key={d.id} onClick={() => loadDraft(d.id)} style={{ ...crd, cursor: 'pointer' }} {...cardHover}>
                    <div style={{ fontWeight: 600 }}>{d.facility || 'Untitled'}</div>
                    <div style={{ fontSize: 12, color: CSS.muted }}>{new Date(d.ts).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {!savedReports.length && !savedDrafts.length && (
            <div style={{ textAlign: 'center', color: CSS.muted, marginTop: 40 }}>No saved reports or drafts yet.</div>
          )}
        </div>
      </div>
    )
  }

  // ── Report View ──
  if (step === 4 && report) {
    const { comp, zoneScores, oshaEvals, recs, ventCalcs, samplingPlan, causalChains, narrative } = report
    return (
      <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: 'Outfit, sans-serif' }}>
        {dk && <DesktopSidebar step={step} setStep={setStep} saveDraft={saveDraft} setShowHistory={setShowHistory} />}
        <div style={{ marginLeft: dk ? 280 : 0, padding: dk ? '40px 48px' : 20, maxWidth: dk ? 1100 : 700, margin: dk ? undefined : '0 auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: dk ? 36 : 24, paddingBottom: dk ? 24 : 0, borderBottom: dk ? `1px solid ${CSS.border}` : 'none' }}>
            <div>
              <div style={{ fontSize: dk ? 28 : 22, fontWeight: 800, letterSpacing: '-0.02em' }}>atmos<span style={{ color: CSS.accent }}>IQ</span> Report</div>
              <div style={{ fontSize: 12, color: CSS.muted, marginTop: 4 }}>{building.fn} — {new Date(report.ts).toLocaleString()}</div>
            </div>
            <button onClick={() => { setStep(0); setReport(null) }} style={{ ...btn(false, dk), padding: '8px 16px' }} {...btnPress}>New Assessment</button>
          </div>

          {/* Composite Score */}
          {comp && (
            <div style={{ ...crd, textAlign: 'center', padding: dk ? 48 : 30, position: 'relative', overflow: 'hidden' }}>
              {dk && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, position: 'relative' }}>
                <ScoreRing value={comp.tot} color={comp.rc} size={dk ? 200 : 160} />
              </div>
              <div style={{ fontSize: dk ? 22 : 18, fontWeight: 700, color: comp.rc, position: 'relative' }}>{comp.risk}</div>
              <div style={{ fontSize: 13, color: CSS.muted, marginTop: 4, ...mono, position: 'relative' }}>
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
                      <span style={{ fontSize: 13, color: CSS.muted, ...mono }}>{c.s}/{c.mx}</span>
                    </div>
                    <div style={{ overflow: 'hidden', maxHeight: expandedCats[`${zi}-${ci}`] ? 1000 : 0, opacity: expandedCats[`${zi}-${ci}`] ? 1 : 0, transition: 'max-height 0.3s ease, opacity 0.2s ease 0.1s' }}>
                      <div style={{ padding: '8px 12px' }}>
                        {c.r.map((r, ri) => (
                          <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                            {sevBadge(r.sev)}
                            <span style={{ color: '#C8D0DC' }}>{r.t}</span>
                            {r.std && <span style={{ fontSize: 11, color: CSS.muted }}>({r.std})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {oshaEvals?.[zi] && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: oshaEvals[zi].flag ? '#EF444415' : '#22C55E15', borderRadius: 8, fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: oshaEvals[zi].flag ? CSS.danger : CSS.success }}>
                      <I n="shield" s={14} c={oshaEvals[zi].flag ? CSS.danger : CSS.success} /> OSHA Defensibility: {oshaEvals[zi].conf}
                    </div>
                    {oshaEvals[zi].fl.map((f, fi) => <div key={fi} style={{ color: CSS.danger, marginTop: 2 }}>⚠ {f}</div>)}
                    {oshaEvals[zi].gaps.map((g, gi) => <div key={gi} style={{ color: CSS.warn, marginTop: 2 }}>Gap: {g}</div>)}
                  </div>
                )}
                {ventCalcs?.[zi] && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: CSS.bg, borderRadius: 8, fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: CSS.accent, marginBottom: 4 }}>Ventilation Requirement ({ventCalcs[zi].ref})</div>
                    <div style={{ color: '#C8D0DC', ...mono, fontSize: 12 }}>
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
                    <div style={{ fontSize: 13, color: CSS.warn, marginTop: 4, ...mono }}>Confidence: {ch.confidence}</div>
                    <div style={{ fontSize: 13, color: '#C8D0DC', marginTop: 4 }}>Root cause: {ch.rootCause}</div>
                    <div style={{ marginTop: 4 }}>
                      {ch.evidence.map((e, ei) => <div key={ei} style={{ fontSize: 12, color: CSS.muted }}>• {e}</div>)}
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
                      {sevBadge(p.priority)}
                    </div>
                    <div style={{ fontSize: 13, color: '#C8D0DC' }}>{p.hypothesis}</div>
                    <div style={{ fontSize: 12, color: CSS.muted, marginTop: 4 }}>Method: {p.method}</div>
                    <div style={{ fontSize: 12, color: CSS.muted }}>Controls: {p.controls}</div>
                    <div style={{ fontSize: 11, color: CSS.accent, marginTop: 2, ...mono }}>{p.standard}</div>
                  </div>
                ))}
              </div>
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
                  {recs[key].map((r, i) => <div key={i} style={{ fontSize: 13, color: '#C8D0DC', padding: '2px 0' }}>• {r}</div>)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Wizard validation ──
  const canAdvance = () => {
    if (step === 0) return Q_PRESURVEY.filter(q => q.req).every(q => presurvey[q.id])
    if (step === 1) return Q_BUILDING.filter(q => q.req).every(q => building[q.id])
    if (step === 2) return zones.every(z => Q_ZONE.filter(q => q.req).every(q => z[q.id]))
    return true
  }

  // ── Main Wizard ──
  return (
    <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: 'Outfit, sans-serif' }}>
      {/* Desktop Sidebar */}
      {dk && <DesktopSidebar step={step} setStep={setStep} saveDraft={saveDraft} setShowHistory={setShowHistory} />}

      {/* Mobile Header */}
      {!dk && (
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${CSS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: CSS.bg, zIndex: 100 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            atmos<span style={{ color: CSS.accent }}>IQ</span>
            <span style={{ fontSize: 10, color: CSS.muted, marginLeft: 8 }}>v{VER}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowHistory(true)} style={{ ...btn(false, dk), padding: '6px 12px', fontSize: 13 }}>
              <I n="clock" s={14} c={CSS.muted} /> History
            </button>
            <button onClick={saveDraft} style={{ ...btn(false, dk), padding: '6px 12px', fontSize: 13 }}>Save Draft</button>
          </div>
        </div>
      )}

      {/* Mobile Progress */}
      {!dk && (
        <div style={{ padding: '12px 20px', display: 'flex', gap: 4, alignItems: 'center' }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: 3, borderRadius: 2, background: i <= step ? CSS.accent : CSS.border, transition: 'background .3s' }} />
              <span style={{ fontSize: 11, color: i <= step ? CSS.accent : CSS.muted }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ marginLeft: dk ? 280 : 0, padding: dk ? '40px 48px' : 20, maxWidth: dk ? 800 : 600, margin: dk ? undefined : '0 auto' }}>
        {/* Desktop top accent line */}
        {dk && <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.12), transparent)', marginBottom: 32 }} />}

        <div key={animKey} style={{ animation: dk ? 'fadeIn 0.3s ease' : 'none' }}>
          {/* Step 0: Pre-Survey */}
          {step === 0 && (
            <div>
              <h2 style={{ fontSize: dk ? 24 : 18, marginBottom: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Pre-Survey Questionnaire</h2>
              {groupBySection(Q_PRESURVEY).map(g => (
                <div key={g.sec}>
                  {sectionHeader(g.sec)}
                  {g.items.map(q => renderQ(q, presurvey, setPresurvey))}
                </div>
              ))}
            </div>
          )}

          {/* Step 1: Building */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: dk ? 24 : 18, marginBottom: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Building Assessment</h2>
              {groupBySection(Q_BUILDING).map(g => (
                <div key={g.sec}>
                  {sectionHeader(g.sec)}
                  {g.items.map(q => renderQ(q, building, setBuilding))}
                </div>
              ))}
            </div>
          )}

          {/* Step 2: Zones */}
          {step === 2 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ fontSize: dk ? 24 : 18, margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>Zone {curZone + 1} of {zones.length}</h2>
                <button onClick={() => { setZones([...zones, {}]); setCurZone(zones.length) }}
                  style={{ ...btn(false, dk), padding: '6px 14px', fontSize: 13 }} {...btnPress}>+ Add Zone</button>
              </div>
              {zones.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                  {zones.map((_, i) => (
                    <button key={i} onClick={() => setCurZone(i)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${i === curZone ? CSS.accent : CSS.border}`, background: i === curZone ? CSS.accentDim : 'transparent', color: i === curZone ? CSS.accent : CSS.muted, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {zones[i].zn || `Zone ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}
              {groupBySection(Q_ZONE).map(g => (
                <div key={g.sec}>
                  {sectionHeader(g.sec)}
                  {g.items.map(q => renderQ(q, zones[curZone] || {}, (d) => {
                    const nz = [...zones]; nz[curZone] = d; setZones(nz)
                  }, `z${curZone}_`))}
                </div>
              ))}
              {zones.length > 1 && (
                <button onClick={() => {
                  const nz = zones.filter((_, i) => i !== curZone)
                  setZones(nz); setCurZone(Math.max(0, curZone - 1))
                }} style={{ ...btn(false, dk), padding: '8px 16px', fontSize: 13, color: CSS.danger, borderColor: CSS.danger, marginTop: 12 }}>
                  Remove This Zone
                </button>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: dk ? 24 : 18, marginBottom: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Review &amp; Generate Report</h2>
              <div style={crd} {...cardHover}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Facility</div>
                <div style={{ fontSize: 14, color: '#C8D0DC' }}>{building.fn || '—'}, {building.fl || '—'}</div>
                <div style={{ fontSize: 13, color: CSS.muted }}>{building.ft} | HVAC: {building.ht}</div>
              </div>
              <div style={crd} {...cardHover}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Assessor</div>
                <div style={{ fontSize: 14, color: '#C8D0DC' }}>{presurvey.ps_assessor || '—'}</div>
                <div style={{ fontSize: 13, color: CSS.muted }}>Trigger: {presurvey.ps_reason || '—'}</div>
              </div>
              <div style={crd} {...cardHover}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Zones ({zones.length})</div>
                {zones.map((z, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: i < zones.length - 1 ? `1px solid ${CSS.border}` : 'none', fontSize: 14, color: '#C8D0DC' }}>
                    {z.zn || `Zone ${i + 1}`} — {z.su || '?'} — {z.oc || '?'} occupants — {z.sf || '?'} sq ft
                  </div>
                ))}
              </div>
              <button onClick={generateReport} disabled={generating}
                style={{ ...btn(true, dk), width: '100%', marginTop: 12, opacity: generating ? 0.6 : 1, animation: !generating && dk ? 'glowPulse 2s ease-in-out infinite' : 'none' }} {...btnPress}>
                {generating ? 'Generating Report...' : 'Generate Report'}
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        {step < 4 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingBottom: 40 }}>
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              style={{ ...btn(false, dk), opacity: step === 0 ? 0.3 : 1 }} {...btnPress}>← Back</button>
            {step < 3 && (
              <button onClick={() => setStep(step + 1)} disabled={!canAdvance()}
                style={{ ...btn(true, dk), opacity: canAdvance() ? 1 : 0.4 }} {...btnPress}>
                Next →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global keyframes */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 20px rgba(34,211,238,0.1); } 50% { box-shadow: 0 0 30px rgba(34,211,238,0.25); } }
        ::selection { background: rgba(34,211,238,0.3); }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #080A0E; }
        ::-webkit-scrollbar-thumb { background: #1A2030; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #2A3040; }
      `}</style>
    </div>
  )
}
