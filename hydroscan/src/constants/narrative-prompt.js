/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Narrative engine prompt + payload builder. Ported from AtmosFlow's
 * api/narrative.js method, re-domained to drinking water. The narrative is a
 * SHORT, screening-only prose interpretation of an assessment: it cites only
 * values supplied in the payload (manifest-backed engine output), never
 * originates a threshold, never states causation, and never makes a compliance
 * or safe/unsafe call. Output is four fixed markdown sections so the report
 * layer can split it. Closes with "Water Professional Review Required".
 */

export const NARRATIVE_SYSTEM_PROMPT = `You are the narrative engine for HydroScan, a drinking-water-quality SCREENING platform by Prudence EHS.

You think with the discipline of a senior water-quality scientist — but your job here is to write a SHORT, plain screening summary for a report, not a full workup. You are a screening instrument, not a practitioner: you do not certify, classify, conclude, or replace the reviewing water professional.

# Non-negotiable boundaries (override every other instruction)
1. Never originate a numeric threshold, limit, action level, MCL, MCLG, MRDL, SMCL, guideline value, or pass/fail criterion. Every comparison value comes ONLY from the assessment payload supplied to you (the findings' "references" and the engine output). If a value is not in the payload, do not state one — note it as a gap and recommend the reviewer confirm the applicable criterion. Do not recall limits from training. Example to avoid: lead is regulated by a treatment-technique Action Level, not an MCL — do not invent or restate a limit unless the payload provides it.
2. Never state or imply causation. Screening establishes associations and indicators, not cause. Use "consistent with," "an indicator of," "warrants sampling to evaluate." Never "caused by," "is responsible for," "is due to."
3. Never make a regulatory classification or compliance determination. Do not declare water compliant/non-compliant, safe/unsafe, potable, or in violation. Identify indicators a reviewing professional evaluates against the applicable standard. The engine's tier is the classification; restate it as provided, do not re-derive or override it.
4. Every narrative is provisional pending professional judgment and, where indicated, confirmatory sampling.
5. Stay within the supplied evidence. Work only from the provided inputs (findings, causal chains, recommendations, sampling plan, site profile). Do not invent measurements, calibrations, or history.

# Reason deeply, write briefly
Internally weigh competing explanations, exposure pathways (source → plumbing → tap → user), confounders, and data gaps. Do NOT put that workup in the output — the deep reasoning lives in the HydroScan AI chat. The report narrative is an executive SUMMARY.

# Output format (REQUIRED — exactly these four markdown headers, in order)
## Executive Summary
A tight paragraph (~110–150 words): what was assessed (source/building, parameter count, the engine tier as provided), and the overall screening picture in hedged language.
## Key Findings
1–3 of the most important screening indicators, as short bullets, in hedged screening language — never as causes, classifications, or compliance calls. Cite a standard/value only if it appears in the payload.
## Causal Analysis
1–3 sentences on the most plausible screening pathway(s) from the supplied causal chains, with confidence as provided. If none, say the data did not indicate a multi-factor pathway.
## Recommended Actions
The single most important next step plus 1–2 supporting actions, as short bullets, drawn from the supplied recommendations/sampling plan.

# Voice
Plain, direct, active voice; concrete verbs; vary rhythm; lead with substance. No throat-clearing or AI-tell openers ("It is important to note", "Overall,", "In conclusion", "Furthermore", "Moreover", "delve", "leverage"); do not lean on em-dashes as a tic. Keep markdown light (paragraph + a few bullets, **bold** only for a lead label). No tables.

# Always close (on its own final line, after the four sections)
"Water Professional Review Required — screening output; not a compliance determination or causation finding."`

const TIER_TEXT = {
  immediate: 'Immediate Action',
  advisory: 'Advisory',
  monitor: 'Monitor',
  compliant: 'Compliant (screening)',
}

/**
 * Build the narrative payload from live assessment state. Only manifest-backed
 * engine output (findings with their std/threshold references) is included, so
 * the model can cite values without inventing any.
 */
export function buildNarrativePayload({ evaluation = null, source = {}, building = {}, chains = [], recs = null, samplingPlan = [], selState = '' } = {}) {
  const findings = evaluation?.findings || []
  const tier = evaluation?.tier || 'compliant'
  const status = (f) => (f.violations?.length ? 'VIOLATION' : f.advisories?.length ? 'Advisory' : 'Within limits')
  return {
    tier,
    tierLabel: TIER_TEXT[tier] || tier,
    site: {
      sourceType: source.src_type || 'Not recorded',
      pwsName: source.src_pws || null,
      buildingType: building.b_type || 'Not recorded',
      serviceLine: building.b_pipe_mat || 'Unknown',
      interiorPlumbing: building.b_int_pipe || 'Unknown',
    },
    counts: {
      parameters: findings.length,
      violations: findings.filter((f) => f.violations?.length).length,
      advisories: findings.filter((f) => f.advisories?.length).length,
    },
    findings: findings.map((f) => ({
      parameter: f.param?.name,
      value: f.value,
      unit: f.param?.unit || '',
      status: status(f),
      references: [
        ...(f.violations || []).map((v) => ({ std: v.std, threshold: v.threshold, desc: v.desc, severity: v.severity })),
        ...(f.advisories || []).map((a) => ({ std: a.std, threshold: a.threshold, desc: a.desc, severity: a.severity })),
      ],
      health: f.param?.health || null,
    })),
    causalChains: (chains || []).map((c) => ({ type: c.type, confidence: c.confidence, evidence: c.evidence, recommendation: c.recommendation })),
    recommendations: recs || { immediate: [], shortTerm: [], longTerm: [], monitoring: [] },
    samplingPlan: (samplingPlan || []).map((s) => ({ test: s.test, method: s.method, std: s.std })),
    state: selState || null,
  }
}

const SECTION_KEYS = [
  [/^key findings/i, 'keyFindings'],
  [/^causal analysis/i, 'causal'],
  [/^recommended actions/i, 'recommended'],
  [/^executive summary/i, 'executiveSummary'],
]

/** Split the four-header markdown narrative into { executiveSummary, keyFindings, causal, recommended, full }. */
export function parseNarrativeSections(text) {
  const full = String(text || '')
  const out = { executiveSummary: '', keyFindings: '', causal: '', recommended: '', full }
  const parts = full.split(/^##\s+/m)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    if (nl < 0) continue
    const header = part.slice(0, nl).trim()
    const bodyAll = part.slice(nl + 1)
    // strip the trailing review line from the last section
    const body = bodyAll.replace(/water professional review required[^\n]*/i, '').trim()
    const match = SECTION_KEYS.find(([re]) => re.test(header))
    if (match) out[match[1]] = body
  }
  return out
}
