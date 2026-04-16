-- Early Access Signups
create table if not exists early_access_signups (
  id text primary key,
  name text not null,
  email text not null,
  company text not null,
  title text not null,
  volume text,
  painpoint text,
  source text,
  submitted_at timestamptz default now(),
  ip text
);

-- Allow service role insert
alter table early_access_signups enable row level security;
create policy "Service role can manage signups"
  on early_access_signups for all
  using (auth.role() = 'service_role');
