/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Field-assistant agent — grounding corpus.
 *
 * Pre-stringifies the standards manifest and the FAQ into stable text
 * blocks that get sent in the Anthropic prompt-cache (ephemeral) so
 * Claude can ground its answers in the same source of truth the
 * deterministic engine uses.
 *
 * Stringification happens at import time (once per cold start), not per
 * request — keeps the handler hot path cheap.
 */

import { STANDARDS_MANIFEST, STD } from './standards.js'
import { FAQ_SECTIONS } from './faq.js'

function formatStandardsManifest() {
  const lines = ['AtmosFlow Standards Manifest', '']
  for (const [name, version] of Object.entries(STANDARDS_MANIFEST)) {
    if (name === 'engineVersion' || name === 'manifestUpdated') continue
    lines.push(`• ${name}: ${version}`)
  }
  lines.push('', `Engine version: ${STANDARDS_MANIFEST.engineVersion}`)
  lines.push(`Manifest updated: ${STANDARDS_MANIFEST.manifestUpdated}`)
  return lines.join('\n')
}

function formatThresholds() {
  const lines = ['AtmosFlow Reference Thresholds (engine uses these)', '']

  // Thermal comfort (ASHRAE 55)
  if (STD.t) {
    lines.push('Thermal comfort — ' + STD.t.ref + ':')
    if (STD.t.temp) {
      const s = STD.t.temp.summer
      const w = STD.t.temp.winter
      // Operative temperature, and the assumptions are part of the figure —
      // Jasper must not be able to quote the band without them.
      if (s) lines.push(`  Summer °F: ${s.min}–${s.max} acceptable (operative temp, ~0.5 clo, 1.0–1.3 met)`)
      if (w) lines.push(`  Winter °F: ${w.min}–${w.max} acceptable (operative temp, ~1.0 clo, 1.0–1.3 met)`)
      lines.push('  AtmosFlow measures air temperature only — one of the six variables ASHRAE 55 needs. Outside the band is an indicator, not a determination.')
    }
    lines.push('')
  }
  // Its own heading, deliberately. Nested under "Thermal comfort — ASHRAE 55"
  // this line read as an ASHRAE 55 figure, which is how Jasper came to cite
  // it that way. It is moisture control and has a different source.
  if (STD.t && STD.t.rh) {
    lines.push('Relative humidity — ' + STD.t.rh.ref + ':')
    lines.push(`  ${STD.t.rh.min}–${STD.t.rh.max}% practice range. Above 60% condensation and microbial amplification risk rise; below 30% dryness and irritation complaints increase.`)
    lines.push('  NOT an ASHRAE 55 figure. ASHRAE 55 sets only an upper humidity limit and dropped its lower limit in 55-2013.')
    lines.push('')
  }

  // Ventilation (ASHRAE 62.1) — outdoor-air RATES only. The CO₂ figures
  // that used to sit under this heading are NOT ASHRAE 62.1 numbers:
  // current 62.1 sets no indoor CO₂ value, the Δ700 differential comes from
  // an informative appendix of earlier editions (since removed), and the
  // 1,000 / 1,500 ppm indicators are NIOSH's. Nested under "ASHRAE 62.1"
  // they inherited its citation, which is how Jasper came to quote them
  // that way (AUDIT-2026-09 M3). Each now sits under its own heading.
  if (STD.v) {
    lines.push('Ventilation — ' + STD.v.ref + ' (outdoor-air rates; 62.1 sets no indoor CO₂ limit):')
    if (STD.v.oa) {
      lines.push('  Outdoor air per person (pp, cfm/person) and per area (ps, cfm/ft²):')
      for (const [space, vals] of Object.entries(STD.v.oa)) {
        lines.push(`    ${space}: pp=${vals.pp}, ps=${vals.ps}`)
      }
    }
    lines.push('')
  }

  // CO₂ indicators — their own heading and their own attributions.
  if (STD.v && STD.v.co2) {
    lines.push('CO₂ indicators (ventilation indicator, not a contaminant limit; no current ASHRAE standard sets an indoor CO₂ limit):')
    lines.push(`  Indoor-outdoor differential ${STD.v.co2.diff} ppm above outdoor (base ~${STD.v.co2.base}) indicates under-ventilation — from an informative appendix of earlier ASHRAE 62.1 editions, since removed; see ASHRAE Position Document on Indoor Carbon Dioxide (2022).`)
    lines.push(`  Absolute indicators ${STD.v.co2.con} ppm (concern) and ${STD.v.co2.act} ppm (action) — NIOSH indoor-ventilation indicator; Persily, ASHRAE Journal 63(2):74–75 (2021).`)
    lines.push('')
  }

  // Contaminants
  if (STD.c) {
    lines.push('Contaminant exposure limits:')
    if (STD.c.co) lines.push(`  CO ppm: OSHA ${STD.c.co.osha}, NIOSH ${STD.c.co.niosh}`)
    if (STD.c.hcho) lines.push(`  HCHO ppm: OSHA ${STD.c.hcho.osha}, NIOSH ${STD.c.hcho.niosh}, action ${STD.c.hcho.al}`)
    if (STD.c.pm25) lines.push(`  PM₂.₅ µg/m³ (24h): EPA NAAQS ${STD.c.pm25.epa}, WHO ${STD.c.pm25.who}`)
    // TVOC is deliberately absent (2026-08). This block tells Jasper what
    // limits it may cite; TVOC has none, and listing Mølhave's tiers here is
    // exactly how the assistant came to quote them as though they were one.
    lines.push('  TVOC: no exposure limit exists — a non-specific sum, not compared against anything. Do not cite a TVOC threshold.')
    lines.push('')
  }

  return lines.join('\n')
}

function formatFaq() {
  const lines = ['AtmosFlow FAQ — verified against the engine and published standards.', '']
  for (const section of FAQ_SECTIONS) {
    lines.push(`## ${section.title}`)
    lines.push('')
    for (const item of section.items) {
      lines.push(`Q: ${item.q}`)
      lines.push(`A: ${item.a}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

export const STANDARDS_FOR_AGENT = `${formatStandardsManifest()}\n\n${formatThresholds()}`
export const FAQ_FOR_AGENT = formatFaq()
