// @vitest-environment jsdom
/**
 * dataUrl — decode stored `data:` URLs back into text / bytes / File, the
 * counterpart to projectStore's fileToDataUrl. Pins UTF-8 correctness (so a
 * project-stored CSV re-feeds into Logger Studio intact) and clean failure.
 */
import { describe, it, expect } from 'vitest'
import { dataUrlToText, dataUrlToBytes, dataUrlToFile } from '../../src/utils/dataUrl.js'

// A CSV with non-ASCII (°, µ) to prove UTF-8 round-trips, not latin1.
const csv = 'timestamp,co2,temp\n2026-01-01T00:00:00Z,812,71.4\n2026-01-01T00:05:00Z,905,71.9\n# °C µg/m³ note'
const b64 = Buffer.from(csv, 'utf8').toString('base64')
const url = `data:text/csv;base64,${b64}`

describe('dataUrlToText', () => {
  it('round-trips a UTF-8 CSV exactly', () => {
    expect(dataUrlToText(url)).toBe(csv)
  })
  it('strips a UTF-8 BOM-free payload without corruption', () => {
    expect(dataUrlToText(url).split('\n')[0]).toBe('timestamp,co2,temp')
  })
})

describe('dataUrlToBytes', () => {
  it('returns the exact UTF-8 byte length', () => {
    expect(dataUrlToBytes(url).length).toBe(Buffer.byteLength(csv, 'utf8'))
  })
})

describe('dataUrlToFile', () => {
  it('produces a File carrying the name, type, and original bytes', async () => {
    const f = dataUrlToFile(url, 'logger.csv', 'text/csv')
    expect(f.name).toBe('logger.csv')
    expect(f.type).toBe('text/csv')
    const text = new TextDecoder('utf-8').decode(new Uint8Array(await f.arrayBuffer()))
    expect(text).toBe(csv)
  })
  it('falls back to the data URL mime when no type is given', () => {
    expect(dataUrlToFile(url, 'logger.csv').type).toBe('text/csv')
  })
})

describe('failure modes', () => {
  it('throws on a non-data URL', () => {
    expect(() => dataUrlToText('https://example.com/x.csv')).toThrow()
    expect(() => dataUrlToBytes('not a data url')).toThrow()
  })
})
