-- 028_calibration_acknowledgement.sql
--
-- Record the assessor's decision to finalize past the instrument
-- calibration interrupt.
--
-- `MobileApp.finishAssessment` has always interrupted finalization when
-- instrument metadata is missing or calibration is older than
-- CAL_VALIDITY_DAYS (365). The assessor could then proceed in one click
-- and NOTHING was written down — not what was flagged, not who dismissed
-- it, not why.
--
-- That is the weakest possible form of a control CLAUDE.md calls a
-- litigation defense: an interrupt nobody records is indistinguishable,
-- after the fact, from an interrupt that never fired.
--
-- ── What this is NOT ─────────────────────────────────────────────────
--
-- Not the old IH score-override (deleted alongside this migration). That
-- mutated the engine's score so refusal triggers stopped firing. Since
-- engine v2.9 the engine no longer refuses — it issues with data-gap
-- warnings — so suppressing a trigger would DELETE a real disclosure
-- from the report rather than explain it.
--
-- The acknowledgement ADDS an audit artifact and removes nothing. An
-- acknowledged gap still fires the engine's data-gap trigger, still
-- appears under "Limitations on Reliance", and still prints its own
-- calibration-appendix row.
--
-- ── Shape ────────────────────────────────────────────────────────────
--
-- jsonb rather than columns because the record is a SNAPSHOT of a moment
-- — the items exactly as the assessor saw them, their reasoning, their
-- identity and the timestamp — and it must not be re-derived later. A
-- subsequent data edit must not rewrite the history of that decision.
-- See src/utils/calibrationAcknowledgement.js for the shape and version.
--
-- Additive only. No column dropped or retyped. Existing rows get NULL,
-- which reads correctly as "no exception was acknowledged" — the true
-- statement for every assessment finalized before this shipped. There is
-- deliberately NO backfill: inventing an acknowledgement nobody gave
-- would be exactly the fabrication this feature exists to prevent.

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS calibration_acknowledgement JSONB;

-- Finding acknowledged exceptions across a portfolio is a real review
-- question ("show me everything issued with an instrument exception"),
-- and a partial index keeps the working set to just those rows.
CREATE INDEX IF NOT EXISTS assessments_calibration_ack_idx
  ON public.assessments (user_id, updated_at DESC)
  WHERE calibration_acknowledgement IS NOT NULL;

COMMENT ON COLUMN public.assessments.calibration_acknowledgement IS
  'Snapshot of the assessor''s decision to finalize past the instrument-calibration interrupt: the items flagged, their stated basis, their identity, and the timestamp. NULL means no exception was acknowledged. Never backfilled.';
