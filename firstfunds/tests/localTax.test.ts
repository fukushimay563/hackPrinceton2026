import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateHometownTax,
  parseHometownQuery,
  searchHometowns,
  calculateNycCityRate,
  calculateCrossBorderTax,
  hasStateReciprocity,
} from "../src/lib/finance/localTax";
import { computePaycheck } from "../src/lib/finance/paycheck";
import { MAYA_PAYCHECK } from "../src/lib/demo/maya";

test("parseHometownQuery parses various formats", () => {
  assert.deepEqual(parseHometownQuery("Philadelphia, PA"), {
    city: "Philadelphia",
    stateCode: "PA",
  });
  assert.deepEqual(parseHometownQuery("Austin, Texas"), {
    city: "Austin",
    stateCode: "TX",
  });
  assert.deepEqual(parseHometownQuery("Miami FL"), {
    city: "Miami",
    stateCode: "FL",
  });
  assert.deepEqual(parseHometownQuery("NJ"), {
    city: "New Jersey",
    stateCode: "NJ",
  });
});

test("Texas and Florida have 0% state, county, and city income tax", () => {
  const austin = calculateHometownTax({ hometown: "Austin, TX", annualGross: 50000 });
  assert.equal(austin.stateRatePct, 0);
  assert.equal(austin.countyRatePct, 0);
  assert.equal(austin.cityRatePct, 0);
  assert.equal(austin.totalRatePct, 0);

  const miami = calculateHometownTax({ hometown: "Miami, FL", annualGross: 60000 });
  assert.equal(miami.totalRatePct, 0);
});

test("Philadelphia calculates 3.07% PA state and 3.75% city wage tax for residents", () => {
  const philly = calculateHometownTax({ hometown: "Philadelphia, PA", annualGross: 50000 });
  assert.equal(philly.stateRatePct, 3.07);
  assert.equal(philly.countyRatePct, 0);
  assert.equal(philly.cityRatePct, 3.75);
  assert.equal(philly.totalRatePct, 6.82);
  assert.ok(philly.notes?.includes("3.75%"));
});

test("New York City city tax and state tax rates dynamically scale with income", () => {
  const nycLow = calculateHometownTax({ hometown: "New York, NY", annualGross: 20000 });
  const nycMed = calculateHometownTax({ hometown: "New York, NY", annualGross: 50000 });
  const nycHigh = calculateHometownTax({ hometown: "New York, NY", annualGross: 120000 });

  assert.ok(nycLow.cityRatePct < nycMed.cityRatePct, `Expected ${nycLow.cityRatePct} < ${nycMed.cityRatePct}`);
  assert.ok(nycMed.cityRatePct < nycHigh.cityRatePct, `Expected ${nycMed.cityRatePct} < ${nycHigh.cityRatePct}`);

  assert.ok(nycLow.stateRatePct < nycMed.stateRatePct, `Expected ${nycLow.stateRatePct} < ${nycMed.stateRatePct}`);
  assert.ok(nycMed.stateRatePct < nycHigh.stateRatePct, `Expected ${nycMed.stateRatePct} < ${nycHigh.stateRatePct}`);

  assert.ok(nycLow.totalRatePct < nycMed.totalRatePct);
  assert.ok(nycMed.totalRatePct < nycHigh.totalRatePct);
});

test("calculateNycCityRate returns accurate effective percentage across brackets", () => {
  const at15k = calculateNycCityRate(15000, "single");
  const at40k = calculateNycCityRate(40000, "single");
  const at90k = calculateNycCityRate(90000, "single");

  assert.ok(at15k >= 2.4 && at15k <= 2.6);
  assert.ok(at40k >= 3.2 && at40k <= 3.4);
  assert.ok(at90k >= 3.6 && at90k <= 3.8);
});

test("computePaycheck dynamically updates NYC city tax rate when gross pay changes", () => {
  const lowPaycheck = computePaycheck({
    grossPerPeriod: 800,
    frequency: "biweekly",
    filingStatus: "single",
    stateTaxRatePct: 0,
    hometown: "New York, NY",
  });

  const highPaycheck = computePaycheck({
    grossPerPeriod: 4000,
    frequency: "biweekly",
    filingStatus: "single",
    stateTaxRatePct: 0,
    hometown: "New York, NY",
  });

  assert.ok(
    lowPaycheck.location.cityRatePct < highPaycheck.location.cityRatePct,
    `Low income city tax (${lowPaycheck.location.cityRatePct}%) should be less than high income (${highPaycheck.location.cityRatePct}%)`
  );
  assert.ok(
    lowPaycheck.location.stateRatePct < highPaycheck.location.stateRatePct,
    `Low income state tax (${lowPaycheck.location.stateRatePct}%) should be less than high income (${highPaycheck.location.stateRatePct}%)`
  );
  assert.ok(lowPaycheck.location.totalRatePct < highPaycheck.location.totalRatePct);
});

// --- Cross-Border & Multi-State Commuter Tests ---

