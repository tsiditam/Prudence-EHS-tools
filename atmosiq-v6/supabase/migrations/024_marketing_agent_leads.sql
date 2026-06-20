-- Marketing conversion agent leads (landing-page chat widget)
create table if not exists marketing_agent_leads (
  id text primary key,
  session_id text,
  name text,
  email text,
  company text,
  role text,
  use_case text,
  -- qualification answers
  reports_method text,
  uses_logger_data text,
  biggest_pain text,
  wants_beta text,
  intent_score int,
  transcript jsonb,
  source text,
  user_agent text,
  ip text,
  created_at timestamptz default now()
);

create index if not exists idx_marketing_agent_leads_created on marketing_agent_leads (created_at desc);
create index if not exists idx_marketing_agent_leads_email on marketing_agent_leads (email);
create index if not exists idx_marketing_agent_leads_intent on marketing_agent_leads (intent_score desc);

-- Service-role only (writes happen from the serverless endpoint with the
-- service key; no public/anon access to lead PII).
alter table marketing_agent_leads enable row level security;
create policy "Service role can manage marketing agent leads"
  on marketing_agent_leads for all
  using (auth.role() = 'service_role');
