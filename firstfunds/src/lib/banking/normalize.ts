// Deterministic conversion of Nessie records into BankTransaction rows.
// Rules (financial accuracy):
//  • Transfers between the user's own accounts (incl. paying their own credit card) are `transfer` — never income/expense.
//  • Refunds/returns are `refund` — they reduce spending; they are never income.
//  • Credit-card purchases are expenses when made; card payments are excluded, so nothing is counted twice.
//  • A deposit is only labelled employment income when its description says so; otherwise it is income flagged for review.
//  • Missing dates stay null and missing/invalid amounts are skipped — nothing is invented.
//  • Anything uncertain gets needsReview + a reason.
import type { BankAccount, BankTransaction, BudgetCategory, CategorySource, Flow, NessieKind, Provider } from "./types";
import type { NessieRaw } from "./nessie";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function normalizeDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}` ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

export function normalizeAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Stable key used to match user category corrections to similar transactions. */
export function merchantKey(text: string | null): string | null {
  if (!text) return null;
  const k = text.toLowerCase().replace(/[0-9#*]+/g, " ").replace(/[^a-z&' ]+/g, " ").replace(/\s+/g, " ").trim();
  return k || null;
}

// Keyword rules, checked in order. Matching is on merchant category, name and description.
const CATEGORY_RULES: [RegExp, BudgetCategory][] = [
  [/grocer|supermarket|market\b|whole foods|trader joe|aldi|kroger/i, "Groceries"],
  [/restaurant|food|coffee|cafe|café|pizza|burger|bakery|dining|bar\b|grill/i, "Food"],
  [/netflix|spotify|subscription|stream|hulu|prime video|music|apple\.com|icloud/i, "Subscriptions"],
  [/uber|lyft|ride|transit|metro|bus\b|train|gas\b|fuel|parking|airline|travel/i, "Transport"],
  [/electric|utility|utilities|water|internet|phone|wireless|insurance|rent\b|bill/i, "Bills"],
  [/pharmacy|doctor|clinic|health|medical|dental/i, "Health"],
  [/movie|cinema|concert|ticket|game|entertainment|theater|theatre/i, "Entertainment"],
  [/store|shop|retail|apparel|clothing|mall|amazon|target|walmart|electronics|book/i, "Shopping"],
];

export function categorize(...texts: (string | null | undefined)[]): BudgetCategory | null {
  const hay = texts.filter(Boolean).join(" ");
  if (!hay) return null;
  for (const [re, cat] of CATEGORY_RULES) if (re.test(hay)) return cat;
  return null;
}

const REFUND = /\b(refund|return|reversal|chargeback|reimburse)/i;
const PAYROLL = /\b(payroll|paycheck|salary|wages|direct dep)/i;
const CARD_PAYMENT = /\b(credit card|card payment|card pmt|autopay)/i;

export type Corrections = Map<string, BudgetCategory>; // merchantKey → user-approved category

export type NormalizeInput = {
  provider: Provider;
  userId: string;
  accounts: NessieRaw[];
  deposits: { accountId: string; items: NessieRaw[] }[];
  withdrawals: { accountId: string; items: NessieRaw[] }[];
  purchases: NessieRaw[];
  transfers: NessieRaw[];
  merchants: NessieRaw[];
  corrections?: Corrections;
  now?: number;
};

export type NormalizeOutput = {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  skipped: { kind: string; externalId: string | null; reason: string }[];
};

const ACCOUNT_TYPES = new Set(["Checking", "Savings", "Credit Card"]);

export function normalizeAccount(raw: NessieRaw, provider: Provider, userId: string): BankAccount | null {
  const externalId = str(raw._id);
  if (!externalId) return null;
  const t = str(raw.type);
  const num = str(raw.account_number);
  const bal = typeof raw.balance === "number" && Number.isFinite(raw.balance) ? raw.balance : null;
  return {
    id: `${provider}:${externalId}`,
    provider,
    externalId,
    userId,
    type: t && ACCOUNT_TYPES.has(t) ? (t as BankAccount["type"]) : "Unknown",
    nickname: str(raw.nickname),
    balance: bal,
    last4: num && /^\d{4,}$/.test(num) ? num.slice(-4) : null,
  };
}

/** Strips the full account number from the stored raw copy. */
function safeRaw(raw: NessieRaw): Record<string, unknown> {
  const { account_number: _drop, ...rest } = raw as Record<string, unknown>;
  void _drop;
  return rest;
}

export function normalizeNessie(input: NormalizeInput): NormalizeOutput {
  const { provider, userId } = input;
  const now = input.now ?? Date.now();
  const corrections = input.corrections ?? new Map();
  const skipped: NormalizeOutput["skipped"] = [];
  const accounts: BankAccount[] = [];
  for (const a of input.accounts) {
    const acc = normalizeAccount(a, provider, userId);
    if (acc) accounts.push(acc);
    else skipped.push({ kind: "account", externalId: null, reason: "missing _id" });
  }
  const own = new Map(accounts.map((a) => [a.externalId, a]));
  const merchants = new Map(input.merchants.map((m) => [str(m._id) ?? "", m]));
  const out: BankTransaction[] = [];

  const push = (args: {
    kind: NessieKind;
    raw: NessieRaw;
    accountExt: string | null;
    direction: "inflow" | "outflow";
    flow: Flow;
    category: BudgetCategory;
    categorySource: CategorySource;
    merchant: string | null;
    reasons: string[];
    dateField: unknown;
  }) => {
    const externalId = str(args.raw._id);
    if (!externalId) return void skipped.push({ kind: args.kind, externalId: null, reason: "missing _id" });
    const amount = normalizeAmount(args.raw.amount);
    if (amount === null) return void skipped.push({ kind: args.kind, externalId, reason: "missing or non-positive amount" });
    const reasons = [...args.reasons];
    const date = normalizeDate(args.dateField);
    if (!date) reasons.push("Date missing or invalid in source data");
    if (!args.accountExt || !own.has(args.accountExt)) reasons.push("Account not found in this profile");
    let { category, categorySource, flow } = args;
    const status = str(args.raw.status);
    if (status && /cancel/i.test(status)) {
      flow = "excluded";
      reasons.push("Cancelled in source data");
    }
    // User-approved corrections win for spending/income rows (never for own-account transfers).
    const key = merchantKey(args.merchant ?? str(args.raw.description));
    const corrected = key ? corrections.get(key) : undefined;
    if (corrected && flow !== "transfer") {
      category = corrected;
      categorySource = "user";
      for (let i = reasons.length - 1; i >= 0; i--) if (/category/i.test(reasons[i])) reasons.splice(i, 1);
    }
    out.push({
      id: `${provider}:${args.kind}:${externalId}`,
      provider,
      externalId,
      kind: args.kind,
      accountId: args.accountExt ? `${provider}:${args.accountExt}` : `${provider}:unknown`,
      userId,
      date,
      amount,
      direction: args.direction,
      description: str(args.raw.description),
      merchant: args.merchant,
      category,
      categorySource,
      flow,
      status,
      needsReview: reasons.length > 0,
      reviewReasons: reasons,
      raw: safeRaw(args.raw),
      importedAt: now,
    });
  };

  // Deposits
  for (const group of input.deposits) {
    const acct = own.get(group.accountId);
    for (const d of group.items) {
      const desc = str(d.description);
      const base = { kind: "deposit" as const, raw: d, accountExt: group.accountId, direction: "inflow" as const, merchant: null, dateField: d.transaction_date };
      if (acct?.type === "Credit Card") {
        push({ ...base, flow: "transfer", category: "Card payment", categorySource: "rule", reasons: ["Deposit into a credit card account treated as a card payment, not income"] });
      } else if (desc && REFUND.test(desc)) {
        push({ ...base, flow: "refund", category: "Refund", categorySource: "rule", reasons: [] });
      } else if (desc && PAYROLL.test(desc)) {
        push({ ...base, flow: "income", category: "Income", categorySource: "rule", reasons: [] });
      } else {
        push({ ...base, flow: "income", category: "Income", categorySource: "none", reasons: ["Deposit source unknown; not assumed to be employment income"] });
      }
    }
  }

  // Withdrawals
  for (const group of input.withdrawals) {
    const hasCard = accounts.some((a) => a.type === "Credit Card");
    for (const w of group.items) {
      const desc = str(w.description);
      const base = { kind: "withdrawal" as const, raw: w, accountExt: group.accountId, direction: "outflow" as const, merchant: null, dateField: w.transaction_date };
      if (desc && hasCard && CARD_PAYMENT.test(desc)) {
        push({ ...base, flow: "transfer", category: "Card payment", categorySource: "rule", reasons: ["Looks like a payment to your own credit card; excluded so purchases aren't counted twice"] });
      } else {
        const cat = categorize(desc, str(w.medium));
        push({ ...base, flow: "expense", category: cat ?? "Uncategorized", categorySource: cat ? "rule" : "none", reasons: cat ? [] : ["Withdrawal category unknown"] });
      }
    }
  }

  // Purchases (fetched by id; account comes from payer_id when present)
  for (const p of input.purchases) {
    const m = merchants.get(str(p.merchant_id) ?? "");
    const name = m ? str(m.name) : null;
    const mcat = m ? str(m.category) : null;
    const desc = str(p.description);
    const cat = categorize(mcat, name, desc);
    const reasons = cat ? [] : ["Purchase category unknown"];
    const isRefund = !!desc && REFUND.test(desc);
    push({
      kind: "purchase",
      raw: p,
      accountExt: str(p.payer_id),
      direction: isRefund ? "inflow" : "outflow",
      flow: isRefund ? "refund" : "expense",
      category: isRefund ? "Refund" : cat ?? "Uncategorized",
      categorySource: isRefund ? "rule" : cat ? (mcat ? "provider" : "rule") : "none",
      merchant: name ?? desc,
      reasons: isRefund ? [] : reasons,
      dateField: p.purchase_date ?? p.transaction_date,
    });
  }

  // Transfers: one row per transfer, from the paying side when it is one of our accounts.
  for (const t of input.transfers) {
    const payer = str(t.payer_id);
    const payee = str(t.payee_id);
    const payerOwn = payer ? own.get(payer) : undefined;
    const payeeOwn = payee ? own.get(payee) : undefined;
    const base = { kind: "transfer" as const, raw: t, merchant: null, dateField: t.transaction_date };
    if (payerOwn && payeeOwn) {
      const toCard = payeeOwn.type === "Credit Card";
      push({ ...base, accountExt: payer, direction: "outflow", flow: "transfer", category: toCard ? "Card payment" : "Transfer", categorySource: "rule", reasons: [] });
    } else if (payerOwn) {
      push({ ...base, accountExt: payer, direction: "outflow", flow: "excluded", category: "Transfer", categorySource: "none", reasons: ["Transfer to an account outside this profile; review whether it is spending"] });
    } else if (payeeOwn) {
      push({ ...base, accountExt: payee, direction: "inflow", flow: "excluded", category: "Transfer", categorySource: "none", reasons: ["Transfer from an account outside this profile; review whether it is income"] });
    } else {
      skipped.push({ kind: "transfer", externalId: str(t._id), reason: "neither payer nor payee is an account in this profile" });
    }
  }

  return { accounts, transactions: out, skipped };
}
