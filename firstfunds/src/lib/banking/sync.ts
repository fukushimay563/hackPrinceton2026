// Sync = fetch (Nessie or labelled fallback) → normalize → idempotent upsert.
import { fallbackSnapshot, FALLBACK_LABEL } from "./fallback";
import { fetchNessieSnapshot, NessieError, nessieConfigFromEnv, type NessieConfig, type NessieSnapshot } from "./nessie";
import { normalizeNessie } from "./normalize";
import { banking } from "./repository";
import type { Provider, SyncReport } from "./types";

export const NESSIE_LABEL = "Capital One Nessie sandbox: simulated demo data, not a real Capital One account.";

export async function syncBanking(userId: string, opts: { config?: NessieConfig | null; allowFallback?: boolean } = {}): Promise<SyncReport> {
  const cfg = opts.config === undefined ? nessieConfigFromEnv() : opts.config;
  const allowFallback = opts.allowFallback ?? true;
  const warnings: string[] = [];
  let snapshot: NessieSnapshot | null = null;
  let provider: Provider = "nessie";

  if (cfg) {
    try {
      snapshot = await fetchNessieSnapshot(cfg);
      warnings.push(...snapshot.warnings);
      if (!snapshot.accounts.length) warnings.push("Nessie returned no accounts for this API key.");
    } catch (e) {
      const msg = e instanceof NessieError ? e.message : "Nessie request failed";
      warnings.push(`Nessie unavailable: ${msg}`);
      snapshot = null;
    }
  } else {
    warnings.push("NESSIE_API_KEY is not set.");
  }

  if (!snapshot && cfg && banking.transactions(userId).some((t) => t.provider === "nessie")) {
    // Keep showing previously imported Nessie rows rather than switching to fictional data.
    const report: SyncReport = {
      provider: "nessie",
      live: false,
      label: `${NESSIE_LABEL} Latest refresh failed; showing previously imported data.`,
      accounts: banking.accounts(userId).filter((a) => a.provider === "nessie").length,
      inserted: 0, updated: 0, unchanged: 0, skipped: [], warnings, syncedAt: Date.now(),
    };
    banking.setLastSync(userId, report);
    return report;
  }

  if (!snapshot) {
    if (!allowFallback) throw new Error(warnings.join(" "));
    provider = "fallback";
    snapshot = fallbackSnapshot();
  }

  const corrections = banking.corrections(userId);
  const norm = normalizeNessie({ provider, userId, ...snapshot, corrections });
  banking.upsertAccounts(userId, norm.accounts);
  const counts = banking.upsertTransactions(userId, norm.transactions);
  const report: SyncReport = {
    provider,
    live: provider === "nessie",
    label: provider === "nessie" ? NESSIE_LABEL : FALLBACK_LABEL,
    accounts: norm.accounts.length,
    ...counts,
    skipped: norm.skipped,
    warnings,
    syncedAt: Date.now(),
  };
  banking.setLastSync(userId, report);
  return report;
}
