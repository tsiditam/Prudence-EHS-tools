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

import { SENSOR_FIELDS } from '../constants/questions'
export default function SensorScreen({ data, onChange }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{padding:'12px 16px',background:'#22D3EE08',border:'1px solid #22D3EE20',borderRadius:10,fontSize:14,color:'#22D3EE'}}>
        📏 Enter all available readings. Leave blank if not measured.
      </div>
      {SENSOR_FIELDS.map(sf=>(
        <div key={sf.id} style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:600,color:'#E2E8F0',marginBottom:3}}>{sf.label}</div>
            <div style={{fontSize:12,color:'#5E6578'}}>{sf.ref}</div>
          </div>
          <div style={{position:'relative',width:140}}>
            <input type="number" value={data[sf.id]||''} onChange={e=>onChange(sf.id,e.target.value)}
              style={{width:'100%',padding:'12px 14px',paddingRight:44,background:'#0C1017',border:'1px solid #1A2030',borderRadius:8,color:'#F0F4F8',fontSize:16,outline:'none',boxSizing:'border-box'}}
              onFocus={e=>e.target.style.borderColor='#22D3EE'} onBlur={e=>e.target.style.borderColor='#1A2030'} />
            <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:12,color:'#5E6578'}}>{sf.u}</span>
          </div>
        </div>
      ))}
    </div>
  )
}