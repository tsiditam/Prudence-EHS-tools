/**
 * The use/mention split, shared by every prompt-agreement suite.
 *
 * ── The rule ───────────────────────────────────────────────────────────
 * A prompt may EXHIBIT a forbidden phrase in order to forbid it, and may
 * never use one in its own instructing voice. A naive whole-prompt scan
 * cannot tell those apart, and would demand that a prohibition delete its
 * own examples.
 *
 * Exhibits are delimited two ways in these prompts: quotation marks around a
 * phrase (`not "most likely"`) and backticks around an identifier
 * (`` `parameter_context` ``). Blanking both leaves the prompt's own voice.
 *
 * ── Why this lives in one file now ─────────────────────────────────────
 * It existed twice, and the two copies had already DIVERGED — the writer
 * suite stripped quoted spans only, the reviewer suite stripped quoted and
 * backticked spans. So two suites named the same rule and enforced
 * different ones, which is the failure mode a shared helper exists to
 * prevent. The stricter reading is the correct one: a backticked identifier
 * is quoted material by another delimiter.
 */

/**
 * `prompt` reduced to what it says in its own voice.
 *
 * Neither pattern spans a line break. An unbalanced delimiter must blank
 * one phrase, never swallow the rest of the document and report the prompt
 * clean — a guard that goes quiet on malformed input is worse than no
 * guard, because the silence reads as proof.
 */
export const normativeText = (prompt: string): string =>
  String(prompt)
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`\n]*`/g, '``')

/** A package whose `allowed_interpretations` arm the pathway rule. */
export const withPathwaySubject = () => ({
  immutable_values: [], references: [], findings: [], recommendation_options: [],
  required_limitations: [], prohibited_claims: [],
  allowed_interpretations: [{ id: 'a1', subject: 'chain-0', subject_kind: 'pathway', statement: 'x' }],
})
