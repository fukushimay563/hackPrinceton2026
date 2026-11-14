"use client";
// Shared app state for the whole journey. Kept in memory only — nothing is written
// to localStorage or a server, so no financial data persists after the tab closes.
import { create } from "zustand";
import { DEFAULT_MIN_RULE, type CardInputs } from "./finance/credit";
import type { PaycheckInputs } from "./finance/paycheck";
import type { TaxInputs } from "./finance/tax2025";
import {
  MAYA_CARD,
  MAYA_PAYCHECK,
  MAYA_PROFILE,
  MAYA_TAX,
  MAYA_TRANSACTIONS,
  MAYA_W2,
  type Profile,
  type Transaction,
  type W2,
} from "./demo/maya";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; url: string }[];
  mode?: "gemini" | "offline";
};

type State = {
  profile: Profile | null;
  paycheck: PaycheckInputs;
  card: CardInputs;
  transactions: Transaction[];
  transactionsSource: "demo" | "nessie" | "none";
  w2: W2 | null;
  tax: TaxInputs;
  chat: ChatMessage[];
  tutorOpen: boolean;
  tutorLoading: boolean;
  tutorError: string | null;
  setTutorStatus: (loading: boolean, error: string | null) => void;
  loadDemo: () => void;
  startFresh: (name: string) => void;
  setPaycheck: (p: Partial<PaycheckInputs>) => void;
  setCard: (c: Partial<CardInputs>) => void;
  setTax: (t: Partial<TaxInputs>) => void;
  setTransactions: (t: Transaction[], source: State["transactionsSource"]) => void;
  pushChat: (m: ChatMessage) => void;
  clearChat: () => void;
  setTutorOpen: (open: boolean) => void;
};

const BLANK_PAYCHECK: PaycheckInputs = {
  grossPerPeriod: 1500,
  frequency: "biweekly",
  filingStatus: "single",
  stateTaxRatePct: 3,
};

const BLANK_CARD: CardInputs = {
  balance: 500,
  creditLimit: 1500,
  apr: 24,
  monthlyPayment: 75,
  monthlyNewSpending: 0,
  minRule: DEFAULT_MIN_RULE,
};

const BLANK_TAX: TaxInputs = {
  filingStatus: "single",
  wages: 0,
  federalWithheld: 0,
  canBeClaimedAsDependent: false,
  hasTipsOrOvertime: false,
  hasOtherIncome: false,
  isStudent: false,
};

export const useApp = create<State>((set) => ({
  profile: null,
  paycheck: MAYA_PAYCHECK,
  card: MAYA_CARD,
  transactions: [],
  transactionsSource: "none",
  w2: null,
  tax: BLANK_TAX,
  chat: [],
  tutorOpen: false,
  tutorLoading: false,
  tutorError: null,
  setTutorStatus: (tutorLoading, tutorError) => set({ tutorLoading, tutorError }),
  loadDemo: () =>
    set({
      profile: MAYA_PROFILE,
      paycheck: { ...MAYA_PAYCHECK },
      card: { ...MAYA_CARD, minRule: { ...MAYA_CARD.minRule } },
      transactions: MAYA_TRANSACTIONS,
      transactionsSource: "demo",
      w2: MAYA_W2,
      tax: { ...MAYA_TAX },
      chat: [],
    }),
  startFresh: (name) =>
    set({
      profile: { name: name || "You", age: 0, headline: "Your financial journey", job: "", city: "", isDemo: false },
      paycheck: { ...BLANK_PAYCHECK },
      card: { ...BLANK_CARD, minRule: { ...DEFAULT_MIN_RULE } },
      transactions: [],
      transactionsSource: "none",
      w2: null,
      tax: { ...BLANK_TAX },
      chat: [],
    }),
  setPaycheck: (p) => set((s) => ({ paycheck: { ...s.paycheck, ...p } })),
  setCard: (c) => set((s) => ({ card: { ...s.card, ...c } })),
  setTax: (t) => set((s) => ({ tax: { ...s.tax, ...t } })),
  setTransactions: (transactions, transactionsSource) => set({ transactions, transactionsSource }),
  pushChat: (m) => set((s) => ({ chat: [...s.chat, m] })),
  clearChat: () => set({ chat: [], tutorError: null }),
  setTutorOpen: (tutorOpen) => set({ tutorOpen }),
}));
