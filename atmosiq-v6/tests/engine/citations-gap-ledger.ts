/**
 * Gap ledger for figures REMOVED from client-facing text rather than
 * corrected (AUDIT-2026-09 §5, C7 and the "verify" figures).
 *
 * The rule that produced this list: a number or attribution that cannot be
 * confirmed against its primary source with high confidence is not replaced
 * by another guess. The numeric claim and its citation come out of the
 * finding text, the condition is stated qualitatively with what to verify
 * against, and the removal is recorded HERE with its reason — so the gap is
 * visible in a diff and cannot be mistaken for a figure that was checked.
 *
 * This is a helper, not a test file (no `.test.` suffix), so both
 * `standards-reconciliation.test.ts` and `citations-building-profiles.test.ts`
 * can read one ledger without either importing the other's tests. It is the
 * profile-level counterpart of the `UNDOCUMENTED` ledger in
 * standards-reconciliation.test.ts, which is keyed to registry criteria and
 * therefore cannot hold a building-profile air-change rate.
 *
 * Each entry names the profile and subtype whose `achOverrides` entry was
 * removed, or the finding whose figure was withdrawn, and the reason. It may
 * only shrink by ENTERING a primary-source figure with a citation that names
 * the table it comes from — at which point the entry leaves this list and the
 * override returns with that label.
 */
export type ProfileGap = {
  /** `BUILDING_PROFILES` key, e.g. 'HEALTHCARE'. */
  profile: string
  /** zoneSubtypes id, e.g. 'waiting'. */
  subtype: string
  /** What stood there before removal, for the record. */
  removed: string
  reason: string
}

export const PROFILE_ACH_GAPS: ProfileGap[] = [
  {
    profile: 'HEALTHCARE', subtype: 'waiting',
    removed: 'achOverrides.waiting = 4 ACH, "ASHRAE 170-2021 Table 7-1"',
    reason: 'ASHRAE 170-2021 Table 7.1 lists emergency-department and radiology waiting rooms at 12 total ACH, negative; the profile\'s 4 ACH matched no row and the profile does not record which kind of waiting area a zone is. Removed pending a primary-source figure for the room type actually recorded. The engine\'s generic healthcare default applies meanwhile.',
  },
  {
    profile: 'HEALTHCARE', subtype: 'pharmacy',
    removed: 'achOverrides.pharmacy = 12 ACH, "ASHRAE 170-2021 Table 7-1 (ISO Class 7)"',
    reason: '12 ACH matched neither ASHRAE 170-2021 Table 7.1 (general pharmacy) nor USP <797> (ISO 7 buffer room: 30 ACH), and "ISO Class 7" is a USP <797> concept, not a 170 row. The finding text now names both sources and asks which applies; no rate is scored until the room type is recorded.',
  },
  {
    profile: 'HEALTHCARE', subtype: 'office',
    removed: 'achOverrides.office = 4 ACH, "ASHRAE 62.1"',
    reason: 'ASHRAE 62.1 sets outdoor-air rates (cfm/person + cfm/ft²), not air-change rates; it states no ACH for any space. There is no source for 4 ACH, so the override is removed rather than re-cited.',
  },
  {
    profile: 'LABORATORY', subtype: 'wet_lab',
    removed: 'achOverrides.wet_lab = 8 ACH, "ANSI/AIHA Z9.5"',
    reason: 'ANSI/AIHA Z9.5 explicitly declines to prescribe a laboratory air-change rate (it requires the rate to be determined from the hazard assessment and hood exhaust). The figure has no source; removed.',
  },
  {
    profile: 'LABORATORY', subtype: 'dry_lab',
    removed: 'achOverrides.dry_lab = 6 ACH, "ANSI/AIHA Z9.5"',
    reason: 'Same basis as wet_lab: Z9.5 sets no air-change rate. Removed.',
  },
  {
    profile: 'LABORATORY', subtype: 'bio_lab',
    removed: 'achOverrides.bio_lab = 6 ACH, "ANSI/AIHA Z9.5; CDC/NIH BMBL"',
    reason: 'Z9.5 sets no air-change rate, and the BMBL specifies directional airflow and containment rather than a numeric ACH for BSL-2 laboratories. Removed; the directional-airflow finding survives without a number.',
  },
  {
    profile: 'LABORATORY', subtype: 'storage',
    removed: 'achOverrides.storage = 6 ACH, "NFPA 45"; finding text "minimum 6 ACH per NFPA 45"',
    reason: 'Could not be confirmed against NFPA 45 with high confidence; the finding now says to verify the design rate against NFPA 45 and the adopted mechanical code.',
  },
  {
    profile: 'SCHOOL_K12', subtype: 'lab',
    removed: 'finding text "Science labs require minimum 6 ACH with 100% exhaust", std "ASHRAE 62.1-2025; NFPA 45"',
    reason: 'ASHRAE 62.1 sets no air-change rate and the 6 ACH could not be confirmed against NFPA 45 with high confidence. The finding keeps the no-recirculation point qualitatively and cites NFPA 45 as the thing to verify against.',
  },
]
