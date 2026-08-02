/**
 * Chat attachment digests.
 *
 * The contract this file defends is that a file dropped into the assistant
 * is REDUCED before it travels: the digest reports what was measured, stays
 * inside a character budget whatever the input size, and never carries a
 * threshold comparison or a verdict. A digest that grew with its input, or
 * that classified a logger export as laboratory data, would put wrong facts
 * in front of the model with no way for the user to see it happened.
 */
import { describe, it, expect } from 'vitest'
import {
  classifyAttachment,
  buildSensorDigest,
  buildLabDigest,
  buildTextDigest,
  digestToPrompt,
  digestSummaryLine,
  pickCsvDigest,
  digestForFile,
  MAX_DIGEST_CHARS,
  MAX_ATTACHMENT_BYTES,
  ATTACHMENT_ACCEPT,
} from '../../src/utils/chatAttachments'

/** Minimal File stand-in — jsdom's File lacks .text() in some versions. */
function fakeFile(name: string, type: string, body = '', size?: number): any {
  return {
    name,
    type,
    size: size ?? body.length,
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  }
}

const T0 = Date.UTC(2026, 6, 13, 12, 0)

function loggerCsv(rows = 200) {
  const lines = ['Timestamp,CO2 (ppm),Temperature (F),RH (%)']
  for (let i = 0; i < rows; i++) {
    const t = new Date(T0 + i * 300_000).toISOString().slice(0, 19).replace('T', ' ')
    lines.push(`${t},${600 + (i % 50) * 8},${71 + (i % 7) * 0.3},${45 + (i % 11)}`)
  }
  return lines.join('\n')
}

const labCsv = [
  'Sample ID,Location,Analyte,Result,Units,Detection Limit',
  'S-001,Suite 300,Aspergillus/Penicillium,1200,spores/m3,50',
  'S-002,Outdoor,Aspergillus/Penicillium,800,spores/m3,50',
  'S-003,Suite 300,Cladosporium,300,spores/m3,50',
].join('\n')

describe('classifyAttachment', () => {
  it('routes by extension when the MIME type is unhelpful', () => {
    // Windows serves CSV as an Excel type; iOS Files serves octet-stream.
    expect(classifyAttachment({ name: 'log.csv', type: 'application/vnd.ms-excel' })).toBe('sensor')
    expect(classifyAttachment({ name: 'log.csv', type: 'application/octet-stream' })).toBe('sensor')
    expect(classifyAttachment({ name: 'report.pdf', type: '' })).toBe('pdf')
    expect(classifyAttachment({ name: 'data.xlsx', type: '' })).toBe('sensor')
  })

  it('treats HEIC as an image so it reaches the converter, not the reject path', () => {
    expect(classifyAttachment({ name: 'IMG_0042.HEIC', type: '' })).toBe('image')
    expect(classifyAttachment({ name: 'x.heif', type: 'image/heif' })).toBe('image')
  })

  it('returns null for something it cannot read', () => {
    expect(classifyAttachment({ name: 'archive.zip', type: 'application/zip' })).toBeNull()
    expect(classifyAttachment(null as any)).toBeNull()
  })

  it('offers the data formats in the picker, not just images', () => {
    expect(ATTACHMENT_ACCEPT).toContain('.csv')
    expect(ATTACHMENT_ACCEPT).toContain('.xlsx')
    expect(ATTACHMENT_ACCEPT).toContain('.pdf')
    expect(ATTACHMENT_ACCEPT).toContain('image/jpeg')
  })
})

describe('pickCsvDigest', () => {
  it('reads a logger export as logger data', () => {
    const d: any = pickCsvDigest(loggerCsv(), 'log.csv')
    expect(d.kind).toBe('sensor')
    expect(d.parameters.map((p: any) => p.param).sort()).toEqual(['co2', 'rh', 'temp'])
    expect(d.readings).toBe(200)
  })

  it('reads a lab report as lab results', () => {
    const d: any = pickCsvDigest(labCsv, 'results.csv')
    expect(d.kind).toBe('lab')
    expect(d.sampleCount).toBe(3)
    expect(d.analytes).toContain('Cladosporium')
  })

  it('returns null when nothing is recognisable', () => {
    expect(pickCsvDigest('alpha,beta\n1,2\n3,4', 'x.csv')).toBeNull()
  })
})

