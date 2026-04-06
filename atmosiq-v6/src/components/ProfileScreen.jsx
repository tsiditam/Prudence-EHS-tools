/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ProfileScreen — registration, login, and profile management
 */

import { useState, useEffect } from 'react'
import Profiles from '../utils/profiles'
import { I } from './Icons'

const BG = '#060609'
const CARD = '#101018'
const BORDER = '#1E1E2E'
const ACCENT = '#22D3EE'
const TEXT = '#F0F2F5'
const SUB = '#9BA4B5'
const DIM = '#6B7280'

const CERT_OPTS = ['CIH','CIH-in-Training','CSP','CHMM','ACAC CIEC','ACAC CMC','ACAC CMI','NYSDOL Mold Assessor','State IH License','OSHA 30-Hour','Other']
const EXP_OPTS = ['1-3 years','3-5 years','5-10 years','10-20 years','20+ years']
const IAQ_OPTS = ['TSI Q-Trak 7575','TSI Q-Trak 7515','TSI IAQ-Calc 7545','Graywolf AdvancedSense Pro','Graywolf IQ-610','Testo 400','Testo 440','Kanomax IAQ-2000','Other']
const PID_OPTS = ['RAE Systems MiniRAE 3000','RAE Systems ppbRAE 3000','Ion Science Tiger','Ion Science Cub','Honeywell ToxiRAE Pro PID','Other']
const CAL_OPTS = ['Calibrated within manufacturer spec','Calibrated — overdue for recertification','Field-zeroed only','Not calibrated','Unknown']
const PID_CAL_OPTS = ['Bump-tested and calibrated','Bump-tested only','Not calibrated','N/A']

const inp = { width:'100%',padding:'16px 18px',background:BG,border:`1.5px solid ${BORDER}`,borderRadius:12,color:TEXT,fontSize:16,fontFamily:"'Outfit'",fontWeight:500,outline:'none',boxSizing:'border-box' }
const label = { fontSize:14,fontWeight:600,color:TEXT,marginBottom:8,display:'block' }

