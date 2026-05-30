/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AuthScreen — Supabase email/password + Google OAuth.
 *
 * Visual surface redesigned to the Phase 2 sign-in spec
 * (Figma 6tSbrfaF1LDfnBrwz3up9h): production AtmosFlow logo,
 * "FIELD-GRADE IAQ INTELLIGENCE" tagline, atmospheric SVG backdrop,
 * floating-label inputs with cyan focus ring + glow, trust strip,
 * cyan-glow Sign In CTA, inline alert iconography. All flow logic
 * (login / register / forgot, Google OAuth, ToS gate, password
 * visibility toggle, error / message banners, autocomplete + ARIA
 * markup) is preserved unchanged from the pre-redesign component.
 *
 * Theme: tokens stay theme-aware (var(--bg) / var(--accent) /
 * var(--border) / var(--sub) / var(--dim)) so the v3.2 light/dark
 * toggle continues to flip this surface.
 *
 * Accessibility: every interactive element carries an explicit
 * aria-label or implicit text. Form CTA carries aria-busy on submit.
 * Focus ring uses :focus-visible-equivalent state (tracked via
 * focusedField) so touch users don't see a focus ring after tapping.
 * Reduced-motion users get instant transitions via the prefers-
 * reduced-motion media query in the keyframe block.
 */

import { useState } from 'react'
import Storage from '../utils/cloudStorage'
import { trackEvent } from '../utils/supabaseClient'
import * as V3 from '../styles/tokens'

const BG = V3.BG_BASE
const SURFACE = V3.SURFACE
const ACCENT = 'var(--accent)'
const TEXT = V3.TEXT_PRIMARY
const SUB = V3.TEXT_TERTIARY
const DIM = V3.TEXT_MUTED
const ERR = V3.SEVERITY.critical

// AtmosFlow brand mark — wordmark with the "o" in "Flow" replaced by
// an inline cyan brain icon. Inlined as SVG (vs. an external <img>
// reference) so the auth screen renders the brand without any asset-
// upload dependency. Sora Bold for the wordmark; brain icon scaled
// to the lowercase x-height of the surrounding text so it sits inline
// rather than floating above or below the baseline.
const BrainGlyph = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: 'block' }}>
    <g stroke="#0A0A0A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M 38 14 C 28 14, 18 18, 14 28 C 11 32, 12 38, 16 42 C 13 46, 13 52, 18 56 C 24 62, 32 64, 38 62 Z" fill="var(--accent)"/>
      <path d="M 42 14 C 52 14, 62 18, 66 28 C 69 32, 68 38, 64 42 C 67 46, 67 52, 62 56 C 56 62, 48 64, 42 62 Z" fill="var(--accent)"/>
      <path d="M 22 22 Q 26 26, 22 30 Q 18 34, 24 38" fill="none"/>
      <path d="M 28 22 Q 32 28, 27 34 Q 22 40, 28 46" fill="none"/>
      <path d="M 20 46 Q 24 50, 22 56" fill="none"/>
      <path d="M 58 22 Q 54 26, 58 30 Q 62 34, 56 38" fill="none"/>
      <path d="M 52 22 Q 48 28, 53 34 Q 58 40, 52 46" fill="none"/>
      <path d="M 60 46 Q 56 50, 58 56" fill="none"/>
    </g>
  </svg>
)

const AtmosFlowMark = () => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Sora', 'Inter', system-ui, sans-serif",
    fontSize: 44, fontWeight: 700,
    color: 'var(--text)',
    letterSpacing: '-0.045em',
    lineHeight: 1,
    gap: 1,
  }}>
    <span>AtmosFl</span>
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 44, width: 36, margin: '0 -2px' }}>
      <BrainGlyph size={36} />
    </span>
    <span>w</span>
  </div>
)
const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

