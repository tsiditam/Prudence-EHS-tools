-- 019_profile_email_preferences.sql
--
-- Adds `email_preferences` JSONB to public.profiles so the user can
-- opt out of specific email loops (re-assessment reminders, future
-- digests) from Settings → Email Preferences.
--
-- Why: the existing `marketing_consent` boolean is a single global
-- switch. The habit-loop work (PR 1+) introduces multiple distinct
-- email categories (re-assessment reminders, sampling-results
-- outstanding, quarterly portfolio digest, calibration expiry) and
-- the user should be able to opt out of each independently without
-- silencing transactional + onboarding mail.
--
-- Defaults are ON for every existing and new user — matching the
-- onboarding sequence's default-on behaviour. The cron processor +
-- the trigger functions read this column before scheduling /
-- sending; opting out CANCELS unsent rows so the change is immediate.
--
-- Shape (all booleans, default true):
--   {
--     "reassessment_reminders":     true,   // PR 1 (this PR)
--     "onboarding_emails":          true,   // existing free/paid sequences
--     "calibration_expiry":         true,   // PR 2 (planned)
--     "portfolio_digest":           true,   // PR 3 (planned)
--     "sampling_results_outstanding": true  // PR 5 (planned)
--   }

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_preferences JSONB NOT NULL DEFAULT
    '{"reassessment_reminders": true, "onboarding_emails": true, "calibration_expiry": true, "portfolio_digest": true, "sampling_results_outstanding": true}'::jsonb;
