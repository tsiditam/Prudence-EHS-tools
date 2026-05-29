-- 020_profile_calibration_columns.sql
--
-- Safety net for the habit-loop PR 2 calibration-expiry cron.
--
-- These columns are ALREADY upserted by supabaseStorage.saveProfile()
-- (lines 296–301), so production has been carrying them since the
-- early profile work. They're declared here explicitly with
-- IF NOT EXISTS so the dependency is documented and so the cron has
-- a queryable, schema-validated source of truth instead of relying
-- on the silent profile sync.
--
-- Defensibility: the cron reads these columns to decide when to
-- send the calibration-expiring / calibration-expired email. RLS
-- is service-role-only on the cron path; no RLS change here.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS iaq_meter      TEXT,
  ADD COLUMN IF NOT EXISTS iaq_cal_date   DATE,
  ADD COLUMN IF NOT EXISTS iaq_cal_status TEXT,
  ADD COLUMN IF NOT EXISTS iaq_serial     TEXT,
  ADD COLUMN IF NOT EXISTS pid_meter      TEXT,
  ADD COLUMN IF NOT EXISTS pid_cal_status TEXT;

-- Index for the daily cron scan. Skips users with both meters null
-- (free-tier users who haven't entered cal data) so the cron's
-- working set stays the active assessor cohort.
CREATE INDEX IF NOT EXISTS profiles_iaq_cal_date_idx
  ON public.profiles (iaq_cal_date)
  WHERE iaq_cal_date IS NOT NULL;
