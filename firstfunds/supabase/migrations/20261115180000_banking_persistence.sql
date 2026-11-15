-- Persistent banking storage for serverless deployments.
-- Requires (in order): 20261115000000_banking.sql, 20261115120000_nessie_v2.sql.
--
-- 1. Banking rows can belong to the server-side demo profile (a fixed UUID that is never an
--    auth user) as well as to signed-in users, so the auth.users foreign keys are replaced by
--    a cleanup trigger. RLS still limits every client to rows whose user_id = auth.uid().
-- 2. Primary keys become (user_id, id) so two users can hold copies of the same sandbox record.
-- 3. Category rules and the last sync status are stored, so every serverless instance sees them.
-- 4. All writes go through the functions below, executable ONLY by the service role (server side).

alter table public.bank_accounts     drop constraint if exists bank_accounts_user_id_fkey;
alter table public.bank_transactions drop constraint if exists bank_transactions_user_id_fkey;
alter table public.budgets           drop constraint if exists budgets_user_id_fkey;
alter table public.bank_bills        drop constraint if exists bank_bills_user_id_fkey;
alter table public.bank_loans        drop constraint if exists bank_loans_user_id_fkey;

alter table public.bank_accounts     drop constraint if exists bank_accounts_pkey;
alter table public.bank_accounts     add primary key (user_id, id);
alter table public.bank_transactions drop constraint if exists bank_transactions_pkey;
alter table public.bank_transactions add primary key (user_id, id);
alter table public.bank_bills        drop constraint if exists bank_bills_pkey;
alter table public.bank_bills        add primary key (user_id, id);
alter table public.bank_loans        drop constraint if exists bank_loans_pkey;
alter table public.bank_loans        add primary key (user_id, id);

create table if not exists public.bank_category_rules (
  user_id      uuid not null,
  merchant_key text not null check (length(merchant_key) <= 200),
  category     text not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, merchant_key)
);

create table if not exists public.bank_sync_status (
  user_id   uuid primary key,
  report    jsonb not null,           -- counts, status and labels only; no account data
  synced_at timestamptz not null default now()
);

create table if not exists public.banking_health (
  id         int primary key check (id = 1),
  checked_at timestamptz not null
);

alter table public.bank_category_rules enable row level security;
alter table public.bank_sync_status    enable row level security;
alter table public.banking_health      enable row level security;   -- no policies: service role only
drop policy if exists "bank rules: read own" on public.bank_category_rules;
create policy "bank rules: read own" on public.bank_category_rules for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "bank sync: read own" on public.bank_sync_status;
create policy "bank sync: read own" on public.bank_sync_status for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.bank_category_rules to authenticated;
grant select on public.bank_sync_status to authenticated;

-- Remove a deleted user's banking rows (replaces the dropped ON DELETE CASCADE).
create or replace function public.banking_delete_user_rows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.bank_transactions   where user_id = old.id;
  delete from public.bank_accounts       where user_id = old.id;
  delete from public.bank_bills          where user_id = old.id;
  delete from public.bank_loans          where user_id = old.id;
  delete from public.budgets             where user_id = old.id;
  delete from public.bank_category_rules where user_id = old.id;
  delete from public.bank_sync_status    where user_id = old.id;
  return old;
end $$;
drop trigger if exists banking_delete_user_rows on auth.users;
create trigger banking_delete_user_rows after delete on auth.users for each row execute function public.banking_delete_user_rows();

-- ---------------------------------------------------------------- read: one round trip
create or replace function public.banking_load(p_user uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'accounts',     coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.bank_accounts a where a.user_id = p_user), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) - 'raw' order by t.txn_date desc nulls last, t.id) from public.bank_transactions t where t.user_id = p_user), '[]'::jsonb),
    'bills',        coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.bank_bills b where b.user_id = p_user), '[]'::jsonb),
    'loans',        coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.bank_loans l where l.user_id = p_user), '[]'::jsonb),
    'budgets',      (select jsonb_object_agg(category, monthly_limit) from public.budgets where user_id = p_user),
    'rules',        coalesce((select jsonb_object_agg(merchant_key, category) from public.bank_category_rules where user_id = p_user), '{}'::jsonb),
    'sync',         (select report from public.bank_sync_status where user_id = p_user)
  );
$$;

