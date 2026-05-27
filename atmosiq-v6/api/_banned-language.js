/**
 * CommonJS mirror of the engine banned-language ruleset.
 *
 * The engine's source of truth is
 * src/engine/report/cih-validation.ts (TONE_BANNED_TERMS +
 * CONTEXT_AWARE_BANS + scanProseForBannedLanguage). That module is
 * TypeScript and cannot be required() from the Vercel serverless
 * runtime, so this file holds an identical copy used to lint the AI
 * narrative path (api/narrative.js) before its output is returned.
 *
 * These two definitions MUST stay in sync — tests/engine/
 * banned-language-parity.test.ts asserts the term list, the regex
 * sources/flags, and the scan results are identical. Update both
 * files together.
 */

const TONE_BANNED_TERMS = [
  'caused by',
  'confirmed',
  'unsafe',
  'hazardous',
  'noncompliant',
  'violation',
  'violates',
  'health risk',
  'high risk',
  'critical risk',
  'elevated risk',
  'in compliance with',
  'compliant with',
  'toxic mold',
  'black mold',
]

const CONTEXT_AWARE_BANS = [
  {
    id: 'consistent-with-clinical',
    pattern: /\bconsistent with\b/gi,
    requiredContext: /\b(illness|disease|syndrome|infection|poisoning|pneumonitis|asthma|diagnos|hypersensitivity|toxicity|carcinogen|cancer|sick building|legionnaire|respiratory (?:illness|disease|infection|condition))\b/i,
    category: '§10 Clinical attribution',
    recommendedFix: 'Do not link an observation to a clinical condition. Describe the environmental condition and recommend medical referral if warranted.',
  },
  {
    id: 'high-confidence-attribution',
    pattern: /\bhigh confidence\b/gi,
    requiredContext: /high confidence\b[\s\S]{0,60}\b(caus(?:e|ed|es|ation)|attribut|due to|responsible for|stems from|results? from|diagnos|is the source|proves?|proven)\b/i,
    category: '§10 Confidence misattribution',
    recommendedFix: 'Attach confidence to the measurement or instrument reliability, not to a causal attribution.',
  },
  {
    id: 'indicates-health',
    pattern: /\bindicat(?:e|es|ed|ing)\b/gi,
    requiredContext: /indicat\w*\b[\s\S]{0,50}\b(illness|disease|syndrome|infection|poisoning|pneumonitis|asthma|health (?:effect|risk|condition|hazard|impact)|respiratory (?:illness|condition|distress)|symptom|toxicity|carcinogen|cancer)\b/i,
    category: '§10 Health attribution',
    recommendedFix: 'Describe what the measurement indicates environmentally; do not assert a health condition.',
  },
  {
    id: 'definitive-assertion',
    pattern: /\bdefinitiv(?:e|ely)\b/gi,
    allowedContext: [
      /definitive (?:conclusion|determination|classification|class|g-?class)/i,
      /\b(?:not|rather than|without|before|never|avoid|cannot|unable to)\b[\s\S]{0,30}definitiv/i,
    ],
    category: '§10 Definitive language',
    recommendedFix: 'Use screening-level / preliminary language; definitive conclusions require licensed-professional, evidence-backed determinations.',
  },
  {
    id: 'guarantee-outcome',
    pattern: /\b(?:guarantee|guarantees|guaranteed|ensure|ensures|ensured|ensuring)\b/gi,
    requiredContext: /\b(?:guarantee|ensur)\w*\b[\s\S]{0,40}\b(air quality|safe|safety|health|healthy|conditions?|outcomes?|compliance|compliant|results?|no (?:risk|hazard|mold|exposure|contamination))\b/i,
    category: '§10 Guarantee of outcome',
    recommendedFix: 'Avoid guaranteeing conditions or outcomes; describe screening observations and recommendations only.',
  },
  {
    id: 'sbs-bri-attribution',
    pattern: /\b(?:sick building syndrome|building[- ]related illness)\b/gi,
    allowedContext: [
      /\bnot\b[\s\S]{0,40}(?:sick building syndrome|building[- ]related illness)/i,
      /(?:sick building syndrome|building[- ]related illness)[\s\S]{0,40}(?:investigation|methodology|program|are distinct|requires (?:medical|a licensed))/i,
      /should not (?:diagnose|attribute|determine)/i,
    ],
    category: '§10 Clinical syndrome attribution',
    recommendedFix: 'Do not assert SBS/BRI — these require licensed medical diagnosis. Describe environmental conditions only.',
  },
]

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const TONE_TERM_REGEXES = TONE_BANNED_TERMS.map(term => ({
  term,
  re: new RegExp('\\b' + escapeRegExp(term) + '\\b', 'i'),
}))

function snippetAround(text, idx, len) {
  const start = Math.max(0, idx - 40)
  const end = Math.min(text.length, idx + len + 40)
  return text.slice(start, end)
}

/**
 * PURE banned-language scanner — identical logic to the engine's
 * scanProseForBannedLanguage(). Returns an array of
 * { term, snippet, category, recommendedFix } hits.
 */
function scan(text) {
  const hits = []
  if (!text) return hits

  for (const { term, re } of TONE_TERM_REGEXES) {
    const m = re.exec(text)
    if (m) {
      hits.push({
        term,
        snippet: snippetAround(text, m.index, term.length),
        category: '§10 Tone violation',
        recommendedFix: `Replace "${term}" with screening-level / preliminary / "may be consistent with" language.`,
      })
    }
  }

  for (const ban of CONTEXT_AWARE_BANS) {
    ban.pattern.lastIndex = 0
    let m
    while ((m = ban.pattern.exec(text)) !== null) {
      const idx = m.index
      const win = text.slice(Math.max(0, idx - 30), Math.min(text.length, idx + m[0].length + 140))
      if (m[0].length === 0) ban.pattern.lastIndex++
      if (ban.requiredContext && !ban.requiredContext.test(win)) continue
      if (ban.allowedContext && ban.allowedContext.some(re => re.test(win))) continue
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

module.exports = { TONE_BANNED_TERMS, CONTEXT_AWARE_BANS, scan }
