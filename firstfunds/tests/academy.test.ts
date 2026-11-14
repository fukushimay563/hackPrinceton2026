import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_LESSONS, MODULES } from "../src/lib/academy/lessons";
import { mergeProgress, stats } from "../src/lib/academy/progress";
import { BRACKETS, STANDARD_DEDUCTION, bracketTax } from "../src/lib/finance/tax2025";
import { SS_WAGE_BASE_2025 } from "../src/lib/minimizer/documents";

const allText = (id: string) => {
  const l = ALL_LESSONS.find((x) => x.id === id)!;
  return [l.summary, ...l.cards.map((c) => c.body), ...l.quiz.flatMap((q) => [q.q, ...q.options, q.explain])].join(" ");
};
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

test("every lesson is well-formed and cites an official source", () => {
  const ids = new Set<string>();
  for (const l of ALL_LESSONS) {
    assert.ok(!ids.has(l.id), `duplicate id ${l.id}`);
    ids.add(l.id);
    assert.ok(l.cards.length >= 3, `${l.id} needs at least 3 cards`);
    assert.ok(l.quiz.length >= 2, `${l.id} needs at least 2 questions`);
    for (const q of l.quiz) {
      assert.ok(q.correct >= 0 && q.correct < q.options.length, `${l.id}: bad answer index`);
      assert.equal(new Set(q.options).size, q.options.length, `${l.id}: duplicate options`);
    }
    assert.ok(l.sources.length > 0);
    for (const s of l.sources) assert.match(s.url, /^https:\/\/www\.irs\.gov\//, `${l.id}: non-IRS source ${s.url}`);
  }
  assert.equal(ALL_LESSONS.length, 10);
  assert.equal(MODULES.length, 3);
});

test("lesson amounts match the tax engine", () => {
  const std = allText("standard-deduction");
  assert.ok(std.includes(money(STANDARD_DEDUCTION.single)));
  assert.ok(std.includes(money(STANDARD_DEDUCTION.mfj)));
  assert.ok(std.includes(money(STANDARD_DEDUCTION.hoh)));
  assert.ok(allText("filing-status").includes(money(STANDARD_DEDUCTION.single)));
  const br = allText("brackets");
  for (const b of BRACKETS.single.slice(0, 3)) assert.ok(br.includes(money(b.upTo)), `missing ${b.upTo}`);
  assert.ok(allText("fica").includes(money(SS_WAGE_BASE_2025)));
});

test("quiz arithmetic is correct", () => {
  // "$30,000 − $15,750 = $14,250"
  assert.equal(30000 - STANDARD_DEDUCTION.single, 14250);
  // $50,000 taxable is in the 22% bracket
  const slices = bracketTax(50000, "single").slices;
  assert.equal(slices[slices.length - 1].rate, 0.22);
  // 7.65% of $1,000
  assert.equal(Math.round(1000 * 0.0765 * 100) / 100, 76.5);
  // $3,250 − $2,900
  assert.equal(3250 - 2900, 350);
});

test("progress merge keeps the best score and stats award badges", () => {
  const a = { completed: { w2: { score: 2, total: 3, at: 1 } } };
  const b = { completed: { w2: { score: 3, total: 3, at: 2 }, fica: { score: 2, total: 2, at: 3 } } };
  const m = mergeProgress(a, b);
  assert.equal(m.completed.w2.score, 3);
  let s = stats(m);
  assert.equal(s.done, 2);
  assert.equal(s.xp, 20);
  assert.deepEqual(s.badges, []);
  m.completed.withholding = { score: 3, total: 3, at: 4 };
  s = stats(m);
  assert.deepEqual(s.badges, ["Paycheck Pro"]);
  assert.equal(s.next!.id, "filing-status");
});
