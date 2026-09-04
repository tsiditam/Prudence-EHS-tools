/**
 * Migration 033 — security hardening 2.
 *
 * The SQL runs against real Postgres in CI. Pinned here are the statements
 * whose absence would be discovered only after the migration had run:
 *
 *   • the two credit RPCs exist, are SECURITY DEFINER with a pinned
 *     search_path, and are NOT executable by anon / authenticated
 *   • the profiles write privileges are re-granted column-by-column, with
 *     the entitlement columns excluded, and the update policy is re-owned
 *   • the narrative_generations CHECK covers every live generation_type
 *   • schema_migrations gets RLS, the org policies stop recursing, the
 *     analytics insert policy requires the caller's own user_id, the ledger
 *     insert policy is dropped, the invited_by FK gets ON DELETE SET NULL,
 *     and the L4 indexes are created
 *   • every DDL is guarded so a re-run is safe
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const FILE = path.resolve('supabase/migrations/033_security_hardening_2.sql')
const sql = existsSync(FILE) ? readFileSync(FILE, 'utf8') : ''
/** Comment-free SQL, so prose in the header never satisfies an assertion. */
const code = sql.replace(/^\s*--.*$/gm, '')

const GENERATION_TYPES = ['narrative', 'field_assistant', 'inline_ai', 'inline_complete', 'pre_review_semantic', 'photo_analysis']

describe('migration 033 exists', () => {
  it('is present and does not reuse an earlier number', () => {
    expect(sql.length).toBeGreaterThan(0)
    expect(existsSync(path.resolve('supabase/migrations/032_security_hardening_2.sql'))).toBe(false)
  })
})

describe('atomic credit RPCs', () => {
  for (const fn of ['consume_credits', 'grant_credits']) {
    it(`${fn}: SECURITY DEFINER, pinned search_path, EXECUTE revoked from anon/authenticated`, () => {
      const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`)
      expect(start).toBeGreaterThan(-1)
      const body = code.slice(start, code.indexOf('$$;', start))
      expect(body).toMatch(/SECURITY DEFINER/)
      expect(body).toMatch(/SET search_path = ''/)
      expect(body).toMatch(/INSERT INTO public\.credits_ledger/)
      expect(code).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(uuid, integer, text, text\\) FROM PUBLIC, anon, authenticated`))
    })
  }

  it('consume_credits debits and checks the balance in ONE statement and raises on insufficient', () => {
    const start = code.indexOf('CREATE OR REPLACE FUNCTION public.consume_credits(')
    const body = code.slice(start, code.indexOf('$$;', start))
    expect(body).toMatch(/UPDATE public\.profiles\s+SET credits_remaining = credits_remaining - p_amount\s+WHERE id = p_user_id\s+AND credits_remaining >= p_amount\s+RETURNING credits_remaining/)
    expect(body).toMatch(/RAISE EXCEPTION 'insufficient_credits'/)
    expect(body).toMatch(/RAISE EXCEPTION 'invalid_amount'/)
  })

  it('grant_credits locks the row and floors the balance at zero', () => {
    const start = code.indexOf('CREATE OR REPLACE FUNCTION public.grant_credits(')
    const body = code.slice(start, code.indexOf('$$;', start))
    expect(body).toMatch(/FOR UPDATE/)
    expect(body).toMatch(/GREATEST\(0,/)
  })
})

describe('profiles column-level write privileges', () => {
  it('revokes the entitlement columns and re-grants the rest by column', () => {
    for (const col of ['plan', 'credits_remaining', 'monthly_credit_limit', 'stripe_customer_id', 'subscription_status', 'billing_period', 'annual_renewal_at', 'account_status', 'kg_beta', 'org_id']) {
      expect(code, `sensitive list should name ${col}`).toMatch(new RegExp(`'${col}'`))
    }
    expect(code).toMatch(/REVOKE UPDATE \(%s\) ON public\.profiles FROM authenticated, anon/)
    expect(code).toMatch(/REVOKE INSERT \(%s\) ON public\.profiles FROM authenticated, anon/)
    expect(code).toMatch(/REVOKE INSERT, UPDATE ON public\.profiles FROM authenticated, anon/)
    expect(code).toMatch(/GRANT INSERT \(%s\) ON public\.profiles TO authenticated/)
    expect(code).toMatch(/GRANT UPDATE \(%s\) ON public\.profiles TO authenticated/)
    // The allow-list is computed from information_schema, not hand-typed.
    expect(code).toMatch(/NOT \(column_name = ANY \(sensitive\)\)/)
  })

  it('sets defaults so the signup insert can drop plan / credits_remaining', () => {
    expect(code).toMatch(/ALTER COLUMN plan SET DEFAULT 'free'/)
    expect(code).toMatch(/ALTER COLUMN credits_remaining SET DEFAULT 1/)
    expect(code).toMatch(/ALTER COLUMN subscription_status SET DEFAULT 'free'/)
    expect(code).toMatch(/ALTER COLUMN billing_period SET DEFAULT 'monthly'/)
  })

  it('re-owns the update policy that 000_base_schema re-asserts, with WITH CHECK', () => {
    expect(code).toMatch(/DROP POLICY IF EXISTS "Users can update own profile" ON public\.profiles/)
    expect(code).toMatch(/CREATE POLICY "Users can update own profile"\s+ON public\.profiles FOR UPDATE\s+USING \(auth\.uid\(\) = id\)\s+WITH CHECK \(auth\.uid\(\) = id\)/)
  })
})

