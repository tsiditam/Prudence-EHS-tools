// @vitest-environment jsdom
/**
 * MoldScreeningView — read-only mold screening surface (mirrors the IAQ result
 * tabs). Pins that it renders the real engine output over the demo fixture, keeps
 * the screening-only disclaimer in view across tabs, exposes the same segmented
 * tab UI the assessment result screen uses, flags every finding for professional
 * review, and never renders health-verdict language.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MoldScreeningView from '../../src/components/MoldScreeningView'
import { assessMold } from '../../src/engines/mold/index.js'
import { buildMoldInput } from '../../src/engines/mold/buildInput.js'
import { DEMO_MOLD } from '../../src/constants/demoDataMold.js'

afterEach(cleanup)

const input = buildMoldInput(DEMO_MOLD)
const result = assessMold(input)
const BANNED = /\b(safe|unsafe|toxic|hazardous|dangerous|compliant|non-compliant)\b/i

describe('MoldScreeningView', () => {
  it('mirrors the IAQ result tabs and carries the basis in Review (no banner)', () => {
    render(<MoldScreeningView result={result} zones={input.zones} />)
    for (const name of ['Findings', 'Conditions', 'Spores', 'Review']) {
      expect(screen.getByRole('tab', { name })).toBeTruthy()
    }
    // No persistent "Screening only" banner on the default view (IAQ parity).
    expect(screen.queryByText('Screening only')).toBeNull()
    // The basis + limitation live in the Review tab, like the IAQ report.
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }))
    expect(screen.getByText('Basis')).toBeTruthy()
    expect(screen.getByText(/qualified professional/i)).toBeTruthy()
  })

  it('renders findings with categorical severity + a professional-review flag, no health verdict', () => {
    const { container } = render(<MoldScreeningView result={result} zones={input.zones} />)
    expect(screen.getAllByText('Professional review recommended').length).toBeGreaterThan(0)
    expect(container.textContent).toMatch(/indicator|Observation/i)
    expect(container.textContent).not.toMatch(BANNED)
  })

  it('switches to the Conditions tab (per-zone S520)', () => {
    render(<MoldScreeningView result={result} zones={input.zones} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Conditions' }))
    expect(screen.getByText('Break Room')).toBeTruthy()
    expect(screen.getAllByText(/Condition 3/).length).toBeGreaterThan(0)
  })

  it('surfaces the no-health-limit note on the Spores tab', () => {
    render(<MoldScreeningView result={result} zones={input.zones} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Spores' }))
    expect(screen.getAllByText(/no health-based numeric exposure limit/i).length).toBeGreaterThan(0)
  })

  it('renders an empty state when there is no result', () => {
    render(<MoldScreeningView result={null} />)
    expect(screen.getByText(/No mold assessment result/i)).toBeTruthy()
  })
})
