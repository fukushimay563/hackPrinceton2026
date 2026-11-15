// Hometown tax engine: calculates state, county, and city / municipal income taxes
// for US locations, with dynamic dependency on gross annual income and filing status.
// First-time earners often do not realize that local income taxes (e.g. Philadelphia wage tax,
// NYC resident graduated tax, Ohio municipal taxes, Indiana county taxes, Maryland piggyback taxes)
// can take an additional 1% to 4% of their paycheck beyond state tax.

import type { FilingStatus } from "./tax2025";

export type TaxLocation = {
  hometown: string; // e.g. "New York, NY" or "Philadelphia, PA"
  city: string;
  state: string; // 2-letter uppercase, e.g. "NY"
  stateName: string;
  county?: string;
  stateRatePct: number;
  countyRatePct: number;
  cityRatePct: number;
  totalRatePct: number;
  notes?: string;
};

export type StateTaxRule = {
  name: string;
  type: "none" | "flat" | "progressive";
  flatRatePct?: number;
  // Estimate for standard deduction & progressive brackets for single filing
  calculateEffectivePct: (annualGross: number, status: FilingStatus) => number;
  notes?: string;
};

// 50 US States + DC state tax rules
export const STATE_TAX_RULES: Record<string, StateTaxRule> = {
  AL: {
    name: "Alabama",
    type: "progressive",
    calculateEffectivePct: (gross) => {
      if (gross <= 0) return 0;
      let tax = Math.min(gross, 3000) * 0.02;
      if (gross > 3000) tax += Math.min(gross - 3000, 3000) * 0.04;
      if (gross > 6000) tax += (gross - 6000) * 0.05;
      return Math.round((tax / gross) * 10000) / 100;
    },
    notes: "Graduated state tax from 2% to 5%",
  },
  AK: {
    name: "Alaska",
    type: "none",
    calculateEffectivePct: () => 0,
    notes: "No state wage income tax",
  },
  AZ: {
    name: "Arizona",
    type: "flat",
    flatRatePct: 2.5,
    calculateEffectivePct: () => 2.5,
    notes: "Flat 2.5% state income tax",
  },
  AR: {
    name: "Arkansas",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 10000 ? 2.0 : gross <= 30000 ? 3.4 : 4.4),
    notes: "Graduated state tax up to 4.4%",
  },
  CA: {
    name: "California",
    type: "progressive",
    calculateEffectivePct: (gross, status) => {
      const stdDed = status === "mfj" ? 11080 : 5540;
      const taxable = Math.max(0, gross - stdDed);
      if (taxable <= 0) return 0;
      let tax = 0;
      tax += Math.min(taxable, 10756) * 0.01;
      if (taxable > 10756) tax += Math.min(taxable - 10756, 14743) * 0.02;
      if (taxable > 25499) tax += Math.min(taxable - 25499, 14746) * 0.04;
      if (taxable > 40245) tax += Math.min(taxable - 40245, 15621) * 0.06;
      if (taxable > 55866) tax += Math.min(taxable - 55866, 14740) * 0.08;
      if (taxable > 70606) tax += (taxable - 70606) * 0.093;
      return Math.round((tax / gross) * 10000) / 100;
    },
    notes: "Progressive state tax: 1% to 9.3% (plus surtax above $1M)",
  },
  CO: {
    name: "Colorado",
    type: "flat",
    flatRatePct: 4.4,
    calculateEffectivePct: () => 4.4,
    notes: "Flat 4.40% state income tax",
  },
  CT: {
    name: "Connecticut",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 10000 ? 2.0 : gross <= 50000 ? 4.5 : 5.5),
    notes: "Graduated state tax from 2.0% to 6.99%",
  },
  DE: {
    name: "Delaware",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 15000 ? 2.2 : gross <= 40000 ? 4.2 : 5.5),
    notes: "Graduated state tax from 2.2% to 6.6%",
  },
  DC: {
    name: "District of Columbia",
    type: "progressive",
    calculateEffectivePct: (gross) => {
      const taxable = Math.max(0, gross - 14600);
      if (taxable <= 0) return 0;
      let tax = Math.min(taxable, 10000) * 0.04;
      if (taxable > 10000) tax += Math.min(taxable - 10000, 30000) * 0.06;
      if (taxable > 40000) tax += Math.min(taxable - 40000, 20000) * 0.065;
      if (taxable > 60000) tax += (taxable - 60000) * 0.085;
      return Math.round((tax / gross) * 10000) / 100;
    },
    notes: "Graduated DC income tax from 4.0% to 10.75%",
  },
  FL: {
    name: "Florida",
    type: "none",
    calculateEffectivePct: () => 0,
    notes: "No state wage income tax",
  },
  GA: {
    name: "Georgia",
    type: "flat",
    flatRatePct: 5.39,
    calculateEffectivePct: () => 5.39,
    notes: "Flat 5.39% state income tax",
  },
  HI: {
    name: "Hawaii",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 20000 ? 3.5 : gross <= 50000 ? 6.2 : 7.8),
    notes: "Graduated state tax from 1.4% to 11%",
  },
  ID: {
    name: "Idaho",
    type: "flat",
    flatRatePct: 5.695,
    calculateEffectivePct: () => 5.695,
    notes: "Flat 5.695% state income tax",
  },
  IL: {
    name: "Illinois",
    type: "flat",
    flatRatePct: 4.95,
    calculateEffectivePct: () => 4.95,
    notes: "Flat 4.95% state income tax",
  },
  IN: {
    name: "Indiana",
    type: "flat",
    flatRatePct: 3.0,
    calculateEffectivePct: () => 3.0,
    notes: "Flat 3.00% state income tax (all 92 counties also levy local county tax)",
  },
  IA: {
    name: "Iowa",
    type: "flat",
    flatRatePct: 3.8,
    calculateEffectivePct: () => 3.8,
    notes: "Flat 3.8% state income tax",
  },
  KS: {
    name: "Kansas",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 30000 ? 4.0 : 5.4),
    notes: "Graduated state tax up to 5.7%",
  },
  KY: {
    name: "Kentucky",
    type: "flat",
    flatRatePct: 4.0,
    calculateEffectivePct: () => 4.0,
    notes: "Flat 4.0% state income tax",
  },
  LA: {
    name: "Louisiana",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 25000 ? 2.5 : 3.8),
    notes: "Graduated state tax from 1.85% to 4.25%",
  },
  ME: {
    name: "Maine",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 30000 ? 5.8 : 6.75),
    notes: "Graduated state tax from 5.8% to 7.15%",
  },
  MD: {
    name: "Maryland",
    type: "progressive",
    calculateEffectivePct: (gross, status) => {
      const stdDed = status === "mfj" ? 5100 : 2550;
      const taxable = Math.max(0, gross - stdDed);
      if (taxable <= 0) return 0;
      let tax = 0;
      tax += Math.min(taxable, 1000) * 0.02;
      if (taxable > 1000) tax += Math.min(taxable - 1000, 1000) * 0.03;
      if (taxable > 2000) tax += Math.min(taxable - 2000, 1000) * 0.04;
      if (taxable > 3000) tax += (taxable - 3000) * 0.0475;
      return Math.round((tax / gross) * 10000) / 100;
    },
    notes: "State tax up to 4.75%–5.75% (plus mandatory county piggyback tax 2.25%–3.2%)",
  },
  MA: {
    name: "Massachusetts",
    type: "flat",
    flatRatePct: 5.0,
    calculateEffectivePct: () => 5.0,
    notes: "Flat 5.00% state income tax (plus 4% surtax above $1M)",
  },
  MI: {
    name: "Michigan",
    type: "flat",
    flatRatePct: 4.25,
    calculateEffectivePct: () => 4.25,
    notes: "Flat 4.25% state income tax (24 cities also levy city tax)",
  },
  MN: {
    name: "Minnesota",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 35000 ? 5.35 : gross <= 75000 ? 6.2 : 7.2),
    notes: "Graduated state tax from 5.35% to 9.85%",
  },
  MS: {
    name: "Mississippi",
    type: "flat",
    flatRatePct: 4.7,
    calculateEffectivePct: () => 4.7,
    notes: "Flat 4.70% state income tax",
  },
  MO: {
    name: "Missouri",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 20000 ? 3.0 : 4.4),
    notes: "Graduated state tax up to 4.8%",
  },
  MT: {
    name: "Montana",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 30000 ? 4.7 : 5.5),
    notes: "Graduated state tax 4.7% to 5.9%",
  },
  NE: {
    name: "Nebraska",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 35000 ? 3.5 : 4.8),
    notes: "Graduated state tax up to 5.2%",
  },
  NV: {
    name: "Nevada",
    type: "none",
    calculateEffectivePct: () => 0,
    notes: "No state wage income tax",
  },
  NH: {
    name: "New Hampshire",
    type: "none",
    calculateEffectivePct: () => 0,
    notes: "No state wage income tax (dividends & interest only)",
  },
  NJ: {
    name: "New Jersey",
    type: "progressive",
    calculateEffectivePct: (gross) => {
      // NJ progressive: 1.4% up to $20k, 1.75% $20k-$35k, 3.5% $35k-$40k, 5.525% $40k-$75k
      if (gross <= 0) return 0;
      let tax = 0;
      tax += Math.min(gross, 20000) * 0.014;
      if (gross > 20000) tax += Math.min(gross - 20000, 15000) * 0.0175;
      if (gross > 35000) tax += Math.min(gross - 35000, 5000) * 0.035;
      if (gross > 40000) tax += Math.min(gross - 40000, 35000) * 0.05525;
      if (gross > 75000) tax += (gross - 75000) * 0.0637;
      return Math.round((tax / gross) * 10000) / 100;
    },
    notes: "Graduated state tax from 1.4% to 10.75%",
  },
  NM: {
    name: "New Mexico",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 25000 ? 2.5 : 4.2),
    notes: "Graduated state tax from 1.7% to 5.9%",
  },
  NY: {
    name: "New York",
    type: "progressive",
    calculateEffectivePct: (gross, status) => {
      const stdDed = status === "mfj" ? 16050 : 8000;
      const taxable = Math.max(0, gross - stdDed);
      if (taxable <= 0) return 0;
      let tax = 0;
      tax += Math.min(taxable, 8500) * 0.04;
      if (taxable > 8500) tax += Math.min(taxable - 8500, 3200) * 0.045;
      if (taxable > 11700) tax += Math.min(taxable - 11700, 2200) * 0.0525;
      if (taxable > 13900) tax += Math.min(taxable - 13900, 66750) * 0.055;
      if (taxable > 80650) tax += (taxable - 80650) * 0.06;
      return Math.round((tax / gross) * 10000) / 100;
    },
    notes: "Graduated state tax from 4.0% to 10.9% (NYC has separate resident tax)",
  },
  NC: {
    name: "North Carolina",
    type: "flat",
    flatRatePct: 4.5,
    calculateEffectivePct: () => 4.5,
    notes: "Flat 4.50% state income tax",
  },
  ND: {
    name: "North Dakota",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 44725 ? 0 : 1.95),
    notes: "0% for income under $44,725; 1.95% to 2.5% above",
  },
  OH: {
    name: "Ohio",
    type: "progressive",
    calculateEffectivePct: (gross) => {
      if (gross <= 26050) return 0;
      const taxable = gross - 26050;
      const tax = Math.min(taxable, 73950) * 0.0275 + Math.max(0, taxable - 73950) * 0.035;
      return Math.round((tax / gross) * 10000) / 100;
    },
    notes: "State tax up to 3.5% (most OH cities and school districts also levy municipal tax)",
  },
  OK: {
    name: "Oklahoma",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 20000 ? 2.5 : 4.2),
    notes: "Graduated state tax from 0.25% to 4.75%",
  },
  OR: {
    name: "Oregon",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 20000 ? 5.5 : gross <= 60000 ? 7.8 : 8.8),
    notes: "Graduated state tax from 4.75% to 9.9%",
  },
  PA: {
    name: "Pennsylvania",
    type: "flat",
    flatRatePct: 3.07,
    calculateEffectivePct: () => 3.07,
    notes: "Flat 3.07% state income tax (municipalities and school districts levy local EIT, e.g. 3.75% in Philly)",
  },
  RI: {
    name: "Rhode Island",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 40000 ? 3.75 : 4.75),
    notes: "Graduated state tax from 3.75% to 5.99%",
  },
  SC: {
    name: "South Carolina",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 20000 ? 2.5 : 4.8),
    notes: "Graduated state tax up to 6.4%",
  },
  SD: {
    name: "South Dakota",
    type: "none",
    calculateEffectivePct: () => 0,
    notes: "No state wage income tax",
  },
  TN: {
    name: "Tennessee",
    type: "none",
    calculateEffectivePct: () => 0,
    notes: "No state wage income tax",
  },
  TX: {
    name: "Texas",
    type: "none",
    calculateEffectivePct: () => 0,
    notes: "No state wage income tax",
  },
  UT: {
    name: "Utah",
    type: "flat",
    flatRatePct: 4.55,
    calculateEffectivePct: () => 4.55,
    notes: "Flat 4.55% state income tax",
  },
  VT: {
    name: "Vermont",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 40000 ? 3.5 : 5.8),
    notes: "Graduated state tax from 3.35% to 8.75%",
  },
  VA: {
    name: "Virginia",
    type: "progressive",
    calculateEffectivePct: (gross, status) => {
      const stdDed = status === "mfj" ? 17000 : 8500;
      const taxable = Math.max(0, gross - stdDed);
      if (taxable <= 0) return 0;
      let tax = 0;
      tax += Math.min(taxable, 3000) * 0.02;
      if (taxable > 3000) tax += Math.min(taxable - 3000, 2000) * 0.03;
      if (taxable > 5000) tax += Math.min(taxable - 5000, 12000) * 0.05;
      if (taxable > 17000) tax += (taxable - 17000) * 0.0575;
      return Math.round((tax / gross) * 10000) / 100;
    },
    notes: "Graduated state tax up to 5.75%",
  },
  WA: {
    name: "Washington",
    type: "none",
    calculateEffectivePct: () => 0,
    notes: "No state wage income tax",
  },
  WV: {
    name: "West Virginia",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 30000 ? 3.2 : 4.4),
    notes: "Graduated state tax from 2.36% to 5.12%",
  },
  WI: {
    name: "Wisconsin",
    type: "progressive",
    calculateEffectivePct: (gross) => (gross <= 30000 ? 4.0 : 5.1),
    notes: "Graduated state tax from 3.5% to 7.65%",
  },
  WY: {
    name: "Wyoming",
    type: "none",
    calculateEffectivePct: () => 0,
    notes: "No state wage income tax",
  },
};

