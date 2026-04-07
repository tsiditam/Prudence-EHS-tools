/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * HydroScan Landing Page — Premium Marketing Surface
 * Desktop browsers see this; PWA users go straight to the app.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { useState, useEffect, useRef } from 'react'
import { useInView } from '../hooks/useInView'
import { useCounter } from '../hooks/useCounter'

/* ─── SVG ICONS (inline, no external deps) ─────────────────────── */

const DropLogo = ({ s = 48 }) => (
  <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
    <defs>
      <linearGradient id="lp-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0D9488" />
        <stop offset="100%" stopColor="#22D3EE" />
      </linearGradient>
    </defs>
    <path d="M50 8C50 8,85 42,85 58A35 35 0 1 1 15 58C15 42,50 8,50 8Z" stroke="url(#lp-grad)" strokeWidth="4" fill="none" strokeLinejoin="round" />
    <polyline points="22,58 34,58 40,44 48,70 55,38 62,62 70,54 80,54" stroke="url(#lp-grad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
)

const FeatureIcon = ({ type }) => {
  const icons = {
    field: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2h6l2 4H7l2-4z" /><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M12 10v6" /><path d="M9 13h6" />
      </svg>
    ),
    lab: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6v5l4 8a2 2 0 01-2 2H7a2 2 0 01-2-2l4-8V3" /><path d="M7 15h10" />
      </svg>
    ),
    pfas: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
      </svg>
    ),
    compliance: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
      </svg>
    ),
    sampling: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h18v18H3z" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" />
      </svg>
    ),
    rootcause: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /><path d="M11 8v6" /><path d="M8 11h6" />
      </svg>
    ),
  }
  return icons[type] || null
}

/* ─── SECTION WRAPPER WITH SCROLL REVEAL ─────────────────────── */

function Reveal({ children, delay = 0, className = '' }) {
  const [ref, inView] = useInView({ threshold: 0.12 })
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(32px)',
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}

/* ─── STAT COUNTER ───────────────────────────────────────────── */

function StatCounter({ target, suffix = '', label }) {
  const [ref, value] = useCounter(target, 1400)
  return (
    <div ref={ref} style={styles.statCard}>
      <span style={styles.statValue}>
        {value}{suffix}
      </span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  )
}

/* ─── PHONE MOCKUP ───────────────────────────────────────────── */