describe('narrative_generations_type_check', () => {
  it('drops and re-adds the constraint with every live generation_type', () => {
    expect(code).toMatch(/DROP CONSTRAINT narrative_generations_type_check/)
    const start = code.indexOf('ADD CONSTRAINT narrative_generations_type_check')
    const block = code.slice(start, code.indexOf('));', start))
    for (const t of GENERATION_TYPES) expect(block, t).toContain(`'${t}'`)
  })

  it('matches the generation_type each handler writes', () => {
    const handlers: Record<string, string> = {
      'api/narrative.js': 'narrative',
      'api/field-assistant.ts': 'field_assistant',
      'api/inline-ai.js': 'inline_ai',
      'api/inline-complete.js': 'inline_complete',
      'api/pre-review-semantic.js': 'pre_review_semantic',
      'api/photo-analyze.js': 'photo_analysis',
    }
    for (const [file, type] of Object.entries(handlers)) {
      const src = readFileSync(path.resolve(file), 'utf8')
      expect(src, file).toMatch(new RegExp(`GENERATION_TYPE = '${type}'`))
    }
  })
})

describe('the rest of the hardening', () => {
  it('schema_migrations: RLS on + revoke, guarded on existence', () => {
    expect(code).toMatch(/IF to_regclass\('public\.schema_migrations'\) IS NOT NULL THEN\s+ALTER TABLE public\.schema_migrations ENABLE ROW LEVEL SECURITY;\s+REVOKE ALL ON public\.schema_migrations FROM anon, authenticated;/)
  })

  it('org policies go through SECURITY DEFINER helpers instead of self-referencing org_members', () => {
    for (const fn of ['is_org_admin', 'is_org_member']) {
      const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(p_org uuid)`)
      expect(start).toBeGreaterThan(-1)
      const body = code.slice(start, code.indexOf('$$;', start))
      expect(body).toMatch(/SECURITY DEFINER/)
      expect(body).toMatch(/SET search_path = ''/)
    }
    expect(code).toMatch(/DROP POLICY IF EXISTS "Org admins can manage members" ON public\.org_members/)
    expect(code).toMatch(/USING \(public\.is_org_admin\(org_id\)\)/)
    expect(code).toMatch(/DROP POLICY IF EXISTS "Members can read own org" ON public\.organizations/)
    expect(code).toMatch(/USING \(public\.is_org_member\(id\)\)/)
    expect(code).toMatch(/DROP POLICY IF EXISTS "Org admins can manage invitations" ON public\.invitations/)
    // No policy body may query org_members directly any more.
    const policies = code.slice(code.indexOf('CREATE POLICY "Org admins can manage members"'))
    expect(policies).not.toMatch(/select 1 from public\.org_members/i)
  })

  it('analytics_events inserts require the caller\'s own user_id', () => {
    expect(code).toMatch(/DROP POLICY IF EXISTS "Users can insert analytics events" ON public\.analytics_events/)
    expect(code).toMatch(/FOR INSERT\s+WITH CHECK \(auth\.uid\(\) = user_id\)/)
    expect(code).not.toMatch(/user_id is null/i)
  })

  it('drops the user INSERT policy on credits_ledger', () => {
    expect(code).toMatch(/DROP POLICY IF EXISTS "Users can insert own credit events" ON public\.credits_ledger/)
  })

  it('re-adds invitations.invited_by with ON DELETE SET NULL, finding the old FK by column', () => {
    expect(code).toMatch(/a\.attname = 'invited_by'/)
    expect(code).toMatch(/ADD CONSTRAINT invitations_invited_by_fkey\s+FOREIGN KEY \(invited_by\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/)
  })

  it('creates the L4 indexes, guarded on table + column existence', () => {
    const wanted: Array<[string, string]> = [
      ['profiles', 'stripe_customer_id'], ['analytics_events', 'user_id'], ['field_assistant_documents', 'user_id'],
      ['peer_reviews', 'report_id'], ['invitations', 'org_id'], ['invoices', 'org_id'], ['invoices', 'user_id'],
      ['contract_acceptances', 'org_id'], ['credits_ledger', 'reference_id'],
    ]
    for (const [tbl, col] of wanted) {
      expect(code, `${tbl}(${col})`).toMatch(new RegExp(`\\('${tbl}',\\s+'${col}',`))
    }
    expect(code).toMatch(/CREATE INDEX IF NOT EXISTS %I ON public\.%I \(%I\)/)
    expect(code).toMatch(/to_regclass\('public\.' \|\| spec\.tbl\) IS NOT NULL/)
  })
})

describe('idempotency', () => {
  it('uses only guarded DDL (no bare CREATE TABLE / ADD COLUMN / CREATE POLICY)', () => {
    expect(code).not.toMatch(/CREATE TABLE/i)
    expect(code).not.toMatch(/ADD COLUMN/i)
    expect(code).toMatch(/DO \$\$/)
    // Every CREATE POLICY is preceded by a DROP POLICY IF EXISTS of the same name.
    const created = [...code.matchAll(/CREATE POLICY "([^"]+)"/g)].map((m) => m[1])
    expect(created.length).toBeGreaterThan(0)
    for (const name of created) {
      expect(code, name).toMatch(new RegExp(`DROP POLICY IF EXISTS "${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
    }
    // Functions are CREATE OR REPLACE, indexes IF NOT EXISTS.
    expect(code.match(/CREATE FUNCTION/g)).toBeNull()
    expect(code.match(/CREATE INDEX (?!IF NOT EXISTS)/g)).toBeNull()
  })
})
