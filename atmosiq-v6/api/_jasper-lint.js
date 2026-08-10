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

/**
 * The line every Jasper answer closes with.
 *
 * A GENERIC AI disclaimer, not a review verdict. The previous line —
 * "IH Review Required" — stamped every answer, including a pure
 * standards lookup, as pending industrial-hygienist review, which was
 * both untrue and the same "everything is unfinished" problem the report
 * lifecycle removed.
 *
 * Dropping it costs nothing in defensibility: the screening-only
 * boundary is carried STRUCTURALLY by the required "## Defensibility
 * note" section (see SAFE_FALLBACK below), not by this line. What this
 * line does that the app's persistent UI footer cannot is travel — into
 * stored history, and with any text the assessor copies into a report.
 *
 * Duplicated as a literal in src/constants/field-assistant-prompt.js
 * because this module is CommonJS on the serverless path and that one is
 * an ES module; requiring across the boundary is the exact interop trap
 * that has bitten this handler before. tests/api/jasper-disclaimer.test.ts
 * asserts the two cannot drift apart.
 */
const AI_DISCLAIMER_LINE = 'AI-assisted response — verify before use.'

// Clear negation / disclaimer context — when present in the window around
// a match, the Jasper-specific ban is treated as a safe disclaimer.
const NEGATION =
  /\b(?:not|no|never|cannot|can't|isn't|aren't|doesn't|don't|does not|do not|is not|are not|without|rather than|avoid|should not|must not|requires? (?:medical|a licensed|physician|clinical))\b/i

// Confidence-on-CAUSATION context used by the confidence ban.
//
// The defensibility line is exposure→symptom/effect causation, NOT
// physical-source identification. Identifying the probable source or
// origin of moisture or a contaminant is core screening (IICRC S520 water
// classification is exactly this) and is the hedged language the role
// prompt asks the assistant to write ("the most probable source is…").
// The OLD context tripped on any confidence word merely co-occurring with
// the bare noun "source"/"origin"/"cause" anywhere in a ~180-char window,
// so every substantive hedged screening answer tripped — and, on the
// retry, tripped again → the SAFE_FALLBACK refusal.
//
// This context instead requires a confidence word to sit within a TIGHT
// bridge (≤24 chars, either order) of a genuine causal ATTRIBUTION — an
// explicit causal verb/phrase or "the cause". So "probably the cause of
// the complaints" / "likely caused by the HVAC" / "responsible for the
// symptoms" still trip, while "probable source", "likely origin", and
// "strong indicator" do not. "caused by" itself remains a hard tone-ban
// in the engine mirror (scan()), independent of this.
const CONFIDENCE_WORD = String.raw`(?:strongly|strong|likely|probable|probably)`
const CAUSAL_ATTRIBUTION = String.raw`(?:caus\w*|attribut\w*|due to|responsible for|stems?\s+from|results?\s+from|the cause)`
const CONFIDENCE_ON_CAUSE_CONTEXT = new RegExp(
  `\\b${CONFIDENCE_WORD}\\b[\\s\\S]{0,24}\\b${CAUSAL_ATTRIBUTION}\\b` +
    `|\\b${CAUSAL_ATTRIBUTION}\\b[\\s\\S]{0,24}\\b${CONFIDENCE_WORD}\\b`,
  'i',
)

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
    requiredContext: CONFIDENCE_ON_CAUSE_CONTEXT,
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

// ── Tool-backed threshold post-check ───────────────────────────────────
// A numeric exposure limit / threshold / advisory tier must come from a
// tool result this turn. We detect a NAMED FRAMEWORK adjacent to a
// CONCENTRATION VALUE (a number carrying an exposure/concentration unit)
// and flag it when no retrieval tool ran this turn. We deliberately key
// on concentration UNITS, not bare numbers, so standard citations
// ("ASHRAE 62.1-2025 §6.2.2.1", "55-2023") and years are NOT flagged —
// only fabricated/ recalled threshold values are.
const THRESHOLD_FRAMEWORK = /\b(m[oôöø]lhave|ashrae|niosh|osha|acgih|epa|naaqs|leed)\b/i
// Trailing lookahead (not \b): units ending in ³ are non-word chars, so a
// \b after them fails when followed by a space — use a not-alphanumeric
// guard instead so "500 µg/m³ is…" still matches.
const CONCENTRATION_VALUE =
  /\b\d[\d,]*(?:\.\d+)?\s?(?:ppb|ppm|µg\/m³|µg\/m3|ug\/m³|ug\/m3|mg\/m³|mg\/m3|f\/cc|fibers?\/cc|cfu\/m³|cfu\/m3|pci\/l)(?![a-z0-9])/gi

/**
 * Flag numeric thresholds that are NOT backed by a retrieval tool call
 * this turn. Returns [] when opts.retrievalUsed is true (a
 * lookup_exposure_limit / search_standards_corpus call satisfies the
 * backing requirement coarsely, per the rule). Each hit shape matches
 * lintJasperOutput's so callers can treat them uniformly.
 */
function checkUnbackedThresholds(text, opts = {}) {
  if (!text || typeof text !== 'string') return []
  if (opts.retrievalUsed) return []
  const hits = []
  CONCENTRATION_VALUE.lastIndex = 0
  let m
  while ((m = CONCENTRATION_VALUE.exec(text)) !== null) {
    if (m[0].length === 0) {
      CONCENTRATION_VALUE.lastIndex++
      continue
    }
    const idx = m.index
    const win = text.slice(Math.max(0, idx - 60), Math.min(text.length, idx + m[0].length + 60))
    if (THRESHOLD_FRAMEWORK.test(win)) {
      hits.push({
        term: m[0],
        snippet: snippetAround(text, idx, m[0].length),
        category: 'Jasper §unbacked threshold',
        recommendedFix:
          'Every numeric exposure limit / threshold / advisory tier must come from a tool result this turn (lookup_exposure_limit or search_standards_corpus). If no tool returned the value, state it is not available and recommend confirming against the assessor’s reference rather than recalling a number.',
      })
    }
  }
  return hits
}

// ── Threshold-question detection (pre-answer tool forcing) ──────────────
// checkUnbackedThresholds runs AFTER the answer streams and retracts it if a
// number isn't tool-backed. That retraction is jarring, so we prevent it at
// the source: when the USER's question is asking for a numeric limit, the
// handler forces a retrieval tool call on the first model turn, making the
// answer's numbers tool-backed (retrievalUsed=true) so the post-check passes.
//
// Strong intent: exposure-limit acronyms/terms that are ALWAYS a numeric ask.
const THRESHOLD_INTENT_STRONG =
  /\b(pel|tlv|rel|idlh|twa|stel|ceiling limit|action level|permissible exposure|recommended exposure|threshold limit value|naaqs)\b/i
// Weaker intent: a standards framework named alongside a value-ish word.
const THRESHOLD_FRAMEWORK_Q = /\b(ashrae|niosh|osha|acgih|epa|naaqs|leed|m[oôöø]lhave)\b/i
const THRESHOLD_VALUE_WORD =
  /\b(limit|threshold|guideline|standard|concentration|ppm|ppb|µg|ug\/m|mg\/m|exposure)\b/i
// A direct "what's the (max/safe/acceptable) ... limit/level/concentration" ask.
const THRESHOLD_ASK =
  /\b(what(?:'?s| is| are)?|maximum|max|safe|acceptable|recommended|allowable|permissible|normal|typical)\b[\s\S]{0,48}\b(limit|level|threshold|guideline|concentration|value)\b/i

/**
 * True when the user's message reads like a request for a numeric exposure
 * limit / threshold / guideline value. Used to force a retrieval tool call
 * up front. False positives are cheap (one extra tool call); false negatives
 * fall through to the graceful verify-note path below.
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeThresholdQuestion(text) {
  if (!text || typeof text !== 'string') return false
  if (THRESHOLD_INTENT_STRONG.test(text)) return true
  if (THRESHOLD_FRAMEWORK_Q.test(text) && THRESHOLD_VALUE_WORD.test(text)) return true
  if (THRESHOLD_ASK.test(text)) return true
  return false
}

// Appended (not substituted) when an answer states a numeric threshold that
// wasn't tool-backed this turn AND carries no prohibited language. The answer
// is useful and usually correct; this flags the figures as unverified rather
// than retracting the whole response to SAFE_FALLBACK.
const THRESHOLD_VERIFY_NOTE =
  '_The numeric limit(s) above were not confirmed against a primary-source lookup in this session — verify against the cited standard (29 CFR 1910.1000, NIOSH Pocket Guide, ACGIH TLVs/BEIs, ASHRAE, or EPA) before relying on them._'

/**
 * Append the verify-the-numbers note ABOVE the trailing disclaimer line so
 * the answer still ends with the disclaimer (the SPA styles that line).
 * @param {string} text
 * @returns {string}
 */
function withThresholdVerifyNote(text) {
  if (typeof text !== 'string') return text
  const trimmed = text.replace(/\s+$/, '')
  if (trimmed.endsWith(AI_DISCLAIMER_LINE)) {
    const body = trimmed.slice(0, trimmed.length - AI_DISCLAIMER_LINE.length).replace(/\s+$/, '')
    return `${body}\n\n${THRESHOLD_VERIFY_NOTE}\n\n${AI_DISCLAIMER_LINE}`
  }
  return `${trimmed}\n\n${THRESHOLD_VERIFY_NOTE}\n\n${AI_DISCLAIMER_LINE}`
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
    `Rewrite the FULL four-section answer (## Assessment context, ## Screening interpretation, ## Recommended next steps, ## Defensibility note) and end with the literal line "${AI_DISCLAIMER_LINE}".`,
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
  AI_DISCLAIMER_LINE,
].join('\n')

module.exports = {
  AI_DISCLAIMER_LINE,
  lintJasperOutput,
  checkUnbackedThresholds,
  looksLikeThresholdQuestion,
  THRESHOLD_VERIFY_NOTE,
  withThresholdVerifyNote,
  buildRevisionInstruction,
  SAFE_FALLBACK,
  JASPER_BANS,
}
