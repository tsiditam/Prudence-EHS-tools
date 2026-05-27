/**
 * Parity guard: the CommonJS AI-narrative mirror
 * (api/_banned-language.js) must stay byte-for-byte equivalent to the
 * engine's canonical ruleset (src/engine/report/cih-validation.ts).
 * If these drift, the AI narrative path and the deterministic report
 * path would enforce different language rules.
 */

import { describe, it, expect } from 'vitest'
import {
  TONE_BANNED_TERMS,
  CONTEXT_AWARE_BANS,
  scanProseForBannedLanguage,
} from '../../src/engine/report/cih-validation'
import * as mirrorNs from '../../api/_banned-language.js'

const mirror: any = (mirrorNs as any).default ?? mirrorNs

const serializeBan = (b: any) => ({
  id: b.id,
  pattern: b.pattern.source,
  patternFlags: b.pattern.flags,
  requiredContext: b.requiredContext ? b.requiredContext.source : null,
  requiredFlags: b.requiredContext ? b.requiredContext.flags : null,
  allowedContext: (b.allowedContext || []).map((r: RegExp) => r.source),
  allowedFlags: (b.allowedContext || []).map((r: RegExp) => r.flags),
  category: b.category,
  recommendedFix: b.recommendedFix,
})

describe('banned-language parity — engine vs api mirror', () => {
  it('TONE_BANNED_TERMS are identical', () => {
    expect([...mirror.TONE_BANNED_TERMS]).toEqual([...TONE_BANNED_TERMS])
  })

  it('CONTEXT_AWARE_BANS definitions are identical', () => {
    expect(mirror.CONTEXT_AWARE_BANS.map(serializeBan)).toEqual(
      CONTEXT_AWARE_BANS.map(serializeBan),
    )
  })

  it('scan results are identical across both implementations', () => {
    const samples = [
      'The ventilation system is in compliance with ASHRAE 62.1.',
      'The reported symptoms are consistent with hypersensitivity pneumonitis.',
      'We have high confidence that mold caused the occupant symptoms.',
      'We definitively conclude the source is microbial growth.',
      'Sick building syndrome was identified at this facility.',
      // allow-list cases
      'Findings are consistent with insufficient outdoor air delivery.',
      'There is high confidence in the measured CO2 excursion.',
      'Presented as professional judgment rather than definitive determinations.',
      'This is not a sick building syndrome determination.',
      'Ensure all instruments are calibrated within manufacturer specifications.',
    ]
    for (const s of samples) {
      const engineTerms = scanProseForBannedLanguage(s).map(h => h.term).sort()
      const mirrorTerms = mirror.scan(s).map((h: any) => h.term).sort()
      expect(mirrorTerms).toEqual(engineTerms)
    }
  })
})
