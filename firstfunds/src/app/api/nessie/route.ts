// Optional Capital One Nessie sandbox adapter. If NESSIE_API_KEY and
// NESSIE_ACCOUNT_ID are set, pulls sandbox purchases; otherwise returns the
// bundled demo transactions so the demo never depends on the network.
// Nessie docs: http://api.nessieisreal.com/documentation (verify the current
// Capital One prize rules before relying on this for eligibility).
import { connection } from "next/server";
import { MAYA_TRANSACTIONS, type Transaction } from "@/lib/demo/maya";


type NessiePurchase = {
  _id: string;
  purchase_date?: string;
  amount: number;
  description?: string;
  merchant_id?: string;
};

const CATS: Transaction["category"][] = ["Food", "Shopping", "Transport", "Subscriptions", "Entertainment", "Bills"];

export async function GET() {
  await connection(); // read env at request time, not build time
  const key = process.env.NESSIE_API_KEY;
  const account = process.env.NESSIE_ACCOUNT_ID;
  if (!key || !account) {
    return Response.json({ source: "demo", transactions: MAYA_TRANSACTIONS });
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `http://api.nessieisreal.com/accounts/${encodeURIComponent(account)}/purchases?key=${encodeURIComponent(key)}`,
      { signal: ctrl.signal, cache: "no-store" },
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Nessie ${res.status}`);
    const data = (await res.json()) as NessiePurchase[];
    const transactions: Transaction[] = data.slice(0, 50).map((p, i) => ({
      id: p._id,
      date: p.purchase_date ?? new Date().toISOString().slice(0, 10),
      merchant: p.description || `Merchant ${p.merchant_id?.slice(-4) ?? i + 1}`,
      category: CATS[i % CATS.length],
      amount: Number(p.amount) || 0,
    }));
    if (!transactions.length) throw new Error("No purchases on sandbox account");
    return Response.json({ source: "nessie", transactions });
  } catch (err) {
    console.error("Nessie unavailable, using demo data:", err);
    return Response.json({ source: "demo", transactions: MAYA_TRANSACTIONS });
  }
}
