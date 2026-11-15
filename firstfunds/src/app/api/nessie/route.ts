// Card-page feed: credit-card purchases (and the card's balance/limit) from the shared
// banking pipeline (lib/banking), read from the Nessie v2 sandbox.
// Returns source "nessie" only when the rows really came from the Nessie sandbox API;
// otherwise the bundled demo transactions. Categories come from the normalizer — never invented.
import { connection } from "next/server";
import { MAYA_TRANSACTIONS, type Transaction } from "@/lib/demo/maya";
import { activeRows } from "@/lib/banking/overview";
import { bankingErrorResponse, resolveBankingUser } from "@/lib/banking/http";
import { loadBanking } from "@/lib/banking/sync";

export async function GET(req: Request) {
  await connection(); // read env at request time, not build time
  const who = await resolveBankingUser(req);
  if (who instanceof Response) return who;
  let data;
  try {
    data = await loadBanking(who.userId);
  } catch (e) {
    return bankingErrorResponse(e, "GET /api/nessie");
  }
  const last = data.lastSync;
  const { provider, rows } = activeRows(data);
  const cardIds = new Set(data.accounts.filter((a) => a.type === "Credit Card").map((a) => a.id));
  const purchases = rows.filter((t) => provider === "nessie" && t.flow === "expense" && t.kind === "purchase" && cardIds.has(t.accountId) && t.date);
  const nessieStatus = last?.nessieStatus ?? null;
  const cardAccount = provider === "nessie" ? data.accounts.find((a) => a.provider === "nessie" && a.type === "Credit Card") : undefined;
  const card = cardAccount ? { nickname: cardAccount.nickname, balance: cardAccount.balance, available: cardAccount.available, creditLimit: cardAccount.creditLimit, last4: cardAccount.last4 } : null;
  // No real sandbox card purchases → the page keeps its bundled sample data, labelled "Sample data".
  if (!purchases.length) return Response.json({ source: "demo", transactions: MAYA_TRANSACTIONS, nessieStatus, card, note: last?.label });
  const transactions = purchases.slice(0, 50).map((t) => ({
    id: t.id,
    date: t.date!,
    merchant: t.merchant ?? t.description ?? "Unknown merchant",
    category: t.category as Transaction["category"],
    amount: t.amount,
  }));
  return Response.json({ source: "nessie", transactions, nessieStatus, card, note: last?.label });
}
