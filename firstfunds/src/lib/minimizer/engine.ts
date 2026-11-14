// Deterministic question-selection + readiness engine.
// Decides: which question (if any) to ask next, what blocks the return, whether the
// situation is in scope, and the tax numbers with a source for every figure.
import { computeTax, type TaxResult } from "../finance/tax2025";
import { active, activeW2s, classifyNewDocument, exclusionMessage, findConflicts, SUPPORTED_TAX_YEAR, validateDocument } from "./documents";
import { buildQuestions, IRS, NOT_SURE, priorityScore, type Ctx, type Question } from "./registry";
import type { FilingEvent, FilingProfile, Issue, Phase, ScopeReason, SourcedNumber, TaxDocument } from "./types";

export function emptyProfile(): FilingProfile {
  return { version: 1, answers: {}, skipped: [], documents: [], uploadsDone: false, verified: false, approvedAt: null, revision: 0 };
}

// ---------------------------------------------------------------- reducer

/** Apply one user event. Any change invalidates verification and approval. */
export function applyEvent(p: FilingProfile, e: FilingEvent): FilingProfile {
  if (e.type === "reset") return emptyProfile();
  const next: FilingProfile = {
    ...p,
    answers: { ...p.answers },
    skipped: [...p.skipped],
    documents: [...p.documents],
    revision: p.revision + 1,
  };
  const invalidate = () => {
    next.verified = false;
    next.approvedAt = null;
  };
  switch (e.type) {
    case "answer": {
      next.answers[e.questionId] = { value: e.value, at: Date.now() };
      next.skipped = next.skipped.filter((id) => id !== e.questionId);
      if (e.questionId.startsWith("employers.complete.") && e.value === "more") next.uploadsDone = false;
      invalidate();
      break;
    }
    case "skip":
      if (!next.skipped.includes(e.questionId)) next.skipped.push(e.questionId);
      delete next.answers[e.questionId];
      invalidate();
      break;
    case "addDocument":
      next.documents.push(classifyNewDocument(e.doc, p.documents));
      invalidate();
      break;
    case "removeDocument":
      next.documents = next.documents.filter((d) => d.id !== e.docId);
      invalidate();
      break;
    case "restoreDocument":
      next.documents = next.documents.map((d) => (d.id === e.docId ? { ...d, excluded: null } : d));
      invalidate();
      break;
    case "confirmDocument":
      next.documents = next.documents.map((d) => {
        if (d.id !== e.docId) return d;
        const corrected = new Set(d.correctedFields);
        const fields = { ...d.fields };
        if (e.fields) {
          for (const [k, v] of Object.entries(e.fields) as [keyof typeof fields, number | null][]) {
            if (fields[k] !== v) {
              fields[k] = v;
              corrected.add(k);
            }
          }
        }
        return { ...d, fields, confirmed: true, correctedFields: [...corrected] };
      });
      invalidate();
      break;
    case "uploadsDone":
      next.uploadsDone = e.done;
      if (e.done) {
        // A previous "I have another W-2" no longer applies once they say they're done.
        for (const k of Object.keys(next.answers)) if (k.startsWith("employers.complete.") && next.answers[k].value === "more") delete next.answers[k];
      }
      invalidate();
      break;
    case "verify":
      next.verified = e.verified;
      next.approvedAt = null;
      break;
    case "approve":
      next.approvedAt = Date.now();
      break;
  }
  return next;
}

// ---------------------------------------------------------------- analysis

export type QuestionState = Question & { status: "unanswered" | "skipped" | "answered" | "not_sure" };

export type Analysis = {
  phase: Phase;
  next: QuestionState | null;
  questions: QuestionState[];
  /** Documents still counted, after answer-driven decisions. */
  docs: TaxDocument[];
  notices: string[];
  issues: Issue[];
  blockers: string[];
  scope: { supported: boolean; reasons: ScopeReason[] };
  facts: { wages: SourcedNumber; withheld: SourcedNumber } | null;
  calc: TaxResult | null;
  calcValid: boolean;
  readyForReview: boolean;
  /** One proactive line for the assistant, built only from real data. */
  assistant: string | null;
  progress: { done: number; total: number };
};

/** Documents after applying the user's answers (conflict choices, "not mine", box-2 answers). */
export function effectiveDocuments(p: FilingProfile): TaxDocument[] {
  let docs = p.documents.filter((d) => !d.excluded);
  for (const [qid, a] of Object.entries(p.answers)) {
    if (qid.startsWith("doc.conflict.")) {
      const ids = qid.slice("doc.conflict.".length).split("+");
      if (a.value !== "both" && a.value !== NOT_SURE && ids.includes(String(a.value))) {
        docs = docs.filter((d) => !(ids.includes(d.id) && d.id !== a.value));
      }
    }
    if (qid.startsWith("doc.nec.") && a.value === "not_mine") {
      const id = qid.slice("doc.nec.".length);
      docs = docs.filter((d) => d.id !== id);
    }
    if (qid.startsWith("doc.withholding.") && a.value !== NOT_SURE) {
      const id = qid.slice("doc.withholding.".length);
      docs = docs.map((d) => (d.id === id ? { ...d, fields: { ...d.fields, federalWithheld: Number(a.value) || 0 } } : d));
    }
  }
  return docs;
}

