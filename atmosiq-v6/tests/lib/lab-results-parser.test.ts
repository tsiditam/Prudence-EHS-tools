/**
 * Lab Results CSV Parser — header auto-detection + row extraction.
 *
 * Pins the contract:
 *   • mapHeader recognises common synonyms across EMSL / EMLab /
 *     Aerotech / generic layouts.
 *   • splitCsvLine handles quoted commas, treats trailing whitespace
 *     gracefully, returns trimmed fields.
 *   • parseLabResultsCsv tolerates preamble rows before the header,
 *     fills unmapped columns into `extra`, surfaces warnings when
 *     the file is unparseable.
 */
import { describe, it, expect } from 'vitest'
import { mapHeader, splitCsvLine, parseLabResultsCsv } from '../../src/utils/labResultsParser.js'

describe('mapHeader — canonical field detection', () => {
  it('maps EMSL-style headers', () => {
    expect(mapHeader('Sample ID')).toBe('sampleId')
    expect(mapHeader('Lab Sample #')).toBe('sampleId')
    expect(mapHeader('Date Collected')).toBe('collectedAt')
    expect(mapHeader('Date Received')).toBe('receivedAt')
    expect(mapHeader('Analyte')).toBe('analyte')
    expect(mapHeader('Result')).toBe('result')
    expect(mapHeader('Units')).toBe('units')
    expect(mapHeader('Detection Limit')).toBe('detectionLimit')
  })

  it('maps EMLab P&K / Eurofins synonyms', () => {
    expect(mapHeader('Lab #')).toBe('sampleId')
    expect(mapHeader('Sample Number')).toBe('sampleId')
    expect(mapHeader('Sampling Date')).toBe('collectedAt')
    expect(mapHeader('Lab Received Date')).toBe('receivedAt')
    expect(mapHeader('Organism')).toBe('analyte')
    expect(mapHeader('Count')).toBe('result')
    expect(mapHeader('Reporting Limit')).toBe('detectionLimit')
  })

  it('maps generic alternatives', () => {
    expect(mapHeader('Sample Location')).toBe('location')
    expect(mapHeader('Room')).toBe('location')
    expect(mapHeader('Compound')).toBe('analyte')
    expect(mapHeader('Value')).toBe('result')
    expect(mapHeader('Reporting Units')).toBe('units')
    expect(mapHeader('Notes')).toBe('analystNotes')
    expect(mapHeader('Comments')).toBe('analystNotes')
  })

  it('is case insensitive and trims whitespace', () => {
    expect(mapHeader('  sample id  ')).toBe('sampleId')
    expect(mapHeader('ANALYTE')).toBe('analyte')
    expect(mapHeader('result')).toBe('result')
  })

  it('returns null for unrecognised + invalid input', () => {
    expect(mapHeader('Random Header')).toBeNull()
    expect(mapHeader('')).toBeNull()
    expect(mapHeader('   ')).toBeNull()
    expect(mapHeader(null as unknown as string)).toBeNull()
    expect(mapHeader(undefined as unknown as string)).toBeNull()
  })
})

