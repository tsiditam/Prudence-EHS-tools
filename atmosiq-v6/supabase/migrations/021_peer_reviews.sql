-- 021_peer_reviews.sql
--
-- Peer review requests + responses. Backs the "Send for peer review"
-- flow on the results screen (habit-loop PR 4).
--
-- IH peer review is already a professional norm — this table makes
-- it a first-class artifact: the assessor sends a finalized report
-- to a colleague for sign-off / comment, the colleague responds via
-- a token-gated public link, and AtmosFlow notifies the assessor.
--
-- One row per send. status transitions:
--   pending → (approved | changes_requested | commented)
-- Tokens are random UUIDs validated by /api/peer-review-respond.
-- Once reviewed_at is set OR expires_at is passed, the token is
-- inert.
--
-- Recipients are NOT required to be AtmosFlow users — that's the
-- whole point of the loop. No FK on reviewer_*; they're free-form.

CREATE TABLE IF NOT EXISTS public.peer_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessor_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Stable id of the assessor's finalized report (rpt-... in the
  -- localStorage model). Stored as text since reports aren't a
  -- canonical cloud entity yet.
  report_id       TEXT NOT NULL,
  -- Snapshotted at send-time so the email + response page can
  -- show context without re-querying.
  facility_name   TEXT,
  -- Reviewer contact.
  reviewer_name   TEXT NOT NULL,
  reviewer_email  TEXT NOT NULL,
  -- Assessor's short note to the reviewer (capped at 2000 chars by
  -- the API). Optional.
  message         TEXT,
  -- Magic-link token. Random UUID; the API treats it as an opaque
  -- secret. Never log it.
  token           UUID NOT NULL DEFAULT gen_random_uuid(),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','changes_requested','commented','canceled')),
  reviewer_notes  TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token lookups are the hot path for /api/peer-review-respond.
CREATE UNIQUE INDEX IF NOT EXISTS peer_reviews_token_idx
  ON public.peer_reviews (token);

-- Per-assessor history view.
CREATE INDEX IF NOT EXISTS peer_reviews_assessor_idx
  ON public.peer_reviews (assessor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.peer_reviews_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS peer_reviews_updated_at ON public.peer_reviews;
CREATE TRIGGER peer_reviews_updated_at
  BEFORE UPDATE ON public.peer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.peer_reviews_set_updated_at();

-- RLS: owner-only for the assessor surface. The respond endpoint
-- runs under the service role and bypasses RLS to honor token-only
-- access from un-authenticated reviewers.
ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS peer_reviews_owner_select ON public.peer_reviews;
CREATE POLICY peer_reviews_owner_select
  ON public.peer_reviews FOR SELECT
  USING (assessor_id = auth.uid());

DROP POLICY IF EXISTS peer_reviews_owner_insert ON public.peer_reviews;
CREATE POLICY peer_reviews_owner_insert
  ON public.peer_reviews FOR INSERT
  WITH CHECK (assessor_id = auth.uid());

DROP POLICY IF EXISTS peer_reviews_owner_update ON public.peer_reviews;
CREATE POLICY peer_reviews_owner_update
  ON public.peer_reviews FOR UPDATE
  USING (assessor_id = auth.uid());

-- No DELETE policy — peer reviews are a defensibility audit trail.
-- Use status='canceled' via UPDATE if the assessor wants to retract.
