/**
 * homeView — which home screen a user lands on by mode.
 *
 * Regression guard for the "selecting my saved CSP profile shows the old UI"
 * bug: IH/CSP users must land on the project-centric 'projects' home, not the
 * legacy 'dash' co-pilot home. Facility-Manager mode keeps 'dash'.
 */
import { describe, it, expect } from 'vitest'
import { homeView } from '../../src/constants/terminology'

describe('homeView', () => {
  it('routes IH / CSP / consultant users to the projects home', () => {
    expect(homeView('ih')).toBe('projects')
  })
  it('keeps Facility-Manager mode on the legacy dashboard home', () => {
    expect(homeView('fm')).toBe('dash')
  })
  it('treats any non-fm / unknown mode as the projects home', () => {
    expect(homeView('')).toBe('projects')
    expect(homeView('consultant')).toBe('projects')
  })
})
