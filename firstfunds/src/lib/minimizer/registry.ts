// Structured question registry. Each question declares WHY it exists, WHEN it
// applies, and HOW it's prioritized. The engine never asks anything not listed here.
import type { AnswerValue, FilingProfile, TaxDocument } from "./types";

export type QuestionOption = { value: string; label: string };

export type Ctx = {
  profile: FilingProfile;
  /** Documents still counted (after automatic and answer-driven exclusions). */
  docs: TaxDocument[];
  /** Documents before answer-driven decisions (used so answered questions stay changeable). */
  uploaded: TaxDocument[];
  w2s: TaxDocument[];
  conflicts: { a: TaxDocument; b: TaxDocument }[];
  answer: (id: string) => AnswerValue | undefined;
};

export type Question = {
  id: string;
  stage: "basics" | "followup";
  kind: "choice" | "multi" | "amount";
  text: string;
  /** One proactive sentence shown above the question, built from real data. */
  lead?: string;
  why: string;
  whyLink?: { label: string; url: string };
  options: QuestionOption[];
  /** For "amount" questions: label for the number field. */
  amountLabel?: string;
  allowNotSure: boolean;
  /** Safe to skip for now (still required before the return is ready). */
  skippable: boolean;
  /** Must be answered (and not "not sure") before the return can be ready. */
  required: boolean;
  priority: { legal: boolean; eligibility: boolean; conflict: boolean; answerability: 1 | 2 | 3 | 4 | 5 };
};

export const NOT_SURE = "not_sure";

