/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * `cond` — when a question is shown.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 * The predicate was implemented four times: three inline copies in
 * MobileApp (quickstart, details, zone) and a named `condOk` in
 * MoldModeScreen. They had already drifted into two dialects that mean the
 * same thing by different names, with different semantics:
 *
 *   IAQ   `{f,eq}` / `{f,ne}`   checked for TRUTHINESS, so `ne:''` is
 *                                silently ignored and the question always
 *                                shows.
 *   Mold  `{f,eq}` / `{f,neq}`  checked for PRESENCE, so `neq:''` works and
 *         / `{f,in}`            is used — four mold questions depend on it.
 *
 * That is the shape of every cross-layer defect in this codebase: two
 * implementations of one rule, each correct on its own surface, disagreeing
 * where they meet. Adding `all` / `any` to four copies would have tripled it.
 *
 * ── Semantics ──────────────────────────────────────────────────────────
 * Operators are checked by PRESENCE (`'eq' in cond`), not truthiness, which
 * is what makes `{f, neq: ''}` — "show when this has been answered" —
 * expressible. No IAQ question currently uses a falsy `eq`/`ne` value, so
 * this is a widening rather than a behavior change; `conditions.test.js`
 * pins the legacy pairs.
 *
 * A leaf may carry several operators and they AND together, preserving the
 * IAQ path's behavior where `eq` and `ne` were independent checks.
 *
 * ── What this deliberately does NOT do ─────────────────────────────────
 * There is no numeric threshold operator — no `gt`, no `lt`. Whether a
 * reading is high is the engine's answer (`evaluateCriteria` against the
 * criterion registry), and a `{f:'co2', gt:1000}` here would be a second,
 * unciteable opinion about the same number, drifting the moment a threshold
 * moves. If a question should appear because a reading is elevated, the
 * condition must read a state the ENGINE derived, not re-derive it.
 * `empty` is not that: it asks whether a field was answered, which is a
 * property of the record and of nothing else.
 */

/** A field counts as answered when it holds something other than blank. */
function hasValue(v) {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** null/undefined collapse to '' so `neq:''` means "not blank". */
const norm = (v) => (v === undefined || v === null ? '' : v)

/** Substring for text, membership for a multi-select. */
function containsValue(v, needle) {
  if (Array.isArray(v)) return v.some((x) => String(x) === String(needle))
  if (v === undefined || v === null) return false
  return String(v).includes(String(needle))
}

function evalLeaf(cond, answers) {
  const v = (answers || {})[cond.f]
  // Every operator present must hold. `ne` and `neq` are the same operator
  // under two names; both are live and neither is being renamed, because a
  // rename means editing every question that uses it for no behavior change.
  if ('eq' in cond && norm(v) !== cond.eq) return false
  if ('ne' in cond && norm(v) === cond.ne) return false
  if ('neq' in cond && norm(v) === cond.neq) return false
  if ('in' in cond && !(Array.isArray(cond.in) && cond.in.some((x) => x === norm(v)))) return false
  if ('includes' in cond && !containsValue(v, cond.includes)) return false
  if ('empty' in cond && hasValue(v) === !!cond.empty) return false
  return true
}

/**
 * Evaluate a `cond` against an answer map.
 *
 * Forms:
 *   null / undefined          always true — the question is unconditional
 *   { f, eq }                 field equals
 *   { f, ne } / { f, neq }    field does not equal
 *   { f, in: [...] }          field is one of
 *   { f, includes }           text contains, or multi-select holds
 *   { f, empty: true|false }  field is blank / has been answered
 *   { all: [ ... ] }          every sub-condition holds
 *   { any: [ ... ] }          at least one sub-condition holds
 *   { not: cond }             the sub-condition does not hold
 *
 * Unknown shapes return true. A condition nobody can parse must not be able
 * to hide a question the assessor is supposed to answer — failing open is
 * the safe direction here, and the catalog test is what catches a typo.
 */
export function evalCondition(cond, answers) {
  if (!cond || typeof cond !== 'object') return true
  if (Array.isArray(cond.all)) return cond.all.every((c) => evalCondition(c, answers))
  if (Array.isArray(cond.any)) return cond.any.some((c) => evalCondition(c, answers))
  if (cond.not) return !evalCondition(cond.not, answers)
  if (typeof cond.f === 'string') return evalLeaf(cond, answers)
  return true
}

/** Keep the questions whose condition holds. */
export function visibleQuestions(questions, answers) {
  return (questions || []).filter((q) => evalCondition(q.cond, answers))
}

/**
 * Every field id a condition depends on, including nested groups.
 *
 * The in-walkthrough gap surface needs this: a question that is hidden right
 * now may become relevant once another answer lands, and a gap list that
 * counts a currently-hidden question as "missing" would ask for something
 * the assessor cannot see.
 */
export function conditionFields(cond, out = []) {
  if (!cond || typeof cond !== 'object') return out
  if (Array.isArray(cond.all)) cond.all.forEach((c) => conditionFields(c, out))
  else if (Array.isArray(cond.any)) cond.any.forEach((c) => conditionFields(c, out))
  else if (cond.not) conditionFields(cond.not, out)
  else if (typeof cond.f === 'string' && !out.includes(cond.f)) out.push(cond.f)
  return out
}
