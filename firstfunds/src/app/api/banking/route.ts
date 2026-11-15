// My Budget read model. Demo mode: all banking data belongs to the demo user; Nessie data
// is simulated sandbox data and is always labelled as such.
import { connection } from "next/server";
import { bankingOverview } from "@/lib/banking/overview";
import { banking, DEMO_BANK_USER } from "@/lib/banking/repository";
import { syncBanking } from "@/lib/banking/sync";
import { rateLimit } from "@/lib/server/rateLimit";

export async function GET(req: Request) {
  await connection();
  const limited = rateLimit(req, "banking", 60, 60_000);
  if (limited) return limited;
  const userId = DEMO_BANK_USER;
  if (!banking.lastSync(userId)) await syncBanking(userId); // first visit imports demo data
  const p = new URL(req.url).searchParams;
  const nr = p.get("needsReview");
  return Response.json(
    bankingOverview(userId, {
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
  );
}
