-- AtmosIQ Analytics Events
-- Run in Supabase SQL Editor after schema.sql

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
