/**
 * PricingSheet — four-tier pricing UI with monthly/annual toggle.
 *
 * Free / Solo / Pro / Practice. The annual toggle changes displayed
 * prices and the body sent to /api/checkout. The "Choose X" button
 * for the user's CURRENT plan becomes "Current Plan" and is disabled;
 * other paid tiers route through the Stripe Customer Portal (handled
 * by the Manage Subscription button on Settings).
 *
 * For a free-tier user choosing Free: this is a no-op; close the sheet.
 * For any user choosing a paid tier: POST to /api/checkout with
 * { plan, billing_period, userId, userEmail } and redirect to the
 * Stripe Checkout session URL.
 */

import { useState } from 'react'
import { TIERS, formatUsd, annualSavingsPercent } from './tiers'

const BG = '#07080C'
const SURFACE = '#0D0E14'
const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const TEXT = '#ECEEF2'
const SUB = '#8B93A5'
const DIM = '#6B7380'

export default function PricingSheet({ profile, credits = 0, onClose, contentMax = 480 }) {
  const [billingPeriod, setBillingPeriod] = useState('monthly')
  const isAnnual = billingPeriod === 'annual'
  const currentPlan = profile?.plan || 'free'

  const handleChoose = async (tierId) => {
    if (tierId === 'free') {
      // Free is the default state; closing the sheet is the action.
      onClose && onClose()
      return
    }
    if (tierId === currentPlan) {
      // Same-tier picks should route through Customer Portal for plan
      // changes (period switch, payment method update). The button
      // gets relabeled "Current Plan" so we shouldn't normally land here.
      onClose && onClose()
      return
    }
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: tierId,
          billing_period: billingPeriod,
          userId: profile?.id,
          userEmail: profile?.email,
          returnUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
      })
      const data = await res.json()
      if (data.url && typeof window !== 'undefined') {
        window.location.href = data.url
      } else {
        // eslint-disable-next-line no-alert
        alert(data.error || 'Payment setup failed. Please try again.')
      }
    } catch {
      // eslint-disable-next-line no-alert
      alert('Payment setup failed. Please try again.')
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#000000DD', zIndex: 250, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: contentMax, background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', padding: '24px 20px', paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))', animation: 'fadeUp .3s ease' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Choose Your Plan</div>
        <div style={{ fontSize: 12, color: SUB, marginBottom: 16, lineHeight: 1.5 }}>
          Each plan includes monthly assessment credits. Credits are consumed when you finalize an assessment or generate an AI narrative. Drafts, review, and navigation are always free.
        </div>

        {/* Balance */}
        <div style={{ padding: '8px 14px', background: SURFACE, borderRadius: 8, border: `1px solid ${BORDER}`, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: SUB }}>Your balance</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT, fontFamily: "var(--font-mono)" }}>{credits} credit{credits !== 1 ? 's' : ''}</span>
        </div>

        {/* Monthly / Annual toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setBillingPeriod('monthly')}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              background: !isAnnual ? `${ACCENT}18` : SURFACE,
              border: `1px solid ${!isAnnual ? ACCENT : BORDER}`,
              color: !isAnnual ? ACCENT : SUB, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', minHeight: 36,
            }}
          >Monthly</button>
          <button
            onClick={() => setBillingPeriod('annual')}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              background: isAnnual ? `${ACCENT}18` : SURFACE,
              border: `1px solid ${isAnnual ? ACCENT : BORDER}`,
              color: isAnnual ? ACCENT : SUB, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', minHeight: 36,
            }}
          >Annual — Save {annualSavingsPercent()}%</button>
        </div>

        {TIERS.map(tier => {
          const price = isAnnual ? tier.annual : tier.monthly
          const periodLabel = tier.id === 'free' ? '' : (isAnnual ? '/yr' : '/mo')
          const isCurrent = tier.id === currentPlan
          const ctaLabel = isCurrent ? 'Current Plan' : tier.cta
          return (
            <button
              key={tier.id}
              onClick={() => !isCurrent && handleChoose(tier.id)}
              disabled={isCurrent}
              style={{
                width: '100%', padding: '14px 18px',
                background: tier.popular ? `${ACCENT}08` : SURFACE,
                border: `1px solid ${tier.popular ? ACCENT + '30' : BORDER}`,
                borderRadius: 12, marginBottom: 8,
                cursor: isCurrent ? 'default' : 'pointer',
                opacity: isCurrent ? 0.7 : 1,
                textAlign: 'left', fontFamily: 'inherit', position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              {tier.popular && (
                <div style={{ position: 'absolute', top: -8, right: 16, padding: '2px 10px', borderRadius: 6, background: '#F97316', color: '#000', fontSize: 9, fontWeight: 700 }}>
                  MOST POPULAR
                </div>
              )}
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>
                  {tier.name} <span style={{ fontWeight: 500, color: SUB }}>— {tier.credits} credit{tier.credits !== 1 ? 's' : ''}/mo</span>
                </div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{tier.blurb}</div>
                {isAnnual && tier.id !== 'free' && (
                  <div style={{ fontSize: 9, color: DIM, marginTop: 2, fontFamily: "var(--font-mono)" }}>billed yearly</div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: tier.id === 'free' ? SUB : ACCENT }}>
                  {formatUsd(price)}
                </div>
                <div style={{ fontSize: 9, color: DIM, fontFamily: "var(--font-mono)" }}>
                  {periodLabel || 'forever'}
                </div>
                <div style={{ fontSize: 10, color: tier.popular ? ACCENT : SUB, marginTop: 4, fontWeight: 600 }}>
                  {ctaLabel}
                </div>
              </div>
            </button>
          )
        })}

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 10, color: DIM, lineHeight: 1.6 }}>
          Unused credits roll over monthly while your plan is active.<br />
          Secure checkout powered by Stripe.
        </div>
      </div>
    </div>
  )
}