function status(p: FilingProfile, q: Question): QuestionState["status"] {
  const a = p.answers[q.id];
  if (a) return a.value === NOT_SURE ? "not_sure" : "answered";
  return p.skipped.includes(q.id) ? "skipped" : "unanswered";
}

/** Pick the next question: highest priority unanswered first; skipped ones only at the end. */
export function selectNext(qs: QuestionState[], stage?: Question["stage"]): QuestionState | null {
  const pool = stage ? qs.filter((q) => q.stage === stage) : qs;
  const byPriority = (a: QuestionState, b: QuestionState) => priorityScore(b) - priorityScore(a) || qs.indexOf(a) - qs.indexOf(b);
  const fresh = pool.filter((q) => q.status === "unanswered").sort(byPriority);
  if (fresh.length) return fresh[0];
  const skipped = pool.filter((q) => q.status === "skipped" && q.required).sort(byPriority);
  return skipped[0] ?? null;
}

const ans = (p: FilingProfile, id: string) => p.answers[id]?.value;

function scopeReasons(p: FilingProfile, docs: TaxDocument[]): ScopeReason[] {
  const r: ScopeReason[] = [];
  if (ans(p, "basics.taxYear") === "earlier")
    r.push({ id: "year", title: "Only 2025 returns are supported", detail: "Prior-year returns use different forms and amounts. Prior-year forms and instructions are on IRS.gov.", link: IRS.priorYear });
  const income = ans(p, "basics.income");
  if (Array.isArray(income) && income.includes("gig"))
    r.push({ id: "gig", title: "Freelance or gig income needs a different workflow", detail: "Self-employment income usually needs Schedule C and Schedule SE, including self-employment tax. Using a W-2-only calculation would understate what you owe.", link: IRS.selfEmployed });
  if (Array.isArray(income) && income.includes("other"))
    r.push({ id: "other", title: "Other income types aren't supported yet", detail: "Interest, investments, unemployment and taxable scholarships each need their own forms or lines.", link: IRS.freeFile });
  if (ans(p, "household.married") === "yes")
    r.push({ id: "married", title: "Married returns aren't supported yet", detail: "Married filers choose between joint and separate returns, which needs both spouses' information.", link: IRS.p501 });
  if (ans(p, "household.supportsSomeone") === "yes")
    r.push({ id: "supports", title: "Returns with dependents aren't supported yet", detail: "Supporting a child or relative can change your filing status and qualify you for credits we can't calculate.", link: IRS.p501 });
  if (ans(p, "income.tipsOvertime") === "yes")
    r.push({ id: "tips", title: "Tips and overtime deductions aren't supported yet", detail: "New 2025 deductions may lower your tax. Our estimate would leave them out, so it could overstate what you owe.", link: IRS.obbba });
  for (const d of docs.filter((x) => x.kind === "1099-NEC"))
    if (ans(p, `doc.nec.${d.id}`) === "yes")
      r.push({ id: `nec:${d.id}`, title: "Self-employment income found", detail: `Your 1099-NEC from ${d.payer} is self-employment income, which needs Schedule C and SE.`, link: IRS.selfEmployed });
  if (docs.some((d) => d.kind === "unknown"))
    r.push({ id: "unknown", title: "We couldn't recognize one of your documents", detail: "Only W-2s and 1099-NECs are understood right now. Remove it if it isn't a tax form, or get help with it.", link: IRS.freeFile });
  return r;
}

function sumField(docs: TaxDocument[], field: "wages" | "federalWithheld", box: string, p: FilingProfile): SourcedNumber {
  let value = 0;
  const sources: SourcedNumber["sources"] = [];
  for (const d of docs) {
    const v = d.fields[field];
    if (typeof v !== "number") continue;
    value += v;
    const answeredId = `doc.withholding.${d.id}`;
    if (field === "federalWithheld" && p.answers[answeredId]) {
      sources.push({ kind: "answer", questionId: answeredId, label: `You entered box 2 for ${d.label}` });
    } else {
      sources.push({ kind: "document", docId: d.id, docLabel: d.label, box, userCorrected: d.correctedFields.includes(field) });
    }
  }
  return { value: Math.round(value * 100) / 100, sources };
}

