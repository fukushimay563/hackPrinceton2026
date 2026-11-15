// Sync = fetch (Nessie v2, read-only) → normalize → ONE atomic persisted write.
//
// Outcomes stay distinct:
//   SyncReport.nessieStatus  ok | empty | error | not-configured   (the Nessie read)
//   BankingStoreError        the database failed (thrown; callers answer 503, never fiction)
// Fictional fallback rows are stored only when Nessie is not configured or failed AND no
// Nessie records were stored before; they are always labelled as fictional.
// This module never seeds the sandbox or moves money.
import { log } from "../agents/logger";
import { fallbackSnapshot, FALLBACK_LABEL } from "./fallback";
import { fetchNessieSnapshot, NessieError, nessieConfigFromEnv, type NessieConfig, type NessieSnapshot } from "./nessie";
import { normalizeNessie } from "./normalize";
import { bankingStore, type BankingData, type BankingStore } from "./repository";
import type { NessieStatus, Provider, SyncReport } from "./types";

export const NESSIE_LABEL = "Capital One Nessie sandbox: simulated demo data, not a real Capital One account.";
export const NESSIE_EMPTY_LABEL =
  "Connected to the Capital One Nessie sandbox, but it has no accounts yet. Nothing is shown until sandbox data exists (FirstFunds never creates it for you).";

type Opts = { config?: NessieConfig | null; allowFallback?: boolean; store?: BankingStore };

export async function syncBanking(userId: string, opts: Opts = {}): Promise<SyncReport> {
  const store = opts.store ?? bankingStore();
  const cfg = opts.config === undefined ? nessieConfigFromEnv() : opts.config;
  const allowFallback = opts.allowFallback ?? true;
  const warnings: string[] = [];
  let snapshot: NessieSnapshot | null = null;
  let nessieStatus: NessieStatus;
  let requests: SyncReport["requests"] = [];
  const started = Date.now();

  // Read stored state first (corrections + whether Nessie rows exist). A DB failure stops here.
  const before = await store.load(userId);

  if (cfg) {
    try {
      snapshot = await fetchNessieSnapshot(cfg);
      requests = snapshot.calls.map(({ endpoint, status, count }) => ({ endpoint, status, count }));
      warnings.push(...snapshot.warnings);
      nessieStatus = snapshot.accounts.length ? "ok" : "empty";
    } catch (e) {
      const msg = e instanceof NessieError ? e.message : "Nessie request failed";
      if (e instanceof NessieError) requests = [{ endpoint: e.path, status: e.status, count: null }];
      warnings.push(`Nessie unavailable: ${msg}`);
      nessieStatus = "error";
      snapshot = null;
    }
  } else {
    warnings.push("NESSIE_API_KEY is not set.");
    nessieStatus = "not-configured";
  }

  const base = { nessieStatus, requests, skipped: [] as SyncReport["skipped"], syncedAt: Date.now(), storage: store.backend };
  const persist = async (write: Parameters<BankingStore["applySync"]>[1], normalizedTx: number) => {
    const t = Date.now();
    const counts = await store.applySync(userId, write);
    const report = { ...write.report, ...counts } as SyncReport;
    log(nessieStatus === "error" ? "warn" : "info", "banking.sync", {
      backend: store.backend,
      nessieStatus,
      shown: report.provider,
      live: report.live,
      accounts: write.accounts.length,
      normalizedTransactions: normalizedTx,
      bills: write.bills?.length ?? null,
      loans: write.loans?.length ?? null,
      ...counts,
      skipped: report.skipped.length,
      warnings: report.warnings.length,
      fetchMs: t - started,
      persistMs: Date.now() - t,
    });
    return report;
  };

  if (nessieStatus === "empty") {
    // A successful, empty answer: remove stale Nessie records and show nothing (no fiction).
    return persist(
      {
        provider: "nessie",
        accounts: [],
        transactions: [],
        bills: [],
        loans: [],
        prune: true,
        report: {
          ...base,
          provider: "nessie",
          live: true,
          label: NESSIE_EMPTY_LABEL,
          accounts: 0,
          warnings: [...warnings, "Nessie returned no accounts for this API key (empty sandbox, not an error)."],
        },
      },
      0,
    );
  }

  if (!snapshot && cfg && before.transactions.some((t) => t.provider === "nessie")) {
    // Keep showing previously imported Nessie rows rather than switching to fictional data.
    return persist(
      {
        provider: "nessie",
        accounts: [],
        transactions: [],
        prune: false,
        report: {
          ...base,
          provider: "nessie",
          live: false,
          label: `${NESSIE_LABEL} Latest refresh failed; showing previously imported data.`,
          accounts: before.accounts.filter((a) => a.provider === "nessie").length,
          warnings,
        },
      },
      0,
    );
  }

  let provider: Provider = "nessie";
  if (!snapshot) {
    if (!allowFallback) throw new Error(warnings.join(" "));
    provider = "fallback";
    snapshot = fallbackSnapshot();
  }

  const norm = normalizeNessie({ provider, userId, ...snapshot, corrections: before.corrections });
  log("info", "banking.normalize", {
    provider,
    accounts: norm.accounts.length,
    transactions: norm.transactions.length,
    needsReview: norm.transactions.filter((t) => t.needsReview).length,
    skipped: norm.skipped.length,
    bills: norm.bills.length,
    loans: norm.loans.length,
  });
  return persist(
    {
      provider,
      accounts: norm.accounts,
      transactions: norm.transactions,
      bills: norm.bills,
      loans: norm.loans,
      prune: provider === "nessie",
      report: {
        ...base,
        skipped: norm.skipped,
        provider,
        live: provider === "nessie",
        label: provider === "nessie" ? NESSIE_LABEL : `${FALLBACK_LABEL}${nessieStatus === "not-configured" ? " Nessie isn't configured." : " The Nessie request failed."}`,
        accounts: norm.accounts.length,
        warnings,
      },
    },
    norm.transactions.length,
  );
}

const RETRY_STALE_MS = 5 * 60_000;

/**
 * Load persisted banking data for a request, syncing first when this user has never been
 * synced, or when the last attempt was empty/failed more than 5 minutes ago (so a sandbox
 * seeded later, or a recovered API, shows up without a manual refresh).
 */
export async function loadBanking(userId: string, opts: { store?: BankingStore; autoSync?: boolean } = {}): Promise<BankingData> {
  const store = opts.store ?? bankingStore();
  const t = Date.now();
  let data = await store.load(userId);
  const last = data.lastSync;
  const stale = !!last && (last.nessieStatus === "empty" || last.nessieStatus === "error") && Date.now() - last.syncedAt > RETRY_STALE_MS;
  if ((opts.autoSync ?? true) && (!last || stale)) {
    await syncBanking(userId, { store });
    data = await store.load(userId);
  }
  log("info", "banking.read", {
    backend: store.backend,
    accounts: data.accounts.length,
    transactions: data.transactions.length,
    bills: data.bills.length,
    loans: data.loans.length,
    nessieStatus: data.lastSync?.nessieStatus ?? null,
    shown: data.lastSync?.provider ?? null,
    ms: Date.now() - t,
  });
  return data;
}
