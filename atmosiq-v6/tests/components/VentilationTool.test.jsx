// @vitest-environment jsdom
/**
 * VentilationTool — the assessor-facing calculator. Pins that the three
 * sections render, the requirement appears once occupants + area are
 * entered, the steady-state estimate appears from a CO₂ pair, the
 * comparison bands them, and the decay method is reachable.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import VentilationTool from '../../src/components/VentilationTool'

afterEach(() => cleanup())
beforeEach(() => { try { localStorage.clear() } catch { /* jsdom */ } })

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('VentilationTool', () => {
  it('renders the three sections and the method sources', () => {
    render(<VentilationTool />)
    expect(screen.getByText('Ventilation')).toBeTruthy()
    expect(screen.getByText(/Required — ASHRAE 62\.1/)).toBeTruthy()
    expect(screen.getByText(/Delivered — estimated from CO₂/)).toBeTruthy()
    expect(screen.getByText(/3 · Comparison/)).toBeTruthy()
    expect(screen.getByText(/direct airflow measurement/i)).toBeTruthy()
  })

  it('computes the 62.1 requirement from space use, occupants and area', () => {
    render(<VentilationTool />)
    type('Occupants', '10')
    type('Floor area', '1000')
    // office: 5 × 10 + 0.06 × 1000 = 110 cfm — shown as both Vbz and Voz
    // at Ez 1.0 — and 11 cfm/person
    expect(screen.getAllByText('110')).toHaveLength(2)
    expect(screen.getByText('11')).toBeTruthy()
  })

  it('estimates delivery from a CO₂ pair and compares it to the requirement', () => {
    render(<VentilationTool />)
    type('Occupants', '10')
    type('Floor area', '1000')
    type('Indoor CO2', '1120')
    type('Outdoor CO2', '420')
    // 0.0084e6 / 700 = 12 cfm/person → 12 / 11 = 109% → at or above
    expect(screen.getAllByText('12').length).toBeGreaterThan(0)
    expect(screen.getByText('At or above minimum')).toBeTruthy()
    expect(screen.getByText(/109% of the ASHRAE 62\.1 minimum/)).toBeTruthy()
  })

  it('refuses a too-small differential with the reason', () => {
    render(<VentilationTool />)
    type('Indoor CO2', '440')
    type('Outdoor CO2', '420')
    expect(screen.getByText(/below the 50 ppm floor/)).toBeTruthy()
  })

  it('switches to the decay method and reports air changes', () => {
    render(<VentilationTool />)
    fireEvent.click(screen.getByText('Decay (unoccupied)'))
    type('Start CO2', '1220')
    type('End CO2', String(420 + 800 * Math.exp(-1)))
    type('Elapsed minutes', '30')
    expect(screen.getByText('ACH')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })
})
