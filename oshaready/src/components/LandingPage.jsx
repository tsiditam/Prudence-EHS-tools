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
import { useInView } from '../hooks/useInView'
import { useCounter } from '../hooks/useCounter'

const RED = '#DC2626'
const GOLD = '#F5C542'
const BG = '#050507'
const SURFACE = '#0C0E14'
const BORDER = 'rgba(220,38,38,0.12)'

function Section({ children, style, delay = 0 }) {
  const [ref, isInView] = useInView({ threshold: 0.1 })
  return (
    <div
      ref={ref}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? 'translateY(0)' : 'translateY(40px)',
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function StatCard({ value, suffix, label }) {
  const [ref, count] = useCounter(value)
  return (
    <div ref={ref} style={{
      textAlign: 'center',
      padding: '32px 16px',
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 16,
      minWidth: 180,
      flex: '1 1 180px',
    }}>
      <div style={{
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: 48,
        fontWeight: 700,
        color: RED,
        lineHeight: 1,
      }}>
        {count}{suffix}
      </div>
      <div style={{
        fontFamily: 'DM Mono, monospace',
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 10,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
    </div>
  )
}

const FEATURES = [
  { icon: '\uD83D\uDD0D', title: 'Mock OSHA Inspections', desc: 'Walk through every phase of a real OSHA inspection with standards-mapped checklists and real-time scoring.' },
  { icon: '\u26A0\uFE0F', title: 'Hazard Tracking', desc: 'Log, classify, and track hazards by severity with CFR references and corrective action timelines.' },
  { icon: '\uD83C\uDF93', title: 'Training Management', desc: 'Monitor employee certifications, expiration dates, and compliance status across all sites.' },
  { icon: '\uD83D\uDCC4', title: 'Document Control', desc: 'Manage safety programs, SDS indexes, and OSHA logs with version history and approval workflows.' },
  { icon: '\u2705', title: 'Action Items', desc: 'Track corrective and preventive actions from inspections and hazard reports to closure.' },
  { icon: '\uD83D\uDCCA', title: 'Compliance Dashboard', desc: 'See your overall OSHA readiness score with drill-down by standard, site, and inspection phase.' },
]

export default function LandingPage({ isDesktop }) {
  const [installHover, setInstallHover] = useState(false)

  const handleInstall = async () => {
    const prompt = window._pwaPrompt
    if (prompt) {
      prompt.prompt()
      await prompt.userChoice
      window._pwaPrompt = null
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: BG,
      color: '#fff',
      fontFamily: 'Inter, sans-serif',
      overflowX: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        background: `
          radial-gradient(ellipse 600px 400px at 20% 10%, rgba(220,38,38,0.08) 0%, transparent 70%),
          radial-gradient(ellipse 500px 500px at 80% 30%, rgba(245,197,66,0.04) 0%, transparent 70%),
          radial-gradient(ellipse 800px 300px at 50% 80%, rgba(220,38,38,0.05) 0%, transparent 70%)
        `,
        animation: 'warmGlow 8s ease-in-out infinite',
      }} />

      {/* NAV */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 48px',
        background: 'rgba(5,5,7,0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${RED}, #991B1B)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 800,
            fontFamily: 'Space Grotesk, sans-serif',
            color: '#fff',
          }}>OR</div>
          <span style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: -0.5,
          }}>
            OSHA<span style={{ color: RED }}>ready</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <a href="#features" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Features</a>
          <a href="#stats" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Platform</a>
          <a href="#install" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Install</a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        position: 'relative',
        zIndex: 1,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '120px 32px 80px',
      }}>
        <Section>
          <div style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: 12,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: GOLD,
            marginBottom: 24,
          }}>
            OSHA Inspection Readiness Platform
          </div>
        </Section>

        <Section delay={0.1}>
          <h1 style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 'clamp(40px, 6vw, 80px)',
            fontWeight: 800,
            lineHeight: 1.05,
            margin: '0 0 28px',
            maxWidth: 900,
            background: `linear-gradient(135deg, #FFFFFF 0%, ${RED} 50%, ${GOLD} 100%)`,
            backgroundSize: '200% 200%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'gradientShift 6s ease-in-out infinite',
          }}>
            Be Ready Before{' '}
            <br />
            They Arrive
          </h1>
        </Section>

        <Section delay={0.2}>
          <p style={{
            fontSize: 18,
            lineHeight: 1.7,
            color: 'rgba(255,255,255,0.6)',
            maxWidth: 600,
            margin: '0 auto 48px',
          }}>
            Walk through every phase of an OSHA inspection on your phone.
            Mock inspections, hazard tracking, training management, and
            compliance scoring -- built for safety professionals.
          </p>
        </Section>

        <Section delay={0.3}>
          <div style={{
            display: 'flex',
            gap: 16,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={handleInstall}
              onMouseEnter={() => setInstallHover(true)}
              onMouseLeave={() => setInstallHover(false)}
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 16,
                fontWeight: 700,
                padding: '16px 40px',
                borderRadius: 12,
                border: 'none',
                background: installHover
                  ? `linear-gradient(135deg, #EF4444, ${RED})`
                  : `linear-gradient(135deg, ${RED}, #991B1B)`,
                color: '#fff',
                cursor: 'pointer',
                boxShadow: installHover
                  ? '0 8px 40px rgba(220,38,38,0.4)'
                  : '0 4px 24px rgba(220,38,38,0.25)',
                transition: 'all 0.3s ease',
                transform: installHover ? 'translateY(-2px)' : 'translateY(0)',
              }}
            >
              Install App
            </button>
          </div>
        </Section>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          animation: 'float 3s ease-in-out infinite',
        }}>
          <div style={{
            width: 24,
            height: 40,
            borderRadius: 12,
            border: '2px solid rgba(255,255,255,0.15)',
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 8,
          }}>
            <div style={{
              width: 3,
              height: 8,
              borderRadius: 2,
              background: RED,
              animation: 'pulse 2s ease-in-out infinite',
            }} />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{
        position: 'relative',
        zIndex: 1,
        padding: '100px 48px',
        maxWidth: 1200,
        margin: '0 auto',
      }}>
        <Section>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: 11,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: RED,
              marginBottom: 16,
            }}>
              Platform Capabilities
            </div>
            <h2 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 'clamp(28px, 4vw, 48px)',
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.1,
            }}>
              Everything You Need for{' '}
              <span style={{ color: RED }}>Inspection Readiness</span>
            </h2>
          </div>
        </Section>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
        }}>
          {FEATURES.map((f, i) => (
            <Section key={i} delay={i * 0.08}>
              <div style={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: '32px 28px',
                height: '100%',
                transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(220,38,38,0.3)'
                  e.currentTarget.style.boxShadow = '0 8px 40px rgba(220,38,38,0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = BORDER
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 18,
                  fontWeight: 600,
                  margin: '0 0 10px',
                }}>
                  {f.title}
                </h3>
                <p style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: 'rgba(255,255,255,0.55)',
                  margin: 0,
                }}>
                  {f.desc}
                </p>
              </div>
            </Section>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section id="stats" style={{
        position: 'relative',
        zIndex: 1,
        padding: '80px 48px',
        maxWidth: 1000,
        margin: '0 auto',
      }}>
        <Section>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: 11,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: GOLD,
              marginBottom: 16,
            }}>
              By the Numbers
            </div>
            <h2 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 'clamp(24px, 3.5vw, 40px)',
              fontWeight: 700,
              margin: 0,
            }}>
              Built on Real <span style={{ color: RED }}>OSHA Standards</span>
            </h2>
          </div>
        </Section>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'center',
        }}>
          <StatCard value={25} suffix="+" label="OSHA Standards" />
          <StatCard value={5} suffix="" label="Inspection Phases" />
          <StatCard value={100} suffix="+" label="Checklist Items" />
          <StatCard value={100} suffix="%" label="Real-Time Scoring" />
        </div>
      </section>

      {/* PHONE MOCKUP / INSTALL */}
      <section id="install" style={{
        position: 'relative',
        zIndex: 1,
        padding: '100px 48px',
        maxWidth: 1100,
        margin: '0 auto',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 64,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          {/* Phone mockup */}
          <Section>
            <div style={{
              width: 280,
              height: 560,
              borderRadius: 40,
              border: '3px solid rgba(255,255,255,0.1)',
              background: `linear-gradient(180deg, #0C0E14 0%, ${BG} 100%)`,
              padding: '48px 20px 20px',
              position: 'relative',
              boxShadow: `0 40px 100px rgba(220,38,38,0.12), 0 0 0 1px rgba(255,255,255,0.04)`,
            }}>
              {/* Notch */}
              <div style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 100,
                height: 24,
                borderRadius: 12,
                background: BG,
                border: '1px solid rgba(255,255,255,0.05)',
              }} />

              {/* Screen content */}
              <div style={{
                background: '#0A0C10',
                borderRadius: 20,
                height: '100%',
                padding: '24px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: 16,
              }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: `linear-gradient(135deg, ${RED}, #991B1B)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 800,
                  fontSize: 18,
                }}>OR</div>
                <div style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 18,
                  fontWeight: 700,
                }}>OSHAready</div>
                <div style={{
                  fontFamily: 'DM Mono, monospace',
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.4)',
                  letterSpacing: 1,
                }}>INSPECTION READINESS</div>

                {/* Mini dashboard preview */}
                <div style={{ width: '100%', marginTop: 12 }}>
                  <div style={{
                    background: 'rgba(220,38,38,0.08)',
                    borderRadius: 10,
                    padding: '12px',
                    marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Mono, monospace' }}>READINESS</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: RED, fontFamily: 'Space Grotesk, sans-serif' }}>78%</div>
                  </div>
                  {[82, 65, 91].map((w, i) => (
                    <div key={i} style={{
                      height: 6,
                      borderRadius: 3,
                      background: 'rgba(255,255,255,0.06)',
                      marginBottom: 6,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${w}%`,
                        borderRadius: 3,
                        background: i === 1 ? GOLD : RED,
                        opacity: 0.7,
                      }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Install instructions */}
          <Section delay={0.15}>
            <div style={{ maxWidth: 440 }}>
              <div style={{
                fontFamily: 'DM Mono, monospace',
                fontSize: 11,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: RED,
                marginBottom: 16,
              }}>
                Mobile-First App
              </div>
              <h2 style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 36,
                fontWeight: 700,
                margin: '0 0 20px',
                lineHeight: 1.15,
              }}>
                Install on Your{' '}
                <span style={{ color: GOLD }}>Phone</span>
              </h2>
              <p style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: 'rgba(255,255,255,0.55)',
                margin: '0 0 32px',
              }}>
                OSHAready is built as a progressive web app. Install it directly
                from your browser -- no app store needed. Works offline for
                field inspections.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { step: '01', text: 'Open this page on your phone' },
                  { step: '02', text: 'Tap "Add to Home Screen" in your browser menu' },
                  { step: '03', text: 'Launch OSHAready from your home screen' },
                ].map((s, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '16px 20px',
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 12,
                  }}>
                    <div style={{
                      fontFamily: 'DM Mono, monospace',
                      fontSize: 13,
                      fontWeight: 500,
                      color: RED,
                      minWidth: 28,
                    }}>{s.step}</div>
                    <div style={{
                      fontSize: 14,
                      color: 'rgba(255,255,255,0.7)',
                    }}>{s.text}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleInstall}
                style={{
                  marginTop: 32,
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 15,
                  fontWeight: 700,
                  padding: '14px 36px',
                  borderRadius: 12,
                  border: 'none',
                  background: `linear-gradient(135deg, ${RED}, #991B1B)`,
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 24px rgba(220,38,38,0.25)',
                }}
              >
                Install App
              </button>
            </div>
          </Section>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        position: 'relative',
        zIndex: 1,
        borderTop: `1px solid ${BORDER}`,
        padding: '40px 48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${RED}, #991B1B)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 800,
            fontFamily: 'Space Grotesk, sans-serif',
          }}>OR</div>
          <span style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 15,
            fontWeight: 600,
          }}>
            OSHA<span style={{ color: RED }}>ready</span>
          </span>
        </div>
        <div style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: 0.5,
        }}>
          Prudence Safety & Environmental Consulting, LLC
        </div>
      </footer>

      <style>{`
        @keyframes warmGlow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes float {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-10px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: translateY(0); }
          50% { opacity: 0.4; transform: translateY(4px); }
        }
        html { scroll-behavior: smooth; }
        a:hover { color: rgba(255,255,255,0.9) !important; }
      `}</style>
    </div>
  )
}
