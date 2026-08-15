/**
 * AtmosFlow — Editorial-review digest
 *
 * Pure projection: turns a ClientReport model into the compact "digest" the
 * editorial-review endpoint (api/report-editorial-review) reads — the list of
 * report content that CAN be cut, each item carrying a stable renderer-honored
 * suppression target, plus the case facts the reviewer-agent needs to judge
 * what is over-produced FOR THIS case.
 *
 * The item targets use the same kinds as src/utils/editorialSuppressions.js, so
 * an approved suggestion maps straight to a suppression the renderer applies.
 *
 * No engine import here — this is a pure function of the already-built report,
 * so it is trivially testable. The caller builds the report model (via
 * DocxReport.getConsultantReportResult) and passes report.report in.
 */

function snippet(text, max = 180) {
  const s = String(text == null ? '' : text).trim().replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * Build the list of cuttable items from a ClientReport (`result.report`).
 * Each item: { id, kind, target, text }. Ids are positional and stable within
 * a single digest so the model can reference them without inventing targets.
 */
export function buildReportDigest(report) {
  if (!report || typeof report !== 'object') return []
  const items = []
  let n = 0
  const add = (kind, target, text) => {
    const t = snippet(text)
    if (!t) return
    items.push({ id: `i${n++}`, kind, target, text: t })
  }

  // Recommendations — the primary over-production surface. Keyed by
  // priority + action so a cut removes it from the register, the exec-summary
  // highlights, and every per-finding cross-reference at once.
  const reg = report.recommendationsRegister || {}
  const buckets = [reg.immediate, reg.shortTerm, reg.furtherEvaluation, reg.longTermOptional]
  for (const list of buckets) {
    for (const a of (Array.isArray(list) ? list : [])) {
      if (!a || typeof a.action !== 'string') continue
      add('recommendation', { kind: 'recommendation', priority: a.priority, action: a.action }, `Recommendation (${a.priority}): ${a.action}`)
    }
  }

  // Findings — for over-reaching interpretation the reviewer would trim.
  const addFindings = (findings) => {
    for (const f of (Array.isArray(findings) ? findings : [])) {
      if (!f || !f.findingId) continue
      add('finding', { kind: 'finding', findingId: f.findingId }, `Finding: ${f.narrative || f.observedValue || f.findingId}`)
    }
  }
  for (const z of (report.zoneSections || [])) addFindings(z.findings)
  addFindings(report.buildingAndSystemConditions && report.buildingAndSystemConditions.findings)

  // Results parameter subsections — for background material that could be
  // trimmed. (Genuine measurement results should be kept; the agent is
  // instructed accordingly.)
  for (const sub of (report.resultsSection && report.resultsSection.subsections) || []) {
    if (!sub || !sub.heading) continue
    add('resultsSubsection', { kind: 'resultsSubsection', heading: sub.heading }, `Results parameter: ${sub.heading}`)
  }

  return items
}

/**
 * Compact case facts so the reviewer-agent can judge relevance to THIS
 * investigation (e.g. drop ISO 14644 when no cleanroom/data-center scope).
 * `extra` supplies facts the ClientReport does not carry (space use, scope
 * flags) from the raw assessment.
 */
export function buildCaseFacts(report, extra = {}) {
  const facts = {}
  const meta = (report && report.meta) || {}
  if (meta.siteName) facts.site = meta.siteName
  const zones = (report && report.zoneSections) || []
  facts.zoneCount = zones.length
  facts.zoneNames = zones.map((z) => z && z.zoneName).filter(Boolean)
  const params = ((report && report.resultsSection && report.resultsSection.subsections) || [])
    .map((s) => s && s.heading).filter(Boolean)
  if (params.length) facts.parametersMeasured = params
  return { ...facts, ...(extra && typeof extra === 'object' ? extra : {}) }
}

/**
 * Assemble the endpoint payload from an already-built ClientReport model.
 */
export function buildEditorialReviewPayload(report, extraFacts = {}) {
  return {
    reportDigest: { items: buildReportDigest(report) },
    caseFacts: buildCaseFacts(report, extraFacts),
  }
}
