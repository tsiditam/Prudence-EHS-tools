/**
 * Public landing page — atmosiq.prudenceehs.com.
 *
 * Mobile-first React component matching the in-app dark theme. No external
 * trackers; the early-access form is the conversion event tracked in
 * Supabase via /api/early-access.
 *
 * The page is wired into src/main.jsx as the default route when no
 * authenticated session exists. Authenticated users skip past it into
 * the SPA's app shell.
 */

import { useState } from 'react'

const PALETTE = {
  bg: '#080A0E',
  card: '#0F1115',
  surface: '#13161B',
  border: '#1F232C',
  borderSoft: '#2A2F38',
  accent: '#22D3EE',
  accentDeep: '#06B6D4',
  text: '#ECEEF2',
  sub: '#8B93A5',
  dim: '#6B7380',
} as const

const SAMPLE_REPORT_PATH = '/sample-report.pdf'

export interface LandingPageProps {
  /** Override target for the primary signup CTA. Defaults to /signup. */
  signupHref?: string
  /** Override the early-access POST endpoint (used in tests). */
  earlyAccessEndpoint?: string
}

export default function LandingPage({
  signupHref = '/signup',
  earlyAccessEndpoint = '/api/early-access',
}: LandingPageProps) {
  return (
    <div
      style={{
        background: PALETTE.bg,
        color: PALETTE.text,
        minHeight: '100vh',
        fontFamily: "'inherit', system-ui, -apple-system, sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 24px 64px' }}>
        <Hero signupHref={signupHref} />
        <ValueProp />
        <SampleExcerpt />
        <PricingTeaser />
        <BuiltFor />
        <EarlyAccessBlock endpoint={earlyAccessEndpoint} />
      </main>
      <Footer />
    </div>
  )
}

// ─── Hero ──────────────────────────────────────────────────────────
function Hero({ signupHref }: { signupHref: string }) {
  return (
    <header style={{ paddingTop: 32, paddingBottom: 56 }}>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 32 }}>
        Atmos<span style={{ color: PALETTE.accent }}>Flow</span>
      </div>
      <h1
        style={{
          fontFamily: "'inherit', 'inherit', system-ui",
          fontSize: 'clamp(34px, 6vw, 56px)',
          fontWeight: 800,
          lineHeight: 1.05,
          margin: 0,
          marginBottom: 20,
          letterSpacing: '-1px',
        }}
      >
        Indoor Air Quality Assessment<br />
        <span style={{ color: PALETTE.accent }}>that writes its own report.</span>
      </h1>
      <p style={{ fontSize: 17, color: PALETTE.sub, lineHeight: 1.6, maxWidth: 640, marginBottom: 32 }}>
        AtmosFlow turns 6 hours of post-walkthrough report writing into 45 minutes.
        Built for IH and EHS consultants who need CIH-defensible deliverables
        without the typing.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <a
          href={signupHref}
          data-testid="hero-cta-signup"
          style={{
            background: PALETTE.accent,
            color: '#031216',
            padding: '14px 22px',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            textDecoration: 'none',
            border: 'none',
          }}
        >Start free — 1 assessment / month</a>
        <a
          href={SAMPLE_REPORT_PATH}
          data-testid="hero-cta-sample"
          style={{
            background: 'transparent',
            color: PALETTE.text,
            padding: '14px 22px',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: 'none',
            border: `1px solid ${PALETTE.borderSoft}`,
          }}
        >See sample report →</a>
      </div>

      <p style={{ fontSize: 12, color: PALETTE.dim, marginTop: 24 }}>
        By Prudence Safety &amp; Environmental Consulting, LLC
      </p>
    </header>
  )
}

// ─── Value prop ────────────────────────────────────────────────────
function ValueProp() {
  return (
    <section data-testid="section-why" style={{ padding: '40px 0', borderTop: `1px solid ${PALETTE.border}` }}>
      <SectionEyebrow>Why AtmosFlow</SectionEyebrow>
      <div
        style={{
          display: 'grid',
          gap: 24,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          marginTop: 24,
        }}
      >
        <ValueCard
          icon="⚡"
          title="Faster"
          body="Walk through, tap your readings, generate the report. The narrative writes itself in CIH-conservative language you can defend."
        />
        <ValueCard
          icon="🛡"
          title="Defensible"
          body="Every finding pairs with the OSHA / NIOSH / ASHRAE / EPA citation that supports it. AI never invents findings or sets thresholds."
        />
        <ValueCard
          icon="🎯"
          title="Standards-driven"
          body="Hardcoded thresholds from ASHRAE 62.1, ASHRAE 55, OSHA PELs, EPA NAAQS, WHO guidelines. AI never sets a threshold."
        />
      </div>
    </section>
  )
}

function ValueCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div
      style={{
        background: PALETTE.card,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 14,
        padding: 24,
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 14, color: PALETTE.sub, lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  )
}

// ─── Sample excerpt ────────────────────────────────────────────────
function SampleExcerpt() {
  return (
    <section style={{ padding: '40px 0', borderTop: `1px solid ${PALETTE.border}` }}>
      <SectionEyebrow>What the report looks like</SectionEyebrow>
      <div
        style={{
          marginTop: 24,
          background: PALETTE.surface,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 14,
          padding: 28,
        }}
      >
        <div style={{ fontSize: 11, color: PALETTE.dim, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 16 }}>
          Per-Parameter Results — Carbon Dioxide
        </div>
        <div style={{ fontSize: 13, color: PALETTE.sub, lineHeight: 1.7, marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: PALETTE.text }}>Standards Background.</strong>{' '}
            ASHRAE 62.1-2022 prescribes ventilation rates rather than CO₂ concentration limits.
            Indoor CO₂ is commonly used as an indicator of ventilation adequacy relative to
            occupant load: concentrations 700 ppm above outdoor ambient (typically ~420 ppm
            globally) suggest under-ventilation per ASHRAE’s indicator approach.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: PALETTE.text }}>Range Summary.</strong>{' '}
            Site-wide arithmetic mean: 818 ppm (n=8). Outdoor baseline: 432 ppm.
            Indoor-outdoor differential range: 180–815 ppm.
          </p>
          <p style={{ margin: 0, fontSize: 12, color: PALETTE.dim, fontStyle: 'italic' }}>
            Confidence tier: <span style={{ color: PALETTE.accent }}>provisional screening level</span>.
          </p>
        </div>
        <a
          href={SAMPLE_REPORT_PATH}
          data-testid="sample-cta"
          style={{ color: PALETTE.accent, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >Read the full sample (PDF) →</a>
      </div>
      <p style={{ fontSize: 12, color: PALETTE.dim, marginTop: 12, textAlign: 'center' }}>
        An excerpt from a real AtmosFlow report — every paragraph traceable to a published standard.
      </p>
    </section>
  )
}

