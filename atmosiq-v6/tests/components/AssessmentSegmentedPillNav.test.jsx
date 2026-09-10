// @vitest-environment jsdom
/**
 * AssessmentSegmentedPillNav — the text-tab strip under the result hero,
 * Logger Studio, the project workspace and the mold view.
 *
 * Pins: the rule under the active tab is ONE element that moves between
 * tabs (positioned from CSS vars the strip publishes), not a border each
 * tab draws — that is what lets it glide. The first placement snaps; a
 * later change re-publishes the vars for the new tab.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import AssessmentSegmentedPillNav from '../../src/components/ui/AssessmentSegmentedPillNav'

const TABS = [{ id: 'findings', label: 'Findings' }, { id: 'plan', label: 'Plan' }, { id: 'report', label: 'Report', badge: 5 }]

// jsdom lays nothing out; give the tabs offsets so the placement is checkable.
function layOut(container) {
  const tabs = container.querySelectorAll('[role="tab"]')
  let x = 0
  for (const t of tabs) {
    const w = 60 + t.textContent.length * 4
    Object.defineProperty(t, 'offsetLeft', { value: x, configurable: true })
    Object.defineProperty(t, 'offsetWidth', { value: w, configurable: true })
    x += w + 22
  }
}

afterEach(cleanup)

describe('AssessmentSegmentedPillNav', () => {
  it('renders every tab, marks the active one, and fires onChange', () => {
    let picked = null
    render(<AssessmentSegmentedPillNav tabs={TABS} active="findings" onChange={(id) => { picked = id }} />)
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'Findings' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Plan' }).getAttribute('aria-selected')).toBe('false')
    fireEvent.click(screen.getByRole('tab', { name: 'Plan' }))
    expect(picked).toBe('plan')
  })

  it('draws the active rule as one gliding element, not a border per tab', () => {
    const { container } = render(<AssessmentSegmentedPillNav tabs={TABS} active="findings" onChange={() => {}} />)
    expect(container.querySelectorAll('.aspn-rule')).toHaveLength(1)
    for (const t of container.querySelectorAll('[role="tab"]')) {
      expect(t.style.borderBottom).toContain('transparent')
    }
  })

  it('publishes the active tab’s box as the rule’s position, and follows a change', () => {
    const { container, rerender } = render(<AssessmentSegmentedPillNav tabs={TABS} active="findings" onChange={() => {}} />)
    const strip = container.querySelector('[role="tablist"]')
    layOut(container)
    // Re-run the placement against the laid-out boxes.
    rerender(<AssessmentSegmentedPillNav tabs={TABS} active="plan" onChange={() => {}} />)
    const plan = screen.getByRole('tab', { name: 'Plan' })
    expect(strip.style.getPropertyValue('--aspn-x')).toBe(`${plan.offsetLeft}px`)
    expect(strip.style.getPropertyValue('--aspn-w')).toBe(`${plan.offsetWidth}px`)

    rerender(<AssessmentSegmentedPillNav tabs={TABS} active="report" onChange={() => {}} />)
    const report = screen.getByRole('tab', { name: 'Report' })
    expect(strip.style.getPropertyValue('--aspn-x')).toBe(`${report.offsetLeft}px`)
    expect(strip.style.getPropertyValue('--aspn-w')).toBe(`${report.offsetWidth}px`)
  })

  it('hides the rule when no tab is active', () => {
    const { container } = render(<AssessmentSegmentedPillNav tabs={TABS} active="nope" onChange={() => {}} />)
    expect(container.querySelector('.aspn-rule').style.opacity).toBe('0')
  })
})
