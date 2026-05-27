-- 014_assessments_payload.sql
--
-- Full-fidelity assessment restore.
--
-- saveAssessment() flattens a report into snake_case columns (zone_scores,
-- composite, recommendations, sampling_plan, causal_chains, osha_evals) on the
-- way up to the cloud. Several fields have no column — equipment, floor_plan,
-- sensor_data, lab_results, standards_manifest, ver — so they were silently
-- dropped on a cloud round-trip: a report restored after a reinstall opened
-- and rendered, but lost those extras.
--
-- Add a single nullable JSONB column that holds the full app-shape report
-- (minus photos, which keep their own column and compaction lifecycle).
-- fromCloudRow() prefers this payload on the way down, making a cloud restore
-- byte-identical to the original. Legacy rows with a NULL payload still
-- restore via the flattened columns.
--
-- Additive + idempotent + non-destructive: safe to run on the live table with
-- no downtime. Existing rows keep payload = NULL until next saved.

alter table if exists public.assessments
  add column if not exists payload jsonb;
