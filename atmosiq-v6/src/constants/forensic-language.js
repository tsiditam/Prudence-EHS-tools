/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Forensics-specific prohibited language, stacked ON TOP of the shared scan.
 *
 * `api/_banned-language.js` and its mirror `src/engine/report/cih-validation.ts`
 * are NOT touched. They hold the fifteen phrases that are wrong in any report
 * the product issues, they are kept byte-identical by a parity test, and they
 * gate every report path. Widening that list to catch a forensics-only phrasing
 * would change what every other surface is allowed to say.
 *
 * So this is a layer, exactly as `api/_jasper-lint.js` layers its own five
 * chat-only bans over the same shared scan. It adds what a forensic
 * interpretation specifically must not claim:
 *
 *   proves / rules out / exonerates      a monitoring record settles nothing
 *   safe                                  a determination this product does not make
 *   adequate / inadequate ventilation     a verdict on a system, from a trace
 *   causation on an environmental subject a pathway is never established here
 *   compliance against a limit            an averaging period the data cannot meet
 *
 * ── Bounded language is the alternative, not silence ───────────────────
 * Every rule carries the phrasing that WOULD be supportable, because a model
 * whose sentence is rejected without an alternative writes the same sentence
 * again. `BOUNDED_PHRASES` is that vocabulary and it is exported so the prompt
 * and this gate quote one list — the writer and the gate disagreeing is a
 * defect class this codebase has shipped three times, and the fix each time
 * was one shared list plus a test pinning the agreement.
 *
 * ── Context gating, and why "safe" needs it ────────────────────────────
 * `requiredContext` means the phrase is allowed by default and only counts as a
 * hit near the listed subjects; `allowedContext` is the inverse. The same
 * mechanism the shared scanner uses. "Safe" is gated because "safety glasses"
 * and "it is safe to assume the logger drifted" are not claims about air, and a
 * rule that fired on them would be switched off within a week — after which
 * nothing would be checked at all.
 */

/** The phrasing a forensic interpretation may use instead. */
export const BOUNDED_PHRASES = Object.freeze([
  'consistent with',
  'supports',
  'may contribute',
  'warrants review',
  'cannot distinguish',
  'requires confirmation',
])

/** Environmental subjects that turn a loose phrase into a claim about the air. */
const ENV_SUBJECT = String.raw`(?:air|indoor|concentration|reading|readings|level|levels|exposure|ventilation|co2|carbon\s+dioxide|pm2\.?5|particulate|tvoc|voc|formaldehyde|hcho|humidity|temperature|odor|space|zone|occupant|occupants|building)`

/** Negation and hypothetical framings that defuse a phrase. */
const NEGATION = String.raw`\b(?:not|cannot|can't|never|no|without|neither|nor|rather than|instead of|does not|do not|would not|could not)\b`

/**
 * The rules. Shape matches the shared scanner's context-aware bans so the two
 * results can be merged without translation.
 */