// ─── Pricing teaser ────────────────────────────────────────────────
function PricingTeaser() {
  const tiers = [
    { name: 'Free', price: '$0 / month', credits: '1 assessment per month', blurb: 'Try AtmosFlow' },
    { name: 'Solo', price: '$129 / month', credits: '50 assessments per month', blurb: 'Independent assessors' },
    { name: 'Pro', price: '$329 / month', credits: '200 assessments per month', blurb: 'Active consulting work', popular: true },
    { name: 'Practice', price: '$749 / month', credits: '500 assessments per month', blurb: 'Small consulting practices' },
  ]
  return (
    <section data-testid="section-pricing" style={{ padding: '40px 0', borderTop: `1px solid ${PALETTE.border}` }}>
      <SectionEyebrow>Pricing</SectionEyebrow>
      <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
        {tiers.map(t => (
          <div
            key={t.name}
            style={{
              background: t.popular ? `${PALETTE.accent}10` : PALETTE.card,
              border: `1px solid ${t.popular ? PALETTE.accent + '40' : PALETTE.border}`,
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '0 0 100px', fontWeight: 700, fontSize: 16 }}>{t.name}</div>
            <div style={{ flex: '0 0 140px', color: PALETTE.accent, fontWeight: 700, fontFamily: "var(--font-mono), monospace", fontSize: 14 }}>{t.price}</div>
            <div style={{ flex: '1 1 200px', color: PALETTE.sub, fontSize: 13 }}>{t.credits} — {t.blurb}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: PALETTE.dim, marginTop: 14, textAlign: 'center' }}>
        Save 17% with annual billing.
      </p>
    </section>
  )
}

// ─── Built for ─────────────────────────────────────────────────────
function BuiltFor() {
  return (
    <section data-testid="section-built-for" style={{ padding: '40px 0', borderTop: `1px solid ${PALETTE.border}` }}>
      <SectionEyebrow>Built for</SectionEyebrow>
      <ul style={{ marginTop: 18, color: PALETTE.sub, fontSize: 14, lineHeight: 1.8, paddingLeft: 18 }}>
        <li>Independent IH consultants who write 5–15 reports a month</li>
        <li>Small consulting practices with 2–10 assessors</li>
        <li>EHS departments doing internal walkthroughs</li>
        <li>Building managers running facility self-surveys</li>
      </ul>
      <p style={{ marginTop: 18, fontSize: 13, color: PALETTE.dim, lineHeight: 1.7 }}>
        <strong style={{ color: PALETTE.text }}>Not for:</strong> regulatory exposure
        assessments requiring 8-hour TWA sampling or laboratory analysis. AtmosFlow is
        screening-level by design.
      </p>
    </section>
  )
}

// ─── Early access ──────────────────────────────────────────────────
function EarlyAccessBlock({ endpoint }: { endpoint: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setStatus('sending')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section data-testid="section-early-access" style={{ padding: '40px 0', borderTop: `1px solid ${PALETTE.border}` }}>
      <SectionEyebrow>Early Access</SectionEyebrow>
      <p style={{ marginTop: 18, color: PALETTE.sub, fontSize: 14, lineHeight: 1.7 }}>
        AtmosFlow is in active beta with select IH consulting firms.
        Reach out if you’d like to evaluate the platform.
      </p>
      <form onSubmit={submit} style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          data-testid="early-access-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@firm.com"
          required
          style={{
            flex: '1 1 240px',
            background: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 10,
            padding: '12px 14px',
            color: PALETTE.text,
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          data-testid="early-access-submit"
          disabled={status === 'sending'}
          style={{
            background: PALETTE.accent,
            color: '#031216',
            border: 'none',
            borderRadius: 10,
            padding: '12px 22px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >{status === 'sending' ? 'Sending…' : status === 'sent' ? 'Got it — talk soon' : 'Request access'}</button>
      </form>
      {status === 'error' && (
        <p style={{ marginTop: 10, color: '#F87171', fontSize: 12 }}>
          Couldn’t submit just now. Email <a href="mailto:support@prudenceehs.com" style={{ color: PALETTE.accent }}>support@prudenceehs.com</a> directly.
        </p>
      )}
    </section>
  )
}

// ─── Footer ────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer
      data-testid="landing-footer"
      style={{
        borderTop: `1px solid ${PALETTE.border}`,
        background: PALETTE.bg,
        color: PALETTE.dim,
        padding: '32px 24px',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto', fontSize: 12, lineHeight: 1.7 }}>
        <p style={{ marginBottom: 8, color: PALETTE.sub }}>
          AtmosFlow — by Prudence Safety &amp; Environmental Consulting, LLC
        </p>
        <p style={{ marginBottom: 16 }}>Germantown, MD</p>
        <p style={{ marginBottom: 16 }}>
          <a href="#pricing" style={{ color: PALETTE.dim, textDecoration: 'none', marginRight: 14 }}>Pricing</a>
          <a href="mailto:support@prudenceehs.com" style={{ color: PALETTE.dim, textDecoration: 'none', marginRight: 14 }}>Privacy</a>
          <a href="mailto:support@prudenceehs.com" style={{ color: PALETTE.dim, textDecoration: 'none', marginRight: 14 }}>Terms</a>
          <a href="mailto:support@prudenceehs.com" style={{ color: PALETTE.dim, textDecoration: 'none' }}>Contact</a>
        </p>
        <p style={{ marginBottom: 8 }}>
          <a href="mailto:support@prudenceehs.com" style={{ color: PALETTE.accent, textDecoration: 'none' }}>support@prudenceehs.com</a>
        </p>
        <p>© 2026 Prudence Safety &amp; Environmental Consulting, LLC</p>
      </div>
    </footer>
  )
}

// ─── Helper ────────────────────────────────────────────────────────
function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        color: PALETTE.accent,
        fontFamily: "var(--font-mono), monospace",
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        background: `${PALETTE.accent}10`,
        padding: '6px 12px',
        borderRadius: 999,
      }}
    >{children}</span>
  )
}
