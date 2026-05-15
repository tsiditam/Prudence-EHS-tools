-- RegLens API Rate Limits Migration
-- Run this in Supabase SQL Editor after 002_analytics_and_privacy.sql
--
-- Tracks per-user, per-endpoint API usage in minute buckets so that
-- /api/claude and /api/parse-document can enforce per-minute and
-- per-day caps from a single atomic SQL call.

create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, endpoint, window_start)
);

create index if not exists idx_api_rate_limits_window
  on public.api_rate_limits (window_start);

alter table public.api_rate_limits enable row level security;
-- No policies: only the service role (server-side) reads or writes this table.

-- Atomic increment-and-check. Bumps the current minute bucket by 1, then
-- evaluates per-minute and (optional) per-day caps. Returns a JSON verdict:
--   { allowed: bool, reason?: text, minute_count, day_count?, limit_minute, limit_day? }
create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_max_per_minute integer,
  p_max_per_day integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute_bucket timestamptz := date_trunc('minute', now());
  v_day_start timestamptz := date_trunc('day', now());
  v_minute_count integer;
  v_day_count integer := 0;
begin
  insert into public.api_rate_limits (user_id, endpoint, window_start, request_count)
  values (p_user_id, p_endpoint, v_minute_bucket, 1)
  on conflict (user_id, endpoint, window_start)
  do update set request_count = api_rate_limits.request_count + 1
  returning request_count into v_minute_count;

  if p_max_per_day is not null then
    select coalesce(sum(request_count), 0) into v_day_count
    from public.api_rate_limits
    where user_id = p_user_id
      and endpoint = p_endpoint
      and window_start >= v_day_start;
  end if;

  if v_minute_count > p_max_per_minute then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'minute_limit',
      'minute_count', v_minute_count,
      'day_count', v_day_count,
      'limit_minute', p_max_per_minute,
      'limit_day', p_max_per_day
    );
  end if;

  if p_max_per_day is not null and v_day_count > p_max_per_day then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'day_limit',
      'minute_count', v_minute_count,
      'day_count', v_day_count,
      'limit_minute', p_max_per_minute,
      'limit_day', p_max_per_day
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'minute_count', v_minute_count,
    'day_count', v_day_count,
    'limit_minute', p_max_per_minute,
    'limit_day', p_max_per_day
  );
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;

-- Optional housekeeping: delete buckets older than 7 days.
-- Schedule via pg_cron if available, e.g.:
--   select cron.schedule('purge-api-rate-limits', '0 3 * * *',
--     $$ delete from public.api_rate_limits where window_start < now() - interval '7 days' $$);