export const IRS = {
  p501: { label: "IRS Publication 501", url: "https://www.irs.gov/publications/p501" },
  freeFile: { label: "IRS Free File", url: "https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free" },
  w2: { label: "About Form W-2", url: "https://www.irs.gov/forms-pubs/about-form-w-2" },
  selfEmployed: { label: "IRS Self-Employed Individuals Tax Center", url: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center" },
  obbba: { label: "IRS: One, Big, Beautiful Bill provisions", url: "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions" },
  priorYear: { label: "IRS: Prior year forms and instructions", url: "https://www.irs.gov/forms-pubs/prior-year" },
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Short stable id for a set of documents, so a question re-asks when the set changes. */
export function setKey(docs: TaxDocument[]) {
  return docs
    .map((d) => d.id)
    .sort()
    .join("+");
}

function payersList(w2s: TaxDocument[]) {
  const names = [...new Set(w2s.map((d) => d.payer))];
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Every question that could apply to this user right now, in registry order. */
export function buildQuestions(ctx: Ctx): Question[] {
  const qs: Question[] = [];
  const { profile, w2s } = ctx;
  const docsConfirmed = ctx.docs.length > 0 && ctx.docs.every((d) => d.confirmed);

  // ---------- Basics (2–3 questions, before any upload) ----------
  qs.push({
    id: "basics.taxYear",
    stage: "basics",
    kind: "choice",
    text: "Which tax year are you filing for?",
    why: "Tax rules, deductions and forms change every year. We support 2025 returns, the ones due April 15, 2026.",
    options: [
      { value: "2025", label: "2025 (due April 2026)" },
      { value: "earlier", label: "2024 or earlier" },
    ],
    allowNotSure: false,
    skippable: false,
    required: true,
    priority: { legal: true, eligibility: true, conflict: false, answerability: 5 },
  });

  qs.push({
    id: "basics.income",
    stage: "basics",
    kind: "multi",
    text: "What kinds of income did you have in 2025?",
    lead: "Pick all that apply.",
    why: "Different income needs different forms. Wages from a job are handled here; freelance or other income needs extra schedules we don't support yet.",
    options: [
      { value: "w2", label: "A job that gave me a W-2" },
      { value: "gig", label: "Freelance, gig or contract work (1099)" },
      { value: "other", label: "Something else: interest, investments, unemployment, scholarships" },
    ],
    allowNotSure: true,
    skippable: false,
    required: true,
    priority: { legal: false, eligibility: true, conflict: false, answerability: 4 },
  });

  qs.push({
    id: "basics.docsReady",
    stage: "basics",
    kind: "choice",
    text: "Do you have your tax documents ready?",
    why: "If you have your W-2, we can read the numbers from it so you don't have to type them. Employers send W-2s by January 31.",
    options: [
      { value: "yes", label: "Yes, I have them" },
      { value: "some", label: "Some of them" },
      { value: "no", label: "Not yet" },
    ],
    allowNotSure: false,
    skippable: false,
    required: false,
    priority: { legal: false, eligibility: false, conflict: false, answerability: 5 },
  });

  if (!profile.uploadsDone) return qs;

  // ---------- Follow-ups (only what documents can't tell us) ----------
  const foundLead =
    docsConfirmed && w2s.length
      ? `I found your wages and federal withholding${w2s.length === 1 ? ` from ${w2s[0].payer}` : ""}.`
      : undefined;

  qs.push({
    id: "household.married",
    stage: "followup",
    kind: "choice",
    text: "Were you married on December 31, 2025?",
    lead: foundLead ? `${foundLead} A few quick questions your W-2 can't answer.` : undefined,
    why: "Your marital status on the last day of the year decides your filing status, which sets your standard deduction and tax brackets.",
    whyLink: IRS.p501,
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
    ],
    allowNotSure: false,
    skippable: true,
    required: true,
    priority: { legal: true, eligibility: true, conflict: false, answerability: 5 },
  });

  qs.push({
    id: "dependent.claimable",
    stage: "followup",
    kind: "choice",
    text: "Can anyone, like a parent, claim you as a dependent for 2025?",
    lead: foundLead ? `${foundLead} I just need to confirm whether anyone can claim you as a dependent.` : undefined,
    why: "Only you can confirm this, since it's never on a W-2. If someone can claim you, your standard deduction may be smaller. Students under 24 supported by their parents often can be claimed.",
    whyLink: IRS.p501,
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
    ],
    allowNotSure: true,
    skippable: true,
    required: true,
    priority: { legal: true, eligibility: true, conflict: false, answerability: 3 },
  });

  qs.push({
    id: "household.supportsSomeone",
    stage: "followup",
    kind: "choice",
    text: "Did a child or relative live with you whom you financially supported?",
    why: "Supporting someone can change your filing status and qualify you for credits, which this tool can't calculate yet.",
    whyLink: IRS.p501,
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
    ],
    allowNotSure: false,
    skippable: true,
    required: true,
    priority: { legal: false, eligibility: true, conflict: false, answerability: 5 },
  });

  // Conflicts between documents from the same employer.
  for (const { a, b } of ctx.conflicts) {
    qs.push({
      id: `doc.conflict.${setKey([a, b])}`,
      stage: "followup",
      kind: "choice",
      text: `Two W-2s from ${a.payer} show different wages: ${usd(a.fields.wages ?? 0)} and ${usd(b.fields.wages ?? 0)}. Which should we use?`,
      lead: "One detail needs your attention.",
      why: "Counting the wrong W-2, or both when one replaces the other, would get your tax wrong. Employers sometimes send a corrected W-2 (Form W-2c).",
      whyLink: IRS.w2,
      options: [
        { value: a.id, label: `Use ${usd(a.fields.wages ?? 0)} · ${a.label}` },
        { value: b.id, label: `Use ${usd(b.fields.wages ?? 0)} · ${b.label}` },
        { value: "both", label: "Both. They're two separate jobs" },
      ],
      allowNotSure: true,
      skippable: false,
      required: true,
      priority: { legal: false, eligibility: true, conflict: true, answerability: 4 },
    });
  }

  // A 1099-NEC the user didn't mention.
  const income = ctx.answer("basics.income");
  const saidGig = Array.isArray(income) && income.includes("gig");
  for (const d of ctx.uploaded.filter((x) => x.kind === "1099-NEC")) {
    if (saidGig) continue;
    qs.push({
      id: `doc.nec.${d.id}`,
      stage: "followup",
      kind: "choice",
      text: `We found a 1099-NEC from ${d.payer} for ${usd(d.fields.nonemployeeComp ?? 0)}. Did you do freelance or contract work for them in 2025?`,
      lead: "One detail needs your attention.",
      why: "Contract income is self-employment income. It's taxed differently (including self-employment tax) and needs extra forms.",
      whyLink: IRS.selfEmployed,
      options: [
        { value: "yes", label: "Yes, that's mine" },
        { value: "not_mine", label: "No, this isn't mine" },
      ],
      allowNotSure: true,
      skippable: false,
      required: true,
      priority: { legal: false, eligibility: true, conflict: true, answerability: 5 },
    });
  }

  // Missing withholding on a W-2.
  const countedIds = new Set(w2s.map((d) => d.id));
  for (const d of ctx.uploaded.filter(
    (x) => x.kind === "W-2" && countedIds.has(x.id) && (x.fields.federalWithheld === null || x.fields.federalWithheld === undefined),
  )) {
    qs.push({
      id: `doc.withholding.${d.id}`,
      stage: "followup",
      kind: "amount",
      text: `Your W-2 from ${d.payer} doesn't show federal tax withheld (box 2). What does box 2 say?`,
      lead: "One detail needs your attention.",
      why: "Box 2 is tax you already paid. It's what decides whether you get a refund or owe, so we won't guess it.",
      whyLink: IRS.w2,
      options: [{ value: "0", label: "It's blank or $0" }],
      amountLabel: "Amount in box 2",
      allowNotSure: true,
      skippable: true,
      required: true,
      priority: { legal: false, eligibility: true, conflict: false, answerability: 4 },
    });
  }

  if (w2s.length) {
    const n = w2s.length;
    qs.push({
      id: `employers.complete.${setKey(w2s)}`,
      stage: "followup",
      kind: "choice",
      text:
        n === 1
          ? `Was ${w2s[0].payer} your only employer in 2025?`
          : `Your documents show income from ${n} employers: ${payersList(w2s)}. Is that everyone you worked for in 2025?`,
      why: "Every W-2 has to be on your return. A missing one is a common reason for IRS letters.",
      options: [
        { value: "yes", label: n === 1 ? "Yes, that's my only job" : "Yes, that's everyone" },
        { value: "more", label: "No, I have another W-2" },
      ],
      allowNotSure: true,
      skippable: true,
      required: true,
      priority: { legal: false, eligibility: true, conflict: false, answerability: 5 },
    });

    qs.push({
      id: "income.tipsOvertime",
      stage: "followup",
      kind: "choice",
      text: "Did any of your 2025 pay include tips or overtime?",
      why: "Starting in 2025 there are new deductions for qualified tips and overtime. We can't calculate them yet, so we need to know whether they apply to you.",
      whyLink: IRS.obbba,
      options: [
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" },
      ],
      allowNotSure: true,
      skippable: true,
      required: true,
      priority: { legal: false, eligibility: true, conflict: false, answerability: 4 },
    });
  }

  return qs;
}

export function priorityScore(q: Question) {
  const p = q.priority;
  return (p.legal ? 1000 : 0) + (p.eligibility ? 100 : 0) + (p.conflict ? 10 : 0) + p.answerability;
}
