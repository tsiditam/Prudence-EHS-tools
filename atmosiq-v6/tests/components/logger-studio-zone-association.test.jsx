// @vitest-environment jsdom
/**
 * Logger Studio — associating a dataset with a walkthrough zone.
 *
 * Two properties, and the first outranks the second everywhere they meet:
 *
 *   1. STANDALONE LOGGER STUDIO IS UNTOUCHED. Importing a logger file,
 *      charting it, running Forensics and reading occurrence windows must
 *      never require an assessment, a report, a project or a zone. With no
 *      zones in scope the association does not degrade, it is ABSENT — no
 *      control, no prompt, no empty select, and no key on the record.
 *   2. WHERE AN ASSESSMENT DOES SUPPLY ZONES, the association is a
 *      statement the assessor makes, keyed on the zone's stable id. Never a
 *      label match, never a file name, never a similarity score — a silent
 *      wrong join attributes one room's data to another and reads as
 *      evidence rather than as the guess it is.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { useState } from 'react'
import SensorDataPage from '../../src/components/sensor/SensorDataPage'
import { ZONE_LINKABLE_ROLES, linkableZones, zoneTitleAt } from '../../src/components/sensor/sensorHelpers'
import { LINKABLE_ROLES } from '../../src/engines/integrity/temporal-relationship.js'
import { normalizeSensorData } from '../../src/utils/sensorParser'
import { buildForensicBundle } from '../../src/utils/forensicBundle'

afterEach(() => { cleanup(); vi.useRealTimers() })

const pad = (n) => String(n).padStart(2, '0')
const ROWS = ['Timestamp,CO2 (ppm),TVOC (ppb),HCHO (ppb)']
for (let d = 0; d < 2; d++) {
  for (let i = 0; i < 96; i++) {
    const h = Math.floor(i / 4); const m = (i % 4) * 15
    const spike = i >= 40 && i <= 42
    ROWS.push(`2026-05-0${d + 1} ${pad(h)}:${pad(m)},${500 + (i % 7) * 20},${spike ? 900 : 100 + (i % 3)},${spike ? 140 : 20 + (i % 3)}`)
  }
}
const CSV = ROWS.join('\n')

function makeFile(text, name) {
  const f = new File([text], name, { type: 'text/csv' })
  if (typeof f.text !== 'function') f.text = () => Promise.resolve(text)
  return f
}
function setReducedMotion(m) {
  window.matchMedia = (q) => ({ matches: m, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false } })
}

let latest = null
function Harness({ zones, initial = null }) {
  const [value, setValue] = useState(initial)
  const change = (v) => { latest = v; setValue(v) }
  // `zones` is deliberately spread rather than defaulted: the standalone
  // case must exercise the prop being ABSENT, not an empty array supplied
  // by the test, because that is what a logger-only session passes.
  return <SensorDataPage value={value} onChange={change} {...(zones ? { currentZones: zones } : {})} />
}

const upload = async (container, trigger, file) => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: trigger })) })
  const input = container.querySelector('input[type="file"]')
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
  await act(async () => {})
}
const tab = (name) => act(async () => { fireEvent.click(screen.getByRole('tab', { name })) })
// Idempotent: the card opens by default once extra datasets exist, and a
// blind click would close the thing the test came to read.
const openCompare = async () => {
  const head = screen.getByRole('button', { name: /Compare datasets/i })
  if (head.getAttribute('aria-expanded') !== 'true') await act(async () => { fireEvent.click(head) })
}
const ds = (env, id = 'primary') => env.datasets.find((d) => d.id === id)

beforeEach(() => { setReducedMotion(true); latest = null })

// ── 1. Standalone ─────────────────────────────────────────────────────────
describe('standalone Logger Studio, with no assessment anywhere near it', () => {
  it('imports, charts and analyzes a file with no zones prop at all', async () => {
    const { container } = render(<Harness />)
    await upload(container, /Upload Data/i, makeFile(CSV, 'indoor.csv'))
    // The ordinary logger workflow, start to finish.
    expect(latest.datasets).toHaveLength(1)
    await tab(/Analysis/i)
    expect(container.querySelectorAll('.recharts-responsive-container').length).toBeGreaterThan(0)
    await tab(/Forensics/i)
    expect(screen.getAllByText(/Coincident parameter events/).length).toBeGreaterThan(0)
    // Forensics detects, times and windows its patterns without a zone.
    const bundle = buildForensicBundle({ sensorData: latest, utcOffsetMin: 0 })
    expect(bundle.patterns.length).toBeGreaterThan(0)
    expect(bundle.patterns.some((p) => p.occurrenceWindows.length > 0)).toBe(true)
  })

  it('offers no association control, and writes no key onto the record', async () => {
    const { container } = render(<Harness />)
    await upload(container, /Upload Data/i, makeFile(CSV, 'indoor.csv'))
    await tab(/Analysis/i)
    await openCompare()
    expect(screen.queryByRole('combobox', { name: /Assessment zone/i })).toBeNull()
    // Nor the primary row, which exists only to be linked.
    expect(screen.queryByText(/Indoor only/i)).not.toBeNull()
    expect(screen.queryByText(/linked to zones/i)).toBeNull()
    // Absent, not null: a standalone dataset must be indistinguishable from
    // one written before associations existed, including to a serializer.
    expect(Object.prototype.hasOwnProperty.call(ds(latest), 'zoneId')).toBe(false)
    expect(JSON.stringify(latest)).not.toMatch(/zoneId/)
  })

  it('offers nothing for zones that carry no stable id', async () => {
    // An assessment whose zones predate `zid`. There is no safe key to write,
    // so nothing is offered — a display name is not a join key.
    const { container } = render(<Harness zones={[{ zn: 'Room 214' }, { zn: 'Room B' }]} />)
    await upload(container, /Upload Data/i, makeFile(CSV, 'indoor.csv'))
    await tab(/Analysis/i)
    await openCompare()
    expect(screen.queryByRole('combobox', { name: /Assessment zone/i })).toBeNull()
    expect(linkableZones([{ zn: 'Room 214' }])).toEqual([])
    expect(linkableZones(null)).toEqual([])
  })

  it('round-trips an envelope with no associations through the normalizer unchanged', async () => {
    const { container } = render(<Harness />)
    await upload(container, /Upload Data/i, makeFile(CSV, 'indoor.csv'))
    expect(JSON.stringify(normalizeSensorData(latest))).toBe(JSON.stringify(latest))
    // And the bundle reports the absence rather than inventing one.
    expect(buildForensicBundle({ sensorData: latest }).datasets[0].zoneId).toBeNull()
  })
})

// ── 2. The association ────────────────────────────────────────────────────
describe('associating a dataset with a zone, where an assessment supplies them', () => {
  const ZONES = [{ zid: 'z-1', zn: 'Room 214' }, { zid: 'z-2', zn: 'Room B' }]

  // A real parsed envelope, produced by the page itself, so the fixtures
  // below are the shape the page actually stores rather than a hand copy.
  let base = null
  beforeEach(async () => {
    const { container } = render(<Harness />)
    await upload(container, /Upload Data/i, makeFile(CSV, 'indoor.csv'))
    base = latest
    cleanup()
    latest = null
  })

  const withDatasets = (datasets) => normalizeSensorData({ ...base, datasets })
  const outdoor = () => ({ ...ds(base), id: 'ds-out', role: 'outdoor', label: 'Outdoor' })

  const openManager = async (zones, initial) => {
    render(<Harness zones={zones} initial={initial} />)
    await tab(/Analysis/i)
    await openCompare()
  }

  it('writes the zone id, never the name, and offers the name to read', async () => {
    await openManager(ZONES, base)
    const select = screen.getByRole('combobox', { name: /Assessment zone for Indoor/i })
    expect([...select.options].map((o) => o.text)).toEqual(['No zone', 'Room 214', 'Room B'])
    expect([...select.options].map((o) => o.value)).toEqual(['', 'z-1', 'z-2'])
    await act(async () => { fireEvent.change(select, { target: { value: 'z-1' } }) })
    expect(ds(latest).zoneId).toBe('z-1')
    // Nothing else about the dataset moved.
    expect(ds(latest).points).toBe(ds(base).points)
  })

  it('clears back to absent rather than to null', async () => {
    await openManager(ZONES, withDatasets([{ ...ds(base), zoneId: 'z-2' }]))
    const select = screen.getByRole('combobox', { name: /Assessment zone for Indoor/i })
    expect(select.value).toBe('z-2')
    await act(async () => { fireEvent.change(select, { target: { value: '' } }) })
    expect(Object.prototype.hasOwnProperty.call(ds(latest), 'zoneId')).toBe(false)
  })

  it('never offers an outdoor baseline a room to sit in', async () => {
    await openManager(ZONES, withDatasets([ds(base), outdoor()]))
    expect(screen.getByRole('combobox', { name: /Assessment zone for Indoor/i })).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: /Assessment zone for Outdoor/i })).toBeNull()
    expect(ZONE_LINKABLE_ROLES).not.toContain('outdoor')
    // The two copies of that list, on either side of the standalone
    // boundary, are pinned to each other. Logger Studio must not import the
    // integrity engine to render one select.
    expect([...ZONE_LINKABLE_ROLES]).toEqual([...LINKABLE_ROLES])
  })

  it('lists the primary for linking but never offers to remove it', async () => {
    await openManager(ZONES, withDatasets([ds(base), outdoor()]))
    expect(screen.queryByRole('button', { name: /Remove Indoor/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Remove Outdoor/i })).toBeTruthy()
  })

  it('shows a dataset whose zone was deleted as unlinked, and rewrites nothing', async () => {
    // The zone is gone. The record still says what the assessor said, and the
    // control shows no room rather than silently offering the survivor.
    await openManager([ZONES[0]], withDatasets([{ ...ds(base), zoneId: 'z-gone' }]))
    expect(screen.getByRole('combobox', { name: /Assessment zone for Indoor/i }).value).toBe('')
    expect(latest).toBeNull()
  })

  it('follows a renamed zone without moving the dataset', async () => {
    const linked = withDatasets([{ ...ds(base), zoneId: 'z-1' }])
    await openManager([{ zid: 'z-1', zn: 'Suite 900 — East' }, ZONES[1]], linked)
    const select = screen.getByRole('combobox', { name: /Assessment zone for Indoor/i })
    expect(select.value).toBe('z-1')
    expect(within(select).getByText('Suite 900 — East')).toBeTruthy()
    expect(latest).toBeNull()
    expect(zoneTitleAt({ zid: 'z-9' }, 2)).toBe('Zone 3')
  })

  it('summarizes how many datasets are linked, so the card is findable', async () => {
    await openManager(ZONES, withDatasets([{ ...ds(base), zoneId: 'z-1' }, outdoor()]))
    expect(screen.getAllByText(/1 linked to zones/).length).toBeGreaterThan(0)
  })

  it('keeps the association through a re-import of the same logger', async () => {
    const { container } = render(<Harness zones={ZONES} initial={withDatasets([{ ...ds(base), zoneId: 'z-2' }])} />)
    // Corrected export, same room. Replacing the readings must not quietly
    // unlink the logger from the zone it was deployed in.
    await upload(container, /^Replace$/i, makeFile(CSV, 'indoor-corrected.csv'))
    expect(ds(latest).zoneId).toBe('z-2')
    expect(ds(latest).fileName).toMatch(/corrected/)
  })
})

// ── 3. The paths that rebuild a dataset ───────────────────────────────────
describe('every path that rebuilds the primary carries the association', () => {
  const page = readFileSync('src/components/sensor/SensorDataPage.jsx', 'utf8')

  it('spreads the association onto every rebuilt primary', () => {
    // A source pin, because a re-parse needs the mapping panel and the rows
    // that produced it. Both sites build `{ ...parsed }` from a FRESH parse
    // that knows nothing about the association, so the carry-forward has to
    // be explicit and is easy to drop when either is next edited.
    const rebuilds = page.match(/const ds = \{ id: primary\?\.id \|\| 'primary'[^\n]*\n/g) || []
    expect(rebuilds.length).toBe(2)
    rebuilds.forEach((line) => expect(line).toMatch(/\.\.\.zoneIdOf\(primary\)/))
  })

  it('applies zone averages without touching the logger datasets', () => {
    // `applyAveragesToReport` writes walkthrough zones. If it ever rewrote
    // the envelope it would have to carry the association too, so pin that
    // it does not rather than leave the question open.
    const app = readFileSync('src/components/MobileApp.jsx', 'utf8')
    const start = app.indexOf('const applyAveragesToReport')
    const body = app.slice(start, app.indexOf('\n  }\n', start))
    expect(start).toBeGreaterThan(0)
    expect(body).not.toMatch(/datasets|sensorData/)
  })
})
