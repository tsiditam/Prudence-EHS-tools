/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SaveSitePrompt — the finalize-time BottomSheet that closes the
 * Investment → Trigger arc of the connectivity-layer Hook (PR 1).
 *
 * Rendered by MobileApp.finishAssessment after the report row is
 * persisted, before the user lands on the results view. The
 * default-checked "Save site" radio + 12-month interval is the
 * frictionless path; "Not now" still emits assessment_finalized
 * (for analytics) but without a site_id so no reminder is enqueued.
 *
 * No engine touched. No score animation altered. This is purely a
 * consent + persistence surface.
 */

import { useState } from 'react'
import * as V3 from '../styles/tokens'
import { I } from './Icons'
import GlassCard from './ui/GlassCard'
import TactileButton from './ui/TactileButton'

/**
 * Props:
 *   open:        boolean — show/hide
 *   bldg:        the building object { fn, address?, type? }
 *   onSave:      (siteInput) => Promise<{ site }> — called with
 *                { name, address, building_type, reassessment_interval_months }
 *   onDismiss:   () => void — called when user picks "Not now"
 */
export default function SaveSitePrompt({ open, bldg, onSave, onDismiss }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Lazy hydration on first open (avoids resetting if the user
  // closes/reopens with different bldg).
  if (open && name === '' && bldg && bldg.fn) {
    // setState during render is safe here only because the next line
    // is a no-op when bldg.fn matches the prior name; React will
    // re-render once.
    setTimeout(() => setName(String(bldg.fn).trim()), 0)
  }

  if (!open) return null

  const handleSave = async () => {
    if (!name.trim()) { setError('Site name is required.'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        address: (bldg && bldg.address) ? String(bldg.address) : null,
        building_type: (bldg && bldg.type) ? String(bldg.type) : null,
        reassessment_interval_months: 12,
      })
    } catch (e) {
      setError((e && e.message) || 'Could not save site. You can retry from Settings → Sites.')
      setSaving(false)
      return
    }
    setSaving(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Save site to your library"
      style={{
        position: 'fixed', inset: 0, zIndex: 350,
        background: 'rgba(8, 10, 14, 0.78)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 12px',
      }}
    >
      <GlassCard
        style={{
          width: '100%', maxWidth: 520,
          margin: 'auto 0 calc(env(safe-area-inset-bottom, 0px) + 16px)',
          padding: 22,
          borderRadius: 18,
          animation: 'fadeUp .28s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:'var(--accent-soft, rgba(34,211,238,0.12))',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <I n="bldg" s={20} c="var(--accent)" w={1.8} />
          </div>
          <div style={{...V3.T.h2}}>Save site to your library?</div>
        </div>

        <div style={{...V3.T.bodyDim, marginBottom: 14}}>
          AtmosFlow can remind you when this site is due for re-assessment
          (annually, by default). You can change cadence or pause reminders
          any time in Settings → Sites.
        </div>

        <label style={{display:'block', marginBottom: 14}}>
          <div style={{...V3.T.captionDim, marginBottom: 6}}>Site name</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={bldg && bldg.fn ? String(bldg.fn) : 'Site name'}
            style={{
              width: '100%', padding: '12px 14px',
              borderRadius: 10,
              border: '1.5px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 15, fontFamily: 'inherit',
              minHeight: 46,
            }}
          />
        </label>

        <div style={{
          ...V3.T.captionDim,
          padding: '10px 12px',
          background: 'var(--card)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          marginBottom: 16,
        }}>
          Reminder cadence: <span style={{color:'var(--text)', fontWeight:600}}>every 12 months</span> (default)
        </div>

        {error && (
          <div style={{...V3.T.captionDim, color:'#F59E0B', marginBottom: 10}}>{error}</div>
        )}

        <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
          <TactileButton
            variant="primary"
            fullWidth size="lg"
            disabled={saving}
            onClick={handleSave}
            haptic="success"
            icon={<I n="bookmark" s={16} c="var(--primary-cta-icon, #0B1014)" w={2} />}
          >
            {saving ? 'Saving site…' : 'Save site'}
          </TactileButton>
          <TactileButton
            variant="ghost"
            fullWidth
            disabled={saving}
            onClick={onDismiss}
          >
            Not now
          </TactileButton>
        </div>
      </GlassCard>
    </div>
  )
}
