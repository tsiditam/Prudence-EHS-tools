// @vitest-environment jsdom
/**
 * Reading — a number the way an instrument shows it.
 *
 * Pins: the eyebrow label, the value in the numeric scale with the unit
 * beside it, the criterion state beneath in its tone, and an em dash in
 * the tertiary ink for a missing value with no unit or state.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Reading from '../../src/components/ui/Reading'

afterEach(cleanup)

describe('Reading', () => {
  it('renders label, value, unit and the criterion state in its tone', () => {
    render(<Reading label="CO₂" value={742} unit="ppm" state={{ label: 'Within criteria', tone: '#22C55E' }} />)
    expect(screen.getByText('CO₂')).toBeTruthy()
    const value = screen.getByText('742')
    expect(value.style.fontFeatureSettings).toContain('tnum')
    expect(screen.getByText('ppm')).toBeTruthy()
    const state = screen.getByText('Within criteria')
    expect(state.style.color).toBe('rgb(34, 197, 94)')
  })

  it('renders an em dash for a missing value and hides the unit', () => {
    render(<Reading label="PM₂.₅" value={null} unit="µg/m³" />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.queryByText('µg/m³')).toBeNull()
  })
})
