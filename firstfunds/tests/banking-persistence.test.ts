// Persistent banking storage: the Supabase store runs against real Postgres (PGlite) with
// all migrations applied, through the same SQL functions production calls. "Instances" are
// separate store objects with no shared memory, like separate serverless invocations.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { fallbackSnapshot } from "../src/lib/banking/fallback";
import type { NessieConfig } from "../src/lib/banking/nessie";
import { bankingOverview } from "../src/lib/banking/overview";
import { BankingStoreError, MemoryBankingStore, DEMO_BANK_USER, setBankingStoreForTests } from "../src/lib/banking/repository";
import { DEMO_BANKING_UUID, SupabaseBankingStore, type RpcClient } from "../src/lib/banking/supabaseStore";
import { loadBanking, syncBanking } from "../src/lib/banking/sync";
import { runBankingTool } from "../src/lib/banking/copilotTools";
import { bankingErrorResponse, resolveBankingUser } from "../src/lib/banking/http";
import { captureLogs } from "../src/lib/agents/logger";

const U = DEMO_BANK_USER;
const X = "11111111-1111-4111-8111-111111111111";
const Y = "22222222-2222-4222-8222-222222222222";

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated, service_role;
    insert into auth.users values ('${X}'), ('${Y}');`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
  return db;
}

/** Minimal supabase-js `rpc` over PGlite: named arguments, JSON for objects, errors as {message, code}. */
function pgRpc(db: PGlite, opts: { failWith?: { message: string; code?: string } } = {}): RpcClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async rpc(fn: string, params: Record<string, unknown>) {
      calls.push(fn);
      if (opts.failWith) return { data: null, error: opts.failWith };
      const keys = Object.keys(params);
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
      const vals = keys.map((k) => (params[k] !== null && typeof params[k] === "object" ? JSON.stringify(params[k]) : params[k]));
      try {
        const r = await db.query<{ r: unknown }>(sql, vals);
        return { data: r.rows[0]?.r ?? null, error: null };
      } catch (e) {
        const err = e as { message?: string; code?: string };
        return { data: null, error: { message: err.message ?? "error", code: err.code } };
      }
    },
  };
}

// Fake Nessie v2 (documented GET endpoints, Bearer auth, {items} lists).
function fakeNessie(snapshot = fallbackSnapshot()) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (new Headers(init?.headers).get("authorization") !== "Bearer nsk_test") return Response.json({ title: "Unauthorized", status: 401 }, { status: 401 });
    const p = url.pathname;
    let m: RegExpMatchArray | null;
    if (p === "/accounts") return Response.json({ items: snapshot.accounts });
    if ((m = p.match(/^\/accounts\/([^/]+)\/transactions$/))) return Response.json({ items: snapshot.transactions.find((t) => t.accountId === m![1])?.items ?? [] });
    if ((m = p.match(/^\/accounts\/([^/]+)\/bills$/))) return Response.json({ items: snapshot.bills.filter((b) => b.account_id === m![1]) });
    if ((m = p.match(/^\/accounts\/([^/]+)\/loans$/))) return Response.json({ items: snapshot.loans.filter((l) => l.account_id === m![1]) });
    if (p === "/merchants") return Response.json({ items: snapshot.merchants });
    return Response.json({ title: "Not Found", status: 404 }, { status: 404 });
  }) as typeof fetch;
}
const nessie = (snap = fallbackSnapshot()): NessieConfig => ({ apiKey: "nsk_test", baseUrl: "https://nessie.test", timeoutMs: 1000, fetchImpl: fakeNessie(snap) });
const at = (d: string) => `${d}T12:00:00Z`;

let db: PGlite;
beforeEach(async () => {
  db = await freshDb();
  setBankingStoreForTests(null);
});

test("records synced in one serverless instance are read by another (persistence)", async () => {
  const instanceA = new SupabaseBankingStore(pgRpc(db));
  const r = await syncBanking(U, { store: instanceA, config: nessie() });
  assert.deepEqual([r.nessieStatus, r.storage, r.inserted, r.accounts], ["ok", "supabase", 20, 3]);

  const instanceB = new SupabaseBankingStore(pgRpc(db)); // no shared memory with A
  const data = await loadBanking(U, { store: instanceB, autoSync: false });
  assert.equal(data.accounts.length, 3);
  assert.equal(data.transactions.length, 20);
  assert.equal(data.lastSync?.nessieStatus, "ok");
  assert.equal(data.lastSync?.inserted, 20);
  const ov = bankingOverview(data, U, { month: "2026-11" });
  assert.deepEqual([ov.summary!.income, ov.summary!.netSpending, ov.summary!.netCashFlow], [1450, 952.37, 497.63]);
  const card = data.accounts.find((a) => a.type === "Credit Card")!;
  assert.deepEqual([card.balance, card.available, card.creditLimit, card.last4], [312, 688, 1000, "0003"]);
  // FinPilot tools read the same persisted records.
  const tool = runBankingTool(data, U, "monthly_income_expenses", { month: "2026-11" }) as { result: { netCashFlow: number }; dataSource: { live: boolean } };
  assert.equal(tool.result.netCashFlow, 497.63);
  assert.equal(tool.dataSource.live, true);
});

test("contrast: the in-memory store loses records between instances (the original bug)", async () => {
  const a = new MemoryBankingStore();
  await syncBanking(U, { store: a, config: nessie() });
  const b = new MemoryBankingStore();
  const data = await b.load(U);
  assert.equal(data.transactions.length, 0);
  assert.equal(data.lastSync, null);
});

test("repeated syncs from different instances are idempotent", async () => {
  await syncBanking(U, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie() });
  const r2 = await syncBanking(U, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie() });
  assert.deepEqual([r2.inserted, r2.updated, r2.unchanged], [0, 0, 20]);
  const n = (await db.query<{ n: number }>(`select count(*)::int n from public.bank_transactions where user_id = '${DEMO_BANKING_UUID}'`)).rows[0].n;
  assert.equal(n, 20);
});

test("user category corrections persist across instances and re-syncs, and apply to new transactions", async () => {
  await syncBanking(U, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie() });
  const id = "nessie:purchase:fallback-pur-0008";
  const tx = await new SupabaseBankingStore(pgRpc(db)).setCategory(U, id, "Shopping");
  assert.deepEqual([tx.category, tx.categorySource], ["Shopping", "user"]);
  const snap = fallbackSnapshot();
  snap.transactions.find((t) => t.accountId === "fallback-acct-creditcard01")!.items.push({ id: "fallback-pur-0100", kind: "purchase", status: "completed", medium: "balance", merchant_id: "fallback-m-misc", created_at: at("2026-11-20"), amount_cents: 1200, description: "QX*8812 PAYMENT", payer_id: "fallback-acct-creditcard01" });
  await syncBanking(U, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie(snap) });
  const data = await new SupabaseBankingStore(pgRpc(db)).load(U);
  const kept = data.transactions.find((t) => t.id === id)!;
  const fresh = data.transactions.find((t) => t.id === "nessie:purchase:fallback-pur-0100")!;
  assert.deepEqual([kept.category, kept.categorySource], ["Shopping", "user"]);
  assert.deepEqual([fresh.category, fresh.categorySource], ["Shopping", "user"]);
  await assert.rejects(new SupabaseBankingStore(pgRpc(db)).setCategory(U, "nessie:transfer:fallback-tr-0001", "Shopping"), /Transfers/);
});

test("budgets and bills/loans are stored and read back", async () => {
  const snap = fallbackSnapshot();
  snap.bills.push({ id: "bill-1", account_id: "fallback-acct-checking0001", status: "recurring", payee: "City Electric", payment_amount: 64.5, upcoming_payment_date: "2026-12-05", recurring_date: 5, creation_date: "2026-09-01", created_at: at("2026-09-01"), updated_at: at("2026-09-01") });
  snap.loans.push({ id: "loan-1", account_id: "fallback-acct-checking0001", type: "auto", status: "approved", credit_score: 712, amount_cents: 1200000, monthly_payment_cents: 25000, description: "Car loan", creation_date: "2026-09-01", created_at: at("2026-09-01"), updated_at: at("2026-09-01") });
  await syncBanking(U, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie(snap) });
  await new SupabaseBankingStore(pgRpc(db)).setBudgets(U, { Food: 210.005, Bills: 900 });
  const data = await new SupabaseBankingStore(pgRpc(db)).load(U);
  assert.deepEqual(data.budgets, { Food: 210.01, Bills: 900 });
  assert.deepEqual(data.bills.map((b) => [b.payee, b.amount, b.upcomingPaymentDate, b.recurringDay]), [["City Electric", 64.5, "2026-12-05", 5]]);
  assert.deepEqual(data.loans.map((l) => [l.type, l.amount, l.monthlyPayment, l.creditScore]), [["auto", 12000, 250, 712]]);
});

test("users are isolated: records, category writes and RLS", async () => {
  await syncBanking(X, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie() });
  const yData = await new SupabaseBankingStore(pgRpc(db)).load(Y);
  assert.equal(yData.transactions.length, 0, "Y sees none of X's records");
  await assert.rejects(new SupabaseBankingStore(pgRpc(db)).setCategory(Y, "nessie:purchase:fallback-pur-0001", "Shopping"), /not found/);
  // Same sandbox ids can exist for two users (primary key is per user).
  await syncBanking(Y, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie() });
  assert.equal((await new SupabaseBankingStore(pgRpc(db)).load(Y)).transactions.length, 20);
  // Through PostgREST roles: each user reads only their own rows; nobody can call the server functions.
  await db.exec(`select set_config('request.jwt.claim.sub', '${X}', false); set role authenticated;`);
  const own = await db.query<{ n: number; others: number }>(`select count(*)::int n, count(*) filter (where user_id <> '${X}')::int others from public.bank_transactions`);
  assert.deepEqual([own.rows[0].n, own.rows[0].others], [20, 0]);
  await assert.rejects(db.query(`select public.banking_load('${Y}')`), /permission denied/);
  await assert.rejects(db.query(`select public.banking_apply_sync('${X}', '{"provider":"nessie"}'::jsonb)`), /permission denied/);
  await db.exec("reset role;");
  await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  await assert.rejects(db.query("select * from public.bank_transactions"), /permission denied/, "signed-out clients can't read banking tables at all");
  await db.exec("reset role;");
});

test("empty Nessie sandbox is persisted as 'empty' (not an error, no fictional rows)", async () => {
  await syncBanking(U, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie() });
  const empty = { ...fallbackSnapshot(), accounts: [], transactions: [], merchants: [] };
  const r = await syncBanking(U, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie(empty) });
  assert.equal(r.nessieStatus, "empty");
  const data = await new SupabaseBankingStore(pgRpc(db)).load(U);
  assert.deepEqual([data.lastSync?.nessieStatus, data.transactions.length, data.accounts.length], ["empty", 0, 0]);
});

test("a stale empty/failed sync is retried automatically on the next read", async () => {
  const store = new SupabaseBankingStore(pgRpc(db));
  const empty = { ...fallbackSnapshot(), accounts: [], transactions: [], merchants: [] };
  await syncBanking(U, { store, config: nessie(empty) });
  // Age the stored report past the retry window, then seed the "sandbox".
  await db.exec(`update public.bank_sync_status set report = jsonb_set(report, '{syncedAt}', to_jsonb((extract(epoch from now()) * 1000 - 600000)::bigint))`);
  process.env.NESSIE_API_KEY = "nsk_test";
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeNessie();
  process.env.NESSIE_BASE_URL = "https://nessie.test";
  try {
    const data = await loadBanking(U, { store });
    assert.equal(data.lastSync?.nessieStatus, "ok");
    assert.equal(data.transactions.length, 20);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.NESSIE_API_KEY;
    delete process.env.NESSIE_BASE_URL;
  }
});

test("database errors surface as 503 with no fictional data; nothing is written", async () => {
  const broken = new SupabaseBankingStore(pgRpc(db, { failWith: { message: "connection refused", code: "08006" } }));
  await assert.rejects(loadBanking(U, { store: broken }), (e: unknown) => e instanceof BankingStoreError && e.op === "load");
  await assert.rejects(syncBanking(U, { store: broken, config: nessie() }), BankingStoreError);
  const res = bankingErrorResponse(new BankingStoreError("Banking database error", "load", "08006"), "test");
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error: string; storage: string };
  assert.equal(body.storage, "error");
  const missing = new SupabaseBankingStore(pgRpc(db, { failWith: { message: "Could not find the function public.banking_load", code: "PGRST202" } }));
  await assert.rejects(missing.load(U), /apply the Supabase migrations/);
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.bank_transactions")).rows[0].n, 0);
});

test("live read/write check reports the round trip and the applied schema", async () => {
  const r = await new SupabaseBankingStore(pgRpc(db)).ping();
  assert.equal(r.roundTrip, true);
  const schema = r.schema as Record<string, boolean>;
  assert.ok(Object.values(schema).every(Boolean), JSON.stringify(schema));
});

test("persistence logs carry counts and timings only", async () => {
  const cap = captureLogs();
  try {
    await syncBanking(U, { store: new SupabaseBankingStore(pgRpc(db)), config: nessie() });
    await loadBanking(U, { store: new SupabaseBankingStore(pgRpc(db)), autoSync: false });
  } finally {
    cap.stop();
  }
  const lines = cap.lines();
  const ev = (name: string) => lines.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l.event === name)!;
  assert.equal(ev("banking.normalize").transactions, 20);
  assert.deepEqual([ev("banking.sync").backend, ev("banking.sync").inserted], ["supabase", 20]);
  assert.deepEqual([ev("banking.read").backend, ev("banking.read").transactions], ["supabase", 20]);
  assert.ok(lines.some((l) => l.includes('"banking.db"')));
  assert.doesNotMatch(lines.join("\n"), /nsk_test|FreshMart|ACME|1240|0000000000000001|fallback-acct/);
});

test("request identity: no token → demo profile; unverifiable token → 401 (never someone else's data)", async () => {
  const saved = { ...process.env };
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  try {
    assert.deepEqual(await resolveBankingUser(new Request("http://x/api/banking")), { userId: U, signedIn: false });
    const r = await resolveBankingUser(new Request("http://x/api/banking", { headers: { authorization: "Bearer forged" } }));
    assert.ok(r instanceof Response && r.status === 401);
  } finally {
    process.env = saved;
  }
});
