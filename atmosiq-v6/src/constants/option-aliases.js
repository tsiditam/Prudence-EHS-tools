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

import { Q_ZONE } from './questions.js'

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

/** The zone question that declares this field, for the guards. */
export function zoneFieldOptions(fieldId) {
  const q = Q_ZONE.find((x) => x.id === fieldId)
  return (q && q.opts) || null
}
