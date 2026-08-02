-- 027_report_lifecycle.sql
--
-- Report lifecycle + report profiles.
--
-- Every AtmosFlow report rendered as "Draft — IH Review Required" with a
-- DRAFT watermark, because the renderer had two real states and nothing
-- ever selected the finished one for a screening deliverable. A routine
-- logger upload therefore reached the client looking like unfinished work.
--
-- This adds the two ideas that were missing: what KIND of work a report
-- represents (its profile) and where it is in its LIFE (its status). A
-- screening assessment can now be Final without claiming to be a
-- professional opinion; professional and compliance work carries a named
-- reviewer, their credentials, and an approval id to get there.
--
-- ── Additive only ────────────────────────────────────────────────────
--
-- No column is dropped or retyped. In particular `assessments.status`
-- ('draft' | 'complete') is LEFT ALONE: six call sites in
-- src/utils/supabaseStorage.js split drafts from reports on it, and the
-- dashboard, history and full-sync index all depend on that split. The
-- app keeps writing the legacy vocabulary there (see toLegacyStatus in
-- src/constants/reportLifecycle.js) while report_status carries the real
-- four-state lifecycle. Old clients keep working; new clients get the
-- full picture.
--
-- ── Backfill ─────────────────────────────────────────────────────────
--
-- Existing rows become Screening / Final per product decision. A row
-- still sitting at legacy 'draft' stays Draft — it genuinely is one.
-- Note what is NOT done: nothing is backfilled as "Professionally
-- Reviewed". Those reports were issued without a recorded reviewer, and
-- inventing an approval that never happened would corrupt the audit
-- trail this table exists to protect.

-- ── assessments ──────────────────────────────────────────────────────

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS report_profile   TEXT NOT NULL DEFAULT 'screening',
  ADD COLUMN IF NOT EXISTS report_status    TEXT NOT NULL DEFAULT 'draft',
  -- Reviewer is a platform user (profiles), nullable because screening
  -- reports never have one. ON DELETE SET NULL rather than CASCADE: a
  -- reviewer leaving the platform must not delete the assessments they
  -- approved.
  ADD COLUMN IF NOT EXISTS reviewer_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_date      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_notes   TEXT,
  -- Human-quotable approval reference, surfaced on the report cover.
  ADD COLUMN IF NOT EXISTS approval_id      TEXT,
  -- Frozen version snapshot at the moment of approval: engine, app,
  -- standards manifest, ruleset, calculation. A jsonb blob rather than
  -- five columns so the whole set moves together and stays immutable —
  -- a report approved under engine 2.8 must still read 2.8 after the
  -- engine ships 2.9, or the audit trail silently rewrites itself.
  ADD COLUMN IF NOT EXISTS approved_version JSONB;

-- Enum discipline in the database, not just the client. A bad status is
-- a corrupted audit record, so it is rejected at the write.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assessments_report_profile_chk'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_report_profile_chk
      CHECK (report_profile IN ('screening', 'professional', 'compliance'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assessments_report_status_chk'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_report_status_chk
      CHECK (report_status IN ('draft', 'in_review', 'reviewed', 'final'));
  END IF;
END $$;

-- Backfill. Idempotent: only touches rows still carrying the defaults,
-- so re-running the migration cannot stomp a report that has since moved
-- through the lifecycle.
UPDATE public.assessments
   SET report_profile = 'screening',
       report_status  = CASE WHEN status = 'complete' THEN 'final' ELSE 'draft' END
 WHERE report_status = 'draft'
   AND review_date IS NULL
   AND approval_id IS NULL;

-- Backs the dashboard/history filters (profile + status facets).
CREATE INDEX IF NOT EXISTS assessments_lifecycle_idx
  ON public.assessments (user_id, report_profile, report_status);

-- Finding the work queued for a reviewer.
CREATE INDEX IF NOT EXISTS assessments_reviewer_idx
  ON public.assessments (reviewer_id, review_date DESC)
  WHERE reviewer_id IS NOT NULL;

-- ── peer_reviews ─────────────────────────────────────────────────────
--
-- The reviewer flow already exists here (021_peer_reviews.sql): a
-- token-gated response with status pending → approved / changes_requested
-- / commented, reviewer_name, reviewed_at, reviewer_notes. Rather than
-- build a second reviewer concept beside it, the lifecycle reuses it —
-- an APPROVED peer review is what drives an assessment to
-- 'reviewed'. These columns are the identity a professional report has
-- to print on its cover and the platform did not yet capture.

ALTER TABLE public.peer_reviews
  ADD COLUMN IF NOT EXISTS reviewer_credentials  TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_organization TEXT,
  -- Mirrors assessments.approval_id so the approval can be traced from
  -- either side without a join through report_id (which is free-form
  -- text, not a foreign key — reports are not yet a canonical entity).
  ADD COLUMN IF NOT EXISTS approval_id           TEXT;

COMMENT ON COLUMN public.assessments.report_profile IS
  'screening | professional | compliance. Drives report chrome and transition rules.';
COMMENT ON COLUMN public.assessments.report_status IS
  'draft | in_review | reviewed | final. The legacy status column keeps draft|complete for backward compatibility.';
COMMENT ON COLUMN public.assessments.approved_version IS
  'Immutable version snapshot (engine, app, standards manifest, ruleset, calculation) frozen at approval time.';
