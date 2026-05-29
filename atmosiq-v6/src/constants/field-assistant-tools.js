/**
 * Prudence EHS — Field Assistant tool definitions
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Anthropic tool schemas + async dispatcher for the Field Assistant
 * (Jasper). Tools are read-only by design; they return deterministic
 * structured data the agent synthesizes into the four-section answer
 * format.
 *
 * Tool catalog:
 *   • lookup_exposure_limit  — L2: OSHA PEL / NIOSH REL / ACGIH TLV from
 *     iaq-knowledge-base.js
 *   • lookup_sampling_method — L2: NIOSH NMAM / OSHA / EPA TO methods
 *   • lookup_health_effects  — L2: ATSDR / IARC health endpoints
 *   • list_known_analytes    — L2: discovery / fallback
 *   • search_standards_corpus — L3: TF-IDF over the curated standards corpus
 *   • analyze_photo          — L4: multimodal photo analysis via Anthropic
 *     vision, using the same screening-only prompt as /api/photo-analyze
 *
 * Engine-sacred constraint:
 *   No imports from src/engine/ or src/engines/. The vision tool calls
 *   Anthropic's API directly via the fetch fn supplied in ctx — it does
 *   not touch the deterministic scoring engine.
 */

import {
  lookupExposureLimit,
  lookupSamplingMethod,
  lookupHealthEffects,
  listAnalytes,
} from './iaq-knowledge-base.js'
import { searchCorpus } from '../utils/corpus-search.js'
import { summarizeCorpus } from './standards-corpus.js'
// NOTE: the docxtemplater-backed renderer (lib/report-templates/render.ts)
// is NOT imported directly here. This file is plain ES modules; the
// renderer is TypeScript and pulls in docxtemplater + pizzip. Importing
// it from this `.js` module crashes the Vercel runtime at load time
// because the .ts extension isn't resolvable from a .js ESM context,
// which would break every Jasper call — not just generate_report. So
// the renderer is injected via ctx.renderTemplate by the TS handler
// (api/field-assistant.ts), matching the analyze_photo pattern.

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
  {
    name: 'analyze_photo',
    description:
      'Run an Anthropic-vision IAQ screening analysis on a photo the assessor has attached to this conversation. Returns structured screening JSON: observed (what is visible), concerns (1-5 short clauses), probable_iaq_class (hedged tentative classification — never definitive), recommended_actions (next-step sampling / documentation), confidence (low/medium/high), citations (IICRC S520, EPA, ASHRAE — never invented), and a screening-only disclaimer. ALWAYS includes ih_review_required=true. The list of photos available in this conversation appears in the assessor-context block (each with id + label); call analyze_photo(photo_id) referencing one of those IDs. Optional `focus` narrows the model\'s attention (mold | moisture | hvac | ventilation | dust | general). Use this when the assessor asks "what do you see in the photo?", "any concerns with this image?", or attaches a photo and asks for screening interpretation. Returns status:not_found if the photo_id is not in the conversation.',
    input_schema: {
      type: 'object',
      properties: {
        photo_id: {
          type: 'string',
          description:
            'The id of the attached photo (from the "Available photos" entries in the assessor-context block).',
        },
        focus: {
          type: 'string',
          enum: ['mold', 'moisture', 'hvac', 'ventilation', 'dust', 'general'],
          description:
            'Optional focus area to direct the vision model. Defaults to "general" (broad IAQ screen). Use "mold" for visible growth, "moisture" for water damage / staining, "hvac" for equipment / diffusers / coils, "ventilation" for return / supply / pathways, "dust" for accumulation / housekeeping.',
        },
      },
      required: ['photo_id'],
    },
  },
  {
    name: 'propose_action',
    description:
      "Propose a user-confirmable action to the assessor. Use this whenever the user asks Jasper to DO something in the app — navigate to a screen, add a note to a zone, or otherwise mutate app state — rather than just asking a question. The tool does NOT execute the action server-side: it returns a structured proposal that the client renders as an inline action card with Accept / Reject buttons. The user retains final control. Examples that should trigger this tool: \"take me to the actions tab\", \"open settings\", \"show me the results\", \"add a note to this zone that the HVAC was running loud\", \"jot down that the carpet smelled musty\". For pure information questions (\"what does ASHRAE 62.1 say about CO₂?\") DO NOT use this tool — answer with text. After calling this tool, follow up with a short one-line acknowledgement ('I've drafted that — tap Accept to apply.'). NEVER invent measurements, occupant counts, severity ratings, or scores; this tool only carries the literal user request.",
    input_schema: {
      type: 'object',
      properties: {
        action_type: {
          type: 'string',
          enum: ['navigate', 'add_zone_note'],
          description:
            'Which action to propose. "navigate" routes to a screen via setView. "add_zone_note" appends free-text to the current zone\'s notes field.',
        },
        target: {
          type: 'string',
          description:
            'For action_type=navigate: the target view. One of "dash" (home), "history" (reports), "settings", "search", "trash", "incident-log", "results" (current assessment results). If the user names a tab inside the results view (findings / pathways / sampling / narrative / actions), use action_type=navigate with target="results" and put the inner tab in tab_target.',
        },
        tab_target: {
          type: 'string',
          enum: ['overview', 'findings', 'pathways', 'sampling', 'narrative', 'actions'],
          description:
            'Optional inner tab when target=results. Routes setRTab on the client.',
        },
        note_text: {
          type: 'string',
          description:
            'For action_type=add_zone_note: the literal text to add to the zone\'s notes field. Use the user\'s words verbatim where possible; do not paraphrase or expand.',
        },
        zone_label: {
          type: 'string',
          description:
            'Optional human-readable zone label for the action card. If not supplied, the client uses the current zone from context.',
        },
        summary: {
          type: 'string',
          description:
            'One-line summary the client shows on the action card ("Add note to Zone A1", "Open Reports", etc.). Always provide this so the user knows what they\'re accepting.',
        },
      },
      required: ['action_type', 'summary'],
    },
  },
  {
    name: 'generate_report',
    description:
      "Render a user-uploaded DOCX report template, filling all {{tokens}} with LITERAL data from the current assessment context. Use this whenever the assessor asks to \"render\", \"generate\", \"make\", or \"build\" a report from one of their saved templates (\"render my Federal template\", \"make me a deliverable using the Acme template\"). The tool does NOT write any prose into the template — it only substitutes registered tokens (client name, facility, finding counts, etc.) with values from the assessment. After a successful render the chat client surfaces an inline Download card and the assessor decides whether to save the file. If the user has no templates saved, the tool returns no_templates_saved and Jasper should point them at Settings → Report Templates. If the name hint matches multiple templates, the tool returns needs_disambiguation and Jasper should ask the user which one. Never invent or paraphrase data — every {{token}} is resolved by the canonical registry.",
    input_schema: {
      type: 'object',
      properties: {
        template_id: {
          type: 'string',
          description:
            "Direct id of a saved report template. Prefer this when the user has named the template unambiguously and you've previously seen its id in this conversation.",
        },
        template_name_hint: {
          type: 'string',
          description:
            "Free-text hint of which template the user means (\"Federal\", \"the one with the green letterhead\"). The dispatcher fuzzy-matches against saved template names. If exactly one matches, it is used; if multiple match, the tool returns needs_disambiguation so Jasper can ask the user.",
        },
        file_name: {
          type: 'string',
          description:
            "Optional output file name (without extension). Defaults to \"{template_name}_{YYYY-MM-DD}\". Use a name that includes the client or site when known, e.g. \"AcmeHQ_IAQ_Screening\".",
        },
      },
      required: [],
    },
  },
]

