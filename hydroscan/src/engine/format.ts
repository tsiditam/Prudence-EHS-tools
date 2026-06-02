/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Presentation helpers for engine outputs — tier and severity color/label
 * mapping plus a short date formatter. Ported verbatim from the original
 * App.jsx (Phase 1 relocation). The literal hexes mirror the SEVERITY token
 * scale; a later pass can route these through src/styles/tokens.js.
 */

import type { Tier, Severity } from '../types/engine'

export const fD = (ts: number | string | null): string =>
  ts ? new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export const tierColor = (t: Tier | string): string =>
  ({ immediate: '#EF4444', advisory: '#FB923C', monitor: '#FBBF24', compliant: '#22C55E' } as Record<string, string>)[t] || '#5E6578'

export const tierLabel = (t: Tier | string): string =>
  ({ immediate: '⚠ Immediate Action', advisory: 'Advisory', monitor: 'Monitor', compliant: '✓ Compliant' } as Record<string, string>)[t] || 'Unknown'

export const tierBg = (t: Tier | string): string =>
  ({ immediate: '#EF444412', advisory: '#FB923C12', monitor: '#FBBF2412', compliant: '#22C55E12' } as Record<string, string>)[t] || '#12161D'

export const sevColor = (s: Severity | string): string =>
  ({ critical: '#EF4444', high: '#FB923C', medium: '#FBBF24', low: '#14B8A6', pass: '#22C55E' } as Record<string, string>)[s] || '#5E6578'
