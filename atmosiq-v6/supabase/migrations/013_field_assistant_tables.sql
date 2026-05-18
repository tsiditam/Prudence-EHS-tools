-- ─────────────────────────────────────────────────────────────────────────
-- 013 — Field Assistant Conversations + Messages
-- ─────────────────────────────────────────────────────────────────────────
-- The in-app field-assistant agent (api/field-assistant.ts) needs to
-- persist conversation turns so:
--   • Assessors can pick a conversation back up across sessions
--   • Audit log + Sentry + Anthropic-reply debugging have full context
--   • Token-cost analysis can attribute spend to specific conversations
--
-- Messages store PII-scrubbed content (the persisted copy passes through
-- scrubPii() from lib/sentry.ts before INSERT). The in-flight copy sent
-- to Anthropic is raw — assessors expect facility names back in answers,
-- so scrubbing in-flight would break the UX. The privacy policy update
-- (separate workstream) discloses this trade-off.

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

-- ─── Row-level security ─────────────────────────────────────────────
ALTER TABLE public.field_assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_assistant_messages      ENABLE ROW LEVEL SECURITY;

CREATE POLICY fa_conversations_owner_select
  ON public.field_assistant_conversations
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY fa_messages_owner_select
  ON public.field_assistant_messages
  FOR SELECT
  USING (user_id = auth.uid());

-- Inserts are service-role only (the /api/field-assistant handler).
-- No public INSERT policy is intentional.
