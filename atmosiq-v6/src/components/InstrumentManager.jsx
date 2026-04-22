/**
 * AtmosFlow Instrument Registry Manager
 * Add/remove instruments, view calibration status.
 * Accessible from Settings and during assessment.
 */

import { useState, useEffect } from 'react'
import { I } from './Icons'
import { loadInstruments, saveInstruments, addInstrument, removeInstrument, SENSOR_TYPES, isOutOfCal, getCalWarning } from '../utils/instrumentRegistry'

const CARD = '#111318', BORDER = '#1C1E26', ACCENT = '#22D3EE'
const TEXT = '#ECEEF2', SUB = '#8B93A5', DIM = '#6B7380'
const SUCCESS = '#22C55E', WARN = '#FBBF24', DANGER = '#EF4444'

export default function InstrumentManager({ onBack, onSelect }) {
  const [instruments, setInstruments] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => { setInstruments(loadInstruments()) }, [])

  const handleAdd = () => {
    if (!form.make) return
    const inst = addInstrument(form)
    setInstruments(loadInstruments())
    setForm({}); setShowAdd(false)
    if (onSelect) onSelect(inst)
  }

  const handleRemove = (id) => {
    removeInstrument(id)
    setInstruments(loadInstruments())
  }

  const inp = { width: '100%', padding: '12px 14px', background: '#07080C', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          {onBack && <button onClick={onBack} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Back</button>}
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginTop: 4 }}>Instrument Registry</div>
          <div style={{ fontSize: 11, color: SUB }}>Manage your assessment instruments</div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '6px 12px', background: ACCENT, border: 'none', borderRadius: 6, color: '#000', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add</button>
      </div>

      {showAdd && (
        <div style={{ padding: 16, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 12 }}>Add Instrument</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={form.nickname || ''} onChange={e => setForm({ ...form, nickname: e.target.value })} placeholder="Nickname (e.g. Office Q-Trak)" style={inp} />
            <input value={form.make || ''} onChange={e => setForm({ ...form, make: e.target.value })} placeholder="Make / Model (required)" style={inp} />
            <input value={form.serial || ''} onChange={e => setForm({ ...form, serial: e.target.value })} placeholder="Serial Number" style={inp} />
            <select value={form.sensorType || ''} onChange={e => setForm({ ...form, sensorType: e.target.value })} style={{ ...inp, appearance: 'auto' }}>
              <option value="">Select sensor type...</option>
              {SENSOR_TYPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <input type="date" value={form.lastCalDate || ''} onChange={e => setForm({ ...form, lastCalDate: e.target.value })} style={inp} />
            <select value={form.calStatus || ''} onChange={e => setForm({ ...form, calStatus: e.target.value })} style={{ ...inp, appearance: 'auto' }}>
              <option value="">Calibration status...</option>
              <option value="factory">Factory calibrated</option>
              <option value="field">Field calibrated</option>
              <option value="bump">Bump tested only</option>
              <option value="unknown">Unknown</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAdd(false); setForm({}) }} style={{ flex: 1, padding: '10px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: SUB, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleAdd} style={{ flex: 1, padding: '10px', background: ACCENT, border: 'none', borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {instruments.length === 0 && !showAdd && (
        <div style={{ padding: 40, textAlign: 'center', background: CARD, borderRadius: 10, border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: SUB, marginBottom: 6 }}>No instruments registered</div>
          <div style={{ fontSize: 11, color: DIM, lineHeight: 1.6 }}>Add your IAQ meters, PIDs, and particle counters to track calibration and link readings to specific instruments.</div>
        </div>
      )}

      {instruments.map(inst => {
        const outOfCal = isOutOfCal(inst)
        const warning = getCalWarning(inst)
        const stype = SENSOR_TYPES.find(s => s.id === inst.sensorType)
        return (
          <div key={inst.id} style={{ padding: 14, background: CARD, border: `1px solid ${outOfCal ? WARN + '30' : BORDER}`, borderRadius: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{inst.nickname || inst.make}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: outOfCal ? DANGER : SUCCESS }} />
                <span style={{ fontSize: 9, color: outOfCal ? WARN : SUCCESS, fontWeight: 600 }}>{outOfCal ? 'OUT OF CAL' : 'CURRENT'}</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: SUB }}>{inst.make}{inst.serial ? ` · S/N ${inst.serial}` : ''}</div>
            <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>{stype?.label || inst.sensorType}{inst.lastCalDate ? ` · Cal: ${inst.lastCalDate}` : ''}</div>
            {warning && <div style={{ fontSize: 10, color: WARN, marginTop: 4 }}>⚠ {warning}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {onSelect && <button onClick={() => onSelect(inst)} style={{ padding: '4px 12px', background: `${ACCENT}12`, border: `1px solid ${ACCENT}25`, borderRadius: 6, color: ACCENT, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Use This</button>}
              <button onClick={() => handleRemove(inst.id)} style={{ padding: '4px 12px', background: '#EF444410', border: '1px solid #EF444425', borderRadius: 6, color: '#EF4444', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
