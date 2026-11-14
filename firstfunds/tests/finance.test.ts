import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTax, taxTableMidpoint, bracketTax } from "../src/lib/finance/tax2025";
import { simulate, minimumPayment, DEFAULT_MIN_RULE, utilization } from "../src/lib/finance/credit";
import { computePaycheck } from "../src/lib/finance/paycheck";
import { MAYA_CARD, MAYA_TAX, MAYA_PAYCHECK } from "../src/lib/demo/maya";

test("Tax Table midpoints", () => {
  assert.equal(taxTableMidpoint(25850), 25875);
  assert.equal(taxTableMidpoint(3000), 3025);
  assert.equal(taxTableMidpoint(2999), 2987.5);
  assert.equal(taxTableMidpoint(4), 0);
  assert.equal(taxTableMidpoint(12), 10);
});

test("Maya 2025 return", () => {
  const r = computeTax(MAYA_TAX);
  assert.equal(r.standardDeduction, 15750);
  assert.equal(r.taxableIncome, 25850);
  // midpoint 25,875: 1,192.50 + 13,950*0.12 = 2,866.50 -> 2,867
  assert.equal(r.tax, 2867);
  assert.equal(r.refund, 3250 - 2867);
  assert.equal(r.marginalRate, 0.12);
  assert.equal(r.method, "Tax Table");
});

test("Bracket math matches published cumulative amounts", () => {
  // single: $5,578.50 at top of 12% bracket
  assert.equal(bracketTax(48475, "single").tax, 5578.5);
  // MFJ: $2,385 at top of 10%; $11,157 at top of 12%
  assert.equal(bracketTax(23850, "mfj").tax, 2385);
  assert.equal(bracketTax(96950, "mfj").tax, 11157);
  // single top-of-35%: $188,769.75
  assert.equal(Math.round(bracketTax(626350, "single").tax * 100) / 100, 188769.75);
});

test("Worksheet method at $100k+", () => {
  const r = computeTax({ ...MAYA_TAX, wages: 130000 });
  assert.equal(r.method, "Tax Computation Worksheet");
  assert.equal(r.taxableIncome, 114250);
  assert.equal(r.tax, Math.round(17651 + (114250 - 103350) * 0.24));
});

test("Dependent standard deduction", () => {
  const r = computeTax({ ...MAYA_TAX, wages: 5000, canBeClaimedAsDependent: true });
  assert.equal(r.standardDeduction, 5450);
  const r2 = computeTax({ ...MAYA_TAX, wages: 500, canBeClaimedAsDependent: true });
  assert.equal(r2.standardDeduction, 1350);
  const r3 = computeTax({ ...MAYA_TAX, wages: 40000, canBeClaimedAsDependent: true });
  assert.equal(r3.standardDeduction, 15750);
});

test("Minimum payment rule", () => {
  assert.equal(minimumPayment(600, 12.5, DEFAULT_MIN_RULE), 25);
  assert.equal(minimumPayment(5000, 104, DEFAULT_MIN_RULE), 154);
  assert.equal(minimumPayment(10, 0.2, DEFAULT_MIN_RULE), 10.2);
});

test("Maya card payoff", () => {
  const min = simulate(MAYA_CARD, "minimum");
  const fixed = simulate(MAYA_CARD, "fixed");
  assert.ok(min.paidOff && fixed.paidOff);
  assert.ok(min.months! > fixed.months!);
  assert.ok(min.totalInterest > fixed.totalInterest);
  assert.equal(min.firstMonthInterest, 12.5);
  console.log("min", min.months, min.totalInterest, "fixed", fixed.months, fixed.totalInterest);
  // conservation: paid = principal + interest
  assert.ok(Math.abs(fixed.totalPaid - (600 + fixed.totalInterest)) < 0.02);
  assert.equal(utilization(600, 1000), 60);
});

test("Growing debt detected", () => {
  const s = simulate({ ...MAYA_CARD, monthlyNewSpending: 200 }, "minimum");
  assert.equal(s.paidOff, false);
  assert.equal(s.growing, true);
});

test("Paycheck", () => {
  const p = computePaycheck(MAYA_PAYCHECK);
  assert.equal(p.socialSecurity, 99.2);
  assert.equal(p.medicare, 23.2);
  assert.equal(p.annualGross, 41600);
  console.log(p);
});

test("New spending is capped at the credit limit", () => {
  const s = simulate({ ...MAYA_CARD, monthlyNewSpending: 600 }, "fixed");
  assert.ok(s.schedule.every((r) => r.endBalance <= MAYA_CARD.creditLimit + 0.01));
  assert.ok(s.interest5yr > 0 && s.interest5yr < 2000);
});
