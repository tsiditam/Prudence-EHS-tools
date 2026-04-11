/**
 * AtmosFlow Technical Report Authoring Engine
 * QA Rule Definitions — validates every section before render
 *
 * Each rule returns { pass: boolean, issue?: string, severity: 'error' | 'warning' }
 * Sections must pass all error-severity rules to be approved.
 */

export const QA_RULES = [

  // ─── Hallucination Prevention ───
  {
    id: 'no-hallucinated-measurements',
    severity: 'error',
    description: 'Section must not contain measurement values not present in reportPayload',
    check: (section, payload) => {
      // Extract all numbers followed by units from the section content
      const measurements = section.content.match(/\d+\.?\d*\s*(ppm|µg\/m³|°F|%|mg\/m³)/g) || []
      // Verify each against zone data
      const validValues = new Set()
      payload.zoneData.forEach(z => {
        ;['co2','co2o','tf','tfo','rh','rho','pm','pmo','co','tv','tvo','hc'].forEach(k => {
          if (z[k]) validValues.add(z[k])
        })
      })
      // Composite scores are also valid
      validValues.add(String(payload.scoring.composite.tot))
      validValues.add(String(payload.scoring.composite.avg))
      validValues.add(String(payload.scoring.composite.worst))
      payload.scoring.zones.forEach(z => {
        validValues.add(String(z.tot))
        z.cats.forEach(c => validValues.add(String(c.s)))
      })

      const invalid = measurements.filter(m => {
        const num = m.match(/\d+\.?\d*/)?.[0]
        return num && !validValues.has(num)
      })
      return { pass: invalid.length === 0, issue: invalid.length > 0 ? `Possible hallucinated values: ${invalid.join(', ')}` : undefined }
    }
  },

  {
    id: 'no-invented-standards',
    severity: 'error',
    description: 'Section must not reference standards not in payload.standards',
    check: (section, payload) => {
      const allowed = (payload.standards || []).map(s => s.toLowerCase())
      // Extract all standard-like references from content
      const stdPatterns = [
        ...section.content.matchAll(/ASHRAE\s+[\d.]+[-\d]*/gi),
        ...section.content.matchAll(/\d+\s+CFR\s+\d+[.\d]*/gi),
        ...section.content.matchAll(/NIOSH\s+\w+/gi),
        ...section.content.matchAll(/NFPA\s+\d+/gi),
        ...section.content.matchAll(/ANSI\s+\w+/gi),
      ]
      const found = [...stdPatterns].map(m => m[0])
      const unrecognized = found.filter(f => !allowed.some(a => a.includes(f.toLowerCase().split(' ')[0])))
      return {
        pass: unrecognized.length === 0,
        issue: unrecognized.length > 0 ? `Unrecognized standard references: ${unrecognized.join(', ')}. Allowed: ${payload.standards.join(', ')}` : undefined
      }
    }
  },

  // ─── Causation Language ───
  {
    id: 'no-unsupported-causation',
    severity: 'error',
    description: 'Must not use definitive causation language',
    check: (section) => {
      const forbidden = ['proves', 'confirms root cause', 'definitively caused', 'guarantees', 'bulletproof', 'OSHA violation']
      const found = forbidden.filter(f => section.content.toLowerCase().includes(f.toLowerCase()))
      return { pass: found.length === 0, issue: found.length > 0 ? `Forbidden language found: ${found.join(', ')}` : undefined }
    }
  },

  {
    id: 'restrained-tone',
    severity: 'warning',
    description: 'Should use restrained consulting language',
    check: (section) => {
      const aggressive = ['unsafe', 'dangerous', 'lethal', 'illegal', 'must be fixed immediately', 'unacceptable']
      const found = aggressive.filter(f => section.content.toLowerCase().includes(f.toLowerCase()))
      return { pass: found.length === 0, issue: found.length > 0 ? `Consider softer language for: ${found.join(', ')}` : undefined }
    }
  },

  // ─── Completeness ───
  {
    id: 'minimum-length',
    severity: 'warning',
    description: 'AI-written sections should have minimum substance',
    check: (section) => {
      if (!section.content) return { pass: false, issue: 'Section is empty' }
      const words = section.content.split(/\s+/).length
      return { pass: words >= 30, issue: words < 30 ? `Only ${words} words — may lack substance` : undefined }
    }
  },

  {
    id: 'no-placeholder-text',
    severity: 'error',
    description: 'Must not contain placeholder or template text',
    check: (section) => {
      const placeholders = ['[TODO]', '[INSERT]', '[PLACEHOLDER]', 'Lorem ipsum', '{facility.', '{scoring.']
      const found = placeholders.filter(p => section.content.includes(p))
      return { pass: found.length === 0, issue: found.length > 0 ? `Contains placeholder: ${found.join(', ')}` : undefined }
    }
  },

  // ─── Score Consistency ───
  {
    id: 'score-matches-payload',
    severity: 'error',
    description: 'Any score mentioned must match the payload',
    check: (section, payload) => {
      const compositeMatch = section.content.match(/composite.*?(\d+)\s*\/\s*100/i)
      if (compositeMatch) {
        const mentioned = parseInt(compositeMatch[1])
        if (mentioned !== payload.scoring.composite.tot) {
          return { pass: false, issue: `Mentioned composite ${mentioned} but payload has ${payload.scoring.composite.tot}` }
        }
      }
      return { pass: true }
    }
  },

  // ─── Repetition ───
  {
    id: 'no-excessive-repetition',
    severity: 'warning',
    description: 'Should not repeat the same sentence or phrase excessively',
    check: (section) => {
      const sentences = section.content.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 20)
      const seen = new Set()
      const duplicates = sentences.filter(s => {
        if (seen.has(s)) return true
        seen.add(s)
        return false
      })
      return { pass: duplicates.length === 0, issue: duplicates.length > 0 ? `${duplicates.length} repeated sentence(s)` : undefined }
    }
  },

  // ─── Professional Quality ───
  {
    id: 'no-weak-language',
    severity: 'warning',
    description: 'Should avoid weak or generic filler language',
    check: (section) => {
      const weak = ['it is important to note that', 'it should be noted that', 'in conclusion', 'as mentioned above', 'needless to say']
      const found = weak.filter(w => section.content.toLowerCase().includes(w))
      return { pass: found.length === 0, issue: found.length > 0 ? `Weak language: ${found.join(', ')}` : undefined }
    }
  },

  // ─── Payload Immutability ───
  {
    id: 'no-score-override',
    severity: 'error',
    description: 'Section must not contain scores that contradict the payload',
    check: (section, payload) => {
      // Check for risk level mismatches
      const riskLevels = ['Critical', 'High Risk', 'Moderate', 'Low Risk']
      const payloadRisk = payload.scoring?.composite?.risk
      if (!payloadRisk) return { pass: true }
      // If section mentions a different risk level than the payload
      const otherRisks = riskLevels.filter(r => r !== payloadRisk)
      const contradicts = otherRisks.some(r =>
        section.content.includes(`composite`) && section.content.includes(r) && !section.content.includes(payloadRisk)
      )
      return { pass: !contradicts, issue: contradicts ? `Section may contradict payload risk level (${payloadRisk})` : undefined }
    }
  },

  // ─── Section Boundary ───
  {
    id: 'no-section-bleed',
    severity: 'warning',
    description: 'Section should stay within its designated scope',
    check: (section) => {
      // Executive summary should not contain detailed zone measurements
      if (section.sectionId === 'exec-summary') {
        const hasDetailedMeasurements = (section.content.match(/\d+\.?\d*\s*(ppm|µg\/m³)/g) || []).length > 3
        return { pass: !hasDetailedMeasurements, issue: hasDetailedMeasurements ? 'Executive summary contains too many detailed measurements — belongs in zone sections' : undefined }
      }
      // Limitations section should not contain recommendations
      if (section.sectionId === 'limitations') {
        const hasRecs = section.content.toLowerCase().includes('recommend') && section.content.toLowerCase().includes('should')
        return { pass: !hasRecs, issue: hasRecs ? 'Limitations section appears to contain recommendations — belongs in recommendations register' : undefined }
      }
      return { pass: true }
    }
  },

  // ─── AI Attribution ───
  {
    id: 'no-ai-self-reference',
    severity: 'error',
    description: 'AI-written sections must not reference themselves as AI',
    check: (section) => {
      const selfRef = ['as an AI', 'as a language model', 'I cannot', 'I don\'t have access', 'based on my training']
      const found = selfRef.filter(s => section.content.toLowerCase().includes(s.toLowerCase()))
      return { pass: found.length === 0, issue: found.length > 0 ? `AI self-reference detected: ${found.join(', ')}` : undefined }
    }
  },

  // ─── Maximum Length Enforcement ───
  {
    id: 'max-length-check',
    severity: 'warning',
    description: 'AI-written sections must not exceed specified max length',
    check: (section) => {
      if (!section.maxLength) return { pass: true }
      const words = section.content.split(/\s+/).length
      return { pass: words <= section.maxLength * 1.2, issue: words > section.maxLength * 1.2 ? `Section is ${words} words, max is ${section.maxLength} — may need trimming` : undefined }
    }
  },
]

/**
 * Run all QA rules on a section
 * @returns { status, qaScore, qaIssues }
 */
export function runQA(section, payload) {
  const results = QA_RULES.map(rule => ({
    ...rule,
    result: rule.check(section, payload)
  }))

  const errors = results.filter(r => r.severity === 'error' && !r.result.pass)
  const warnings = results.filter(r => r.severity === 'warning' && !r.result.pass)

  const qaScore = Math.max(0, 100 - (errors.length * 25) - (warnings.length * 5))

  return {
    ...section,
    status: errors.length > 0 ? 'qa_failed' : 'qa_passed',
    qaScore,
    qaIssues: [
      ...errors.map(e => `ERROR: ${e.result.issue}`),
      ...warnings.map(w => `WARNING: ${w.result.issue}`),
    ]
  }
}
