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

  // ── Qualitative observation rules (v2.2) ──
  const observations = assessment?.observations || {}
  const odors = observations.odors || []

  if (odors.includes('Sewer / sulfur')) {
    triggers.push({ rule: 'Q1_sewer_sulfur_odor', severity: 'critical', rationale: 'Sewer or sulfur odor reported. Possible sewer gas infiltration, hydrogen sulfide, or plumbing trap failure — immediate professional evaluation recommended.' })
  }
  if (odors.includes('Combustion / smoky')) {
    triggers.push({ rule: 'Q2_indoor_combustion_odor', severity: 'critical', rationale: 'Combustion or smoky odor reported indoors. Possible CO or combustion byproduct infiltration — evaluate immediately.' })
  }
  const moldVals = ['Suspected small (< 10 sq ft)', 'Suspected large (10-100 sq ft)', 'Suspected extensive (> 100 sq ft)']
  if (moldVals.includes(observations.visibleMold)) {
    triggers.push({ rule: 'Q3_visible_mold_suspected', severity: 'high', rationale: 'Visible suspected mold reported. IICRC S520 professional assessment and remediation scoping recommended.' })
  }
  const waterSigns = ['Old staining', 'Active leak', 'Recent event']
  if (waterSigns.includes(observations.waterMoisture) && odors.includes('Musty / earthy')) {
    triggers.push({ rule: 'Q4_moisture_plus_musty', severity: 'high', rationale: 'Water intrusion or staining combined with musty odor. Hidden mold growth is likely — IICRC S520 professional assessment recommended.' })
  }
  const chemOdors = odors.filter(o => o.startsWith('Chemical'))
  const respiratorySymptoms = ['Cough', 'Shortness of breath', 'Throat irritation']
  const hasRecentRespiratory = recentComplaints.some(c => (c.symptoms || []).some(s => respiratorySymptoms.includes(s)))
  if (chemOdors.length > 0 && hasRecentRespiratory) {
    triggers.push({ rule: 'Q5_chemical_plus_respiratory', severity: 'high', rationale: 'Chemical odor combined with recent respiratory complaints. Professional industrial hygiene evaluation recommended.' })
  }
  if (observations.visibleParticulate === 'Heavy dust or debris' && hasRecentRespiratory) {
    triggers.push({ rule: 'Q6_heavy_dust_plus_respiratory', severity: 'high', rationale: 'Heavy visible particulate combined with recent respiratory complaints. Evaluate source, ventilation, and potential respirable dust exposure.' })
  }
  if (observations.waterMoisture === 'Active leak') {
    triggers.push({ rule: 'Q7_active_leak', severity: 'high', rationale: 'Active water leak observed. Repair and professional moisture/mold assessment recommended within 48–72 hours.' })
  }

  // ── Construction activity rules (v2.2) ──
  const building = assessment?.building || assessment?.bldg || {}
  const activity = building.fm_activity || ''
  const isConstruction = activity.includes('construction') || activity.includes('renovation')
  const isRecentReno = activity.includes('Recent renovation')
  const bYear = building.fm_construction_year ? +building.fm_construction_year : null
  const subtypes = building.fm_activity_subtype || []

  if (activity.includes('Active construction')) {
    triggers.push({ rule: 'C1_active_construction', severity: 'high', rationale: 'Active construction or renovation in occupied building. Professional IAQ monitoring recommended for duration of activity.' })
  }
  if (bYear && bYear < 1980 && (isConstruction || isRecentReno)) {
    triggers.push({ rule: 'C2_pre1980_renovation_asbestos_risk', severity: 'critical', rationale: 'Building constructed before 1980 with active or recent renovation. Asbestos-containing materials may be disturbed — AHERA-compliant inspection recommended.' })
  }
  if (bYear && bYear < 1978 && subtypes.includes('Paint disturbance')) {
    triggers.push({ rule: 'C3_pre1978_lead_paint_risk', severity: 'critical', rationale: 'Building constructed before 1978 with paint disturbance activity. Lead-based paint risk — EPA RRP-certified contractor required under 40 CFR Part 745.' })
  }
  const silicaActivities = ['Concrete cutting', 'Masonry work', 'Drywall demolition']
  if (subtypes.some(s => silicaActivities.includes(s))) {
    triggers.push({ rule: 'C4_silica_generating_activity', severity: 'high', rationale: 'Construction activity involves respirable crystalline silica generation. OSHA 29 CFR 1926.1153 compliance required — professional exposure monitoring recommended.' })
  }
  if (activity.includes('Water damage') && building.fm_dryout_documented !== 'Yes') {
    triggers.push({ rule: 'C5_water_event_without_dryout', severity: 'high', rationale: 'Water damage event without documented dry-out within 48–72 hours. Hidden mold growth is likely — IICRC S520 assessment recommended.' })
  }

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
