// Server-only, READ-ONLY client for Capital One's Nessie v2 hackathon sandbox (simulated data).
//
// Contract: Nessie API 2.1.3 OpenAPI spec (https://v2-prod-api.nessieisreal.com/openapi.json,
// read 2026-11-15):
//   Auth   `Authorization: Bearer nsk_...` (the spec: keys are never accepted in the query string)
//   Lists  `{ "items": [...] | null, "next_cursor"?: string }`; pass `cursor` for the next page
//   Money  integer cents (`balance_cents`, `amount_cents`, ...); ids are `id`
//   GET /accounts                       (cursor, limit ≤ 100) — or /customers/{id}/accounts
//   GET /accounts/{id}/transactions     (limit ≤ 5000, newest first; includes rows where the account is the payee)
//                                        kinds: deposit, withdrawal, transfer, purchase, bill_payment, fee,
//                                        interest_credit, refund, chargeback
//   GET /accounts/{id}/bills            (cursor, limit)
//   GET /accounts/{id}/loans            (cursor, limit)
//   GET /merchants                      (cursor, limit ≤ 100)
// v2 has no separate deposit/withdrawal/purchase/transfer READ endpoints: those paths are POST-only
// (they move money), so this client never calls them. It never seeds data or writes anything.
if (typeof window !== "undefined") throw new Error("banking/nessie is server-only");
import { log } from "../agents/logger";

export const DEFAULT_NESSIE_BASE_URL = "https://v2-prod-api.nessieisreal.com";
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const TXN_LIMIT = 1000;

export type NessieConfig = {
  apiKey: string;
  baseUrl: string;
  customerId?: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
};

export class NessieError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly path: string,
  ) {
    super(message);
    this.name = "NessieError";
  }
}

/** Reads config from env. Returns null (not an error) when no key is set. */
export function nessieConfigFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): NessieConfig | null {
  const apiKey = env.NESSIE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.NESSIE_BASE_URL?.trim() || DEFAULT_NESSIE_BASE_URL).replace(/\/+$/, ""),
    customerId: env.NESSIE_CUSTOMER_ID?.trim() || undefined,
    timeoutMs: Number(env.NESSIE_TIMEOUT_MS) || 8000,
    fetchImpl,
  };
}

/** Setting problems, by name only (never values). */
export function nessieConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const p: string[] = [];
  const key = env.NESSIE_API_KEY?.trim();
  if (!key) p.push("NESSIE_API_KEY is not set");
  else if (!key.startsWith("nsk_")) p.push("NESSIE_API_KEY should be a Nessie v2 key (nsk_...)");
  const base = env.NESSIE_BASE_URL?.trim();
  if (base && /\/\/(prod-)?api\.nessieisreal\.com|reimaginebanking/i.test(base)) p.push("NESSIE_BASE_URL points at the retired v1 API; remove it or use https://v2-prod-api.nessieisreal.com");
  return p;
}

export type NessieRaw = Record<string, unknown>;

export type NessieCall = { endpoint: string; status: number | null; count: number | null; ms: number; error?: string };

export type NessieSnapshot = {
  accounts: NessieRaw[];
  /** Transactions per account, as listed by /accounts/{id}/transactions (a transfer can appear under both accounts). */
  transactions: { accountId: string; items: NessieRaw[] }[];
  bills: NessieRaw[];
  loans: NessieRaw[];
  merchants: NessieRaw[];
  warnings: string[];
  /** Per-request diagnostics: endpoint template, HTTP status, record count. No ids, keys or data. */
  calls: NessieCall[];
};

/** Endpoint label for logs: ids replaced so no identifiers are logged. */
export function endpointTemplate(path: string): string {
  return path
    .split("?")[0]
    .replace(/\/(accounts|customers|bills|loans|merchants|transactions)\/[^/]+/g, "/$1/{id}");
}

async function get(cfg: NessieConfig, path: string, calls: NessieCall[]): Promise<unknown> {
  const started = Date.now();
  const endpoint = endpointTemplate(path);
  const record = (status: number | null, count: number | null, error?: string) => {
    const call: NessieCall = { endpoint, status, count, ms: Date.now() - started, ...(error ? { error } : {}) };
    calls.push(call);
    log(error ? "warn" : "info", "nessie.request", { ...call }); // never the key, URL query, ids or bodies
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  let res: Response;
  try {
    res = await cfg.fetchImpl(`${cfg.baseUrl}${path}`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { accept: "application/json", authorization: `Bearer ${cfg.apiKey}` },
    });
  } catch (e) {
    const why = e instanceof Error && e.name === "AbortError" ? "timed out" : "network error";
    record(null, null, why);
    throw new NessieError(`Nessie ${why}`, null, endpoint);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // RFC 9457 problem body: keep only the short title, never echo request details.
    const problem = (await res.json().catch(() => null)) as { title?: unknown } | null;
    const title = typeof problem?.title === "string" ? problem.title.slice(0, 80) : "";
    const msg =
      res.status === 401 || res.status === 403
        ? `Nessie rejected the API key (${res.status})`
        : res.status === 429
          ? "Nessie rate limit reached (429)"
          : `Nessie returned ${res.status}${title ? ` (${title})` : ""}`;
    record(res.status, null, msg);
    throw new NessieError(msg, res.status, endpoint);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    record(res.status, null, "invalid JSON");
    throw new NessieError("Nessie returned invalid JSON", res.status, endpoint);
  }
  const items = (body as { items?: unknown })?.items;
  record(res.status, Array.isArray(items) ? items.length : items === null ? 0 : null);
  return body;
}

