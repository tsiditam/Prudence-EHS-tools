/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * VentilationTool — a standalone calculator for the assessor: the ASHRAE
 * 62.1 outdoor-air requirement for a space, an estimate of what is being
 * delivered (from CO₂, by the steady-state or the decay method), and the
 * two side by side. Every number is labelled with its method, its
 * assumptions and its source; the comparison states a ratio and leaves the
 * determination to the professional. The maths lives in
 * src/engines/ventilation — this file is presentation only.
 *
 * Inputs persist in localStorage so a walk between rooms does not lose
 * them; nothing here writes to an assessment.
 */
import { useEffect, useMemo, useState } from 'react'
import * as V3 from '../styles/tokens'
import GlassCard from './ui/GlassCard'
import Select from './ui/Select'
import Chip from './ui/Chip'
import StatusPill from './ui/StatusPill'
import CollapsibleCard from './ui/CollapsibleCard'
import { I } from './Icons'
import {
  SPACE_TYPES, EZ_PRESETS, ACTIVITY_LEVELS,
  requiredOutdoorAir, steadyStateDelivery, decayTwoPoint, achToCfm, compareDelivery,
  REQUIRED_CITATION, STEADY_STATE_CITATION, DECAY_CITATION,
} from '../engines/ventilation'

const TEXT = 'var(--text)', SUB = 'var(--sub)', DIM = 'var(--dim)', BORDER = 'var(--border)'
const KEY = 'atmosflow-ventilation-tool'

const DEFAULTS = {
  spaceType: 'office', occupants: '', areaSqft: '', ezKey: 'ceiling_cool', ezCustom: '',
  method: 'steady', indoorPpm: '', outdoorPpm: '420', activity: 'sedentary',
  startPpm: '', endPpm: '', decayOutdoorPpm: '420', minutes: '', volumeCuft: '',
}

function usePersisted() {
  const [s, setS] = useState(() => {
    try { const raw = localStorage.getItem(KEY); return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS } catch { return DEFAULTS }
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }, [s])
  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e && e.target ? e.target.value : e }))
  return [s, set, () => setS(DEFAULTS)]
}

// 16px so iOS Safari does not zoom the page on focus (index.html floors
// inputs there too; stated here so the intent survives a token change).
const inStyle = { width: '100%', padding: '10px 12px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 44 }
const selStyle = { ...inStyle, appearance: 'auto' }

function Field({ label, unit, children }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <div style={{ ...V3.T.caption, marginBottom: 6 }}>{label}{unit ? <span style={{ color: DIM, fontWeight: 400 }}> · {unit}</span> : null}</div>
      {children}
    </label>
  )
}

