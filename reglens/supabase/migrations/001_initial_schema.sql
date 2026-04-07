-- RegLens Initial Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- ─── User Profiles ───
-- Extends Supabase auth.users with app-specific fields
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  company_name text,
  review_credits integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = id);

-- ─── Clients ───
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  industry text default 'general',
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "Users can manage own clients"
  on public.clients for all
  using (auth.uid() = user_id);

-- ─── Compliance Reviews ───
create table if not exists public.compliance_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  client_id uuid references public.clients(id) on delete set null,
  review_ref text not null,
  program_type text not null,
  program_label text,
  industry text,
  industry_label text,
  score numeric,
  band text,
  summary text,
  findings jsonb default '[]'::jsonb,
  strengths jsonb default '[]'::jsonb,
  score_result jsonb,
  source text default 'api',
  status text default 'pending',
  created_at timestamptz not null default now()
);

alter table public.compliance_reviews enable row level security;

create policy "Users can manage own reviews"
  on public.compliance_reviews for all
  using (auth.uid() = user_id);

-- ─── Audits (Readiness Checks) ───
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  client_id uuid references public.clients(id) on delete set null,
  audit_ref text not null,
  industry text,
  industry_label text,
  score numeric,
  band text,
  stats jsonb,
  findings jsonb default '[]'::jsonb,
  responses jsonb,
  findings_count integer default 0,
  created_at timestamptz not null default now()
);

alter table public.audits enable row level security;

create policy "Users can manage own audits"
  on public.audits for all
  using (auth.uid() = user_id);

-- ─── Audit Photos ───
create table if not exists public.audit_photos (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  item_id text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.audit_photos enable row level security;

create policy "Users can manage own audit photos"
  on public.audit_photos for all
  using (
    exists (
      select 1 from public.audits
      where audits.id = audit_photos.audit_id
        and audits.user_id = auth.uid()
    )
  );

-- ─── Purchases ───
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  tier text,
  amount numeric,
  credits integer,
  status text default 'completed',
  created_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

create policy "Users can read own purchases"
  on public.purchases for select
  using (auth.uid() = user_id);

create policy "Users can insert own purchases"
  on public.purchases for insert
  with check (auth.uid() = user_id);

-- ─── Storage Bucket ───
-- Create the audit-photos storage bucket (public read, authenticated write)
insert into storage.buckets (id, name, public)
values ('audit-photos', 'audit-photos', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload photos"
  on storage.objects for insert
  with check (bucket_id = 'audit-photos' and auth.role() = 'authenticated');

create policy "Anyone can read audit photos"
  on storage.objects for select
  using (bucket_id = 'audit-photos');

create policy "Users can delete own photos"
  on storage.objects for delete
  using (bucket_id = 'audit-photos' and auth.uid()::text = (storage.foldername(name))[1]);
