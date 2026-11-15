// Builds the "what the tutor knows about you right now" snapshot that is sent with
// every question. Only computed numbers — no names, SSNs, EINs or account numbers.
import { cardSummary, type CardInputs } from "../finance/credit";
import { computePaycheck, PERIODS, type PaycheckInputs } from "../finance/paycheck";
import { computeTax, FILING_STATUS_LABEL, TAX_YEAR, type TaxInputs } from "../finance/tax2025";

export type TutorContext = ReturnType<typeof buildTutorContext>;

export function buildTutorContext(args: {
  paycheck: PaycheckInputs;
  card: CardInputs;
  tax: TaxInputs;
  page?: string;
  /** False when the user hasn't set up the Financial Advisor (no demo, no own numbers). */
  hasProfile?: boolean;
}) {
  const hasProfile = args.hasProfile ?? true;
  const pay = computePaycheck(args.paycheck);
  const card = cardSummary(args.card);
  const hasTax = args.tax.wages > 0;
  const tax = hasTax ? computeTax(args.tax) : null;
  const monthlyNet = (pay.net * PERIODS[args.paycheck.frequency]) / 12;
  return {
    currentPage: args.page ?? "unknown",
    paycheck: !hasProfile ? null : {
      frequency: args.paycheck.frequency,
      grossPerPaycheck: pay.gross,
      federalWithholdingEstimate: pay.federal,
      socialSecurity: pay.socialSecurity,
      medicare: pay.medicare,
      stateEstimate: pay.state,
      hometown: pay.location.hometown,
      stateRatePct: pay.location.stateRatePct,
      countyRatePct: pay.location.countyRatePct,
      cityRatePct: pay.location.cityRatePct,
      totalStateLocalRatePct: pay.location.totalRatePct,
      netPerPaycheck: pay.net,
      approxMonthlyTakeHome: Math.round(monthlyNet),
    },
    creditCard: !hasProfile ? null : {
      balance: args.card.balance,
      creditLimit: args.card.creditLimit,
      apr: args.card.apr,
      monthlyPeriodicRatePct: card.monthlyRatePct,
      firstMonthInterest: card.firstMonthInterest,
      firstMinimumPayment: card.firstMinimumPayment,
      minimumPaymentRule: args.card.minRule,
      monthlyNewSpending: args.card.monthlyNewSpending,
      utilizationPct: card.utilizationPct,
      payingMinimumOnly: card.minimum,
      payingChosenAmount: card.chosen,
      chosenPaymentShareOfMonthlyTakeHomePct: monthlyNet
        ? Math.round((args.card.monthlyPayment / monthlyNet) * 1000) / 10
        : null,
    },
    taxes: tax
      ? {
          taxYear: TAX_YEAR,
          filingStatus: FILING_STATUS_LABEL[args.tax.filingStatus],
          w2Wages: tax.grossIncome,
          standardDeduction: tax.standardDeduction,
          taxableIncome: tax.taxableIncome,
          estimatedTax: tax.tax,
          method: tax.method,
          federalWithheld: tax.withholding,
          refundOrOwed: tax.refund,
          marginalRatePct: tax.marginalRate * 100,
          effectiveRatePct: Math.round(tax.effectiveRate * 1000) / 10,
          flags: tax.flags.map((f) => f.message),
        }
      : null,
  };
}
