/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AuthScreen — Supabase email/password login + registration
 */

import { useState } from 'react'
import Storage from '../utils/cloudStorage'
import { trackEvent } from '../utils/supabaseClient'
import { I } from './Icons'

const BG = '#07080C'
const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const TEXT = '#ECEEF2'
const SUB = '#8B93A5'
const DIM = '#6B7380'
const ERR = '#EF4444'

const inp = {width:'100%',padding:'18px 20px',background:BG,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:"'Outfit'",fontWeight:500,outline:'none',boxSizing:'border-box'}

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login') // login | register | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [tosAccepted, setTosAccepted] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) { setError('Email and password required'); return }
    setLoading(true); setError('')
    const { data, error: err } = await Storage.signIn(email, password)
    setLoading(false)
    if (err) { setError(err.message || 'Login failed'); return }
    if (data?.user) onAuth(data.user)
  }

  const handleRegister = async () => {
    if (!email || !password) { setError('Email and password required'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPw) { setError('Passwords do not match'); return }
    if (!tosAccepted) { setError('Please accept the Terms of Service and Privacy Policy'); return }
    trackEvent('signup_started', { method: 'email' })
    setLoading(true); setError('')
    const { data, error: err } = await Storage.signUp(email, password)
    setLoading(false)
    if (err) { setError(err.message || 'Registration failed'); return }
    if (data?.user) {
      trackEvent('signup_completed', { method: 'email' })
      setMessage('Check your email for a confirmation link.')
      setMode('login')
    }
  }

  const handleForgot = async () => {
    // Supabase handles password reset via email
    if (!email) { setError('Enter your email address'); return }
    setLoading(true); setError('')
    const { supabase } = await import('../utils/supabaseClient')
    if (!supabase) { setError('Service not configured'); setLoading(false); return }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email)
    setLoading(false)
    if (err) { setError(err.message); return }
    setMessage('Password reset email sent. Check your inbox.')
    setMode('login')
  }

  return (
    <div style={{minHeight:'100vh',background:BG,color:TEXT,fontFamily:"'Outfit', system-ui",padding:'0 24px',paddingTop:'env(safe-area-inset-top, 20px)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{maxWidth:400,width:'100%',animation:'fadeUp .5s ease'}}>
        {/* Brand */}
        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{fontSize:36,fontWeight:800,marginBottom:8}}>Atmos<span style={{color:ACCENT}}>Flow</span></div>
          <div style={{fontSize:14,color:SUB}}>
            {mode === 'login' ? 'Sign in to your account' : mode === 'register' ? 'Create your account' : 'Reset your password'}
          </div>
        </div>

        {/* Messages */}
        {error && <div style={{padding:'12px 16px',background:`${ERR}12`,border:`1px solid ${ERR}30`,borderRadius:12,marginBottom:16,fontSize:14,color:ERR}}>{error}</div>}
        {message && <div style={{padding:'12px 16px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}30`,borderRadius:12,marginBottom:16,fontSize:14,color:ACCENT}}>{message}</div>}

        {/* Form */}
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError('')}} placeholder="Email address" autoComplete="email" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />

          {mode !== 'forgot' && <input type="password" value={password} onChange={e=>{setPassword(e.target.value);setError('')}} placeholder="Password" autoComplete={mode==='register'?'new-password':'current-password'} style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} onKeyDown={e=>{if(e.key==='Enter'&&mode==='login')handleLogin()}} />}

          {mode === 'register' && <input type="password" value={confirmPw} onChange={e=>{setConfirmPw(e.target.value);setError('')}} placeholder="Confirm password" autoComplete="new-password" style={inp} onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />}

          {mode === 'register' && (
            <label style={{display:'flex',alignItems:'flex-start',gap:10,fontSize:12,color:SUB,lineHeight:1.5,cursor:'pointer',padding:'4px 0'}}>
              <input type="checkbox" checked={tosAccepted} onChange={e=>setTosAccepted(e.target.checked)} style={{marginTop:3,accentColor:ACCENT,flexShrink:0}} />
              <span>I agree to the Terms of Service and Privacy Policy</span>
            </label>
          )}

          {/* Primary action */}
          {mode === 'login' && <button onClick={handleLogin} disabled={loading} style={{padding:'16px 0',background:`linear-gradient(135deg,#0891B2,${ACCENT})`,border:'none',borderRadius:14,color:'#fff',fontSize:17,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:54,opacity:loading?.6:1}}>{loading ? 'Signing in...' : 'Sign In'}</button>}
          {mode === 'register' && <button onClick={handleRegister} disabled={loading} style={{padding:'16px 0',background:'linear-gradient(135deg,#059669,#22C55E)',border:'none',borderRadius:14,color:'#fff',fontSize:17,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:54,opacity:loading?.6:1}}>{loading ? 'Creating account...' : 'Create Account'}</button>}
          {mode === 'forgot' && <button onClick={handleForgot} disabled={loading} style={{padding:'16px 0',background:`linear-gradient(135deg,#0891B2,${ACCENT})`,border:'none',borderRadius:14,color:'#fff',fontSize:17,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:54,opacity:loading?.6:1}}>{loading ? 'Sending...' : 'Send Reset Link'}</button>}
        </div>

        {/* Mode switches */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,marginTop:24}}>
          {mode === 'login' && <>
            <button onClick={()=>{setMode('register');setError('');setMessage('')}} style={{background:'none',border:'none',color:ACCENT,fontSize:15,cursor:'pointer',fontFamily:'inherit',padding:'8px 16px',minHeight:44}}>Create an account</button>
            <button onClick={()=>{setMode('forgot');setError('');setMessage('')}} style={{background:'none',border:'none',color:DIM,fontSize:13,cursor:'pointer',fontFamily:'inherit',padding:'8px 16px',minHeight:44}}>Forgot password?</button>
          </>}
          {(mode === 'register' || mode === 'forgot') && <button onClick={()=>{setMode('login');setError('');setMessage('')}} style={{background:'none',border:'none',color:ACCENT,fontSize:15,cursor:'pointer',fontFamily:'inherit',padding:'8px 16px',minHeight:44}}>← Back to sign in</button>}
        </div>

        {/* Footer */}
        <div style={{textAlign:'center',marginTop:40,fontSize:11,color:DIM,lineHeight:1.6}}>
          Prudence Safety & Environmental Consulting, LLC<br />
          Your data is encrypted and stored securely.
        </div>
      </div>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        *{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent;}
        button{-webkit-tap-highlight-color:transparent;}
        input::placeholder{color:#525A6A;}
        ::-webkit-scrollbar{width:0;height:0;}
      `}</style>
    </div>
  )
}
