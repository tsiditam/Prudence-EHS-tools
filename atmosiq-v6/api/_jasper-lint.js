/**
 * Jasper (Field Assistant) output linter — CHAT-PATH enforcement.
 *
 * The report path (api/narrative.js) already lints AI prose via
 * api/_banned-language.js (a byte-for-byte mirror of the engine ruleset,
 * guarded by tests/engine/banned-language-parity.test.ts). The chat path
 * had NO output-level enforcement — only role-prompt instructions — and
 * prohibited phrasing was reaching users.
 *
 * This module ADDS enforcement on the chat path. It REUSES the engine
 * mirror's scan() (do NOT duplicate that list here, and do NOT add Jasper
 * terms into _banned-language.js — that would break the parity test) and
 * layers Jasper-specific context-aware bans on top: causal-confidence,
 * hypothesis-strength rating, and building-related / sick-building
 * attribution that the engine list does not fully cover for chat.
 *
 * Jasper-specific bans are context-aware and exempt clear negation /
 * disclaimer language (e.g. "this does NOT establish a building-related
 * illness") so we enforce on assertive misuse without blocking safe
 * screening disclaimers. This is additive enforcement; it does not relax
 * any existing engine guardrail.
 */

const { scan } = require('./_banned-language')

// Clear negation / disclaimer context — when present in the window around
// a match, the Jasper-specific ban is treated as a safe disclaimer.
const NEGATION =
  /\b(?:not|no|never|cannot|can't|isn't|aren't|doesn't|don't|does not|do not|is not|are not|without|rather than|avoid|should not|must not|requires? (?:medical|a licensed|physician|clinical))\b/i

// Cause / source / hypothesis context used by the confidence ban.
const CAUSAL_CONTEXT =
  /\b(caus\w*|source|origin|attribut\w*|hypothes[ie]s|due to|responsible for|stems?\s+from|results?\s+from)\b/i

const JASPER_BANS = [
  {
    id: 'hypothesis-strength',
    // "the mold hypothesis is strong", "hypothesis remains weak", etc.
    pattern: /\bhypothes[ie]s\b[\s\S]{0,25}\b(strong|weak|likely|probable|confirmed|solid|robust|strengthen\w*|weaken\w*)\b/gi,
    category: 'Jasper §causal hypothesis strength',
    recommendedFix:
      'Do not rate the strength of a causal hypothesis. Present observations and recommend confirmatory steps.',
  },
  {
    id: 'strong-hypothesis',
    // "strong hypothesis", "weak hypothesis"
    pattern: /\b(strong|weak|likely|probable|solid|robust)\b[\s\S]{0,15}\bhypothes[ie]s\b/gi,
    category: 'Jasper §causal hypothesis strength',
    recommendedFix:
      'Do not rate the strength of a causal hypothesis. Present observations and recommend confirmatory steps.',
  },
  {
    id: 'confidence-on-cause',
    // confidence word adjacent to a cause / source / hypothesis
    pattern: /\b(strongly|strong|likely|probable|probably|high(?:ly)?\s+(?:likely|probable))\b/gi,
    requiredContext: CAUSAL_CONTEXT,
    category: 'Jasper §confidence on causation',
    recommendedFix:
      'Attach confidence to instrument / measurement reliability, not to a cause, source, or hypothesis.',
  },
  {
    id: 'building-related',
    pattern: /\bbuilding[-\s]related\s+(?:illness|illnesses|sickness|symptoms?)\b/gi,
    allowedContext: [NEGATION],
    category: 'Jasper §building-related attribution',
    recommendedFix:
      'Do not assert building-related illness/symptoms — that is a medical determination. Describe environmental conditions only.',
  },
  {
    id: 'sick-building',
    pattern: /\bsick\s+building\b/gi,
    allowedContext: [NEGATION],
    category: 'Jasper §sick building attribution',
    recommendedFix:
      'Do not assert sick building syndrome; describe environmental conditions and recommend medical referral if warranted.',
  },
]

function snippetAround(text, idx, len) {
  const start = Math.max(0, idx - 40)
  const end = Math.min(text.length, idx + len + 40)
  return text.slice(start, end)
}

/**
 * Lint a fully-assembled Jasper answer. Returns an array of
 * { term, snippet, category, recommendedFix } hits — the engine mirror's
 * hits PLUS the Jasper-specific ones. Empty array means clean.
 */
function lintJasperOutput(text) {
  if (!text || typeof text !== 'string') return []
  const hits = scan(text) // engine mirror (shared tone + context bans)

  for (const ban of JASPER_BANS) {
    ban.pattern.lastIndex = 0
    let m
    while ((m = ban.pattern.exec(text)) !== null) {
      if (m[0].length === 0) {
        ban.pattern.lastIndex++
        continue
      }
      const idx = m.index
      const win = text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + m[0].length + 140))
      if (ban.requiredContext && !ban.requiredContext.test(win)) continue
      if (ban.allowedContext && ban.allowedContext.some((re) => re.test(win))) continue
      hits.push({
        term: m[0],
        snippet: snippetAround(text, idx, m[0].length),
        category: ban.category,
        recommendedFix: ban.recommendedFix,
      })
    }
  }

  return hits
}

/**
 * Build a single user-turn revision instruction naming the violated
 * rules, for the temperature-0 retry. The added system-style nudge is
 * delivered as a user message (no mid-conversation system role on this
 * model/version); it is unambiguous and screening-safe.
 */
function buildRevisionInstruction(hits) {
  const fixes = Array.from(
    new Set((hits || []).map((h) => h.recommendedFix).filter(Boolean)),
  ).slice(0, 6)
  const fixLines = fixes.map((f) => `- ${f}`).join('\n')
  return [
    'REVISION REQUIRED — your previous answer used prohibited language and cannot be sent as written.',
    'Rewrite the FULL four-section answer (## Assessment context, ## Screening interpretation, ## Recommended next steps, ## Defensibility note) and end with the literal line "IH Review Required".',
    'Apply every correction below:',
    fixLines,
    'Do not assert causation, compliance, or any health/medical determination — not even a negative one. Do not assign scores or rate hypothesis strength. Attach confidence only to instrument/measurement reliability, never to a cause or source. Output only the corrected answer.',
  ].join('\n')
}

// Screening-safe fallback used only when the retry STILL trips. Keeps the
// four-section contract and the literal closing line.
const SAFE_FALLBACK = [
  '## Assessment context',
  '- I withheld the drafted answer to this question to stay within the Field Assistant’s screening-only role.',
  '',
  '## Screening interpretation',
  '- The drafted response used language that could be read as a causation, compliance, or health determination — which the Field Assistant must not make — so it was not sent.',
  '',
  '## Recommended next steps',
  '1. Re-ask focused on observations and measurements (e.g. "what are the screening indicators for X?").',
  '2. Use the engine’s scores and the sampling plan for any risk classification.',
  '3. Have a qualified industrial hygienist interpret any causal or health question.',
  '',
  '## Defensibility note',
  'The Field Assistant provides screening-level support only; causal, compliance, and health determinations require a licensed professional.',
  '',
  'IH Review Required',
].join('\n')

module.exports = { lintJasperOutput, buildRevisionInstruction, SAFE_FALLBACK, JASPER_BANS }
