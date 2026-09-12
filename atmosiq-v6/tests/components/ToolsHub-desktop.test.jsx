// @vitest-environment jsdom
/**
 * ToolsHub — the desktop toolkit dashboard.
 *
 * Pins: with `desktop` the seven tools render as grouped cards (Analysis /
 * Field & documentation / System) with a sentence each and an Open action
 * that fires onOpen with the tool id; without it the phone list renders
 * with the same seven ids.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ToolsHub, { TOOLS } from '../../src/components/ToolsHub'

afterEach(cleanup)

describe('ToolsHub desktop', () => {
  it('groups the tools into cards and opens one', () => {
    const onOpen = vi.fn()
    render(<ToolsHub onOpen={onOpen} desktop />)
    expect(screen.getByText('Specialized workflows for investigation and analysis.')).toBeTruthy()
    expect(screen.getByText('Analysis')).toBeTruthy()
    expect(screen.getByText('Field & documentation')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
    const cards = screen.getAllByRole('button')
    expect(cards).toHaveLength(TOOLS.length)
    fireEvent.click(screen.getByRole('button', { name: /Ventilation/ }))
    expect(onOpen).toHaveBeenCalledWith('ventilation')
    // Every card carries its criterion / output line.
    expect(screen.getByText('ASHRAE 62.1 · CO₂ mass balance')).toBeTruthy()
  })

  it('keeps the phone list without the desktop flag', () => {
    render(<ToolsHub onOpen={() => {}} />)
    expect(screen.queryByText('Specialized workflows for investigation and analysis.')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(TOOLS.length)
    expect(screen.getByText('Chart logger exports, attach the averages.')).toBeTruthy()
  })
})
