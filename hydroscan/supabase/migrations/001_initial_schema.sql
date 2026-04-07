-- HydroScan Initial Database Schema
-- Run in Supabase SQL Editor

-- ─── User Profiles ───
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  firm text,
  phone text,
  instrument text,
  calibration_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read own profile"
  on public.user_profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.user_profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.user_profiles for insert with check (auth.uid() = id);

-- ─── Analytics Events ───
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  event_type text not null,
  event_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_event_type on public.analytics_events (event_type, created_at desc);

alter table public.analytics_events enable row level security;

create policy "Users can insert analytics events"
  on public.analytics_events for insert
  with check (auth.uid() = user_id or user_id is null);

-- ─── Assessments ───
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  assessment_type text not null, -- 'field', 'lab', 'quick'
  status text default 'complete',
  source_type text,
  compliance_tier text,
  source_data jsonb default '{}'::jsonb,
  building_data jsonb default '{}'::jsonb,
  field_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.assessments enable row level security;
create policy "Users manage own assessments"
  on public.assessments for all using (auth.uid() = user_id);

-- ─── Lab Results ───
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  parameter_id text not null,
  value numeric,
  qualifier text,
  unit text,
  created_at timestamptz not null default now()
);

alter table public.lab_results enable row level security;
create policy "Users manage own lab results"
  on public.lab_results for all
  using (exists (
    select 1 from public.assessments
    where assessments.id = lab_results.assessment_id
      and assessments.user_id = auth.uid()
  ));

-- ─── Sampling Plans ───
create table if not exists public.sampling_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  assessment_id uuid references public.assessments(id) on delete set null,
  parameters jsonb not null,
  frequency text,
  site_description text,
  collection_guide text,
  created_at timestamptz not null default now()
);

alter table public.sampling_plans enable row level security;
create policy "Users manage own sampling plans"
  on public.sampling_plans for all using (auth.uid() = user_id);
