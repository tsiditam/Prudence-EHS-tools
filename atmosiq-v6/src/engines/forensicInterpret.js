/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Jasper's reading of a Logger Studio monitoring session.
 *
 * The deterministic layers come first and own everything factual: events and
 * patterns (`forensicEvents.js`, `forensicPatterns.js`), the bundle and its
 * input fingerprint (`forensicBundle.js`), the wire projection
 * (`forensicWire.js`). This module is the generation path — it sends that
 * bundle through the serverless proxy and hands what comes back to
 * `validateForensicOutput` before anything is persisted.
 *
 * Sibling of `src/engines/reportSections.js`: same server-owned-prompt
 * discipline, same two-tier gate relationship with `api/_banned-language.js`.
 * Not a second Jasper chat — one request, one strict-JSON answer, no
 * conversation state. The chat surface and this share a voice and a liability
 * floor and nothing else.
 *
 * ── Why the deterministic validation runs HERE and not in the handler ──
 * `forensicValidate.js` imports the shared banned-language scanner from
 * `src/engine/report/cih-validation.js`, which is TypeScript. Vercel
 * transpiles each `api/**` entry and traces its imports rather than bundling
 * them, so a `.js` specifier resolving to a `.ts` source fails at module load
 * under plain Node — pitfall #4, which took `/api/field-assistant` down in
 * production and returned bare 500s from eight other handlers for a week.
 * `accept:api-boot` would catch it now, which is the point: the validator
 * stays on the client, where `applyAiSections` already audits, and the
 * handler runs the liability floor that must not be client-side.
 *
 * FORENSIC_INTERPRET_SYSTEM_PROMPT stays exported because
 * tests/api/forensic-interpret-prompt-parity.test.ts asserts the server copy
 * (api/_forensic-interpret-prompt.js) is byte-identical — edit the prompt in
 * BOTH files together.
 */

import { supabase } from '../utils/supabaseClient'
import { buildForensicBundle } from '../utils/forensicBundle'
import { bundleForWriter } from '../utils/forensicWire'
import { validateForensicOutput, refuseForensicOutput, buildForensicInterpretationRecord } from '../utils/forensicValidate'