export function analyze(p: FilingProfile): Analysis {
  const docs = effectiveDocuments(p);
  const w2s = activeW2s(docs);
  const uploaded = active(p.documents);
  const ctx: Ctx = { profile: p, docs, uploaded, w2s, conflicts: findConflicts(uploaded), answer: (id) => ans(p, id) };
  const questions: QuestionState[] = buildQuestions(ctx).map((q) => ({ ...q, status: status(p, q) }));

  const notices = p.documents.map(exclusionMessage).filter((m): m is string => !!m);
  for (const d of p.documents.filter((x) => !x.excluded && !docs.some((k) => k.id === x.id)))
    notices.push(`${d.label} isn't counted, based on your answer.`);
  const issues = docs.flatMap(validateDocument);
  for (const i of issues) if (i.severity === "notice") notices.push(i.message);

  const reasons = scopeReasons(p, docs);
  const basicsNext = selectNext(questions, "basics");
  const unconfirmed = docs.filter((d) => !d.confirmed);
  const followNext = selectNext(questions, "followup");

  // Blockers = everything that must be true before "ready for review".
  const blockers: string[] = [];
  for (const q of questions.filter((x) => x.required)) {
    if (q.status === "unanswered" || q.status === "skipped") blockers.push(`Still needed: ${q.text}`);
    if (q.status === "not_sure") blockers.push(`You weren't sure: ${q.text}`);
  }
  if (!p.uploadsDone) blockers.push("Add your documents.");
  if (p.uploadsDone && w2s.length === 0 && reasons.length === 0) blockers.push("Add at least one 2025 W-2.");
  if (unconfirmed.length) blockers.push(`Confirm the numbers on ${unconfirmed.length} document${unconfirmed.length > 1 ? "s" : ""}.`);
  for (const i of issues.filter((x) => x.severity === "blocker")) blockers.push(i.message);
  for (const d of w2s) if (d.taxYear !== SUPPORTED_TAX_YEAR && d.taxYear !== null) blockers.push(`${d.label} isn't for ${SUPPORTED_TAX_YEAR}.`);

  // Deterministic calculation — only from confirmed, counted W-2s.
  let facts: Analysis["facts"] = null;
  let calc: TaxResult | null = null;
  let calcValid = false;
  const canCalc = w2s.length > 0 && unconfirmed.length === 0 && w2s.every((d) => typeof d.fields.wages === "number");
  if (canCalc) {
    const wages = sumField(w2s, "wages", "Box 1", p);
    const withheld = sumField(w2s, "federalWithheld", "Box 2", p);
    facts = { wages, withheld };
    calc = computeTax({
      filingStatus: "single",
      wages: wages.value,
      federalWithheld: withheld.value,
      canBeClaimedAsDependent: ans(p, "dependent.claimable") === "yes",
      hasTipsOrOvertime: false,
      hasOtherIncome: false,
      isStudent: false,
    });
    // Independent re-check of the arithmetic before we show anything.
    calcValid =
      calc.tax >= 0 &&
      calc.taxableIncome === Math.max(0, calc.grossIncome - calc.standardDeduction) &&
      calc.refund === calc.withholding - calc.tax &&
      calc.grossIncome === Math.round(wages.value) &&
      withheld.value <= wages.value;
    if (!calcValid) blockers.push("The calculation didn't pass its checks. Please review your numbers.");
  }

  const supported = reasons.length === 0;
  const readyForReview = supported && blockers.length === 0 && calcValid;

  let phase: Phase;
  if (basicsNext) phase = "basics";
  else if (!supported) phase = "unsupported";
  else if (!p.uploadsDone) phase = "documents";
  else if (unconfirmed.length) phase = "confirm";
  else if (followNext) phase = "questions";
  else if (!readyForReview || !p.verified) phase = "verify";
  else if (!p.approvedAt) phase = "estimate";
  else phase = "approved";

  const next = phase === "basics" ? basicsNext : phase === "questions" ? followNext : null;

  // Progress: required questions + documents step.
  const req = questions.filter((q) => q.required || q.stage === "basics");
  const done = req.filter((q) => q.status === "answered").length + (p.uploadsDone && !unconfirmed.length ? 1 : 0);
  const total = req.length + 1;

  let assistant: string | null = null;
  if (next?.lead) assistant = next.lead;
  else if (phase === "verify" && readyForReview) assistant = "Everything looks consistent so far. You're ready to review your estimated return.";
  else if (phase === "verify" && blockers.length) assistant = blockers.length === 1 ? "One detail needs your attention." : `${blockers.length} details need your attention.`;
  else if (phase === "estimate") assistant = "Your tax estimate is ready.";

  return { phase, next, questions, docs, notices, issues, blockers, scope: { supported, reasons }, facts, calc, calcValid, readyForReview, assistant, progress: { done, total } };
}
