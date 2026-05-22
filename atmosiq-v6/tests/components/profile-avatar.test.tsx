// @vitest-environment jsdom
/**
 * Unit tests for the ProfileAvatar primitive.
 *
 *   - `getInitials` covers the boundary cases that matter for the
 *     mobile header avatar: credential suffixes ("J. Smith, CIH"),
 *     all-initial names ("J. R. Smith"), single-token names, email
 *     fallback, and empty input.
 *   - The component itself is rendered through React Testing Library
 *     so we can assert the fallback initials text, the photo render
 *     path when `profile.avatar_url` is present, and the editable
 *     camera badge.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

import ProfileAvatar, { getInitials } from '../../src/components/ProfileAvatar'

afterEach(() => cleanup())

describe('getInitials', () => {
  it('returns ? when neither name nor email is set', () => {
    expect(getInitials({})).toBe('?')
    expect(getInitials(null as unknown as { name?: string })).toBe('?')
    expect(getInitials(undefined as unknown as { name?: string })).toBe('?')
  })

  it('strips credential suffix after the first comma', () => {
    expect(getInitials({ name: 'Jane Smith, CIH, CSP' })).toBe('JS')
    expect(getInitials({ name: 'John Doe, BCSP #38426' })).toBe('JD')
  })

  it('picks first letter of first and last word', () => {
    expect(getInitials({ name: 'Tsidi Tamakloe' })).toBe('TT')
    expect(getInitials({ name: 'Mary Anne Johnson' })).toBe('MJ')
  })

  it('returns single letter for one-word names', () => {
    expect(getInitials({ name: 'Madonna' })).toBe('M')
  })

  it('drops single-letter initials with periods before picking', () => {
    // "J. Smith" — the J. token is dropped, so we take "S" not "JS".
    expect(getInitials({ name: 'J. Smith' })).toBe('S')
    // "J. R. Smith" — both initials dropped, take Smith's first letter.
    expect(getInitials({ name: 'J. R. Smith' })).toBe('S')
  })

  it('falls back to all-initial names by taking the first letter', () => {
    expect(getInitials({ name: 'J. R.' })).toBe('J')
  })

  it('falls back to email when name is empty', () => {
    expect(getInitials({ email: 'tsiditam@example.com' })).toBe('T')
  })

  it('returns the first letter when neither name parsing nor email helps', () => {
    expect(getInitials({ name: '123' })).toBe('1')
  })
})

describe('<ProfileAvatar>', () => {
  it('renders initials when no avatar_url is set', () => {
    render(<ProfileAvatar profile={{ name: 'Tsidi Tamakloe' }} size={40} />)
    expect(screen.getByText('TT')).toBeTruthy()
  })

  it('renders an <img> with the avatar_url when present', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const { container } = render(
      <ProfileAvatar profile={{ name: 'Tsidi Tamakloe', avatar_url: dataUrl }} size={40} />,
    )
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe(dataUrl)
  })

  it('calls onClick when interactive and the avatar is tapped', () => {
    const onClick = vi.fn()
    render(<ProfileAvatar profile={{ name: 'Jane Doe' }} size={32} onClick={onClick} />)
    const btn = screen.getByRole('button', { name: /jane doe|open account/i })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disables the avatar button when neither onClick nor editable is provided', () => {
    render(<ProfileAvatar profile={{ name: 'Read Only' }} size={32} />)
    const btn = screen.getByRole('button', { name: /read only|account/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('renders the camera badge file input only when editable is true', () => {
    const { rerender, container } = render(
      <ProfileAvatar profile={{ name: 'Jane' }} size={64} />,
    )
    expect(container.querySelector('[data-testid="profile-avatar-file-input"]')).toBeNull()

    rerender(<ProfileAvatar profile={{ name: 'Jane' }} size={64} editable onPickPhoto={() => {}} />)
    expect(container.querySelector('[data-testid="profile-avatar-file-input"]')).toBeTruthy()
  })

  it('exposes an aria-label that mentions the assessor name', () => {
    render(<ProfileAvatar profile={{ name: 'Jane Doe' }} size={32} onClick={() => {}} />)
    const btn = screen.getByRole('button', { name: /jane doe/i })
    expect(btn.getAttribute('aria-label')).toContain('Jane Doe')
  })
})
