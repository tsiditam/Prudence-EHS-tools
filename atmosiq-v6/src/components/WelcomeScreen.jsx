/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * WelcomeScreen — first-time user onboarding
 * Shows once before profile setup, explains what AtmosFlow does.
 */

import { useState } from 'react'
import { I } from './Icons'

const BG = '#07080C'
const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const TEXT = '#ECEEF2'
const SUB = '#8B93A5'
const DIM = '#6B7380'

const slides = [
  {
    icon: 'wind',
    title: 'Guided Field Assessment',
    body: 'Walk through a structured IAQ assessment one question at a time. Instrument readings, photos, and observations — captured zone by zone with auto-save.',
  },
  {
    icon: 'pulse',
    title: 'Deterministic Scoring',
    body: 'Every finding is scored against recognized ventilation, comfort, and exposure standards. Five categories, worst-zone weighting, and full traceability — no black-box AI.',
  },
  {
    icon: 'chain',
    title: 'Causal Pathway Analysis',
    body: 'Related findings are connected into evidence-weighted concern pathways. The platform identifies contributing factors instead of listing disconnected items.',
  },
  {
    icon: 'report',
    title: 'Report-Ready Output',
    body: 'Structured findings, tiered recommendations, sampling plans, and professional narratives — generated from your field data and ready for review before you leave the building.',
  },
]

export default function WelcomeScreen({ onComplete }) {
  const [step, setStep] = useState(0)

  return (
    <div style={{minHeight:'100vh',background:BG,color:TEXT,fontFamily:"'inherit', system-ui",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0 24px',paddingTop:'env(safe-area-inset-top, 20px)'}}>
      <div style={{maxWidth:400,width:'100%',textAlign:'center'}}>

        {/* Brand */}
        <div style={{marginBottom:40}}>
          <span style={{fontSize:22,fontWeight:700,letterSpacing:'-0.3px'}}>AtmosFlow</span>
        </div>

        {/* Slide */}
        <div style={{animation:'fadeUp .4s ease'}}>
          <div style={{width:56,height:56,borderRadius:14,background:`${ACCENT}10`,border:`1px solid ${ACCENT}18`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
            <I n={slides[step].icon} s={26} c={ACCENT} w={1.8} />
          </div>
          <div style={{fontSize:20,fontWeight:700,color:TEXT,marginBottom:10,letterSpacing:'-0.3px'}}>{slides[step].title}</div>
          <div style={{fontSize:13,color:SUB,lineHeight:1.7,maxWidth:320,margin:'0 auto'}}>{slides[step].body}</div>
        </div>

        {/* Progress dots */}
        <div style={{display:'flex',justifyContent:'center',gap:6,marginTop:32,marginBottom:32}}>
          {slides.map((_, i) => (
            <div key={i} style={{width:step===i?20:6,height:6,borderRadius:3,background:step===i?ACCENT:`${DIM}40`,transition:'all 0.3s'}} />
          ))}
        </div>

        {/* Actions */}
        {step < slides.length - 1 ? (
          <div style={{display:'flex',gap:10}}>
            {step > 0 && <button onClick={()=>setStep(step-1)} style={{flex:0,padding:'12px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Back</button>}
            {step === 0 && <button onClick={onComplete} style={{flex:0,padding:'12px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Skip</button>}
            <button onClick={()=>setStep(step+1)} style={{flex:1,padding:'12px 20px',background:ACCENT,border:'none',borderRadius:8,color:'#000',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Next</button>
          </div>
        ) : (
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setStep(step-1)} style={{flex:0,padding:'14px 20px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:SUB,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Back</button>
            <button onClick={onComplete} style={{flex:1,padding:'14px 20px',background:ACCENT,border:'none',borderRadius:8,color:'#000',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Get Started</button>
          </div>
        )}

        <div style={{marginTop:20,fontSize:10,color:DIM}}>Standards-driven IAQ assessment platform</div>
      </div>
    </div>
  )
}
