-- 029_investigation_framework.sql
--
-- AtmosFlow 3.0 — data model for the Investigation Decision Framework.
--
-- ADDITIVE and REVERSIBLE. This migration adds three nullable columns to
-- public.assessments so that engine >= 3.0 assessments can persist their
-- evidence-based result. It DESTROYS NO DATA and changes no legacy behaviour:
--   * The legacy score columns (score, risk, composite, zone_scores) are
--     ALREADY nullable and are left exactly as-is. A v3 assessment simply
--     leaves them null and populates `investigation` instead — score fields
--     become version-scoped, not removed.
--   * Historical (< 3.0) rows are untouched: engine_version stays NULL, which
--     the app treats as legacy (isLegacyEngine(null) === true), so they keep
--     rendering with the legacy engine and their original scores.
--
-- New columns
--   engine_version     text   — the frozen engine version for the assessment.
--                               NULL = legacy (pre-3.0). Immutable once set to a
--                               non-null value (trigger below) so an issued
--                               assessment can never be silently reinterpreted.
--   standards_manifest jsonb  — the frozen bibliography snapshot applied at
--                               scoring time (audit traceability). Already
--                               survives inside `payload`; promoted to a column
--                               so it is queryable and explicit per row.
--   investigation      jsonb  — the serialized BuildingInvestigation for
--                               engine >= 3.0 (findings, hypotheses, next
--                               actions, escalations, assessment summary). See
--                               lib/investigation/persistence.ts for the shape.
--
-- Rollback (safe): the three columns are additive and nullable, so dropping
-- them loses only v3-specific data (which does not exist until the framework
-- flag is lifted). Legacy columns and rows are unaffected.
--   drop trigger if exists assessments_engine_version_immutable on public.assessments;
--   drop function if exists public.assessments_engine_version_immutable();
--   drop index  if exists public.assessments_engine_version_idx;
--   alter table public.assessments
--     drop column if exists investigation,
--     drop column if exists standards_manifest,
--     drop column if exists engine_version;

alter table public.assessments
  add column if not exists engine_version     text,
  add column if not exists standards_manifest jsonb,
  add column if not exists investigation      jsonb;

-- Index to support version-routed queries and Stage-9 analytics
-- (findings-by-domain / status distributions per engine version).
create index if not exists assessments_engine_version_idx
  on public.assessments (engine_version);

-- Engine version is immutable once issued. The trigger permits the FIRST set
-- (null -> value) and idempotent re-saves (value -> same value), but blocks
-- changing a non-null engine_version to a DIFFERENT value — so a stored
-- assessment can never be re-stamped onto another engine and reinterpreted.
-- search_path pinned to '' per the Supabase security linter (0011).
create or replace function public.assessments_engine_version_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.engine_version is not null
     and new.engine_version is distinct from old.engine_version then
    raise exception
      'assessments.engine_version is immutable once set (was %, attempted %)',
      old.engine_version, new.engine_version;
  end if;
  return new;
end;
$$;

drop trigger if exists assessments_engine_version_immutable on public.assessments;
create trigger assessments_engine_version_immutable
  before update on public.assessments
  for each row execute function public.assessments_engine_version_immutable();
