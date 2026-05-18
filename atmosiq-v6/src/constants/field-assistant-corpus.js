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

import { STANDARDS_MANIFEST, STD } from './standards'
import { FAQ_SECTIONS } from './faq'

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
      if (s) lines.push(`  Summer °F: acceptable ${s.min}–${s.max}, optimal ${s.oMin}–${s.oMax}`)
      if (w) lines.push(`  Winter °F: acceptable ${w.min}–${w.max}, optimal ${w.oMin}–${w.oMax}`)
    }
    if (STD.t.rh) lines.push(`  Relative humidity %: ${STD.t.rh.min}–${STD.t.rh.max}`)
    lines.push('')
  }

  // Ventilation (ASHRAE 62.1)
  if (STD.v) {
    lines.push('Ventilation — ' + STD.v.ref + ':')
    if (STD.v.co2) {
      lines.push(`  CO₂ ppm: outdoor base ~${STD.v.co2.base}, indoor-outdoor differential ${STD.v.co2.diff} indicates under-ventilation`)
      lines.push(`  CO₂ ppm: concern threshold ${STD.v.co2.con}, action threshold ${STD.v.co2.act}`)
    }
    if (STD.v.oa) {
      lines.push('  Outdoor air per person (pp, cfm/person) and per area (ps, cfm/ft²):')
      for (const [space, vals] of Object.entries(STD.v.oa)) {
        lines.push(`    ${space}: pp=${vals.pp}, ps=${vals.ps}`)
      }
    }
    lines.push('')
  }

  // Contaminants
  if (STD.c) {
    lines.push('Contaminant exposure limits:')
    if (STD.c.co) lines.push(`  CO ppm: OSHA ${STD.c.co.osha}, NIOSH ${STD.c.co.niosh}`)
    if (STD.c.hcho) lines.push(`  HCHO ppm: OSHA ${STD.c.hcho.osha}, NIOSH ${STD.c.hcho.niosh}, action ${STD.c.hcho.al}`)
    if (STD.c.pm25) lines.push(`  PM₂.₅ µg/m³ (24h): EPA NAAQS ${STD.c.pm25.epa}, WHO ${STD.c.pm25.who}`)
    if (STD.c.tvoc) lines.push(`  TVOC ppb (Mølhave 1991 advisory): concern ${STD.c.tvoc.con}, action ${STD.c.tvoc.act}`)
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
