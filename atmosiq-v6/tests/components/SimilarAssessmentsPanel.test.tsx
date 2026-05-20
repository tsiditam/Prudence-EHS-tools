// @vitest-environment jsdom
/**
 * SimilarAssessmentsPanel — UI contract.
 *
 * Three render states pinned:
 *   1. Hidden when pastCount < 3 (not enough history yet — surfacing
 *      "we don't have enough data" creates noise)
 *   2. "No close comparables" copy when pastCount ≥ 3 but matches []
 *   3. Full pattern summary + match cards when matches present
 *
 * The hook is mocked at the module boundary so this test never
 * touches localStorage / Storage.listAssessments.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const useSimilarAssessments = vi.fn()
vi.mock('../../src/hooks/useSimilarAssessments', () => ({
  useSimilarAssessments: () => useSimilarAssessments(),
}))

import SimilarAssessmentsPanel from '../../src/components/SimilarAssessmentsPanel'

beforeEach(() => {
  useSimilarAssessments.mockReset()
})

afterEach(() => {
  cleanup()
})

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    error: null,
    patterns: { matchCount: 0, averageScore: null, commonImmediateActions: [], moldRate: null, facilityTypeLabel: null },
    matches: [],
    currentFeatures: { facilityType: null, yearBuilt: null, hvacType: null, triggerReason: null, waterHistory: null },
    pastCount: 0,
    ...overrides,
  }
}

describe('SimilarAssessmentsPanel', () => {
  it('renders nothing while loading', () => {
    useSimilarAssessments.mockReturnValue(baseState({ loading: true }))
    render(<SimilarAssessmentsPanel currentAssessment={{}} />)
    expect(screen.queryByTestId('similar-assessments-panel')).toBeNull()
  })

  it('renders nothing on hook error (silent degradation)', () => {
    useSimilarAssessments.mockReturnValue(baseState({ error: 'load_failed' }))
    render(<SimilarAssessmentsPanel currentAssessment={{}} />)
    expect(screen.queryByTestId('similar-assessments-panel')).toBeNull()
  })

  it('stays hidden when the assessor has fewer than 3 past assessments', () => {
    useSimilarAssessments.mockReturnValue(baseState({ pastCount: 2 }))
    render(<SimilarAssessmentsPanel currentAssessment={{}} />)
    expect(screen.queryByTestId('similar-assessments-panel')).toBeNull()
  })

  it('renders the "no close comparables" copy when history ≥ 3 but matches is empty', () => {
    useSimilarAssessments.mockReturnValue(baseState({
      pastCount: 8,
      currentFeatures: { facilityType: 'Commercial Office', yearBuilt: 2005, hvacType: 'Central AHU — VAV', triggerReason: 'Occupant complaint(s)', waterHistory: null },
    }))
    render(<SimilarAssessmentsPanel currentAssessment={{}} />)
    const panel = screen.getByTestId('similar-assessments-panel')
    expect(panel.textContent).toMatch(/No close comparables/i)
    expect(panel.textContent).toMatch(/Commercial Office/)
  })

  it('renders pattern summary + matches when present', () => {
    useSimilarAssessments.mockReturnValue(baseState({
      pastCount: 12,
      patterns: {
        matchCount: 3,
        averageScore: 68,
        commonImmediateActions: [
          { action: 'Inspect supply diffuser drip pan', count: 3 },
          { action: 'Replace MERV 8 filter with MERV 13', count: 2 },
        ],
        moldRate: 33,
        facilityTypeLabel: 'Commercial Office',
      },
      matches: [
        { id: 'B-1', score: 0.95, summary: { facilityName: 'Liberty Plaza', score: 72, composedAt: '2026-04-15', immediateCount: 2, moldDetected: false } },
        { id: 'B-2', score: 0.78, summary: { facilityName: 'Capitol Building', score: 65, composedAt: '2026-03-01', immediateCount: 1, moldDetected: true } },
        { id: 'B-3', score: 0.55, summary: { facilityName: 'East Wing', score: 70, composedAt: '2026-02-10', immediateCount: 0, moldDetected: false } },
      ],
      currentFeatures: { facilityType: 'Commercial Office' },
    }))
    render(<SimilarAssessmentsPanel currentAssessment={{}} />)
    const panel = screen.getByTestId('similar-assessments-panel')
    expect(panel.textContent).toMatch(/3 similar past assessments/)
    expect(panel.textContent).toMatch(/Commercial Office/)
    expect(panel.textContent).toMatch(/68\/100/)
    expect(panel.textContent).toMatch(/Mold rate/i)
    expect(panel.textContent).toMatch(/33%/)
    expect(panel.textContent).toMatch(/Inspect supply diffuser drip pan/)
    expect(panel.textContent).toMatch(/Replace MERV 8 filter with MERV 13/)
    expect(panel.textContent).toMatch(/Liberty Plaza/)
    expect(panel.textContent).toMatch(/Capitol Building/)
    expect(panel.textContent).toMatch(/95% match/)
  })

  it('omits the mold-rate chip when the rate is 0 (avoids "Mold rate: 0%" noise)', () => {
    useSimilarAssessments.mockReturnValue(baseState({
      pastCount: 5,
      patterns: {
        matchCount: 2,
        averageScore: 85,
        commonImmediateActions: [],
        moldRate: 0,
        facilityTypeLabel: 'Healthcare',
      },
      matches: [
        { id: 'X', score: 0.9, summary: { facilityName: 'Clinic A', score: 85, composedAt: '2026-01-01', immediateCount: 0, moldDetected: false } },
        { id: 'Y', score: 0.85, summary: { facilityName: 'Clinic B', score: 85, composedAt: '2026-01-15', immediateCount: 0, moldDetected: false } },
      ],
    }))
    render(<SimilarAssessmentsPanel currentAssessment={{}} />)
    const panel = screen.getByTestId('similar-assessments-panel')
    expect(panel.textContent).not.toMatch(/Mold rate/i)
  })

  it('match cards are clickable when onOpenPastAssessment is provided', () => {
    const onOpen = vi.fn()
    useSimilarAssessments.mockReturnValue(baseState({
      pastCount: 5,
      patterns: { matchCount: 1, averageScore: 70, commonImmediateActions: [], moldRate: 0, facilityTypeLabel: null },
      matches: [{ id: 'CLICKABLE-1', score: 0.8, summary: { facilityName: 'Click Me', score: 70, composedAt: '2026-01-01', immediateCount: 1, moldDetected: false } }],
    }))
    render(<SimilarAssessmentsPanel currentAssessment={{}} onOpenPastAssessment={onOpen} />)
    const card = screen.getByText('Click Me').closest('button')
    expect(card).toBeTruthy()
    fireEvent.click(card!)
    expect(onOpen).toHaveBeenCalledWith('CLICKABLE-1')
  })

  it('renders match cards as non-clickable divs when no onOpenPastAssessment is provided', () => {
    useSimilarAssessments.mockReturnValue(baseState({
      pastCount: 5,
      patterns: { matchCount: 1, averageScore: 70, commonImmediateActions: [], moldRate: 0, facilityTypeLabel: null },
      matches: [{ id: 'X', score: 0.8, summary: { facilityName: 'No Click', score: 70, composedAt: '2026-01-01', immediateCount: 0, moldDetected: false } }],
    }))
    render(<SimilarAssessmentsPanel currentAssessment={{}} />)
    expect(screen.getByText('No Click').closest('button')).toBeNull()
  })
})