// ── Vision tool internals ───────────────────────────────────────────
// Adapted from api/photo-analyze.js — same system prompt, same JSON
// shape, same screening-only positioning. Inlined here so the
// dispatcher stays self-contained (api/photo-analyze.js is CJS;
// importing across the JS/CJS boundary in the tool dispatcher would
// complicate the test surface).

const VISION_MODEL = 'claude-sonnet-4-6'
const VISION_MAX_TOKENS = 1200

const VISION_SYSTEM_PROMPT = `You are an AI screening assistant for AtmosFlow, an indoor air quality (IAQ) assessment platform used by certified industrial hygienists (CIHs) and EHS professionals.

You are looking at a single field photo captured during an IAQ walkthrough. Your job is to describe what is visibly relevant to IAQ and propose what a qualified IH might consider doing next. You are NOT making a diagnosis, not identifying species, not assigning OSHA compliance status, and not making remediation decisions. Your output is screening-only.

Output requirements (STRICT):
1. Return ONE valid JSON object only — no prose before or after.
2. Schema (every field required; use null for absent values):
   {
     "observed": string,              // 1-2 sentence factual description of what is visible (color, location, surrounding context). Do NOT speculate beyond what is visible.
     "concerns": string[],            // 0-5 short concerns, each a clause (e.g. "Visible dark growth on porous substrate"). Empty array when no IAQ concerns are apparent.
     "probable_iaq_class": string|null, // Tentative classification — e.g. "Possible IICRC S520 Condition 2 (settled spores or indirectly-contaminated materials)". Always hedged ("possible", "consistent with"). null when not applicable.
     "recommended_actions": string[], // 0-5 brief next-step recommendations — e.g. "Consider Air-O-Cell spore trap sample for AOC + outdoor reference", "Document moisture content with pin meter". Screening-level only.
     "confidence": "low"|"medium"|"high", // Your confidence in the visual analysis. Most photos should be "low" or "medium".
     "citations": string[],           // 0-4 standards / references RELEVANT to the proposed actions. Allowed: IICRC S520-2024, EPA Mold Remediation in Schools and Commercial Buildings, ASHRAE 62.1-2025, ASHRAE 55-2023, OSHA Z-1 PELs (29 CFR 1910.1000), NIOSH RELs, ASHRAE 241-2023, ACGIH TLVs. Never invent a citation.
     "disclaimers": string            // Hardcoded note acknowledging screening-only positioning and IH-review requirement.
   }
3. NEVER claim definitive species identification, definitive compliance status, or final remediation tier from a photo alone.
4. NEVER use the phrase "AI confirms" or "AI determines" — use "AI screening suggests" / "may warrant" / "consider".
5. When in doubt, prefer a LOWER confidence value and add a recommended_action that proposes confirmatory sampling.
6. If the photo shows NO IAQ-relevant content (e.g. exterior, blank wall, person's face), return empty concerns/recommended_actions arrays, probable_iaq_class: null, confidence: "low", and observed: 1 sentence describing what is shown.`

