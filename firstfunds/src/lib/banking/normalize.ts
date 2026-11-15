// Deterministic conversion of Nessie v2 records into BankTransaction rows.
// v2 sends money as integer cents and ids as `id`; each transaction has a `kind` and
// payer_id/payee_id (account ids). See src/lib/banking/nessie.ts for the contract.
// Rules (financial accuracy):
//  • Transfers between the user's own accounts (incl. paying their own credit card) are `transfer` — never income/expense.
//  • Refunds/returns are `refund` — they reduce spending; they are never income.
//  • Credit-card purchases are expenses when made; card payments are excluded, so nothing is counted twice.
//  • A deposit is only labelled employment income when its description says so; otherwise it is income flagged for review.
//  • Missing dates stay null and missing/invalid amounts are skipped — nothing is invented.
//  • Anything uncertain gets needsReview + a reason.
import type { BankAccount, BankBill, BankLoan, BankTransaction, BudgetCategory, CategorySource, Flow, NessieKind, Provider } from "./types";
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

/** Integer cents → dollars. Null for missing, non-integer or non-finite values (never guessed). */
export function centsToDollars(v: unknown, opts: { allowZero?: boolean; allowNegative?: boolean } = {}): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) return null;
  if (v < 0 && !opts.allowNegative) return null;
  if (v === 0 && !opts.allowZero) return null;
  return Math.round(v) / 100;
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
  /** Per-account lists from /accounts/{id}/transactions (duplicates across accounts are merged). */
  transactions: { accountId: string; items: NessieRaw[] }[];
  merchants: NessieRaw[];
  bills?: NessieRaw[];
  loans?: NessieRaw[];
  corrections?: Corrections;
  now?: number;
};

export type NormalizeOutput = {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  bills: BankBill[];
  loans: BankLoan[];
  skipped: { kind: string; externalId: string | null; reason: string }[];
};

const ACCOUNT_TYPES = new Set(["Checking", "Savings", "Credit Card"]);
const KINDS = new Set<NessieKind>(["purchase", "deposit", "withdrawal", "transfer", "bill_payment", "fee", "interest_credit", "refund", "chargeback"]);

export function normalizeAccount(raw: NessieRaw, provider: Provider, userId: string): BankAccount | null {
  const externalId = str(raw.id);
  if (!externalId) return null;
  const t = str(raw.type);
  const num = str(raw.account_number);
  return {
    id: `${provider}:${externalId}`,
    provider,
    externalId,
    userId,
    type: t && ACCOUNT_TYPES.has(t) ? (t as BankAccount["type"]) : "Unknown",
    nickname: str(raw.nickname),
    balance: centsToDollars(raw.balance_cents, { allowZero: true, allowNegative: true }),
    available: centsToDollars(raw.available_cents, { allowZero: true, allowNegative: true }),
    creditLimit: centsToDollars(raw.credit_limit_cents, { allowZero: true }),
    last4: num && /^\d{4,}$/.test(num) ? num.slice(-4) : null,
  };
}

