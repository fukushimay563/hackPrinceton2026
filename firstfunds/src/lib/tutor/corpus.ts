// Grounding corpus for the AI tutor. Each entry is a short plain-language summary
// written from the linked official source. Team: when you add the full RAG pipeline
// (Pub 17, Form 1040 instructions, Pub 501), keep these as high-priority chunks.
//
// RULE: every fact here must be checkable at its URL. Update the year when you do.

export type SourceDoc = {
  id: string;
  title: string;
  url: string;
  topic: "tax" | "credit" | "paycheck" | "app";
  text: string;
};

import { MODULES } from "../academy/lessons";

// Academy lessons double as grounding: FinPilot can explain any lesson further.
const LESSON_DOCS: SourceDoc[] = MODULES.flatMap((m) =>
  m.lessons.map((l) => ({
    id: `lesson-${l.id}`,
    title: `Academy: ${l.title} (source: ${l.sources[0].label})`,
    url: l.sources[0].url,
    topic: "tax" as const,
    text: `${l.title}. ${l.summary} ${l.cards.map((c) => `${c.heading}: ${c.body}`).join(" ")}`,
  })),
);

export const CORPUS: SourceDoc[] = [
  {
    id: "std-ded-2025",
    title: "IRS — One, Big, Beautiful Bill provisions (standard deduction)",
    url: "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions",
    topic: "tax",
    text:
      "For tax year 2025 (returns filed in 2026) the standard deduction is $15,750 for single filers and married filing separately, $31,500 for married filing jointly, and $23,625 for head of household. These amounts were raised by the One, Big, Beautiful Bill Act (P.L. 119-21) signed July 4, 2025. The standard deduction is subtracted from income before tax is calculated, so it lowers taxable income. For tax year 2026 the amounts rise to $16,100 single, $32,200 married filing jointly and $24,150 head of household.",
  },
  {
    id: "dependent-std",
    title: "IRS Publication 501 — Dependents, Standard Deduction, and Filing Information",
    url: "https://www.irs.gov/publications/p501",
    topic: "tax",
    text:
      "If someone else can claim you as a dependent, your standard deduction is limited. For 2025 it is the greater of $1,350 or your earned income plus $450, but not more than the regular standard deduction for your filing status. Students supported by parents are often claimable as dependents, so check before filing.",
  },
  {
    id: "filing-status",
    title: "IRS Publication 501 — Filing status",
    url: "https://www.irs.gov/publications/p501",
    topic: "tax",
    text:
      "There are five filing statuses: single, married filing jointly, married filing separately, head of household, and qualifying surviving spouse. Your marital status on the last day of the year generally determines your status. Single applies if you are unmarried and do not qualify for another status. Head of household requires being unmarried and paying more than half the cost of keeping up a home for a qualifying person.",
  },
  {
    id: "tax-table",
    title: "IRS — Instructions for Form 1040 (Tax Table)",
    url: "https://www.irs.gov/instructions/i1040gi",
    topic: "tax",
    text:
      "If your taxable income is less than $100,000 you must use the Tax Table in the Form 1040 instructions to find your tax. The table lists tax for income ranges in $50 steps (smaller steps under $3,000), calculated at the middle of each range, so the result can differ by a few dollars from exact bracket math. At $100,000 or more you use the Tax Computation Worksheet.",
  },
  {
    id: "brackets-2025",
    title: "IRS Revenue Procedure 2024-40 — 2025 tax rate schedules",
    url: "https://www.irs.gov/pub/irs-drop/rp-24-40.pdf",
    topic: "tax",
    text:
      "U.S. federal income tax is progressive: each rate applies only to the slice of taxable income inside its bracket. For a single filer in 2025, 10% applies to taxable income up to $11,925, 12% from $11,925 to $48,475, 22% from $48,475 to $103,350, 24% to $197,300, 32% to $250,525, 35% to $626,350 and 37% above that. Your marginal rate is the rate on your last dollar; your effective rate is total tax divided by income, which is always lower. Moving into a higher bracket never makes your whole income taxed at the higher rate.",
  },
  {
    id: "refund-withholding",
    title: "IRS — Tax Withholding Estimator",
    url: "https://www.irs.gov/individuals/tax-withholding-estimator",
    topic: "tax",
    text:
      "Employers withhold federal income tax from each paycheck based on the Form W-4 you give them. When you file, you compare your actual tax for the year with what was withheld. If more was withheld than you owe, you get a refund; if less, you owe the difference. A refund is your own money being returned, not a bonus. You can change your W-4 at any time, and the IRS Tax Withholding Estimator helps you pick the right amount.",
  },
  {
    id: "w2-boxes",
    title: "IRS — About Form W-2, Wage and Tax Statement",
    url: "https://www.irs.gov/forms-pubs/about-form-w-2",
    topic: "tax",
    text:
      "Your employer sends Form W-2 by the end of January. Box 1 shows wages subject to federal income tax, Box 2 shows federal income tax withheld, Boxes 3 and 4 show Social Security wages and tax withheld, and Boxes 5 and 6 show Medicare wages and tax withheld. Box 1 can be lower than your total pay if you made pre-tax contributions such as to a 401(k).",
  },
  {
    id: "fica",
    title: "IRS Topic 751 — Social Security and Medicare withholding rates",
    url: "https://www.irs.gov/taxtopics/tc751",
    topic: "paycheck",
    text:
      "Employees pay Social Security tax of 6.2% and Medicare tax of 1.45% on wages, together called FICA (7.65%). Employers pay a matching amount. Social Security tax only applies up to an annual wage base limit. These taxes fund Social Security and Medicare and are separate from federal income tax, so they are not refunded when you file.",
  },
  {
    id: "free-file",
    title: "IRS Free File — Do your taxes for free",
    url: "https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free",
    topic: "tax",
    text:
      "IRS Free File lets eligible taxpayers prepare and e-file federal returns for free through IRS partner companies, subject to an income limit set each year. Free File Fillable Forms are available to anyone regardless of income. Federal returns for tax year 2025 are generally due April 15, 2026. This app does not file returns; use Free File or another authorized provider to file.",
  },
  {
    id: "tips-overtime",
    title: "IRS — One, Big, Beautiful Bill provisions (tips and overtime)",
    url: "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions",
    topic: "tax",
    text:
      "Beginning with tax year 2025 there are new temporary deductions for qualified tips and for qualified overtime compensation, each with limits and income phase-outs. They are claimed on the return and are available whether or not you itemize. Workers who receive tips or overtime should review IRS guidance or use tax software that supports these deductions.",
  },
  {
    id: "eitc",
    title: "IRS — Earned Income Tax Credit (EITC)",
    url: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc",
    topic: "tax",
    text:
      "The Earned Income Tax Credit helps low- to moderate-income workers. Eligibility depends on income, filing status and number of qualifying children; workers without children must generally be at least 25. The IRS EITC Assistant can tell you whether you qualify.",
  },
  {
    id: "apr-interest",
    title: "CFPB — Credit cards: APR and how interest works",
    url: "https://www.consumerfinance.gov/consumer-tools/credit-cards/",
    topic: "credit",
    text:
      "APR (annual percentage rate) is the yearly cost of borrowing on a card. Most issuers convert it to a daily periodic rate and charge interest on your average daily balance, which works out close to APR divided by 12 each month. If you pay your full statement balance by the due date, most cards give a grace period with no interest on new purchases. Carrying any balance usually means interest is charged and the grace period can be lost until you pay in full.",
  },
  {
    id: "minimum-payments",
    title: "CFPB — Credit cards: minimum payments",
    url: "https://www.consumerfinance.gov/consumer-tools/credit-cards/",
    topic: "credit",
    text:
      "Paying only the minimum keeps your account in good standing but means most of the payment can go to interest, so the balance shrinks slowly and total cost rises. Federal law (the CARD Act) requires your statement to show how long it would take to pay off the balance making only minimum payments, and how much you would pay in total. Minimum payment formulas vary by issuer, often a small percent of the balance plus interest with a dollar floor.",
  },
  {
    id: "utilization",
    title: "CFPB — Credit reports and scores",
    url: "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/",
    topic: "credit",
    text:
      "Credit utilization is how much of your available credit you are using, such as a $600 balance on a $1,000 limit (60%). It is one of several factors in credit scores, along with payment history, length of credit history, new credit and types of credit. Experts commonly advise keeping utilization below about 30%. No tool can predict an exact score change, because scoring models and the timing of reported balances vary.",
  },
  {
    id: "help-overview",
    title: "FinPilot help: what FirstFunds does",
    url: "/methodology",
    topic: "app",
    text:
      "FirstFunds has four parts. Financial Advisor shows where your paycheck goes and what a credit card balance really costs. Tax Assistant prepares an estimate of your 2025 federal return and asks only what your documents can't tell it. Financial Advisory Academy teaches tax basics in ten short lessons with quizzes. And I'm FinPilot: I answer money and tax questions using your numbers, and help you use the app. Everything is education, not personalized financial or tax advice.",
  },
  {
    id: "help-upload",
    title: "FinPilot help: adding your W-2",
    url: "/methodology",
    topic: "app",
    text:
      "Open Tax Assistant and answer the three quick questions. Then tap Upload a W-2 to have it read for you, or tap Type it in instead and enter box 1 (wages) and box 2 (federal tax withheld). No documents yet? Try one of the sample W-2s. After reading a document, the assistant shows the numbers so you can confirm or fix them before anything is calculated.",
  },
  {
    id: "help-privacy",
    title: "FinPilot help: privacy and your data",
    url: "/methodology",
    topic: "app",
    text:
      "By default your tax progress stays in this browser tab and disappears when you close it. If you sign in, your answers and the numbers from your documents are saved to your account so you can continue on another device. Only you can read them. Uploaded files, Social Security numbers and full employer IDs are never saved. You can delete your saved data any time from the Account page. When you ask me a question, I only receive calculated numbers, not your name or documents.",
  },
  {
    id: "help-account",
    title: "FinPilot help: signing in",
    url: "/account",
    topic: "app",
    text:
      "Go to the Account page. Enter your email to get a sign-in link with no password, and open the link in the same browser. Or continue as a guest to save progress on this browser only. Signed in, your tax progress and Academy lessons sync automatically. You can sign out or delete your saved data from the same page.",
  },
  {
    id: "help-filing",
    title: "FinPilot help: does FirstFunds file my taxes?",
    url: "https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free",
    topic: "app",
    text:
      "No. FirstFunds prepares and explains an estimate of your federal return. You review it and approve the draft, then file through IRS Free File or another authorized provider. 2025 federal returns are generally due April 15, 2026.",
  },
  {
    id: "help-scope",
    title: "FinPilot help: which returns are supported",
    url: "/methodology",
    topic: "app",
    text:
      "Tax Assistant handles 2025 federal returns for single filers with W-2 wages and the standard deduction. It stops and explains, instead of guessing, if you have freelance or 1099 income, other income like interest or unemployment, are married, support a dependent, or received tips or overtime. For those, use IRS Free File or a tax professional.",
  },
  {
    id: "help-academy",
    title: "FinPilot help: using the Academy",
    url: "/methodology",
    topic: "app",
    text:
      "Financial Advisory Academy has ten lessons in three modules: your paycheck and W-2, how income tax works, and filing your first return. Each lesson has short cards, most have a hands-on example, and each ends with a quick quiz. Get at least two-thirds right to complete it and earn 10 XP. Finishing a module earns a badge. Progress is saved on your device, or to your account if you sign in.",
  },
  {
    id: "app-method",
    title: "FirstFunds methodology",
    url: "/methodology",
    topic: "app",
    text:
      "The simulator charges interest monthly at APR ÷ 12 on the balance carried from the prior month, then applies your payment. The minimum payment uses the rule shown in settings, by default 1% of the balance plus that month's interest, with a $25 floor. A chosen payment below the minimum is raised to the minimum. Tax estimates cover W-2 wages only with the 2025 standard deduction and the IRS Tax Table, and exclude credits, other income and state taxes. Paycheck withholding is an estimate; real withholding follows your Form W-4 and IRS Publication 15-T.",
  },
  ...LESSON_DOCS,
];
