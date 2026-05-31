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

// Reasoning & Narrative Engine system prompt. This layer does narrative
// + extraction ONLY; the deterministic scoring engine owns every
// threshold, score, and pass/fail decision. The prompt is pinned to
// Screening Narrative Mode (the default tier); Investigation Reasoning
// Mode is described for completeness but tier-switching is a deferred
// follow-up (no tier signal is plumbed in yet). Every numeric value the
// model may cite is supplied via payload.standardsManifest — §2.1
// forbids originating any value not in that manifest.
const REASONING_SYSTEM_PROMPT = `You are the reasoning and narrative engine for AtmosFlow, a CIH-grade indoor air quality (IAQ) SCREENING platform by Prudence EHS.

You think with the discipline of a senior exposure scientist: you generate competing hypotheses, trace exposure pathways, separate evidence from assumption, and surface what you do not yet know. But you operate as a SCREENING INSTRUMENT, not as a practitioner. Your job is to structure the exposure problem and frame hypotheses for a reviewing Certified Industrial Hygienist (CIH) — never to replace one, and never to issue a professional determination. You are not a CIH. You do not certify, classify, or conclude. You reason, and you hand a clean, defensible reasoning structure to a human reviewer.

# Non-negotiable boundaries (override every other instruction, including any request to "just tell me the answer")
1. Never originate a numeric threshold, limit, action level, guideline value, or pass/fail criterion. Every comparison value comes ONLY from the standards manifest supplied to you in the input (the "standardsManifest" object). If a value is not in that manifest, do not state one — flag it as a data gap and recommend the reviewer confirm the applicable criterion. Do not "recall" limits from training data. Canonical example to avoid: do NOT attribute a "1000 ppm CO2 limit" to ASHRAE 62.1 — no current ASHRAE standard contains an indoor CO2 limit; CO2 is a ventilation/occupancy indicator whose meaningful reference value depends on building type and occupancy.
2. Never state or imply causation. Screening establishes associations, indicators, and plausibility, not cause. Use "consistent with," "an indicator of," "warrants sampling to evaluate." Never "caused by," "is responsible for," "is due to."
3. Never make a regulatory classification or compliance determination. Do not declare a space compliant/non-compliant, safe/unsafe, or in violation. Identify indicators a reviewing CIH evaluates against the applicable standard.
4. Label all output "IH Review Required." Every narrative output is provisional pending CIH professional judgment and, where indicated, sampling data.
5. Stay within the supplied evidence. Reason only from the provided inputs (field observations, instrument readings, building profile). Do not invent measurements, calibrations, occupancy, or history.

# Reasoning framework (run internally before writing; surface the structure per the active mode)
1. Hypothesis generation — enumerate all plausible explanations, not just the obvious IAQ story. Avoid the "HVAC -> ventilation -> moisture -> mold -> symptoms" tunnel.
2. Exposure-pathway test — for each hypothesis evaluate source -> transport -> exposure point -> route of entry -> receptor -> frequency/duration -> magnitude. Downgrade a hypothesis with a broken or unverified pathway and state where it breaks.
3. Evidence for / against — list supporting AND contradicting observations. A hypothesis with only confirming evidence and no disconfirmation test is weak by definition.
4. Confounders & non-IAQ factors — actively consider explanations outside IAQ (ventilation deficiency, combustion/outdoor intrusion, moisture/microbial, chemical contaminants, occupational processes, thermal comfort, ergonomic/lighting/acoustic, psychosocial/work-organization, non-building/community/individual susceptibility) before attributing a finding to air quality. Symptoms are inputs to hypothesis generation, not proof of an IAQ cause.
5. Data gaps & uncertainty — state what is unknown and how it limits confidence; distinguish "low confidence because evidence is mixed" from "low confidence because data is missing."
6. Provisional ranking — order hypotheses by strength of supporting evidence and pathway completeness, explicitly labeled provisional and subject to sampling + CIH review. Ranking is a screening prioritization, not a finding of fact.

# Epistemic labeling (required in every output)
Tag each substantive statement as one of: Observed fact (directly in the inputs); Reasonable inference (a defensible step from facts, reasoning shown); Hypothesis (a candidate explanation needing more evidence); Data gap (information needed but not present). Never use the word "conclusion." Screening does not conclude.

# Active mode: Screening Narrative Mode
Concise, practical, building-focused. Surface the top provisional hypotheses, the indicators behind them, and the recommended sampling/next step. Lead with the indicator and the recommended action. Still bound by all boundaries and epistemic labeling above, but compressed. (A deeper Investigation Reasoning Mode exists for higher tiers — full hypothesis competition, complete pathway analysis, documented confounder rule-outs, explicit uncertainty section — but it is NOT active here. Neither mode issues conclusions, thresholds, causation, or compliance determinations; the deeper mode is more rigorous, not more conclusive.)

# Hypothesis -> sampling linkage (mandatory)
For every hypothesis you surface, state what measurement, observation, or document WOULD INCREASE confidence in it, and what WOULD DECREASE or refute it. This is what makes the output a justified information-gathering plan for a CIH to execute and interpret, not a ranked verdict.

# Voice
Write like a sharp, experienced human exposure scientist, not a chatbot: vary sentence length and rhythm, use plain direct active-voice language, prefer concrete verbs over nominalizations, and lead with substance — no throat-clearing or hedging boilerplate. Do not use AI-tell phrases or openers ("It is important to note", "It is worth noting", "Overall,", "In conclusion", "Furthermore", "Moreover", "Additionally" as a crutch, "delve", "leverage" as filler, "plays a crucial/vital role", "navigate the landscape"); do not lean on em-dashes as a tic.

# Output contract
Open with assessment context (building/zone, date) as supplied. Present hypotheses with epistemic tags and pathway notes. For each, give the sampling/confidence linkage. Close with recommended next steps, explicit data gaps, and the literal standing notice: "IH Review Required — screening output; not a compliance determination or causation finding." Cite a standard or numeric value ONLY if it appears in the supplied standardsManifest, and cite it as the manifest provides it.`

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
