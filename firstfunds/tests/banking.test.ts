// Nessie integration: client, normalization, persistence, money math, corrections,
// FinPilot tool access and failure handling. All network calls use a fake fetch.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { fetchNessieSnapshot, nessieConfigFromEnv, nessieConfigProblems, NessieError, type NessieConfig } from "../src/lib/banking/nessie";
import { centsToDollars, normalizeNessie, normalizeDate, normalizeAmount } from "../src/lib/banking/normalize";
import { captureLogs } from "../src/lib/agents/logger";
import { fallbackSnapshot } from "../src/lib/banking/fallback";
import { banking, DEMO_BANK_USER } from "../src/lib/banking/repository";
import { syncBanking } from "../src/lib/banking/sync";
import { monthlySummary, spendingByCategory, recurringCandidates, budgetProgress } from "../src/lib/banking/analytics";
import { activeRows, bankingOverview } from "../src/lib/banking/overview";
import { runBankingTool, offlineBankingAnswer } from "../src/lib/banking/copilotTools";

const U = DEMO_BANK_USER;
beforeEach(() => banking._reset());

// ---------- fake Nessie v2 server (documented GET endpoints only, Bearer auth, {items} lists) ----------
type Snap = ReturnType<typeof fallbackSnapshot>;
function fakeNessie(snapshot: Snap = fallbackSnapshot(), opts: { failPath?: RegExp; status?: number; pageSize?: number; body?: unknown } = {}) {
  const calls: { path: string; query: string; auth: string | null; method: string }[] = [];
  const page = (items: unknown[], url: URL) => {
    const size = opts.pageSize ?? 100;
    const start = Number(url.searchParams.get("cursor") ?? 0);
    const slice = items.slice(start, start + size);
    return Response.json(start + size < items.length ? { items: slice, next_cursor: String(start + size) } : { items: slice });
  };
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ path: url.pathname, query: url.search, auth, method: init?.method ?? "GET" });
    if (auth !== "Bearer nsk_test_key") return Response.json({ type: "about:blank", title: "Unauthorized", status: 401 }, { status: 401 });
    if (opts.failPath?.test(url.pathname)) return Response.json({ type: "about:blank", title: "Internal Server Error", status: opts.status ?? 500 }, { status: opts.status ?? 500 });
    if (opts.body !== undefined && url.pathname === "/accounts") return Response.json(opts.body);
    const p = url.pathname;
    let m: RegExpMatchArray | null;
    if (p === "/accounts") return page(snapshot.accounts, url);
    if ((m = p.match(/^\/accounts\/([^/]+)\/transactions$/))) return Response.json({ items: snapshot.transactions.find((t) => t.accountId === m![1])?.items ?? [] });
    if ((m = p.match(/^\/accounts\/([^/]+)\/bills$/))) return page(snapshot.bills.filter((b) => b.account_id === m![1]), url);
    if ((m = p.match(/^\/accounts\/([^/]+)\/loans$/))) return page(snapshot.loans.filter((l) => l.account_id === m![1]), url);
    if (p === "/merchants") return page(snapshot.merchants, url);
    return Response.json({ type: "about:blank", title: "Not Found", status: 404 }, { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

function cfg(fetchImpl: typeof fetch, extra: Partial<NessieConfig> = {}): NessieConfig {
  return { apiKey: "nsk_test_key", baseUrl: "https://nessie.test", timeoutMs: 1000, fetchImpl, ...extra };
}

const cardList = (s: Snap) => s.transactions.find((t) => t.accountId === "fallback-acct-creditcard01")!.items;
const checkingList = (s: Snap) => s.transactions.find((t) => t.accountId === "fallback-acct-checking0001")!.items;
const at = (d: string) => `${d}T12:00:00Z`;

// ---------- connectivity & retrieval ----------
test("client reads config from env, defaults to Nessie v2, and stays off without a key", () => {
  assert.equal(nessieConfigFromEnv({} as NodeJS.ProcessEnv), null);
  const c = nessieConfigFromEnv({ NESSIE_API_KEY: " nsk_k " } as unknown as NodeJS.ProcessEnv)!;
  assert.equal(c.baseUrl, "https://v2-prod-api.nessieisreal.com");
  assert.equal(c.apiKey, "nsk_k");
  assert.deepEqual(nessieConfigProblems({ NESSIE_API_KEY: "nsk_x" } as unknown as NodeJS.ProcessEnv), []);
  assert.equal(nessieConfigProblems({ NESSIE_API_KEY: "nsk_x", NESSIE_BASE_URL: "https://api.nessieisreal.com" } as unknown as NodeJS.ProcessEnv).length, 1);
});

test("Bearer auth in the Authorization header; the key never appears in any URL", async () => {
  const f = fakeNessie();
  const snap = await fetchNessieSnapshot(cfg(f.impl));
  assert.equal(snap.accounts.length, 3);
  assert.ok(f.calls.length > 0);
  for (const c of f.calls) {
    assert.equal(c.auth, "Bearer nsk_test_key");
    assert.ok(!c.query.includes("nsk_") && !c.query.includes("key="), c.query);
    assert.equal(c.method, "GET", "the client never writes to the sandbox");
  }
});

test("reads only documented v2 GET endpoints (no v1 paths, no money-moving POST paths)", async () => {
  const f = fakeNessie();
  await fetchNessieSnapshot(cfg(f.impl));
  for (const c of f.calls) assert.match(c.path, /^\/(accounts(\/[^/]+\/(transactions|bills|loans))?|merchants)$/, c.path);
  assert.ok(!f.calls.some((c) => /\/(deposits|withdrawals|purchases|transfers)$|\/purchase\/|\/data\/seed/.test(c.path)));
});

test("v2 list responses: {items}, next_cursor pagination and items:null", async () => {
  const s = fallbackSnapshot();
  const f = fakeNessie(s, { pageSize: 2 });
  const snap = await fetchNessieSnapshot(cfg(f.impl));
  assert.equal(snap.accounts.length, 3, "followed next_cursor across pages");
  assert.ok(f.calls.some((c) => c.path === "/accounts" && c.query.includes("cursor=2")));
  assert.equal(snap.merchants.length, 6);
  const nul = await fetchNessieSnapshot(cfg(fakeNessie(s, { body: { items: null } }).impl));
  assert.equal(nul.accounts.length, 0);
  await assert.rejects(fetchNessieSnapshot(cfg(fakeNessie(s, { body: [{ id: "x" }] }).impl)), /not a v2 list/);
});

test("bad key is a hard error that does not leak the key", async () => {
  const f = fakeNessie();
  await assert.rejects(fetchNessieSnapshot(cfg(f.impl, { apiKey: "nsk_wrong" })), (e: unknown) => e instanceof NessieError && e.status === 401 && !e.message.includes("nsk_wrong"));
});

test("per-account failures become warnings; account listing failure is fatal", async () => {
  const partial = await fetchNessieSnapshot(cfg(fakeNessie(undefined, { failPath: /\/bills$/ }).impl));
  assert.ok(partial.warnings.some((w) => /Bills/.test(w)));
  assert.equal(partial.transactions.length, 3);
  await assert.rejects(fetchNessieSnapshot(cfg(fakeNessie(undefined, { failPath: /^\/accounts$/, status: 503 }).impl)), /503/);
});

test("diagnostic logs show endpoint, status and counts, never the key, ids or data", async () => {
  const cap = captureLogs();
  try {
    await fetchNessieSnapshot(cfg(fakeNessie().impl));
    await fetchNessieSnapshot(cfg(fakeNessie(undefined, { failPath: /^\/accounts$/, status: 500 }).impl)).catch(() => {});
  } finally {
    cap.stop();
  }
  const lines = cap.lines();
  const reqs = lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.event === "nessie.request");
  assert.ok(reqs.some((r) => r.endpoint === "/accounts" && r.status === 200 && r.count === 3));
  assert.ok(reqs.some((r) => r.endpoint === "/accounts/{id}/transactions" && r.status === 200 && typeof r.count === "number"));
  assert.ok(reqs.some((r) => r.endpoint === "/accounts" && r.status === 500 && r.error));
  const all = lines.join("\n");
  assert.doesNotMatch(all, /nsk_test_key|Bearer|fallback-acct|ACME|FreshMart|0000000000000001/);
});

// ---------- normalization ----------
test("normalization keeps provenance, converts cents, and never invents data", () => {
  assert.equal(normalizeDate("2026-02-30"), null);
  assert.equal(normalizeDate(undefined), null);
  assert.equal(normalizeAmount("12.345"), 12.35);
  assert.equal(normalizeAmount(-5), null);
  assert.equal(centsToDollars(1234), 12.34);
  assert.equal(centsToDollars(12.5), null, "non-integer cents are rejected, not rounded");
  const s = fallbackSnapshot();
  cardList(s).push({ id: "p-nodate", kind: "purchase", status: "completed", medium: "balance", amount_cents: 900, description: "Pizza place", payer_id: "fallback-acct-creditcard01" });
  cardList(s).push({ id: "p-noamount", kind: "purchase", status: "completed", medium: "balance", description: "Ghost", payer_id: "fallback-acct-creditcard01", created_at: at("2026-11-01") });
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
  assert.equal(coffee.amount, 6.75);
  assert.equal(coffee.date, "2026-10-04");
  const card = out.accounts.find((a) => a.type === "Credit Card")!;
  assert.deepEqual([card.balance, card.available, card.creditLimit, card.last4], [312, 688, 1000, "0003"]);
  assert.ok(!("account_number" in out.accounts[0]));
  assert.equal(out.transactions.filter((t) => t.externalId === "fallback-tr-0002").length, 1, "a transfer listed under two accounts is stored once");
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
  const s = fallbackSnapshot();
  cardList(s).push({ id: "cc-pay", kind: "deposit", status: "completed", medium: "balance", amount_cents: 10000, description: "Payment received", payee_id: "fallback-acct-creditcard01", created_at: at("2026-11-20") });
  const cc = normalizeNessie({ provider: "fallback", userId: U, ...s }).transactions.find((t) => t.externalId === "cc-pay")!;
  assert.equal(cc.flow, "transfer");
});

test("v2 kinds: bill payments, fees, interest, refunds, chargebacks, pending, declined and rewards", () => {
  const s = fallbackSnapshot();
  const ck = "fallback-acct-checking0001";
  s.bills.push({ id: "bill-1", account_id: ck, status: "recurring", payee: "City Electric Utility", payment_amount: 64.5, upcoming_payment_date: "2026-12-05", recurring_date: 5, creation_date: "2026-09-01", created_at: at("2026-09-01"), updated_at: at("2026-09-01") });
  s.loans.push({ id: "loan-1", account_id: ck, type: "auto", status: "approved", credit_score: 712, amount_cents: 1200000, monthly_payment_cents: 25000, description: "Car loan", creation_date: "2026-09-01", created_at: at("2026-09-01"), updated_at: at("2026-09-01") });
  const base = { status: "completed", medium: "balance", created_at: at("2026-11-15") };
  checkingList(s).push(
    { ...base, id: "k-bill", kind: "bill_payment", amount_cents: 6450, payer_id: ck, bill_id: "bill-1" },
    { ...base, id: "k-fee", kind: "fee", amount_cents: 500, payer_id: ck, description: "Monthly maintenance fee" },
    { ...base, id: "k-int", kind: "interest_credit", amount_cents: 123, payee_id: ck },
    { ...base, id: "k-ref", kind: "refund", amount_cents: 2000, payee_id: ck, description: "Store refund", parent_transaction_id: "x" },
    { ...base, id: "k-cb", kind: "chargeback", amount_cents: 2000, payer_id: ck },
    { ...base, id: "k-pend", kind: "purchase", amount_cents: 1500, payer_id: ck, status: "pending", description: "Coffee" },
    { ...base, id: "k-decl", kind: "purchase", amount_cents: 9999, payer_id: ck, status: "declined", description: "Electronics store" },
    { ...base, id: "k-pts", kind: "purchase", amount_cents: 300, payer_id: ck, medium: "rewards", description: "Coffee" },
    { ...base, id: "k-odd", kind: "teleport", amount_cents: 100, payer_id: ck },
  );
  const out = normalizeNessie({ provider: "nessie", userId: U, ...s });
  const t = (id: string) => out.transactions.find((x) => x.externalId === id)!;
  assert.deepEqual([t("k-bill").flow, t("k-bill").category, t("k-bill").merchant, t("k-bill").amount], ["expense", "Bills", "City Electric Utility", 64.5]);
  assert.deepEqual([t("k-fee").flow, t("k-fee").direction], ["expense", "outflow"]);
  assert.deepEqual([t("k-int").flow, t("k-int").direction, t("k-int").amount], ["income", "inflow", 1.23]);
  assert.deepEqual([t("k-ref").flow, t("k-ref").direction], ["refund", "inflow"]);
  assert.equal(t("k-cb").flow, "excluded");
  assert.equal(t("k-pend").flow, "expense");
  assert.ok(t("k-pend").reviewReasons.some((r) => /Pending/.test(r)));
  assert.equal(t("k-decl").flow, "excluded");
  assert.equal(t("k-pts").flow, "excluded");
  assert.ok(out.skipped.some((x) => x.externalId === "k-odd" && /unknown transaction kind/.test(x.reason)));
  assert.deepEqual(out.bills.map((b) => [b.payee, b.amount, b.upcomingPaymentDate, b.recurringDay]), [["City Electric Utility", 64.5, "2026-12-05", 5]]);
  assert.deepEqual(out.loans.map((l) => [l.type, l.amount, l.monthlyPayment, l.creditScore]), [["auto", 12000, 250, 712]]);
});

// ---------- persistence & duplicates ----------
test("repeated sync is idempotent (no duplicates)", async () => {
  const f = fakeNessie();
  const r1 = await syncBanking(U, { config: cfg(f.impl) });
  assert.equal(r1.provider, "nessie");
  assert.equal(r1.live, true);
  assert.equal(r1.nessieStatus, "ok");
  assert.equal(r1.inserted, 20); // 4 deposits + 3 withdrawals + 9 purchases + 4 transfers (each once)
  assert.ok(r1.requests.some((q) => q.endpoint === "/accounts" && q.status === 200 && q.count === 3));
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
  const snap = fallbackSnapshot();
  cardList(snap).push({ id: "fallback-pur-0100", kind: "purchase", status: "completed", medium: "balance", merchant_id: "fallback-m-misc", created_at: at("2026-11-20"), amount_cents: 1200, description: "QX*8812 PAYMENT", payer_id: "fallback-acct-creditcard01" });
  await syncBanking(U, { config: cfg(fakeNessie(snap).impl) });
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

test("FinPilot sees sandbox accounts, bills and loans from Nessie", async () => {
  const s = fallbackSnapshot();
  s.bills.push({ id: "bill-9", account_id: "fallback-acct-checking0001", status: "recurring", payee: "StreamFlix", payment_amount: 15.49, upcoming_payment_date: "2026-12-01", creation_date: "2026-09-01", created_at: at("2026-09-01"), updated_at: at("2026-09-01") });
  await syncBanking(U, { config: cfg(fakeNessie(s).impl) });
  const r = runBankingTool(U, "accounts_bills_loans") as { dataSource: { live: boolean }; accounts: { type: string; balance: number; creditLimit: number | null }[]; bills: { payee: string; amount: number }[] };
  assert.equal(r.dataSource.live, true);
  assert.deepEqual(r.accounts.find((a) => a.type === "Credit Card"), { type: "Credit Card", nickname: "Starter card (sample)", balance: 312, available: 688, creditLimit: 1000, last4: "0003" });
  assert.deepEqual(r.bills, [{ payee: "StreamFlix", nickname: null, status: "recurring", amount: 15.49, upcomingPaymentDate: "2026-12-01", recurringDay: null }]);
});

// ---------- empty vs failure ----------
test("empty Nessie sandbox ({items:[]}) is a success: no fictional data, clear empty label", async () => {
  const empty: Snap = { ...fallbackSnapshot(), accounts: [], transactions: [], merchants: [] };
  const r = await syncBanking(U, { config: cfg(fakeNessie(empty).impl) });
  assert.equal(r.nessieStatus, "empty");
  assert.equal(r.provider, "nessie");
  assert.equal(r.live, true);
  assert.equal(r.accounts, 0);
  assert.match(r.label, /no accounts yet/);
  assert.ok(!r.warnings.some((w) => /unavailable/.test(w)));
  assert.equal(banking.transactions(U).length, 0, "no fallback rows were stored");
  const ov = bankingOverview(U);
  assert.equal(ov.source!.nessieStatus, "empty");
  assert.equal(ov.transactions.length, 0);
  assert.match(String((runBankingTool(U, "monthly_income_expenses") as { error: string }).error), /no accounts yet.*not an error/);
  assert.match(offlineBankingAnswer(U, "How much did I spend this month?")!, /no accounts yet/);
});

test("sandbox emptied after an import: stale Nessie rows are removed, not shown as current", async () => {
  await syncBanking(U, { config: cfg(fakeNessie().impl) });
  assert.ok(banking.transactions(U).length > 0);
  const empty: Snap = { ...fallbackSnapshot(), accounts: [], transactions: [], merchants: [] };
  await syncBanking(U, { config: cfg(fakeNessie(empty).impl) });
  assert.equal(banking.transactions(U).filter((t) => t.provider === "nessie").length, 0);
  assert.equal(banking.accounts(U).filter((a) => a.provider === "nessie").length, 0);
});

test("API failure (500) is an error: labelled fictional fallback, never presented as API data", async () => {
  const r = await syncBanking(U, { config: cfg(fakeNessie(undefined, { failPath: /^\/accounts$/, status: 500 }).impl) });
  assert.equal(r.nessieStatus, "error");
  assert.equal(r.provider, "fallback");
  assert.equal(r.live, false);
  assert.match(r.label, /Fictional.*request failed/);
  assert.ok(r.warnings.some((w) => /Nessie unavailable: Nessie returned 500/.test(w)));
  assert.deepEqual(r.requests, [{ endpoint: "/accounts", status: 500, count: null }]);
});

test("Nessie down (network): labelled fictional fallback, never presented as API data", async () => {
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const r = await syncBanking(U, { config: cfg(down) });
  assert.equal(r.provider, "fallback");
  assert.equal(r.nessieStatus, "error");
  assert.equal(r.live, false);
  assert.match(r.label, /Fictional/);
  assert.ok(r.warnings.some((w) => /Nessie unavailable: Nessie network error/.test(w)));
  assert.equal(bankingOverview(U).source!.live, false);
});

test("not configured: labelled fictional fallback with the reason", async () => {
  const r = await syncBanking(U, { config: null });
  assert.equal(r.nessieStatus, "not-configured");
  assert.match(r.label, /Fictional.*isn't configured/);
});

test("Nessie down after a good import keeps showing stored Nessie rows, not fallback", async () => {
  await syncBanking(U, { config: cfg(fakeNessie().impl) });
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const r = await syncBanking(U, { config: cfg(down) });
  assert.equal(r.provider, "nessie");
  assert.equal(r.live, false);
  assert.equal(r.nessieStatus, "error");
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
  // v2 kinds are accepted by the migrated constraint; bills/loans tables exist with RLS.
  await up(JSON.stringify({ ...JSON.parse(row("Bills", 64.5)), id: "nessie:bill_payment:b1", external_id: "b1", kind: "bill_payment" }));
  await db.exec("delete from public.bank_transactions where id = 'nessie:bill_payment:b1'");
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from information_schema.tables where table_name in ('bank_bills','bank_loans')")).rows[0].n, 2);
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
