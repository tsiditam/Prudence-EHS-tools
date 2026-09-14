-- 038_forensic_interpretation_generation_type.sql
--
-- Adds 'forensic_interpretation' to the narrative_generations
-- generation_type CHECK.
--
-- /api/forensic-interpret (Jasper's reading of a Logger Studio monitoring
-- session) reserves its rate-limit ledger row with generation_type =
-- 'forensic_interpretation', its own budget like every other surface, so a
-- burst of interpretation never eats the narrative or report-section budget
-- and vice versa.
--
-- Written in the same commit as the handler, deliberately. This constraint
-- has now caused one silent failure (audit 2.5 — three endpoints ran with no
-- working rate limit because the ledger insert landed nothing) and one hard
-- outage (/api/report-sections shipped before 037 and every generation
-- returned 500 before reaching the model, with the credits already spent).
-- tests/api/generation-type-constraint.test.ts discovers handlers rather than
-- listing them, so a new handler fails that test until its migration exists;
-- this is that migration.
--
-- Same guarded drop-and-re-add as 033 and 037, so a re-run is safe and the
-- full list is stated in one place.

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
      'report_sections',
      'forensic_interpretation'
    ));
END $$;
