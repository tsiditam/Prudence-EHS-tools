/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AI Assistant brand mark — a brain-inside-a-chip silhouette with
 * four circuit-trace pin clusters extending from each edge of the
 * chip. Replaces the previous robot silhouette ("Copilot-style")
 * and the earlier "computer monitor" mark. The brain-on-chip
 * metaphor reads as "AI compute" more directly than a friendly
 * mascot does — appropriate for a field-IH context where the
 * assistant is positioned as a domain reasoner, not a conversational
 * buddy.
 *
 * Stroke-based icon following the lucide-style convention used
 * elsewhere in Icons.jsx (no fills, stroke=currentColor by default,
 * stroke-linecap/linejoin rounded). The `color` prop overrides
 * currentColor for call sites that need an explicit value.
 *
 * Internal filename stays JasperRobotIcon.jsx — "Jasper" is the
 * legacy internal codename for the AI Assistant feature (component:
 * FieldAssistant, hook: useFieldAssistant). Renaming the file would
 * ripple into every import without changing behavior; the
 * user-facing label is what counts and that's now "AI Assistant"
 * everywhere it renders.
 */

export default function JasperRobotIcon({ size = 32, color = 'currentColor', title }) {
  const stroke = color
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}>
      {/* Chip body — rounded square */}
      <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
      {/* Circuit pins — 3 per side, varying lengths. Two of the
          pins (top-left, right-middle) terminate in a small filled
          dot to read as "trace endpoint", matching the reference. */}
      {/* Top */}
      <line x1="9" y1="2" x2="9" y2="4.5" />
      <circle cx="9" cy="1.6" r="0.7" fill={stroke} stroke="none" />
      <line x1="12" y1="1.4" x2="12" y2="4.5" />
      <line x1="15" y1="2" x2="15" y2="4.5" />
      {/* Bottom */}
      <line x1="9" y1="19.5" x2="9" y2="22" />
      <line x1="12" y1="19.5" x2="12" y2="22.6" />
      <circle cx="12" cy="22.8" r="0.7" fill={stroke} stroke="none" />
      <line x1="15" y1="19.5" x2="15" y2="22" />
      {/* Left */}
      <line x1="2" y1="9" x2="4.5" y2="9" />
      <line x1="1.4" y1="12" x2="4.5" y2="12" />
      <line x1="2" y1="15" x2="4.5" y2="15" />
      <circle cx="1.6" cy="15" r="0.7" fill={stroke} stroke="none" />
      {/* Right */}
      <line x1="19.5" y1="9" x2="22.6" y2="9" />
      <circle cx="22.8" cy="9" r="0.7" fill={stroke} stroke="none" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="19.5" y1="15" x2="22" y2="15" />
      {/* Brain — two hemispheres meeting at a center seam. The
          paths trace a stylized cloud-shaped lobe on each side; the
          short interior strokes hint at gyri/folds without trying to
          render anatomical detail (which would muddy at 22px). */}
      {/* Left hemisphere outline */}
      <path d="M12 8 C 9.5 8, 7.5 9.2, 7.5 11.3 C 6.7 11.7, 6.5 12.5, 7 13.3 C 7.3 14.4, 8.4 15.2, 9.6 15.2 C 9.6 15.9, 10.3 16.4, 11.1 16.4 L 12 16.4" />
      {/* Right hemisphere outline */}
      <path d="M12 8 C 14.5 8, 16.5 9.2, 16.5 11.3 C 17.3 11.7, 17.5 12.5, 17 13.3 C 16.7 14.4, 15.6 15.2, 14.4 15.2 C 14.4 15.9, 13.7 16.4, 12.9 16.4 L 12 16.4" />
      {/* Center seam */}
      <line x1="12" y1="8" x2="12" y2="16.4" />
      {/* Subtle interior folds — one per lobe */}
      <path d="M9.5 11 C 9.9 11.4, 9.9 12.1, 9.5 12.6" />
      <path d="M14.5 11 C 14.1 11.4, 14.1 12.1, 14.5 12.6" />
    </svg>
  )
}