/** Strips the full account number from the stored raw copy. */
function safeRaw(raw: NessieRaw): Record<string, unknown> {
  const { account_number: _drop, ...rest } = raw as Record<string, unknown>;
  void _drop;
  return rest;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function normalizeNessie(input: NormalizeInput): NormalizeOutput {
  const { provider, userId } = input;
  const now = input.now ?? Date.now();
  const corrections = input.corrections ?? new Map();
  const skipped: NormalizeOutput["skipped"] = [];
  const accounts: BankAccount[] = [];
  for (const a of input.accounts) {
    const acc = normalizeAccount(a, provider, userId);
    if (acc) accounts.push(acc);
    else skipped.push({ kind: "account", externalId: null, reason: "missing id" });
  }
  const own = new Map(accounts.map((a) => [a.externalId, a]));
  const merchants = new Map(input.merchants.map((m) => [str(m.id) ?? "", m]));
  const billsById = new Map((input.bills ?? []).map((b) => [str(b.id) ?? "", b]));
  const out: BankTransaction[] = [];
  const seen = new Set<string>();

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
  }) => {
    const externalId = str(args.raw.id)!;
    const amount = centsToDollars(args.raw.amount_cents);
    if (amount === null) return void skipped.push({ kind: args.kind, externalId, reason: "missing or non-positive amount_cents" });
    const reasons = [...args.reasons];
    const date = normalizeDate(args.raw.created_at);
    if (!date) reasons.push("Date missing or invalid in source data");
    if (!args.accountExt || !own.has(args.accountExt)) reasons.push("Account not found in this profile");
    let { category, categorySource, flow } = args;
    const status = str(args.raw.status);
    if (status === "declined" || status === "cancelled" || (status && /cancel/i.test(status))) {
      flow = "excluded";
      reasons.push(status === "declined" ? "Declined in source data" : "Cancelled in source data");
    } else if (status === "pending") {
      reasons.push("Pending in Nessie; the amount may still change or be declined");
    }
    if (str(args.raw.medium) === "rewards" && flow !== "excluded") {
      flow = "excluded";
      reasons.push("Paid with rewards points, not money; not counted");
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

  const hasCard = accounts.some((a) => a.type === "Credit Card");
  for (const group of input.transactions) {
    for (const t of group.items) {
      const externalId = str(t.id);
      if (!externalId) {
        skipped.push({ kind: "transaction", externalId: null, reason: "missing id" });
        continue;
      }
      if (seen.has(externalId)) continue; // a transfer is listed under both accounts
      seen.add(externalId);
      const kind = str(t.kind) as NessieKind | null;
      if (!kind || !KINDS.has(kind)) {
        skipped.push({ kind: String(t.kind ?? "unknown"), externalId, reason: "unknown transaction kind" });
        continue;
      }
      const desc = str(t.description);
      const payer = str(t.payer_id);
      const payee = str(t.payee_id);
      // The account a credit/debit lands on: its own side when known, else the account it was listed under.
      const creditAcct = payee && own.has(payee) ? payee : group.accountId;
      const debitAcct = payer && own.has(payer) ? payer : group.accountId;

      switch (kind) {
        case "deposit": {
          const acct = own.get(creditAcct);
          const base = { kind, raw: t, accountExt: creditAcct, direction: "inflow" as const, merchant: null };
          if (acct?.type === "Credit Card") push({ ...base, flow: "transfer", category: "Card payment", categorySource: "rule", reasons: ["Deposit into a credit card account treated as a card payment, not income"] });
          else if (desc && REFUND.test(desc)) push({ ...base, flow: "refund", category: "Refund", categorySource: "rule", reasons: [] });
          else if (desc && PAYROLL.test(desc)) push({ ...base, flow: "income", category: "Income", categorySource: "rule", reasons: [] });
          else push({ ...base, flow: "income", category: "Income", categorySource: "none", reasons: ["Deposit source unknown; not assumed to be employment income"] });
          break;
        }
        case "interest_credit":
          push({ kind, raw: t, accountExt: creditAcct, direction: "inflow", merchant: null, flow: "income", category: "Income", categorySource: "rule", reasons: [] });
          break;
        case "refund":
          push({ kind, raw: t, accountExt: creditAcct, direction: "inflow", merchant: desc, flow: "refund", category: "Refund", categorySource: "rule", reasons: [] });
          break;
        case "withdrawal": {
          const base = { kind, raw: t, accountExt: debitAcct, direction: "outflow" as const, merchant: null };
          if (desc && hasCard && CARD_PAYMENT.test(desc)) {
            push({ ...base, flow: "transfer", category: "Card payment", categorySource: "rule", reasons: ["Looks like a payment to your own credit card; excluded so purchases aren't counted twice"] });
          } else {
            const cat = categorize(desc);
            push({ ...base, flow: "expense", category: cat ?? "Uncategorized", categorySource: cat ? "rule" : "none", reasons: cat ? [] : ["Withdrawal category unknown"] });
          }
          break;
        }
        case "purchase": {
          const m = merchants.get(str(t.merchant_id) ?? "");
          const name = m ? str(m.name) : null;
          const mcat = m ? str(m.category) : null;
          const cat = categorize(mcat, name, desc);
          const isRefund = !!desc && REFUND.test(desc);
          push({
            kind,
            raw: t,
            accountExt: debitAcct,
            direction: isRefund ? "inflow" : "outflow",
            flow: isRefund ? "refund" : "expense",
            category: isRefund ? "Refund" : cat ?? "Uncategorized",
            categorySource: isRefund ? "rule" : cat ? (mcat ? "provider" : "rule") : "none",
            merchant: name ?? desc,
            reasons: isRefund || cat ? [] : ["Purchase category unknown"],
          });
          break;
        }
        case "bill_payment": {
          const bill = billsById.get(str(t.bill_id) ?? "");
          const payeeName = bill ? str(bill.payee) ?? str(bill.nickname) : null;
          const cat = categorize(payeeName, desc);
          push({ kind, raw: t, accountExt: debitAcct, direction: "outflow", merchant: payeeName ?? desc, flow: "expense", category: cat ?? "Bills", categorySource: "rule", reasons: [] });
          break;
        }
        case "fee":
          push({ kind, raw: t, accountExt: debitAcct, direction: "outflow", merchant: desc ?? "Bank fee", flow: "expense", category: "Bills", categorySource: "rule", reasons: [] });
          break;
        case "chargeback":
          push({ kind, raw: t, accountExt: debitAcct, direction: "outflow", merchant: desc, flow: "excluded", category: "Refund", categorySource: "none", reasons: ["Chargeback: not counted until you review what it reverses"] });
          break;
        case "transfer": {
          const payerOwn = payer ? own.get(payer) : undefined;
          const payeeOwn = payee ? own.get(payee) : undefined;
          const base = { kind, raw: t, merchant: null };
          if (payerOwn && payeeOwn) {
            const toCard = payeeOwn.type === "Credit Card";
            push({ ...base, accountExt: payer, direction: "outflow", flow: "transfer", category: toCard ? "Card payment" : "Transfer", categorySource: "rule", reasons: [] });
          } else if (payerOwn) {
            push({ ...base, accountExt: payer, direction: "outflow", flow: "excluded", category: "Transfer", categorySource: "none", reasons: ["Transfer to an account outside this profile; review whether it is spending"] });
          } else if (payeeOwn) {
            push({ ...base, accountExt: payee, direction: "inflow", flow: "excluded", category: "Transfer", categorySource: "none", reasons: ["Transfer from an account outside this profile; review whether it is income"] });
          } else {
            skipped.push({ kind, externalId, reason: "neither payer nor payee is an account in this profile" });
          }
          break;
        }
      }
    }
  }

  const bills: BankBill[] = [];
  for (const b of input.bills ?? []) {
    const id = str(b.id);
    const acct = str(b.account_id);
    if (!id || !acct) continue;
    const amt = num(b.payment_amount); // Nessie v2 sends bill amounts in dollars
    const day = num(b.recurring_date);
    bills.push({
      id: `${provider}:bill:${id}`,
      provider,
      accountId: `${provider}:${acct}`,
      payee: str(b.payee),
      nickname: str(b.nickname),
      status: str(b.status),
      amount: amt !== null && amt >= 0 ? Math.round(amt * 100) / 100 : null,
      upcomingPaymentDate: normalizeDate(b.upcoming_payment_date),
      recurringDay: day !== null && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
    });
  }
  const loans: BankLoan[] = [];
  for (const l of input.loans ?? []) {
    const id = str(l.id);
    const acct = str(l.account_id);
    if (!id || !acct) continue;
    const score = num(l.credit_score);
    loans.push({
      id: `${provider}:loan:${id}`,
      provider,
      accountId: `${provider}:${acct}`,
      type: str(l.type),
      status: str(l.status),
      description: str(l.description),
      amount: centsToDollars(l.amount_cents, { allowZero: true }),
      monthlyPayment: centsToDollars(l.monthly_payment_cents, { allowZero: true }),
      creditScore: score !== null && score >= 300 && score <= 850 ? score : null,
    });
  }

  return { accounts, transactions: out, bills, loans, skipped };
}
