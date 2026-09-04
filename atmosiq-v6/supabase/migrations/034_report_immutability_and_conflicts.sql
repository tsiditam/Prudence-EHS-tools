-- 034_report_immutability_and_conflicts.sql
--
-- Two guards on `public.assessments` and the two columns they need
-- (audit 2026-09, §4 H5 and M4), plus the report date.
--
-- ── 1. Multi-device conflicts (H5) ──────────────────────────────────
-- Every client upsert now carries `base_updated_at`: the cloud
-- `updated_at` that device last pulled or pushed. If the row has moved
-- on since (another device wrote it), the write is refused instead of
-- silently overwriting the newer copy — the client keeps its local
-- version and asks the user which one wins. NULL means "no basis" (a
-- first push, or a deliberate keep-local overwrite) and is accepted.
-- The column is a request token, not state: the trigger clears it on
-- every row it lets through.
--
-- ── 2. Issued reports are immutable (M4) ─────────────────────────────
-- "An issued report's record is the only evidence of what it said"
-- (CLAUDE.md). Once report_status is 'reviewed' or 'final', the content
-- columns — payload, photos, zones, composite — may not change unless
-- the same statement moves the report back to 'draft'. Metadata
-- (reviewer fields, lifecycle transitions, updated_at) stays writable.
-- Status vocabulary is migration 027's: draft | in_review | reviewed | final.
--
-- ── 3. Report date (M4) ──────────────────────────────────────────────
-- `finalized_at` records when the report was issued. fromCloudRow used
-- `updated_at` as the report date on restore, which moves on every
-- re-save. Backfilled once from the finalize timestamp the app stamps
-- into payload.ts, else updated_at.
--
-- Both triggers RAISE with ERRCODE 'check_violation' (SQLSTATE 23514) and
-- a message prefixed ATMOSFLOW_CONFLICT / ATMOSFLOW_IMMUTABLE so the
-- client can tell them apart from an unrelated check constraint.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS. The backfill is guarded by IS NULL.

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS base_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_at    timestamptz;

COMMENT ON COLUMN public.assessments.base_updated_at IS
  'Optimistic-concurrency token sent by the client: the updated_at it last saw. Checked and cleared by assessments_check_base_updated_at; never persists.';
COMMENT ON COLUMN public.assessments.finalized_at IS
  'When the report was issued (the report date). Set by the client on finalize; NULL for drafts.';

-- ── Report date backfill (one-time, idempotent) ──────────────────────
UPDATE public.assessments
   SET finalized_at = CASE
         WHEN payload->>'ts' ~ '^\d{4}-\d{2}-\d{2}T' THEN (payload->>'ts')::timestamptz
         ELSE updated_at
       END
 WHERE finalized_at IS NULL
   AND (report_status = 'final' OR status = 'complete');

-- ── Conflict check ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assessments_check_base_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.base_updated_at IS NOT NULL
     AND OLD.updated_at <> NEW.base_updated_at THEN
    RAISE EXCEPTION 'ATMOSFLOW_CONFLICT: assessment % was changed on another device (cloud updated_at %, this device saw %)',
      NEW.id, OLD.updated_at, NEW.base_updated_at
      USING ERRCODE = 'check_violation',
            HINT = 'Pull the latest copy and re-apply the change, or push again without a base to overwrite.';
  END IF;
  NEW.base_updated_at := NULL;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assessments_check_base_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assessments_check_base_updated_at ON public.assessments;
CREATE TRIGGER assessments_check_base_updated_at
  BEFORE INSERT OR UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.assessments_check_base_updated_at();

-- ── Issued-report immutability ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assessments_guard_issued_report()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.report_status IN ('reviewed', 'final')
     AND NEW.report_status IS DISTINCT FROM 'draft' THEN
    IF NEW.payload   IS DISTINCT FROM OLD.payload
       OR NEW.photos    IS DISTINCT FROM OLD.photos
       OR NEW.zones     IS DISTINCT FROM OLD.zones
       OR NEW.composite IS DISTINCT FROM OLD.composite THEN
      RAISE EXCEPTION 'ATMOSFLOW_IMMUTABLE: assessment % is % and its content cannot change; move it back to draft first',
        OLD.id, OLD.report_status
        USING ERRCODE = 'check_violation',
              HINT = 'Set report_status = ''draft'' (reopen) before editing an issued report.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assessments_guard_issued_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assessments_guard_issued_report ON public.assessments;
CREATE TRIGGER assessments_guard_issued_report
  BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.assessments_guard_issued_report();
