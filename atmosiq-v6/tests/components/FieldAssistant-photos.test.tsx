// @vitest-environment jsdom
/**
 * FieldAssistant — L4 photo-attach UI surface.
 *
 * Pins:
 *   • Paperclip button is present and aria-labeled "Attach photo"
 *   • Clicking the paperclip triggers the hidden file input
 *   • Selecting a valid file renders an attached-photo chip
 *   • The chip's remove (×) button removes the photo
 *   • The chip shows the file name as the default label
 *
 * Uses the real useFieldAssistant hook (FileReader is provided by
 * jsdom). Auth supabase client is stubbed because the hook imports
 * it at module load.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}))

// Skip the first-run intro panel by pre-setting the localStorage flag.
beforeEach(() => {
  window.localStorage.setItem('jasper_intro_v1', new Date().toISOString())
})

afterEach(() => {
  cleanup()
})

import FieldAssistant from '../../src/components/FieldAssistant'

function fileFromString(name: string, type: string, content = 'tiny'): File {
  return new File([content], name, { type })
}

describe('FieldAssistant — L4 photo attach UI', () => {
  it('renders the paperclip attach button', () => {
    render(<FieldAssistant onClose={() => {}} context={{}} />)
    expect(screen.getByLabelText('Attach photo')).toBeTruthy()
  })

  it('renders the hidden file input with the expected accept types', () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const fileInput = container.querySelector('[data-testid="photo-file-input"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    expect(fileInput.accept).toBe('image/jpeg,image/png,image/webp')
    expect(fileInput.multiple).toBe(true)
  })

  it('shows a chip when a photo is attached', async () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const fileInput = container.querySelector('[data-testid="photo-file-input"]') as HTMLInputElement
    const file = fileFromString('return-grille.jpg', 'image/jpeg')
    // Simulate the file picker selection
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    await waitFor(() => {
      expect(screen.queryByTestId('attached-photos')).toBeTruthy()
    })
    expect(screen.getByText('return-grille.jpg')).toBeTruthy()
  })

  it('removes a photo when the chip × button is clicked', async () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const fileInput = container.querySelector('[data-testid="photo-file-input"]') as HTMLInputElement
    const file = fileFromString('coil.jpg', 'image/jpeg')
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    await waitFor(() => {
      expect(screen.queryByText('coil.jpg')).toBeTruthy()
    })
    const removeBtn = screen.getByLabelText('Remove coil.jpg')
    fireEvent.click(removeBtn)
    await waitFor(() => {
      expect(screen.queryByText('coil.jpg')).toBeNull()
      expect(screen.queryByTestId('attached-photos')).toBeNull()
    })
  })
})
