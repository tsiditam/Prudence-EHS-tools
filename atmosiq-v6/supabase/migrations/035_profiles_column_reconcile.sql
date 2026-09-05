-- 035 — Reconcile a drifted public.profiles with the base schema
--
-- Production's profiles table is missing `certs`. PostgREST said so, out
-- loud, in a field screenshot:
--
--   PGRST204 Could not find the 'certs' column of 'profiles' in the
--   schema cache
--
-- `certs text[] default '{}'` has been in supabase/schema.sql for the
-- life of the table, and toProfileRow has always written it, so every
-- profile save has been failing against production for a long time. It
-- was invisible because the sync queue discarded failed items (audit
-- finding C2) — fixing that, and then surfacing the reason on the
-- indicator, is what finally produced the sentence above.
--
-- Why 000 does not fix it: `create table if not exists` no-ops the whole
-- statement when the table exists, so the base migration can create the
-- table on a fresh database but cannot repair one that drifted. Its own
-- header claims "on production, where all of this already exists, every
-- statement is a no-op", and that assumption is exactly what was wrong.
-- A table can exist and still be missing a column.
--
-- So this migration states each base column separately, which is the
-- form that can actually converge an existing table. Every statement is
-- ADD COLUMN IF NOT EXISTS: a no-op where the column is present, the
-- repair where it is not, and safe to re-run either way. No column is
-- dropped, no type is changed, no data is touched.
--
-- `id` is absent from the list on purpose: it is the primary key, so a
-- table missing it is not this table and must not be patched into one.

alter table public.profiles add column if not exists name               text;
alter table public.profiles add column if not exists certs              text[] default '{}';
alter table public.profiles add column if not exists experience         text;
alter table public.profiles add column if not exists iaq_meter          text;
alter table public.profiles add column if not exists iaq_serial         text;
alter table public.profiles add column if not exists iaq_cal_date       date;
alter table public.profiles add column if not exists iaq_cal_status     text;
alter table public.profiles add column if not exists pid_meter          text;
alter table public.profiles add column if not exists pid_cal_status     text;
alter table public.profiles add column if not exists other_instruments  text;
alter table public.profiles add column if not exists firm               text;
alter table public.profiles add column if not exists marketing_consent  boolean default false;
alter table public.profiles add column if not exists created_at         timestamptz default now();
alter table public.profiles add column if not exists updated_at         timestamptz default now();

-- `name` is NOT NULL in the base definition. It is added above without
-- that constraint because an ADD COLUMN NOT NULL against a table with
-- existing rows fails, and this migration must not fail on a database
-- that is merely behind. Where the column was already there its
-- constraint is untouched; where it had to be added, the rows that
-- predate it would each need a value before NOT NULL could be restored,
-- and inventing one is not this migration's call.
