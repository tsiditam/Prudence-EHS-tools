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

const inp = {width:'100%',padding:'18px 20px',background:BG,border:`1.5px solid ${BORDER}`,borderRadius:14,color:TEXT,fontSize:17,fontFamily:'inherit',fontWeight:500,outline:'none',boxSizing:'border-box'}

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

  // Google OAuth via Supabase. The provider config (client ID/secret)
  // lives in the Supabase dashboard → Authentication → Providers →
  // Google. Once enabled, this call redirects the browser to Google's
  // consent screen; Supabase handles the callback at /auth/v1/callback
  // and sets the session via detectSessionInUrl on return. The
  // AuthContext picks up the new session automatically.
  const handleGoogleSignIn = async () => {
    // In register mode, hold the user to the same ToS gate the
    // email/password register flow enforces.
    if (mode === 'register' && !tosAccepted) {
      setError('Please accept the Terms of Service and Privacy Policy')
      return
    }
    setLoading(true); setError('')
    const { supabase } = await import('../utils/supabaseClient')
    if (!supabase) { setError('Service not configured'); setLoading(false); return }
    trackEvent(mode === 'register' ? 'signup_started' : 'signin_started', { method: 'google' })
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    })
    if (err) {
      setLoading(false)
      setError(err.message || 'Google sign-in failed')
    }
    // On success the browser navigates away; no further state to set.
  }

  return (
    <div style={{minHeight:'100vh',background:BG,color:TEXT,fontFamily:"'inherit', system-ui",padding:'0 24px',paddingTop:'env(safe-area-inset-top, 20px)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{maxWidth:400,width:'100%',animation:'fadeUp .5s ease'}}>
        {/* Brand */}
        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{fontSize:36,fontWeight:800,marginBottom:8}}>AtmosFlow</div>
          <div style={{fontSize:13,color:SUB,marginBottom:12,lineHeight:1.5,padding:'0 8px'}}>
            Field-grade indoor air quality screening, assessment, and incident documentation for IH and EHS professionals.
          </div>
          <div style={{fontSize:14,color:SUB}}>
            {mode === 'login' ? 'Sign in to your account' : mode === 'register' ? 'Create your account' : 'Reset your password'}
          </div>
        </div>

        {/* Messages */}
        {error && <div style={{padding:'12px 16px',background:`${ERR}12`,border:`1px solid ${ERR}30`,borderRadius:12,marginBottom:16,fontSize:14,color:ERR}}>{error}</div>}
        {message && <div style={{padding:'12px 16px',background:`${ACCENT}12`,border:`1px solid ${ACCENT}30`,borderRadius:12,marginBottom:16,fontSize:14,color:ACCENT}}>{message}</div>}

        {/* OAuth providers — login + register only. Password reset
            doesn't apply to OAuth identities so we hide it in
            forgot-password mode. */}
        {mode !== 'forgot' && <>
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            aria-label={mode === 'register' ? 'Sign up with Google' : 'Sign in with Google'}
            style={{
              width:'100%',padding:'14px 16px',
              background:'#FFFFFF',border:'1px solid #DADCE0',borderRadius:14,
              color:'#1F1F1F',fontSize:15,fontWeight:600,cursor:loading?'wait':'pointer',
              fontFamily:'inherit',minHeight:54,
              display:'flex',alignItems:'center',justifyContent:'center',gap:12,
              opacity:loading?0.6:1,marginBottom:16,
            }}>
            {/* Google 'G' mark — official multi-color SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.20c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,color:DIM,fontSize:11,fontWeight:500,letterSpacing:'0.5px'}}>
            <div style={{flex:1,height:1,background:BORDER}} />
            <span>OR</span>
            <div style={{flex:1,height:1,background:BORDER}} />
          </div>
        </>}

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
          {mode === 'login' && <button onClick={handleLogin} disabled={loading} style={{padding:'16px 0',background:'var(--accent-fill)',border:'none',borderRadius:14,color:'var(--on-accent-fill)',fontSize:17,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minHeight:54,opacity:loading?.6:1}}>{loading ? 'Signing in...' : 'Sign In'}</button>}
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
