// First-paycheck breakdown. Educational estimate — actual withholding depends on
// the employee's Form W-4 and IRS Publication 15-T.
import { bracketTax, STANDARD_DEDUCTION, type FilingStatus } from "./tax2025";
import {
  calculateCrossBorderTax,
  type TaxLocation,
  type CrossBorderTaxResult,
} from "./localTax";

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
  stateTaxRatePct: number; // combined state, county, and city rate
  hometown?: string; // residence hometown, e.g. "Trenton, NJ"
  workHometown?: string; // workplace hometown if different, e.g. "New York, NY"
  isDifferentWorkLocation?: boolean; // true if commuter/works in different place
  location?: TaxLocation;
  crossBorder?: CrossBorderTaxResult;
  isManualOverride?: boolean;
};

// FICA (employee share)
export const SOCIAL_SECURITY_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;

export type PaycheckResult = {
  gross: number;
  federal: number;
  socialSecurity: number;
  medicare: number;
  state: number; // total state + local (kept for backward compatibility)
  stateTax: number;
  countyTax: number;
  cityTax: number;
  net: number;
  annualGross: number;
  annualNet: number;
  location: TaxLocation;
  crossBorder: CrossBorderTaxResult;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computePaycheck(p: PaycheckInputs): PaycheckResult {
  const periods = PERIODS[p.frequency];
  const annual = p.grossPerPeriod * periods;
  const annualFederal = bracketTax(Math.max(0, annual - STANDARD_DEDUCTION[p.filingStatus]), p.filingStatus).tax;
  const federal = r2(annualFederal / periods);
  const socialSecurity = r2(p.grossPerPeriod * SOCIAL_SECURITY_RATE);
  const medicare = r2(p.grossPerPeriod * MEDICARE_RATE);

  // Dynamically compute cross-border tax taking both residence and workplace into account
  const residenceQuery = p.hometown || p.location?.hometown || "Trenton, NJ";
  const workQuery = p.isDifferentWorkLocation && p.workHometown ? p.workHometown : residenceQuery;

  const crossBorder = calculateCrossBorderTax({
    residenceHometown: residenceQuery,
    workHometown: workQuery,
    annualGross: annual,
    filingStatus: p.filingStatus,
  });

  // If user explicitly activated the custom rate override slider, honor manual rate
  const effectiveTotalRate = p.isManualOverride
    ? p.stateTaxRatePct
    : crossBorder.totalRatePct;

  const stateTax = r2((p.grossPerPeriod * crossBorder.effectiveStateRatePct) / 100);
  const countyTax = r2((p.grossPerPeriod * crossBorder.effectiveCountyRatePct) / 100);
  const cityTax = r2((p.grossPerPeriod * crossBorder.effectiveCityRatePct) / 100);
  const state = r2((p.grossPerPeriod * effectiveTotalRate) / 100);
  const net = r2(p.grossPerPeriod - federal - socialSecurity - medicare - state);

  return {
    gross: p.grossPerPeriod,
    federal,
    socialSecurity,
    medicare,
    state,
    stateTax,
    countyTax,
    cityTax,
    net,
    annualGross: r2(annual),
    annualNet: r2(net * periods),
    location: crossBorder.residence,
    crossBorder,
  };
}
