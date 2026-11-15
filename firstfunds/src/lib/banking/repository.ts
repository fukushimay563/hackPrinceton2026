// Banking storage behind one async interface:
//   • SupabaseBankingStore (production): Postgres via the service role, see supabaseStore.ts and
//     supabase/migrations/*_banking*.sql — every serverless instance reads the same records.
//   • MemoryBankingStore (tests / local without Supabase): globalThis-scoped Maps with the
//     SAME semantics (idempotent upsert keyed by (user, id); category_source = 'user' is never
//     overwritten; stale provider rows pruned after a successful read).
// Reads return one BankingData object per request; overview, FinPilot tools and the card
// feed are pure functions over it.
import { log } from "../agents/logger";
import { store as agentStore } from "../agents/store";
import { merchantKey, type Corrections } from "./normalize";
import { supabaseBankingStoreFromEnv } from "./supabaseStore";
import type { Budgets } from "./analytics";
import type { BankAccount, BankBill, BankLoan, BankTransaction, BudgetCategory, SyncReport } from "./types";

export { DEMO_BANK_USER, DEMO_BUDGETS, BankingStoreError, BankingRuleError, cleanBudgets, defaultBudgets } from "./storeCore";
export type { BankingData, SyncWrite, WriteCounts, BankingStore } from "./storeCore";
import { BankingRuleError, cleanBudgets, defaultBudgets, type BankingData, type BankingStore, type SyncWrite, type WriteCounts } from "./storeCore";

// ------------------------------------------------------------------ in-memory
type UserData = {
  accounts: Map<string, BankAccount>;
  txs: Map<string, BankTransaction>;
  bills: BankBill[];
  loans: BankLoan[];
  rules: Corrections;
  budgets: Budgets | null;
  lastSync: SyncReport | null;
};

// Fields owned by the provider. A sync may update these; it never touches user-owned fields.
const PROVIDER_FIELDS = ["date", "amount", "direction", "description", "merchant", "status", "accountId", "kind"] as const;

export class MemoryBankingStore implements BankingStore {
  readonly backend = "memory" as const;
  private users = new Map<string, UserData>();

  private u(userId: string): UserData {
    if (!userId) throw new Error("userId required");
    let d = this.users.get(userId);
    if (!d) this.users.set(userId, (d = { accounts: new Map(), txs: new Map(), bills: [], loans: [], rules: new Map(), budgets: null, lastSync: null }));
    return d;
  }

  async load(userId: string): Promise<BankingData> {
    const d = this.u(userId);
    return {
      accounts: [...d.accounts.values()].map((a) => ({ ...a })),
      transactions: [...d.txs.values()].map((t) => ({ ...t, reviewReasons: [...t.reviewReasons] })),
      bills: d.bills.map((b) => ({ ...b })),
      loans: d.loans.map((l) => ({ ...l })),
      budgets: defaultBudgets(userId, d.budgets),
      corrections: new Map(d.rules),
      lastSync: d.lastSync ? structuredClone(d.lastSync) : null,
    };
  }

  async applySync(userId: string, w: SyncWrite): Promise<WriteCounts> {
    const d = this.u(userId);
    for (const a of w.accounts) d.accounts.set(a.id, { ...a, userId });
    let inserted = 0,
      updated = 0,
      unchanged = 0;
    for (const row of w.transactions) {
      const prev = d.txs.get(row.id);
      if (!prev) {
        d.txs.set(row.id, { ...row, userId });
        inserted++;
        continue;
      }
      const next: BankTransaction = { ...row, userId, importedAt: prev.importedAt };
      if (prev.categorySource === "user") {
        next.category = prev.category;
        next.categorySource = "user";
        next.reviewReasons = row.reviewReasons.filter((r) => !/category/i.test(r));
        next.needsReview = next.reviewReasons.length > 0;
      }
      const changed = PROVIDER_FIELDS.some((f) => prev[f] !== next[f]) || prev.category !== next.category || prev.flow !== next.flow || prev.needsReview !== next.needsReview;
      d.txs.set(row.id, next);
      if (changed) updated++;
      else unchanged++;
    }
    if (w.prune) {
      const keepA = new Set(w.accounts.map((a) => a.id));
      const keepT = new Set(w.transactions.map((t) => t.id));
      for (const [id, a] of d.accounts) if (a.provider === w.provider && !keepA.has(id)) d.accounts.delete(id);
      for (const [id, t] of d.txs) if (t.provider === w.provider && !keepT.has(id)) d.txs.delete(id);
    }
    if (w.bills) d.bills = [...d.bills.filter((b) => b.provider !== w.provider), ...w.bills];
    if (w.loans) d.loans = [...d.loans.filter((l) => l.provider !== w.provider), ...w.loans];
    const counts = { inserted, updated, unchanged };
    d.lastSync = { ...w.report, ...counts } as SyncReport;
    return counts;
  }

