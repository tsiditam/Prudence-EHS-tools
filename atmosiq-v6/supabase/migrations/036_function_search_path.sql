-- 036_function_search_path.sql
--
-- Pins `search_path` on the last three functions in the public schema that
-- did not have it, finishing the job 026_security_hardening.sql started.
--
--   * public.set_kg_updated_at()                    — 023_knowledge_graph.sql
--   * public.kg_finding_evidence(uuid, int)         — 023_knowledge_graph.sql
--   * public.claim_stripe_event(text, text)         — 006_stripe_webhook_events.sql
--
-- Why they were missed. 026 pinned every other function and scoped itself to
-- the "non-KG" advisor findings; its header records that the four
-- `*_set_updated_at` helpers "already pin search_path = ''", which was true
-- of the four it was looking at and not of the KG one written three
-- migrations earlier. The Supabase security advisor has reported the two KG
-- functions as `function_search_path_mutable` ever since.
--
-- `claim_stripe_event` is the one the ADVISOR does not report, and it is
-- included deliberately. It is the same defect; the advisor is quiet about it
-- because the function is revoked from PUBLIC and granted only to
-- `service_role`, so it is not on the exposed API surface. Leaving it as the
-- single exception would have meant carrying an exemption in the guard added
-- alongside this migration, and an exemption list is how the KG pair survived
-- 026. One line is cheaper than an exception.
--
-- Severity, stated plainly so this is not mistaken for a breach fix: NONE of
-- the three is SECURITY DEFINER. They run with the caller's own rights and
-- the caller's own RLS, so none is a privilege-escalation path. This is
-- hygiene that brings the last three functions in line with the rule the rest
-- of the schema already follows.
--
-- ── Why ALTER FUNCTION rather than CREATE OR REPLACE ──────────────────────
-- Only the setting changes. Re-typing a function body to change one
-- attribute invites a transcription error in code nothing here tests, so the
-- bodies are left exactly as they were written.
--
-- ── Why `search_path = ''` (empty, not `public`) ──────────────────────────
-- Matches 026. `pg_catalog` is searched first regardless of this setting, so
-- built-ins still resolve; everything else must be schema-qualified. All
-- three bodies already qualify every reference:
--   * set_kg_updated_at    — `new.updated_at = now()`; `now()` is pg_catalog.
--   * kg_finding_evidence  — `public.kg_nodes` / `public.kg_edges` throughout,
--                            and its return type is `setof public.kg_nodes`.
--   * claim_stripe_event   — `public.stripe_webhook_events`.
--
-- ── Grants: deliberately asymmetric ───────────────────────────────────────
--   * set_kg_updated_at is a TRIGGER helper with one trigger behind it
--     (kg_nodes_set_updated_at). Triggers fire as the table owner whatever
--     the invoking role holds, so revoking EXECUTE does not stop the trigger
--     — it only closes an RPC surface nothing uses. Same reasoning, and the
--     same treatment, as the four helpers in 026.
--   * kg_finding_evidence IS called over RPC by the app
--     (src/services/knowledgeGraphService.ts → client.rpc('kg_finding_evidence')).
--     Its grant is LEFT ALONE. It is SECURITY INVOKER, so a caller only ever
--     traverses rows their own RLS already lets them read; revoking EXECUTE
--     here would break the knowledge-graph evidence panel.
--   * claim_stripe_event already grants only `service_role` (006). Untouched.
--
-- Each ALTER is guarded with `to_regprocedure` so this migration is a no-op
-- on a database where the module in question was never applied, rather than a
-- hard failure that stops the runner.

DO $$
BEGIN
  IF to_regprocedure('public.set_kg_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.set_kg_updated_at() SET search_path = '';
    REVOKE EXECUTE ON FUNCTION public.set_kg_updated_at() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.kg_finding_evidence(uuid, int)') IS NOT NULL THEN
    ALTER FUNCTION public.kg_finding_evidence(uuid, int) SET search_path = '';
    -- No grant change: the app calls this one over RPC. See the header.
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.claim_stripe_event(text, text)') IS NOT NULL THEN
    ALTER FUNCTION public.claim_stripe_event(text, text) SET search_path = '';
    -- No grant change: 006 already limits this to service_role.
  END IF;
END $$;
