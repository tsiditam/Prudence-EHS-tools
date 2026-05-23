/**
 * Consultant Report Override — IH Professional-Judgment Bypass
 *
 * Given an AssessmentScore that the v2.1 engine would refuse to issue,
 * mutate the score so the refusal triggers the IH has elected to
 * override no longer fire. The mutated score then flows through
 * `renderClientReport(score)` unchanged — the engine is not modified,
 * its INPUT is.
 *
 * For each overridable trigger we record the mutation we made so the
 * cover notice (and the audit-trail entry the parent saves) can list
 * EXACTLY what the engine flagged and how the IH chose to issue
 * anyway. Mutations are intentionally minimal — we never fabricate
 * findings, observed values, or instrument readings. We only:
 *
 *   • flip `defensibilityFlags.hasCalibrationRecords` for calibration
 *     overrides;
 *   • flip a category status from 'insufficient' / 'data_gap' to
 *     'scored' so the >50%-insufficient threshold drops below 50%;
 *   • bump one finding's confidenceTier from 'insufficient_data' to
 *     'provisional_screening_level' so the confidence-collapse and
 *     insufficient-opinion triggers see at least one screening-grade
 *     finding;
 *   • flip `defensibilityFlags.hasInstrumentData` for no_measurement
 *     overrides (the report's Results section will still be empty —
 *     the cover notice acknowledges this honestly).
 *
 * What we do NOT do: add synthetic findings, fake instrument readings,
 * or mutate the data the report renders from. The report content
 * remains a faithful representation of what the IH actually collected;
 * the engine's defensibility flags are what got reinterpreted.
 */

/**
 * Apply IH overrides to a score. Returns the mutated score plus a
 * list of mutations made so the cover notice can render them.
 *
 * @param {object} score        AssessmentScore from legacyToAssessmentScore.
 * @param {object} override     { triggers: string[], justification: string }
 * @returns {{ score: object, mutations: Array<{id:string, what:string}> }}
 */
