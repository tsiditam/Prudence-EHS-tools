/**
 * Prudence EHS — Field Assistant tool definitions
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Anthropic tool schemas for the Field Assistant (Jasper). These wrap
 * the curated tables in src/constants/iaq-knowledge-base.js so the
 * agent can call them by name when answering an analyte-specific
 * question. Calling a tool returns deterministic, primary-source-
 * cited data — the agent is then expected to synthesize the answer
 * around the tool result, never inventing values.
 *
 * Why three tools (not one):
 *   Anthropic's tool-use loop is more reliable when each tool has a
 *   narrow, well-defined output shape. Three tools — exposure limits,
 *   sampling methods, health effects — each return ~10-25 fields of
 *   structured data without forcing the model to ask for "everything"
 *   when the assessor only wants the PEL.
 *
 * Engine-sacred constraint:
 *   These tools are read-only lookups against a static table. They
 *   do not call into the scoring engine, do not write to assessment
 *   state, and do not influence the deterministic scoring math. Jasper
 *   continues to be a research / triage aide.
 */

import {
  lookupExposureLimit,
  lookupSamplingMethod,
  lookupHealthEffects,
  listAnalytes,
} from './iaq-knowledge-base.js'
import { searchCorpus } from '../utils/corpus-search.js'
import { summarizeCorpus } from './standards-corpus.js'

// ── Anthropic tool-use schemas ──────────────────────────────────────
// Each entry mirrors the Anthropic Messages API "tools" array shape.
// See: https://docs.anthropic.com/en/docs/tool-use

export const FIELD_ASSISTANT_TOOLS = [
  {
    name: 'lookup_exposure_limit',
    description:
      'Look up the regulatory exposure limit (OSHA PEL, NIOSH REL, ACGIH TLV, EPA NAAQS) for an IAQ-relevant analyte by chemical name, common abbreviation (CO, CO2, HCHO, TVOC, PM2.5, etc.), or CAS number. Returns primary-source-cited values from 29 CFR 1910.1000 Table Z-1/Z-2, the NIOSH Pocket Guide, ACGIH 2025 TLVs, and EPA NAAQS. Use this whenever the assessor asks "what is the PEL/TLV/REL/limit for X?" or "is X above the exposure limit?". Returns null if the analyte is not in the curated table — never invent a value.',
    input_schema: {
      type: 'object',
      properties: {
        analyte: {
          type: 'string',
          description:
            'The analyte name, abbreviation, or CAS number. Examples: "formaldehyde", "HCHO", "50-00-0", "CO", "PM2.5", "benzene", "asbestos", "radon".',
        },
      },
      required: ['analyte'],
    },
  },
  {
    name: 'lookup_sampling_method',
    description:
      'Look up the recommended analytical sampling methods for an IAQ-relevant analyte. Returns a list of NIOSH (NMAM), OSHA, and EPA methods plus the typical direct-read screening approach. Use this whenever the assessor asks "how should I sample for X?" or "what method should I use to analyze X?". Returns null if not in the curated table.',
    input_schema: {
      type: 'object',
      properties: {
        analyte: {
          type: 'string',
          description:
            'The analyte name, abbreviation, or CAS number. Same input vocabulary as lookup_exposure_limit.',
        },
      },
      required: ['analyte'],
    },
  },
  {
    name: 'lookup_health_effects',
    description:
      'Look up the documented health effects of an IAQ-relevant analyte (acute symptoms at threshold levels, chronic effects, IARC carcinogen classification, target organs, biological-exposure-index biomarkers). Sourced from ATSDR ToxProfiles, IARC Monographs, EPA IRIS, and substance-specific OSHA standards. Use this whenever the assessor asks "what does exposure to X do?", "what are the symptoms of X?", or needs to draft a screening interpretation that references known health endpoints. The agent must always present this as published health-effect data, NOT as a medical diagnosis or causation determination.',
    input_schema: {
      type: 'object',
      properties: {
        analyte: {
          type: 'string',
          description:
            'The analyte name, abbreviation, or CAS number. Same input vocabulary as lookup_exposure_limit.',
        },
      },
      required: ['analyte'],
    },
  },
  {
    name: 'list_known_analytes',
    description:
      'List every analyte in the curated knowledge base (canonical name + aliases + CAS). Call this only when (a) a previous lookup returned not_found and you want to suggest a similar analyte the assessor may have meant, or (b) the assessor explicitly asks what the tool knows about. Do not call on every turn — the analyte set is stable.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_standards_corpus',
    description:
      'Free-text search over the curated IAQ standards corpus: ASHRAE 62.1 / 55 / 241, OSHA Z-1/Z-2, NIOSH RELs/NMAM methods, EPA NAAQS, IICRC S520 mold framework, IARC carcinogen groups, sampling methodology, defensibility primitives. Returns up to k matching passages each with a primary-source citation. Use this for conceptual or methodological questions where the answer is NOT a single analyte\'s PEL/TLV/method (those use the lookup_* tools). Examples: "what is demand-controlled ventilation", "how is mold condition 3 defined", "chain of custody requirements", "Mølhave TVOC framework", "ASHRAE 241 ECAi". Synthesize the returned passages into the four-section answer format; cite the returned citation strings verbatim.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Free-text query. Use technical terms from IAQ practice — ASHRAE / OSHA / NIOSH / EPA section numbers, acronyms (PEL, TLV, REL, NAAQS, ECAi), or topic phrases ("mold condition framework", "ventilation rate procedure"). Stopwords are filtered.',
        },
        k: {
          type: 'integer',
          description:
            'Maximum number of passages to return (default 3, max 10). Use 3 for direct questions; up to 5 for broader concept queries.',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['query'],
    },
  },
]

