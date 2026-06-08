/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ProfileScreen — assessor profile and instrument configuration
 */

import { useState, useEffect } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import Profiles from '../utils/profiles'
import { trackEvent } from '../utils/supabaseClient'
import { I } from './Icons'
import ProfileAvatar from './ProfileAvatar'
import { mix } from '../utils/theme'

// ─── Design Tokens (aligned with MobileApp) ───
const BG = 'var(--bg)'
const SURFACE = 'var(--surface)'
const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const ON_ACCENT = 'var(--on-accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const DANGER = 'var(--danger)'

const CERT_OPTS = ['CIH','CIH-in-Training','CSP','CHMM','ACAC CIEC','ACAC CMC','ACAC CMI','Other']
const EXP_OPTS = ['1–3 years','3–5 years','5–10 years','10–20 years','20+ years']
// Instrument-related option lists are exported so the standalone
// InstrumentEditView in MobileApp can reuse them without drift.
export const IAQ_OPTS = ['TSI Q-Trak 7575','TSI Q-Trak 7515','TSI IAQ-Calc 7545','Graywolf AdvancedSense Pro','Graywolf IQ-610','Testo 400','Testo 440','Kanomax IAQ-2000','Other']
export const PID_OPTS = ['RAE Systems MiniRAE 3000','RAE Systems ppbRAE 3000','Ion Science Tiger','Ion Science Cub','Honeywell ToxiRAE Pro PID','Other']
export const CAL_OPTS = ['Calibrated within manufacturer spec','Calibrated, overdue for recertification','Field-zeroed only','Not calibrated','Unknown']
export const PID_CAL_OPTS = ['Bump-tested and calibrated','Bump-tested only','Not calibrated','N/A']

const inp = { width:'100%',padding:'14px 16px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:15,fontFamily:'inherit',fontWeight:500,outline:'none',boxSizing:'border-box',transition:'border-color 0.15s' }
const label = { fontSize:13,fontWeight:600,color:SUB,marginBottom:6,display:'block',letterSpacing:'0.1px' }

function SectionLabel({ children }) {
  return <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12,marginTop:28,paddingBottom:8,borderBottom:`1px solid ${BORDER}`}}>{children}</div>
}

function Chip({ selected, label: text, onClick }) {
  return (
    <button onClick={onClick} style={{padding:'8px 14px',borderRadius:6,background:selected?`${mix('accent', 7)}`:'transparent',border:`1px solid ${selected?ACCENT:BORDER}`,color:selected?ACCENT:SUB,fontSize:12,fontWeight:selected?600:500,cursor:'pointer',fontFamily:'inherit',minHeight:36,transition:'all 0.15s'}}>
      {selected && <span style={{marginRight:4}}>✓</span>}{text}
    </button>
  )
}

function RadioOption({ selected, label: text, onClick, compact }) {
  return (
    <button onClick={onClick} style={{width:'100%',padding:compact?'10px 14px':'12px 16px',textAlign:'left',background:selected?`${mix('accent', 3)}`:'transparent',border:`1px solid ${selected?`${mix('accent', 19)}`:BORDER}`,borderRadius:8,color:selected?TEXT:SUB,fontSize:compact?13:14,fontWeight:selected?600:500,cursor:'pointer',fontFamily:'inherit',minHeight:compact?38:44,transition:'all 0.15s',marginBottom:4}}>
      {text}
    </button>
  )
}

/**
 * Compact image-upload control for report-branding assets.
 *
 *   <ImageUpload
 *     label="Firm logo"  hint="Appears on the report cover"
 *     dataUrl={form.firm_logo_dataurl}
 *     onPick={(dataUrl) => setF('firm_logo_dataurl', dataUrl)}
 *     onClear={() => setF('firm_logo_dataurl', '')}
 *     maxDim={512}
 *   />
 *
 * Renders a dashed-border tile with a preview thumbnail (when set)
 * or a "+ Upload" prompt (when empty). Files are compressed to a
 * JPEG data URL with the bounding box defined by `maxDim` before
 * being passed to onPick — keeps localStorage / profile-record
 * size under control. Same canvas-resize pattern used by
 * ProfileAvatar.
 */
