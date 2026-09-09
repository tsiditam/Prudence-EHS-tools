/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SettingsScreen — assessor control center.
 *
 * Inset grouped list (2026-09): every setting is a row in a rounded
 * panel under a small heading, the way iOS Settings draws it. The two
 * panels that used to render inline here — the site library and the
 * report templates, each with its own paragraph, sign-in notice, dashed
 * empty state and accent button — are rows now ("Sites ›", "Report
 * templates ›") that open their own screens, SitesScreen and
 * ReportTemplatesScreen below. Product decision (2026-09): the Methodology
 * group and the Sites / Report templates rows were removed from this
 * screen; Settings keeps Assessment mode, Data & Backup, Help, Legal and
 * About.
 */

import { useState, useEffect } from 'react'
import STO from '../utils/storage'
import Backup from '../utils/backup'
import { VER, BUILD_SHA } from '../constants/standards'
import { mix } from '../utils/theme'
import * as V3 from '../styles/tokens'
import { Group, Row, ExceptionPill, INSET } from './settings/SettingsList'
import SiteLibraryPanel from './settings/SiteLibraryPanel'
import ReportTemplatesPanel from './settings/ReportTemplatesPanel'
import { isMoldModuleEnabled } from '../utils/featureFlags'

// Theme tokens. These are CSS-variable references defined in
// index.html (:root for dark, [data-theme="light"] for light), so the
// page re-renders without color changes when the toggle flips — the
// browser swaps the resolved palette via the cascade.
const BG = 'var(--bg)'
const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'

// The site library on its own screen (`sites` route). It is the only
// management surface for records the app creates on its own:
// SaveSitePrompt writes a site at finalize, and the re-assessment cron
// emails against it. Product decision (2026-09): the Settings screen no
// longer carries a row to it — Methodology, Sites and Report templates
// were removed from Settings. The screen and its route remain so the
// panel is mountable; it currently has no entry point in the app.
export function SitesScreen() {
  return (
    <div style={{ paddingTop: 16, paddingBottom: 120 }}>
      <div style={{ ...V3.T.h1, marginBottom: 12 }}>Sites</div>
      <SiteLibraryPanel />
    </div>
  )
}

// Report templates on their own screen (`report-templates` route).
// Uploading a .docx here is the only way to get a template into the
// account; `generate_report` can only ever answer `no_templates_saved`
// without it. Same product decision as SitesScreen: no row in Settings,
// and no entry point in the app at present.
export function ReportTemplatesScreen() {
  return (
    <div style={{ paddingTop: 16, paddingBottom: 120 }}>
      <div style={{ ...V3.T.h1, marginBottom: 12 }}>Report templates</div>
      <ReportTemplatesPanel />
    </div>
  )
}

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

  // The Data & Backup caption: an import result, then any health issues.
  const dataFooter = (importMsg || (!dataOk && health?.issues?.length > 0)) ? (
    <>
      {importMsg && <div>{importMsg}</div>}
      {!dataOk && health?.issues?.map((issue, i) => (
        <div key={i} style={{ color: issue.level === 'critical' ? DANGER : WARN }}>{issue.msg}</div>
      ))}
    </>
  ) : null

  return (
    <div style={{paddingTop:16,paddingBottom:120}}>
      <div style={{...V3.T.h1, marginBottom:4}}>Settings</div>

      {/* Account, Instruments, Bluetooth Sensors, and the account Danger
          zone (sign out / delete account) live on the Account page
          (AccountScreen), reached from the bottom dock's Account tab.
          Settings keeps the app / data / methodology / legal concerns. */}

      {/* ── Assessment mode ── Mold is its own mode (parallel screening
          engine); entering it hands off to the isolated MoldModeScreen.
          Gated by the staged flag, so it only appears on preview / opt-in. */}
      {isMoldModuleEnabled() && (
        <Group title="Assessment mode">
          <Row label="Mold assessment (Beta)" sub="Moisture and mold — IICRC S520" action={() => onNavigate?.('mold')} />
        </Group>
      )}

      <Group
        title="Data & Backup"
        right={!dataOk ? <ExceptionPill tone="warn" text="Issues found" /> : null}
        footer={dataFooter}
      >
        <Row
          label="Local data"
          sub={`${index.reports?.length || 0} reports · ${index.drafts?.length || 0} drafts${trashCount ? ' · ' + trashCount + ' in trash' : ''}`}
          value={storageUsed}
        />
        <Row label="Export backup" action={() => Backup.downloadBackup()} />
        <Row label="Restore from backup" action={() => document.getElementById('settings-import').click()} />
        {trashCount > 0 && <Row label="Trash" value={`${trashCount}`} action={() => onNavigate?.('trash')} />}
      </Group>
      <input id="settings-import" type="file" accept=".json" onChange={handleImport} style={{display:'none'}} aria-label="Restore from backup file" />

      {/* ── Admin (only when activated) ── */}
      {adminActive && (
        <Group title="Admin">
          <Row label="Admin dashboard" action={() => onNavigate?.('admin')} />
        </Group>
      )}

      <Group title="Help">
        <Row label="Help & FAQ" sub="Methodology, scoring, workflow, limitations" action={() => onNavigate?.('help')} />
        <Row label="Take the product tour" sub="A 60-second walkthrough" action={() => onNavigate?.('tour')} />
      </Group>

      <Group title="Legal">
        <Row label="Terms of Service" action={() => onNavigate?.('tos')} />
        <Row label="Privacy Policy" action={() => onNavigate?.('privacy')} />
      </Group>

      {/* ── About — the version row doubles as the 5-tap admin-activation
          gesture (preserved). ── */}
      <Group title="About">
        <button
          onClick={() => {
            const next = adminTaps + 1
            setAdminTaps(next)
            if (next >= 5 && !adminActive) setShowAdminInput(true)
            setTimeout(() => setAdminTaps(0), 3000)
          }}
          style={{width:'100%',padding:`12px ${INSET}px`,background:'transparent',border:'none',cursor:'default',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',minHeight:48,WebkitTapHighlightColor:'transparent'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{...V3.T.body, fontSize:15}}>AtmosFlow</div>
            <div style={{...V3.T.caption, fontWeight:400, marginTop:1}}>Prudence EHS · Gaithersburg, MD</div>
          </div>
          <span style={{...V3.T.caption, color:SUB, flexShrink:0, textAlign:'right'}}>v{VER}<br />{BUILD_SHA}</span>
        </button>
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
              aria-label="Admin secret"
              type="password"
              style={{width:'100%',padding:'12px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:16,fontFamily:'inherit',marginBottom:10,boxSizing:'border-box'}}
            />
            <button onClick={() => { if (adminCode) { onActivateAdmin?.(adminCode); setShowAdminInput(false); setAdminCode('') } }} style={{width:'100%',padding:'12px 16px',background:mix('warn', 8),border:`1px solid ${mix('warn', 19)}`,borderRadius:8,color:WARN,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Activate</button>
          </div>
        </div>
      )}
    </div>
  )
}
