-- 018_email_queue_payload.sql
--
-- Adds a `payload` JSONB column to public.email_queue (migration 011)
-- so per-row data (site name, due date) can flow into a template
-- render without compiling that data into the template body.
--
-- Why: the re-assessment reminder email (habit-loop PR 1) needs to
-- name a specific site ("Re-assessment due at Acme HQ on May 2027").
-- The existing render(ctx: UserContext) signature only has access to
-- user-level fields. Adding `payload` to the queue row and passing it
-- as a second arg to render() keeps templates stateless while letting
-- the trigger function thread per-instance data through.
--
-- Backward-compatible:
--   • Default value `'{}'::jsonb` means existing inserts that don't
--     specify a payload still work.
--   • All existing templates ignore the second arg; no test changes.

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- No new indexes — payload is read-only by the cron processor as it
-- selects rows, never used as a query predicate.
