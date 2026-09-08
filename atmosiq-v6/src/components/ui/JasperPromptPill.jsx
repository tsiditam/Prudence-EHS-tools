/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperPromptPill — one item of the prompt row that sits just above
 * the AtmosFlow AI composer on an empty conversation: an icon and a
 * short bold label on a soft neutral tile (the Grok / ChatGPT
 * "capability pill" pattern). Replaces the stacked suggestion cards,
 * which took the whole canvas to say three things.
 *
 * Neutral by design — the row is a launchpad, not a status display, so
 * it carries no accent; the icon sits in the secondary ink and the label
 * in the primary. The host mounts JASPER_KEYFRAMES_CSS for the reveal.
 */

import { I } from '../Icons'

export default function JasperPromptPill({ icon, label, onClick, disabled = false, revealDelayMs = 0 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="jasper-prompt-pill jasper-stagger"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        height: 50, padding: '0 20px 0 16px', flexShrink: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        color: 'var(--text)', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
        letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        WebkitTapHighlightColor: 'transparent',
        transition: 'background 160ms ease, border-color 160ms ease',
        animation: 'jasperReveal 420ms ease-out both',
        animationDelay: `${revealDelayMs}ms`,
      }}>
      <I n={icon} s={19} c="var(--sub)" w={1.9} />
      <span>{label}</span>
    </button>
  )
}
