// Deterministic specialist logic. Agents (LLM or scripted) decide WHEN to call these;
// what they return — numbers, verdicts, citations — is plain, tested code.
import { bracketTax, computeTax, STANDARD_DEDUCTION, taxTableMidpoint, TAX_YEAR } from "../finance/tax2025";
import { CORPUS } from "../tutor/corpus";
import { appUrl, signLink } from "./secureLink";
import { extractDocument, reviewExtraction, withOverrides, type DocIssue, type ExtractedDoc } from "./documents";
import { store } from "./store";

// ------------------------------------------------------------------ workspace
/** Per-run scratchpad shared by the tools of one supervisor run (not by other tenants). */
export type Workspace = {
  runId: string;
  tenant: string;
  threadId: string;
  channel: "message" | "web";
  /** Set while a run is paused waiting for human approval. */
  awaitingApproval?: boolean;
  documents?: { docs: ExtractedDoc[]; issues: DocIssue[] };
  research?: ResearchResult;
  calculation?: CalcResult;
  verification?: Verdict;
  planning?: PlanResult;
  reply?: Reply;
};

// ------------------------------------------------------------------ document agent
export function documentAgent(ws: Workspace) {
  const raw = store.documents(ws.tenant).map(extractDocument);
  const docs = withOverrides(raw, ws.tenant);
  const issues = reviewExtraction(docs, TAX_YEAR);
  ws.documents = { docs, issues };
  return {
    documents: docs.map((d) => ({
      docId: d.docId,
      fileName: d.fileName,
      kind: d.kind,
      taxYear: d.taxYear,
      fields: Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, { confidence: v.confidence, present: v.value !== null, source: `${v.source.fileName}, ${v.source.box}` }])),
    })),
    issues: issues.map((i) => ({ severity: i.severity, code: i.code, message: i.message })),
  };
}

// ------------------------------------------------------------------ research agent
export type Citation = { sourceId: string; title: string; url: string; taxYear: number | "any"; evidence: string };
export type ResearchResult = { taxYear: number; citations: Citation[]; unverified: string[] };

/** Which corpus entries carry year-specific figures. Evergreen entries are "any". */
const SOURCE_YEAR: Record<string, number> = { "std-ded-2025": 2025, "brackets-2025": 2025, "dependent-std": 2025 };
const TOPIC_SOURCES: Record<string, string[]> = {
  wages: ["w2-boxes"],
  withholding: ["refund-withholding", "w2-boxes"],
  "standard deduction": ["std-ded-2025"],
  brackets: ["brackets-2025", "tax-table"],
  dependent: ["dependent-std", "filing-status"],
  "filing status": ["filing-status"],
  "tips and overtime": ["tips-overtime"],
  "education credits": [],
  "state tax": [],
};

export function researchAgent(ws: Workspace, topics: string[], taxYear = TAX_YEAR): ResearchResult {
  const citations: Citation[] = [];
  const unverified: string[] = [];
  for (const raw of topics) {
    const topic = raw.toLowerCase().trim();
    const ids = TOPIC_SOURCES[topic];
    if (!ids || ids.length === 0) {
      unverified.push(raw);
      continue;
    }
    for (const id of ids) {
      const doc = CORPUS.find((d) => d.id === id);
      if (!doc || !doc.url.startsWith("https://www.irs.gov")) continue;
      const year: number | "any" = id in SOURCE_YEAR ? SOURCE_YEAR[id] : "any";
      if (year !== "any" && year !== taxYear) continue; // wrong-year figures are never cited
      if (!citations.some((c) => c.sourceId === id)) citations.push({ sourceId: id, title: doc.title, url: doc.url, taxYear: year, evidence: doc.text.slice(0, 280) });
    }
  }
  const result = { taxYear, citations, unverified };
  ws.research = result;
  store.remember(ws.tenant, "source-ref", { taxYear, sourceIds: citations.map((c) => c.sourceId) });
  return result;
}

// ------------------------------------------------------------------ calculation agent
export type CalcResult = {
  status: "complete" | "liability-only" | "blocked";
  missing: string[];
  breakdown: { wages: number; standardDeduction: number; taxableIncome: number; tax: number; method: string; withholding: number | null; refund: number | null } | null;
  assumptions: string[];
  inputs: { docId: string; field: string; source: string }[];
};

