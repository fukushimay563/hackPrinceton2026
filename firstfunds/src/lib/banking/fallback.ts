// FICTIONAL fallback dataset, used only when Nessie is not configured or its API fails.
// Shaped like Nessie v2 responses (cents, `id`, transaction `kind`) so it exercises the
// same normalizer, but every id starts with "fallback-" and the provider is recorded as
// "fallback". It is always labelled as fictional in the UI and in FinPilot answers, and is
// never shown when Nessie answers successfully (even with an empty sandbox).
import type { NessieRaw, NessieSnapshot } from "./nessie";

const ck = "fallback-acct-checking0001";
const sv = "fallback-acct-savings00001";
const cc = "fallback-acct-creditcard01";

export const FALLBACK_LABEL = "Fictional sample data (Nessie unavailable). Not from any bank.";

const ts = (d: string) => `${d}T15:00:00Z`;
const tx = (id: string, kind: string, date: string, dollars: number, description: string, extra: NessieRaw = {}): NessieRaw => ({
  id,
  kind,
  status: "completed",
  medium: "balance",
  amount_cents: Math.round(dollars * 100),
  description,
  created_at: ts(date),
  updated_at: ts(date),
  settle_at: ts(date),
  ...extra,
});

export function fallbackSnapshot(): NessieSnapshot {
  const transfers = [
    tx("fallback-tr-0001", "transfer", "2026-10-02", 200, "To savings", { payer_id: ck, payee_id: sv }),
    tx("fallback-tr-0002", "transfer", "2026-10-28", 57.23, "Card payment", { payer_id: ck, payee_id: cc }),
    tx("fallback-tr-0003", "transfer", "2026-11-02", 200, "To savings", { payer_id: ck, payee_id: sv }),
    tx("fallback-tr-0004", "transfer", "2026-11-06", 25, "Zelle to J.", { payer_id: ck, payee_id: "fallback-external-person" }),
  ];
  const checking = [
    tx("fallback-dep-0001", "deposit", "2026-10-01", 1450, "ACME Corp payroll", { payee_id: ck }),
    tx("fallback-dep-0002", "deposit", "2026-10-12", 60, "Venmo from roommate", { payee_id: ck }),
    tx("fallback-dep-0003", "deposit", "2026-11-01", 1450, "ACME Corp payroll", { payee_id: ck }),
    tx("fallback-dep-0004", "deposit", "2026-11-09", 34.99, "Refund - Urban Threads return", { payee_id: ck }),
    tx("fallback-wd-0001", "withdrawal", "2026-10-03", 850, "Rent bill payment", { payer_id: ck }),
    tx("fallback-wd-0002", "withdrawal", "2026-10-20", 40, "ATM cash", { payer_id: ck }),
    tx("fallback-wd-0003", "withdrawal", "2026-11-03", 850, "Rent bill payment", { payer_id: ck }),
    tx("fallback-pur-0003", "purchase", "2026-10-09", 82.3, "FreshMart", { payer_id: ck, merchant_id: "fallback-m-grocer" }),
    tx("fallback-pur-0006", "purchase", "2026-11-08", 91.12, "FreshMart", { payer_id: ck, merchant_id: "fallback-m-grocer" }),
    ...transfers,
  ];
  const card = [
    tx("fallback-pur-0001", "purchase", "2026-10-04", 6.75, "Campus Coffee", { payer_id: cc, merchant_id: "fallback-m-coffee" }),
    tx("fallback-pur-0002", "purchase", "2026-10-05", 15.49, "StreamFlix monthly", { payer_id: cc, merchant_id: "fallback-m-stream" }),
    tx("fallback-pur-0004", "purchase", "2026-10-18", 34.99, "Urban Threads", { payer_id: cc, merchant_id: "fallback-m-thread" }),
    tx("fallback-pur-0005", "purchase", "2026-11-05", 15.49, "StreamFlix monthly", { payer_id: cc, merchant_id: "fallback-m-stream" }),
    tx("fallback-pur-0007", "purchase", "2026-11-10", 7.25, "Campus Coffee", { payer_id: cc, merchant_id: "fallback-m-coffee" }),
    tx("fallback-pur-0008", "purchase", "2026-11-11", 23.5, "QX*8812 PAYMENT", { payer_id: cc, merchant_id: "fallback-m-misc" }),
    tx("fallback-pur-0009", "purchase", "2026-11-12", 48, "Concert tickets", { payer_id: cc, merchant_id: "fallback-m-concert", status: "cancelled" }),
    transfers[1], // the card payment also appears in the card's own list (merged by id)
  ];
  const savings = [transfers[0], transfers[2]];
  const acct = (id: string, type: string, nickname: string, balance: number, number: string, extra: NessieRaw = {}): NessieRaw => ({
    id,
    customer_id: "fallback-customer",
    type,
    nickname,
    balance_cents: Math.round(balance * 100),
    pending_debits_cents: 0,
    available_cents: Math.round(balance * 100),
    account_number: number,
    rewards: 0,
    created_at: ts("2026-09-01"),
    updated_at: ts("2026-11-12"),
    ...extra,
  });
  return {
    accounts: [
      acct(ck, "Checking", "Everyday checking (sample)", 1240, "0000000000000001"),
      acct(sv, "Savings", "Rainy-day savings (sample)", 2600, "0000000000000002"),
      acct(cc, "Credit Card", "Starter card (sample)", 312, "0000000000000003", { available_cents: 68800, credit_limit_cents: 100000, rewards: 120 }),
    ],
    transactions: [
      { accountId: ck, items: checking },
      { accountId: sv, items: savings },
      { accountId: cc, items: card },
    ],
    bills: [],
    loans: [],
    merchants: [
      { id: "fallback-m-coffee", name: "Campus Coffee Co. (sample)", category: "Coffee shop" },
      { id: "fallback-m-stream", name: "StreamFlix (sample)", category: "Streaming subscription" },
      { id: "fallback-m-grocer", name: "FreshMart (sample)", category: "Grocery" },
      { id: "fallback-m-thread", name: "Urban Threads (sample)", category: "Clothing store" },
      { id: "fallback-m-concert", name: "Arena Box Office (sample)", category: "Concert tickets" },
      { id: "fallback-m-misc", name: "QX*8812 (sample)" },
    ],
    warnings: [],
    calls: [],
  };
}
