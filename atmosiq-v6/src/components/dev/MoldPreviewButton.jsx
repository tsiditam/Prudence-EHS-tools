/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MoldPreviewButton — floating tap target that opens the non-production mold
 * screening preview (/dev/mold-screening). Rendered globally in src/main.jsx
 * ONLY on non-production hosts, so it gives an in-app way to eyeball the mold
 * screening surface without typing a URL. Never appears on atmosflow.net.
 *
 * Anchored bottom-LEFT so it never collides with the KG Preview button
 * (bottom-right) when both staged features are enabled on a preview host.
 */
export default function MoldPreviewButton() {
  return (
    <a
      href="/dev/mold-screening"
      aria-label="Open mold screening preview"
      style={{
        position: 'fixed',
        left: 'calc(14px + env(safe-area-inset-left))',
        bottom: 'calc(14px + env(safe-area-inset-bottom))',
        zIndex: 2147483600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        padding: '10px 16px',
        background: 'var(--accent-fill, var(--accent))',
        color: 'var(--on-accent-fill, #06131a)',
        border: '1px solid var(--accent)',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.2px',
        textDecoration: 'none',
        fontFamily: 'inherit',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>◆</span>
      Mold Preview
    </a>
  )
}
