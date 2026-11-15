// One read model for My Budget and FinPilot, so both always show the same numbers.
// Pure functions over one BankingData load (see repository.ts), so every serverless
// instance computes the same result from the same stored records.
import { availableMonths, budgetProgress, filterTransactions, monthlySummary, recurringCandidates, spendingByCategory, type TxFilters } from "./analytics";
import type { BankingData } from "./storeCore";
import type { BankTransaction, Provider } from "./types";

/** Rows from the provider of the latest sync only — fallback and Nessie data are never mixed. */
export function activeRows(data: BankingData): { provider: Provider | null; rows: BankTransaction[] } {
  const last = data.lastSync;
  if (!last) return { provider: null, rows: [] };
  return { provider: last.provider, rows: data.transactions.filter((t) => t.provider === last.provider) };
}

export function bankingOverview(data: BankingData, userId: string, opts: { month?: string; filters?: TxFilters } = {}) {
  const last = data.lastSync;
  const { provider, rows } = activeRows(data);
  const months = availableMonths(rows);
  const month = opts.month && months.includes(opts.month) ? opts.month : months[months.length - 1] ?? null;
  const accounts = data.accounts.filter((a) => a.provider === provider);
  return {
    source: last
      ? { provider: last.provider, live: last.live, nessieStatus: last.nessieStatus, label: last.label, syncedAt: last.syncedAt, warnings: last.warnings, skipped: last.skipped.length }
      : null,
    accounts,
    bills: data.bills.filter((b) => b.provider === provider),
    loans: data.loans.filter((l) => l.provider === provider),
    months,
    month,
    summary: month ? monthlySummary(rows, month) : null,
    trend: months.map((m) => {
      const x = monthlySummary(rows, m);
      return { month: m, income: x.income, spending: x.netSpending };
    }),
    byCategory: month ? spendingByCategory(rows, month) : [],
    recurring: recurringCandidates(rows),
    budgets: month ? budgetProgress(rows, month, data.budgets) : [],
    budgetsAreDemo: !!last && userId === "tenant_demo_maya",
    needsReview: rows.filter((t) => t.needsReview).length,
    transactions: filterTransactions(rows, { limit: 200, ...opts.filters }),
    totalTransactions: rows.length,
  };
}
