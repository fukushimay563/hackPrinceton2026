// Banking storage. Same pattern as lib/agents/store.ts: an in-memory, globalThis-scoped
// default (demo + tests) whose semantics mirror supabase/migrations/*_banking.sql:
//   unique (user_id, provider, external_id)  → repeated syncs never duplicate rows
//   category_source = 'user' is never overwritten by a sync → user corrections survive
// Category corrections are persisted through the existing personalization memory
// (store.remember(tenant, "correction", …)), so they apply to similar future imports.
import { store } from "../agents/store";
import { merchantKey, type Corrections } from "./normalize";
import type { Budgets } from "./analytics";
import type { BankAccount, BankTransaction, BudgetCategory, SyncReport } from "./types";

export const DEMO_BANK_USER = "tenant_demo_maya";

/** Demo budgets for the demo user only. Labelled as such in the UI; users can change them. */
export const DEMO_BUDGETS: Budgets = { Food: 200, Groceries: 250, Shopping: 150, Transport: 120, Subscriptions: 40, Entertainment: 80, Bills: 1000 };

type UserData = { accounts: Map<string, BankAccount>; txs: Map<string, BankTransaction>; budgets: Budgets | null; lastSync: SyncReport | null };

// Fields owned by the provider. A sync may update these; it never touches user-owned fields.
const PROVIDER_FIELDS = ["date", "amount", "direction", "description", "merchant", "status", "accountId", "kind"] as const;

class BankingRepository {
  private users = new Map<string, UserData>();

  private u(userId: string): UserData {
    if (!userId) throw new Error("userId required");
    let d = this.users.get(userId);
    if (!d) this.users.set(userId, (d = { accounts: new Map(), txs: new Map(), budgets: null, lastSync: null }));
    return d;
  }

  upsertAccounts(userId: string, accounts: BankAccount[]) {
    const d = this.u(userId);
    for (const a of accounts) d.accounts.set(a.id, { ...a, userId });
  }

  /** Idempotent upsert keyed by (provider, kind, externalId) for this user. */
  upsertTransactions(userId: string, rows: BankTransaction[]) {
    const d = this.u(userId);
    let inserted = 0, updated = 0, unchanged = 0;
    for (const row of rows) {
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
      const changed =
        PROVIDER_FIELDS.some((f) => prev[f] !== next[f]) || prev.category !== next.category || prev.flow !== next.flow || prev.needsReview !== next.needsReview;
      d.txs.set(row.id, next);
      if (changed) updated++;
      else unchanged++;
    }
    return { inserted, updated, unchanged };
  }

  accounts(userId: string): BankAccount[] {
    return [...this.u(userId).accounts.values()];
  }

  transactions(userId: string): BankTransaction[] {
    return [...this.u(userId).txs.values()];
  }

  get(userId: string, id: string): BankTransaction | undefined {
    return this.u(userId).txs.get(id);
  }

  /** Explicit user correction. Persists the rule to personalization memory; AI suggestions never call this. */
  setCategory(userId: string, id: string, category: BudgetCategory, by: "user"): BankTransaction {
    if (by !== "user") throw new Error("Only explicit user corrections are saved");
    const d = this.u(userId);
    const t = d.txs.get(id);
    if (!t) throw new Error("Transaction not found");
    if (t.flow === "transfer") throw new Error("Transfers between your own accounts aren't spending, so they have no spending category");
    if (t.flow === "excluded") throw new Error("This transaction isn't counted (cancelled or an external transfer), so its category can't change the budget");
    const reviewReasons = t.reviewReasons.filter((r) => !/category/i.test(r));
    const next: BankTransaction = { ...t, category, categorySource: "user", reviewReasons, needsReview: reviewReasons.length > 0 };
    d.txs.set(id, next);
    const key = merchantKey(t.merchant ?? t.description);
    if (key) store.remember(userId, "correction", { type: "transaction_category", merchantKey: key, category, transactionId: id });
    store.addAudit(userId, "user", "banking.category.corrected", { transactionId: id, category });
    return next;
  }

  /** Latest user-approved category per merchant, from personalization memory. */
  corrections(userId: string): Corrections {
    const map: Corrections = new Map();
    for (const m of store.recall(userId, "correction").sort((a, b) => a.at - b.at)) {
      const p = m.payload as { type?: string; merchantKey?: string; category?: BudgetCategory };
      if (p.type === "transaction_category" && p.merchantKey && p.category) map.set(p.merchantKey, p.category);
    }
    return map;
  }

  budgets(userId: string): Budgets {
    const d = this.u(userId);
    return d.budgets ?? (userId === DEMO_BANK_USER ? DEMO_BUDGETS : {});
  }

  setBudgets(userId: string, budgets: Budgets) {
    const clean: Budgets = {};
    for (const [k, v] of Object.entries(budgets)) if (typeof v === "number" && Number.isFinite(v) && v >= 0) clean[k as BudgetCategory] = Math.round(v * 100) / 100;
    this.u(userId).budgets = clean;
  }

  setLastSync(userId: string, r: SyncReport) {
    this.u(userId).lastSync = r;
  }

  lastSync(userId: string): SyncReport | null {
    return this.u(userId).lastSync;
  }

  /** Tests only. */
  _reset() {
    this.users.clear();
  }
}

const g = globalThis as unknown as { __ffBanking?: BankingRepository };
export const banking: BankingRepository = (g.__ffBanking ??= new BankingRepository());
