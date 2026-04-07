-- OSHAready Initial Database Schema
-- Run in Supabase SQL Editor

-- ─── User Profiles ───
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  company_name text,
  role text default 'Safety Manager',
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

-- ─── Hazards ───
create table if not exists public.hazards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  site text,
  location text,
  category text,
  severity text,
  status text default 'Open',
  reported_by text,
  cfr text,
  interim_measures text,
  created_at timestamptz not null default now()
);

alter table public.hazards enable row level security;
create policy "Users manage own hazards"
  on public.hazards for all using (auth.uid() = user_id);

-- ─── Corrective Actions ───
create table if not exists public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  source text,
  owner text,
  due_date date,
  severity text,
  status text default 'Open',
  root_cause text,
  interim text,
  fix text,
  created_at timestamptz not null default now()
);

alter table public.corrective_actions enable row level security;
create policy "Users manage own actions"
  on public.corrective_actions for all using (auth.uid() = user_id);

-- ─── Training Records ───
create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  employee_name text not null,
  course text,
  due_date date,
  status text default 'Pending',
  site text,
  created_at timestamptz not null default now()
);

alter table public.training_records enable row level security;
create policy "Users manage own training"
  on public.training_records for all using (auth.uid() = user_id);

-- ─── Documents ───
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  folder text,
  site text,
  status text default 'Current',
  expiration date,
  version text,
  approval text,
  approved_by text,
  approved_date date,
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;
create policy "Users manage own documents"
  on public.documents for all using (auth.uid() = user_id);
