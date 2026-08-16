/**
 * Decide which report id a finalize writes to — the guard against
 * duplicate reports for the same project.
 *
 * A finalize either UPDATES an existing report (when the session is already
 * pointed at one — a saved report resumed to fix a gap, or a report that was
 * just finalized in this same session) or CREATES a new one (a brand-new
 * assessment). The rule is simple: reuse the session's current id when it is
 * already a finalized report; otherwise mint a fresh id.
 *
 * The load-bearing part is the caller's responsibility, documented here
 * because getting it wrong is exactly the multiple-reports bug: after a
 * finalize the caller MUST advance its session pointer (draftId) to the
 * returned `rid`. If it keeps pointing at the retired draft id, the next
 * finalize in the same session (for instance right after fixing a readiness
 * blocker) will not recognize the report as existing and will spawn a
 * duplicate.
 *
 * @param {object} args
 * @param {string|null|undefined} args.currentId  the session's current id (draftId)
 * @param {Array<string>}         args.reportIds  ids already in the finalized-reports index
 * @param {string}                args.newId      id to mint when this is a new report
 * @returns {{ rid: string, reuse: boolean }}
 */
export function resolveFinalizeTarget({ currentId, reportIds, newId }) {
  const ids = Array.isArray(reportIds) ? reportIds : []
  const reuse = !!currentId && ids.includes(currentId)
  return { rid: reuse ? currentId : newId, reuse }
}
