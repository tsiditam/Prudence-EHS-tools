/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 */

import { I } from './Icons'
import { CSS, SP, mono, btn } from '../styles/tokens'

const STEP_LABELS = ['Pre-Survey', 'Building', 'Zones', 'Review']

export default function DesktopSidebar({ step, setStep, saveDraft, setShowHistory, onHome, version }) {
  return (
    <div style={{
      position: 'fixed', left: 0, top: 0, bottom: 0, width: 280,
      background: 'linear-gradient(180deg, #0A0D14 0%, #080A0E 100%)',
      borderRight: `1px solid ${CSS.border}`,
      display: 'flex', flexDirection: 'column',
      padding: '0', zIndex: 200,
      boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
    }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg, #22D3EE, #06B6D4, transparent)', flexShrink: 0 }} />

      <div style={{ padding: '32px 28px 24px', borderBottom: `1px solid ${CSS.border}` }}>
        <div onClick={onHome} style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', cursor: 'pointer' }}>
          AtmosFlow
        </div>
        <div style={{ fontSize: 11, color: CSS.muted, marginTop: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Indoor Air Quality Intelligence
        </div>
        <div style={{ fontSize: 10, color: CSS.accent, marginTop: 8, ...mono, opacity: 0.6 }}>v{version}</div>
      </div>

      <div style={{ flex: 1, padding: '20px 0', overflowY: 'auto' }}>
        <div style={{ padding: '0 16px', marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: CSS.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assessment Steps</div>
        </div>
        {STEP_LABELS.map((label, i) => {
          const active = i === step
          const completed = i < step
          const clickable = i <= step
          return (
            <div key={i} onClick={() => clickable && setStep(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 28px', margin: '2px 12px', borderRadius: 10,
                cursor: clickable ? 'pointer' : 'default',
                background: active ? CSS.accentDim : 'transparent',
                borderLeft: active ? `3px solid ${CSS.accent}` : '3px solid transparent',
                transition: 'all 0.2s ease',
                opacity: clickable ? 1 : 0.4,
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? CSS.accent : completed ? CSS.accent + '30' : CSS.border,
                color: active ? '#080A0E' : completed ? CSS.accent : CSS.muted,
                fontSize: 13, fontWeight: 700, ...mono,
                transition: 'all 0.2s ease',
              }}>
                {completed ? <I n="check" s={14} c={CSS.accent} /> : i + 1}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? CSS.text : completed ? CSS.accent : CSS.muted }}>
                  {label}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '16px 20px', borderTop: `1px solid ${CSS.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={saveDraft} style={{
          width: '100%', padding: '10px 16px', background: 'transparent',
          border: `1px solid ${CSS.border}`, borderRadius: 10, color: CSS.text,
          fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
          <I n="save" s={14} c={CSS.muted} /> Save Draft
        </button>
        <button onClick={() => setShowHistory(true)} style={{
          width: '100%', padding: '10px 16px', background: 'transparent',
          border: `1px solid ${CSS.border}`, borderRadius: 10, color: CSS.text,
          fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
          <I n="clock" s={14} c={CSS.muted} /> History
        </button>
      </div>

      <div style={{ padding: '20px 28px', borderTop: `1px solid ${CSS.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: CSS.muted, lineHeight: 1.5 }}>Prudence Safety &amp;</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: CSS.muted, lineHeight: 1.5 }}>Environmental Consulting</div>
        <div style={{ fontSize: 9, color: CSS.muted, marginTop: 4, opacity: 0.5 }}>&copy; 2026 All rights reserved</div>
      </div>
    </div>
  )
}
