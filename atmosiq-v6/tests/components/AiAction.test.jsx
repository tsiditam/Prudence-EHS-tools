// @vitest-environment jsdom
/**
 * AiAction — a contextual AtmosFlow AI action, in place.
 *
 * Pins: a button named for assistive tech as "<label> with AtmosFlow AI",
 * the plain verb as its visible text, the sparkle mark, and the click.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import AiAction from '../../src/components/ui/AiAction'

afterEach(cleanup)

describe('AiAction', () => {
  it('renders the verb with the AI mark and fires on click', () => {
    const onClick = vi.fn()
    const { container } = render(<AiAction label="Refine" onClick={onClick} />)
    const btn = screen.getByRole('button', { name: 'Refine with AtmosFlow AI' })
    expect(btn.textContent).toBe('Refine')
    expect(container.querySelector('svg')).toBeTruthy()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire while disabled', () => {
    const onClick = vi.fn()
    render(<AiAction label="Explain this pattern" onClick={onClick} disabled />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})
