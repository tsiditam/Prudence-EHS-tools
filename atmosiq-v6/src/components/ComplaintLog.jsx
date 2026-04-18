/**
 * AtmosFlow Complaint Log — FM Mode
 * Persistent building-level complaint tracking with CSV export
 */

import { useState, useEffect } from 'react'
import { I } from './Icons'
import { COMPLAINT_SYMPTOMS } from '../constants/terminology'

const BG = '#07080C', CARD = '#111318', BORDER = '#1C1E26', ACCENT = '#22D3EE'
const TEXT = '#ECEEF2', SUB = '#8B93A5', DIM = '#6B7380'
const WARN = '#FBBF24', DANGER = '#EF4444', SUCCESS = '#22C55E'
const STORAGE_PREFIX = 'atmosflow:complaints:'

function loadComplaints(buildingId) {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + (buildingId || 'default')) || '[]') } catch { return [] }
}
function saveComplaints(buildingId, complaints) {
  localStorage.setItem(STORAGE_PREFIX + (buildingId || 'default'), JSON.stringify(complaints))
}

export default function ComplaintLog({ buildingId, onBack }) {
  const [complaints, setComplaints] = useState([])
  const [filter, setFilter] = useState('open')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => { setComplaints(loadComplaints(buildingId)) }, [buildingId])

  const save = (updated) => { setComplaints(updated); saveComplaints(buildingId, updated) }

  const addComplaint = () => {
    if (!form.location || !form.symptoms?.length) return
    const complaint = {
      id: 'cmp-' + Date.now().toString(36),
      buildingId: buildingId || 'default',
      dateReported: new Date().toISOString(),
      reportedBy: form.reportedBy || 'Anonymous',
      location: form.location,
      symptoms: form.symptoms,
      severity: form.severity || 'mild',
      medicalAttention: form.medicalAttention || false,
      status: 'open',
      linkedAssessmentIds: [],
      linkedInterventionIds: [],
      notes: form.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    save([complaint, ...complaints])
    setForm({}); setShowForm(false)
  }

  const updateStatus = (id, status) => {
    save(complaints.map(c => c.id === id ? { ...c, status, updatedAt: new Date().toISOString() } : c))
  }

  const exportCSV = () => {
    const headers = ['ID','Date','Reporter','Location','Symptoms','Severity','Medical','Status','Notes']
    const rows = complaints.map(c => [c.id, c.dateReported, c.reportedBy, c.location, (c.symptoms||[]).join('; '), c.severity, c.medicalAttention?'Yes':'No', c.status, c.notes])
    const csv = [headers, ...rows].map(r => r.map(v => `"${(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `complaints-${buildingId || 'building'}.csv`; a.click()
  }

  const filtered = filter === 'open' ? complaints.filter(c => c.status === 'open' || c.status === 'investigating') : complaints
  const sevColor = { mild: DIM, moderate: WARN, severe: DANGER }

  const inp = { width: '100%', padding: '12px 14px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Back</button>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginTop: 4 }}>Complaint Log</div>
          <div style={{ fontSize: 11, color: SUB }}>Track occupant complaints and symptoms</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportCSV} style={{ padding: '6px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: SUB, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Export CSV</button>
          <button onClick={() => setShowForm(true)} style={{ padding: '6px 12px', background: ACCENT, border: 'none', borderRadius: 6, color: '#000', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add</button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['open', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 6, background: filter === f ? `${ACCENT}12` : CARD, border: `1px solid ${filter === f ? ACCENT + '30' : BORDER}`, color: filter === f ? ACCENT : SUB, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{f}</button>
        ))}
        <span style={{ fontSize: 10, color: DIM, alignSelf: 'center', marginLeft: 'auto' }}>{filtered.length} complaint{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ padding: 16, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 12 }}>New Complaint</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={form.reportedBy || ''} onChange={e => setForm({ ...form, reportedBy: e.target.value })} placeholder="Reported by (name or role)" style={inp} />
            <input value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Location (e.g. 4th floor conference room B)" style={inp} />
            <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>Symptoms</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COMPLAINT_SYMPTOMS.map(s => {
                const sel = (form.symptoms || []).includes(s)
                return <button key={s} onClick={() => setForm({ ...form, symptoms: sel ? (form.symptoms || []).filter(x => x !== s) : [...(form.symptoms || []), s] })} style={{ padding: '5px 10px', borderRadius: 16, background: sel ? `${ACCENT}15` : CARD, border: `1px solid ${sel ? ACCENT : BORDER}`, color: sel ? ACCENT : SUB, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{s}</button>
              })}
            </div>
            <select value={form.severity || 'mild'} onChange={e => setForm({ ...form, severity: e.target.value })} style={{ ...inp, appearance: 'auto' }}>
              <option value="mild">Mild — comfort concern</option>
              <option value="moderate">Moderate — symptoms reported</option>
              <option value="severe">Severe — significant impact</option>
            </select>
            <label style={{ fontSize: 11, color: SUB, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.medicalAttention || false} onChange={e => setForm({ ...form, medicalAttention: e.target.checked })} />
              Medical attention sought
            </label>
            <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." rows={2} style={{ ...inp, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowForm(false); setForm({}) }} style={{ flex: 1, padding: '10px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: SUB, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={addComplaint} style={{ flex: 1, padding: '10px', background: ACCENT, border: 'none', borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save Complaint</button>
            </div>
          </div>
        </div>
      )}

      {/* Complaint List */}
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: DIM, fontSize: 13 }}>No complaints logged yet.</div>}
      {filtered.map(c => (
        <div key={c.id} style={{ padding: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{c.location}</div>
            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: `${sevColor[c.severity] || DIM}15`, color: sevColor[c.severity] || DIM, textTransform: 'uppercase' }}>{c.severity}</span>
          </div>
          <div style={{ fontSize: 11, color: SUB, marginBottom: 4 }}>{(c.symptoms || []).join(', ')}</div>
          <div style={{ fontSize: 10, color: DIM }}>{c.reportedBy} · {new Date(c.dateReported).toLocaleDateString()}</div>
          {c.medicalAttention && <div style={{ fontSize: 10, color: DANGER, marginTop: 4 }}>⚠ Medical attention sought</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {['open', 'investigating', 'resolved', 'referred'].map(s => (
              <button key={s} onClick={() => updateStatus(c.id, s)} style={{ padding: '3px 8px', borderRadius: 4, background: c.status === s ? `${ACCENT}15` : 'transparent', border: `1px solid ${c.status === s ? ACCENT + '30' : BORDER}`, color: c.status === s ? ACCENT : DIM, fontSize: 9, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{s}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
