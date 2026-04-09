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

import BlueprintBG from './BlueprintBG'
import AirflowMotion from './AirflowMotion'
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
  { icon: 'wind', color: C.cyan, title: 'Ventilation Scoring', desc: 'CO2 differential against ASHRAE 62.1-2025. Outdoor air rate calculations per occupant load and space use. Flags inadequate ventilation before you leave the building.' },
  { icon: 'shield', color: C.gold, title: 'OSHA Defensibility Analysis', desc: 'Field data cross-referenced against 29 CFR 1910 in real time. Citation risks flagged with confidence levels. When data is missing, confidence degrades — so you always know how strong your documentation is.' },
  { icon: 'chain', color: C.violet, title: 'Root Cause Chains', desc: 'Damper closed → inadequate OA → elevated CO2 → occupant symptoms. The engine connects related findings into evidence-weighted causal chains instead of listing them as separate items.' },
  { icon: 'flask', color: C.emerald, title: 'Hypothesis-Driven Sampling', desc: 'Sampling recommendations generated only when walkthrough findings indicate a specific concern. AIHA, EPA Compendium, NIOSH methods — with required controls and outdoor baselines flagged automatically.' },
  { icon: 'pulse', color: C.rose, title: '100-Point Scoring', desc: 'Five categories. Worst-zone weighting so one bad area can\'t hide behind good averages. Every deduction traces to a measurement, a standard, and a threshold.' },
  { icon: 'send', color: C.indigo, title: 'AI Narratives (You Review)', desc: 'Professional findings text generated from deterministic output. The AI describes only what the engine found — never invents findings. Labeled "IH Review Required." The CIH signs the report, not the AI.' },
]

const steps = [
  { num: '01', title: 'Guided Walkthrough', desc: 'One question at a time. Instrument readings, photos, and observations captured zone by zone. Auto-saves continuously.', color: C.cyan },
  { num: '02', title: 'Instant Analysis', desc: 'Deterministic scoring across 5 categories. Causal chains connect findings. Data gaps flagged. OSHA risks surfaced.', color: C.gold },
  { num: '03', title: 'Report-Ready Output', desc: 'Structured findings, tiered recommendations, sampling plan, and ventilation analysis — all traceable to published standards.', color: C.violet },
]

