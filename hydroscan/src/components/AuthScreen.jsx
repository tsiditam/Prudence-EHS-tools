/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AuthScreen — token-styled sign-in / sign-up for HydroScan, mirroring the
 * AtmosFlow auth aesthetic. Email+password and Google OAuth via AuthContext.
 */

import { useState } from 'react'
import { Logo } from './Icons'
import { R } from '../styles/tokens'
import { useAuth } from '../contexts/AuthContext'

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const submit = async () => {
    if (busy) return
    setError(null); setNotice(null)
    if (!email.trim() || password.length < 6) { setError('Enter a valid email and a password of at least 6 characters.'); return }
    setBusy(true)
    try {
      const fn = mode === 'signup' ? signUp : signIn
      const { error } = await fn(email.trim(), password)
      if (error) setError(error.message || 'Authentication failed.')
      else if (mode === 'signup') setNotice('Check your email to confirm your account, then sign in.')
    } catch (e) {
      setError(e?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const field = (label, value, onChange, type, ph) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--sub)', marginBottom: 6 }}>{label}</div>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={ph}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        style={{ width: '100%', padding: '13px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: R.md, color: 'var(--text)', fontSize: 16, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
      />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--accent) 10%, var(--bg)) 0%, var(--bg) 55%)', color: 'var(--text)', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <Logo s={56} />
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', marginTop: 8 }}>Hydro<span style={{ color: 'var(--accent)' }}>Scan</span></div>
          <div style={{ fontSize: 12, color: 'var(--sub)', fontFamily: "'DM Mono'", marginTop: 4 }}>Drinking Water Quality Intelligence</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: R.lg, padding: 22 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: R.md, padding: 4, marginBottom: 18 }}>
            {['signin', 'signup'].map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(null); setNotice(null) }} style={{ flex: 1, padding: '9px 0', borderRadius: R.sm, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: mode === m ? 'var(--accent-fill)' : 'transparent', color: mode === m ? 'var(--on-accent-fill)' : 'var(--sub)' }}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {field('Email address', email, setEmail, 'email', 'you@firm.com')}
          {field('Password', password, setPassword, 'password', '••••••••')}

          {error && <div style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
          {notice && <div style={{ fontSize: 12.5, color: 'var(--accent)', marginBottom: 10 }}>{notice}</div>}

          <button onClick={submit} disabled={busy} style={{ width: '100%', padding: '14px 0', borderRadius: R.md, border: 'none', cursor: busy ? 'default' : 'pointer', background: busy ? 'var(--border)' : 'var(--accent-fill)', color: busy ? 'var(--dim)' : 'var(--on-accent-fill)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <button onClick={() => signInWithGoogle()} style={{ width: '100%', padding: '13px 0', borderRadius: R.md, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, color: '#4285F4' }}>G</span> Continue with Google
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--dim)', marginTop: 16 }}>
          Built by Prudence EHS · Secure · Private · Professional
        </div>
      </div>
    </div>
  )
}
