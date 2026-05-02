-- ─────────────────────────────────────────────────────────────────────────
-- 006 — Stripe Webhook Idempotency
-- ─────────────────────────────────────────────────────────────────────────
-- Stripe retries webhook delivery on non-2xx responses, on network failures,
-- and on its own internal retry policy. The same evt_xxx event can arrive
-- 2-5 times. Without idempotency tracking, a single $329 Pro checkout could
-- grant 200, 400, 600, 800, or 1000 credits depending on retry count.
--
-- This migration adds a processed-event ledger and an atomic claim function.
-- The webhook handler calls claim_stripe_event() BEFORE running business
-- logic. If the row insert succeeds, the handler owns processing for this
-- event_id; if it raises unique_violation, another retry already has it
-- and the handler returns 200 OK with status="already_processed".

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result       JSONB
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
  ON public.stripe_webhook_events (processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type
  ON public.stripe_webhook_events (event_type);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service-role-only writes; nobody else needs to read or write this.
-- Admins can SELECT for ops debugging, mediated by app code (no policy
-- below means default-deny for non-service roles).

-- ─── Atomic claim function ───
-- Returns TRUE if this caller successfully claimed the event_id (i.e.
-- inserted the row), FALSE if another caller already owns it. The
-- INSERT either succeeds atomically or raises unique_violation; we
-- swallow the violation and return FALSE. This is the FedRAMP-clean
-- equivalent of SELECT-then-INSERT but without the race window.

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_event_id   TEXT,
  p_event_type TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.stripe_webhook_events (event_id, event_type, result)
  VALUES (p_event_id, p_event_type, '{"status":"claimed"}'::jsonb);
  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    RETURN FALSE;
END;
$$;

-- Only the service role should be calling this from the webhook handler.
REVOKE EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT) TO service_role;
