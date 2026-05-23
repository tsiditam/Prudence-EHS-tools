/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Pre-Review Validator — Layer 1 (deterministic).
 *
 * Runs a battery of fast, no-AI consistency checks across an
 * assembled assessment context BEFORE the report is sent to the
 * CIH for review. Each check is an independent function that
 * returns an array of issue objects; runPreReviewChecks() composes
 * them so adding a new check is one extra line.
 *
 * Issue shape:
 *   {
 *     id: string,             // stable id, used for dismiss tracking
 *     severity: 'blocking' | 'warning' | 'suggestion',
 *     category: string,       // machine-readable kind (e.g. 'duplicate_finding')
 *     title: string,          // one-line panel headline
 *     detail: string,         // longer explanation for the expand row
 *     anchor: { type: 'finding' | 'recommendation' | 'photo' | 'zone' | 'labRow' | 'profile' | 'narrative', id?: string, zone?: string },
 *   }
 *
 * Severity tiers:
 *   blocking    — must be resolved before the report ships. Examples:
 *                 photo refs to missing photos, placeholder assessor
 *                 name. Pairs with the existing finalization gate.
 *   warning     — likely a defect the IH should look at. Examples:
 *                 duplicate findings, lab date sanity. Does not block.
 *   suggestion  — defensibility nudge. Examples: ASHRAE 62.1 cited
 *                 as a CO2 contaminant limit, TVOC without Molhave
 *                 disclaimer. Logged but not blocking.
 *
 * Engine-sacred: this validator NEVER modifies the engine output.
 * It only READS the engine's score / findings / recs and reports
 * findings about consistency. Lives in src/utils so the engine
 * package stays untouched.
 */

// English stop words that inflate the Jaccard union without
// adding semantic signal for duplicate detection. Removing them
// makes the similarity score reflect the content words (zones,
// systems, observations) rather than the connective tissue.
const JACCARD_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by',
  'for', 'from', 'has', 'have', 'in', 'is', 'it', 'its',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'were', 'will', 'with',
])

/**
 * Pure Jaccard token similarity. Lowercased content-word set
 * overlap over union. Strips punctuation (otherwise "closed;" and
 * "closed" miss) and English stop words (otherwise "is / and / in /
 * this / the" inflate the union). ≥0.7 is a strong indicator of
 * two finding rows saying essentially the same thing. Used for
 * duplicate detection — not for any scoring decision.
 */
function jaccardSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return 0
  const tokenize = (s) => {
    const words = s.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter((w) => w && !JACCARD_STOP_WORDS.has(w))
    return new Set(words)
  }
  const tokensA = tokenize(a)
  const tokensB = tokenize(b)
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let inter = 0
  for (const t of tokensA) if (tokensB.has(t)) inter += 1
  const union = new Set([...tokensA, ...tokensB]).size
  return union ? inter / union : 0
}

const DUPLICATE_FINDING_THRESHOLD = 0.7
const PLACEHOLDER_NAME_PATTERNS = [
  /^test\s*$/i,
  /^\s*tbd\s*$/i,
  /^\s*todo\s*$/i,
  /^\s*x+\s*$/i,
  /^\s*xxx\s*$/i,
  /^assessor$/i,
  /^name$/i,
  /^iaq\s*assessor$/i,
]

