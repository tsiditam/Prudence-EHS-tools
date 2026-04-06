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
import LandingPage from './components/LandingPage'
import { DEMO_PRESURVEY, DEMO_BUILDING, DEMO_ZONES } from './constants/demoData'

// ── Extracted components ──
import DesktopSidebar from './components/DesktopSidebar'
import HistoryView from './components/HistoryView'
import ReportView from './components/ReportView'
import MobileApp from './components/MobileApp'
import {
  CSS, SP, mono, btn, cardStyle, cardHoverHandlers,
  inputStyle, inputFocusHandlers, btnPressHandlers,
  sectionHeaderStyle, FONT_DESKTOP, FONT_MOBILE,
} from './styles/tokens'

const STEPS = ['presurvey', 'building', 'zones', 'review', 'report']
const STEP_LABELS = ['Pre-Survey', 'Building', 'Zones', 'Review']

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const { isDesktop, isStandalone } = useMediaQuery()
  const dk = isDesktop

  // Mobile users get the v5-style one-question-at-a-time experience
  if (!dk) return <MobileApp />
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
  const [animKey, setAnimKey] = useState(0)
  // PWA standalone → skip landing page, go straight to the wizard
  const [showLanding, setShowLanding] = useState(!isStandalone)
  const [isDemo, setIsDemo] = useState(false)

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

  const startNew = useCallback(() => {
    setPresurvey({}); setBuilding({}); setZones([{}]); setPhotos({})
    setStep(0); setCurZone(0); setReport(null); setIsDemo(false)
    setShowLanding(false)
  }, [])

  const startDemo = useCallback(() => {
    setPresurvey(DEMO_PRESURVEY); setBuilding(DEMO_BUILDING); setZones(DEMO_ZONES); setPhotos({})
    setStep(3); setCurZone(0); setReport(null); setIsDemo(true)
    setShowLanding(false)
  }, [])

  const crd = cardStyle(dk)
  const cardHover = cardHoverHandlers(dk)
  const btnPress = btnPressHandlers

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
                style={{ ...inputStyle, appearance: 'auto', cursor: 'pointer' }} {...inputFocusHandlers}>
                <option value="" style={{ color: CSS.muted }}>Select...</option>
                {otherOpts.map(o => <option key={o} value={o} style={{ color: CSS.text, background: CSS.bg }}>{o}</option>)}
                <option value="__other__" style={{ color: CSS.text, background: CSS.bg }}>Other (type in)</option>
              </select>
              {isOther && (
                <input type="text" value={customText} onChange={e => update(e.target.value || '__other__')} placeholder={q.ph || 'Type here...'}
                  autoFocus style={{ ...inputStyle, borderColor: CSS.accent, marginTop: 8 }} {...inputFocusHandlers} />
              )}
            </div>
          )
        })()}
        {q.t === 'text' && (
          <input type="text" value={val} onChange={e => update(e.target.value)} placeholder={q.ph || ''}
            style={inputStyle} {...inputFocusHandlers} />
        )}
        {q.t === 'num' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" value={val} onChange={e => update(e.target.value)} placeholder={q.ph || ''}
              style={{ ...inputStyle, flex: 1, ...(dk ? mono : {}) }} {...inputFocusHandlers} />
            {q.u && <span style={{ fontSize: 13, color: CSS.muted, ...(dk ? mono : {}) }}>{q.u}</span>}
          </div>
        )}
        {q.t === 'date' && (
          <div>
            <input type="date" value={val} onChange={e => update(e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }} {...inputFocusHandlers} />
            {val && <div style={{ fontSize: 13, color: CSS.accent, marginTop: 6 }}>
              {new Date(val + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>}
          </div>
        )}
        {q.t === 'ta' && (
          <textarea value={val} onChange={e => update(e.target.value)} placeholder={q.ph || ''} rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} {...inputFocusHandlers} />
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

  // ── Early returns for special views ──
  if (loading) return <Loading onDone={handleLoadingDone} fast={visited} />

  if (showLanding) return <LandingPage onStartNew={startNew} onStartDemo={startDemo} isDesktop={dk} />

  if (showHistory) {
    return (
      <HistoryView
        dk={dk} step={step} setStep={setStep} saveDraft={saveDraft}
        setShowHistory={setShowHistory} setShowLanding={setShowLanding}
        savedReports={savedReports} savedDrafts={savedDrafts}
        loadReport={loadReport} loadDraft={loadDraft} version={VER}
      />
    )
  }

  if (step === 4 && report) {
    return (
      <ReportView
        dk={dk} step={step} setStep={setStep} saveDraft={saveDraft}
        setShowHistory={setShowHistory} setShowLanding={setShowLanding}
        report={report} building={building} setReport={setReport}
        setIsDemo={setIsDemo} version={VER}
      />
    )
  }

  // ── Wizard validation ──
  const canAdvance = () => {
    if (step === 0) return Q_PRESURVEY.filter(q => q.req).every(q => presurvey[q.id])
    if (step === 1) return Q_BUILDING.filter(q => q.req).every(q => building[q.id])
    if (step === 2) return zones.every(z => Q_ZONE.filter(q => q.req).every(q => z[q.id]))
    return true
  }

  const sectionHeader = (text) => <div style={sectionHeaderStyle(dk)}>{text}</div>

  // ── Main Wizard ──
  return (
    <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: dk ? FONT_DESKTOP : FONT_MOBILE }}>
      {dk && <DesktopSidebar step={step} setStep={setStep} saveDraft={saveDraft} setShowHistory={setShowHistory} onHome={() => setShowLanding(true)} version={VER} />}

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
      <div style={{ ...(dk ? { marginLeft: 320, padding: '40px 48px', maxWidth: 800 } : { maxWidth: 600, margin: '0 auto', padding: 20 }) }}>
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
