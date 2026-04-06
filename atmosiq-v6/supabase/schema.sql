-- ═══════════════════════════════════════════════════════════════════
-- AtmosIQ — Supabase Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════════

-- ── Profiles ──────────────────────────────────────────────────────
-- One profile per auth user. Stores assessor credentials + instruments.
create table if not exists profiles (
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

alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- ── Assessments (drafts + completed) ─────────────────────────────
-- Stores the full assessment data: presurvey, building, zones, photos refs
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'complete')),
  facility_name text,
  facility_address text,
  presurvey jsonb default '{}',
  building jsonb default '{}',
  zones jsonb default '[]',
  photos jsonb default '{}',
  -- Scoring results (null until assessment is complete)
  zone_scores jsonb,
  composite jsonb,
  osha_evals jsonb,
  recommendations jsonb,
  sampling_plan jsonb,
  causal_chains jsonb,
  narrative text,
  -- Metadata
  score integer,
  risk text,
  version text default '6.0.0-beta',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table assessments enable row level security;

create policy "Users can read own assessments"
  on assessments for select using (auth.uid() = user_id);
create policy "Users can insert own assessments"
  on assessments for insert with check (auth.uid() = user_id);
create policy "Users can update own assessments"
  on assessments for update using (auth.uid() = user_id);
create policy "Users can delete own assessments"
  on assessments for delete using (auth.uid() = user_id);

-- Index for fast dashboard queries
create index if not exists idx_assessments_user_status
  on assessments(user_id, status, updated_at desc);

-- ── Photo Storage Bucket ─────────────────────────────────────────
-- Run this separately in the SQL editor:
insert into storage.buckets (id, name, public)
values ('assessment-photos', 'assessment-photos', false)
on conflict (id) do nothing;

-- Storage policies: users can only access their own photos
create policy "Users can upload own photos"
  on storage.objects for insert
  with check (bucket_id = 'assessment-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own photos"
  on storage.objects for select
  using (bucket_id = 'assessment-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own photos"
  on storage.objects for delete
  using (bucket_id = 'assessment-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ── Auto-update timestamp trigger ────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger assessments_updated_at
  before update on assessments
  for each row execute function update_updated_at();
