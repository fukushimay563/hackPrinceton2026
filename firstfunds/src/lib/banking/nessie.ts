// Server-only client for Capital One's Nessie hackathon sandbox (simulated data only).
//
// Endpoints follow the official Nessie API v1.0 OpenAPI spec
// (https://nessieisreal.com/nessie-openapi-spec.yaml, read 2026-11-15):
//   GET /accounts                       (or /customers/{id}/accounts)
//   GET /accounts/{id}/deposits
//   GET /accounts/{id}/withdrawals
//   GET /purchase/{purchase_id}         — the spec has NO list endpoint for purchases
//   GET /transfers/{transfer_id}        — the spec has NO list endpoint for transfers
//   GET /merchants
// Auth is the `key` query parameter. The key never leaves the server.
//
// Because purchases and transfers can only be fetched by id, they are retrieved only for
// ids listed in NESSIE_PURCHASE_IDS / NESSIE_TRANSFER_IDS. We do not guess undocumented
// list endpoints.
if (typeof window !== "undefined") throw new Error("banking/nessie is server-only");

export const DEFAULT_NESSIE_BASE_URL = "https://prod-api.nessieisreal.com";

export type NessieConfig = {
  apiKey: string;
  baseUrl: string;
  customerId?: string;
  purchaseIds: string[];
  transferIds: string[];
  timeoutMs: number;
  fetchImpl: typeof fetch;
};

export class NessieError extends Error {
  constructor(message: string, readonly status: number | null, readonly path: string) {
    super(message);
    this.name = "NessieError";
  }
}

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Reads config from env. Returns null (not an error) when no key is set. */
export function nessieConfigFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): NessieConfig | null {
  const apiKey = env.NESSIE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.NESSIE_BASE_URL?.trim() || DEFAULT_NESSIE_BASE_URL).replace(/\/+$/, ""),
    customerId: env.NESSIE_CUSTOMER_ID?.trim() || undefined,
    purchaseIds: list(env.NESSIE_PURCHASE_IDS),
    transferIds: list(env.NESSIE_TRANSFER_IDS),
    timeoutMs: Number(env.NESSIE_TIMEOUT_MS) || 6000,
    fetchImpl,
  };
}

export type NessieRaw = Record<string, unknown>;

export type NessieSnapshot = {
  accounts: NessieRaw[];
  deposits: { accountId: string; items: NessieRaw[] }[];
  withdrawals: { accountId: string; items: NessieRaw[] }[];
  purchases: NessieRaw[];
  transfers: NessieRaw[];
  merchants: NessieRaw[];
  warnings: string[];
};

async function get(cfg: NessieConfig, path: string): Promise<unknown> {
  const url = `${cfg.baseUrl}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(cfg.apiKey)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  let res: Response;
  try {
    res = await cfg.fetchImpl(url, { signal: ctrl.signal, cache: "no-store", headers: { accept: "application/json" } });
  } catch (e) {
    // Never include the URL (it carries the key) in errors or logs.
    const why = e instanceof Error && e.name === "AbortError" ? "timed out" : "network error";
    throw new NessieError(`Nessie ${why}`, null, path);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) throw new NessieError("Nessie rejected the API key (401)", 401, path);
  if (!res.ok) throw new NessieError(`Nessie returned ${res.status}`, res.status, path);
  try {
    return await res.json();
  } catch {
    throw new NessieError("Nessie returned invalid JSON", res.status, path);
  }
}

const asArray = (v: unknown): NessieRaw[] => (Array.isArray(v) ? v.filter((x): x is NessieRaw => !!x && typeof x === "object") : []);

/** Fetches everything the documented API allows. Account listing failure is fatal; per-resource failures become warnings. */
export async function fetchNessieSnapshot(cfg: NessieConfig): Promise<NessieSnapshot> {
  const warnings: string[] = [];
  const accountsPath = cfg.customerId ? `/customers/${encodeURIComponent(cfg.customerId)}/accounts` : "/accounts";
  const accounts = asArray(await get(cfg, accountsPath));

  const soft = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      warnings.push(`${label}: ${e instanceof Error ? e.message : "failed"}`);
      return fallback;
    }
  };

  const ids = accounts.map((a) => String(a._id ?? "")).filter(Boolean);
  const deposits = await Promise.all(ids.map(async (id) => ({ accountId: id, items: await soft(`deposits for account …${id.slice(-4)}`, async () => asArray(await get(cfg, `/accounts/${encodeURIComponent(id)}/deposits`)), []) })));
  const withdrawals = await Promise.all(ids.map(async (id) => ({ accountId: id, items: await soft(`withdrawals for account …${id.slice(-4)}`, async () => asArray(await get(cfg, `/accounts/${encodeURIComponent(id)}/withdrawals`)), []) })));
  const byId = async (kind: "purchase" | "transfers", id: string) =>
    soft(`${kind} ${id.slice(-6)}`, async () => {
      const v = await get(cfg, `/${kind}/${encodeURIComponent(id)}`);
      return v && typeof v === "object" && !Array.isArray(v) ? [v as NessieRaw] : [];
    }, [] as NessieRaw[]);
  const purchases = (await Promise.all(cfg.purchaseIds.map((id) => byId("purchase", id)))).flat();
  const transfers = (await Promise.all(cfg.transferIds.map((id) => byId("transfers", id)))).flat();
  const merchants = await soft("merchants", async () => asArray(await get(cfg, "/merchants")), []);

  if (!cfg.purchaseIds.length) warnings.push("Purchases: the Nessie v1.0 API has no endpoint to list purchases; set NESSIE_PURCHASE_IDS to import specific ones.");
  if (!cfg.transferIds.length) warnings.push("Transfers: the Nessie v1.0 API has no endpoint to list transfers; set NESSIE_TRANSFER_IDS to import specific ones.");
  return { accounts, deposits, withdrawals, purchases, transfers, merchants, warnings };
}
