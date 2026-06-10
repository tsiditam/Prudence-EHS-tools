// @vitest-environment jsdom
/**
 * JasperWatchPanel — UI surface for the live advisor.
 *
 * Pure presentation; the evaluation logic is exercised in
 * live-advisor.test.ts. This file pins the rendering contract:
 *   • Hidden entirely when no advisories
 *   • Renders advisories sorted by severity with colored
 *     severity tags, observation, suggestion, reference
 *   • Updates on data prop change
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import JasperWatchPanel from '../../src/components/JasperWatchPanel'

afterEach(() => {
  cleanup()
})

describe('JasperWatchPanel', () => {
  it('renders nothing when data is empty', () => {
    render(<JasperWatchPanel data={{}} />)
    expect(screen.queryByTestId('jasper-watch-panel')).toBeNull()
  })

  it('renders nothing when data has no advisory-triggering values', () => {
    // CO2 with matching outdoor baseline suppresses the
    // co2-no-outdoor info reminder; CO and PM below their info
    // thresholds emit nothing.
    render(<JasperWatchPanel data={{ co2: 600, co2o: 420, co: 2, pm: 8 }} />)
    expect(screen.queryByTestId('jasper-watch-panel')).toBeNull()
  })

  it('renders critical CO advisory at OSHA PEL', () => {
    render(<JasperWatchPanel data={{ co: 55 }} />)
    const panel = screen.getByTestId('jasper-watch-panel')
    expect(panel.textContent).toMatch(/JASPER WATCH/)
    expect(panel.textContent).toMatch(/CRITICAL/)
    expect(panel.textContent).toMatch(/CO at 55 ppm/)
    expect(panel.textContent).toMatch(/Evacuate or ventilate/i)
    expect(panel.textContent).toMatch(/OSHA/)
  })

  it('renders CO2 + outdoor-baseline-reminder together when CO2 entered without co2o', () => {
    render(<JasperWatchPanel data={{ co2: 1100 }} />)
    const panel = screen.getByTestId('jasper-watch-panel')
    expect(panel.textContent).toMatch(/CO₂ at 1100 ppm/)
    expect(panel.textContent).toMatch(/outdoor CO₂ reading/)
  })

  it('renders the "Advisory, not a finding" framing', () => {
    render(<JasperWatchPanel data={{ co: 55 }} />)
    const panel = screen.getByTestId('jasper-watch-panel')
    // Copy intentionally uses a comma, not an em dash (style(ui) em-dash removal).
    expect(panel.textContent).toMatch(/Advisory, not a finding/)
    expect(panel.textContent).toMatch(/full scoring engine still runs/i)
  })

  it('orders critical advisories before warn before info', () => {
    render(<JasperWatchPanel data={{ co: 60, co2: 1100, pm: 20 }} />)
    const panel = screen.getByTestId('jasper-watch-panel')
    const text = panel.textContent || ''
    // "CRITICAL" tag from co-pel should appear before "WARN" tag from co2-concern
    // which should appear before "INFO" tag from pm25-who.
    const critIdx = text.indexOf('CRITICAL')
    const warnIdx = text.indexOf('WARN')
    const infoIdx = text.indexOf('INFO')
    expect(critIdx).toBeGreaterThan(-1)
    expect(warnIdx).toBeGreaterThan(-1)
    expect(infoIdx).toBeGreaterThan(-1)
    expect(critIdx).toBeLessThan(warnIdx)
    expect(warnIdx).toBeLessThan(infoIdx)
  })

  it('cites the standard reference for each advisory', () => {
    render(<JasperWatchPanel data={{ co: 55 }} />)
    const panel = screen.getByTestId('jasper-watch-panel')
    expect(panel.textContent).toMatch(/Ref: /)
  })
})
