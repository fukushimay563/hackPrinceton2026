// FICTIONAL fallback dataset, used only when Nessie is not configured or unreachable.
// Shaped like Nessie responses so it exercises the same normalizer, but every id starts
// with "fallback-" and the provider is recorded as "fallback". It is always labelled as
// fictional in the UI and in FinPilot answers, and is never presented as API data.
import type { NessieSnapshot } from "./nessie";

const ck = "fallback-acct-checking0001";
const sv = "fallback-acct-savings00001";
const cc = "fallback-acct-creditcard01";

export const FALLBACK_LABEL = "Fictional sample data (Nessie unavailable). Not from any bank.";

export function fallbackSnapshot(): NessieSnapshot {
  return {
    accounts: [
      { _id: ck, type: "Checking", nickname: "Everyday checking (sample)", rewards: 0, balance: 1240, account_number: "0000000000000001", customer_id: "fallback-customer" },
      { _id: sv, type: "Savings", nickname: "Rainy-day savings (sample)", rewards: 0, balance: 2600, account_number: "0000000000000002", customer_id: "fallback-customer" },
      { _id: cc, type: "Credit Card", nickname: "Starter card (sample)", rewards: 120, balance: 312, account_number: "0000000000000003", customer_id: "fallback-customer" },
    ],
    deposits: [
      {
        accountId: ck,
        items: [
          { _id: "fallback-dep-0001", medium: "balance", transaction_date: "2026-10-01", status: "completed", amount: 1450, description: "ACME Corp payroll" },
          { _id: "fallback-dep-0002", medium: "balance", transaction_date: "2026-10-12", status: "completed", amount: 60, description: "Venmo from roommate" },
          { _id: "fallback-dep-0003", medium: "balance", transaction_date: "2026-11-01", status: "completed", amount: 1450, description: "ACME Corp payroll" },
          { _id: "fallback-dep-0004", medium: "balance", transaction_date: "2026-11-09", status: "completed", amount: 34.99, description: "Refund - Urban Threads return" },
        ],
      },
      { accountId: sv, items: [] },
      { accountId: cc, items: [] },
    ],
    withdrawals: [
      {
        accountId: ck,
        items: [
          { _id: "fallback-wd-0001", medium: "balance", transaction_date: "2026-10-03", status: "completed", amount: 850, description: "Rent bill payment" },
          { _id: "fallback-wd-0002", medium: "balance", transaction_date: "2026-10-20", status: "completed", amount: 40, description: "ATM cash" },
          { _id: "fallback-wd-0003", medium: "balance", transaction_date: "2026-11-03", status: "completed", amount: 850, description: "Rent bill payment" },
        ],
      },
      { accountId: sv, items: [] },
      { accountId: cc, items: [] },
    ],
    purchases: [
      { _id: "fallback-pur-0001", merchant_id: "fallback-m-coffee", medium: "balance", purchase_date: "2026-10-04", amount: 6.75, status: "completed", description: "Campus Coffee", payer_id: cc },
      { _id: "fallback-pur-0002", merchant_id: "fallback-m-stream", medium: "balance", purchase_date: "2026-10-05", amount: 15.49, status: "completed", description: "StreamFlix monthly", payer_id: cc },
      { _id: "fallback-pur-0003", merchant_id: "fallback-m-grocer", medium: "balance", purchase_date: "2026-10-09", amount: 82.3, status: "completed", description: "FreshMart", payer_id: ck },
      { _id: "fallback-pur-0004", merchant_id: "fallback-m-thread", medium: "balance", purchase_date: "2026-10-18", amount: 34.99, status: "completed", description: "Urban Threads", payer_id: cc },
      { _id: "fallback-pur-0005", merchant_id: "fallback-m-stream", medium: "balance", purchase_date: "2026-11-05", amount: 15.49, status: "completed", description: "StreamFlix monthly", payer_id: cc },
      { _id: "fallback-pur-0006", merchant_id: "fallback-m-grocer", medium: "balance", purchase_date: "2026-11-08", amount: 91.12, status: "completed", description: "FreshMart", payer_id: ck },
      { _id: "fallback-pur-0007", merchant_id: "fallback-m-coffee", medium: "balance", purchase_date: "2026-11-10", amount: 7.25, status: "completed", description: "Campus Coffee", payer_id: cc },
      { _id: "fallback-pur-0008", merchant_id: "fallback-m-misc", medium: "balance", purchase_date: "2026-11-11", amount: 23.5, status: "completed", description: "QX*8812 PAYMENT", payer_id: cc },
      { _id: "fallback-pur-0009", merchant_id: "fallback-m-concert", medium: "balance", purchase_date: "2026-11-12", amount: 48, status: "cancelled", description: "Concert tickets", payer_id: cc },
    ],
    transfers: [
      { _id: "fallback-tr-0001", medium: "balance", transaction_date: "2026-10-02", status: "completed", amount: 200, description: "To savings", payer_id: ck, payee_id: sv },
      { _id: "fallback-tr-0002", medium: "balance", transaction_date: "2026-10-28", status: "completed", amount: 57.23, description: "Card payment", payer_id: ck, payee_id: cc },
      { _id: "fallback-tr-0003", medium: "balance", transaction_date: "2026-11-02", status: "completed", amount: 200, description: "To savings", payer_id: ck, payee_id: sv },
      { _id: "fallback-tr-0004", medium: "balance", transaction_date: "2026-11-06", status: "completed", amount: 25, description: "Zelle to J.", payer_id: ck, payee_id: "fallback-external-person" },
    ],
    merchants: [
      { _id: "fallback-m-coffee", name: "Campus Coffee Co. (sample)", category: "Coffee shop" },
      { _id: "fallback-m-stream", name: "StreamFlix (sample)", category: "Streaming subscription" },
      { _id: "fallback-m-grocer", name: "FreshMart (sample)", category: "Grocery" },
      { _id: "fallback-m-thread", name: "Urban Threads (sample)", category: "Clothing store" },
      { _id: "fallback-m-concert", name: "Arena Box Office (sample)", category: "Concert tickets" },
      { _id: "fallback-m-misc", name: "QX*8812 (sample)" },
    ],
    warnings: [],
  };
}
