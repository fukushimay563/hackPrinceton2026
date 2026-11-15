// Deterministic budgeting math. Every figure shown in My Budget or quoted by FinPilot
// comes from these functions over stored rows — nothing is hardcoded or model-generated.
import { merchantKey } from "./normalize";
import { SPENDING_CATEGORIES, type BankTransaction, type BudgetCategory } from "./types";

const cents = (n: number) => Math.round(n * 100) / 100;
const monthOf = (t: BankTransaction) => (t.date ? t.date.slice(0, 7) : null);

export function availableMonths(txs: BankTransaction[]): string[] {
  return [...new Set(txs.map(monthOf).filter((m): m is string => !!m))].sort();
}

export type MonthlySummary = {
  month: string;
  income: number;
  grossSpending: number;
  refunds: number;
  netSpending: number;
  netCashFlow: number;
  transfersExcluded: number;
  transactionCount: number;
  needsReviewCount: number;
};

export function monthlySummary(txs: BankTransaction[], month: string): MonthlySummary {
  const rows = txs.filter((t) => monthOf(t) === month);
  const sum = (f: BankTransaction["flow"]) => cents(rows.filter((t) => t.flow === f).reduce((a, t) => a + t.amount, 0));
  const income = sum("income");
  const grossSpending = sum("expense");
  const refunds = sum("refund");
  const netSpending = cents(grossSpending - refunds);
  return {
    month,
    income,
    grossSpending,
    refunds,
    netSpending,
    netCashFlow: cents(income - netSpending),
    transfersExcluded: sum("transfer"),
    transactionCount: rows.length,
    needsReviewCount: rows.filter((t) => t.needsReview).length,
  };
}

export type CategorySpend = { category: BudgetCategory; amount: number; count: number };

export function spendingByCategory(txs: BankTransaction[], month: string): CategorySpend[] {
  const map = new Map<BudgetCategory, CategorySpend>();
  for (const t of txs) {
    if (monthOf(t) !== month || t.flow !== "expense") continue;
    const row = map.get(t.category) ?? { category: t.category, amount: 0, count: 0 };
    row.amount = cents(row.amount + t.amount);
    row.count++;
    map.set(t.category, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export type RecurringCandidate = {
  merchant: string;
  occurrences: number;
  months: string[];
  typicalAmount: number;
  cadence: "monthly" | "weekly" | "irregular";
  lastDate: string;
  confidence: "candidate"; // always a candidate — never asserted as a confirmed subscription
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Same merchant, ≥2 dated charges in ≥2 different months, amounts within 15% of the median. */
export function recurringCandidates(txs: BankTransaction[]): RecurringCandidate[] {
  const groups = new Map<string, BankTransaction[]>();
  for (const t of txs) {
    if (t.flow !== "expense" || !t.date) continue;
    const k = merchantKey(t.merchant ?? t.description);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const out: RecurringCandidate[] = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const months = [...new Set(rows.map((r) => r.date!.slice(0, 7)))].sort();
    if (months.length < 2) continue;
    const med = median(rows.map((r) => r.amount));
    if (!rows.every((r) => Math.abs(r.amount - med) <= med * 0.15)) continue;
    const dates = rows.map((r) => Date.parse(`${r.date}T00:00:00Z`)).sort((a, b) => a - b);
    const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / 86_400_000);
    const g = median(gaps);
    out.push({
      merchant: rows[0].merchant ?? rows[0].description ?? "Unknown",
      occurrences: rows.length,
      months,
      typicalAmount: cents(med),
      cadence: g >= 25 && g <= 35 ? "monthly" : g >= 6 && g <= 8 ? "weekly" : "irregular",
      lastDate: new Date(dates[dates.length - 1]).toISOString().slice(0, 10),
      confidence: "candidate",
    });
  }
  return out.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

export type Budgets = Partial<Record<BudgetCategory, number>>;
export type BudgetLine = { category: BudgetCategory; limit: number; spent: number; remaining: number; pct: number; status: "ok" | "near" | "over" };

export function budgetProgress(txs: BankTransaction[], month: string, budgets: Budgets): BudgetLine[] {
  const spend = new Map(spendingByCategory(txs, month).map((c) => [c.category, c.amount]));
  return SPENDING_CATEGORIES.filter((c) => typeof budgets[c] === "number" && budgets[c]! > 0).map((category) => {
    const limit = budgets[category]!;
    const spent = spend.get(category) ?? 0;
    const pct = Math.round((spent / limit) * 1000) / 10;
    return { category, limit, spent, remaining: cents(limit - spent), pct, status: pct > 100 ? "over" : pct >= 80 ? "near" : "ok" };
  });
}

export type TxFilters = { q?: string; category?: string; month?: string; accountId?: string; flow?: string; needsReview?: boolean; limit?: number };

export function filterTransactions(txs: BankTransaction[], f: TxFilters): BankTransaction[] {
  const q = f.q?.trim().toLowerCase();
  const rows = txs.filter(
    (t) =>
      (!q || [t.merchant, t.description, t.category].some((s) => s?.toLowerCase().includes(q))) &&
      (!f.category || t.category === f.category) &&
      (!f.month || monthOf(t) === f.month) &&
      (!f.accountId || t.accountId === f.accountId) &&
      (!f.flow || t.flow === f.flow) &&
      (f.needsReview === undefined || t.needsReview === f.needsReview),
  );
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id));
  return f.limit ? rows.slice(0, f.limit) : rows;
}
