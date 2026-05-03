/**
 * AccountSettings — self-serve account management.
 *
 * Surfaces:
 *   • Current plan + billing period (read-only)
 *   • Credits remaining + next renewal date
 *   • Profile fields (name, firm, email) — name + firm editable
 *   • "Manage subscription" → /api/customer-portal redirect
 *   • "Delete account" → two-step confirmation → /api/delete-account
 *
 * APIs from Groups A and B:
 *   /api/customer-portal  (Group B)
 *   /api/delete-account   (Group A)
 */

import { useState } from 'react'

const PALETTE = {
  bg: '#080A0E',
  card: '#0F1115',
  surface: '#13161B',
  border: '#1F232C',
  accent: '#22D3EE',
  text: '#ECEEF2',
  sub: '#8B93A5',
  dim: '#6B7380',
  danger: '#F87171',
}

export interface AccountProfile {
  id: string
  email: string
  name?: string | null
  firm?: string | null
  plan: 'free' | 'solo' | 'pro' | 'practice'
  billing_period?: 'monthly' | 'annual'
  credits_remaining: number
  annual_renewal_at?: string | null
  subscription_status?: string | null
  stripe_customer_id?: string | null
}

export interface AccountSettingsProps {
  profile: AccountProfile
  accessToken: string | null
  onProfileSaved?: (updated: Partial<AccountProfile>) => void
  onAccountDeleted?: () => void
  /** Override fetch for tests. */
  fetcher?: typeof fetch
}

