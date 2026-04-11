/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ErrorBoundary — catches React render crashes.
 * Prevents white-screen-of-death. Shows recovery UI.
 * Data in localStorage/Supabase is unaffected by render errors.
 */

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('AtmosFlow Error Boundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', background: '#060609', color: '#F0F2F5',
          fontFamily: "'Outfit', system-ui", display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 32,
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Something went wrong</div>
            <div style={{ fontSize: 15, color: '#9BA4B5', lineHeight: 1.7, marginBottom: 8 }}>
              The app encountered an error, but your data is safe.
              All assessments, drafts, and profile data are stored separately from the app.
            </div>
            <div style={{
              fontSize: 13, color: '#22D3EE', background: '#22D3EE12',
              border: '1px solid #22D3EE25', borderRadius: 12,
              padding: '12px 16px', marginBottom: 28, lineHeight: 1.6,
            }}>
              Your data has NOT been lost. Tap reload to continue.
            </div>
            <button onClick={() => window.location.reload()} style={{
              padding: '16px 32px', background: 'linear-gradient(135deg,#0891B2,#22D3EE)',
              border: 'none', borderRadius: 14, color: '#fff', fontSize: 17,
              fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 54,
              width: '100%', marginBottom: 12,
            }}>
              Reload App
            </button>
            <button onClick={() => {
              try {
                const idx = JSON.parse(localStorage.getItem('atmosiq-idx') || '{}')
                const allData = { idx }
                const keys = Object.keys(localStorage).filter(k => k.startsWith('rpt-') || k.startsWith('draft-') || k === 'atmosiq-profile')
                keys.forEach(k => { try { allData[k] = JSON.parse(localStorage.getItem(k)) } catch {} })
                const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `atmosiq-emergency-backup-${new Date().toISOString().slice(0,10)}.json`
                a.click(); URL.revokeObjectURL(url)
              } catch (e) { alert('Backup failed: ' + e.message) }
            }} style={{
              padding: '14px 32px', background: 'transparent',
              border: '1px solid #1E1E2E', borderRadius: 14, color: '#9BA4B5',
              fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48,
              width: '100%',
            }}>
              Download Emergency Backup
            </button>
            {this.state.error && (
              <div style={{ marginTop: 20, fontSize: 11, color: '#6B7280', fontFamily: "'DM Mono'", textAlign: 'left', padding: 12, background: '#101018', borderRadius: 8, border: '1px solid #1E1E2E', wordBreak: 'break-all' }}>
                {this.state.error.toString()}
              </div>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
