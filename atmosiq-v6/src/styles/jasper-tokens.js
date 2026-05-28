/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow AI (Jasper) design tokens & primitives.
 *
 * Extracted from FieldAssistant.jsx during the Phase 4 design-system
 * pass so other AI surfaces (JasperWatchPanel, future inline-AI
 * widgets) can adopt the same feel without re-copying the inline-
 * style fragments. This module is ADDITIVE — it does not displace
 * anything in src/styles/tokens.js. Token names are namespaced
 * (`JASPER_*`) so a consumer importing both won't see collisions.
 *
 * Scope, deliberately tight:
 *   - Easings + durations the Phase-3 motion pass settled on.
 *   - Atmospheric-surface gradient generator.
 *   - Top-anchored sheet elevation shadow.
 *   - Tone palette for context chips (accent / warn / success).
 *   - Keyframes (as a string) consumers can drop into their own
 *     <style> block. Kept here so primitives don't each ship their
 *     own animation rules.
 */

// ── Motion ────────────────────────────────────────────────────────

// iOS sheet present curve — used by jasperSheetIn. Source: Apple's
// own "sheet present" cubic-bezier from UIKit. Reads as a gentle
// spring without an actual physics engine.
export const JASPER_SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)'

// Ease-out-quart — used for message arrival, chip arrival, tap-feel
// transitions. Settles quickly without abruptness.
export const JASPER_EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'

export const JASPER_DURATION = {
  // Backdrop scrim fade-in.
  backdrop: 280,
  // Sheet rise. Longer than UI default because of the 28px translation.
  sheet:    380,
  // Bubble / chip / status entrance.
  enter:    280,
  // Hover / focus state transitions on interactive primitives.
  hover:    160,
}

// Stagger between consecutive items in the same list (chip strip,
// suggestion cards, intro bullets). Single source of truth so cards
// and chips read at the same cadence even if they're rendered by
// different primitives.
export const JASPER_STAGGER_MS = 60

// ── Surfaces ──────────────────────────────────────────────────────

// Atmospheric backdrop — a soft cyan halo radiating from the top
// center, fading into the consumer's base (default CARD). Used by
// the sheet container; can also be applied to any panel that wants
// the "breath of atmosphere" feel.
export const jasperAtmosphere = (base = 'var(--card)', strengthPct = 7) =>
  `radial-gradient(140% 90% at 50% 0%, color-mix(in srgb, var(--accent) ${strengthPct}%, ${base}) 0%, ${base} 55%)`

// Top-anchored elevation shadow — designed for a sheet pinned to
// the bottom of the viewport. The accent halo on the top edge
// reinforces the rounded corner as a "lift" rather than a paint job.
export const JASPER_SHEET_SHADOW =
  '0 -20px 60px -10px rgba(0, 0, 0, 0.45),' +
  '0 -8px 24px -8px rgba(0, 0, 0, 0.30),' +
  '0 -1px 0 color-mix(in srgb, var(--accent) 22%, transparent)'

// Composer focus ring — soft cyan halo + 1px outer ring. Single
// source so the textarea ring matches any future composer surfaces.
export const jasperComposerFocusShadow = () =>
  '0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent), 0 1px 2px rgba(0,0,0,0.06)'

// ── Chip tones ────────────────────────────────────────────────────

// Three tones for context-chip semantics:
//   accent  : default identity chip (facility, zone)
//   warn    : elevated measurement signal (CO₂, RH, PM, TVOC)
//   success : finalized / passed (e.g. "Finalized report")
export const JASPER_CHIP_TONES = {
  accent: {
    fg: 'var(--accent)',
    bg: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    bd: 'color-mix(in srgb, var(--accent) 28%, transparent)',
  },
  warn: {
    fg: 'var(--warn)',
    bg: 'color-mix(in srgb, var(--warn) 12%, transparent)',
    bd: 'color-mix(in srgb, var(--warn) 30%, transparent)',
  },
  success: {
    fg: 'var(--ok)',
    bg: 'color-mix(in srgb, var(--ok) 12%, transparent)',
    bd: 'color-mix(in srgb, var(--ok) 30%, transparent)',
  },
}

// ── Keyframes ─────────────────────────────────────────────────────

/**
 * Inline-style CSS block carrying every animation + media-query rule
 * the Jasper primitives depend on. A consumer surface mounts this
 * once (typically as `<style>{JASPER_KEYFRAMES_CSS}</style>` at the
 * end of its tree) and the chips, suggestion cards, message bubbles,
 * etc. all animate correctly. Includes the prefers-reduced-motion
 * override so motion-sensitive users see the surface snap in static.
 */
export const JASPER_KEYFRAMES_CSS = `
@keyframes jasperReveal {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes jasperBackdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes jasperSheetIn {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes jasperMsgIn {
  0%   { opacity: 0; transform: translateY(8px) scale(0.98); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes jasperChipIn {
  0%   { opacity: 0; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
}
.jasper-msg-in {
  animation: jasperMsgIn ${JASPER_DURATION.enter}ms ${JASPER_EASE_OUT} both;
}
.jasper-chip-in {
  display: inline-flex;
  animation: jasperChipIn ${JASPER_DURATION.enter}ms ${JASPER_EASE_OUT} both;
}
.jasper-suggestion:hover:not(:disabled),
.jasper-suggestion:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent) !important;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent),
    0 8px 24px -12px color-mix(in srgb, var(--accent) 55%, transparent),
    0 2px 6px rgba(0,0,0,0.06);
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--accent) 4%, var(--surface)) !important;
}
.jasper-suggestion:focus-visible {
  outline: none;
}
.jasper-suggestion:hover:not(:disabled) .jasper-suggestion__icon,
.jasper-suggestion:focus-visible .jasper-suggestion__icon {
  background: color-mix(in srgb, var(--accent) 18%, transparent) !important;
}
.jasper-suggestion:active:not(:disabled) {
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .jasper-stagger,
  .jasper-msg-in,
  .jasper-chip-in,
  .jasper-backdrop,
  .jasper-sheet {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  .jasper-suggestion:hover:not(:disabled),
  .jasper-suggestion:focus-visible,
  .jasper-suggestion:active:not(:disabled) {
    transform: none !important;
  }
}
`
