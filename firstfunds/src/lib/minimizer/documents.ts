// Document validation: structure, tax year, duplicates, internal consistency and
// cross-document conflicts. Pure functions — no AI involved.
import type { Issue, TaxDocument } from "./types";

export const SUPPORTED_TAX_YEAR = 2025;
/** 2025 Social Security wage base (SSA). Box 3 above this is an extraction or typing error. */
export const SS_WAGE_BASE_2025 = 176100;

const near = (a: number, b: number, tol = 1.01) => Math.abs(a - b) <= tol;

export function fingerprint(d: TaxDocument) {
  const f = d.fields;
  return [d.kind, d.taxYear, d.payerIdLast4 ?? d.payer.toLowerCase().trim(), f.wages ?? "", f.federalWithheld ?? "", f.nonemployeeComp ?? ""].join("|");
}

/** Same payer = same EIN last-4 when both have it, otherwise same normalized name. */
export function samePayer(a: TaxDocument, b: TaxDocument) {
  if (a.payerIdLast4 && b.payerIdLast4) return a.payerIdLast4 === b.payerIdLast4;
  return a.payer.toLowerCase().replace(/[^a-z0-9]/g, "") === b.payer.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const active = (docs: TaxDocument[]) => docs.filter((d) => !d.excluded);
export const activeW2s = (docs: TaxDocument[]) => active(docs).filter((d) => d.kind === "W-2");

/**
 * Applied when a document is added: exact duplicates and wrong-year documents are
 * set aside automatically (no question needed), and the user is told.
 */
export function classifyNewDocument(doc: TaxDocument, existing: TaxDocument[]): TaxDocument {
  const fp = fingerprint(doc);
  if (active(existing).some((e) => fingerprint(e) === fp)) return { ...doc, excluded: { reason: "duplicate" } };
  if (doc.taxYear !== null && doc.taxYear !== SUPPORTED_TAX_YEAR) return { ...doc, excluded: { reason: "wrong-year" } };
  return doc;
}

/** Field-level checks on one document. */
export function validateDocument(d: TaxDocument): Issue[] {
  const issues: Issue[] = [];
  const f = d.fields;
  const nonNeg = (v: number | null | undefined) => v === null || v === undefined || v >= 0;
  if (![f.wages, f.federalWithheld, f.ssWages, f.ssWithheld, f.medicareWages, f.medicareWithheld, f.nonemployeeComp].every(nonNeg)) {
    issues.push({ id: `neg:${d.id}`, severity: "blocker", docId: d.id, message: `${d.label} has a negative amount. Please check the numbers.` });
  }
  if (d.kind === "W-2") {
    if (f.wages === null || f.wages === undefined) {
      issues.push({ id: `nowages:${d.id}`, severity: "blocker", docId: d.id, message: `We couldn't find wages (box 1) on ${d.label}.` });
    }
    if (typeof f.wages === "number" && typeof f.federalWithheld === "number" && f.federalWithheld > f.wages) {
      issues.push({ id: `wh>wages:${d.id}`, severity: "blocker", docId: d.id, message: `On ${d.label}, tax withheld is more than wages. One of those numbers is probably off.` });
    }
    if (typeof f.ssWages === "number" && f.ssWages > SS_WAGE_BASE_2025) {
      issues.push({ id: `ssbase:${d.id}`, severity: "blocker", docId: d.id, message: `Social Security wages on ${d.label} are above the 2025 limit of $176,100. Please double-check box 3.` });
    }
    if (typeof f.ssWages === "number" && typeof f.ssWithheld === "number" && f.ssWages > 0 && !near(f.ssWithheld, f.ssWages * 0.062, Math.max(2, f.ssWages * 0.0005))) {
      issues.push({ id: `ssrate:${d.id}`, severity: "notice", docId: d.id, message: `Box 4 on ${d.label} isn't 6.2% of box 3. That's unusual. Worth a second look, though it doesn't change your income tax.` });
    }
    if (typeof f.medicareWages === "number" && typeof f.medicareWithheld === "number" && f.medicareWages > 0 && !near(f.medicareWithheld, f.medicareWages * 0.0145, Math.max(2, f.medicareWages * 0.0005))) {
      issues.push({ id: `mcrate:${d.id}`, severity: "notice", docId: d.id, message: `Box 6 on ${d.label} isn't 1.45% of box 5. Worth a second look.` });
    }
  }
  return issues;
}

/** Two active W-2s from the same employer with different amounts = needs a decision. */
export function findConflicts(docs: TaxDocument[]): { a: TaxDocument; b: TaxDocument }[] {
  const w2 = activeW2s(docs);
  const out: { a: TaxDocument; b: TaxDocument }[] = [];
  for (let i = 0; i < w2.length; i++)
    for (let j = i + 1; j < w2.length; j++)
      if (samePayer(w2[i], w2[j]) && fingerprint(w2[i]) !== fingerprint(w2[j])) out.push({ a: w2[i], b: w2[j] });
  return out;
}

export function exclusionMessage(d: TaxDocument): string | null {
  if (!d.excluded) return null;
  switch (d.excluded.reason) {
    case "duplicate":
      return `${d.label} looks identical to one you already added, so we didn't count it twice.`;
    case "wrong-year":
      return `${d.label} is for ${d.taxYear}, not ${SUPPORTED_TAX_YEAR}, so it's not part of this return.`;
    case "not-mine":
      return `You told us ${d.label} isn't yours, so it's not included.`;
    case "superseded":
      return `${d.label} was replaced by the version you chose.`;
  }
}
