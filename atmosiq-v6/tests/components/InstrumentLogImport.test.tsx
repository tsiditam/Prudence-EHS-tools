// @vitest-environment jsdom
/**
 * InstrumentLogImport — Play 4a UI contract.
 *
 * The parser is exercised in tests/lib/instrument-log-parser.test.ts;
 * this file pins UI behavior: collapsed → expanded state, file
 * upload flow with parser invocation, preview table render, the
 * onApply callback's payload shape, error rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import InstrumentLogImport from '../../src/components/InstrumentLogImport'

beforeEach(() => {
  // Reset DOM
})

afterEach(() => {
  cleanup()
})

function makeCsvFile(text: string, name = 'log.csv') {
  // jsdom's File implementation supports text().
  return new File([text], name, { type: 'text/csv' })
}

describe('InstrumentLogImport', () => {
  it('renders the collapsed trigger button initially', () => {
    render(<InstrumentLogImport onApply={() => {}} />)
    expect(screen.getByText(/Import instrument log/i)).toBeTruthy()
    expect(screen.queryByTestId('instrument-log-import')).toBeNull()
  })

  it('expands when the trigger is clicked', () => {
    render(<InstrumentLogImport onApply={() => {}} />)
    fireEvent.click(screen.getByText(/Import instrument log/i))
    expect(screen.getByTestId('instrument-log-import')).toBeTruthy()
    expect(screen.getByText(/Choose CSV file/)).toBeTruthy()
  })

  it('parses an uploaded CSV and renders the preview table', async () => {
    render(<InstrumentLogImport onApply={() => {}} />)
    fireEvent.click(screen.getByText(/Import instrument log/i))

    const csv = [
      'TSI Q-Trak 7575',
      '',
      'Time,CO2,Temperature [°F],RH,CO',
      '10:00,800,72.5,45.0,1.0',
      '10:01,820,72.6,45.1,1.0',
      '10:02,840,72.6,45.0,1.1',
    ].join('\n')

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeCsvFile(csv, 'qtrak.csv')] })
    fireEvent.change(input)

    await waitFor(() => {
      expect(screen.queryByText(/sample rows parsed/)).toBeTruthy()
    })
    const panel = screen.getByTestId('instrument-log-import')
    expect(panel.textContent).toContain('TSI Q-Trak')
    expect(panel.textContent).toContain('3 sample rows parsed')
    expect(panel.textContent).toContain('CO₂')
    expect(panel.textContent).toContain('Temp')
    expect(panel.textContent).toContain('Apply mean values to sensor fields')
  })

  it('invokes onApply with the recommendedReadings + meta on click', async () => {
    const onApply = vi.fn()
    render(<InstrumentLogImport onApply={onApply} />)
    fireEvent.click(screen.getByText(/Import instrument log/i))

    const csv = 'Time,CO2,RH\n10:00,800,45\n10:01,820,46\n10:02,810,47'
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeCsvFile(csv, 'log.csv')] })
    fireEvent.change(input)

    await waitFor(() => expect(screen.queryByText(/Apply mean values/)).toBeTruthy())
    fireEvent.click(screen.getByText(/Apply mean values/))

    expect(onApply).toHaveBeenCalledOnce()
    const payload = onApply.mock.calls[0][0] as { readings: Record<string, number>; meta: Record<string, unknown> }
    expect(payload.readings.co2).toBe(810)
    expect(payload.readings.rh).toBeCloseTo(46, 0)
    expect(payload.meta.source).toBe('instrument_log')
    expect(payload.meta.filename).toBe('log.csv')
    expect(payload.meta.sampleCount).toBe(3)
    expect(payload.meta.importedAt).toBeTypeOf('string')
  })

  it('shows error copy when the parser surfaces a warning + no parameters', async () => {
    render(<InstrumentLogImport onApply={() => {}} />)
    fireEvent.click(screen.getByText(/Import instrument log/i))

    const csv = 'foo,bar\nbaz,qux'   // no recognizable parameter columns
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeCsvFile(csv, 'bad.csv')] })
    fireEvent.change(input)

    await waitFor(() => {
      const panel = screen.getByTestId('instrument-log-import')
      expect(panel.textContent).toMatch(/No recognizable parameter header row|No supported parameters/i)
    })
    expect(screen.queryByText(/Apply mean values/)).toBeNull()
  })

  it('renders a success banner after applying values', async () => {
    render(<InstrumentLogImport onApply={() => {}} />)
    fireEvent.click(screen.getByText(/Import instrument log/i))

    const csv = 'Time,CO2,RH\n10:00,800,45\n10:01,820,46'
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeCsvFile(csv, 'log.csv')] })
    fireEvent.change(input)

    await waitFor(() => expect(screen.queryByText(/Apply mean values/)).toBeTruthy())
    fireEvent.click(screen.getByText(/Apply mean values/))

    await waitFor(() => {
      const panel = screen.getByTestId('instrument-log-import')
      expect(panel.textContent).toMatch(/Applied .* aggregated values to the sensor fields/)
    })
  })

  it('shows the median / p95 / max columns so the assessor can spot mean-masked spikes', async () => {
    render(<InstrumentLogImport onApply={() => {}} />)
    fireEvent.click(screen.getByText(/Import instrument log/i))

    const csv = 'Time,CO2\n10:00,800\n10:01,820\n10:02,2000'
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeCsvFile(csv, 'log.csv')] })
    fireEvent.change(input)

    await waitFor(() => {
      const panel = screen.getByTestId('instrument-log-import')
      expect(panel.textContent).toContain('Median')
      expect(panel.textContent).toContain('p95')
      expect(panel.textContent).toContain('Max')
      // Mean (1207) and Max (2000) should both be visible — the
      // disparity is the assessor's signal that the mean is
      // masking a spike.
      expect(panel.textContent).toContain('2000')
    })
  })

  it('can collapse back to the trigger state via the × button', async () => {
    render(<InstrumentLogImport onApply={() => {}} />)
    fireEvent.click(screen.getByText(/Import instrument log/i))
    expect(screen.getByTestId('instrument-log-import')).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/Close importer/i))
    expect(screen.queryByTestId('instrument-log-import')).toBeNull()
    expect(screen.getByText(/Import instrument log/i)).toBeTruthy()
  })
})
