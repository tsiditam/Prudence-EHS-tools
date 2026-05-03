/**
 * AtmosFlow Property Dashboard — FM Mode
 * Portfolio view for facility managers managing multiple buildings
 */

import { useState, useEffect } from 'react'
import { I } from './Icons'
import { FM_TRAFFIC_LIGHT } from '../constants/terminology'

const BG = '#07080C', CARD = '#111318', BORDER = '#1C1E26', ACCENT = '#22D3EE'
const TEXT = '#ECEEF2', SUB = '#8B93A5', DIM = '#6B7380'
const SUCCESS = '#22C55E', WARN = '#FBBF24', DANGER = '#EF4444'
const STORAGE_KEY = 'atmosflow:buildings'

function loadBuildings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveBuildings(b) { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)) }

function loadComplaints(buildingId) {
  try { return JSON.parse(localStorage.getItem(`atmosflow:complaints:${buildingId}`) || '[]') } catch { return [] }
}

export default function PropertyDashboard({ onBack, onNavigate, assessmentIndex }) {
  const [buildings, setBuildings] = useState([])
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddr, setNewAddr] = useState('')

  useEffect(() => { setBuildings(loadBuildings()) }, [])

  const addBuilding = () => {
    if (!newName.trim()) return
    const b = { id: 'bld-' + Date.now().toString(36), name: newName.trim(), address: newAddr.trim(), createdAt: new Date().toISOString(), archived: false }
    const updated = [b, ...buildings]
    setBuildings(updated); saveBuildings(updated)
    setNewName(''); setNewAddr(''); setShowAdd(false)
  }

  const archiveBuilding = (id) => {
    const updated = buildings.map(b => b.id === id ? { ...b, archived: true } : b)
    setBuildings(updated); saveBuildings(updated)
  }

  const reports = assessmentIndex?.reports || []

  const enriched = buildings.filter(b => !b.archived).map(b => {
    const bReports = reports.filter(r => r.facility === b.name)
    const lastReport = bReports[0]
    const complaints = loadComplaints(b.id)
    const openComplaints = complaints.filter(c => c.status === 'open' || c.status === 'investigating').length
    const daysSince = lastReport ? Math.floor((Date.now() - new Date(lastReport.ts).getTime()) / 86400000) : null
    const risk = lastReport?.score >= 80 ? 'Low Risk' : lastReport?.score >= 60 ? 'Moderate' : lastReport?.score >= 40 ? 'High Risk' : lastReport?.score != null ? 'Critical' : null
    return { ...b, lastReport, risk, openComplaints, daysSince, score: lastReport?.score }
  })

  const filtered = filter === 'all' ? enriched
    : filter === 'critical' ? enriched.filter(b => b.risk === 'Critical' || b.risk === 'High Risk')
    : filter === 'overdue' ? enriched.filter(b => !b.daysSince || b.daysSince > 90)
    : filter === 'escalated' ? enriched.filter(b => b.openComplaints > 0)
    : enriched

  const totalComplaints = enriched.reduce((s, b) => s + b.openComplaints, 0)
  const avgScore = enriched.filter(b => b.score != null).length > 0
    ? Math.round(enriched.filter(b => b.score != null).reduce((s, b) => s + b.score, 0) / enriched.filter(b => b.score != null).length)
    : null

  const exportCSV = () => {
    const headers = ['Building', 'Address', 'Last Check', 'Score', 'Risk', 'Open Complaints', 'Days Since Check']
    const rows = enriched.map(b => [b.name, b.address, b.lastReport?.ts || '—', b.score ?? '—', b.risk || '—', b.openComplaints, b.daysSince ?? '—'])
    const csv = [headers, ...rows].map(r => r.map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'portfolio-summary.csv'; a.click()
  }

  const tl = (risk) => FM_TRAFFIC_LIGHT[risk] || { color: DIM, label: '—', bg: `${DIM}10` }
  const inp = { width: '100%', padding: '12px 14px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 100 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Back</button>
      <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginTop: 4 }}>My Buildings</div>
      <div style={{ fontSize: 11, color: SUB, marginBottom: 16 }}>Portfolio overview</div>

      {/* Portfolio Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, fontFamily: "var(--font-mono)" }}>{enriched.length}</div>
          <div style={{ fontSize: 9, color: SUB, marginTop: 2 }}>Properties</div>
        </div>
        <div style={{ padding: 12, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: avgScore != null ? (avgScore >= 70 ? SUCCESS : avgScore >= 50 ? WARN : DANGER) : DIM, fontFamily: "var(--font-mono)" }}>{avgScore ?? '—'}</div>
          <div style={{ fontSize: 9, color: SUB, marginTop: 2 }}>Avg Score</div>
        </div>
        <div style={{ padding: 12, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: totalComplaints > 0 ? WARN : SUCCESS, fontFamily: "var(--font-mono)" }}>{totalComplaints}</div>
          <div style={{ fontSize: 9, color: SUB, marginTop: 2 }}>Open Complaints</div>
        </div>
      </div>

      {/* Filters + Actions */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all', 'critical', 'overdue', 'escalated'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 12px', borderRadius: 6, background: filter === f ? `${ACCENT}12` : CARD, border: `1px solid ${filter === f ? ACCENT + '30' : BORDER}`, color: filter === f ? ACCENT : SUB, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{f}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={exportCSV} style={{ padding: '5px 10px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: SUB, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>CSV</button>
          <button onClick={() => setShowAdd(true)} style={{ padding: '5px 10px', background: ACCENT, border: 'none', borderRadius: 6, color: '#000', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Building</button>
        </div>
      </div>

      {showAdd && (
        <div style={{ padding: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 12 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Building name" style={{ ...inp, marginBottom: 8 }} />
          <input value={newAddr} onChange={e => setNewAddr(e.target.value)} placeholder="Address (optional)" style={{ ...inp, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: SUB, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={addBuilding} style={{ flex: 1, padding: '8px', background: ACCENT, border: 'none', borderRadius: 6, color: '#000', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
          </div>
        </div>
      )}

      {/* Building List */}
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: DIM, fontSize: 13 }}>No buildings added yet.</div>}
      {filtered.map(b => {
        const light = tl(b.risk)
        return (
          <div key={b.id} style={{ padding: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 8, cursor: 'pointer' }} onClick={() => onNavigate?.('building', b.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{b.name}</div>
              {b.risk && <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: light.bg, color: light.color }}>{light.label}</span>}
            </div>
            {b.address && <div style={{ fontSize: 10, color: DIM, marginBottom: 6 }}>{b.address}</div>}
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: SUB }}>
              {b.score != null && <span>Score: {b.score}</span>}
              {b.openComplaints > 0 && <span style={{ color: WARN }}>{b.openComplaints} open complaints</span>}
              {b.daysSince != null && <span>{b.daysSince > 90 ? <span style={{ color: WARN }}>Overdue ({b.daysSince}d)</span> : `${b.daysSince}d ago`}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
