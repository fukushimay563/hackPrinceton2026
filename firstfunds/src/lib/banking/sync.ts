// Sync = fetch (Nessie v2, read-only) → normalize → idempotent upsert.
//
// Outcomes are kept distinct (SyncReport.nessieStatus):
//   ok             Nessie answered with accounts → its rows are shown, labelled as sandbox data
//   empty          Nessie answered successfully with NO accounts → nothing is shown (and stale
//                  Nessie rows are removed); fictional data is NOT substituted
//   error          the API failed → previously imported Nessie rows if any, otherwise the
//                  clearly labelled fictional fallback
//   not-configured no NESSIE_API_KEY → the clearly labelled fictional fallback
// This module never seeds the sandbox or moves money.
import { log } from "../agents/logger";
import { fallbackSnapshot, FALLBACK_LABEL } from "./fallback";
import { fetchNessieSnapshot, NessieError, nessieConfigFromEnv, type NessieConfig, type NessieSnapshot } from "./nessie";
import { normalizeNessie } from "./normalize";
import { banking } from "./repository";
import type { NessieStatus, Provider, SyncReport } from "./types";

export const NESSIE_LABEL = "Capital One Nessie sandbox: simulated demo data, not a real Capital One account.";
export const NESSIE_EMPTY_LABEL =
  "Connected to the Capital One Nessie sandbox, but it has no accounts yet. Nothing is shown until sandbox data exists (FirstFunds never creates it for you).";

export async function syncBanking(userId: string, opts: { config?: NessieConfig | null; allowFallback?: boolean } = {}): Promise<SyncReport> {
  const cfg = opts.config === undefined ? nessieConfigFromEnv() : opts.config;
  const allowFallback = opts.allowFallback ?? true;
  const warnings: string[] = [];
  let snapshot: NessieSnapshot | null = null;
  let nessieStatus: NessieStatus;
  let requests: SyncReport["requests"] = [];

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

  const finish = (r: SyncReport) => {
    banking.setLastSync(userId, r);
    log(r.nessieStatus === "error" ? "warn" : "info", "nessie.sync", {
      nessieStatus: r.nessieStatus,
      shown: r.provider,
      live: r.live,
      accounts: r.accounts,
      inserted: r.inserted,
      updated: r.updated,
      unchanged: r.unchanged,
      skipped: r.skipped.length,
      warnings: r.warnings.length,
    });
    return r;
  };

  if (nessieStatus === "empty") {
    // A successful, empty answer: clear stale Nessie records and show nothing (no fiction).
    banking.pruneProvider(userId, "nessie", new Set(), new Set());
    banking.setObligations(userId, "nessie", [], []);
    return finish({
      provider: "nessie",
      live: true,
      nessieStatus,
      requests,
      label: NESSIE_EMPTY_LABEL,
      accounts: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: [],
      warnings: [...warnings, "Nessie returned no accounts for this API key (empty sandbox, not an error)."],
      syncedAt: Date.now(),
    });
  }

  if (!snapshot && cfg && banking.transactions(userId).some((t) => t.provider === "nessie")) {
    // Keep showing previously imported Nessie rows rather than switching to fictional data.
    return finish({
      provider: "nessie",
      live: false,
      nessieStatus,
      requests,
      label: `${NESSIE_LABEL} Latest refresh failed; showing previously imported data.`,
      accounts: banking.accounts(userId).filter((a) => a.provider === "nessie").length,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: [],
      warnings,
      syncedAt: Date.now(),
    });
  }

  let provider: Provider = "nessie";
  if (!snapshot) {
    if (!allowFallback) throw new Error(warnings.join(" "));
    provider = "fallback";
    snapshot = fallbackSnapshot();
  }

  const corrections = banking.corrections(userId);
  const norm = normalizeNessie({ provider, userId, ...snapshot, corrections });
  banking.upsertAccounts(userId, norm.accounts);
  const counts = banking.upsertTransactions(userId, norm.transactions);
  if (provider === "nessie") banking.pruneProvider(userId, "nessie", new Set(norm.accounts.map((a) => a.id)), new Set(norm.transactions.map((t) => t.id)));
  banking.setObligations(userId, provider, norm.bills, norm.loans);
  return finish({
    provider,
    live: provider === "nessie",
    nessieStatus,
    requests,
    label: provider === "nessie" ? NESSIE_LABEL : `${FALLBACK_LABEL}${nessieStatus === "not-configured" ? " Nessie isn't configured." : " The Nessie request failed."}`,
    accounts: norm.accounts.length,
    ...counts,
    skipped: norm.skipped,
    warnings,
    syncedAt: Date.now(),
  });
}
