-- ─────────────────────────────────────────────────────────────────────────
-- 010 — Onboarding tour state on profiles
-- ─────────────────────────────────────────────────────────────────────────
-- Adds two columns used by the first-assessment guided tour
-- (components/onboarding/FirstAssessmentTour.tsx):
--
--   has_completed_first_assessment — flipped to TRUE by /api/profile/
--                                    mark-onboarded after the user finalizes
--                                    their first report. Drives "should I
--                                    show the tour?" check.
--   onboarding_dismissed_at        — set when the user dismisses the tour
--                                    explicitly. Suppresses re-display.
--
-- The activation funnel (signup → first finalized assessment) is the
-- single most important conversion metric for the AtmosFlow free tier.
-- These columns let us measure (a) how many users dismiss the tour
-- without finalizing and (b) the time from signup to first finalized
-- assessment.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_completed_first_assessment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_eligible
  ON public.profiles (created_at DESC)
  WHERE has_completed_first_assessment = FALSE
    AND onboarding_dismissed_at IS NULL;