const FOCUS_HINTS = {
  mold: 'Pay particular attention to visible mold growth: color, distribution (point-source vs scattered), substrate type (porous = drywall/wood/carpet vs non-porous), and contiguous moisture indicators.',
  moisture: 'Pay particular attention to water damage indicators: staining patterns, tide lines, efflorescence, cupping/warping of wood or flooring, paint blistering, and visible bulk water.',
  hvac: 'Pay particular attention to HVAC system condition: supply / return diffuser cleanliness, coil staining, filter loading, drip-pan integrity, duct interior visible through register, evidence of microbial growth on damp surfaces.',
  ventilation: 'Pay particular attention to ventilation indicators: return air pathways blocked, supply diffuser orientation, transfer grilles, outdoor air intake locations, and obvious short-circuiting between supply and return.',
  dust: 'Pay particular attention to dust accumulation, housekeeping condition, and any settled-particulate patterns that suggest source loading or inadequate filtration.',
  general: 'Provide a broad IAQ screening assessment of the photo content.',
}

/**
 * Validate a data URL matches the expected JPEG / PNG / WebP shape and
 * extract the base64 payload + media type. Returns null on any
 * mismatch — caller treats that as a hard rejection.
 */
export function parsePhotoDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return null
  return { mediaType: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2] }
}

/**
 * Coerce the model's response into the canonical PhotoAnalysis shape.
 * Defensive against missing/fuzzed fields. Identical to the parser in
 * api/photo-analyze.js so the contract stays consistent across the
 * standalone endpoint and the tool dispatcher.
 */
