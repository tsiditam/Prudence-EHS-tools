import { describe, it, expect } from 'vitest'
import {
  INVESTIGATION_ENGINE_VERSION,
  isLegacyEngine,
  usesInvestigationFramework,
  routeForEngineVersion,
  parseMajor,
} from '../../lib/investigation/version'

describe('engine version routing (Phases 2 & 35)', () => {
  it('2.x assessments route to the legacy scoring engine', () => {
    expect(isLegacyEngine('2.9.0')).toBe(true)
    expect(isLegacyEngine('2.3')).toBe(true)
    expect(isLegacyEngine('2.6.0')).toBe(true)
    expect(routeForEngineVersion('2.9.0')).toBe('legacy_scoring')
  })

  it('3.x assessments route to the Investigation Decision Framework', () => {
    expect(isLegacyEngine('3.0.0')).toBe(false)
    expect(isLegacyEngine(INVESTIGATION_ENGINE_VERSION)).toBe(false)
    expect(usesInvestigationFramework('3.1.0')).toBe(true)
    expect(routeForEngineVersion('3.0.0-alpha')).toBe('investigation_framework')
  })

  it('unknown / unparseable versions fail safe to legacy (never silently reinterpret)', () => {
    expect(isLegacyEngine(null)).toBe(true)
    expect(isLegacyEngine(undefined)).toBe(true)
    expect(isLegacyEngine('')).toBe(true)
    expect(isLegacyEngine('garbage')).toBe(true)
  })

  it('parseMajor extracts the major version', () => {
    expect(parseMajor('2.9.0')).toBe(2)
    expect(parseMajor('3.0.0-alpha')).toBe(3)
    expect(parseMajor(3)).toBe(3)
    expect(Number.isNaN(parseMajor('x'))).toBe(true)
  })
})
