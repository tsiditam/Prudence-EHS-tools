/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DevEvidenceMapPreview — non-production preview of the Evidence Map (§13).
 *
 * Renders the Evidence Map card against the spec "Test 1" fixture (CO2
 * ventilation concern with OA-damper observation and occupant symptoms) so
 * the surface can be eyeballed on a Vercel preview deploy WITHOUT logging in
 * and finalizing an assessment. Mounted only on non-production hosts at
 * /dev/evidence-map (see src/main.jsx). Not reachable on atmosflow.net.
 *
 * Pure preview harness — no engine access, no persistence, no auth.
 */
import EvidenceMap from '../EvidenceMap'

// Spec Test 1 fixture: CO2 ~1,800 ppm, OA damper closed/minimum, weak supply
// airflow, occupant symptoms — enough to populate supporting evidence,
// a pathway, the framed ASHRAE 62.1 standard, and a recommendation.
const FIXTURE = {
  zones: [{
    id: 'confA', zn: 'Conference Room A',
    co2: '1800', rh: '58', od: 'Closed / minimum', sa: 'Weak / reduced',
    sy: ['Headache', 'Eye irritation'],
  }],
  zoneScores: [{
    zoneName: 'Conference Room A',
    confidence: 'Moderate',
    cats: [{
      l: 'Ventilation',
      r: [
        { t: 'CO₂ 1,800 ppm (Δ1,385 ppm above outdoor) — ventilation rate appears inadequate for occupant load.', std: 'ASHRAE 62.1-2025', sev: 'high' },
        { t: 'CO₂ is a ventilation-adequacy indicator, not a contaminant measurement.', sev: 'info' },
      ],
    }],
  }],
  causalChains: [{
    zone: 'Conference Room A',
    type: 'Ventilation Deficiency',
    rootCause: 'Inadequate ventilation rate for occupant load',
    evidence: ['CO₂ at 1800 ppm', 'OA damper: Closed / minimum'],
    confidence: 'Strong',
    std: 'ASHRAE 62.1-2025',
  }],
  recs: ['Verify outdoor-air delivery and rebalance to the ASHRAE 62.1 breathing-zone rate for the measured occupancy.'],
}

export default function DevEvidenceMapPreview() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '24px 16px', paddingTop: 'calc(24px + env(safe-area-inset-top))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--warn)' }}>Non-production preview</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '6px 0 4px' }}>Evidence Map (§13) — Test 1 fixture</h1>
          <p style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5, margin: 0 }}>
            Rendered from the deterministic knowledge-graph projection for a CO₂ ventilation concern.
            This route exists only on preview/dev hosts; it is not reachable in production.
          </p>
        </div>
        <EvidenceMap {...FIXTURE} assessmentId="dev-test-1" />
      </div>
    </div>
  )
}
