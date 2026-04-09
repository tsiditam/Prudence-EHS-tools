/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * BlueprintBG — faint HVAC duct schematic linework
 * Positioned in corners and edges, never behind headline text.
 * Feels like premium texture, not illustration.
 */

export default function BlueprintBG({ opacity = 0.25 }) {
  const stroke = `rgba(34,211,238,${opacity})`
  const strokeFaint = `rgba(34,211,238,${opacity * 0.6})`

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Top-right corner — AHU schematic fragment */}
      <svg width="420" height="320" viewBox="0 0 420 320" fill="none" style={{ position: 'absolute', top: '-20px', right: '-40px' }}>
        {/* Main duct run */}
        <line x1="40" y1="80" x2="380" y2="80" stroke={stroke} strokeWidth="1.5" />
        <line x1="40" y1="86" x2="380" y2="86" stroke={strokeFaint} strokeWidth="0.8" strokeDasharray="4 8" />
        {/* Branch takeoff */}
        <line x1="200" y1="80" x2="200" y2="200" stroke={stroke} strokeWidth="1.2" />
        <line x1="160" y1="200" x2="240" y2="200" stroke={stroke} strokeWidth="1.2" />
        {/* Diffuser symbols */}
        <line x1="160" y1="194" x2="160" y2="206" stroke={strokeFaint} strokeWidth="1" />
        <line x1="240" y1="194" x2="240" y2="206" stroke={strokeFaint} strokeWidth="1" />
        {/* AHU box */}
        <rect x="60" y="60" width="60" height="40" rx="2" stroke={stroke} strokeWidth="1" fill="none" />
        <line x1="75" y1="70" x2="105" y2="70" stroke={strokeFaint} strokeWidth="0.7" />
        <line x1="75" y1="80" x2="105" y2="80" stroke={strokeFaint} strokeWidth="0.7" />
        <line x1="75" y1="90" x2="105" y2="90" stroke={strokeFaint} strokeWidth="0.7" />
        {/* Damper symbol */}
        <line x1="300" y1="72" x2="300" y2="88" stroke={stroke} strokeWidth="1" />
        <line x1="296" y1="76" x2="304" y2="84" stroke={stroke} strokeWidth="0.8" />
        {/* Dimension line */}
        <line x1="140" y1="120" x2="260" y2="120" stroke={strokeFaint} strokeWidth="0.6" strokeDasharray="2 6" />
        <line x1="140" y1="115" x2="140" y2="125" stroke={strokeFaint} strokeWidth="0.6" />
        <line x1="260" y1="115" x2="260" y2="125" stroke={strokeFaint} strokeWidth="0.6" />
        {/* Return air duct */}
        <line x1="40" y1="250" x2="320" y2="250" stroke={strokeFaint} strokeWidth="0.8" strokeDasharray="6 4" />
        <line x1="40" y1="256" x2="320" y2="256" stroke={strokeFaint} strokeWidth="0.5" strokeDasharray="6 4" />
      </svg>

      {/* Bottom-left corner — section cut fragment */}
      <svg width="360" height="280" viewBox="0 0 360 280" fill="none" style={{ position: 'absolute', bottom: '-30px', left: '-30px' }}>
        {/* Ceiling plenum */}
        <line x1="20" y1="60" x2="340" y2="60" stroke={strokeFaint} strokeWidth="1" />
        <line x1="20" y1="100" x2="340" y2="100" stroke={stroke} strokeWidth="0.8" strokeDasharray="8 4" />
        {/* Duct cross-section */}
        <rect x="100" y="30" width="80" height="30" rx="1" stroke={stroke} strokeWidth="1" fill="none" />
        {/* Airflow arrows */}
        <path d="M 120 45 L 132 38 L 132 52 Z" fill={strokeFaint} />
        <path d="M 150 45 L 162 38 L 162 52 Z" fill={strokeFaint} />
        {/* Floor line */}
        <line x1="20" y1="220" x2="340" y2="220" stroke={strokeFaint} strokeWidth="0.7" />
        {/* Room grid lines */}
        <line x1="60" y1="100" x2="60" y2="220" stroke={strokeFaint} strokeWidth="0.5" strokeDasharray="2 8" />
        <line x1="180" y1="100" x2="180" y2="220" stroke={strokeFaint} strokeWidth="0.5" strokeDasharray="2 8" />
        <line x1="300" y1="100" x2="300" y2="220" stroke={strokeFaint} strokeWidth="0.5" strokeDasharray="2 8" />
        {/* Supply diffuser */}
        <rect x="110" y="94" width="40" height="12" rx="1" stroke={stroke} strokeWidth="0.8" fill="none" />
        {/* Return grille */}
        <rect x="220" y="94" width="50" height="12" rx="1" stroke={strokeFaint} strokeWidth="0.7" fill="none" strokeDasharray="3 3" />
      </svg>

      {/* Center-right — faint pressure diagram */}
      <svg width="240" height="240" viewBox="0 0 240 240" fill="none" style={{ position: 'absolute', top: '50%', right: '3%', transform: 'translateY(-50%)' }}>
        {/* Pressure contour lines */}
        <circle cx="120" cy="120" r="35" stroke={strokeFaint} strokeWidth="0.7" fill="none" />
        <circle cx="120" cy="120" r="65" stroke={strokeFaint} strokeWidth="0.5" fill="none" strokeDasharray="3 5" />
        <circle cx="120" cy="120" r="95" stroke={strokeFaint} strokeWidth="0.4" fill="none" strokeDasharray="2 6" />
        {/* Cross hairs */}
        <line x1="120" y1="70" x2="120" y2="170" stroke={strokeFaint} strokeWidth="0.4" />
        <line x1="70" y1="120" x2="170" y2="120" stroke={strokeFaint} strokeWidth="0.4" />
      </svg>
    </div>
  )
}
