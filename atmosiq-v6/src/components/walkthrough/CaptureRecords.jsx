/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * CaptureRecords — the walkthrough's structured record editors, one per
 * question type the wizard could not express as a dropdown:
 *
 *   TimelineEditor    `ps_timeline`        [{ id, date, kind, description }]
 *   SourceDetailCards `src_detail`         { [source]: { what, installedOn, extent } }
 *   ChecksPerformed   `zone_checks`        { [check]: { result, method } }
 *   LoggerDeployment  `logger_deployment`  { placed, instrument, serial, position,
 *                                            height_m, start, end, interval_min,
 *                                            events: [{ id, at, kind, description }] }
 *
 * Each records facts — what happened, what was seen, what was tested — and
 * hands them to the report's renderers (report/reportModel.js). No engine
 * reads them, and none of them carries a verdict. The controls are the
 * wizard's own: the card fill, the hairline edge, 44px targets, the accent
 * only on focus and the one add action. See docs/WALKTHROUGH_CAPTURE.md.
 */
import { useMemo } from 'react'
import * as V3 from '../../styles/tokens'
import { I } from '../Icons'
import { TIMELINE_KINDS, ZONE_CHECKS, CHECK_METHODS, LOGGER_EVENT_KINDS, LOGGER_POSITIONS, tickedSources } from '../../constants/captureVocab'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'

const uid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// ── Primitives ─────────────────────────────────────────────────────────
// The wizard's field chrome at the card's smaller scale: 15px text, 14px
// padding, the accent edge only while focused.
const FIELD = { width: '100%', padding: '13px 14px', background: 'var(--surface)', border: `1.5px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', minHeight: 46 }
const focus = { onFocus: (e) => { e.target.style.borderColor = ACCENT }, onBlur: (e) => { e.target.style.borderColor = BORDER } }

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <div style={{ ...V3.T.micro, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

function TextField({ label, value, onChange, placeholder, type = 'text', inputMode }) {
  return (
    <Field label={label}>
      <input type={type} inputMode={inputMode} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ ...FIELD, ...(type === 'date' || type === 'datetime-local' ? { colorScheme: 'dark' } : null) }} {...focus} />
    </Field>
  )
}

function SelectField({ label, value, onChange, options, placeholder = 'Select…' }) {
  return (
    <Field label={label}>
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={{ ...FIELD, appearance: 'auto' }} {...focus}>
        <option value="">{placeholder}</option>
        {options.map(o => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.id} value={o.id}>{o.label}</option>))}
      </select>
    </Field>
  )
}

function RecordCard({ title, onRemove, children }) {
  return (
    <div style={{ background: CARD, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(title || onRemove) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ ...V3.T.bodyStrong, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${title || 'entry'}`}
              style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: 'transparent', color: V3.TEXT_TERTIARY, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>
              <I n="x" s={16} />
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

function AddButton({ label, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ width: '100%', minHeight: 48, padding: '12px 16px', borderRadius: 12, background: 'transparent', border: `1.5px dashed ${BORDER}`, color: TEXT, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, WebkitTapHighlightColor: 'transparent' }}>
      <I n="plus" s={16} /> {label}
    </button>
  )
}

function Empty({ text }) {
  return <div style={{ ...V3.T.bodyDim, padding: '4px 0 10px' }}>{text}</div>
}

const Grid = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>{children}</div>

// ── Timeline ───────────────────────────────────────────────────────────
export function TimelineEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : []
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i) => onChange(rows.filter((_, j) => j !== i))
  const add = () => onChange([...rows, { id: uid(), date: '', kind: '', description: '' }])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.length === 0 && <Empty text="No events recorded yet. Each event prints in the report's site background, in date order." />}
      {rows.map((r, i) => (
        <RecordCard key={r.id || i} title={`Event ${i + 1}`} onRemove={() => remove(i)}>
          <Grid>
            <TextField label="Date" type="date" value={r.date} onChange={v => set(i, { date: v })} />
            <SelectField label="What happened" value={r.kind} onChange={v => set(i, { kind: v })} options={TIMELINE_KINDS} />
          </Grid>
          <TextField label="Detail" value={r.description} placeholder="e.g. Pressed-wood wardrobes and desks installed, Rooms 201–224" onChange={v => set(i, { description: v })} />
        </RecordCard>
      ))}
      <AddButton label="Add event" onClick={add} />
    </div>
  )
}

// ── Source detail cards ────────────────────────────────────────────────
export function SourceDetailCards({ value, onChange, zone }) {
  const sources = useMemo(() => tickedSources(zone || {}), [zone])
  const details = value && typeof value === 'object' ? value : {}
  const set = (src, patch) => onChange({ ...details, [src]: { ...(details[src] || {}), ...patch } })
  if (!sources.length) return <Empty text="No sources were ticked for this zone. Tick a source above and its detail card appears here." />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sources.map(src => {
        const d = details[src] || {}
        return (
          <RecordCard key={src} title={src}>
            <TextField label="What it is" value={d.what} placeholder="e.g. particleboard wardrobe, two MDF desks, LVP floor" onChange={v => set(src, { what: v })} />
            <Grid>
              <TextField label="Installed or began" type="date" value={d.installedOn} onChange={v => set(src, { installedOn: v })} />
              <TextField label="Extent" value={d.extent} placeholder="e.g. whole floor, one wall" onChange={v => set(src, { extent: v })} />
            </Grid>
          </RecordCard>
        )
      })}
    </div>
  )
}

