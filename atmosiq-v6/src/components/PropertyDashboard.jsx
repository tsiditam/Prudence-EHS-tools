/**
 * AtmosFlow Property Dashboard — FM Mode
 * Portfolio view for facility managers managing multiple buildings
 */

import { useState, useEffect } from 'react'
import { I } from './Icons'
import { FM_TRAFFIC_LIGHT } from '../constants/terminology'
import { mix } from '../utils/theme'
import { KEYS, complaintsKey } from '../utils/storageKeys'
import STO from '../utils/storage'

const BG = 'var(--bg)', CARD = 'var(--card)', BORDER = 'var(--border)', ACCENT = 'var(--accent)'
const TEXT = 'var(--text)', SUB = 'var(--sub)', DIM = 'var(--dim)'
const SUCCESS = 'var(--success)', WARN = 'var(--warn)', DANGER = 'var(--danger)'
const STORAGE_KEY = KEYS.buildings

// Persistence goes through the storage wrapper (src/utils/storage.js) like
// the rest of the app — the previous direct localStorage reads bypassed its
// quota handling and the complaints migration.
async function loadBuildings() {
  const b = await STO.get(STORAGE_KEY)
  return Array.isArray(b) ? b : []
}
function saveBuildings(b) { return STO.set(STORAGE_KEY, b) }

async function loadComplaints(buildingId) {
  const c = await STO.get(complaintsKey(buildingId))
  return Array.isArray(c) ? c : []
}

/**
 * Worst finding severity → the FM traffic-light key. The labels are the
 * facility-manager vocabulary (`FM_TRAFFIC_LIGHT` in terminology.js) and
 * are unchanged; only what selects them moved from a score band to the
 * finding itself.
 */
const SEVERITY_TO_LIGHT = {
  critical: 'Critical',
  high: 'High Risk',
  medium: 'Moderate',
  low: 'Low Risk',
}

export default function PropertyDashboard({ onBack, onNavigate, assessmentIndex }) {
  const [buildings, setBuildings] = useState([])
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddr, setNewAddr] = useState('')

  // Open-complaint counts per building, loaded alongside the portfolio so
  // the render stays synchronous.
  const [complaintsById, setComplaintsById] = useState({})
  useEffect(() => {
    let alive = true
    ;(async () => {
      const list = await loadBuildings()
      const pairs = await Promise.all(list.map(async (b) => [b.id, await loadComplaints(b.id)]))
      if (!alive) return
      setBuildings(list)
      setComplaintsById(Object.fromEntries(pairs))
    })()
    return () => { alive = false }
  }, [])

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
    const complaints = complaintsById[b.id] || []
    const openComplaints = complaints.filter(c => c.status === 'open' || c.status === 'investigating').length
    const daysSince = lastReport ? Math.floor((Date.now() - new Date(lastReport.ts).getTime()) / 86400000) : null
    // Was a band ladder over the last report's score (80/60/40) — a
    // seventh set of thresholds. The traffic light now reflects the worst
    // finding recorded at that property.
    const risk = SEVERITY_TO_LIGHT[lastReport?.worstSeverity] ?? null
    return { ...b, lastReport, risk, openComplaints, daysSince, findings: lastReport?.findings, attention: lastReport?.attention }
  })

  const filtered = filter === 'all' ? enriched
    : filter === 'critical' ? enriched.filter(b => b.risk === 'Critical' || b.risk === 'High Risk')
    : filter === 'overdue' ? enriched.filter(b => !b.daysSince || b.daysSince > 90)
    : filter === 'escalated' ? enriched.filter(b => b.openComplaints > 0)
    : enriched

  const totalComplaints = enriched.reduce((s, b) => s + b.openComplaints, 0)
  // Was the mean score across properties. Averaging a rating over a
  // portfolio told you less the more properties it covered.
  const counted = enriched.filter(b => b.findings != null)
  const needAttention = counted.reduce((s, b) => s + (b.attention || 0), 0)

  const exportCSV = () => {
    const headers = ['Building', 'Address', 'Last Check', 'Findings', 'Worst finding', 'Open Complaints', 'Days Since Check']
    const rows = enriched.map(b => [b.name, b.address, b.lastReport?.ts || '—', b.findings ?? '—', b.risk || '—', b.openComplaints, b.daysSince ?? '—'])
    const csv = [headers, ...rows].map(r => r.map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'portfolio-summary.csv'; a.click()
  }

  const tl = (risk) => FM_TRAFFIC_LIGHT[risk] || { color: DIM, label: '—', bg: `${mix('dim', 6)}` }
  const inp = { width: '100%', padding: '12px 14px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }

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
          <div style={{ fontSize: 18, fontWeight: 700, color: counted.length === 0 ? DIM : needAttention > 0 ? DANGER : SUCCESS, fontFamily: "var(--font-mono)" }}>{counted.length === 0 ? '—' : needAttention}</div>
          <div style={{ fontSize: 9, color: SUB, marginTop: 2 }}>Need Action</div>
        </div>
        <div style={{ padding: 12, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: totalComplaints > 0 ? WARN : SUCCESS, fontFamily: "var(--font-mono)" }}>{totalComplaints}</div>
          <div style={{ fontSize: 9, color: SUB, marginTop: 2 }}>Open Complaints</div>
        </div>
      </div>

      {/* Filters + Actions */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all', 'critical', 'overdue', 'escalated'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 12px', borderRadius: 6, background: filter === f ? `${mix('accent', 7)}` : CARD, border: `1px solid ${filter === f ? mix('accent', 19) : BORDER}`, color: filter === f ? ACCENT : SUB, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{f}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={exportCSV} style={{ padding: '5px 10px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: SUB, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>CSV</button>
          <button onClick={() => setShowAdd(true)} style={{ padding: '5px 10px', background: ACCENT, border: 'none', borderRadius: 6, color: 'var(--on-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Building</button>
        </div>
      </div>

      {showAdd && (
        <div style={{ padding: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 12 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Building name" style={{ ...inp, marginBottom: 8 }} />
          <input value={newAddr} onChange={e => setNewAddr(e.target.value)} placeholder="Address (optional)" style={{ ...inp, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: SUB, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={addBuilding} style={{ flex: 1, padding: '8px', background: ACCENT, border: 'none', borderRadius: 6, color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
          </div>
        </div>
      )}

      {/* Building List */}
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: DIM, fontSize: 13 }}>No buildings added yet.</div>}
      {filtered.map(b => {
        const light = tl(b.risk)
        return (
          <button type="button" key={b.id} style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', color: TEXT, padding: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 8, cursor: 'pointer' }} onClick={() => onNavigate?.('building', b.id)} aria-label={`Open ${b.name}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{b.name}</div>
              {b.risk && <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: light.bg, color: light.color }}>{light.label}</span>}
            </div>
            {b.address && <div style={{ fontSize: 10, color: DIM, marginBottom: 6 }}>{b.address}</div>}
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: SUB }}>
              {b.findings != null && <span>{b.findings} finding{b.findings === 1 ? '' : 's'}</span>}
              {b.openComplaints > 0 && <span style={{ color: WARN }}>{b.openComplaints} open complaints</span>}
              {b.daysSince != null && <span>{b.daysSince > 90 ? <span style={{ color: WARN }}>Overdue ({b.daysSince}d)</span> : `${b.daysSince}d ago`}</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
