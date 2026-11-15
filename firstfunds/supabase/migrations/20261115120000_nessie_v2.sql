-- Nessie v2: more transaction kinds, available/credit-limit on accounts, and read-only
-- bills and loans. Mirrors src/lib/banking/types.ts. Imports run server-side; users read own rows.

alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('purchase','deposit','withdrawal','transfer','bill_payment','fee','interest_credit','refund','chargeback'));

alter table public.bank_accounts add column if not exists available numeric(14,2);
alter table public.bank_accounts add column if not exists credit_limit numeric(14,2);

create table if not exists public.bank_bills (
  id                    text primary key,                -- '<provider>:bill:<external_id>'
  user_id               uuid not null references auth.users (id) on delete cascade,
  provider              text not null check (provider in ('nessie','fallback')),
  account_id            text not null,
  payee                 text,
  nickname              text,
  status                text,
  amount                numeric(14,2),
  upcoming_payment_date date,
  recurring_day         int check (recurring_day is null or recurring_day between 1 and 31),
  updated_at            timestamptz not null default now()
);

create table if not exists public.bank_loans (
  id              text primary key,                      -- '<provider>:loan:<external_id>'
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider        text not null check (provider in ('nessie','fallback')),
  account_id      text not null,
  type            text,
  status          text,
  description     text,
  amount          numeric(14,2),
  monthly_payment numeric(14,2),
  credit_score    int check (credit_score is null or credit_score between 300 and 850),
  updated_at      timestamptz not null default now()
);

alter table public.bank_bills enable row level security;
alter table public.bank_loans enable row level security;
drop policy if exists "bank bills: read own" on public.bank_bills;
create policy "bank bills: read own" on public.bank_bills for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "bank loans: read own" on public.bank_loans;
create policy "bank loans: read own" on public.bank_loans for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.bank_bills to authenticated;
grant select on public.bank_loans to authenticated;