describe('splitCsvLine', () => {
  it('splits comma-separated fields', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('honors double-quoted fields with embedded commas', () => {
    expect(splitCsvLine('"hello, world",foo,"a,b,c"')).toEqual(['hello, world', 'foo', 'a,b,c'])
  })

  it('trims whitespace inside each field', () => {
    expect(splitCsvLine('  a , b ,  c  ')).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty trailing field after a trailing comma', () => {
    expect(splitCsvLine('a,b,')).toEqual(['a', 'b', ''])
  })

  it('returns [] for non-string / null input', () => {
    expect(splitCsvLine(null as unknown as string)).toEqual([])
    expect(splitCsvLine(undefined as unknown as string)).toEqual([])
  })

  it('returns a single empty field for empty string input', () => {
    expect(splitCsvLine('')).toEqual([''])
  })
})

describe('parseLabResultsCsv — happy paths', () => {
  it('parses a minimal EMSL-style mold CSV', () => {
    const csv = [
      'EMSL Analytical, Inc.',
      'COA: 12345',
      '',
      'Sample ID,Location,Date Collected,Analyte,Result,Units',
      'AC-001,Zone A,2026-05-15,Aspergillus/Penicillium,1200,spores/m³',
      'AC-002,Zone B,2026-05-15,Cladosporium,450,spores/m³',
      'AC-003,Outdoor,2026-05-15,Aspergillus/Penicillium,180,spores/m³',
    ].join('\n')
    const result = parseLabResultsCsv(csv)
    expect(result.laboratory).toBe('EMSL Analytical, Inc.')
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].sampleId).toBe('AC-001')
    expect(result.rows[0].location).toBe('Zone A')
    expect(result.rows[0].collectedAt).toBe('2026-05-15')
    expect(result.rows[0].analyte).toBe('Aspergillus/Penicillium')
    expect(result.rows[0].result).toBe('1200')
    expect(result.rows[0].units).toBe('spores/m³')
    expect(result.warnings).toEqual([])
  })

  it('parses an EMLab P&K layout with different column names', () => {
    const csv = [
      'EMLab P&K — Sample Report',
      '',
      'Lab #,Sample Location,Sampling Date,Lab Received Date,Organism,Count,Units,RL',
      '8821,Zone 1 — Conference,2026-04-20,2026-04-22,Penicillium,890,spores/m3,13',
      '8822,Zone 2 — Office,2026-04-20,2026-04-22,Aspergillus,1100,spores/m3,13',
    ].join('\n')
    const result = parseLabResultsCsv(csv)
    expect(result.laboratory).toBe('EMLab P&K (Eurofins)')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].sampleId).toBe('8821')
    expect(result.rows[0].receivedAt).toBe('2026-04-22')
    expect(result.rows[0].detectionLimit).toBe('13')
  })

  it('parses generic CSV without a recognisable lab signature', () => {
    const csv = [
      'Sample Number,Room,Collection Date,Compound,Value,Reporting Units',
      'X-1,Lobby,2026-03-10,TVOC,250,µg/m³',
    ].join('\n')
    const result = parseLabResultsCsv(csv)
    expect(result.laboratory).toBeNull()
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].sampleId).toBe('X-1')
    expect(result.rows[0].analyte).toBe('TVOC')
    expect(result.rows[0].units).toBe('µg/m³')
  })

  it('preserves unmapped columns in the row "extra" map', () => {
    const csv = [
      'Sample ID,Location,Analyte,Result,Units,Batch,Technician',
      'S-1,Zone A,Asp/Pen,500,spores/m³,B2026-01,J. Smith',
    ].join('\n')
    const result = parseLabResultsCsv(csv)
    expect(result.unmappedColumns).toContain('Batch')
    expect(result.unmappedColumns).toContain('Technician')
    expect(result.rows[0].extra).toEqual({ Batch: 'B2026-01', Technician: 'J. Smith' })
  })
})

describe('parseLabResultsCsv — preamble + edge cases', () => {
  it('skips preamble rows before finding the header row', () => {
    const csv = [
      'Customer: Prudence EHS',
      'PO: 12345',
      'Report Date: 2026-05-19',
      '',
      'Sample ID,Analyte,Result,Units',
      'A,Penicillium,100,spores/m³',
    ].join('\n')
    const result = parseLabResultsCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].sampleId).toBe('A')
  })

  it('skips fully blank data rows', () => {
    const csv = [
      'Sample ID,Result',
      'A,100',
      '',
      ',',
      'B,200',
    ].join('\n')
    const result = parseLabResultsCsv(csv)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].sampleId).toBe('A')
    expect(result.rows[1].sampleId).toBe('B')
  })

  it('handles \\r\\n line endings', () => {
    const csv = 'Sample ID,Result\r\nA,100\r\nB,200\r\n'
    const result = parseLabResultsCsv(csv)
    expect(result.rows).toHaveLength(2)
  })

  it('handles double-quoted commas in cell values', () => {
    const csv = [
      'Sample ID,Location,Analyte,Result,Units',
      'S-1,"Zone A, Office",Penicillium,"1,200",spores/m³',
    ].join('\n')
    const result = parseLabResultsCsv(csv)
    expect(result.rows[0].location).toBe('Zone A, Office')
    expect(result.rows[0].result).toBe('1,200')
  })

  it('returns a warning when the CSV is empty', () => {
    const result = parseLabResultsCsv('')
    expect(result.rows).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('returns a warning when no header row is recognisable', () => {
    const csv = 'just a single,line,of,unrecognised,columns\nfoo,bar,baz,qux,quux'
    const result = parseLabResultsCsv(csv)
    expect(result.rows).toEqual([])
    expect(result.warnings[0]).toMatch(/header/)
  })

  it('returns a warning when header is found but no data rows present', () => {
    const csv = 'Sample ID,Analyte,Result,Units\n'
    const result = parseLabResultsCsv(csv)
    expect(result.rows).toEqual([])
    expect(result.warnings.some((w: string) => /no data rows/i.test(w))).toBe(true)
  })

  it('detects each supported laboratory signature', () => {
    const make = (preamble: string) =>
      `${preamble}\n\nSample ID,Analyte,Result,Units\nA,B,1,u`
    expect(parseLabResultsCsv(make('Eurofins Lab Services')).laboratory).toMatch(/Eurofins/)
    expect(parseLabResultsCsv(make('Aerotech Laboratories Inc')).laboratory).toMatch(/Aerotech/)
    expect(parseLabResultsCsv(make('Pace Analytical Services')).laboratory).toMatch(/Pace/)
  })
})
