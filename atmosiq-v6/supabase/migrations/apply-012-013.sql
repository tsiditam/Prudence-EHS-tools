-- ─────────────────────────────────────────────────────────────────────────
-- One-shot bundle: migrations 012 + 013, idempotent + transactional
-- ─────────────────────────────────────────────────────────────────────────
-- Paste this whole block into the Supabase SQL editor (production project)
-- and click Run. Safe to re-run — every statement uses IF NOT EXISTS or a
-- guarded DO block. Wrapped in BEGIN/COMMIT so a failure mid-way rolls
-- back the partial state.
--
-- After running, the Field Assistant API (/api/field-assistant) will
-- stop returning 500.
--
-- Last verification step prints PASS / FAIL for each expected object.

BEGIN;

-- ─── Migration 012: narrative_generations.generation_type ─────────────
-- The field-assistant agent writes to the same ledger as narrative
-- drafting. The generation_type column distinguishes the two streams
-- so rate limits + cost dashboards can filter.

ALTER TABLE public.narrative_generations
  ADD COLUMN IF NOT EXISTS generation_type TEXT NOT NULL DEFAULT 'narrative';

-- Constraint must be guarded — IF NOT EXISTS isn't supported for
-- ADD CONSTRAINT prior to Postgres 9.6.  Supabase is 15+, but the DO
-- block is portable and idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'narrative_generations_type_check'
  ) THEN
    ALTER TABLE public.narrative_generations
      ADD CONSTRAINT narrative_generations_type_check
      CHECK (generation_type IN ('narrative', 'field_assistant'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_narrative_generations_user_type_time
  ON public.narrative_generations (user_id, generation_type, generated_at DESC);


-- ─── Migration 013: field_assistant_conversations + _messages ────────

CREATE TABLE IF NOT EXISTS public.field_assistant_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fa_conversations_user_time
  ON public.field_assistant_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.field_assistant_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.field_assistant_conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  context_view    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fa_messages_conv_time
  ON public.field_assistant_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_fa_messages_user_time
  ON public.field_assistant_messages (user_id, created_at DESC);

-- RLS — service-role bypass on insert (the /api/field-assistant
-- handler uses the service-role key); auth.uid() owner-only on select.
ALTER TABLE public.field_assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_assistant_messages      ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'fa_conversations_owner_select'
    AND tablename = 'field_assistant_conversations'
  ) THEN
    CREATE POLICY fa_conversations_owner_select
      ON public.field_assistant_conversations
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'fa_messages_owner_select'
    AND tablename = 'field_assistant_messages'
  ) THEN
    CREATE POLICY fa_messages_owner_select
      ON public.field_assistant_messages
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

COMMIT;


-- ─── Post-apply verification ─────────────────────────────────────────
-- Run after the COMMIT to confirm every expected object exists.

SELECT
  'narrative_generations.generation_type column' AS object,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'narrative_generations' AND column_name = 'generation_type'
  ) THEN 'PASS' ELSE 'FAIL' END AS status
UNION ALL SELECT 'narrative_generations_type_check constraint',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'narrative_generations_type_check'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'field_assistant_conversations table',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'field_assistant_conversations'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'field_assistant_messages table',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'field_assistant_messages'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'fa_conversations_owner_select RLS policy',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'fa_conversations_owner_select'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'fa_messages_owner_select RLS policy',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'fa_messages_owner_select'
  ) THEN 'PASS' ELSE 'FAIL' END;
