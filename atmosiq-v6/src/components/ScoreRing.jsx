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
export default function ScoreRing({ value, max=100, color, size=130 }) {
  const [a, setA] = useState(0)
  useEffect(()=>{
    // Honor prefers-reduced-motion — snap to the final value instead of
    // sweeping the ring + counting the number.
    const reduce = typeof window!=='undefined' && typeof window.matchMedia==='function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setA(value); return undefined }
    let st=null, raf=null
    const step=ts=>{if(!st)st=ts;const pr=Math.min((ts-st)/1000,1);setA(value*(1-Math.pow(1-pr,3)));if(pr<1)raf=requestAnimationFrame(step)}
    raf=requestAnimationFrame(step)
    return ()=>{ if(raf) cancelAnimationFrame(raf) }
  },[value])
  const r=(size-10)/2,circ=2*Math.PI*r,off=circ-(a/max)*circ
  return (
    <div style={{position:'relative',width:size,height:size}}>
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