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
import { mix } from '../utils/theme'

export default function SensorScreen({ data, onChange, isDesktop }) {
  return (
    <div style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: isDesktop ? '1fr 1fr' : undefined, flexDirection: isDesktop ? undefined : 'column', gap: isDesktop ? 16 : 12 }}>
      <div style={{ padding: '12px 16px', background: mix('accent', 3), border: `1px solid ${mix('accent', 13)}`, borderRadius: 10, fontSize: 14, color: 'var(--accent)', gridColumn: isDesktop ? '1 / -1' : undefined }}>
        📏 Enter all available readings. Leave blank if not measured.
      </div>
      {SENSOR_FIELDS.map(sf => (
        <div key={sf.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{sf.label}</div>
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>{sf.ref}</div>
          </div>
          <div style={{ position: 'relative', width: 140 }}>
            <input type="number" value={data[sf.id] || ''} onChange={e => onChange(sf.id, e.target.value)}
              style={{ width: '100%', padding: '12px 14px', paddingRight: 44, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', transition: 'all 0.2s ease' }}
              onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 20px rgba(34,211,238,0.15)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }} />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>{sf.u}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
