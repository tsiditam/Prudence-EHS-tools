import { describe, it, expect } from 'vitest'
import { evaluateEscalations } from '../../lib/investigation/escalation'
import { InvestigationPriority } from '../../lib/investigation/types'

describe('escalation registry (Phase 20)', () => {
  it('multiple Tier-1 exceedance → immediate evaluation + professional review, no violation language', () => {
    const n = evaluateEscalations({ co: '60', hc: '0.9' }, 'Z')
    const esc = n.find((e) => e.ruleId === 'AF-ESC-MULTI-CONTAMINANT')!
    expect(esc.priority).toBe(InvestigationPriority.IMMEDIATE_EVALUATION)
    expect(esc.professionalReviewRequired).toBe(true)
    expect(esc.prohibitedOverstatement.some((p) => /osha violation/i.test(p))).toBe(true)
  })

  it('drain-pan standing water → critical HVAC escalation', () => {
    const n = evaluateEscalations({ dp: 'Standing water' }, 'Z')
    expect(n.some((e) => e.ruleId === 'AF-ESC-HVAC-CRITICAL')).toBe(true)
  })

  it('active leak → active-water escalation (priority)', () => {
    const n = evaluateEscalations({ wd: 'Active leak' }, 'Z')
    const esc = n.find((e) => e.ruleId === 'AF-ESC-ACTIVE-WATER')!
    expect(esc.priority).toBe(InvestigationPriority.PRIORITY)
  })

  it('CO above the PEL → escalation, but no immediate-danger language', () => {
    const n = evaluateEscalations({ co: '60' }, 'Z')
    const esc = n.find((e) => e.ruleId === 'AF-ESC-CO-ABOVE-PEL')!
    expect(esc.professionalReviewRequired).toBe(true)
    expect(esc.prohibitedOverstatement.some((p) => /immediate danger/i.test(p))).toBe(true)
  })

  it('a clean zone produces no escalations', () => {
    expect(evaluateEscalations({ co: '1', pm: '8' }, 'Z')).toHaveLength(0)
  })
})
