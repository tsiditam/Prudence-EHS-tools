-- Prudence Safety & Environmental Consulting, LLC
-- Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
-- All rights reserved.
--
-- Migration 002 — billing: report-credit balance, append-only credit ledger,
-- and Stripe webhook idempotency. RLS owner-scoped for reads; all writes are
-- performed by the serverless functions with the service role.

-- Current credit balance + active plan per user.
create table if not exists public.billing_credits (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  plan        text not null default 'free',
  balance     integer not null default 0, -- -1 = unlimited
  renews_at   timestamptz,
  updated_at  timestamptz not null default now()
);

-- Append-only audit of every credit change (grant / consume).
create table if not exists public.credit_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  delta       integer not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_credit_ledger_user on public.credit_ledger (user_id, created_at desc);

-- Stripe webhook idempotency — one row per processed event id.
create table if not exists public.stripe_webhook_events (
  id            text primary key,             -- Stripe event id (evt_…)
  type          text,
  processed_at  timestamptz not null default now()
);

alter table public.billing_credits enable row level security;
alter table public.credit_ledger enable row level security;

create policy billing_credits_select_own
  on public.billing_credits for select using (auth.uid() = user_id);
create policy credit_ledger_select_own
  on public.credit_ledger for select using (auth.uid() = user_id);
-- stripe_webhook_events: service-role only (no client policy granted).
