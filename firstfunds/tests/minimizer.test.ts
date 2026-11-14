import { test } from "node:test";
import assert from "node:assert/strict";
import { step, type StepResult } from "../src/lib/minimizer/graph";
import { setKey } from "../src/lib/minimizer/registry";
import { SAMPLES } from "../src/lib/minimizer/samples";
import type { FilingEvent, FilingProfile, TaxDocument } from "../src/lib/minimizer/types";

const sample = (key: string) => SAMPLES.find((s) => s.key === key)!.build();

async function run(events: FilingEvent[], start: FilingProfile | null = null): Promise<StepResult> {
  let r = await step(start, null);
  for (const e of events) r = await step(r.profile, e);
  return r;
}

const basics: FilingEvent[] = [
  { type: "answer", questionId: "basics.taxYear", value: "2025" },
  { type: "answer", questionId: "basics.income", value: ["w2"] },
  { type: "answer", questionId: "basics.docsReady", value: "yes" },
];

const add = (doc: TaxDocument): FilingEvent => ({ type: "addDocument", doc });
const confirmAll = (r: StepResult): FilingEvent[] =>
  r.profile.documents.filter((d) => !d.excluded && !d.confirmed).map((d) => ({ type: "confirmDocument", docId: d.id }));

/** Answer whatever the engine asks with the given answers map; returns asked ids. */
async function answerLoop(r: StepResult, answers: Record<string, string>, limit = 15) {
  const asked: string[] = [];
  while (r.status === "ask_user" && limit--) {
    const q = r.analysis.next!;
    asked.push(q.id);
    const key = Object.keys(answers).find((k) => q.id.startsWith(k));
    assert.ok(key, `unexpected question: ${q.id}`);
    r = await step(r.profile, { type: "answer", questionId: q.id, value: answers[key] });
  }
  return { r, asked };
}

const SIMPLE = { "household.married": "no", "dependent.claimable": "no", "household.supportsSomeone": "no", "employers.complete": "yes", "income.tipsOvertime": "no" };

test("starts with only 2–3 basic questions, one at a time", async () => {
  const r = await run([]);
  assert.equal(r.status, "ask_user");
  assert.equal(r.analysis.next!.id, "basics.taxYear");
  assert.equal(r.analysis.questions.filter((q) => q.stage === "basics").length, 3);
  assert.equal(r.analysis.questions.filter((q) => q.stage === "followup").length, 0);
  const r2 = await run(basics);
  assert.equal(r2.status, "await_documents");
  assert.equal(r2.analysis.phase, "documents");
});

test("1. one W-2, simple supported return", async () => {
  let r = await run([...basics, add(sample("maya")), { type: "uploadsDone", done: true }]);
  assert.equal(r.analysis.phase, "confirm"); // values shown for confirmation, not re-typed
  r = await run(confirmAll(r), r.profile);
  const { r: done, asked } = await answerLoop(r, SIMPLE);
  // Never asks for wages or withholding — they came from the W-2.
  assert.ok(!asked.some((id) => /wage|withholding/.test(id)));
  assert.deepEqual(asked.slice(0, 2), ["household.married", "dependent.claimable"]); // legal first
  assert.equal(done.analysis.phase, "verify");
  assert.equal(done.analysis.readyForReview, true);
  assert.equal(done.analysis.calc!.tax, 2867);
  assert.equal(done.analysis.calc!.refund, 383);
  // Every figure is traceable to its document box.
  assert.equal(done.analysis.facts!.wages.sources[0].kind, "document");
  // Calculation only after verification, then human approval.
  let v = await step(done.profile, { type: "verify", verified: true });
  assert.equal(v.status, "awaiting_approval");
  assert.equal(v.draft!.lines[0].amount, 41600);
  v = await step(v.profile, { type: "approve" });
  assert.equal(v.status, "approved");
});

