-- RegLens Analytics & Privacy Migration
-- Run this in Supabase SQL Editor after 001_initial_schema.sql

-- ─── Analytics Events ───
-- Lightweight, first-party analytics — no cookies, no third-party tracking
-- Events are fire-and-forget; never block the UI
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  event_type text not null,
  event_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for querying events by type and date
create index if not exists idx_analytics_event_type on public.analytics_events (event_type, created_at desc);

alter table public.analytics_events enable row level security;

-- Authenticated users can insert events linked to their account
create policy "Authenticated users can insert events"
  on public.analytics_events for insert
  with check (auth.uid() = user_id or user_id is null);

-- No select policy for regular users — only DB admin can query analytics
-- This prevents users from reading each other's usage data
