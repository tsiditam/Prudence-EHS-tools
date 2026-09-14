/**
 * Deterministic presentation may not claim more than the detector established.
 *
 * A heading is short, so the tempting phrasing is the one that says what the
 * pattern MEANS — and meaning is the reading's job, one line further down.
 * Two labels went that way and shipped:
 *
 *   "Excursion in one zone only" claimed spatial localization the detector
 *   does not establish. It knows no matching event was found in the
 *   comparison zones THAT HAD COVERAGE, and the summary carries
 *   `zonesWithoutCoverage` precisely because the difference matters.
 *
 *   "Two parameters moved together" claimed a shared direction. The detector
 *   pairs events whose windows OVERLAP and never asks which way either went.
 *
 * Every string is pinned here so interpretive wording cannot creep back in.
 */
import { describe, it, expect } from 'vitest'
import { PATTERN_LABELS, patternTitle, patternEvidence, EVENT_LABELS } from '../../src/utils/forensicPresent.js'
import { CONTEXT_RULES, MIN_OVERLAP_SAMPLES } from '../../src/utils/forensicPatterns.js'

describe('the pattern labels state only what was detected', () => {
  it('pins every label exactly', () => {
    expect(PATTERN_LABELS).toEqual({
      recurring_cycle: 'Recurring daily cycle',
      coincidence: 'Coincident parameter events',
      occupancy_comparison: 'Occupied against unoccupied',
      no_matching_outdoor_event: 'Indoor excursion with no matching outdoor event',
      indoor_outdoor_comparison: 'Indoor against outdoor',
      no_matching_zone_event: 'Excursion with no matching zone event',
      event_proximity: 'Excursion near a logged activity',
    })
  })

  it('does not claim the excursion happened in one zone only', () => {
    // The detector compares against zones that COVERED the window and says how
    // many did not. A label that erases that contradicts the evidence line
    // printed directly beneath it.
    const label = PATTERN_LABELS.no_matching_zone_event
    expect(label).not.toMatch(/one zone only|single zone|localized|isolated|confined/i)
    expect(label).toContain('no matching zone event')
  })

  it('does not claim two parameters moved in the same direction', () => {
    const label = PATTERN_LABELS.coincidence
    expect(label).not.toMatch(/together|in step|track|same direction|correlat/i)
    expect(label).toContain('Coincident')
    // The direction that DOES exist is on the evidence line, per event.
    const line = patternEvidence({
      kind: 'coincidence', params: ['co2', 'pm'], datasetIds: ['primary'],
      summary: { kinds: ['step_up', 'step_down'], overlapSlackSec: 300 },
    }, { parameters: [] })
    expect(line[0]).toContain(EVENT_LABELS.step_up)
    expect(line[0]).toContain(EVENT_LABELS.step_down)
    expect(MIN_OVERLAP_SAMPLES).toBeGreaterThan(0)
  })

  it('carries no verdict, no causation and no localization in any label', () => {
    const all = Object.values(PATTERN_LABELS).join(' ')
    for (const word of [
      'only', 'caused', 'due to', 'because', 'proves', 'confirms', 'source',
      'unsafe', 'safe', 'exceeds', 'elevated', 'problem', 'together',
    ]) expect(all.toLowerCase(), word).not.toContain(word)
  })

  it('keeps a label for every kind the detector can emit', () => {
    Object.keys(CONTEXT_RULES).forEach((kind) => expect(PATTERN_LABELS, kind).toHaveProperty(kind))
    expect(Object.keys(PATTERN_LABELS).sort()).toEqual(Object.keys(CONTEXT_RULES).sort())
  })

  it('reads the corrected labels through the title', () => {
    expect(patternTitle({ kind: 'no_matching_zone_event', params: ['pm25'] })).toBe('Excursion with no matching zone event — PM2.5')
    expect(patternTitle({ kind: 'coincidence', params: ['co2', 'pm'] })).toMatch(/^Coincident parameter events — /)
  })
})
