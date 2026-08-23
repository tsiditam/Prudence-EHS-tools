/**
 * Double-entry bookkeeping for published thresholds.
 *
 * ── The problem this closes ────────────────────────────────────────────
 * Every number the engine applies exists in two independently authored
 * places: `constants/criteria.js` (the machine registry) and
 * `constants/standards-corpus.js` (curated prose with primary-source
 * citations, written for Jasper's retrieval layer). Nothing reconciled them.
 *
 * So for four months the engine scored temperature against an invented
 * 67–82 °F "acceptable" band with a fabricated "optimal" tier inside it,
 * while the corpus — three directories away — carried the correct 68–76 °F
 * winter / 73–79 °F summer and had done since it was written. It also
 * carried, verbatim, the fact that ASHRAE 55 "does NOT prescribe a lower
 * humidity limit" while eleven surfaces cited ASHRAE 55 for a 30% floor.
 *
 * Both ledgers were readable. Both were in the repo. Neither was ever
 * compared to the other, and a reviewer had no reason to open both.
 *
 * ── What this enforces ─────────────────────────────────────────────────
 * 1. A figure declared in the corpus must MATCH the registry exactly.
 * 2. Every criterion is either documented by a corpus figure, or named in
 *    UNDOCUMENTED below with a reason.
 * 3. UNDOCUMENTED may only name criteria that exist — so it cannot rot into
 *    a list of ghosts that silently excuses everything.
 * 4. Every citation is specific enough to be checked by a person.
 *
 * The practical guarantee: a new threshold cannot enter the engine
 * unremarked. It is documented, or it is on a visible list of things that
 * are not. There is no third state.
 */
import { describe, it, expect } from 'vitest'
import { CRITERIA, allCriteria } from '../../src/constants/criteria'
import { STANDARDS_CORPUS } from '../../src/constants/standards-corpus'
import { STANDARDS_MANIFEST } from '../../src/constants/standards'

type Figure = {
  criterionId: string
  value?: number
  band?: [number, number]
  unit?: string
  /** Overrides the entry's own document when a figure belongs to another body. */
  manifestKey?: string
}

const corpusFigures: Array<Figure & { entryId: string; citation: string }> =
  (STANDARDS_CORPUS as any[]).flatMap((e) =>
    ((e.figures || []) as Figure[]).map((f) => ({ ...f, entryId: e.id, citation: e.citation, document: e.document })))

const criteria = allCriteria() as any[]
const byId = new Map(criteria.map((c) => [c.id, c]))

/**
 * Criteria the corpus does not yet document, each with the reason.
 *
 * This is a BACKLOG, not an exemption. Every entry is a threshold the engine
 * applies and can state to a client, whose only description lives in the
 * registry's own one-line `source`. That is enough to check by hand and not
 * enough to be contradicted by, which is precisely the condition temperature
 * and humidity were in when they turned out to be wrong.
 *
 * It may only shrink. Adding to it is a deliberate act that shows up in a
 * diff, and filling an entry needs the BCSP sign-off the corpus file's own
 * editing rules require for new prose — which is why this list exists instead
 * of me writing that prose unilaterally.
 */
