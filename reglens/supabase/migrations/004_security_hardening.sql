-- RegLens Security Hardening Migration
-- Run this in Supabase SQL Editor after 003_api_rate_limits.sql
--
-- Closes four defects found in review:
--   1. Profiles were created by the browser with the anon key, which RLS
--      rejects whenever email confirmation is on. Profiles are now created
--      by a trigger on auth.users, and existing users are backfilled.
--   2. Clients could PATCH their own review_credits (the update policy
--      allowed every column). Credit columns are now writable only through
--      security-definer functions: consume_credit (called by the signed-in
--      user) and grant_credits (called by the Stripe webhook with the
--      service role).
--   3. Clients could insert rows into purchases. Only the webhook may.
--   4. Stripe retries webhook deliveries; stripe_webhook_events gives the
--      webhook an idempotency claim so a retry never grants credits twice.

-- ─── 1. Profile columns ───
alter table public.user_profiles
  add column if not exists citation_credits integer not null default 0,
  add column if not exists is_admin boolean not null default false;

-- ─── 2. Profile auto-creation ───
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, company_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'company_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up while the client-side insert was failing.
insert into public.user_profiles (id, email, full_name, company_name)
select u.id,
       coalesce(u.email, ''),
       nullif(u.raw_user_meta_data->>'full_name', ''),
       nullif(u.raw_user_meta_data->>'company_name', '')
from auth.users u
left join public.user_profiles p on p.id = u.id
where p.id is null;

-- ─── 3. Lock down client writes to user_profiles ───
-- Row scoping stays with the existing RLS policies. Column scoping is
-- enforced with grants: authenticated users may update only their display
-- fields. Credit and admin columns are reachable only via the functions
-- below (security definer) or the service role.
drop policy if exists "Users can insert own profile" on public.user_profiles;
revoke insert on public.user_profiles from authenticated, anon;
revoke update on public.user_profiles from authenticated, anon;
grant update (full_name, company_name, updated_at) on public.user_profiles to authenticated;

-- ─── 4. Lock down purchases ───
drop policy if exists "Users can insert own purchases" on public.purchases;
revoke insert, update, delete on public.purchases from authenticated, anon;

alter table public.purchases
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text,
  add column if not exists amount_cents integer,
  add column if not exists credit_type text default 'review';

create unique index if not exists idx_purchases_stripe_session
  on public.purchases (stripe_session_id)
  where stripe_session_id is not null;

-- ─── 5. Credit functions ───
-- consume_credit: called by the signed-in user. Atomically decrements one
-- credit of the requested type if the balance is positive.
create or replace function public.consume_credit(p_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_remaining integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  if p_type = 'review' then
    update public.user_profiles
       set review_credits = review_credits - 1, updated_at = now()
     where id = v_uid and review_credits > 0
     returning review_credits into v_remaining;
  elsif p_type = 'citation' then
    update public.user_profiles
       set citation_credits = citation_credits - 1, updated_at = now()
     where id = v_uid and citation_credits > 0
     returning citation_credits into v_remaining;
  else
    return jsonb_build_object('ok', false, 'reason', 'unknown_type');
  end if;

  if v_remaining is null then
    return jsonb_build_object('ok', false, 'reason', 'no_credits');
  end if;

  return jsonb_build_object('ok', true, 'remaining', v_remaining);
end;
$$;

revoke all on function public.consume_credit(text) from public, anon;
grant execute on function public.consume_credit(text) to authenticated, service_role;

-- grant_credits: called only by the Stripe webhook using the service role.
create or replace function public.grant_credits(p_user_id uuid, p_type text, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  if p_type = 'review' then
    update public.user_profiles
       set review_credits = review_credits + p_amount, updated_at = now()
     where id = p_user_id
     returning review_credits into v_balance;
  elsif p_type = 'citation' then
    update public.user_profiles
       set citation_credits = citation_credits + p_amount, updated_at = now()
     where id = p_user_id
     returning citation_credits into v_balance;
  else
    return jsonb_build_object('ok', false, 'reason', 'unknown_type');
  end if;

  if v_balance is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

revoke all on function public.grant_credits(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, text, integer) to service_role;

-- ─── 6. Webhook idempotency ───
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text,
  processed_at timestamptz not null default now(),
  result jsonb
);

alter table public.stripe_webhook_events enable row level security;
-- No policies: only the service role touches this table.

-- ─── 7. Analytics attribution ───
-- The insert policy already allows user_id = auth.uid(); the client now
-- sends it. Nothing to change here, noted for completeness.