const asItems = (body: unknown): NessieRaw[] => {
  const items = (body as { items?: unknown } | null)?.items;
  if (items === null || items === undefined) return [];
  return Array.isArray(items) ? items.filter((x): x is NessieRaw => !!x && typeof x === "object" && !Array.isArray(x)) : [];
};

function assertList(body: unknown, endpoint: string) {
  if (!body || typeof body !== "object" || !("items" in body)) throw new NessieError("Nessie response is not a v2 list ({items})", 200, endpoint);
}

/** Follows `next_cursor` until the last page (bounded). */
async function getAll(cfg: NessieConfig, path: string, calls: NessieCall[]): Promise<NessieRaw[]> {
  const out: NessieRaw[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ limit: String(PAGE_LIMIT), ...(cursor ? { cursor } : {}) });
    const body = await get(cfg, `${path}?${q}`, calls);
    assertList(body, endpointTemplate(path));
    out.push(...asItems(body));
    const next = (body as { next_cursor?: unknown }).next_cursor;
    if (typeof next !== "string" || !next) return out;
    cursor = next;
  }
  return out;
}

/** Runs tasks with a small concurrency limit (Nessie allows ~120 requests/minute, bursts of 30). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

/**
 * Reads everything FinPilot uses. Failure to list accounts is fatal (an API failure);
 * an empty account list is NOT a failure (the sandbox simply has no data yet).
 * Per-account resource failures become warnings.
 */
export async function fetchNessieSnapshot(cfg: NessieConfig): Promise<NessieSnapshot> {
  const calls: NessieCall[] = [];
  const warnings: string[] = [];
  const accountsPath = cfg.customerId ? `/customers/${encodeURIComponent(cfg.customerId)}/accounts` : "/accounts";
  const accounts = (await getAll(cfg, accountsPath, calls)).filter((a) => typeof a.id === "string" && a.id);

  const soft = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      warnings.push(`${label}: ${e instanceof Error ? e.message : "failed"}`);
      return fallback;
    }
  };

  const ids = accounts.map((a) => String(a.id));
  const perAccount = await pool(ids, 3, async (id) => {
    const enc = encodeURIComponent(id);
    const tail = `…${id.slice(-4)}`;
    const items = await soft(`Transactions for account ${tail}`, async () => {
      const body = await get(cfg, `/accounts/${enc}/transactions?limit=${TXN_LIMIT}`, calls);
      assertList(body, "/accounts/{id}/transactions");
      return asItems(body);
    }, [] as NessieRaw[]);
    if (items.length >= TXN_LIMIT) warnings.push(`Account ${tail}: only the newest ${TXN_LIMIT} transactions were imported.`);
    const bills = await soft(`Bills for account ${tail}`, () => getAll(cfg, `/accounts/${enc}/bills`, calls), [] as NessieRaw[]);
    const loans = await soft(`Loans for account ${tail}`, () => getAll(cfg, `/accounts/${enc}/loans`, calls), [] as NessieRaw[]);
    return { id, items, bills, loans };
  });
  const merchants = accounts.length ? await soft("Merchants", () => getAll(cfg, "/merchants", calls), [] as NessieRaw[]) : [];

  log("info", "nessie.snapshot", {
    accounts: accounts.length,
    transactions: perAccount.reduce((n, a) => n + a.items.length, 0),
    bills: perAccount.reduce((n, a) => n + a.bills.length, 0),
    loans: perAccount.reduce((n, a) => n + a.loans.length, 0),
    merchants: merchants.length,
    requests: calls.length,
    failedRequests: calls.filter((c) => c.error).length,
  });
  return {
    accounts,
    transactions: perAccount.map((a) => ({ accountId: a.id, items: a.items })),
    bills: perAccount.flatMap((a) => a.bills),
    loans: perAccount.flatMap((a) => a.loans),
    merchants,
    warnings,
    calls,
  };
}

/** One cheap read used by /api/health?check=nessie and scripts: does the key work, and is there data? */
export async function pingNessie(cfg: NessieConfig): Promise<{ ok: boolean; status: number | null; accounts: number | null; hasMore: boolean; reason?: string }> {
  const calls: NessieCall[] = [];
  try {
    const body = await get(cfg, "/accounts?limit=1", calls);
    assertList(body, "/accounts");
    return { ok: true, status: calls[0]?.status ?? 200, accounts: asItems(body).length, hasMore: typeof (body as { next_cursor?: unknown }).next_cursor === "string" };
  } catch (e) {
    return { ok: false, status: e instanceof NessieError ? e.status : null, accounts: null, hasMore: false, reason: e instanceof Error ? e.message : "failed" };
  }
}
