// Card-page feed: credit-card purchases from the shared banking pipeline (lib/banking).
// Returns source "nessie" only when the rows really came from the Nessie sandbox API;
// otherwise the bundled demo transactions. Categories come from the normalizer — never invented.
import { connection } from "next/server";
import { MAYA_TRANSACTIONS, type Transaction } from "@/lib/demo/maya";
import { activeRows } from "@/lib/banking/overview";
import { banking, DEMO_BANK_USER } from "@/lib/banking/repository";
import { syncBanking } from "@/lib/banking/sync";

export async function GET() {
  await connection(); // read env at request time, not build time
  const userId = DEMO_BANK_USER;
  if (!banking.lastSync(userId)) await syncBanking(userId);
  const last = banking.lastSync(userId);
  const { provider, rows } = activeRows(userId);
  const cardIds = new Set(banking.accounts(userId).filter((a) => a.type === "Credit Card").map((a) => a.id));
  const purchases = rows.filter((t) => provider === "nessie" && t.flow === "expense" && t.kind === "purchase" && cardIds.has(t.accountId) && t.date);
  if (!purchases.length) return Response.json({ source: "demo", transactions: MAYA_TRANSACTIONS, note: last?.label });
  const transactions = purchases.slice(0, 50).map((t) => ({
    id: t.id,
    date: t.date!,
    merchant: t.merchant ?? t.description ?? "Unknown merchant",
    category: t.category as Transaction["category"],
    amount: t.amount,
  }));
  return Response.json({ source: "nessie", transactions, note: last?.label });
}
