/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { useState } from 'react'
import Particles from './Particles'
import { I } from './Icons'
import ScoreRing from './ScoreRing'

const CSS = {
  bg: '#080A0E',
  card: '#0C1017',
  border: '#1A2030',
  accent: '#22D3EE',
  accentDim: '#22D3EE20',
  text: '#F0F4F8',
  muted: '#5E6578',
}

const features = [
  { icon: 'wind', title: 'Real-Time IAQ Scoring', desc: 'ASHRAE 62.1, ASHRAE 55, EPA, OSHA, NIOSH — all built in. Every reading is scored against current standards automatically.' },
  { icon: 'shield', title: 'OSHA Defensibility', desc: 'Know exactly where you stand. Automated compliance evaluation flags gaps before they become citations.' },
  { icon: 'chain', title: 'Causal Chain Analysis', desc: 'AI-powered root cause identification connects ventilation, moisture, chemical, and cross-contamination evidence into defensible narratives.' },
  { icon: 'flask', title: 'Sampling Plans', desc: 'Hypothesis-driven sampling recommendations with methods, controls, and standards — generated from your field data.' },
  { icon: 'pulse', title: 'Composite Risk Scoring', desc: 'Multi-zone weighted scoring with 100-point scale. Ventilation, contaminants, HVAC, complaints, and environment — all quantified.' },
  { icon: 'send', title: 'AI Narrative Generation', desc: 'Professional CIH-quality findings narratives generated from your data. Reference-grade language ready for your report.' },
]

const stats = [
  { value: '5', label: 'Scoring Categories' },
  { value: '12', label: 'Sensor Parameters' },
  { value: '6+', label: 'Standards Built-In' },
  { value: '100', label: 'Point Scale' },
]

