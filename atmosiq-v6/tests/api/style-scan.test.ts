// Style scanner (AI-tell) tests.
// scanStyle is a SEPARATE, non-suppressing scanner. It must NOT change the
// behavior of scan() (the defensibility suppressor) or its term lists.

import { describe, it, expect } from 'vitest'
import * as mirrorNs from '../../api/_banned-language.js'

const mirror: any = (mirrorNs as any).default ?? mirrorNs
const { scan, scanStyle, TONE_BANNED_TERMS, CONTEXT_AWARE_BANS, AI_TELL_PATTERNS } = mirror

describe('scanStyle (AI-tell)', () => {
  it('flags an AI-tell phrase', () => {
    const hits = scanStyle('It is important to note that the data is fine.')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]).toHaveProperty('category', 'ai_tell')
    expect(hits.some((h: any) => h.term === 'it is important to note')).toBe(true)
  })

  it('returns no flags for clean human prose', () => {
    const hits = scanStyle('Zone B held steady. CO2 peaked at 1,180 ppm midafternoon.')
    expect(hits).toEqual([])
  })

  it('handles empty / non-string input safely', () => {
    expect(scanStyle('')).toEqual([])
    expect(scanStyle(null)).toEqual([])
    expect(scanStyle(undefined)).toEqual([])
  })

  it('exposes AI_TELL_PATTERNS with the ai_tell category', () => {
    expect(Array.isArray(AI_TELL_PATTERNS)).toBe(true)
    expect(AI_TELL_PATTERNS.length).toBeGreaterThan(0)
    expect(AI_TELL_PATTERNS.every((p: any) => p.category === 'ai_tell')).toBe(true)
  })
})

describe('scan (defensibility) is unchanged by the style scanner', () => {
  it('does NOT treat AI-tell phrases as defensibility violations', () => {
    expect(scan('It is important to note the screening result.')).toEqual([])
  })

  it('still flags a genuine tone violation', () => {
    const hits = scan('The mold growth was caused by the leak.')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('still exposes the defensibility term lists', () => {
    expect(Array.isArray(TONE_BANNED_TERMS)).toBe(true)
    expect(TONE_BANNED_TERMS.length).toBeGreaterThan(0)
    expect(Array.isArray(CONTEXT_AWARE_BANS)).toBe(true)
    expect(CONTEXT_AWARE_BANS.length).toBeGreaterThan(0)
  })
})