export default function ProfileScreen({ onLogin }) {
  const [profiles, setProfiles] = useState([])
  const [mode, setMode] = useState('select') // select | create | edit
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({})
  const [step, setStep] = useState(0) // 0: name/creds, 1: instruments

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

  // ── Profile select screen ──
  if (mode === 'select' && profiles.length > 0) {
    return (
      <div style={{minHeight:'100vh',background:BG,color:TEXT,fontFamily:"'Outfit', system-ui",padding:'0 20px',paddingTop:'env(safe-area-inset-top, 20px)'}}>
        <div style={{maxWidth:480,margin:'0 auto',paddingTop:48,paddingBottom:100}}>
          <div style={{textAlign:'center',marginBottom:40}}>
            <div style={{fontSize:28,fontWeight:800,marginBottom:8}}>atmos<span style={{color:ACCENT}}>IQ</span></div>
            <div style={{fontSize:14,color:SUB}}>Select your profile</div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {profiles.map(p => (
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:14}}>
                <button onClick={() => handleSelect(p)} style={{flex:1,padding:'18px 20px',background:CARD,border:`1.5px solid ${BORDER}`,borderRadius:16,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:16,minHeight:72,fontFamily:'inherit'}}>
                  <div style={{width:48,height:48,borderRadius:14,background:`${ACCENT}12`,border:`1px solid ${ACCENT}25`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <I n="user" s={22} c={ACCENT} />
                  </div>
                  <div>
                    <div style={{fontSize:17,fontWeight:700,color:TEXT}}>{p.name || 'Unnamed'}</div>
                    <div style={{fontSize:13,color:DIM,marginTop:3,fontFamily:"'DM Mono'"}}>{(p.certs||[]).slice(0,3).join(' · ') || 'No certifications'}</div>
                  </div>
                </button>
                <button onClick={() => handleEdit(p)} style={{width:44,height:44,borderRadius:10,background:CARD,border:`1px solid ${BORDER}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <I n="clip" s={16} c={DIM} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={() => { setMode('create'); setForm({}); setEditId(null); setStep(0) }} style={{width:'100%',padding:'16px 0',marginTop:20,background:'transparent',border:`1.5px dashed ${BORDER}`,borderRadius:14,color:SUB,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:52}}>+ New Profile</button>
        </div>
      </div>
    )
  }

  // ── Create / Edit profile ──
  return (
    <div style={{minHeight:'100vh',background:BG,color:TEXT,fontFamily:"'Outfit', system-ui",padding:'0 20px',paddingTop:'env(safe-area-inset-top, 20px)'}}>
      <div style={{maxWidth:480,margin:'0 auto',paddingTop:36,paddingBottom:100}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:32}}>
          <div>
            <div style={{fontSize:24,fontWeight:800}}>atmos<span style={{color:ACCENT}}>IQ</span></div>
            <div style={{fontSize:14,color:SUB,marginTop:4}}>{editId ? 'Edit Profile' : 'Create Your Profile'}</div>
          </div>
          {profiles.length > 0 && <button onClick={() => setMode('select')} style={{padding:'10px 18px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:SUB,fontSize:14,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>Cancel</button>}
        </div>

        {/* Step indicator */}
        <div style={{display:'flex',gap:8,marginBottom:28}}>
          {['You','Instruments'].map((s,i) => (
            <button key={s} onClick={() => setStep(i)} style={{flex:1,padding:'10px 0',borderRadius:10,border:'none',background:step===i?`${ACCENT}15`:'transparent',color:step===i?ACCENT:DIM,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:40}}>{s}</button>
          ))}
        </div>

        {step === 0 && <div style={{display:'flex',flexDirection:'column',gap:20,animation:'fadeUp .3s ease'}}>
          <div>
            <span style={label}>Full name and credentials *</span>
            <input type="text" value={form.name||''} onChange={e=>setF('name',e.target.value)} placeholder="e.g. J. Smith, CIH, CSP" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
          </div>
          <div>
            <span style={label}>Certifications</span>
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              {CERT_OPTS.map(c => { const sel = (form.certs||[]).includes(c); return (
                <button key={c} onClick={() => setF('certs', sel ? (form.certs||[]).filter(x=>x!==c) : [...(form.certs||[]),c])} style={{padding:'10px 16px',borderRadius:20,background:sel?`${ACCENT}15`:CARD,border:`1.5px solid ${sel?ACCENT:BORDER}`,color:sel?ACCENT:'#C8D0DC',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit',minHeight:42}}>{sel?'✓ ':''}{c}</button>
              )})}
            </div>
          </div>
          <div>
            <span style={label}>Years of IH/EHS experience</span>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {EXP_OPTS.map(o => { const sel = form.experience===o; return (
                <button key={o} onClick={() => setF('experience',o)} style={{padding:'14px 18px',textAlign:'left',background:sel?`${ACCENT}12`:CARD,border:`1.5px solid ${sel?ACCENT:BORDER}`,borderRadius:12,color:sel?ACCENT:'#E2E8F0',fontSize:15,fontWeight:500,cursor:'pointer',fontFamily:'inherit',minHeight:48}}>{o}</button>
              )})}
            </div>
          </div>
          <div>
            <span style={label}>Firm / company name</span>
            <input type="text" value={form.firm||''} onChange={e=>setF('firm',e.target.value)} placeholder="e.g. Prudence EHS, or Independent" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
          </div>
          <button onClick={()=>setF('marketing_consent',!form.marketing_consent)} style={{display:'flex',alignItems:'flex-start',gap:14,padding:'16px 18px',background:form.marketing_consent?`${ACCENT}08`:CARD,border:`1.5px solid ${form.marketing_consent?ACCENT:BORDER}`,borderRadius:14,cursor:'pointer',textAlign:'left',fontFamily:'inherit',minHeight:56}}>
            <div style={{width:24,height:24,borderRadius:6,border:`2px solid ${form.marketing_consent?ACCENT:'#2A3040'}`,background:form.marketing_consent?ACCENT:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2}}>{form.marketing_consent&&<span style={{color:BG,fontSize:14,fontWeight:700}}>✓</span>}</div>
            <div><div style={{fontSize:14,fontWeight:600,color:form.marketing_consent?ACCENT:TEXT}}>Keep me updated</div><div style={{fontSize:12,color:DIM,marginTop:3,lineHeight:1.5}}>Product updates, new features, and IH field tips. No spam. Unsubscribe anytime.</div></div>
          </button>
          <button onClick={() => setStep(1)} disabled={!form.name} style={{padding:'16px 0',background:`linear-gradient(135deg,#0891B2,${ACCENT})`,border:'none',borderRadius:12,color:'#fff',fontSize:16,fontWeight:600,cursor:'pointer',fontFamily:'inherit',opacity:form.name?1:.3,minHeight:52,marginTop:8}}>Continue → Instruments</button>
        </div>}

        {step === 1 && <div style={{display:'flex',flexDirection:'column',gap:20,animation:'fadeUp .3s ease'}}>
          <div>
            <span style={label}>Primary IAQ meter</span>
            <select value={form.iaq_meter||''} onChange={e=>setF('iaq_meter',e.target.value)} style={{...inp,appearance:'auto'}}>
              <option value="">Select or skip...</option>
              {IAQ_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {form.iaq_meter && <>
            <div>
              <span style={label}>Serial number</span>
              <input type="text" value={form.iaq_serial||''} onChange={e=>setF('iaq_serial',e.target.value)} placeholder="Optional" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
            </div>
            <div>
              <span style={label}>Calibration date</span>
              <input type="date" value={form.iaq_cal_date||''} onChange={e=>setF('iaq_cal_date',e.target.value)} style={{...inp,colorScheme:'dark'}} />
            </div>
            <div>
              <span style={label}>Calibration status</span>
              {CAL_OPTS.map(o => { const sel = form.iaq_cal_status===o; return (
                <button key={o} onClick={() => setF('iaq_cal_status',o)} style={{width:'100%',padding:'12px 16px',textAlign:'left',marginBottom:6,background:sel?`${ACCENT}12`:CARD,border:`1.5px solid ${sel?ACCENT:BORDER}`,borderRadius:10,color:sel?ACCENT:'#E2E8F0',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>{o}</button>
              )})}
            </div>
          </>}
          <div>
            <span style={label}>PID / VOC meter (optional)</span>
            <select value={form.pid_meter||''} onChange={e=>setF('pid_meter',e.target.value)} style={{...inp,appearance:'auto'}}>
              <option value="">None / skip...</option>
              {PID_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {form.pid_meter && <div>
            <span style={label}>PID calibration status</span>
            {PID_CAL_OPTS.map(o => { const sel = form.pid_cal_status===o; return (
              <button key={o} onClick={() => setF('pid_cal_status',o)} style={{width:'100%',padding:'12px 16px',textAlign:'left',marginBottom:6,background:sel?`${ACCENT}12`:CARD,border:`1.5px solid ${sel?ACCENT:BORDER}`,borderRadius:10,color:sel?ACCENT:'#E2E8F0',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>{o}</button>
            )})}
          </div>}
          <div>
            <span style={label}>Other instruments (optional)</span>
            <textarea value={form.other_instruments||''} onChange={e=>setF('other_instruments',e.target.value)} placeholder="Moisture meter, thermal camera, smoke pencil..." rows={2} style={{...inp,resize:'vertical',fontFamily:'inherit'}} />
          </div>
          <div style={{display:'flex',gap:10,marginTop:8}}>
            <button onClick={() => setStep(0)} style={{flex:1,padding:'16px 0',background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,color:SUB,fontSize:16,cursor:'pointer',fontFamily:'inherit',minHeight:52}}>← Back</button>
            <button onClick={handleSave} style={{flex:2,padding:'16px 0',background:'linear-gradient(135deg,#059669,#22C55E)',border:'none',borderRadius:12,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:52}}>{editId ? 'Save Profile' : 'Create Profile'}</button>
          </div>
          {editId && <button onClick={() => { handleDelete(editId); setMode('select') }} style={{padding:'14px 0',background:'#EF444415',border:'1px solid #EF444430',borderRadius:12,color:'#EF4444',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minHeight:48,marginTop:4}}>Delete Profile</button>}
        </div>}
      </div>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        *{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent;}
        button{font-family:inherit;-webkit-tap-highlight-color:transparent;}
        input::placeholder,textarea::placeholder{color:#525A6A;}
        select option{background:${CARD};color:${SUB};}
        ::-webkit-scrollbar{width:0;height:0;}
      `}</style>
    </div>
  )
}