/**
 * Computes New York City (NYC) resident personal income tax based on annual gross income.
 * NYC uses a 4-bracket progressive rate schedule with a standard deduction.
 * Brackets for Single:
 *   $0 - $12,000: 3.078%
 *   $12,000 - $25,000: $369.36 + 3.762% of excess
 *   $25,000 - $50,000: $858.42 + 3.819% of excess
 *   Over $50,000: $1,813.17 + 3.876% of excess
 */
export function calculateNycCityRate(annualGross: number, status: FilingStatus = "single"): number {
  if (annualGross <= 0) return 0;
  const stdDed = status === "mfj" ? 8000 : 3200;
  const taxable = Math.max(0, annualGross - stdDed);
  if (taxable <= 0) return 0;

  let tax = 0;
  if (status === "mfj") {
    tax += Math.min(taxable, 21600) * 0.03078;
    if (taxable > 21600) tax += Math.min(taxable - 21600, 23400) * 0.03762;
    if (taxable > 45000) tax += Math.min(taxable - 45000, 45000) * 0.03819;
    if (taxable > 90000) tax += (taxable - 90000) * 0.03876;
  } else {
    tax += Math.min(taxable, 12000) * 0.03078;
    if (taxable > 12000) tax += Math.min(taxable - 12000, 13000) * 0.03762;
    if (taxable > 25000) tax += Math.min(taxable - 25000, 25000) * 0.03819;
    if (taxable > 50000) tax += (taxable - 50000) * 0.03876;
  }

  return Math.round((tax / annualGross) * 10000) / 100;
}

