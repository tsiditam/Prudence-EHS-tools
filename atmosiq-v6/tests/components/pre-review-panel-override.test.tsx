// @vitest-environment jsdom
/**
 * PreReviewCheckPanel — IH override flow.
 *
 * Pins the contract the IH workflow depends on:
 *   • Submit button is disabled while a blocking issue is active
 *   • "Override blocker" appears only on blocking rows
 *   • Override requires a non-empty justification (forces
 *     deliberation, satisfies the audit-trail "why" field)
 *   • Saved override flips the row to a muted "Overridden" state
 *     and DECREMENTS the effective blocker count
 *   • Once every blocker is either resolved or overridden, the
 *     Submit button enables
 *   • Submit callback receives the override list with justification
 *     + timestamp so the parent can audit-log
 *   • Remove-override re-blocks the row + Submit gates again
 *   • Re-running the check clears prior overrides (force re-
 *     acknowledgement)
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

// Mock the validator so we control which issues the panel sees.
// The panel is the surface under test; the validator is covered
// separately in tests/lib/pre-review-validator.test.ts.
const ISSUES = {
  current: [] as Array<{ id: string; severity: string; category: string; title: string; detail: string; anchor: { type: string } }>,
}
vi.mock('../../src/utils/preReviewValidator', () => ({
  runPreReviewChecks: () => ISSUES.current,
  summarizeIssues: (issues: Array<{ severity: string }>) => {
    const blocking = issues.filter((i) => i.severity === 'blocking')
    const warning = issues.filter((i) => i.severity === 'warning')
    const suggestion = issues.filter((i) => i.severity === 'suggestion')
    return {
      blocking, warning, suggestion,
      blockingCount: blocking.length,
      warningCount: warning.length,
      suggestionCount: suggestion.length,
      totalCount: issues.length,
      hasBlockers: blocking.length > 0,
    }
  },
}))

import PreReviewCheckPanel from '../../src/components/PreReviewCheckPanel'

afterEach(() => {
  cleanup()
  ISSUES.current = []
})

function clickRun() {
  fireEvent.click(screen.getByRole('button', { name: /run check/i }))
}

beforeEach(() => {
  ISSUES.current = [
    { id: 'b1', severity: 'blocking', category: 'photo_ref_missing', title: 'Photo 7 referenced but missing', detail: 'detail-b1', anchor: { type: 'photo' } },
    { id: 'w1', severity: 'warning', category: 'duplicate_finding', title: 'Possible duplicate in Zone A', detail: 'detail-w1', anchor: { type: 'finding' } },
  ]
})

describe('<PreReviewCheckPanel> — override flow', () => {
  it('disables Submit while a blocker is active', () => {
    const onSubmit = vi.fn()
    render(<PreReviewCheckPanel ctx={{}} onSubmitToCih={onSubmit} />)
    clickRun()
    const submitBtn = screen.getByRole('button', { name: /submit for cih review|submit with overrides/i })
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(submitBtn)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows "Override blocker" only on the blocking row, not the warning row', () => {
    render(<PreReviewCheckPanel ctx={{}} onSubmitToCih={vi.fn()} />)
    clickRun()
    // Expand both rows to reveal action buttons.
    fireEvent.click(screen.getByText('Photo 7 referenced but missing'))
    fireEvent.click(screen.getByText('Possible duplicate in Zone A'))
    expect(screen.getByTestId('override-start-b1')).toBeTruthy()
    expect(screen.queryByTestId('override-start-w1')).toBeNull()
  })

  it('does NOT save override when the justification is empty (Save disabled)', () => {
    render(<PreReviewCheckPanel ctx={{}} onSubmitToCih={vi.fn()} />)
    clickRun()
    fireEvent.click(screen.getByText('Photo 7 referenced but missing'))
    fireEvent.click(screen.getByTestId('override-start-b1'))
    // Save button rendered but disabled while the draft is empty.
    const saveBtn = screen.getByTestId('override-save-b1') as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
  })

  it('saving an override removes the row\'s blocking effect and enables Submit', async () => {
    render(<PreReviewCheckPanel ctx={{}} onSubmitToCih={vi.fn()} />)
    clickRun()
    fireEvent.click(screen.getByText('Photo 7 referenced but missing'))
    fireEvent.click(screen.getByTestId('override-start-b1'))
    const textarea = screen.getByTestId('override-textarea-b1') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Photo lives in the client\'s SharePoint, not AtmosFlow.' } })
    fireEvent.click(screen.getByTestId('override-save-b1'))

    // Override pill appears on the row.
    expect(screen.getByTestId('override-pill-b1')).toBeTruthy()
    // Submit button now enabled — text changes to "Submit with overrides".
    const submitBtn = screen.getByRole('button', { name: /submit with overrides/i })
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('submit callback receives the override list with justification + timestamp', () => {
    const onSubmit = vi.fn()
    render(<PreReviewCheckPanel ctx={{}} onSubmitToCih={onSubmit} />)
    clickRun()
    fireEvent.click(screen.getByText('Photo 7 referenced but missing'))
    fireEvent.click(screen.getByTestId('override-start-b1'))
    fireEvent.change(screen.getByTestId('override-textarea-b1'), {
      target: { value: 'Photo lives in the client\'s SharePoint.' },
    })
    fireEvent.click(screen.getByTestId('override-save-b1'))
    fireEvent.click(screen.getByRole('button', { name: /submit with overrides/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const arg = onSubmit.mock.calls[0][0]
    expect(arg.issues).toHaveLength(2)
    expect(arg.overrides).toHaveLength(1)
    expect(arg.overrides[0]).toMatchObject({
      id: 'b1',
      justification: 'Photo lives in the client\'s SharePoint.',
    })
    expect(typeof arg.overrides[0].overriddenAt).toBe('string')
    expect(arg.overrides[0].issue.title).toBe('Photo 7 referenced but missing')
  })

  it('Remove override re-blocks the row + disables Submit again', () => {
    render(<PreReviewCheckPanel ctx={{}} onSubmitToCih={vi.fn()} />)
    clickRun()
    fireEvent.click(screen.getByText('Photo 7 referenced but missing'))
    fireEvent.click(screen.getByTestId('override-start-b1'))
    fireEvent.change(screen.getByTestId('override-textarea-b1'), { target: { value: 'X' } })
    fireEvent.click(screen.getByTestId('override-save-b1'))

    // Confirm Submit enabled.
    expect((screen.getByRole('button', { name: /submit with overrides/i }) as HTMLButtonElement).disabled).toBe(false)

    // Click "Remove override".
    fireEvent.click(screen.getByRole('button', { name: /remove override/i }))

    // Override pill gone; Submit disabled again.
    expect(screen.queryByTestId('override-pill-b1')).toBeNull()
    expect((screen.getByRole('button', { name: /submit for cih review|submit with overrides/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Re-run clears prior overrides so the IH re-acknowledges each', () => {
    render(<PreReviewCheckPanel ctx={{}} onSubmitToCih={vi.fn()} />)
    clickRun()
    // Override the blocker once.
    fireEvent.click(screen.getByText('Photo 7 referenced but missing'))
    fireEvent.click(screen.getByTestId('override-start-b1'))
    fireEvent.change(screen.getByTestId('override-textarea-b1'), { target: { value: 'OK now' } })
    fireEvent.click(screen.getByTestId('override-save-b1'))
    expect(screen.queryByTestId('override-pill-b1')).toBeTruthy()

    // Re-run.
    fireEvent.click(screen.getByRole('button', { name: /re-run check/i }))

    // Override gone; Submit gated again.
    expect(screen.queryByTestId('override-pill-b1')).toBeNull()
    expect((screen.getByRole('button', { name: /submit for cih review|submit with overrides/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('footer messaging reflects override count', () => {
    render(<PreReviewCheckPanel ctx={{}} onSubmitToCih={vi.fn()} />)
    clickRun()
    // Default footer mentions remaining blockers.
    expect(screen.getByText(/blocking issue.*remaining/i)).toBeTruthy()

    // Override the single blocker.
    fireEvent.click(screen.getByText('Photo 7 referenced but missing'))
    fireEvent.click(screen.getByTestId('override-start-b1'))
    fireEvent.change(screen.getByTestId('override-textarea-b1'), { target: { value: 'OK' } })
    fireEvent.click(screen.getByTestId('override-save-b1'))

    // Footer now mentions the override + audit trail.
    expect(screen.getByText(/1 blocker overridden/i)).toBeTruthy()
    expect(screen.getByText(/audit trail/i)).toBeTruthy()
  })

  it('all-clear state (no issues) still allows submit', () => {
    const onSubmit = vi.fn()
    ISSUES.current = []
    render(<PreReviewCheckPanel ctx={{}} onSubmitToCih={onSubmit} />)
    clickRun()
    fireEvent.click(screen.getByRole('button', { name: /submit for cih review/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ issues: [], overrides: [] })
  })
})