  async setCategory(userId: string, id: string, category: BudgetCategory): Promise<BankTransaction> {
    const d = this.u(userId);
    const t = d.txs.get(id);
    if (!t) throw new BankingRuleError("Transaction not found");
    if (t.flow === "transfer") throw new BankingRuleError("Transfers between your own accounts aren't spending, so they have no spending category");
    if (t.flow === "excluded") throw new BankingRuleError("This transaction isn't counted (cancelled or an external transfer), so its category can't change the budget");
    const reviewReasons = t.reviewReasons.filter((r) => !/category/i.test(r));
    const next: BankTransaction = { ...t, category, categorySource: "user", reviewReasons, needsReview: reviewReasons.length > 0 };
    d.txs.set(id, next);
    const key = merchantKey(t.merchant ?? t.description);
    if (key) d.rules.set(key, category);
    return { ...next };
  }

  async setBudgets(userId: string, budgets: Budgets): Promise<Budgets> {
    const clean = cleanBudgets(budgets);
    this.u(userId).budgets = clean;
    return clean;
  }

  /** Tests only: forget everything (like a fresh serverless instance would). */
  _reset() {
    this.users.clear();
  }
}

// ------------------------------------------------------------------ selection
const g = globalThis as unknown as { __ffBankingMemory?: MemoryBankingStore; __ffBankingStore?: BankingStore | null };
export const memoryBanking: MemoryBankingStore = (g.__ffBankingMemory ??= new MemoryBankingStore());

let overrideStore: BankingStore | null = null;
/** Tests: force a specific store (e.g. a Supabase store over PGlite). Pass null to restore. */
export function setBankingStoreForTests(s: BankingStore | null) {
  overrideStore = s;
}

/**
 * Supabase when the server has SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and a service-role /
 * secret key, unless BANKING_STORE=memory. Otherwise the in-memory store (with a warning in
 * production, because records then live only in one serverless instance).
 */
export function bankingStore(): BankingStore {
  if (overrideStore) return overrideStore;
  if (g.__ffBankingStore) return g.__ffBankingStore;
  const forced = process.env.BANKING_STORE?.trim().toLowerCase();
  let s: BankingStore = memoryBanking;
  if (forced !== "memory") {
    s = supabaseBankingStoreFromEnv() ?? memoryBanking;
  }
  if (s.backend === "memory" && process.env.NODE_ENV === "production" && process.env.VERCEL) {
    log("warn", "banking.store.memory_in_production", { reason: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; records are per-instance" });
  }
  g.__ffBankingStore = s;
  return s;
}

/** Tests: drop the cached choice so env changes take effect. */
export function _resetBankingStoreChoice() {
  g.__ffBankingStore = null;
}

/** Personalization memory + audit trail for an explicit correction (best effort, non-blocking). */
export function recordCorrection(userId: string, t: BankTransaction, category: BudgetCategory) {
  try {
    const key = merchantKey(t.merchant ?? t.description);
    if (key) agentStore.remember(userId, "correction", { type: "transaction_category", merchantKey: key, category, transactionId: t.id });
    agentStore.addAudit(userId, "user", "banking.category.corrected", { transactionId: t.id, category });
  } catch {
    /* personalization is optional */
  }
}
