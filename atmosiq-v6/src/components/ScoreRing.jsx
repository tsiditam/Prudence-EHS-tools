/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { useState, useEffect } from 'react'
// `onClick` is optional. When provided, the ring becomes an interactive
// control (the v3 design treats the composite ScoreRing as a tap target
// that drills into the score breakdown) — it gets button semantics, a
// pointer cursor, and keyboard activation. When omitted, the ring renders
// as inert presentation exactly as before, so every existing call site
// (ReportView, LandingPage, the operator hero) is unchanged.
export default function ScoreRing({ value, max=100, color, size=130, onClick, ariaLabel }) {
  const [a, setA] = useState(0)
  useEffect(()=>{
    // Honor prefers-reduced-motion — snap to the final value instead of
    // sweeping the ring + counting the number.
    const reduce = typeof window!=='undefined' && typeof window.matchMedia==='function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setA(value); return undefined }
    let st=null, raf=null
    const step=ts=>{if(!st)st=ts;const pr=Math.min((ts-st)/1000,1);if(pr<1){setA(value*(1-Math.pow(1-pr,3)));raf=requestAnimationFrame(step)}else{setA(value)}}
    raf=requestAnimationFrame(step)
    // Failsafe: rAF is throttled/paused on mobile Safari during scroll, view
    // transitions, and when backgrounded — which can freeze the number at 0
    // or a stale value. Guarantee the final value lands on a plain timer.
    const failsafe=setTimeout(()=>setA(value),1100)
    return ()=>{ if(raf) cancelAnimationFrame(raf); clearTimeout(failsafe) }
  },[value])
  const r=(size-10)/2,circ=2*Math.PI*r,off=circ-(a/max)*circ
  const interactive = typeof onClick === 'function'
  const interactiveProps = interactive ? {
    role: 'button',
    tabIndex: 0,
    'aria-label': ariaLabel || `Score ${Math.round(value)} of ${max}. View score breakdown.`,
    onClick,
    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e) } },
  } : {}
  return (
    <div {...interactiveProps} style={{position:'relative',width:size,height:size,...(interactive?{cursor:'pointer'}:null)}}>
      <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{filter:'drop-shadow(0 0 5px '+color+'50)'}} />
      </svg>
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontSize:size*.3,fontWeight:700,color,lineHeight:1,fontFamily:'var(--font-mono)'}}>{Math.round(a)}</span>
        <span style={{fontSize:9,color:'var(--dim)',fontFamily:'var(--font-mono)'}}>/{max}</span>
      </div>
    </div>
  )
}