export default function LandingPage({ onStartNew, onStartDemo, isDesktop }) {
  const dk = isDesktop

  return (
    <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: 'Outfit, sans-serif', overflow: 'hidden' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: dk ? '20px 48px' : '16px 20px',
        borderBottom: `1px solid ${CSS.border}`,
        position: 'sticky', top: 0, background: 'rgba(8,10,14,0.9)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        zIndex: 100,
      }}>
        <div style={{ fontSize: dk ? 24 : 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
          atmos<span style={{ color: CSS.accent }}>IQ</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onStartDemo} style={{
            padding: dk ? '10px 24px' : '8px 16px', background: 'transparent',
            border: `1px solid ${CSS.border}`, borderRadius: 10,
            color: CSS.text, fontSize: 14, fontWeight: 500, cursor: 'pointer',
            transition: 'all 0.2s',
          }}>Try Demo</button>
          <button onClick={onStartNew} style={{
            padding: dk ? '10px 24px' : '8px 16px', background: CSS.accent,
            border: 'none', borderRadius: 10,
            color: '#080A0E', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.2s',
          }}>Start Assessment</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        position: 'relative',
        padding: dk ? '120px 48px 100px' : '60px 20px 50px',
        textAlign: 'center',
        maxWidth: 900, margin: '0 auto',
      }}>
        <Particles />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-block', padding: '6px 16px', borderRadius: 20,
            background: CSS.accentDim, border: `1px solid ${CSS.accent}30`,
            fontSize: 12, fontWeight: 600, color: CSS.accent,
            marginBottom: dk ? 32 : 20, letterSpacing: '0.05em',
          }}>
            PRUDENCE EHS — PROFESSIONAL IAQ TOOLS
          </div>
          <h1 style={{
            fontSize: dk ? 56 : 32, fontWeight: 800,
            lineHeight: 1.1, letterSpacing: '-0.03em',
            margin: 0, marginBottom: dk ? 24 : 16,
          }}>
            Indoor Air Quality<br />
            <span style={{ color: CSS.accent }}>Intelligence Platform</span>
          </h1>
          <p style={{
            fontSize: dk ? 18 : 15, color: CSS.muted,
            maxWidth: 600, margin: '0 auto', lineHeight: 1.7,
            marginBottom: dk ? 40 : 28,
          }}>
            Field-grade IAQ assessment with real-time scoring against ASHRAE, OSHA, EPA, and NIOSH standards.
            Causal chain analysis, sampling plans, and AI-powered narratives — built for CIHs and EHS professionals.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onStartNew} style={{
              padding: '16px 36px', background: CSS.accent,
              border: 'none', borderRadius: 14,
              color: '#080A0E', fontSize: 17, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 30px rgba(34,211,238,0.2)',
              transition: 'all 0.2s',
              animation: 'glowPulse 2s ease-in-out infinite',
            }}
              onMouseDown={e => { e.target.style.transform = 'scale(0.97)' }}
              onMouseUp={e => { e.target.style.transform = 'scale(1)' }}>
              Start Assessment →
            </button>
            <button onClick={onStartDemo} style={{
              padding: '16px 36px', background: 'transparent',
              border: `1px solid ${CSS.border}`, borderRadius: 14,
              color: CSS.text, fontSize: 17, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
              onMouseDown={e => { e.target.style.transform = 'scale(0.97)' }}
              onMouseUp={e => { e.target.style.transform = 'scale(1)' }}>
              Try Interactive Demo
            </button>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section style={{
        display: 'flex', justifyContent: 'center', gap: dk ? 64 : 24,
        padding: dk ? '48px 48px' : '32px 20px',
        borderTop: `1px solid ${CSS.border}`,
        borderBottom: `1px solid ${CSS.border}`,
        flexWrap: 'wrap',
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: dk ? 36 : 28, fontWeight: 800, color: CSS.accent, fontFamily: 'DM Mono, monospace' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: CSS.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* Demo Preview */}
      <section style={{
        padding: dk ? '80px 48px' : '48px 20px',
        maxWidth: 1000, margin: '0 auto', textAlign: 'center',
      }}>
        <h2 style={{ fontSize: dk ? 36 : 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
          See It In Action
        </h2>
        <p style={{ fontSize: 15, color: CSS.muted, marginBottom: dk ? 40 : 24, maxWidth: 500, margin: '0 auto 40px' }}>
          Pre-loaded with a real-world commercial office IAQ assessment — explore the full scoring engine.
        </p>
        <div style={{
          background: CSS.card, border: `1px solid ${CSS.border}`, borderRadius: 20,
          padding: dk ? 40 : 24, position: 'relative', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 30%, rgba(34,211,238,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: dk ? 48 : 24, flexWrap: 'wrap' }}>
            <ScoreRing value={62} color="#FB923C" size={dk ? 160 : 120} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: dk ? 22 : 18, fontWeight: 700, color: '#FB923C', marginBottom: 8 }}>High Risk</div>
              <div style={{ fontSize: 14, color: CSS.muted, marginBottom: 4, fontFamily: 'DM Mono, monospace' }}>Composite Score: 62/100</div>
              <div style={{ fontSize: 13, color: '#C8D0DC', maxWidth: 320, lineHeight: 1.6 }}>
                Ventilation deficiency detected. CO2 at 1180 ppm with active occupant complaints. Moisture intrusion in Conference Room B.
              </div>
              <button onClick={onStartDemo} style={{
                marginTop: 16, padding: '10px 24px', background: CSS.accentDim,
                border: `1px solid ${CSS.accent}40`, borderRadius: 10,
                color: CSS.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s',
              }}>
                Explore Full Report →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{
        padding: dk ? '80px 48px' : '48px 20px',
        maxWidth: 1200, margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: dk ? 56 : 32 }}>
          <h2 style={{ fontSize: dk ? 36 : 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Built for EHS Professionals
          </h2>
          <p style={{ fontSize: 15, color: CSS.muted, maxWidth: 500, margin: '0 auto' }}>
            Every feature designed by industrial hygienists, for industrial hygienists.
          </p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: dk ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: dk ? 24 : 16,
        }}>
          {features.map((f, i) => (
            <div key={i} style={{
              background: CSS.card, border: `1px solid ${CSS.border}`,
              borderRadius: 16, padding: dk ? 28 : 20,
              transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
            }}
              onMouseEnter={e => { if (dk) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; e.currentTarget.style.borderColor = 'rgba(34,211,238,0.15)' } }}
              onMouseLeave={e => { if (dk) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = CSS.border } }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: CSS.accentDim, display: 'flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <I n={f.icon} s={20} c={CSS.accent} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: CSS.muted, lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Standards */}
      <section style={{
        padding: dk ? '64px 48px' : '40px 20px',
        borderTop: `1px solid ${CSS.border}`,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, color: CSS.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>
          Standards & References
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: dk ? 40 : 20, flexWrap: 'wrap', opacity: 0.5 }}>
          {['ASHRAE 62.1-2025', 'ASHRAE 55-2023', 'OSHA 29 CFR 1910', 'EPA Guidelines', 'NIOSH RELs', 'AIHA / ACGIH'].map((s, i) => (
            <div key={i} style={{ fontSize: 13, color: CSS.muted, fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>{s}</div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: dk ? '80px 48px' : '48px 20px',
        textAlign: 'center',
        position: 'relative',
      }}>
        <div style={{
          maxWidth: 700, margin: '0 auto',
          background: CSS.card, border: `1px solid ${CSS.border}`,
          borderRadius: 20, padding: dk ? '56px 48px' : '36px 24px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <h2 style={{ fontSize: dk ? 30 : 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>
              Ready to Elevate Your Assessments?
            </h2>
            <p style={{ fontSize: 15, color: CSS.muted, marginBottom: 28, maxWidth: 450, margin: '0 auto 28px' }}>
              Start a new inspection or explore the interactive demo.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={onStartNew} style={{
                padding: '14px 32px', background: CSS.accent,
                border: 'none', borderRadius: 12,
                color: '#080A0E', fontSize: 16, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.2s',
              }}>Start Assessment</button>
              <button onClick={onStartDemo} style={{
                padding: '14px 32px', background: 'transparent',
                border: `1px solid ${CSS.border}`, borderRadius: 12,
                color: CSS.text, fontSize: 16, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s',
              }}>Try Demo</button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: dk ? '40px 48px' : '32px 20px',
        borderTop: `1px solid ${CSS.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>atmos<span style={{ color: CSS.accent }}>IQ</span></div>
          <div style={{ fontSize: 11, color: CSS.muted, marginTop: 2 }}>by Prudence Safety & Environmental Consulting, LLC</div>
        </div>
        <div style={{ fontSize: 11, color: CSS.muted }}>
          © 2026 Prudence Safety & Environmental Consulting, LLC. All rights reserved.
        </div>
      </footer>

      {/* Keyframes */}
      <style>{`
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 20px rgba(34,211,238,0.15); } 50% { box-shadow: 0 0 35px rgba(34,211,238,0.3); } }
      `}</style>
    </div>
  )
}
