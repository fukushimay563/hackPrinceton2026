// Request helpers for the banking API routes: who is asking, and safe error responses.
if (typeof window !== "undefined") throw new Error("banking/http is server-only");
import { log } from "../agents/logger";
import { BankingRuleError, BankingStoreError, DEMO_BANK_USER } from "./storeCore";
import { supabaseAdmin, supabaseServerConfig } from "./supabaseStore";

export type BankingUser = { userId: string; signedIn: boolean };

/**
 * The banking profile for this request:
 *  • a verified Supabase session (Authorization: Bearer <access token>) → that user's own records
 *  • no token → the shared demo profile (synthetic sandbox data)
 * A token that can't be verified is rejected (401); it never falls back to someone else's data.
 * The user id always comes from Supabase's verification, never from the request body or URL.
 */
export async function resolveBankingUser(req: Request): Promise<BankingUser | Response> {
  const header = req.headers.get("authorization");
  if (!header) return { userId: DEMO_BANK_USER, signedIn: false };
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const cfg = supabaseServerConfig();
  if (!token || !cfg) return Response.json({ error: "Sign-in can't be verified on this server" }, { status: 401 });
  try {
    const { data, error } = await supabaseAdmin(cfg).auth.getUser(token);
    if (error || !data.user?.id) return Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
    return { userId: data.user.id, signedIn: true };
  } catch {
    return Response.json({ error: "Sign-in can't be verified right now" }, { status: 503 });
  }
}

/** Database failures → 503 (no fictional data); rule violations → 400/404. */
export function bankingErrorResponse(e: unknown, route: string): Response {
  if (e instanceof BankingRuleError) return Response.json({ error: e.message }, { status: e.message === "Transaction not found" ? 404 : 400 });
  if (e instanceof BankingStoreError) {
    log("error", "banking.route.db_error", { route, op: e.op, code: e.code });
    return Response.json({ error: `${e.message}. No banking data is shown rather than showing anything made up.`, storage: "error" }, { status: 503 });
  }
  log("error", "banking.route.error", { route, error: e instanceof Error ? e.name : "unknown" });
  return Response.json({ error: "Banking request failed" }, { status: 500 });
}