function parseVisionResponse(data) {
  if (!data || !Array.isArray(data.content)) return null
  const textBlock = data.content.find((b) => b && b.type === 'text')
  if (!textBlock || typeof textBlock.text !== 'string') return null
  let parsed
  try {
    const text = textBlock.text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim()
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const clampStr = (v) => (typeof v === 'string' ? v : null)
  const clampArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  const conf = ['low', 'medium', 'high'].includes(parsed && parsed.confidence)
    ? parsed.confidence
    : 'low'
  return {
    observed: clampStr(parsed && parsed.observed) || '',
    concerns: clampArr(parsed && parsed.concerns).slice(0, 5),
    probable_iaq_class: clampStr(parsed && parsed.probable_iaq_class),
    recommended_actions: clampArr(parsed && parsed.recommended_actions).slice(0, 5),
    confidence: conf,
    citations: clampArr(parsed && parsed.citations).slice(0, 4),
    disclaimers:
      clampStr(parsed && parsed.disclaimers) ||
      'Screening-level visual analysis only. AI cannot make species ID or final remediation determinations. Must be reviewed by a qualified industrial hygienist before client distribution.',
    ih_review_required: true,
    model: VISION_MODEL,
    generated_at: new Date().toISOString(),
  }
}

async function analyzePhoto(photo, focus, ctx) {
  if (!ctx || !ctx.anthropicApiKey || !ctx.fetchFn) {
    return {
      status: 'error',
      error: 'vision_unavailable',
      message:
        'Vision analysis is not available in this request context. Photo analysis must be invoked through the Field Assistant API handler.',
    }
  }
  const img = parsePhotoDataUrl(photo.dataUrl)
  if (!img) {
    return {
      status: 'error',
      error: 'invalid_photo',
      message: 'Photo data URL is malformed or uses an unsupported MIME type (jpeg/png/webp required).',
    }
  }
  const focusKey = typeof focus === 'string' && FOCUS_HINTS[focus] ? focus : 'general'
  const userText = `Analyze this IAQ field photo. ${FOCUS_HINTS[focusKey]}

Photo label (assessor-supplied, may be missing): ${photo.label || '(no label provided)'}

Return the JSON object specified in your system prompt.`

  let upstream
  try {
    upstream = await ctx.fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ctx.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: VISION_MAX_TOKENS,
        system: VISION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
              { type: 'text', text: userText },
            ],
          },
        ],
      }),
    })
  } catch (err) {
    return {
      status: 'error',
      error: 'vision_call_failed',
      message: err && err.message ? err.message : 'Anthropic vision call failed.',
    }
  }
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '')
    return {
      status: 'error',
      error: 'vision_upstream_error',
      upstream_status: upstream.status,
      message: errText || 'Upstream vision call returned a non-2xx status.',
    }
  }
  const data = await upstream.json().catch(() => null)
  const analysis = parseVisionResponse(data)
  if (!analysis) {
    return {
      status: 'error',
      error: 'vision_unparseable',
      message: 'Vision model returned an unparseable response. Recommend the assessor retry or capture a clearer photo.',
    }
  }
  // Record usage on the ctx so the parent handler can write a ledger row
  // / audit entry without us needing direct supabase access here.
  if (ctx.recordVisionUsage) {
    try {
      ctx.recordVisionUsage({
        photo_id: photo.id,
        focus: focusKey,
        input_tokens: data.usage && data.usage.input_tokens,
        output_tokens: data.usage && data.usage.output_tokens,
        confidence: analysis.confidence,
      })
    } catch {
      /* non-fatal */
    }
  }
  return {
    status: 'ok',
    photo_id: photo.id,
    photo_label: photo.label || null,
    focus: focusKey,
    analysis,
  }
}

/**
 * Dispatch a tool call. Returns a JSON-serializable object the Anthropic
 * tool-result block can consume. Never throws — failure modes are
 * encoded as { error, ... } so the agent can recover gracefully.
 *
 * @param {string} name — tool name from the FIELD_ASSISTANT_TOOLS array
 * @param {object} input — the tool_use input block (already parsed JSON)
 * @param {object} [ctx] — request-scoped context. Carries:
 *   - photos: Map<id, {id, dataUrl, label?}>  — for analyze_photo
 *   - anthropicApiKey: string                  — for analyze_photo
 *   - fetchFn: typeof fetch                    — for analyze_photo
 *   - recordVisionUsage?: (usage) => void      — optional ledger hook
 */