/**
 * Computes Yonkers resident income tax surcharge (16.75% of New York State tax).
 */
export function calculateYonkersCityRate(annualGross: number, status: FilingStatus, stateRatePct: number): number {
  if (annualGross <= 0 || stateRatePct <= 0) return 0;
  const effectiveYonkers = stateRatePct * 0.1675;
  return Math.round(effectiveYonkers * 100) / 100;
}

/**
 * Computes Maryland county piggyback tax based on Maryland taxable income.
 */
export function calculateMarylandCountyRate(annualGross: number, status: FilingStatus, baseCountyPct: number): number {
  if (annualGross <= 0) return 0;
  const stdDed = status === "mfj" ? 5100 : 2550;
  const taxable = Math.max(0, annualGross - stdDed);
  const countyTax = taxable * (baseCountyPct / 100);
  return Math.round((countyTax / annualGross) * 10000) / 100;
}

/**
 * Computes Indiana county local income tax accounting for Indiana's personal exemption.
 */
export function calculateIndianaCountyRate(annualGross: number, status: FilingStatus, baseCountyPct: number): number {
  if (annualGross <= 0) return 0;
  const exemption = status === "mfj" ? 2000 : 1000;
  const taxable = Math.max(0, annualGross - exemption);
  const countyTax = taxable * (baseCountyPct / 100);
  return Math.round((countyTax / annualGross) * 10000) / 100;
}

/**
 * Computes Portland / Multnomah County local taxes for incomes above $125k.
 */
export function calculatePortlandLocalRate(annualGross: number, status: FilingStatus): number {
  const threshold1 = status === "mfj" ? 200000 : 125000;
  const threshold2 = status === "mfj" ? 400000 : 250000;
  if (annualGross <= threshold1) return 0;

  let localTax = (annualGross - threshold1) * 0.01;
  localTax += (annualGross - threshold1) * 0.015;
  if (annualGross > threshold2) {
    localTax += (annualGross - threshold2) * 0.015;
  }
  return Math.round((localTax / annualGross) * 10000) / 100;
}

export type KnownCity = {
  city: string;
  state: string;
  county?: string;
  countyRatePct?: number;
  cityRatePct?: number;
  calculateCityRatePct?: (annualGross: number, status: FilingStatus, stateRatePct: number) => number;
  calculateCountyRatePct?: (annualGross: number, status: FilingStatus) => number;
  notes?: string;
  zipPrefixes?: string[];
};

