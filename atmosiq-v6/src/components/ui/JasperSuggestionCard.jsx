/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperSuggestionCard — the redesigned "Try one of these" card from
 * the AtmosFlow AI empty state. Icon tile + uppercase category label
 * + question body. Hover/focus state lifts the card 1px and adds a
 * soft cyan glow (CSS rules live in JASPER_KEYFRAMES_CSS so the host
 * surface must mount that block somewhere in its tree).
 *
 * Extracted from FieldAssistant during the Phase 4 design-system
 * pass. Reusable for any inline-AI widget that wants to seed a
 * conversation with curated prompts.
 */

import { I } from '../Icons'

export default function JasperSuggestionCard({
  category,
  icon,
  text,
  onClick,
  disabled = false,
  // Stagger reveal delay (ms). Pass an index-derived value when
  // rendering a list so cards flow in one after the other.
  revealDelayMs = 0,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="jasper-suggestion jasper-stagger"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        width: '100%', textAlign: 'left',
        padding: '12px 14px', marginBottom: 8,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer',
        lineHeight: 1.45,
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, background 160ms ease',
        animation: 'jasperReveal 500ms ease-out both',
        animationDelay: `${revealDelayMs}ms`,
      }}>
      <span className="jasper-suggestion__icon"
        style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 160ms ease',
        }}>
        <I n={icon} s={16} c="var(--accent)" w={1.9} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block',
          fontSize: 10, fontWeight: 700, color: 'var(--accent)',
          letterSpacing: '0.55px', textTransform: 'uppercase',
          marginBottom: 3,
        }}>
          {category}
        </span>
        <span style={{ display: 'block', color: 'var(--text)', fontWeight: 500 }}>
          {text}
        </span>
      </span>
    </button>
  )
}
