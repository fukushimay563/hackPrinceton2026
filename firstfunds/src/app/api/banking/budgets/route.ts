import { banking, DEMO_BANK_USER } from "@/lib/banking/repository";
import { rateLimit } from "@/lib/server/rateLimit";
import type { Budgets } from "@/lib/banking/analytics";

export async function PUT(req: Request) {
  const limited = rateLimit(req, "banking-write", 30, 60_000);
  if (limited) return limited;
  try {
    const { budgets } = (await req.json()) as { budgets: Budgets };
    if (!budgets || typeof budgets !== "object") throw new Error();
    banking.setBudgets(DEMO_BANK_USER, budgets);
    return Response.json({ budgets: banking.budgets(DEMO_BANK_USER) });
  } catch {
    return Response.json({ error: "Invalid budgets" }, { status: 400 });
  }
}
