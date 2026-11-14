// Credit card repayment engine.
// Pure functions only — shared by the simulator UI, the AI tutor context, and tests.

export type MinPaymentRule = {
  /** Percent of the statement balance (e.g. 1 = 1%). */
  percentOfBalance: number;
  /** Add the month's interest charge on top of the percent (common issuer formula). */
  plusInterest: boolean;
  /** Dollar floor, e.g. $25. */
  floor: number;
};

export type CardInputs = {
  balance: number; // current balance in dollars
  creditLimit: number;
  apr: number; // e.g. 24.99
  monthlyPayment: number; // the user's chosen fixed payment
  monthlyNewSpending: number; // new purchases added each month
  minRule: MinPaymentRule;
};

export type Strategy = "minimum" | "fixed";

export type MonthRow = {
  month: number;
  startBalance: number;
  interest: number;
  payment: number;
  newSpending: number;
  endBalance: number;
  cumulativeInterest: number;
  cumulativePaid: number;
};

export type SimResult = {
  schedule: MonthRow[];
  months: number | null; // null = never paid off within horizon
  totalInterest: number;
  totalPaid: number;
  paidOff: boolean;
  firstMonthInterest: number;
  /** True when the payment can't keep up with interest + new spending. */
  growing: boolean;
  /** Interest paid in the first 5 years — a bounded figure for plans that never finish. */
  interest5yr: number;
};

export const DEFAULT_MIN_RULE: MinPaymentRule = {
  percentOfBalance: 1,
  plusInterest: true,
  floor: 25,
};

export const HORIZON_MONTHS = 360;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monthly periodic rate. Issuers use a daily rate (APR/365) on the average daily
 * balance; APR/12 on the statement balance is a standard, close approximation. */
export function monthlyRate(apr: number) {
  return apr / 100 / 12;
}

export function minimumPayment(balance: number, interest: number, rule: MinPaymentRule) {
  if (balance <= 0) return 0;
  const pct = (balance * rule.percentOfBalance) / 100 + (rule.plusInterest ? interest : 0);
  return Math.min(balance + interest, Math.max(rule.floor, pct));
}

export function simulate(
  inputs: CardInputs,
  strategy: Strategy,
  horizon = HORIZON_MONTHS,
): SimResult {
  const r = monthlyRate(inputs.apr);
  let balance = Math.max(0, inputs.balance);
  let cumulativeInterest = 0;
  let cumulativePaid = 0;
  const schedule: MonthRow[] = [
    {
      month: 0,
      startBalance: balance,
      interest: 0,
      payment: 0,
      newSpending: 0,
      endBalance: balance,
      cumulativeInterest: 0,
      cumulativePaid: 0,
    },
  ];
  let months: number | null = null;
  let firstMonthInterest = 0;

  for (let m = 1; m <= horizon; m++) {
    const start = balance;
    const interest = round2(start * r);
    if (m === 1) firstMonthInterest = interest;
    const owed = start + interest;
    const minDue = minimumPayment(start, interest, inputs.minRule);
    // A chosen payment below the minimum isn't allowed by the issuer — use the minimum.
    let payment =
      strategy === "minimum" ? minDue : Math.min(owed, Math.max(minDue, inputs.monthlyPayment));
    payment = round2(payment);
    const carried = round2(Math.max(0, owed - payment));
    // New purchases can't go past the credit limit (they'd be declined).
    const room = inputs.creditLimit > 0 ? Math.max(0, inputs.creditLimit - carried) : Infinity;
    const newSpending = round2(Math.min(Math.max(0, inputs.monthlyNewSpending), room));
    balance = round2(carried + newSpending);
    cumulativeInterest = round2(cumulativeInterest + interest);
    cumulativePaid = round2(cumulativePaid + payment);
    schedule.push({
      month: m,
      startBalance: start,
      interest,
      payment,
      newSpending,
      endBalance: balance,
      cumulativeInterest,
      cumulativePaid,
    });
    // Paid off = the carried-over balance hits zero. Any new spending after that
    // would be a fresh statement you can pay in full (no interest).
    if (carried <= 0.005) {
      months = m;
      break;
    }
  }

  const last = schedule[schedule.length - 1];
  const growing = months === null && last.endBalance >= inputs.balance;
  const interest5yr = schedule[Math.min(60, schedule.length - 1)].cumulativeInterest;
  return {
    schedule,
    months,
    totalInterest: last.cumulativeInterest,
    totalPaid: last.cumulativePaid,
    paidOff: months !== null,
    firstMonthInterest,
    growing,
    interest5yr,
  };
}

export function utilization(balance: number, limit: number) {
  if (limit <= 0) return 0;
  return (balance / limit) * 100;
}

/** Educational bands only — NOT a score prediction. Many lenders and scoring
 * guides treat lower utilization as better; under ~30% is a common rule of thumb. */
export function utilizationBand(pct: number): {
  label: string;
  tone: "good" | "ok" | "warn" | "bad";
  note: string;
} {
  if (pct <= 10)
    return { label: "Low", tone: "good", note: "Using a small share of your limit is generally viewed favorably." };
  if (pct <= 30)
    return { label: "Moderate", tone: "ok", note: "Under about 30% is a common rule of thumb." };
  if (pct <= 75)
    return { label: "High", tone: "warn", note: "High utilization is one factor that can weigh on credit scores." };
  return {
    label: "Very high",
    tone: "bad",
    note: "Near your limit — this can weigh on scores and risks over-limit or declined charges.",
  };
}

/** Compact summary for the AI tutor and the UI. */
export function cardSummary(inputs: CardInputs) {
  const min = simulate(inputs, "minimum");
  const fixed = simulate(inputs, "fixed");
  return {
    monthlyRatePct: round2(monthlyRate(inputs.apr) * 100 * 1000) / 1000,
    firstMonthInterest: min.firstMonthInterest,
    firstMinimumPayment: min.schedule[1]?.payment ?? 0,
    utilizationPct: round2(utilization(inputs.balance, inputs.creditLimit)),
    minimum: { months: min.months, totalInterest: min.totalInterest, interestFirst5Years: min.interest5yr, growing: min.growing },
    chosen: {
      payment: inputs.monthlyPayment,
      months: fixed.months,
      totalInterest: fixed.totalInterest,
      interestFirst5Years: fixed.interest5yr,
      growing: fixed.growing,
    },
  };
}