export function calculationAgent(ws: Workspace): CalcResult {
  const docs = ws.documents?.docs ?? withOverrides(store.documents(ws.tenant).map(extractDocument), ws.tenant);
  const issues = ws.documents?.issues ?? reviewExtraction(docs, TAX_YEAR);
  const w2 = docs.filter((d) => d.kind === "W-2" && d.taxYear === TAX_YEAR);
  const answers = store.answers(ws.tenant);
  const assumptions = ["Tax year 2025, federal only", "Filing status: single", "Standard deduction; no credits or other income"];

  if (issues.some((i) => i.code === "out-of-scope" || i.code === "conflict" || i.code === "wrong-year") || w2.length === 0) {
    const r: CalcResult = { status: "blocked", missing: [], breakdown: null, assumptions, inputs: [] };
    ws.calculation = r;
    return r;
  }
  const missingWages = w2.filter((d) => d.fields.wages.value === null);
  if (missingWages.length) {
    const r: CalcResult = { status: "blocked", missing: missingWages.map((d) => `${d.fileName}: Box 1`), breakdown: null, assumptions, inputs: [] };
    ws.calculation = r;
    return r;
  }
  const wages = w2.reduce((a, d) => a + (d.fields.wages.value ?? 0), 0);
  const withheldKnown = w2.every((d) => d.fields.federalWithheld.value !== null);
  const withholding = withheldKnown ? w2.reduce((a, d) => a + (d.fields.federalWithheld.value ?? 0), 0) : 0;
  const dependent = answers.dependent === "yes";
  if (!answers.dependent || answers.dependent === "not_sure") assumptions.push("Dependent status not confirmed yet; calculated as not claimable");
  const r = computeTax({ filingStatus: "single", wages, federalWithheld: withholding, canBeClaimedAsDependent: dependent, hasTipsOrOvertime: false, hasOtherIncome: false, isStudent: false });

  const result: CalcResult = {
    status: withheldKnown ? "complete" : "liability-only",
    missing: w2.filter((d) => d.fields.federalWithheld.value === null).map((d) => `${d.fileName}: Box 2`),
    breakdown: {
      wages: r.grossIncome,
      standardDeduction: r.standardDeduction,
      taxableIncome: r.taxableIncome,
      tax: r.tax,
      method: r.method,
      withholding: withheldKnown ? r.withholding : null,
      refund: withheldKnown ? r.refund : null,
    },
    assumptions,
    inputs: w2.flatMap((d) =>
      (["wages", "federalWithheld"] as const)
        .filter((f) => d.fields[f].value !== null)
        .map((f) => ({ docId: d.docId, field: f, source: `${d.fileName}, ${d.fields[f].source.box}` })),
    ),
  };
  ws.calculation = result;
  return result;
}

// ------------------------------------------------------------------ verification agent
export type Check = { name: string; pass: boolean; detail: string };
export type Verdict = {
  status: "verified" | "partially-verified" | "blocked";
  verifiedClaims: string[];
  blockedClaims: { claim: string; reason: string }[];
  checks: Check[];
  needsUser: { kind: "field"; docId: string; field: "federalWithheld"; fileName: string }[];
  needsAnswer: ("dependent")[];
};

