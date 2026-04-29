/**
 * AtmosFlow Engine v2.3 — Citation Types
 * Every threshold, standard, and regulatory reference carries a Citation.
 */

export const ENGINE_VERSION = 'atmosflow-engine-2.4.0' as const

export interface Citation {
  readonly source: string
  readonly authority: 'regulatory' | 'consensus' | 'advisory' | 'manufacturer' | 'peer_reviewed'
  readonly edition?: string
  readonly section?: string
  readonly url?: string
}

export type Cited<T> = T & { readonly citation: Citation }
