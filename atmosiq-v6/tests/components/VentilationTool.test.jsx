// @vitest-environment jsdom
/**
 * VentilationTool — the page holds still while the assessor types.
 *
 * Every result block used to mount on the keystroke that made it valid and
 * unmount on the one that did not: the requirement grid appeared on the
 * first digit of the occupant count, the delivered stats and their
 * assumptions arrived once the CO₂ differential cleared 50 ppm, and the
 * comparison replaced a one-line note with a three-figure block. Each
 * appearance dropped everything below it down the page, so entering a
 * reading moved the field being typed into.
 *
 * The fix is structural, so the test is too: the result scaffolding is on
 * the page from the first render, showing "—" until there is a figure, and
 * the same nodes are still there once every field is filled. What changes
 * is the text inside them, not the shape of the page.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import VentilationTool from '../../src/components/VentilationTool'

/** Labels that must be present whatever the inputs hold. */
const ALWAYS = [
  'Breathing zone', 'Zone outdoor air', 'Per person · breathing zone',   // section 1
  'Delivered', 'Differential', 'Generation rate',                        // section 2, steady
  'Delivered · est.', 'Required · 62.1 Vbz',                             // section 3
]

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const countBullets = (c) => c.querySelectorAll('ul li').length

afterEach(() => { cleanup(); window.localStorage.clear() })

describe('VentilationTool layout stability', () => {
  it('renders the whole result scaffolding before anything is entered', () => {
    render(<VentilationTool />)
    for (const label of ALWAYS) expect(screen.getByText(label), label).toBeTruthy()
    // Placeholders, not absent rows.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6)
  })

  it('states the method assumptions before there is a result to state them with', () => {
    const { container } = render(<VentilationTool />)
    expect(countBullets(container)).toBe(3)
    expect(screen.getByText(/steady long enough to reach equilibrium/)).toBeTruthy()
  })

  it('keeps the same blocks through an empty → invalid → valid entry', () => {
    const { container } = render(<VentilationTool />)
    const shape = () => ({
      labels: ALWAYS.every((l) => screen.queryByText(l) !== null),
      bullets: countBullets(container),
      stats: container.querySelectorAll('[data-stat]').length,
    })
    const before = shape()

    type('Occupants', '12')
    type('Floor area', '1500')
    // Differential below the 50 ppm floor: an error, not a figure.
    type('Indoor CO2', '440')
    expect(screen.getByText(/below the 50 ppm floor/)).toBeTruthy()
    expect(shape()).toEqual(before)

    // A usable reading.
    type('Indoor CO2', '1100')
    expect(screen.getByText(/Estimated delivery is about/)).toBeTruthy()
    expect(shape()).toEqual(before)
  })

  it('keeps the differential on screen when it is the reason for the refusal', () => {
    render(<VentilationTool />)
    type('Indoor CO2', '440')   // 440 − 420 = 20 ppm
    expect(screen.getByText('20')).toBeTruthy()
  })

  it('shows the comparison figures as placeholders until both sides exist', () => {
    render(<VentilationTool />)
    expect(screen.getByText('Awaiting both figures')).toBeTruthy()
    type('Occupants', '12')
    type('Floor area', '1500')
    type('Indoor CO2', '1100')
    expect(screen.queryByText('Awaiting both figures')).toBeNull()
    expect(screen.getByText('Near minimum')).toBeTruthy()
  })
})
