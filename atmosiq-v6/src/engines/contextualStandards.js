/**
 * AtmosFlow — Contextual Standards References
 *
 * Methodology-currency layer that surfaces bibliographic standards
 * references NOT codified in the scoring engine. These are
 * "consider-also" references a qualified industrial hygienist may
 * consult during review of the AtmosFlow screening assessment.
 *
 * Why a separate layer. CLAUDE.md's "engine is sacred" rule prevents
 * us from changing scoring thresholds (e.g., STD.c.pm25.epa stays
 * at 35 µg/m³, the 24-hr NAAQS, even though the annual NAAQS was
 * revised to 9 µg/m³ in May 2024). The new annual standard is
 * methodologically real, but slotting it into the engine without
 * the full reconciliation work (different averaging window, different
 * downstream propagation) would silently change scoring outcomes.
 * Instead, this layer makes the new value visible to the reviewing
 * IH without altering the deterministic screening output.
 *
 * Each entry is a verified bibliographic reference + a rationale
 * paragraph that names what's in / what's not in AtmosFlow's
 * deterministic scoring path. Tsidi (BCSP #38426) signed off on
 * the wording before merge.
 *
 * Engine-sacred audit: this file lives in src/engines/ (plural,
 * orchestration layer), reads nothing from src/engine/ (TypeScript
 * engine subtree), modifies no scoring thresholds. Pure data.
 */

/**
 * The full list of methodology-currency references. Each entry has:
 *
 *   id            — stable key (also used as the standardsManifest key
 *                   when present)
 *   citation      — formal cite string the report renders verbatim
 *   summary       — one-line description for the section heading row
 *   rationale     — paragraph explaining what's in / not in AtmosFlow's
 *                   scoring path, in screening-only language
 *
 * Citations verified against primary sources May 2026:
 *   - ASHRAE 241: ANSI/ASHRAE Standard 241-2023, "Control of
 *     Infectious Aerosols", published July 2023, ASHRAE.
 *   - EPA PM2.5 annual NAAQS revision: 89 FR 16202, March 6 2024;
 *     effective May 6 2024; primary annual standard lowered from
 *     12 to 9 µg/m³. 24-hr standard unchanged at 35 µg/m³.
 *   - ACGIH TLVs: ACGIH, "2025 TLVs and BEIs", Cincinnati OH 2025.
 */
export const CONTEXTUAL_STANDARDS = Object.freeze([
  {
    id: 'ashrae-241-2023',
    citation: 'ANSI/ASHRAE Standard 241-2023, Control of Infectious Aerosols.',
    summary: 'Infectious-aerosol control via ventilation.',
    rationale:
      'ASHRAE 241-2023 establishes Equivalent Clean Airflow per occupant (ECAi) targets for infection-risk control through ventilation, filtration, and air cleaning. AtmosFlow scores ventilation against ASHRAE 62.1-2025 outdoor-air rates (occupant comfort + acceptable IAQ baseline); ASHRAE 241-2023 is not currently integrated into the deterministic scoring path. A qualified industrial hygienist may consider ASHRAE 241 ECAi targets when occupancy density, vulnerable-population context, or active infection-control program (e.g., healthcare, schools) warrants.',
  },
  {
    id: 'epa-pm25-annual-naaqs-2024',
    citation: 'U.S. EPA, Reconsideration of the National Ambient Air Quality Standards for Particulate Matter, 89 Fed. Reg. 16202 (March 6, 2024); effective May 6, 2024.',
    summary: 'Annual PM2.5 NAAQS lowered to 9 µg/m³.',
    rationale:
      'Effective May 6, 2024, the U.S. EPA lowered the primary annual PM2.5 National Ambient Air Quality Standard from 12 µg/m³ to 9 µg/m³. The 24-hour standard remains at 35 µg/m³. AtmosFlow scoring uses the 24-hour standard (35 µg/m³) for spot-reading screening (consistent with the assessment-window methodology); the revised annual standard applies to long-term exposure averaging and is referenced here for IH consideration during compliance review.',
  },
  {
    id: 'acgih-tlv-2025',
    citation: 'American Conference of Governmental Industrial Hygienists, 2025 TLVs and BEIs, ACGIH, Cincinnati, OH (2025).',
    summary: 'Threshold Limit Values + Biological Exposure Indices.',
    rationale:
      'AtmosFlow scoring uses OSHA Permissible Exposure Limits (29 CFR 1910.1000) and NIOSH Recommended Exposure Limits (NIOSH Pocket Guide) as primary thresholds. ACGIH Threshold Limit Values are consensus occupational exposure values updated annually; they are typically more health-protective than OSHA PELs and may be referenced by the reviewing industrial hygienist for context, particularly where OSHA PELs are decades-old (e.g., many chemicals never updated since 1971).',
  },
])

/**
 * Returns the contextual standards list, optionally filtered by
 * caller-provided context flags. Today the filter is a no-op
 * passthrough — every entry renders. The function exists with
 * a `ctx` parameter so a future caller can add conditional
 * inclusion (e.g., omit ASHRAE 241 if the assessment is for a
 * single-tenant dwelling with no infection-control context) without
 * changing the rendered-report contract.
 *
 * @param {object} [ctx]  optional filter context (currently unused;
 *                        reserved for future conditional rendering)
 * @returns {ReadonlyArray<{ id, citation, summary, rationale }>}
 */
export function getContextualStandards(ctx) {
  // eslint-disable-next-line no-unused-vars
  void ctx
  return CONTEXTUAL_STANDARDS
}
