-- AtmosIQ Billing & Credits Migration
-- Run in Supabase SQL Editor after schema.sql and 001_analytics_events.sql

-- ─── Add billing fields to profiles ───
alter table public.profiles
  add column if not exists plan text not null default 'free',
  add column if not exists credits_remaining integer not null default 5,
  add column if not exists monthly_credit_limit integer not null default 5,
  add column if not exists stripe_customer_id text,
  add column if not exists subscription_status text default 'active',
  add column if not exists billing_cycle_start timestamptz;

-- ─── Credits Ledger ───
-- Immutable audit trail of every credit transaction
create table if not exists public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null, -- positive = credit added, negative = credit consumed
  reason text not null, -- 'purchase', 'monthly_reset', 'assessment', 'narrative', 'refund', 'admin'
  reference_id text, -- assessment ID, Stripe payment intent, etc.
  balance_after integer not null, -- snapshot of credits_remaining after this transaction
  created_at timestamptz not null default now()
);

create index if not exists idx_credits_ledger_user on public.credits_ledger (user_id, created_at desc);

alter table public.credits_ledger enable row level security;

create policy "Users can read own credit history"
  on public.credits_ledger for select
  using (auth.uid() = user_id);

create policy "Users can insert own credit events"
  on public.credits_ledger for insert
  with check (auth.uid() = user_id);

-- ─── Purchases ───
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_payment_intent text,
  stripe_session_id text,
  amount_cents integer not null,
  credits integer not null,
  plan text,
  status text not null default 'pending', -- pending, completed, refunded, failed
  created_at timestamptz not null default now()
);

create index if not exists idx_purchases_user on public.purchases (user_id, created_at desc);

alter table public.purchases enable row level security;

create policy "Users can read own purchases"
  on public.purchases for select
  using (auth.uid() = user_id);
