// Federal income tax estimate for TAX YEAR 2025 (returns filed in 2026).
// Scope: W-2 wage income only, standard deduction, no credits or other income.
//
// Sources (verify before changing any number):
// - Standard deduction (as amended by P.L. 119-21, the One, Big, Beautiful Bill Act):
//   IRS VITA guidance & IR-2025-103 — Single/MFS $15,750, MFJ/QSS $31,500, HoH $23,625.
// - Dependent standard deduction: greater of $1,350 or earned income + $450 (Rev. Proc. 2024-40).
// - Brackets: Rev. Proc. 2024-40 (unchanged by OBBBA for 2025).
// - Tax Table method: Form 1040 instructions — taxable income under $100,000 uses the
//   Tax Table, which taxes the midpoint of each $50 row ($25 below $3,000).

export const TAX_YEAR = 2025;

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

export const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  single: "Single",
  mfj: "Married filing jointly",
  mfs: "Married filing separately",
  hoh: "Head of household",
};

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 15750,
  mfs: 15750,
  mfj: 31500,
  hoh: 23625,
};

export const DEPENDENT_STD_FLOOR = 1350;
export const DEPENDENT_EARNED_ADD = 450;

type Bracket = { upTo: number; rate: number };

export const BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 11925, rate: 0.1 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  mfj: [
    { upTo: 23850, rate: 0.1 },
    { upTo: 96950, rate: 0.12 },
    { upTo: 206700, rate: 0.22 },
    { upTo: 394600, rate: 0.24 },
    { upTo: 501050, rate: 0.32 },
    { upTo: 751600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  mfs: [
    { upTo: 11925, rate: 0.1 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 375800, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  hoh: [
    { upTo: 17000, rate: 0.1 },
    { upTo: 64850, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250500, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

export type TaxInputs = {
  filingStatus: FilingStatus;
  wages: number; // W-2 box 1 (sum of all W-2s)
  federalWithheld: number; // W-2 box 2
  canBeClaimedAsDependent: boolean;
  // Situations we don't support — used only to raise flags.
  hasTipsOrOvertime: boolean;
  hasOtherIncome: boolean; // 1099, freelance, interest > small, etc.
  isStudent: boolean;
};

export type BracketSlice = { rate: number; from: number; to: number; tax: number };

export type TaxFlag = { level: "info" | "warn" | "stop"; message: string; link?: string };

export type TaxResult = {
  grossIncome: number;
  standardDeduction: number;
  taxableIncome: number;
  tax: number;
  method: "Tax Table" | "Tax Computation Worksheet";
  withholding: number;
  refund: number; // positive = refund, negative = amount owed
  marginalRate: number;
  effectiveRate: number; // tax / gross
  slices: BracketSlice[];
  flags: TaxFlag[];
  supported: boolean;
};

/** Exact bracket math on a taxable income. */
export function bracketTax(taxable: number, status: FilingStatus) {
  let remaining = Math.max(0, taxable);
  let lower = 0;
  let tax = 0;
  const slices: BracketSlice[] = [];
  for (const b of BRACKETS[status]) {
    if (remaining <= 0) break;
    const width = b.upTo - lower;
    const amount = Math.min(remaining, width);
    const t = amount * b.rate;
    slices.push({ rate: b.rate, from: lower, to: lower + amount, tax: t });
    tax += t;
    remaining -= amount;
    lower = b.upTo;
  }
  return { tax, slices };
}

/** Midpoint of the IRS Tax Table row that contains `taxable`. */
export function taxTableMidpoint(taxable: number) {
  if (taxable < 5) return 0; // first row ($0–$5) shows $0 tax
  if (taxable < 25) {
    const lo = 5 + Math.floor((taxable - 5) / 10) * 10;
    return lo + 5;
  }
  if (taxable < 3000) {
    const lo = 25 + Math.floor((taxable - 25) / 25) * 25;
    return lo + 12.5;
  }
  const lo = 3000 + Math.floor((taxable - 3000) / 50) * 50;
  return lo + 25;
}

export function standardDeductionFor(inputs: TaxInputs) {
  const base = STANDARD_DEDUCTION[inputs.filingStatus];
  if (!inputs.canBeClaimedAsDependent) return base;
  return Math.min(base, Math.max(DEPENDENT_STD_FLOOR, inputs.wages + DEPENDENT_EARNED_ADD));
}

export function computeTax(inputs: TaxInputs): TaxResult {
  const gross = Math.max(0, Math.round(inputs.wages));
  const stdDed = standardDeductionFor(inputs);
  const taxable = Math.max(0, gross - stdDed);

  let tax: number;
  let method: TaxResult["method"];
  if (taxable < 100000) {
    method = "Tax Table";
    tax = Math.round(bracketTax(taxTableMidpoint(taxable), inputs.filingStatus).tax);
  } else {
    method = "Tax Computation Worksheet";
    tax = Math.round(bracketTax(taxable, inputs.filingStatus).tax);
  }

  const { slices } = bracketTax(taxable, inputs.filingStatus);
  const marginalRate = slices.length ? slices[slices.length - 1].rate : 0.1;
  const withholding = Math.max(0, Math.round(inputs.federalWithheld));

  const flags: TaxFlag[] = [];
  let supported = true;

  if (inputs.hasOtherIncome) {
    supported = false;
    flags.push({
      level: "stop",
      message:
        "You have income besides W-2 wages (like 1099 or freelance work). That can mean self-employment tax and extra forms — this estimate doesn't cover it. Use IRS Free File or a tax professional.",
      link: "https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free",
    });
  }
  if (inputs.hasTipsOrOvertime) {
    flags.push({
      level: "warn",
      message:
        "Starting in 2025 there are new deductions for qualified tips and overtime pay. This estimate doesn't include them, so your real tax could be lower.",
      link: "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions",
    });
  }
  if (inputs.filingStatus === "hoh") {
    flags.push({
      level: "warn",
      message:
        "Head of household requires paying more than half the cost of keeping up a home for a qualifying person. Confirm eligibility in IRS Publication 501.",
      link: "https://www.irs.gov/publications/p501",
    });
  }
  if (inputs.filingStatus === "mfj" || inputs.filingStatus === "mfs") {
    flags.push({
      level: "info",
      message: "For married filers, enter combined W-2 wages and withholding for everyone on the return.",
    });
  }
  if (inputs.isStudent) {
    flags.push({
      level: "info",
      message:
        "Students may qualify for education credits (Form 8863), which aren't included here. If you paid tuition, check whether a parent claims you before you claim them.",
      link: "https://www.irs.gov/credits-deductions/individuals/education-credits-aotc-llc",
    });
  }
  if (inputs.canBeClaimedAsDependent) {
    flags.push({
      level: "info",
      message:
        "Because someone can claim you as a dependent, your standard deduction is the greater of $1,350 or your earned income + $450 (capped at the normal amount). You can't claim certain credits.",
      link: "https://www.irs.gov/publications/p501",
    });
  }
  if (gross > 0 && gross < 20000 && !inputs.canBeClaimedAsDependent) {
    flags.push({
      level: "info",
      message:
        "With lower income you might qualify for the Earned Income Tax Credit, which this estimate doesn't include. Check with the IRS EITC Assistant.",
      link: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc",
    });
  }
  if (withholding > gross) {
    flags.push({ level: "warn", message: "Withholding is higher than wages — double-check W-2 boxes 1 and 2." });
  }

  return {
    grossIncome: gross,
    standardDeduction: stdDed,
    taxableIncome: taxable,
    tax,
    method,
    withholding,
    refund: withholding - tax,
    marginalRate,
    effectiveRate: gross ? tax / gross : 0,
    slices,
    flags,
    supported,
  };
}
