/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * AdminDashboard — user management, revenue, and usage metrics
 * Protected by ADMIN_SECRET entered in Settings.
 */

import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { I } from './Icons'
import { mix } from '../utils/theme'

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

// v2.6.2 — relative-time helper for the Recent Signups panel.
// Renders "5h ago" / "2d ago" / "3w ago" / falls back to a date.
function relativeJoined(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.round(hr / 24)
  if (d < 14) return `${d}d ago`
  const w = Math.round(d / 7)
  if (w < 8) return `${w}w ago`
  return new Date(iso).toLocaleDateString()
}

// Pivot daily rows (day, generation_type, calls, …) into one object per day
// with per-type call counts so recharts can plot multiple series.
function pivotUsage(rows) {
  const map = {}
  for (const r of rows) {
    if (!map[r.day]) map[r.day] = {
      day: r.day,
      total_calls: 0,
      total_cost: 0,
      input_tokens: 0,
      output_tokens: 0,
      Narrative: 0,
      Jasper: 0,
    }
    const key = r.generation_type === 'field_assistant' ? 'Jasper' : 'Narrative'
    map[r.day][key] = (map[r.day][key] || 0) + Number(r.calls)
    map[r.day].total_calls += Number(r.calls)
    map[r.day].total_cost = Number((map[r.day].total_cost + Number(r.cost_usd)).toFixed(4))
    map[r.day].input_tokens += Number(r.input_tokens)
    map[r.day].output_tokens += Number(r.output_tokens)
  }
  return Object.values(map).sort((a, b) => a.day.localeCompare(b.day))
}