const UNDOCUMENTED: Record<string, string> = {
  co_niosh_ceiling: 'No CO-specific corpus entry. niosh-rel-idlh covers the REL/IDLH concepts but states no CO figure.',
  co_niosh_rel: 'Same gap as co_niosh_ceiling.',
  co_osha_pel: 'osha-z1-overview describes Table Z-1 but lists no individual substance limits.',
  co_who_1h: 'No WHO indoor-guideline corpus entry exists at all.',
  co_who_24h: 'No WHO indoor-guideline corpus entry exists at all.',
  co_epa_naaqs_8h: 'epa-naaqs-overview describes the NAAQS framework but states no CO figure.',
  co_well: 'No WELL v2 corpus entry states the CO performance target.',
  hcho_osha_stel: 'No formaldehyde corpus entry. 1910.1048 is named in passing in osha-z1-overview with no figures.',
  hcho_osha_pel: 'Same gap as hcho_osha_stel.',
  hcho_osha_al: 'Same gap as hcho_osha_stel.',
  hcho_niosh_rel: 'Same gap as hcho_osha_stel.',
  hcho_who_30min: 'No WHO indoor-guideline corpus entry exists at all.',
  hcho_epa_rfc: 'No corpus entry covers the 2024 IRIS formaldehyde RfC.',
  pm25_epa_unhealthy: 'epa-pm25-2024-revision states the NAAQS figures but not the AQI category bound.',
  pm25_well: 'No WELL v2 corpus entry states the PM2.5 performance target.',
  pm10_epa_24h: 'No PM10 corpus entry; epa-pm25-2024-revision is PM2.5-only.',
  pm10_who_24h: 'No PM10 corpus entry, and no WHO entry.',
  pm10_who_annual: 'No PM10 corpus entry, and no WHO entry.',
  pm10_well: 'No WELL v2 corpus entry states the PM10 performance target.',
  co2_concern: 'co2-not-toxic and ashrae-621-co2-dcv explain why CO2 indexes ventilation, but state no indicator figure.',
  co2_action: 'Same gap as co2_concern.',
}

describe('the two ledgers agree', () => {
  it('every declared figure names a criterion that exists', () => {
    for (const f of corpusFigures) {
      expect(byId.get(f.criterionId), `${f.entryId} declares ${f.criterionId}, which is not in the registry`)
        .toBeTruthy()
    }
  })

  it('every declared figure matches the registry exactly', () => {
    // The check that would have caught the invented temperature band on the
    // day it was written. No tolerance: a threshold is a cited number, and
    // "close" is how 67 becomes defensible.
    for (const f of corpusFigures) {
      const c = byId.get(f.criterionId)!
      const where = `${f.entryId} → ${f.criterionId}`
      if (f.band) {
        expect(c.band, `${where}: registry has no band`).toBeTruthy()
        expect([c.band.min, c.band.max], `${where} band`).toEqual(f.band)
      } else {
        expect(c.value, `${where} value`).toBe(f.value)
      }
      if (f.unit) expect(c.unit, `${where} unit`).toBe(f.unit)
    }
  })

  it('has at least one figure reconciled — the check is not vacuous', () => {
    expect(corpusFigures.length).toBeGreaterThanOrEqual(9)
  })
})

describe('no threshold enters the engine unremarked', () => {
  it('every criterion is documented, or is on the gap list with a reason', () => {
    const documented = new Set(corpusFigures.map((f) => f.criterionId))
    const unaccounted = criteria
      .map((c) => c.id)
      .filter((id) => !documented.has(id) && !(id in UNDOCUMENTED))
    expect(
      unaccounted,
      'a criterion is neither documented in the corpus nor listed in UNDOCUMENTED. '
      + 'Document it, or add it to the list with the reason it cannot be documented yet.',
    ).toEqual([])
  })

  it('the gap list names only criteria that exist', () => {
    // Stops the backlog rotting into a list of ghosts. A stale id would
    // silently excuse nothing while looking like diligence.
    const stale = Object.keys(UNDOCUMENTED).filter((id) => !byId.has(id))
    expect(stale, 'UNDOCUMENTED names criteria that no longer exist').toEqual([])
  })

  it('every gap carries a reason, not a placeholder', () => {
    for (const [id, reason] of Object.entries(UNDOCUMENTED)) {
      expect(reason, `${id} reason is a placeholder`).not.toMatch(/^(TODO|TBD|N\/A|\?+)/i)

      // "Same gap as X." is a legitimate and preferable reason — repeating the
      // explanation four times is how four copies drift. But it has to point
      // somewhere real, so it is checked rather than merely counted: a length
      // rule would have rejected the good short form and accepted a long
      // meaningless one.
      const ref = reason.match(/^Same gap as ([a-z0-9_]+)\.$/)
      if (ref) {
        expect(UNDOCUMENTED[ref[1]], `${id} defers to ${ref[1]}, which is not on the list`).toBeTruthy()
        expect(UNDOCUMENTED[ref[1]], `${id} defers to a reason that just defers again`)
          .not.toMatch(/^Same gap as /)
      } else {
        expect(reason.length, `${id} reason is too short to be a reason`).toBeGreaterThan(25)
      }
    }
  })

  it('a criterion cannot be BOTH documented and excused', () => {
    // Belt and braces: an entry that is documented has no business on the
    // backlog, and leaving it there hides that the gap was closed.
    const documented = new Set(corpusFigures.map((f) => f.criterionId))
    const both = Object.keys(UNDOCUMENTED).filter((id) => documented.has(id))
    expect(both, 'these are documented in the corpus and should leave UNDOCUMENTED').toEqual([])
  })
})

