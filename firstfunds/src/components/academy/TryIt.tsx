"use client";
// Interactive examples for Academy lessons. All numbers come from the same tax engine
// the Tax Assistant uses (src/lib/finance), so lessons and returns always agree.
import { useState } from "react";
import { bracketTax, computeTax, FILING_STATUS_LABEL, STANDARD_DEDUCTION, type FilingStatus } from "@/lib/finance/tax2025";
import { MEDICARE_RATE, SOCIAL_SECURITY_RATE } from "@/lib/finance/paycheck";
import type { TryIt as TryItKind } from "@/lib/academy/lessons";
import { SliderField, cn } from "@/components/ui";

const usd = (n: number, cents = false) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

// Sequential blue ramp for bracket rates (one hue, light → dark).
const RATE_COLORS: Record<number, string> = { 0.1: "#9ec5f4", 0.12: "#6da7ec", 0.22: "#3987e5", 0.24: "#256abf", 0.32: "#184f95", 0.35: "#104281", 0.37: "#0d366b" };

export function TryIt({ kind }: { kind: TryItKind }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 text-xs font-semibold tracking-widest text-brand uppercase">Try it</div>
      {kind === "w2" && <W2Explorer />}
      {kind === "fica" && <Fica />}
      {kind === "withholding" && <Withholding />}
      {kind === "filingStatus" && <FilingStatusPick />}
      {kind === "standardDeduction" && <StdDeduction />}
      {kind === "brackets" && <Brackets />}
      {kind === "selfEmployment" && <SelfEmployment />}
    </div>
  );
}

const BOXES = [
  { n: "1", label: "Wages, tips, other comp.", v: 41600, tip: "Income subject to federal income tax. This is what goes on your 1040." },
  { n: "2", label: "Federal income tax withheld", v: 3250, tip: "Tax already paid from your paychecks. Compared with your real tax to find your refund." },
  { n: "3", label: "Social security wages", v: 41600, tip: "Wages subject to Social Security tax (up to $176,100 in 2025)." },
  { n: "4", label: "Social security tax withheld", v: 2579.2, tip: "6.2% of box 3. Not refunded on your return." },
  { n: "5", label: "Medicare wages and tips", v: 41600, tip: "Wages subject to Medicare tax. No cap." },
  { n: "6", label: "Medicare tax withheld", v: 603.2, tip: "1.45% of box 5." },
];

