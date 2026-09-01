/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MoldModeScreen — the self-contained in-app experience for `userMode: 'mold'`.
 *
 * Mold is its own mode, but its flow shares nothing with the IAQ zone/scoring
 * machinery, so it renders in ISOLATION (early-returned by MobileApp when
 * userMode === 'mold'): home → intake → result. Intake captures the declarative
 * mold question sets (moldQuestions.js) into the app-shaped state
 * `buildMoldInput` consumes; "Run screening" runs the real, deterministic engine
 * (assessMold) and hands the result to MoldScreeningView.
 *
 * Persistence: assessments save to STO.saveMoldAssessment — a local collection
 * (KEYS.moldAssessments), kept OUT of the IAQ reports/drafts index. Only the
 * captured INPUT is stored; the screening result is a deterministic, disposable
 * projection re-run from it on open, so a saved record can never drift from the
 * engine. Cloud sync + a DOCX report remain documented follow-ons.
 *
 * Screening only. Gated by isMoldModuleEnabled() at the MobileApp seam.
 */
import { useEffect, useState } from 'react'
import * as V3 from '../styles/tokens'
import { I, iconForEmoji } from './Icons'
import GlassCard from './ui/GlassCard'
import TactileButton from './ui/TactileButton'
import GhostButton from './ui/GhostButton'
import Chip from './ui/Chip'
import MoldScreeningView from './MoldScreeningView'
import STO from '../utils/storage'
import { Q_MOLD_PRESURVEY, Q_MOLD_ZONE } from '../constants/moldQuestions'
import { assessMold } from '../engines/mold/index.js'
import { buildMoldInput } from '../engines/mold/buildInput.js'
import { DEMO_MOLD } from '../constants/demoDataMold.js'

const TEXT = 'var(--text)', SUB = 'var(--sub)', DIM = 'var(--dim)', BORDER = 'var(--border)', ACCENT = 'var(--accent)', WARN = 'var(--warn)', DANGER = 'var(--danger)'

const inp = { width: '100%', padding: '9px 11px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

function condOk(cond, answers) {
  if (!cond) return true
  const v = answers[cond.f]
  if ('eq' in cond) return v === cond.eq
  if ('neq' in cond) return String(v ?? '') !== cond.neq
  if ('in' in cond) return Array.isArray(cond.in) && cond.in.includes(v)
  return true
}

// Field label with the app's SVG line icon (resolved from the question's emoji
// via iconForEmoji), matching how the IAQ intake renders — never a raw emoji.
function FieldLabel({ icon, children, req }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: SUB, marginBottom: 6 }}>
      {icon ? <I n={icon} s={13} c={SUB} w={1.8} /> : null}
      <span>{children}</span>{req ? <span style={{ color: WARN }}>*</span> : null}
    </label>
  )
}

function MoldField({ q, answers, onChange }) {
  if (!condOk(q.cond, answers)) return null
  const value = answers[q.id] ?? ''
  return (
    <div style={{ marginBottom: 12 }}>
      <FieldLabel icon={iconForEmoji(q.ic)} req={q.req}>{q.q}</FieldLabel>
      {q.t === 'ch' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(q.opts || []).map((o) => (
            <Chip key={o} selected={value === o} onClick={() => onChange(q.id, value === o ? '' : o)} checkmark>{o}</Chip>
          ))}
        </div>
      ) : q.t === 'ta' ? (
        <textarea rows={2} value={value} placeholder={q.ph || ''} onChange={(e) => onChange(q.id, e.target.value)} style={{ ...inp, resize: 'vertical' }} />
      ) : (
        <input type={q.t === 'num' ? 'number' : q.t === 'date' ? 'date' : 'text'} value={value} placeholder={q.ph || ''} onChange={(e) => onChange(q.id, e.target.value)} style={inp} />
      )}
    </div>
  )
}

/**
 * Stage container padding.
 *
 * Mold mode is EARLY-RETURNED by MobileApp, outside the IAQ shell — which is
 * the point (the shell and its nav never mount here), and also means this
 * screen inherits none of the shell's safe-area handling. The shell pads its
 * fixed header with `env(safe-area-inset-top)` and reserves the space below
 * it; this screen had a flat `paddingTop: 16`.
 *
 * On an iPhone with a notch or Dynamic Island the top inset is ~47-59px, so
 * the header — INCLUDING the exit button — rendered underneath the status
 * bar. iOS routes taps in that strip to the system, not the page, so the only
 * way out of mold mode could not be tapped. `userMode` persists in
 * localStorage, which a Safari cache clear does not touch, so every launch
 * came back to a screen with no reachable exit.
 *
 * The bottom inset matters less (the 120px tail already clears the home
 * indicator) but is added for the same reason: nothing else is going to.
 */
