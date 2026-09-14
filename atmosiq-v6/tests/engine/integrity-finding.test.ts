/**
 * The shared integrity finding contract.
 *
 * Three properties, each of which the rest of the layer rests on:
 *
 *   1. IDENTITY IS THE FINDING, NOT THE RUN. `generated_at` may exist and
 *      may never reach an id, a comparison or a test. A contract that
 *      failed this would make every downstream assertion a clock test.
 *   2. IDENTITY IS ORDER-INSENSITIVE. The same finding assembled from sets
 *      in a different order is the same finding.
 *   3. NOTHING IN PHASE 1 BLOCKS. `blocking` exists so the
 *      `preReviewValidator` ladder projects without loss, and no detector
 *      composed today may emit it — that word is what `validation.js`
 *      means by a finalization blocker.
 */
import { describe, it, expect } from 'vitest'
import {
  integrityFinding, integrityFindingId, integrityIdentity, fieldEvidenceId,
  severityFromGap, severityFromPreReview,
  INTEGRITY_SEVERITIES, INTEGRITY_ACTIONABILITY, INTEGRITY_ISSUE_TYPES,
  INTEGRITY_SOURCE_LAYERS, INTEGRITY_RESOLUTION, INTEGRITY_CONTRACT_VERSION,
  REVIEW_PROVENANCE_FIELDS,
} from '../../src/engines/integrity/finding.js'

const base = {
  detector: 'demo',
  issue_type: 'missing_context',
  severity: 'advisory',
  source_layer: 'field_integrity',
  actionability: 'on_site_now',
  zone_ids: ['z-1'],
  evidence_ids: ['fld-z-1-cx'],
  parameter_ids: [],
  title: 'A title',
  description: 'A description.',
  why_it_matters: 'Because it changes how the evidence reads.',
}

describe('identity excludes the run', () => {
  it('ignores generated_at entirely — id and equality alike', () => {
    const a: any = integrityFinding({ ...base, generated_at: '2026-09-14T08:00:00.000Z' })
    const b: any = integrityFinding({ ...base, generated_at: '2027-01-01T23:59:59.000Z' })
    expect(a.id).toBe(b.id)
    expect(integrityIdentity(a)).toBe(integrityIdentity(b))
    // It is still carried, because provenance is worth having.
    expect(a.provenance.generated_at).toBe('2026-09-14T08:00:00.000Z')
    expect(integrityFinding(base).provenance.generated_at).toBeNull()
  })

  it('is stable across runs and shaped like the forensic ids beside it', () => {
    expect(integrityFinding(base).id).toBe(integrityFinding(base).id)
    expect(integrityFinding(base).id).toMatch(/^intg-demo-[0-9a-f]{8}$/)
  })
})

describe('identity is the member sets, in any order', () => {
  it('does not depend on the order or duplication of any id list', () => {
    const a = integrityFinding({ ...base, zone_ids: ['z-2', 'z-1'], evidence_ids: ['b', 'a', 'a'] })
    const b = integrityFinding({ ...base, zone_ids: ['z-1', 'z-2'], evidence_ids: ['a', 'b'] })
    expect(a.id).toBe(b.id)
    expect(a.zone_ids).toEqual(['z-1', 'z-2'])
    expect(a.evidence_ids).toEqual(['a', 'b'])
  })

  it('separates detector, issue type, zone, parameter, evidence, subject and window', () => {
    const id = integrityFindingId('demo', { issue_type: 'missing_context', zone_ids: ['z-1'] })
    expect(integrityFindingId('demo', { issue_type: 'missing_context', zone_ids: ['z-1'] })).toBe(id)
    expect(integrityFindingId('other', { issue_type: 'missing_context', zone_ids: ['z-1'] })).not.toBe(id)
    expect(integrityFindingId('demo', { issue_type: 'contradiction', zone_ids: ['z-1'] })).not.toBe(id)
    expect(integrityFindingId('demo', { issue_type: 'missing_context', zone_ids: ['z-2'] })).not.toBe(id)
    expect(integrityFindingId('demo', { issue_type: 'missing_context', zone_ids: ['z-1'], parameter_ids: ['par-a'] })).not.toBe(id)
    expect(integrityFindingId('demo', { issue_type: 'missing_context', zone_ids: ['z-1'], evidence_ids: ['e'] })).not.toBe(id)
    expect(integrityFindingId('demo', { issue_type: 'missing_context', zone_ids: ['z-1'], subject: 'Afternoon' })).not.toBe(id)
    expect(integrityFindingId('demo', { issue_type: 'missing_context', zone_ids: ['z-1'], time_window: { start: 1, end: 2 } })).not.toBe(id)
  })

  it('lets a detector keep its id stable across supporting evidence', () => {
    // The reason the override exists: attaching a logger file later must not
    // mint a second id for a gap that has not changed.
    const identity = { issue_type: 'missing_context', zone_ids: ['z-1'], subject: 'Afternoon' }
    const bare = integrityFinding({ ...base, identity })
    const withEvidence = integrityFinding({
      ...base,
      identity,
      evidence_ids: ['fld-z-1-cx', 'pat-recurring_cycle-abc', 'occ-1234abcd'],
      parameter_ids: ['par-primary-co2'],
      time_window: { start: 1000, end: 2000, basis: 'forensic_occurrence' },
    })
    expect(withEvidence.id).toBe(bare.id)
    // The evidence is still carried; only identity ignores it.
    expect(withEvidence.evidence_ids).toContain('pat-recurring_cycle-abc')
    expect(withEvidence.time_window).toEqual({ start: 1000, end: 2000, basis: 'forensic_occurrence' })
  })
})