function ImageUpload({ label, hint, dataUrl, onPick, onClear, maxDim = 256, accept = 'image/jpeg,image/png,image/webp' }) {
  const ref = useState(null)[0]
  const inputRef = ref || { current: null }
  const handlePick = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (e.target) e.target.value = ''
    if (!file) return
    try {
      const compressed = await compressToDataUrl(file, maxDim)
      onPick?.(compressed)
    } catch {
      // Silent on decode failure — user can retry.
    }
  }
  const open = () => {
    const el = document.getElementById(`image-upload-${label.replace(/\s+/g, '-').toLowerCase()}`)
    if (el && el.click) el.click()
  }
  const inputId = `image-upload-${label.replace(/\s+/g, '-').toLowerCase()}`
  const has = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')
  return (
    <div style={{
      flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: DIM, letterSpacing: '0.2px' }}>
        {label} <span style={{ color: DIM, fontWeight: 400 }}>· {hint}</span>
      </div>
      <button
        type="button"
        onClick={open}
        style={{
          height: 110, padding: 8, background: 'transparent',
          border: `1.5px dashed ${has ? ACCENT : BORDER}`,
          borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
        }}
      >
        {has ? (
          <img src={dataUrl} alt={`${label} preview`}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: 13, color: SUB, fontWeight: 600 }}>+ Upload</span>
        )}
      </button>
      {has && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onClear?.() }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: DIM, fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
            padding: '2px 0', alignSelf: 'flex-end',
          }}>
          Remove
        </button>
      )}
      <input
        id={inputId}
        type="file"
        accept={accept}
        onChange={handlePick}
        style={{ display: 'none' }}
      />
    </div>
  )
}

/**
 * Read a File and produce a JPEG data URL clamped to maxDim × maxDim
 * (preserving aspect ratio). Used to keep the firm logo / PE seal
 * small enough to round-trip through localStorage without bloating
 * the profile record.
 */
function compressToDataUrl(file, maxDim) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * ratio))
        const h = Math.max(1, Math.round(img.height * ratio))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error('canvas')); return }
        // White background so transparent PNGs (most logos) don't
        // render as black blocks when re-encoded to JPEG.
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        const out = canvas.toDataURL('image/jpeg', 0.9)
        URL.revokeObjectURL(objectUrl)
        resolve(out)
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image_load_failed')) }
    img.src = objectUrl
  })
}

