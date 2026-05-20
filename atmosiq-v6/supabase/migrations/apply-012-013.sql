-- ─────────────────────────────────────────────────────────────────────────
-- One-shot bundle: migrations 008 + 012 + 013, idempotent + transactional
-- ─────────────────────────────────────────────────────────────────────────
-- Production was missing migration 008 (creates narrative_generations),
-- which 012 tries to ALTER and which both the /api/narrative and
-- /api/field-assistant endpoints insert into. Without it both endpoints
-- return 500. This bundle applies the 008 → 012 → 013 chain in one
-- transaction so the partial state can't drift again.
--
-- Paste this whole block into the Supabase SQL editor (production
-- project) and click Run. Safe to re-run — every statement uses
-- IF NOT EXISTS or a guarded DO block. Wrapped in BEGIN/COMMIT so
-- a failure mid-way rolls back the partial state.
--
-- After running, the final SELECT prints PASS / FAIL for each
-- expected object.
--
-- Out of scope: migrations 009 (pricing rollout), 010 (onboarding),
-- 011 (email queue) — those are independent features. Apply
-- separately if/when those endpoints 500.

BEGIN;

-- ─── Migration 008: narrative_generations table ──────────────────────
-- Parent table for the AI cost ledger. Both /api/narrative (report
-- drafting) and /api/field-assistant (Jasper) write to this table to
-- enforce rate limits + per-user gross margin tracking.

CREATE TABLE IF NOT EXISTS public.narrative_generations (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  estimated_cost_usd  NUMERIC(8, 4)
);

CREATE INDEX IF NOT EXISTS idx_narrative_generations_user_time
  ON public.narrative_generations (user_id, generated_at DESC);

ALTER TABLE public.narrative_generations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'narrative_generations_user_select'
    AND tablename = 'narrative_generations'
  ) THEN
    CREATE POLICY narrative_generations_user_select
      ON public.narrative_generations
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;


-- ─── Migration 012: narrative_generations.generation_type ─────────────
-- Discriminator column so the field-assistant agent and the narrative
-- drafter can share the ledger without their counts colliding.

ALTER TABLE public.narrative_generations
  ADD COLUMN IF NOT EXISTS generation_type TEXT NOT NULL DEFAULT 'narrative';

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
-- Jasper's persistence layer — owner-only SELECT, service-role INSERT
-- via the /api/field-assistant handler.

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
  'narrative_generations table' AS object,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'narrative_generations'
  ) THEN 'PASS' ELSE 'FAIL' END AS status
UNION ALL SELECT 'narrative_generations.generation_type column',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'narrative_generations' AND column_name = 'generation_type'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'narrative_generations_type_check constraint',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'narrative_generations_type_check'
  ) THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'narrative_generations_user_select RLS policy',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'narrative_generations_user_select'
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
