// Demo persona. Entirely fictional — no real person or account.
import { DEFAULT_MIN_RULE, type CardInputs } from "../finance/credit";
import type { PaycheckInputs } from "../finance/paycheck";
import type { TaxInputs } from "../finance/tax2025";

export type Transaction = {
  id: string;
  date: string; // ISO
  merchant: string;
  category: "Food" | "Shopping" | "Transport" | "Subscriptions" | "Entertainment" | "Bills";
  amount: number;
};

export type W2 = {
  employer: string;
  employerEin: string;
  employee: string;
  box1Wages: number;
  box2FederalWithheld: number;
  box3SocialSecurityWages: number;
  box4SocialSecurityWithheld: number;
  box5MedicareWages: number;
  box6MedicareWithheld: number;
  state: string;
};

export type Profile = {
  name: string;
  age: number;
  headline: string;
  job: string;
  city: string;
  isDemo: boolean;
};

export const MAYA_PROFILE: Profile = {
  name: "Maya",
  age: 20,
  headline: "First full-time job · first credit card · first tax return",
  job: "Junior marketing assistant",
  city: "Trenton, NJ",
  isDemo: true,
};

export const MAYA_PAYCHECK: PaycheckInputs = {
  grossPerPeriod: 1600,
  frequency: "biweekly",
  filingStatus: "single",
  stateTaxRatePct: 2.5,
};

export const MAYA_TRANSACTIONS: Transaction[] = [
  { id: "t1", date: "2025-10-02", merchant: "Campus Coffee Co.", category: "Food", amount: 6.75 },
  { id: "t2", date: "2025-10-03", merchant: "StreamFlix", category: "Subscriptions", amount: 15.49 },
  { id: "t3", date: "2025-10-05", merchant: "Metro Transit", category: "Transport", amount: 45.0 },
  { id: "t4", date: "2025-10-08", merchant: "Urban Threads", category: "Shopping", amount: 129.99 },
  { id: "t5", date: "2025-10-11", merchant: "Green Bowl", category: "Food", amount: 18.4 },
  { id: "t6", date: "2025-10-14", merchant: "Phone plan", category: "Bills", amount: 55.0 },
  { id: "t7", date: "2025-10-17", merchant: "Concert tickets", category: "Entertainment", amount: 142.5 },
  { id: "t8", date: "2025-10-20", merchant: "FreshMart", category: "Food", amount: 76.32 },
  { id: "t9", date: "2025-10-24", merchant: "RideShare", category: "Transport", amount: 23.8 },
  { id: "t10", date: "2025-10-27", merchant: "SoundWave Music", category: "Subscriptions", amount: 11.99 },
  { id: "t11", date: "2025-10-29", merchant: "Campus Coffee Co.", category: "Food", amount: 7.25 },
  { id: "t12", date: "2025-10-30", merchant: "Gift for roommate", category: "Shopping", amount: 67.51 },
];

export const MAYA_CARD: CardInputs = {
  balance: 600,
  creditLimit: 1000,
  apr: 24.99,
  monthlyPayment: 100,
  monthlyNewSpending: 0,
  minRule: DEFAULT_MIN_RULE,
};

export const MAYA_W2: W2 = {
  employer: "Brightline Media LLC (fictional)",
  employerEin: "00-0000000",
  employee: "Maya Demo",
  box1Wages: 41600,
  box2FederalWithheld: 3250,
  box3SocialSecurityWages: 41600,
  box4SocialSecurityWithheld: 2579.2,
  box5MedicareWages: 41600,
  box6MedicareWithheld: 603.2,
  state: "NJ",
};

export const MAYA_TAX: TaxInputs = {
  filingStatus: "single",
  wages: MAYA_W2.box1Wages,
  federalWithheld: MAYA_W2.box2FederalWithheld,
  canBeClaimedAsDependent: false,
  hasTipsOrOvertime: false,
  hasOtherIncome: false,
  isStudent: false,
};

export const SUGGESTED_QUESTIONS = [
  "Why am I paying so much interest if I only spent $600?",
  "Why am I getting a refund?",
  "Where did my paycheck go?",
  "What is the standard deduction?",
  "How do I upload my W-2?",
  "Does FirstFunds file my taxes?",
  "Can I delete my data?",
];