export default function AccountSettings({
  profile,
  accessToken,
  onProfileSaved,
  onAccountDeleted,
  fetcher,
}: AccountSettingsProps) {
  const fetchFn: typeof fetch = fetcher ?? ((typeof window !== 'undefined' ? window.fetch.bind(window) : (globalThis.fetch as typeof fetch)) as typeof fetch)

  const [name, setName] = useState(profile.name ?? '')
  const [firm, setFirm] = useState(profile.firm ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [deleteStage, setDeleteStage] = useState<'idle' | 'confirm1' | 'confirm2' | 'deleting' | 'deleted' | 'error'>('idle')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const tierLabel = ({ free: 'Free', solo: 'Solo', pro: 'Pro', practice: 'Practice' } as const)[profile.plan]
  const renewalLabel = profile.billing_period === 'annual' && profile.annual_renewal_at
    ? new Date(profile.annual_renewal_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : profile.plan === 'free' ? '1st of next month (free credit)' : 'Monthly via Stripe'

  const saveProfile = async () => {
    setSaving(true)
    try {
      // Stub: in production this would PATCH /api/profile or use Supabase RPC.
      // For now, we just call the callback so the parent can handle persistence.
      await new Promise(r => setTimeout(r, 50))
      setSavedAt(Date.now())
      onProfileSaved && onProfileSaved({ name, firm })
    } finally {
      setSaving(false)
    }
  }

  const openPortal = async () => {
    setPortalLoading(true)
    setPortalError(null)
    try {
      const res = await fetchFn('/api/customer-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ return_url: typeof window !== 'undefined' ? window.location.href : undefined }),
      })
      if (res.status === 404) {
        setPortalError('No active subscription to manage. Upgrade to Solo, Pro, or Practice from the pricing page.')
        return
      }
      if (!res.ok) {
        setPortalError('Could not open the subscription portal. Try again or email support.')
        return
      }
      const data = await res.json() as { url?: string }
      if (data.url && typeof window !== 'undefined') {
        window.location.href = data.url
      }
    } catch {
      setPortalError('Network error opening portal.')
    } finally {
      setPortalLoading(false)
    }
  }

  const startDelete = () => setDeleteStage('confirm1')
  const cancelDelete = () => { setDeleteStage('idle'); setDeleteError(null) }

  const advanceDelete = () => {
    if (deleteStage === 'confirm1') setDeleteStage('confirm2')
  }

  const confirmDelete = async () => {
    setDeleteStage('deleting')
    setDeleteError(null)
    try {
      const res = await fetchFn('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ user_id: profile.id, initiated_by: 'user' }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setDeleteError(`Deletion failed: ${res.status} ${text.slice(0, 200)}`)
        setDeleteStage('error')
        return
      }
      setDeleteStage('deleted')
      onAccountDeleted && onAccountDeleted()
    } catch {
      setDeleteError('Network error during deletion.')
      setDeleteStage('error')
    }
  }

  return (
    <div
      data-testid="account-settings"
      style={{
        background: PALETTE.bg,
        color: PALETTE.text,
        padding: 24,
        fontFamily: "'inherit', system-ui, -apple-system, sans-serif",
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Account</h1>
      <p style={{ fontSize: 13, color: PALETTE.sub, marginBottom: 24 }}>
        Manage your subscription, profile, and account data.
      </p>

      {/* Subscription block */}
      <Section title="Subscription">
        <Row label="Plan">
          <span data-testid="plan-label" style={{ fontWeight: 700 }}>{tierLabel}</span>
          {profile.billing_period && profile.plan !== 'free' && (
            <span style={{ color: PALETTE.sub, fontSize: 12, marginLeft: 8 }}>({profile.billing_period})</span>
          )}
        </Row>
        <Row label="Credits remaining">
          <span data-testid="credits-label" style={{ fontFamily: "var(--font-mono), monospace", color: PALETTE.accent }}>
            {profile.credits_remaining}
          </span>
        </Row>
        <Row label="Next renewal">
          <span data-testid="renewal-label" style={{ fontSize: 13, color: PALETTE.sub }}>
            {renewalLabel}
          </span>
        </Row>
        {profile.plan !== 'free' ? (
          <button
            data-testid="manage-subscription"
            onClick={openPortal}
            disabled={portalLoading}
            style={btnPrimary(portalLoading)}
          >{portalLoading ? 'Opening…' : 'Manage subscription'}</button>
        ) : (
          <a href="/#pricing" data-testid="upgrade-cta" style={btnPrimary(false) as any}>Upgrade plan</a>
        )}
        {portalError && (
          <p data-testid="portal-error" style={{ color: PALETTE.danger, fontSize: 12, marginTop: 10 }}>
            {portalError}
          </p>
        )}
      </Section>

      {/* Profile block */}
      <Section title="Profile">
        <Field label="Email">
          <span style={{ color: PALETTE.sub, fontSize: 13 }}>{profile.email}</span>
        </Field>
        <Field label="Name">
          <input
            data-testid="profile-name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Firm">
          <input
            data-testid="profile-firm"
            value={firm}
            onChange={e => setFirm(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <button
          data-testid="profile-save"
          onClick={saveProfile}
          disabled={saving}
          style={btnPrimary(saving)}
        >{saving ? 'Saving…' : 'Save profile'}</button>
        {savedAt && (
          <p data-testid="profile-saved" style={{ color: PALETTE.accent, fontSize: 12, marginTop: 8 }}>
            Saved.
          </p>
        )}
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone">
        <p style={{ color: PALETTE.sub, fontSize: 13, lineHeight: 1.6 }}>
          Deleting your account permanently removes your assessments,
          credits, profile, and any active subscription. This cannot be
          undone.
        </p>
        {deleteStage === 'idle' && (
          <button data-testid="delete-start" onClick={startDelete} style={btnDanger}>
            Delete account
          </button>
        )}
        {deleteStage === 'confirm1' && (
          <div data-testid="delete-confirm-1" style={confirmBox}>
            <p style={{ color: PALETTE.text, fontSize: 14, marginBottom: 12 }}>
              Are you sure? This permanently deletes your account and cancels any active subscription.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button data-testid="delete-confirm-1-yes" onClick={advanceDelete} style={btnDanger}>Yes, continue</button>
              <button data-testid="delete-cancel-1" onClick={cancelDelete} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}
        {deleteStage === 'confirm2' && (
          <div data-testid="delete-confirm-2" style={confirmBox}>
            <p style={{ color: PALETTE.text, fontSize: 14, marginBottom: 12 }}>
              <strong>Final confirmation.</strong> This will fire immediately. Type <code style={{ background: PALETTE.surface, padding: '2px 6px', borderRadius: 4 }}>delete</code> exists implicitly — clicking the button below acknowledges that.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button data-testid="delete-confirm-final" onClick={confirmDelete} style={btnDanger}>Permanently delete</button>
              <button data-testid="delete-cancel-2" onClick={cancelDelete} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}
        {deleteStage === 'deleting' && (
          <p data-testid="delete-progress" style={{ color: PALETTE.sub, fontSize: 13 }}>Deleting your account…</p>
        )}
        {deleteStage === 'deleted' && (
          <p data-testid="delete-success" style={{ color: PALETTE.accent, fontSize: 13 }}>Account deleted. Goodbye.</p>
        )}
        {deleteStage === 'error' && (
          <p data-testid="delete-error" style={{ color: PALETTE.danger, fontSize: 13 }}>{deleteError}</p>
        )}
      </Section>
    </div>
  )
}

// ─── Layout primitives ─────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: PALETTE.card,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 14,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <h2 style={{ fontSize: 12, color: PALETTE.dim, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 14 }}>{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${PALETTE.border}` }}>
      <span style={{ color: PALETTE.sub, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 14 }}>{children}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: PALETTE.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: PALETTE.surface,
  border: `1px solid ${PALETTE.border}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: PALETTE.text,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    background: PALETTE.accent,
    color: '#031216',
    border: 'none',
    borderRadius: 10,
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontFamily: 'inherit',
    marginTop: 12,
    textDecoration: 'none',
    display: 'inline-block',
  }
}

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  color: PALETTE.sub,
  border: `1px solid ${PALETTE.border}`,
  borderRadius: 10,
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const btnDanger: React.CSSProperties = {
  background: 'transparent',
  color: PALETTE.danger,
  border: `1px solid ${PALETTE.danger}50`,
  borderRadius: 10,
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  marginTop: 12,
}

const confirmBox: React.CSSProperties = {
  marginTop: 12,
  padding: 14,
  background: PALETTE.surface,
  border: `1px solid ${PALETTE.danger}40`,
  borderRadius: 10,
}
