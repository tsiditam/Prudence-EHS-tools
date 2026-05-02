/**
 * AtmosFlow Engine — Citation Types
 * Every threshold, standard, and regulatory reference carries a Citation.
 *
 * ENGINE_VERSION is the tagged form (e.g. "atmosflow-engine-2.7.0") used
 * by report metadata. It is sourced from src/version.js, the canonical
 * version module — do not duplicate the version string here.
 */

export { ENGINE_VERSION_TAG as ENGINE_VERSION } from '../../version.js'

export interface Citation {
  readonly source: string
  readonly authority: 'regulatory' | 'consensus' | 'advisory' | 'manufacturer' | 'peer_reviewed'
  readonly edition?: string
  readonly section?: string
  readonly url?: string
}

export type Cited<T> = T & { readonly citation: Citation }
