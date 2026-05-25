// @vitest-environment jsdom
/**
 * V3-surface Logger Studio primitives extracted into src/components/ui/.
 * Pins the two with real logic (SegmentedControl, Chip) and smoke-checks
 * the style wrappers so the extraction can't silently change their contract.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SegmentedControl from '../../src/components/ui/SegmentedControl'
import Chip from '../../src/components/ui/Chip'
import CollapsibleCard from '../../src/components/ui/CollapsibleCard'
import GhostButton from '../../src/components/ui/GhostButton'
import Select from '../../src/components/ui/Select'
import StatTile from '../../src/components/ui/StatTile'
import RoleBadge from '../../src/components/ui/RoleBadge'
import InlineError from '../../src/components/ui/InlineError'

afterEach(() => cleanup())

const OPTS = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gamma', badge: 3 }]

describe('SegmentedControl', () => {
  it('renders a tablist, marks the active tab, and reports selection', () => {
    const onChange = vi.fn()
    render(<SegmentedControl ariaLabel="View" value="b" onChange={onChange} options={OPTS} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    fireEvent.click(tabs[2])
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('renders a badge only when the option carries one', () => {
    render(<SegmentedControl ariaLabel="View" value="a" onChange={() => {}} options={OPTS} />)
    expect(screen.getByText('3')).toBeTruthy()
  })
})

describe('Chip', () => {
  it('renders a static <span> when there is no onClick', () => {
    const { container } = render(<Chip>Label</Chip>)
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('span')?.textContent).toBe('Label')
  })

  it('renders a toggle button with aria-pressed + ✓ when selected', () => {
    const onClick = vi.fn()
    render(<Chip selected onClick={onClick} checkmark>On</Chip>)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.textContent).toBe('✓ On')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalled()
  })

  it('omits the ✓ and reports unpressed when not selected', () => {
    render(<Chip selected={false} onClick={() => {}} checkmark>Off</Chip>)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(btn.textContent).toBe('Off')
  })

  it('is a plain action button (no aria-pressed) when selected is undefined', () => {
    render(<Chip onClick={() => {}}>+ Add</Chip>)
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBeNull()
  })
})

describe('CollapsibleCard', () => {
  it('hides its body until the header is toggled', () => {
    render(<CollapsibleCard title="Tools"><p>Body</p></CollapsibleCard>)
    expect(screen.queryByText('Body')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Tools/ }))
    expect(screen.getByText('Body')).toBeTruthy()
  })

  it('opens by default with defaultOpen', () => {
    render(<CollapsibleCard title="Tools" defaultOpen><p>Body</p></CollapsibleCard>)
    expect(screen.getByText('Body')).toBeTruthy()
  })
})

describe('style-wrapper primitives', () => {
  it('GhostButton fires onClick and honors disabled', () => {
    const onClick = vi.fn()
    const { rerender } = render(<GhostButton onClick={onClick}>Go</GhostButton>)
    fireEvent.click(screen.getByText('Go'))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<GhostButton onClick={onClick} disabled>Go</GhostButton>)
    fireEvent.click(screen.getByText('Go'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('Select renders its options and reports change', () => {
    const onChange = vi.fn()
    render(<Select value="x" onChange={onChange} aria-label="Pick"><option value="x">X</option><option value="y">Y</option></Select>)
    fireEvent.change(screen.getByLabelText('Pick'), { target: { value: 'y' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('RoleBadge, StatTile and InlineError render their content', () => {
    const { container } = render(<div><RoleBadge role="outdoor">Outdoor</RoleBadge><StatTile label="Readings" value="120" /><InlineError>Bad file</InlineError></div>)
    expect(container.textContent).toContain('Outdoor')
    expect(container.textContent).toContain('Readings')
    expect(container.textContent).toContain('120')
    expect(container.textContent).toContain('Bad file')
  })
})
