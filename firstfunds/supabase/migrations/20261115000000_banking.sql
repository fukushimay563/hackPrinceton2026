-- FirstFunds banking: Capital One Nessie sandbox (simulated data) or labelled fictional
-- fallback, normalized for My Budget and FinPilot. Mirrors src/lib/banking/repository.ts.
-- Users read their own rows; imports run server-side with the service role.
-- Category corrections live in public.agent_memory (kind = 'correction'), the existing
-- personalization store, and category_source = 'user' is never overwritten by a sync.

create table if not exists public.bank_accounts (
  id          text primary key,                        -- '<provider>:<external_id>'
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null check (provider in ('nessie','fallback')),
  external_id text not null,
  type        text not null check (type in ('Checking','Savings','Credit Card','Unknown')),
  nickname    text,
  balance     numeric(14,2),
  last4       text check (last4 is null or last4 ~ '^\d{4}$'),   -- full account numbers are never stored
  updated_at  timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

create table if not exists public.bank_transactions (
  id              text primary key,                    -- '<provider>:<kind>:<external_id>'
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider        text not null check (provider in ('nessie','fallback')),
  external_id     text not null,
  kind            text not null check (kind in ('purchase','deposit','withdrawal','transfer')),
  account_id      text not null,
  txn_date        date,                                -- null when the provider sent none
  amount          numeric(14,2) not null check (amount > 0),
  direction       text not null check (direction in ('inflow','outflow')),
  description     text,
  merchant        text,
  category        text not null,
  category_source text not null check (category_source in ('provider','rule','user','none')),
  flow            text not null check (flow in ('income','expense','refund','transfer','excluded')),
  status          text,
  needs_review    boolean not null default false,
  review_reasons  text[] not null default '{}',
  raw             jsonb not null default '{}'::jsonb,
  imported_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, provider, kind, external_id)
);
create index if not exists bank_tx_user_date_idx on public.bank_transactions (user_id, provider, txn_date desc);

create table if not exists public.budgets (
  user_id    uuid not null references auth.users (id) on delete cascade,
  category   text not null,
  monthly_limit numeric(12,2) not null check (monthly_limit >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

-- Idempotent import that keeps user-approved categories.
create or replace function public.upsert_bank_transaction(t public.bank_transactions)
returns void language sql as $$
  insert into public.bank_transactions as b
    (id, user_id, provider, external_id, kind, account_id, txn_date, amount, direction, description, merchant,
     category, category_source, flow, status, needs_review, review_reasons, raw)
  values
    (t.id, t.user_id, t.provider, t.external_id, t.kind, t.account_id, t.txn_date, t.amount, t.direction, t.description, t.merchant,
     t.category, t.category_source, t.flow, t.status, t.needs_review, t.review_reasons, t.raw)
  on conflict (user_id, provider, kind, external_id) do update set
    account_id = excluded.account_id, txn_date = excluded.txn_date, amount = excluded.amount, direction = excluded.direction,
    description = excluded.description, merchant = excluded.merchant, status = excluded.status, raw = excluded.raw,
    flow = excluded.flow, review_reasons = excluded.review_reasons, needs_review = excluded.needs_review,
    category = case when b.category_source = 'user' then b.category else excluded.category end,
    category_source = case when b.category_source = 'user' then 'user' else excluded.category_source end,
    updated_at = now();
$$;

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.budgets enable row level security;

drop policy if exists "bank accounts: read own" on public.bank_accounts;
create policy "bank accounts: read own" on public.bank_accounts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "bank tx: read own" on public.bank_transactions;
create policy "bank tx: read own" on public.bank_transactions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "bank tx: correct own category" on public.bank_transactions;
create policy "bank tx: correct own category" on public.bank_transactions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "budgets: own" on public.budgets;
create policy "budgets: own" on public.budgets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select on public.bank_accounts to authenticated;
grant select, update (category, category_source, needs_review, review_reasons, updated_at) on public.bank_transactions to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;
