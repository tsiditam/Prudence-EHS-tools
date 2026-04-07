/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 * Contact: tsidi@prudenceehs.com
 */

import React, { useState, useEffect } from 'react'
import { useInView } from '../hooks/useInView'
import { useCounter } from '../hooks/useCounter'

/* ─── Section wrapper with scroll-reveal ─── */
function Reveal({ children, delay = 0, className = '' }) {
  const [ref, isInView] = useInView({ threshold: 0.12 })
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? 'translateY(0)' : 'translateY(40px)',
        transition: `opacity 0.7s cubic-bezier(.4,0,.2,1) ${delay}ms, transform 0.7s cubic-bezier(.4,0,.2,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

/* ─── Stat counter card ─── */
function StatCard({ value, suffix = '', label }) {
  const [ref, count] = useCounter(value, 1800)
  return (
    <div ref={ref} style={styles.statCard}>
      <span style={styles.statValue}>
        {count}{suffix}
      </span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  )
}

/* ─── Feature card ─── */
function FeatureCard({ icon, title, description, delay }) {
  const [ref, isInView] = useInView({ threshold: 0.15 })
  return (
    <div
      ref={ref}
      style={{
        ...styles.featureCard,
        opacity: isInView ? 1 : 0,
        transform: isInView ? 'translateY(0)' : 'translateY(32px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      <div style={styles.featureIcon}>{icon}</div>
      <h3 style={styles.featureTitle}>{title}</h3>
      <p style={styles.featureDesc}>{description}</p>
    </div>
  )
}

/* ─── Main Landing Page ─── */
export default function LandingPage({ isDesktop }) {
  const [installable, setInstallable] = useState(false)

  useEffect(() => {
    const check = () => setInstallable(!!window._pwaPrompt)
    check()
    const id = setInterval(check, 1000)
    return () => clearInterval(id)
  }, [])

  const handleInstall = async () => {
    const prompt = window._pwaPrompt
    if (!prompt) return
    prompt.prompt()
    const result = await prompt.userChoice
    if (result.outcome === 'accepted') {
      window._pwaPrompt = null
      setInstallable(false)
    }
  }

  const features = [
    { icon: '🛡️', title: 'Compliance Scoring', description: 'Quantitative 100-point scoring engine evaluates regulatory alignment across every applicable standard.' },
    { icon: '📑', title: 'Citation Analysis', description: 'Deep citation cross-referencing maps each finding to specific regulatory paragraphs and subparts.' },
    { icon: '📄', title: 'Document Review', description: 'AI-powered document classification and review with intelligent type detection and validation.' },
    { icon: '🗺️', title: 'Regulatory Mapping', description: 'Visual mapping of regulatory relationships across federal, state, and local jurisdictions.' },
    { icon: '📋', title: 'Abatement Planning', description: 'Automated corrective action timelines with priority ranking and resource allocation guidance.' },
    { icon: '🏭', title: 'Multi-Industry Support', description: 'Pre-built regulatory templates spanning construction, manufacturing, healthcare, and more.' },
  ]

  return (
    <div style={styles.page}>
      {/* Ambient glow */}
      <div style={styles.ambientGlow} />
      <div style={styles.ambientGlowViolet} />

      {/* ─── NAV ─── */}
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          <div style={styles.logoWrap}>
            <div style={styles.logoMark}>RL</div>
            <span style={styles.logoText}>RegLens</span>
          </div>
          {installable && (
            <button onClick={handleInstall} style={styles.navInstallBtn}>
              Install App
            </button>
          )}
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section style={styles.hero}>
        <Reveal>
          <p style={styles.heroBadge}>Built by a Certified Safety Professional</p>
        </Reveal>
        <Reveal delay={120}>
          <h1 style={styles.heroTitle}>
            Know your <span style={styles.heroGradient}>compliance gaps</span>{' '}
            before OSHA does.
          </h1>
        </Reveal>
        <Reveal delay={240}>
          <p style={styles.heroSub}>
            Upload your safety program and get a scored gap analysis in minutes — not hours.
            RegLens checks your documents against 50+ federal and state regulations so you
            can fix issues before they become citations.
          </p>
        </Reveal>
        <Reveal delay={360}>
          <div style={styles.heroCtas}>
            {installable ? (
              <button onClick={handleInstall} style={styles.ctaPrimary}>
                Get Started Free
              </button>
            ) : (
              <a href="#sample-report" style={styles.ctaPrimary}>
                See a Sample Report
              </a>
            )}
          </div>
        </Reveal>
      </section>

      {/* ─── STATS ─── */}
      <section style={styles.section}>
        <div style={styles.statsGrid}>
          <StatCard value={6} suffix=" min" label="Avg. Review Time" />
          <StatCard value={50} suffix="+" label="Regulations Checked" />
          <StatCard value={16131} suffix="" label="Avg. OSHA Penalty ($)" />
          <StatCard value={8} suffix="" label="Industries Covered" />
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section style={styles.section}>
        <Reveal>
          <h2 style={styles.sectionTitle}>
            Built for <span style={styles.heroGradient}>EHS professionals</span>
          </h2>
          <p style={styles.sectionSub}>
            Every tool a compliance officer needs, unified in a single intelligent platform.
          </p>
        </Reveal>
        <div style={styles.featuresGrid}>
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} delay={i * 100} />
          ))}
        </div>
      </section>

      {/* ─── SOCIAL PROOF ─── */}
      <section style={styles.section}>
        <Reveal>
          <div style={styles.proofSection}>
            <div style={styles.proofCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={styles.proofShield}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6v6c0 5.5 3.4 10.3 8 12 4.6-1.7 8-6.5 8-12V6l-8-4z" stroke="#16a34a" strokeWidth="2" fill="rgba(22,163,74,0.15)"/><path d="M9 12l2 2 4-4" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 15, color: '#fff' }}>Built by a Certified Safety Professional</div>
                  <div style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }}>13+ years across federal, healthcare, and industrial EHS</div>
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#ccc', lineHeight: 1.7, fontStyle: 'italic', borderLeft: '3px solid #16a34a', paddingLeft: 16 }}>
                "Every review uses a deterministic, transparent scoring engine — the same document always produces the same score. No AI guesswork, no randomness."
              </div>
            </div>
            <div style={styles.proofQuotes}>
              {[
                { quote: "Cut our program review time from a full day to under an hour.", role: "Safety Director, Manufacturing" },
                { quote: "Found 3 critical gaps in our HAZCOM program we'd missed for years.", role: "EHS Manager, Healthcare" },
                { quote: "The citation-level detail gives us exactly what we need for abatement.", role: "Compliance Consultant" },
              ].map((t, i) => (
                <div key={i} style={styles.quoteCard}>
                  <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6, marginBottom: 10 }}>"{t.quote}"</div>
                  <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{t.role}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── SAMPLE REPORT ─── */}
      <section id="sample-report" style={styles.section}>
        <Reveal>
          <h2 style={styles.sectionTitle}>
            See what a <span style={styles.heroGradient}>review looks like</span>
          </h2>
          <p style={styles.sectionSub}>
            Every compliance review produces a detailed, actionable report with scores, findings, and regulatory citations.
          </p>
        </Reveal>
        <Reveal delay={150}>
          <div style={styles.sampleReport}>
            <div style={styles.sampleHeader}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#16a34a', marginBottom: 4 }}>SAMPLE REPORT</div>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, color: '#fff' }}>Hazard Communication Program</div>
                  <div style={{ fontSize: 12, color: '#8E8E93', marginTop: 4 }}>Manufacturing — General Industry</div>
                </div>
                <div style={styles.sampleScore}>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 32, fontWeight: 800, color: '#F59E0B' }}>68</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#F59E0B' }}>/ 100</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: '2 Critical', color: '#EF4444' },
                  { label: '3 Major', color: '#F59E0B' },
                  { label: '4 Minor', color: '#3B82F6' },
                ].map((f, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: `${f.color}15`, color: f.color, border: `1px solid ${f.color}30`, fontWeight: 600 }}>{f.label}</span>
                ))}
              </div>
            </div>
            <div style={styles.sampleFindings}>
              {[
                { sev: 'Critical', title: 'Missing SDS access procedures', reg: '29 CFR 1910.1200(g)(8)', desc: 'No documented procedure for employee access to Safety Data Sheets during shifts.' },
                { sev: 'Major', title: 'Incomplete container labeling protocol', reg: '29 CFR 1910.1200(f)(6)', desc: 'Secondary containers lack required GHS-compliant hazard warnings.' },
              ].map((f, i) => (
                <div key={i} style={{ padding: '14px 0', borderBottom: i === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: f.sev === 'Critical' ? '#EF444415' : '#F59E0B15', color: f.sev === 'Critical' ? '#EF4444' : '#F59E0B', fontWeight: 700 }}>{f.sev}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{f.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#8E8E93', lineHeight: 1.6, marginBottom: 6 }}>{f.desc}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#16a34a' }}>{f.reg}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', padding: '16px 0 4px', fontSize: 12, color: '#555' }}>
              ↑ Sample excerpt — full reports include all findings, recommendations, and abatement timelines
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── PHONE MOCKUP / INSTALL ─── */}
      <section style={styles.section}>
        <Reveal>
          <h2 style={styles.sectionTitle}>
            Take it <span style={styles.heroGradient}>anywhere</span>
          </h2>
          <p style={styles.sectionSub}>
            Install RegLens as a native-like app on your phone or tablet for field audits and on-site reviews.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <div style={styles.installSection}>
            <div style={styles.phoneMockup}>
              <div style={styles.phoneScreen}>
                <div style={styles.phoneStatusBar}>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace' }}>9:41</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ width: 16, height: 10, borderRadius: 2, border: '1px solid #fff', position: 'relative' }}>
                      <div style={{ position: 'absolute', inset: 2, background: '#16a34a', borderRadius: 1 }} />
                    </div>
                  </div>
                </div>
                <div style={styles.phoneContent}>
                  <div style={styles.phoneLogoMark}>RL</div>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 12 }}>
                    RegLens
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#8E8E93', marginTop: 4 }}>
                    Regulatory Intelligence
                  </div>
                  <div style={styles.phoneScoreBar}>
                    <div style={styles.phoneScoreFill} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    {['Dashboard', 'Review', 'Reports'].map(t => (
                      <div key={t} style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 10,
                        fontFamily: 'Inter, sans-serif', background: t === 'Dashboard' ? '#16a34a22' : '#1C1C1E',
                        color: t === 'Dashboard' ? '#16a34a' : '#8E8E93', border: '1px solid ' + (t === 'Dashboard' ? '#16a34a44' : '#2A2A2E'),
                      }}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div style={styles.installSteps}>
              <h3 style={styles.installStepsTitle}>Install in seconds</h3>
              <div style={styles.step}>
                <span style={styles.stepNum}>1</span>
                <div>
                  <strong style={{ color: '#fff' }}>Open in Chrome or Safari</strong>
                  <p style={{ margin: '4px 0 0', color: '#8E8E93', fontSize: 14 }}>Visit this page on your mobile device</p>
                </div>
              </div>
              <div style={styles.step}>
                <span style={styles.stepNum}>2</span>
                <div>
                  <strong style={{ color: '#fff' }}>Tap "Install" or "Add to Home Screen"</strong>
                  <p style={{ margin: '4px 0 0', color: '#8E8E93', fontSize: 14 }}>Use the browser menu or the install banner</p>
                </div>
              </div>
              <div style={styles.step}>
                <span style={styles.stepNum}>3</span>
                <div>
                  <strong style={{ color: '#fff' }}>Launch from your home screen</strong>
                  <p style={{ margin: '4px 0 0', color: '#8E8E93', fontSize: 14 }}>Opens full-screen like a native app</p>
                </div>
              </div>
              {installable && (
                <button onClick={handleInstall} style={{ ...styles.ctaPrimary, marginTop: 20, width: '100%' }}>
                  Install App
                </button>
              )}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <div style={styles.footerLogo}>
            <div style={styles.logoMark}>RL</div>
            <span style={styles.logoText}>RegLens</span>
          </div>
          <p style={styles.footerCopy}>
            &copy; {new Date().getFullYear()} Prudence Safety &amp; Environmental Consulting, LLC
          </p>
          <p style={styles.footerSub}>All rights reserved. · Privacy Policy & Terms available in app.</p>
        </div>
      </footer>

      <style>{`
        @keyframes rl-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        @keyframes rl-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes rl-gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes rl-score-fill {
          0% { width: 0%; }
          100% { width: 78%; }
        }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { margin: 0; background: #050507; }
        ::selection { background: #16a34a44; color: #fff; }
      `}</style>
    </div>
  )
}

/* ─── Styles ─── */
const styles = {
  page: {
    minHeight: '100vh',
    background: '#050507',
    color: '#fff',
    fontFamily: 'Inter, system-ui, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },

  /* Ambient glows */
  ambientGlow: {
    position: 'fixed',
    top: '-30%',
    left: '-10%',
    width: '60%',
    height: '60%',
    background: 'radial-gradient(ellipse at center, rgba(22,163,74,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
    animation: 'rl-pulse 6s ease-in-out infinite',
    zIndex: 0,
  },
  ambientGlowViolet: {
    position: 'fixed',
    bottom: '-20%',
    right: '-10%',
    width: '50%',
    height: '50%',
    background: 'radial-gradient(ellipse at center, rgba(37,99,235,0.06) 0%, transparent 70%)',
    pointerEvents: 'none',
    animation: 'rl-pulse 8s ease-in-out infinite 2s',
    zIndex: 0,
  },

  /* Nav */
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backdropFilter: 'blur(20px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
    background: 'rgba(5,5,7,0.75)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  navInner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '14px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 9,
    background: 'linear-gradient(135deg, #16a34a, #2563EB)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Space Grotesk, sans-serif',
    fontWeight: 800,
    fontSize: 14,
    color: '#fff',
    letterSpacing: '-0.5px',
  },
  logoText: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontWeight: 700,
    fontSize: 20,
    color: '#fff',
    letterSpacing: '-0.5px',
  },
  navInstallBtn: {
    padding: '8px 20px',
    borderRadius: 8,
    border: '1px solid #16a34a',
    background: 'transparent',
    color: '#16a34a',
    fontFamily: 'Inter, sans-serif',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  /* Hero */
  hero: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 900,
    margin: '0 auto',
    padding: '160px 32px 80px',
    textAlign: 'center',
  },
  heroBadge: {
    display: 'inline-block',
    padding: '6px 16px',
    borderRadius: 100,
    background: 'rgba(22,163,74,0.1)',
    border: '1px solid rgba(22,163,74,0.2)',
    color: '#16a34a',
    fontFamily: 'DM Mono, monospace',
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: '0.5px',
    marginBottom: 24,
  },
  heroTitle: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 'clamp(40px, 6vw, 72px)',
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: '-2px',
    color: '#fff',
    margin: '0 0 24px',
  },
  heroGradient: {
    background: 'linear-gradient(135deg, #16a34a 0%, #2563EB 100%)',
    backgroundSize: '200% 200%',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'rl-gradient-shift 4s ease infinite',
  },
  heroSub: {
    fontSize: 18,
    lineHeight: 1.7,
    color: '#8E8E93',
    maxWidth: 640,
    margin: '0 auto 40px',
  },
  heroCtas: {
    display: 'flex',
    gap: 16,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  ctaPrimary: {
    padding: '14px 36px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #16a34a, #15803d)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
    transition: 'all 0.25s',
    boxShadow: '0 0 30px rgba(22,163,74,0.3)',
  },
  ctaHint: {
    padding: '14px 28px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: '#6b7280',
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
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
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 'clamp(28px, 4vw, 44px)',
    fontWeight: 800,
    letterSpacing: '-1.5px',
    color: '#fff',
    textAlign: 'center',
    margin: '0 0 16px',
  },
  sectionSub: {
    fontSize: 16,
    lineHeight: 1.7,
    color: '#8E8E93',
    textAlign: 'center',
    maxWidth: 560,
    margin: '0 auto 48px',
  },

  /* Stats */
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 20,
  },
  statCard: {
    padding: '32px 24px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  statValue: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 40,
    fontWeight: 800,
    letterSpacing: '-1px',
    background: 'linear-gradient(135deg, #16a34a, #2563EB)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  statLabel: {
    fontFamily: 'DM Mono, monospace',
    fontSize: 13,
    color: '#8E8E93',
    letterSpacing: '0.5px',
  },

  /* Features */
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 20,
  },
  featureCard: {
    padding: '28px 24px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    transition: 'border-color 0.3s, background 0.3s',
  },
  featureIcon: {
    fontSize: 28,
    marginBottom: 14,
  },
  featureTitle: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    margin: '0 0 8px',
    letterSpacing: '-0.3px',
  },
  featureDesc: {
    fontSize: 14,
    lineHeight: 1.65,
    color: '#8E8E93',
    margin: 0,
  },

  /* Install / Phone mockup section */
  installSection: {
    display: 'flex',
    gap: 60,
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  phoneMockup: {
    width: 260,
    height: 520,
    borderRadius: 36,
    background: '#1C1C1E',
    border: '3px solid #2A2A2E',
    padding: 8,
    boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(22,163,74,0.08)',
    animation: 'rl-float 5s ease-in-out infinite',
    flexShrink: 0,
  },
  phoneScreen: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    background: '#000',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  phoneStatusBar: {
    padding: '12px 20px 8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#fff',
  },
  phoneContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  phoneLogoMark: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #16a34a, #2563EB)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Space Grotesk, sans-serif',
    fontWeight: 800,
    fontSize: 20,
    color: '#fff',
  },
  phoneScoreBar: {
    width: '80%',
    height: 6,
    borderRadius: 3,
    background: '#1C1C1E',
    marginTop: 20,
    overflow: 'hidden',
  },
  phoneScoreFill: {
    height: '100%',
    borderRadius: 3,
    background: 'linear-gradient(90deg, #16a34a, #2563EB)',
    animation: 'rl-score-fill 2s ease-out forwards',
  },
  installSteps: {
    maxWidth: 400,
  },
  installStepsTitle: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 24,
    fontWeight: 700,
    color: '#fff',
    margin: '0 0 24px',
    letterSpacing: '-0.5px',
  },
  step: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: 'rgba(22,163,74,0.12)',
    border: '1px solid rgba(22,163,74,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'DM Mono, monospace',
    fontSize: 14,
    fontWeight: 600,
    color: '#16a34a',
    flexShrink: 0,
  },

  /* Social Proof */
  proofSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  proofCard: {
    padding: '28px 24px',
    borderRadius: 16,
    background: 'rgba(22,163,74,0.04)',
    border: '1px solid rgba(22,163,74,0.15)',
  },
  proofShield: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: 'rgba(22,163,74,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  proofQuotes: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
  },
  quoteCard: {
    padding: '20px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
  },

  /* Sample Report */
  sampleReport: {
    maxWidth: 600,
    margin: '0 auto',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  sampleHeader: {
    padding: '24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  sampleScore: {
    textAlign: 'center',
    padding: '12px 16px',
    borderRadius: 14,
    background: 'rgba(245,158,11,0.08)',
    border: '1px solid rgba(245,158,11,0.2)',
    flexShrink: 0,
  },
  sampleFindings: {
    padding: '4px 24px',
  },

  /* Footer */
  footer: {
    position: 'relative',
    zIndex: 1,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    marginTop: 40,
  },
  footerInner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '48px 32px',
    textAlign: 'center',
  },
  footerLogo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  footerCopy: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    color: '#6b7280',
    margin: '0 0 4px',
  },
  footerSub: {
    fontFamily: 'DM Mono, monospace',
    fontSize: 12,
    color: '#555',
    margin: 0,
  },
}
