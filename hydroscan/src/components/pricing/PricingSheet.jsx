/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * PricingSheet — token-styled plan picker. Starts a Stripe Checkout Session
 * via /api/checkout using the signed-in user's Supabase JWT.
 */

import { useState } from 'react'
import { I } from '../Icons'
import { R } from '../../styles/tokens'
import { TIERS } from './tiers'
import { supabase } from '../../utils/supabaseClient'

export default function PricingSheet({ open, onClose, currentPlan = 'free' }) {
  const [interval, setInterval] = useState('monthly')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  if (!open) return null

  const checkout = async (planId) => {
    setError(null)
    if (planId === 'free') return
    if (!supabase) { setError('Sign in to upgrade.'); return }
    setBusy(planId)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) { setError('Please sign in first.'); setBusy(null); return }
      const resp = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: planId, interval }),
      })
      const json = await resp.json()
      if (json.url) window.location.href = json.url
      else setError(json.error || 'Could not start checkout.')
    } catch (e) {
      setError(e?.message || 'Could not start checkout.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 270, background: '#000000DD', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', borderRadius: '20px 20px 0 0', border: '1px solid var(--border)', background: 'radial-gradient(140% 80% at 50% 0%, color-mix(in srgb, var(--accent) 8%, var(--card)) 0%, var(--card) 50%)', padding: '22px 18px calc(28px + env(safe-area-inset-bottom,0px))', animation: 'slideUp .3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>Plans</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--sub)', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--sub)', marginBottom: 14 }}>One report = one credit. Cancel anytime.</div>

        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: R.md, padding: 4, marginBottom: 16, width: 'fit-content' }}>
          {['monthly', 'annual'].map((iv) => (
            <button key={iv} onClick={() => setInterval(iv)} style={{ padding: '7px 16px', borderRadius: R.sm, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, background: interval === iv ? 'var(--accent-fill)' : 'transparent', color: interval === iv ? 'var(--on-accent-fill)' : 'var(--sub)' }}>
              {iv === 'monthly' ? 'Monthly' : 'Annual (2 mo free)'}
            </button>
          ))}
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TIERS.map((t) => {
            const price = interval === 'annual' ? t.priceAnnual : t.priceMonthly
            const isCurrent = t.id === currentPlan
            return (
              <div key={t.id} style={{ border: `1px solid ${t.recommended ? 'var(--accent)' : 'var(--border)'}`, borderRadius: R.lg, padding: 16, background: 'var(--card)', position: 'relative' }}>
                {t.recommended && <div style={{ position: 'absolute', top: -9, right: 14, fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--on-accent-fill)', background: 'var(--accent-fill)', padding: '3px 8px', borderRadius: R.pill }}>Recommended</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)' }}>{t.blurb}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>${price}</span>
                    <span style={{ fontSize: 11, color: 'var(--dim)' }}>/{interval === 'annual' ? 'yr' : 'mo'}</span>
                  </div>
                </div>
                <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {t.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--sub)' }}>
                      <I n="check" s={14} c="var(--accent)" /> {f}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => checkout(t.id)}
                  disabled={isCurrent || busy === t.id || t.id === 'free'}
                  style={{ width: '100%', padding: '11px 0', borderRadius: R.md, border: t.recommended ? 'none' : '1px solid var(--border)', cursor: isCurrent || t.id === 'free' ? 'default' : 'pointer', background: isCurrent ? 'var(--surface)' : t.recommended ? 'var(--accent-fill)' : 'transparent', color: isCurrent ? 'var(--dim)' : t.recommended ? 'var(--on-accent-fill)' : 'var(--text)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
                >
                  {isCurrent ? 'Current plan' : t.id === 'free' ? 'Free' : busy === t.id ? 'Starting…' : `Choose ${t.name}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
