/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DesktopSidebar — left rail shown during the assessment wizard on
 * tablet+. Provides step navigation (Pre-Survey / Building / Zones /
 * Review), the AtmosFlow wordmark, and footer actions (Save Draft,
 * History). Visual language matches the v3 token system in
 * src/styles/tokens.js: solid layered surface, neutral borders,
 * accent reserved for the active step and the wordmark hairline.
 */

import { I } from './Icons'
import * as V3 from '../styles/tokens'

const STEP_LABELS = ['Pre-Survey', 'Building', 'Zones', 'Review']
const STEP_ICONS  = ['clip',       'bldg',     'layers','shield']

export default function DesktopSidebar({ step, setStep, saveDraft, setShowHistory, onHome, version }) {
  return (
    <div style={{
      position: 'fixed', left: 0, top: 0, bottom: 0, width: 260,
      background: V3.SURFACE,
      borderRight: `1px solid ${V3.BORDER_DEFAULT}`,
      display: 'flex', flexDirection: 'column',
      zIndex: 200,
    }}>
      {/* Brand rail — thin cyan hairline at the very top, mirrors the
          design language of an instrument panel's status indicator. */}
      <div style={{ height: 1, background: `linear-gradient(90deg, var(--accent), transparent 60%)`, flexShrink: 0 }} />

      {/* Wordmark + product caption */}
      <div onClick={onHome} style={{ padding: '24px 24px 20px', cursor: 'pointer' }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:28,height:28,borderRadius:V3.R.md,background:`${'var(--accent)'}14`,border:`1px solid ${V3.BORDER_ACCENT}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <I n="wind" s={15} c="var(--accent)" w={1.9} />
          </div>
          <div style={{...V3.T.h2, fontSize:18, letterSpacing:'-0.3px'}}>AtmosFlow</div>
        </div>
        <div style={{...V3.T.captionDim, marginTop:8, fontFamily:V3.FONT_MONO, fontSize:10}}>v{version}</div>
      </div>

      <div style={{height:1, background:V3.BORDER_DEFAULT, margin:'0 16px'}} />

      {/* Step navigator — each step shows a numbered chip, label, and
          optional check when completed. Inactive but reachable steps
          stay clickable; future steps dim out. */}
      <div style={{ flex: 1, padding: '20px 0', overflowY: 'auto' }}>
        <div style={{ padding: '0 20px', marginBottom: 10 }}>
          <div style={V3.T.micro}>Assessment Workflow</div>
        </div>
        {STEP_LABELS.map((label, i) => {
          const active = i === step
          const completed = i < step
          const clickable = i <= step
          return (
            <div key={i} onClick={() => clickable && setStep(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 16px', margin: '2px 12px',
                borderRadius: V3.R.md,
                cursor: clickable ? 'pointer' : 'default',
                background: active ? V3.RAISED : 'transparent',
                borderLeft: active ? `2px solid var(--accent)` : '2px solid transparent',
                opacity: clickable ? 1 : 0.42,
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}>
              <div style={{
                width: 26, height: 26, borderRadius: V3.R.sm,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'var(--accent)' : completed ? `${'var(--accent)'}14` : V3.RAISED,
                color: active ? 'var(--on-accent-fill)' : completed ? 'var(--accent)' : V3.TEXT_TERTIARY,
                fontSize: 11, fontWeight: 700, fontFamily: V3.FONT_MONO,
                border: active ? 'none' : `1px solid ${V3.BORDER_DEFAULT}`,
                flexShrink: 0,
              }}>
                {completed ? <I n="check" s={13} c="var(--accent)" w={2.2} /> : i + 1}
              </div>
              <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:8}}>
                <I n={STEP_ICONS[i]} s={14} c={active ? V3.TEXT_PRIMARY : completed ? V3.TEXT_SECONDARY : V3.TEXT_TERTIARY} w={1.6} />
                <div style={{...V3.T.body, fontWeight: active ? 600 : 500, color: active ? V3.TEXT_PRIMARY : completed ? V3.TEXT_SECONDARY : V3.TEXT_TERTIARY}}>
                  {label}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer actions */}
      <div style={{ padding: '14px 16px', borderTop: `1px solid ${V3.BORDER_DEFAULT}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={saveDraft} style={{...V3.btnGhost, width: '100%', padding: '10px 14px', fontSize: 12}}>
          <I n="save" s={13} c={V3.TEXT_SECONDARY} w={1.7} /> Save Draft
        </button>
        <button onClick={() => setShowHistory(true)} style={{...V3.btnGhost, width: '100%', padding: '10px 14px', fontSize: 12}}>
          <I n="clock" s={13} c={V3.TEXT_SECONDARY} w={1.7} /> History
        </button>
      </div>

      {/* Brand footer */}
      <div style={{ padding: '14px 20px 20px', borderTop: `1px solid ${V3.BORDER_DEFAULT}` }}>
        <div style={{...V3.T.captionDim, lineHeight:'16px'}}>Prudence Safety &amp;</div>
        <div style={{...V3.T.captionDim, lineHeight:'16px'}}>Environmental Consulting</div>
        <div style={{...V3.T.captionDim, marginTop:6, fontSize:10, opacity:0.6}}>&copy; 2026 All rights reserved</div>
      </div>
    </div>
  )
}
