/**
 * The figures an assessor attaches reach the exported report.
 *
 * Two shipped defects (2026-09), both reported as "I attached it and it
 * doesn't show up":
 *
 *  - The floor plan. The model hard-coded `showFloorPlanSchematic: false`
 *    and nothing in the AtmosFlow report read `data.floorPlan`, so a plan
 *    uploaded on the spatial map — with zones pinned on it — never rendered.
 *  - Logger Studio graphs. "Send graphs to a report" wrote them into the
 *    SAVED record, and every export read the LIVE sensorData state instead,
 *    so a report opened from the list exported without the graphs attached
 *    to it. The export paths now read one source (`reportSensorData`).
 *
 * The first half pins the model and the DOCX; the last block pins the app
 * shell's export wiring by reading its source, because the bug lived in
 * which state variable three functions happened to close over.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { Packer } from 'docx'
import JSZip from 'jszip'
// @ts-expect-error js
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
// @ts-expect-error js
import { assembleRenderModel, buildFloorPlan, FLOOR_PLAN_MAX } from '../../src/report/reportModel.js'
// @ts-expect-error js
import { checkRenderModel } from '../../src/report/modelConsistency.js'
// @ts-expect-error js
import { imageDimensions, fitWithin } from '../../src/utils/imageDimensions.js'
// @ts-expect-error js
import { floorPlanPins } from '../../src/utils/floorPlanFigure.js'
// @ts-expect-error js
import { buildAtmosFlowDocument } from '../../src/components/DocxReport'

// ── Fixtures ─────────────────────────────────────────────────────────────

// A real PNG (solid black, deflated) so the DOCX packer embeds it. Built
// rather than pasted: a long base64 literal is one dropped character away
// from an atob failure that reads as "the image did not render".
function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function pngDataUrl(width: number, height: number): string {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((width * 3 + 1) * height)
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ])
  return 'data:image/png;base64,' + png.toString('base64')
}
const PNG_400x300 = pngDataUrl(400, 300)

// Minimal JPEG header: SOI, APP0/JFIF, SOF0 carrying 1024×768, EOI.
function jpegDataUrl(width: number, height: number): string {
  const b = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ])
  return 'data:image/jpeg;base64,' + b.toString('base64')
}

function gifDataUrl(width: number, height: number): string {
  const b = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 0xff, width >> 8, height & 0xff, height >> 8, 0x00, 0x00, 0x00, 0x3b])
  return 'data:image/gif;base64,' + b.toString('base64')
}

const ZONES = [
  { zn: 'Open Office', zt: 'Open office', co2: '1300', co: '2', tf: '75', rh: '55', pm: '12', mapX: 41.3, mapY: 62.8 },
  { zn: 'Conference 2B', zt: 'Conference room', co2: '900', co: '1', tf: '74', rh: '50', pm: '8', mapX: 80, mapY: 20 },
  { zn: 'Server Room', zt: 'Server room', co2: '600', co: '0.5', tf: '70', rh: '40', pm: '3' }, // not placed on the plan
]

function fixture(extra: Record<string, unknown> = {}): any {
  const bldg = { fn: 'Figure Test Site', fl: '1 Plan Way', ft: 'Office', ht: 'VAV air handler', assessmentDate: '2026-07-15' }
  const zoneScores = ZONES.map(z => scoreZone(z, bldg))
  return {
    id: 'rpt-fig', ts: '2026-07-16', status: 'draft',
    building: bldg,
    presurvey: { ps_assessor: 'J. Smith', ps_inst_iaq: 'TSI Q-Trak 7575', ps_inst_iaq_cal: '2026-01-15', ps_inst_iaq_cal_status: 'Calibrated', ps_survey_date: '2026-07-15' },
    zones: ZONES, zoneScores, comp: summarizeAssessment(zoneScores),
    recs: { imm: [], eng: [], adm: [], mon: [] },
    profile: { name: 'J. Smith', certs: ['CIH'], firm: 'PSEC' },
    ...extra,
  }
}

async function renderXml(data: any): Promise<string> {
  const doc = await buildAtmosFlowDocument(data)
  const buf = await Packer.toBuffer(doc)
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

// ── Image header parsing ──────────────────────────────────────────────────

describe('imageDimensions reads the pixel size off the file header', () => {
  it('PNG', () => expect(imageDimensions(PNG_400x300)).toEqual({ width: 400, height: 300 }))
  it('JPEG (SOF0 after an APP0 segment)', () => expect(imageDimensions(jpegDataUrl(1024, 768))).toEqual({ width: 1024, height: 768 }))
  it('GIF', () => expect(imageDimensions(gifDataUrl(320, 200))).toEqual({ width: 320, height: 200 }))
  it('null for anything it cannot read, and never throws', () => {
    expect(imageDimensions(null)).toBeNull()
    expect(imageDimensions('data:image/png;base64,AAAA')).toBeNull()
    expect(imageDimensions('data:text/plain;base64,aGk=')).toBeNull()
    expect(imageDimensions('https://example.com/plan.png')).toBeNull()
  })
  it('fitWithin preserves aspect and never enlarges', () => {
    expect(fitWithin({ width: 2000, height: 1000 }, 620, 440)).toEqual({ width: 620, height: 310 })
    expect(fitWithin({ width: 1000, height: 2000 }, 620, 440)).toEqual({ width: 220, height: 440 })
    expect(fitWithin({ width: 400, height: 300 }, 620, 440)).toEqual({ width: 400, height: 300 })
    expect(fitWithin(null, 620, 440)).toBeNull()
  })
})

// ── Floor plan in the model ───────────────────────────────────────────────

describe('the uploaded floor plan is a report figure', () => {
  it('is absent when no plan was uploaded', () => {
    expect(buildFloorPlan(fixture())).toBeNull()
    expect(buildFloorPlan(fixture({ floorPlan: null }))).toBeNull()
    expect(buildFloorPlan(fixture({ floorPlan: 'not-an-image' }))).toBeNull()
    expect(assembleRenderModel(fixture()).floorPlan).toBeNull()
  })

  it('renders the raw plan sized from its own header, with the placed zones and their positions', () => {
    const fp = buildFloorPlan(fixture({ floorPlan: PNG_400x300 }))
    expect(fp.imageDataUrl).toBe(PNG_400x300)
    expect(fp.figure).toEqual({ width: 400, height: 300 })
    expect(fp.pinsDrawn).toBe(false)
    // Two of three zones were placed; numbered in zone order; the third is not a pin.
    expect(fp.pins.map((p: any) => [p.n, p.zone, p.use])).toEqual([[1, 'Open Office', 'Open office'], [2, 'Conference 2B', 'Conference room']])
    expect(fp.pins[0].position).toBe('41% across, 63% down')
    expect(fp.caption).toMatch(/2 zones placed on the plan are listed below/)
  })

  it('takes the composed figure (pins drawn) and fits it to the page', () => {
    const composed = { imageDataUrl: PNG_400x300, width: 2000, height: 1000, pinsDrawn: true }
    const fp = buildFloorPlan(fixture({ floorPlan: composed }))
    expect(fp.figure).toEqual({ width: FLOOR_PLAN_MAX.width, height: 310 })
    expect(fp.pinsDrawn).toBe(true)
    expect(fp.caption).toMatch(/with the 2 assessed zones marked\. Pin numbers key to the table below/)
  })

  it('a plan with no zones placed still renders, and says so', () => {
    const zones = ZONES.map(({ mapX, mapY, ...z }) => z)
    const fp = buildFloorPlan({ ...fixture({ floorPlan: PNG_400x300 }), zones })
    expect(fp.pins).toEqual([])
    expect(fp.caption).toMatch(/Zone locations were not marked/)
    expect(fp.note).toBeNull()
  })

  it('an unreadable header falls back to a page-width box rather than dropping the figure', () => {
    const fp = buildFloorPlan(fixture({ floorPlan: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }))
    expect(fp).not.toBeNull()
    expect(fp.figure.width).toBe(620)
  })

  it('floorPlanPins skips zones without a position and numbers the rest in order', () => {
    expect(floorPlanPins(ZONES).map((p: any) => [p.n, p.zoneIndex])).toEqual([[1, 0], [2, 1]])
    expect(floorPlanPins([{ mapX: 'x', mapY: 1 }, {}, null])).toEqual([])
  })

  it('the assembled model with a plan agrees with itself', () => {
    const m = assembleRenderModel(fixture({ floorPlan: PNG_400x300 }))
    expect(m.floorPlan.pins.length).toBe(2)
    expect(checkRenderModel(m)).toEqual([])
  })
})

// ── Floor plan and logger graphs in the DOCX ──────────────────────────────

describe('the DOCX embeds the attached figures', () => {
  it('renders the site plan under section 1 with its pin table', async () => {
    const xml = await renderXml(fixture({ floorPlan: PNG_400x300 }))
    expect(xml).toContain('Site plan and assessed zones')
    expect(xml).toContain('Figure 1. Floor plan as provided')
    // The pins could not be drawn on the image here (no browser), so the
    // table carries each zone's recorded position.
    expect(xml).toContain('Position on plan')
    expect(xml).toContain('41% across, 63% down')
    expect(xml).toContain('Conference 2B')
    // An actual picture, not just a heading.
    const withoutPlan = await renderXml(fixture())
    expect((xml.match(/<w:drawing>/g) || []).length).toBeGreaterThan((withoutPlan.match(/<w:drawing>/g) || []).length)
    expect(withoutPlan).not.toContain('Site plan and assessed zones')
  })

  it('renders the composed plan without the position column', async () => {
    const xml = await renderXml(fixture({ floorPlan: { imageDataUrl: PNG_400x300, width: 400, height: 300, pinsDrawn: true } }))
    expect(xml).toContain('Pin numbers key to the table below')
    expect(xml).not.toContain('Position on plan')
    expect(xml).toContain('Open Office')
  })

  it('renders an included logger graph and omits one that is not included', async () => {
    const graphs = {
      co2: { include: true, title: 'CO₂ timeline', imageDataUrl: PNG_400x300 },
      temp: { include: false, title: 'Temperature', imageDataUrl: PNG_400x300 },
    }
    const m = assembleRenderModel(fixture({ sensorData: { fileName: 'logger.csv', graphs } }))
    expect(m.loggerImages.images.map((g: any) => g.title)).toEqual(['CO₂ timeline'])
    expect(m.limitations.some((l: string) => /No continuous logger data/.test(l))).toBe(false)
    const xml = await renderXml(fixture({ sensorData: { fileName: 'logger.csv', graphs } }))
    expect(xml).toContain('Environmental Evidence Graphs')
    expect(xml).toContain('CO₂ timeline')
    expect(xml).toContain('Data source: logger.csv')
  })
})

// ── The app shell reads the report's own graphs ───────────────────────────

describe('every export path reads the graphs of the report being exported', () => {
  const src = readFileSync(new URL('../../src/components/MobileApp.jsx', import.meta.url), 'utf8')

  it('resolves the logger dataset from the opened report when one is open', () => {
    expect(src).toMatch(/const reportSensorData = \(\) => \(\(view === 'report' && viewRpt\) \? \(viewRpt\.sensorData \|\| null\) : sensorData\)/)
    // Nothing rasterizes the LIVE state directly any more.
    expect(src).not.toMatch(/ensureLoggerChartImages\(sensorData\)/)
    expect(src).toMatch(/ensureLoggerChartImages\(reportSensorData\(\)\)/)
  })

  it('the DOCX export, share and peer-review builds all prepare figures the same way', () => {
    const fnBody = (name: string) => {
      const start = src.indexOf(`const ${name} = async`)
      expect(start, name).toBeGreaterThan(-1)
      return src.slice(start, src.indexOf('\n  }\n', start))
    }
    for (const fn of ['executeExport', 'handleShare', 'sendForPeerReview']) {
      const body = fnBody(fn)
      expect(body, fn).toContain('await prepareReportFigures()')
      expect(body, fn).toContain('floorPlan: figures.floorPlan')
      expect(body, fn).toContain('sensorData: figures.sensorData')
      // The raw state variable must not reach the report data of any path.
      expect(body, fn).not.toMatch(/userMode, floorPlan, sensorData,/)
    }
  })

  it('the Report-tab consistency check reads the same dataset the export will', () => {
    expect(src).toMatch(/checkRenderModel\(assembleRenderModel\(\{[\s\S]*?sensorData: loggerSd, floorPlan,/)
  })
})
