-- AtmosIQ Teams & Organizations Migration
-- Run in Supabase SQL Editor after 002_billing_credits.sql

-- ─── Organizations ───
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'team',
  credits_remaining integer not null default 500,
  monthly_credit_limit integer not null default 500,
  stripe_customer_id text,
  subscription_status text default 'active',
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- ─── Organization Members ───
create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member', -- owner, admin, member
  joined_at timestamptz not null default now(),
  unique(org_id, user_id)
);

alter table public.org_members enable row level security;

-- Members can read their own org membership
create policy "Users can read own memberships"
  on public.org_members for select
  using (auth.uid() = user_id);

-- Org owners/admins can manage members
create policy "Org admins can manage members"
  on public.org_members for all
  using (
    exists (
      select 1 from public.org_members m
      where m.org_id = org_members.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- Org members can read their organization
create policy "Members can read own org"
  on public.organizations for select
  using (
    exists (
      select 1 from public.org_members m
      where m.org_id = organizations.id
        and m.user_id = auth.uid()
    )
  );

-- ─── Invitations ───
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  invited_by uuid references auth.users(id),
  status text not null default 'pending', -- pending, accepted, expired
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table public.invitations enable row level security;

create policy "Org admins can manage invitations"
  on public.invitations for all
  using (
    exists (
      select 1 from public.org_members m
      where m.org_id = invitations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ─── Add org_id to profiles ───
alter table public.profiles
  add column if not exists org_id uuid references public.organizations(id);
