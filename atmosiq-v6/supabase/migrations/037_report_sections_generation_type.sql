-- 037_report_sections_generation_type.sql
--
-- Adds 'report_sections' to the narrative_generations generation_type CHECK.
--
-- /api/report-sections (the AI-authored sections of the AtmosFlow DOCX)
-- reserves its rate-limit ledger row with generation_type =
-- 'report_sections', its own budget like every other surface. The CHECK
-- constraint 033 re-asserted enumerates the allowed types and did not include
-- it, so the reservation insert was refused, the handler failed CLOSED (a
-- limiter that cannot write its own ledger is not limiting anything —
-- api/_rate-limit.js) and every generation returned 500 before reaching the
-- model. The client showed nothing; the credits were already spent.
--
-- This is the failure class the audit found on three endpoints before (§2.5:
-- their generation_type violated the constraint and the insert silently landed
-- nothing). It recurred because nothing tied a NEW handler's type to the
-- constraint; tests/api/generation-type-constraint.test.ts now does, over
-- every handler under api/**, against whichever migration last defined the
-- constraint.
--
-- Same guarded drop-and-re-add as 033, so a re-run is safe and the full list
-- is stated in one place.

DO $$
BEGIN
  IF to_regclass('public.narrative_generations') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'narrative_generations_type_check'
       AND conrelid = 'public.narrative_generations'::regclass
  ) THEN
    ALTER TABLE public.narrative_generations DROP CONSTRAINT narrative_generations_type_check;
  END IF;
  ALTER TABLE public.narrative_generations
    ADD CONSTRAINT narrative_generations_type_check
    CHECK (generation_type IN (
      'narrative',
      'field_assistant',
      'inline_ai',
      'inline_complete',
      'pre_review_semantic',
      'photo_analysis',
      'report_sections'
    ));
END $$;
