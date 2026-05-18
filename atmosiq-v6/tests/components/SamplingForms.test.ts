/**
 * Smoke tests for AtmosFlow Chain of Custody PDF form generators.
 *
 * Goal: catch breakage in the form-generation pipeline without
 * trying to assert anything about pixel-level layout. Verifies:
 *   • Each generator returns a non-empty Blob
 *   • Blob MIME type is application/pdf
 *   • PDF magic-number header is present (%PDF-)
 *   • Filename builder produces the documented prefix
 */

import { describe, it, expect, beforeAll } from 'vitest'

// jsPDF reads window.crypto in some code paths. jsdom provides one,
// but vitest's node environment does not — set up a minimal Blob
// shim if needed and let vitest's default jsdom env handle the rest.

import { generateMoldCoCBlob, MOLD_COC_FILENAME_PREFIX } from '../../src/components/forms/MoldCoCForm'
import { generateTvocCoCBlob, TVOC_COC_FILENAME_PREFIX } from '../../src/components/forms/TvocCoCForm'

async function blobToString(blob: Blob): Promise<string> {
  // Read first 8 bytes to check the PDF magic number.
  const buf = await blob.arrayBuffer()
  return new TextDecoder().decode(buf.slice(0, 8))
}

const sampleProfile = {
  name: 'Test Assessor, CIH',
  certs: ['CIH', 'CSP'],
  firm: 'Test Consulting LLC',
  iaq_meter: 'TSI Q-Trak 7575',
  iaq_serial: 'QT-2024-08712',
  iaq_cal_date: '2026-01-15',
  iaq_cal_status: 'Within manufacturer spec',
  pid_meter: 'RAE MiniRAE 3000',
  pid_cal_status: 'Bump-tested',
}

describe('Mold CoC PDF generator', () => {
  it('produces a non-empty PDF blob', async () => {
    const blob = generateMoldCoCBlob({ profile: sampleProfile })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(2000) // a 2-page CoC is at least ~2 KB
    expect(blob.type).toBe('application/pdf')
    const head = await blobToString(blob)
    expect(head.startsWith('%PDF-')).toBe(true)
  })

  it('exposes the documented filename prefix', () => {
    expect(MOLD_COC_FILENAME_PREFIX).toBe('AtmosFlow-CoC-Mold')
  })

  it('works without a profile (no pre-fill)', () => {
    const blob = generateMoldCoCBlob({})
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(2000)
  })
})

describe('TVOC CoC PDF generator', () => {
  it('produces a non-empty PDF blob', async () => {
    const blob = generateTvocCoCBlob({ profile: sampleProfile })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(2000)
    expect(blob.type).toBe('application/pdf')
    const head = await blobToString(blob)
    expect(head.startsWith('%PDF-')).toBe(true)
  })

  it('exposes the documented filename prefix', () => {
    expect(TVOC_COC_FILENAME_PREFIX).toBe('AtmosFlow-CoC-TVOC')
  })

  it('works without a profile (no pre-fill)', () => {
    const blob = generateTvocCoCBlob({})
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(2000)
  })
})
