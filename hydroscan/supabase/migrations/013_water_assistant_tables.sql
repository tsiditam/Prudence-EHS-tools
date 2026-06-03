-- Prudence Safety & Environmental Consulting, LLC
-- Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
-- All rights reserved.
--
-- Migration 013 — Marlow (water-assistant) conversation persistence.
--
-- STAGED: the /api/water-assistant endpoint is stateless in its first
-- release (the client sends the message history). These tables are applied
-- now so that when auth lands (Phase 5) the handler can persist and resume
-- conversations per user with no schema change. RLS is owner-scoped;
-- inserts are service-role only (the serverless function writes with the
-- service key, never the browser).

create table if not exists public.water_assistant_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.water_assistant_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.water_assistant_conversations (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  -- optional usage/cost + tool trace captured per assistant turn
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_wa_conversations_user on public.water_assistant_conversations (user_id, updated_at desc);
create index if not exists idx_wa_messages_conversation on public.water_assistant_messages (conversation_id, created_at);

alter table public.water_assistant_conversations enable row level security;
alter table public.water_assistant_messages enable row level security;

-- Owners can read their own conversations + messages.
create policy wa_conversations_select_own
  on public.water_assistant_conversations for select
  using (auth.uid() = user_id);

create policy wa_messages_select_own
  on public.water_assistant_messages for select
  using (
    exists (
      select 1 from public.water_assistant_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- Inserts/updates are performed by the serverless function with the service
-- role, which bypasses RLS. No client-side write policy is granted.
