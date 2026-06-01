-- ─────────────────────────────────────────────────────────────────────────
-- 022 — DB-backed early-access rate limiting + admin usage analytics
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Composite index on early_access_signups(ip, submitted_at DESC) so the
--    per-IP hourly count in api/early-access.js runs as an index scan
--    instead of a seq-scan. The ip column was added in migration 005;
--    the handler already writes it on every insert.
CREATE INDEX IF NOT EXISTS idx_early_access_ip_submitted
  ON early_access_signups (ip, submitted_at DESC)
  WHERE ip IS NOT NULL;

-- 2. generated_at index on narrative_generations so admin analytics
--    queries that aggregate across all users by date stay cheap.
CREATE INDEX IF NOT EXISTS idx_narrative_generations_generated_at
  ON public.narrative_generations (generated_at DESC);

-- 3. Admin usage aggregate function.
--    Returns one row per (day, generation_type) over the last p_days days.
--    SECURITY DEFINER so the service-role caller in api/admin.js can call
--    it without bypassing RLS on the underlying table — the function
--    itself has superuser rights on its own scope only.
CREATE OR REPLACE FUNCTION public.admin_usage_daily(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  day             DATE,
  generation_type TEXT,
  calls           BIGINT,
  input_tokens    BIGINT,
  output_tokens   BIGINT,
  cost_usd        NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    DATE(generated_at AT TIME ZONE 'UTC')       AS day,
    generation_type,
    COUNT(*)::BIGINT                             AS calls,
    COALESCE(SUM(input_tokens),  0)::BIGINT      AS input_tokens,
    COALESCE(SUM(output_tokens), 0)::BIGINT      AS output_tokens,
    COALESCE(SUM(estimated_cost_usd), 0)         AS cost_usd
  FROM public.narrative_generations
  WHERE generated_at >= NOW() - (p_days * INTERVAL '1 day')
  GROUP BY DATE(generated_at AT TIME ZONE 'UTC'), generation_type
  ORDER BY day DESC, generation_type;
$$;
