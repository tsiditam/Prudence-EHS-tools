import { useState, useEffect } from 'react'
import Particles from './Particles'
export default function Loading({ onDone, fast }) {
  const [p, setP] = useState(0)
  const phs = ['Initializing atmosIQ','Loading standards','Calibrating','Ready']
  const ph = p<30?0:p<60?1:p<85?2:3
  useEffect(()=>{
    if(fast){setTimeout(onDone,400);return}
    const i=setInterval(()=>setP(v=>{const n=v+Math.random()*14+5;if(n>=100){clearInterval(i);setTimeout(onDone,400);return 100}return n}),160)
    return()=>clearInterval(i)
  },[onDone,fast])
  if(fast) return <div style={{position:'fixed',inset:0,background:'#080A0E',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}><div style={{fontSize:28,fontWeight:700}}>atmos<span style={{color:'#22D3EE'}}>IQ</span></div></div>
  return (
    <div style={{position:'fixed',inset:0,background:'#080A0E',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:9999}}>
      <Particles />
      <div style={{position:'relative',zIndex:1,textAlign:'center'}}>
        <div style={{width:72,height:72,margin:'0 auto 24px',position:'relative'}}>
          <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'#22D3EE',animation:'spin 1.5s linear infinite'}} />
          <div style={{position:'absolute',inset:5,borderRadius:'50%',border:'1.5px solid transparent',borderBottomColor:'#06B6D4',animation:'spin 2.2s linear infinite reverse'}} />
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#22D3EE'}}>{Math.round(p)}%</div>
        </div>
        <div style={{fontSize:22,fontWeight:700}}>atmos<span style={{color:'#22D3EE'}}>IQ</span></div>
        <div style={{fontSize:10,color:'#22D3EE',opacity:.8,marginTop:4}}>{phs[ph]}</div>
        <div style={{width:180,height:2,background:'#1A2030',borderRadius:1,margin:'14px auto 0',overflow:'hidden'}}>
          <div style={{height:'100%',width:p+'%',background:'linear-gradient(90deg,#22D3EE,#06B6D4)',transition:'width .2s'}} />
        </div>
      </div>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}