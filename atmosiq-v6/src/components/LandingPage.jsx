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

// ── Palette ────────────────────────────────────────────────────────────────
// Warm golds + cool cyans + deep violets — premium contrast
const C = {
  bg: '#050507',
  surface: '#0A0A10',
  card: '#0E0E16',
  border: '#1A1A28',
  borderWarm: '#2A2018',
  // Primary spectrum
  cyan: '#22D3EE',
  violet: '#8B5CF6',
  indigo: '#6366F1',
  gold: '#F5C542',
  amber: '#F59E0B',
  rose: '#F43F5E',
  emerald: '#10B981',
  // Text
  text: '#EDEDF0',
  sub: '#A0A0B0',
  dim: '#606070',
  muted: '#38384A',
}

const display = { fontFamily: 'Space Grotesk, Inter, sans-serif' }
const body = { fontFamily: 'Inter, sans-serif' }
const mono = { fontFamily: 'DM Mono, monospace' }

const ease = 'all 0.9s cubic-bezier(0.16, 1, 0.3, 1)'

const reveal = (inView, delay = 0) => ({
  opacity: inView ? 1 : 0,
  transform: inView ? 'translateY(0)' : 'translateY(50px)',
  transition: ease,
  transitionDelay: delay + 's',
})

const revealX = (inView, fromLeft, delay = 0) => ({
  opacity: inView ? 1 : 0,
  transform: inView ? 'translateX(0)' : `translateX(${fromLeft ? '-70px' : '70px'})`,
  transition: ease,
  transitionDelay: delay + 's',
})

const heroGradient = {
  background: 'linear-gradient(135deg, #F5C542 0%, #F59E0B 25%, #22D3EE 50%, #8B5CF6 75%, #6366F1 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  backgroundSize: '200% 200%',
  animation: 'gradientShift 6s ease-in-out infinite',
}

