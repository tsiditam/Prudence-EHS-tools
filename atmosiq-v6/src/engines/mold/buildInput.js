/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold screening — intake → engine input mapper.
 *
 * Pure transform from the app-shaped captured state (the `mps_`/`mz_` fields
 * defined in moldQuestions.js, plus lab-ingested spore rows) into the
 * normalized `MoldAssessmentInput` the engine projects from. Keeping this
 * mapping in ONE pure function (rather than a bespoke literal at a call site)
 * mirrors the assessment-context connectivity discipline: intake schema and
 * engine input can never silently drift.
 */

import { moldMaterialKey } from '../../constants/moldQuestions.js'

const yes = (v) => v === true || v === 'Yes' || v === 'yes' || v === '1'
const num = (v) => (Number.isFinite(Number(v)) && String(v ?? '').trim() !== '' ? Number(v) : null)

/**
 * @param {{
 *   zones?: Array<Object>,
 *   presurvey?: Object,
 *   spores?: Array<Object>,
 *   hvacInvolved?: boolean
 * }} state
 * @returns {import('../../types/mold').MoldAssessmentInput}
 */
export function buildMoldInput(state = {}) {
  const zonesIn = Array.isArray(state.zones) ? state.zones : []
  const presurvey = state.presurvey || {}

  const zones = zonesIn.map((z, i) => ({ id: String(z?.id ?? `zone-${i + 1}`), label: z?.label || z?.name || `Zone ${i + 1}` }))

  const waterEvents = []
  const moisture = []
  const growth = []

  zonesIn.forEach((z, i) => {
    const zoneId = String(z?.id ?? `zone-${i + 1}`)

    const source = String(z?.mz_water_source || '').trim()
    if (source) {
      waterEvents.push({
        zoneId,
        source,
        date: z?.mz_water_date || null,
        prolonged: yes(z?.mz_water_prolonged),
      })
    }

    const material = z?.mz_moisture_material
    if (material) {
      moisture.push({
        zoneId,
        material: moldMaterialKey(material),
        value: num(z?.mz_moisture_value),
        location: z?.mz_moisture_location || '',
      })
    }

    const visibleGrowth = yes(z?.mz_visible_growth)
    const hiddenSuspected = yes(z?.mz_hidden_suspected)
    const mustyOdor = yes(z?.mz_musty_odor)
    if (visibleGrowth || hiddenSuspected || mustyOdor) {
      growth.push({
        zoneId,
        visibleGrowth,
        hiddenSuspected,
        mustyOdor,
        porousMaterial: yes(z?.mz_porous),
        areaSqFt: num(z?.mz_growth_area),
      })
    }
  })

  return {
    zones,
    waterEvents,
    moisture,
    growth,
    spores: Array.isArray(state.spores) ? state.spores : [],
    hvacInvolved: state.hvacInvolved === true || yes(presurvey.mps_hvac_involved),
  }
}
