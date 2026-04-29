/**
 * AtmosFlow Engine v2.5 §2 — Appendix D citation walker
 *
 * The Appendix D body is built by recursively walking the
 * ClientReport object and pulling out every Citation-shaped
 * value, plus every `standardReference` string attached to a
 * RecommendedAction. The walker:
 *
 *   1. Discovers Citation objects regardless of nesting depth.
 *   2. Promotes RecommendedAction `standardReference` strings
 *      (free-form) into synthetic Citation objects via the
 *      organization-detection heuristic in `inferOrganization`.
 *   3. Expands the authority abbreviation to its full body name
 *      (e.g. "OSHA" → "Occupational Safety and Health
 *      Administration") for rendering.
 *   4. Dedupes by (canonical-source + organization).
 *   5. Sorts by full-organization-name then source.
 *
 * The engine version footer is appended exactly once, on its own
 * line, after the citation list. This is the ONLY rendered
 * location of the engine-version string per v2.4 §7.
 */

import type { Citation, CitationOrganization } from '../types/citation'
import { ENGINE_VERSION } from '../types/citation'

// ── Public surface ───────────────────────────────────────────────

export interface FormattedCitation {
  readonly source: string
  readonly organization: CitationOrganization
  readonly organizationDisplay: string
  readonly edition?: string
  readonly section?: string
  readonly url?: string
  readonly authority: Citation['authority']
}

/**
 * Walk an arbitrary report object graph and collect every
 * Citation-shaped value plus every standardReference string.
 * Returns the deduped, sorted list ready for rendering.
 */
export function collectCitations(report: unknown): ReadonlyArray<FormattedCitation> {
  const seen = new Map<string, FormattedCitation>()
  walk(report, seen, new WeakSet())
  const list = Array.from(seen.values())
  list.sort(compareFormatted)
  return list
}

/**
 * Render a single citation as the bibliography-style line used in
 * Appendix D. Format:
 *   "[Source] — [Edition if present]. [Organization full name].
 *    [URL if present]."
 */
export function formatCitation(c: FormattedCitation): string {
  const parts: string[] = []
  parts.push(c.source)
  if (c.edition && c.edition !== 'current') parts.push(`(${c.edition})`)
  const head = parts.join(' ')
  const orgClause = c.organizationDisplay ? ` ${c.organizationDisplay}.` : ''
  const urlClause = c.url ? ` ${c.url}` : ''
  return `${head}.${orgClause}${urlClause}`.replace(/\.{2,}/g, '.').trim()
}

/**
 * Engine version footer — rendered as a single italic line at the
 * end of Appendix D.
 */
export const ENGINE_VERSION_FOOTER = `Report generated using AtmosFlow assessment platform, engine version ${ENGINE_VERSION}.`

// ── Organization expansion table (§2 spec) ───────────────────────

export const ORGANIZATION_DISPLAY: Record<CitationOrganization, string> = {
  OSHA: 'Occupational Safety and Health Administration',
  NIOSH: 'National Institute for Occupational Safety and Health',
  ACGIH: 'American Conference of Governmental Industrial Hygienists',
  EPA: 'U.S. Environmental Protection Agency',
  ASHRAE: 'ASHRAE',
  WHO: 'World Health Organization',
  ISO: 'International Organization for Standardization',
  ANSI: 'American National Standards Institute',
  AIHA: 'American Industrial Hygiene Association',
  ABIH: 'American Board of Industrial Hygiene',
  FDA: 'U.S. Food and Drug Administration',
  IICRC: 'Institute of Inspection, Cleaning and Restoration Certification',
  ASTM: 'ASTM International',
  NYC_DOHMH: 'New York City Department of Health and Mental Hygiene',
  AABC_NEBB: 'AABC / NEBB',
  PEER_REVIEWED: 'Peer-reviewed literature',
  MANUFACTURER: 'Manufacturer',
  OTHER: '',
}

/**
 * Infer the organization from a free-form citation source string.
 * Used both for standardReference strings (which lack an
 * organization field) and as a fallback for legacy Citation
 * objects without `organization` populated.
 */
export function inferOrganization(source: string): CitationOrganization {
  const s = source.toLowerCase()
  if (/(^|\b)osha\b|29 cfr 1910|osh act|general duty clause/.test(s)) return 'OSHA'
  if (/niosh\b|niosh method|niosh rel/.test(s)) return 'NIOSH'
  if (/acgih\b|threshold limit value|\btlv\b/.test(s)) return 'ACGIH'
  if (/\bepa\b|naaqs|\bto-17\b|method to-17|mold remediation in schools/.test(s)) return 'EPA'
  if (/ashrae|tc 9\.9/.test(s)) return 'ASHRAE'
  if (/\bwho\b|world health organization/.test(s)) return 'WHO'
  if (/\biso\b|iso 14644|iso 17025/.test(s)) return 'ISO'
  if (/\bansi\b|ansi\/isa/.test(s)) return 'ANSI'
  if (/\baiha\b/.test(s)) return 'AIHA'
  if (/\babih\b/.test(s)) return 'ABIH'
  if (/\bfda\b/.test(s)) return 'FDA'
  if (/\biicrc\b|iicrc s5\d{2}/.test(s)) return 'IICRC'
  if (/\bastm\b|astm d/.test(s)) return 'ASTM'
  if (/nyc dohmh|new york city department of health/.test(s)) return 'NYC_DOHMH'
  if (/\baabc\b|\bnebb\b/.test(s)) return 'AABC_NEBB'
  if (/persily|mølhave|molhave|seifert|chen ?& ?zhao|peer.reviewed|indoor air\b|atmospheric environment/.test(s)) {
    return 'PEER_REVIEWED'
  }
  return 'OTHER'
}

