/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperContextChip — small pill used to surface what the AtmosFlow
 * AI assistant knows about the user's current situation: facility,
 * status, zone, measurement signals. Three tones (accent / warn /
 * success) map to the JASPER_CHIP_TONES palette so the chip's
 * semantic role is always derived from one source.
 *
 * Extracted from FieldAssistant during the Phase 4 design-system
 * pass. Other AI surfaces (JasperWatchPanel, future inline-AI
 * widgets) can adopt the chip without re-copying the inline styles.
 */

import { I } from '../Icons'
import { JASPER_CHIP_TONES } from '../../styles/jasper-tokens'

export default function JasperContextChip({
  label, tone = 'accent', icon, maxWidth = 200,
  // When supplied, the chip renders as a tappable <button> with a
  // trailing chevron and gains a hover/active state. Used by the
  // facility chip's "switch assessment" affordance — same primitive,
  // just an interactive variant.
  onClick,
  ariaLabel,
}) {
  const palette = JASPER_CHIP_TONES[tone] || JASPER_CHIP_TONES.accent
  const baseStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 9px 4px 7px', borderRadius: 999,
    background: palette.bg, border: `1px solid ${palette.bd}`,
    fontSize: 11, lineHeight: 1.2, fontWeight: 600,
    color: palette.fg, letterSpacing: '0.1px',
    maxWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }
  const content = (
    <>
      {icon && <I n={icon} s={11} c={palette.fg} w={2} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {onClick && (
        // Trailing chevron-down — signals "tap to change". The
        // raw SVG here keeps the chip primitive zero-dependency
        // (no Lucide-component-prop indirection on this specific
        // glyph at 9px).
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
          stroke={palette.fg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{ marginLeft: 1, opacity: 0.85 }} aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || label}
        style={{
          ...baseStyle,
          cursor: 'pointer', fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}>
        {content}
      </button>
    )
  }
  return <span style={baseStyle}>{content}</span>
}
