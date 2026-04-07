/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SettingsScreen — profile, account, data management
 */

import { useState, useEffect } from 'react'
import Backup from '../utils/backup'
import { VER } from '../constants/standards'
import { I } from './Icons'

const BG = '#060609'
const CARD = '#101018'
const BORDER = '#1E1E2E'
const ACCENT = '#22D3EE'
const TEXT = '#F0F2F5'
const SUB = '#9BA4B5'
const DIM = '#6B7280'

export default function SettingsScreen({ profile, onEditProfile, onLogout, onClose, onNavigate }) {
  const [health, setHealth] = useState(null)
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => { Backup.checkHealth().then(setHealth) }, [])

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const result = await Backup.importBackup(json)
      setImportMsg(`Imported ${result.reports} reports, ${result.drafts} drafts`)
    } catch (err) {
      setImportMsg(`Import failed: ${err.message}`)
    }
    e.target.value = ''
  }

  const row = (icon, label, sub, action, color) => (
    <button onClick={action} style={{width:'100%',padding:'16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,fontFamily:'inherit',minHeight:56,marginBottom:8}}>
      <div style={{width:40,height:40,borderRadius:10,background:`${color||ACCENT}12`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <I n={icon} s={20} c={color||ACCENT} />
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:15,fontWeight:600,color:TEXT}}>{label}</div>
        {sub && <div style={{fontSize:12,color:DIM,marginTop:2}}>{sub}</div>}
      </div>
      <div style={{fontSize:16,color:DIM}}>→</div>
    </button>
  )

  return (
    <div style={{paddingTop:28,paddingBottom:100}}>
      <h2 style={{fontSize:22,fontWeight:700,marginBottom:24,color:TEXT}}>Settings</h2>

      {/* Profile */}
      <div style={{fontSize:12,fontWeight:600,color:SUB,textTransform:'uppercase',letterSpacing:1.5,marginBottom:10}}>Profile</div>
      {profile && (
        <div style={{padding:'18px 20px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,marginBottom:8,display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:48,height:48,borderRadius:14,background:`${ACCENT}12`,border:`1px solid ${ACCENT}25`,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <I n="user" s={22} c={ACCENT} />
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:TEXT}}>{profile.name||'User'}</div>
            <div style={{fontSize:12,color:DIM,fontFamily:"'DM Mono'",marginTop:3}}>{(profile.certs||[]).join(' · ')||'No certifications'}</div>
          </div>
        </div>
      )}
      {row('clip', 'Edit Profile', 'Name, certifications, instruments', onEditProfile)}

      {/* Data */}
      <div style={{fontSize:12,fontWeight:600,color:SUB,textTransform:'uppercase',letterSpacing:1.5,marginBottom:10,marginTop:24}}>Data</div>
      {row('download', 'Export Backup', 'Download all data as JSON', () => Backup.downloadBackup())}
      <label style={{display:'block',marginBottom:8}}>
        {row('refresh', 'Import Backup', 'Restore from a backup file', () => document.getElementById('import-input').click())}
        <input id="import-input" type="file" accept=".json" onChange={handleImport} style={{display:'none'}} />
      </label>
      {importMsg && <div style={{padding:'10px 14px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}25`,borderRadius:10,marginBottom:8,fontSize:13,color:ACCENT}}>{importMsg}</div>}

      {/* Health */}
      {health && (
        <div style={{padding:'14px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,marginBottom:8}}>
          <div style={{fontSize:14,fontWeight:600,color:health.healthy?'#22C55E':'#FBBF24',marginBottom:6}}>
            {health.healthy ? '✓ Storage Healthy' : '⚠ Issues Detected'}
          </div>
          {health.issues.map((issue, i) => (
            <div key={i} style={{fontSize:12,color:issue.level==='critical'?'#EF4444':'#FBBF24',marginBottom:3}}>{issue.msg}</div>
          ))}
          {health.healthy && <div style={{fontSize:12,color:DIM}}>No integrity issues found</div>}
        </div>
      )}

      {/* Account */}
      <div style={{fontSize:12,fontWeight:600,color:SUB,textTransform:'uppercase',letterSpacing:1.5,marginBottom:10,marginTop:24}}>Account</div>
      {row('user', 'Sign Out', 'Switch profile or sign out', onLogout, '#EF4444')}

      {/* Legal */}
      <div style={{fontSize:12,fontWeight:600,color:SUB,textTransform:'uppercase',letterSpacing:1.5,marginBottom:10,marginTop:24}}>Legal</div>
      {row('clip', 'Terms of Service', 'Usage terms and disclaimers', () => onNavigate?.('tos'))}
      {row('clip', 'Privacy Policy', 'How we handle your data', () => onNavigate?.('privacy'))}

      {/* About */}
      <div style={{fontSize:12,fontWeight:600,color:SUB,textTransform:'uppercase',letterSpacing:1.5,marginBottom:10,marginTop:24}}>About</div>
      <div style={{padding:'18px 20px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:14}}>
        <div style={{fontSize:16,fontWeight:700,color:TEXT,marginBottom:6}}>atmos<span style={{color:ACCENT}}>IQ</span> <span style={{fontSize:12,color:DIM,fontFamily:"'DM Mono'"}}>v{VER}</span></div>
        <div style={{fontSize:13,color:SUB,lineHeight:1.6}}>Indoor Air Quality Intelligence Platform</div>
        <div style={{fontSize:12,color:DIM,marginTop:8}}>Prudence Safety & Environmental Consulting, LLC</div>
        <div style={{fontSize:11,color:DIM,marginTop:2}}>© 2026 All rights reserved</div>
      </div>
    </div>
  )
}
