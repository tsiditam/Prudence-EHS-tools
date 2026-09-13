// @vitest-environment jsdom
/**
 * CaptureRecords — the walkthrough's structured record editors.
 *
 * Pins each editor's contract with the wizard: the value it hands back on
 * an add, an edit and a remove, keyed the way the report reads it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TimelineEditor, SourceDetailCards, ChecksPerformed, LoggerDeployment, MassBalancePrompt } from '../../src/components/walkthrough/CaptureRecords'

afterEach(cleanup)

describe('TimelineEditor', () => {
  it('adds an event, edits it, removes it', () => {
    const onChange = vi.fn()
    const { rerender } = render(<TimelineEditor value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByText('Add event'))
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ date: '', kind: '', description: '' })])
    const rows = onChange.mock.calls[0][0]
    rerender(<TimelineEditor value={rows} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-05-18' } })
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ date: '2026-05-18' })])
    fireEvent.click(screen.getByLabelText('Remove Event 1'))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
})

describe('SourceDetailCards', () => {
  it('shows one card per ticked source and keys the detail by the source', () => {
    const onChange = vi.fn()
    render(<SourceDetailCards value={{}} onChange={onChange} zone={{ src_internal: ['Space heaters', 'None identified'], src_adjacent: ['Restrooms'], src_internal_other: 'Aquarium pump' }} />)
    expect(screen.getByText('Space heaters')).toBeTruthy()
    expect(screen.getByText('Restrooms')).toBeTruthy()
    expect(screen.getByText('Aquarium pump')).toBeTruthy()
    expect(screen.queryByText('None identified')).toBeNull()
    fireEvent.change(screen.getAllByLabelText('What it is')[0], { target: { value: 'Two oil-filled radiators' } })
    expect(onChange).toHaveBeenCalledWith({ 'Space heaters': { what: 'Two oil-filled radiators' } })
  })
  it('says so when no source was ticked', () => {
    render(<SourceDetailCards value={{}} onChange={() => {}} zone={{}} />)
    expect(screen.getByText(/No sources were ticked/)).toBeTruthy()
  })
})

describe('ChecksPerformed', () => {
  it('records a result and clears it', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ChecksPerformed value={{}} onChange={onChange} />)
    fireEvent.change(screen.getAllByLabelText('Result')[0], { target: { value: 'Neutral / indeterminate' } })
    expect(onChange).toHaveBeenLastCalledWith({ door_smoke: { result: 'Neutral / indeterminate' } })
    rerender(<ChecksPerformed value={{ door_smoke: { result: 'Neutral / indeterminate' } }} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Remove Door smoke test'))
    expect(onChange).toHaveBeenLastCalledWith({})
  })
})

describe('LoggerDeployment', () => {
  it('opens on "a logger was placed", records the deployment, adds an event', () => {
    const onChange = vi.fn()
    const { rerender } = render(<LoggerDeployment value={undefined} onChange={onChange} />)
    fireEvent.click(screen.getByText('A logger was placed here'))
    expect(onChange).toHaveBeenLastCalledWith({ placed: true })
    rerender(<LoggerDeployment value={{ placed: true }} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Height (m)'), { target: { value: '1.1' } })
    expect(onChange).toHaveBeenLastCalledWith({ placed: true, height_m: '1.1' })
    fireEvent.click(screen.getByText('Add event'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ events: [expect.objectContaining({ at: '', kind: '' })] }))
  })
})

describe('MassBalancePrompt', () => {
  it('offers the estimate and records it as a string', () => {
    const onApply = vi.fn()
    render(<MassBalancePrompt estimate={{ cfmPerPerson: 40.8 }} onApply={onApply} />)
    expect(screen.getByText(/about 40.8 cfm\/person/)).toBeTruthy()
    fireEvent.click(screen.getByText('Record estimate'))
    expect(onApply).toHaveBeenCalledWith('40.8')
  })
  it('renders nothing without an estimate', () => {
    const { container } = render(<MassBalancePrompt estimate={{ error: 'too small' }} onApply={() => {}} />)
    expect(container.innerHTML).toBe('')
  })
})
