import { DEMO_BANK_USER } from "@/lib/banking/repository";
import { syncBanking } from "@/lib/banking/sync";
import { rateLimit } from "@/lib/server/rateLimit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "banking-sync", 6, 60_000);
  if (limited) return limited;
  const report = await syncBanking(DEMO_BANK_USER);
  return Response.json(report);
}
