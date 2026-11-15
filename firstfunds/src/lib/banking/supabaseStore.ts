// Persistent banking store on Supabase Postgres (server-only).
// All reads/writes are single calls to SQL functions defined in
// supabase/migrations/20261115180000_banking_persistence.sql, executable only by the service
// role. The service-role key is read from server env and never sent to the browser.
if (typeof window !== "undefined") throw new Error("banking/supabaseStore is server-only");
import { createClient } from "@supabase/supabase-js";
import { log } from "../agents/logger";
import type { Budgets } from "./analytics";
import type { Corrections } from "./normalize";
import { merchantKey } from "./normalize";
import { BankingRuleError, BankingStoreError, cleanBudgets, DEMO_BANK_USER, defaultBudgets, type BankingData, type BankingStore, type SyncWrite, type WriteCounts } from "./storeCore";
import type { BankAccount, BankBill, BankLoan, BankTransaction, BudgetCategory, SyncReport } from "./types";

/** Fixed UUID for the shared demo profile. Never an auth user, so no client can read it through RLS. */
export const DEMO_BANKING_UUID = "0f1f5d00-0000-4000-8000-0000000000d0";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The only part of a Supabase client this store needs (lets tests run against PGlite). */
export type RpcClient = { rpc(fn: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };

export function dbUserId(userId: string): string {
  if (userId === DEMO_BANK_USER) return DEMO_BANKING_UUID;
  if (UUID.test(userId)) return userId.toLowerCase();
  throw new BankingStoreError("Banking user id must be the demo profile or a Supabase user id", "resolve-user");
}

export type SupabaseServerConfig = { url: string; key: string };

/** Server env → config, or null. Rejects browser (publishable/anon) keys. Never logs the key. */
export function supabaseServerConfig(env: NodeJS.ProcessEnv = process.env): SupabaseServerConfig | null {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)?.trim();
  if (!url || !key) return null;
  if (key.startsWith("sb_publishable_") || key === (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() || key === (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim()) {
    log("error", "banking.store.bad_key", { reason: "the server key is a browser (publishable/anon) key; set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY" });
    return null;
  }
  return { url: url.replace(/\/+$/, ""), key };
}

export function supabaseAdmin(cfg: SupabaseServerConfig) {
  return createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function supabaseBankingStoreFromEnv(): SupabaseBankingStore | null {
  const cfg = supabaseServerConfig();
  return cfg ? new SupabaseBankingStore(supabaseAdmin(cfg) as unknown as RpcClient) : null;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

function toAccount(r: Row, userId: string): BankAccount {
  return {
    id: String(r.id),
    provider: r.provider as BankAccount["provider"],
    externalId: String(r.external_id),
    userId,
    type: (s(r.type) ?? "Unknown") as BankAccount["type"],
    nickname: s(r.nickname),
    balance: n(r.balance),
    available: n(r.available),
    creditLimit: n(r.credit_limit),
    last4: s(r.last4),
  };
}

function toTransaction(r: Row, userId: string): BankTransaction {
  const reasons = Array.isArray(r.review_reasons) ? r.review_reasons.map(String) : [];
  return {
    id: String(r.id),
    provider: r.provider as BankTransaction["provider"],
    externalId: String(r.external_id),
    kind: r.kind as BankTransaction["kind"],
    accountId: String(r.account_id),
    userId,
    date: s(r.txn_date)?.slice(0, 10) ?? null,
    amount: n(r.amount) ?? 0,
    direction: r.direction as BankTransaction["direction"],
    description: s(r.description),
    merchant: s(r.merchant),
    category: r.category as BudgetCategory,
    categorySource: r.category_source as BankTransaction["categorySource"],
    flow: r.flow as BankTransaction["flow"],
    status: s(r.status),
    needsReview: r.needs_review === true,
    reviewReasons: reasons,
    raw: {}, // provider originals stay in the database; not needed by the app
    importedAt: Date.parse(String(r.imported_at ?? "")) || 0,
  };
}

const toBill = (r: Row): BankBill => ({
  id: String(r.id),
  provider: r.provider as BankBill["provider"],
  accountId: String(r.account_id),
  payee: s(r.payee),
  nickname: s(r.nickname),
  status: s(r.status),
  amount: n(r.amount),
  upcomingPaymentDate: s(r.upcoming_payment_date)?.slice(0, 10) ?? null,
  recurringDay: n(r.recurring_day),
});

const toLoan = (r: Row): BankLoan => ({
  id: String(r.id),
  provider: r.provider as BankLoan["provider"],
  accountId: String(r.account_id),
  type: s(r.type),
  status: s(r.status),
  description: s(r.description),
  amount: n(r.amount),
  monthlyPayment: n(r.monthly_payment),
  creditScore: n(r.credit_score),
});

export class SupabaseBankingStore implements BankingStore {
  readonly backend = "supabase" as const;
  constructor(private readonly db: RpcClient) {}

  private async call<T>(op: string, fn: string, params: Record<string, unknown>): Promise<T> {
    const started = Date.now();
    let res: { data: unknown; error: { message: string; code?: string } | null };
    try {
      res = await this.db.rpc(fn, params);
    } catch (e) {
      log("error", "banking.db", { op, ok: false, ms: Date.now() - started, code: "network" });
      throw new BankingStoreError(`Banking database unreachable (${e instanceof Error ? e.name : "error"})`, op, "network");
    }
    if (res.error) {
      const code = res.error.code ?? null;
      // Validation errors raised by our SQL functions (e.g. "Transaction not found") are not outages.
      if (code === "P0001") throw new BankingRuleError(res.error.message);
      const missing = code === "PGRST202" || code === "42883" || /could not find the function|does not exist/i.test(res.error.message);
      log("error", "banking.db", { op, ok: false, ms: Date.now() - started, code: code ?? "unknown", migrationMissing: missing });
      throw new BankingStoreError(missing ? "Banking tables or functions are missing: apply the Supabase migrations" : "Banking database error", op, code);
    }
    log("info", "banking.db", { op, ok: true, ms: Date.now() - started });
    return res.data as T;
  }

  async load(userId: string): Promise<BankingData> {
    const d = await this.call<Row | null>("load", "banking_load", { p_user: dbUserId(userId) });
    const arr = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : []);
    const rules: Corrections = new Map(Object.entries((d?.rules as Record<string, string>) ?? {}) as [string, BudgetCategory][]);
    const stored = d?.budgets && typeof d.budgets === "object" ? cleanBudgets(d.budgets as Budgets) : null;
    return {
      accounts: arr(d?.accounts).map((r) => toAccount(r, userId)),
      transactions: arr(d?.transactions).map((r) => toTransaction(r, userId)),
      bills: arr(d?.bills).map(toBill),
      loans: arr(d?.loans).map(toLoan),
      budgets: defaultBudgets(userId, stored),
      corrections: rules,
      lastSync: (d?.sync as SyncReport | null) ?? null,
    };
  }

  async applySync(userId: string, w: SyncWrite): Promise<WriteCounts> {
    const payload: Record<string, unknown> = {
      provider: w.provider,
      accounts: w.accounts,
      transactions: w.transactions,
      prune: w.prune,
      report: w.report,
      ...(w.bills ? { bills: w.bills } : {}),
      ...(w.loans ? { loans: w.loans } : {}),
    };
    const r = await this.call<{ inserted: number; updated: number; unchanged: number }>("apply-sync", "banking_apply_sync", { p_user: dbUserId(userId), p_payload: payload });
    return { inserted: Number(r?.inserted ?? 0), updated: Number(r?.updated ?? 0), unchanged: Number(r?.unchanged ?? 0) };
  }

  async setCategory(userId: string, id: string, category: BudgetCategory): Promise<BankTransaction> {
    // The merchant key is derived in SQL-independent code so rules match the normalizer exactly.
    const current = (await this.load(userId)).transactions.find((t) => t.id === id);
    if (!current) throw new BankingRuleError("Transaction not found");
    const key = merchantKey(current.merchant ?? current.description);
    const r = await this.call<Row>("set-category", "banking_set_category", { p_user: dbUserId(userId), p_id: id, p_category: category, p_merchant_key: key });
    return toTransaction(r, userId);
  }

  async setBudgets(userId: string, budgets: Budgets): Promise<Budgets> {
    const clean = cleanBudgets(budgets);
    await this.call("set-budgets", "banking_set_budgets", { p_user: dbUserId(userId), p_budgets: clean });
    return clean;
  }

  /** Live write + read-back + schema check (used by /api/health?check=banking). */
  async ping(): Promise<Record<string, unknown>> {
    return this.call<Record<string, unknown>>("ping", "banking_ping", {});
  }
}