// Stat tile: label above, value + unit below — the same contract Logger
// Studio's Overview and chart strips use.
function Stat({ label, value, unit, sub }) {
  return (
    <div style={{ minWidth: 0, padding: '10px 12px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
      <div style={{ ...V3.T.micro, fontSize: 10, letterSpacing: '0.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: TEXT, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>{value == null ? '—' : value}</span>
        {unit && <span style={{ fontSize: 11, color: DIM, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
      {sub && <div style={{ ...V3.T.captionDim, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const Section = ({ n, title, children }) => (
  <div style={{ marginTop: 22 }}>
    <div style={{ ...V3.T.micro, color: SUB, marginBottom: 8 }}>{n} · {title}</div>
    {children}
  </div>
)

const Note = ({ children, tone }) => (
  <div style={{ ...V3.T.captionDim, marginTop: 10, lineHeight: 1.5, color: tone || undefined }}>{children}</div>
)

const LEVEL_TONE = { meets: V3.STATUS.ready, near: '#FBBF24', below: V3.DANGER }
const LEVEL_LABEL = { meets: 'At or above minimum', near: 'Near minimum', below: 'Below minimum' }

export default function VentilationTool() {
  const [s, set, reset] = usePersisted()

  const ez = s.ezKey === 'custom' ? s.ezCustom : (EZ_PRESETS.find((p) => p.key === s.ezKey)?.ez ?? 1.0)
  const required = useMemo(() => requiredOutdoorAir({ spaceType: s.spaceType, occupants: s.occupants, areaSqft: s.areaSqft, ez }), [s.spaceType, s.occupants, s.areaSqft, ez])

  const met = ACTIVITY_LEVELS.find((a) => a.key === s.activity)?.met ?? 1.2
  const steady = useMemo(() => steadyStateDelivery({ indoorPpm: s.indoorPpm, outdoorPpm: s.outdoorPpm, met }), [s.indoorPpm, s.outdoorPpm, met])
  const decay = useMemo(() => decayTwoPoint({ startPpm: s.startPpm, endPpm: s.endPpm, outdoorPpm: s.decayOutdoorPpm, minutes: s.minutes }), [s.startPpm, s.endPpm, s.decayOutdoorPpm, s.minutes])
  const decayCfm = useMemo(() => (decay && decay.ach != null ? achToCfm(decay.ach, s.volumeCuft, s.occupants) : null), [decay, s.volumeCuft, s.occupants])

  const deliveredPerPerson = s.method === 'steady'
    ? (steady && steady.cfmPerPerson != null ? steady.cfmPerPerson : null)
    : (decayCfm && decayCfm.cfmPerPerson != null ? decayCfm.cfmPerPerson : null)
  const comparison = useMemo(() => compareDelivery({ requiredPerPerson: required?.perPerson, deliveredPerPerson }), [required, deliveredPerPerson])

  const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }
  const stats = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 14 }

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ ...V3.T.h1, marginBottom: 2 }}>Ventilation</div>
      <div style={V3.T.h1Sub}>Required outdoor air against what the CO₂ says is being delivered. Estimates, with the method stated.</div>

      {/* ── 1 · Required ── */}
      <Section n="1" title="Required — ASHRAE 62.1">
        <GlassCard style={{ padding: '16px' }}>
          <div style={grid2}>
            <Field label="Space use">
              <Select style={selStyle} value={s.spaceType} onChange={set('spaceType')} aria-label="Space use">
                {SPACE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Occupants" unit="people">
              <input type="number" inputMode="numeric" min="0" value={s.occupants} onChange={set('occupants')} placeholder="e.g. 12" style={inStyle} aria-label="Occupants" />
            </Field>
            <Field label="Floor area" unit="ft²">
              <input type="number" inputMode="decimal" min="0" value={s.areaSqft} onChange={set('areaSqft')} placeholder="e.g. 1,200" style={inStyle} aria-label="Floor area" />
            </Field>
            <Field label="Air distribution" unit="Ez">
              <Select style={selStyle} value={s.ezKey} onChange={set('ezKey')} aria-label="Air distribution">
                {EZ_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.ez.toFixed(1)} · {p.label}</option>)}
                <option value="custom">Custom Ez…</option>
              </Select>
            </Field>
            {s.ezKey === 'custom' && (
              <Field label="Custom Ez">
                <input type="number" inputMode="decimal" step="0.1" min="0.1" max="2" value={s.ezCustom} onChange={set('ezCustom')} placeholder="1.0" style={inStyle} aria-label="Custom Ez" />
              </Field>
            )}
          </div>
          {required ? (
            <>
              <div style={stats}>
                <Stat label="Breathing zone" value={required.vbz} unit="cfm" sub={`Vbz · ${required.rp}/person + ${required.ra}/ft²`} />
                <Stat label="Zone outdoor air" value={required.voz} unit="cfm" sub={`Voz · Ez ${required.ez}`} />
                <Stat label="Per person" value={required.perPerson} unit="cfm/person" sub={required.pz > 0 ? `${required.pz} occupants` : 'needs occupants'} />
              </div>
              {required.partial && <Note tone="#FBBF24">Only one of the two terms is entered — this is a floor on the requirement, not the requirement.</Note>}
              <Note>{REQUIRED_CITATION}</Note>
            </>
          ) : (
            <Note>Enter occupants or floor area to compute the requirement.</Note>
          )}
        </GlassCard>
      </Section>

      {/* ── 2 · Delivered ── */}
      <Section n="2" title="Delivered — estimated from CO₂">
        <GlassCard style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <Chip selected={s.method === 'steady'} onClick={() => set('method')('steady')} style={{ padding: '7px 13px', minHeight: 32, fontSize: 12 }}>Steady state</Chip>
            <Chip selected={s.method === 'decay'} onClick={() => set('method')('decay')} style={{ padding: '7px 13px', minHeight: 32, fontSize: 12 }}>Decay (unoccupied)</Chip>
          </div>

          {s.method === 'steady' ? (
            <>
              <div style={grid2}>
                <Field label="Indoor CO₂" unit="ppm">
                  <input type="number" inputMode="numeric" min="0" value={s.indoorPpm} onChange={set('indoorPpm')} placeholder="e.g. 1,150" style={inStyle} aria-label="Indoor CO2" />
                </Field>
                <Field label="Outdoor CO₂" unit="ppm">
                  <input type="number" inputMode="numeric" min="0" value={s.outdoorPpm} onChange={set('outdoorPpm')} placeholder="e.g. 420" style={inStyle} aria-label="Outdoor CO2" />
                </Field>
                <Field label="Occupant activity">
                  <Select style={selStyle} value={s.activity} onChange={set('activity')} aria-label="Occupant activity">
                    {ACTIVITY_LEVELS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </Select>
                </Field>
              </div>
              {steady && steady.error && <Note tone={V3.DANGER}>{steady.error}</Note>}
              {steady && steady.cfmPerPerson != null && (
                <>
                  <div style={stats}>
                    <Stat label="Delivered" value={steady.cfmPerPerson} unit="cfm/person" sub={`${steady.low}–${steady.high} at ±10%`} />
                    <Stat label="Differential" value={steady.delta} unit="ppm" sub="indoor − outdoor" />
                    <Stat label="Generation rate" value={steady.g} unit="cfm/person" sub={`${steady.met} met`} />
                  </div>
                  <ul style={{ margin: '10px 0 0', paddingLeft: 16 }}>
                    {steady.assumptions.map((a, i) => <li key={i} style={{ ...V3.T.captionDim, lineHeight: 1.6 }}>{a}</li>)}
                  </ul>
                </>
              )}
              {!steady && <Note>Enter an indoor and outdoor reading taken after the space has been steadily occupied for a few hours.</Note>}
              <Note>{STEADY_STATE_CITATION}</Note>
            </>
          ) : (
            <>
              <div style={grid2}>
                <Field label="CO₂ when occupants left" unit="ppm">
                  <input type="number" inputMode="numeric" min="0" value={s.startPpm} onChange={set('startPpm')} placeholder="e.g. 1,300" style={inStyle} aria-label="Start CO2" />
                </Field>
                <Field label="CO₂ after the period" unit="ppm">
                  <input type="number" inputMode="numeric" min="0" value={s.endPpm} onChange={set('endPpm')} placeholder="e.g. 700" style={inStyle} aria-label="End CO2" />
                </Field>
                <Field label="Elapsed" unit="minutes">
                  <input type="number" inputMode="numeric" min="1" value={s.minutes} onChange={set('minutes')} placeholder="e.g. 90" style={inStyle} aria-label="Elapsed minutes" />
                </Field>
                <Field label="Outdoor CO₂" unit="ppm">
                  <input type="number" inputMode="numeric" min="0" value={s.decayOutdoorPpm} onChange={set('decayOutdoorPpm')} placeholder="e.g. 420" style={inStyle} aria-label="Decay outdoor CO2" />
                </Field>
                <Field label="Room volume" unit="ft³ · optional">
                  <input type="number" inputMode="decimal" min="0" value={s.volumeCuft} onChange={set('volumeCuft')} placeholder="area × ceiling height" style={inStyle} aria-label="Room volume" />
                </Field>
              </div>
              {decay && decay.error && <Note tone={V3.DANGER}>{decay.error}</Note>}
              {decay && decay.ach != null && (
                <>
                  <div style={stats}>
                    <Stat label="Air changes" value={decay.ach} unit="ACH" sub={`over ${decay.hours} h`} />
                    <Stat label="Outdoor air" value={decayCfm ? decayCfm.cfm : null} unit="cfm" sub={decayCfm ? 'from room volume' : 'needs room volume'} />
                    <Stat label="Per person" value={decayCfm ? decayCfm.cfmPerPerson : null} unit="cfm/person" sub={decayCfm && decayCfm.cfmPerPerson == null ? 'needs occupants (section 1)' : 'at the occupancy in section 1'} />
                  </div>
                  <ul style={{ margin: '10px 0 0', paddingLeft: 16 }}>
                    {decay.assumptions.map((a, i) => <li key={i} style={{ ...V3.T.captionDim, lineHeight: 1.6 }}>{a}</li>)}
                  </ul>
                </>
              )}
              {!decay && <Note>Take one reading as the last occupants leave and one after the room has been empty for an hour or more.</Note>}
              <Note>{DECAY_CITATION}</Note>
            </>
          )}
        </GlassCard>
      </Section>

      {/* ── 3 · Comparison ── */}
      <Section n="3" title="Comparison">
        <GlassCard style={{ padding: '16px' }}>
          {comparison ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusPill tone={LEVEL_TONE[comparison.level]}>{LEVEL_LABEL[comparison.level]}</StatusPill>
                <span style={{ ...V3.T.captionDim }}>{s.method === 'steady' ? 'steady-state estimate' : 'decay estimate'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, marginTop: 14 }}>
                <div>
                  <div style={{ ...V3.T.micro, fontSize: 10 }}>Delivered · est.</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: TEXT, letterSpacing: '-0.5px', lineHeight: '32px' }}>{deliveredPerPerson}</div>
                  <div style={{ ...V3.T.captionDim, fontSize: 11 }}>cfm/person</div>
                </div>
                <div style={{ fontSize: 22, color: DIM }}>/</div>
                <div>
                  <div style={{ ...V3.T.micro, fontSize: 10 }}>Required · 62.1</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: TEXT, letterSpacing: '-0.5px', lineHeight: '32px' }}>{required.perPerson}</div>
                  <div style={{ ...V3.T.captionDim, fontSize: 11 }}>cfm/person</div>
                </div>
              </div>
              <div style={{ ...V3.T.body, marginTop: 12, lineHeight: 1.5 }}>{comparison.statement}</div>
            </>
          ) : (
            <Note>Both a requirement (section 1, with occupants) and a delivered estimate (section 2) are needed for the comparison.</Note>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
            <I n="guidance" s={14} c={SUB} w={1.8} />
            <div style={{ ...V3.T.captionDim, lineHeight: 1.5 }}>
              CO₂-based figures are estimates of outdoor-air delivery, not measurements. For compliance documentation a direct airflow measurement — duct traverse, balometer at the diffuser, or tracer gas per ASTM E741 — outranks any figure here.
            </div>
          </div>
        </GlassCard>
      </Section>

      <CollapsibleCard title="About the methods" summary="Sources and limits">
        <div style={{ ...V3.T.captionDim, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}><strong style={{ color: TEXT }}>Required.</strong> {REQUIRED_CITATION} Rates are the same table the assessment engine applies when it reports outdoor air against the 62.1 minimum.</p>
          <p style={{ margin: '0 0 8px' }}><strong style={{ color: TEXT }}>Steady state.</strong> {STEADY_STATE_CITATION} Its largest uncertainty is the occupant generation rate, which depends on activity and body size (Persily &amp; de Jonge 2017); the ±10% band carries that.</p>
          <p style={{ margin: 0 }}><strong style={{ color: TEXT }}>Decay.</strong> {DECAY_CITATION} Because it needs no generation rate it is the stronger estimate when an unoccupied period is available (Batterman 2017), and it yields air changes per hour directly; cfm needs the room volume.</p>
        </div>
      </CollapsibleCard>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" onClick={reset} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 999, color: SUB, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 32 }}>Clear inputs</button>
      </div>
    </div>
  )
}
