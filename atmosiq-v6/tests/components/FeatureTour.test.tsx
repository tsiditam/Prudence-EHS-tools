// @vitest-environment jsdom
/**
 * FeatureTour — replayable in-app feature walkthrough.
 *
 * Pins the research-paced UX contract:
 *   • Opens on step 1 with the welcome copy and a "Step 1 of N" counter.
 *   • Next advances; Back appears from step 2 and steps backward.
 *   • Skip (on any non-final step) and Escape both close via onClose.
 *   • The final step shows "Done" (no Skip); Done closes.
 *   • Progress reflects the current step.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FeatureTour, { FEATURE_TOUR_STEPS } from '../../src/components/FeatureTour'

afterEach(cleanup)

const N = FEATURE_TOUR_STEPS.length

describe('FeatureTour', () => {
  it('opens on the first step with a step counter', () => {
    render(<FeatureTour onClose={() => {}} />)
    expect(screen.getByText('Welcome to AtmosFlow')).toBeTruthy()
    expect(screen.getByText(`Step 1 of ${N}`)).toBeTruthy()
    // No Back on the first step.
    expect(screen.queryByTestId('feature-tour-back')).toBeNull()
  })

  it('advances with Next and steps back with Back', () => {
    render(<FeatureTour onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('feature-tour-next'))
    expect(screen.getByText(`Step 2 of ${N}`)).toBeTruthy()
    expect(screen.getByText(FEATURE_TOUR_STEPS[1].title)).toBeTruthy()
    fireEvent.click(screen.getByTestId('feature-tour-back'))
    expect(screen.getByText(`Step 1 of ${N}`)).toBeTruthy()
  })

  it('Skip closes the tour', () => {
    const onClose = vi.fn()
    render(<FeatureTour onClose={onClose} />)
    fireEvent.click(screen.getByTestId('feature-tour-skip'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape closes the tour', () => {
    const onClose = vi.fn()
    render(<FeatureTour onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reaches a final step that shows Done (no Skip) and Done closes', () => {
    const onClose = vi.fn()
    render(<FeatureTour onClose={onClose} startIndex={N - 1} />)
    expect(screen.getByText(`Step ${N} of ${N}`)).toBeTruthy()
    expect(screen.queryByTestId('feature-tour-skip')).toBeNull()
    const done = screen.getByTestId('feature-tour-next')
    expect(done.textContent).toBe('Done')
    fireEvent.click(done)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('walks all the way through to Done', () => {
    const onClose = vi.fn()
    render(<FeatureTour onClose={onClose} />)
    for (let i = 0; i < N - 1; i++) fireEvent.click(screen.getByTestId('feature-tour-next'))
    expect(screen.getByText(`Step ${N} of ${N}`)).toBeTruthy()
    fireEvent.click(screen.getByTestId('feature-tour-next')) // Done
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