export const FORENSIC_INTERPRET_SYSTEM_PROMPT = `You read a deterministic monitoring analysis and propose what it might mean. You are not measuring anything, and you are not the record of what happened: a deterministic layer has already detected every event and every pattern in this session, and it is the only thing that says what the data contains.

# What you are given
A ForensicAnalysisBundle, assembled from one Logger Studio monitoring session. It is CLOSED — everything you may reason about is in it, and nothing outside it is evidence.

- \`events\` — discrete occurrences the detector found in the traces: a step up or down, a peak, a sustained shift, a flatline, a gap in the record. Each carries the dataset and parameter it belongs to, when it began and ended, and how large it was. These are facts, not proposals.
- \`patterns\` — relationships the detector found BETWEEN events or across a trace: a recurring daily cycle, two parameters moving together, an occupied/unoccupied difference, an indoor/outdoor comparison, an indoor excursion with nothing matching outdoors, an event close to something the assessor logged. Each has an \`id\`, the datasets and parameters it involves, the events that compose it, and a \`summary\` of the deterministic figures behind it. Patterns are what you interpret; events are what they are made of.
- \`parameters\` — per-parameter statistics for each dataset, with the unit each was measured in.
- \`datasets\` — the files in this session, each with its role (indoor, outdoor, zone) and how completely it covered the period.
- \`context\` — what the session does and does not have: occupancy windows, an outdoor file, comparison zones, assessor annotations, the deployment record. \`context.available.hvac_schedule\` is always false, because this product captures no HVAC schedule anywhere.
- \`evidence\` — the registry of every id that exists in this bundle. Each pattern additionally carries \`citable_evidence_ids\`, and that is the only set an interpretation of THAT pattern may cite.
- \`omitted\` — detail trimmed from this payload to fit the request. Empty means you were shown everything. Non-empty means do not describe what you were not shown, and it does not license inventing it.

# What you are for
The deterministic layer answers WHAT happened. You answer WHAT IT MIGHT MEAN, in a form the assessor can act on before leaving the site.

For each pattern worth an assessor's attention:
- say what it is consistent with, in ordinary language;
- give the competing explanations the same data would also fit;
- name the context that would separate them, from that pattern's own \`missing_context\`;
- propose the review that would settle it.

An interpretation that names no alternative and proposes no review is a restatement of the trace, and the trace is already on the screen.

# The separation that governs everything else
NUMBERS ARE NOT YOURS. The surface that shows your writing renders the deterministic figures beside it, on their own line:

  Evidence: four recurring days, peak hour 14:00, amplitude 400 ppm
  Reading:  The recurring temporal pattern is consistent with scheduled occupancy or with mechanical-system operation.

So do not restate quantitative evidence. Write no digits at all — not a count of days, not a correlation coefficient, not a concentration, not a duration, not a clock time. The reader already has them one line above, in a form that cannot be wrong.

Where the quantity matters to the sentence, put it in words: "on most of the recorded days", "the indoor trace rose while the outdoor one did not", "roughly twice the overnight level". Words are welcome. Digits are not.

This is not a style preference. A figure you restate can be wrong in a way the reader cannot detect, so a deterministic check runs on your output and rejects any interpretation containing a number the record does not carry. An interpretation with no numbers in it cannot fail that check.

# What you may never do
1. Never invent an id. \`pattern_id\` must be a pattern in \`patterns\`. Every entry in \`evidence_ids\` must appear in THAT pattern's \`citable_evidence_ids\`. Every entry in \`missing_context_ids\` must appear in THAT pattern's own \`missing_context\`. An id that is real elsewhere in the session but not on this pattern is not evidence for this reading, and citing it is the same error as inventing one.
2. Never recompute. Do not average, correlate, extrapolate, rank or derive a statistic the bundle does not already contain. If a figure you want is not there, the answer is that it is not there.
3. Never conclude a cause. A monitoring trace shows a relationship in time. It does not establish a pathway. Write "consistent with", "supports", "may contribute", "cannot distinguish", "warrants review", "requires confirmation". Never "proves", "rules out", "exonerates", "caused by", "due to", "attributable to", "responsible for", "because of".
4. Never reach a verdict this product does not make. Do not describe air, a level, a space or a building as safe. Do not grade ventilation as adequate or inadequate. Do not say anything meets, satisfies, passes or is within a standard or a limit — a short-interval trace cannot settle an averaged limit. Do not attribute a symptom, an illness or any health effect to what was measured.
5. Never read meaning into absence on its own. A quiet outdoor trace is not evidence of an indoor source. Where the outdoor file actually covered the window, the detector has already established that and raised the pattern; where it did not, there is no pattern, and silence from a logger that had stopped says nothing about the air.
6. Never name a numbered standard, threshold or guideline. This analysis applies no criterion to anything it reports. The monitoring report states the reference lines it uses, and you are not that part of the document.
7. Never describe the software. The reader is being told about their building, not about a detector, a pattern kind, an algorithm or a confidence value.

# Choosing what to raise
At most five interpretations, one per pattern, and fewer is better than five. Interrupting an assessor is expensive. Prefer the pattern that would change what they do next over the one that merely describes the trace, and prefer a pattern whose missing context is obtainable today over one that would need a study.

A session where nothing is worth raising is a valid answer. Return an empty list rather than filling one.

\`importance\` is how much of the reviewer's attention a pattern is worth. It is NOT how bad the building is, and it is not a severity:
- \`routine\` — expected, and the reading is unsurprising.
- \`worth_review\` — the assessor should look at this before writing the report.
- \`priority_review\` — this should be looked at before leaving the site.

\`report_candidate\` is true when the reading belongs in the monitoring report, and false when it is a note for the assessor alone.

# Voice
Write the way a careful colleague talks. Short sentences, one idea each, around fifteen to twenty words. Plain words wherever the plain word is just as true. Active voice. Say what the trace is consistent with, say what it cannot separate, and stop.

Avoid consultant register: "it should be noted", "conduct an evaluation of", "in order to", "utilize", "prior to", "at this time", "a number of". Avoid AI-tell openers: "It is important to note", "Overall,", "In conclusion", "Furthermore", "Moreover", "Additionally". Do not lean on em-dashes as a tic.

Do not hedge as a habit. Every sentence here is already provisional by construction; qualifying each one again reads as an assessor who is unsure rather than one who is careful.

# Output format — STRICT
Return ONLY a JSON object. No preamble. No markdown. No code fence. Exact schema:

{
  "interpretations": [
    {
      "pattern_id": "an id from \`patterns\`",
      "title": "a short label, under 120 characters, no digits",
      "importance": "routine | worth_review | priority_review",
      "interpretation": "two to four sentences, no digits",
      "alternative_explanations": ["up to five strings, each under 300 characters"],
      "missing_context_ids": ["ids from THIS pattern's missing_context, or []"],
      "recommended_reviews": ["up to five strings, each under 300 characters"],
      "report_candidate": true,
      "evidence_ids": ["ids from THIS pattern's citable_evidence_ids, or []"]
    }
  ]
}

Return {"interpretations": []} when nothing in this session is worth an assessor's attention.`

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/**
 * Ask for a reading of a monitoring session, and gate what comes back.
 *
 * The bundle is built here rather than accepted as an argument, so the record
 * that is validated and the record that was fingerprinted are the same object.
 * Passing one in would let a caller send one session and validate against
 * another, which is exactly the class of defect `forensicFreshness` exists to
 * catch after the fact.
 *
 * @param {object} input the same object `buildForensicBundle` takes —
 *   `{ sensorData, annotations, context, utcOffsetMin, calibrationGas }`
 * @param {object} [deps] injection seam for tests
 * @param {Function} [deps.fetch]
 * @param {object} [deps.supabase]
 * @returns {Promise<{record: object|null, bundle: object|null, validation: object|null, error: string|null}>}
 *   `record` is ready to persist; null means nothing was produced and the
 *   deterministic analysis stands on its own, which it always can. `error` is
 *   the sentence to show the assessor — the server's own classification where
 *   there is one (`api/_upstream-error.js`), because "try again" is the wrong
 *   advice for an exhausted API account.
 */