const STAGE = {
  paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
  paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))',
  paddingLeft: 'env(safe-area-inset-left, 0px)',
  paddingRight: 'env(safe-area-inset-right, 0px)',
  maxWidth: 820,
  margin: '0 auto',
}

function Header({ onExit, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      {/* 44px, not 36 — the iOS minimum tap target, and this is the only way
          out of mold mode. */}
      <button onClick={onExit} aria-label="Exit mold mode" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--card)', border: `1px solid ${BORDER}`, color: SUB, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <I n="home" s={18} c={SUB} w={1.8} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...V3.T.h1, marginBottom: 2 }}>Mold Assessment</div>
        <div style={V3.T.bodyDim}>{sub}</div>
      </div>
    </div>
  )
}

const newZone = (n) => ({ id: `mz-${n}`, label: '' })
const deriveTitle = (zones) => {
  const first = (zones || []).map((z) => (z.label || '').trim()).find(Boolean)
  return first ? `Mold — ${first}` : 'Mold assessment'
}
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString() } catch { return '' } }

export default function MoldModeScreen({ onExit, profile }) {
  const [stage, setStage] = useState('home') // home | intake | result
  const [presurvey, setPresurvey] = useState({})
  const [zones, setZones] = useState([newZone(1)])
  const [spores, setSpores] = useState([])
  const [result, setResult] = useState(null)
  const [resultZones, setResultZones] = useState([])
  const [saved, setSaved] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => { STO.getMoldAssessments().then((r) => setSaved(Array.isArray(r) ? r : [])) }, [])
  const refresh = () => STO.getMoldAssessments().then((r) => setSaved(Array.isArray(r) ? r : []))

  const setPre = (id, v) => setPresurvey((p) => ({ ...p, [id]: v }))
  const setZone = (i, id, v) => setZones((zs) => zs.map((z, j) => (j === i ? { ...z, [id]: v } : z)))
  const addZone = () => setZones((zs) => [...zs, newZone(zs.length + 1)])
  const removeZone = (i) => setZones((zs) => (zs.length > 1 ? zs.filter((_, j) => j !== i) : zs))

  const compute = (state) => {
    const input = buildMoldInput(state)
    setResult(assessMold(input))
    setResultZones(input.zones)
    setStage('result')
  }

  const startNew = () => { setPresurvey({}); setZones([newZone(1)]); setSpores([]); setEditingId(null); setSavedMsg(''); setStage('intake') }
  const runIntake = () => {
    const named = zones.map((z, i) => ({ ...z, label: (z.label || '').trim() || `Area ${i + 1}` }))
    setZones(named)
    compute({ presurvey, zones: named, spores })
  }
  const runDemo = () => {
    setPresurvey(DEMO_MOLD.presurvey); setZones(DEMO_MOLD.zones); setSpores(DEMO_MOLD.spores || [])
    setEditingId(null); setSavedMsg('')
    compute({ presurvey: DEMO_MOLD.presurvey, zones: DEMO_MOLD.zones, spores: DEMO_MOLD.spores || [] })
  }

  const save = async () => {
    const id = editingId || `mold-${Date.now()}`
    const findings = result?.findings || []
    const rec = {
      id,
      title: deriveTitle(zones),
      input: { presurvey, zones, spores },
      summary: { findings: findings.length, elevated: findings.some((f) => f.severity === 'elevated_indicator'), areas: result?.conditions?.length || 0 },
    }
    await STO.saveMoldAssessment(rec)
    await refresh()
    setEditingId(id); setSavedMsg('Saved')
  }
  const open = (rec) => {
    const src = rec.input || {}
    setPresurvey(src.presurvey || {})
    setZones(src.zones?.length ? src.zones : [newZone(1)])
    setSpores(src.spores || [])
    setEditingId(rec.id); setSavedMsg('')
    compute({ presurvey: src.presurvey || {}, zones: src.zones || [], spores: src.spores || [] })
  }
  const remove = async (id) => { await STO.deleteMoldAssessment(id); if (editingId === id) setEditingId(null); refresh() }

  const [downloading, setDownloading] = useState(false)
  const downloadReport = async () => {
    if (!result) return
    setDownloading(true)
    try {
      // Dynamic import so the docx packager only loads when a report is
      // actually generated (keeps it off the mold screen's static graph).
      const { generateMoldReport } = await import('./docx/mold-report')
      const site = deriveTitle(zones).replace(/^Mold — /, '')
      await generateMoldReport(result, {
        title: 'Mold Assessment Report',
        site,
        preparedBy: profile?.assessorName || profile?.name || '',
        preparedFor: presurvey?.mps_prepared_for || '',
        date: new Date().toLocaleDateString(),
        zones: resultZones,
      })
    } catch { /* best-effort; download failures are non-fatal */ }
    setDownloading(false)
  }

  // Home ---------------------------------------------------------------------
  if (stage === 'home') {
    return (
      <div style={STAGE}>
        <Header onExit={onExit} sub="Moisture & mold assessment — IICRC S520." />
        <GlassCard style={{ marginTop: 16 }}>
          <div style={{ ...V3.T.micro }}>Method — IICRC S520</div>
          <div style={{ ...V3.T.bodyDim, marginTop: 6, lineHeight: 1.5 }}>
            This assessment classifies water-damage Category and remediation Condition and screens spores
            comparatively to identify conditions warranting further evaluation. Classification and interpretation
            are confirmed by a qualified professional.
          </div>
        </GlassCard>
        <TactileButton variant="primary" size="lg" fullWidth onClick={startNew} icon={<I n="findings" s={16} c="#FFFFFF" />} style={{ marginTop: 16 }}>
          New mold assessment
        </TactileButton>
        <div style={{ marginTop: 12 }}>
          <GhostButton onClick={runDemo} style={{ width: '100%', justifyContent: 'center' }}>Open the demo assessment</GhostButton>
        </div>

        {saved.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ ...V3.T.micro, marginBottom: 8 }}>Saved assessments · {saved.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {saved.map((rec) => (
                <GlassCard key={rec.id} style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                    <button onClick={() => open(rec)} aria-label={`Open ${rec.title}`} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.title}</div>
                      <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
                        {fmtDate(rec.updated_at || rec.created_at)} · {rec.summary?.areas ?? 0} area(s) · {rec.summary?.findings ?? 0} finding(s)
                        {rec.summary?.elevated ? <span style={{ color: DANGER, fontWeight: 700 }}> · elevated indicator</span> : null}
                      </div>
                    </button>
                    <GhostButton onClick={() => remove(rec.id)} aria-label={`Delete ${rec.title}`} style={{ padding: '4px 10px', minHeight: 30, color: DANGER, borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' }}>Delete</GhostButton>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Result -------------------------------------------------------------------
  if (stage === 'result') {
    return (
      <div style={STAGE}>
        <Header onExit={onExit} sub="Assessment result" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 16px' }}>
          <TactileButton variant="secondary" size="sm" onClick={save} icon={<I n="check" s={14} c={ACCENT} />}>Save assessment</TactileButton>
          <TactileButton variant="secondary" size="sm" onClick={downloadReport} disabled={downloading} icon={<I n="download" s={14} c={ACCENT} />}>{downloading ? 'Generating…' : 'Download report (.docx)'}</TactileButton>
          <GhostButton onClick={() => setStage('intake')}>Edit inputs</GhostButton>
          <GhostButton onClick={() => { setResult(null); setStage('home') }}>Home</GhostButton>
          {savedMsg && <span role="status" style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{savedMsg}</span>}
        </div>
        <MoldScreeningView result={result} zones={resultZones} />
      </div>
    )
  }

  // Intake -------------------------------------------------------------------
  return (
    <div style={STAGE}>
      <Header onExit={onExit} sub="Capture the moisture / mold observations to screen." />

      <GlassCard style={{ marginTop: 16 }}>
        <div style={{ ...V3.T.micro, marginBottom: 10 }}>Assessment context</div>
        {Q_MOLD_PRESURVEY.map((q) => <MoldField key={q.id} q={q} answers={presurvey} onChange={setPre} />)}
      </GlassCard>

      {zones.map((z, i) => (
        <GlassCard key={z.id} style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div style={{ ...V3.T.micro }}>Area {i + 1}</div>
            {zones.length > 1 && <GhostButton onClick={() => removeZone(i)} style={{ padding: '4px 10px', minHeight: 30 }}>Remove</GhostButton>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <FieldLabel icon="flag">Area name</FieldLabel>
            <input value={z.label} placeholder="e.g. Break Room" onChange={(e) => setZone(i, 'label', e.target.value)} style={inp} />
          </div>
          {Q_MOLD_ZONE.map((q) => (
            <MoldField key={q.id} q={q} answers={z} onChange={(id, v) => setZone(i, id, v)} />
          ))}
        </GlassCard>
      ))}

      <div style={{ marginTop: 14 }}>
        <GhostButton onClick={addZone} style={{ width: '100%', justifyContent: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><I n="findings" s={13} c={ACCENT} w={1.8} /> Add area</span>
        </GhostButton>
      </div>

      <TactileButton variant="primary" size="lg" fullWidth onClick={runIntake} icon={<I n="search" s={16} c="#FFFFFF" />} style={{ marginTop: 16 }}>
        Run assessment
      </TactileButton>
      <div style={{ ...V3.T.captionDim, marginTop: 10, lineHeight: 1.5, textAlign: 'center', color: DIM }}>
        Spore-trap lab results are added separately; the assessment runs on the observations above.
      </div>
    </div>
  )
}
