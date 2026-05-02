-- ─────────────────────────────────────────────────────────────────────────
-- 008 — Narrative Generation Tracking + Rate Limit Surface
-- ─────────────────────────────────────────────────────────────────────────
-- Each AI narrative call costs ~$0.045 against $749 monthly subscription
-- revenue. Steady state is fine, but burst patterns can push API spend
-- above per-customer revenue. This table is the source-of-truth for
-- enforcing rate limits AND for observing per-user gross margin trends.
--
-- The /api/narrative handler counts rows in this table within rolling
-- windows to enforce three caps:
--   • 10 generations per minute  (burst protection)
--   • 100 generations per 24h    (daily ceiling)
--   • 5  generations per 24h     (free tier override; ignores credits)

CREATE TABLE IF NOT EXISTS public.narrative_generations (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  estimated_cost_usd  NUMERIC(8, 4)
);

CREATE INDEX IF NOT EXISTS idx_narrative_generations_user_time
  ON public.narrative_generations (user_id, generated_at DESC);

ALTER TABLE public.narrative_generations ENABLE ROW LEVEL SECURITY;

-- Service role inserts (the /api/narrative handler).
-- Users may read their own rows for billing transparency / dashboards.
CREATE POLICY narrative_generations_user_select
  ON public.narrative_generations
  FOR SELECT
  USING (user_id = auth.uid());
