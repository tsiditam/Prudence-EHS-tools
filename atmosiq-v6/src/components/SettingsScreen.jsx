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
const DIM = '#565D6E'
const SUCCESS = '#22C55E'
const WARN = '#FBBF24'
const DANGER = '#EF4444'

export default function SettingsScreen({ profile, onEditProfile, onLogout, onClose, onNavigate }) {
  const [health, setHealth] = useState(null)
  const [importMsg, setImportMsg] = useState('')
  const [index, setIndex] = useState({ reports: [], drafts: [] })
  const [trashCount, setTrashCount] = useState(0)

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

  const Section = ({ title }) => (
    <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:10,marginTop:28,paddingBottom:8,borderBottom:`1px solid ${BORDER}`}}>{title}</div>
  )

  const Row = ({ icon, label, sub, action, color, right }) => (
    <button onClick={action} style={{width:'100%',padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,cursor:action?'pointer':'default',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit',minHeight:52,marginBottom:6,transition:'border-color 0.15s'}}>
      <div style={{width:36,height:36,borderRadius:9,background:`${color||ACCENT}10`,border:`1px solid ${color||ACCENT}15`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <I n={icon} s={17} c={color||ACCENT} w={1.8} />
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:600,color:TEXT}}>{label}</div>
        {sub && <div style={{fontSize:11,color:DIM,marginTop:1,lineHeight:1.4}}>{sub}</div>}
      </div>
      {right || (action && <span style={{fontSize:13,color:DIM}}>→</span>)}
    </button>
  )

  const StatusDot = ({ ok }) => (
    <div style={{width:7,height:7,borderRadius:'50%',background:ok?SUCCESS:WARN,flexShrink:0}} />
  )

  return (
    <div style={{paddingTop:24,paddingBottom:100}}>
      <h2 style={{fontSize:20,fontWeight:700,marginBottom:4,color:TEXT,letterSpacing:'-0.3px'}}>Settings</h2>
      <div style={{fontSize:11,color:DIM,marginBottom:20}}>Assessment configuration and data management</div>

      {/* ═══ ASSESSOR PROFILE ═══ */}
      <Section title="Assessor Profile" />

      {profile && (
        <div style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6,display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:42,height:42,borderRadius:10,background:`${ACCENT}10`,border:`1px solid ${ACCENT}18`,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <I n="user" s={18} c={ACCENT} />
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:700,color:TEXT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{profile.name||'Assessor'}</div>
            <div style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'",marginTop:2}}>{(profile.certs||[]).slice(0,4).join(' · ')||'No certifications on file'}</div>
          </div>
          <button onClick={onEditProfile} style={{padding:'6px 12px',borderRadius:6,background:'transparent',border:`1px solid ${BORDER}`,color:SUB,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'border-color 0.15s'}}>Edit</button>
        </div>
      )}

      {profile?.iaq_meter && (
        <div style={{padding:'12px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:12,fontWeight:600,color:SUB}}>Primary instrument</div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <StatusDot ok={profile.iaq_cal_status?.includes('within manufacturer')} />
              <span style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'"}}>{profile.iaq_cal_status?.includes('within manufacturer') ? 'Calibrated' : 'Check cal.'}</span>
            </div>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:TEXT,marginTop:4}}>{profile.iaq_meter}</div>
          {profile.iaq_serial && <div style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'",marginTop:2}}>S/N {profile.iaq_serial}</div>}
          {profile.iaq_cal_date && <div style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'",marginTop:1}}>Last calibrated: {profile.iaq_cal_date}</div>}
        </div>
      )}

      {profile?.pid_meter && (
        <div style={{padding:'12px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:12,fontWeight:600,color:SUB}}>PID / VOC meter</div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <StatusDot ok={profile.pid_cal_status?.includes('calibrated')} />
              <span style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'"}}>{profile.pid_cal_status || '—'}</span>
            </div>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:TEXT,marginTop:4}}>{profile.pid_meter}</div>
        </div>
      )}

      <Row icon="clip" label="Edit Credentials & Instruments" sub="Update certifications, meters, and calibration status" action={onEditProfile} />

      {/* ═══ REPORTS & METHODOLOGY ═══ */}
      <Section title="Reports & Methodology" />

      <div style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6}}>
        <div style={{fontSize:12,fontWeight:600,color:SUB,marginBottom:8}}>Active standards</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {['ASHRAE 62.1-2025','ASHRAE 55-2023','OSHA PELs','EPA NAAQS','WHO AQG'].map(s => (
            <span key={s} style={{padding:'4px 8px',borderRadius:4,background:`${ACCENT}08`,border:`1px solid ${ACCENT}12`,fontSize:9,fontWeight:600,color:ACCENT,fontFamily:"'DM Mono'",letterSpacing:'0.2px'}}>{s}</span>
          ))}
        </div>
        <div style={{fontSize:10,color:DIM,marginTop:8,lineHeight:1.5}}>Scoring applies deterministic rules against published thresholds. Standards update with each app release.</div>
      </div>

      <div style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6}}>
        <div style={{fontSize:12,fontWeight:600,color:SUB,marginBottom:6}}>Scoring methodology</div>
        <div style={{fontSize:11,color:DIM,lineHeight:1.6}}>
          Composite = (zone avg × 0.6) + (worst zone × 0.4). Categories: Ventilation (25), Contaminants (25), HVAC (20), Complaints (15), Environment (15). All thresholds are fixed and published — no AI judgment in scoring.
        </div>
      </div>

      <div style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <div style={{fontSize:12,fontWeight:600,color:SUB}}>Report defaults</div>
        </div>
        <div style={{fontSize:11,color:DIM,lineHeight:1.6}}>
          Reports include cover page, executive summary, zone findings, causal chains, sampling plan, and recommendations register. Assessor name and instrument details are auto-populated from your profile.
        </div>
      </div>

      {/* ═══ DATA & BACKUP ═══ */}
      <Section title="Data & Backup" />

      {/* Data Summary */}
      <div style={{padding:'14px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:600,color:SUB}}>Local data</div>
          {health && (
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <StatusDot ok={health.healthy} />
              <span style={{fontSize:10,color:health.healthy?SUCCESS:WARN,fontFamily:"'DM Mono'",fontWeight:600}}>{health.healthy ? 'Healthy' : 'Issues found'}</span>
            </div>
          )}
        </div>
        <div style={{display:'flex',gap:16,fontSize:11,color:DIM,fontFamily:"'DM Mono'"}}>
          <span>{index.reports?.length || 0} reports</span>
          <span>{index.drafts?.length || 0} drafts</span>
          {trashCount > 0 && <span>{trashCount} in trash</span>}
          <span>{storageUsed} used</span>
        </div>
        {health && !health.healthy && (
          <div style={{marginTop:8}}>
            {health.issues.map((issue, i) => (
              <div key={i} style={{fontSize:10,color:issue.level==='critical'?DANGER:WARN,marginBottom:2}}>{issue.msg}</div>
            ))}
          </div>
        )}
      </div>

      <Row icon="download" label="Export Backup" sub="Download all assessments, drafts, and profile as JSON" action={() => Backup.downloadBackup()} />

      <label style={{display:'block',marginBottom:6}}>
        <Row icon="refresh" label="Restore from Backup" sub="Import a previously exported JSON backup file" action={() => document.getElementById('settings-import').click()} />
        <input id="settings-import" type="file" accept=".json" onChange={handleImport} style={{display:'none'}} />
      </label>
      {importMsg && <div style={{padding:'8px 14px',background:`${ACCENT}08`,border:`1px solid ${ACCENT}18`,borderRadius:8,marginBottom:6,fontSize:11,color:ACCENT}}>{importMsg}</div>}

      {/* ═══ ACCOUNT ═══ */}
      <Section title="Account" />

      <Row icon="user" label="Sign Out" sub="Switch assessor profile" action={onLogout} color={DANGER} />

      {/* ═══ LEGAL & SUPPORT ═══ */}
      <Section title="Legal" />

      <Row icon="clip" label="Terms of Service" sub="Usage terms, disclaimers, and IP" action={() => onNavigate?.('tos')} color={DIM} />
      <Row icon="clip" label="Privacy Policy" sub="Data handling and analytics disclosure" action={() => onNavigate?.('privacy')} color={DIM} />

      {/* ═══ ABOUT ═══ */}
      <Section title="About atmosIQ" />

      <div style={{padding:'16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{fontSize:15,fontWeight:700,color:TEXT}}>atmos<span style={{color:ACCENT}}>IQ</span></div>
          <span style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'",padding:'2px 8px',borderRadius:4,background:SURFACE,border:`1px solid ${BORDER}`}}>v{VER}</span>
        </div>
        <div style={{fontSize:12,color:SUB,lineHeight:1.6,marginBottom:10}}>Standards-driven indoor air quality assessment platform for industrial hygienists and EHS professionals.</div>
        <div style={{display:'flex',flexDirection:'column',gap:2,fontSize:10,color:DIM,fontFamily:"'DM Mono'"}}>
          <span>Prudence Safety & Environmental Consulting, LLC</span>
          <span>Germantown, MD · © 2026</span>
          <span>Scoring: deterministic · Standards: ASHRAE / OSHA / EPA / WHO</span>
        </div>
      </div>
    </div>
  )
}
