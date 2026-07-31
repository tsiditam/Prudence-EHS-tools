-- 025_profile_kg_beta.sql
--
-- Knowledge Graph beta-cohort flag (KG activation, Phase 0 step 1).
--
-- Adds a single server-authoritative boolean to `profiles` marking a user as
-- part of the Knowledge Graph beta cohort. The SPA reads it at boot (via the
-- existing `getProfile()` select('*')) and calls `applyKgCohort(profile.kg_beta)`
-- in AuthContext, which flips the client-side `af.kgCohort` feature-flag marker
-- so the KG surfaces turn on for that user on the NEXT load — no redeploy, and
-- without them typing ?kg=1. See src/utils/featureFlags.js and
-- docs/KNOWLEDGE_GRAPH.md ("Beta-cohort rollout").
--
-- Authority: this flag is set by an operator/admin via the service role, NOT by
-- the user — cohort membership is a rollout decision, not a self-serve toggle.
-- `saveProfile()` deliberately does not write it, so the user's profile sync
-- can never grant themselves the beta. Owner RLS already allows the user to
-- READ their own row (select('*')), which is all the client needs.
--
-- Default false = no behavior change for existing users. The client-side
-- KG_KILL_SWITCH still gates everything, so this column has no effect until the
-- switch is lifted for the rollout.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kg_beta BOOLEAN NOT NULL DEFAULT false;

-- Partial index for the operator query "who is in the cohort?" — keeps the
-- working set to the (small) enrolled cohort rather than scanning all profiles.
CREATE INDEX IF NOT EXISTS profiles_kg_beta_idx
  ON public.profiles (kg_beta)
  WHERE kg_beta = true;
