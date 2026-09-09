/**
 * resolveDraftResumeView — which walkthrough screen a resumed draft opens
 * on. Pins the three-phase resume target (quickstart / equipment / zone);
 * see the source for the equipment-phase bug this closes.
 */
import { describe, it, expect } from 'vitest'
import { resolveDraftResumeView } from '../../src/utils/resumePhase'

describe('resolveDraftResumeView', () => {
  it('sends a brand-new draft to quickstart', () => {
    expect(resolveDraftResumeView({})).toBe('quickstart')
    expect(resolveDraftResumeView(null)).toBe('quickstart')
  })

  it('sends a draft with no facility name to quickstart, even with zones present', () => {
    expect(resolveDraftResumeView({ bldg: {}, zones: [{ zn: 'Should not matter' }] })).toBe('quickstart')
  })

  it('sends a draft that finished quickstart but has not started zone naming to equipment', () => {
    expect(resolveDraftResumeView({ bldg: { fn: 'One Liberty Plaza' }, zones: [{}] })).toBe('equipment')
  })

  it('treats an empty zones array the same as "no zone named yet" → equipment', () => {
    expect(resolveDraftResumeView({ bldg: { fn: 'One Liberty Plaza' }, zones: [] })).toBe('equipment')
    expect(resolveDraftResumeView({ bldg: { fn: 'One Liberty Plaza' } })).toBe('equipment')
  })

  it('sends a draft with the first zone already named to zone', () => {
    expect(resolveDraftResumeView({ bldg: { fn: 'One Liberty Plaza' }, zones: [{ zn: '3rd Floor Conf Room B' }] })).toBe('zone')
  })

  it('honours the legacy `building` key some stored drafts carry instead of `bldg`', () => {
    expect(resolveDraftResumeView({ building: { fn: 'Legacy Draft' }, zones: [{}] })).toBe('equipment')
    expect(resolveDraftResumeView({ building: { fn: 'Legacy Draft' }, zones: [{ zn: 'Room 1' }] })).toBe('zone')
    expect(resolveDraftResumeView({ zones: [{ zn: 'Room 1' }] })).toBe('quickstart')
  })
})
