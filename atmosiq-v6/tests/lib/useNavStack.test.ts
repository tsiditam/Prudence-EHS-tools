/**
 * useNavStack — the in-app navigation stack (src/hooks/useNavStack.js).
 *
 * Pins the rules the shell relies on:
 *   - navigate pushes; navigating to the entry directly beneath pops
 *     (so a popstate that lands on the previous screen reads as back)
 *   - a dock tab (reset) collapses the stack to one entry
 *   - back pops, and with nothing beneath falls to the route's declared
 *     parent, then to home — never to nowhere
 *   - the same view navigated twice refreshes params in place
 *   - backView names what back() would do, so the header pill can say it
 */
import { describe, it, expect } from 'vitest'
import { createNavState, navReduce, backTarget } from '../../src/hooks/useNavStack.js'
import { ROUTES } from '../../src/constants/routes.js'

const go = (s, view, params = null) => navReduce(s, { type: 'navigate', view, params })
const back = (s, home = 'projects') => navReduce(s, { type: 'back', home })
const reset = (s, view) => navReduce(s, { type: 'reset', view })
const views = (s) => s.stack.map((e) => e.view)

describe('navReduce — navigate', () => {
  it('pushes a new screen with dir forward', () => {
    const s = go(createNavState('projects'), 'project-detail', { projectId: 'p1' })
    expect(views(s)).toEqual(['projects', 'project-detail'])
    expect(s.dir).toBe('forward')
    expect(s.stack[1].params).toEqual({ projectId: 'p1' })
  })

  it('navigating to the entry beneath pops instead of pushing (dir back)', () => {
    let s = go(createNavState('projects'), 'project-detail')
    s = go(s, 'sensor-data', { projectId: 'p1' })
    s = go(s, 'project-detail')
    expect(views(s)).toEqual(['projects', 'project-detail'])
    expect(s.dir).toBe('back')
  })

  it('the same view again refreshes params in place, never a duplicate entry', () => {
    let s = go(createNavState('projects'), 'sensor-data', { projectId: 'p1' })
    const same = go(s, 'sensor-data', { projectId: 'p1' })
    expect(same).toBe(s)
    s = go(s, 'sensor-data', { projectId: 'p2' })
    expect(views(s)).toEqual(['projects', 'sensor-data'])
    expect(s.stack[1].params).toEqual({ projectId: 'p2' })
  })

  it('ignores an empty view', () => {
    const s = createNavState('projects')
    expect(go(s, '')).toBe(s)
  })
})

describe('navReduce — reset (dock tab)', () => {
  it('collapses the stack to the tab with dir tab', () => {
    let s = go(createNavState('projects'), 'project-detail')
    s = go(s, 'sensor-data')
    s = reset(s, 'tools')
    expect(views(s)).toEqual(['tools'])
    expect(s.dir).toBe('tab')
  })

  it('is a no-op when already exactly that one screen', () => {
    const s = createNavState('projects')
    expect(reset(s, 'projects')).toBe(s)
  })
})

describe('navReduce — back', () => {
  it('pops when there is something beneath', () => {
    let s = go(createNavState('tools'), 'ventilation')
    s = back(s)
    expect(views(s)).toEqual(['tools'])
    expect(s.dir).toBe('back')
  })

  it('falls to the declared parent when the stack is a single entry (reload / deep link)', () => {
    const s = back(createNavState('ventilation'))
    expect(views(s)).toEqual([ROUTES.ventilation.parent])
    expect(ROUTES.ventilation.parent).toBe('tools')
  })

  it('falls to home when the route has no parent', () => {
    const s = back(createNavState('dash'), 'projects')
    expect(views(s)).toEqual(['projects'])
  })

  it('stays put on the home screen itself', () => {
    const s = createNavState('projects')
    expect(back(s, 'projects')).toBe(s)
  })
})

describe('backTarget — what the header pill names', () => {
  it('is the previous entry when there is one', () => {
    const s = go(go(createNavState('projects'), 'project-detail'), 'sampling-forms')
    expect(backTarget(s, 'projects')).toBe('project-detail')
  })
  it('is the route parent when the stack is flat', () => {
    expect(backTarget(createNavState('report'), 'projects')).toBe('history')
    expect(backTarget(createNavState('incident-detail'), 'projects')).toBe('incident-log')
  })
  it('is null on home (nothing to go back to)', () => {
    expect(backTarget(createNavState('projects'), 'projects')).toBeNull()
  })
})

describe('the tool-context contract', () => {
  it('a tool opened from a project returns to that project and carries its id', () => {
    let s = go(createNavState('projects'), 'project-detail', { projectId: 'p1' })
    s = go(s, 'sensor-data', { projectId: 'p1' })
    expect(s.stack[s.stack.length - 1].params).toEqual({ projectId: 'p1' })
    expect(backTarget(s, 'projects')).toBe('project-detail')
    expect(views(back(s))).toEqual(['projects', 'project-detail'])
  })
  it('the same tool opened from the hub returns to the hub with no project', () => {
    let s = go(reset(createNavState('projects'), 'tools'), 'sensor-data')
    expect(s.stack[s.stack.length - 1].params).toBeNull()
    expect(backTarget(s, 'projects')).toBe('tools')
  })
})
