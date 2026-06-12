-- 023_knowledge_graph.sql
--
-- Causal-pathway -> knowledge-graph upgrade (foundation).
--
-- The graph is a DERIVED, DISPOSABLE PROJECTION of deterministic engine
-- outputs. Only the builder writes it, server-side, and it can be rebuilt at
-- any time from (assessment data + engine results). See the KG spec.
--
-- Anchor: the spec is written around a `projects` table, but projects in this
-- app are localStorage-only. The server-side, RLS-owned entity that already
-- persists the engine outputs (causal_chains, recommendations, zone_scores) is
-- `assessments` (migration 014, keyed by user_id, id is TEXT). The graph is
-- therefore scoped by `assessment_id TEXT` and isolated per tenant through the
-- assessment's owner.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.kg_nodes (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   text not null references public.assessments (id) on delete cascade,
  node_type       text not null,
  label           text not null,
  entity_key      text,
  source          text not null default 'deterministic_engine',
  confidence      text not null default 'provisional'
                    check (confidence in ('validated', 'provisional', 'qualitative')),
  engine_version  text,
  ruleset_version text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- A numeric confidence column is intentionally omitted. Confidence is
-- categorical and matches the node scale; there is no fabricated 0.5.
create table if not exists public.kg_edges (
  id                uuid primary key default gen_random_uuid(),
  assessment_id     text not null references public.assessments (id) on delete cascade,
  source_node_id    uuid not null references public.kg_nodes (id) on delete cascade,
  relationship_type text not null,
  target_node_id    uuid not null references public.kg_nodes (id) on delete cascade,
  confidence        text not null default 'provisional'
                      check (confidence in ('validated', 'provisional', 'qualitative')),
  source            text not null default 'deterministic_engine',
  engine_version    text,
  ruleset_version   text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists idx_kg_nodes_assessment_id on public.kg_nodes (assessment_id);
create index if not exists idx_kg_nodes_type          on public.kg_nodes (node_type);
create index if not exists idx_kg_nodes_entity_key    on public.kg_nodes (entity_key);
create index if not exists idx_kg_edges_assessment_id on public.kg_edges (assessment_id);
create index if not exists idx_kg_edges_source_node   on public.kg_edges (source_node_id);
create index if not exists idx_kg_edges_target_node   on public.kg_edges (target_node_id);
create index if not exists idx_kg_edges_relationship  on public.kg_edges (relationship_type);

-- ── Uniqueness constraints (database-level backstop for idempotent rebuilds) ─

create unique index if not exists idx_kg_nodes_assessment_entity_unique
  on public.kg_nodes (assessment_id, entity_key)
  where entity_key is not null;

create unique index if not exists idx_kg_edges_unique
  on public.kg_edges (assessment_id, source_node_id, relationship_type, target_node_id);

-- ── updated_at trigger ──────────────────────────────────────────────────────

create or replace function public.set_kg_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kg_nodes_set_updated_at on public.kg_nodes;
create trigger kg_nodes_set_updated_at
  before update on public.kg_nodes
  for each row execute function public.set_kg_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
--
-- Read-only for the owning tenant; the owner is the assessment's user_id. No
-- client INSERT/UPDATE/DELETE policy exists, so the only thing that can mutate
-- the graph is the server-side builder running under the service role (which
-- bypasses RLS). This enforces "the builder is the only writer" at the
-- infrastructure layer (spec invariant 2.1/2.2).

alter table public.kg_nodes enable row level security;
alter table public.kg_edges enable row level security;

drop policy if exists kg_nodes_read on public.kg_nodes;
create policy kg_nodes_read on public.kg_nodes
  for select
  using (
    assessment_id in (select id from public.assessments where user_id = auth.uid())
  );

drop policy if exists kg_edges_read on public.kg_edges;
create policy kg_edges_read on public.kg_edges
  for select
  using (
    assessment_id in (select id from public.assessments where user_id = auth.uid())
  );

-- ── Transactional, advisory-locked rebuild ──────────────────────────────────
--
-- One transaction: take a per-assessment advisory lock, delete the existing
-- graph, then insert the rebuilt nodes and edges. Because it is one
-- transaction, no reader ever observes a half-built or empty graph, and
-- concurrent rebuilds serialize on the lock instead of racing. Edges are
-- supplied by entity_key and resolved to the freshly-minted node UUIDs here.
--
-- SECURITY DEFINER + the GRANT below restrict execution to the service role,
-- reinforcing "only the builder writes".

create or replace function public.kg_rebuild(
  p_assessment_id text,
  p_nodes jsonb,
  p_edges jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_assessment_id));

  delete from public.kg_edges where assessment_id = p_assessment_id;
  delete from public.kg_nodes where assessment_id = p_assessment_id;

  with ins_nodes as (
    insert into public.kg_nodes
      (assessment_id, node_type, label, entity_key, source, confidence,
       engine_version, ruleset_version, metadata)
    select
      p_assessment_id, n.node_type, n.label, n.entity_key,
      coalesce(n.source, 'deterministic_engine'),
      coalesce(n.confidence, 'provisional'),
      n.engine_version, n.ruleset_version,
      coalesce(n.metadata, '{}'::jsonb)
    from jsonb_to_recordset(p_nodes) as n(
      node_type text, label text, entity_key text, source text,
      confidence text, engine_version text, ruleset_version text, metadata jsonb
    )
    returning id, entity_key
  )
  insert into public.kg_edges
    (assessment_id, source_node_id, relationship_type, target_node_id,
     confidence, source, engine_version, ruleset_version, metadata)
  select
    p_assessment_id, s.id, e.relationship_type, t.id,
    coalesce(e.confidence, 'provisional'),
    coalesce(e.source, 'deterministic_engine'),
    e.engine_version, e.ruleset_version,
    coalesce(e.metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_edges) as e(
    source_entity_key text, relationship_type text, target_entity_key text,
    confidence text, source text, engine_version text, ruleset_version text, metadata jsonb
  )
  join ins_nodes s on s.entity_key = e.source_entity_key
  join ins_nodes t on t.entity_key = e.target_entity_key
  on conflict do nothing;
end;
$$;

revoke all on function public.kg_rebuild(text, jsonb, jsonb) from public;
revoke all on function public.kg_rebuild(text, jsonb, jsonb) from anon, authenticated;
grant execute on function public.kg_rebuild(text, jsonb, jsonb) to service_role;

-- ── Finding-evidence traversal (recursive CTE) ──────────────────────────────
--
-- Walk upstream from a finding (the nodes that point at it) up to p_max_depth,
-- avoiding N+1 queries against the flat adjacency schema. SECURITY INVOKER so
-- the caller's RLS still applies (a user only ever traverses their own graph).

create or replace function public.kg_finding_evidence(
  p_node_id uuid,
  p_max_depth int default 3
) returns setof public.kg_nodes
language sql
stable
as $$
  with recursive evidence as (
    select n.id, 0 as depth
    from public.kg_nodes n
    where n.id = p_node_id
    union
    select child.id, e.depth + 1
    from evidence e
    join public.kg_edges edge on edge.target_node_id = e.id
    join public.kg_nodes child on child.id = edge.source_node_id
    where e.depth < p_max_depth
  )
  select n.* from public.kg_nodes n
  join evidence ev on ev.id = n.id;
$$;
