/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { SENSOR_FIELDS } from '../constants/questions'
import { supabase } from '../utils/supabaseClient'

/**
 * Generates an AI narrative via the serverless proxy at /api/narrative.
 * The Anthropic API key never leaves the server.
 */
export async function generateNarrative(bldg, zones, zoneScores, comp, osha, recs) {
  const system = 'You are an expert CIH writing an IAQ assessment findings narrative. Only describe what the data shows. Never invent scores, thresholds, or standards not provided. Write in professional third-person. 2-3 paragraphs max. Reference zone names and specific measurements.'
  const payload = {
    facility: bldg.fn, location: bldg.fl, type: bldg.ft, hvac: bldg.ht, hvacMaintenance: bldg.hm,
    compositeScore: comp, oshaDefensibility: osha,
    zones: zoneScores.map((zs, i) => ({
      name: zs.zoneName, score: zs.tot, risk: zs.risk,
      findings: zs.cats.flatMap(c => c.r.filter(r => r.sev!=='pass'&&r.sev!=='info').map(r => ({ text:r.t, severity:r.sev, standard:r.std||null }))),
      measurements: zones[i] ? Object.fromEntries(SENSOR_FIELDS.filter(sf=>zones[i][sf.id]).map(sf=>[sf.label, zones[i][sf.id]+' '+sf.u])) : {},
    })),
    recommendations: recs,
  }
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session && session.access_token) headers.Authorization = `Bearer ${session.access_token}`
      } catch {}
    }
    const res = await fetch('/api/narrative', {
      method: 'POST',
      headers,
      body: JSON.stringify({ system, payload }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (res.status === 429) console.warn('Narrative rate limit hit:', data.scope, 'retry in', data.retry_after_seconds, 's')
      else console.error('Narrative proxy error:', data.error)
      return null
    }
    return data.narrative || null
  } catch(e) { console.error('AI narrative error:', e); return null }
}
