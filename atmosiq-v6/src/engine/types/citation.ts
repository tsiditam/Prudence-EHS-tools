/**
 * AtmosFlow Engine v2.6 — Citation Types
 * Every threshold, standard, and regulatory reference carries a Citation.
 */

export const ENGINE_VERSION = 'atmosflow-engine-2.6.0' as const

export interface Citation {
  readonly source: string
  readonly authority: 'regulatory' | 'consensus' | 'advisory' | 'manufacturer' | 'peer_reviewed'
  readonly edition?: string
  readonly section?: string
  readonly url?: string
  /**
   * v2.5 §2 — optional organization code that drives the Appendix D
   * authority-name expansion (e.g. 'OSHA' → 'Occupational Safety and
   * Health Administration'). When omitted, the walker infers the
   * organization from the `source` string.
   */
  readonly organization?: CitationOrganization
}

export type CitationOrganization =
  | 'OSHA'
  | 'NIOSH'
  | 'ACGIH'
  | 'EPA'
  | 'ASHRAE'
  | 'WHO'
  | 'ISO'
  | 'ANSI'
  | 'AIHA'
  | 'ABIH'
  | 'FDA'
  | 'IICRC'
  | 'ASTM'
  | 'NYC_DOHMH'
  | 'AABC_NEBB'
  | 'PEER_REVIEWED'
  | 'MANUFACTURER'
  | 'OTHER'

export type Cited<T> = T & { readonly citation: Citation }
