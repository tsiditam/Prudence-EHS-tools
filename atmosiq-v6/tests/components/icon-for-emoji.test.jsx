// @vitest-environment jsdom
/**
 * iconForEmoji — every question icon should resolve to an SVG icon name
 * (no raw iOS emoji), tolerant of the U+FE0F variation selector.
 */

import { describe, it, expect } from 'vitest'
import { iconForEmoji } from '../../src/components/Icons'

describe('iconForEmoji', () => {
  it('maps the previously-unmapped question emojis to SVG icons', () => {
    expect(iconForEmoji('🔬')).toBeTruthy() // microscope (the reported one)
    expect(iconForEmoji('📮')).toBeTruthy()
    expect(iconForEmoji('🔨')).toBeTruthy()
    expect(iconForEmoji('💼')).toBeTruthy()
  })

  it('resolves emojis regardless of the FE0F variation selector', () => {
    expect(iconForEmoji('🗺️')).toBeTruthy()       // with selector
    expect(iconForEmoji('🗺️')).toBeTruthy()  // explicit selector
    expect(iconForEmoji('🗺')).toBeTruthy()         // stripped
  })

  it('returns null for unknown / empty input', () => {
    expect(iconForEmoji('🍕')).toBeNull()
    expect(iconForEmoji('')).toBeNull()
    expect(iconForEmoji(undefined)).toBeNull()
  })
})
