/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Shared visual constants for AtmosFlow chain-of-custody PDF forms.
 * Both MoldCoCForm and TvocCoCForm reference these so the two forms
 * stay visually aligned. Edit here once instead of touching every
 * call site.
 */

export const FORM_VERSION = '1.0'

// Letter portrait, in points (jsPDF default unit when constructed
// with format: 'letter'). 612 x 792 pt.
export const PAGE_W = 612
export const PAGE_H = 792
export const MARGIN = 36 // 0.5 inch — tighter than the report PDF so
                          // the sample-log table fits 15 rows.
export const CONTENT_W = PAGE_W - MARGIN * 2

// AtmosFlow brand cyan. Invariant across light/dark in the SPA and
// invariant in print output (forms always render on white paper).
export const ACCENT = '#22D3EE'
export const ACCENT_DARK = '#0E7490' // section header text — AA on white
export const SLATE = '#1E293B'        // body text
export const SOFT = '#475569'         // metadata, footer
export const RULE = '#CBD5E1'         // table borders, divider lines
export const MUTED = '#94A3B8'        // hand-fill placeholders
export const WHITE = '#FFFFFF'

// Type scale — Helvetica is built into jsPDF (no font registration).
export const FONT_FAMILY = 'helvetica'
export const SZ_TITLE = 18
export const SZ_SECTION = 9
export const SZ_LABEL = 7.5
export const SZ_BODY = 9
export const SZ_BODY_SMALL = 8
export const SZ_FOOTER = 7.5

// Common row heights so the sample log + transfers feel balanced.
export const SAMPLE_ROW_H = 22       // tall enough for handwriting
export const TRANSFER_ROW_H = 24
export const SAMPLE_ROWS_PER_PAGE = 15

// Footer text shared across all CoC forms.
export const FOOTER_COPYRIGHT =
  '© 2026 Prudence Safety & Environmental Consulting, LLC — atmosflow.net'
