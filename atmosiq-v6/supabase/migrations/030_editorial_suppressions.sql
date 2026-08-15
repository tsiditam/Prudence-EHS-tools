-- 030_editorial_suppressions.sql
--
-- Record the editorial cuts the reviewing professional approved for a
-- report.
--
-- The editorial-review pass (api/report-editorial-review) proposes
-- case-specific content to cut from the consultant deliverable — the
-- over-production the deterministic report rules cannot catch. The
-- reviewing professional approves each cut, and the approved set is
-- applied by the client renderer (src/utils/editorialSuppressions.js),
-- which omits the targeted content.
--
-- ── What this is NOT ─────────────────────────────────────────────────
--
-- Not AI-authored report content. No model text enters the client
-- report; the model only PROPOSES which existing, engine-authored content
-- to omit, and a human approves it. So there is no AI-provenance
-- obligation on the deliverable — this record just stores which content
-- the reviewer removed, and (optionally) who removed it and when.
--
-- Not an engine change. The engine model is untouched; suppressions
-- change only what the renderer emits. The engine remains the source of
-- truth for what COULD be said; the reviewing professional decides what
-- the report SHOWS.
--
-- ── Shape ────────────────────────────────────────────────────────────
--
-- jsonb: a versioned record of approved cut TARGETS (stable content
-- identifiers — finding id, zone id, results-subsection heading,
-- recommendation priority+action, section anchor) plus optional reviewer
-- identity/timestamp. See src/utils/editorialSuppressions.js for the shape
-- and version.
--
-- Additive only. Existing rows get NULL, which reads correctly as "no
-- editorial cuts were applied". No backfill.

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS editorial_suppressions JSONB;

-- "Show me every report that was editorially trimmed before issue" is a
-- real review question; a partial index keeps the working set to just
-- those rows.
CREATE INDEX IF NOT EXISTS assessments_editorial_suppressions_idx
  ON public.assessments (user_id, updated_at DESC)
  WHERE editorial_suppressions IS NOT NULL;

COMMENT ON COLUMN public.assessments.editorial_suppressions IS
  'Versioned record of the editorial cuts the reviewing professional approved for this report: the content targets omitted from the client deliverable, and optionally who approved them and when. NULL means no editorial cuts were applied. Never backfilled.';