-- ---------------------------------------------------------------- write: one atomic sync
-- payload: { provider, accounts[], transactions[], bills[]?, loans[]?, prune: bool, report{} }
-- Idempotent: keyed by (user_id, id). A category with category_source = 'user' is never overwritten.
create or replace function public.banking_apply_sync(p_user uuid, p_payload jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_provider text := p_payload->>'provider';
  r record;
  prev public.bank_transactions;
  v_exists boolean;
  v_cat text; v_src text; v_reasons text[]; v_needs boolean;
  ins int := 0; upd int := 0; unch int := 0; pruned int := 0;
begin
  if v_provider not in ('nessie', 'fallback') then raise exception 'invalid provider'; end if;

  insert into public.bank_accounts as b (id, user_id, provider, external_id, type, nickname, balance, available, credit_limit, last4, updated_at)
  select x.id, p_user, v_provider, x."externalId", x.type, x.nickname, x.balance, x.available, x."creditLimit", x.last4, now()
  from jsonb_to_recordset(coalesce(p_payload->'accounts', '[]'::jsonb))
    as x(id text, "externalId" text, type text, nickname text, balance numeric, available numeric, "creditLimit" numeric, last4 text)
  on conflict (user_id, id) do update set
    external_id = excluded.external_id, type = excluded.type, nickname = excluded.nickname, balance = excluded.balance,
    available = excluded.available, credit_limit = excluded.credit_limit, last4 = excluded.last4, updated_at = now();

  for r in
    select * from jsonb_to_recordset(coalesce(p_payload->'transactions', '[]'::jsonb))
      as x(id text, "externalId" text, kind text, "accountId" text, date date, amount numeric, direction text,
           description text, merchant text, category text, "categorySource" text, flow text, status text,
           "reviewReasons" text[], raw jsonb)
  loop
    select * into prev from public.bank_transactions where user_id = p_user and id = r.id;
    v_exists := found;
    v_cat := r.category; v_src := r."categorySource"; v_reasons := coalesce(r."reviewReasons", '{}');
    if v_exists and prev.category_source = 'user' then
      v_cat := prev.category; v_src := 'user';
      v_reasons := array(select x from unnest(v_reasons) x where x !~* 'category');
    end if;
    v_needs := coalesce(array_length(v_reasons, 1), 0) > 0;
    if not v_exists then
      insert into public.bank_transactions (id, user_id, provider, external_id, kind, account_id, txn_date, amount, direction, description,
        merchant, category, category_source, flow, status, needs_review, review_reasons, raw)
      values (r.id, p_user, v_provider, r."externalId", r.kind, r."accountId", r.date, r.amount, r.direction, r.description,
        r.merchant, v_cat, v_src, r.flow, r.status, v_needs, v_reasons, coalesce(r.raw, '{}'::jsonb));
      ins := ins + 1;
    else
      if prev.txn_date is distinct from r.date or prev.amount <> r.amount or prev.direction <> r.direction
         or prev.description is distinct from r.description or prev.merchant is distinct from r.merchant
         or prev.status is distinct from r.status or prev.account_id <> r."accountId" or prev.kind <> r.kind
         or prev.category <> v_cat or prev.flow <> r.flow or prev.needs_review <> v_needs then
        upd := upd + 1;
      else
        unch := unch + 1;
      end if;
      update public.bank_transactions set
        kind = r.kind, account_id = r."accountId", txn_date = r.date, amount = r.amount, direction = r.direction,
        description = r.description, merchant = r.merchant, category = v_cat, category_source = v_src, flow = r.flow,
        status = r.status, needs_review = v_needs, review_reasons = v_reasons, raw = coalesce(r.raw, '{}'::jsonb), updated_at = now()
      where user_id = p_user and id = r.id;
    end if;
  end loop;

  -- After a successful provider read, remove that provider's records it no longer returns.
  if coalesce((p_payload->>'prune')::boolean, false) then
    delete from public.bank_transactions t where t.user_id = p_user and t.provider = v_provider
      and not exists (select 1 from jsonb_array_elements(coalesce(p_payload->'transactions', '[]'::jsonb)) e where e->>'id' = t.id);
    get diagnostics pruned = row_count;
    delete from public.bank_accounts a where a.user_id = p_user and a.provider = v_provider
      and not exists (select 1 from jsonb_array_elements(coalesce(p_payload->'accounts', '[]'::jsonb)) e where e->>'id' = a.id);
  end if;

  if p_payload ? 'bills' then
    delete from public.bank_bills where user_id = p_user and provider = v_provider;
    insert into public.bank_bills (id, user_id, provider, account_id, payee, nickname, status, amount, upcoming_payment_date, recurring_day)
    select x.id, p_user, v_provider, x."accountId", x.payee, x.nickname, x.status, x.amount, x."upcomingPaymentDate", x."recurringDay"
    from jsonb_to_recordset(p_payload->'bills')
      as x(id text, "accountId" text, payee text, nickname text, status text, amount numeric, "upcomingPaymentDate" date, "recurringDay" int);
  end if;
  if p_payload ? 'loans' then
    delete from public.bank_loans where user_id = p_user and provider = v_provider;
    insert into public.bank_loans (id, user_id, provider, account_id, type, status, description, amount, monthly_payment, credit_score)
    select x.id, p_user, v_provider, x."accountId", x.type, x.status, x.description, x.amount, x."monthlyPayment", x."creditScore"
    from jsonb_to_recordset(p_payload->'loans')
      as x(id text, "accountId" text, type text, status text, description text, amount numeric, "monthlyPayment" numeric, "creditScore" int);
  end if;

  if p_payload ? 'report' then
    insert into public.bank_sync_status (user_id, report, synced_at)
    values (p_user, (p_payload->'report') || jsonb_build_object('inserted', ins, 'updated', upd, 'unchanged', unch), now())
    on conflict (user_id) do update set report = excluded.report, synced_at = now();
  end if;

  return jsonb_build_object('inserted', ins, 'updated', upd, 'unchanged', unch, 'pruned', pruned);
end $$;

-- ---------------------------------------------------------------- explicit user category correction
create or replace function public.banking_set_category(p_user uuid, p_id text, p_category text, p_merchant_key text) returns jsonb
language plpgsql set search_path = public as $$
declare t public.bank_transactions; v_reasons text[];
begin
  select * into t from public.bank_transactions where user_id = p_user and id = p_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if t.flow = 'transfer' then raise exception 'Transfers between your own accounts aren''t spending, so they have no spending category'; end if;
  if t.flow = 'excluded' then raise exception 'This transaction isn''t counted (cancelled or an external transfer), so its category can''t change the budget'; end if;
  v_reasons := array(select x from unnest(t.review_reasons) x where x !~* 'category');
  update public.bank_transactions set category = p_category, category_source = 'user', review_reasons = v_reasons,
    needs_review = coalesce(array_length(v_reasons, 1), 0) > 0, updated_at = now()
  where user_id = p_user and id = p_id returning * into t;
  if p_merchant_key is not null and length(p_merchant_key) > 0 then
    insert into public.bank_category_rules (user_id, merchant_key, category) values (p_user, p_merchant_key, p_category)
    on conflict (user_id, merchant_key) do update set category = excluded.category, updated_at = now();
  end if;
  return to_jsonb(t) - 'raw';
end $$;

create or replace function public.banking_set_budgets(p_user uuid, p_budgets jsonb) returns void
language plpgsql set search_path = public as $$
begin
  delete from public.budgets where user_id = p_user;
  insert into public.budgets (user_id, category, monthly_limit)
  select p_user, e.key, round((e.value #>> '{}')::numeric, 2)
  from jsonb_each(coalesce(p_budgets, '{}'::jsonb)) e
  where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric >= 0;
end $$;

-- ---------------------------------------------------------------- live read/write + schema check
create or replace function public.banking_ping() returns jsonb
language plpgsql set search_path = public as $$
declare v_written timestamptz := clock_timestamp(); v_read timestamptz;
begin
  insert into public.banking_health (id, checked_at) values (1, v_written)
  on conflict (id) do update set checked_at = excluded.checked_at;
  select checked_at into v_read from public.banking_health where id = 1;
  return jsonb_build_object(
    'wrote', v_written, 'readBack', v_read, 'roundTrip', v_read = v_written,
    'schema', jsonb_build_object(
      'bank_accounts', to_regclass('public.bank_accounts') is not null,
      'bank_transactions', to_regclass('public.bank_transactions') is not null,
      'budgets', to_regclass('public.budgets') is not null,
      'bank_bills', to_regclass('public.bank_bills') is not null,
      'bank_loans', to_regclass('public.bank_loans') is not null,
      'bank_category_rules', to_regclass('public.bank_category_rules') is not null,
      'bank_sync_status', to_regclass('public.bank_sync_status') is not null,
      'accounts_available_column', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bank_accounts' and column_name = 'available'),
      'v2_kinds', exists (select 1 from pg_constraint where conname = 'bank_transactions_kind_check' and pg_get_constraintdef(oid) like '%bill_payment%')
    )
  );
end $$;

-- Writes and reads only from the server (service role). Clients read their own rows via RLS.
revoke all on function public.banking_load(uuid) from public, anon, authenticated;
revoke all on function public.banking_apply_sync(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.banking_set_category(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.banking_set_budgets(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.banking_ping() from public, anon, authenticated;
revoke all on function public.banking_delete_user_rows() from public, anon, authenticated;
revoke all on function public.upsert_bank_transaction(public.bank_transactions) from public, anon, authenticated;
grant execute on function public.banking_load(uuid) to service_role;
grant execute on function public.banking_apply_sync(uuid, jsonb) to service_role;
grant execute on function public.banking_set_category(uuid, text, text, text) to service_role;
grant execute on function public.banking_set_budgets(uuid, jsonb) to service_role;
grant execute on function public.banking_ping() to service_role;
grant all on public.bank_accounts, public.bank_transactions, public.bank_bills, public.bank_loans, public.budgets,
  public.bank_category_rules, public.bank_sync_status, public.banking_health to service_role;
