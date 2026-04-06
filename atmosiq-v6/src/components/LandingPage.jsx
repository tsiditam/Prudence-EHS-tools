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

import Particles from './Particles'
import { I } from './Icons'
import ScoreRing from './ScoreRing'
import { useInView } from '../hooks/useInView'
import { useCounter } from '../hooks/useCounter'

const C = {
  bg: '#060809',
  surface: '#0B0D12',
  border: '#151A24',
  accent: '#22D3EE',
  accentSoft: 'rgba(34,211,238,0.08)',
  text: '#F0F4F8',
  dim: '#7A8494',
  muted: '#454D5E',
}

const ease = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)'

const reveal = (inView, delay = 0) => ({
  opacity: inView ? 1 : 0,
  transform: inView ? 'translateY(0)' : 'translateY(40px)',
  transition: ease,
  transitionDelay: delay + 's',
})

const revealX = (inView, fromLeft, delay = 0) => ({
  opacity: inView ? 1 : 0,
  transform: inView ? 'translateX(0)' : `translateX(${fromLeft ? '-60px' : '60px'})`,
  transition: ease,
  transitionDelay: delay + 's',
})

const gradient = {
  background: 'linear-gradient(135deg, #22D3EE, #06B6D4, #8B5CF6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

const mono = { fontFamily: 'DM Mono, monospace' }

function Section({ children, style, ...props }) {
  const [ref, inView] = useInView()
  return <section ref={ref} style={style} {...props}>{typeof children === 'function' ? children(inView) : children}</section>
}

function Counter({ target, suffix = '', dk }) {
  const [ref, value] = useCounter(target)
  return <span ref={ref} style={{ fontSize: dk ? 64 : 40, fontWeight: 800, ...mono, color: C.accent, lineHeight: 1 }}>{value}{suffix}</span>
}

const features = [
  { icon: 'wind', title: 'Real-Time Ventilation Scoring', desc: 'CO2 differential analysis against ASHRAE 62.1-2025. Automatic outdoor air rate calculations per zone. No spreadsheets, no guesswork — just defensible data.' },
  { icon: 'shield', title: 'OSHA Defensibility Engine', desc: 'Automated compliance evaluation cross-references your field data against 29 CFR 1910. Flags citation risks before they become problems. Confidence scoring with gap analysis.' },
  { icon: 'chain', title: 'Causal Chain Intelligence', desc: 'Connects the dots between ventilation deficiencies, moisture intrusion, chemical exposure, and occupant symptoms. Evidence-weighted root cause analysis with confidence ratings.' },
  { icon: 'flask', title: 'Hypothesis-Driven Sampling', desc: 'Generates laboratory sampling plans from your field observations. Methods, controls, and standards — AIHA, EPA Compendium, NIOSH — all referenced automatically.' },
  { icon: 'pulse', title: 'Multi-Zone Composite Scoring', desc: 'Weighted 100-point scoring across ventilation, contaminants, HVAC condition, occupant complaints, and environmental factors. Worst-zone weighting prevents false confidence.' },
  { icon: 'send', title: 'AI Narrative Generation', desc: 'CIH-quality findings narratives generated from your data. Professional third-person language referencing zone names, specific measurements, and applicable standards.' },
]

const steps = [
  { num: '01', title: 'Survey', desc: 'Walk the building. Answer guided questions. Capture instrument readings and photos.' },
  { num: '02', title: 'Analyze', desc: 'Scores calculate instantly. Causal chains form. Sampling needs surface automatically.' },
  { num: '03', title: 'Report', desc: 'Professional narrative, recommendations, and defensibility analysis — ready for your client.' },
]

export default function LandingPage({ onStartNew, onStartDemo, isDesktop }) {
  const dk = isDesktop

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: dk ? '18px 56px' : '14px 20px',
        position: 'fixed', top: 0, left: 0, right: 0,
        background: 'rgba(6,8,9,0.8)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${C.border}`, zIndex: 200,
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>
          atmos<span style={{ color: C.accent }}>IQ</span>
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 8, fontWeight: 400, ...mono }}>v6</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onStartDemo} style={{
            padding: '9px 22px', background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.dim, fontSize: 14, fontWeight: 500, cursor: 'pointer',
            transition: 'all 0.2s',
          }}>Demo</button>
          <button onClick={onStartNew} style={{
            padding: '9px 22px', background: C.accent,
            border: 'none', borderRadius: 8,
            color: '#060809', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.2s',
          }}>Get Started</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: dk ? '0 56px' : '0 24px',
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.4 }}><Particles /></div>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 30%, rgba(34,211,238,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 900 }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 20px', borderRadius: 100,
            background: C.accentSoft, border: `1px solid rgba(34,211,238,0.15)`,
            fontSize: 12, fontWeight: 600, color: C.accent,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: dk ? 40 : 24,
            animation: 'shimmer 3s ease-in-out infinite',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, animation: 'pulse 2s ease-in-out infinite' }} />
            Prudence EHS
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: dk ? 72 : 40, fontWeight: 800,
            lineHeight: 1.05, letterSpacing: '-0.04em',
            margin: 0, marginBottom: dk ? 28 : 20,
          }}>
            The Future of{dk ? <br /> : ' '}
            <span style={gradient}>Air Quality</span>
            {dk ? <br /> : ' '}Assessment
          </h1>

          {/* Sub */}
          <p style={{
            fontSize: dk ? 20 : 16, fontWeight: 400, color: C.dim,
            maxWidth: 560, margin: '0 auto', lineHeight: 1.7,
            marginBottom: dk ? 48 : 32,
          }}>
            Field-grade IAQ intelligence for industrial hygienists. Real-time scoring. Causal analysis. Defensible reports.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onStartNew} style={{
              padding: '16px 40px', background: C.accent, border: 'none', borderRadius: 12,
              color: '#060809', fontSize: 17, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 40px rgba(34,211,238,0.25)', transition: 'all 0.2s',
              animation: 'glowPulse 2.5s ease-in-out infinite',
            }}
              onMouseDown={e => e.target.style.transform = 'scale(0.96)'}
              onMouseUp={e => e.target.style.transform = 'scale(1)'}>
              Start Assessment
            </button>
            <button onClick={onStartDemo} style={{
              padding: '16px 40px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 12,
              color: C.text, fontSize: 17, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
            }}
              onMouseEnter={e => e.target.style.borderColor = 'rgba(34,211,238,0.3)'}
              onMouseLeave={e => e.target.style.borderColor = C.border}
              onMouseDown={e => e.target.style.transform = 'scale(0.96)'}
              onMouseUp={e => e.target.style.transform = 'scale(1)'}>
              Interactive Demo
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: dk ? 40 : 24,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          animation: 'float 2.5s ease-in-out infinite',
        }}>
          <span style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Scroll</span>
          <div style={{ width: 1, height: 32, background: `linear-gradient(to bottom, ${C.muted}, transparent)` }} />
        </div>
      </section>

      {/* ── Standards Bar ── */}
      <Section style={{
        padding: dk ? '56px 56px' : '36px 20px',
        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        textAlign: 'center',
      }}>
        {(inView) => (
          <div style={reveal(inView)}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>
              Built on the standards that matter
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: dk ? 48 : 20, flexWrap: 'wrap' }}>
              {['ASHRAE 62.1', 'ASHRAE 55', 'OSHA 29 CFR 1910', 'EPA Guidelines', 'NIOSH RELs', 'AIHA / ACGIH'].map((s, i) => (
                <div key={i} style={{ ...reveal(inView, 0.05 * i), fontSize: dk ? 14 : 12, color: C.dim, ...mono, whiteSpace: 'nowrap' }}>{s}</div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── The Problem ── */}
      <Section style={{
        padding: dk ? '160px 56px' : '80px 24px',
        textAlign: 'center', maxWidth: 800, margin: '0 auto',
      }}>
        {(inView) => (
          <>
            <p style={{
              ...reveal(inView, 0),
              fontSize: dk ? 36 : 22, fontWeight: 600, lineHeight: 1.4,
              letterSpacing: '-0.02em', color: C.dim,
              marginBottom: dk ? 32 : 20,
            }}>
              Traditional IAQ assessments rely on spreadsheets, subjective judgment, and fragmented data.
            </p>
            <p style={{
              ...reveal(inView, 0.3),
              fontSize: dk ? 42 : 26, fontWeight: 800, lineHeight: 1.2,
              letterSpacing: '-0.03em',
              margin: 0,
            }}>
              We built <span style={gradient}>something better.</span>
            </p>
          </>
        )}
      </Section>

      {/* ── Demo Preview ── */}
      <Section style={{
        padding: dk ? '80px 56px 120px' : '48px 20px 60px',
        maxWidth: 1000, margin: '0 auto',
      }}>
        {(inView) => (
          <div style={{
            ...reveal(inView),
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 24,
            padding: dk ? 56 : 28, position: 'relative', overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 20%, rgba(34,211,238,0.05) 0%, transparent 50%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: dk ? 56 : 24, flexWrap: 'wrap' }}>
              <div style={reveal(inView, 0.2)}>
                <ScoreRing value={inView ? 62 : 0} color="#FB923C" size={dk ? 180 : 130} />
              </div>
              <div style={{ ...reveal(inView, 0.4), textAlign: dk ? 'left' : 'center', maxWidth: 400 }}>
                <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Live Assessment Preview</div>
                <div style={{ fontSize: dk ? 28 : 20, fontWeight: 800, color: '#FB923C', marginBottom: 8, letterSpacing: '-0.02em' }}>High Risk</div>
                <div style={{ fontSize: 14, color: C.dim, ...mono, marginBottom: 12 }}>Composite: 62/100 — 2 Zones Assessed</div>
                <div style={{ fontSize: 15, color: '#9CA3AF', lineHeight: 1.7, marginBottom: 20 }}>
                  Ventilation deficiency with CO2 at 1180 ppm. Active moisture intrusion in Conference Room B. OSHA defensibility flagged.
                </div>
                <button onClick={onStartDemo} style={{
                  padding: '12px 28px', background: C.accentSoft, border: `1px solid rgba(34,211,238,0.2)`,
                  borderRadius: 10, color: C.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                }}
                  onMouseEnter={e => e.target.style.background = 'rgba(34,211,238,0.15)'}
                  onMouseLeave={e => e.target.style.background = C.accentSoft}>
                  Explore Full Report →
                </button>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── Features ── */}
      <section style={{ padding: dk ? '80px 56px 100px' : '48px 20px 60px', maxWidth: 1200, margin: '0 auto' }}>
        <Section style={{ textAlign: 'center', marginBottom: dk ? 72 : 40 }}>
          {(inView) => (
            <>
              <div style={{ ...reveal(inView), fontSize: 11, color: C.accent, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 600 }}>Capabilities</div>
              <h2 style={{ ...reveal(inView, 0.1), fontSize: dk ? 48 : 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
                Everything you need.<br /><span style={{ color: C.dim }}>Nothing you don't.</span>
              </h2>
            </>
          )}
        </Section>

        {features.map((f, i) => {
          const isEven = i % 2 === 0
          return (
            <Section key={i} style={{ marginBottom: dk ? 40 : 20 }}>
              {(inView) => (
                <div style={{
                  display: 'flex', flexDirection: dk ? (isEven ? 'row' : 'row-reverse') : 'column',
                  alignItems: 'center', gap: dk ? 48 : 20,
                  ...reveal(inView, 0.1),
                }}>
                  {/* Icon side */}
                  <div style={{
                    ...revealX(inView, isEven, 0.2),
                    width: dk ? 120 : 72, height: dk ? 120 : 72, flexShrink: 0,
                    borderRadius: dk ? 28 : 20,
                    background: `linear-gradient(135deg, ${C.surface}, ${C.accentSoft})`,
                    border: `1px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <I n={f.icon} s={dk ? 40 : 28} c={C.accent} w={1.5} />
                  </div>
                  {/* Text side */}
                  <div style={{ ...revealX(inView, !isEven, 0.3), flex: 1, textAlign: dk ? 'left' : 'center' }}>
                    <div style={{ fontSize: dk ? 24 : 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>{f.title}</div>
                    <div style={{ fontSize: dk ? 16 : 14, color: C.dim, lineHeight: 1.8, maxWidth: 520 }}>{f.desc}</div>
                  </div>
                </div>
              )}
            </Section>
          )
        })}
      </section>

      {/* ── How It Works ── */}
      <Section style={{
        padding: dk ? '100px 56px' : '60px 20px',
        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        textAlign: 'center',
      }}>
        {(inView) => (
          <>
            <div style={{ ...reveal(inView), fontSize: 11, color: C.accent, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 600 }}>Process</div>
            <h2 style={{ ...reveal(inView, 0.1), fontSize: dk ? 48 : 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: dk ? 72 : 40 }}>
              Three steps. <span style={{ color: C.dim }}>Zero friction.</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: dk ? 'row' : 'column', alignItems: dk ? 'flex-start' : 'center', justifyContent: 'center', gap: dk ? 0 : 40, maxWidth: 900, margin: '0 auto' }}>
              {steps.map((s, i) => (
                <div key={i} style={{ ...reveal(inView, 0.15 + i * 0.15), flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  <div style={{
                    width: dk ? 72 : 56, height: dk ? 72 : 56, borderRadius: '50%',
                    background: i === 1 ? C.accent : C.surface, border: `2px solid ${i === 1 ? C.accent : C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 20,
                    boxShadow: i === 1 ? '0 0 40px rgba(34,211,238,0.2)' : 'none',
                  }}>
                    <span style={{ fontSize: dk ? 20 : 16, fontWeight: 800, ...mono, color: i === 1 ? '#060809' : C.dim }}>{s.num}</span>
                  </div>
                  <div style={{ fontSize: dk ? 22 : 18, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 8 }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, maxWidth: 250, textAlign: 'center' }}>{s.desc}</div>
                  {dk && i < steps.length - 1 && (
                    <div style={{ position: 'absolute', top: 36, left: '60%', width: '80%', height: 2, background: `linear-gradient(90deg, ${C.border}, ${i === 0 ? C.accent : C.border}, ${C.border})` }} />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ── Numbers ── */}
      <section style={{
        padding: dk ? '100px 56px' : '60px 20px',
        textAlign: 'center',
      }}>
        <Section style={{ marginBottom: dk ? 64 : 40 }}>
          {(inView) => (
            <h2 style={{ ...reveal(inView), fontSize: dk ? 48 : 28, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
              The technology <span style={gradient}>in numbers.</span>
            </h2>
          )}
        </Section>
        <div style={{ display: 'flex', justifyContent: 'center', gap: dk ? 80 : 24, flexWrap: 'wrap', maxWidth: 900, margin: '0 auto' }}>
          {[
            { target: 5, label: 'Scoring Categories', suffix: '' },
            { target: 12, label: 'Sensor Parameters', suffix: '' },
            { target: 100, label: 'Point Scale', suffix: 'pt' },
            { target: 6, label: 'Standards Built-In', suffix: '+' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: dk ? 160 : 100 }}>
              <Counter target={s.target} suffix={s.suffix} dk={dk} />
              <div style={{ fontSize: 12, color: C.dim, marginTop: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <Section style={{
        padding: dk ? '80px 56px 100px' : '48px 20px 60px',
        textAlign: 'center',
      }}>
        {(inView) => (
          <div style={{
            ...reveal(inView),
            maxWidth: 700, margin: '0 auto',
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 24, padding: dk ? '64px 56px' : '40px 24px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% -20%, rgba(34,211,238,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <h2 style={{ fontSize: dk ? 36 : 24, fontWeight: 800, letterSpacing: '-0.03em', margin: 0, marginBottom: 12 }}>
                Ready to elevate your assessments?
              </h2>
              <p style={{ fontSize: 16, color: C.dim, marginBottom: 32, maxWidth: 420, margin: '0 auto 32px', lineHeight: 1.7 }}>
                Join the next generation of indoor air quality professionals.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={onStartNew} style={{
                  padding: '14px 36px', background: C.accent, border: 'none', borderRadius: 12,
                  color: '#060809', fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: '0 0 30px rgba(34,211,238,0.2)',
                }}
                  onMouseDown={e => e.target.style.transform = 'scale(0.96)'}
                  onMouseUp={e => e.target.style.transform = 'scale(1)'}>
                  Start Assessment
                </button>
                <button onClick={onStartDemo} style={{
                  padding: '14px 36px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12,
                  color: C.text, fontSize: 16, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                }}>
                  Try Demo
                </button>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── Footer ── */}
      <footer style={{
        padding: dk ? '40px 56px' : '32px 20px',
        borderTop: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>atmos<span style={{ color: C.accent }}>IQ</span></div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Prudence Safety & Environmental Consulting, LLC</div>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>
          © 2026 All rights reserved. | tsidi@prudenceehs.com
        </div>
      </footer>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 30px rgba(34,211,238,0.15); } 50% { box-shadow: 0 0 50px rgba(34,211,238,0.3); } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(8px); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes shimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
        html { scroll-behavior: smooth; }
        body { margin: 0; background: #060809; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  )
}
