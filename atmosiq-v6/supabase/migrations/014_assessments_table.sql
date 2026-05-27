-- 014_assessments_table.sql
--
-- Create the `assessments` table.
--
-- The app's cloud-persistence layer (src/utils/supabaseStorage.js) has always
-- read/written `public.assessments` — saveAssessment upserts, fullSync pulls
-- on login, getAssessment/deleteAssessment by id. But the table was never
-- created in this project, so every cloud write failed silently (the upsert
-- error was ignored) and every pull returned nothing. Reports therefore lived
-- only in the browser's localStorage and were never backed up — a reinstall
-- or cleared cache lost them permanently.
--
-- Column shape matches exactly what saveAssessment writes. `id` is a TEXT
-- primary key because the app mints string ids ('rpt-<ts>', 'draft-<ts>').
-- `payload` holds the full app-shape report (minus photos, which have their
-- own column) so a cloud restore is lossless; fromCloudRow() prefers it.

create table if not exists public.assessments (
  id              text primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'draft',
  facility_name   text,
  facility_address text,
  presurvey       jsonb default '{}'::jsonb,
  building        jsonb default '{}'::jsonb,
  zones           jsonb default '[]'::jsonb,
  photos          jsonb default '{}'::jsonb,
  zone_scores     jsonb,
  composite       jsonb,
  osha_evals      jsonb,
  recommendations jsonb,
  sampling_plan   jsonb,
  causal_chains   jsonb,
  narrative       jsonb,
  score           numeric,
  risk            text,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists assessments_user_id_idx on public.assessments (user_id);
create index if not exists assessments_user_updated_idx on public.assessments (user_id, updated_at desc);

-- Row-level security: an authenticated user may only touch their own rows.
alter table public.assessments enable row level security;

drop policy if exists assessments_select_own on public.assessments;
create policy assessments_select_own on public.assessments
  for select using (auth.uid() = user_id);

drop policy if exists assessments_insert_own on public.assessments;
create policy assessments_insert_own on public.assessments
  for insert with check (auth.uid() = user_id);

drop policy if exists assessments_update_own on public.assessments;
create policy assessments_update_own on public.assessments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists assessments_delete_own on public.assessments;
create policy assessments_delete_own on public.assessments
  for delete using (auth.uid() = user_id);

-- Keep updated_at fresh on every upsert so fullSync's
-- `order by updated_at desc` reflects the latest save.
-- search_path pinned to '' so the function can't be hijacked via a mutable
-- role search_path (Supabase security linter 0011).
create or replace function public.assessments_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists assessments_set_updated_at on public.assessments;
create trigger assessments_set_updated_at
  before update on public.assessments
  for each row execute function public.assessments_set_updated_at();
