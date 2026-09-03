-- 000_base_schema.sql
--
-- The base schema the migration sequence assumes: `public.profiles` and
-- the shared `update_updated_at()` trigger helper.
--
-- Extracted from the un-ledgered supabase/schema.sql (audit 2026-09, H2).
-- Migration 002 ALTERs `profiles`, which only schema.sql created, so a
-- fresh database — a Supabase branch, staging, disaster recovery — could
-- not be built with `npm run db:migrate` at all. Numbered 000 so it sorts
-- before 001.
--
-- Deliberately ONLY the profiles DDL. The `assessments` table schema.sql
-- also created (with `id uuid`) is superseded by migration 014 (`id text`,
-- matching the ids the app actually mints); creating the uuid version
-- first would make 014's CREATE TABLE IF NOT EXISTS a silent no-op and
-- break every write. The photo bucket block is dropped with it — nothing
-- in the app reads or writes the `assessment-photos` bucket (photos ride
-- inline in `assessments.photos`).
--
-- Idempotent: on production, where all of this already exists, every
-- statement is a no-op or a same-definition replace.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  certs text[] default '{}',
  experience text,
  iaq_meter text,
  iaq_serial text,
  iaq_cal_date date,
  iaq_cal_status text,
  pid_meter text,
  pid_cal_status text,
  other_instruments text,
  firm text,
  marketing_consent boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- NOTE: the UPDATE policy is column-unrestricted here, exactly as
-- schema.sql shipped it. Migration 033 narrows it (server-owned billing
-- columns) — this file only reproduces the base the later files assume.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Shared updated_at helper. search_path pinned to '' so the function
-- cannot be hijacked via a mutable role search_path (Supabase linter 0011).
create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.update_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();
