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
import { VER } from '../constants/standards'
import { I } from './Icons'

const BG = '#07080C'
const SURFACE = '#0D0E14'
const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const TEXT = '#ECEEF2'
const SUB = '#8B93A5'
const DIM = '#6B7380'
const SUCCESS = '#22C55E'
const WARN = '#FBBF24'
const DANGER = '#EF4444'

export default function SettingsScreen({ profile, credits, onEditProfile, onLogout, onClose, onNavigate, onActivateAdmin, adminActive }) {
  const [health, setHealth] = useState(null)
  const [importMsg, setImportMsg] = useState('')
  const [index, setIndex] = useState({ reports: [], drafts: [] })
  const [trashCount, setTrashCount] = useState(0)
  const [adminTaps, setAdminTaps] = useState(0)
  const [showAdminInput, setShowAdminInput] = useState(false)
  const [adminCode, setAdminCode] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')

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

  // ─── Components ───
  // v2.8 UI pass — inset-grouped lists (Apple HIG), no per-row card chrome,
  // no colored icon tile on every row, no restating subtitles. Status earns
  // space by exception. "Sign out" is plain text; only "Delete account" is
  // destructive. Notion-style "Danger zone" group anchors the bottom.

  const Group = ({ title, right, children }) => (
    <div style={{marginTop:24}}>
      {(title || right) && (
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',padding:'0 4px 8px'}}>
          {title && <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px'}}>{title}</div>}
          {right}
        </div>
      )}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        {children}
      </div>
    </div>
  )

  // Plain list row. No colored icon tile by default. `value` is right-aligned
  // (system mono for technical values). `tone='danger'` paints the label red
  // for destructive Tier-3 actions. The borderTop on rows after the first is
  // the hairline divider inside the group container.
  const Row = ({ label, sub, value, action, tone, first }) => (
    <button
      onClick={action}
      disabled={!action}
      style={{
        width:'100%',padding:'14px 16px',background:'transparent',border:'none',
        borderTop: first ? 'none' : `1px solid ${BORDER}`,
        cursor: action ? 'pointer' : 'default',textAlign:'left',
        display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',minHeight:52,
      }}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:600,color: tone==='danger' ? DANGER : TEXT}}>{label}</div>
        {sub && <div style={{fontSize:11,color:DIM,marginTop:2,lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub}</div>}
      </div>
      {value && <span style={{fontSize:12,color:SUB,fontFamily:"var(--font-mono)",marginRight: action ? 6 : 0,flexShrink:0}}>{value}</span>}
      {action && <span style={{color:DIM,fontSize:13,flexShrink:0}}>›</span>}
    </button>
  )

  // Subtle exception pill. Used only when state is NOT fine.
  const ExceptionPill = ({ tone='warn', text }) => (
    <span style={{
      fontSize:10,fontWeight:600,fontFamily:"var(--font-mono)",
      color: tone==='warn' ? WARN : DANGER,
      padding:'3px 8px',borderRadius:6,
      background: tone==='warn' ? `${WARN}10` : `${DANGER}10`,
      border: `1px solid ${tone==='warn' ? WARN : DANGER}25`,
    }}>{text}</span>
  )

  const calOk = profile?.iaq_cal_status?.includes('within manufacturer')
  const pidOk = profile?.pid_cal_status?.includes('calibrated')
  const dataOk = !health || health.healthy

  return (
    <div style={{paddingTop:24,paddingBottom:120}}>
      <h2 style={{fontSize:22,fontWeight:700,marginBottom:20,color:TEXT,letterSpacing:'-0.3px',fontFamily:'inherit'}}>Settings</h2>

      {/* ── Account ── */}
      <Group title="Account">
        {profile && (
          <button onClick={onEditProfile} style={{width:'100%',padding:'16px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',minHeight:64}}>
            <div style={{width:42,height:42,borderRadius:10,background:`${ACCENT}10`,border:`1px solid ${ACCENT}18`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <I n="user" s={18} c={ACCENT} />
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:TEXT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{profile.name || 'Assessor'}</div>
              <div style={{fontSize:11,color:DIM,fontFamily:"var(--font-mono)",marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(profile.certs||[]).slice(0,3).join(' · ') || 'No certifications on file'}</div>
            </div>
            <span style={{color:DIM,fontSize:13,flexShrink:0}}>›</span>
          </button>
        )}
        <Row label="Buy Credits" sub={typeof credits === 'number' ? `${credits} available` : null} action={() => onNavigate?.('pricing')} />
        {!showPasswordChange ? (
          <Row label="Change Password" action={() => setShowPasswordChange(true)} />
        ) : (
          <div style={{padding:'14px 16px',borderTop:`1px solid ${BORDER}`}}>
            <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="New password (min 8 characters)" style={{width:'100%',padding:'10px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:8}} />
            <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Confirm new password" style={{width:'100%',padding:'10px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:8}} />
            {passwordMsg && <div style={{fontSize:11,color:passwordMsg.includes('success')?SUCCESS:DANGER,marginBottom:8}}>{passwordMsg}</div>}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{setShowPasswordChange(false);setNewPassword('');setConfirmPassword('');setPasswordMsg('')}} style={{flex:0,padding:'8px 16px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              <button onClick={async()=>{
                if (newPassword.length < 8) { setPasswordMsg('Password must be at least 8 characters'); return }
                if (newPassword !== confirmPassword) { setPasswordMsg('Passwords do not match'); return }
                try {
                  const { supabase: sb } = await import('../utils/supabaseClient')
                  if (sb) {
                    const { error } = await sb.auth.updateUser({ password: newPassword })
                    if (error) setPasswordMsg(error.message)
                    else { setPasswordMsg('Password updated successfully'); setNewPassword(''); setConfirmPassword(''); setTimeout(()=>{setShowPasswordChange(false);setPasswordMsg('')},2000) }
                  }
                } catch { setPasswordMsg('Failed to update password') }
              }} style={{flex:1,padding:'8px 16px',background:ACCENT,border:'none',borderRadius:8,color:BG,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Update Password</button>
            </div>
          </div>
        )}
      </Group>

      {/* ── Instruments ──
          IAQ/PID/Add rows route to the standalone instrument editor
          (view='instrument-edit') so users land directly on the
          calibration form instead of the multi-profile picker.
          "Edit credentials & instruments" still routes to the full
          profile flow because the label promises both surfaces. */}
      {(profile?.iaq_meter || profile?.pid_meter) && (
        <Group title="Instruments">
          {profile?.iaq_meter && (
            <Row
              first
              label={profile.iaq_meter}
              sub={profile.iaq_serial ? `S/N ${profile.iaq_serial}${profile.iaq_cal_date ? ' · last cal ' + profile.iaq_cal_date : ''}` : (profile.iaq_cal_date ? `Last cal ${profile.iaq_cal_date}` : null)}
              value={!calOk ? <ExceptionPill text="Cal due" /> : null}
              action={() => onNavigate?.('instrument-edit')}
            />
          )}
          {profile?.pid_meter && (
            <Row
              first={!profile?.iaq_meter}
              label={profile.pid_meter}
              sub="PID / VOC meter"
              value={!pidOk ? <ExceptionPill text="Cal due" /> : null}
              action={() => onNavigate?.('instrument-edit')}
            />
          )}
          <Row label="Edit instruments" action={() => onNavigate?.('instrument-edit')} />
        </Group>
      )}
      {!profile?.iaq_meter && !profile?.pid_meter && (
        <Group title="Instruments">
          <Row label="Add an instrument" sub="Register your IAQ meter and PID for calibration tracking" action={() => onNavigate?.('instrument-edit')} first />
        </Group>
      )}

      {/* ── Methodology ── */}
      <Group title="Methodology">
        <div style={{padding:'14px 16px'}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
            {['ASHRAE 62.1-2025','ASHRAE 55-2023','OSHA PELs','NIOSH RELs','EPA NAAQS','WHO AQG'].map(s => (
              <span key={s} style={{padding:'4px 8px',borderRadius:4,background:`${ACCENT}08`,border:`1px solid ${ACCENT}12`,fontSize:9,fontWeight:600,color:ACCENT,fontFamily:"var(--font-mono)",letterSpacing:'0.2px'}}>{s}</span>
            ))}
          </div>
          <details>
            <summary style={{fontSize:10,fontWeight:600,color:DIM,cursor:'pointer',listStyle:'none',display:'flex',alignItems:'center',gap:4}}>
              <span style={{fontSize:8}}>▶</span> Data center standards
            </summary>
            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
              {['ANSI/ISA 71.04-2013','ISO 14644-1:2015','ASHRAE TC 9.9','IEEE 1635','NFPA 855'].map(s => (
                <span key={s} style={{padding:'4px 8px',borderRadius:4,background:`${DIM}10`,border:`1px solid ${DIM}20`,fontSize:9,fontWeight:600,color:DIM,fontFamily:"var(--font-mono)",letterSpacing:'0.2px'}}>{s}</span>
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
      {importMsg && <div style={{padding:'8px 14px',background:`${ACCENT}08`,border:`1px solid ${ACCENT}18`,borderRadius:8,marginTop:8,fontSize:11,color:ACCENT}}>{importMsg}</div>}
      {!dataOk && health?.issues?.length > 0 && (
        <div style={{marginTop:8,padding:'10px 14px',background:`${WARN}08`,border:`1px solid ${WARN}25`,borderRadius:8}}>
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
            <div style={{fontSize:11,color:DIM,marginTop:2}}>Prudence Safety &amp; Environmental Consulting · Germantown, MD</div>
          </div>
          <span style={{fontSize:10,color:DIM,fontFamily:"var(--font-mono)",padding:'3px 8px',borderRadius:6,background:SURFACE,border:`1px solid ${BORDER}`,flexShrink:0}}>v{VER}</span>
        </button>
        <div style={{padding:'14px 16px',borderTop:`1px solid ${BORDER}`}}>
          <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:6}}>What is a credit?</div>
          <div style={{fontSize:12,color:SUB,lineHeight:1.55}}>One credit covers a single building assessment, regardless of zone count, and one finalized report. AI-generated narrative requests draw separately at 3 credits per request.</div>
        </div>
      </Group>
      {showAdminInput && (
        <div style={{padding:'14px 16px',background:CARD,border:`1px solid ${WARN}25`,borderRadius:10,marginTop:8}}>
          <div style={{fontSize:12,fontWeight:600,color:WARN,marginBottom:8}}>Admin Access</div>
          <div style={{display:'flex',gap:8}}>
            <input value={adminCode} onChange={e=>setAdminCode(e.target.value)} placeholder="Enter admin secret" type="password" style={{flex:1,padding:'10px 14px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,fontFamily:'inherit',outline:'none'}} />
            <button onClick={() => { if (adminCode) { onActivateAdmin?.(adminCode); setShowAdminInput(false); setAdminCode('') } }} style={{padding:'10px 16px',background:`${WARN}15`,border:`1px solid ${WARN}30`,borderRadius:8,color:WARN,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Activate</button>
          </div>
        </div>
      )}

      {/* ── Danger Zone — Notion-style, deliberately isolated, bottom of screen.
          Sign out is plain (terminal but not destructive); Delete is red. ── */}
      <Group title="Danger zone">
        <Row first label="Sign out" action={onLogout} />
        {!deleteConfirm ? (
          <Row label="Delete account" tone="danger" action={() => setDeleteConfirm(true)} />
        ) : (
          <div style={{padding:'14px 16px',borderTop:`1px solid ${BORDER}`,background:`${DANGER}06`}}>
            <div style={{fontSize:13,fontWeight:600,color:DANGER,marginBottom:6}}>Permanently delete your account?</div>
            <div style={{fontSize:11,color:SUB,marginBottom:12,lineHeight:1.5}}>This removes all assessments, reports, credits, and profile data. This cannot be undone.</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={() => setDeleteConfirm(false)} style={{flex:1,padding:'10px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              <button onClick={async () => {
                try {
                  const session = await (await import('../utils/cloudStorage')).default.getSession()
                  if (session?.access_token) {
                    await fetch('/api/delete-account', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` } })
                  }
                } catch {}
                onLogout()
              }} style={{flex:1,padding:'10px',background:`${DANGER}15`,border:`1px solid ${DANGER}30`,borderRadius:8,color:DANGER,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Delete everything</button>
            </div>
          </div>
        )}
      </Group>
    </div>
  )
}