// Curated database of US cities with focus on locations with local income taxes
// and major US metropolitan areas.
export const KNOWN_CITIES: KnownCity[] = [
  // --- New Jersey (Maya's home state) ---
  { city: "Trenton", state: "NJ", county: "Mercer County", cityRatePct: 0, countyRatePct: 0, notes: "No local wage tax. NJ state tax applies." },
  { city: "Princeton", state: "NJ", county: "Mercer County", cityRatePct: 0, countyRatePct: 0, notes: "No local wage tax." },
  { city: "Newark", state: "NJ", county: "Essex County", cityRatePct: 0, countyRatePct: 0, notes: "No employee wage tax (Newark levies 1% employer payroll tax)." },
  { city: "Jersey City", state: "NJ", county: "Hudson County", cityRatePct: 0, countyRatePct: 0, notes: "No local employee wage tax." },
  { city: "Hoboken", state: "NJ", county: "Hudson County", cityRatePct: 0, countyRatePct: 0, notes: "No local wage tax." },
  { city: "New Brunswick", state: "NJ", county: "Middlesex County", cityRatePct: 0, countyRatePct: 0, notes: "No local wage tax." },
  { city: "Cherry Hill", state: "NJ", county: "Camden County", cityRatePct: 0, countyRatePct: 0, notes: "No local wage tax." },
  { city: "Camden", state: "NJ", county: "Camden County", cityRatePct: 0, countyRatePct: 0, notes: "No local wage tax." },

  // --- Pennsylvania (Heavy local Earned Income Taxes) ---
  { city: "Philadelphia", state: "PA", county: "Philadelphia County", cityRatePct: 3.75, countyRatePct: 0, notes: "Philadelphia resident wage tax: 3.75% on top of 3.07% PA state tax." },
  { city: "Pittsburgh", state: "PA", county: "Allegheny County", cityRatePct: 3.0, countyRatePct: 0, notes: "Pittsburgh local tax: 1% city + 2% school district = 3.00%." },
  { city: "Allentown", state: "PA", county: "Lehigh County", cityRatePct: 2.0, countyRatePct: 0, notes: "Allentown local EIT: 2.00%." },
  { city: "Reading", state: "PA", county: "Berks County", cityRatePct: 3.6, countyRatePct: 0, notes: "Reading local EIT: 3.60%." },
  { city: "Scranton", state: "PA", county: "Lackawanna County", cityRatePct: 3.4, countyRatePct: 0, notes: "Scranton local EIT: 3.40%." },
  { city: "Erie", state: "PA", county: "Erie County", cityRatePct: 1.65, countyRatePct: 0, notes: "Erie local EIT: 1.65%." },
  { city: "Bethlehem", state: "PA", county: "Northampton County", cityRatePct: 2.0, countyRatePct: 0, notes: "Bethlehem local EIT: 2.00%." },
  { city: "Lancaster", state: "PA", county: "Lancaster County", cityRatePct: 1.6, countyRatePct: 0, notes: "Lancaster local EIT: 1.60%." },
  { city: "Harrisburg", state: "PA", county: "Dauphin County", cityRatePct: 2.0, countyRatePct: 0, notes: "Harrisburg local EIT: 2.00%." },
  { city: "State College", state: "PA", county: "Centre County", cityRatePct: 1.8, countyRatePct: 0, notes: "State College EIT: 1.80%." },
  { city: "York", state: "PA", county: "York County", cityRatePct: 1.25, countyRatePct: 0, notes: "York local EIT: 1.25%." },
  { city: "Chester", state: "PA", county: "Delaware County", cityRatePct: 2.75, countyRatePct: 0, notes: "Chester local EIT: 2.75%." },
  { city: "Wilkes-Barre", state: "PA", county: "Luzerne County", cityRatePct: 2.85, countyRatePct: 0, notes: "Wilkes-Barre local EIT: 2.85%." },
  { city: "Norristown", state: "PA", county: "Montgomery County", cityRatePct: 1.5, countyRatePct: 0, notes: "Norristown local EIT: 1.50%." },
  { city: "King of Prussia", state: "PA", county: "Montgomery County", cityRatePct: 1.25, countyRatePct: 0, notes: "Upper Merion local EIT: 1.25%." },

  // --- New York (NYC Progressive Resident Tax & Yonkers Surcharge) ---
  {
    city: "New York",
    state: "NY",
    county: "New York County (Manhattan)",
    calculateCityRatePct: (gross, status) => calculateNycCityRate(gross, status),
    countyRatePct: 0,
    notes: "New York City resident personal income tax (graduated 3.078% to 3.876% based on income).",
  },
  {
    city: "Brooklyn",
    state: "NY",
    county: "Kings County",
    calculateCityRatePct: (gross, status) => calculateNycCityRate(gross, status),
    countyRatePct: 0,
    notes: "New York City resident tax applies to all five boroughs (graduated 3.078% to 3.876%).",
  },
  {
    city: "Queens",
    state: "NY",
    county: "Queens County",
    calculateCityRatePct: (gross, status) => calculateNycCityRate(gross, status),
    countyRatePct: 0,
    notes: "New York City resident tax applies to all five boroughs (graduated 3.078% to 3.876%).",
  },
  {
    city: "Bronx",
    state: "NY",
    county: "Bronx County",
    calculateCityRatePct: (gross, status) => calculateNycCityRate(gross, status),
    countyRatePct: 0,
    notes: "New York City resident tax applies to all five boroughs (graduated 3.078% to 3.876%).",
  },
  {
    city: "Staten Island",
    state: "NY",
    county: "Richmond County",
    calculateCityRatePct: (gross, status) => calculateNycCityRate(gross, status),
    countyRatePct: 0,
    notes: "New York City resident tax applies to all five boroughs (graduated 3.078% to 3.876%).",
  },
  {
    city: "Yonkers",
    state: "NY",
    county: "Westchester County",
    calculateCityRatePct: (gross, status, stateRate) => calculateYonkersCityRate(gross, status, stateRate),
    countyRatePct: 0,
    notes: "Yonkers resident income tax surcharge: 16.75% of New York State tax.",
  },
  { city: "Buffalo", state: "NY", county: "Erie County", cityRatePct: 0, countyRatePct: 0, notes: "No local city income tax in Buffalo. Only NY state tax." },
  { city: "Rochester", state: "NY", county: "Monroe County", cityRatePct: 0, countyRatePct: 0, notes: "No local city income tax." },
  { city: "Syracuse", state: "NY", county: "Onondaga County", cityRatePct: 0, countyRatePct: 0, notes: "No local city income tax." },
  { city: "Albany", state: "NY", county: "Albany County", cityRatePct: 0, countyRatePct: 0, notes: "No local city income tax." },

  // --- Ohio (Municipal income taxes) ---
  { city: "Columbus", state: "OH", county: "Franklin County", cityRatePct: 2.5, countyRatePct: 0, notes: "Columbus municipal income tax: 2.50%." },
  { city: "Cleveland", state: "OH", county: "Cuyahoga County", cityRatePct: 2.5, countyRatePct: 0, notes: "Cleveland municipal income tax: 2.50%." },
  { city: "Cincinnati", state: "OH", county: "Hamilton County", cityRatePct: 1.8, countyRatePct: 0, notes: "Cincinnati municipal income tax: 1.80%." },
  { city: "Toledo", state: "OH", county: "Lucas County", cityRatePct: 2.5, countyRatePct: 0, notes: "Toledo municipal income tax: 2.50%." },
  { city: "Akron", state: "OH", county: "Summit County", cityRatePct: 2.5, countyRatePct: 0, notes: "Akron municipal income tax: 2.50%." },
  { city: "Dayton", state: "OH", county: "Montgomery County", cityRatePct: 2.5, countyRatePct: 0, notes: "Dayton municipal income tax: 2.50%." },
  { city: "Canton", state: "OH", county: "Stark County", cityRatePct: 2.5, countyRatePct: 0, notes: "Canton municipal income tax: 2.50%." },
  { city: "Youngstown", state: "OH", county: "Mahoning County", cityRatePct: 2.75, countyRatePct: 0, notes: "Youngstown municipal income tax: 2.75%." },
  { city: "Parma", state: "OH", county: "Cuyahoga County", cityRatePct: 2.5, countyRatePct: 0, notes: "Parma municipal income tax: 2.50%." },
  { city: "Lakewood", state: "OH", county: "Cuyahoga County", cityRatePct: 1.5, countyRatePct: 0, notes: "Lakewood municipal income tax: 1.50%." },
  { city: "Dublin", state: "OH", county: "Franklin County", cityRatePct: 2.0, countyRatePct: 0, notes: "Dublin municipal income tax: 2.00%." },

  // --- Indiana (County Local Income Taxes across all 92 counties) ---
  {
    city: "Indianapolis",
    state: "IN",
    county: "Marion County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 2.02),
    cityRatePct: 0,
    notes: "Marion County local income tax: 2.02% + 3.00% IN state tax.",
  },
  {
    city: "Fort Wayne",
    state: "IN",
    county: "Allen County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 1.48),
    cityRatePct: 0,
    notes: "Allen County local income tax: 1.48%.",
  },
  {
    city: "Bloomington",
    state: "IN",
    county: "Monroe County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 2.035),
    cityRatePct: 0,
    notes: "Monroe County local income tax: 2.035%.",
  },
  {
    city: "Carmel",
    state: "IN",
    county: "Hamilton County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 1.1),
    cityRatePct: 0,
    notes: "Hamilton County local income tax: 1.10%.",
  },
  {
    city: "Fishers",
    state: "IN",
    county: "Hamilton County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 1.1),
    cityRatePct: 0,
    notes: "Hamilton County local income tax: 1.10%.",
  },
  {
    city: "South Bend",
    state: "IN",
    county: "St. Joseph County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 1.75),
    cityRatePct: 0,
    notes: "St. Joseph County local income tax: 1.75%.",
  },
  {
    city: "Evansville",
    state: "IN",
    county: "Vanderburgh County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 1.2),
    cityRatePct: 0,
    notes: "Vanderburgh County local income tax: 1.20%.",
  },
  {
    city: "Gary",
    state: "IN",
    county: "Lake County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 1.5),
    cityRatePct: 0,
    notes: "Lake County local income tax: 1.50%.",
  },
  {
    city: "Lafayette",
    state: "IN",
    county: "Tippecanoe County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 1.28),
    cityRatePct: 0,
    notes: "Tippecanoe County local income tax: 1.28%.",
  },
  {
    city: "Terre Haute",
    state: "IN",
    county: "Vigo County",
    calculateCountyRatePct: (gross, status) => calculateIndianaCountyRate(gross, status, 2.0),
    cityRatePct: 0,
    notes: "Vigo County local income tax: 2.00%.",
  },

  // --- Maryland (County piggyback taxes across all 23 counties + Baltimore City) ---
  {
    city: "Baltimore",
    state: "MD",
    county: "Baltimore City",
    calculateCountyRatePct: (gross, status) => calculateMarylandCountyRate(gross, status, 3.2),
    cityRatePct: 0,
    notes: "Baltimore City piggyback income tax: 3.20% on top of MD state tax.",
  },
  {
    city: "Bethesda",
    state: "MD",
    county: "Montgomery County",
    calculateCountyRatePct: (gross, status) => calculateMarylandCountyRate(gross, status, 3.2),
    cityRatePct: 0,
    notes: "Montgomery County local tax: 3.20%.",
  },
  {
    city: "Silver Spring",
    state: "MD",
    county: "Montgomery County",
    calculateCountyRatePct: (gross, status) => calculateMarylandCountyRate(gross, status, 3.2),
    cityRatePct: 0,
    notes: "Montgomery County local tax: 3.20%.",
  },
  {
    city: "Rockville",
    state: "MD",
    county: "Montgomery County",
    calculateCountyRatePct: (gross, status) => calculateMarylandCountyRate(gross, status, 3.2),
    cityRatePct: 0,
    notes: "Montgomery County local tax: 3.20%.",
  },
  {
    city: "Columbia",
    state: "MD",
    county: "Howard County",
    calculateCountyRatePct: (gross, status) => calculateMarylandCountyRate(gross, status, 3.2),
    cityRatePct: 0,
    notes: "Howard County local tax: 3.20%.",
  },
  {
    city: "Annapolis",
    state: "MD",
    county: "Anne Arundel County",
    calculateCountyRatePct: (gross, status) => calculateMarylandCountyRate(gross, status, 2.7),
    cityRatePct: 0,
    notes: "Anne Arundel County local tax: 2.70%.",
  },
  {
    city: "Frederick",
    state: "MD",
    county: "Frederick County",
    calculateCountyRatePct: (gross, status) => calculateMarylandCountyRate(gross, status, 2.96),
    cityRatePct: 0,
    notes: "Frederick County local tax: 2.96%.",
  },
  {
    city: "Towson",
    state: "MD",
    county: "Baltimore County",
    calculateCountyRatePct: (gross, status) => calculateMarylandCountyRate(gross, status, 3.2),
    cityRatePct: 0,
    notes: "Baltimore County local tax: 3.20%.",
  },
  {
    city: "Ocean City",
    state: "MD",
    county: "Worcester County",
    calculateCountyRatePct: (gross, status) => calculateMarylandCountyRate(gross, status, 2.25),
    cityRatePct: 0,
    notes: "Worcester County local tax: 2.25%.",
  },

  // --- Michigan (City income taxes) ---
  { city: "Detroit", state: "MI", county: "Wayne County", cityRatePct: 2.4, countyRatePct: 0, notes: "Detroit resident city income tax: 2.40%." },
  { city: "Grand Rapids", state: "MI", county: "Kent County", cityRatePct: 1.5, countyRatePct: 0, notes: "Grand Rapids city income tax: 1.50%." },
  { city: "Lansing", state: "MI", county: "Ingham County", cityRatePct: 1.0, countyRatePct: 0, notes: "Lansing city income tax: 1.00%." },
  { city: "Flint", state: "MI", county: "Genesee County", cityRatePct: 1.0, countyRatePct: 0, notes: "Flint city income tax: 1.00%." },
  { city: "Saginaw", state: "MI", county: "Saginaw County", cityRatePct: 1.5, countyRatePct: 0, notes: "Saginaw city income tax: 1.50%." },
  { city: "Pontiac", state: "MI", county: "Oakland County", cityRatePct: 1.0, countyRatePct: 0, notes: "Pontiac city income tax: 1.00%." },
  { city: "Highland Park", state: "MI", county: "Wayne County", cityRatePct: 2.0, countyRatePct: 0, notes: "Highland Park city income tax: 2.00%." },
  { city: "Ann Arbor", state: "MI", county: "Washtenaw County", cityRatePct: 0, countyRatePct: 0, notes: "Ann Arbor does not levy a city income tax." },

  // --- Kentucky (Occupational License Fees) ---
  { city: "Louisville", state: "KY", county: "Jefferson County", cityRatePct: 2.2, countyRatePct: 0, notes: "Louisville / Jefferson County occupational tax: 2.20%." },
  { city: "Lexington", state: "KY", county: "Fayette County", cityRatePct: 2.25, countyRatePct: 0, notes: "Lexington / Fayette County occupational tax: 2.25%." },
  { city: "Frankfort", state: "KY", county: "Franklin County", cityRatePct: 1.95, countyRatePct: 0, notes: "Frankfort city occupational tax: 1.95%." },
  { city: "Bowling Green", state: "KY", county: "Warren County", cityRatePct: 1.5, countyRatePct: 0, notes: "Bowling Green city/county occupational tax: 1.50%." },
  { city: "Covington", state: "KY", county: "Kenton County", cityRatePct: 2.5, countyRatePct: 0, notes: "Covington city occupational tax: 2.50%." },

  // --- Missouri (City Earnings Tax) ---
  { city: "Kansas City", state: "MO", county: "Jackson County", cityRatePct: 1.0, countyRatePct: 0, notes: "Kansas City earnings tax: 1.00%." },
  { city: "St. Louis", state: "MO", county: "St. Louis City", cityRatePct: 1.0, countyRatePct: 0, notes: "St. Louis city earnings tax: 1.00%." },
  { city: "Columbia", state: "MO", county: "Boone County", cityRatePct: 0, countyRatePct: 0, notes: "No city income tax." },

  // --- Delaware ---
  { city: "Wilmington", state: "DE", county: "New Castle County", cityRatePct: 1.25, countyRatePct: 0, notes: "Wilmington city wage tax: 1.25%." },
  { city: "Dover", state: "DE", county: "Kent County", cityRatePct: 0, countyRatePct: 0, notes: "No local wage tax." },

  // --- Alabama ---
  { city: "Birmingham", state: "AL", county: "Jefferson County", cityRatePct: 1.0, countyRatePct: 0, notes: "Birmingham municipal occupational tax: 1.00%." },
  { city: "Gadsden", state: "AL", county: "Etowah County", cityRatePct: 2.0, countyRatePct: 0, notes: "Gadsden municipal occupational tax: 2.00%." },
  { city: "Mobile", state: "AL", county: "Mobile County", cityRatePct: 0, countyRatePct: 0, notes: "No local city income tax." },
  { city: "Huntsville", state: "AL", county: "Madison County", cityRatePct: 0, countyRatePct: 0, notes: "No local city income tax." },

  // --- Texas (0% State & Local) ---
  { city: "Austin", state: "TX", county: "Travis County", cityRatePct: 0, countyRatePct: 0, notes: "Texas has 0% state and local wage income tax." },
  { city: "Houston", state: "TX", county: "Harris County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },
  { city: "Dallas", state: "TX", county: "Dallas County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },
  { city: "San Antonio", state: "TX", county: "Bexar County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },
  { city: "Fort Worth", state: "TX", county: "Tarrant County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },
  { city: "El Paso", state: "TX", county: "El Paso County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },

  // --- Florida (0% State & Local) ---
  { city: "Miami", state: "FL", county: "Miami-Dade County", cityRatePct: 0, countyRatePct: 0, notes: "Florida has 0% state and local wage income tax." },
  { city: "Orlando", state: "FL", county: "Orange County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },
  { city: "Tampa", state: "FL", county: "Hillsborough County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },
  { city: "Jacksonville", state: "FL", county: "Duval County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },
  { city: "Fort Lauderdale", state: "FL", county: "Broward County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },

  // --- Washington (0% State & Local) ---
  { city: "Seattle", state: "WA", county: "King County", cityRatePct: 0, countyRatePct: 0, notes: "Washington has 0% state and local wage income tax." },
  { city: "Spokane", state: "WA", county: "Spokane County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },
  { city: "Tacoma", state: "WA", county: "Pierce County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },
  { city: "Bellevue", state: "WA", county: "King County", cityRatePct: 0, countyRatePct: 0, notes: "0% state and local wage income tax." },

  // --- California (Progressive state, 0% local) ---
  { city: "Los Angeles", state: "CA", county: "Los Angeles County", cityRatePct: 0, countyRatePct: 0, notes: "California state income tax only (no city wage tax)." },
  { city: "San Francisco", state: "CA", county: "San Francisco County", cityRatePct: 0, countyRatePct: 0, notes: "CA state tax only (SF gross receipts tax is on businesses, not employee wages)." },
  { city: "San Diego", state: "CA", county: "San Diego County", cityRatePct: 0, countyRatePct: 0, notes: "California state income tax only." },
  { city: "San Jose", state: "CA", county: "Santa Clara County", cityRatePct: 0, countyRatePct: 0, notes: "California state income tax only." },
  { city: "Sacramento", state: "CA", county: "Sacramento County", cityRatePct: 0, countyRatePct: 0, notes: "California state income tax only." },
  { city: "Irvine", state: "CA", county: "Orange County", cityRatePct: 0, countyRatePct: 0, notes: "California state income tax only." },

  // --- Illinois (Flat 4.95% state, 0% local) ---
  { city: "Chicago", state: "IL", county: "Cook County", cityRatePct: 0, countyRatePct: 0, notes: "Illinois flat 4.95% state tax (no city wage tax)." },
  { city: "Naperville", state: "IL", county: "DuPage County", cityRatePct: 0, countyRatePct: 0, notes: "Illinois flat 4.95% state tax." },
  { city: "Aurora", state: "IL", county: "Kane County", cityRatePct: 0, countyRatePct: 0, notes: "Illinois flat 4.95% state tax." },
  { city: "Rockford", state: "IL", county: "Winnebago County", cityRatePct: 0, countyRatePct: 0, notes: "Illinois flat 4.95% state tax." },

  // --- Massachusetts (Flat 5.0% state, 0% local) ---
  { city: "Boston", state: "MA", county: "Suffolk County", cityRatePct: 0, countyRatePct: 0, notes: "Massachusetts flat 5.00% state income tax." },
  { city: "Cambridge", state: "MA", county: "Middlesex County", cityRatePct: 0, countyRatePct: 0, notes: "Massachusetts flat 5.00% state income tax." },
  { city: "Worcester", state: "MA", county: "Worcester County", cityRatePct: 0, countyRatePct: 0, notes: "Massachusetts flat 5.00% state income tax." },

  // --- Other major US cities ---
  { city: "Atlanta", state: "GA", county: "Fulton County", cityRatePct: 0, countyRatePct: 0, notes: "Georgia flat 5.39% state tax (no city wage tax)." },
  { city: "Denver", state: "CO", county: "Denver County", cityRatePct: 0, countyRatePct: 0, notes: "Colorado flat 4.40% state tax." },
  { city: "Phoenix", state: "AZ", county: "Maricopa County", cityRatePct: 0, countyRatePct: 0, notes: "Arizona flat 2.50% state tax." },
  { city: "Charlotte", state: "NC", county: "Mecklenburg County", cityRatePct: 0, countyRatePct: 0, notes: "North Carolina flat 4.50% state tax." },
  { city: "Raleigh", state: "NC", county: "Wake County", cityRatePct: 0, countyRatePct: 0, notes: "North Carolina flat 4.50% state tax." },
  { city: "Nashville", state: "TN", county: "Davidson County", cityRatePct: 0, countyRatePct: 0, notes: "Tennessee has 0% wage income tax." },
  { city: "Las Vegas", state: "NV", county: "Clark County", cityRatePct: 0, countyRatePct: 0, notes: "Nevada has 0% wage income tax." },
  { city: "Washington", state: "DC", county: "District of Columbia", cityRatePct: 0, countyRatePct: 0, notes: "DC progressive income tax." },
  {
    city: "Portland",
    state: "OR",
    county: "Multnomah County",
    calculateCityRatePct: (gross, status) => calculatePortlandLocalRate(gross, status),
    countyRatePct: 0,
    notes: "Oregon progressive state tax (Portland Metro + Multnomah taxes apply to income over $125k).",
  },
  { city: "Salt Lake City", state: "UT", county: "Salt Lake County", cityRatePct: 0, countyRatePct: 0, notes: "Utah flat 4.55% state tax." },
  { city: "Minneapolis", state: "MN", county: "Hennepin County", cityRatePct: 0, countyRatePct: 0, notes: "Minnesota progressive state tax." },
  { city: "Milwaukee", state: "WI", county: "Milwaukee County", cityRatePct: 0, countyRatePct: 0, notes: "Wisconsin progressive state tax." },
];

export const POPULAR_HOMETOWNS = [
  "Trenton, NJ",
  "New York, NY",
  "Philadelphia, PA",
  "Indianapolis, IN",
  "Columbus, OH",
  "Detroit, MI",
  "Baltimore, MD",
  "Austin, TX",
  "Chicago, IL",
  "San Francisco, CA",
];

// State full name to 2-letter postal abbreviation lookup
const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

/**
 * Parses user input like "Philadelphia, PA", "austin tx", "Trenton", or "New York"
 * and returns the best matching town, county, and state.
 */
export function parseHometownQuery(query: string): { city: string; stateCode: string | null } {
  const clean = query.trim();
  if (!clean) return { city: "", stateCode: null };

  // Format: "City, ST" or "City, State"
  if (clean.includes(",")) {
    const [cPart, sPart] = clean.split(",").map((s) => s.trim());
    const upperCode = sPart.toUpperCase();
    if (STATE_TAX_RULES[upperCode]) {
      return { city: cPart, stateCode: upperCode };
    }
    const nameMatch = STATE_NAME_TO_CODE[sPart.toLowerCase()];
    if (nameMatch) {
      return { city: cPart, stateCode: nameMatch };
    }
    return { city: cPart, stateCode: null };
  }

  // Format: "Austin TX" or "Miami FL"
  const tokens = clean.split(/\s+/);
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1].toUpperCase();
    if (STATE_TAX_RULES[last]) {
      return {
        city: tokens.slice(0, -1).join(" "),
        stateCode: last,
      };
    }
  }

  // Check if the entire query is a state name or code
  const asCode = clean.toUpperCase();
  if (STATE_TAX_RULES[asCode]) {
    return { city: STATE_TAX_RULES[asCode].name, stateCode: asCode };
  }
  const fullStateMatch = STATE_NAME_TO_CODE[clean.toLowerCase()];
  if (fullStateMatch) {
    return { city: STATE_TAX_RULES[fullStateMatch].name, stateCode: fullStateMatch };
  }

  return { city: clean, stateCode: null };
}

/**
 * Computes exact state, county, and city income tax rates for any hometown and income.
 * Automatically recalculates when annual gross income or filing status changes.
 */
export function calculateHometownTax(params: {
  hometown: string;
  annualGross?: number;
  filingStatus?: FilingStatus;
}): TaxLocation {
  const annualGross = params.annualGross ?? 41600;
  const status = params.filingStatus ?? "single";
  const { city, stateCode } = parseHometownQuery(params.hometown);

  // 1. Try matching known curated cities
  const cleanCity = city.toLowerCase();
  const matched = KNOWN_CITIES.find((k) => {
    const matchCity = k.city.toLowerCase() === cleanCity;
    if (stateCode) {
      return matchCity && k.state === stateCode;
    }
    return matchCity;
  });

  if (matched) {
    const rule = STATE_TAX_RULES[matched.state] ?? STATE_TAX_RULES.PA;
    const stateRatePct = rule.calculateEffectivePct(annualGross, status);

    const countyRatePct = matched.calculateCountyRatePct
      ? matched.calculateCountyRatePct(annualGross, status)
      : (matched.countyRatePct ?? 0);

    const cityRatePct = matched.calculateCityRatePct
      ? matched.calculateCityRatePct(annualGross, status, stateRatePct)
      : (matched.cityRatePct ?? 0);

    const totalRatePct = Math.round((stateRatePct + countyRatePct + cityRatePct) * 100) / 100;

    return {
      hometown: `${matched.city}, ${matched.state}`,
      city: matched.city,
      state: matched.state,
      stateName: rule.name,
      county: matched.county,
      stateRatePct,
      countyRatePct,
      cityRatePct,
      totalRatePct,
      notes: matched.notes ?? rule.notes,
    };
  }

  // 2. City not in curated list: resolve by state
  const effectiveState = stateCode ?? "NJ"; // Default fallback to NJ if state unknown
  const rule = STATE_TAX_RULES[effectiveState] ?? STATE_TAX_RULES.NJ;
  const stateRatePct = rule.calculateEffectivePct(annualGross, status);

  // Check if query is NYC-related (e.g. "Manhattan, NY", "NYC", "Queens, NY")
  let countyRatePct = 0;
  let cityRatePct = 0;
  let localNotes: string | undefined = undefined;

  const isNycVariant =
    effectiveState === "NY" &&
    (cleanCity.includes("new york") ||
      cleanCity.includes("nyc") ||
      cleanCity.includes("manhattan") ||
      cleanCity.includes("brooklyn") ||
      cleanCity.includes("queens") ||
      cleanCity.includes("bronx") ||
      cleanCity.includes("staten island"));

  if (isNycVariant) {
    cityRatePct = calculateNycCityRate(annualGross, status);
    localNotes = `New York City resident graduated income tax (${cityRatePct.toFixed(2)}% at this income) + NY state tax (${stateRatePct.toFixed(2)}%).`;
  } else if (effectiveState === "PA") {
    // Almost every PA municipality has an Act 511 local EIT of at least 1.0%
    cityRatePct = 1.0;
    localNotes = "Pennsylvania Act 511 baseline local Earned Income Tax (1.00%) + flat state tax (3.07%).";
  } else if (effectiveState === "MD") {
    // Every MD county has a local piggyback tax between 2.25% and 3.20%
    countyRatePct = calculateMarylandCountyRate(annualGross, status, 3.0);
    localNotes = `Maryland standard county piggyback tax (${countyRatePct.toFixed(2)}%) + state income tax (${stateRatePct.toFixed(2)}%).`;
  } else if (effectiveState === "IN") {
    // All 92 IN counties levy local income tax (~1.5% average)
    countyRatePct = calculateIndianaCountyRate(annualGross, status, 1.5);
    localNotes = `Indiana county local income tax (${countyRatePct.toFixed(2)}%) + flat state tax (3.00%).`;
  } else if (effectiveState === "OH") {
    // Most OH municipalities levy 1.5% to 2.5%
    cityRatePct = 1.5;
    localNotes = `Ohio standard municipal income tax (1.50%) + state income tax (${stateRatePct.toFixed(2)}%).`;
  }

  const totalRatePct = Math.round((stateRatePct + countyRatePct + cityRatePct) * 100) / 100;
  const displayCity = city ? city.charAt(0).toUpperCase() + city.slice(1) : rule.name;

  return {
    hometown: `${displayCity}, ${effectiveState}`,
    city: displayCity,
    state: effectiveState,
    stateName: rule.name,
    stateRatePct,
    countyRatePct,
    cityRatePct,
    totalRatePct,
    notes: localNotes ?? rule.notes,
  };
}

/**
 * Filters autocomplete search suggestions for the hometown input.
 */
export function searchHometowns(query: string, limit = 6): KnownCity[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return KNOWN_CITIES.filter((c) =>
      POPULAR_HOMETOWNS.includes(`${c.city}, ${c.state}`)
    ).slice(0, limit);
  }

  return KNOWN_CITIES.filter((c) => {
    const full = `${c.city}, ${c.state}`.toLowerCase();
    const withCounty = `${c.city} ${c.county ?? ""} ${c.state}`.toLowerCase();
    const stateName = (STATE_TAX_RULES[c.state]?.name ?? "").toLowerCase();
    return full.includes(q) || withCounty.includes(q) || stateName.includes(q);
  }).slice(0, limit);
}


// ==========================================
// Cross-Border & Multi-State Tax Calculations
// (Live in one state/city, work in another)
// ==========================================

export type CrossBorderTaxResult = {
  residence: TaxLocation;
  work: TaxLocation;
  isSameLocation: boolean;
  isDifferentState: boolean;
  hasStateReciprocity: boolean;
  reciprocityAgreementName?: string;
  // State taxes
  workStateRatePct: number;
  residentStateRatePct: number;
  outOfStateCreditPct: number;
  effectiveStateRatePct: number;
  stateTaxExplanation: string;
  // Local taxes (County + City)
  workCityRatePct: number;
  residentCityRatePct: number;
  effectiveCityRatePct: number;
  cityTaxExplanation?: string;
  workCountyRatePct: number;
  residentCountyRatePct: number;
  effectiveCountyRatePct: number;
  // Total
  totalRatePct: number;
  summaryBadge: string;
  summaryDetail: string;
};

// Known reciprocal agreements between states for wage income
export const RECIPROCAL_STATE_PAIRS = new Set([
  "NJ-PA", "PA-NJ",
  "DC-MD", "MD-DC", "DC-VA", "VA-DC", "MD-VA", "VA-MD",
  "IL-IA", "IA-IL", "IL-KY", "KY-IL", "IL-MI", "MI-IL", "IL-WI", "WI-IL",
  "IN-KY", "KY-IN", "IN-MI", "MI-IN", "IN-OH", "OH-IN", "IN-PA", "PA-IN", "IN-WI", "WI-IN",
  "MI-MN", "MN-MI", "MI-OH", "OH-MI", "MI-WI", "WI-MI",
  "OH-KY", "KY-OH", "OH-PA", "PA-OH", "OH-WV", "WV-OH",
  "PA-MD", "MD-PA", "PA-VA", "VA-PA", "PA-WV", "WV-PA",
  "VA-WV", "WV-VA", "VA-KY", "KY-VA",
  "MN-ND", "ND-MN", "MT-ND", "ND-MT",
]);

export function hasStateReciprocity(residenceState: string, workState: string): boolean {
  if (residenceState === workState) return true;
  // District of Columbia (DC) does not tax non-residents working in DC from any US state
  if (workState === "DC") return true;
  return RECIPROCAL_STATE_PAIRS.has(`${residenceState}-${workState}`);
}

/**
 * Returns non-resident local city tax rate and rules for the city where work is performed.
 */
export function getNonResidentCityRule(city: string, state: string): { ratePct: number; note: string } {
  const c = city.toLowerCase();

  // New York City commuter tax was repealed in 1999 (0% for non-residents)
  if (state === "NY" && (c.includes("new york") || c.includes("nyc") || c.includes("manhattan") || c.includes("brooklyn") || c.includes("queens") || c.includes("bronx") || c.includes("staten island"))) {
    return {
      ratePct: 0,
      note: "New York City does not levy personal income tax on non-residents commuting into the city.",
    };
  }

  // Yonkers commuter tax
  if (state === "NY" && c.includes("yonkers")) {
    return {
      ratePct: 0.50,
      note: "Yonkers levies a 0.50% commuter earnings tax on non-residents working in Yonkers.",
    };
  }

  // Philadelphia non-resident wage tax (3.44% vs 3.75% resident)
  if (state === "PA" && c.includes("philadelphia")) {
    return {
      ratePct: 3.44,
      note: "Philadelphia non-resident wage tax is 3.44% for commuters working in the city (reduced from 3.75% resident rate).",
    };
  }

  // Pittsburgh non-resident wage tax (1.00% vs 3.00% resident)
  if (state === "PA" && c.includes("pittsburgh")) {
    return {
      ratePct: 1.00,
      note: "Pittsburgh non-resident wage tax is 1.00% (the 2.00% school district tax applies only to residents).",
    };
  }

  // Michigan cities: non-residents pay half the resident rate
  if (state === "MI") {
    if (c.includes("detroit")) {
      return { ratePct: 1.20, note: "Detroit non-resident city tax is 1.20% (half the 2.40% resident rate)." };
    }
    if (c.includes("grand rapids")) {
      return { ratePct: 0.75, note: "Grand Rapids non-resident tax is 0.75% (half the 1.50% resident rate)." };
    }
    if (c.includes("lansing") || c.includes("flint") || c.includes("saginaw") || c.includes("pontiac")) {
      return { ratePct: 0.50, note: "Michigan non-resident city rate is 0.50% (half the resident rate)." };
    }
  }

  // Ohio cities: municipal tax applies to work performed in the city
  if (state === "OH") {
    if (c.includes("columbus")) return { ratePct: 2.50, note: "Columbus municipal income tax (2.50%) applies to all wages earned in Columbus." };
    if (c.includes("cleveland")) return { ratePct: 2.50, note: "Cleveland municipal income tax (2.50%) applies to all wages earned in Cleveland." };
    if (c.includes("cincinnati")) return { ratePct: 1.80, note: "Cincinnati municipal income tax (1.80%) applies to wages earned in Cincinnati." };
  }

  // Kentucky cities: occupational license fee applies to work performed
  if (state === "KY") {
    if (c.includes("louisville")) return { ratePct: 2.20, note: "Louisville / Jefferson County occupational tax (2.20%) applies to work performed in the county." };
    if (c.includes("lexington")) return { ratePct: 2.25, note: "Lexington / Fayette County occupational tax (2.25%) applies to work performed in the county." };
  }

  // Missouri
  if (state === "MO" && (c.includes("st. louis") || c.includes("kansas city"))) {
    return { ratePct: 1.00, note: "1.00% earnings tax on all wages earned within city limits." };
  }

  // Delaware
  if (state === "DE" && c.includes("wilmington")) {
    return { ratePct: 1.25, note: "Wilmington 1.25% wage tax applies to non-residents working in the city." };
  }

  return { ratePct: 0, note: "No non-resident local city tax." };
}

/**
 * Computes exact multi-state, cross-border tax rates accounting for:
 * 1. Resident State vs Work State reciprocity agreements
 * 2. Resident State out-of-state tax credits (avoiding double taxation)
 * 3. Resident vs Non-Resident city and county tax rules (e.g. NYC 0% commuter, Philly 3.44%)
 */
export function calculateCrossBorderTax(params: {
  residenceHometown: string;
  workHometown?: string;
  annualGross: number;
  filingStatus?: FilingStatus;
}): CrossBorderTaxResult {
  const annualGross = params.annualGross;
  const status = params.filingStatus ?? "single";

  const resLoc = calculateHometownTax({
    hometown: params.residenceHometown || "Trenton, NJ",
    annualGross,
    filingStatus: status,
  });

  const workQuery = params.workHometown?.trim() ? params.workHometown : params.residenceHometown;
  const workLoc = calculateHometownTax({
    hometown: workQuery || "Trenton, NJ",
    annualGross,
    filingStatus: status,
  });

  const isSameLocation = resLoc.city.toLowerCase() === workLoc.city.toLowerCase() && resLoc.state === workLoc.state;
  const isDifferentState = resLoc.state !== workLoc.state;

  if (isSameLocation) {
    return {
      residence: resLoc,
      work: workLoc,
      isSameLocation: true,
      isDifferentState: false,
      hasStateReciprocity: false,
      workStateRatePct: resLoc.stateRatePct,
      residentStateRatePct: resLoc.stateRatePct,
      outOfStateCreditPct: 0,
      effectiveStateRatePct: resLoc.stateRatePct,
      stateTaxExplanation: `You live and work in ${resLoc.stateName} (${resLoc.stateRatePct.toFixed(2)}% state tax).`,
      workCityRatePct: 0,
      residentCityRatePct: resLoc.cityRatePct,
      effectiveCityRatePct: resLoc.cityRatePct,
      cityTaxExplanation: resLoc.notes,
      workCountyRatePct: 0,
      residentCountyRatePct: resLoc.countyRatePct,
      effectiveCountyRatePct: resLoc.countyRatePct,
      totalRatePct: resLoc.totalRatePct,
      summaryBadge: "Single Location",
      summaryDetail: `Standard tax rates for ${resLoc.city}, ${resLoc.state}.`,
    };
  }

  // Different locations: Evaluate State & Local rules
  let workStateRatePct = workLoc.stateRatePct;
  const residentStateRatePct = resLoc.stateRatePct;
  let outOfStateCreditPct = 0;
  let effectiveStateRatePct = resLoc.stateRatePct;
  let stateTaxExplanation = "";
  const reciprocal = isDifferentState && hasStateReciprocity(resLoc.state, workLoc.state);

  if (reciprocal) {
    // Reciprocal agreement: Work state taxes 0%, resident state taxes full resident rate
    workStateRatePct = 0;
    effectiveStateRatePct = resLoc.stateRatePct;
    if (workLoc.state === "DC") {
      stateTaxExplanation = `Washington, DC does not tax non-resident commuters from any state. You only pay your home state of ${resLoc.stateName} (${resLoc.stateRatePct.toFixed(2)}%).`;
    } else {
      stateTaxExplanation = `${resLoc.stateName} and ${workLoc.stateName} have a reciprocal tax agreement. You are exempt from ${workLoc.stateName} state tax and only pay your resident state of ${resLoc.stateName} (${resLoc.stateRatePct.toFixed(2)}%).`;
    }
  } else if (isDifferentState) {
    // No reciprocity: Work state taxes first; Resident state taxes worldwide income minus out-of-state credit
    workStateRatePct = workLoc.stateRatePct;
    outOfStateCreditPct = Math.min(workLoc.stateRatePct, resLoc.stateRatePct);
    effectiveStateRatePct = Math.max(workLoc.stateRatePct, resLoc.stateRatePct);

    if (workLoc.stateRatePct >= resLoc.stateRatePct) {
      stateTaxExplanation = `You pay ${workLoc.stateRatePct.toFixed(2)}% to ${workLoc.stateName}. ${resLoc.stateName} grants an out-of-state credit for this amount, fully offsetting your ${resLoc.stateName} state tax.`;
    } else if (workLoc.stateRatePct === 0) {
      stateTaxExplanation = `${workLoc.stateName} has 0% state income tax. You owe resident income tax to ${resLoc.stateName} (${resLoc.stateRatePct.toFixed(2)}%).`;
    } else {
      const netResident = resLoc.stateRatePct - outOfStateCreditPct;
      stateTaxExplanation = `You pay ${workLoc.stateRatePct.toFixed(2)}% to ${workLoc.stateName}, plus ${netResident.toFixed(2)}% to ${resLoc.stateName} after your out-of-state tax credit. Combined state rate: ${effectiveStateRatePct.toFixed(2)}%.`;
    }
  } else {
    // Same state, different cities
    effectiveStateRatePct = resLoc.stateRatePct;
    stateTaxExplanation = `Same state (${resLoc.stateName}): standard state tax rate of ${resLoc.stateRatePct.toFixed(2)}% applies.`;
  }

  // Local / City taxes
  const nonResCity = getNonResidentCityRule(workLoc.city, workLoc.state);
  const workCityRatePct = nonResCity.ratePct;

  // Does the resident city levy resident personal income tax on all income?
  let residentCityRatePct = 0;
  const isNycResident = resLoc.state === "NY" && (resLoc.city.toLowerCase().includes("new york") || resLoc.city.toLowerCase().includes("brooklyn") || resLoc.city.toLowerCase().includes("queens") || resLoc.city.toLowerCase().includes("bronx") || resLoc.city.toLowerCase().includes("staten island"));
  if (isNycResident) {
    residentCityRatePct = resLoc.cityRatePct;
  } else if (resLoc.state === "PA" && resLoc.city.toLowerCase().includes("philadelphia")) {
    residentCityRatePct = resLoc.cityRatePct;
  }

  const effectiveCityRatePct = Math.round((workCityRatePct + residentCityRatePct) * 100) / 100;

  // County taxes: MD and IN county taxes apply based on residence
  const residentCountyRatePct = resLoc.countyRatePct;
  const workCountyRatePct = 0;
  const effectiveCountyRatePct = residentCountyRatePct;

  const totalRatePct = Math.round((effectiveStateRatePct + effectiveCityRatePct + effectiveCountyRatePct) * 100) / 100;

  let summaryBadge = "Cross-Border Commute";
  if (reciprocal) {
    summaryBadge = "🤝 State Reciprocity Active";
  } else if (isDifferentState && workLoc.stateRatePct > 0 && resLoc.stateRatePct > 0) {
    summaryBadge = "💳 Out-of-State Credit Applied";
  } else if (isDifferentState) {
    summaryBadge = "Multi-State Commuter";
  }

  const cityTaxExplanation = nonResCity.ratePct > 0
    ? nonResCity.note
    : nonResCity.note || "No non-resident local city tax.";

  return {
    residence: resLoc,
    work: workLoc,
    isSameLocation: false,
    isDifferentState,
    hasStateReciprocity: reciprocal,
    reciprocityAgreementName: reciprocal ? `${resLoc.state}-${workLoc.state} Reciprocal Agreement` : undefined,
    workStateRatePct,
    residentStateRatePct,
    outOfStateCreditPct,
    effectiveStateRatePct,
    stateTaxExplanation,
    workCityRatePct,
    residentCityRatePct,
    effectiveCityRatePct,
    cityTaxExplanation,
    workCountyRatePct,
    residentCountyRatePct,
    effectiveCountyRatePct,
    totalRatePct,
    summaryBadge,
    summaryDetail: `Residence: ${resLoc.city}, ${resLoc.state} · Workplace: ${workLoc.city}, ${workLoc.state}`,
  };
}

export const COMMUTER_PRESETS = [
  {
    label: "Live in NJ · Work in NYC",
    residence: "Trenton, NJ",
    work: "New York, NY",
    tip: "Commute to NYC: NY state tax applies with NJ credit, but NYC city tax is 0% (commuter exemption).",
  },
  {
    label: "Live in NJ · Work in Philadelphia",
    residence: "Trenton, NJ",
    work: "Philadelphia, PA",
    tip: "PA-NJ Reciprocity: Pay NJ state tax (0% PA tax), plus 3.44% Philly non-resident wage tax.",
  },
  {
    label: "Live in PA · Work in NJ",
    residence: "Philadelphia, PA",
    work: "Trenton, NJ",
    tip: "PA-NJ Reciprocity: Pay PA state tax (3.07%) + Philly resident wage tax (3.75%).",
  },
  {
    label: "Live in WA · Work in Portland, OR",
    residence: "Vancouver, WA",
    work: "Portland, OR",
    tip: "0% WA resident tax, but Oregon taxes wages earned in Oregon.",
  },
  {
    label: "Live in VA · Work in Washington, DC",
    residence: "Arlington, VA",
    work: "Washington, DC",
    tip: "DC exempts commuters: Pay VA resident state tax only.",
  },
];
