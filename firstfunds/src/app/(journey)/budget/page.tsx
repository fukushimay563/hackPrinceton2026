"use client";
// My Budget: Nessie sandbox (or labelled fictional fallback) transactions, normalized and
// stored server-side. Every number comes from /api/banking (deterministic calculations).
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Database, RefreshCw, Repeat, Search } from "lucide-react";
import { Badge, Button, Card, PageHeader, Stat, cn } from "@/components/ui";
import { AdvisorTabs } from "@/components/AppShell";
import { IS_STATIC } from "@/lib/runtime";
import { usd } from "@/lib/format";
import type { BankAccount, BankTransaction, BudgetCategory } from "@/lib/banking/types";
import type { bankingOverview } from "@/lib/banking/overview";

type Overview = ReturnType<typeof bankingOverview>;
const EDITABLE: BudgetCategory[] = ["Food", "Groceries", "Shopping", "Transport", "Subscriptions", "Entertainment", "Bills", "Health", "Income", "Refund", "Uncategorized"];
const FLOW_LABEL: Record<BankTransaction["flow"], string> = { income: "Income", expense: "Spending", refund: "Refund", transfer: "Own transfer", excluded: "Not counted" };
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export default function BudgetPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState<string>("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [flow, setFlow] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [editing, setEditing] = useState<Record<string, BudgetCategory>>({});

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    if (q) p.set("q", q);
    if (category) p.set("category", category);
    if (flow) p.set("flow", flow);
    if (reviewOnly) p.set("needsReview", "true");
    try {
      const r = await fetch(`/api/banking?${p}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
      const d = (await r.json()) as Overview;
      setData(d);
      setError(null);
      if (!month && d.month) setMonth(d.month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your budget");
    }
  }, [month, q, category, flow, reviewOnly]);

  useEffect(() => {
    if (IS_STATIC) return;
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function resync() {
    setBusy(true);
    try {
      await fetch("/api/banking/sync", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(t: BankTransaction) {
    const next = editing[t.id];
    if (!next || next === t.category) return;
    const r = await fetch(`/api/banking/transactions/${encodeURIComponent(t.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: next, confirmedByUser: true }),
    });
    const d = await r.json();
    if (!r.ok) return setError(d.error || "Couldn't save");
    setEditing(({ [t.id]: _drop, ...rest }) => (void _drop, rest));
    await load();
  }

  if (IS_STATIC) {
    return (
      <div>
        <AdvisorTabs />
        <PageHeader title="My Budget" subtitle="My Budget needs the server version of FirstFunds (it imports Nessie sandbox data server-side)." />
      </div>
    );
  }

  const s = data?.summary;
  const maxCat = Math.max(1, ...(data?.byCategory ?? []).map((c) => c.amount));
  const accountName = (id: string) => {
    const a = data?.accounts.find((x: BankAccount) => x.id === id);
    return a ? `${a.nickname ?? a.type}${a.last4 ? ` ••${a.last4}` : ""}` : "Unknown account";
  };

  return (
    <div>
      <AdvisorTabs />
      <PageHeader
        title="My Budget"
        subtitle="Your demo accounts, transactions and spending, calculated from stored data."
        right={
          <Button variant="secondary" onClick={resync} disabled={busy}>
            <RefreshCw size={15} className={cn(busy && "animate-spin")} /> {busy ? "Syncing…" : "Sync demo data"}
          </Button>
        }
      />

      {data?.source && (
        <div className={cn("mb-4 flex items-start gap-2 rounded-2xl border p-3 text-sm", data.source.provider === "nessie" ? "border-info/30 bg-info-soft text-info" : "border-warn/30 bg-warn-soft text-warn")} role="status">
          <Database size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">{data.source.label}</div>
            {data.source.warnings.length > 0 && <div className="mt-1 opacity-90">{data.source.warnings.join(" ")}</div>}
          </div>
        </div>
      )}
      {error && <div className="mb-4 rounded-2xl border border-debt/30 bg-debt-soft p-3 text-sm text-debt" role="alert">{error}</div>}
      {!data && !error && <Card className="text-sm text-ink-3">Loading your demo banking data…</Card>}

      {data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-ink-2" htmlFor="month">Month</label>
            <select id="month" className="rounded-xl border border-line bg-card px-3 py-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
              {data.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            {data.needsReview > 0 && (
              <button type="button" onClick={() => setReviewOnly((v) => !v)} className="ml-auto">
                <Badge tone="warn"><AlertTriangle size={12} /> {data.needsReview} need review{reviewOnly ? " · showing" : ""}</Badge>
              </button>
            )}
          </div>

          {s && (
            <Card className="mb-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Stat label="Income" value={usd(s.income)} sub="deposits, not transfers" />
              <Stat label="Spending" value={usd(s.netSpending)} sub={s.refunds ? `after ${usd(s.refunds)} refunds` : "net of refunds"} />
              <Stat label="Net cash flow" value={usd(s.netCashFlow)} tone={s.netCashFlow >= 0 ? "good" : "bad"} />
              <Stat label="Own transfers" value={usd(s.transfersExcluded)} sub="not counted" />
            </Card>
          )}

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">Spending by category</h2>
              {data.byCategory.length === 0 && <p className="text-sm text-ink-3">No spending this month.</p>}
              <ul className="space-y-2.5">
                {data.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between text-sm"><span className="text-ink-2">{c.category}</span><span className="num font-semibold text-ink">{usd(c.amount)}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-ink/5"><div className="h-2 rounded-full bg-brand" style={{ width: `${(c.amount / maxCat) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h2 className="mb-1 font-semibold">Budget progress</h2>
              {data.budgetsAreDemo && <p className="mb-3 text-xs text-ink-3">Demo budget limits for the sample profile.</p>}
              <ul className="space-y-2.5">
                {data.budgets.map((b) => (
                  <li key={b.category}>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink-2">{b.category}</span>
                      <span className="num text-ink">{usd(b.spent)} of {usd(b.limit)} {b.status !== "ok" && <Badge tone={b.status === "over" ? "bad" : "warn"}>{b.status === "over" ? "Over" : "Near limit"}</Badge>}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-ink/5"><div className={cn("h-2 rounded-full", b.status === "over" ? "bg-debt" : b.status === "near" ? "bg-warn" : "bg-brand")} style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">Demo accounts</h2>
              <ul className="divide-y divide-line text-sm">
                {data.accounts.map((a) => (
                  <li key={a.id} className="flex justify-between py-2">
                    <span>{a.nickname ?? a.type} <span className="text-ink-3">· {a.type}{a.last4 ? ` ••${a.last4}` : ""}</span></span>
                    <span className="num font-semibold">{a.balance === null ? "—" : usd(a.balance)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><Repeat size={16} /> Recurring expense candidates</h2>
              {data.recurring.length === 0 && <p className="text-sm text-ink-3">No repeating charges found yet.</p>}
              <ul className="divide-y divide-line text-sm">
                {data.recurring.map((r) => (
                  <li key={r.merchant} className="flex justify-between py-2">
                    <span>{r.merchant} <span className="text-ink-3">· {r.cadence} · {r.occurrences}×</span></span>
                    <span className="num">~{usd(r.typicalAmount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3">Candidates based on repeated, similar charges. Not confirmed subscriptions.</p>
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-semibold">Transactions</h2>
              <label className="relative">
                <span className="sr-only">Search transactions</span>
                <Search size={14} className="absolute top-2.5 left-2.5 text-ink-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="rounded-xl border border-line py-1.5 pr-3 pl-8 text-sm" />
              </label>
              <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-line px-2 py-1.5 text-sm">
                <option value="">All categories</option>
                {[...EDITABLE, "Transfer", "Card payment"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <select aria-label="Filter by type" value={flow} onChange={(e) => setFlow(e.target.value)} className="rounded-xl border border-line px-2 py-1.5 text-sm">
                <option value="">All types</option>
                {Object.entries(FLOW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-3 uppercase">
                  <tr><th className="py-2 pr-3">Date</th><th className="pr-3">Description</th><th className="pr-3">Account</th><th className="pr-3">Type</th><th className="pr-3">Category</th><th className="text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.transactions.map((t) => (
                    <tr key={t.id} className="align-top">
                      <td className="num py-2 pr-3 whitespace-nowrap">{t.date ?? <span className="text-warn">No date</span>}</td>
                      <td className="pr-3">
                        {t.merchant ?? t.description ?? "—"}
                        {t.needsReview && <div className="mt-0.5 text-xs text-warn">⚠ {t.reviewReasons.join("; ")}</div>}
                      </td>
                      <td className="pr-3 text-ink-3">{accountName(t.accountId)}</td>
                      <td className="pr-3">{FLOW_LABEL[t.flow]}</td>
                      <td className="pr-3">
                        {t.flow === "transfer" || t.flow === "excluded" ? (
                          <span className="text-ink-3">{t.category}</span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <select aria-label={`Category for ${t.merchant ?? t.description ?? "transaction"}`} value={editing[t.id] ?? t.category} onChange={(e) => setEditing((m) => ({ ...m, [t.id]: e.target.value as BudgetCategory }))} className="rounded-lg border border-line px-1.5 py-1 text-xs">
                              {(EDITABLE.includes(t.category) ? EDITABLE : [t.category, ...EDITABLE]).map((c) => <option key={c}>{c}</option>)}
                            </select>
                            {editing[t.id] && editing[t.id] !== t.category && <Button className="px-2 py-1 text-xs" onClick={() => saveCategory(t)}>Save</Button>}
                            {t.categorySource === "user" && <Badge>yours</Badge>}
                          </span>
                        )}
                      </td>
                      <td className={cn("num text-right whitespace-nowrap", t.direction === "inflow" ? "text-brand" : "text-ink")}>{t.direction === "inflow" ? "+" : "−"}{usd(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-3">
              Showing {data.transactions.length} of {data.totalTransactions}. Saving a category applies it to future transactions from the same merchant.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
