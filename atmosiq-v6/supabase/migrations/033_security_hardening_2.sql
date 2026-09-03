-- ─────────────────────────────────────────────────────────────────────────
-- 033 — Security hardening 2 (audit 2026-09, §3 + §4)
-- ─────────────────────────────────────────────────────────────────────────
-- Every statement is idempotent: guarded with DO $$ blocks, IF EXISTS /
-- IF NOT EXISTS, CREATE OR REPLACE, or a to_regclass() check, so the file
-- can be re-run against a database that already has any part of it.
--
-- What it does, in order:
--   A. Atomic credit RPCs — consume_credits / grant_credits — so a balance
--      change and its ledger row are one transaction (audit §3 C1, "non-
--      atomic credit arithmetic in five places").
--   B. Column-level write privileges on public.profiles: a signed-in user
--      can no longer set their own plan / credits / flags with the anon key
--      (audit §2.2 / §4 C1).
--   C. Widen narrative_generations_type_check so the inline / pre-review /
--      photo ledgers actually land (audit §2.5 H2).
--   D. schema_migrations: RLS on + no anon/authenticated access (§4 H1).
--   E. org_members / organizations / invitations policies rewritten over
--      SECURITY DEFINER helpers so they no longer recurse (§4 Medium).
--   F. analytics_events inserts must carry the caller's own user_id.
--   G. credits_ledger: users cannot forge their own rows.
--   H. invitations.invited_by → ON DELETE SET NULL (erasure no longer fails
--      for anyone who ever sent an invite).
--   I. The missing indexes from §4 Low L4.
-- ─────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════
-- A. Atomic credit RPCs
-- ═══════════════════════════════════════════════════════════════════════
-- Service-role only: EXECUTE is revoked from anon / authenticated / PUBLIC
-- so neither is callable over PostgREST /rest/v1/rpc. The API handlers call
-- them with the service key.

CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id      uuid,
  p_amount       integer,
  p_reason       text,
  p_reference_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  -- The WHERE clause is the whole point: the debit and the balance check
  -- are one statement, so two concurrent debits cannot both pass a stale
  -- read the way select→compute→update did.
  UPDATE public.profiles
     SET credits_remaining = credits_remaining - p_amount
   WHERE id = p_user_id
     AND credits_remaining >= p_amount
  RETURNING credits_remaining INTO v_balance;

  IF NOT FOUND THEN
    PERFORM 1 FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.credits_ledger (user_id, amount, reason, reference_id, balance_after)
  VALUES (p_user_id, -p_amount, p_reason, p_reference_id, v_balance);

  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;

-- grant_credits: p_amount may be negative (admin adjustment). The balance
-- is floored at 0 and the ledger row records the delta actually applied.
CREATE OR REPLACE FUNCTION public.grant_credits(
  p_user_id      uuid,
  p_amount       integer,
  p_reason       text,
  p_reference_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old integer;
  v_new integer;
BEGIN
  IF p_amount IS NULL THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT credits_remaining INTO v_old
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_new := GREATEST(0, COALESCE(v_old, 0) + p_amount);

  UPDATE public.profiles SET credits_remaining = v_new WHERE id = p_user_id;

  INSERT INTO public.credits_ledger (user_id, amount, reason, reference_id, balance_after)
  VALUES (p_user_id, v_new - COALESCE(v_old, 0), p_reason, p_reference_id, v_new);

  RETURN v_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- B. Column-level write privileges on public.profiles
-- ═══════════════════════════════════════════════════════════════════════
-- The UPDATE policy on profiles is `using (auth.uid() = id)` with no column
-- restriction, and the client writes plan + credits_remaining from the
-- browser. Server entitlement reads those columns, so any signed-in user
-- could grant themselves a plan.
--
-- Postgres detail that matters here: a column-level REVOKE does nothing
-- while a TABLE-level grant stands (the table grant still covers every
-- column). Supabase grants ALL on public tables to `authenticated` by
-- default, so the effective change is: REVOKE the table-level INSERT/UPDATE,
-- then GRANT INSERT/UPDATE on the allowed columns only. The explicit
-- column REVOKEs the audit asked for are issued too — they are harmless and
-- make the intent greppable.
--
-- Allowed = every column NOT in the sensitive list below, computed from
-- information_schema at run time so the migration does not need to
-- enumerate the profile's ~40 user-editable columns. `id` stays in both
-- lists: the client's saveProfile() UPSERT sends it, and RLS
-- (auth.uid() = id) already prevents changing it to someone else's.
--
-- CONSEQUENCE FOR FUTURE MIGRATIONS: a column added to profiles after this
-- runs is NOT writable by `authenticated` until it is granted explicitly.
-- Re-running this file re-computes the allow-list, which is the intended
-- way to pick new columns up.
--
-- Column defaults are set so the client's signup bootstrap can drop the
-- sensitive keys it used to insert (plan, credits_remaining,
-- subscription_status, stripe_customer_id, billing_period) and still get a
-- correct free-tier row: plan 'free', 1 credit, monthly, status 'free'.

DO $$
DECLARE
  sensitive text[] := ARRAY[
    'plan',
    'credits_remaining',
    'monthly_credit_limit',
    'stripe_customer_id',
    'subscription_status',
    'billing_cycle_start',
    'billing_period',
    'annual_renewal_at',
    'account_status',
    'suspended_at',
    'suspend_reason',
    'terminated_at',
    'termination_data_export_deadline',
    'trial_ends_at',
    'kg_beta',
    'org_id',
    'training_notice_sent_at'
  ];
  present_sensitive text;
  allowed_cols text;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  -- Defaults first (safe to re-run; ALTER COLUMN SET DEFAULT is idempotent).
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'plan') THEN
    ALTER TABLE public.profiles ALTER COLUMN plan SET DEFAULT 'free';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'credits_remaining') THEN
    ALTER TABLE public.profiles ALTER COLUMN credits_remaining SET DEFAULT 1;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'monthly_credit_limit') THEN
    ALTER TABLE public.profiles ALTER COLUMN monthly_credit_limit SET DEFAULT 1;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'subscription_status') THEN
    ALTER TABLE public.profiles ALTER COLUMN subscription_status SET DEFAULT 'free';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_period') THEN
    ALTER TABLE public.profiles ALTER COLUMN billing_period SET DEFAULT 'monthly';
  END IF;

  -- Sensitive columns that actually exist on this database.
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
    INTO present_sensitive
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles'
     AND column_name = ANY (sensitive);

  -- Everything else (id included) stays writable by the owner.
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
    INTO allowed_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles'
     AND NOT (column_name = ANY (sensitive));

  -- Explicit column-level revokes (greppable statement of intent).
  IF present_sensitive IS NOT NULL THEN
    EXECUTE format('REVOKE UPDATE (%s) ON public.profiles FROM authenticated, anon', present_sensitive);
    EXECUTE format('REVOKE INSERT (%s) ON public.profiles FROM authenticated, anon', present_sensitive);
  END IF;

  -- The part that enforces it: drop the table-level write grants and
  -- re-grant on the allowed columns only. anon gets nothing back (RLS
  -- already requires auth.uid() = id, so anon could never write anyway).
  REVOKE INSERT, UPDATE ON public.profiles FROM authenticated, anon;
  IF allowed_cols IS NOT NULL THEN
    EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', allowed_cols);
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', allowed_cols);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- C. narrative_generations_type_check — widen to every live surface
-- ═══════════════════════════════════════════════════════════════════════
-- Migration 012 allowed only ('narrative','field_assistant'). inline-ai,
-- inline-complete and pre-review-semantic have been inserting
-- 'inline_ai' / 'inline_complete' / 'pre_review_semantic' — every insert
-- violated the CHECK, supabase-js returned { error } nobody read, zero
-- rows landed, and their daily caps never fired. photo-analyze inserted no
-- type at all and shared the narrative budget; it now writes
-- 'photo_analysis'.

