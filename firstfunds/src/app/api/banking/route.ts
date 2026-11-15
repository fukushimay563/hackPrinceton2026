// My Budget read model, from PERSISTED records (Supabase in production), so every serverless
// instance shows the same data. Signed-in users get their own records; everyone else sees the
// shared demo profile. Nessie data is simulated sandbox data and is always labelled as such.
import { connection } from "next/server";
import { bankingOverview } from "@/lib/banking/overview";
import { bankingErrorResponse, resolveBankingUser } from "@/lib/banking/http";
import { loadBanking } from "@/lib/banking/sync";
import { rateLimit } from "@/lib/server/rateLimit";

export async function GET(req: Request) {
  await connection();
  const limited = rateLimit(req, "banking", 60, 60_000);
  if (limited) return limited;
  const who = await resolveBankingUser(req);
  if (who instanceof Response) return who;
  try {
    const data = await loadBanking(who.userId); // syncs on first visit (or after a stale empty/failed sync)
    const p = new URL(req.url).searchParams;
    const nr = p.get("needsReview");
    return Response.json(
      bankingOverview(data, who.userId, {
        month: p.get("month") ?? undefined,
        filters: {
          q: p.get("q") ?? undefined,
          category: p.get("category") || undefined,
          flow: p.get("flow") || undefined,
          accountId: p.get("account") || undefined,
          month: p.get("txMonth") || undefined,
          needsReview: nr === "true" ? true : nr === "false" ? false : undefined,
        },
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return bankingErrorResponse(e, "GET /api/banking");
  }
}