function W2Explorer() {
  const [sel, setSel] = useState("2");
  const b = BOXES.find((x) => x.n === sel)!;
  return (
    <div>
      <p className="mb-3 text-sm text-ink-2">Tap a box on this sample W-2.</p>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-ink/20 bg-[#fffdf6]">
        {BOXES.map((x) => (
          <button
            key={x.n}
            onClick={() => setSel(x.n)}
            aria-pressed={sel === x.n}
            className={cn("border-b border-r border-ink/15 p-2.5 text-left transition-colors", sel === x.n ? "bg-mint/40" : "hover:bg-black/5")}
          >
            <div className="text-[11px] text-ink-3">
              <b className="text-ink">{x.n}</b> {x.label}
            </div>
            <div className="num text-sm font-semibold">{x.v.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </button>
        ))}
      </div>
      <p className="mt-3 rounded-xl bg-paper p-3 text-sm" aria-live="polite">
        <b>Box {b.n}:</b> {b.tip}
      </p>
    </div>
  );
}

function Fica() {
  const [pay, setPay] = useState(1600);
  const ss = pay * SOCIAL_SECURITY_RATE;
  const mc = pay * MEDICARE_RATE;
  return (
    <div className="space-y-4">
      <SliderField label="Gross paycheck" value={pay} onChange={setPay} min={100} max={5000} step={50} prefix="$" />
      <div className="grid grid-cols-3 gap-2 text-center">
        <Box label="Social Security 6.2%" v={usd(ss, true)} />
        <Box label="Medicare 1.45%" v={usd(mc, true)} />
        <Box label="Total FICA" v={usd(ss + mc, true)} strong />
      </div>
    </div>
  );
}

function Withholding() {
  const [tax, setTax] = useState(2900);
  const [withheld, setWithheld] = useState(3250);
  const diff = withheld - tax;
  return (
    <div className="space-y-4">
      <SliderField label="Your actual tax for the year" value={tax} onChange={setTax} min={0} max={8000} step={50} prefix="$" />
      <SliderField label="Withheld from paychecks (W-2 box 2)" value={withheld} onChange={setWithheld} min={0} max={8000} step={50} prefix="$" />
      <div className={cn("rounded-xl p-4 text-center", diff >= 0 ? "bg-brand-soft text-brand-2" : "bg-debt-soft text-debt")}>
        <div className="text-sm font-semibold">{diff >= 0 ? "Refund" : "You owe"}</div>
        <div className="num text-3xl font-semibold">{usd(Math.abs(diff))}</div>
        <div className="mt-1 text-xs text-ink-2">
          {usd(withheld)} withheld − {usd(tax)} tax
        </div>
      </div>
    </div>
  );
}

function FilingStatusPick() {
  const [married, setMarried] = useState<boolean | null>(null);
  const [supports, setSupports] = useState<boolean | null>(null);
  const result =
    married === null ? null : married ? "Married filing jointly or separately" : supports === null ? null : supports ? "Possibly head of household (check the rules in Pub 501)" : "Single";
  const yn = (v: boolean | null, set: (b: boolean) => void) => (
    <div className="mt-2 flex gap-2">
      {[false, true].map((b) => (
        <button key={String(b)} onClick={() => set(b)} className={cn("min-h-11 flex-1 rounded-xl border-2 font-semibold", v === b ? "border-brand bg-brand-soft" : "border-line")}>
          {b ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="font-medium">Married on December 31?</div>
        {yn(married, setMarried)}
      </div>
      {married === false && (
        <div>
          <div className="font-medium">Paid over half the cost of a home for a child or relative who lived with you?</div>
          {yn(supports, setSupports)}
        </div>
      )}
      {result && <p className="rounded-xl bg-paper p-3 font-semibold">Likely status: {result}</p>}
    </div>
  );
}

function StdDeduction() {
  const [status, setStatus] = useState<FilingStatus>("single");
  const [wages, setWages] = useState(30000);
  const taxable = Math.max(0, wages - STANDARD_DEDUCTION[status]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["single", "mfj", "hoh"] as FilingStatus[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full border-2 px-3 py-1.5 text-sm font-semibold", status === s ? "border-brand bg-brand-soft" : "border-line")}>
            {FILING_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <SliderField label="Wages" value={wages} onChange={setWages} min={0} max={120000} step={500} prefix="$" />
      <div className="grid grid-cols-3 gap-2 text-center">
        <Box label="Wages" v={usd(wages)} />
        <Box label="Standard deduction" v={`− ${usd(STANDARD_DEDUCTION[status])}`} />
        <Box label="Taxable income" v={usd(taxable)} strong />
      </div>
    </div>
  );
}

function Brackets() {
  const [taxable, setTaxable] = useState(50000);
  const { tax, slices } = bracketTax(taxable, "single");
  const marginal = slices.length ? slices[slices.length - 1].rate : 0.1;
  return (
    <div className="space-y-4">
      <SliderField label="Taxable income (single, 2025)" value={taxable} onChange={setTaxable} min={0} max={250000} step={500} prefix="$" />
      <div className="space-y-1.5">
        {slices.map((s) => (
          <div key={s.rate} className="flex items-center gap-2 text-xs">
            <span className="num w-9 font-semibold">{Math.round(s.rate * 100)}%</span>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-paper">
              <div className="h-full rounded-md transition-all duration-300" style={{ width: `${Math.max(3, ((s.to - s.from) / (taxable || 1)) * 100)}%`, background: RATE_COLORS[s.rate] }} />
            </div>
            <span className="num w-16 text-right">{usd(s.tax)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Box label="Total tax" v={usd(tax)} strong />
        <Box label="Marginal rate" v={`${Math.round(marginal * 100)}%`} />
        <Box label="Effective rate" v={`${taxable ? ((tax / taxable) * 100).toFixed(1) : "0.0"}%`} />
      </div>
      <p className="text-xs text-ink-3">Exact bracket math. Real returns under $100,000 use the IRS Tax Table, which can differ by a few dollars.</p>
    </div>
  );
}

function SelfEmployment() {
  const [net, setNet] = useState(1500);
  const owes = net >= 400;
  const se = owes ? net * 0.9235 * 0.153 : 0;
  // For comparison: income tax on the same amount for a single filer with no other income.
  const income = computeTax({ filingStatus: "single", wages: net, federalWithheld: 0, canBeClaimedAsDependent: false, hasTipsOrOvertime: false, hasOtherIncome: false, isStudent: false });
  return (
    <div className="space-y-4">
      <SliderField label="Net earnings from gig work" value={net} onChange={setNet} min={0} max={30000} step={100} prefix="$" />
      <div className="grid grid-cols-2 gap-2 text-center">
        <Box label="Self-employment tax (est.)" v={usd(se)} strong />
        <Box label="Over the $400 line?" v={owes ? "Yes" : "No"} />
      </div>
      <p className="text-xs text-ink-3">
        Simplified: 15.3% × 92.35% of net earnings. Income tax is extra{income.tax > 0 ? ` (about ${usd(income.tax)} here if this were your only income)` : ""}, and
        half of SE tax is deductible. Real returns use Schedule SE.
      </p>
    </div>
  );
}

function Box({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl p-3", strong ? "bg-ink text-white" : "bg-paper")}>
      <div className={cn("text-[11px] leading-tight", strong ? "text-white/70" : "text-ink-3")}>{label}</div>
      <div className="num mt-1 font-semibold">{v}</div>
    </div>
  );
}
