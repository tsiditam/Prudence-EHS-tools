/**
 * The header ⋯ menu (screen actions) — a structural pin on MobileApp.jsx.
 *
 * The rule the menu follows: the hamburger and the rail are where you GO;
 * the ⋯ is what you can DO to the thing on screen. This test reads the
 * shell source, as ai-sections-edit does for the Report tab, and pins:
 *
 *   • no destination rides in the menu (Search, the assistant launcher)
 *   • the export is reachable from the Report tab, not only from the menu
 *   • the menu's labels say what happens, in sentence case
 *   • the widget is the menu it declares: arrow keys, Home/End, Escape,
 *     a separator between groups, the danger ink on the one removal
 *   • the trigger is drawn only when the screen has actions of its own
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(process.cwd(), 'src/components/MobileApp.jsx'), 'utf8')

// The builder, from its banner comment to the filter that closes it.
const builder = src.slice(
  src.indexOf('// ── Screen actions (the header ⋯ overflow)'),
  src.indexOf(']).filter(g => g.length > 0)'),
)
// The menu render, from its banner comment to the milestone that follows.
const menu = src.slice(
  src.indexOf('{/* Context action menu — opened from the header ⋯ overflow.'),
  src.indexOf('{/* Milestone — a piece of work has ended'),
)

describe('screen actions menu', () => {
  it('carries actions on the thing on screen, never a destination', () => {
    expect(builder.length).toBeGreaterThan(200)
    expect(builder).not.toMatch(/label:\s*'Search'/)
    expect(builder).not.toMatch(/setVoiceCmdOpen/)
    expect(builder).not.toMatch(/setFaOpen/)
    expect(builder).not.toMatch(/label:\s*'Ask AtmosFlow AI'/)
  })

  it('labels say what happens, in sentence case', () => {
    for (const label of ['Export Word report', 'Export PDF', 'Share', 'Send for peer review', 'Check for discrepancies', 'Reopen for edits', 'Report details', 'Move to trash']) {
      expect(builder).toContain(`label:'${label}'`)
    }
    expect(builder).not.toContain('Generate reports')
    expect(builder).not.toContain('Discrepancies Check')
  })

  it('offers the deliverable from the Report tab, not only from the menu', () => {
    const calls = src.match(/handleExport\('docx','atmosflow'\)/g) || []
    // One in the menu builder, one on the Report tab.
    expect(calls.length).toBeGreaterThanOrEqual(2)
    const reportTab = src.slice(src.indexOf("{rTab==='report' && ("), src.indexOf("{rTab==='logger' &&"))
    expect(reportTab).toContain("handleExport('docx','atmosflow')")
    expect(reportTab).toContain('Export Word report')
    // The PDF path was implemented with no way in; now it has one.
    expect(reportTab).toMatch(/handleExport\('pdf'/)
  })

  it('is a menu widget: keyboard, groups, a danger slot', () => {
    expect(menu).toContain('role="menu"')
    expect(menu).toContain('role="menuitem"')
    expect(menu).toContain('role="separator"')
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape']) expect(menu).toContain(`'${key}'`)
    expect(menu).toContain("'af-menu-item is-danger'")
    expect(builder).toMatch(/label:'Move to trash'[^\n]*danger:true/)
    // Focus returns to the trigger when the menu closes.
    expect(src).toMatch(/kebabRef\.current\?\.focus/)
  })

  it('draws the trigger only when the screen has actions of its own', () => {
    expect(src).toContain('profile && screenActionGroups.length > 0 && (')
    expect(src).not.toMatch(/profile && view!=='dash' && \(\s*<button/)
  })
})
