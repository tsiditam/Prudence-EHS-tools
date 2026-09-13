/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The words that count as having STATED a structured option.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 * Quote attestation proves a model cited real text. It does not prove the
 * VALUE it selected was stated. "There's a musty odor in here" is a real
 * sentence, and `op = 'Strong / overpowering'` quoting it is a real quote
 * attached to a severity nobody gave. The quote gate passes; the claim is
 * invented.
 *
 * So a proposed option has to be supported lexically, and the vocabulary
 * that decides "supported" lives here — in application data, reviewable in
 * a diff, never authored by the model. A model cannot widen this file.
 *
 * ── Most of it is DERIVED, not written ─────────────────────────────────
 * `deriveVariants` reads the option string itself, so the schema is the
 * source. An option written "Faint / intermittent" is two words an assessor
 * might use, and "Small (< 10 sq ft)" is qualified by a parenthetical that
 * is a definition rather than something anyone says aloud. Deriving these
 * keeps them in step with `questions.js` automatically: rename an option and
 * its variants follow.
 *
 * ── The curated part is deliberately thin ──────────────────────────────
 * ALIASES holds only what derivation cannot reach, and only true LEXICAL
 * variants — another way of saying the same option. It is not a place for
 * inference. "Headaches" is not an alias for "Yes — complaints reported":
 * a symptom implying a complaint is a judgement, and the envelope's whole
 * position is that judgements belong to the assessor. If the words do not
 * name the option, the right outcome is to reject the fact and ask the
 * question — which is exactly what the interpreter does.
 *
 * Two guards in `option-aliases.test.ts` keep this honest: every alias must
 * name a field and an option that actually exist in the schema, and no alias
 * may point at two options of the same field. An ambiguous term supports
 * neither option, so it must not be listed for either.
 */

import { getObservableField } from './observable-fields.js'

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s ]+/g, ' ').trim()

/**
 * Lexical variants readable off the option string itself.
 *
 *   'Faint / intermittent'  → faint / intermittent  (either word names it)
 *   'Small (< 10 sq ft)'    → small                 (the parenthetical defines,
 *                                                    it is not spoken)
 *   'Yes — complaints reported' → the part after the dash
 *
 * The full option always counts. Fragments shorter than four characters are
 * dropped: "no" and "ft" match half the English language and would attest
 * almost anything.
 */
export function deriveVariants(option) {
  const full = norm(option)
  if (!full) return []
  const out = new Set([full])
  // Drop a defining parenthetical: "small (< 10 sq ft)" → "small".
  const noParen = norm(full.replace(/\([^)]*\)/g, ' '))
  if (noParen) out.add(noParen)
  // Split the alternation forms an option uses to mean "either of these".
  for (const piece of noParen.split(/\s*[/—–-]\s*/)) {
    const p = norm(piece)
    if (p.length >= 4) out.add(p)
  }
  return [...out].filter(Boolean)
}

/**
 * Curated lexical aliases, keyed field → option → the words that name it.
 *
 * Kept small on purpose. Every entry is a synonym for the option, not a
 * cue that the option might apply. Expanding this list is a product
 * decision made in review, which is the point of it being data.
 */
export const ALIASES = {
  cx: {
    'Yes — complaints reported': ['complaint', 'complaints', 'complained'],
    'No complaints': ['no complaints', 'none reported', 'no concerns raised'],
  },
  wd: {
    'Active leak': ['active leak', 'actively leaking', 'water is leaking'],
    'None': ['no water damage', 'no water intrusion', 'no staining'],
  },
  op: {
    'None': ['no odor', 'no unusual odor', 'no smell', 'odor free'],
  },
  vd: {
    'None': ['no dust', 'no visible dust'],
  },
  mi: {
    'None': ['no mold', 'no visible mold', 'no mold indicators'],
  },
  tc: {
    'Too hot': ['too hot', 'overheated'],
    'Too cold': ['too cold'],
  },
  hp: {
    'Too humid / stuffy': ['humid', 'stuffy', 'muggy'],
    'Too dry': ['dry air', 'too dry'],
  },
}

/**
 * Every accepted way of naming one option of one field.
 *
 * The option must be a real option of that field — a caller cannot attest
 * against a value the schema does not contain, which is separately enforced
 * by `validateObservation` before this is ever reached.
 */
