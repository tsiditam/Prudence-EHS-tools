/**
 * DOCX image helpers — data-URL → bytes + type detection.
 *
 * Pins the contract the branded cover depends on:
 *   • base64ToUint8Array converts a valid data URL to bytes
 *   • inferImageType maps MIME → docx package's expected token
 *   • inferImageType falls back to 'png' on unknown inputs (defensive)
 *   • isImageDataUrl rejects empty / non-image / non-data inputs
 */
import { describe, it, expect } from 'vitest'
import {
  base64ToUint8Array,
  inferImageType,
  isImageDataUrl,
} from '../../src/components/docx/images.js'

// Smallest possible 1×1 PNG (data URL form), used as a canonical
// well-formed input for the helper tests.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='
const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/4QHgRXhpZgAATU0AKgAAAAg='

describe('base64ToUint8Array', () => {
  it('decodes a real PNG data URL into bytes', () => {
    const bytes = base64ToUint8Array(TINY_PNG)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(bytes[0]).toBe(0x89)
    expect(bytes[1]).toBe(0x50)
    expect(bytes[2]).toBe(0x4E)
    expect(bytes[3]).toBe(0x47)
  })

  it('decodes a JPEG data URL into bytes with the JPEG SOI marker', () => {
    const bytes = base64ToUint8Array(TINY_JPG)
    expect(bytes[0]).toBe(0xFF)
    expect(bytes[1]).toBe(0xD8)
  })
})

describe('inferImageType', () => {
  it('maps image/jpeg → jpg', () => {
    expect(inferImageType(TINY_JPG)).toBe('jpg')
  })
  it('maps image/png → png', () => {
    expect(inferImageType(TINY_PNG)).toBe('png')
  })
  it('maps image/webp → png (docx package compatibility fallback)', () => {
    expect(inferImageType('data:image/webp;base64,UklGRiQAAABXRUJQ')).toBe('png')
  })
  it('falls back to png for unknown or malformed inputs', () => {
    expect(inferImageType('')).toBe('png')
    expect(inferImageType('garbage')).toBe('png')
    expect(inferImageType(null as never)).toBe('png')
    expect(inferImageType(undefined as never)).toBe('png')
  })
})

describe('isImageDataUrl', () => {
  it('returns true for well-formed image data URLs', () => {
    expect(isImageDataUrl(TINY_PNG)).toBe(true)
    expect(isImageDataUrl(TINY_JPG)).toBe(true)
  })
  it('returns false for missing, empty, or non-image strings', () => {
    expect(isImageDataUrl('')).toBe(false)
    expect(isImageDataUrl(null as never)).toBe(false)
    expect(isImageDataUrl(undefined as never)).toBe(false)
    expect(isImageDataUrl('http://example.com/logo.png')).toBe(false)
    expect(isImageDataUrl('data:text/plain;base64,SGVsbG8=')).toBe(false)
  })
  it('returns false for truncated data URLs that are too short to embed', () => {
    expect(isImageDataUrl('data:image/png;base64,a')).toBe(false)
  })
})
