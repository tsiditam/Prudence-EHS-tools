/**
 * Jasper (Field Assistant) output linter — CHAT-PATH enforcement.
 *
 * The report path (api/narrative.js) already lints AI prose via
 * api/_banned-language.js (a byte-for-byte mirror of the engine ruleset,
 * guarded by tests/engine/banned-language-parity.test.ts). The chat path
 * had NO output-level enforcement — only role-prompt instructions — and
 * prohibited phrasing was reaching users.
 *
 * This module enforces the chat path. It REUSES the engine mirror's scan()
 * (do NOT duplicate that list here, and do NOT add Jasper terms into
 * _banned-language.js — that would break the parity test) but, per the
 * 2026-08 product decision, keeps only its CLINICAL / MEDICAL categories on
 * the chat path and layers the building-related / sick-building medical bans
 * on top. Compliance, causation (hedged), and safe/unsafe conclusions are
 * NO LONGER blocked here — they are governed by the role prompt. The one hard
 * chat boundary that remains is medical diagnosis / clinical attribution.
 * (The report path via api/narrative.js still applies scan() in full.)
 *
 * The medical bans are context-aware and exempt clear negation / disclaimer
 * language (e.g. "this does NOT establish a building-related illness") so we
 * enforce on assertive misuse without blocking safe disclaimers.
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

// Chat-path boundary (product decision 2026-08): the AtmosFlow AI assistant
// may discuss compliance, causation (hedged), and safe/unsafe conclusions per
// its role prompt. The linter now hard-blocks ONLY medical diagnosis /
// clinical attribution. These two Jasper-specific bans cover the clinical
// attribution the shared engine mirror does not fully catch for chat.
// (The causal-confidence and hypothesis-strength bans were removed — rating
// the likelihood of a CAUSE is now allowed with appropriate uncertainty.)
const JASPER_BANS = [
  {
    id: 'building-related',
    pattern: /\bbuilding[-\s]related\s+(?:illness|illnesses|sickness|symptoms?)\b/gi,
    allowedContext: [NEGATION],
    category: 'Jasper §building-related attribution',
    recommendedFix:
      'Do not assert building-related illness/symptoms — that is a medical determination. Describe environmental conditions and recommend a medical referral instead.',
  },
  {
    id: 'sick-building',
    pattern: /\bsick\s+building\b/gi,
    allowedContext: [NEGATION],
    category: 'Jasper §sick building attribution',
    recommendedFix:
      'Do not assert sick building syndrome; describe environmental conditions and recommend a medical referral if warranted.',
  },
]

// Engine-mirror categories kept on the CHAT path. The shared mirror
// (_banned-language.js) is parity-locked to the REPORT engine and still runs
// in full on api/narrative.js; here we keep only its clinical / medical
// attribution categories, so compliance, causation, and safety language pass.
const CHAT_KEPT_ENGINE_CATEGORIES = new Set([
  '§10 Clinical attribution',
  '§10 Health attribution',
  '§10 Clinical syndrome attribution',
])

function snippetAround(text, idx, len) {
  const start = Math.max(0, idx - 40)
  const end = Math.min(text.length, idx + len + 40)
  return text.slice(start, end)
}

/**
 * Lint a fully-assembled Jasper CHAT answer for the one hard boundary that
 * remains: medical diagnosis / clinical attribution. Returns an array of
 * { term, snippet, category, recommendedFix } hits. Empty array means clean.
 *
 * Reuses the shared engine mirror but keeps ONLY its clinical/health
 * categories (compliance, tone, definitive, and confidence hits are dropped
 * for chat — those are governed by the role prompt now), then adds the
 * Jasper-specific medical bans. The report path (api/narrative.js) still
 * applies the full mirror via scan().
 */
function lintJasperOutput(text) {
  if (!text || typeof text !== 'string') return []
  const hits = scan(text).filter((h) => CHAT_KEPT_ENGINE_CATEGORIES.has(h.category))

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
    'REVISION REQUIRED — your previous answer read as a medical diagnosis / clinical attribution and cannot be sent as written.',
    `Rewrite the FULL four-section answer (## Assessment context, ## Screening interpretation, ## Recommended next steps, ## Defensibility note) and end with the literal line "${AI_DISCLAIMER_LINE}".`,
    'Apply every correction below:',
    fixLines,
    'Do not diagnose a medical condition or attribute a person’s illness/symptoms to the exposure as a clinical determination (no sick-building-syndrome or building-related-illness diagnosis) — describe the environmental conditions and recommend a medical / occupational-health referral instead. Compliance, causation (hedged), and safe/unsafe conclusions are allowed when the evidence supports them; keep every standard and number citation-backed. Output only the corrected answer.',
  ].join('\n')
}

// Fallback used only when the retry STILL trips the ONE remaining hard
// boundary — medical diagnosis / clinical attribution. Keeps the four-section
// contract and the literal closing line.
const SAFE_FALLBACK = [
  '## Assessment context',
  '- I held back part of the drafted answer because it read as a medical diagnosis, which this assistant does not provide.',
  '',
  '## Screening interpretation',
  '- The draft attributed a person’s illness or symptoms to a clinical condition. I can interpret the environmental data, discuss the applicable standards and compliance, and give a professional read of what the measurements mean — but diagnosing a person is a licensed clinician’s call.',
  '',
  '## Recommended next steps',
  '1. Re-ask the ENVIRONMENTAL question — what the readings mean, which standard applies, or the likely environmental cause — and I’ll answer it.',
  '2. For the health/medical question, refer the occupant to an occupational-health or medical professional.',
  '3. Document the environmental findings and the recommended referral.',
  '',
  '## Defensibility note',
  'Environmental interpretation, compliance discussion, and evidence-based conclusions are in scope; diagnosing a medical condition is not — that requires a licensed medical professional.',
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