/** Independent re-check: recomputes from the extracted inputs without using computeTax. */
export function verificationAgent(ws: Workspace): Verdict {
  const checks: Check[] = [];
  const blocked: Verdict["blockedClaims"] = [];
  const verified: string[] = [];
  const docs = ws.documents?.docs ?? [];
  const issues = ws.documents?.issues ?? [];
  const calc = ws.calculation;
  const research = ws.research;
  const answers = store.answers(ws.tenant);
  const needsUser: Verdict["needsUser"] = [];

  checks.push({ name: "Documents analyzed", pass: docs.length > 0, detail: `${docs.length} document(s)` });
  checks.push({ name: "Untrusted text ignored", pass: true, detail: docs.some((d) => d.injectionFlaggedLines.length) ? "Instruction-like text found and excluded from extraction" : "None found" });

  for (const i of issues.filter((x) => x.severity === "blocker")) {
    if (i.code === "missing-field" && i.field === "federalWithheld" && i.docId) {
      const d = docs.find((x) => x.docId === i.docId)!;
      needsUser.push({ kind: "field", docId: i.docId, field: "federalWithheld", fileName: d.fileName });
    } else blocked.push({ claim: "Return can be prepared", reason: i.message });
  }

  // Every input must have a document source.
  const sourced = !!calc && calc.inputs.length > 0 && calc.inputs.every((x) => !!x.source);
  checks.push({ name: "Every number traced to a document box", pass: sourced || !calc?.breakdown, detail: calc ? `${calc.inputs.length} sourced input(s)` : "No calculation" });

  // Citations: must exist, be IRS, and match the tax year.
  const cites = research?.citations ?? [];
  const yearOk = cites.every((c) => c.taxYear === "any" || c.taxYear === research!.taxYear);
  const hasStd = cites.some((c) => c.sourceId === "std-ded-2025");
  const hasBrackets = cites.some((c) => c.sourceId === "brackets-2025");
  checks.push({ name: "IRS sources match tax year 2025", pass: cites.length > 0 && yearOk, detail: `${cites.length} citation(s)` });
  checks.push({ name: "Standard deduction and brackets cited", pass: hasStd && hasBrackets, detail: hasStd && hasBrackets ? "Both cited" : "Missing citation" });
  if (research?.unverified.length) checks.push({ name: "Unverifiable topics flagged", pass: true, detail: research.unverified.join(", ") });

  // Independent arithmetic.
  if (calc?.breakdown) {
    const b = calc.breakdown;
    const wagesFromDocs = docs.filter((d) => d.kind === "W-2").reduce((a, d) => a + (d.fields.wages.value ?? 0), 0);
    const std = answers.dependent === "yes" ? Math.min(STANDARD_DEDUCTION.single, Math.max(1350, wagesFromDocs + 450)) : STANDARD_DEDUCTION.single;
    const taxable = Math.max(0, wagesFromDocs - std);
    const tax = taxable < 100000 ? Math.round(bracketTax(taxTableMidpoint(taxable), "single").tax) : Math.round(bracketTax(taxable, "single").tax);
    const arithmeticOk = b.wages === Math.round(wagesFromDocs) && b.standardDeduction === std && b.taxableIncome === taxable && b.tax === tax;
    checks.push({ name: "Independent recalculation matches", pass: arithmeticOk, detail: arithmeticOk ? "Tax liability re-derived and equal" : "Mismatch" });
    if (arithmeticOk && hasStd && hasBrackets) verified.push("2025 federal tax liability");
    else blocked.push({ claim: "2025 federal tax liability", reason: arithmeticOk ? "Required IRS citation missing" : "Recalculation did not match" });

    if (b.refund !== null && b.withholding !== null) {
      const refundOk = b.refund === b.withholding - b.tax;
      checks.push({ name: "Refund = withholding − tax", pass: refundOk, detail: refundOk ? "Equal" : "Mismatch" });
      if (refundOk && arithmeticOk) verified.push("Refund or amount owed");
      else blocked.push({ claim: "Refund or amount owed", reason: "Refund arithmetic did not match" });
    } else {
      blocked.push({ claim: "Refund or amount owed", reason: "Federal tax withheld is missing on at least one W-2" });
    }
  }

  // Legally required attestation: never inferred from documents.
  const needsAnswer: Verdict["needsAnswer"] = [];
  if (!answers.dependent || answers.dependent === "not_sure") {
    needsAnswer.push("dependent");
    blocked.push({ claim: "Return ready for review", reason: "You need to confirm whether someone can claim you as a dependent" });
  }
  checks.push({ name: "Dependent status confirmed by taxpayer", pass: needsAnswer.length === 0, detail: needsAnswer.length ? "Waiting for your answer" : `Answered: ${answers.dependent}` });

  const status: Verdict["status"] = blocked.length === 0 && needsUser.length === 0 ? "verified" : verified.length ? "partially-verified" : "blocked";
  const v: Verdict = { status, verifiedClaims: verified, blockedClaims: blocked, checks, needsUser, needsAnswer };
  ws.verification = v;
  store.remember(ws.tenant, "validation", { runId: ws.runId, status, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length });
  return v;
}

// ------------------------------------------------------------------ planning agent
export type Opportunity = { id: string; title: string; status: "possible-needs-answer"; question: string; note: string; source?: string };
export type PlanResult = { opportunities: Opportunity[]; disclaimer: string };

