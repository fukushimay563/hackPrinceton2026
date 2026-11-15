// Controlled, read-only backend functions FinPilot can call. Each result says where the
// numbers came from (verified rows vs. calculated vs. needs review), so the model explains
// stored data instead of inventing figures. Writes (e.g. category changes) are NOT exposed.
import { budgetProgress, filterTransactions, monthlySummary, recurringCandidates, spendingByCategory, availableMonths } from "./analytics";
import { activeRows } from "./overview";
import { banking } from "./repository";

export const BANKING_TOOL_DECLARATIONS = [
  {
    name: "get_transactions",
    description: "Search the user's stored transactions (demo/sandbox data). Returns verified stored rows.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to match in merchant, description or category" },
        category: { type: "string" },
        month: { type: "string", description: "YYYY-MM" },
        needsReview: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      },
    },
  },
  {
    name: "monthly_income_expenses",
    description: "Calculate income, spending (net of refunds), and net cash flow for a month from stored rows. Own-account transfers are excluded.",
    parametersJsonSchema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM; defaults to latest month with data" } } },
  },
  {
    name: "spending_by_category",
    description: "Calculate spending per category for a month from stored rows.",
    parametersJsonSchema: { type: "object", properties: { month: { type: "string" } } },
  },
  {
    name: "recurring_expenses",
    description: "List recurring expense CANDIDATES (same merchant, similar amount, repeated across months). These are candidates, not confirmed subscriptions.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "accounts_bills_loans",
    description: "List the user's sandbox accounts (type, nickname, balance, available, credit limit, last 4 digits), bills (payee, amount, status, next date) and loans (type, amount, monthly payment, status) exactly as stored.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "budget_progress",
    description: "Compare each category's spending this month with the user's budget limits.",
    parametersJsonSchema: { type: "object", properties: { month: { type: "string" } } },
  },
] as const;

export type BankingToolName = (typeof BANKING_TOOL_DECLARATIONS)[number]["name"];
const NAMES = new Set<string>(BANKING_TOOL_DECLARATIONS.map((d) => d.name));

export function runBankingTool(userId: string, name: string, args: Record<string, unknown> = {}) {
  if (!NAMES.has(name)) return { error: `Unknown tool ${name}` };
  const last = banking.lastSync(userId);
  const { provider, rows } = activeRows(userId);
  if (last?.nessieStatus === "empty")
    return { error: "The Capital One Nessie sandbox is connected but has no accounts yet, so there is no banking data to analyze. This is an empty sandbox, not an error. Don't invent figures." };
  const dataSource = last ? { provider: last.provider, live: last.live, nessieStatus: last.nessieStatus, label: last.label } : null;
  if (last && name === "accounts_bills_loans") {
    const accounts = banking.accounts(userId).filter((a) => a.provider === provider);
    return {
      dataSource,
      kind: "verified stored records",
      accounts: accounts.map((a) => ({ type: a.type, nickname: a.nickname, balance: a.balance, available: a.available, creditLimit: a.creditLimit, last4: a.last4 })),
      bills: banking.bills(userId).filter((b) => b.provider === provider).map(({ payee, nickname, status, amount, upcomingPaymentDate, recurringDay }) => ({ payee, nickname, status, amount, upcomingPaymentDate, recurringDay })),
      loans: banking.loans(userId).filter((l) => l.provider === provider).map(({ type, status, description, amount, monthlyPayment, creditScore }) => ({ type, status, description, amount, monthlyPayment, creditScore })),
    };
  }
  if (!last || !rows.length) return { error: "No banking data has been imported yet. The user can import demo data on the My Budget page." };
  const months = availableMonths(rows);
  const m = typeof args.month === "string" && months.includes(args.month) ? args.month : months[months.length - 1];
  const review = (month?: string) => rows.filter((t) => t.needsReview && (!month || t.date?.startsWith(month))).length;

  switch (name as BankingToolName) {
    case "get_transactions": {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
      const list = filterTransactions(rows, {
        q: typeof args.query === "string" ? args.query : undefined,
        category: typeof args.category === "string" ? args.category : undefined,
        month: typeof args.month === "string" ? args.month : undefined,
        needsReview: typeof args.needsReview === "boolean" ? args.needsReview : undefined,
        limit,
      });
      return {
        dataSource,
        kind: "verified stored rows",
        transactions: list.map((t) => ({ date: t.date, merchant: t.merchant ?? t.description, amount: t.amount, direction: t.direction, category: t.category, categorySource: t.categorySource, countsAs: t.flow, needsReview: t.needsReview, reviewReasons: t.reviewReasons })),
      };
    }
    case "monthly_income_expenses":
      return { dataSource, kind: "calculated from stored rows", month: m, availableMonths: months, result: monthlySummary(rows, m), rowsNeedingReview: review(m) };
    case "spending_by_category":
      return { dataSource, kind: "calculated from stored rows", month: m, result: spendingByCategory(rows, m), rowsNeedingReview: review(m) };
    case "recurring_expenses":
      return { dataSource, kind: "estimate: pattern-based candidates, not confirmed", result: recurringCandidates(rows) };
    case "accounts_bills_loans":
      return { error: "No banking data has been imported yet." };
    case "budget_progress": {
      const budgets = banking.budgets(userId);
      return { dataSource, kind: "calculated from stored rows and the user's budget limits", month: m, budgetsAreDemoDefaults: userId === "tenant_demo_maya", result: budgetProgress(rows, m, budgets) };
    }
  }
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Deterministic answer used when Gemini is unavailable. Returns null if the question isn't about the user's banking data. */
export function offlineBankingAnswer(userId: string, question: string): string | null {
  if (!/\b(spend|spent|spending|budget|income|expense|transaction|recurring|subscription|cash ?flow|categor|bank|purchase|deposit)/i.test(question)) return null;
  const s = runBankingTool(userId, "monthly_income_expenses") as Record<string, unknown>;
  if ("error" in s) return String(s.error).replace(" Don't invent figures.", "");
  const src = (s.dataSource as { label: string } | null)?.label ?? "stored data";
  const r = s.result as ReturnType<typeof monthlySummary>;
  const cats = (runBankingTool(userId, "spending_by_category") as { result: ReturnType<typeof spendingByCategory> }).result.slice(0, 3);
  const rec = (runBankingTool(userId, "recurring_expenses") as { result: ReturnType<typeof recurringCandidates> }).result;
  const parts = [
    `For ${r.month} (calculated from your stored transactions): income ${money(r.income)}, spending ${money(r.netSpending)} after ${money(r.refunds)} in refunds, net cash flow ${money(r.netCashFlow)}. Transfers between your own accounts (${money(r.transfersExcluded)}) aren't counted.`,
    cats.length ? `Top categories: ${cats.map((c) => `${c.category} ${money(c.amount)}`).join(", ")}.` : "",
    rec.length ? `Possible recurring charges (candidates, not confirmed): ${rec.slice(0, 3).map((c) => `${c.merchant} ~${money(c.typicalAmount)}`).join(", ")}.` : "",
    s.rowsNeedingReview ? `${s.rowsNeedingReview} transaction(s) this month need your review on My Budget.` : "",
    `Source: ${src}`,
  ];
  return parts.filter(Boolean).join(" ");
}
