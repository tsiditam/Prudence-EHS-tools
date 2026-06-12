/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DevPreviewButton — floating tap target that opens the non-production
 * Knowledge Graph preview (/dev/evidence-map). Rendered globally in
 * src/main.jsx ONLY on non-production hosts (localhost + *.vercel.app
 * previews), so it gives an in-app way to eyeball the Evidence Map and the
 * report traceability matrix without typing a URL. Never appears on
 * atmosflow.net.
 */
export default function DevPreviewButton() {
  return (
    <a
      href="/dev/evidence-map"
      aria-label="Open Knowledge Graph preview"
      style={{
        position: 'fixed',
        right: 'calc(14px + env(safe-area-inset-right))',
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
      KG Preview
    </a>
  )
}