describe('buildSensorDigest', () => {
  const dataset = {
    fileName: 'log.csv',
    params: ['co2'],
    units: { co2: 'ppm' },
    hasTimestamps: true,
    rawCount: 500,
    columns: [{ raw: 'Battery', role: 'unknown' }, { raw: 'CO2', role: 'param' }],
    summary: {
      count: 500,
      start: T0,
      end: T0 + 3600_000,
      intervalSec: 300.4,
      missing: { co2: 3 },
      stats: { co2: { mean: 812.3456, min: 410, max: 1620, n: 497 } },
    },
    quality: { flags: [{ level: 'uncertain', msg: 'Temperature may be Celsius.' }] },
  }

  it('carries the measured facts and the integrity flags together', () => {
    const d: any = buildSensorDigest(dataset, 'log.csv')
    expect(d.readings).toBe(500)
    expect(d.intervalSec).toBe(300)
    expect(d.parameters[0]).toMatchObject({ param: 'co2', unit: 'ppm', min: 410, max: 1620, missing: 3 })
    // Rounded, not raw float noise.
    expect(d.parameters[0].mean).toBe(812.346)
    expect(d.qualityFlags).toEqual(['Temperature may be Celsius.'])
    expect(d.unmappedColumns).toEqual(['Battery'])
  })

  it('never emits a verdict, a score, or a threshold comparison', () => {
    const text = digestToPrompt(buildSensorDigest(dataset, 'log.csv'))
    expect(text).not.toMatch(/exceed|compliance|violation|unsafe|pass|fail|acceptable/i)
  })

  it('reports the absence of timestamps rather than implying a period', () => {
    const d = buildSensorDigest({ ...dataset, hasTimestamps: false, summary: { ...dataset.summary, start: null, end: null } }, 'x.csv')
    const text = digestToPrompt(d)
    expect(text).toContain('No timestamp column')
    expect(text).not.toContain('Period:')
  })
})

describe('buildLabDigest', () => {
  it('summarises analytes and samples without enumerating every row', () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({
      sampleId: `S-${i % 20}`,
      location: 'Suite 300',
      analyte: `Analyte ${i % 60}`,
      result: String(i),
      units: 'spores/m3',
      detectionLimit: '50',
    }))
    const d: any = buildLabDigest({ laboratory: 'EMSL', rows, unmappedColumns: [], warnings: [] }, 'lab.csv')
    expect(d.sampleCount).toBe(20)
    expect(d.analytes.length).toBe(40)
    expect(d.analytesTruncated).toBe(true)
    expect(d.sampleRows.length).toBe(8)
  })
})

describe('digestToPrompt', () => {
  it('holds the character budget however large the input', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      sampleId: `S-${i}`, location: `Room ${i}`, analyte: `Analyte ${i}`,
      result: '1', units: 'spores/m3', detectionLimit: '50',
    }))
    const lab = digestToPrompt(buildLabDigest({ laboratory: 'X', rows, unmappedColumns: [], warnings: [] }, 'l.csv'))
    expect(lab.length).toBeLessThanOrEqual(MAX_DIGEST_CHARS)

    const text = digestToPrompt(buildTextDigest('x'.repeat(500_000), 'big.txt'))
    expect(text.length).toBeLessThanOrEqual(MAX_DIGEST_CHARS)
  })

  it('marks truncated text as truncated instead of presenting it as whole', () => {
    const d: any = buildTextDigest('y'.repeat(50_000), 'big.txt')
    expect(d.truncated).toBe(true)
    expect(digestToPrompt(d)).toContain('truncated')
  })
})

describe('digestSummaryLine', () => {
  it('says what the file turned out to contain', () => {
    const s = digestSummaryLine(pickCsvDigest(loggerCsv(120), 'log.csv'))
    expect(s).toContain('120 readings')
    expect(s).toContain('3 parameters')
    expect(digestSummaryLine(pickCsvDigest(labCsv, 'lab.csv'))).toContain('3 samples')
  })
})

describe('digestForFile', () => {
  it('parses a CSV without touching the network', async () => {
    const r: any = await digestForFile(fakeFile('log.csv', 'text/csv', loggerCsv(50)))
    expect(r.ok).toBe(true)
    expect(r.digest.kind).toBe('sensor')
  })

  it('rejects a file larger than the read limit before reading it', async () => {
    const r: any = await digestForFile(fakeFile('huge.csv', 'text/csv', '', MAX_ATTACHMENT_BYTES + 1))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/larger than/i)
  })

  it('explains an unrecognisable CSV rather than failing silently', async () => {
    const r: any = await digestForFile(fakeFile('junk.csv', 'text/csv', 'a,b\n1,2'))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/could not recognise/i)
  })

  it('uses the injected PDF reader, so no PDF engine is imported here', async () => {
    const readPdfText = async () => ({ text: 'Analyte: Cladosporium  Result: 300', pages: 2 })
    const r: any = await digestForFile(fakeFile('lab.pdf', 'application/pdf'), { readPdfText })
    expect(r.ok).toBe(true)
    expect(r.digest.kind).toBe('pdf')
    expect(r.digest.pages).toBe(2)
  })

  it('tells the user a scanned PDF needs OCR instead of returning nothing', async () => {
    const readPdfText = async () => ({ text: '   ', pages: 3 })
    const r: any = await digestForFile(fakeFile('scan.pdf', 'application/pdf'), { readPdfText })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/OCR/i)
  })

  it('refuses an unsupported type by name', async () => {
    const r: any = await digestForFile(fakeFile('a.zip', 'application/zip'))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not supported/i)
  })
})
