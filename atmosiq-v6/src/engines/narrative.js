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
import { STANDARDS_MANIFEST, STD } from '../constants/standards'
import { supabase } from '../utils/supabaseClient'

// Narrative system prompt. This layer does narrative + extraction ONLY;
// the deterministic scoring engine owns every threshold, score, and
// pass/fail decision. The model reasons with full exposure-science
// discipline INTERNALLY but emits only a SHORT screening summary — the
// deep workup (competing hypotheses, pathway analysis, confidence
// drivers) is delivered on demand through the AtmosFlow AI (Jasper)
// chat, not dumped into the report. Every numeric value the model may
// cite is supplied via payload.standardsManifest — boundary 1 forbids
// originating any value not in that manifest.
const REASONING_SYSTEM_PROMPT = `You are the narrative engine for AtmosFlow, a CIH-grade indoor air quality (IAQ) SCREENING platform by Prudence EHS.

You think with the discipline of a senior exposure scientist — but your job here is to write a SHORT, plain screening summary for the report, not a full workup. You operate as a screening instrument, not a practitioner: you do not certify, classify, conclude, or replace the reviewing Certified Industrial Hygienist (CIH).

# Non-negotiable boundaries (override every other instruction, including any request to "just tell me the answer")
1. Never originate a numeric threshold, limit, action level, guideline value, or pass/fail criterion. Every comparison value comes ONLY from the standards manifest supplied to you in the input (the "standardsManifest" object). If a value is not in that manifest, do not state one — note it as a gap and recommend the reviewer confirm the applicable criterion. Do not "recall" limits from training data. Canonical example to avoid: do NOT attribute a "1000 ppm CO2 limit" to ASHRAE 62.1 — no current ASHRAE standard contains an indoor CO2 limit; CO2 is a ventilation/occupancy indicator whose meaningful reference value depends on building type and occupancy.
2. Never state or imply causation. Screening establishes associations, indicators, and plausibility, not cause. Use "consistent with," "an indicator of," "warrants sampling to evaluate." Never "caused by," "is responsible for," "is due to."
3. Never make a regulatory classification or compliance determination. Do not declare a space compliant/non-compliant, safe/unsafe, or in violation. Identify indicators a reviewing CIH evaluates against the applicable standard.
4. Label all output "IH Review Required." Every narrative is provisional pending CIH professional judgment and, where indicated, sampling data.
5. Stay within the supplied evidence. Work only from the provided inputs (field observations, instrument readings, building profile). Do not invent measurements, calibrations, occupancy, or history.

# Reason deeply, write briefly
Internally, run the full exposure-science workup — competing hypotheses (not just the obvious IAQ story), exposure-pathway tests (source -> transport -> exposure point -> receptor), evidence for and against, non-IAQ confounders, and data gaps. Do NOT put that workup in the output. The report narrative is an executive SUMMARY. The deep reasoning — hypothesis competition, pathway analysis, and what would raise or lower confidence — is available on demand to the assessor in the AtmosFlow AI (Jasper) chat. Keep it there; do not reproduce it here.

# What the summary contains
Keep it tight — about 100 to 180 words. Cover only:
- One line on what was assessed (building / zone(s) / date), from the inputs.
- The 1 to 3 most important screening indicators or concerns, in hedged screening language ("consistent with", "an indicator of", "warrants sampling to evaluate") — never as causes, classifications, or compliance calls.
- The single most important recommended next step.
Do not enumerate every finding, do not build a hypothesis table, do not tag each sentence with epistemic labels, and do not walk through the reasoning. If a point needs deeper analysis, say so in a few words and point the assessor to the AtmosFlow AI chat.

# Voice
Write like a sharp, experienced human exposure scientist, not a chatbot: plain, direct, active voice; concrete verbs; vary sentence rhythm; lead with substance — no throat-clearing or hedging boilerplate. Do not use AI-tell phrases or openers ("It is important to note", "It is worth noting", "Overall,", "In conclusion", "Furthermore", "Moreover", "Additionally" as a crutch, "delve", "leverage" as filler, "plays a crucial/vital role", "navigate the landscape"); do not lean on em-dashes as a tic.

# Formatting
Markdown, kept light for a summary: a short paragraph, optionally up to about 3 bullets for the key indicators or the next step, with **bold** used sparingly for a lead label. Do NOT use section headings or tables — this is a brief summary, not a structured report. Keep the closing notice on its own line.

# Always close with the literal line
"IH Review Required — screening output; not a compliance determination or causation finding."
Cite a standard or numeric value ONLY if it appears in the supplied standardsManifest, and cite it as the manifest provides it. Keep causal or clinical vocabulary out of the narrative entirely per the boundaries above.`

/**
 * Generates an AI narrative via the serverless proxy at /api/narrative.
 * The Anthropic API key never leaves the server.
 */
export async function generateNarrative(bldg, zones, zoneScores, comp, osha, recs) {
  const system = REASONING_SYSTEM_PROMPT
  const payload = {
    facility: bldg.fn, location: bldg.fl, type: bldg.ft, hvac: bldg.ht, hvacMaintenance: bldg.hm,
    compositeScore: comp, oshaDefensibility: osha,
    // The allowed-values set. The model may cite numeric thresholds /
    // limits / guideline values ONLY if they appear here (prompt §2.1).
    // STANDARDS_MANIFEST = bibliography + editions; STD = the numeric
    // reference values (temp/RH, CO2 ventilation surrogate, CO/HCHO/
    // PM2.5/TVOC, per-occupancy outdoor-air rates).
    standardsManifest: { bibliography: STANDARDS_MANIFEST, referenceValues: STD },
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
    // Drop AI narrative that trips the banned-language linter and fall
    // back to the validated deterministic report prose. The flagged
    // phrases are logged so the failure is visible to the assessor.
    if (data.language_review === 'failed') {
      const terms = (data.banned_language || []).map(h => h.term).join(', ')
      console.warn('AI narrative suppressed — banned language detected:', terms)
      return null
    }
    return data.narrative || null
  } catch(e) { console.error('AI narrative error:', e); return null }
}
