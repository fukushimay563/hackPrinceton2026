// Fictional sample documents so judges can try every path without real data.
import type { DocFields, DocKind, TaxDocument } from "./types";

let counter = 0;
export function newDocId() {
  counter += 1;
  return `doc_${Date.now().toString(36)}_${counter}`;
}

export function makeDocument(input: {
  kind: DocKind;
  payer: string;
  payerIdLast4?: string | null;
  taxYear: number | null;
  fields: DocFields;
  origin: TaxDocument["origin"];
  label?: string;
}): TaxDocument {
  return {
    id: newDocId(),
    kind: input.kind,
    label: input.label ?? `${input.kind} · ${input.payer}`,
    payer: input.payer,
    payerIdLast4: input.payerIdLast4 ?? null,
    taxYear: input.taxYear,
    fields: input.fields,
    origin: input.origin,
    confirmed: false,
    correctedFields: [],
    excluded: null,
    addedAt: Date.now(),
  };
}

export type Sample = { key: string; title: string; note: string; build: () => TaxDocument };

const w2 = (wages: number, withheld: number | null) => ({
  wages,
  federalWithheld: withheld,
  ssWages: wages,
  ssWithheld: Math.round(wages * 0.062 * 100) / 100,
  medicareWages: wages,
  medicareWithheld: Math.round(wages * 0.0145 * 100) / 100,
});

export const SAMPLES: Sample[] = [
  {
    key: "maya",
    title: "W-2 · Brightline Media",
    note: "Maya's main job",
    build: () => makeDocument({ kind: "W-2", payer: "Brightline Media", payerIdLast4: "4821", taxYear: 2025, fields: w2(41600, 3250), origin: "sample" }),
  },
  {
    key: "cafe",
    title: "W-2 · Campus Café",
    note: "A second employer",
    build: () => makeDocument({ kind: "W-2", payer: "Campus Café", payerIdLast4: "1177", taxYear: 2025, fields: w2(6200, 310), origin: "sample" }),
  },
  {
    key: "pool",
    title: "W-2 · Riverside Pool",
    note: "Box 2 is blank",
    build: () => makeDocument({ kind: "W-2", payer: "Riverside Pool", payerIdLast4: "9034", taxYear: 2025, fields: w2(2400, null), origin: "sample" }),
  },
  {
    key: "corrected",
    title: "W-2 · Brightline Media (corrected)",
    note: "Same employer, different wages",
    build: () =>
      makeDocument({ kind: "W-2", payer: "Brightline Media", payerIdLast4: "4821", taxYear: 2025, fields: w2(42100, 3310), origin: "sample", label: "W-2 · Brightline Media (corrected)" }),
  },
  {
    key: "nec",
    title: "1099-NEC · Pixel Studio",
    note: "Freelance income",
    build: () => makeDocument({ kind: "1099-NEC", payer: "Pixel Studio", payerIdLast4: "5560", taxYear: 2025, fields: { nonemployeeComp: 1800, federalWithheld: 0 }, origin: "sample" }),
  },
  {
    key: "old",
    title: "W-2 · Brightline Media (2024)",
    note: "Last year's form",
    build: () => makeDocument({ kind: "W-2", payer: "Brightline Media", payerIdLast4: "4821", taxYear: 2024, fields: w2(18300, 1400), origin: "sample", label: "W-2 · Brightline Media (2024)" }),
  },
];
