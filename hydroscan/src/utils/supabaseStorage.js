/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Supabase persistence for assessments. Maps the app's assessment state onto
 * the `assessments` (+ `lab_results`) tables defined in migration 001, which
 * are RLS owner-scoped (auth.uid() = user_id). All functions degrade to a
 * null/empty result when Supabase is unconfigured or the user is signed out —
 * callers fall back to local storage via cloudStorage.
 */

import { supabase } from './supabaseClient'

/** Persist a completed assessment + its lab results. Returns the new id or null. */
export async function saveAssessment({ assessmentType = 'lab', source = {}, building = {}, labResults = [], tier = null } = {}) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('assessments')
      .insert({
        assessment_type: assessmentType,
        status: 'complete',
        source_type: source.src_type || null,
        compliance_tier: tier,
        source_data: source,
        building_data: building,
        field_data: { f_ph: building.f_ph, f_chlorine: building.f_chlorine, f_turbidity: building.f_turbidity, f_temp: building.f_temp },
      })
      .select('id')
      .single()
    if (error || !data) return null

    if (Array.isArray(labResults) && labResults.length) {
      const rows = labResults
        .filter((r) => r.value !== '' && r.value != null)
        .map((r) => ({ assessment_id: data.id, parameter_id: r.id, value: isNaN(parseFloat(r.value)) ? null : parseFloat(r.value), qualifier: r.qualifier || null, unit: r.unit || null }))
      if (rows.length) await supabase.from('lab_results').insert(rows)
    }
    return data.id
  } catch {
    return null
  }
}

/** List the signed-in user's recent assessments. */
export async function listAssessments(limit = 50) {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select('id, assessment_type, source_type, compliance_tier, source_data, building_data, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    return error ? [] : data || []
  } catch {
    return []
  }
}

/** Fetch one assessment plus its lab results. */
export async function getAssessment(id) {
  if (!supabase || !id) return null
  try {
    const { data: a } = await supabase.from('assessments').select('*').eq('id', id).single()
    if (!a) return null
    const { data: labs } = await supabase.from('lab_results').select('parameter_id, value, qualifier, unit').eq('assessment_id', id)
    return { ...a, labResults: (labs || []).map((l) => ({ id: l.parameter_id, value: l.value, qualifier: l.qualifier, unit: l.unit })) }
  } catch {
    return null
  }
}

export async function deleteAssessment(id) {
  if (!supabase || !id) return false
  try {
    const { error } = await supabase.from('assessments').delete().eq('id', id)
    return !error
  } catch {
    return false
  }
}