export function planningAgent(ws: Workspace): PlanResult {
  const opportunities: Opportunity[] = [
    {
      id: "tips-overtime",
      title: "Deductions for qualified tips or overtime (new for 2025)",
      status: "possible-needs-answer",
      question: "Did any of your 2025 pay include tips or overtime?",
      note: "Not included in this estimate. If it applies, your tax could be lower.",
      source: "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions",
    },
    {
      id: "education",
      title: "Education credits",
      status: "possible-needs-answer",
      question: "Did you pay college tuition in 2025, and does anyone else claim you?",
      note: "Eligibility depends on enrollment, expenses and who claims you. Not included or guaranteed.",
      source: "https://www.irs.gov/credits-deductions/individuals/education-credits-aotc-llc",
    },
  ];
  const r = { opportunities, disclaimer: "These are possibilities to check, not guaranteed savings." };
  ws.planning = r;
  return r;
}

// ------------------------------------------------------------------ communication agent
export type Reply = {
  text: string;
  secureLink: string | null;
  asks: ("dependent")[];
  channel: "message" | "web";
  /** True when the reply contains a verified conclusion (vs a request for info). */
  conclusive: boolean;
};

/**
 * Builds the user-facing answer ONLY from verified findings. On the messaging channel
 * it never includes amounts, document contents or identifiers; it links to the app.
 */
export function communicationAgent(ws: Workspace): Reply {
  const v = ws.verification;
  const docs = ws.documents?.docs ?? [];
  const n = docs.length;
  const parts: string[] = [];
  let link: string | null = null;
  const asks: Reply["asks"] = [];

  if (!v) {
    const r: Reply = { text: "I couldn't verify your return yet, so I won't guess. Please open FirstFunds to continue.", secureLink: null, asks, channel: ws.channel, conclusive: false };
    ws.reply = r;
    return r;
  }

  const scopeBlock = v.blockedClaims.find((b) => /Schedule C|same employer|not 2025|not .*20\d\d/.test(b.reason));
  if (scopeBlock) {
    parts.push(`I checked your documents. I can't safely finish this return here: ${scopeBlock.reason.replace(/\.$/, "")}. You can review the details in FirstFunds.`);
  } else if (v.needsUser.length) {
    const f = v.needsUser[0];
    link = appUrl(`/agents/clarify?token=${encodeURIComponent(signLink({ tenant: ws.tenant, purpose: "clarify-field", field: f.field, docId: f.docId, thread: ws.threadId }))}`);
    parts.push(`I checked your ${n} W-2${n === 1 ? "" : "s"}. One detail is missing: federal tax withheld (box 2) on your ${f.fileName.replace(/^W-2\s*/, "")} W-2.`);
    parts.push(`For your privacy, please enter it on this secure page (expires in 30 minutes): ${link}`);
  } else if (v.status === "verified" && store.savedEstimate(ws.tenant)?.runId === ws.runId) {
    parts.push("Done. Your verified 2025 estimate is saved to your FirstFunds record. Next step: file it with IRS Free File or another provider. FirstFunds doesn't file returns.");
  } else if (v.status === "verified") {
    link = appUrl(`/agents/clarify?token=${encodeURIComponent(signLink({ tenant: ws.tenant, purpose: "review-estimate", thread: ws.threadId }))}`);
    if (ws.channel === "web" && ws.calculation?.breakdown?.refund != null) {
      const r = ws.calculation.breakdown.refund;
      parts.push(`Your 2025 estimate is verified: ${r >= 0 ? "refund" : "amount owed"} of $${Math.abs(r).toLocaleString("en-US")}.`);
    } else parts.push("Your 2025 federal estimate is verified and ready to review.");
    parts.push(`Review and approve it in FirstFunds: ${link}`);
  } else {
    parts.push("I've checked what I can. Some parts still need your input before I can confirm anything.");
  }

  if (v.needsAnswer.includes("dependent") && !scopeBlock) {
    asks.push("dependent");
    parts.push("Also, can anyone (like a parent) claim you as a dependent for 2025? Reply YES, NO, or NOT SURE.");
  }

  let text = parts.join("\n\n");
  if (ws.channel === "message") text = text.replace(/\$\s?\d[\d,]*(\.\d{1,2})?/g, "[amount in app]");
  const r: Reply = { text, secureLink: link, asks, channel: ws.channel, conclusive: v.status === "verified" };
  ws.reply = r;
  return r;
}