export default function ProfileScreen({ onLogin }) {
  const { isTablet, isTabletLand } = useMediaQuery()
  const maxW = isTabletLand ? 720 : isTablet ? 640 : 480
  const [profiles, setProfiles] = useState([])
  const [mode, setMode] = useState('select')
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({})
  const [step, setStep] = useState(0)

  useEffect(() => { loadProfiles() }, [])

  const loadProfiles = async () => {
    const all = await Profiles.getAll()
    setProfiles(all)
    if (all.length === 0) { setMode('create'); setForm({}); setStep(0) }
  }

  const handleSave = async () => {
    const id = editId || 'profile-' + Date.now()
    await Profiles.save({ ...form, id })
    await Profiles.setActive(id)
    const profile = await Profiles.get(id)
    trackEvent(editId ? 'profile_updated' : 'profile_created', {
      has_certs: (form.certs||[]).length > 0,
      cert_count: (form.certs||[]).length,
      has_experience: !!form.experience,
      has_firm: !!form.firm,
      has_iaq_meter: !!form.iaq_meter,
      has_pid_meter: !!form.pid_meter,
    })
    if (form.iaq_cal_date || form.iaq_cal_status) {
      trackEvent('calibration_date_entered', { instrument: 'iaq', meter: form.iaq_meter || '', status: form.iaq_cal_status || '' })
    }
    if (form.pid_cal_status) {
      trackEvent('calibration_date_entered', { instrument: 'pid', meter: form.pid_meter || '', status: form.pid_cal_status || '' })
    }
    onLogin(profile)
  }

  const handleSelect = async (profile) => {
    await Profiles.setActive(profile.id)
    onLogin(profile)
  }

  const handleEdit = (profile) => {
    setForm(profile)
    setEditId(profile.id)
    setStep(0)
    setMode('edit')
  }

  const handleDelete = async (id) => {
    await Profiles.delete(id)
    await loadProfiles()
  }

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // ── Profile Select ──
  if (mode === 'select' && profiles.length > 0) {
    return (
      <div style={{minHeight:'100vh',background:BG,color:TEXT,fontFamily:"'inherit', system-ui",padding:'0 20px',paddingTop:'env(safe-area-inset-top, 20px)'}}>
        <div style={{maxWidth:maxW,margin:'0 auto',paddingTop:48,paddingBottom:100}}>
          <div style={{marginBottom:32}}>
            <div style={{fontSize:22,fontWeight:700,letterSpacing:'-0.3px',marginBottom:4}}>AtmosFlow</div>
            <div style={{fontSize:13,color:SUB}}>Select assessor profile</div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {profiles.map(p => (
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:10}}>
                <button onClick={() => handleSelect(p)} style={{flex:1,padding:'16px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,fontFamily:'inherit',transition:'border-color 0.15s'}}>
                  <div style={{width:40,height:40,borderRadius:10,background:`${mix('accent', 6)}`,border:`1px solid ${mix('accent', 9)}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <I n="user" s={18} c={ACCENT} />
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:600,color:TEXT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name || 'Unnamed'}</div>
                    <div style={{fontSize:11,color:DIM,marginTop:2,fontFamily:"var(--font-mono)"}}>{(p.certs||[]).slice(0,3).join(' · ') || 'No certifications'}</div>
                  </div>
                </button>
                <button onClick={() => handleEdit(p)} style={{width:40,height:40,borderRadius:8,background:'transparent',border:`1px solid ${BORDER}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'border-color 0.15s'}}>
                  <I n="clip" s={14} c={DIM} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={() => { setMode('create'); setForm({}); setEditId(null); setStep(0) }} style={{width:'100%',padding:'14px 0',marginTop:16,background:'transparent',border:`1px dashed ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:44,transition:'color 0.15s'}}>+ New profile</button>
        </div>
      </div>
    )
  }

  // ── Create / Edit ──
  return (
    <div style={{minHeight:'100vh',background:BG,color:TEXT,fontFamily:"'inherit', system-ui",padding:'0 20px',paddingTop:'env(safe-area-inset-top, 20px)'}}>
      <div style={{maxWidth:maxW,margin:'0 auto',paddingTop:32,paddingBottom:100}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:'-0.3px'}}>
              {editId ? 'Edit Profile' : 'Assessor Setup'}
            </div>
            <div style={{fontSize:12,color:DIM,marginTop:3}}>
              {step === 0 ? 'Credentials and experience' : 'Instrumentation'}
            </div>
          </div>
          {profiles.length > 0 && (
            <button onClick={() => setMode('select')} style={{padding:'8px 16px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:13,cursor:'pointer',fontFamily:'inherit',minHeight:36,transition:'color 0.15s'}}>Cancel</button>
          )}
        </div>

        {/* Step Indicator */}
        <div style={{display:'flex',gap:6,marginBottom:28}}>
          {['Credentials','Instruments'].map((s,i) => (
            <button key={s} onClick={() => setStep(i)} style={{flex:1,padding:'8px 0',borderRadius:6,border:'none',background:step===i?`${mix('accent', 7)}`:'transparent',color:step===i?ACCENT:DIM,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:34,transition:'all 0.15s',borderBottom:step===i?`2px solid ${ACCENT}`:`2px solid transparent`}}>
              <span style={{fontSize:10,fontWeight:700,marginRight:6,opacity:0.5}}>{i+1}</span>{s}
            </button>
          ))}
        </div>

        {/* ── Step 1: Credentials ── */}
        {step === 0 && <div style={{animation:'fadeUp .25s ease'}}>

          {/* Profile photo. Large circular avatar at the top of the
              edit form with a camera badge — tapping either the
              avatar or the badge opens the file picker. The picker
              compresses to a 256×256 JPEG before persisting so
              localStorage doesn't bloat. A small "Remove photo"
              link appears once a photo is set so the user can
              roll back to initials. */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,marginBottom:24,paddingTop:4}}>
            <ProfileAvatar
              profile={form}
              size={96}
              editable
              onPickPhoto={(dataUrl) => setF('avatar_url', dataUrl)}
            />
            {form.avatar_url ? (
              <button
                type="button"
                onClick={() => setF('avatar_url', '')}
                style={{background:'none',border:'none',color:DIM,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',padding:'4px 8px'}}>
                Remove photo
              </button>
            ) : (
              <div style={{fontSize:11,color:DIM,textAlign:'center'}}>Tap to add a profile photo</div>
            )}
          </div>

          <div style={{marginBottom:20}}>
            <span style={label}>Full name and credentials <span style={{color:ACCENT}}>*</span></span>
            <input type="text" value={form.name||''} onChange={e=>setF('name',e.target.value)} placeholder="J. Smith, CIH, CSP" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
            <div style={{fontSize:10,color:DIM,marginTop:4}}>Appears on all generated reports</div>
          </div>

          <SectionLabel>Certifications</SectionLabel>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
            {CERT_OPTS.map(c => {
              const sel = (form.certs||[]).includes(c)
              return <Chip key={c} selected={sel} label={c} onClick={() => setF('certs', sel ? (form.certs||[]).filter(x=>x!==c) : [...(form.certs||[]),c])} />
            })}
          </div>

          <SectionLabel>Experience</SectionLabel>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
            {EXP_OPTS.map(o => {
              const sel = form.experience===o
              return <Chip key={o} selected={sel} label={o} onClick={() => setF('experience',o)} />
            })}
          </div>

          <SectionLabel>Organization</SectionLabel>
          <div style={{marginBottom:12}}>
            <span style={label}>Firm / company <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></span>
            <input type="text" value={form.firm||''} onChange={e=>setF('firm',e.target.value)} placeholder="e.g. Prudence EHS, or Independent" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
          </div>
          <div style={{marginBottom:12}}>
            <span style={label}>Firm address <span style={{color:DIM,fontWeight:400,fontSize:11}}>(appears on reports)</span></span>
            <input type="text" value={form.firm_address||''} onChange={e=>setF('firm_address',e.target.value)} placeholder="e.g. Germantown, Maryland" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
          </div>
          <div style={{marginBottom:20}}>
            <span style={label}>Firm phone <span style={{color:DIM,fontWeight:400,fontSize:11}}>(appears on reports)</span></span>
            <input type="text" value={form.firm_phone||''} onChange={e=>setF('firm_phone',e.target.value)} placeholder="e.g. (301) 541-8362" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
          </div>

          <div style={{marginBottom:20}}>
            <span style={label}>Firm license / certifications <span style={{color:DIM,fontWeight:400,fontSize:11}}>(appears on report cover)</span></span>
            <input type="text" value={form.firm_license||''} onChange={e=>setF('firm_license',e.target.value)} placeholder="e.g. WV IH Lic #12345 · MD IAQ #6789" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
          </div>

          {/* Branding assets — firm logo + PE / CIH seal. Both are
              compressed to small JPEG data URLs (≤256×256) before
              storage so they fit comfortably in the profile record.
              When set, the DOCX cover renders the logo above the
              firm wordmark and the seal as a small credential mark
              above the confidential footer. */}
          <SectionLabel>Report branding</SectionLabel>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <ImageUpload
              label="Firm logo"
              hint="Appears on the report cover"
              dataUrl={form.firm_logo_dataurl}
              onPick={(dataUrl) => setF('firm_logo_dataurl', dataUrl)}
              onClear={() => setF('firm_logo_dataurl', '')}
              maxDim={512}
            />
            <ImageUpload
              label="PE / CIH seal"
              hint="Optional credential mark"
              dataUrl={form.pe_seal_dataurl}
              onPick={(dataUrl) => setF('pe_seal_dataurl', dataUrl)}
              onClear={() => setF('pe_seal_dataurl', '')}
              maxDim={256}
            />
          </div>

          <button onClick={()=>setF('marketing_consent',!form.marketing_consent)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'transparent',border:`1px solid ${form.marketing_consent?`${mix('accent', 19)}`:BORDER}`,borderRadius:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit',marginBottom:14,width:'100%',transition:'border-color 0.15s'}}>
            <div style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${form.marketing_consent?ACCENT:DIM}`,background:form.marketing_consent?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>{form.marketing_consent&&<span style={{color:ON_ACCENT,fontSize:11,fontWeight:700}}>✓</span>}</div>
            <div style={{fontSize:12,color:SUB,lineHeight:1.5}}>Receive product updates and IH field tips</div>
          </button>

          {/* Email preferences — habit-loop PR 1 + PR 2. Default-on
              for new profiles; toggles flip the JSONB field on
              profiles (migration 019). Each cron reads its own flag
              before scheduling / sending. */}
          {(() => {
            const prefs = form.email_preferences || {}
            const reassessOn = prefs.reassessment_reminders !== false
            const calOn = prefs.calibration_expiry !== false
            const digestOn = prefs.portfolio_digest !== false
            const samplingOn = prefs.sampling_results_outstanding !== false
            return (
              <>
                <button
                  onClick={() => setF('email_preferences', { ...prefs, reassessment_reminders: !reassessOn })}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'transparent',border:`1px solid ${reassessOn?`${mix('accent', 19)}`:BORDER}`,borderRadius:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit',marginBottom:10,width:'100%',transition:'border-color 0.15s'}}
                >
                  <div style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${reassessOn?ACCENT:DIM}`,background:reassessOn?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>
                    {reassessOn&&<span style={{color:ON_ACCENT,fontSize:11,fontWeight:700}}>✓</span>}
                  </div>
                  <div style={{fontSize:12,color:SUB,lineHeight:1.5}}>
                    Re-assessment reminders <span style={{color:DIM}}>· yearly per saved site</span>
                  </div>
                </button>
                <button
                  onClick={() => setF('email_preferences', { ...prefs, calibration_expiry: !calOn })}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'transparent',border:`1px solid ${calOn?`${mix('accent', 19)}`:BORDER}`,borderRadius:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit',marginBottom:10,width:'100%',transition:'border-color 0.15s'}}
                >
                  <div style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${calOn?ACCENT:DIM}`,background:calOn?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>
                    {calOn&&<span style={{color:ON_ACCENT,fontSize:11,fontWeight:700}}>✓</span>}
                  </div>
                  <div style={{fontSize:12,color:SUB,lineHeight:1.5}}>
                    Calibration-expiry reminders <span style={{color:DIM}}>· 30 days before, and on expiry</span>
                  </div>
                </button>
                <button
                  onClick={() => setF('email_preferences', { ...prefs, portfolio_digest: !digestOn })}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'transparent',border:`1px solid ${digestOn?`${mix('accent', 19)}`:BORDER}`,borderRadius:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit',marginBottom:10,width:'100%',transition:'border-color 0.15s'}}
                >
                  <div style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${digestOn?ACCENT:DIM}`,background:digestOn?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>
                    {digestOn&&<span style={{color:ON_ACCENT,fontSize:11,fontWeight:700}}>✓</span>}
                  </div>
                  <div style={{fontSize:12,color:SUB,lineHeight:1.5}}>
                    Quarterly portfolio digest <span style={{color:DIM}}>· your totals only, no benchmarks</span>
                  </div>
                </button>
                <button
                  onClick={() => setF('email_preferences', { ...prefs, sampling_results_outstanding: !samplingOn })}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'transparent',border:`1px solid ${samplingOn?`${mix('accent', 19)}`:BORDER}`,borderRadius:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit',marginBottom:24,width:'100%',transition:'border-color 0.15s'}}
                >
                  <div style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${samplingOn?ACCENT:DIM}`,background:samplingOn?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>
                    {samplingOn&&<span style={{color:ON_ACCENT,fontSize:11,fontWeight:700}}>✓</span>}
                  </div>
                  <div style={{fontSize:12,color:SUB,lineHeight:1.5}}>
                    Lab-results-outstanding reminders <span style={{color:DIM}}>· 14 days after finalize if no CSV attached</span>
                  </div>
                </button>
              </>
            )
          })()}

          <button onClick={() => setStep(1)} disabled={!form.name} style={{width:'100%',padding:'14px 0',background:ACCENT,border:'none',borderRadius:8,color:ON_ACCENT,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:form.name?1:.3,minHeight:48,transition:'opacity 0.2s',letterSpacing:'-0.1px'}}>Continue to Instruments</button>
        </div>}

        {/* ── Step 2: Instruments ── */}
        {step === 1 && <div style={{animation:'fadeUp .25s ease'}}>

          <div style={{marginBottom:20}}>
            <span style={label}>Primary IAQ meter</span>
            <select value={form.iaq_meter||''} onChange={e=>setF('iaq_meter',e.target.value)} style={{...inp,appearance:'auto'}}>
              <option value="">Select or skip</option>
              {IAQ_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {form.iaq_meter && <>
            <div style={{padding:'16px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>{form.iaq_meter}</div>

              <div style={{marginBottom:14}}>
                <span style={label}>Serial number <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></span>
                <input type="text" value={form.iaq_serial||''} onChange={e=>setF('iaq_serial',e.target.value)} placeholder="S/N" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
              </div>

              <div style={{marginBottom:14}}>
                <span style={label}>Last calibration</span>
                <input type="date" value={form.iaq_cal_date||''} onChange={e=>setF('iaq_cal_date',e.target.value)} style={{...inp,colorScheme:'dark'}} />
              </div>

              <div>
                <span style={label}>Calibration status</span>
                {CAL_OPTS.map(o => <RadioOption key={o} selected={form.iaq_cal_status===o} label={o} onClick={() => setF('iaq_cal_status',o)} compact />)}
              </div>
            </div>
          </>}

          <div style={{marginBottom:20}}>
            <span style={label}>PID / VOC meter <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></span>
            <select value={form.pid_meter||''} onChange={e=>setF('pid_meter',e.target.value)} style={{...inp,appearance:'auto'}}>
              <option value="">None</option>
              {PID_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {form.pid_meter && <div style={{padding:'16px',background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>{form.pid_meter}</div>
            <span style={label}>Calibration status</span>
            {PID_CAL_OPTS.map(o => <RadioOption key={o} selected={form.pid_cal_status===o} label={o} onClick={() => setF('pid_cal_status',o)} compact />)}
          </div>}

          <div style={{marginBottom:24}}>
            <span style={label}>Additional instruments <span style={{color:DIM,fontWeight:400,fontSize:11}}>(optional)</span></span>
            <textarea value={form.other_instruments||''} onChange={e=>setF('other_instruments',e.target.value)} placeholder="Moisture meter, thermal camera, smoke pencil..." rows={2} style={{...inp,resize:'vertical',fontFamily:'inherit'}} />
          </div>

          {/* Actions */}
          <div style={{display:'flex',gap:8}}>
            <button onClick={() => setStep(0)} style={{flex:0,padding:'14px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>←</button>
            <button onClick={handleSave} style={{flex:1,padding:'14px 0',background:ACCENT,border:'none',borderRadius:8,color:ON_ACCENT,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:48,letterSpacing:'-0.1px'}}>{editId ? 'Save Profile' : 'Create Profile'}</button>
          </div>

          {editId && (
            <button onClick={() => { handleDelete(editId); setMode('select') }} style={{width:'100%',padding:'12px 0',background:'transparent',border:`1px solid ${mix('danger', 15)}`,borderRadius:8,color:DANGER,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:40,marginTop:12,transition:'background 0.15s'}}>Delete this profile</button>
          )}
        </div>}
      </div>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
        *{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent;}
        button{font-family:inherit;-webkit-tap-highlight-color:transparent;}
        input::placeholder,textarea::placeholder{color:#4A5060;}
        select option{background:${CARD};color:${SUB};}
        ::-webkit-scrollbar{width:0;height:0;}
      `}</style>
    </div>
  )
}
