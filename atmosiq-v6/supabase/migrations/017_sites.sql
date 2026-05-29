-- 017_sites.sql
--
-- Site library — durable per-building records that persist across
-- assessments at the same location. Backs the habit-loop PR 1
-- (re-assessment-due email) and any future per-site features.
--
-- Today, building data lives inside each draft body (the `bldg`
-- field on a draft / report row in localStorage + the assessments
-- table). That means a consultant who re-assesses the same client
-- quarterly re-enters the building profile from scratch every time.
-- A `sites` row gives the building durable identity, so:
--   • Re-assessment reminders can target it (next_due_at)
--   • A new assessment can be hydrated from the most recent
--     finalized assessment that referenced this site
--   • Settings → Sites surfaces the library for direct management
--
-- All changes are additive. No existing table is altered.

-- ── Sites table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sites (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null references public.profiles(id) on delete cascade,
  name                            text not null,
  address                         text,
  building_type                   text,
  notes                           text,
  reassessment_interval_months    integer not null default 12,
  last_finalized_at               timestamptz,
  next_due_at                     timestamptz,
  -- Soft disable so users can pause reminders without losing the
  -- saved building profile. Hard delete via the API removes the row.
  disabled_at                     timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Per-user, ordered by next_due_at for the reminder cron + the
-- Settings panel's "next due" view. Partial index excludes disabled
-- rows so the working set stays small.
create index if not exists sites_user_due_idx
  on public.sites (user_id, next_due_at)
  where disabled_at is null;

create index if not exists sites_user_created_idx
  on public.sites (user_id, created_at desc);

-- updated_at trigger — same pattern as migration 016's
-- report_templates_set_updated_at.
create or replace function public.sites_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sites_updated_at on public.sites;
create trigger sites_updated_at
  before update on public.sites
  for each row execute function public.sites_set_updated_at();

-- ── RLS — owner-only, same shape as report_templates (migration 016)
alter table public.sites enable row level security;

drop policy if exists sites_owner_select on public.sites;
create policy sites_owner_select
  on public.sites for select
  using (user_id = auth.uid());

drop policy if exists sites_owner_insert on public.sites;
create policy sites_owner_insert
  on public.sites for insert
  with check (user_id = auth.uid());

drop policy if exists sites_owner_update on public.sites;
create policy sites_owner_update
  on public.sites for update
  using (user_id = auth.uid());

drop policy if exists sites_owner_delete on public.sites;
create policy sites_owner_delete
  on public.sites for delete
  using (user_id = auth.uid());
