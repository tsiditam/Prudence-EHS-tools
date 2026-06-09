/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SettingsScreen — assessor control center
 */

import { useState, useEffect } from 'react'
import STO from '../utils/storage'
import Backup from '../utils/backup'
import { VER, BUILD_SHA } from '../constants/standards'
import { mix } from '../utils/theme'
import * as V3 from '../styles/tokens'
import { Group, Row, ExceptionPill } from './settings/SettingsList'
import ReportTemplatesPanel from './settings/ReportTemplatesPanel'
import SiteLibraryPanel from './settings/SiteLibraryPanel'

// Theme tokens. These are CSS-variable references defined in
// index.html (:root for dark, [data-theme="light"] for light), so the
// page re-renders without color changes when the toggle flips — the
// browser swaps the resolved palette via the cascade.
const BG = 'var(--bg)'
const SURFACE = 'var(--surface)'
const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const SUCCESS = 'var(--success)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'
const ON_ACCENT = 'var(--on-accent)'

// `mix(name, pct)` for legacy `${TOKEN}HEX_ALPHA` sites is imported
// from utils/theme above. Group / Row / ExceptionPill are imported from
// ./settings/SettingsList (shared with AccountScreen).

// `credits` prop intentionally dropped in billing-architecture
// Phase 1 — the Manage Subscription row's subtitle now comes from
// subscriptionState.getSubscriptionRowSubtitle, not from a numeric
// balance. `onNavigate` kept as a prop because Phase 2 will route
// `'manage-subscription'` to the Stripe Customer Portal through it.
export default function SettingsScreen({ onNavigate, onActivateAdmin, adminActive }) {
  const [health, setHealth] = useState(null)
  const [importMsg, setImportMsg] = useState('')
  const [index, setIndex] = useState({ reports: [], drafts: [] })
  const [trashCount, setTrashCount] = useState(0)
  const [adminTaps, setAdminTaps] = useState(0)
  const [showAdminInput, setShowAdminInput] = useState(false)
  const [adminCode, setAdminCode] = useState('')

  useEffect(() => {
    Backup.checkHealth().then(setHealth)
    STO.getIndex().then(setIndex)
    Backup.listTrash().then(t => setTrashCount(t.length))
  }, [])

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const result = await Backup.importBackup(json)
      setImportMsg(`Imported ${result.reports} reports, ${result.drafts} drafts`)
      STO.getIndex().then(setIndex)
    } catch (err) {
      setImportMsg(`Import failed: ${err.message}`)
    }
    e.target.value = ''
  }

  const storageUsed = (() => {
    try {
      let total = 0
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        total += (localStorage.getItem(key) || '').length
      }
      return total > 1048576 ? `${(total / 1048576).toFixed(1)} MB` : `${Math.round(total / 1024)} KB`
    } catch { return '—' }
  })()

  const dataOk = !health || health.healthy

  return (
    <div style={{paddingTop:24,paddingBottom:120}}>
      <div style={{marginBottom:20}}>
        <div style={{...V3.T.h1, marginBottom:4}}>Settings</div>
        <div style={V3.T.bodyDim}>Data, methodology, and preferences</div>
      </div>

      {/* Account, Instruments, Bluetooth Sensors, and the account Danger
          zone (sign out / delete account) moved to the dedicated Account
          page (AccountScreen), reached from the bottom dock's Account
          tab. Settings now keeps only app/data/methodology/legal
          concerns. */}

      {/* ── Methodology ── */}
      <Group title="Methodology">
        <div style={{padding:'14px 16px'}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
            {['ASHRAE 62.1-2025','ASHRAE 55-2023','OSHA PELs','NIOSH RELs','EPA NAAQS','WHO AQG','AIHA'].map(s => (
              <span key={s} style={{padding:'4px 8px',borderRadius:4,background:mix('accent', 3),border:`1px solid ${mix('accent', 7)}`,fontSize:9,fontWeight:600,color:ACCENT,fontFamily:"var(--font-mono)",letterSpacing:'0.2px'}}>{s}</span>
            ))}
          </div>
          <details>
            <summary style={{fontSize:10,fontWeight:600,color:DIM,cursor:'pointer',listStyle:'none',display:'flex',alignItems:'center',gap:4}}>
              <span style={{fontSize:8}}>▶</span> Data center standards
            </summary>
            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
              {['ANSI/ISA 71.04-2013','ISO 14644-1:2015','ASHRAE TC 9.9','IEEE 1635','NFPA 855'].map(s => (
                <span key={s} style={{padding:'4px 8px',borderRadius:4,background:mix('dim', 6),border:`1px solid ${mix('dim', 12)}`,fontSize:9,fontWeight:600,color:DIM,fontFamily:"var(--font-mono)",letterSpacing:'0.2px'}}>{s}</span>
              ))}
            </div>
          </details>
          <div style={{fontSize:10,color:DIM,marginTop:10,lineHeight:1.5}}>Scoring informed by, not certified by, these standards. Thresholds update with each app release.</div>
        </div>
      </Group>

      {/* ── Data & Backup ── */}
      <Group
        title="Data & Backup"
        right={!dataOk ? <ExceptionPill tone="warn" text="Issues found" /> : null}
      >
        <Row
          first
          label="Local data"
          sub={`${index.reports?.length || 0} reports · ${index.drafts?.length || 0} drafts${trashCount ? ' · ' + trashCount + ' in trash' : ''}`}
          value={storageUsed}
        />
        <Row label="Export Backup" action={() => Backup.downloadBackup()} />
        <label style={{display:'block'}}>
          <Row label="Restore from Backup" action={() => document.getElementById('settings-import').click()} />
          <input id="settings-import" type="file" accept=".json" onChange={handleImport} style={{display:'none'}} />
        </label>
        {trashCount > 0 && <Row label="Trash" value={`${trashCount}`} action={() => onNavigate?.('trash')} />}
      </Group>
      {importMsg && <div style={{padding:'8px 14px',background:mix('accent', 3),border:`1px solid ${mix('accent', 9)}`,borderRadius:8,marginTop:8,fontSize:11,color:ACCENT}}>{importMsg}</div>}
      {!dataOk && health?.issues?.length > 0 && (
        <div style={{marginTop:8,padding:'10px 14px',background:mix('warn', 3),border:`1px solid ${mix('warn', 14)}`,borderRadius:8}}>
          {health.issues.map((issue, i) => (
            <div key={i} style={{fontSize:11,color:issue.level==='critical'?DANGER:WARN,marginBottom:i<health.issues.length-1?4:0}}>{issue.msg}</div>
          ))}
        </div>
      )}

      {/* ── Admin (only when activated) ── */}
      {adminActive && (
        <Group title="Admin">
          <Row first label="Admin Dashboard" action={() => onNavigate?.('admin')} />
        </Group>
      )}

      {/* ── Help ── */}
      <Group title="Help">
        <Row first label="Help & FAQ" sub="Methodology, scoring, workflow, limitations" action={() => onNavigate?.('help')} />
        <Row label="Take the product tour" sub="A 60-second walkthrough of AtmosFlow's features" action={() => onNavigate?.('tour')} />
      </Group>

      {/* ── Sites — saved site library + re-assessment reminders ── */}
      <Group title="Sites">
        <SiteLibraryPanel />
      </Group>

      {/* ── Report Templates — user-uploaded .docx renderable via Jasper ── */}
      <Group title="Report Templates">
        <ReportTemplatesPanel />
      </Group>

      {/* ── Legal ── */}
      <Group title="Legal">
        <Row first label="Terms of Service" action={() => onNavigate?.('tos')} />
        <Row label="Privacy Policy" action={() => onNavigate?.('privacy')} />
      </Group>

      {/* ── About — version pill doubles as the 5-tap admin-activation
          gesture (preserved). Credit definition is mirrored here per
          the CIH credibility requirement that the unit be defined
          consistently in both surfaces (header chip + Settings). ── */}
      <Group title="About">
        <button
          onClick={() => {
            const next = adminTaps + 1
            setAdminTaps(next)
            if (next >= 5 && !adminActive) setShowAdminInput(true)
            setTimeout(() => setAdminTaps(0), 3000)
          }}
          style={{width:'100%',padding:'14px 16px',background:'transparent',border:'none',cursor:'default',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',minHeight:52}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:600,color:TEXT}}>AtmosFlow</div>
            <div style={{fontSize:11,color:DIM,marginTop:2}}>Prudence EHS · Gaithersburg, MD</div>
          </div>
          <span style={{fontSize:10,color:DIM,fontFamily:"var(--font-mono)",padding:'3px 8px',borderRadius:6,background:SURFACE,border:`1px solid ${BORDER}`,flexShrink:0}}>v{VER} · {BUILD_SHA}</span>
        </button>
        {/* "What is a credit?" mirror removed in billing-architecture
            Phase 1 along with the credit-definition mini-sheet on
            Home. The product no longer has credits — see
            src/utils/subscriptionState.js for the new model and the
            pricing-architecture prompt for the Phase 2+ tier rollout. */}
      </Group>
      {/* Admin access is a fixed-position modal overlay, NOT inline
          content. Rendering it inline used to grow the page and reflow
          the sections above it (Legal/About), so a tap aimed at the
          version pill could land on the Terms of Service row instead.
          A fixed overlay never shifts the page layout. */}
      {showAdminInput && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAdminInput(false); setAdminCode('') } }}
          style={{position:'fixed',inset:0,background:'#000000CC',zIndex:340,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
        >
          <div style={{width:'100%',maxWidth:380,padding:'20px',background:CARD,border:`1px solid ${mix('warn', 14)}`,borderRadius:14,boxShadow:'0 12px 60px rgba(0,0,0,0.5)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:WARN}}>Admin Access</div>
              <button onClick={() => { setShowAdminInput(false); setAdminCode('') }} style={{background:'none',border:'none',color:DIM,fontSize:18,lineHeight:1,cursor:'pointer',fontFamily:'inherit',padding:'0 4px'}} aria-label="Close">×</button>
            </div>
            <input
              autoFocus
              value={adminCode}
              onChange={e=>setAdminCode(e.target.value)}
              onKeyDown={e=>{ if (e.key === 'Enter' && adminCode) { onActivateAdmin?.(adminCode); setShowAdminInput(false); setAdminCode('') } }}
              placeholder="Enter admin secret"
              type="password"
              style={{width:'100%',padding:'12px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,fontFamily:'inherit',outline:'none',marginBottom:10,boxSizing:'border-box'}}
            />
            <button onClick={() => { if (adminCode) { onActivateAdmin?.(adminCode); setShowAdminInput(false); setAdminCode('') } }} style={{width:'100%',padding:'12px 16px',background:mix('warn', 8),border:`1px solid ${mix('warn', 19)}`,borderRadius:8,color:WARN,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Activate</button>
          </div>
        </div>
      )}

      {/* Danger zone (Sign out / Delete account) moved to AccountScreen. */}
    </div>
  )
}
