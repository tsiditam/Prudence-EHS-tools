-- ─────────────────────────────────────────────────────────────────────────
-- 009 — Pricing Rollout (four-tier + annual + free-tier)
-- ─────────────────────────────────────────────────────────────────────────
-- Adds the schema needed for:
--   • Free tier (no Stripe, 1 credit/month, tracked here only)
--   • Annual prepay (renewal date, monthly credit grant via cron)
--   • Free-tier signup cohort tracking
--
-- Also migrates legacy plan values: any 'team' or 'enterprise' rows
-- become 'practice' (the new equivalent tier).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_period      TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS annual_renewal_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS free_tier_signup_at TIMESTAMPTZ;

-- billing_period must be 'monthly' or 'annual'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_billing_period_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_billing_period_check
      CHECK (billing_period IN ('monthly', 'annual'));
  END IF;
END$$;

-- Migrate any legacy team/enterprise rows to the new 'practice' tier.
UPDATE public.profiles
   SET plan = 'practice'
 WHERE plan IN ('team', 'enterprise');

-- Constrain plan to the four valid tiers going forward.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check
      CHECK (plan IN ('free', 'solo', 'pro', 'practice'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_profiles_annual_renewal_at
  ON public.profiles (annual_renewal_at)
  WHERE billing_period = 'annual';

CREATE INDEX IF NOT EXISTS idx_profiles_free_tier_cohort
  ON public.profiles (free_tier_signup_at DESC)
  WHERE plan = 'free';
