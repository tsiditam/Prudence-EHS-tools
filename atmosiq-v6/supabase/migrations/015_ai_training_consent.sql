-- 015_ai_training_consent.sql
--
-- AI fine-tuning data collection foundation.
--
-- Three concerns, one migration:
--   1. Per-user consent flag (default ON; Settings UI flips it OFF).
--   2. Per-turn telemetry on field_assistant_messages so the export
--      pipeline has model + tokens + latency next to the content
--      (avoids an audit-log join at export time).
--   3. New field_assistant_feedback table — thumbs-up / thumbs-down
--      per assistant message + optional free-text reason.
--
-- All changes are additive. Existing rows continue to work; new
-- columns have safe defaults so the migration is reversible without
-- data loss (drop column / drop table).

-- ── 1. Consent on profiles ──────────────────────────────────────────
-- Default TRUE per product decision (default-on, opt-out). Existing
-- users are enrolled when this migration runs; the 30-day notice
-- email goes out via lib/email/training-program-notice.ts in a
-- separate batch.
alter table public.profiles
  add column if not exists ai_training_consent boolean not null default true,
  add column if not exists ai_training_consent_updated_at timestamptz default now(),
  add column if not exists training_notice_sent_at timestamptz;

-- ── 2. Per-turn telemetry on field_assistant_messages ───────────────
-- All nullable so historical rows (pre-migration) don't need
-- backfill. New writes from api/field-assistant.ts populate every
-- column on insert.
alter table public.field_assistant_messages
  add column if not exists model text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists tool_rounds integer,
  add column if not exists latency_ms integer;

-- ── 3. field_assistant_feedback ─────────────────────────────────────
-- One row per assistant message that the user rated. The UNIQUE on
-- message_id makes UPSERT idempotent — re-clicking a thumb just
-- updates the existing row instead of stacking.
create table if not exists public.field_assistant_feedback (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.field_assistant_messages(id) on delete cascade,
  conversation_id uuid not null references public.field_assistant_conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  rating          text not null check (rating in ('up','down')),
  reason          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (message_id)
);

create index if not exists fa_feedback_user_idx
  on public.field_assistant_feedback (user_id, created_at desc);
create index if not exists fa_feedback_conversation_idx
  on public.field_assistant_feedback (conversation_id);

-- Updated-at trigger — mirrors the established pattern from
-- migration 014. Search_path pinned per Supabase advisor guidance.
create or replace function public.fa_feedback_set_updated_at()
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

drop trigger if exists fa_feedback_updated_at on public.field_assistant_feedback;
create trigger fa_feedback_updated_at
  before update on public.field_assistant_feedback
  for each row execute function public.fa_feedback_set_updated_at();

-- RLS — owner-only, same shape as migration 013's fa_* policies.
alter table public.field_assistant_feedback enable row level security;

drop policy if exists fa_feedback_owner_select on public.field_assistant_feedback;
create policy fa_feedback_owner_select
  on public.field_assistant_feedback for select
  using (user_id = auth.uid());

drop policy if exists fa_feedback_owner_insert on public.field_assistant_feedback;
create policy fa_feedback_owner_insert
  on public.field_assistant_feedback for insert
  with check (user_id = auth.uid());

drop policy if exists fa_feedback_owner_update on public.field_assistant_feedback;
create policy fa_feedback_owner_update
  on public.field_assistant_feedback for update
  using (user_id = auth.uid());

drop policy if exists fa_feedback_owner_delete on public.field_assistant_feedback;
create policy fa_feedback_owner_delete
  on public.field_assistant_feedback for delete
  using (user_id = auth.uid());