// ── Walker internals ─────────────────────────────────────────────

/**
 * Heuristic detection: is `obj` shaped like a Citation? We look for
 * the two required keys (`source: string`, `authority: <enum>`).
 */
function looksLikeCitation(obj: any): obj is Citation {
  if (!obj || typeof obj !== 'object') return false
  if (typeof obj.source !== 'string' || obj.source.length === 0) return false
  if (typeof obj.authority !== 'string') return false
  return ['regulatory', 'consensus', 'advisory', 'manufacturer', 'peer_reviewed']
    .includes(obj.authority)
}

/**
 * Heuristic detection: is `obj` shaped like a RecommendedAction
 * (carries a free-form `standardReference` string)?
 */
function looksLikeRecommendedAction(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false
  return typeof obj.action === 'string'
    && typeof obj.priority === 'string'
    && typeof obj.timeframe === 'string'
}

function canonicalSource(source: string): string {
  // Strip trailing whitespace and collapse internal whitespace so
  // "ASHRAE 62.1-2025  §6.2.2" and "ASHRAE 62.1-2025 §6.2.2" dedupe.
  return source.replace(/\s+/g, ' ').trim()
}

function dedupKey(source: string, organization: CitationOrganization): string {
  return `${organization}|${canonicalSource(source).toLowerCase()}`
}

function intern(
  seen: Map<string, FormattedCitation>,
  citation: Omit<FormattedCitation, 'organizationDisplay'>,
): void {
  const key = dedupKey(citation.source, citation.organization)
  if (seen.has(key)) return
  seen.set(key, {
    ...citation,
    organizationDisplay: ORGANIZATION_DISPLAY[citation.organization] || '',
  })
}

function walk(
  node: unknown,
  seen: Map<string, FormattedCitation>,
  visited: WeakSet<object>,
): void {
  if (node === null || node === undefined) return
  if (typeof node !== 'object') return
  if (visited.has(node as object)) return
  visited.add(node as object)

  // Citation-shaped value. Promote and stop descending — Citation
  // sub-fields are scalar.
  if (looksLikeCitation(node)) {
    const c = node as Citation
    const org = c.organization || inferOrganization(c.source)
    intern(seen, {
      source: canonicalSource(c.source),
      organization: org,
      edition: c.edition,
      section: c.section,
      url: c.url,
      authority: c.authority,
    })
    return
  }

  // RecommendedAction-shaped value: pluck `standardReference` if
  // present and synthesize a Citation. Then continue descending so
  // we don't miss nested arrays of actions.
  if (looksLikeRecommendedAction(node)) {
    const a = node as { standardReference?: string }
    if (a.standardReference) {
      const src = a.standardReference
      const org = inferOrganization(src)
      intern(seen, {
        source: canonicalSource(src),
        organization: org,
        authority: orgToAuthority(org),
      })
    }
  }

  if (Array.isArray(node)) {
    for (const item of node) walk(item, seen, visited)
    return
  }

  for (const k of Object.keys(node)) {
    walk((node as Record<string, unknown>)[k], seen, visited)
  }
}

function orgToAuthority(org: CitationOrganization): Citation['authority'] {
  switch (org) {
    case 'OSHA':
    case 'EPA':
    case 'FDA':
      return 'regulatory'
    case 'NIOSH':
    case 'ACGIH':
    case 'ASHRAE':
    case 'ANSI':
    case 'ISO':
    case 'AIHA':
    case 'ABIH':
    case 'IICRC':
    case 'ASTM':
    case 'AABC_NEBB':
    case 'WHO':
      return 'consensus'
    case 'NYC_DOHMH':
      return 'advisory'
    case 'PEER_REVIEWED':
      return 'peer_reviewed'
    case 'MANUFACTURER':
      return 'manufacturer'
    case 'OTHER':
    default:
      return 'consensus'
  }
}

function compareFormatted(a: FormattedCitation, b: FormattedCitation): number {
  // Sort by full organization display name (alphabetic), then by
  // source string.
  const orgA = a.organizationDisplay || a.source
  const orgB = b.organizationDisplay || b.source
  if (orgA !== orgB) return orgA.localeCompare(orgB)
  return a.source.localeCompare(b.source)
}
