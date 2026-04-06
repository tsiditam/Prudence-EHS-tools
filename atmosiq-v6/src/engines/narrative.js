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

// ⚠ Use a serverless proxy in production — never expose API keys client-side
export async function generateNarrative(bldg, zones, zoneScores, comp, osha, recs) {
  const sys = 'You are an expert CIH writing an IAQ assessment findings narrative. Only describe what the data shows. Never invent scores, thresholds, or standards not provided. Write in professional third-person. 2-3 paragraphs max. Reference zone names and specific measurements.'
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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: sys,
        messages: [{ role:'user', content:`Based ONLY on this data, write a professional IAQ findings narrative:\n\n${JSON.stringify(payload,null,2)}` }],
      }),
    })
    const data = await res.json()
    return data.content?.map(b=>b.type==='text'?b.text:'').filter(Boolean).join('\n') || null
  } catch(e) { console.error('AI narrative error:', e); return null }
}