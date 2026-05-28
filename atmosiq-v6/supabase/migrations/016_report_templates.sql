-- 016_report_templates.sql
--
-- User-uploaded DOCX report templates + Jasper-driven render path.
--
-- AtmosFlow's built-in DOCX pipeline (src/components/DocxReport.js) is
-- untouched. This migration introduces a parallel, additive path:
-- consultants upload their own .docx with {{tokens}}, and Jasper
-- renders deliverables that match each client's letterhead.
--
-- Two concerns, one migration:
--   1. Private Supabase Storage bucket `report-templates`, owner-only
--      RLS on storage.objects (the bucket itself is not public).
--   2. Catalog table public.report_templates — name, storage path,
--      and the tokens discovered during upload (so the Settings UI
--      can warn about tokens the registry can't fill).
--
-- All changes are additive. No existing table is altered.

-- ── 1. Storage bucket ───────────────────────────────────────────────
-- Private (public = false). Owner-only access enforced via RLS on
-- storage.objects below. The bucket is created idempotently so this
-- migration can be re-applied in dev without erroring.
insert into storage.buckets (id, name, public)
values ('report-templates', 'report-templates', false)
on conflict (id) do nothing;

-- Per-user RLS on storage.objects scoped to this bucket. Path
-- convention: {user_id}/{template_id}.docx — the user-id prefix is
-- what gates access. (Supabase's storage.foldername(name)[1] returns
-- the first path segment as text.)
drop policy if exists report_templates_owner_select on storage.objects;
create policy report_templates_owner_select
  on storage.objects for select
  using (
    bucket_id = 'report-templates'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists report_templates_owner_insert on storage.objects;
create policy report_templates_owner_insert
  on storage.objects for insert
  with check (
    bucket_id = 'report-templates'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists report_templates_owner_delete on storage.objects;
create policy report_templates_owner_delete
  on storage.objects for delete
  using (
    bucket_id = 'report-templates'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- No UPDATE policy on storage.objects — re-upload deletes + re-inserts
-- via the API handler. Keeps the storage path / catalog row in lockstep.

-- ── 2. Catalog table ────────────────────────────────────────────────
create table if not exists public.report_templates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  storage_path    text not null unique,
  tokens_found    text[] not null default '{}',
  tokens_missing  text[] not null default '{}',
  size_bytes      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists report_templates_user_idx
  on public.report_templates (user_id, created_at desc);

-- updated_at trigger — same pattern as migration 015's fa_feedback.
create or replace function public.report_templates_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists report_templates_updated_at on public.report_templates;
create trigger report_templates_updated_at
  before update on public.report_templates
  for each row execute function public.report_templates_set_updated_at();

-- RLS — owner-only, mirrors the fa_* policies from migration 013/015.
alter table public.report_templates enable row level security;

drop policy if exists report_templates_owner_select_row on public.report_templates;
create policy report_templates_owner_select_row
  on public.report_templates for select
  using (user_id = auth.uid());

drop policy if exists report_templates_owner_insert_row on public.report_templates;
create policy report_templates_owner_insert_row
  on public.report_templates for insert
  with check (user_id = auth.uid());

drop policy if exists report_templates_owner_update_row on public.report_templates;
create policy report_templates_owner_update_row
  on public.report_templates for update
  using (user_id = auth.uid());

drop policy if exists report_templates_owner_delete_row on public.report_templates;
create policy report_templates_owner_delete_row
  on public.report_templates for delete
  using (user_id = auth.uid());