test("Cross-border: Live in NJ · Work in NYC applies NY state tax and 0% NYC commuter tax", () => {
  const cb = calculateCrossBorderTax({
    residenceHometown: "Trenton, NJ",
    workHometown: "New York, NY",
    annualGross: 41600,
  });

  assert.equal(cb.hasStateReciprocity, false);
  assert.equal(cb.isDifferentState, true);
  // NY state tax applies because work is in NY
  assert.ok(cb.effectiveStateRatePct > 4.0);
  // NYC resident tax does NOT apply to non-resident commuters (saves ~3.3%)
  assert.equal(cb.effectiveCityRatePct, 0);
  assert.ok(cb.cityTaxExplanation?.includes("not levy"));
  assert.equal(cb.totalRatePct, cb.effectiveStateRatePct);
});

test("Cross-border: Live in NJ · Work in Philadelphia applies PA-NJ reciprocity and 3.44% Philly non-resident wage tax", () => {
  const cb = calculateCrossBorderTax({
    residenceHometown: "Trenton, NJ",
    workHometown: "Philadelphia, PA",
    annualGross: 41600,
  });

  assert.equal(cb.hasStateReciprocity, true);
  assert.equal(cb.isDifferentState, true);
  // PA-NJ Reciprocity: 0% PA state tax, NJ state tax applies
  assert.equal(cb.workStateRatePct, 0);
  assert.equal(cb.effectiveStateRatePct, cb.residence.stateRatePct);
  // Philadelphia non-resident wage tax is 3.44%
  assert.equal(cb.effectiveCityRatePct, 3.44);
  assert.ok(cb.cityTaxExplanation?.includes("3.44%"));
  assert.equal(cb.totalRatePct, Math.round((cb.residence.stateRatePct + 3.44) * 100) / 100);
});

test("Cross-border: Live in WA (0%) · Work in Portland, OR taxes Oregon work state wages", () => {
  const cb = calculateCrossBorderTax({
    residenceHometown: "Vancouver, WA",
    workHometown: "Portland, OR",
    annualGross: 60000,
  });

  assert.equal(cb.hasStateReciprocity, false);
  assert.equal(cb.residence.stateRatePct, 0);
  // Oregon non-resident state tax applies
  assert.ok(cb.effectiveStateRatePct > 5.0);
  assert.equal(cb.effectiveStateRatePct, cb.work.stateRatePct);
});

test("Cross-border: Live in VA · Work in Washington, DC has DC commuter exemption", () => {
  assert.ok(hasStateReciprocity("VA", "DC"));
  const cb = calculateCrossBorderTax({
    residenceHometown: "Arlington, VA",
    workHometown: "Washington, DC",
    annualGross: 50000,
  });

  assert.equal(cb.hasStateReciprocity, true);
  assert.equal(cb.effectiveStateRatePct, cb.residence.stateRatePct);
});

test("computePaycheck with commuter toggle calculates multi-state deductions", () => {
  const p = computePaycheck({
    grossPerPeriod: 1600,
    frequency: "biweekly",
    filingStatus: "single",
    stateTaxRatePct: 0,
    hometown: "Trenton, NJ",
    workHometown: "New York, NY",
    isDifferentWorkLocation: true,
  });

  assert.ok(p.crossBorder);
  assert.equal(p.crossBorder.isDifferentState, true);
  assert.equal(p.cityTax, 0); // NYC non-resident commuter is $0
  assert.ok(p.stateTax > 0);  // NY state tax
});

test("Indianapolis calculates Indiana flat state tax and Marion County local tax", () => {
  const indy = calculateHometownTax({ hometown: "Indianapolis, IN", annualGross: 50000 });
  assert.equal(indy.stateRatePct, 3.0);
  assert.ok(indy.countyRatePct > 1.9 && indy.countyRatePct <= 2.02);
  assert.equal(indy.cityRatePct, 0);
  assert.ok(indy.totalRatePct >= 4.9);
});

test("Detroit calculates Michigan state tax and resident city income tax", () => {
  const detroit = calculateHometownTax({ hometown: "Detroit, MI", annualGross: 45000 });
  assert.equal(detroit.stateRatePct, 4.25);
  assert.equal(detroit.cityRatePct, 2.4);
  assert.equal(detroit.totalRatePct, 6.65);
});

test("Maya hometown Trenton, NJ preserves expected paycheck results", () => {
  const p = computePaycheck(MAYA_PAYCHECK);
  assert.equal(p.socialSecurity, 99.2);
  assert.equal(p.medicare, 23.2);
  assert.equal(p.state, 31.04);
  assert.equal(p.location.city, "Trenton");
  assert.equal(p.location.state, "NJ");
  assert.equal(p.annualGross, 41600);
});

test("searchHometowns finds matches accurately", () => {
  const phillyMatches = searchHometowns("phila");
  assert.ok(phillyMatches.length > 0);
  assert.equal(phillyMatches[0].city, "Philadelphia");

  const indyMatches = searchHometowns("indianapolis");
  assert.ok(indyMatches.length > 0);
  assert.equal(indyMatches[0].city, "Indianapolis");
});
