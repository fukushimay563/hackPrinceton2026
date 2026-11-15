// Deterministic fallback tutor. Used when no Gemini key is configured or the API
// fails, so the live demo never breaks. Answers are built from the user's actual
// numbers plus the retrieved sources.
import type { SourceDoc } from "./corpus";
import type { TutorContext } from "./context";

const usd = (n: number, cents = true) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });

const duration = (m: number | null) => {
  if (m === null) return "more than 30 years (it may never be paid off at this rate)";
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (!y) return `${m} month${m === 1 ? "" : "s"}`;
  return `${y} year${y === 1 ? "" : "s"}${mo ? ` and ${mo} month${mo === 1 ? "" : "s"}` : ""}`;
};

const cite = (sources: SourceDoc[], id: string) => {
  const i = sources.findIndex((s) => s.id === id);
  return i >= 0 ? ` [${i + 1}]` : "";
};

export const OFFLINE_FALLBACK =
  "I don't have a verified source for that in offline mode, so I won't guess. I can walk through your credit card interest, payoff time, utilization, your paycheck, or your tax estimate using your own numbers. For anything else, IRS.gov, ConsumerFinance.gov, or a qualified professional is the safest place to check.";

export function offlineAnswer(question: string, ctx: TutorContext, sources: SourceDoc[]): string {
  const q = question.toLowerCase();
  const c = ctx.creditCard;
  const t = ctx.taxes;
  const p = ctx.paycheck;

  // App support questions first: FinPilot is also the help desk.
  const support = supportAnswer(q, sources);
  if (support) return support;
  if (/explain more about/.test(q)) {
    const lessonDoc = sources.find((d) => d.id.startsWith("lesson-"));
    if (lessonDoc) return `Here's the short version: ${lessonDoc.text} [${sources.indexOf(lessonDoc) + 1}]\n\nWant me to connect it to your own numbers? Ask about your refund, your paycheck, or your card.`;
  }

  const NO_NUMBERS =
    "I can explain this with your own numbers once you open the Financial Advisor and load the demo or enter your paycheck and card. In general: ";

  if (/(interest|apr|so much|why.*pay)/.test(q) && !/refund|tax/.test(q) && !c) {
    return `${NO_NUMBERS}a card's APR is a yearly rate, so each month you're charged about APR ÷ 12 on any balance you carry${cite(sources, "apr-interest")}. Paying only the minimum stretches repayment out and raises total interest${cite(sources, "minimum-payments")}. Paying the full statement balance by the due date usually avoids interest on purchases.`;
  }
  if (/(minimum|how long|pay off|payoff|utiliz|credit score|limit)/.test(q) && !c) {
    return `${NO_NUMBERS}utilization is your balance divided by your limit, and it's one of several factors in credit scores; under about 30% is a common rule of thumb${cite(sources, "utilization")}. The Credit card simulator shows payoff time for any balance and payment.`;
  }
  if (/(paycheck|take.?home|net|fica|social security|medicare|where did)/.test(q) && !p) {
    return `${NO_NUMBERS}most employees pay 6.2% Social Security and 1.45% Medicare on wages, plus federal income tax withholding based on their W-4${cite(sources, "fica")}. Open Financial Advisor → Paycheck to see your own breakdown.`;
  }

  if (c && /(interest|apr|so much|why.*pay)/.test(q) && !/refund|tax/.test(q)) {
    const min = c.payingMinimumOnly;
    const ch = c.payingChosenAmount;
    if (ch.growing || min.growing) {
      return [
        `Your card has a ${c.apr}% APR, about ${c.monthlyPeriodicRatePct}% a month on whatever you carry${cite(sources, "apr-interest")}. That's about ${usd(c.firstMonthInterest)} in interest on your ${usd(c.balance)} balance in the first month.`,
        `The real problem is the ${usd(c.monthlyNewSpending, false)} of new spending you're adding each month. Interest plus new purchases is more than your ${usd(ch.payment, false)} payment, so the balance never goes down. At this pace you'd pay about ${usd(ch.interestFirst5Years, false)} in interest in the first five years alone, and the balance would sit near your ${usd(c.creditLimit, false)} limit.`,
        `To break the cycle, cut new spending or raise your payment until it's more than interest plus purchases. Paying the full statement balance each month usually means no interest at all.`,
      ].join("\n\n");
    }
    return [
      `Your card has a ${c.apr}% APR. That's a yearly rate, so each month you're charged about ${c.apr}% ÷ 12 = ${c.monthlyPeriodicRatePct}% on the balance you carry${cite(sources, "apr-interest")}.`,
      `On your ${usd(c.balance)} balance, that's about ${usd(c.firstMonthInterest)} in interest in the first month alone.`,
      `The bigger cost is time. If you pay only the minimum (about ${usd(c.firstMinimumPayment)} to start), it takes ${duration(min.months)} and costs about ${usd(min.totalInterest)} in interest${cite(sources, "minimum-payments")}. Paying ${usd(ch.payment, false)} a month instead clears it in ${duration(ch.months)} for about ${usd(ch.totalInterest)} in interest.`,
      `So you didn't spend more than ${usd(c.balance, false)}. You're paying to borrow it for longer. Paying the full statement balance by the due date usually avoids interest on new purchases entirely.`,
    ].join("\n\n");
  }

  if (c && /(minimum|how long|pay off|payoff)/.test(q)) {
    const min = c.payingMinimumOnly;
    const ch = c.payingChosenAmount;
    return [
      `With minimum payments only, your ${usd(c.balance)} balance takes ${duration(min.months)} to pay off, with about ${usd(min.totalInterest)} in total interest${cite(sources, "minimum-payments")}.`,
      `At your chosen ${usd(ch.payment, false)}/month it takes ${duration(ch.months)} and about ${usd(ch.totalInterest)} in interest.`,
      c.monthlyNewSpending > 0
        ? `This assumes you keep adding ${usd(c.monthlyNewSpending, false)} of new purchases every month, which slows payoff a lot.`
        : `This assumes no new purchases on the card while you pay it down.`,
    ].join("\n\n");
  }

  if (c && /(utiliz|credit score|limit)/.test(q)) {
    return [
      `You're using ${c.utilizationPct}% of your credit limit (${usd(c.balance, false)} of ${usd(c.creditLimit, false)})${cite(sources, "utilization")}.`,
      `Utilization is one factor in credit scores, next to payment history and how long you've had credit. A common rule of thumb is to stay under about 30%, which here would be ${usd(c.creditLimit * 0.3, false)} or less.`,
      `No one can promise an exact score change, because scoring models differ and depend on when your balance gets reported.`,
    ].join("\n\n");
  }

  if (t && /(refund|owe|tax|deduction|bracket|withh)/.test(q)) {
    if (/(deduction|standard)/.test(q)) {
      return [
        `For ${t.taxYear}, the standard deduction for ${t.filingStatus.toLowerCase()} filers is ${usd(t.standardDeduction, false)}${cite(sources, "std-ded-2025")}.`,
        `It's subtracted from your wages before tax is figured: ${usd(t.w2Wages, false)} − ${usd(t.standardDeduction, false)} = ${usd(t.taxableIncome, false)} of taxable income. You only pay income tax on that last number.`,
      ].join("\n\n");
    }
    const refund = t.refundOrOwed >= 0;
    return [
      `Here's how your estimate works out: ${usd(t.w2Wages, false)} in wages − ${usd(t.standardDeduction, false)} standard deduction = ${usd(t.taxableIncome, false)} taxable income${cite(sources, "std-ded-2025")}.`,
      `Tax on that from the IRS Tax Table is about ${usd(t.estimatedTax, false)}${cite(sources, "tax-table")}. Your marginal rate is ${t.marginalRatePct}%, but your effective rate is only ${t.effectiveRatePct}%, because each rate applies only to its own slice of income${cite(sources, "brackets-2025")}.`,
      refund
        ? `Your employer withheld ${usd(t.federalWithheld, false)}, which is more than the ${usd(t.estimatedTax, false)} you owe, so you'd get about ${usd(t.refundOrOwed, false)} back${cite(sources, "refund-withholding")}. That's your own money being returned, not a bonus.`
        : `Your employer withheld ${usd(t.federalWithheld, false)}, which is less than the ${usd(t.estimatedTax, false)} you owe, so you'd owe about ${usd(-t.refundOrOwed, false)}${cite(sources, "refund-withholding")}. Updating your W-4 can fix this next year.`,
    ].join("\n\n");
  }

  if (p && /(paycheck|take.?home|net|fica|social security|medicare|where did)/.test(q)) {
    return [
      `Out of each ${usd(p.grossPerPaycheck)} paycheck: about ${usd(p.federalWithholdingEstimate)} goes to federal income tax withholding, ${usd(p.socialSecurity)} to Social Security and ${usd(p.medicare)} to Medicare${cite(sources, "fica")}, and about ${usd(p.stateEstimate)} to state tax.`,
      `That leaves roughly ${usd(p.netPerPaycheck)} take-home, or about ${usd(p.approxMonthlyTakeHome, false)} a month.`,
      `Federal withholding is a prepayment toward your yearly income tax, so it gets settled up when you file. Social Security and Medicare are separate and aren't refunded${cite(sources, "refund-withholding")}.`,
    ].join("\n\n");
  }

  // General tax rules with no personal numbers: answer straight from the matching
  // official source (first sentences, verbatim from the grounding corpus).
  if (!t && /(deduction|standard|bracket|marginal|effective|refund|owe|withh|tax|file|filing)/.test(q)) {
    const general = sources.find((d) => ["std-ded-2025", "brackets-2025", "refund-withholding", "tax-table", "free-file", "fica"].includes(d.id));
    if (general && sources.indexOf(general) < 3) {
      const brief = general.text.split(/(?<=\.)\s+/).slice(0, 3).join(" ");
      return `In general: ${brief}${cite(sources, general.id)}`;
    }
  }

  // A lesson the user asked about (e.g. from "Ask FinPilot about this").
  const lessonDoc = sources.find((d) => d.id.startsWith("lesson-"));
  if (lessonDoc && (/explain more about|lesson/.test(q) || sources[0] === lessonDoc)) {
    const i = sources.indexOf(lessonDoc) + 1;
    return `Here's the short version: ${lessonDoc.text} [${i}]\n\nWant me to connect it to your own numbers? Ask about your refund, your paycheck, or your card.`;
  }

  // A plain "what is / how does" question that matched an official source: answer from
  // that source's opening sentences, cited, rather than refusing.
  const reference = sources.slice(0, 3).find((d) => !d.id.startsWith("help-") && d.id !== "app-method");
  if (reference && /^(what|how|why|when|who|is|are|does|do|can|should|explain|define|tell me)\b/.test(q.trim())) {
    const brief = reference.text.split(/(?<=\.)\s+/).slice(0, 3).join(" ");
    return `In general: ${brief}${cite(sources, reference.id)}`;
  }

  return OFFLINE_FALLBACK;
}