export const FORENSIC_BANS = Object.freeze([
  {
    id: 'forensic-proves',
    pattern: /\b(?:proves?|proven|proof|demonstrates\s+conclusively|conclusively\s+shows?)\b/gi,
    allowedContext: [new RegExp(NEGATION, 'i')],
    category: 'Forensics §proof',
    recommendedFix: 'A monitoring record does not prove anything. Use "consistent with" or "supports", and name what would confirm it.',
  },
  {
    id: 'forensic-rules-out',
    pattern: /\brul(?:es?|ed|ing)\s+out\b/gi,
    allowedContext: [new RegExp(NEGATION, 'i')],
    category: 'Forensics §elimination',
    recommendedFix: 'Absence of a detected event is not elimination. Use "cannot distinguish" or "no matching event was detected".',
  },
  {
    id: 'forensic-exonerates',
    pattern: /\bexonerat(?:es?|ed|ing)\b|\bclears?\s+the\s+(?:system|building|hvac|space)\b/gi,
    category: 'Forensics §exoneration',
    recommendedFix: 'Monitoring does not clear a system or a building. State what was and was not observed.',
  },
  {
    id: 'forensic-safe-claim',
    pattern: /\bsafe\b/gi,
    requiredContext: [new RegExp(ENV_SUBJECT, 'i')],
    category: 'Forensics §safety determination',
    recommendedFix: 'Do not describe air, levels or a space as safe. That is a determination this assessment does not make.',
  },
  {
    id: 'forensic-ventilation-verdict',
    pattern: /\b(?:in)?adequate\s+(?:ventilation|outdoor\s+air|fresh\s+air)\b|\bventilation\s+is\s+(?:in)?adequate\b/gi,
    category: 'Forensics §ventilation verdict',
    recommendedFix: 'Do not grade ventilation. Describe the measured relationship and say what would establish delivered outdoor air.',
  },
  {
    id: 'forensic-causation',
    // Causal attribution, but only when the subject is environmental — "the
    // gap is due to a logger restart" is about the instrument, not the air.
    pattern: /\b(?:caused\s+by|due\s+to|attributable\s+to|stems?\s+from|results?\s+from|resulted\s+from|responsible\s+for|because\s+of)\b/gi,
    requiredContext: [new RegExp(ENV_SUBJECT, 'i')],
    allowedContext: [new RegExp(NEGATION, 'i')],
    category: 'Forensics §causation',
    recommendedFix: 'A pathway is never established from a monitoring trace. Use "consistent with", "supports" or "may contribute".',
  },
  {
    id: 'forensic-compliance',
    pattern: /\b(?:meets|met|satisfies|satisfied|passes|passed)\s+(?:the\s+)?(?:standard|limit|criterion|criteria|requirement|pel|rel|tlv|naaqs)\b|\bwithin\s+(?:the\s+)?(?:limit|limits|standard|pel|rel|tlv|naaqs)\b/gi,
    category: 'Forensics §compliance determination',
    recommendedFix: 'A short-interval trace cannot settle an averaged limit. Report the measured comparison and leave the determination out.',
  },
  {
    id: 'forensic-health-effect',
    // Attributing a symptom or illness to what was measured.
    pattern: /\b(?:causes?|causing|triggers?|triggering|leads?\s+to|produces?)\s+(?:\w+\s+){0,3}(?:symptoms?|headaches?|nausea|irritation|illness|asthma|fatigue|dizziness)\b/gi,
    allowedContext: [new RegExp(NEGATION, 'i')],
    category: 'Forensics §health effect',
    recommendedFix: 'Do not attribute a health effect. Describe the environmental condition and recommend the review that would address it.',
  },
])

const WINDOW_BEFORE = 40
const WINDOW_AFTER = 140

const snippetAround = (text, idx, len) =>
  text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + len + 40)).trim()

/**
 * Scan text for forensics-specific prohibited language.
 *
 * @param {string} text
 * @returns {{term:string, snippet:string, category:string, recommendedFix:string, id:string}[]}
 */
export function scanForensicLanguage(text) {
  const hits = []
  const s = typeof text === 'string' ? text : ''
  if (!s) return hits

  for (const ban of FORENSIC_BANS) {
    ban.pattern.lastIndex = 0
    let m
    while ((m = ban.pattern.exec(s)) !== null) {
      const idx = m.index
      const win = s.slice(Math.max(0, idx - WINDOW_BEFORE), Math.min(s.length, idx + m[0].length + WINDOW_AFTER))
      if (ban.requiredContext && !ban.requiredContext.some((re) => re.test(win))) continue
      if (ban.allowedContext && ban.allowedContext.some((re) => re.test(win))) continue
      hits.push({
        id: ban.id,
        term: m[0],
        snippet: snippetAround(s, idx, m[0].length),
        category: ban.category,
        recommendedFix: ban.recommendedFix,
      })
      // One hit per rule is enough to reject; the model gets the fix once.
      break
    }
  }
  return hits
}