export default function LandingPage({ onStartNew, onStartDemo, isDesktop }) {
  const dk = isDesktop

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, ...body, overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: dk ? '10px 56px' : '8px 20px',
        position: 'fixed', top: 0, left: 0, right: 0,
        background: 'rgba(5,5,7,0.75)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: `1px solid ${C.border}`, zIndex: 200,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: C.cyan, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I n="wind" s={14} c={C.bg} w={2.2} />
          </div>
          <span style={{ ...display, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>
            atmos<span style={{ color: C.cyan }}>IQ</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => { const el = document.getElementById('install-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }} style={{
            padding: '8px 20px',
            background: 'linear-gradient(135deg, #F5C542, #F59E0B)',
            border: 'none', borderRadius: 8,
            color: '#0A0A10', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.25s',
          }}>
            Start Free
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: dk ? '0 56px' : '0 24px',
      }}>
        {/* HVAC blueprint texture — corners and edges only */}
        <BlueprintBG opacity={dk ? 0.38 : 0.30} />
        {/* Airflow motion — drifting gradient haze */}
        <AirflowMotion />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 950 }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '8px 22px', borderRadius: 100,
            background: 'rgba(34,211,238,0.06)',
            border: '1px solid rgba(34,211,238,0.15)',
            fontSize: 11, fontWeight: 600, color: C.cyan,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            marginBottom: dk ? 44 : 28,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.cyan, animation: 'pulse 2s ease-in-out infinite' }} />
            Engineered by EHS Professionals for EHS Professionals
          </div>

          {/* Headline */}
          <h1 style={{
            ...display,
            fontSize: dk ? 76 : 42, fontWeight: 700,
            lineHeight: 1.02, letterSpacing: '-0.045em',
            margin: 0, marginBottom: dk ? 28 : 20,
          }}>
            Walk in.{dk ? <br /> : ' '}
            <span style={heroGradient}>Assess.</span>
            {dk ? <br /> : ' '}Report done.
          </h1>

          {/* Sub */}
          <p style={{
            fontSize: dk ? 19 : 15, fontWeight: 400, color: C.sub,
            maxWidth: 540, margin: '0 auto', lineHeight: 1.75,
            marginBottom: dk ? 36 : 24,
            letterSpacing: '0.005em',
          }}>
            The IAQ assessment platform that turns your field walkthrough into a structured, scored, report-ready deliverable — before you leave the building.
          </p>

          {/* Trust line */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: dk ? 24 : 14, marginBottom: dk ? 48 : 32, flexWrap: 'wrap' }}>
            {['ASHRAE 62.1 · OSHA · EPA · NIOSH', 'Deterministic scoring', 'Free during beta'].map((t, i) => (
              <span key={i} style={{ fontSize: 11, color: C.dim, ...mono, letterSpacing: '0.02em' }}>{i > 0 && <span style={{marginRight: dk ? 24 : 14}}>·</span>}{t}</span>
            ))}
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => { if (window._pwaPrompt) { window._pwaPrompt.prompt(); window._pwaPrompt.userChoice.then(() => { window._pwaPrompt = null }) } else { const el = document.getElementById('install-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }) } }} style={{
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
              Start Free Assessment
            </button>
            <button onClick={() => { const el = document.getElementById('install-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }} style={{
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
              See How It Works
            </button>
          </div>
        </div>

        {/* Proof line below CTAs */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', gap: dk ? 36 : 16, marginTop: dk ? 56 : 36, flexWrap: 'wrap' }}>
          {[
            { value: '100pt', label: 'Scoring Scale' },
            { value: '5', label: 'Category Analysis' },
            { value: '6+', label: 'Standards Built In' },
            { value: '<10min', label: 'Field to Report' },
          ].map((m, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: dk ? 100 : 70 }}>
              <div style={{ fontSize: dk ? 22 : 16, fontWeight: 700, color: C.text, ...display, letterSpacing: '-0.02em' }}>{m.value}</div>
              <div style={{ fontSize: 9, color: C.dim, marginTop: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: dk ? 32 : 20,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          animation: 'float 3s ease-in-out infinite',
        }}>
          <div style={{ width: 1, height: 28, background: `linear-gradient(to bottom, ${C.dim}, transparent)` }} />
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
        textAlign: 'center', maxWidth: 900, margin: '0 auto',
      }}>
        {(inView) => (
          <>
            <div style={{ ...reveal(inView, 0), display: 'flex', justifyContent: 'center', gap: dk ? 20 : 10, marginBottom: dk ? 40 : 24, flexWrap: 'wrap' }}>
              {['CIHs', 'IH Consultants', 'CSPs', 'EHS Managers', 'IAQ Investigators'].map((r, i) => (
                <span key={i} style={{ fontSize: 11, color: C.dim, ...mono, padding: '5px 12px', borderRadius: 4, background: `${C.text}04`, border: `1px solid ${C.border}` }}>{r}</span>
              ))}
            </div>
            <p style={{
              ...reveal(inView, 0.1),
              ...display,
              fontSize: dk ? 38 : 24, fontWeight: 500, lineHeight: 1.4,
              letterSpacing: '-0.02em', color: C.sub,
              marginBottom: dk ? 40 : 24,
            }}>
              You already know what to look for.{dk ? <br /> : ' '}The problem is the workflow between your field notes and the final report.
            </p>
            <p style={{
              ...reveal(inView, 0.35),
              ...display,
              fontSize: dk ? 52 : 30, fontWeight: 700, lineHeight: 1.15,
              letterSpacing: '-0.035em',
              margin: 0,
            }}>
              AtmosIQ <span style={warmGradient}>closes that gap</span> —{dk ? <br /> : ' '}structured assessment, scored findings, report-ready output.
            </p>
          </>
        )}
      </Section>

      {/* ── Who Built This ── */}
      <Section style={{
        padding: dk ? '80px 56px' : '48px 20px',
        maxWidth: 900, margin: '0 auto',
      }}>
        {(inView) => (
          <div style={{
            ...reveal(inView),
            display: 'flex', flexDirection: dk ? 'row' : 'column',
            alignItems: 'center', gap: dk ? 48 : 24,
            background: `linear-gradient(135deg, ${C.card}, ${C.surface})`,
            border: `1px solid ${C.border}`, borderRadius: dk ? 24 : 18,
            padding: dk ? '48px 52px' : '32px 24px',
            position: 'relative', overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ position: 'absolute', top: -40, left: -40, width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,197,66,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{
              ...reveal(inView, 0.15), flexShrink: 0,
              width: dk ? 100 : 72, height: dk ? 100 : 72, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.gold}15, ${C.gold}08)`,
              border: `2px solid ${C.gold}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <I n="user" s={dk ? 40 : 28} c={C.gold} w={1.4} />
            </div>
            <div style={{ ...reveal(inView, 0.25), flex: 1, textAlign: dk ? 'left' : 'center' }}>
              <div style={{ fontSize: 10, color: C.gold, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>Built by a Practitioner</div>
              <div style={{ ...display, fontSize: dk ? 24 : 19, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>
                Designed by a Certified Safety Professional
              </div>
              <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.75, maxWidth: 520 }}>
                Not built by a software team guessing what field work looks like. Every question, threshold, and scoring rule reflects how investigations actually work — from pre-survey intake through structured deliverables.
              </div>
            </div>
          </div>
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
                <div style={{ fontSize: 10, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>Meridian Business Park — 3 Zones</div>
                <div style={{ ...display, fontSize: dk ? 30 : 22, fontWeight: 700, color: '#FB923C', marginBottom: 8, letterSpacing: '-0.02em' }}>High Risk — OSHA Flagged</div>
                <div style={{ fontSize: 14, color: C.sub, ...mono, marginBottom: 16 }}>Composite: 62/100 · 3 citation risks · Sampling needed</div>
                <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.75, marginBottom: 24 }}>
                  Elevated CO₂ with closed dampers. Active moisture intrusion. Multiple symptomatic occupants. See how the platform scores, links causes, and generates the sampling plan — all from field data.
                </div>
                <button onClick={() => { const el = document.getElementById('install-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }} style={{
                  padding: '13px 30px',
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(34,211,238,0.1))',
                  border: `1px solid rgba(139,92,246,0.25)`,
                  borderRadius: 10, color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.25s', ...display,
                }}
                  onMouseEnter={e => e.target.style.background = 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(34,211,238,0.18))'}
                  onMouseLeave={e => e.target.style.background = 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(34,211,238,0.1))'}>
                  Start Free →
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
              <div style={{ ...reveal(inView), fontSize: 10, color: C.gold, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 600 }}>What It Does</div>
              <h2 style={{ ...reveal(inView, 0.1), ...display, fontSize: dk ? 52 : 30, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.08, margin: 0 }}>
                Faster reporting.{dk ? <br /> : ' '}<span style={{ color: C.dim }}>Stronger documentation.</span>
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
            <div style={{ ...reveal(inView), fontSize: 10, color: C.violet, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 600 }}>How It Works</div>
            <h2 style={{ ...reveal(inView, 0.1), ...display, fontSize: dk ? 52 : 30, fontWeight: 700, letterSpacing: '-0.04em', marginBottom: dk ? 80 : 48 }}>
              Built for the way{dk ? ' ' : <br />}<span style={{ color: C.dim }}>you already work.</span>
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
              Built for{dk ? ' ' : <br />}<span style={coolGradient}>serious work.</span>
            </h2>
          )}
        </Section>
        <div style={{ display: 'flex', justifyContent: 'center', gap: dk ? 80 : 20, flexWrap: 'wrap', maxWidth: 1000, margin: '0 auto' }}>
          {[
            { target: 6, label: 'Published Standards', suffix: '+', color: C.cyan },
            { target: 5, label: 'Scoring Categories', suffix: '', color: C.gold },
            { target: 100, label: 'Point Scale', suffix: 'pt', color: C.violet },
            { target: 10, label: 'Min to Report', suffix: '<', color: C.emerald },
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

      {/* ── Install ── */}
      <Section style={{ padding: dk ? '100px 56px' : '60px 20px', textAlign: 'center' }}>
        {(inView) => (
          <div id="install-section" style={{
            ...reveal(inView),
            maxWidth: 900, margin: '0 auto',
            display: 'flex', flexDirection: dk ? 'row' : 'column',
            alignItems: 'center', gap: dk ? 64 : 32,
            background: `linear-gradient(135deg, ${C.card}, rgba(245,197,66,0.03))`,
            border: `1px solid ${C.border}`, borderRadius: dk ? 28 : 20,
            padding: dk ? '56px 60px' : '36px 24px',
            position: 'relative', overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ position: 'absolute', bottom: -60, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,197,66,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{
              ...reveal(inView, 0.15), flexShrink: 0,
              width: dk ? 160 : 120, height: dk ? 280 : 210,
              background: C.surface, borderRadius: dk ? 28 : 20,
              border: `2px solid ${C.border}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 8, position: 'relative',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
            }}>
              <div style={{ position: 'absolute', top: 10, width: 40, height: 4, borderRadius: 2, background: C.border }} />
              <div style={{ ...display, fontSize: dk ? 22 : 16, fontWeight: 700 }}>a<span style={{ color: C.cyan }}>IQ</span></div>
              <div style={{ width: '60%', height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${C.gold}, ${C.violet})`, opacity: 0.5 }} />
              <div style={{ position: 'absolute', bottom: 8, width: 32, height: 3, borderRadius: 2, background: C.border }} />
            </div>
            <div style={{ ...reveal(inView, 0.25), textAlign: dk ? 'left' : 'center', flex: 1 }}>
              <div style={{ fontSize: 10, color: C.gold, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>Mobile App</div>
              <div style={{ ...display, fontSize: dk ? 30 : 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12, lineHeight: 1.2 }}>
                Take AtmosIQ{dk ? <br /> : ' '}Into the Field
              </div>
              <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.7, marginBottom: 24, maxWidth: 400 }}>
                Install AtmosIQ directly to your phone. No app store needed — works offline, feels native, and stays up to date automatically.
              </div>
              <button onClick={() => { if (window._pwaPrompt) { window._pwaPrompt.prompt(); window._pwaPrompt.userChoice.then(() => { window._pwaPrompt = null }) } else { alert("To install: tap your browser's Share button (iOS) or Menu → 'Add to Home Screen' (Android/Desktop)") } }} style={{
                padding: '13px 30px',
                background: `linear-gradient(135deg, ${C.gold}, #F59E0B)`,
                border: 'none', borderRadius: 10,
                color: '#050507', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.25s', ...display,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                boxShadow: '0 0 24px rgba(245,197,66,0.2)',
              }}
                onMouseDown={e => e.target.style.transform = 'scale(0.96)'}
                onMouseUp={e => e.target.style.transform = 'scale(1)'}>
                <I n="download" s={16} c="#050507" /> Install App
              </button>
              <div style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: dk ? 'flex-start' : 'center', flexWrap: 'wrap' }}>
                {['Works Offline', 'Auto Updates', 'No Store Needed'].map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.dim }}>
                    <I n="check" s={12} c={C.emerald} /> {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

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
                Ready to see{dk ? <br /> : ' '}what structured looks like?
              </h2>
              <p style={{ fontSize: 15, color: C.sub, marginBottom: 24, maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.7 }}>
                Run a full assessment on your next site visit. Guided workflow, scored findings, and a report ready for review — all from your phone.
              </p>
              <p style={{ fontSize: 12, color: C.dim, marginBottom: 32, ...mono }}>
                Free during beta · No app store · Works offline
              </p>
              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => { if (window._pwaPrompt) { window._pwaPrompt.prompt() } else { const el = document.getElementById('install-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }) } }} style={{
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
                  Start Free Assessment
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: C.cyan, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <I n="wind" s={11} c={C.bg} w={2.2} />
            </div>
            <span style={{ ...display, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>atmos<span style={{ color: C.cyan }}>IQ</span></span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Prudence Safety & Environmental Consulting, LLC</div>
        </div>
        <div style={{ textAlign: dk ? 'right' : 'left' }}>
          <div style={{ fontSize: 10, color: C.muted }}>© 2026 All rights reserved.</div>
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
