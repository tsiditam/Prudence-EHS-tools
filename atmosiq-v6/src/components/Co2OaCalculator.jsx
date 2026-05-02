/**
 * Co2OaCalculator — estimate outdoor-air delivery (cfm/person) from
 * indoor & outdoor CO₂ readings using a steady-state mass-balance.
 *
 * Method: ASHRAE 62.1-2019 Appendix C / Persily 2017 — for an adult
 * at sedentary metabolic activity (~1.2 met), the per-person CO₂
 * generation rate G ≈ 0.0084 cfm. Under steady-state conditions the
 * outdoor-air ventilation rate per person is:
 *
 *   Vo (cfm/person) = G × 10⁶ / (C_indoor − C_outdoor)         (ppm)
 *
 * This is an *estimate*, not a direct measurement — it assumes
 * occupancy is steady and HVAC has reached equilibrium. For
 * compliance work, verify with a balometer reading at the OA
 * diffuser. The screening-only positioning of AtmosFlow holds.
 *
 * The helper:
 *   • Pre-fills indoor / outdoor CO₂ from the sensor screen if
 *     already entered (data.co2, data.co2o).
 *   • Lets the assessor enter values inline if they haven't been —
 *     and back-fills the zone-level CO₂ fields so the sensor screen
 *     is consistent.
 *   • Shows the estimate with the citation; "Apply" writes it to
 *     the cfm_person field on the zone.
 */

import { useState, useEffect, useMemo } from 'react'

const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const TEXT = '#ECEEF2'
const SUB = '#8B93A5'
const DIM = '#6B7380'

// ASHRAE 62.1-2019 Appendix C: G ≈ 0.0084 cfm/person at 1.2 met
// (sedentary office worker, average adult). Persily 2017 confirms
// this within ~10% for typical office demographics.
const G_CFM_PER_PERSON = 0.0084

function calcCfmPerPerson(co2Indoor, co2Outdoor) {
  const cs = parseFloat(co2Indoor)
  const co = parseFloat(co2Outdoor)
  if (!Number.isFinite(cs) || !Number.isFinite(co)) return null
  const delta = cs - co
  if (delta < 50) {
    return { error: 'CO₂ differential too small (<50 ppm). Mass-balance estimate is unreliable below this threshold — use a direct airflow measurement.' }
  }
  const vo = (G_CFM_PER_PERSON * 1e6) / delta
  if (!Number.isFinite(vo) || vo <= 0) return null
  return { cfmPerPerson: Math.round(vo * 10) / 10 }
}

export default function Co2OaCalculator({ co2, co2o, onApply, onCo2Change, onCo2oChange }) {
  const [indoor, setIndoor] = useState(co2 || '')
  const [outdoor, setOutdoor] = useState(co2o || '420')
  const [showCalc, setShowCalc] = useState(false)

  // Mirror upstream changes if the sensor screen back-fills these
  // values after the helper was first opened.
  useEffect(() => { if (co2 !== undefined && co2 !== '') setIndoor(co2) }, [co2])
  useEffect(() => { if (co2o !== undefined && co2o !== '') setOutdoor(co2o) }, [co2o])

  const result = useMemo(() => calcCfmPerPerson(indoor, outdoor), [indoor, outdoor])

  if (!showCalc) {
    return (
      <button
        onClick={() => setShowCalc(true)}
        style={{
          marginTop: 14,
          padding: '14px 18px',
          width: '100%',
          background: 'transparent',
          border: `1.5px dashed ${ACCENT}55`,
          borderRadius: 12,
          color: ACCENT,
          fontSize: 14,
          fontFamily: "'Outfit'",
          fontWeight: 600,
          cursor: 'pointer',
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        ✨ Calculate from CO₂ readings
      </button>
    )
  }

  const handleIndoorChange = (v) => {
    setIndoor(v)
    if (onCo2Change) onCo2Change(v)
  }
  const handleOutdoorChange = (v) => {
    setOutdoor(v)
    if (onCo2oChange) onCo2oChange(v)
  }

  return (
    <div style={{ marginTop: 14, padding: 16, background: `${ACCENT}06`, border: `1px solid ${ACCENT}25`, borderRadius: 12 }}>
      <div style={{ fontSize: 12, fontFamily: "'DM Mono'", fontWeight: 600, color: ACCENT, letterSpacing: 0.4, marginBottom: 12, textTransform: 'uppercase' }}>
        Estimate from CO₂ mass-balance
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 140px', minWidth: 0 }}>
          <div style={{ fontSize: 12, color: SUB, marginBottom: 6, fontFamily: "'DM Mono'" }}>Indoor CO₂ (ppm)</div>
          <input
            type="number"
            inputMode="decimal"
            value={indoor}
            onChange={e => handleIndoorChange(e.target.value)}
            placeholder="e.g. 1180"
            style={{
              width: '100%',
              padding: '12px 14px',
              background: CARD,
              border: `1.5px solid ${BORDER}`,
              borderRadius: 10,
              color: TEXT,
              fontSize: 15,
              fontFamily: "'Outfit'",
              fontWeight: 500,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = ACCENT}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
        </label>
        <label style={{ flex: '1 1 140px', minWidth: 0 }}>
          <div style={{ fontSize: 12, color: SUB, marginBottom: 6, fontFamily: "'DM Mono'" }}>Outdoor CO₂ (ppm)</div>
          <input
            type="number"
            inputMode="decimal"
            value={outdoor}
            onChange={e => handleOutdoorChange(e.target.value)}
            placeholder="~420 typical"
            style={{
              width: '100%',
              padding: '12px 14px',
              background: CARD,
              border: `1.5px solid ${BORDER}`,
              borderRadius: 10,
              color: TEXT,
              fontSize: 15,
              fontFamily: "'Outfit'",
              fontWeight: 500,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = ACCENT}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
        </label>
      </div>

      {result && result.cfmPerPerson != null && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: SUB, fontFamily: "'DM Mono'", letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 }}>Estimated</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: ACCENT, fontFamily: "'Outfit'" }}>
              {result.cfmPerPerson} <span style={{ fontSize: 13, color: DIM, fontWeight: 500, fontFamily: "'DM Mono'" }}>cfm/person</span>
            </div>
          </div>
          <button
            onClick={() => onApply(String(result.cfmPerPerson))}
            style={{
              padding: '12px 18px',
              background: ACCENT,
              border: 'none',
              borderRadius: 10,
              color: '#031216',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Outfit'",
              minHeight: 44,
            }}
          >
            Use this value →
          </button>
        </div>
      )}

      {result && result.error && (
        <div style={{ padding: '10px 14px', background: '#F9731610', border: '1px solid #F9731640', borderRadius: 10, color: '#FCA85F', fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>
          {result.error}
        </div>
      )}

      <div style={{ fontSize: 11, color: DIM, lineHeight: 1.5, fontFamily: "'Outfit'" }}>
        Steady-state mass-balance with G = 0.0084 cfm/person (sedentary adult, 1.2 met). Per ASHRAE 62.1-2019 Appendix C; Persily 2017. <strong style={{ color: SUB }}>Estimate only</strong> — verify with a balometer measurement at the OA diffuser for compliance documentation.
      </div>
    </div>
  )
}