const ANTI_PATTERNS = [
  {
    id: 'ashrae-62-1-as-co2-limit',
    pattern: /ashrae\s*62\.?1[^.]*?(?:co\s*2|co₂)\s*(?:contaminant|limit|exposure)/i,
    title: 'ASHRAE 62.1 cited as a CO₂ contaminant limit',
    detail: 'ASHRAE 62.1 governs ventilation rate, not contaminant limits. See Persily 2021. Consider reframing the citation around ventilation rate or CO₂-as-ventilation-indicator.',
  },
  {
    id: 'spore-count-as-health-proof',
    pattern: /(?:spore\s*count|spore\s*level)[^.]*?(?:proves|shows|demonstrates|indicates)[^.]*?(?:health|harm|illness|disease|exposure\s*risk)/i,
    title: 'Spore count framed as health proof',
    detail: 'IOM 2004 and ACMT 2025 are clear: spore counts are NOT a direct measure of health risk. Reframe as "elevated indicator warranting follow-up" rather than "proves harm".',
  },
  {
    id: 'tvoc-without-molhave',
    pattern: /\btvoc\b(?:(?!molhave|mølhave).)*$/is,
    title: 'TVOC interpretation without Mølhave 1991 advisory tier',
    detail: 'TVOC concentrations have no regulatory threshold. Mølhave 1991 advisory tiers are the convention. Add the Mølhave reference when interpreting TVOC.',
  },
]

/**
 * Walk every finding across zones, comparing each pair within the
 * same zone + category for high Jaccard token similarity. Cross-zone
 * duplicates are not flagged (different zones with similar wording is
 * common and usually intentional).
 */
export function checkDuplicateFindings(ctx) {
  const issues = []
  const zoneScores = Array.isArray(ctx?.zoneScores) ? ctx.zoneScores : []
  for (let zi = 0; zi < zoneScores.length; zi++) {
    const zs = zoneScores[zi]
    const zoneName = zs?.zoneName || `Zone ${zi + 1}`
    const cats = Array.isArray(zs?.cats) ? zs.cats : []
    for (const cat of cats) {
      const findings = Array.isArray(cat?.r) ? cat.r : []
      for (let i = 0; i < findings.length; i++) {
        for (let j = i + 1; j < findings.length; j++) {
          const a = findings[i]?.t || ''
          const b = findings[j]?.t || ''
          if (!a || !b) continue
          const sim = jaccardSimilarity(a, b)
          if (sim >= DUPLICATE_FINDING_THRESHOLD) {
            issues.push({
              id: `dup-${zi}-${cat?.l || 'cat'}-${i}-${j}`,
              severity: 'warning',
              category: 'duplicate_finding',
              title: `Possible duplicate finding in ${zoneName} · ${cat?.l || 'category'}`,
              detail: `Two finding rows have ${Math.round(sim * 100)}% word overlap:\n  • ${a.slice(0, 120)}${a.length > 120 ? '…' : ''}\n  • ${b.slice(0, 120)}${b.length > 120 ? '…' : ''}`,
              anchor: { type: 'finding', zone: zoneName },
            })
          }
        }
      }
    }
  }
  return issues
}

/**
 * Scan narrative + recommendation text for "Photo N" references and
 * verify the photo at that index exists. Critical/High findings
 * without their referenced photo are blocking (the existing
 * finalization gate already enforces critical-finding photos, but
 * this validator also catches stale references in body text).
 */
export function checkPhotoReferences(ctx) {
  const issues = []
  const photos = ctx?.photos
  const photoCount = Array.isArray(photos)
    ? photos.length
    : (photos && typeof photos === 'object')
      ? Object.keys(photos).length
      : 0

  const texts = []
  if (typeof ctx?.narrative === 'string') texts.push({ source: 'narrative', text: ctx.narrative })
  for (const tier of ['imm', 'eng', 'adm', 'mon']) {
    const list = ctx?.recs?.[tier]
    if (Array.isArray(list)) {
      list.forEach((r, idx) => {
        const t = typeof r === 'string' ? r : r?.text || ''
        if (t) texts.push({ source: `recs.${tier}[${idx}]`, text: t })
      })
    }
  }

  const photoRefRe = /\bphoto\s*#?\s*(\d+)\b/gi
  for (const { source, text } of texts) {
    let m
    photoRefRe.lastIndex = 0
    while ((m = photoRefRe.exec(text)) !== null) {
      const n = parseInt(m[1], 10)
      if (Number.isNaN(n) || n < 1) continue
      if (n > photoCount) {
        issues.push({
          id: `photo-missing-${source}-${n}`,
          severity: 'blocking',
          category: 'photo_ref_missing',
          title: `Photo ${n} referenced but missing`,
          detail: `${source} references "Photo ${n}" but only ${photoCount} photo${photoCount === 1 ? '' : 's'} are attached to this assessment.`,
          anchor: { type: 'photo', id: String(n) },
        })
      }
    }
  }
  return issues
}

