-- 026_security_hardening.sql
--
-- Non-KG security-advisor hardening surfaced by the Supabase database linter
-- during the KG Phase 0 production-readiness audit. Two WARN categories, both
-- about SECURITY DEFINER functions in the API-exposed `public` schema:
--
--   * anon/authenticated_security_definer_function_executable
--       — SECURITY DEFINER functions callable over PostgREST (/rest/v1/rpc/...)
--         by the `anon` / `authenticated` roles.
--   * function_search_path_mutable
--       — `admin_usage_daily` runs SECURITY DEFINER with an unpinned search_path.
--
-- Safety of these changes (verified against production before writing):
--   * The four `*_set_updated_at` functions are TRIGGER helpers. Triggers fire
--     as the table owner regardless of the invoking role's EXECUTE grant, so
--     revoking EXECUTE does NOT stop the triggers — it only closes the
--     unintended RPC surface. (They already pin `search_path = ''`.)
--   * `admin_usage_daily` is invoked ONLY by `api/admin.js` using the
--     SUPABASE_SERVICE_ROLE_KEY (behind an ADMIN_SECRET gate). `service_role`
--     retains EXECUTE, so the admin dashboard is unaffected; only anon /
--     authenticated lose the (unintended) RPC access. Its single table
--     reference is already schema-qualified (`public.narrative_generations`),
--     so pinning `search_path = ''` is safe.
--
-- NOT changed here (documented, handled elsewhere):
--   * `rls_enabled_no_policy` on audit_log / email_queue / schema_migrations is
--     INTENTIONAL — RLS-on + no-policy = deny-all to anon/authenticated; those
--     tables are written by the service role (which bypasses RLS). Left as-is.
--   * "Leaked password protection disabled" is a Supabase Auth setting, not SQL.
--     Enable it in Dashboard → Authentication → Policies (HaveIBeenPwned check).

-- Pin the mutable search_path (linter WARN 0011).
ALTER FUNCTION public.admin_usage_daily(integer) SET search_path = '';

-- Close the unintended RPC surface (linter WARN 0028 / 0029). service_role and
-- the function owner keep EXECUTE; only the API-exposed roles are revoked.
REVOKE EXECUTE ON FUNCTION public.admin_usage_daily(integer)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fa_feedback_set_updated_at()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.peer_reviews_set_updated_at()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_templates_set_updated_at()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sites_set_updated_at()              FROM PUBLIC, anon, authenticated;
