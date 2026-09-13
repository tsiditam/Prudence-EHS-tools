/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * WelcomeScreen — four slides on what the tool does, before the first
 * assessment. On the app's current language (2026-09): the type scale, the
 * glass tile for the glyph, the shared button primitive, one accent (the
 * glyph and the active progress dot), and the page-in motion tokens.
 */
import { FULL_VH } from '../styles/tokens'
import * as V3 from '../styles/tokens'
import { useState } from 'react'
import { I } from './Icons'
import TactileButton from './ui/TactileButton'

const slides = [
  {
    icon: 'wind',
    title: 'Guided field assessment',
    body: 'Walk through a structured IAQ assessment one question at a time. Instrument readings, photos and observations, captured zone by zone with auto-save.',
  },
  {
    icon: 'pulse',
    title: 'Deterministic findings',
    body: 'Every finding is evaluated against recognized ventilation, comfort and exposure criteria, with full traceability from reading to conclusion and no black-box AI.',
  },
  {
    icon: 'chain',
    title: 'Causal pathway analysis',
    body: 'Related findings are connected into evidence-weighted pathways. The platform names contributing factors instead of listing disconnected items.',
  },
  {
    icon: 'report',
    title: 'Report-ready output',
    body: 'Structured findings, tiered recommendations, sampling plans and professional narratives, generated from your field data and ready for review before you leave the building.',
  },
]

export default function WelcomeScreen({ onComplete }) {
  const [step, setStep] = useState(0)
  const last = step === slides.length - 1
  const slide = slides[step]

  return (
    <div style={{ minHeight: FULL_VH, background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', paddingTop: 'env(safe-area-inset-top, 20px)', paddingBottom: 'env(safe-area-inset-bottom, 20px)' }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>

        {/* Brand */}
        <div style={{ marginBottom: 40 }}>
          <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)' }}>AtmosFlow</span>
        </div>

        {/* Slide — keyed so each one enters with the page-in motion. */}
        <div key={step} style={{ animation: 'fadeUp var(--dur-sheet) var(--ease-out)' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 22px',
            background: 'var(--glass-fill)', border: '1px solid var(--glass-edge)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <I n={slide.icon} s={26} c="var(--accent)" w={1.8} />
          </div>
          <div style={{ ...V3.T.title, marginBottom: 10 }}>{slide.title}</div>
          <div style={{ ...V3.T.bodyDim, lineHeight: '22px', maxWidth: 330, margin: '0 auto' }}>{slide.body}</div>
        </div>

        {/* Progress — the active dot is the one accent below the glyph. */}
        <div role="tablist" aria-label="Introduction" style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 32, marginBottom: 32 }}>
          {slides.map((sl, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={step === i}
              aria-label={sl.title}
              onClick={() => setStep(i)}
              style={{ width: step === i ? 20 : 6, height: 6, padding: 0, borderRadius: 3, border: 'none', cursor: 'pointer', background: step === i ? 'var(--accent)' : 'color-mix(in srgb, var(--text) 18%, transparent)', transition: 'width var(--dur-enter) var(--ease-out), background var(--dur-fast) ease' }}
            />
          ))}
        </div>

        {/* Actions — the shared primitive: one primary, the rest quiet. */}
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && <TactileButton variant="ghost" size="md" onClick={() => setStep(step - 1)}>Back</TactileButton>}
          {step === 0 && <TactileButton variant="ghost" size="md" onClick={onComplete}>Skip</TactileButton>}
          <TactileButton variant="primary" size="md" fullWidth haptic={last ? 'success' : 'light'} onClick={last ? onComplete : () => setStep(step + 1)}>
            {last ? 'Get started' : 'Next'}
          </TactileButton>
        </div>

        <div style={{ ...V3.T.captionDim, marginTop: 20 }}>Standards-driven IAQ assessment platform</div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}} @media (prefers-reduced-motion: reduce){*{animation:none!important;}}`}</style>
    </div>
  )
}