const warmGradient = {
  background: 'linear-gradient(135deg, #F5C542, #F59E0B)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

const coolGradient = {
  background: 'linear-gradient(135deg, #22D3EE, #8B5CF6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

function Section({ children, style }) {
  const [ref, inView] = useInView()
  return <section ref={ref} style={style}>{typeof children === 'function' ? children(inView) : children}</section>
}

function Counter({ target, suffix = '', dk }) {
  const [ref, value] = useCounter(target)
  return <span ref={ref} style={{ fontSize: dk ? 72 : 44, fontWeight: 700, ...display, lineHeight: 1 }}>{value}{suffix}</span>
}

const features = [
  { icon: 'wind', color: C.cyan, title: 'Ventilation Intelligence', desc: 'CO2 differential analysis against ASHRAE 62.1-2025. Automatic outdoor air rate calculations. Real-time scoring — not post-processing.' },
  { icon: 'shield', color: C.gold, title: 'OSHA Defensibility', desc: 'Your field data cross-referenced against 29 CFR 1910 in real time. Citation risks flagged before they become problems. Gap analysis included.' },
  { icon: 'chain', color: C.violet, title: 'Causal Intelligence', desc: 'Connects ventilation deficiencies, moisture pathways, chemical exposure, and symptoms into evidence-weighted root cause chains.' },
  { icon: 'flask', color: C.emerald, title: 'Smart Sampling Plans', desc: 'Hypothesis-driven lab sampling recommendations. AIHA, EPA Compendium, NIOSH methods — generated from your observations, not templates.' },
  { icon: 'pulse', color: C.rose, title: 'Composite Scoring', desc: 'Weighted 100-point scale across five categories. Worst-zone weighting prevents false confidence. Every score is traceable to a standard.' },
  { icon: 'send', color: C.indigo, title: 'AI Narratives', desc: 'CIH-quality findings narratives from your data. Professional language referencing zones, measurements, and applicable standards.' },
]

const steps = [
  { num: '01', title: 'Survey', desc: 'Walk the building. Guided questions. Instrument readings. Photo documentation.', color: C.cyan },
  { num: '02', title: 'Analyze', desc: 'Scores calculate. Causal chains form. Sampling needs surface. All instant.', color: C.gold },
  { num: '03', title: 'Report', desc: 'Narrative, recommendations, defensibility analysis — ready for your client.', color: C.violet },
]

export default function LandingPage({ onStartNew, onStartDemo, isDesktop }) {
  const dk = isDesktop

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, ...body, overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: dk ? '16px 56px' : '12px 20px',
        position: 'fixed', top: 0, left: 0, right: 0,
        background: 'rgba(5,5,7,0.75)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: `1px solid ${C.border}`, zIndex: 200,
      }}>
        <div style={{ ...display, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>
          atmos<span style={{ color: C.cyan }}>IQ</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={onStartDemo} style={{
            padding: '8px 20px', background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.sub, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            transition: 'all 0.25s',
          }}
            onMouseEnter={e => { e.target.style.borderColor = C.dim; e.target.style.color = C.text }}
            onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.sub }}>
            Demo
          </button>
          <button onClick={onStartNew} style={{
            padding: '8px 20px',
            background: 'linear-gradient(135deg, #F5C542, #F59E0B)',
            border: 'none', borderRadius: 8,
            color: '#0A0A10', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.25s',
          }}>
            Get Started
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: dk ? '0 56px' : '0 24px',
      }}>
        {/* Multi-color ambient glow */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '10%', left: '20%', width: dk ? 500 : 250, height: dk ? 500 : 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,197,66,0.07) 0%, transparent 70%)', filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', top: '20%', right: '15%', width: dk ? 400 : 200, height: dk ? 400 : 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', bottom: '20%', left: '40%', width: dk ? 450 : 220, height: dk ? 450 : 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.25 }}><Particles /></div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 950 }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '8px 22px', borderRadius: 100,
            background: 'linear-gradient(135deg, rgba(245,197,66,0.08), rgba(139,92,246,0.08))',
            border: '1px solid rgba(245,197,66,0.15)',
            fontSize: 11, fontWeight: 600, color: C.gold,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            marginBottom: dk ? 44 : 28,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, animation: 'pulse 2s ease-in-out infinite' }} />
            Prudence EHS — Professional IAQ Tools
          </div>

          {/* Headline */}
          <h1 style={{
            ...display,
            fontSize: dk ? 76 : 42, fontWeight: 700,
            lineHeight: 1.02, letterSpacing: '-0.045em',
            margin: 0, marginBottom: dk ? 28 : 20,
          }}>
            Redefining{dk ? <br /> : ' '}
            <span style={heroGradient}>Air Quality</span>
            {dk ? <br /> : ' '}Assessment
          </h1>

          {/* Sub */}
          <p style={{
            fontSize: dk ? 19 : 15, fontWeight: 400, color: C.sub,
            maxWidth: 520, margin: '0 auto', lineHeight: 1.75,
            marginBottom: dk ? 52 : 36,
            letterSpacing: '0.005em',
          }}>
            Field-grade intelligence for industrial hygienists. Scoring, causal analysis, and defensible reports — all in one platform.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onStartNew} style={{
              padding: '17px 44px',
              background: 'linear-gradient(135deg, #F5C542, #F59E0B)',
              border: 'none', borderRadius: 14,
              color: '#0A0A10', fontSize: 17, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 50px rgba(245,197,66,0.2), 0 4px 20px rgba(245,158,11,0.15)',
              transition: 'all 0.25s',
              animation: 'warmGlow 3s ease-in-out infinite',
              ...display,
            }}
              onMouseDown={e => e.target.style.transform = 'scale(0.96)'}
              onMouseUp={e => e.target.style.transform = 'scale(1)'}>
              Start Assessment
            </button>
            <button onClick={onStartDemo} style={{
              padding: '17px 44px',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${C.border}`, borderRadius: 14,
              color: C.text, fontSize: 17, fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.3s', ...display,
            }}
              onMouseEnter={e => { e.target.style.borderColor = 'rgba(139,92,246,0.4)'; e.target.style.background = 'rgba(139,92,246,0.05)' }}
              onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.background = 'rgba(255,255,255,0.03)' }}
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
          animation: 'float 3s ease-in-out infinite',
        }}>
          <span style={{ fontSize: 10, color: C.dim, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Discover</span>
          <div style={{ width: 1, height: 36, background: `linear-gradient(to bottom, ${C.dim}, transparent)` }} />
        </div>
      </section>

      {/* ── Standards ── */}
      <Section style={{
        padding: dk ? '52px 56px' : '36px 20px',
        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        textAlign: 'center',
        background: 'linear-gradient(180deg, rgba(245,197,66,0.02) 0%, transparent 100%)',
      }}>
        {(inView) => (
          <div style={reveal(inView)}>
            <div style={{ fontSize: 10, color: C.dim, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 20 }}>
              Built on the standards that matter
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: dk ? 44 : 16, flexWrap: 'wrap' }}>
              {[
                { name: 'ASHRAE 62.1', color: C.cyan },
                { name: 'ASHRAE 55', color: C.cyan },
                { name: 'OSHA', color: C.gold },
                { name: 'EPA', color: C.emerald },
                { name: 'NIOSH', color: C.violet },
                { name: 'AIHA', color: C.indigo },
              ].map((s, i) => (
                <div key={i} style={{
                  ...reveal(inView, 0.06 * i),
                  fontSize: dk ? 13 : 11, color: s.color, ...mono, whiteSpace: 'nowrap',
                  opacity: inView ? 0.7 : 0,
                  padding: '6px 14px', borderRadius: 6,
                  background: s.color + '08', border: `1px solid ${s.color}15`,
                }}>{s.name}</div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── The Problem ── */}
      <Section style={{
        padding: dk ? '180px 56px' : '100px 24px',
        textAlign: 'center', maxWidth: 850, margin: '0 auto',
      }}>
        {(inView) => (
          <>
            <p style={{
              ...reveal(inView, 0),
              ...display,
              fontSize: dk ? 38 : 24, fontWeight: 500, lineHeight: 1.4,
              letterSpacing: '-0.02em', color: C.sub,
              marginBottom: dk ? 40 : 24,
            }}>
              Spreadsheets. Subjective judgment.{dk ? <br /> : ' '}Fragmented data. Missed connections.
            </p>
            <p style={{
              ...reveal(inView, 0.35),
              ...display,
              fontSize: dk ? 52 : 30, fontWeight: 700, lineHeight: 1.15,
              letterSpacing: '-0.035em',
              margin: 0,
            }}>
              There's a <span style={warmGradient}>better way</span> to assess{dk ? <br /> : ' '}indoor air quality.
            </p>
          </>
        )}
      </Section>

      {/* ── Demo Preview ── */}
      <Section style={{
        padding: dk ? '40px 56px 140px' : '20px 20px 70px',
        maxWidth: 1060, margin: '0 auto',
      }}>
        {(inView) => (
          <div style={{
            ...reveal(inView),
            background: `linear-gradient(135deg, ${C.card}, ${C.surface})`,
            border: `1px solid ${C.border}`, borderRadius: dk ? 28 : 20,
            padding: dk ? 60 : 28, position: 'relative', overflow: 'hidden',
            boxShadow: '0 32px 100px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.05) inset',
          }}>
            {/* Warm glow top-left */}
            <div style={{ position: 'absolute', top: -50, left: -50, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
            {/* Cool glow bottom-right */}
            <div style={{ position: 'absolute', bottom: -80, right: -80, width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: dk ? 64 : 28, flexWrap: 'wrap' }}>
              <div style={reveal(inView, 0.2)}>
                <ScoreRing value={inView ? 62 : 0} color="#FB923C" size={dk ? 190 : 130} />
              </div>
              <div style={{ ...reveal(inView, 0.4), textAlign: dk ? 'left' : 'center', maxWidth: 420 }}>
                <div style={{ fontSize: 10, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>Live Assessment Preview</div>
                <div style={{ ...display, fontSize: dk ? 30 : 22, fontWeight: 700, color: '#FB923C', marginBottom: 8, letterSpacing: '-0.02em' }}>High Risk Detected</div>
                <div style={{ fontSize: 14, color: C.sub, ...mono, marginBottom: 16 }}>Composite: 62/100 — 2 Zones</div>
                <div style={{ fontSize: 15, color: C.sub, lineHeight: 1.75, marginBottom: 24 }}>
                  Ventilation deficiency with CO2 at 1,180 ppm. Active moisture intrusion. OSHA defensibility flagged with 3 citation risks.
                </div>
                <button onClick={onStartDemo} style={{
                  padding: '13px 30px',
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(34,211,238,0.1))',
                  border: `1px solid rgba(139,92,246,0.25)`,
                  borderRadius: 10, color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.25s', ...display,
                }}
                  onMouseEnter={e => e.target.style.background = 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(34,211,238,0.18))'}
                  onMouseLeave={e => e.target.style.background = 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(34,211,238,0.1))'}>
                  Explore Full Report →
                </button>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── Features ── */}
      <section style={{ padding: dk ? '60px 56px 100px' : '40px 20px 60px', maxWidth: 1200, margin: '0 auto' }}>
        <Section style={{ textAlign: 'center', marginBottom: dk ? 80 : 48 }}>
          {(inView) => (
            <>
              <div style={{ ...reveal(inView), fontSize: 10, color: C.gold, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 600 }}>Capabilities</div>
              <h2 style={{ ...reveal(inView, 0.1), ...display, fontSize: dk ? 52 : 30, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.08, margin: 0 }}>
                Everything you need.{dk ? <br /> : ' '}<span style={{ color: C.dim }}>Nothing you don't.</span>
              </h2>
            </>
          )}
        </Section>

        {features.map((f, i) => {
          const isEven = i % 2 === 0
          return (
            <Section key={i} style={{ marginBottom: dk ? 48 : 24 }}>
              {(inView) => (
                <div style={{
                  display: 'flex', flexDirection: dk ? (isEven ? 'row' : 'row-reverse') : 'column',
                  alignItems: 'center', gap: dk ? 56 : 24,
                  padding: dk ? '36px 0' : '16px 0',
                }}>
                  {/* Icon */}
                  <div style={{
                    ...revealX(inView, isEven, 0.15),
                    width: dk ? 130 : 80, height: dk ? 130 : 80, flexShrink: 0,
                    borderRadius: dk ? 32 : 22,
                    background: `linear-gradient(135deg, ${f.color}10, ${f.color}05)`,
                    border: `1px solid ${f.color}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 8px 32px ${f.color}10`,
                  }}>
                    <I n={f.icon} s={dk ? 44 : 30} c={f.color} w={1.4} />
                  </div>
                  {/* Text */}
                  <div style={{ ...revealX(inView, !isEven, 0.25), flex: 1, textAlign: dk ? 'left' : 'center' }}>
                    <div style={{ ...display, fontSize: dk ? 26 : 19, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10, color: C.text }}>
                      {f.title}
                    </div>
                    <div style={{ fontSize: dk ? 16 : 14, color: C.sub, lineHeight: 1.8, maxWidth: 540 }}>{f.desc}</div>
                  </div>
                </div>
              )}
            </Section>
          )
        })}
      </section>

      {/* ── How It Works ── */}
      <Section style={{
        padding: dk ? '110px 56px' : '64px 20px',
        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        textAlign: 'center',
        background: 'linear-gradient(180deg, rgba(139,92,246,0.02) 0%, transparent 50%, rgba(34,211,238,0.02) 100%)',
      }}>
        {(inView) => (
          <>
            <div style={{ ...reveal(inView), fontSize: 10, color: C.violet, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 600 }}>Process</div>
            <h2 style={{ ...reveal(inView, 0.1), ...display, fontSize: dk ? 52 : 30, fontWeight: 700, letterSpacing: '-0.04em', marginBottom: dk ? 80 : 48 }}>
              Three steps.{dk ? ' ' : <br />}<span style={{ color: C.dim }}>Zero friction.</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: dk ? 'row' : 'column', alignItems: dk ? 'flex-start' : 'center', justifyContent: 'center', gap: dk ? 0 : 48, maxWidth: 960, margin: '0 auto' }}>
              {steps.map((s, i) => (
                <div key={i} style={{ ...reveal(inView, 0.15 + i * 0.18), flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  <div style={{
                    ...display,
                    width: dk ? 80 : 64, height: dk ? 80 : 64, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${s.color}15, ${s.color}08)`,
                    border: `2px solid ${s.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 24,
                    boxShadow: `0 0 40px ${s.color}15`,
                  }}>
                    <span style={{ fontSize: dk ? 22 : 18, fontWeight: 700, ...mono, color: s.color }}>{s.num}</span>
                  </div>
                  <div style={{ ...display, fontSize: dk ? 24 : 19, fontWeight: 700, letterSpacing: '-0.015em', marginBottom: 10, color: s.color }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.7, maxWidth: 260, textAlign: 'center' }}>{s.desc}</div>
                  {dk && i < steps.length - 1 && (
                    <div style={{
                      position: 'absolute', top: 40, left: '60%', width: '80%', height: 2,
                      background: `linear-gradient(90deg, ${s.color}30, ${steps[i + 1].color}30)`,
                    }} />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ── Numbers ── */}
      <section style={{
        padding: dk ? '120px 56px' : '70px 20px',
        textAlign: 'center',
      }}>
        <Section style={{ marginBottom: dk ? 72 : 44 }}>
          {(inView) => (
            <h2 style={{ ...reveal(inView), ...display, fontSize: dk ? 52 : 30, fontWeight: 700, letterSpacing: '-0.04em', margin: 0 }}>
              The platform{dk ? ' ' : <br />}<span style={coolGradient}>in numbers.</span>
            </h2>
          )}
        </Section>
        <div style={{ display: 'flex', justifyContent: 'center', gap: dk ? 80 : 20, flexWrap: 'wrap', maxWidth: 1000, margin: '0 auto' }}>
          {[
            { target: 5, label: 'Scoring Categories', suffix: '', color: C.cyan },
            { target: 12, label: 'Sensor Parameters', suffix: '', color: C.gold },
            { target: 100, label: 'Point Scale', suffix: 'pt', color: C.violet },
            { target: 6, label: 'Standards Built-In', suffix: '+', color: C.emerald },
          ].map((s, i) => (
            <Section key={i} style={{ textAlign: 'center', minWidth: dk ? 170 : 120 }}>
              {(inView) => (
                <div style={reveal(inView, 0.1 * i)}>
                  <div style={{ color: s.color }}><Counter target={s.target} suffix={s.suffix} dk={dk} /></div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>{s.label}</div>
                </div>
              )}
            </Section>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <Section style={{
        padding: dk ? '60px 56px 120px' : '40px 20px 70px',
        textAlign: 'center',
      }}>
        {(inView) => (
          <div style={{
            ...reveal(inView),
            maxWidth: 740, margin: '0 auto',
            background: `linear-gradient(135deg, ${C.card}, ${C.surface})`,
            border: `1px solid ${C.border}`,
            borderRadius: dk ? 28 : 20, padding: dk ? '72px 60px' : '44px 24px',
            position: 'relative', overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            {/* Multi-color ambient */}
            <div style={{ position: 'absolute', top: -100, left: '20%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,197,66,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: -60, right: '10%', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ position: 'relative' }}>
              <h2 style={{ ...display, fontSize: dk ? 40 : 26, fontWeight: 700, letterSpacing: '-0.035em', margin: 0, marginBottom: 14, lineHeight: 1.15 }}>
                Ready to elevate your{dk ? <br /> : ' '}assessments?
              </h2>
              <p style={{ fontSize: 16, color: C.sub, marginBottom: 36, maxWidth: 440, margin: '0 auto 36px', lineHeight: 1.7 }}>
                Join the next generation of indoor air quality professionals.
              </p>
              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={onStartNew} style={{
                  padding: '15px 40px',
                  background: 'linear-gradient(135deg, #F5C542, #F59E0B)',
                  border: 'none', borderRadius: 12,
                  color: '#0A0A10', fontSize: 16, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.25s',
                  boxShadow: '0 0 30px rgba(245,197,66,0.15)',
                  ...display,
                }}
                  onMouseDown={e => e.target.style.transform = 'scale(0.96)'}
                  onMouseUp={e => e.target.style.transform = 'scale(1)'}>
                  Start Assessment
                </button>
                <button onClick={onStartDemo} style={{
                  padding: '15px 40px', background: 'transparent',
                  border: `1px solid ${C.border}`, borderRadius: 12,
                  color: C.text, fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.25s', ...display,
                }}
                  onMouseEnter={e => e.target.style.borderColor = C.dim}
                  onMouseLeave={e => e.target.style.borderColor = C.border}>
                  Try Demo
                </button>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── Footer ── */}
      <footer style={{
        padding: dk ? '36px 56px' : '28px 20px',
        borderTop: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ ...display, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>atmos<span style={{ color: C.cyan }}>IQ</span></div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Prudence Safety & Environmental Consulting, LLC</div>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>
          © 2026 All rights reserved. | tsidi@prudenceehs.com
        </div>
      </footer>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes warmGlow { 0%,100% { box-shadow: 0 0 40px rgba(245,197,66,0.15), 0 4px 20px rgba(245,158,11,0.1); } 50% { box-shadow: 0 0 60px rgba(245,197,66,0.25), 0 4px 30px rgba(245,158,11,0.18); } }
        @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(10px); } }
        @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }
        html { scroll-behavior: smooth; }
        body { margin: 0; background: #050507; }
        * { box-sizing: border-box; }
        ::selection { background: rgba(245,197,66,0.25); color: #fff; }
      `}</style>
    </div>
  )
}
