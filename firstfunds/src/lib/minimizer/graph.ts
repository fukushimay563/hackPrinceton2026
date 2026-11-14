// LangGraph workflow for the Question Minimizer.
//
//   START → save_answer → analyze → route ─┬─ ask_user ─────────→ END   (pause: one question)
//                                          ├─ await_documents ──→ END   (pause: upload/confirm)
//                                          ├─ out_of_scope ─────→ END
//                                          ├─ verify ───────────→ END   (pause: user verifies)
//                                          └─ build_draft → approval ─→ END   (pause: human approval)
//
// Every user action re-enters at START, so the workflow always re-evaluates from the
// saved profile. That's what makes pause/resume lossless: the profile IS the state.
// The graph only orchestrates; all decisions come from the deterministic engine.
import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import { TAX_YEAR } from "../finance/tax2025";
import { analyze, applyEvent, emptyProfile, type Analysis } from "./engine";
import type { FilingEvent, FilingProfile, SourceRef } from "./types";

export type DraftLine = { label: string; amount: number; sources: SourceRef[]; rule?: { label: string; url: string } };
export type DraftReturn = { taxYear: number; lines: DraftLine[]; refund: number; status: "awaiting_approval" | "approved" };

export type WorkflowStatus = "ask_user" | "await_documents" | "out_of_scope" | "verify" | "awaiting_approval" | "approved";

const FilingState = Annotation.Root({
  profile: Annotation<FilingProfile>(),
  event: Annotation<FilingEvent | null>(),
  analysis: Annotation<Analysis | null>(),
  draft: Annotation<DraftReturn | null>(),
  status: Annotation<WorkflowStatus | null>(),
  trace: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

type S = typeof FilingState.State;

const RULES = {
  std: { label: "IRS: 2025 standard deduction (One, Big, Beautiful Bill provisions)", url: "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions" },
  table: { label: "IRS: Form 1040 instructions (Tax Table)", url: "https://www.irs.gov/instructions/i1040gi" },
  dep: { label: "IRS Publication 501", url: "https://www.irs.gov/publications/p501" },
};

function saveAnswer(s: S): Partial<S> {
  if (!s.event) return { trace: ["save_answer:none"] };
  return { profile: applyEvent(s.profile, s.event), event: null, trace: [`save_answer:${s.event.type}`] };
}

function runAnalysis(s: S): Partial<S> {
  return { analysis: analyze(s.profile), trace: ["analyze"] };
}

function route(s: S): "ask_user" | "await_documents" | "out_of_scope" | "verify" | "build_draft" {
  const a = s.analysis!;
  switch (a.phase) {
    case "basics":
    case "questions":
      return "ask_user";
    case "documents":
    case "confirm":
      return "await_documents";
    case "unsupported":
      return "out_of_scope";
    case "verify":
      return "verify";
    default:
      return "build_draft";
  }
}

function buildDraft(s: S): Partial<S> {
  const a = s.analysis!;
  if (!a.calc || !a.facts || !a.calcValid) return { draft: null, status: "verify", trace: ["draft:blocked"] };
  const c = a.calc;
  const depAnswer: SourceRef = { kind: "answer", questionId: "dependent.claimable", label: "Your answer: can someone claim you as a dependent" };
  const lines: DraftLine[] = [
    { label: "Wages (W-2 box 1)", amount: c.grossIncome, sources: a.facts.wages.sources },
    { label: "Standard deduction (single)", amount: c.standardDeduction, sources: [depAnswer], rule: RULES.std },
    { label: "Taxable income", amount: c.taxableIncome, sources: [] },
    { label: `Tax (${c.method})`, amount: c.tax, sources: [], rule: RULES.table },
    { label: "Federal tax withheld (W-2 box 2)", amount: c.withholding, sources: a.facts.withheld.sources },
  ];
  return {
    draft: { taxYear: TAX_YEAR, lines, refund: c.refund, status: s.profile.approvedAt ? "approved" : "awaiting_approval" },
    trace: ["draft"],
  };
}

function approvalCheckpoint(s: S): Partial<S> {
  return { status: s.profile.approvedAt ? "approved" : "awaiting_approval", trace: ["approval_checkpoint"] };
}

const pause = (status: WorkflowStatus) => (): Partial<S> => ({ status, trace: [status] });

export const filingGraph = new StateGraph(FilingState)
  .addNode("save_answer", saveAnswer)
  .addNode("analyze", runAnalysis)
  .addNode("ask_user", pause("ask_user"))
  .addNode("await_documents", pause("await_documents"))
  .addNode("out_of_scope", pause("out_of_scope"))
  .addNode("verify", pause("verify"))
  .addNode("build_draft", buildDraft)
  .addNode("approval", approvalCheckpoint)
  .addEdge(START, "save_answer")
  .addEdge("save_answer", "analyze")
  .addConditionalEdges("analyze", route, ["ask_user", "await_documents", "out_of_scope", "verify", "build_draft"])
  .addEdge("ask_user", END)
  .addEdge("await_documents", END)
  .addEdge("out_of_scope", END)
  .addEdge("verify", END)
  .addEdge("build_draft", "approval")
  .addEdge("approval", END)
  .compile();

export type StepResult = { profile: FilingProfile; analysis: Analysis; draft: DraftReturn | null; status: WorkflowStatus; trace: string[] };

/** Run one step: apply an event (or none, to resume) and re-evaluate. */
export async function step(profile: FilingProfile | null, event: FilingEvent | null = null): Promise<StepResult> {
  const out = await filingGraph.invoke({ profile: profile ?? emptyProfile(), event, analysis: null, draft: null, status: null, trace: [] });
  return { profile: out.profile, analysis: out.analysis!, draft: out.draft ?? null, status: out.status!, trace: out.trace };
}
