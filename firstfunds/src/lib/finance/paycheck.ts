// First-paycheck breakdown. Educational estimate — actual withholding depends on
// the employee's Form W-4 and IRS Publication 15-T.
import { bracketTax, STANDARD_DEDUCTION, type FilingStatus } from "./tax2025";

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export const PERIODS: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export type PaycheckInputs = {
  grossPerPeriod: number;
  frequency: PayFrequency;
  filingStatus: FilingStatus;
  stateTaxRatePct: number; // simple flat estimate
};

// FICA (employee share)
export const SOCIAL_SECURITY_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;

export type PaycheckResult = {
  gross: number;
  federal: number;
  socialSecurity: number;
  medicare: number;
  state: number;
  net: number;
  annualGross: number;
  annualNet: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computePaycheck(p: PaycheckInputs): PaycheckResult {
  const periods = PERIODS[p.frequency];
  const annual = p.grossPerPeriod * periods;
  const annualFederal = bracketTax(Math.max(0, annual - STANDARD_DEDUCTION[p.filingStatus]), p.filingStatus).tax;
  const federal = r2(annualFederal / periods);
  const socialSecurity = r2(p.grossPerPeriod * SOCIAL_SECURITY_RATE);
  const medicare = r2(p.grossPerPeriod * MEDICARE_RATE);
  const state = r2((p.grossPerPeriod * p.stateTaxRatePct) / 100);
  const net = r2(p.grossPerPeriod - federal - socialSecurity - medicare - state);
  return {
    gross: p.grossPerPeriod,
    federal,
    socialSecurity,
    medicare,
    state,
    net,
    annualGross: r2(annual),
    annualNet: r2(net * periods),
  };
}
