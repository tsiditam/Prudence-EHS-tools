/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * AdminDashboard — user management, revenue, and usage metrics
 * Protected by ADMIN_SECRET entered in Settings.
 */

import { useState, useEffect } from 'react'
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

export default function AdminDashboard({ onBack, adminSecret }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [creditAdj, setCreditAdj] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin', {
        headers: { 'Authorization': `Bearer ${adminSecret}` },
      })
      if (!res.ok) throw new Error('Unauthorized or server error')
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const adjustCredits = async (userId, amount, reason) => {
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminSecret}` },
      body: JSON.stringify({ action: 'adjust_credits', userId, amount: parseInt(amount), reason }),
    })
    setCreditAdj('')
    setSelectedUser(null)
    fetchData()
  }

  const setUserStatus = async (userId, status) => {
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminSecret}` },
      body: JSON.stringify({ action: 'set_status', userId, status }),
    })
    fetchData()
  }

  if (loading) return (
    <div style={{paddingTop:28,paddingBottom:100}}>
      <button onClick={onBack} style={{background:'none',border:'none',color:ACCENT,fontSize:14,cursor:'pointer',fontFamily:'inherit',marginBottom:16}}>← Settings</button>
      <div style={{textAlign:'center',padding:40,color:DIM}}>Loading admin data...</div>
    </div>
  )

  if (error) return (
    <div style={{paddingTop:28,paddingBottom:100}}>
      <button onClick={onBack} style={{background:'none',border:'none',color:ACCENT,fontSize:14,cursor:'pointer',fontFamily:'inherit',marginBottom:16}}>← Settings</button>
      <div style={{padding:24,background:CARD,borderRadius:10,border:`1px solid ${BORDER}`,color:DANGER,fontSize:13}}>{error}</div>
    </div>
  )

  const m = data?.metrics || {}

  return (
    <div style={{paddingTop:28,paddingBottom:100}}>
      <button onClick={onBack} style={{background:'none',border:'none',color:ACCENT,fontSize:14,cursor:'pointer',fontFamily:'inherit',marginBottom:8}}>← Settings</button>
      <h2 style={{fontSize:20,fontWeight:700,color:TEXT,marginBottom:4}}>Admin Dashboard</h2>
      <div style={{fontSize:11,color:DIM,marginBottom:20}}>User management and platform metrics</div>

      {/* Metrics */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:20}}>
        {[
          {label:'Users',value:m.totalUsers,color:ACCENT},
          {label:'Subscribers',value:m.activeSubscribers,color:SUCCESS},
          {label:'Revenue',value:m.totalRevenueFormatted||'$0',color:WARN},
        ].map((s,i)=>(
          <div key={i} style={{padding:'14px 12px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:22,fontWeight:700,color:s.color,fontFamily:"'DM Mono'"}}>{s.value}</div>
            <div style={{fontSize:9,color:DIM,marginTop:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 30-day usage */}
      <div style={{padding:'12px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Last 30 Days</div>
        <div style={{display:'flex',gap:16,fontSize:11,color:SUB,fontFamily:"'DM Mono'"}}>
          <span>{m.last30Days?.signups || 0} signups</span>
          <span>{m.last30Days?.assessments || 0} assessments</span>
          <span>{m.last30Days?.narratives || 0} narratives</span>
        </div>
      </div>

      {/* User List */}
      <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Users ({(data?.users||[]).length})</div>
      {(data?.users||[]).map(u=>(
        <div key={u.id} style={{padding:'12px 16px',background:CARD,border:`1px solid ${selectedUser===u.id?ACCENT+'30':BORDER}`,borderRadius:10,marginBottom:6,cursor:'pointer'}} onClick={()=>setSelectedUser(selectedUser===u.id?null:u.id)}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:TEXT}}>{u.name||'Unnamed'}</div>
              <div style={{fontSize:10,color:DIM,fontFamily:"'DM Mono'",marginTop:2}}>{u.firm||'No firm'} · {u.plan} · {u.credits_remaining} credits</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:u.subscription_status==='active'?SUCCESS:u.subscription_status==='suspended'?DANGER:DIM}} />
              <span style={{fontSize:9,color:DIM}}>{u.subscription_status||'active'}</span>
            </div>
          </div>

          {/* Expanded actions */}
          {selectedUser===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${BORDER}`}}>
              <div style={{display:'flex',gap:8,marginBottom:8}}>
                <input value={creditAdj} onChange={e=>setCreditAdj(e.target.value)} placeholder="Credits (+/-)" type="number" style={{flex:1,padding:'8px 12px',background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,fontFamily:'inherit',outline:'none'}} />
                <button onClick={()=>adjustCredits(u.id,creditAdj,'admin')} style={{padding:'8px 14px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}25`,borderRadius:8,color:ACCENT,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Apply</button>
              </div>
              <div style={{display:'flex',gap:8}}>
                {u.subscription_status!=='suspended'&&(
                  <button onClick={()=>setUserStatus(u.id,'suspended')} style={{flex:1,padding:'8px',background:`${DANGER}10`,border:`1px solid ${DANGER}25`,borderRadius:8,color:DANGER,fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Suspend</button>
                )}
                {u.subscription_status==='suspended'&&(
                  <button onClick={()=>setUserStatus(u.id,'active')} style={{flex:1,padding:'8px',background:`${SUCCESS}10`,border:`1px solid ${SUCCESS}25`,borderRadius:8,color:SUCCESS,fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Reactivate</button>
                )}
              </div>
              <div style={{fontSize:9,color:DIM,fontFamily:"'DM Mono'",marginTop:8}}>ID: {u.id.slice(0,8)}... · Joined: {new Date(u.created_at).toLocaleDateString()}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
