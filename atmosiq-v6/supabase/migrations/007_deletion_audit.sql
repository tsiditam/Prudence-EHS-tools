-- ─────────────────────────────────────────────────────────────────────────
-- 007 — Deletion Audit Trail (GDPR/CCPA right-to-erasure compliance)
-- ─────────────────────────────────────────────────────────────────────────
-- Per GDPR Art. 17 and CCPA §1798.105, when a user requests deletion we
-- must purge their PII. But we still need a forensic record of WHEN the
-- deletion happened, WHICH entities were purged, and WHO initiated it —
-- without retaining the user's identity.
--
-- This table stores a SHA-256 hash of the user_id (one-way; cannot
-- reconstruct the original UUID), the timestamp, and the list of tables
-- purged. No PII is ever stored here. The hash exists so we can later
-- prove "yes, user X was deleted on date Y" if presented with their
-- (since-rebuilt) user_id by an auditor or in litigation discovery.

CREATE TABLE IF NOT EXISTS public.deletion_audit (
  id              BIGSERIAL PRIMARY KEY,
  user_id_hash    TEXT NOT NULL,                                 -- sha256(user_uuid)
  deleted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entities_purged TEXT[] NOT NULL,                               -- e.g. {profiles, credits_ledger, ...}
  initiated_by    TEXT NOT NULL CHECK (initiated_by IN ('user','admin','gdpr_request'))
);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_user_id_hash ON public.deletion_audit (user_id_hash);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_deleted_at  ON public.deletion_audit (deleted_at DESC);

ALTER TABLE public.deletion_audit ENABLE ROW LEVEL SECURITY;

-- Append-only by service role (the delete-account handler uses service key).
-- No SELECT policy for users; admin SELECT goes through admin endpoint.
-- No UPDATE / DELETE policies anywhere — this table is permanent.
REVOKE UPDATE, DELETE ON public.deletion_audit FROM PUBLIC, anon, authenticated;
