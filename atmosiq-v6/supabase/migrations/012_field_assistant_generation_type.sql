-- ─────────────────────────────────────────────────────────────────────────
-- 012 — Field Assistant Generation Type
-- ─────────────────────────────────────────────────────────────────────────
-- The narrative_generations table (migration 008) was originally narrative-
-- specific. The field-assistant agent (separate feature, separate UX,
-- separate quota) writes to the same ledger so per-user token spend is
-- observable in one place. A generation_type column distinguishes the
-- two streams so quota counts and cost dashboards can be filtered.
--
--   • 'narrative'        — AI report-narrative drafting (existing)
--   • 'field_assistant'  — In-app conversational agent (new, this PR)
--
-- Default 'narrative' preserves the meaning of existing rows. Future
-- generation streams (e.g. sampling-plan AI) can add their own type
-- without another migration.

ALTER TABLE public.narrative_generations
  ADD COLUMN IF NOT EXISTS generation_type TEXT NOT NULL DEFAULT 'narrative';

-- Sanity constraint: keep the column to a known set so accidental
-- mis-spellings ('field-assistant', 'fieldAssistant', …) don't fragment
-- the dashboards.
ALTER TABLE public.narrative_generations
  ADD CONSTRAINT narrative_generations_type_check
  CHECK (generation_type IN ('narrative', 'field_assistant'));

-- Index by (user_id, generation_type, generated_at) so the per-type
-- rolling-window queries used by rate limiters stay cheap.
CREATE INDEX IF NOT EXISTS idx_narrative_generations_user_type_time
  ON public.narrative_generations (user_id, generation_type, generated_at DESC);
