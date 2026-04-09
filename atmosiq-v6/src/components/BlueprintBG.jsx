/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * BlueprintBG — faint HVAC duct schematic linework
 * Positioned in corners and edges, never behind headline text.
 * Feels like premium texture, not illustration.
 */

export default function BlueprintBG({ opacity = 0.04 }) {
  const stroke = `rgba(34,211,238,${opacity})`
  const strokeFaint = `rgba(34,211,238,${opacity * 0.6})`

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Top-right corner — AHU schematic fragment */}
      <svg width="420" height="320" viewBox="0 0 420 320" fill="none" style={{ position: 'absolute', top: '-20px', right: '-40px', opacity: 1 }}>
        {/* Main duct run */}
        <line x1="40" y1="80" x2="380" y2="80" stroke={stroke} strokeWidth="0.8" />
        <line x1="40" y1="82" x2="380" y2="82" stroke={strokeFaint} strokeWidth="0.4" strokeDasharray="4 8" />
        {/* Branch takeoff */}
        <line x1="200" y1="80" x2="200" y2="200" stroke={stroke} strokeWidth="0.8" />
        <line x1="160" y1="200" x2="240" y2="200" stroke={stroke} strokeWidth="0.8" />
        {/* Diffuser symbols */}
        <line x1="160" y1="196" x2="160" y2="204" stroke={strokeFaint} strokeWidth="0.6" />
        <line x1="240" y1="196" x2="240" y2="204" stroke={strokeFaint} strokeWidth="0.6" />
        {/* AHU box */}
        <rect x="60" y="60" width="60" height="40" rx="2" stroke={stroke} strokeWidth="0.6" fill="none" />
        <line x1="75" y1="70" x2="105" y2="70" stroke={strokeFaint} strokeWidth="0.4" />
        <line x1="75" y1="80" x2="105" y2="80" stroke={strokeFaint} strokeWidth="0.4" />
        <line x1="75" y1="90" x2="105" y2="90" stroke={strokeFaint} strokeWidth="0.4" />
        {/* Damper symbol */}
        <line x1="300" y1="72" x2="300" y2="88" stroke={stroke} strokeWidth="0.6" />
        <line x1="296" y1="76" x2="304" y2="84" stroke={stroke} strokeWidth="0.5" />
        {/* Dimension line */}
        <line x1="140" y1="110" x2="260" y2="110" stroke={strokeFaint} strokeWidth="0.3" strokeDasharray="2 6" />
        <line x1="140" y1="106" x2="140" y2="114" stroke={strokeFaint} strokeWidth="0.3" />
        <line x1="260" y1="106" x2="260" y2="114" stroke={strokeFaint} strokeWidth="0.3" />
        {/* Return air duct */}
        <line x1="40" y1="240" x2="320" y2="240" stroke={strokeFaint} strokeWidth="0.5" strokeDasharray="6 4" />
        <line x1="40" y1="244" x2="320" y2="244" stroke={strokeFaint} strokeWidth="0.3" strokeDasharray="6 4" />
      </svg>

      {/* Bottom-left corner — section cut fragment */}
      <svg width="360" height="280" viewBox="0 0 360 280" fill="none" style={{ position: 'absolute', bottom: '-30px', left: '-30px', opacity: 1 }}>
        {/* Ceiling plenum */}
        <line x1="20" y1="60" x2="340" y2="60" stroke={strokeFaint} strokeWidth="0.6" />
        <line x1="20" y1="100" x2="340" y2="100" stroke={stroke} strokeWidth="0.5" strokeDasharray="8 4" />
        {/* Duct cross-section */}
        <rect x="100" y="30" width="80" height="30" rx="1" stroke={stroke} strokeWidth="0.6" fill="none" />
        {/* Airflow arrows */}
        <path d="M 120 45 L 130 40 L 130 50 Z" fill={strokeFaint} />
        <path d="M 150 45 L 160 40 L 160 50 Z" fill={strokeFaint} />
        {/* Floor line */}
        <line x1="20" y1="220" x2="340" y2="220" stroke={strokeFaint} strokeWidth="0.4" />
        {/* Room grid lines */}
        <line x1="60" y1="100" x2="60" y2="220" stroke={strokeFaint} strokeWidth="0.3" strokeDasharray="2 8" />
        <line x1="180" y1="100" x2="180" y2="220" stroke={strokeFaint} strokeWidth="0.3" strokeDasharray="2 8" />
        <line x1="300" y1="100" x2="300" y2="220" stroke={strokeFaint} strokeWidth="0.3" strokeDasharray="2 8" />
        {/* Supply diffuser */}
        <rect x="110" y="96" width="40" height="8" rx="1" stroke={stroke} strokeWidth="0.5" fill="none" />
        {/* Return grille */}
        <rect x="220" y="96" width="50" height="8" rx="1" stroke={strokeFaint} strokeWidth="0.4" fill="none" strokeDasharray="3 3" />
      </svg>

      {/* Center-right — faint pressure diagram */}
      <svg width="200" height="200" viewBox="0 0 200 200" fill="none" style={{ position: 'absolute', top: '50%', right: '5%', transform: 'translateY(-50%)', opacity: 1 }}>
        {/* Pressure contour lines */}
        <circle cx="100" cy="100" r="30" stroke={strokeFaint} strokeWidth="0.3" fill="none" />
        <circle cx="100" cy="100" r="55" stroke={strokeFaint} strokeWidth="0.25" fill="none" strokeDasharray="3 5" />
        <circle cx="100" cy="100" r="80" stroke={strokeFaint} strokeWidth="0.2" fill="none" strokeDasharray="2 6" />
        {/* Cross hairs */}
        <line x1="100" y1="60" x2="100" y2="140" stroke={strokeFaint} strokeWidth="0.2" />
        <line x1="60" y1="100" x2="140" y2="100" stroke={strokeFaint} strokeWidth="0.2" />
      </svg>
    </div>
  )
}
