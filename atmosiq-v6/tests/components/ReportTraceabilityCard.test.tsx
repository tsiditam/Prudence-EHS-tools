// @vitest-environment jsdom
/**
 * ReportTraceabilityCard — on-screen render of the §17 traceability matrix.
 * Pins that the web view carries the same framed standard + IH-review note
 * as the DOCX, and degrades to an empty state on a pre-engine draft.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ReportTraceabilityCard from '../../src/components/dev/ReportTraceabilityCard'

afterEach(cleanup)

const scored = {
  zones: [{ id: 'z1', zn: 'Conference Room A', co2: '1800', od: 'Closed / minimum', sy: ['Headache'] }],
  zoneScores: [{ zoneName: 'Conference Room A', cats: [{ l: 'Ventilation', r: [
    { t: 'CO₂ 1,800 ppm — ventilation rate appears inadequate', std: 'ASHRAE 62.1-2025', sev: 'high' },
  ] }] }],
  causalChains: [],
  recs: [],
}

describe('ReportTraceabilityCard', () => {
  it('renders the finding, its evidence, the framed standard, and the IH note', () => {
    render(<ReportTraceabilityCard {...(scored as never)} />)
    expect(screen.getByText(/ventilation rate appears inadequate/)).toBeTruthy()
    expect(screen.getByText(/CO₂ 1800 ppm/)).toBeTruthy()
    expect(screen.getByText(/not a health limit/)).toBeTruthy()
    expect(screen.getByText(/requires industrial-hygienist review/)).toBeTruthy()
  })

  it('shows the empty state on a pre-engine draft', () => {
    render(<ReportTraceabilityCard zones={[{ id: 'z1' }] as never} zoneScores={[] as never} causalChains={[] as never} recs={[] as never} />)
    expect(screen.getByText(/No traceable findings yet/)).toBeTruthy()
  })
})