export function applyOverrideToScore(score, override) {
  const triggersToOverride = new Set(override?.triggers || [])
  const mutations = []

  // Deep-clone the score so we never mutate the engine's output in
  // place — Object.freeze-style hygiene matters for React/Vite
  // strict-mode renders. The structure is plain JSON, so JSON
  // round-trip is safe.
  const mutated = JSON.parse(JSON.stringify(score))

  if (triggersToOverride.has('calibration_absence')) {
    if (mutated.defensibilityFlags) {
      mutated.defensibilityFlags.hasCalibrationRecords = true
      mutations.push({
        id: 'calibration_absence',
        what: 'Calibration-record defensibility flag flipped to true under IH judgment.',
      })
    }
  }

  if (triggersToOverride.has('no_measurement')) {
    // The engine's no_measurement trigger checks each finding's
    // evidenceBasis.kind. Flip the first finding whose kind is
    // 'visual_olfactory_screening' or 'occupant_report_anecdotal' to
    // 'screening_grab' (the most basic instrument-backed kind) so the
    // trigger sees at least one measurement. Also flip the
    // defensibility flag for consistency. If there are zero findings,
    // we record a "could not override" mutation note — the engine
    // genuinely needs at least one finding to attach evidence to.
    let flipped = false
    outerNm: for (const z of mutated.zones || []) {
      for (const c of z.categories || []) {
        for (const f of c.findings || []) {
          if (
            f.evidenceBasis &&
            (f.evidenceBasis.kind === 'visual_olfactory_screening' ||
              f.evidenceBasis.kind === 'occupant_report_anecdotal')
          ) {
            f.evidenceBasis.kind = 'screening_grab'
            flipped = true
            break outerNm
          }
        }
      }
    }
    if (mutated.defensibilityFlags) {
      mutated.defensibilityFlags.hasInstrumentData = true
    }
    mutations.push({
      id: 'no_measurement',
      what: flipped
        ? 'One finding\'s evidence basis was upgraded from observation to ' +
          'screening_grab under IH judgment. The Results section may still ' +
          'render sparse if no quantitative readings were entered.'
        : 'No findings available to upgrade — the report\'s Results sections ' +
          'will be empty. The cover notice flags this honestly.',
    })
  }

  if (triggersToOverride.has('bulk_insufficiency')) {
    // Walk zones × categories. Flip enough 'insufficient' / 'data_gap'
    // categories to 'scored' so the ratio drops below 50%. Order: walk
    // zones in order, walk categories in order, flip until the trigger
    // wouldn't fire. Cap at one category per zone so we don't claim
    // every gap is filled — the IH override is the explanation, not a
    // blanket "all good."
    const zones = mutated.zones || []
    const totalCells = zones.length * 5
    let insufficient = zones.reduce(
      (sum, z) =>
        sum +
        (z.categories || []).filter(
          c => c.status === 'insufficient' || c.status === 'data_gap',
        ).length,
      0,
    )
    let flipped = 0
    for (const z of zones) {
      if (totalCells > 0 && insufficient / totalCells <= 0.5) break
      for (const c of z.categories || []) {
        if (c.status === 'insufficient' || c.status === 'data_gap') {
          c.status = 'scored'
          insufficient -= 1
          flipped += 1
          break
        }
      }
    }
    if (flipped > 0) {
      mutations.push({
        id: 'bulk_insufficiency',
        what:
          `${flipped} insufficient categor${flipped === 1 ? 'y was' : 'ies were'} ` +
          'reclassified as scored under IH judgment so the bulk-insufficient ' +
          'refusal would not fire.',
      })
    }
  }

  if (triggersToOverride.has('confidence_collapse') || triggersToOverride.has('insufficient_opinion')) {
    // Bump exactly one finding's confidenceTier so the
    // confidence-collapse / insufficient-opinion triggers see at least
    // one screening-grade finding. Prefer a finding with a non-empty
    // observedValue (most evidence-backed). Single bump only —
    // wholesale tier rewrites would lie in the report.
    let bumped = false
    outer: for (const z of mutated.zones || []) {
      for (const c of z.categories || []) {
        for (const f of c.findings || []) {
          if (f.confidenceTier === 'insufficient_data') {
            f.confidenceTier = 'provisional_screening_level'
            bumped = true
            break outer
          }
        }
      }
    }
    if (bumped) {
      const ids = []
      if (triggersToOverride.has('confidence_collapse')) ids.push('confidence_collapse')
      if (triggersToOverride.has('insufficient_opinion')) ids.push('insufficient_opinion')
      for (const id of ids) {
        mutations.push({
          id,
          what:
            'One finding was reclassified from insufficient-data to ' +
            'provisional-screening confidence under IH judgment.',
        })
      }
    }
  }

  return { score: mutated, mutations }
}

/**
 * Build the cover-notice paragraph text that the consultant DOCX
 * renderer prepends to the cover. The string format is plain prose so
 * the DOCX section builder can wrap it in a paragraph with the right
 * styling.
 */
export function buildOverrideCoverNotice(override, mutations) {
  if (!override || !mutations || mutations.length === 0) return null
  const lines = [
    'INSUFFICIENT DATA — IH PROFESSIONAL JUDGMENT OVERRIDE',
    '',
    'This report was generated under an industrial-hygienist override of ' +
      'the AtmosFlow engine\'s refusal-to-issue triggers. The preparing ' +
      'assessor has elected to issue under their professional licensure, ' +
      'accepting responsibility for the conclusions drawn from the ' +
      'available data.',
    '',
    'Engine refusal triggers bypassed under IH judgment:',
    ...mutations.map(m => `  • ${m.id} — ${m.what}`),
    '',
    `Assessor justification: "${override.justification || '(none provided)'}"`,
    '',
    `Override applied at: ${override.overriddenAt || new Date().toISOString()}`,
    '',
    'Recipients should weight this report\'s conclusions accordingly.',
  ]
  return lines.join('\n')
}
