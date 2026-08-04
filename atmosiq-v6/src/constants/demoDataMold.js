/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold module — demo assessment.
 *
 * A realistic SCREENING scenario in the app-shaped state that
 * `buildMoldInput` consumes (mirrors demoData.js / demoDataFM.js). Every
 * screening path is exercised so the demo doubles as a living fixture:
 *   • Break Room — Category 1 supply-line leak, visible growth on drywall,
 *     elevated wood moisture, indoor > outdoor amplification indicator.
 *   • Storage Room — Category 3 sewage backup, hidden growth suspected,
 *     musty odor + elevated drywall moisture.
 *   • Lobby — clean; paired spore screening consistent with normal ecology.
 *
 * Screening only — indicators, never a health or contamination verdict.
 */

export const DEMO_MOLD = {
  presurvey: {
    mps_trigger: 'Water intrusion event',
    mps_water_event: 'Yes',
    mps_hvac_involved: 'Yes',
    mps_prior_remediation: 'No',
  },
  zones: [
    {
      id: 'z-breakroom',
      label: 'Break Room',
      mz_water_source: 'Supply-line leak under sink',
      mz_water_date: '2026-07-18',
      mz_water_prolonged: 'No',
      mz_visible_growth: 'Yes',
      mz_growth_area: 6,
      mz_porous: 'Yes',
      mz_musty_odor: 'Yes',
      mz_hidden_suspected: 'No',
      mz_moisture_material: 'Wood / wood-based',
      mz_moisture_value: 22,
      mz_moisture_location: 'Cabinet base, under sink',
    },
    {
      id: 'z-storage',
      label: 'Storage Room',
      mz_water_source: 'Sewage backup from floor drain',
      mz_water_date: '2026-07-15',
      mz_water_prolonged: 'Yes',
      mz_visible_growth: 'No',
      mz_hidden_suspected: 'Yes',
      mz_musty_odor: 'Yes',
      mz_moisture_material: 'Gypsum board / drywall',
      mz_moisture_value: 1,
      mz_moisture_location: 'S wall base behind shelving',
    },
    {
      id: 'z-lobby',
      label: 'Lobby',
      mz_visible_growth: 'No',
      mz_musty_odor: 'No',
    },
  ],
  // Lab-ingested spore-trap rows (structures/m³) paired indoor/outdoor.
  spores: [
    { zoneId: 'z-breakroom', location: 'indoor', genus: 'Aspergillus/Penicillium', countPerM3: 3200 },
    { zoneId: 'z-breakroom', location: 'outdoor', genus: 'Aspergillus/Penicillium', countPerM3: 400 },
    { zoneId: 'z-breakroom', location: 'indoor', genus: 'Cladosporium', countPerM3: 500 },
    { zoneId: 'z-breakroom', location: 'outdoor', genus: 'Cladosporium', countPerM3: 1200 },
    { zoneId: 'z-lobby', location: 'indoor', genus: 'Cladosporium', countPerM3: 300 },
    { zoneId: 'z-lobby', location: 'outdoor', genus: 'Cladosporium', countPerM3: 450 },
  ],
}

export default DEMO_MOLD
