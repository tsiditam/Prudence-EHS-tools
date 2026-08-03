/**
 * splitTrailingDisclaimer — peels the closing AI-assistance disclaimer off
 * a Jasper answer so the chat renderer can style it (italic + smaller)
 * without mutating the stored message.
 */
import { describe, it, expect } from 'vitest'
import { splitTrailingDisclaimer } from '../../src/utils/jasperDisclaimer.js'
import { AI_DISCLAIMER_LINE } from '../../src/constants/field-assistant-prompt.js'

const D = AI_DISCLAIMER_LINE

describe('splitTrailingDisclaimer', () => {
  it('peels the disclaimer off a normal answer and trims the gap', () => {
    const { body, disclaimer } = splitTrailingDisclaimer(`Elevated CO₂ suggests under-ventilation.\n\n${D}`, D)
    expect(body).toBe('Elevated CO₂ suggests under-ventilation.')
    expect(disclaimer).toBe(D)
  })

  it('handles trailing whitespace/newlines after the line', () => {
    const { body, disclaimer } = splitTrailingDisclaimer(`Answer body.\n${D}\n  \n`, D)
    expect(body).toBe('Answer body.')
    expect(disclaimer).toBe(D)
  })

  it('leaves content untouched when the disclaimer is absent (e.g. mid-stream)', () => {
    const partial = 'Elevated CO₂ suggests under-ventilation. AI-assisted respon'
    const { body, disclaimer } = splitTrailingDisclaimer(partial, D)
    expect(body).toBe(partial)
    expect(disclaimer).toBeNull()
  })

  it('does not peel a disclaimer that appears mid-body (only trailing)', () => {
    const mid = `${D} is our footer, but here is more text after it.`
    const { body, disclaimer } = splitTrailingDisclaimer(mid, D)
    expect(disclaimer).toBeNull()
    expect(body).toBe(mid)
  })

  it('is defensive about non-string input', () => {
    expect(splitTrailingDisclaimer(null as unknown as string, D)).toEqual({ body: null, disclaimer: null })
    expect(splitTrailingDisclaimer('x', '')).toEqual({ body: 'x', disclaimer: null })
  })
})
