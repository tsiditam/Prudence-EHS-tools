// @vitest-environment jsdom
/**
 * JasperFeedbackRow — pins the contract:
 *   1. Renders thumbs-up + thumbs-down buttons.
 *   2. Tap thumbs-up → submitFeedback called with (dbId, 'up').
 *   3. Tap thumbs-down → submitFeedback called with (dbId, 'down')
 *      AND the reason input expands.
 *   4. Tap Skip in the reason input → input closes; no second
 *      submitFeedback call.
 *   5. Type a reason + Submit → submitFeedback called with
 *      (dbId, 'down', reason).
 *   6. When rating='up' on mount, the thumbs-up button reads as
 *      pressed (aria-pressed=true) and the reason input is closed.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import JasperFeedbackRow from '../../src/components/ui/JasperFeedbackRow'

afterEach(() => cleanup())

describe('JasperFeedbackRow', () => {
  it('renders both thumbs buttons', () => {
    render(<JasperFeedbackRow dbId="m-1" rating={null} submitFeedback={() => {}} />)
    expect(screen.getByLabelText('Helpful')).toBeTruthy()
    expect(screen.getByLabelText('Not helpful')).toBeTruthy()
  })

  it('thumbs-up fires submitFeedback with rating=up and no reason input', () => {
    const submitFeedback = vi.fn()
    render(<JasperFeedbackRow dbId="m-1" rating={null} submitFeedback={submitFeedback} />)
    fireEvent.click(screen.getByLabelText('Helpful'))
    expect(submitFeedback).toHaveBeenCalledTimes(1)
    expect(submitFeedback).toHaveBeenCalledWith('m-1', 'up')
    expect(screen.queryByTestId('jasper-feedback-reason')).toBeNull()
  })

  it('thumbs-down fires submitFeedback with rating=down AND expands the reason input', () => {
    const submitFeedback = vi.fn()
    render(<JasperFeedbackRow dbId="m-1" rating={null} submitFeedback={submitFeedback} />)
    fireEvent.click(screen.getByLabelText('Not helpful'))
    expect(submitFeedback).toHaveBeenCalledTimes(1)
    expect(submitFeedback).toHaveBeenCalledWith('m-1', 'down')
    expect(screen.queryByTestId('jasper-feedback-reason')).toBeTruthy()
  })

  it('Skip closes the reason input without firing a second submitFeedback', () => {
    const submitFeedback = vi.fn()
    render(<JasperFeedbackRow dbId="m-1" rating={null} submitFeedback={submitFeedback} />)
    fireEvent.click(screen.getByLabelText('Not helpful'))
    expect(submitFeedback).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Skip'))
    expect(submitFeedback).toHaveBeenCalledTimes(1)        // no extra call
    expect(screen.queryByTestId('jasper-feedback-reason')).toBeNull()
  })

  it('typing a reason + Submit fires submitFeedback with the reason', () => {
    const submitFeedback = vi.fn()
    render(<JasperFeedbackRow dbId="m-1" rating={null} submitFeedback={submitFeedback} />)
    fireEvent.click(screen.getByLabelText('Not helpful'))
    const input = screen.getByTestId('jasper-feedback-reason-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'cited a wrong standard' } })
    fireEvent.click(screen.getByText('Submit'))
    // Two calls: the initial 'down' (no reason) when thumbs-down was
    // tapped, then the 'down' + reason on Submit.
    expect(submitFeedback).toHaveBeenCalledTimes(2)
    expect(submitFeedback.mock.calls[1]).toEqual(['m-1', 'down', 'cited a wrong standard'])
  })

  it('pre-existing rating=up renders the up button as pressed', () => {
    render(<JasperFeedbackRow dbId="m-1" rating="up" submitFeedback={() => {}} />)
    expect(screen.getByLabelText('Helpful').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Not helpful').getAttribute('aria-pressed')).toBe('false')
  })
})
