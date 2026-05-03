/**
 * AtmosFlow recommendation formatting utilities.
 *
 * Engine v2.8.0 changed the genRecs() return shape from a string-array
 * per bucket ("ZoneName: action text") to a RecommendationAction[]
 * per bucket (objects with scope / equipmentId / affectedZoneIds /
 * text). Reports finalized prior to v2.8.0 stored the legacy string
 * shape in localStorage and Supabase, so every renderer must accept
 * both. These helpers normalize and group actions for display.
 *
 * The functions here are pure and deterministic — no engine logic,
 * no thresholds. Renderers should depend on this module instead of
 * re-implementing the legacy string-prefix parser.
 */

const HVAC_FALLBACK_PREFIX = 'HVAC equipment not yet identified — '

/**
 * Coerce a legacy "ZoneName: action text" string into the new
 * RecommendationAction shape so renderers have a single uniform
 * input format. Building-scoped legacy strings (no zone prefix)
 * surface as scope:'building'; the citation-shaped guard from the
 * old parseRecLocation helper is preserved here so we don't treat
 * "29 CFR 1910.1048: ..." as a zone label.
 *
 * @param {string} s
 * @param {string[]} [knownZoneNames] when present, only treats the
 *   prefix as a zone if it matches one of these. Helps disambiguate
 *   when standards citations look like prefixes.
 */
function parseLegacyString(s, knownZoneNames) {
  if (!s || typeof s !== 'string') return { scope: 'building', text: s || '', affectedZoneIds: [], affectedZoneNames: [] }
  const m = s.match(/^([^:]{2,80}):\s+(.+)$/s)
  if (m) {
    const prefix = m[1].trim()
    const tail = m[2].trim()
    // Citation-shaped: "29 CFR ..." or all-caps abbreviation
    const looksLikeCitation = /^\d+\s+[A-Z]{2,}/.test(prefix) || /^[A-Z0-9 ]{3,}$/.test(prefix)
    if (looksLikeCitation) {
      return { scope: 'building', text: s, affectedZoneIds: [], affectedZoneNames: [] }
    }
    // If the caller provided a zone-name allowlist, respect it
    if (Array.isArray(knownZoneNames) && knownZoneNames.length > 0 && !knownZoneNames.includes(prefix)) {
      return { scope: 'building', text: s, affectedZoneIds: [], affectedZoneNames: [] }
    }
    return {
      scope: 'zone',
      text: tail,
      zoneId: prefix,
      zoneName: prefix,
      affectedZoneIds: [prefix],
      affectedZoneNames: [prefix],
    }
  }
  return { scope: 'building', text: s, affectedZoneIds: [], affectedZoneNames: [] }
}

/**
 * Normalize either a legacy string or an already-objectified action
 * into a RecommendationAction. Idempotent on objects.
 */
export function normalizeAction(action, knownZoneNames) {
  if (action && typeof action === 'object' && action.scope) {
    return action
  }
  return parseLegacyString(action, knownZoneNames)
}

/**
 * Render a single action to its display label header (for the
 * "group once, recs as bullets under it" pattern).
 *
 *  - zone-scoped     → "3rd Floor Open Office"
 *  - equipment-scoped → "AHU-1 (Equipment)"
 *  - building-scoped → "Building-wide"
 */
export function actionLocationLabel(action) {
  if (!action) return 'Building-wide'
  if (action.scope === 'equipment') return `${action.equipmentLabel || action.equipmentId || 'Equipment'} (Equipment)`
  if (action.scope === 'zone') return action.zoneName || action.zoneId || 'Zone'
  return 'Building-wide'
}

/**
 * Render a single action to a single-line legacy-style string.
 * Used by exporters that flatten to a single column (e.g. legacy
 * Recommendations Register tables that pre-date the equipment row).
 */
export function actionLine(action) {
  const a = normalizeAction(action)
  if (a.scope === 'equipment') {
    const affectsTail = a.affectedZoneNames?.length ? ` (Affects: ${a.affectedZoneNames.join(', ')})` : ''
    return `${a.equipmentLabel || a.equipmentId || 'Equipment'}: ${a.text}${affectsTail}`
  }
  if (a.scope === 'zone') {
    return `${a.zoneName || a.zoneId}: ${a.text}`
  }
  return a.text
}

/**
 * Group actions by display key for the in-app/DOCX/Share renderers.
 * Sort order per the v2.8 spec: zone-scoped first (grouped by zone),
 * then equipment-scoped (grouped by equipment), then building-scoped
 * at the end. Within a group, action order preserves engine output.
 *
 * @returns {Array<{ key: string, label: string, scope: 'zone'|'equipment'|'building',
 *                   actions: RecommendationAction[], affectedZoneNames?: string[] }>}
 */
export function groupActions(rawActions, knownZoneNames) {
  const actions = (rawActions || []).map(a => normalizeAction(a, knownZoneNames))
  const groups = []
  const idxByKey = {}
  const keyOf = (a) => {
    if (a.scope === 'zone') return `z::${a.zoneName || a.zoneId || ''}`
    if (a.scope === 'equipment') return `e::${a.equipmentId || a.equipmentLabel || ''}`
    return 'b::building'
  }
  for (const a of actions) {
    const k = keyOf(a)
    if (idxByKey[k] === undefined) {
      idxByKey[k] = groups.length
      groups.push({
        key: k,
        scope: a.scope,
        label: actionLocationLabel(a),
        actions: [],
        affectedZoneNames: a.scope === 'equipment' ? (a.affectedZoneNames || []) : undefined,
      })
    } else if (a.scope === 'equipment') {
      // Merge affected-zone sets across multiple equipment-scoped
      // actions in the same equipment group.
      const g = groups[idxByKey[k]]
      const merged = new Set([...(g.affectedZoneNames || []), ...(a.affectedZoneNames || [])])
      g.affectedZoneNames = [...merged]
    }
    groups[idxByKey[k]].actions.push(a)
  }
  // Stable scope ordering
  const scopeRank = { zone: 0, equipment: 1, building: 2 }
  groups.sort((a, b) => scopeRank[a.scope] - scopeRank[b.scope])
  return groups
}

/**
 * Render a flat string list (legacy renderers) from action objects.
 * Preserves backward compat where downstream code expects strings.
 */
export function actionsToLines(actions) {
  return (actions || []).map(actionLine)
}

export const HVAC_UNMAPPED_PREFIX = HVAC_FALLBACK_PREFIX
