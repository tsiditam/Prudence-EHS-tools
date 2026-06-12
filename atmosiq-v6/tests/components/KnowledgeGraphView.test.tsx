// @vitest-environment jsdom
/**
 * KnowledgeGraphView — node-link graph of the derived projection (§14).
 * Pins that it renders an SVG with typed nodes (finding, measurement,
 * observation, standard) and degrades to an empty state pre-engine.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import KnowledgeGraphView from '../../src/components/KnowledgeGraphView'

afterEach(cleanup)

const scored = {
  zones: [{ id: 'z1', zn: 'Conference Room A', co2: '1800', od: 'Closed / minimum', sy: ['Headache'] }],
  zoneScores: [{ zoneName: 'Conference Room A', cats: [{ l: 'Ventilation', r: [
    { t: 'CO₂ 1,800 ppm — ventilation rate appears inadequate', std: 'ASHRAE 62.1-2025', sev: 'high' },
  ] }] }],
  causalChains: [{ zone: 'Conference Room A', type: 'Ventilation Deficiency', evidence: [], confidence: 'Strong', std: 'ASHRAE 62.1-2025' }],
  recs: ['Verify outdoor-air delivery'],
}

describe('KnowledgeGraphView', () => {
  it('renders an SVG graph with typed nodes', () => {
    const { container } = render(<KnowledgeGraphView {...(scored as never)} />)
    expect(container.querySelector('svg')).toBeTruthy()
    // Node type labels rendered as <text>; at least these appear.
    expect(screen.getAllByText('Finding').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Measurement').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Standard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Occupant report').length).toBeGreaterThan(0)
  })

  it('shows the empty state on a pre-engine draft', () => {
    render(<KnowledgeGraphView zones={[{ id: 'z1' }] as never} zoneScores={[] as never} causalChains={[] as never} recs={[] as never} />)
    expect(screen.getByText(/No graph yet/)).toBeTruthy()
  })
})
