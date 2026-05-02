-- ─────────────────────────────────────────────────────────────────────────
-- 011 — Email queue + scheduled sequence delivery
-- ─────────────────────────────────────────────────────────────────────────
-- Stores scheduled outbound emails (welcome, sample-report, activation,
-- success congrats, paid-onboarding tips, feedback request). Rows are
-- enqueued by lib/email-triggers.ts on signup / assessment completion
-- and drained every 15 minutes by /api/cron-email-queue-processor.ts.
--
-- Idempotency: scheduled_for + sent_at + canceled_at form the state
-- machine. The cron processes rows where sent_at IS NULL AND
-- canceled_at IS NULL AND scheduled_for <= NOW(). On Resend success,
-- sent_at is filled. If an event_listener cancels the row before send
-- (e.g. assessment_completed cancels the activation prompt), the row
-- is marked with canceled_at and a cancel_reason; the cron will not
-- pick it up again.
--
-- The partial index keeps the cron query cheap as the table grows.

CREATE TABLE IF NOT EXISTS public.email_queue (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_id        TEXT NOT NULL,
  scheduled_for      TIMESTAMPTZ NOT NULL,
  sent_at            TIMESTAMPTZ,
  canceled_at        TIMESTAMPTZ,
  cancel_reason      TEXT,
  resend_message_id  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled
  ON public.email_queue (scheduled_for)
  WHERE sent_at IS NULL AND canceled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_queue_user_template
  ON public.email_queue (user_id, template_id);

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

-- Service role (cron + triggers) is the only writer. No SELECT for
-- regular users — they never need to introspect their own queue.
