/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * InlineError — a low-saturation danger-tinted message box for inline upload /
 * parse errors. Pass `style` for spacing. Plain V3 token surface, not
 * soft-glass.
 */
export const inlineErrorStyle = { padding: '10px 12px', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 28%, transparent)', borderRadius: 10, color: 'var(--danger)', fontSize: 12, lineHeight: 1.5 }

export default function InlineError({ style, children }) {
  return <div style={{ ...inlineErrorStyle, ...style }}>{children}</div>
}