export default function AdminDashboard({ onBack, adminSecret }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [creditAdj, setCreditAdj] = useState('')

  // Usage tab state
  const [usageDays, setUsageDays] = useState(30)
  const [usageData, setUsageData] = useState(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState(null)

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

  const fetchUsage = async (days) => {
    setUsageLoading(true)
    setUsageError(null)
    try {
      const res = await fetch(`/api/admin?type=usage&days=${days}`, {
        headers: { 'Authorization': `Bearer ${adminSecret}` },
      })
      if (!res.ok) throw new Error('Failed to load usage data')
      const json = await res.json()
      setUsageData(json)
    } catch (e) {
      setUsageError(e.message)
    }
    setUsageLoading(false)
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => {
    if (activeTab === 'usage') fetchUsage(usageDays)
  }, [activeTab, usageDays])

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
      <div style={{fontSize:11,color:DIM,marginBottom:14}}>User management and platform metrics</div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:`1px solid ${BORDER}`,paddingBottom:0}}>
        {[{id:'overview',label:'Overview'},{id:'usage',label:'AI Usage'}].map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            padding:'7px 16px',background:'none',border:'none',
            borderBottom: activeTab===t.id ? `2px solid ${ACCENT}` : '2px solid transparent',
            color: activeTab===t.id ? ACCENT : DIM,
            fontSize:12,fontWeight: activeTab===t.id ? 700 : 400,
            cursor:'pointer',fontFamily:'inherit',marginBottom:-1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── AI Usage tab ──────────────────────────────────────────────── */}
      {activeTab === 'usage' && (
        <div>
          {/* Day-range selector */}
          <div style={{display:'flex',gap:6,marginBottom:16,alignItems:'center'}}>
            <span style={{fontSize:11,color:DIM}}>Range:</span>
            {[7,14,30,60,90].map(d=>(
              <button key={d} onClick={()=>setUsageDays(d)} style={{
                padding:'4px 10px',borderRadius:6,border:`1px solid ${d===usageDays?ACCENT:BORDER}`,
                background: d===usageDays ? mix('accent',12) : 'transparent',
                color: d===usageDays ? ACCENT : SUB,
                fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight: d===usageDays ? 700 : 400,
              }}>{d}d</button>
            ))}
          </div>

          {usageLoading && <div style={{textAlign:'center',padding:32,color:DIM,fontSize:13}}>Loading usage data…</div>}
          {usageError && <div style={{padding:16,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:DANGER,fontSize:13}}>{usageError}</div>}

          {!usageLoading && usageData && (() => {
            const rows = pivotUsage(usageData.usage || [])
            if (rows.length === 0) return (
              <div style={{padding:24,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,textAlign:'center',color:DIM,fontSize:13}}>
                No AI usage in the last {usageDays} days.
              </div>
            )

            const totalCalls = rows.reduce((s,r)=>s+r.total_calls,0)
            const totalCost = rows.reduce((s,r)=>s+r.total_cost,0).toFixed(4)
            const totalTokens = rows.reduce((s,r)=>s+r.input_tokens+r.output_tokens,0)

            const shortDay = d => {
              const parts = d.split('-')
              return `${parts[1]}/${parts[2]}`
            }
            const chartRows = rows.map(r=>({...r, day: shortDay(r.day)}))

            return (
              <div>
                {/* Summary chips */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:20}}>
                  {[
                    {label:`Total calls`,value:totalCalls,color:ACCENT},
                    {label:'Total tokens',value:totalTokens.toLocaleString(),color:WARN},
                    {label:'Est. cost',value:`$${totalCost}`,color:SUCCESS},
                  ].map((s,i)=>(
                    <div key={i} style={{padding:'12px 10px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,textAlign:'center'}}>
                      <div style={{fontSize:18,fontWeight:700,color:s.color,fontFamily:'var(--font-mono)'}}>{s.value}</div>
                      <div style={{fontSize:9,color:DIM,marginTop:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Daily calls chart */}
                <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 8px 8px',marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12,paddingLeft:8}}>Daily AI Calls</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartRows} margin={{top:0,right:16,left:-16,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                      <XAxis dataKey="day" tick={{fontSize:9,fill:DIM}} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{fontSize:9,fill:DIM}} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,fontSize:11}} labelStyle={{color:TEXT}} />
                      <Legend wrapperStyle={{fontSize:10,color:SUB}} />
                      <Line type="monotone" dataKey="Narrative" stroke={ACCENT} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Jasper" stroke={WARN} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Daily tokens chart */}
                <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 8px 8px',marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12,paddingLeft:8}}>Daily Tokens</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartRows} margin={{top:0,right:16,left:-16,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                      <XAxis dataKey="day" tick={{fontSize:9,fill:DIM}} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{fontSize:9,fill:DIM}} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,fontSize:11}} labelStyle={{color:TEXT}} formatter={(v)=>v.toLocaleString()} />
                      <Legend wrapperStyle={{fontSize:10,color:SUB}} />
                      <Bar dataKey="input_tokens" name="Input" stackId="t" fill={mix('accent',35)} radius={[0,0,0,0]} />
                      <Bar dataKey="output_tokens" name="Output" stackId="t" fill={ACCENT} radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Daily cost chart */}
                <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 8px 8px',marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12,paddingLeft:8}}>Estimated Daily Cost (USD)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartRows} margin={{top:0,right:16,left:-8,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                      <XAxis dataKey="day" tick={{fontSize:9,fill:DIM}} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{fontSize:9,fill:DIM}} tickLine={false} axisLine={false} tickFormatter={v=>`$${v}`} />
                      <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,fontSize:11}} labelStyle={{color:TEXT}} formatter={(v)=>`$${Number(v).toFixed(4)}`} />
                      <Line type="monotone" dataKey="total_cost" name="Cost" stroke={SUCCESS} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Overview tab ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
      {/* Metrics */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:20}}>
        {[
          {label:'Users',value:m.totalUsers,color:ACCENT},
          {label:'Subscribers',value:m.activeSubscribers,color:SUCCESS},
          {label:'Revenue',value:m.totalRevenueFormatted||'$0',color:WARN},
        ].map((s,i)=>(
          <div key={i} style={{padding:'14px 12px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:22,fontWeight:700,color:s.color,fontFamily:"var(--font-mono)"}}>{s.value}</div>
            <div style={{fontSize:9,color:DIM,marginTop:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 30-day usage */}
      <div style={{padding:'12px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Last 30 Days</div>
        <div style={{display:'flex',gap:16,fontSize:11,color:SUB,fontFamily:"var(--font-mono)"}}>
          <span>{m.last30Days?.signups || 0} signups</span>
          <span>{m.last30Days?.assessments || 0} assessments</span>
          <span>{m.last30Days?.narratives || 0} narratives</span>
        </div>
      </div>

      {/* Recent Signups — 10 most recent profiles by created_at desc */}
      {(data?.recentSignups || []).length > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px'}}>Recent Signups</div>
            <div style={{fontSize:10,color:DIM}}>Most recent first · tap email to copy</div>
          </div>
          {data.recentSignups.map(s => (
            <div key={s.id} style={{padding:'10px 14px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,marginBottom:6}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:TEXT}}>{s.name || 'Unnamed'}</div>
                  {s.email && (
                    <button
                      type="button"
                      onClick={() => { try { navigator.clipboard?.writeText(s.email) } catch {} }}
                      title="Copy email"
                      style={{padding:0,background:'none',border:'none',color:ACCENT,fontSize:11,fontFamily:"var(--font-mono)",cursor:'pointer',marginTop:2,textAlign:'left',wordBreak:'break-all'}}
                    >{s.email}</button>
                  )}
                  <div style={{fontSize:10,color:DIM,fontFamily:"var(--font-mono)",marginTop:2}}>
                    {s.firm || 'No firm'} · {s.plan || 'free'} · {s.credits_remaining ?? 0} credits
                  </div>
                </div>
                <div style={{textAlign:'right',whiteSpace:'nowrap'}}>
                  <div style={{fontSize:10,color:SUB,fontFamily:"var(--font-mono)"}}>{relativeJoined(s.created_at)}</div>
                  <div style={{fontSize:9,color:DIM,fontFamily:"var(--font-mono)",marginTop:2}}>{new Date(s.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User List */}
      <div style={{fontSize:11,fontWeight:600,color:DIM,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Users ({(data?.users||[]).length})</div>
      {(data?.users||[]).map(u=>(
        <div key={u.id} style={{padding:'12px 16px',background:CARD,border:`1px solid ${selectedUser===u.id?mix('accent', 19):BORDER}`,borderRadius:10,marginBottom:6,cursor:'pointer'}} onClick={()=>setSelectedUser(selectedUser===u.id?null:u.id)}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:TEXT}}>{u.name||'Unnamed'}</div>
              {u.email && (
                <div style={{fontSize:10,color:SUB,fontFamily:"var(--font-mono)",marginTop:2,wordBreak:'break-all'}}>{u.email}</div>
              )}
              <div style={{fontSize:10,color:DIM,fontFamily:"var(--font-mono)",marginTop:2}}>{u.firm||'No firm'} · {u.plan} · {u.credits_remaining} credits</div>
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
                <button onClick={()=>adjustCredits(u.id,creditAdj,'admin')} style={{padding:'8px 14px',background:`${mix('accent', 7)}`,border:`1px solid ${mix('accent', 15)}`,borderRadius:8,color:ACCENT,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Apply</button>
              </div>
              <div style={{display:'flex',gap:8}}>
                {u.subscription_status!=='suspended'&&(
                  <button onClick={()=>setUserStatus(u.id,'suspended')} style={{flex:1,padding:'8px',background:`${mix('danger', 6)}`,border:`1px solid ${mix('danger', 15)}`,borderRadius:8,color:DANGER,fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Suspend</button>
                )}
                {u.subscription_status==='suspended'&&(
                  <button onClick={()=>setUserStatus(u.id,'active')} style={{flex:1,padding:'8px',background:`${mix('success', 6)}`,border:`1px solid ${mix('success', 15)}`,borderRadius:8,color:SUCCESS,fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Reactivate</button>
                )}
              </div>
              <div style={{fontSize:9,color:DIM,fontFamily:"var(--font-mono)",marginTop:8}}>ID: {u.id.slice(0,8)}... · Joined: {new Date(u.created_at).toLocaleDateString()}</div>
            </div>
          )}
        </div>
      ))}
        </div>
      )}
    </div>
  )
}
