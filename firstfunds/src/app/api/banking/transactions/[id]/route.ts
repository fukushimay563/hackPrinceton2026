// Explicit user category correction (the only write path for categories).
import { banking, DEMO_BANK_USER } from "@/lib/banking/repository";
import { rateLimit } from "@/lib/server/rateLimit";
import type { BudgetCategory } from "@/lib/banking/types";

const ALLOWED: BudgetCategory[] = ["Food", "Groceries", "Shopping", "Transport", "Subscriptions", "Entertainment", "Bills", "Health", "Income", "Refund", "Uncategorized"];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "banking-write", 30, 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  let body: { category?: string; confirmedByUser?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.confirmedByUser !== true) return Response.json({ error: "Category changes must be confirmed by the user" }, { status: 400 });
  if (!body.category || !ALLOWED.includes(body.category as BudgetCategory)) return Response.json({ error: "Unknown category" }, { status: 400 });
  try {
    const tx = banking.setCategory(DEMO_BANK_USER, decodeURIComponent(id), body.category as BudgetCategory, "user");
    return Response.json({ transaction: tx });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return Response.json({ error: msg }, { status: msg === "Transaction not found" ? 404 : 400 });
  }
}
