/**
 * Every Jasper activity state goes through the one component.
 *
 * Four surfaces show the assistant working: Logger Forensics reading the
 * patterns, the Report tab writing the narrative and the report sections,
 * and the assistant sheet between the question and the first token. Each
 * used to own its own busy state — a ring spinner beside a static line on
 * three of them, and a second hand-rolled copy of the brain's SVG paths
 * and keyframes on the fourth.
 *
 * The defect that pattern produces is not visual, it is drift: the brief
 * that refined the Forensics status did not reach the other three, because
 * nothing connected them. So this reads the sources and pins the property
 * rather than any particular styling — a surface may change how its status
 * looks, but it may not go back to owning one.
 *
 * Deliberately NOT in scope, and these must not be added: the logger
 * upload card, the monitoring report DOCX build, and the photo screening
 * badge. None of them is Jasper — the first two are deterministic work and
 * the third is a thumbnail marker — so the assistant's activity mark would
 * claim an author that is not there.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8')

const SURFACES = [
  { file: 'src/components/sensor/ForensicsPanel.jsx', context: 'logger-forensics' },
  { file: 'src/components/MobileApp.jsx', context: 'report-narrative' },
  { file: 'src/components/MobileApp.jsx', context: 'report-sections' },
  { file: 'src/components/FieldAssistant.jsx', context: 'assistant' },
]

describe('the four Jasper surfaces share one activity state', () => {
  it.each(SURFACES)('$context renders JasperActivity', ({ file, context }) => {
    const src = read(file)
    expect(src).toMatch(/import JasperActivity(,|\s+from)/)
    expect(src).toContain(`context="${context}"`)
  })

  it.each([...new Set(SURFACES.map((s) => s.file))])('%s spins no ring while Jasper works', (file) => {
    const src = read(file)
    // A rotating border-top ring is the generic loader the activity state
    // replaced. The brain is the indicator now.
    expect(src).not.toMatch(/animation:\s*'(faSpin|spin)[^']*'/)
    expect(src).not.toMatch(/borderTopColor:\s*ACCENT[\s\S]{0,120}?animation/)
  })

  it('states no static AI busy copy anywhere', () => {
    for (const file of new Set(SURFACES.map((s) => s.file))) {
      const src = read(file)
      expect(src, file).not.toContain('Generating narrative from assessment data')
      expect(src, file).not.toContain('Writing report sections from assessment data')
      expect(src, file).not.toMatch(/label=\{busy \? 'Reading…'/)
    }
  })

  it('keeps one copy of the brain, in JasperBrainIcon', () => {
    const icon = read('src/components/JasperBrainIcon.jsx')
    // The first groove path is the mark's signature; a second literal copy
    // of it in a consumer means the SVG was hand-rolled again.
    expect(icon).toContain("'M12 18V5'")
    for (const file of new Set(SURFACES.map((s) => s.file))) {
      expect(read(file), file).not.toContain("'M12 18V5'")
    }
    // The trace keyframe belongs to the icon that runs it.
    expect(icon).toContain('@keyframes jasperBrainTrace')
    expect(read('src/components/FieldAssistant.jsx')).not.toContain('@keyframes jasperBrainTrace')
  })
})
