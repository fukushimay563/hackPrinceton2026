-- FirstFunds agents: private agent memory, shared (sanitized) knowledge, messaging
-- consent, webhook idempotency, outbox and audit trail.
-- Private tables: each user reads only their own rows. Writes from the Photon webhook
-- and agents happen server-side with the service role (which bypasses RLS) — never
-- from the browser.

create table if not exists public.agent_memory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('source-ref','correction','pattern','validation','approval','error')),
  payload_enc text not null,               -- AES-256-GCM, tenant id as AAD (see src/lib/agents/crypto.ts)
  created_at  timestamptz not null default now(),
  constraint agent_memory_size check (length(payload_enc) < 20000)
);
create index if not exists agent_memory_user_idx on public.agent_memory (user_id, kind, created_at desc);

-- Shared engineering/workflow knowledge. NO taxpayer data: notes are redacted before
-- insert, and the checks below reject obvious identifiers as a backstop.
create table if not exists public.shared_knowledge (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('pattern','correction','validation')),
  note       text not null check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint shared_no_ssn check (note !~ '\d{3}-\d{2}-\d{4}'),
  constraint shared_no_email check (note !~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'),
  constraint shared_no_amounts check (note !~ '\$\s?\d')
);

create table if not exists public.channel_links (
  phone          text primary key check (phone ~ '^\+[1-9]\d{6,14}$'),
  user_id        uuid not null references auth.users (id) on delete cascade,
  notify_consent boolean not null default false,
  consent_at     timestamptz,
  stopped        boolean not null default false,
  created_at     timestamptz not null default now()
);

-- At-least-once delivery → exactly-once side effects.
create table if not exists public.photon_events (
  event_id    text primary key,
  received_at timestamptz not null default now()
);

create table if not exists public.message_outbox (
  idempotency_key text primary key,
  user_id         uuid references auth.users (id) on delete cascade,
  status          text not null check (status in ('queued','sent','failed')),
  attempts        integer not null default 0,
  last_error      text,
  created_at      timestamptz not null default now()
  -- message text is intentionally NOT stored
);

create table if not exists public.audit_log (
  id      bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  actor   text not null check (actor in ('user','agent','system')),
  action  text not null,
  detail  jsonb not null default '{}'::jsonb,
  at      timestamptz not null default now()
);

alter table public.agent_memory enable row level security;
alter table public.shared_knowledge enable row level security;
alter table public.channel_links enable row level security;
alter table public.photon_events enable row level security;
alter table public.message_outbox enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "memory: read own" on public.agent_memory;
create policy "memory: read own" on public.agent_memory for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "memory: delete own" on public.agent_memory;
create policy "memory: delete own" on public.agent_memory for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "shared: read" on public.shared_knowledge;
create policy "shared: read" on public.shared_knowledge for select to authenticated using (true);

drop policy if exists "links: read own" on public.channel_links;
create policy "links: read own" on public.channel_links for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "links: insert own" on public.channel_links;
create policy "links: insert own" on public.channel_links for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "links: update own" on public.channel_links;
create policy "links: update own" on public.channel_links for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "links: delete own" on public.channel_links;
create policy "links: delete own" on public.channel_links for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "outbox: read own" on public.message_outbox;
create policy "outbox: read own" on public.message_outbox for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "audit: read own" on public.audit_log;
create policy "audit: read own" on public.audit_log for select to authenticated using ((select auth.uid()) = user_id);

-- photon_events: no policies → only the service role can touch it.

grant select, delete on public.agent_memory to authenticated;
grant select on public.shared_knowledge to authenticated;
grant select, insert, update, delete on public.channel_links to authenticated;
grant select on public.message_outbox to authenticated;
grant select on public.audit_log to authenticated;
revoke all on public.agent_memory, public.shared_knowledge, public.channel_links, public.photon_events, public.message_outbox, public.audit_log from anon;
