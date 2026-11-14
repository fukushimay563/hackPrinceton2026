// Shared types for the AI Question Minimizer.
// Rule of the module: Gemini may READ documents and EXPLAIN questions, but every
// requirement, validation and number below is decided by deterministic code.

export type DocKind = "W-2" | "1099-NEC" | "unknown";
export type DocOrigin = "sample" | "manual" | "upload";

/** Box values we use. null = the box was blank / not found. */
export type DocFields = {
  wages?: number | null; // W-2 box 1
  federalWithheld?: number | null; // W-2 box 2 / 1099 box 4
  ssWages?: number | null; // box 3
  ssWithheld?: number | null; // box 4
  medicareWages?: number | null; // box 5
  medicareWithheld?: number | null; // box 6
  nonemployeeComp?: number | null; // 1099-NEC box 1
};

export type TaxDocument = {
  id: string;
  kind: DocKind;
  label: string; // what the user sees, e.g. "W-2 · Brightline Media"
  payer: string; // employer / payer name (not sensitive)
  payerIdLast4: string | null; // last 4 of EIN only — never the full number
  taxYear: number | null;
  fields: DocFields;
  origin: DocOrigin;
  /** User confirmed the values shown (possibly after correcting them). */
  confirmed: boolean;
  /** Fields the user corrected by hand, so the source shows "you entered". */
  correctedFields: (keyof DocFields)[];
  /** Excluded from the return (duplicate, wrong year, not the user's, superseded). */
  excluded: null | { reason: "duplicate" | "wrong-year" | "not-mine" | "superseded" };
  addedAt: number;
};

export type AnswerValue = string | string[] | number;

export type Answer = { value: AnswerValue; at: number };

/** Everything the user has told us or given us. This is what gets saved/resumed. */
export type FilingProfile = {
  version: 1;
  answers: Record<string, Answer>;
  skipped: string[]; // question ids skipped "for now"
  documents: TaxDocument[];
  uploadsDone: boolean;
  /** The user reviewed the verified numbers and asked for the calculation. */
  verified: boolean;
  /** Human approval of the draft. Reset automatically when anything changes. */
  approvedAt: number | null;
  /** Bumps on every change, so stale approvals can be detected. */
  revision: number;
  /** When this copy was last saved (ms). Used to pick the newer of tab vs. account copies. */
  savedAt?: number;
};

export type SourceRef =
  | { kind: "document"; docId: string; docLabel: string; box: string; userCorrected: boolean }
  | { kind: "answer"; questionId: string; label: string };

export type SourcedNumber = { value: number; sources: SourceRef[] };

export type Severity = "blocker" | "notice";

export type Issue = {
  id: string;
  severity: Severity;
  /** Plain-language message for the user. */
  message: string;
  docId?: string;
};

export type ScopeReason = { id: string; title: string; detail: string; link?: { label: string; url: string } };

export type Phase = "basics" | "documents" | "confirm" | "questions" | "verify" | "estimate" | "approved" | "unsupported";

/** Events the UI sends into the workflow. */
export type FilingEvent =
  | { type: "answer"; questionId: string; value: AnswerValue }
  | { type: "skip"; questionId: string }
  | { type: "addDocument"; doc: TaxDocument }
  | { type: "removeDocument"; docId: string }
  | { type: "confirmDocument"; docId: string; fields?: DocFields }
  | { type: "restoreDocument"; docId: string }
  | { type: "uploadsDone"; done: boolean }
  | { type: "verify"; verified: boolean }
  | { type: "approve" }
  | { type: "reset" };
