-- AtmosIQ Enterprise Infrastructure — Phase 1
-- Account lifecycle, contract acceptance, seat enforcement

-- ─── Contract Acceptances ───
create table if not exists public.contract_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  document_type text not null, -- 'tos', 'privacy', 'dpa', 'msa', 'order_form', 'disclaimer'
  document_version text not null default 'v1.0',
  accepted_at timestamptz not null default now(),
  accepted_by_email text not null,
  accepted_by_name text,
  company_name text,
  ip_address text,
  user_agent text,
  signer_role text default 'account_owner'
);

create index if not exists idx_contract_user on public.contract_acceptances (user_id, document_type);

alter table public.contract_acceptances enable row level security;

create policy "Users can read own acceptances"
  on public.contract_acceptances for select
  using (auth.uid() = user_id);

create policy "Users can insert own acceptances"
  on public.contract_acceptances for insert
  with check (auth.uid() = user_id);

-- ─── Account Lifecycle Fields ───
alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists suspended_at timestamptz,
  add column if not exists suspend_reason text,
  add column if not exists terminated_at timestamptz,
  add column if not exists termination_data_export_deadline timestamptz,
  add column if not exists trial_ends_at timestamptz;

-- ─── Seat Enforcement ───
alter table public.organizations
  add column if not exists authorized_user_count integer not null default 5,
  add column if not exists current_user_count integer not null default 0;

-- ─── Invoices ───
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  invoice_number text unique,
  amount_cents integer not null,
  status text not null default 'draft', -- draft, sent, paid, overdue, void
  due_date date,
  paid_date date,
  stripe_invoice_id text,
  description text,
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;

create policy "Users can read own invoices"
  on public.invoices for select
  using (auth.uid() = user_id);

-- ─── Audit Log ───
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null, -- 'user.suspend', 'user.terminate', 'credits.adjust', 'member.add', 'member.remove'
  target_type text, -- 'user', 'org', 'assessment'
  target_id text,
  details jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_actor on public.audit_log (actor_id, created_at desc);
create index if not exists idx_audit_target on public.audit_log (target_type, target_id, created_at desc);

alter table public.audit_log enable row level security;

-- Only service role can write audit logs (no user policy)