// ── Checks performed ───────────────────────────────────────────────────
export function ChecksPerformed({ value, onChange }) {
  const checks = value && typeof value === 'object' ? value : {}
  const set = (id, patch) => onChange({ ...checks, [id]: { ...(checks[id] || {}), ...patch } })
  const clear = (id) => { const next = { ...checks }; delete next[id]; onChange(next) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ZONE_CHECKS.map(ck => {
        const c = checks[ck.id]
        const done = !!(c && c.result)
        return (
          <RecordCard key={ck.id} title={ck.label} onRemove={done ? () => clear(ck.id) : undefined}>
            <Grid>
              <SelectField label="Result" value={c && c.result} onChange={v => (v ? set(ck.id, { result: v }) : clear(ck.id))} options={ck.results} placeholder="Not done" />
              <SelectField label="Method" value={c && c.method} onChange={v => set(ck.id, { method: v })} options={CHECK_METHODS} placeholder="How" />
            </Grid>
          </RecordCard>
        )
      })}
    </div>
  )
}

// ── Logger deployment ──────────────────────────────────────────────────
export function LoggerDeployment({ value, onChange }) {
  const d = value && typeof value === 'object' ? value : {}
  const set = (patch) => onChange({ ...d, placed: true, ...patch })
  const events = Array.isArray(d.events) ? d.events : []
  const setEvent = (i, patch) => set({ events: events.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const removeEvent = (i) => set({ events: events.filter((_, j) => j !== i) })
  const addEvent = () => set({ events: [...events, { id: uid(), at: '', kind: '', description: '' }] })
  if (!d.placed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Empty text="No continuous logger in this zone. If one was placed, record it here so the report can describe the deployment and caption its charts." />
        <AddButton label="A logger was placed here" onClick={() => set({})} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <RecordCard title="Deployment" onRemove={() => onChange(undefined)}>
        <Grid>
          <TextField label="Instrument" value={d.instrument} placeholder="Make / model" onChange={v => set({ instrument: v })} />
          <TextField label="Serial number" value={d.serial} onChange={v => set({ serial: v })} />
        </Grid>
        <Grid>
          <SelectField label="Position" value={d.position} onChange={v => set({ position: v })} options={LOGGER_POSITIONS} />
          <TextField label="Height (m)" type="number" inputMode="decimal" value={d.height_m} placeholder="e.g. 1.1" onChange={v => set({ height_m: v })} />
        </Grid>
        <Grid>
          <TextField label="Placed" type="datetime-local" value={d.start} onChange={v => set({ start: v })} />
          <TextField label="Retrieved" type="datetime-local" value={d.end} onChange={v => set({ end: v })} />
        </Grid>
        <TextField label="Logging interval (minutes)" type="number" inputMode="numeric" value={d.interval_min} placeholder="e.g. 60" onChange={v => set({ interval_min: v })} />
      </RecordCard>
      <div style={{ ...V3.T.micro, marginTop: 4 }}>Events during the logging period</div>
      {events.length === 0 && <Empty text="Cleaning, cooking, an HVAC schedule change, a delivery: what happened while the logger ran explains what the trace shows." />}
      {events.map((e, i) => (
        <RecordCard key={e.id || i} title={`Event ${i + 1}`} onRemove={() => removeEvent(i)}>
          <Grid>
            <TextField label="When" type="datetime-local" value={e.at} onChange={v => setEvent(i, { at: v })} />
            <SelectField label="What" value={e.kind} onChange={v => setEvent(i, { kind: v })} options={LOGGER_EVENT_KINDS} />
          </Grid>
          <TextField label="Detail" value={e.description} placeholder="e.g. Kitchenette across the corridor in use" onChange={v => setEvent(i, { description: v })} />
        </RecordCard>
      ))}
      <AddButton label="Add event" onClick={addEvent} />
    </div>
  )
}

// ── Mass-balance prompt ────────────────────────────────────────────────
// Shown on the readings screen once indoor CO₂, outdoor CO₂ and the
// occupant count are all present and no outdoor-air rate has been
// recorded. It offers the ASHRAE 62.1 steady-state estimate the
// `cfm_person` helper already computes, at the moment the inputs exist.
export function MassBalancePrompt({ estimate, onApply }) {
  if (!estimate || !estimate.cfmPerPerson) return null
  return (
    <div style={{ marginTop: 14, background: CARD, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ ...V3.T.bodyStrong }}>Outdoor air from CO₂: about {estimate.cfmPerPerson} cfm/person</div>
        <div style={{ ...V3.T.captionDim, marginTop: 3, lineHeight: 1.45 }}>ASHRAE 62.1 steady-state mass balance at 1.2 met. An estimate, not a measured flow; recording it removes the ventilation-inferred limitation from the report.</div>
      </div>
      <button type="button" onClick={() => onApply(String(estimate.cfmPerPerson))}
        style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1.5px solid ${BORDER}`, background: 'transparent', color: TEXT, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
        Record estimate
      </button>
    </div>
  )
}
