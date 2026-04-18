/**
 * AtmosFlow Mode Selector — First-run modal
 * "How will you use AtmosFlow?" → IH or FM mode
 */

import { I } from './Icons'

const BG = '#07080C', CARD = '#111318', BORDER = '#1C1E26', ACCENT = '#22D3EE'
const TEXT = '#ECEEF2', SUB = '#8B93A5', DIM = '#6B7380'

export default function ModeSelector({ onSelect }) {
  return (
    <div style={{
      minHeight: '100vh', background: BG, color: TEXT,
      fontFamily: "'Outfit', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        {/* Brand */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I n="wind" s={16} c={BG} w={2.2} />
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' }}>Atmos<span style={{ color: ACCENT }}>Flow</span></span>
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>How will you use AtmosFlow?</div>
        <div style={{ fontSize: 13, color: SUB, marginBottom: 32, lineHeight: 1.6 }}>
          Choose the experience that fits your role. You can change this anytime in settings.
        </div>

        {/* IH Card */}
        <button onClick={() => onSelect('ih')} style={{
          width: '100%', padding: '20px', background: CARD, border: `1.5px solid ${BORDER}`,
          borderRadius: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          marginBottom: 12, transition: 'border-color 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${ACCENT}10`, border: `1px solid ${ACCENT}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <I n="shield" s={20} c={ACCENT} w={1.6} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>I'm an EHS or IH professional</div>
          </div>
          <div style={{ fontSize: 12, color: SUB, lineHeight: 1.6, paddingLeft: 52 }}>
            Full instrument discipline, defensibility tools, expert-grade reports, ASHRAE/OSHA/EPA benchmarks.
          </div>
        </button>

        {/* FM Card */}
        <button onClick={() => onSelect('fm')} style={{
          width: '100%', padding: '20px', background: CARD, border: `1.5px solid ${BORDER}`,
          borderRadius: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          marginBottom: 24, transition: 'border-color 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${ACCENT}10`, border: `1px solid ${ACCENT}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <I n="bldg" s={20} c={ACCENT} w={1.6} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>I manage a building or facility</div>
          </div>
          <div style={{ fontSize: 12, color: SUB, lineHeight: 1.6, paddingLeft: 52 }}>
            Guided air quality checks, complaint tracking, intervention tracker, action recommendations.
          </div>
        </button>

        <div style={{ fontSize: 11, color: DIM }}>Not sure? You can change this anytime in settings.</div>
      </div>
    </div>
  )
}