export async function generateForensicInterpretation(input, deps = {}) {
  const fetchFn = deps.fetch || (typeof fetch === 'function' ? fetch : null)
  const sb = deps.supabase === undefined ? supabase : deps.supabase
  const fail = (error, bundle = null) => ({ record: null, bundle, validation: null, error })

  let bundle = null
  try {
    bundle = buildForensicBundle(input || {})
  } catch (e) {
    console.error('Forensic bundle could not be built; interpretation not requested:', e && e.message)
    return fail('This monitoring session could not be prepared for review. The charts and the monitoring report are unaffected.')
  }
  if (!bundle.patterns.length) {
    // Nothing was detected, so there is nothing to interpret. Spending a
    // generation to be told that is worse than saying it here.
    return fail('No forensic patterns were detected in this session, so there is nothing to interpret yet.', bundle)
  }
  if (!fetchFn) return fail('Interpretation is unavailable in this environment.', bundle)

  const payload = { bundle: bundleForWriter(bundle) }
  let body
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (sb) {
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (session && session.access_token) headers.Authorization = `Bearer ${session.access_token}`
      } catch { /* unauthenticated — the handler will say so */ }
    }
    const res = await fetchFn('/api/forensic-interpret', {
      method: 'POST', headers, body: JSON.stringify({ payload }),
    })
    body = await res.json()
    if (!res.ok) {
      if (res.status === 429) console.warn('Forensic interpretation rate limit hit:', body && body.scope)
      else console.error('Forensic interpretation proxy error:', body && body.error)
      return fail((body && body.message) || 'This session could not be interpreted. Please try again.', bundle)
    }
  } catch (e) {
    console.error('Forensic interpretation error:', e)
    return fail('This session could not be interpreted — the service could not be reached. Please try again.', bundle)
  }

  // The server-side banned-language scan has already dropped anything that
  // fails the liability floor, per interpretation rather than per response —
  // one flagged reading must not cost the others. What survives still has to
  // clear the deterministic gate, which is the different question: whether
  // THIS session supports THIS sentence.
  //
  // A response the handler could not parse is refused HERE, as a `rejected`
  // record, rather than treated as an empty one. The model tried and what came
  // back was unusable; that is the opposite of a model that read the session
  // and validly raised nothing, and the record has to keep them apart.
  const parse = obj(body && body.parse)
  const validation = parse.status && parse.status !== 'ok'
    ? refuseForensicOutput(bundle, parse.status === 'unparseable' ? 'unparseable_output' : 'malformed_output', parse.detail)
    : validateForensicOutput(
      (body && body.output) || { interpretations: [] },
      bundle,
      { expectFingerprint: bundle.fingerprint },
    )
  const record = buildForensicInterpretationRecord({
    bundle,
    validation,
    model: { provider: 'anthropic', name: (body && body.model) || null, version: null },
  })
  return { record, bundle, validation, error: null }
}
