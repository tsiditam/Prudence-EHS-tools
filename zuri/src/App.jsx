/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 * Contact: tsidi@prudenceehs.com
 *
 * Zuri — standalone EHS tool. This is the starting scaffold; build features here.
 */

import React from 'react'

const wrap = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '24px',
  background:
    'radial-gradient(1200px 600px at 50% -10%, rgba(79,140,255,0.12), transparent 60%), var(--bg)'
}

const eyebrow = {
  fontFamily: "'Space Grotesk', sans-serif",
  letterSpacing: '0.28em',
  textTransform: 'uppercase',
  fontSize: '12px',
  color: 'var(--accent)',
  marginBottom: '20px'
}

const title = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 800,
  fontSize: 'clamp(48px, 12vw, 112px)',
  lineHeight: 1,
  letterSpacing: '-0.03em'
}

const sub = {
  marginTop: '20px',
  maxWidth: '520px',
  color: 'var(--muted)',
  fontSize: '17px',
  lineHeight: 1.6
}

const badge = {
  marginTop: '36px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  border: '1px solid var(--line)',
  borderRadius: '999px',
  background: 'var(--panel)',
  color: 'var(--muted)',
  fontSize: '13px'
}

const dot = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: '#39D98A',
  boxShadow: '0 0 10px #39D98A'
}

const foot = {
  position: 'fixed',
  bottom: '24px',
  color: 'var(--muted)',
  fontSize: '12px',
  letterSpacing: '0.04em'
}

export default function Zuri() {
  return (
    <div style={wrap}>
      <div style={eyebrow}>Prudence EHS</div>
      <h1 style={title}>Zuri</h1>
      <p style={sub}>
        A new tool in the Prudence EHS suite. The scaffold is live — features are
        on the way.
      </p>
      <div style={badge}>
        <span style={dot} />
        Deployed at zuri.prudenceehs.com
      </div>
      <div style={foot}>© 2026 Prudence Safety &amp; Environmental Consulting, LLC</div>
    </div>
  )
}
