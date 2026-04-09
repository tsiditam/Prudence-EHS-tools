/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * AirflowMotion — ultra-subtle drifting gradient haze
 * Suggests airflow and environmental sensing without literal smoke.
 * Movement is slow, smooth, and almost subconscious.
 */

export default function AirflowMotion() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Primary drift — slow horizontal movement */}
      <div style={{
        position: 'absolute',
        top: '15%', left: '-10%',
        width: '60%', height: '40%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(34,211,238,0.03) 0%, transparent 70%)',
        filter: 'blur(60px)',
        animation: 'airDriftRight 25s ease-in-out infinite',
      }} />

      {/* Secondary drift — counter-directional */}
      <div style={{
        position: 'absolute',
        bottom: '20%', right: '-5%',
        width: '45%', height: '35%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(34,211,238,0.02) 0%, transparent 70%)',
        filter: 'blur(50px)',
        animation: 'airDriftLeft 30s ease-in-out infinite',
      }} />

      {/* Faint warm accent — very subtle depth */}
      <div style={{
        position: 'absolute',
        top: '40%', left: '30%',
        width: '30%', height: '25%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(245,197,66,0.015) 0%, transparent 70%)',
        filter: 'blur(70px)',
        animation: 'airDriftUp 35s ease-in-out infinite',
      }} />

      <style>{`
        @keyframes airDriftRight {
          0%, 100% { transform: translateX(0) translateY(0); opacity: 0.7; }
          50% { transform: translateX(8%) translateY(-3%); opacity: 1; }
        }
        @keyframes airDriftLeft {
          0%, 100% { transform: translateX(0) translateY(0); opacity: 0.6; }
          50% { transform: translateX(-6%) translateY(2%); opacity: 1; }
        }
        @keyframes airDriftUp {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-5%); opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}
