// @vitest-environment jsdom
/**
 * EvidenceMap — read-only Evidence Map tab (KG stage 3, §13).
 *
 * Pins the defensibility-critical rendering:
 *   • A scored finding renders with its supporting evidence.
 *   • A referenced standard framed is_health_limit=false shows the
 *     "screening reference — not a health limit" badge (CO2 / ASHRAE 62.1).
 *   • Every finding shows the IH Review Required flag.
 *   • A pre-engine draft (no zone scores) shows the empty state.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import EvidenceMap from '../../src/components/EvidenceMap'

afterEach(cleanup)

const scored = {
  zones: [{ id: 'z1', zn: 'Conference Room A' }],
  zoneScores: [{
    zoneName: 'Conference Room A',
    cats: [{ l: 'Ventilation', r: [
      { t: 'CO2 1,800 ppm — ventilation rate appears inadequate', std: 'ASHRAE 62.1-2025', sev: 'high' },
    ] }],
  }],
  causalChains: [{ zone: 'Conference Room A', type: 'Ventilation Deficiency', rootCause: 'Inadequate ventilation', evidence: [], confidence: 'Strong', std: 'ASHRAE 62.1-2025' }],
  recs: ['Verify outdoor air delivery and HVAC operation'],
}

describe('EvidenceMap', () => {
  it('renders a scored finding with its standard, framing badge, and IH review flag', () => {
    render(<EvidenceMap {...(scored as never)} />)
    expect(screen.getByText(/ventilation rate appears inadequate/)).toBeTruthy()
    expect(screen.getByText('ASHRAE 62.1-2025')).toBeTruthy()
    expect(screen.getByText(/not a health limit/i)).toBeTruthy()
    expect(screen.getByText('IH Review Required')).toBeTruthy()
  })

  it('shows the empty state on a pre-engine draft', () => {
    render(<EvidenceMap zones={[{ id: 'z1' }] as never} zoneScores={[] as never} causalChains={[] as never} recs={[] as never} />)
    expect(screen.getByText('No evidence map yet')).toBeTruthy()
  })
})