// Atmospheric backdrop — faint cyan arcs and particles at the canvas
// edges, behind all content. preserveAspectRatio='none' stretches the
// viewBox to the actual screen height so the curves stay anchored to
// the right edge on tall devices.
const AtmosBackdrop = () => (
  <svg width="100%" height="100%" viewBox="0 0 393 940" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:0}}>
    <path d="M 410 60 Q 380 120 410 200" fill="none" stroke="var(--accent)" strokeWidth="1.2" opacity="0.24"/>
    <path d="M 410 200 Q 360 280 420 380" fill="none" stroke="var(--accent)" strokeWidth="0.9" opacity="0.14"/>
    <path d="M 420 420 Q 370 500 420 600" fill="none" stroke="var(--accent)" strokeWidth="0.7" opacity="0.10"/>
    <path d="M -30 720 Q 20 760 -20 820" fill="none" stroke="var(--accent)" strokeWidth="0.9" opacity="0.14"/>
    <circle cx="380" cy="320" r="1.5" fill="var(--accent)" opacity="0.45"/>
    <circle cx="22" cy="640" r="1" fill="var(--accent)" opacity="0.32"/>
    <circle cx="50" cy="80" r="1" fill="var(--accent)" opacity="0.28"/>
  </svg>
)

// Password visibility toggle. `open` = currently showing plaintext;
// renders the eye-with-slash glyph. Outlined-eye + slash pattern is
// the near-universal show/hide affordance — the previous concentric-
// rings glyph read as a reticle/target (per expert design review)
// and added cognitive load on the field most costly to mistype.
const EyeIcon = ({ open, color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
    <circle cx="12" cy="12" r="3"/>
    {open && <line x1="4" y1="20" x2="20" y2="4"/>}
  </svg>
)

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M2 6 L5 9 L10 3" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="none" stroke={ERR} strokeWidth="1.5"/>
    <line x1="8" y1="4.5" x2="8" y2="9" stroke={ERR} strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="8" cy="11.5" r="0.8" fill={ERR}/>
  </svg>
)

const Spinner = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{animation:'auth-spin 1.2s linear infinite'}}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.2"/>
    <path d="M21 12 a9 9 0 0 0 -9 -9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
)