/**
 * Dispatch a tool call. Returns a JSON-serializable object the Anthropic
 * tool-result block can consume. Never throws — failure modes are
 * encoded as { error, ... } so the agent can recover gracefully.
 */
export function dispatchTool(name, input) {
  try {
    if (name === 'lookup_exposure_limit') {
      const analyte = input && typeof input.analyte === 'string' ? input.analyte : ''
      const result = lookupExposureLimit(analyte)
      if (!result) {
        return {
          status: 'not_found',
          analyte,
          message:
            'Analyte not in the curated table. Do not invent a value — tell the assessor the lookup table does not cover this substance and recommend they consult 29 CFR 1910.1000, the NIOSH Pocket Guide, or ACGIH TLVs and BEIs directly.',
        }
      }
      return { status: 'ok', ...result }
    }

    if (name === 'lookup_sampling_method') {
      const analyte = input && typeof input.analyte === 'string' ? input.analyte : ''
      const result = lookupSamplingMethod(analyte)
      if (!result) {
        return {
          status: 'not_found',
          analyte,
          message:
            'Analyte not in the curated sampling-methods table. Recommend the assessor consult NIOSH NMAM, OSHA Sampling Methods, or EPA TO-15/TO-17 directly.',
        }
      }
      return { status: 'ok', ...result }
    }

    if (name === 'lookup_health_effects') {
      const analyte = input && typeof input.analyte === 'string' ? input.analyte : ''
      const result = lookupHealthEffects(analyte)
      if (!result) {
        return {
          status: 'not_found',
          analyte,
          message:
            'Analyte not in the curated health-effects table. Recommend the assessor consult ATSDR ToxProfiles, IARC Monographs, or EPA IRIS directly.',
        }
      }
      return { status: 'ok', ...result }
    }

    if (name === 'list_known_analytes') {
      return { status: 'ok', analytes: listAnalytes() }
    }

    if (name === 'search_standards_corpus') {
      const query = input && typeof input.query === 'string' ? input.query : ''
      const k = input && typeof input.k === 'number' ? input.k : 3
      if (!query.trim()) {
        return {
          status: 'error',
          error: 'empty_query',
          message: 'Query string is empty.',
        }
      }
      const results = searchCorpus(query, { k })
      if (results.length === 0) {
        return {
          status: 'no_matches',
          query,
          corpus_summary: summarizeCorpus(),
          message:
            'No passages in the curated corpus match this query. The corpus covers ASHRAE 62.1 / 55 / 241, OSHA / NIOSH / ACGIH / EPA reference frameworks, IICRC S520 mold, and core IAQ methodology. If the question is about a specific analyte\'s PEL/TLV/method, call lookup_exposure_limit / lookup_sampling_method / lookup_health_effects instead. Otherwise tell the assessor the corpus does not cover this topic and recommend primary sources.',
        }
      }
      return {
        status: 'ok',
        query,
        result_count: results.length,
        results: results.map((r) => ({
          id: r.chunk.id,
          title: r.chunk.title,
          citation: r.chunk.citation,
          document: r.chunk.document,
          year: r.chunk.year,
          text: r.chunk.text,
          relevance: Math.round(r.score * 1000) / 1000,
        })),
      }
    }

    return {
      status: 'error',
      error: 'unknown_tool',
      message: `Tool "${name}" is not registered.`,
    }
  } catch (err) {
    return {
      status: 'error',
      error: 'dispatch_failed',
      message: err && err.message ? err.message : String(err),
    }
  }
}