/**
 * Lab CSV date sanity: every row's collectedAt must be ≤ receivedAt
 * (you can't receive a sample at the lab before it's collected). Also
 * flags receivedAt dates more than 60 days after collection — outside
 * the holding time for most IAQ analyses, the result is suspect.
 */
export function checkLabDateSanity(ctx) {
  const issues = []
  const rows = ctx?.labResults?.rows
  if (!Array.isArray(rows)) return issues
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const collected = row?.collectedAt
    const received = row?.receivedAt
    if (!collected || !received) continue
    const tCollected = Date.parse(collected)
    const tReceived = Date.parse(received)
    if (Number.isNaN(tCollected) || Number.isNaN(tReceived)) continue
    if (tCollected > tReceived) {
      issues.push({
        id: `lab-date-inversion-${i}`,
        severity: 'warning',
        category: 'lab_date_inversion',
        title: `Sample ${row.sampleId || `#${i + 1}`}: collected AFTER received`,
        detail: `Collected: ${collected}\nReceived: ${received}\nA sample can't reach the lab before it's collected — confirm the dates are entered correctly.`,
        anchor: { type: 'labRow', id: row.sampleId || String(i) },
      })
    } else if (tReceived - tCollected > 60 * 24 * 60 * 60 * 1000) {
      issues.push({
        id: `lab-date-holding-${i}`,
        severity: 'suggestion',
        category: 'lab_date_holding_time',
        title: `Sample ${row.sampleId || `#${i + 1}`}: long holding time`,
        detail: `Sample took ${Math.round((tReceived - tCollected) / 86400000)} days to reach the lab — outside the holding window for most IAQ analyses. Consider noting in the report whether the result is still defensible.`,
        anchor: { type: 'labRow', id: row.sampleId || String(i) },
      })
    }
  }
  return issues
}

/**
 * Anti-pattern detector for citation/finding mismatches that the
 * CLAUDE.md anti-patterns list calls out explicitly. Reads narrative
 * + recs text and flags any sentence that matches a known
 * defensibility-weakening framing.
 */
export function checkCitationAntiPatterns(ctx) {
  const issues = []
  const bodies = []
  if (typeof ctx?.narrative === 'string') bodies.push({ source: 'narrative', text: ctx.narrative })
  for (const tier of ['imm', 'eng', 'adm', 'mon']) {
    const list = ctx?.recs?.[tier]
    if (Array.isArray(list)) {
      list.forEach((r, idx) => {
        const t = typeof r === 'string' ? r : r?.text || ''
        if (t) bodies.push({ source: `recs.${tier}[${idx}]`, text: t })
      })
    }
  }

  for (const { source, text } of bodies) {
    for (const ap of ANTI_PATTERNS) {
      if (ap.pattern.test(text)) {
        issues.push({
          id: `anti-${ap.id}-${source}`,
          severity: 'suggestion',
          category: `anti_pattern_${ap.id}`,
          title: ap.title,
          detail: `${ap.detail}\n\nIn: ${source}`,
          anchor: { type: source.startsWith('recs') ? 'recommendation' : 'narrative' },
        })
      }
    }
  }
  return issues
}

/**
 * Critical / High severity findings that don't have any corresponding
 * Immediate-priority recommendation. The finalization gate already
 * blocks reports on missing client / contact / occupant denominator;
 * this check catches the more subtle case where a severe finding made
 * it into the report but the IH forgot to add a corresponding action.
 */
