/**
 * AtmosFlow Intervention Tracker — FM Mode
 * Pre/post measurement pairing for corrective actions
 */

import { useState, useEffect } from 'react'
import { I } from './Icons'

const CARD = '#111318', BORDER = '#1C1E26', ACCENT = '#22D3EE'
const TEXT = '#ECEEF2', SUB = '#8B93A5', DIM = '#6B7380'
const SUCCESS = '#22C55E', WARN = '#FBBF24', DANGER = '#EF4444'
const STORAGE_PREFIX = 'atmosflow:interventions:'

const TYPES = [
  { id: 'filter_change', label: 'Filter Change' },
  { id: 'airflow_adjustment', label: 'Airflow Adjustment' },
  { id: 'temperature_adjustment', label: 'Temperature Adjustment' },
  { id: 'humidity_adjustment', label: 'Humidity Adjustment' },
  { id: 'cleaning', label: 'Cleaning / Housekeeping' },
  { id: 'source_removal', label: 'Source Removal' },
  { id: 'ventilation_increase', label: 'Ventilation Increase' },
  { id: 'other', label: 'Other' },
]

function load(buildingId) {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + (buildingId || 'default')) || '[]') } catch { return [] }
}
function save(buildingId, items) {
  localStorage.setItem(STORAGE_PREFIX + (buildingId || 'default'), JSON.stringify(items))
}

export default function InterventionTracker({ buildingId, onBack, assessments }) {
  const [interventions, setInterventions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => { setInterventions(load(buildingId)) }, [buildingId])

  const persist = (updated) => { setInterventions(updated); save(buildingId, updated) }

  const addIntervention = () => {
    if (!form.type || !form.description) return
    const item = {
      id: 'int-' + Date.now().toString(36),
      buildingId: buildingId || 'default',
      type: form.type,
      description: form.description,
      datePerformed: new Date().toISOString(),
      performedBy: form.performedBy || '',
      targetArea: form.targetArea || '',
      preInterventionAssessmentId: form.preAssessmentId || null,
      postInterventionAssessmentId: null,
      effectiveness: 'not_yet_measured',
      notes: form.notes || '',
    }
    persist([item, ...interventions])
    setForm({}); setShowForm(false)
  }

  const linkPostAssessment = (intId, assessId) => {
    const pre = interventions.find(i => i.id === intId)
    const preAssess = (assessments || []).find(a => a.id === pre?.preInterventionAssessmentId)
    const postAssess = (assessments || []).find(a => a.id === assessId)
    let effectiveness = 'not_yet_measured'
    if (preAssess?.score != null && postAssess?.score != null) {
      const delta = postAssess.score - preAssess.score
      effectiveness = delta > 5 ? 'improved' : delta < -5 ? 'worsened' : 'no_change'
    }
    persist(interventions.map(i => i.id === intId ? { ...i, postInterventionAssessmentId: assessId, effectiveness } : i))
  }

  const exportCSV = () => {
    const headers = ['ID', 'Type', 'Description', 'Date', 'Performed By', 'Area', 'Effectiveness', 'Notes']
    const rows = interventions.map(i => [i.id, i.type, i.description, i.datePerformed, i.performedBy, i.targetArea, i.effectiveness, i.notes])
    const csv = [headers, ...rows].map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `interventions-${buildingId || 'building'}.csv`; a.click()
  }

  const effColor = { improved: SUCCESS, no_change: WARN, worsened: DANGER, not_yet_measured: DIM }
  const effLabel = { improved: '↑ Improved', no_change: '→ No Change', worsened: '↓ Worsened', not_yet_measured: '? Not Measured' }
  const typeLabel = Object.fromEntries(TYPES.map(t => [t.id, t.label]))
  const inp = { width: '100%', padding: '12px 14px', background: '#07080C', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Back</button>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginTop: 4 }}>Interventions</div>
          <div style={{ fontSize: 11, color: SUB }}>Track corrective actions and measure effectiveness</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportCSV} style={{ padding: '6px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: SUB, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Export CSV</button>
          <button onClick={() => setShowForm(true)} style={{ padding: '6px 12px', background: ACCENT, border: 'none', borderRadius: 6, color: '#000', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add</button>
        </div>
      </div>

      {showForm && (
        <div style={{ padding: 16, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 12 }}>Log Intervention</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select value={form.type || ''} onChange={e => setForm({ ...form, type: e.target.value })} style={{ ...inp, appearance: 'auto' }}>
              <option value="">Select type...</option>
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was done?" style={inp} />
            <input value={form.targetArea || ''} onChange={e => setForm({ ...form, targetArea: e.target.value })} placeholder="Target area (e.g. 3rd floor east)" style={inp} />
            <input value={form.performedBy || ''} onChange={e => setForm({ ...form, performedBy: e.target.value })} placeholder="Performed by" style={inp} />
            <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes..." rows={2} style={{ ...inp, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowForm(false); setForm({}) }} style={{ flex: 1, padding: '10px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: SUB, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={addIntervention} style={{ flex: 1, padding: '10px', background: ACCENT, border: 'none', borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {interventions.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: DIM, fontSize: 13 }}>No interventions logged yet.</div>}
      {interventions.map(i => (
        <div key={i.id} style={{ padding: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{typeLabel[i.type] || i.type}</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: effColor[i.effectiveness] }}>{effLabel[i.effectiveness]}</span>
          </div>
          <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>{i.description}</div>
          {i.targetArea && <div style={{ fontSize: 10, color: DIM }}>{i.targetArea} · {new Date(i.datePerformed).toLocaleDateString()}</div>}
          {i.effectiveness === 'not_yet_measured' && (
            <button onClick={() => {}} style={{ marginTop: 8, padding: '6px 14px', background: `${ACCENT}12`, border: `1px solid ${ACCENT}30`, borderRadius: 6, color: ACCENT, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Run Post-Intervention Check →</button>
          )}
        </div>
      ))}
    </div>
  )
}