describe('the vocabularies', () => {
  it('projects both existing severity ladders without loss', () => {
    expect(severityFromGap('warn')).toBe('warning')
    expect(severityFromGap('info')).toBe('advisory')
    expect(severityFromPreReview('blocking')).toBe('blocking')
    expect(severityFromPreReview('warning')).toBe('warning')
    expect(severityFromPreReview('suggestion')).toBe('advisory')
    // Every projected value is in the ladder it projects into.
    for (const s of ['warn', 'info']) expect(INTEGRITY_SEVERITIES).toContain(severityFromGap(s))
    for (const s of ['blocking', 'warning', 'suggestion']) expect(INTEGRITY_SEVERITIES).toContain(severityFromPreReview(s))
  })

  it('is frozen, so a new value cannot be added without a test seeing it', () => {
    for (const v of [INTEGRITY_SEVERITIES, INTEGRITY_ACTIONABILITY, INTEGRITY_ISSUE_TYPES, INTEGRITY_SOURCE_LAYERS, INTEGRITY_RESOLUTION]) {
      expect(Object.isFrozen(v)).toBe(true)
    }
    expect(INTEGRITY_ACTIONABILITY).toContain('on_site_now')
    expect(INTEGRITY_RESOLUTION).toContain('open')
  })

  it('builds a frozen finding whose resolution is derived, never authored', () => {
    const f: any = integrityFinding({ ...base, resolution_status: 'documented_as_limitation' } as never)
    expect(f.resolution_status).toBe('open')
    expect(Object.isFrozen(f)).toBe(true)
    expect(f.provenance.contract_version).toBe(INTEGRITY_CONTRACT_VERSION)
    expect(f.provenance.detector).toBe('demo')
  })

  it('normalizes a missing or malformed window to null rather than a guess', () => {
    expect(integrityFinding(base).time_window).toBeNull()
    expect(integrityFinding({ ...base, time_window: { start: NaN, end: 5 } as never }).time_window).toBeNull()
    // An instant is a window whose ends agree, not a null.
    expect(integrityFinding({ ...base, time_window: { start: 7 } as never }).time_window)
      .toEqual({ start: 7, end: 7, basis: 'unspecified' })
  })

  it('names the two evidence namespaces apart', () => {
    expect(fieldEvidenceId('z-1', 'sy_time')).toBe('fld-z-1-sy_time')
    expect(fieldEvidenceId('z-1', 'sy_time').startsWith('fld-')).toBe(true)
  })
})

/**
 * Review provenance — recorded about a finding, never part of one.
 *
 * The property that makes the semantic layer portable. If which model
 * answered could reach an id, then switching providers would re-mint every
 * finding in the system and two providers noticing one contradiction would
 * show a reader two rows. Both failures are silent, and both are prevented
 * here rather than by remembering.
 */
describe('review provenance is recorded and never identifying', () => {
  const review = {
    package_version: 1,
    report_fingerprint: 'abc12345',
    prompt_version: 'semantic-2026-09',
    validator_version: 1,
    provider: 'anthropic',
    model: 'a-model-name',
  }

  it('is null for a deterministic finding, which is all of them today', () => {
    expect(integrityFinding(base).provenance.review).toBeNull()
    // An empty or malformed block is an absence, not a shell of nulls: a
    // consumer must not read `review.model` on a finding that met no model.
    for (const bad of [{}, null, 'x', 42, [], { provider: '' }]) {
      expect(integrityFinding({ ...base, review: bad } as never).provenance.review).toBeNull()
    }
  })

  it('records every declared field when a review pass produced the finding', () => {
    const f: any = integrityFinding({ ...base, review })
    expect(Object.keys(f.provenance.review).sort()).toEqual([...REVIEW_PROVENANCE_FIELDS].sort())
    expect(f.provenance.review).toEqual(review)
    expect(Object.isFrozen(f.provenance.review)).toBe(true)
    // A partial block keeps its shape, so a consumer never has to test for a key.
    const partial: any = integrityFinding({ ...base, review: { provider: 'openai' } })
    expect(Object.keys(partial.provenance.review).sort()).toEqual([...REVIEW_PROVENANCE_FIELDS].sort())
    expect(partial.provenance.review.provider).toBe('openai')
    expect(partial.provenance.review.model).toBeNull()
  })

  it('keeps one identity across providers, models and prompt revisions', () => {
    const a: any = integrityFinding({ ...base, review })
    const b: any = integrityFinding({
      ...base,
      review: { ...review, provider: 'openai', model: 'another-model', prompt_version: 'semantic-2027-01' },
    })
    // Two providers noticing one defect have noticed one defect.
    expect(a.id).toBe(b.id)
    expect(integrityIdentity(a)).toBe(integrityIdentity(b))
    // And a reviewed finding is the same finding as the unreviewed one.
    expect(a.id).toBe(integrityFinding(base).id)
    expect(integrityIdentity(a)).toBe(integrityIdentity(integrityFinding(base)))
    // The record survives, which is the point of carrying it at all.
    expect(a.provenance.review.provider).toBe('anthropic')
    expect(b.provenance.review.provider).toBe('openai')
  })

  it('declares its fields frozen, so a new one cannot arrive unnoticed', () => {
    expect(Object.isFrozen(REVIEW_PROVENANCE_FIELDS)).toBe(true)
    expect(REVIEW_PROVENANCE_FIELDS).toEqual([
      'package_version', 'report_fingerprint', 'prompt_version',
      'validator_version', 'provider', 'model',
    ])
  })

  it('moves the contract version, because the shape changed', () => {
    expect(INTEGRITY_CONTRACT_VERSION).toBe(3)
    expect(integrityFinding(base).provenance.contract_version).toBe(3)
  })
})
