/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Cloud/local storage facade. When Supabase is configured AND a user is signed
 * in, assessments persist to the cloud (and sync across devices); otherwise the
 * app keeps working against local storage. Callers don't branch on auth state.
 */

import { supabase } from './supabaseClient'
import storage from './storage'
import { saveAssessment as cloudSave, listAssessments as cloudList } from './supabaseStorage'

const HISTORY_KEY = 'hydroscan-history'

/** True when cloud persistence is available right now (configured + signed in). */
export async function cloudEnabled() {
  if (!supabase) return false
  try {
    const { data } = await supabase.auth.getSession()
    return !!data?.session
  } catch {
    return false
  }
}

/**
 * Persist a completed assessment. Always appends to local history (fast,
 * offline) and, when signed in, mirrors to the cloud (best-effort).
 */
export async function persistAssessment(entry, fullState) {
  const local = (await storage.get(HISTORY_KEY)) || []
  local.unshift(entry)
  await storage.set(HISTORY_KEY, local.slice(0, 100))

  if (await cloudEnabled()) {
    await cloudSave({
      assessmentType: fullState?.mode || 'lab',
      source: fullState?.source || {},
      building: fullState?.building || {},
      labResults: fullState?.labResults || [],
      tier: entry?.tier || null,
    })
  }
  return local
}

/** Load assessment history — cloud when signed in, else local. */
export async function loadHistory() {
  if (await cloudEnabled()) {
    const cloud = await cloudList()
    if (cloud.length) {
      return cloud.map((a) => ({
        ts: new Date(a.created_at).getTime(),
        tier: a.compliance_tier,
        sourceId: a.source_type,
        cloudId: a.id,
        source: a.source_data,
        building: a.building_data,
      }))
    }
  }
  return (await storage.get(HISTORY_KEY)) || []
}
