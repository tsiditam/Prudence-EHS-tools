-- ─────────────────────────────────────────────────────────────────────
-- 031 — Attached documents for the field assistant (Jasper)
--
-- An attached report used to be readable for exactly one turn. The digest
-- rode inline in the user message, and `chatAttachments.js` said so
-- plainly: "readable now but is NOT retrievable on a later turn". So a
-- consultant's 41-page assessment could be asked one question and then was
-- gone — you could not follow up, compare two sections, or come back to it.
--
-- The fix is not a bigger inline digest. A digest is concatenated into the
-- user message, which is replayed as history for up to 20 turns, so making
-- it big means re-sending it twenty times for one upload. Storing the
-- extracted text once and fetching a window of it on the turn it is needed
-- costs a row and one tool call.
--
-- Still no FILE is uploaded. The browser parses the document and only its
-- extracted TEXT is stored — the same boundary chatAttachments.js already
-- draws, and the reason no parser goes near the serverless hot path. This
-- is not a new data category either: the 16k inline digest is already
-- persisted verbatim inside field_assistant_messages.content.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.field_assistant_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.field_assistant_conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('pdf', 'docx', 'text')),
  -- Pages in the document, and pages the extractor actually reached. They
  -- differ when the character ceiling bites first, and the difference is
  -- what the model must disclose rather than imply it read the whole file.
  pages           INTEGER,
  pages_read      INTEGER,
  chars           INTEGER NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The read path is always "the documents in THIS conversation, newest
-- first" — the tool resolves a name or an ordinal against that list.
CREATE INDEX IF NOT EXISTS idx_fa_documents_conv_time
  ON public.field_assistant_documents (conversation_id, created_at DESC);

ALTER TABLE public.field_assistant_documents ENABLE ROW LEVEL SECURITY;

-- Owner-only read, and no INSERT policy: writes go through the
-- /api/field-assistant handler on the service role. Same shape as
-- field_assistant_messages in migration 013, deliberately — a document is
-- the same kind of thing as a message and gets the same guarantees.
CREATE POLICY fa_documents_owner_select
  ON public.field_assistant_documents
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY fa_documents_owner_delete
  ON public.field_assistant_documents
  FOR DELETE
  USING (user_id = auth.uid());