test("2. two W-2s from different employers", async () => {
  let r = await run([...basics, add(sample("maya")), add(sample("cafe")), { type: "uploadsDone", done: true }]);
  r = await run(confirmAll(r), r.profile);
  const { r: done, asked } = await answerLoop(r, SIMPLE);
  const emp = asked.find((id) => id.startsWith("employers.complete"))!;
  assert.ok(emp);
  const q = await step(r.profile); // re-check the wording mentions both employers
  const empQ = q.analysis.questions.find((x) => x.id === emp)!;
  assert.match(empQ.text, /2 employers: Brightline Media and Campus Café/);
  assert.equal(done.analysis.calc!.grossIncome, 47800);
  assert.equal(done.analysis.facts!.withheld.value, 3560);
  assert.equal(done.analysis.facts!.wages.sources.length, 2);
  assert.equal(done.analysis.readyForReview, true);
});

test("2b. 'I have another W-2' sends the user back to upload, then re-asks", async () => {
  let r = await run([...basics, add(sample("maya")), { type: "uploadsDone", done: true }]);
  r = await run(confirmAll(r), r.profile);
  const { r: mid } = await answerLoop(r, { ...SIMPLE, "employers.complete": "more" }, 6);
  assert.equal(mid.analysis.phase, "documents");
  let r2 = await run([add(sample("cafe")), { type: "uploadsDone", done: true }], mid.profile);
  r2 = await run(confirmAll(r2), r2.profile);
  assert.ok(r2.analysis.next!.id.startsWith("employers.complete."));
  assert.match(r2.analysis.next!.text, /2 employers/);
});