export function variantsFor(fieldId, option) {
  const curated = (ALIASES[fieldId] && ALIASES[fieldId][option]) || []
  return [...new Set([...deriveVariants(option), ...curated.map(norm)])]
}

/**
 * The options of a WRITABLE field.
 *
 * Scoped to the observable catalog rather than to one questionnaire, because
 * that catalog is exactly the set of fields a proposal can name — and it
 * spans scopes: `dp`, `od` and `sa` are declared in the building interview
 * and are just as proposable as a zone's `op`. Reading Q_ZONE here would have
 * left every building-scoped choice with an empty vocabulary, which attests
 * NOTHING and therefore refuses every one of them. Silent, and it would have
 * read as the model failing to propose.
 */
export function fieldOptions(fieldId) {
  const contract = getObservableField(fieldId)
  return (contract && contract.opts) || null
}

/** Regex-escape an interpolated literal. A decimal point is not a wildcard. */
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Words that turn a phrase into a denial of itself.
 *
 * Deliberately a fixed list and not a parser. The job is not to understand
 * the sentence — it is to stop "the odor was not strong" from attesting
 * `Strong / overpowering`. Anything this list does not recognize stays
 * ambiguous and fails closed, which ends with the assessor being asked the
 * structured question. That is the correct outcome, not a degraded one.
 */
const NEGATORS = new Set([
  'not', 'no', 'never', 'without', 'nor',
  'isnt', 'wasnt', 'arent', 'werent', 'didnt', 'doesnt', 'dont', 'cant', 'cannot',
])

/** Is the phrase starting at `start` denied by the words just before it? */
function negatedAt(text, start) {
  // Apostrophes are dropped so "isn't" and "isnt" are one token.
  const words = text.slice(0, start).replace(/['\u2019]/g, '').split(/[^a-z0-9]+/).filter(Boolean)
  return words.slice(-2).some((w) => NEGATORS.has(w))
}

/**
 * Which options of a field the assessor's words actually support.
 *
 * ── Why this is resolution and not a lookup ────────────────────────────
 * Asking "does the quote contain an alias for the option the model picked?"
 * cannot tell a value from its own negation, because the aliases overlap by
 * construction: "No complaints were reported" contains the word `complaints`,
 * so it attests `Yes — complaints reported` just as readily as the option it
 * actually states. The question has to be asked of ALL options at once and
 * answered by the text, not by the proposal.
 *
 * Three deterministic rules do that:
 *
 *  1. PHRASE BOUNDARIES. A variant matches only at token edges, so `complaint`
 *     does not match inside "complaints" and `dry` does not match inside
 *     "laundry".
 *  2. SPECIFICITY. A match lying wholly inside a longer one is not independent
 *     evidence — "no complaints" contains "complaints", and only the longer
 *     phrase describes what the sentence says. The longer phrase wins.
 *  3. NEGATION. A surviving phrase denied by the words before it is dropped.
 *
 * What comes back is the set of options the quote supports on its own terms.
 * A caller decides what to do with more than one; for a single-select field
 * the honest answer is that the words do not settle it.
 */
export function resolveOptions(fieldId, quote) {
  const q = norm(quote)
  const opts = fieldOptions(fieldId)
  if (!q || !opts) return []

  const hits = []
  for (const option of opts) {
    for (const phrase of variantsFor(fieldId, option)) {
      if (!phrase) continue
      // No lookbehind: iOS Safari is a shipping target. The leading group is
      // consumed and its width subtracted instead.
      const re = new RegExp(`(^|[^a-z0-9])(${escapeRe(phrase)})(?![a-z0-9])`, 'g')
      let m
      while ((m = re.exec(q)) !== null) {
        const start = m.index + m[1].length
        hits.push({ option, start, end: start + phrase.length })
        // Step forward by one so overlapping phrases are all seen.
        re.lastIndex = start + 1
      }
    }
  }

  const independent = hits.filter((h) => !hits.some(
    (o) => o.start <= h.start && o.end >= h.end && (o.end - o.start) > (h.end - h.start),
  ))
  return [...new Set(independent.filter((h) => !negatedAt(q, h.start)).map((h) => h.option))]
}
