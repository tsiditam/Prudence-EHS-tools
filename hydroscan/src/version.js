/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Single source of truth for the three version concepts, kept distinct:
 *   • App version      — the Vite client build
 *   • Engine version   — the water compliance / causal-chain engine
 *   • Standards manifest version — the bibliography snapshot (dated)
 *
 * Do not hardcode any of these strings elsewhere — import from here.
 */

export const APP_VERSION = '2.0.0'
// 1.1.0 (Phase 3): centralized tier precedence, state-limit overlay, LSI
// corrosion index, weighted causal-chain confidence + data gaps, and the
// defensibility primitives (citation tracker, screening/qualitative-only,
// readiness gate).
export const ENGINE_VERSION = '1.1.0'
// Dated snapshot of the EPA SDWA / WHO GDWQ / LCRR / PFAS-NPDWR bibliography
// the standards manifest encodes. Bump when a standard value changes.
export const STANDARDS_MANIFEST_VERSION = '2024-12'

// Injected by Vite at build time (see vite.config.js `define`). Falls back
// to 'dev' when running outside the bundler (tests, node scripts).
export const BUILD_SHA =
  typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev'
