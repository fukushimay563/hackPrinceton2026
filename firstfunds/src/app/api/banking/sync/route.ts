import { bankingErrorResponse, resolveBankingUser } from "@/lib/banking/http";
import { syncBanking } from "@/lib/banking/sync";
import { rateLimit } from "@/lib/server/rateLimit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "banking-sync", 6, 60_000);
  if (limited) return limited;
  const who = await resolveBankingUser(req);
  if (who instanceof Response) return who;
  try {
    return Response.json(await syncBanking(who.userId), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return bankingErrorResponse(e, "POST /api/banking/sync");
  }
}