test("3. duplicate W-2 upload is set aside automatically, no question", async () => {
  const doc = sample("maya");
  const dup = { ...doc, id: "dup1" };
  let r = await run([...basics, add(doc), add(dup), { type: "uploadsDone", done: true }]);
  assert.equal(r.profile.documents.find((d) => d.id === "dup1")!.excluded!.reason, "duplicate");
  assert.ok(r.analysis.notices.some((n) => /didn't count it twice/.test(n)));
  r = await run(confirmAll(r), r.profile);
  const { r: done } = await answerLoop(r, SIMPLE);
  assert.equal(done.analysis.calc!.grossIncome, 41600); // counted once
});

test("4. missing withholding is asked, never guessed", async () => {
  let r = await run([...basics, add(sample("pool")), { type: "uploadsDone", done: true }]);
  r = await run(confirmAll(r), r.profile);
  const { r: done, asked } = await answerLoop(r, { ...SIMPLE, "doc.withholding": "120" });
  assert.ok(asked.some((id) => id.startsWith("doc.withholding.")));
  assert.equal(done.analysis.facts!.withheld.value, 120);
  assert.equal(done.analysis.facts!.withheld.sources[0].kind, "answer");
  assert.equal(done.analysis.readyForReview, true);
});

test("5. uncertain dependent status blocks readiness", async () => {
  let r = await run([...basics, add(sample("maya")), { type: "uploadsDone", done: true }]);
  r = await run(confirmAll(r), r.profile);
  const { r: done } = await answerLoop(r, { ...SIMPLE, "dependent.claimable": "not_sure" });
  assert.equal(done.analysis.phase, "verify");
  assert.equal(done.analysis.readyForReview, false);
  assert.ok(done.analysis.blockers.some((b) => /weren't sure.*dependent/.test(b)));
  // Can't approve a draft that isn't ready.
  const v = await step(done.profile, { type: "verify", verified: true });
  assert.notEqual(v.status, "awaiting_approval");
});

test("6. self-employment income is out of scope (no W-2-only calculation)", async () => {
  const r = await run([
    { type: "answer", questionId: "basics.taxYear", value: "2025" },
    { type: "answer", questionId: "basics.income", value: ["w2", "gig"] },
    { type: "answer", questionId: "basics.docsReady", value: "yes" },
  ]);
  assert.equal(r.status, "out_of_scope");
  assert.ok(r.analysis.scope.reasons.some((x) => x.id === "gig"));
  assert.equal(r.analysis.readyForReview, false);
  // Undisclosed 1099-NEC found in documents → asks, then goes out of scope.
  let r2 = await run([...basics, add(sample("maya")), add(sample("nec")), { type: "uploadsDone", done: true }]);
  r2 = await run(confirmAll(r2), r2.profile);
  const { r: done, asked } = await answerLoop(r2, { ...SIMPLE, "doc.nec": "yes" });
  assert.ok(asked.some((id) => id.startsWith("doc.nec.")));
  assert.equal(done.status, "out_of_scope");
  assert.equal(done.draft, null);
});

test("7. conflicting documents must be resolved", async () => {
  const a = sample("maya");
  const b = sample("corrected");
  let r = await run([...basics, add(a), add(b), { type: "uploadsDone", done: true }]);
  r = await run(confirmAll(r), r.profile);
  // Conflict asked before lower-priority questions like employers/tips.
  const order = r.analysis.questions.filter((q) => q.status === "unanswered").map((q) => q.id);
  assert.ok(order.includes(`doc.conflict.${setKey([a, b])}`));
  const { r: done, asked } = await answerLoop(r, { ...SIMPLE, "doc.conflict": b.id });
  assert.ok(asked.indexOf(`doc.conflict.${setKey([a, b])}`) < asked.findIndex((x) => x.startsWith("employers.complete")));
  assert.equal(done.analysis.calc!.grossIncome, 42100);
  assert.ok(done.analysis.notices.some((n) => /isn't counted/.test(n)));
});

test("8. skipping a required question never invents an answer", async () => {
  let r = await run([...basics, add(sample("maya")), { type: "uploadsDone", done: true }]);
  r = await run(confirmAll(r), r.profile);
  r = await step(r.profile, { type: "answer", questionId: "household.married", value: "no" });
  assert.equal(r.analysis.next!.id, "dependent.claimable");
  r = await step(r.profile, { type: "skip", questionId: "dependent.claimable" });
  assert.notEqual(r.analysis.next!.id, "dependent.claimable"); // moves on
  assert.equal(r.profile.answers["dependent.claimable"], undefined);
  // After everything else, the skipped question comes back.
  const { r: end, asked } = await answerLoop(r, { ...SIMPLE, "dependent.claimable": "no" });
  assert.equal(asked[asked.length - 1], "dependent.claimable");
  assert.equal(end.analysis.readyForReview, true);
});

test("9. changing a confirmed answer re-evaluates and revokes approval", async () => {
  let r = await run([...basics, add(sample("maya")), { type: "uploadsDone", done: true }]);
  r = await run(confirmAll(r), r.profile);
  ({ r } = await answerLoop(r, SIMPLE));
  r = await run([{ type: "verify", verified: true }, { type: "approve" }], r.profile);
  assert.equal(r.status, "approved");
  // Change: someone CAN claim me → still in scope, recalculated, approval revoked.
  r = await step(r.profile, { type: "answer", questionId: "dependent.claimable", value: "yes" });
  assert.equal(r.profile.approvedAt, null);
  assert.equal(r.analysis.phase, "verify");
  assert.equal(r.analysis.calc!.standardDeduction, 15750); // earned income + $450 > cap
  // Change: married → out of scope.
  r = await step(r.profile, { type: "answer", questionId: "household.married", value: "yes" });
  assert.equal(r.status, "out_of_scope");
});

test("wrong tax year document is set aside and explained", async () => {
  const r = await run([...basics, add(sample("old")), { type: "uploadsDone", done: true }]);
  assert.equal(r.profile.documents[0].excluded!.reason, "wrong-year");
  assert.ok(r.analysis.blockers.some((b) => /at least one 2025 W-2/.test(b)));
});

test("corrected numbers keep their source as 'you corrected'", async () => {
  let r = await run([...basics, add(sample("maya")), { type: "uploadsDone", done: true }]);
  const id = r.profile.documents[0].id;
  r = await step(r.profile, { type: "confirmDocument", docId: id, fields: { federalWithheld: 3300 } });
  const s = r.analysis.facts!.withheld.sources[0];
  assert.equal(s.kind === "document" && s.userCorrected, true);
});

test("resume: a saved profile picks up exactly where it left off", async () => {
  const r = await run([...basics, add(sample("maya")), { type: "uploadsDone", done: true }]);
  const saved = JSON.parse(JSON.stringify(r.profile));
  const resumed = await step(saved);
  assert.equal(resumed.analysis.phase, r.analysis.phase);
  assert.equal(resumed.profile.documents.length, 1);
});