describe('a citation can be checked by a person', () => {
  // The rule is not "has a source" — the invented temperature band had one,
  // `STD.t.ref = 'ASHRAE 55-2023'`. It is that the source names something
  // specific enough to look up and disagree with.
  const SPECIFIC = [
    /\b(19|20)\d{2}\b/,                 // a year or edition
    /\bCFR\b/,                          // a regulation
    /Pocket Guide|IRIS|NAAQS|Table Z/,  // a named publication
    /—|--|,/,                           // a qualifier after the document name
  ]

  it.each(criteria.map((c) => [c.id, c.source] as [string, string]))(
    '%s cites something checkable',
    (id, source) => {
      expect(source, `${id} has no source`).toBeTruthy()
      expect(source.length, `${id} source is too short to identify a document`).toBeGreaterThan(18)
      expect(
        SPECIFIC.some((re) => re.test(source)),
        `${id} source "${source}" names no year, regulation, publication or qualifier`,
      ).toBe(true)
    },
  )

  it('no criterion cites a bare standard name', () => {
    // "ASHRAE 55" alone was the shape of the citation that was wrong twice.
    const BARE = /^(ASHRAE (55|62\.1|241)|NIOSH|OSHA|EPA|WHO|WELL|IICRC S520)$/i
    for (const c of criteria) {
      expect(BARE.test(String(c.source).trim()), `${c.id} cites a bare standard name`).toBe(false)
    }
  })

  /**
   * Corpus `document` codes to the manifest key that versions them.
   *
   * An explicit map, not a fuzzy match. The first version of this check
   * compared the first two words of a citation against the manifest text and
   * reported ten false positives — "ASHRAE 55-2023" failing to match the key
   * "ASHRAE 55" because of the edition suffix. A guard that cries wolf is
   * worse than no guard: it gets an allowlist bolted on, then it gets ignored.
   *
   * `null` means the manifest deliberately does not version this document:
   * it is a METHOD or a framework (how to sample, how to number a method, how
   * a carcinogen is classified), not a source of a threshold the engine
   * applies. The manifest is a bibliography of thresholds.
   */
  const DOCUMENT_TO_MANIFEST: Record<string, string | null> = {
    'ACGIH-TLV': 'ACGIH TLVs and BEIs',
    'AIHA': 'AIHA Recognition/Evaluation/Control of Mold',
    'AIHA-IICRC': 'AIHA Recognition/Evaluation/Control of Mold',
    'ASHRAE-241': 'ASHRAE 241',
    'ASHRAE-55': 'ASHRAE 55',
    'ASHRAE-62.1': 'ASHRAE 62.1',
    'EPA-NAAQS': 'EPA NAAQS',
    'IICRC-S520': 'IICRC S520',
    'Molhave-1991': 'Molhave TVOC tiers',
    'NIOSH-NPG': 'NIOSH Pocket Guide RELs',
    'OSHA-CFR-1910': 'OSHA Z-1 PELs',
    'WHO-NIOSH': 'WHO Air Quality Guidelines',
    // Methods and frameworks — no threshold the engine applies comes from these.
    'AOEC': null,
    'ATSDR-EPA': null,
    'EPA-402-K-12': null,      // A Citizen's Guide to Radon — screening guidance
    'EPA-ASHRAE': null,
    'EPA-ASTM': null,
    'EPA-Compendium': null,    // TO-15 / TO-17 sampling methods
    'EPA-HUD': null,
    'IAQ-Methodology': null,
    'IARC': null,
    'LEED-v4': null,           // A certification credit, offered but never engine-applied
    'NIOSH-77-173': null,
    'NIOSH-NMAM': null,
    'OSHA-ASTM-ANSI': null,
  }

  it('every corpus document code is mapped, so a new one cannot slip in', () => {
    const codes = [...new Set((STANDARDS_CORPUS as any[]).map((e) => e.document))]
    const unmapped = codes.filter((d) => !(d in DOCUMENT_TO_MANIFEST))
    expect(
      unmapped,
      'a corpus entry cites a document code nothing maps. Map it to its manifest key, '
      + 'or to null if it is a method rather than a source of an applied threshold.',
    ).toEqual([])
  })

  it('every mapped document is actually in the manifest', () => {
    const missing = Object.entries(DOCUMENT_TO_MANIFEST)
      .filter(([, key]) => key !== null)
      .filter(([, key]) => !(key! in STANDARDS_MANIFEST))
      .map(([code, key]) => `${code} → ${key}`)
    expect(missing, 'mapped to a manifest key that does not exist').toEqual([])
  })

  it('every criterion whose figure the corpus documents shares that document', () => {
    // The tightest form of the reconciliation: not just "the numbers agree"
    // but "they agree about which body published them". That is what
    // distinguishes a real cross-check from two files that happen to hold the
    // same integer.
    //
    // A figure may name its OWN bibliography entry, because one corpus entry
    // can legitimately document figures from two bodies —
    // `epa-pm25-2024-revision` states the EPA NAAQS and the stricter WHO
    // guidelines side by side, and that comparison is the reason it exists.
    // The first version of this check assumed one entry meant one body and
    // reported that as a defect. It was the model that was wrong.
    const fold = (x: string) => x.toLowerCase().replace(/ø/g, 'o').replace(/[^a-z0-9. ]/g, '')
    for (const f of corpusFigures as any[]) {
      const key = f.manifestKey ?? DOCUMENT_TO_MANIFEST[f.document]
      if (!key) continue
      expect(STANDARDS_MANIFEST[key as keyof typeof STANDARDS_MANIFEST],
        `${f.criterionId} names manifest key "${key}", which does not exist`).toBeTruthy()
      const body = fold(key).split(/\s+/)[0]
      expect(
        fold(byId.get(f.criterionId)!.source),
        `${f.criterionId} cites "${byId.get(f.criterionId)!.source}" but is documented under ${key}`,
      ).toContain(body)
    }
  })

  it('the humidity band is documented by the entry that says it is not ASHRAE 55', () => {
    // Worth asserting on its own rather than as a branch inside the loop
    // above. The corpus entry titled "ASHRAE 55 thermal comfort framework" is
    // where the 30–60% band is explained, and the explanation is that ASHRAE
    // 55 is NOT its source. If that sentence ever leaves, the strongest
    // written record of the correction leaves with it.
    const entry = (STANDARDS_CORPUS as any[]).find((e) => e.id === 'ashrae-55-comfort')!
    expect(entry.text).toMatch(/not an ASHRAE 55 comfort requirement/)
    expect(entry.text).toMatch(/does NOT prescribe a lower humidity limit/)
    expect(byId.get('rh_epa_moisture_control')!.source).toMatch(/EPA/)
  })

})
