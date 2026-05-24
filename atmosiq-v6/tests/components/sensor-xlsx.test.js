// @vitest-environment jsdom
/**
 * sensorXlsx — XLSX worksheet XML → rows, fed through the shared parser.
 * Uses inline XML (no zip) so the pure XML→rows logic is exercised; jsdom
 * provides DOMParser.
 */

import { describe, it, expect } from 'vitest'
import { worksheetXmlToRows, parseSharedStrings } from '../../src/utils/sensorXlsx'
import { parseSensorRows } from '../../src/utils/sensorParser'

const SHARED = `<?xml version="1.0"?><sst><si><t>Timestamp</t></si><si><t>CO2 (ppm)</t></si><si><t>RH (%)</t></si></sst>`

// Row 1 = headers (shared strings). Data rows use an Excel date serial in
// col A (45413.375 ≈ 2024-04-08 09:00) and numeric params in B/C.
const SHEET = `<?xml version="1.0"?><worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
  <row r="2"><c r="A2"><v>45413.375</v></c><c r="B2"><v>520</v></c><c r="C2"><v>44</v></c></row>
  <row r="3"><c r="A3"><v>45413.3785</v></c><c r="B3"><v>1180</v></c><c r="C3"><v>46</v></c></row>
</sheetData></worksheet>`

describe('parseSharedStrings', () => {
  it('reads the ordered shared-string table', () => {
    expect(parseSharedStrings(SHARED)).toEqual(['Timestamp', 'CO2 (ppm)', 'RH (%)'])
  })
})

describe('worksheetXmlToRows', () => {
  it('dereferences shared strings and preserves columns', () => {
    const rows = worksheetXmlToRows(SHEET, parseSharedStrings(SHARED))
    expect(rows[0]).toEqual(['Timestamp', 'CO2 (ppm)', 'RH (%)'])
    expect(rows[1]).toEqual(['45413.375', '520', '44'])
  })

  it('feeds the shared parser: detects params + converts Excel date serials', () => {
    const rows = worksheetXmlToRows(SHEET, parseSharedStrings(SHARED))
    const parsed = parseSensorRows(rows, { fileName: 'logger.xlsx' })
    expect(parsed.params.sort()).toEqual(['co2', 'rh'])
    expect(parsed.hasTimestamps).toBe(true)
    expect(parsed.points[0].co2).toBe(520)
    // 45413.375 → a real 2024 timestamp (not NaN/null)
    expect(new Date(parsed.points[0].t).getUTCFullYear()).toBe(2024)
  })
})
