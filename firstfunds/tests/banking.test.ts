// Nessie integration: client, normalization, persistence, money math, corrections,
// FinPilot tool access and failure handling. All network calls use a fake fetch.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { fetchNessieSnapshot, nessieConfigFromEnv, NessieError, type NessieConfig } from "../src/lib/banking/nessie";
import { normalizeNessie, normalizeDate, normalizeAmount } from "../src/lib/banking/normalize";
import { fallbackSnapshot } from "../src/lib/banking/fallback";
import { banking, DEMO_BANK_USER } from "../src/lib/banking/repository";
import { syncBanking } from "../src/lib/banking/sync";
import { monthlySummary, spendingByCategory, recurringCandidates, budgetProgress } from "../src/lib/banking/analytics";
import { activeRows, bankingOverview } from "../src/lib/banking/overview";
import { runBankingTool, offlineBankingAnswer } from "../src/lib/banking/copilotTools";

const U = DEMO_BANK_USER;
beforeEach(() => banking._reset());

// ---------- fake Nessie server, using only documented endpoints ----------
function fakeNessie(snapshot = fallbackSnapshot(), opts: { failPath?: RegExp; status?: number } = {}) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname + "?" + url.search.slice(1));
    if (url.searchParams.get("key") !== "test-key") return new Response(JSON.stringify("unauthorized"), { status: 401 });
    if (opts.failPath?.test(url.pathname)) return new Response("boom", { status: opts.status ?? 500 });
    const p = url.pathname;
    let m: RegExpMatchArray | null;
    if (p === "/accounts") return Response.json(snapshot.accounts);
    if ((m = p.match(/^\/accounts\/([^/]+)\/deposits$/))) return Response.json(snapshot.deposits.find((d) => d.accountId === m![1])?.items ?? []);
    if ((m = p.match(/^\/accounts\/([^/]+)\/withdrawals$/))) return Response.json(snapshot.withdrawals.find((d) => d.accountId === m![1])?.items ?? []);
    if ((m = p.match(/^\/purchase\/([^/]+)$/))) { const x = snapshot.purchases.find((r) => r._id === m![1]); return x ? Response.json(x) : new Response("{}", { status: 404 }); }
    if ((m = p.match(/^\/transfers\/([^/]+)$/))) { const x = snapshot.transfers.find((r) => r._id === m![1]); return x ? Response.json(x) : new Response("{}", { status: 404 }); }
    if (p === "/merchants") return Response.json(snapshot.merchants);
    return new Response("not documented", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

function cfg(fetchImpl: typeof fetch, extra: Partial<NessieConfig> = {}): NessieConfig {
  const s = fallbackSnapshot();
  return { apiKey: "test-key", baseUrl: "https://nessie.test", purchaseIds: s.purchases.map((p) => String(p._id)), transferIds: s.transfers.map((t) => String(t._id)), timeoutMs: 1000, fetchImpl, ...extra };
}

// ---------- connectivity & retrieval ----------
test("client reads config from env and stays off without a key", () => {
  assert.equal(nessieConfigFromEnv({} as NodeJS.ProcessEnv), null);
  const c = nessieConfigFromEnv({ NESSIE_API_KEY: "k", NESSIE_PURCHASE_IDS: "a, b" } as unknown as NodeJS.ProcessEnv)!;
  assert.equal(c.baseUrl, "https://prod-api.nessieisreal.com");
  assert.deepEqual(c.purchaseIds, ["a", "b"]);
});

test("retrieves accounts, deposits, withdrawals, purchases, transfers via documented endpoints only", async () => {
  const f = fakeNessie();
  const snap = await fetchNessieSnapshot(cfg(f.impl));
  assert.equal(snap.accounts.length, 3);
  assert.equal(snap.purchases.length, 9);
  assert.equal(snap.transfers.length, 4);
  assert.ok(f.calls.every((c) => /^\/(accounts(\/[^/]+\/(deposits|withdrawals))?|purchase\/[^/]+|transfers\/[^/]+|merchants)\?key=test-key$/.test(c)), f.calls.join("\n"));
  assert.ok(!f.calls.some((c) => /\/accounts\/[^/]+\/(purchases|transfers)/.test(c)), "never calls undocumented list endpoints");
});

test("bad key is a hard error that does not leak the key", async () => {
  const f = fakeNessie();
  await assert.rejects(fetchNessieSnapshot(cfg(f.impl, { apiKey: "wrong" })), (e: unknown) => e instanceof NessieError && e.status === 401 && !e.message.includes("wrong"));
});

test("per-resource failures become warnings; account failure is fatal", async () => {
  const partial = await fetchNessieSnapshot(cfg(fakeNessie(undefined, { failPath: /withdrawals$/ }).impl));
  assert.ok(partial.warnings.some((w) => /withdrawals/.test(w)));
  assert.equal(partial.withdrawals.every((w) => w.items.length === 0), true);
  await assert.rejects(fetchNessieSnapshot(cfg(fakeNessie(undefined, { failPath: /^\/accounts$/, status: 503 }).impl)), /503/);
});

// ---------- normalization ----------
test("normalization keeps provenance and never invents data", () => {
  assert.equal(normalizeDate("2026-02-30"), null);
  assert.equal(normalizeDate(undefined), null);
  assert.equal(normalizeAmount("12.345"), 12.35);
  assert.equal(normalizeAmount(-5), null);
  const s = fallbackSnapshot();
  s.purchases.push({ _id: "p-nodate", amount: 9, description: "Pizza place", payer_id: "fallback-acct-creditcard01" });
  s.purchases.push({ _id: "p-noamount", description: "Ghost", payer_id: "fallback-acct-creditcard01" });
  const out = normalizeNessie({ provider: "nessie", userId: U, ...s });
  const nodate = out.transactions.find((t) => t.externalId === "p-nodate")!;
  assert.equal(nodate.date, null);
  assert.ok(nodate.needsReview && nodate.reviewReasons.some((r) => /Date/.test(r)));
  assert.ok(out.skipped.some((x) => x.externalId === "p-noamount"));
  const coffee = out.transactions.find((t) => t.externalId === "fallback-pur-0001")!;
  assert.equal(coffee.id, "nessie:purchase:fallback-pur-0001");
  assert.equal(coffee.accountId, "nessie:fallback-acct-creditcard01");
  assert.equal(coffee.merchant, "Campus Coffee Co. (sample)");
  assert.equal(coffee.category, "Food");
  assert.equal(coffee.provider, "nessie");
  assert.equal(coffee.date, "2026-10-04");
  assert.equal(out.accounts[0].last4, "0001");
  assert.ok(!("account_number" in out.accounts[0]));
});

test("deposits: payroll is income, unknown deposit is income flagged for review, refund is not income", () => {
  const out = normalizeNessie({ provider: "fallback", userId: U, ...fallbackSnapshot() });
  const byId = (id: string) => out.transactions.find((t) => t.externalId === id)!;
  assert.equal(byId("fallback-dep-0001").flow, "income");
  assert.equal(byId("fallback-dep-0001").needsReview, false);
  assert.equal(byId("fallback-dep-0002").flow, "income");
  assert.ok(byId("fallback-dep-0002").reviewReasons.some((r) => /not assumed to be employment income/.test(r)));
  assert.equal(byId("fallback-dep-0004").flow, "refund");
});

test("transfers: own-account and card payments excluded; external transfers flagged, not counted", () => {
  const out = normalizeNessie({ provider: "fallback", userId: U, ...fallbackSnapshot() });
  const byId = (id: string) => out.transactions.find((t) => t.externalId === id)!;
  assert.equal(byId("fallback-tr-0001").flow, "transfer");
  assert.equal(byId("fallback-tr-0002").category, "Card payment");
  assert.equal(byId("fallback-tr-0002").flow, "transfer");
  assert.equal(byId("fallback-tr-0004").flow, "excluded");
  assert.equal(byId("fallback-tr-0004").needsReview, true);
  assert.equal(byId("fallback-pur-0009").flow, "excluded"); // cancelled
  // A deposit into the credit card account is a payment, not income.
  const s = fallbackSnapshot();
  s.deposits[2].items.push({ _id: "cc-pay", transaction_date: "2026-11-20", amount: 100, description: "Payment received", status: "completed", medium: "balance" });
  const cc = normalizeNessie({ provider: "fallback", userId: U, ...s }).transactions.find((t) => t.externalId === "cc-pay")!;
  assert.equal(cc.flow, "transfer");
});

// ---------- persistence & duplicates ----------
test("repeated sync is idempotent (no duplicates)", async () => {
  const f = fakeNessie();
  const r1 = await syncBanking(U, { config: cfg(f.impl) });
  assert.equal(r1.provider, "nessie");
  assert.equal(r1.live, true);
  assert.equal(r1.inserted, 20); // 4 deposits + 3 withdrawals + 9 purchases + 4 transfers
  const n = banking.transactions(U).length;
  const r2 = await syncBanking(U, { config: cfg(f.impl) });
  assert.equal(r2.inserted, 0);
  assert.equal(r2.updated, 0);
  assert.equal(r2.unchanged, n);
  assert.equal(banking.transactions(U).length, n);
  assert.equal(new Set(banking.transactions(U).map((t) => t.id)).size, n);
});

// ---------- money math ----------
test("monthly income, spending, refunds and net cash flow are computed from rows", async () => {
  await syncBanking(U, { config: null }); // labelled fictional fallback
  const { rows } = activeRows(U);
  const oct = monthlySummary(rows, "2026-10");
  assert.deepEqual([oct.income, oct.grossSpending, oct.refunds, oct.netCashFlow, oct.transfersExcluded], [1510, 1029.53, 0, 480.47, 257.23]);
  const nov = monthlySummary(rows, "2026-11");
  assert.deepEqual([nov.income, nov.grossSpending, nov.refunds, nov.netSpending, nov.netCashFlow], [1450, 987.36, 34.99, 952.37, 497.63]);
  const cats = Object.fromEntries(spendingByCategory(rows, "2026-11").map((c) => [c.category, c.amount]));
  assert.deepEqual(cats, { Bills: 850, Groceries: 91.12, Uncategorized: 23.5, Subscriptions: 15.49, Food: 7.25 });
  const rec = recurringCandidates(rows).map((r) => r.merchant).sort();
  assert.deepEqual(rec, ["Campus Coffee Co. (sample)", "FreshMart (sample)", "Rent bill payment", "StreamFlix (sample)"]);
  assert.ok(recurringCandidates(rows).every((r) => r.confidence === "candidate"));
  const bills = budgetProgress(rows, "2026-11", banking.budgets(U)).find((b) => b.category === "Bills")!;
  assert.equal(bills.status, "near"); // 850 of the 1000 demo limit
  assert.equal(bills.spent, 850);
});

// ---------- user corrections ----------
test("user category corrections survive re-sync and apply to similar future transactions", async () => {
  const f = fakeNessie();
  await syncBanking(U, { config: cfg(f.impl) });
  const id = "nessie:purchase:fallback-pur-0008";
  assert.equal(banking.get(U, id)!.category, "Uncategorized");
  assert.throws(() => banking.setCategory(U, id, "Shopping", "ai" as "user"));
  banking.setCategory(U, id, "Shopping", "user");
  await syncBanking(U, { config: cfg(f.impl) });
  const after = banking.get(U, id)!;
  assert.equal(after.category, "Shopping");
  assert.equal(after.categorySource, "user");
  assert.ok(!after.reviewReasons.some((r) => /category/i.test(r)));
  // A new purchase from the same merchant picks up the approved category.
  const snap = fallbackSnapshot();
  snap.purchases.push({ _id: "fallback-pur-0100", merchant_id: "fallback-m-misc", purchase_date: "2026-11-20", amount: 12, status: "completed", description: "QX*8812 PAYMENT", payer_id: "fallback-acct-creditcard01" });
  const f2 = fakeNessie(snap);
  await syncBanking(U, { config: cfg(f2.impl, { purchaseIds: snap.purchases.map((p) => String(p._id)) }) });
  const fresh = banking.get(U, "nessie:purchase:fallback-pur-0100")!;
  assert.equal(fresh.category, "Shopping");
  assert.equal(fresh.categorySource, "user");
  assert.throws(() => banking.setCategory(U, "nessie:transfer:fallback-tr-0001", "Shopping", "user"), /Transfers/);
  assert.throws(() => banking.setCategory(U, "nessie:purchase:fallback-pur-0009", "Shopping", "user"), /isn.t counted/);
});

// ---------- FinPilot access ----------
test("FinPilot tools return stored and calculated data with provenance", async () => {
  assert.match(String((runBankingTool(U, "monthly_income_expenses") as { error: string }).error), /No banking data/);
  await syncBanking(U, { config: null });
  const r = runBankingTool(U, "monthly_income_expenses", { month: "2026-11" }) as { dataSource: { provider: string; live: boolean; label: string }; kind: string; result: { netCashFlow: number } };
  assert.equal(r.result.netCashFlow, 497.63);
  assert.equal(r.dataSource.provider, "fallback");
  assert.equal(r.dataSource.live, false);
  assert.match(r.dataSource.label, /Fictional/);
  assert.equal(r.kind, "calculated from stored rows");
  const tx = runBankingTool(U, "get_transactions", { query: "freshmart", limit: 5 }) as { transactions: { amount: number }[] };
  assert.deepEqual(tx.transactions.map((t) => t.amount), [91.12, 82.3]);
  assert.match(String((runBankingTool(U, "delete_everything") as { error: string }).error), /Unknown tool/);
  const answer = offlineBankingAnswer(U, "How much did I spend this month?")!;
  assert.match(answer, /\$952\.37/);
  assert.match(answer, /Fictional sample data/);
  assert.equal(offlineBankingAnswer(U, "What is a W-2?"), null);
});

// ---------- failure handling ----------
test("Nessie down: labelled fictional fallback, never presented as API data", async () => {
  const down = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  const r = await syncBanking(U, { config: cfg(down) });
  assert.equal(r.provider, "fallback");
  assert.equal(r.live, false);
  assert.match(r.label, /Fictional/);
  assert.ok(r.warnings.some((w) => /Nessie unavailable: Nessie network error/.test(w)));
  assert.equal(bankingOverview(U).source!.live, false);
});

test("Nessie down after a good import keeps showing stored Nessie rows, not fallback", async () => {
  await syncBanking(U, { config: cfg(fakeNessie().impl) });
  const down = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  const r = await syncBanking(U, { config: cfg(down) });
  assert.equal(r.provider, "nessie");
  assert.equal(r.live, false);
  assert.match(r.label, /previously imported/);
  assert.ok(activeRows(U).rows.every((t) => t.provider === "nessie"));
  assert.ok(!banking.transactions(U).some((t) => t.provider === "fallback"));
});

// ---------- SQL migration (Supabase) in PGlite ----------
test("migration: upsert is idempotent, keeps user categories, and enforces RLS", async () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const B = "22222222-2222-2222-2222-222222222222";
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
  const row = (category: string, amount = 23.5) => JSON.stringify({ id: "nessie:purchase:x1", user_id: A, provider: "nessie", external_id: "x1", kind: "purchase", account_id: "nessie:a1", txn_date: "2026-11-11", amount, direction: "outflow", description: "QX PAYMENT", merchant: "QX", category, category_source: "none", flow: "expense", status: "completed", needs_review: true, review_reasons: ["Purchase category unknown"], raw: {} });
  const up = (j: string) => db.query("select public.upsert_bank_transaction(jsonb_populate_record(null::public.bank_transactions, $1::jsonb))", [j]);
  await up(row("Uncategorized"));
  await up(row("Uncategorized"));
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.bank_transactions")).rows[0].n, 1);
  // User corrects the category (as themselves, through RLS).
  await db.exec(`select set_config('request.jwt.claim.sub', '${A}', false); set role authenticated;`);
  await db.query("update public.bank_transactions set category = 'Shopping', category_source = 'user' where id = 'nessie:purchase:x1'");
  await db.exec("reset role;");
  await up(row("Uncategorized", 24));
  const r = (await db.query<{ category: string; category_source: string; amount: string }>("select category, category_source, amount from public.bank_transactions")).rows[0];
  assert.deepEqual([r.category, r.category_source, Number(r.amount)], ["Shopping", "user", 24]);
  // Another user sees nothing.
  await db.exec(`select set_config('request.jwt.claim.sub', '${B}', false); set role authenticated;`);
  assert.equal((await db.query("select * from public.bank_transactions")).rows.length, 0);
  await db.exec("reset role;");
});