export function checkFindingsWithoutRecs(ctx) {
  const issues = []
  const recsImm = Array.isArray(ctx?.recs?.imm) ? ctx.recs.imm : []
  const recsImmTexts = recsImm.map((r) => (typeof r === 'string' ? r : r?.text || '').toLowerCase())
  const zoneScores = Array.isArray(ctx?.zoneScores) ? ctx.zoneScores : []
  for (let zi = 0; zi < zoneScores.length; zi++) {
    const zs = zoneScores[zi]
    const zoneName = zs?.zoneName || `Zone ${zi + 1}`
    const cats = Array.isArray(zs?.cats) ? zs.cats : []
    for (const cat of cats) {
      const findings = Array.isArray(cat?.r) ? cat.r : []
      for (const f of findings) {
        const sev = (f?.sev || '').toLowerCase()
        if (sev !== 'critical' && sev !== 'high') continue
        const findingText = (f?.t || '').toLowerCase()
        if (!findingText) continue
        // Simple token-overlap heuristic — a "real" semantic check is
        // Layer 2 territory. Here we just want to flag findings whose
        // text shares ≥3 distinctive nouns with no immediate rec.
        const tokens = findingText.split(/\s+/).filter((w) => w.length >= 5)
        const distinctive = new Set(tokens)
        const matched = recsImmTexts.some((rt) => {
          let n = 0
          for (const t of distinctive) if (rt.includes(t)) { n += 1; if (n >= 3) return true }
          return false
        })
        if (!matched) {
          issues.push({
            id: `no-rec-${zi}-${cat?.l || 'cat'}-${(f?.t || '').slice(0, 30)}`,
            severity: 'warning',
            category: 'finding_without_rec',
            title: `${sev === 'critical' ? 'Critical' : 'High'} finding in ${zoneName} without a matching immediate recommendation`,
            detail: `Finding: ${f?.t || ''}\n\nNo Immediate-priority recommendation appears to address this finding by text overlap. Add a corresponding rec or confirm the existing recommendations cover it.`,
            anchor: { type: 'finding', zone: zoneName },
          })
        }
      }
    }
  }
  return issues
}

/**
 * Assessor identity sanity: name is non-empty, doesn't match common
 * placeholder patterns, and isn't just a single character. The
 * existing finalization gate already catches "assessor name matching
 * placeholder patterns" — this validator surfaces it in the pre-
 * review panel rather than at the finalize-button bounce.
 */
export function checkPlaceholderText(ctx) {
  const issues = []
  const profile = ctx?.profile || {}
  const name = (profile?.name || ctx?.assessor || '').trim()
  if (!name) {
    issues.push({
      id: 'placeholder-name-empty',
      severity: 'blocking',
      category: 'placeholder_name',
      title: 'Assessor name is empty',
      detail: 'Reports cannot be finalized without a real assessor name. Update your profile in Settings → Account.',
      anchor: { type: 'profile' },
    })
    return issues
  }
  for (const re of PLACEHOLDER_NAME_PATTERNS) {
    if (re.test(name)) {
      issues.push({
        id: 'placeholder-name-pattern',
        severity: 'blocking',
        category: 'placeholder_name',
        title: `Assessor name looks like a placeholder: "${name}"`,
        detail: 'The assessor field on the cover page reads as a placeholder. Reports submitted to the CIH must carry a real IH name.',
        anchor: { type: 'profile' },
      })
      return issues
    }
  }
  if (name.length < 3) {
    issues.push({
      id: 'placeholder-name-short',
      severity: 'warning',
      category: 'placeholder_name',
      title: `Assessor name is unusually short: "${name}"`,
      detail: 'Single-letter / two-letter names usually indicate a typo. Confirm the assessor field is the IH\'s full name + credentials.',
      anchor: { type: 'profile' },
    })
  }
  return issues
}