DO $$
BEGIN
  IF to_regclass('public.narrative_generations') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'narrative_generations_type_check'
       AND conrelid = 'public.narrative_generations'::regclass
  ) THEN
    ALTER TABLE public.narrative_generations DROP CONSTRAINT narrative_generations_type_check;
  END IF;
  ALTER TABLE public.narrative_generations
    ADD CONSTRAINT narrative_generations_type_check
    CHECK (generation_type IN (
      'narrative',
      'field_assistant',
      'inline_ai',
      'inline_complete',
      'pre_review_semantic',
      'photo_analysis'
    ));
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- D. schema_migrations — RLS on, no PostgREST access for API roles
-- ═══════════════════════════════════════════════════════════════════════
-- The migration runner (scripts/db-migrate.mjs) creates this table with RLS
-- off, and it lives in `public`, so it is PostgREST-exposed: any anon-key
-- caller could read, forge or delete migration ledger rows. RLS-on with no
-- policy is deny-all for anon/authenticated; the runner uses the service
-- role, which bypasses RLS, so it is unaffected. The REVOKE is belt and
-- braces for the same roles.

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.schema_migrations FROM anon, authenticated;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- E. Teams / orgs policies — no more self-reference
-- ═══════════════════════════════════════════════════════════════════════
-- Migration 003's "Org admins can manage members" policy on org_members
-- selects from org_members, and the organizations / invitations policies
-- go through the same table, so any query hits
-- `infinite recursion detected in policy for relation "org_members"`
-- (42P17). Latent because the tables are unused; fixed here so they are
-- usable. SECURITY DEFINER helpers read org_members without invoking its
-- policies. `authenticated` must be able to EXECUTE them (policies run as
-- the invoking role); anon / PUBLIC are revoked.

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.org_members m
     WHERE m.org_id = p_org
       AND m.user_id = auth.uid()
       AND m.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.org_members m
     WHERE m.org_id = p_org
       AND m.user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_org_admin(uuid)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.org_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Org admins can manage members" ON public.org_members;
    CREATE POLICY "Org admins can manage members"
      ON public.org_members FOR ALL
      USING (public.is_org_admin(org_id))
      WITH CHECK (public.is_org_admin(org_id));
  END IF;

  IF to_regclass('public.organizations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can read own org" ON public.organizations;
    CREATE POLICY "Members can read own org"
      ON public.organizations FOR SELECT
      USING (public.is_org_member(id));
  END IF;

  IF to_regclass('public.invitations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Org admins can manage invitations" ON public.invitations;
    CREATE POLICY "Org admins can manage invitations"
      ON public.invitations FOR ALL
      USING (public.is_org_admin(org_id))
      WITH CHECK (public.is_org_admin(org_id));
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- F. analytics_events — inserts must carry the caller's own user_id
-- ═══════════════════════════════════════════════════════════════════════
-- Migration 001 allowed `user_id IS NULL`, i.e. anonymous unbounded
-- inserts — and the erasure purge (delete by user_id) matched nothing.
-- The SPA must now set user_id on every event it sends directly.

DO $$
BEGIN
  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can insert analytics events" ON public.analytics_events;
    CREATE POLICY "Users can insert analytics events"
      ON public.analytics_events FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- G. credits_ledger — users cannot forge their own rows
-- ═══════════════════════════════════════════════════════════════════════
-- Every legitimate ledger row is written by the service role (the credit
-- RPCs above, the webhook, the crons). The 002 insert policy let a user
-- write any amount / balance_after for themselves.

DO $$
BEGIN
  IF to_regclass('public.credits_ledger') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can insert own credit events" ON public.credits_ledger;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- H. invitations.invited_by → ON DELETE SET NULL
-- ═══════════════════════════════════════════════════════════════════════
-- 003 declared `invited_by uuid references auth.users(id)` with no ON
-- DELETE action, so auth.admin.deleteUser fails (FK violation) for any user
-- who ever sent an invitation — an erasure request that cannot complete.

DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('public.invitations') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'invited_by'
  ) THEN
    RETURN;
  END IF;

  -- Find whatever the FK on invited_by is currently called.
  SELECT c.conname INTO fk_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
   WHERE c.conrelid = 'public.invitations'::regclass
     AND c.contype = 'f'
     AND a.attname = 'invited_by'
   LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.invitations DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- I. Missing indexes (audit §4 Low L4)
-- ═══════════════════════════════════════════════════════════════════════
-- Each one guarded on table AND column existence so the file runs on a
-- database that has not reached the migration that adds the table.

DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('profiles',                  'stripe_customer_id', 'idx_profiles_stripe_customer_id'),
      ('analytics_events',          'user_id',            'idx_analytics_events_user_id'),
      ('field_assistant_documents', 'user_id',            'idx_fa_documents_user_id'),
      ('peer_reviews',              'report_id',          'idx_peer_reviews_report_id'),
      ('invitations',               'org_id',             'idx_invitations_org_id'),
      ('invoices',                  'org_id',             'idx_invoices_org_id'),
      ('invoices',                  'user_id',            'idx_invoices_user_id'),
      ('contract_acceptances',      'org_id',             'idx_contract_acceptances_org_id'),
      ('credits_ledger',            'reference_id',       'idx_credits_ledger_reference_id')
    ) AS t(tbl, col, idx)
  LOOP
    IF to_regclass('public.' || spec.tbl) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = spec.col
       )
    THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', spec.idx, spec.tbl, spec.col);
    END IF;
  END LOOP;
END $$;
