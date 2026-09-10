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
 * Restraint pass (2026-09): the inputs used to sit boxed inside three
 * cards, the method switch was a pair of tinted chips, the comparison
 * verdict a tinted pill, and every statistic a bordered tile. Now the
 * three parts are sections on the page — a micro heading over a hairline
 * — the method switch is the app's text-tab row, the verdict is a word in
 * its colour, and a statistic is a label over a figure.
 *
 * Inputs persist in localStorage so a walk between rooms does not lose
 * them; nothing here writes to an assessment.
 */
import { useEffect, useMemo, useState } from 'react'
import * as V3 from '../styles/tokens'
import Select from './ui/Select'
import AssessmentSegmentedPillNav from './ui/AssessmentSegmentedPillNav'
import {
  SPACE_TYPES, EZ_PRESETS, ACTIVITY_LEVELS,
  requiredOutdoorAir, steadyStateDelivery, decayTwoPoint, achToCfm, compareDelivery,
  REQUIRED_CITATION, STEADY_STATE_CITATION, DECAY_CITATION,
} from '../engines/ventilation'

const TEXT = 'var(--text)', DIM = 'var(--dim)'
const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`
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
const inStyle = { width: '100%', padding: '10px 12px', background: 'var(--surface)', border: HAIRLINE, borderRadius: 10, color: TEXT, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 44 }
const selStyle = { ...inStyle, appearance: 'auto' }

function Field({ label, unit, wide, children }) {
  // `wide` spans the row: a select whose longest option does not fit half
  // a phone ("0.8 · Ceiling, warm air, ceiling return") was being cut to
  // "1.0 · Ceiling, co" in the two-column grid.
  return (
    <label style={{ display: 'block', minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
      <div style={{ ...V3.T.caption, marginBottom: 6 }}>{label}{unit ? <span style={{ color: DIM, fontWeight: 400 }}> · {unit}</span> : null}</div>
      {children}
    </label>
  )
}

// A statistic: label over the figure, the unit beside it, a caption
// beneath. No box.
function Stat({ label, value, unit, sub }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...V3.T.captionDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <span style={V3.N.lg}>{value == null ? '—' : value}</span>
        {unit && <span style={{ ...V3.T.captionDim, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
      {sub && <div style={{ ...V3.T.captionDim, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const Section = ({ n, title, first, children }) => (
  <div style={{ paddingTop: first ? 4 : 22, borderTop: first ? 'none' : HAIRLINE }}>
    <div style={{ ...V3.T.micro, marginBottom: 12 }}>{n} · {title}</div>
    {children}
  </div>
)

const Note = ({ children, tone }) => (
  <div style={{ ...V3.T.captionDim, marginTop: 10, lineHeight: 1.5, color: tone || undefined }}>{children}</div>
)

// Theme tokens, not hexes: the amber flips with the theme (index.html --warn).
const LEVEL_TONE = { meets: V3.STATUS.ready, near: 'var(--warn)', below: V3.DANGER }
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
  const stats = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, marginTop: 16 }

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ ...V3.T.h1, marginBottom: 12 }}>Ventilation</div>

      {/* ── 1 · Required ── */}
      <Section n="1" title="Required — ASHRAE 62.1" first>
        <div style={grid2}>
          <Field label="Space use" wide>
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
          <Field label="Air distribution" unit="Ez" wide>
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
              <Stat label="Per person · breathing zone" value={required.perPerson} unit="cfm/person" sub={required.pz > 0 ? `Vbz ÷ ${required.pz} occupants` : 'needs occupants'} />
            </div>
            {required.partial && <Note tone="var(--warn)">Only one of the two terms is entered — this is a floor on the requirement, not the requirement.</Note>}
            <Note>{REQUIRED_CITATION}</Note>
          </>
        ) : (
          <Note>Enter occupants or floor area to compute the requirement.</Note>
        )}
      </Section>

      {/* ── 2 · Delivered ── */}
      <Section n="2" title="Delivered — estimated from CO₂">
        <AssessmentSegmentedPillNav
          tabs={[{ id: 'steady', label: 'Steady state' }, { id: 'decay', label: 'Decay (unoccupied)' }]}
          active={s.method}
          onChange={(m) => set('method')(m)}
          ariaLabel="Estimation method"
          style={{ margin: '0 0 14px' }}
        />

        {s.method === 'steady' ? (
          <>
            <div style={grid2}>
              <Field label="Indoor CO₂" unit="ppm">
                <input type="number" inputMode="numeric" min="0" value={s.indoorPpm} onChange={set('indoorPpm')} placeholder="e.g. 1,150" style={inStyle} aria-label="Indoor CO2" />
              </Field>
              <Field label="Outdoor CO₂" unit="ppm">
                <input type="number" inputMode="numeric" min="0" value={s.outdoorPpm} onChange={set('outdoorPpm')} placeholder="e.g. 420" style={inStyle} aria-label="Outdoor CO2" />
              </Field>
              <Field label="Occupant activity" wide>
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
      </Section>

      {/* ── 3 · Comparison ── */}
      <Section n="3" title="Comparison">
        {comparison ? (
          <>
            {/* The verdict is a word in its colour; the method beside it. */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: LEVEL_TONE[comparison.level] }}>{LEVEL_LABEL[comparison.level]}</span>
              <span style={V3.T.captionDim}>{s.method === 'steady' ? 'steady-state estimate' : 'decay estimate'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <div>
                <div style={V3.T.captionDim}>Delivered · est.</div>
                {/* The figure that matters carries the verdict's colour; the
                    requirement beside it stays in the primary ink. */}
                <div style={{ ...V3.N.lg, color: LEVEL_TONE[comparison.level] }}>{deliveredPerPerson}</div>
                <div style={V3.T.captionDim}>cfm/person</div>
              </div>
              <div style={{ fontSize: 22, color: DIM }}>/</div>
              <div>
                {/* "Vbz" rather than "breathing zone": the long label wrapped
                    on a phone and dropped this figure below the other one.
                    Section 1 defines Vbz two lines above the number. */}
                <div style={V3.T.captionDim}>Required · 62.1 Vbz</div>
                <div style={V3.N.lg}>{required.perPerson}</div>
                <div style={V3.T.captionDim}>cfm/person</div>
              </div>
            </div>
            <div style={{ ...V3.T.body, marginTop: 12, lineHeight: 1.5 }}>{comparison.statement}</div>
          </>
        ) : (
          <Note>Both a requirement (section 1, with occupants) and a delivered estimate (section 2) are needed for the comparison.</Note>
        )}
        <div style={{ ...V3.T.captionDim, lineHeight: 1.5, marginTop: 14 }}>
          CO₂-based figures are estimates of outdoor-air delivery, not measurements. For compliance documentation a direct airflow measurement — duct traverse, balometer at the diffuser, or tracer gas per ASTM E741 — outranks any figure here.
        </div>
      </Section>

      <details className="rs-cat" style={{ marginTop: 22, borderTop: HAIRLINE }}>
        <summary style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', cursor: 'pointer', listStyle: 'none', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ ...V3.T.bodyStrong, flex: 1 }}>About the methods</span>
          <span style={V3.T.captionDim}>Sources and limits</span>
          <span className="rs-chev" aria-hidden="true" style={{ color: V3.TEXT_TERTIARY, fontSize: 18, lineHeight: 1, display: 'inline-block' }}>›</span>
        </summary>
        <div style={{ ...V3.T.captionDim, lineHeight: 1.6, paddingBottom: 14 }}>
          <p style={{ margin: '0 0 8px' }}><strong style={{ color: TEXT }}>Required.</strong> {REQUIRED_CITATION} Rates are the same table the assessment engine applies when it reports outdoor air against the 62.1 minimum. The comparison uses the breathing-zone rate per person (Vbz ÷ occupants): a CO₂ reading taken among the occupants reflects the outdoor air that reached them, which is what Vbz describes. Voz is what the system must supply at the diffuser to get there after distribution losses (Ez), and is shown for the designer.</p>
          <p style={{ margin: '0 0 8px' }}><strong style={{ color: TEXT }}>Steady state.</strong> {STEADY_STATE_CITATION} Its largest uncertainty is the occupant generation rate, which depends on activity and body size (Persily &amp; de Jonge 2017); the ±10% band carries that.</p>
          <p style={{ margin: 0 }}><strong style={{ color: TEXT }}>Decay.</strong> {DECAY_CITATION} Because it needs no generation rate it is the stronger estimate when an unoccupied period is available (Batterman 2017), and it yields air changes per hour directly; cfm needs the room volume.</p>
        </div>
      </details>

      {/* Left, not right: the AI launcher floats in the bottom-right corner
          and sat over a right-aligned control at the end of the page. */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: 14, borderTop: HAIRLINE }}>
        <button type="button" onClick={reset} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: V3.TEXT_SECONDARY, cursor: 'pointer' }}>Clear inputs</button>
      </div>
    </div>
  )
}
