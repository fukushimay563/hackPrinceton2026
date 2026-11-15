import { bankingErrorResponse, resolveBankingUser } from "@/lib/banking/http";
import { bankingStore } from "@/lib/banking/repository";
import { rateLimit } from "@/lib/server/rateLimit";
import type { Budgets } from "@/lib/banking/analytics";

export async function PUT(req: Request) {
  const limited = rateLimit(req, "banking-write", 30, 60_000);
  if (limited) return limited;
  const who = await resolveBankingUser(req);
  if (who instanceof Response) return who;
  let budgets: Budgets;
  try {
    budgets = ((await req.json()) as { budgets: Budgets }).budgets;
    if (!budgets || typeof budgets !== "object") throw new Error();
  } catch {
    return Response.json({ error: "Invalid budgets" }, { status: 400 });
  }
  try {
    return Response.json({ budgets: await bankingStore().setBudgets(who.userId, budgets) });
  } catch (e) {
    return bankingErrorResponse(e, "PUT /api/banking/budgets");
  }
}
