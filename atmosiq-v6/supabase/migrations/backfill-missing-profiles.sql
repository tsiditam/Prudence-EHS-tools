-- ─────────────────────────────────────────────────────────────────────────
-- Backfill: profile rows for any auth.users missing one
-- ─────────────────────────────────────────────────────────────────────────
-- The /api/field-assistant handler (and several other endpoints) insert
-- into tables that reference public.profiles(id) as a foreign key. Some
-- auth.users rows in production were never given a matching profiles
-- row at signup time, so every insert by those users hits a FK
-- constraint violation and returns 500.
--
-- This script backfills missing profile rows for ALL such users. Safe
-- to re-run: ON CONFLICT (id) DO NOTHING means existing profiles are
-- not touched.
--
-- The `name` column is NOT NULL on profiles. We derive a placeholder
-- from the user's auth metadata in this order of preference:
--   1. raw_user_meta_data->>'name'        (set by some OAuth providers)
--   2. raw_user_meta_data->>'full_name'   (set by Google OAuth)
--   3. local part of the email            (always present)
--
-- After running, every authenticated user has a profile row and the
-- FK insert in field-assistant-conversations succeeds. The user can
-- update their name later via the profile screen.

BEGIN;

INSERT INTO public.profiles (id, name)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'name', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    split_part(u.email, '@', 1)
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

COMMIT;


-- ─── Verification ────────────────────────────────────────────────────
-- Confirms every authenticated user now has a profile row. Should
-- return zero rows after the BEGIN/COMMIT above.

SELECT
  u.id,
  u.email,
  'MISSING PROFILE' AS status
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- And how many were just backfilled:
SELECT
  COUNT(*) AS total_users,
  COUNT(p.id) AS users_with_profile,
  COUNT(*) FILTER (WHERE p.id IS NULL) AS users_missing_profile
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;
