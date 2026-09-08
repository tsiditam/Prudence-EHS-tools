/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperPromptPill — one item of the prompt row that sits just above
 * the AtmosFlow AI composer on an empty conversation: a short label on
 * a neutral capsule. The labels are verbs ("Draft report"), so they
 * carry no icon; the capsule radius is the one the composer's own
 * controls use, so the row and the toolbar read as one family.
 */

export default function JasperPromptPill({ label, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="jasper-prompt-pill"
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: 44, padding: '0 18px', flexShrink: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        color: 'var(--text)', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
        letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        WebkitTapHighlightColor: 'transparent',
        transition: 'background 160ms ease, border-color 160ms ease',
      }}>
      {label}
    </button>
  )
}