// ---------------------------------------------------------------- support

const SUPPORT: [RegExp, string][] = [
  [/(upload|add|scan|photo|picture).*(w-?2|document|form)|w-?2.*(upload|add)|how do i (start|do) my tax/, "help-upload"],
  [/(delete|remove|erase) my|privacy|private|is my (data|info)|who can see|stored|store my|save my data/, "help-privacy"],
  [/\b(sign ?in|log ?in|account|password|magic link|guest|sync|other device)\b/, "help-account"],
  [/(file|submit|send).*(irs|return|taxes)|e-?file|does (this|firstfunds|finpilot) file/, "help-filing"],
  [/(support|can you handle|can't handle|not supported|freelance|1099|married|dependents? (on|in) my return)/, "help-scope"],
  [/\b(academy|how do (lessons|quizzes) work|xp|badges?)\b/, "help-academy"],
  [/(what (is|does) (finpilot|firstfunds|this app)|what can you do|help me use|how does (this|the app) work|features)/, "help-overview"],
];

function supportAnswer(q: string, sources: SourceDoc[]): string | null {
  const hit = SUPPORT.find(([re]) => re.test(q));
  if (!hit) return null;
  const doc = sources.find((s) => s.id === hit[1]);
  if (!doc) return null;
  const i = sources.indexOf(doc) + 1;
  return `${doc.text} [${i}]\n\nAnything else I can help with?`;
}
