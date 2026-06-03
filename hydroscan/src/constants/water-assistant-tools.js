/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Marlow tool definitions — Anthropic tool-use schemas + a synchronous
 * dispatcher. Tools are READ-ONLY and manifest-bound: every value returned
 * comes from src/constants/standards.js (the hardcoded STANDARDS_MANIFEST)
 * via water-knowledge-base.js. A lookup that isn't in the manifest returns
 * { found: false } — Marlow must never invent a value (the role prompt
 * forbids stating any limit not surfaced by a tool).
 *
 * Plain ES module (.js): reachable from api/water-assistant.ts, so it must
 * not import any extension-less `.ts` path and must not pull in heavy
 * report-rendering deps (docxtemplater/pizzip) — those live only in the
 * dedicated render endpoint (Phase 4).
 */

import {
  getStandard,
  getSamplingMethod,
  getHealthEffects,
  getStateLimit,
  listKnownParameters,
} from './water-knowledge-base.js'
import { WATER_STANDARDS_CORPUS } from './water-standards-corpus.js'
import { searchCorpus } from '../utils/corpus-search.js'

// ── Anthropic tool-use schemas (Messages API `tools` array shape) ──
export const WATER_ASSISTANT_TOOLS = [
  {
    name: 'lookup_water_standard',
    description:
      "Look up the regulatory drinking-water limits for a parameter by name or abbreviation (e.g. \"lead\", \"Pb\", \"nitrate\", \"PFOA\", \"arsenic\", \"TTHM\"). Returns the EPA MCL, MCLG, Action Level, MRDL, secondary MCL (SMCL), WHO guideline value, health-advisory level, IARC carcinogen class, and PFAS Hazard-Index membership — all from HydroScan's hardcoded standards manifest (EPA SDWA 40 CFR 141, WHO GDWQ). Use this whenever the assessor asks 'what is the MCL/limit for X?' or 'is X above the limit?'. Returns found:false if the parameter is not in the manifest — never invent a value.",
    input_schema: {
      type: 'object',
      properties: {
        parameter: { type: 'string', description: 'Parameter name or abbreviation, e.g. "lead", "Pb", "nitrate", "PFOA".' },
      },
      required: ['parameter'],
    },
  },
  {
    name: 'lookup_sampling_method',
    description:
      'Look up the recommended analytical method, sample container, preservative, and hold time for a parameter (e.g. EPA 200.8 for lead, EPA 533 for PFAS, SM 9223 for E. coli). Use this when the assessor asks "how do I sample for X?" or "what is the hold time / preservative for X?". Returns found:false if not in the manifest.',
    input_schema: {
      type: 'object',
      properties: {
        parameter: { type: 'string', description: 'Parameter name or abbreviation.' },
      },
      required: ['parameter'],
    },
  },
  {
    name: 'lookup_health_effects',
    description:
      'Look up the documented health effects and IARC carcinogen classification for a parameter, as published in the standards manifest. Use this when the assessor asks "what does X do?" or needs health context for a screening interpretation. Present results as published health-effect data, never as a medical diagnosis or causation determination. Returns found:false if not in the manifest.',
    input_schema: {
      type: 'object',
      properties: {
        parameter: { type: 'string', description: 'Parameter name or abbreviation.' },
      },
      required: ['parameter'],
    },
  },
  {
    name: 'lookup_state_limit',
    description:
      'Look up a state-specific drinking-water limit that is stricter than the federal standard (supported states: NJ, CA, MA, VT, NH, MI). Use when the assessor names a state and a parameter (commonly PFAS). Returns found:false if the state has no manifest-listed limit for that parameter.',
    input_schema: {
      type: 'object',
      properties: {
        parameter: { type: 'string', description: 'Parameter name or abbreviation (often a PFAS).' },
        state: { type: 'string', description: 'Two-letter state code, e.g. "NJ", "CA", "MI".' },
      },
      required: ['state'],
    },
  },
  {
    name: 'list_known_parameters',
    description:
      'List every parameter HydroScan can speak to, with id, name, unit, and category. Use as a discovery / fallback when a requested parameter is not found, to suggest the closest supported analytes.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_standards_corpus',
    description:
      'Full-text search over HydroScan\'s curated, primary-source-cited regulatory corpus (Lead and Copper Rule, RTCR, PFAS NPDWR, Stage 2 DBPR, ASHRAE 188, radionuclides, secondary standards, private-well guidance). Use for conceptual or procedural questions ("how does the Hazard Index work?", "Legionella temperature control", "what triggers a boil-water advisory?"). Returns the most relevant chunks with their citations.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query / question.' },
        k: { type: 'number', description: 'Max chunks to return (default 4).' },
      },
      required: ['query'],
    },
  },
]

// ── Dispatcher ──────────────────────────────────────────────────────
// Returns a JSON-serializable result for the given tool. Pure + sync; all
// data comes from the manifest-backed knowledge base.
export function dispatchTool(name, input = {}) {
  switch (name) {
    case 'lookup_water_standard': {
      const std = getStandard(input.parameter)
      return std ? { found: true, standard: std } : { found: false, parameter: input.parameter, note: 'Not in the HydroScan standards manifest.' }
    }
    case 'lookup_sampling_method': {
      const m = getSamplingMethod(input.parameter)
      return m ? { found: true, method: m } : { found: false, parameter: input.parameter, note: 'No manifest-listed sampling method for this parameter.' }
    }
    case 'lookup_health_effects': {
      const h = getHealthEffects(input.parameter)
      return h ? { found: true, healthEffects: h } : { found: false, parameter: input.parameter, note: 'Not in the HydroScan standards manifest.' }
    }
    case 'lookup_state_limit': {
      const s = getStateLimit(input.parameter, input.state)
      return s ? { found: true, stateLimit: s } : { found: false, state: input.state, parameter: input.parameter, note: 'No manifest-listed state limit for this parameter/state.' }
    }
    case 'list_known_parameters':
      return { found: true, parameters: listKnownParameters() }
    case 'search_standards_corpus': {
      const hits = searchCorpus(WATER_STANDARDS_CORPUS, input.query || '', input.k || 4)
      return { found: hits.length > 0, results: hits.map((h) => ({ title: h.title, citation: h.citation, text: h.text })) }
    }
    default:
      return { found: false, error: `Unknown tool: ${name}` }
  }
}
