/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MoldModeScreen — the self-contained in-app experience for `userMode: 'mold'`.
 *
 * Mold is its own mode, but its flow shares nothing with the IAQ zone/scoring
 * machinery, so it renders as an ISOLATED screen (early-returned by MobileApp
 * when userMode === 'mold'): home → intake → result. Intake captures the
 * declarative mold question sets (moldQuestions.js) into the app-shaped state
 * `buildMoldInput` consumes; "Run screening" runs the real, deterministic
 * engine (assessMold) and hands the result to MoldScreeningView — the same
 * surface the /dev preview uses.
 *
 * Screening only. No persistence / DOCX yet (documented follow-ons); this is
 * the interactive mode. Gated by isMoldModuleEnabled() at the MobileApp seam.
 */
import { useState } from 'react'
import * as V3 from '../styles/tokens'
import { I } from './Icons'
import GlassCard from './ui/GlassCard'
import TactileButton from './ui/TactileButton'
import GhostButton from './ui/GhostButton'
import Chip from './ui/Chip'
import MoldScreeningView from './MoldScreeningView'
import { Q_MOLD_PRESURVEY, Q_MOLD_ZONE } from '../constants/moldQuestions'
import { assessMold } from '../engines/mold/index.js'
import { buildMoldInput } from '../engines/mold/buildInput.js'
import { DEMO_MOLD } from '../constants/demoDataMold.js'

const TEXT = 'var(--text)', SUB = 'var(--sub)', DIM = 'var(--dim)', BORDER = 'var(--border)', ACCENT = 'var(--accent)', WARN = 'var(--warn)'

const inp = { width: '100%', padding: '9px 11px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

// Conditional-visibility eval for a question's `cond` clause (mirrors the
// grammar used by questions.js: { f, eq | neq | in }).
function condOk(cond, answers) {
  if (!cond) return true
  const v = answers[cond.f]
  if ('eq' in cond) return v === cond.eq
  if ('neq' in cond) return String(v ?? '') !== cond.neq
  if ('in' in cond) return Array.isArray(cond.in) && cond.in.includes(v)
  return true
}

// One declarative field. Single-select `ch` renders as a Chip group; text /
// num / date / ta render as inputs. Deliberately compact — the mold intake is
// short by design (screening, not a full IAQ survey).
function MoldField({ q, answers, onChange }) {
  if (!condOk(q.cond, answers)) return null
  const value = answers[q.id] ?? ''
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: SUB, marginBottom: 6 }}>
        {q.ic ? `${q.ic} ` : ''}{q.q}{q.req ? <span style={{ color: WARN }}> *</span> : null}
      </label>
      {q.t === 'ch' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(q.opts || []).map((o) => (
            <Chip key={o} selected={value === o} onClick={() => onChange(q.id, value === o ? '' : o)} checkmark>{o}</Chip>
          ))}
        </div>
      ) : q.t === 'ta' ? (
        <textarea rows={2} value={value} placeholder={q.ph || ''} onChange={(e) => onChange(q.id, e.target.value)} style={{ ...inp, resize: 'vertical' }} />
      ) : (
        <input
          type={q.t === 'num' ? 'number' : q.t === 'date' ? 'date' : 'text'}
          value={value}
          placeholder={q.ph || ''}
          onChange={(e) => onChange(q.id, e.target.value)}
          style={inp}
        />
      )}
    </div>
  )
}

function Header({ onExit, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <button onClick={onExit} aria-label="Exit mold mode" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card)', border: `1px solid ${BORDER}`, color: SUB, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <I n="home" s={17} c={SUB} w={1.8} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...V3.T.h1, marginBottom: 2 }}>Mold Assessment</div>
        <div style={V3.T.bodyDim}>{sub}</div>
      </div>
    </div>
  )
}

const newZone = (n) => ({ id: `mz-${n}`, label: '' })

export default function MoldModeScreen({ onExit }) {
  const [stage, setStage] = useState('home') // home | intake | result
  const [presurvey, setPresurvey] = useState({})
  const [zones, setZones] = useState([newZone(1)])
  const [result, setResult] = useState(null)
  const [resultZones, setResultZones] = useState([])

  const setPre = (id, v) => setPresurvey((p) => ({ ...p, [id]: v }))
  const setZone = (i, id, v) => setZones((zs) => zs.map((z, j) => (j === i ? { ...z, [id]: v } : z)))
  const addZone = () => setZones((zs) => [...zs, newZone(zs.length + 1)])
  const removeZone = (i) => setZones((zs) => (zs.length > 1 ? zs.filter((_, j) => j !== i) : zs))

  const run = (state) => {
    const input = buildMoldInput(state)
    setResult(assessMold(input))
    setResultZones(input.zones)
    setStage('result')
  }

  const runIntake = () => {
    const named = zones.map((z, i) => ({ ...z, label: (z.label || '').trim() || `Area ${i + 1}` }))
    run({ presurvey, zones: named })
  }
  const runDemo = () => run(DEMO_MOLD)

  // Home ---------------------------------------------------------------------
  if (stage === 'home') {
    return (
      <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 820, margin: '0 auto' }}>
        <Header onExit={onExit} sub="Moisture & mold screening — IICRC S520. Screening only." />
        <GlassCard style={{ marginTop: 16 }}>
          <div style={{ ...V3.T.micro }}>Screening only</div>
          <div style={{ ...V3.T.bodyDim, marginTop: 6, lineHeight: 1.5 }}>
            Mold screening identifies conditions warranting further evaluation (water-damage Category, remediation
            Condition, comparative spore screening). It is not a determination of occupant health risk, contamination
            extent, or clearance — those are confirmed by a qualified professional.
          </div>
        </GlassCard>
        <TactileButton variant="primary" size="lg" fullWidth onClick={() => { setStage('intake') }} icon={<I n="findings" s={16} c="#FFFFFF" />} style={{ marginTop: 16 }}>
          New mold screening
        </TactileButton>
        <div style={{ marginTop: 12 }}>
          <GhostButton onClick={runDemo} style={{ width: '100%', justifyContent: 'center' }}>Open the demo assessment</GhostButton>
        </div>
      </div>
    )
  }

  // Result -------------------------------------------------------------------
  if (stage === 'result') {
    return (
      <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 820, margin: '0 auto' }}>
        <Header onExit={onExit} sub="Screening result" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 16px' }}>
          <GhostButton onClick={() => setStage('intake')}>Edit inputs</GhostButton>
          <GhostButton onClick={() => { setResult(null); setStage('home') }}>New assessment</GhostButton>
        </div>
        <MoldScreeningView result={result} zones={resultZones} />
      </div>
    )
  }

  // Intake -------------------------------------------------------------------
  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 820, margin: '0 auto' }}>
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: SUB, marginBottom: 6 }}>🏷️ Area name</label>
            <input value={z.label} placeholder={`e.g. Break Room`} onChange={(e) => setZone(i, 'label', e.target.value)} style={inp} />
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
        Run screening
      </TactileButton>
      <div style={{ ...V3.T.captionDim, marginTop: 10, lineHeight: 1.5, textAlign: 'center', color: DIM }}>
        Spore-trap lab results are added separately; screening runs on the observations above.
      </div>
    </div>
  )
}
