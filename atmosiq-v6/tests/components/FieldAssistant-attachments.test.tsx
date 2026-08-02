// @vitest-environment jsdom
/**
 * FieldAssistant — the file-upload surface.
 *
 * What is worth pinning here is not that the handlers exist but that the
 * three intake routes behave identically. A CSV dropped on the sheet, a
 * screenshot pasted into it, and a file picked through the paperclip all
 * reach the same code, so a user never has to learn which control takes
 * which type.
 *
 * The resize prompt is pinned as a PROMPT, not a silent transform: an
 * oversized photo is evidence, and altering it without asking is the
 * behaviour this product cannot have.
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

beforeEach(() => {
  window.localStorage.setItem('jasper_intro_v1', new Date().toISOString())
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

import FieldAssistant from '../../src/components/FieldAssistant'

const T0 = Date.UTC(2026, 6, 13, 12, 0)

function loggerCsvText(rows = 60) {
  const lines = ['Timestamp,CO2 (ppm),Temperature (F),RH (%)']
  for (let i = 0; i < rows; i++) {
    const t = new Date(T0 + i * 300_000).toISOString().slice(0, 19).replace('T', ' ')
    lines.push(`${t},${620 + (i % 40) * 9},${71.5 + (i % 5) * 0.4},${46 + (i % 9)}`)
  }
  return lines.join('\n')
}

/**
 * jsdom's File has no usable `.text()`, and the parser needs one. Patch
 * the prototype rather than hand-rolling a fake so the component still
 * receives a genuine File through a genuine DataTransfer.
 */
function installFileText() {
  const contents = new WeakMap<File, string>()
  ;(File.prototype as any).text = function text(this: File) {
    return Promise.resolve(contents.get(this) ?? '')
  }
  return (name: string, type: string, body: string) => {
    const f = new File([body], name, { type })
    contents.set(f, body)
    return f
  }
}

function dropEvent(files: File[]) {
  return {
    dataTransfer: { files, types: ['Files'], dropEffect: '' },
  }
}

describe('FieldAssistant — drag and drop', () => {
  it('shows a drop target while a file is over the sheet', () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    expect(screen.queryByTestId('drop-overlay')).toBeNull()
    fireEvent.dragEnter(sheet, dropEvent([]))
    expect(screen.getByTestId('drop-overlay')).toBeTruthy()
  })

  it('keeps the overlay up when the pointer crosses a child element', () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    // enter sheet, enter child, leave sheet-for-child — the naive boolean
    // flag flickers off here; the depth counter must not.
    fireEvent.dragEnter(sheet, dropEvent([]))
    fireEvent.dragEnter(sheet, dropEvent([]))
    fireEvent.dragLeave(sheet, dropEvent([]))
    expect(screen.getByTestId('drop-overlay')).toBeTruthy()
  })

  it('ignores a drag that carries no files', () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    fireEvent.dragEnter(sheet, { dataTransfer: { files: [], types: ['text/plain'] } })
    expect(screen.queryByTestId('drop-overlay')).toBeNull()
  })

  it('parses a dropped logger CSV and shows what it found', async () => {
    const makeFile = installFileText()
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    const file = makeFile('qtrak-export.csv', 'text/csv', loggerCsvText(60))

    fireEvent.drop(sheet, dropEvent([file]))

    await waitFor(() => {
      expect(screen.getByTestId('attached-files')).toBeTruthy()
    })
    expect(screen.getByText('qtrak-export.csv')).toBeTruthy()
    // The chip states the kind and the contents, so a misread file is
    // visible before the question is asked.
    expect(screen.getByText(/Logger data · 60 readings · 3 parameters/)).toBeTruthy()
    // And the overlay clears on drop.
    expect(screen.queryByTestId('drop-overlay')).toBeNull()
  })

  it('removes an attached file from its chip', async () => {
    const makeFile = installFileText()
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    fireEvent.drop(sheet, dropEvent([makeFile('log.csv', 'text/csv', loggerCsvText(20))]))

    await waitFor(() => expect(screen.getByText('log.csv')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Remove log.csv'))
    await waitFor(() => {
      expect(screen.queryByText('log.csv')).toBeNull()
      expect(screen.queryByTestId('attached-files')).toBeNull()
    })
  })

  it('explains an unsupported drop instead of failing silently', async () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    fireEvent.drop(sheet, dropEvent([new File(['x'], 'backup.zip', { type: 'application/zip' })]))
    await waitFor(() => {
      expect(screen.getByText(/isn't a supported type/i)).toBeTruthy()
    })
  })
})

describe('FieldAssistant — clipboard paste', () => {
  it('takes a pasted screenshot through the same path as the paperclip', async () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    const png = new File(['fake-png-bytes'], 'screenshot.png', { type: 'image/png' })

    fireEvent.paste(sheet, { clipboardData: { files: [png] } })

    await waitFor(() => {
      expect(screen.getByTestId('attached-photos')).toBeTruthy()
    })
    expect(screen.getByText('screenshot.png')).toBeTruthy()
  })

  it('leaves a plain text paste alone', () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    fireEvent.paste(sheet, { clipboardData: { files: [] } })
    expect(screen.queryByTestId('attached-photos')).toBeNull()
    expect(screen.queryByTestId('attached-files')).toBeNull()
  })
})

describe('FieldAssistant — oversized photo', () => {
  /** A JPEG over the 2 MB send budget. */
  function bigJpeg() {
    const f = new File(['x'], 'AHU-3.jpg', { type: 'image/jpeg' })
    Object.defineProperty(f, 'size', { value: 4_200_000, configurable: true })
    return f
  }

  it('asks before resizing rather than silently altering the photo', async () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    fireEvent.drop(sheet, dropEvent([bigJpeg()]))

    await waitFor(() => expect(screen.getByTestId('resize-prompt')).toBeTruthy())
    // Nothing is staged until the user answers.
    expect(screen.queryByTestId('attached-photos')).toBeNull()
    expect(screen.getByText(/4\.2 MB/)).toBeTruthy()
    expect(screen.getByText(/original file on your device is not changed/i)).toBeTruthy()
  })

  it('drops the photo when the prompt is cancelled', async () => {
    const { container } = render(<FieldAssistant onClose={() => {}} context={{}} />)
    const sheet = container.querySelector('.jasper-sheet') as HTMLElement
    fireEvent.drop(sheet, dropEvent([bigJpeg()]))

    await waitFor(() => expect(screen.getByTestId('resize-prompt')).toBeTruthy())
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => {
      expect(screen.queryByTestId('resize-prompt')).toBeNull()
      expect(screen.queryByTestId('attached-photos')).toBeNull()
    })
  })
})
