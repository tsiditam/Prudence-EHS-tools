/**
 * useSimilarAssessments — load past assessments + compute similarity
 * patterns against the current in-flight or just-finalized
 * assessment.
 *
 * Returns { loading, error, patterns, matches, currentFeatures,
 * pastCount } where pastCount is the total historical assessments
 * scanned (used by the UI to render "build up history with a few
 * more assessments" empty-state copy honestly).
 *
 * Cost shape: loads up to MAX_HISTORICAL assessments (30) from
 * localStorage via Storage.getAssessment in parallel. Each load is
 * a JSON.parse on a localStorage key; even with photo-blob
 * compaction the cost is small. Re-runs whenever the
 * currentAssessment.id changes — the assessor doesn't move between
 * assessments often enough for the recompute to matter.
 *
 * Engine-sacred: pure orchestration on top of the deterministic
 * scorer in src/utils/assessmentSimilarity.js. No engine touch.
 */

import { useEffect, useState } from 'react'
import Storage from '../utils/cloudStorage'
import { findSimilarAssessments } from '../utils/assessmentSimilarity'

const MAX_HISTORICAL = 30

export function useSimilarAssessments(currentAssessment) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    patterns: { matchCount: 0, averageScore: null, commonImmediateActions: [], moldRate: null, facilityTypeLabel: null },
    matches: [],
    currentFeatures: { facilityType: null, yearBuilt: null, hvacType: null, triggerReason: null, waterHistory: null },
    pastCount: 0,
  })

  const currentId = currentAssessment && currentAssessment.id
  // Stringify the feature signature so the effect re-runs only when
  // the structural inputs actually change (not on every re-render).
  const featureKey = JSON.stringify([
    currentAssessment && (currentAssessment.building?.ft || currentAssessment.bldg?.ft),
    currentAssessment && (currentAssessment.building?.ba || currentAssessment.bldg?.ba),
    currentAssessment && (currentAssessment.building?.ht || currentAssessment.bldg?.ht),
    currentAssessment && currentAssessment.presurvey?.ps_reason,
    currentAssessment && currentAssessment.presurvey?.ps_water_history,
    currentId,
  ])

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const idx = await Storage.listAssessments()
        const all = Array.isArray(idx) ? idx : []
        // Sort newest-first so MAX_HISTORICAL keeps the recent
        // assessments (more representative of the firm's current
        // patterns than five-year-old ones).
        const sorted = all.slice().sort((a, b) => {
          const ta = new Date(b.ts || b.ua || 0).getTime()
          const tb = new Date(a.ts || a.ua || 0).getTime()
          return ta - tb
        }).slice(0, MAX_HISTORICAL)

        const loaded = await Promise.all(
          sorted.map(async (entry) => {
            try { return await Storage.getAssessment(entry.id) }
            catch { return null }
          }),
        )
        const past = loaded.filter(Boolean)

        if (cancelled) return

        const result = findSimilarAssessments(currentAssessment, past, { limit: 5 })
        setState({
          loading: false,
          error: null,
          patterns: result.patterns,
          matches: result.matches,
          currentFeatures: result.currentFeatures,
          pastCount: past.length,
        })
      } catch (err) {
        if (cancelled) return
        setState((prev) => ({ ...prev, loading: false, error: err && err.message ? err.message : 'load_failed' }))
      }
    }
    setState((prev) => ({ ...prev, loading: true }))
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureKey])

  return state
}
