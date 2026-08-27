-- 032_assessment_uid.sql
--
-- The durable identity of an assessment.
--
-- Record ids are not durable: `resolveFinalizeTarget` mints a fresh
-- `rpt-<timestamp>` the first time a `draft-<timestamp>` session finalizes, so
-- the id an assessment is known by changes exactly once — at the moment it
-- becomes a deliverable. Fine for storage; useless as a key for anything that
-- has to outlive that transition.
--
-- Per-report pricing needs exactly such a key: a purchase entitles ONE
-- assessment to unlimited regenerations forever, so the thing bought has to
-- stay findable across draft -> finalize -> re-open -> re-finalize.
--
-- ── Why this is a column and not just a payload field ────────────────────
-- The uid also rides inside `payload`, so the client round-trip works without
-- this column. It exists so the SERVER can bind on it. The uid is minted in
-- the browser, and a client-minted key means nothing on its own: without a row
-- proving THIS user owns THIS uid, a paid entitlement could be replayed
-- against any number of other assessments by relabelling them. The unique
-- constraint below is what makes "does this user own this uid" a real question
-- with one answer.
--
-- Nullable, and no backfill. Existing rows keep NULL; the client derives a
-- deterministic uid for legacy records (`deriveLegacyUid`) and stamps it on
-- the next save. A backfill here would have to reproduce that derivation in
-- SQL, and two implementations of a function whose whole job is to agree is
-- the failure this codebase keeps finding.

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS assessment_uid uuid;

-- One uid per user. Scoped to the user rather than global because the uid is
-- client-generated: a global unique would let one account's collision (or
-- deliberate reuse) deny the id to another.
CREATE UNIQUE INDEX IF NOT EXISTS assessments_user_assessment_uid_key
  ON public.assessments (user_id, assessment_uid)
  WHERE assessment_uid IS NOT NULL;

-- The lookup the server does on every gated render: given a uid and the
-- caller's JWT, does a row exist that this user owns?
CREATE INDEX IF NOT EXISTS idx_assessments_assessment_uid
  ON public.assessments (assessment_uid)
  WHERE assessment_uid IS NOT NULL;

COMMENT ON COLUMN public.assessments.assessment_uid IS
  'Durable client-minted identity, stable across draft->finalize. NULL on rows predating migration 032; the client derives and stamps one on next save. Server-side ownership key for report entitlements.';