function PhoneMockup() {
  return (
    <div style={styles.phoneMockup}>
      <div style={styles.phoneNotch} />
      <div style={styles.phoneScreen}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <DropLogo s={28} />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, color: '#E2E8F0' }}>HydroScan</span>
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(34,211,238,0.08))', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5EEAD4', marginBottom: 4 }}>WATER QUALITY SCORE</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, color: '#22D3EE' }}>92.4</div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>EPA Compliant</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['pH 7.2', 'Cl 0.8', 'Turb 0.3'].map(v => (
            <div key={v} style={{ flex: 1, background: 'rgba(139,92,246,0.1)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#A78BFA' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── MAIN LANDING PAGE ──────────────────────────────────────── */

export default function LandingPage({ isDesktop }) {
  const [canInstall, setCanInstall] = useState(false)

  useEffect(() => {
    const check = () => setCanInstall(!!window._pwaPrompt)
    check()
    window.addEventListener('beforeinstallprompt', check)
    const id = setInterval(check, 1000)
    return () => { window.removeEventListener('beforeinstallprompt', check); clearInterval(id) }
  }, [])

  const handleInstall = async () => {
    const prompt = window._pwaPrompt
    if (!prompt) return
    prompt.prompt()
    await prompt.userChoice
    window._pwaPrompt = null
    setCanInstall(false)
  }

  const features = [
    { key: 'field', title: 'Field Assessment', desc: 'Capture 15+ field parameters with built-in validation. Auto-score water quality in real-time during sampling events.' },
    { key: 'lab', title: 'Lab Results Analysis', desc: 'Import laboratory data and compare against MCLs, action levels, and health advisories across multiple regulatory frameworks.' },
    { key: 'pfas', title: 'PFAS Detection', desc: 'Dedicated PFAS analysis module covering EPA Method 533, 537.1, and UCMR5 analytes with ppt-level threshold tracking.' },
    { key: 'compliance', title: 'Compliance Engine', desc: 'Automated compliance checks against EPA, WHO, and state-specific drinking water standards with tiered violation scoring.' },
    { key: 'sampling', title: 'Sampling Plans', desc: 'Generate regulatory-compliant sampling plans with site maps, parameter selection, and chain-of-custody workflows.' },
    { key: 'rootcause', title: 'Root Cause Analysis', desc: 'Identify contamination sources through multi-parameter correlation, trend analysis, and upstream/downstream comparison.' },
  ]

  const stats = [
    { target: 90, suffix: '+', label: 'Contaminants Tracked' },
    { target: 2, suffix: '', label: 'EPA/WHO Standards' },
    { target: 3, suffix: '', label: 'Tiered Compliance' },
    { target: 100, suffix: '%', label: 'Real-Time Scoring' },
  ]

  return (
    <div style={styles.page}>
      {/* ── Ambient glow ── */}
      <div style={styles.ambientTop} />
      <div style={styles.ambientMid} />

      {/* ── Nav ── */}
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DropLogo s={36} />
            <span style={styles.navBrand}>HydroScan</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <a href="#features" style={styles.navLink}>Features</a>
            <a href="#stats" style={styles.navLink}>Platform</a>
            <a href="#install" style={styles.navLink}>Install</a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={styles.hero}>
        <Reveal>
          <div style={styles.badge}>Drinking Water Quality Intelligence</div>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 style={styles.heroTitle}>
            <span style={styles.gradientText}>Analyze.</span>{' '}
            <span style={styles.gradientText}>Comply.</span>{' '}
            <span style={styles.gradientTextAlt}>Protect.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.2}>
          <p style={styles.heroSub}>
            Field-to-lab water quality assessment platform built for environmental
            consultants. Real-time scoring, regulatory compliance, and PFAS tracking
            in a mobile-first PWA.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            {canInstall && (
              <button onClick={handleInstall} style={styles.ctaPrimary}>
                Install App
              </button>
            )}
            <a href="#install" style={styles.ctaSecondary}>
              Learn How to Install
            </a>
          </div>
        </Reveal>
      </section>

      {/* ── Features ── */}
      <section id="features" style={styles.section}>
        <Reveal>
          <h2 style={styles.sectionTitle}>Comprehensive Water Quality Toolkit</h2>
          <p style={styles.sectionSub}>Every module built for environmental professionals who demand accuracy and regulatory compliance.</p>
        </Reveal>
        <div style={styles.featuresGrid}>
          {features.map((f, i) => (
            <Reveal key={f.key} delay={i * 0.08}>
              <div style={styles.featureCard}>
                <div style={styles.featureIconWrap}>
                  <FeatureIcon type={f.key} />
                </div>
                <h3 style={styles.featureTitle}>{f.title}</h3>
                <p style={styles.featureDesc}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Stats ── */}
      <section id="stats" style={styles.section}>
        <Reveal>
          <h2 style={styles.sectionTitle}>Platform at a Glance</h2>
        </Reveal>
        <div style={styles.statsGrid}>
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.1}>
              <StatCounter target={s.target} suffix={s.suffix} label={s.label} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Install / Phone Mockup ── */}
      <section id="install" style={styles.section}>
        <div style={styles.installGrid}>
          <Reveal>
            <div>
              <h2 style={{ ...styles.sectionTitle, textAlign: 'left' }}>Install on Your Device</h2>
              <p style={{ ...styles.sectionSub, textAlign: 'left', maxWidth: 480 }}>
                HydroScan is a Progressive Web App. Install it directly from your browser for an app-like experience with offline support.
              </p>
              <div style={styles.installSteps}>
                <div style={styles.installStep}>
                  <div style={styles.stepNum}>1</div>
                  <div>
                    <strong style={{ color: '#E2E8F0' }}>Open in Chrome or Safari</strong>
                    <p style={{ color: '#64748B', margin: '4px 0 0', fontSize: 14 }}>Visit this page on your mobile device</p>
                  </div>
                </div>
                <div style={styles.installStep}>
                  <div style={styles.stepNum}>2</div>
                  <div>
                    <strong style={{ color: '#E2E8F0' }}>Tap "Add to Home Screen"</strong>
                    <p style={{ color: '#64748B', margin: '4px 0 0', fontSize: 14 }}>Chrome: menu icon, Safari: share icon</p>
                  </div>
                </div>
                <div style={styles.installStep}>
                  <div style={styles.stepNum}>3</div>
                  <div>
                    <strong style={{ color: '#E2E8F0' }}>Launch HydroScan</strong>
                    <p style={{ color: '#64748B', margin: '4px 0 0', fontSize: 14 }}>Opens full-screen with offline capability</p>
                  </div>
                </div>
              </div>
              {canInstall && (
                <button onClick={handleInstall} style={{ ...styles.ctaPrimary, marginTop: 24 }}>
                  Install App Now
                </button>
              )}
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PhoneMockup />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <DropLogo s={28} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16, color: '#94A3B8' }}>HydroScan</span>
          </div>
          <p style={{ color: '#475569', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Prudence Safety & Environmental Consulting, LLC<br />
            &copy; {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </footer>

      <style>{landingKeyframes}</style>
    </div>
  )
}

/* ─── KEYFRAMES ──────────────────────────────────────────────── */

const landingKeyframes = `
@keyframes lp-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes lp-glow-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}
@keyframes lp-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
`

/* ─── STYLES ─────────────────────────────────────────────────── */

const styles = {
  page: {
    minHeight: '100vh',
    background: '#050507',
    color: '#E2E8F0',
    fontFamily: "'Inter', sans-serif",
    position: 'relative',
    overflow: 'hidden',
  },

  /* Ambient glows */
  ambientTop: {
    position: 'absolute',
    top: '-20%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '120vw',
    height: '60vh',
    background: 'radial-gradient(ellipse at center, rgba(13,148,136,0.12) 0%, rgba(34,211,238,0.04) 40%, transparent 70%)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  ambientMid: {
    position: 'absolute',
    top: '50%',
    right: '-10%',
    width: '50vw',
    height: '50vh',
    background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
    zIndex: 0,
  },

  /* Nav */
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    background: 'rgba(5,5,7,0.8)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(148,163,184,0.06)',
  },
  navInner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '14px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navBrand: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: 20,
    background: 'linear-gradient(135deg, #0D9488, #22D3EE)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  navLink: {
    color: '#94A3B8',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    transition: 'color 0.2s',
  },

  /* Hero */
  hero: {
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    paddingTop: 160,
    paddingBottom: 80,
    maxWidth: 860,
    margin: '0 auto',
    padding: '160px 32px 80px',
  },
  badge: {
    display: 'inline-block',
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    fontWeight: 500,
    color: '#5EEAD4',
    background: 'rgba(13,148,136,0.1)',
    border: '1px solid rgba(13,148,136,0.2)',
    borderRadius: 100,
    padding: '6px 18px',
    marginBottom: 28,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 'clamp(40px, 6vw, 72px)',
    fontWeight: 800,
    lineHeight: 1.08,
    margin: '0 0 24px',
    letterSpacing: '-0.03em',
  },
  gradientText: {
    background: 'linear-gradient(135deg, #0D9488, #22D3EE)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  gradientTextAlt: {
    background: 'linear-gradient(135deg, #22D3EE, #8B5CF6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  heroSub: {
    fontSize: 18,
    lineHeight: 1.7,
    color: '#94A3B8',
    maxWidth: 600,
    margin: '0 auto 36px',
  },

  /* CTAs */
  ctaPrimary: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 15,
    fontWeight: 600,
    color: '#050507',
    background: 'linear-gradient(135deg, #0D9488, #22D3EE)',
    border: 'none',
    borderRadius: 10,
    padding: '14px 32px',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 0 24px rgba(13,148,136,0.3)',
  },
  ctaSecondary: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 15,
    fontWeight: 600,
    color: '#94A3B8',
    background: 'rgba(148,163,184,0.08)',
    border: '1px solid rgba(148,163,184,0.15)',
    borderRadius: 10,
    padding: '14px 32px',
    textDecoration: 'none',
    transition: 'border-color 0.2s, color 0.2s',
  },

  /* Sections */
  section: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 1200,
    margin: '0 auto',
    padding: '80px 32px',
  },
  sectionTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 'clamp(28px, 4vw, 42px)',
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: '-0.02em',
    color: '#F1F5F9',
  },
  sectionSub: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 600,
    margin: '0 auto 48px',
    lineHeight: 1.6,
  },

  /* Features grid */
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 20,
  },
  featureCard: {
    background: 'rgba(15,23,42,0.5)',
    border: '1px solid rgba(148,163,184,0.06)',
    borderRadius: 14,
    padding: '28px 24px',
    transition: 'border-color 0.3s, transform 0.3s',
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'rgba(13,148,136,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  featureTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 18,
    fontWeight: 600,
    margin: '0 0 8px',
    color: '#E2E8F0',
  },
  featureDesc: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#64748B',
    margin: 0,
  },

  /* Stats */
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 20,
  },
  statCard: {
    textAlign: 'center',
    padding: '32px 20px',
    background: 'rgba(15,23,42,0.4)',
    border: '1px solid rgba(148,163,184,0.06)',
    borderRadius: 14,
  },
  statValue: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 42,
    fontWeight: 800,
    display: 'block',
    marginBottom: 6,
    background: 'linear-gradient(135deg, #0D9488, #22D3EE)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  statLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    color: '#64748B',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },

  /* Install section */
  installGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 60,
    alignItems: 'center',
  },
  installSteps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    marginTop: 28,
  },
  installStep: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
  },
  stepNum: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    background: 'rgba(13,148,136,0.12)',
    border: '1px solid rgba(13,148,136,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: 15,
    color: '#5EEAD4',
  },

  /* Phone mockup */
  phoneMockup: {
    width: 260,
    height: 520,
    background: '#0A0A12',
    borderRadius: 36,
    border: '3px solid rgba(148,163,184,0.12)',
    padding: '48px 16px 24px',
    position: 'relative',
    boxShadow: '0 0 60px rgba(13,148,136,0.1), 0 20px 60px rgba(0,0,0,0.4)',
    animation: 'lp-float 4s ease-in-out infinite',
  },
  phoneNotch: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 80,
    height: 24,
    background: '#050507',
    borderRadius: 14,
  },
  phoneScreen: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },

  /* Footer */
  footer: {
    position: 'relative',
    zIndex: 1,
    borderTop: '1px solid rgba(148,163,184,0.06)',
    padding: '40px 32px',
  },
  footerInner: {
    maxWidth: 1200,
    margin: '0 auto',
  },
}
