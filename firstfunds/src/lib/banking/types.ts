// Normalized banking schema shared by the Nessie client, the store, My Budget and FinPilot.
// It extends the demo `Transaction` shape (id, date, merchant, category, amount) with the
// provenance and classification fields needed for accurate budgeting.
import type { Transaction } from "../demo/maya";

export type Provider = "nessie" | "fallback";
/** Nessie v2 transaction kinds (TransactionDTO.kind). */
export type NessieKind = "purchase" | "deposit" | "withdrawal" | "transfer" | "bill_payment" | "fee" | "interest_credit" | "refund" | "chargeback";

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
  /** Posted balance in dollars; for a credit card, the amount owed. */
  balance: number | null;
  /** Spendable now (balance minus holds), or remaining credit on a card. */
  available: number | null;
  creditLimit: number | null;
  /** Only the last 4 digits are kept; the full account number is never stored. */
  last4: string | null;
};

export type BankBill = {
  id: string;
  provider: Provider;
  accountId: string;
  payee: string | null;
  nickname: string | null;
  status: string | null;
  amount: number | null; // dollars (Nessie sends bills in dollars)
  upcomingPaymentDate: string | null;
  recurringDay: number | null;
};

export type BankLoan = {
  id: string;
  provider: Provider;
  accountId: string;
  type: string | null;
  status: string | null;
  description: string | null;
  amount: number | null; // dollars (converted from cents)
  monthlyPayment: number | null;
  creditScore: number | null;
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

/**
 * Outcome of the latest Nessie read, distinct from "which rows are shown":
 * ok            — Nessie answered and has accounts
 * empty         — Nessie answered successfully but the sandbox has no accounts (NOT an error)
 * error         — the request failed (auth, network, 5xx, bad response)
 * not-configured — NESSIE_API_KEY is not set
 */
export type NessieStatus = "ok" | "empty" | "error" | "not-configured";

export type SyncReport = {
  provider: Provider;
  live: boolean; // true only when data actually came from the Nessie API
  nessieStatus: NessieStatus;
  /** Per-request diagnostics (endpoint template, HTTP status, record count). */
  requests: { endpoint: string; status: number | null; count: number | null }[];
  label: string;
  accounts: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: { kind: string; externalId: string | null; reason: string }[];
  warnings: string[];
  syncedAt: number;
};