/**
 * Sample-ID drift: every lab CSV row's sampleId should plausibly
 * map to a sample collected in the field. The field-side sample
 * registry is currently the union of:
 *   - presurvey.ps_samples (when present)
 *   - zones[].samples[]    (when present)
 *
 * Returns a suggestion (not a warning) — IDs that don't map are
 * common when the lab assigns its own internal IDs, but the IH
 * should at least eyeball the list before sending the report.
 */
export function checkSampleIdDrift(ctx) {
  const issues = []
  const labRows = ctx?.labResults?.rows
  if (!Array.isArray(labRows) || labRows.length === 0) return issues

  const fieldSampleIds = new Set()
  const presurveyIds = ctx?.presurvey?.ps_samples
  if (Array.isArray(presurveyIds)) {
    for (const s of presurveyIds) {
      const id = typeof s === 'string' ? s : s?.id
      if (id) fieldSampleIds.add(String(id).toLowerCase())
    }
  }
  const zones = Array.isArray(ctx?.zones) ? ctx.zones : []
  for (const z of zones) {
    const samples = z?.samples
    if (Array.isArray(samples)) {
      for (const s of samples) {
        const id = typeof s === 'string' ? s : s?.id
        if (id) fieldSampleIds.add(String(id).toLowerCase())
      }
    }
  }

  if (fieldSampleIds.size === 0) return issues // no field registry — can't compare

  const unmatched = []
  for (const row of labRows) {
    const id = row?.sampleId
    if (!id) continue
    if (!fieldSampleIds.has(String(id).toLowerCase())) {
      unmatched.push(id)
    }
  }
  if (unmatched.length > 0) {
    issues.push({
      id: 'sample-id-drift',
      severity: 'suggestion',
      category: 'sample_id_drift',
      title: `${unmatched.length} lab sample ID${unmatched.length === 1 ? '' : 's'} not in the field registry`,
      detail: `These sample IDs appear in the lab CSV but not in the field samples for this assessment:\n${unmatched.slice(0, 10).map((id) => `  • ${id}`).join('\n')}${unmatched.length > 10 ? `\n  …+${unmatched.length - 10} more` : ''}\n\nThis is common when the lab assigns internal IDs that differ from your field IDs. Confirm the mapping is correct.`,
      anchor: { type: 'labRow' },
    })
  }
  return issues
}

const SEVERITY_RANK = { blocking: 0, warning: 1, suggestion: 2 }

/**
 * Run all pre-review checks against an assessment context and
 * return the issues sorted by severity (blocking → warning →
 * suggestion). Stable order within each severity so the UI doesn't
 * jitter between runs.
 */
export function runPreReviewChecks(ctx) {
  const all = []
  all.push(...checkPlaceholderText(ctx))
  all.push(...checkPhotoReferences(ctx))
  all.push(...checkDuplicateFindings(ctx))
  all.push(...checkLabDateSanity(ctx))
  all.push(...checkFindingsWithoutRecs(ctx))
  all.push(...checkCitationAntiPatterns(ctx))
  all.push(...checkSampleIdDrift(ctx))
  return all.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 9
    const sb = SEVERITY_RANK[b.severity] ?? 9
    if (sa !== sb) return sa - sb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Group issues by severity for the panel UI. Returns
 * { blocking, warning, suggestion } with counts.
 */
export function summarizeIssues(issues) {
  const out = { blocking: [], warning: [], suggestion: [] }
  for (const i of issues || []) {
    if (out[i.severity]) out[i.severity].push(i)
  }
  return {
    blocking: out.blocking,
    warning: out.warning,
    suggestion: out.suggestion,
    blockingCount: out.blocking.length,
    warningCount: out.warning.length,
    suggestionCount: out.suggestion.length,
    totalCount: out.blocking.length + out.warning.length + out.suggestion.length,
    hasBlockers: out.blocking.length > 0,
  }
}
