/**
 * No phrase template may assert an evidence basis the assessment might
 * not have.
 *
 * `pm_above_naaqs_documented` told the reader, unconditionally, that the
 * finding was "supported by continuous monitoring with outdoor baseline
 * comparison". A single walkthrough spot check produced that sentence,
 * and it reached the client report. The same entry's own metadata said
 * `definitiveConclusionRequires: ['screening_continuous']` — the engine
 * knew the claim needed logged data and the template asserted it anyway.
 *
 * It is the identical defect to `ventilation_co2_only` opening "CO₂
 * results were within the reference range" regardless of the reading: a
 * template stating as fact something only the data can settle. That one
 * was fixed; this scans for the rest of the class so the next one fails
 * the build instead of shipping.
 *
 * A template may DESCRIBE what confirmatory work is needed ("Confirmatory
 * bulk, tape-lift, or air sampling with laboratory analysis is
 * recommended") — that is a recommendation about the future, not a claim
 * about the evidence in hand.
 */
import { describe, it, expect } from 'vitest'

import * as CONTAMINANTS from '../../src/engine/report/phrases/contaminants'
import * as VENTILATION from '../../src/engine/report/phrases/ventilation'
import * as HVAC from '../../src/engine/report/phrases/hvac'
import * as ENVIRONMENT from '../../src/engine/report/phrases/environment'
import * as COMPLAINTS from '../../src/engine/report/phrases/complaints'

interface Entry {
  conditionType: string
  intentTemplate: string
  definitiveConclusionRequires?: string[]
  causationSupportRequires?: string[]
  regulatoryConclusionRequires?: string[]
}

function everyEntry(): Entry[] {
  const out: Entry[] = []
  for (const mod of [CONTAMINANTS, VENTILATION, HVAC, ENVIRONMENT, COMPLAINTS] as Array<Record<string, unknown>>) {
    for (const value of Object.values(mod)) {
      if (!value || typeof value !== 'object') continue
      for (const entry of Object.values(value as Record<string, unknown>)) {
        const e = entry as Entry
        if (e && typeof e === 'object' && e.conditionType && e.intentTemplate) out.push(e)
      }
    }
  }
  return out
}

const ENTRIES = everyEntry()

/**
 * Constructions that assert the evidence in hand. Each is anchored to a
 * claim about THIS finding — "supported by", "confirmed by" — so a
 * sentence recommending future confirmatory work does not trip them.
 */
const EVIDENCE_ASSERTIONS: ReadonlyArray<{ readonly pattern: RegExp; readonly why: string }> = [
  { pattern: /\b(?:is|was|are|were)\s+supported by\s+(?:continuous|logged|laboratory|lab\b)/i,
    why: 'asserts continuous or laboratory evidence as fact' },
  { pattern: /\b(?:is|was|are|were)\s+confirmed by\b/i, why: 'asserts confirmation the engine cannot guarantee' },
  { pattern: /\blaboratory (?:analysis|speciation) (?:confirms|confirmed|established|establishes)\b/i,
    why: 'asserts a laboratory result' },
  { pattern: /\bbased on (?:continuous|logged) (?:monitoring|measurement)/i,
    why: 'asserts continuous monitoring as the basis' },
  { pattern: /\bchain[- ]of[- ]custody (?:was|is) (?:maintained|documented)/i,
    why: 'asserts chain of custody' },
  { pattern: /\b(?:8|eight)[- ]hour (?:TWA|time[- ]weighted average) (?:was|is) (?:established|documented)/i,
    why: 'asserts a documented TWA' },
]

describe('no template asserts evidence the assessment might not have', () => {
  it('found the phrase library — a silent scan would pass vacuously', () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(29)
    for (const e of ENTRIES) expect(e.intentTemplate.length).toBeGreaterThan(20)
  })

  it('no intent template claims an evidence basis as fact', () => {
    const offenders = ENTRIES.flatMap((e) =>
      EVIDENCE_ASSERTIONS
        .filter(({ pattern }) => pattern.test(e.intentTemplate))
        .map(({ why }) => `${e.conditionType}: ${why}\n    "${e.intentTemplate.slice(0, 150)}"`))
    expect(offenders, 'a template states evidence the engine cannot guarantee the assessment has').toEqual([])
  })

  it('catches the sentence that was shipping', () => {
    // Guards the guard, with the literal text this test was written for.
    const shipped = 'PM2.5 mass concentration exceeded the EPA NAAQS 24-hour standard during the assessment period. '
      + 'This finding is supported by continuous monitoring with outdoor baseline comparison.'
    expect(EVIDENCE_ASSERTIONS.some(({ pattern }) => pattern.test(shipped))).toBe(true)
  })

  it('does not flag a recommendation for future confirmatory work', () => {
    // These all ship today and are correct: they say what SHOULD be done,
    // not what was done.
    for (const text of [
      'Confirmatory bulk, tape-lift, or air sampling with laboratory analysis is recommended.',
      'Confirmatory testing per ANSI/ISA 71.04-2013 is recommended.',
      'ISO 14644-1 cleanroom classification cannot be determined without particle count testing.',
      'Species and viability were not determined.',
    ]) {
      expect(
        EVIDENCE_ASSERTIONS.filter(({ pattern }) => pattern.test(text)),
        `false positive on a forward-looking recommendation: ${text}`,
      ).toEqual([])
    }
  })

  it('no template asserts a within-range verdict', () => {
    // The ventilation_co2_only defect, kept pinned here alongside its
    // siblings rather than only in the cross-layer suite.
    for (const e of ENTRIES) {
      expect(e.intentTemplate, `${e.conditionType} asserts a verdict the reading decides`)
        .not.toMatch(/\bwere within the (?:reference )?range\b/i)
    }
  })
})
