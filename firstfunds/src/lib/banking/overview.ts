// One read model for My Budget and FinPilot, so both always show the same numbers.
import { availableMonths, budgetProgress, filterTransactions, monthlySummary, recurringCandidates, spendingByCategory, type TxFilters } from "./analytics";
import { banking } from "./repository";
import type { BankTransaction, Provider } from "./types";

/** Rows from the provider of the latest sync only — fallback and Nessie data are never mixed. */
export function activeRows(userId: string): { provider: Provider | null; rows: BankTransaction[] } {
  const last = banking.lastSync(userId);
  if (!last) return { provider: null, rows: [] };
  return { provider: last.provider, rows: banking.transactions(userId).filter((t) => t.provider === last.provider) };
}

export function bankingOverview(userId: string, opts: { month?: string; filters?: TxFilters } = {}) {
  const last = banking.lastSync(userId);
  const { provider, rows } = activeRows(userId);
  const months = availableMonths(rows);
  const month = opts.month && months.includes(opts.month) ? opts.month : months[months.length - 1] ?? null;
  const accounts = banking.accounts(userId).filter((a) => a.provider === provider);
  return {
    source: last ? { provider: last.provider, live: last.live, label: last.label, syncedAt: last.syncedAt, warnings: last.warnings, skipped: last.skipped.length } : null,
    accounts,
    months,
    month,
    summary: month ? monthlySummary(rows, month) : null,
    trend: months.map((m) => {
      const x = monthlySummary(rows, m);
      return { month: m, income: x.income, spending: x.netSpending };
    }),
    byCategory: month ? spendingByCategory(rows, month) : [],
    recurring: recurringCandidates(rows),
    budgets: month ? budgetProgress(rows, month, banking.budgets(userId)) : [],
    budgetsAreDemo: !!last && userId === "tenant_demo_maya",
    needsReview: rows.filter((t) => t.needsReview).length,
    transactions: filterTransactions(rows, { limit: 200, ...opts.filters }),
    totalTransactions: rows.length,
  };
}