export async function dispatchTool(name, input, ctx = {}) {
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

    if (name === 'analyze_photo') {
      const photoId = input && typeof input.photo_id === 'string' ? input.photo_id : ''
      const focus = input && typeof input.focus === 'string' ? input.focus : 'general'
      if (!photoId) {
        return {
          status: 'error',
          error: 'missing_photo_id',
          message: 'analyze_photo requires a photo_id matching an "Available photos" entry in the context.',
        }
      }
      const photos = ctx && ctx.photos
      if (!photos || typeof photos.get !== 'function') {
        return {
          status: 'no_photos_attached',
          message:
            'No photos are attached to this conversation. Tell the assessor to capture / attach a photo via the chat interface before requesting analysis.',
        }
      }
      const photo = photos.get(photoId)
      if (!photo) {
        const knownIds = Array.from(photos.keys())
        return {
          status: 'not_found',
          photo_id: photoId,
          known_photo_ids: knownIds,
          message: `Photo "${photoId}" is not in the conversation. Available IDs: ${
            knownIds.length ? knownIds.join(', ') : '(none)'
          }.`,
        }
      }
      return await analyzePhoto(photo, focus, ctx)
    }

    if (name === 'propose_action') {
      // Agentic action proposal. The tool intentionally does NOT
      // execute the action server-side — it returns a structured
      // payload that the client renders as an inline action card
      // with Accept / Reject buttons. The user retains the final
      // word over any state mutation. The API layer side-channels
      // the same payload to the client via a `proposed_action`
      // SSE event (see api/field-assistant.ts) so the chat UI
      // can render the card while the agent finishes its turn.
      const allowed = new Set(['navigate', 'add_zone_note'])
      const actionType = input && typeof input.action_type === 'string' ? input.action_type : ''
      if (!allowed.has(actionType)) {
        return {
          status: 'rejected',
          reason: 'unsupported_action_type',
          message: `Unsupported action_type "${actionType}". Supported: ${[...allowed].join(', ')}.`,
        }
      }
      const allowedTargets = new Set(['dash', 'history', 'settings', 'search', 'trash', 'incident-log', 'results'])
      const allowedTabs = new Set(['overview', 'findings', 'pathways', 'sampling', 'narrative', 'actions'])
      const action = { type: actionType }
      if (actionType === 'navigate') {
        const target = input && typeof input.target === 'string' ? input.target : ''
        if (!allowedTargets.has(target)) {
          return {
            status: 'rejected',
            reason: 'unsupported_target',
            message: `Unsupported navigation target "${target}". Supported: ${[...allowedTargets].join(', ')}.`,
          }
        }
        action.target = target
        if (input.tab_target && allowedTabs.has(input.tab_target)) {
          action.tab_target = input.tab_target
        }
      } else if (actionType === 'add_zone_note') {
        const noteText = input && typeof input.note_text === 'string' ? input.note_text : ''
        if (!noteText.trim()) {
          return {
            status: 'rejected',
            reason: 'empty_note',
            message: 'note_text is required and cannot be empty.',
          }
        }
        action.note_text = noteText.slice(0, 1000)
        if (typeof input.zone_label === 'string' && input.zone_label.trim()) {
          action.zone_label = input.zone_label.slice(0, 200)
        }
      }
      const summary = input && typeof input.summary === 'string' && input.summary.trim()
        ? input.summary.slice(0, 200)
        : `Proposed ${actionType}`
      return {
        status: 'proposed',
        action,
        summary,
        // Echoed back to the model so it can reference the
        // proposal in its follow-up text. The model should NOT
        // assume the action has been applied — it should tell the
        // user to tap Accept.
        message: 'Action proposed. The user will see an Accept / Reject card and decide.',
      }
    }

    if (name === 'generate_report') {
      // Required ctx (injected by api/field-assistant.ts):
      //   • supabase          — service-role client; used to look up
      //                         which template the user means
      //   • userId            — caller's auth.uid()
      //
      // The dispatcher does NOT render the docx itself. Rendering
      // happens client-side via /api/report-templates-render — that
      // keeps docxtemplater + pizzip out of the Jasper cold-start.
      // The tool returns a structured proposal; the SSE side-channel
      // 'render_proposed' event tells the client to fetch + download.
      if (!ctx || !ctx.supabase || !ctx.userId) {
        return {
          status: 'error',
          error: 'render_unavailable',
          message:
            'Report generation is not available in this request context. Report rendering must be invoked through the Field Assistant API handler.',
        }
      }
      // List templates owned by this user, newest first.
      const { data: templates, error: listErr } = await ctx.supabase
        .from('report_templates')
        .select('id, name, storage_path')
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
      if (listErr) {
        return {
          status: 'error',
          error: 'list_failed',
          message: listErr.message || 'Failed to list saved templates.',
        }
      }
      if (!templates || templates.length === 0) {
        return {
          status: 'no_templates_saved',
          message:
            'No report templates are saved for this user. Tell the assessor to upload a .docx in Settings → Report Templates, then ask Jasper to render it.',
          settings_target: 'settings',
        }
      }
      // Resolve which template to render.
      const idHint = input && typeof input.template_id === 'string' ? input.template_id : ''
      const nameHint = input && typeof input.template_name_hint === 'string'
        ? input.template_name_hint.trim().toLowerCase()
        : ''
      let chosen = null
      if (idHint) {
        chosen = templates.find((t) => t.id === idHint) || null
        if (!chosen) {
          return {
            status: 'not_found',
            message: `No saved template with id "${idHint}". Available templates listed in candidates.`,
            candidates: templates.map((t) => ({ id: t.id, name: t.name })),
          }
        }
      } else if (nameHint) {
        const matches = templates.filter((t) => (t.name || '').toLowerCase().includes(nameHint))
        if (matches.length === 1) {
          chosen = matches[0]
        } else if (matches.length === 0) {
          return {
            status: 'not_found',
            message: `No saved template matches "${nameHint}". Available templates listed in candidates.`,
            candidates: templates.map((t) => ({ id: t.id, name: t.name })),
          }
        } else {
          return {
            status: 'needs_disambiguation',
            message:
              'Multiple saved templates match the hint. Ask the assessor which one to use.',
            candidates: matches.map((t) => ({ id: t.id, name: t.name })),
          }
        }
      } else if (templates.length === 1) {
        chosen = templates[0]
      } else {
        return {
          status: 'needs_disambiguation',
          message:
            'The assessor has multiple saved templates and did not specify which one. Ask which template to use.',
          candidates: templates.map((t) => ({ id: t.id, name: t.name })),
        }
      }
      // Build a default file name. Strip path separators defensively.
      const today = new Date().toISOString().slice(0, 10)
      const requested = input && typeof input.file_name === 'string' && input.file_name.trim()
        ? input.file_name.trim()
        : `${chosen.name}_${today}`
      const safe = requested.replace(/[\\/]/g, '_').slice(0, 200)
      const fileName = /\.docx$/i.test(safe) ? safe : `${safe}.docx`
      // Return the proposal. The api handler emits an SSE
      // `render_proposed` event with this template_id + file_name; the
      // client receives that event and POSTs to /api/report-templates-render
      // with the assessment context to materialize the actual bytes.
      // The docx render lives in that dedicated function ONLY — never
      // in the Jasper hot path.
      return {
        status: 'render_proposed',
        template_id: chosen.id,
        template_name: chosen.name,
        file_name: fileName,
        message:
          'Render proposed. Tell the assessor the file is being prepared and that a Download button will appear in the chat shortly. Do NOT claim the report has been delivered to the client — the assessor reviews and forwards.',
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

// Test-only exports
export const __test = {
  parsePhotoDataUrl,
  parseVisionResponse,
  analyzePhoto,
  FOCUS_HINTS,
  VISION_MODEL,
}
