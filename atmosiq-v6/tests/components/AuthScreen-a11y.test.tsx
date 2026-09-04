// @vitest-environment jsdom
/**
 * AuthScreen accessibility contract (audit 2026-09 §6 Accessibility).
 *
 *   • every button / role=button is keyboard-reachable (in the tab order,
 *     not disabled, not aria-hidden)
 *   • every input has an accessible name (a <label htmlFor> pairing or an
 *     aria-label) — the audit counted 1 htmlFor for 30 labels
 *   • the logo image carries alt text
 *   • no element opts out of focus styling with an inline outline:none
 *     (keyboard focus is drawn by the global :focus-visible rule)
 *
 * Run across all three modes (login / register / forgot) so the register
 * form's confirm-password and TOS controls are covered too.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('../../src/utils/cloudStorage', () => ({
  default: { signIn: vi.fn(), signUp: vi.fn() },
}))
vi.mock('../../src/utils/supabaseClient', () => ({ supabase: null, trackEvent: vi.fn() }))

import AuthScreen from '../../src/components/AuthScreen'

afterEach(() => cleanup())

function accessibleName(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label')
  if (aria && aria.trim()) return aria.trim()
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const txt = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim()
    if (txt) return txt
  }
  const id = el.getAttribute('id')
  if (id) {
    const lbl = document.querySelector(`label[for="${id}"]`)
    if (lbl && lbl.textContent?.trim()) return lbl.textContent.trim()
  }
  const wrapping = el.closest('label')
  if (wrapping && wrapping.textContent?.trim()) return wrapping.textContent.trim()
  return (el.textContent || '').trim()
}

function keyboardReachable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  const ti = el.getAttribute('tabindex')
  if (ti !== null && Number(ti) < 0) return false
  return true
}

const MODES: Array<[string, () => void]> = [
  ['login', () => {}],
  ['register', () => fireEvent.click(screen.getByRole('button', { name: /create an account/i }))],
  ['forgot', () => fireEvent.click(screen.getByRole('button', { name: /forgot user id\/password/i }))],
]

describe('AuthScreen accessibility', () => {
  for (const [mode, enter] of MODES) {
    it(`${mode}: every button is keyboard-reachable and named`, () => {
      render(<AuthScreen onAuth={vi.fn()} />)
      enter()
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'))
      expect(buttons.length).toBeGreaterThan(0)
      for (const b of buttons) {
        expect(keyboardReachable(b), `unreachable button: ${b.outerHTML.slice(0, 120)}`).toBe(true)
        expect(accessibleName(b), `unnamed button: ${b.outerHTML.slice(0, 120)}`).not.toBe('')
      }
    })

    it(`${mode}: every input has an accessible name`, () => {
      render(<AuthScreen onAuth={vi.fn()} />)
      enter()
      const inputs = Array.from(document.querySelectorAll<HTMLElement>('input, select, textarea'))
      expect(inputs.length).toBeGreaterThan(0)
      for (const i of inputs) {
        expect(accessibleName(i), `unnamed input: ${i.outerHTML.slice(0, 120)}`).not.toBe('')
      }
    })

    it(`${mode}: nothing hides keyboard focus with an inline outline:none`, () => {
      render(<AuthScreen onAuth={vi.fn()} />)
      enter()
      const offenders = Array.from(document.querySelectorAll<HTMLElement>('[style]'))
        .filter(el => /outline:\s*none/i.test(el.getAttribute('style') || ''))
      expect(offenders.map(o => o.outerHTML.slice(0, 80))).toEqual([])
    })
  }

  it('labels are real <label htmlFor> pairings, not styled divs', () => {
    render(<AuthScreen onAuth={vi.fn()} />)
    const email = screen.getByLabelText(/email address/i) as HTMLInputElement
    expect(email.tagName).toBe('INPUT')
    expect(email.type).toBe('email')
    const pw = screen.getByLabelText(/^password$/i) as HTMLInputElement
    expect(pw.type).toBe('password')
  })

  it('the brand image has alt text', () => {
    render(<AuthScreen onAuth={vi.fn()} />)
    for (const img of Array.from(document.querySelectorAll('img'))) {
      expect(img.hasAttribute('alt')).toBe(true)
    }
  })
})