// Floating-label field. Module-level so React preserves DOM identity
// across renders — defining this inside AuthScreen would re-create the
// component on every keystroke and steal focus from the active input.
function Field({ name, label, type, value, onChange, autoComplete, placeholder, focusedField, setFocusedField, clearError, trailing, onKeyDown }) {
  const focused = focusedField === name
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          width: '100%',
          padding: '11px 20px',
          background: SURFACE,
          border: `1.5px solid ${focused ? ACCENT : 'var(--border)'}`,
          borderRadius: 14,
          minHeight: 64,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
          boxShadow: focused ? '0 0 0 4px color-mix(in srgb, var(--accent) 15%, transparent)' : 'none',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
            color: focused ? ACCENT : SUB,
            textTransform: 'uppercase',
            transition: 'color 150ms ease',
          }}
        >{label}</div>
        <input
          type={type}
          value={value}
          onChange={e => { onChange(e.target.value); clearError() }}
          onFocus={() => setFocusedField(name)}
          onBlur={() => setFocusedField(null)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete={autoComplete}
          style={{
            border: 'none', background: 'transparent', outline: 'none',
            color: TEXT, fontSize: 16, fontFamily: 'inherit', fontWeight: 500,
            padding: 0, width: '100%', boxSizing: 'border-box',
            paddingRight: trailing ? 36 : 0,
          }}
        />
      </div>
      {trailing && (
        <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {trailing}
        </div>
      )}
    </div>
  )
}

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login') // login | register | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [tosAccepted, setTosAccepted] = useState(false)
  const [focusedField, setFocusedField] = useState(null)

  const clearError = () => setError('')

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

  // Google OAuth via Supabase. Provider config lives in the Supabase
  // dashboard → Authentication → Providers → Google. On success the
  // browser navigates to Google's consent screen; Supabase handles the
  // callback at /auth/v1/callback and sets the session via
  // detectSessionInUrl. AuthContext picks up the new session.
  const handleGoogleSignIn = async () => {
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
  }

  // Per-mode microcopy. Tagline doubles as the mode indicator —
  // "FIELD-GRADE IAQ INTELLIGENCE" on the default login view,
  // "CREATE YOUR ACCOUNT" or "RESET YOUR PASSWORD" on the alt modes.
  const tagline = mode === 'login'
    ? 'FIELD-GRADE INDOOR ENVIRONMENTAL QUALITY INTELLIGENCE'
    : mode === 'register' ? 'CREATE YOUR ACCOUNT' : 'RESET YOUR PASSWORD'
  const cta = mode === 'login'
    ? { label: loading ? 'Signing in…' : 'Sign In', onClick: handleLogin }
    : mode === 'register'
      ? { label: loading ? 'Creating account…' : 'Create Account', onClick: handleRegister }
      : { label: loading ? 'Sending…' : 'Send Reset Link', onClick: handleForgot }
  const googleLabel = mode === 'register' ? 'Sign up with Google' : 'Continue with Google'

  return (
    <div data-auth-version="phase2-redesign" style={{
      minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'inherit',
      position: 'relative', overflowX: 'hidden',
      paddingTop: 'env(safe-area-inset-top, 20px)',
      paddingBottom: 'env(safe-area-inset-bottom, 20px)',
    }}>
      <AtmosBackdrop />

      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: 400, margin: '0 auto', padding: '0 24px',
        animation: 'auth-fadeUp .5s ease',
      }}>
        {/* Header — intentional 8-px vertical rhythm.
            Logo at 52 px tall · 24 px gap to tagline · 8 px to underline.
            Top padding 48 (safe-area-inset-top adds OS-defined space
            above, so 48 here is enough breathing room — total ~88-100 px
            from device top). Bottom padding 32 separates the brand
            block from the form below.
            PNG is the trimmed 799x147 wordmark; at height: 52 it renders
            ~283 px wide (52 * 5.44), comfortably proportional inside the
            345 px content frame without hugging the edges. */}
        <div style={{ textAlign: 'center', paddingTop: 48, paddingBottom: 32 }}>
          <img
            src="/icons/atmosflow-logo.png"
            alt="AtmosFlow"
            style={{
              display: 'block',
              margin: '0 auto',
              height: 52,
              width: 'auto',
              maxWidth: '100%',
            }}
          />
          <div style={{
            fontSize: 11, fontWeight: 600, color: ACCENT,
            marginTop: 24, letterSpacing: '0.16em',
            lineHeight: 1.5, maxWidth: 320,
            marginLeft: 'auto', marginRight: 'auto',
          }}>{tagline}</div>
          <div style={{ width: 44, height: 2, background: ACCENT, borderRadius: 1, margin: '8px auto 0' }} />
        </div>

        {/* Status banners */}
        {error && (
          <div role="alert" style={{
            padding: '12px 16px',
            background: `color-mix(in srgb, ${ERR} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${ERR} 30%, transparent)`,
            borderRadius: 12, marginBottom: 16,
            fontSize: 13, color: ERR, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 10,
            animation: 'auth-banner .22s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div role="status" style={{
            padding: '12px 16px',
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            borderRadius: 12, marginBottom: 16,
            fontSize: 13, color: ACCENT, fontWeight: 600,
            animation: 'auth-banner .22s cubic-bezier(0.4,0,0.2,1)',
          }}>{message}</div>
        )}

        {/* Form — email/password primary path. Google SSO repositioned
            below Sign In as a smaller secondary CTA (founder direction).
            The OR divider was removed since the visual hierarchy now
            speaks for itself: large cyan Sign In = primary, small
            outlined Google = secondary. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field
            name="email"
            label="EMAIL ADDRESS"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder=""
            focusedField={focusedField}
            setFocusedField={setFocusedField}
            clearError={clearError}
          />

          {mode !== 'forgot' && (
            <Field
              name="password"
              label={mode === 'register' ? 'PASSWORD · 8+ CHARACTERS' : 'PASSWORD'}
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? 'Create a password' : 'Enter password'}
              focusedField={focusedField}
              setFocusedField={setFocusedField}
              clearError={clearError}
              onKeyDown={e => { if (e.key === 'Enter' && mode === 'login') handleLogin() }}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                  style={{
                    width: 44, height: 44,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent', padding: 0,
                  }}
                >
                  <EyeIcon open={showPw} color={showPw ? 'var(--accent)' : SUB} />
                </button>
              }
            />
          )}

          {mode === 'register' && (
            <Field
              name="confirmPw"
              label="CONFIRM PASSWORD"
              type={showPw ? 'text' : 'password'}
              value={confirmPw}
              onChange={setConfirmPw}
              autoComplete="new-password"
              placeholder="Re-enter password"
              focusedField={focusedField}
              setFocusedField={setFocusedField}
              clearError={clearError}
            />
          )}

          {mode === 'register' && (
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              fontSize: 12, color: SUB, lineHeight: 1.5,
              cursor: 'pointer', padding: '6px 0',
            }}>
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={e => setTosAccepted(e.target.checked)}
                style={{ marginTop: 3, accentColor: 'var(--accent)', flexShrink: 0, width: 16, height: 16 }}
              />
              <span>I agree to the Terms of Service and Privacy Policy</span>
            </label>
          )}

          {/* Primary CTA — cyan fill, restrained glow, mode-aware label.
              Sized down (56→48 h, 16→15 font) per founder direction so
              the CTA reads as confident rather than oversized. */}
          <button
            type="submit"
            onClick={cta.onClick}
            disabled={loading}
            aria-busy={loading}
            style={{
              width: '100%', padding: '12px 0', marginTop: 6,
              background: ACCENT, border: 'none', borderRadius: 14,
              color: 'var(--on-accent-fill, #07080C)',
              fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
              cursor: loading ? 'wait' : 'pointer',
              minHeight: 48,
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 3px 10px -3px color-mix(in srgb, var(--accent) 22%, transparent)',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'opacity 150ms ease, transform 100ms ease',
            }}
          >
            {loading && <Spinner />}
            {cta.label}
          </button>

          {/* Secondary SSO — Google. Repositioned below Sign In and
              styled as a quiet outlined button (transparent + border)
              so the email/password path is unambiguously the primary
              flow. Hidden in forgot-password mode (no OAuth path). */}
          {mode !== 'forgot' && (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              aria-label={googleLabel}
              style={{
                width: '100%', padding: '0 14px',
                background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 12,
                color: TEXT, fontSize: 13, fontWeight: 500,
                cursor: loading ? 'wait' : 'pointer',
                fontFamily: 'inherit', minHeight: 42,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                opacity: loading ? 0.6 : 1,
                transition: 'opacity 150ms ease, border-color 150ms ease, background 150ms ease',
              }}
            >
              <GoogleG />
              {googleLabel}
            </button>
          )}
        </div>

        {/* Mode switcher — login mode renders Create-an-account and
            Forgot user-ID/Password as a single-line pair separated by
            a pipe, both bold white underlined in Sora per founder
            direction. Each side is its own button with a 44-px tap
            target. Register / forgot modes keep the dedicated
            back-to-sign-in link below. */}
        {mode === 'login' && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 0, marginTop: 22,
            whiteSpace: 'nowrap',
          }}>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setMessage('') }}
              style={{
                background: 'none', border: 'none', color: ACCENT,
                fontFamily: "'Sora', 'Inter', system-ui, sans-serif",
                fontSize: 12, fontWeight: 400, letterSpacing: '0',
                textDecoration: 'underline', textUnderlineOffset: 3,
                textDecorationThickness: 1,
                cursor: 'pointer', padding: '10px 0', minHeight: 44,
                whiteSpace: 'nowrap',
                WebkitTapHighlightColor: 'transparent',
              }}
            >Create an account</button>
            <span style={{
              color: ACCENT,
              fontFamily: "'Sora', 'Inter', system-ui, sans-serif",
              fontSize: 12, fontWeight: 400,
              userSelect: 'none', padding: '0 4px',
            }}>|</span>
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); setMessage('') }}
              style={{
                background: 'none', border: 'none', color: ACCENT,
                fontFamily: "'Sora', 'Inter', system-ui, sans-serif",
                fontSize: 12, fontWeight: 400, letterSpacing: '0',
                textDecoration: 'underline', textUnderlineOffset: 3,
                textDecorationThickness: 1,
                cursor: 'pointer', padding: '10px 0', minHeight: 44,
                whiteSpace: 'nowrap',
                WebkitTapHighlightColor: 'transparent',
              }}
            >Forgot user ID/Password</button>
          </div>
        )}
        {(mode === 'register' || mode === 'forgot') && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setMessage('') }}
              style={{
                background: 'none', border: 'none', color: TEXT,
                fontFamily: "'Sora', 'Inter', system-ui, sans-serif",
                fontSize: 10, fontWeight: 400, letterSpacing: '0',
                textDecoration: 'underline', textUnderlineOffset: 2,
                textDecorationThickness: 1,
                cursor: 'pointer', padding: '10px 16px', minHeight: 44,
                display: 'flex', alignItems: 'center', gap: 6,
                WebkitTapHighlightColor: 'transparent',
              }}
            >← Back to sign in</button>
          </div>
        )}

        {/* Trust strip — login only. Sign-up and forgot intentionally cleaner.
            Header softened from "Trusted by" to "Built for" (pre-beta — earn
            the stronger social-proof claim back once real users + logos +
            a named CIH advisor can substantiate it). Chip rewrites speak
            the IH/EHS buyer's actual trust language: standards alignment,
            human-in-the-loop AI, screening-only positioning. Chips now
            stack vertically so the longer labels (e.g. "ASHRAE & NIOSH-
            Aligned") never wrap mid-phrase. */}
        {mode === 'login' && (
          <div style={{
            marginTop: 26, padding: '16px 18px',
            background: 'color-mix(in srgb, var(--surface) 65%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
            borderRadius: 14,
            display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: SUB, letterSpacing: '0.12em' }}>
              BUILT FOR IH &amp; EHS PROFESSIONALS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              {['ASHRAE & NIOSH-Aligned', 'AI-Assisted, IH-Reviewed', 'Screening-Only'].map(label => (
                <div key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CheckIcon />
                  <span style={{ fontSize: 12, fontWeight: 500, color: ACCENT, whiteSpace: 'nowrap' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer — bumped from var(--dim) (#4A5160, ~3.5:1 on bg) to
            var(--sub) (#6B7380, ~4.65:1) so the maker-credibility line
            clears WCAG 2.2 AA contrast (4.5:1 for normal text). The
            footer is where Prudence-EHS makerhood lives; burying it in
            the lowest-contrast text on the page contradicted the brand. */}
        <div style={{
          textAlign: 'center', marginTop: 22, marginBottom: 24,
          fontSize: 10, fontWeight: 400, color: SUB, letterSpacing: '0.02em',
        }}>
          Built by Prudence EHS · Secure · Private · Professional
        </div>
      </div>

      <style>{`
        @keyframes auth-fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes auth-spin{from{transform:rotate(0);}to{transform:rotate(360deg);}}
        @keyframes auth-banner{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}
        @media (prefers-reduced-motion: reduce){
          *,*:before,*:after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;}
        }
        *{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent;}
        button{-webkit-tap-highlight-color:transparent;}
        /* Placeholder color uses solid var(--sub) (no opacity reduction) so
           the email/password placeholders clear WCAG 2.2 AA contrast against
           the input surface. Pre-fix the 55% opacity dragged the effective
           ratio under 3:1 on dark mode — the expert review flagged this. */
        input::placeholder{color:var(--sub);}
        ::-webkit-scrollbar{width:0;height:0;}
      `}</style>
    </div>
  )
}
