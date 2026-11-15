// Shared banking-store contract (no runtime dependencies on either backend).
import type { Corrections } from "./normalize";
import type { Budgets } from "./analytics";
import type { BankAccount, BankBill, BankLoan, BankTransaction, BudgetCategory, Provider, SyncReport } from "./types";

export const DEMO_BANK_USER = "tenant_demo_maya";

/** Demo budgets for the demo user only. Labelled as such in the UI; users can change them. */
export const DEMO_BUDGETS: Budgets = { Food: 200, Groceries: 250, Shopping: 150, Transport: 120, Subscriptions: 40, Entertainment: 80, Bills: 1000 };

export type BankingData = {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  bills: BankBill[];
  loans: BankLoan[];
  /** User-set limits, or the demo defaults for the demo profile. */
  budgets: Budgets;
  corrections: Corrections;
  lastSync: SyncReport | null;
};

export type SyncWrite = {
  provider: Provider;
  accounts: BankAccount[];
  transactions: BankTransaction[];
  /** Omit to leave stored bills/loans untouched. */
  bills?: BankBill[];
  loans?: BankLoan[];
  /** After a successful provider read: delete that provider's records not in this write. */
  prune: boolean;
  /** Stored with the counts merged in. */
  report: Omit<SyncReport, "inserted" | "updated" | "unchanged">;
};

export type WriteCounts = { inserted: number; updated: number; unchanged: number };

export class BankingStoreError extends Error {
  constructor(
    message: string,
    readonly op: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "BankingStoreError";
  }
}

/** A user-facing validation error (e.g. "Transaction not found"), not a database failure. */
export class BankingRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankingRuleError";
  }
}

export interface BankingStore {
  readonly backend: "memory" | "supabase";
  load(userId: string): Promise<BankingData>;
  applySync(userId: string, write: SyncWrite): Promise<WriteCounts>;
  setCategory(userId: string, id: string, category: BudgetCategory): Promise<BankTransaction>;
  setBudgets(userId: string, budgets: Budgets): Promise<Budgets>;
}

export function cleanBudgets(budgets: Budgets): Budgets {
  const clean: Budgets = {};
  for (const [k, v] of Object.entries(budgets ?? {})) if (typeof v === "number" && Number.isFinite(v) && v >= 0) clean[k as BudgetCategory] = Math.round(v * 100) / 100;
  return clean;
}

export const defaultBudgets = (userId: string, stored: Budgets | null): Budgets => stored ?? (userId === DEMO_BANK_USER ? DEMO_BUDGETS : {});

