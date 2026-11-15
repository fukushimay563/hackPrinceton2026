// Normalized banking schema shared by the Nessie client, the store, My Budget and FinPilot.
// It extends the demo `Transaction` shape (id, date, merchant, category, amount) with the
// provenance and classification fields needed for accurate budgeting.
import type { Transaction } from "../demo/maya";

export type Provider = "nessie" | "fallback";
export type NessieKind = "purchase" | "deposit" | "withdrawal" | "transfer";

/** Categories: the app's existing spending categories plus non-spending buckets. */
export type BudgetCategory =
  | Transaction["category"]
  | "Groceries"
  | "Health"
  | "Income"
  | "Refund"
  | "Transfer"
  | "Card payment"
  | "Uncategorized";

export const SPENDING_CATEGORIES: BudgetCategory[] = [
  "Food", "Groceries", "Shopping", "Transport", "Subscriptions", "Entertainment", "Bills", "Health", "Uncategorized",
];

/**
 * How a row counts in budgeting math:
 * income   — counted as income (deposits that aren't refunds or transfers)
 * expense  — counted as spending
 * refund   — reduces spending in its category; never income
 * transfer — money moving between the user's own accounts (incl. paying their own card); excluded
 * excluded — not counted (cancelled, or external transfers awaiting review)
 */
export type Flow = "income" | "expense" | "refund" | "transfer" | "excluded";

export type CategorySource = "provider" | "rule" | "user" | "none";

export type BankAccount = {
  id: string; // stable: `${provider}:${externalId}`
  provider: Provider;
  externalId: string;
  userId: string;
  type: "Checking" | "Savings" | "Credit Card" | "Unknown";
  nickname: string | null;
  balance: number | null;
  /** Only the last 4 digits are kept; the full account number is never stored. */
  last4: string | null;
};

export type BankTransaction = {
  id: string; // stable: `${provider}:${kind}:${externalId}`
  provider: Provider;
  externalId: string;
  kind: NessieKind;
  accountId: string; // BankAccount.id
  userId: string;
  date: string | null; // YYYY-MM-DD; null when the provider didn't send one (never invented)
  amount: number; // always positive; direction comes from `flow`/`direction`
  direction: "inflow" | "outflow";
  description: string | null;
  merchant: string | null;
  category: BudgetCategory;
  categorySource: CategorySource;
  flow: Flow;
  status: string | null;
  needsReview: boolean;
  reviewReasons: string[];
  /** Original provider record, unmodified, for audit. */
  raw: Record<string, unknown>;
  importedAt: number;
};

export type SyncReport = {
  provider: Provider;
  live: boolean; // true only when data actually came from the Nessie API
  label: string;
  accounts: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: { kind: string; externalId: string | null; reason: string }[];
  warnings: string[];
  syncedAt: number;
};
