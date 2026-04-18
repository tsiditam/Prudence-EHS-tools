/**
 * AtmosFlow Escalation Decision Tree
 * Rules-based (not scored). Evaluated after every assessment save and complaint entry.
 * Returns array of triggered rules with rationale strings.
 */

export function evaluateEscalation(assessment, complaints, history) {
  const triggers = []
  const zones = assessment?.zones || []
  const comp = assessment?.comp || assessment?.composite
  const moldResults = assessment?.moldResults || []

  // Mold: IICRC S520 Condition 2 ≥10 sq ft OR any Condition 3
  moldResults.forEach(m => {
    if (m.condition >= 3) {
      triggers.push({ rule: 'mold_condition_3', severity: 'critical', rationale: `IICRC S520 Condition 3 identified: ${m.visual}. Professional mold assessment and remediation required.` })
    } else if (m.condition >= 2 && m.sqft && m.sqft >= 10) {
      triggers.push({ rule: 'mold_condition_2_large', severity: 'high', rationale: `IICRC S520 Condition 2 affecting ≥10 sq ft. Professional evaluation recommended before remediation.` })
    }
  })

  // CO > 9 ppm sustained
  zones.forEach(z => {
    if (z.co && +z.co > 9) {
      triggers.push({ rule: 'combustion_byproducts', severity: 'critical', rationale: `Carbon monoxide reading of ${z.co} ppm detected in ${z.zn || 'a zone'}. Investigate potential combustion source immediately.` })
    }
  })

  // Any complaint with medicalAttention
  const recentComplaints = (complaints || []).filter(c => {
    const age = Date.now() - new Date(c.dateReported).getTime()
    return age < 30 * 86400000
  })

  recentComplaints.forEach(c => {
    if (c.medicalAttention) {
      triggers.push({ rule: 'medical_attention', severity: 'critical', rationale: `Occupant sought medical attention related to building conditions (${c.location || 'unspecified location'}).` })
    }
  })

  // ≥3 complaints in 30 days with overlapping symptoms
  if (recentComplaints.length >= 3) {
    const allSymptoms = recentComplaints.flatMap(c => c.symptoms || [])
    const counts = {}
    allSymptoms.forEach(s => { counts[s] = (counts[s] || 0) + 1 })
    const overlapping = Object.entries(counts).filter(([, n]) => n >= 2).map(([s]) => s)
    if (overlapping.length > 0) {
      triggers.push({ rule: 'complaint_cluster', severity: 'high', rationale: `${recentComplaints.length} complaints in 30 days with overlapping symptoms: ${overlapping.join(', ')}.` })
    }
  }

  // Critical tier on 2+ consecutive assessments of same area
  if (history && history.length >= 2) {
    const lastTwo = history.slice(0, 2)
    if (lastTwo.every(h => h.risk === 'Critical' || (h.comp?.risk || h.composite?.risk) === 'Critical')) {
      triggers.push({ rule: 'consecutive_critical', severity: 'critical', rationale: 'Critical air quality on two or more consecutive assessments. Professional investigation strongly recommended.' })
    }
  }

  // Visible hazards (from zone data)
  zones.forEach(z => {
    if (z.hazard_visible) {
      triggers.push({ rule: 'visible_hazard', severity: 'critical', rationale: `Visible hazard reported: ${z.hazard_visible}. Professional evaluation required.` })
    }
  })

  // TVOC > 3000 µg/m³ on prosumer/professional PID
  zones.forEach(z => {
    if (z.tv && +z.tv > 3000 && z.pid_lamp && z.pid_lamp !== 'No PID used') {
      triggers.push({ rule: 'tvoc_extreme', severity: 'high', rationale: `TVOC reading of ${z.tv} µg/m³ in ${z.zn || 'a zone'}. Compound-specific investigation recommended.` })
    }
  })

  return triggers
}

export function hasActiveEscalation(triggers) {
  return triggers.length > 0
}

export function highestSeverity(triggers) {
  if (triggers.some(t => t.severity === 'critical')) return 'critical'
  if (triggers.some(t => t.severity === 'high')) return 'high'
  return null
}
