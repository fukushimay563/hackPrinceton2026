// Financial Advisory Academy — course content for first-time taxpayers (tax year 2025).
// Every factual claim must be checkable at a listed source. Keep amounts in sync with
// src/lib/finance/tax2025.ts (the interactive examples use that engine directly).

export type TryIt = "w2" | "fica" | "withholding" | "filingStatus" | "standardDeduction" | "brackets" | "selfEmployment";

export type QuizQuestion = { q: string; options: string[]; correct: number; explain: string };

export type Lesson = {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  cards: { heading: string; body: string }[];
  tryIt?: TryIt;
  quiz: QuizQuestion[];
  sources: { label: string; url: string }[];
};

export type Module = { id: string; title: string; blurb: string; badge: string; lessons: Lesson[] };

const SRC = {
  w2: { label: "IRS: About Form W-2", url: "https://www.irs.gov/forms-pubs/about-form-w-2" },
  w4: { label: "IRS: About Form W-4", url: "https://www.irs.gov/forms-pubs/about-form-w-4" },
  estimator: { label: "IRS Tax Withholding Estimator", url: "https://www.irs.gov/individuals/tax-withholding-estimator" },
  fica: { label: "IRS Topic 751: Social Security and Medicare withholding rates", url: "https://www.irs.gov/taxtopics/tc751" },
  p501: { label: "IRS Publication 501: Dependents, Standard Deduction, and Filing Information", url: "https://www.irs.gov/publications/p501" },
  obbba: { label: "IRS: One, Big, Beautiful Bill provisions", url: "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions" },
  rp2440: { label: "IRS Rev. Proc. 2024-40 (2025 tax brackets)", url: "https://www.irs.gov/pub/irs-drop/rp-24-40.pdf" },
  i1040: { label: "IRS: Instructions for Form 1040", url: "https://www.irs.gov/instructions/i1040gi" },
  freeFile: { label: "IRS Free File", url: "https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free" },
  extension: { label: "IRS: Extension of time to file", url: "https://www.irs.gov/filing/get-an-extension-to-file-your-tax-return" },
  refund: { label: "IRS: Where's My Refund?", url: "https://www.irs.gov/wheres-my-refund" },
  selfEmployed: { label: "IRS: Self-Employment Tax", url: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes" },
  gig: { label: "IRS: Gig Economy Tax Center", url: "https://www.irs.gov/businesses/gig-economy-tax-center" },
  scams: { label: "IRS: Tax scams and consumer alerts", url: "https://www.irs.gov/newsroom/tax-scams-consumer-alerts" },
  records: { label: "IRS: How long should I keep records?", url: "https://www.irs.gov/businesses/small-businesses-self-employed/how-long-should-i-keep-records" },
};

export const MODULES: Module[] = [
  {
    id: "paycheck",
    title: "Your paycheck & W-2",
    blurb: "Where your money goes before it reaches you.",
    badge: "Paycheck Pro",
    lessons: [
      {
        id: "w2",
        title: "Reading your W-2",
        minutes: 3,
        summary: "The one form almost every first-time filer needs, box by box.",
        cards: [
          { heading: "What it is", body: "Form W-2 is your employer's summary of what they paid you and what they withheld for taxes during the year. Every employer you worked for sends one, usually by January 31." },
          { heading: "The two boxes that matter most", body: "Box 1 is your wages subject to federal income tax. Box 2 is the federal income tax already taken out of your paychecks. Your whole return comes down to comparing your real tax with box 2." },
          { heading: "Boxes 3 to 6", body: "Boxes 3 and 4 show Social Security wages and tax. Boxes 5 and 6 show Medicare wages and tax. These taxes aren't refunded when you file." },
          { heading: "Why box 1 can be lower than your pay", body: "Pre-tax contributions, like a traditional 401(k), come out before income tax. So box 1 can be smaller than box 3 or 5. That's normal." },
        ],
        tryIt: "w2",
        quiz: [
          { q: "Which W-2 box shows federal income tax already withheld?", options: ["Box 1", "Box 2", "Box 4", "Box 6"], correct: 1, explain: "Box 2 is federal income tax withheld. Box 1 is wages." },
          { q: "You had two jobs this year. How many W-2s should you expect?", options: ["One, combined", "Two, one from each employer", "None if you earned under $10,000", "Only from your current job"], correct: 1, explain: "Each employer sends its own W-2, and all of them go on your return." },
          { q: "Your box 1 is lower than box 3. What's a likely reason?", options: ["An error. Call the IRS", "You contributed pre-tax to a 401(k)", "You got a raise", "Box 3 includes your refund"], correct: 1, explain: "Pre-tax retirement contributions reduce box 1 but not Social Security wages in box 3." },
        ],
        sources: [SRC.w2],
      },
      {
        id: "fica",
        title: "Social Security & Medicare",
        minutes: 2,
        summary: "The 7.65% that comes out of every paycheck.",
        cards: [
          { heading: "FICA", body: "Most employees pay 6.2% of wages for Social Security and 1.45% for Medicare, 7.65% together. Your employer pays the same amount on top." },
          { heading: "A wage cap for Social Security", body: "Social Security tax only applies up to a yearly limit ($176,100 in 2025). Medicare has no cap, and very high earners pay an extra 0.9%." },
          { heading: "Not refundable", body: "Unlike federal income tax withholding, FICA isn't settled up on your return. It funds benefits you can earn later." },
        ],
        tryIt: "fica",
        quiz: [
          { q: "On a $1,000 paycheck, about how much goes to Social Security and Medicare combined?", options: ["$62.00", "$76.50", "$100.00", "$145.00"], correct: 1, explain: "6.2% + 1.45% = 7.65%, so $76.50." },
          { q: "Do you get FICA taxes back when you file your return?", options: ["Yes, always", "Only if you get a refund", "No, they aren't refunded", "Only students do"], correct: 2, explain: "FICA isn't part of the income tax refund calculation." },
        ],
        sources: [SRC.fica],
      },
      {
        id: "withholding",
        title: "Withholding, W-4s & refunds",
        minutes: 3,
        summary: "Why some people get refunds and others owe.",
        cards: [
          { heading: "Paying as you go", body: "Your employer withholds federal income tax from each paycheck based on the Form W-4 you filled out when you started. It's a prepayment toward your yearly tax." },
          { heading: "Settling up", body: "When you file, you work out your actual tax for the year. If more was withheld than you owe, you get a refund. If less, you owe the difference." },
          { heading: "A refund isn't a bonus", body: "A refund is your own money coming back because you overpaid during the year. A huge refund means smaller paychecks than necessary; owing a lot can mean a surprise bill." },
          { heading: "Adjusting", body: "You can give your employer a new W-4 any time. The IRS Tax Withholding Estimator helps you pick the right amount, especially with two jobs." },
        ],
        tryIt: "withholding",
        quiz: [
          { q: "Your tax for the year is $2,900 and $3,250 was withheld. What happens?", options: ["You owe $350", "You get a $350 refund", "You get a $3,250 refund", "Nothing"], correct: 1, explain: "Withheld minus tax: $3,250 − $2,900 = $350 back." },
          { q: "Which form tells your employer how much to withhold?", options: ["W-2", "W-4", "1099-NEC", "1040"], correct: 1, explain: "You give your employer a W-4. They send you a W-2 at year end." },
          { q: "People with two jobs often owe at tax time because…", options: ["Two jobs are taxed at a penalty rate", "Each employer withholds as if it's your only job", "W-2s are often wrong", "They lose the standard deduction"], correct: 1, explain: "Each employer's withholding assumes your income from them is all you earn, so the total can come up short." },
        ],
        sources: [SRC.w4, SRC.estimator],
      },
    ],
  },
  {
    id: "income-tax",
    title: "How income tax works",
    blurb: "Filing status, deductions and brackets, without the jargon.",
    badge: "Bracket Boss",
    lessons: [
      {
        id: "filing-status",
        title: "Filing status & do I need to file?",
        minutes: 3,
        summary: "The first choice on every return.",
        cards: [
          { heading: "Five statuses", body: "Single, married filing jointly, married filing separately, head of household, and qualifying surviving spouse. Your status on December 31 is what counts." },
          { heading: "Most first-time filers", body: "If you're unmarried and don't support a child or relative in your home, you file as Single." },
          { heading: "Do you have to file?", body: "For 2025, a single filer under 65 generally must file if gross income is at least the standard deduction, $15,750. Other rules apply to dependents and self-employment." },
          { heading: "File anyway?", body: "Even if you don't have to file, you must file to get back any income tax that was withheld. Many first-time workers do it just for the refund." },
        ],
        tryIt: "filingStatus",
        quiz: [
          { q: "You're 20, unmarried, and don't support anyone. Your most likely filing status?", options: ["Head of household", "Single", "Married filing separately", "Dependent"], correct: 1, explain: "\"Dependent\" isn't a filing status. Unmarried with no qualifying person is Single." },
          { q: "You earned $4,000 and $300 was withheld. Why might you file?", options: ["You can't. Income is too low", "To get the $300 withheld back", "To pay a penalty", "To get a W-2"], correct: 1, explain: "Filing is the only way to get withheld income tax refunded." },
        ],
        sources: [SRC.p501, SRC.i1040],
      },
      {
        id: "standard-deduction",
        title: "The standard deduction",
        minutes: 2,
        summary: "The slice of your income that isn't taxed at all.",
        cards: [
          { heading: "Free income", body: "The standard deduction is subtracted from your income before tax is figured. For 2025 it's $15,750 for single filers, $31,500 married filing jointly and $23,625 head of household." },
          { heading: "Why those numbers", body: "The One, Big, Beautiful Bill Act, signed July 4, 2025, raised the 2025 amounts." },
          { heading: "Standard vs. itemizing", body: "You can itemize deductions instead, but only if they add up to more. Most first-time filers take the standard deduction." },
          { heading: "If someone can claim you", body: "If a parent can claim you as a dependent, your standard deduction is limited to the greater of $1,350 or your earned income plus $450, up to the normal amount." },
        ],
        tryIt: "standardDeduction",
        quiz: [
          { q: "A single filer earns $30,000 in wages. What's their taxable income in 2025?", options: ["$30,000", "$15,750", "$14,250", "$0"], correct: 2, explain: "$30,000 − $15,750 = $14,250." },
          { q: "When does itemizing make sense?", options: ["Always", "When itemized deductions are bigger than the standard deduction", "Only for students", "Never for W-2 workers"], correct: 1, explain: "You take whichever is bigger." },
        ],
        sources: [SRC.obbba, SRC.p501],
      },
      {
        id: "brackets",
        title: "Tax brackets, demystified",
        minutes: 4,
        summary: "Why a raise never lowers your take-home pay.",
        cards: [
          { heading: "Progressive tax", body: "Income tax rates go up in steps. Each rate applies only to the slice of taxable income inside its bracket, not to all of it." },
          { heading: "2025 single brackets", body: "10% up to $11,925, 12% up to $48,475, 22% up to $103,350, then 24%, 32%, 35% and 37% at higher incomes." },
          { heading: "Marginal vs. effective", body: "Your marginal rate is the rate on your last dollar. Your effective rate is total tax divided by income, and it's always lower." },
          { heading: "The myth", body: "\"A raise will bump me into a higher bracket and I'll take home less.\" False. Only the dollars above the line get the higher rate." },
        ],
        tryIt: "brackets",
        quiz: [
          { q: "A single filer has $50,000 of taxable income. What's their marginal rate in 2025?", options: ["10%", "12%", "22%", "24%"], correct: 2, explain: "$50,000 is above $48,475, so the last dollars are taxed at 22%." },
          { q: "Moving into the 22% bracket means…", options: ["All your income is taxed at 22%", "Only income above the bracket line is taxed at 22%", "You lose the standard deduction", "Your refund disappears"], correct: 1, explain: "Each rate applies only to its own slice." },
          { q: "Which is usually lower?", options: ["Marginal rate", "Effective rate", "They're always equal", "Depends on the state"], correct: 1, explain: "Effective rate blends all the lower brackets, so it's below your top rate." },
        ],
        sources: [SRC.rp2440, SRC.i1040],
      },
    ],
  },
  {
    id: "filing",
    title: "Filing your first return",
    blurb: "Dependents, deadlines, side gigs and staying safe.",
    badge: "Ready to File",
    lessons: [
      {
        id: "dependents",
        title: "Can my parents claim me?",
        minutes: 3,
        summary: "The question only you can answer on your return.",
        cards: [
          { heading: "Why it matters", body: "If someone can claim you as a dependent, you check a box on your return, your standard deduction may be limited, and you can't claim some credits." },
          { heading: "The usual test for students", body: "A parent can generally claim you as a qualifying child if you were under 19 at year end (or under 24 and a full-time student), lived with them more than half the year, and didn't pay more than half of your own support." },
          { heading: "Talk before you file", body: "If you and a parent both claim the same thing, one return gets rejected or questioned. Agree on it first." },
        ],
        quiz: [
          { q: "You're 21, a full-time student, lived at home most of the year, and your parents paid most of your costs. Can they likely claim you?", options: ["Yes", "No, you're over 19", "Only if you earned nothing", "Only if you agree in writing"], correct: 0, explain: "Under 24 and a full-time student, living with them, and not self-supporting usually means yes." },
          { q: "Where does your dependent status come from on your return?", options: ["Your W-2", "Your answer. It's not on any form you receive", "Your bank", "The IRS fills it in"], correct: 1, explain: "No W-2 shows it, so you have to confirm it yourself. That's why our Tax Assistant always asks." },
        ],
        sources: [SRC.p501],
      },
      {
        id: "deadlines",
        title: "Deadlines, filing free & refunds",
        minutes: 3,
        summary: "When and how to file without paying for it.",
        cards: [
          { heading: "The deadline", body: "2025 federal returns are generally due April 15, 2026." },
          { heading: "Extensions", body: "Form 4868 gives you until October 15 to file, but not more time to pay. Any tax owed is still due in April." },
          { heading: "File for free", body: "IRS Free File lets eligible taxpayers prepare and e-file federal returns at no cost through IRS partners, and Free File Fillable Forms are open to everyone." },
          { heading: "Getting your refund", body: "The IRS issues most refunds in less than 21 days when you e-file with direct deposit. Track it with \"Where's My Refund?\". Keep your tax records for at least three years." },
        ],
        quiz: [
          { q: "You file an extension. When is any tax you owe due?", options: ["October 15", "April 15", "Whenever you file", "December 31"], correct: 1, explain: "An extension is more time to file, not to pay." },
          { q: "Fastest way to get a refund?", options: ["Paper return by mail", "E-file with direct deposit", "Call the IRS", "Wait for a check"], correct: 1, explain: "E-file plus direct deposit is fastest." },
        ],
        sources: [SRC.i1040, SRC.extension, SRC.freeFile, SRC.refund, SRC.records],
      },
      {
        id: "side-gigs",
        title: "Side gigs & 1099s",
        minutes: 3,
        summary: "Freelance, delivery and content income are taxed differently.",
        cards: [
          { heading: "It's all income", body: "Money from freelancing, delivery apps, selling services or content creation is taxable, whether or not you get a form for it." },
          { heading: "Self-employment tax", body: "If your net self-employment earnings are $400 or more, you generally owe self-employment tax of 15.3%, covering both halves of Social Security and Medicare, on 92.35% of those earnings." },
          { heading: "No withholding", body: "Nobody withholds tax from gig pay, so you may need to make quarterly estimated payments to avoid a surprise bill." },
          { heading: "Extra forms", body: "Self-employment means Schedule C and Schedule SE. That's beyond what our Tax Assistant handles, so it will tell you instead of guessing." },
        ],
        tryIt: "selfEmployment",
        quiz: [
          { q: "You made $1,500 net from freelance design. Do you owe self-employment tax?", options: ["No, it's under $600", "Yes, it's $400 or more", "Only if you got a 1099", "Only after $10,000"], correct: 1, explain: "The threshold is $400 of net self-employment earnings." },
          { q: "Do you have to report gig income if you didn't receive a 1099?", options: ["No", "Yes, it's still taxable", "Only cash payments", "Only if over $5,000"], correct: 1, explain: "Income is taxable whether or not a form was issued." },
        ],
        sources: [SRC.selfEmployed, SRC.gig],
      },
      {
        id: "scams",
        title: "IRS letters & scams",
        minutes: 2,
        summary: "How the real IRS contacts you, and how scammers do.",
        cards: [
          { heading: "The real IRS", body: "The IRS usually contacts you first by mail. It doesn't start contact by email, text or social media to ask for personal or financial information." },
          { heading: "Red flags", body: "Threats of arrest, demands for immediate payment, or requests to pay with gift cards, wire transfers or crypto are signs of a scam." },
          { heading: "If you get a letter", body: "Read it carefully. Most letters are about a specific question or change. Respond by the date shown, and check that it's real on IRS.gov." },
        ],
        quiz: [
          { q: "A text says you owe the IRS and must pay with gift cards today. What is it?", options: ["Real. Pay it", "A scam", "A normal reminder", "A refund notice"], correct: 1, explain: "The IRS doesn't demand gift cards or start contact by text." },
          { q: "How does the IRS usually contact you first?", options: ["Text message", "Social media", "Mail", "Phone call threatening arrest"], correct: 2, explain: "First contact is typically by mail." },
        ],
        sources: [SRC.scams],
      },
    ],
  },
];

export const ALL_LESSONS = MODULES.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleId: m.id, moduleTitle: m.title })));
export const XP_PER_LESSON = 10;
export const PASS_RATIO = 2 / 3;
