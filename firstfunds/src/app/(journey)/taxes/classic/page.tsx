"use client";
import { useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  FileUp,
  Info,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { computeTax, FILING_STATUS_LABEL, STANDARD_DEDUCTION, TAX_YEAR, type FilingStatus } from "@/lib/finance/tax2025";
import { computePaycheck, PERIODS } from "@/lib/finance/paycheck";
import { askTutorQuestion } from "@/lib/tutor/ask";
import { downloadWorksheet } from "@/lib/pdf/worksheet";
import { IS_STATIC } from "@/lib/runtime";
import { usd } from "@/lib/format";
import { Badge, Button, Card, InfoTip, PageHeader, cn } from "@/components/ui";

const STEPS = ["W-2", "Filing status", "Income", "Deduction", "Tax", "Result"];
// Sequential blue ramp for bracket rates (magnitude = one hue, light → dark).
const RATE_COLORS: Record<string, string> = {
  "0.1": "#a8a6a4",
  "0.12": "#8a8887",
  "0.22": "#6d6c6b",
  "0.24": "#555352",
  "0.32": "#3f3d3b",
  "0.35": "#2c2b2a",
  "0.37": "#1a1919",
};

function NumberInput({ label, value, onChange, hint }: { label: ReactNode; value: number; onChange: (n: number) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-2">{label}</span>
      <div className="mt-1.5 flex items-center rounded-xl border border-line bg-card px-3 focus-within:border-brand">
        <span className="text-ink-3">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={value || ""}
          placeholder="0"
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="num w-full bg-transparent px-2 py-2.5 font-semibold outline-none"
        />
      </div>
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

function Check2({ checked, onChange, children }: { checked: boolean; onChange: (b: boolean) => void; children: ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors",
        checked ? "border-brand bg-brand-soft/60" : "border-line bg-card hover:border-ink-3",
      )}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
      <span>{children}</span>
    </label>
  );
}

export default function TaxesPage() {
  const { tax, setTax, w2, paycheck, profile, setTutorOpen } = useApp();
  const [step, setStep] = useState(tax.wages > 0 ? 0 : 0);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const r = computeTax(tax);
  const pay = computePaycheck(paycheck);
  const refund = r.refund >= 0;

  async function onUpload(file: File) {
    if (IS_STATIC) {
      setUploadMsg({ ok: false, text: "Reading photos needs the full app with a Gemini key. Please type box 1 and box 2 below." });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/w2-extract", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      const f = d.fields;
      setTax({ wages: Number(f.box1Wages) || 0, federalWithheld: Number(f.box2FederalWithheld) || 0 });
      setUploadMsg({ ok: true, text: "We read box 1 and box 2. Check them against your W-2 before continuing." });
    } catch (e) {
      setUploadMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const flow = [
    { label: "Gross income", value: r.grossIncome, tone: "default" },
    { label: "− Standard deduction", value: -r.standardDeduction, tone: "muted" },
    { label: "= Taxable income", value: r.taxableIncome, tone: "default" },
    { label: "Estimated tax", value: r.tax, tone: "bad" },
    { label: "− Already withheld", value: -r.withholding, tone: "muted" },
    { label: refund ? "= Refund" : "= You owe", value: Math.abs(r.refund), tone: refund ? "good" : "bad" },
  ];

  const canNext = step !== 0 || tax.wages > 0;

  return (
    <div>
      <PageHeader
        step="Tax Assistant"
        title={`Tax calculator (classic mode)`}
        subtitle={`For W-2 income only, using ${TAX_YEAR} IRS rules (filed in ${TAX_YEAR + 1}). We estimate and explain — we don't file.`}
        right={
          <Button
            variant="secondary"
            onClick={() => {
              setTutorOpen(true);
              askTutorQuestion(refund ? "Why am I getting a refund?" : "Why do I owe money?", "/taxes");
            }}
            disabled={!tax.wages}
          >
            <Sparkles size={16} className="text-brand" /> Explain my result
          </Button>
        }
      />

      {/* Stepper */}
      <ol className="mb-6 flex gap-1 overflow-x-auto" aria-label="Tax steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button
              onClick={() => (i === 0 || tax.wages > 0) && setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "w-full min-w-24 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors",
                i === step ? "border-ink bg-obsidian text-paper" : i < step ? "border-brand/30 bg-brand-soft text-brand-2" : "border-line bg-card text-ink-3",
              )}
            >
              <span className="flex items-center gap-1">
                {i < step ? <Check size={12} /> : `${i + 1}.`} {s}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="min-h-[420px]">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Start with your W-2</h2>
                <p className="text-sm text-ink-2">Your employer sends this by the end of January. We only need two boxes.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {w2 && (
                  <button
                    onClick={() => setTax({ wages: w2.box1Wages, federalWithheld: w2.box2FederalWithheld })}
                    className="rounded-xl border border-line bg-paper p-4 text-left text-sm hover:border-brand"
                  >
                    <Sparkles size={18} className="text-brand" />
                    <div className="mt-2 font-semibold">Use {profile?.name}&apos;s W-2</div>
                    <div className="text-xs text-ink-3">Sample data from the demo</div>
                  </button>
                )}
                <button
                  onClick={() =>
                    setTax({ wages: Math.round(pay.annualGross), federalWithheld: Math.round(pay.federal * PERIODS[paycheck.frequency]) })
                  }
                  className="rounded-xl border border-line bg-paper p-4 text-left text-sm hover:border-brand"
                >
                  <Wallet size={18} className="text-brand" />
                  <div className="mt-2 font-semibold">Estimate from my paycheck</div>
                  <div className="text-xs text-ink-3">
                    {usd(pay.annualGross)} wages from step 1
                  </div>
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="rounded-xl border border-dashed border-ink-3/40 bg-card p-4 text-left text-sm hover:border-brand disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={18} className="animate-spin text-brand" /> : <FileUp size={18} className="text-brand" />}
                  <div className="mt-2 font-semibold">{uploading ? "Reading…" : "Upload a W-2"}</div>
                  <div className="text-xs text-ink-3">Read by Gemini, never stored</div>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                />
              </div>
              {uploadMsg && (
                <div role="status" className={cn("rounded-xl px-3 py-2 text-sm", uploadMsg.ok ? "bg-brand-soft text-brand-2" : "bg-warn-soft text-warn")}>
                  {uploadMsg.text}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberInput
                  label={<>Box 1 · Wages, tips, other compensation</>}
                  value={tax.wages}
                  onChange={(n) => setTax({ wages: n })}
                  hint="Add boxes together if you had more than one job."
                />
                <NumberInput
                  label={<>Box 2 · Federal income tax withheld</>}
                  value={tax.federalWithheld}
                  onChange={(n) => setTax({ federalWithheld: n })}
                />
              </div>
              {w2 && tax.wages === w2.box1Wages && <W2Preview w2={w2} />}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Filing status &amp; your situation</h2>
                <p className="text-sm text-ink-2">Your status on December 31 decides your standard deduction and tax brackets.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(FILING_STATUS_LABEL) as FilingStatus[]).map((k) => (
                  <label
                    key={k}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm",
                      tax.filingStatus === k ? "border-brand bg-brand-soft/60" : "border-line hover:border-ink-3",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input type="radio" name="fs" checked={tax.filingStatus === k} onChange={() => setTax({ filingStatus: k })} className="accent-brand" />
                      {FILING_STATUS_LABEL[k]}
                    </span>
                    <span className="num text-xs text-ink-3">{usd(STANDARD_DEDUCTION[k])}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-ink-2">Check anything that applies</div>
                <Check2 checked={tax.canBeClaimedAsDependent} onChange={(b) => setTax({ canBeClaimedAsDependent: b })}>
                  Someone (like a parent) can claim me as a dependent
                </Check2>
                <Check2 checked={tax.isStudent} onChange={(b) => setTax({ isStudent: b })}>
                  I&apos;m a student or paid tuition this year
                </Check2>
                <Check2 checked={tax.hasTipsOrOvertime} onChange={(b) => setTax({ hasTipsOrOvertime: b })}>
                  I received tips or overtime pay
                </Check2>
                <Check2 checked={tax.hasOtherIncome} onChange={(b) => setTax({ hasOtherIncome: b })}>
                  I had income that&apos;s not on a W-2 (freelance, 1099, gig work, investments)
                </Check2>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Confirm income &amp; withholding</h2>
                <p className="text-sm text-ink-2">These two numbers drive everything else.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberInput label="Total W-2 wages (box 1)" value={tax.wages} onChange={(n) => setTax({ wages: n })} />
                <NumberInput label="Federal tax withheld (box 2)" value={tax.federalWithheld} onChange={(n) => setTax({ federalWithheld: n })} />
              </div>
              <Explainer>
                Withholding is tax your employer already sent to the IRS from each paycheck, based on your Form W-4. Filing a
                return settles up the difference between what was withheld and what you actually owe.
              </Explainer>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Apply the standard deduction</h2>
                <p className="text-sm text-ink-2">Income you don&apos;t pay federal income tax on at all.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Mini label="Wages" value={usd(r.grossIncome)} />
                <Mini label="Standard deduction" value={`− ${usd(r.standardDeduction)}`} tone="good" />
                <Mini label="Taxable income" value={usd(r.taxableIncome)} strong />
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-line" aria-hidden>
                <div
                  className="h-full bg-brand transition-all duration-500"
                  style={{ width: `${Math.min(100, (r.standardDeduction / (r.grossIncome || 1)) * 100)}%` }}
                />
              </div>
              <p className="text-sm text-ink-2">
                <b className="text-brand">{Math.min(100, Math.round((r.standardDeduction / (r.grossIncome || 1)) * 100))}%</b> of your wages
                are tax-free thanks to the {TAX_YEAR} standard deduction for {FILING_STATUS_LABEL[tax.filingStatus].toLowerCase()} filers
                {tax.canBeClaimedAsDependent && " (limited because you can be claimed as a dependent)"}.
              </p>
              <Explainer>
                For {TAX_YEAR}, the standard deduction is $15,750 single, $31,500 married filing jointly, and $23,625 head of household,
                raised by the One, Big, Beautiful Bill Act. Most first-time filers take the standard deduction rather than itemizing.
              </Explainer>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Calculate the tax</h2>
                <p className="text-sm text-ink-2">Each rate applies only to the slice of income inside its bracket.</p>
              </div>
              <div className="space-y-2">
                {r.slices.map((s) => (
                  <div key={s.rate} className="flex items-center gap-3 text-sm">
                    <span className="num w-12 font-semibold">{Math.round(s.rate * 100)}%</span>
                    <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-paper">
                      <div
                        className={`flex h-full items-center rounded-lg px-2 text-xs transition-all duration-500 ${s.rate <= 0.12 ? "text-[#0c0a08]" : "text-white"}`}
                        style={{
                          width: `${Math.max(6, ((s.to - s.from) / (r.taxableIncome || 1)) * 100)}%`,
                          background: RATE_COLORS[String(s.rate)],
                        }}
                      >
                        <span className={cn(s.rate <= 0.12 && "text-ink")}>{usd(s.to - s.from)}</span>
                      </div>
                    </div>
                    <span className="num w-20 text-right font-semibold">{usd(s.tax)}</span>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Mini label="Estimated tax" value={usd(r.tax)} strong />
                <Mini label="Marginal rate" value={`${Math.round(r.marginalRate * 100)}%`} />
                <Mini label="Effective rate" value={`${(r.effectiveRate * 100).toFixed(1)}%`} tone="good" />
              </div>
              <Explainer>
                Under $100,000 of taxable income, the IRS has you look up your tax in the <b>Tax Table</b>, which uses the middle of each $50
                range. That&apos;s why the total can differ by a few dollars from the bracket math above. Landing in a higher bracket
                never raises the tax on income below it.
              </Explainer>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div className={cn("rounded-2xl p-6 text-center", refund ? "bg-brand-soft" : "bg-debt-soft")}>
                <div className={cn("text-sm font-semibold", refund ? "text-brand-2" : "text-debt")}>
                  {refund ? "Estimated federal refund" : "Estimated amount you owe"}
                </div>
                <div className={cn("num mt-1 text-5xl font-semibold tracking-tight", refund ? "text-brand-2" : "text-debt")}>
                  {usd(Math.abs(r.refund))}
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  {refund
                    ? "You had more withheld than you owe, so the IRS returns the difference. It's your money, not a bonus."
                    : "Less was withheld than you owe. Updating your W-4 can prevent this next year."}
                </p>
              </div>

              <div>
                <h3 className="font-semibold">Tax owed vs. tax already paid</h3>
                <div className="mt-3 h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{ n: "Tax owed", v: r.tax }, { n: "Withheld", v: r.withholding }]} layout="vertical" margin={{ right: 70 }}>
                      <XAxis type="number" hide domain={[0, "dataMax"]} />
                      <YAxis type="category" dataKey="n" width={80} tickLine={false} axisLine={false} tick={{ fontSize: 13, fill: "var(--color-ink-2)" }} />
                      <Tooltip formatter={(v) => usd(Number(v))} cursor={{ fill: "rgba(14,26,36,0.04)" }} contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                      <Bar dataKey="v" radius={[0, 4, 4, 0]} barSize={26} animationDuration={500}>
                        <Cell fill="var(--color-s3)" />
                        <Cell fill="var(--color-s2)" />
                        <LabelList dataKey="v" position="right" formatter={(v) => usd(Number(v))} style={{ fontSize: 13, fontWeight: 600, fill: "var(--color-ink)" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {r.flags.length > 0 && (
                <div className="space-y-2">
                  {r.flags.map((f, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-2 rounded-xl p-3 text-sm",
                        f.level === "stop" ? "bg-debt-soft text-debt" : f.level === "warn" ? "bg-warn-soft text-ink" : "bg-info-soft text-ink",
                      )}
                    >
                      {f.level === "info" ? <Info size={16} className="mt-0.5 shrink-0 text-info" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                      <span>
                        {f.message}{" "}
                        {f.link && (
                          <a href={f.link} target="_blank" rel="noreferrer" className="font-semibold underline">
                            Learn more
                          </a>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {!IS_STATIC && (
                <Button
                  disabled={!r.supported || pdfBusy}
                  onClick={async () => {
                    setPdfBusy(true);
                    await downloadWorksheet(tax, r, profile?.isDemo ? "Maya Demo" : "");
                    setPdfBusy(false);
                  }}
                >
                  {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download 1040 review worksheet
                </Button>
                )}
                <a
                  href="https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold hover:border-ink-3"
                >
                  File free with IRS Free File <ExternalLink size={14} />
                </a>
              </div>
              <p className="text-xs text-ink-3">
                {r.supported
                  ? "The worksheet is generated on your device and marked DRAFT — FOR REVIEW. It isn't an IRS form and can't be filed."
                  : "Your situation needs forms this estimate doesn't cover, so the worksheet is turned off. Use IRS Free File or a tax professional."}
              </p>
            </div>
          )}

          <div className="mt-8 flex justify-between border-t border-line pt-5">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft size={16} /> Back
            </Button>
            {step < STEPS.length - 1 && (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Continue <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </Card>

        {/* Live flow */}
        <Card className="h-fit lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your return, live</h2>
            <Badge tone="info">TY {TAX_YEAR}</Badge>
          </div>
          <ol className="mt-4 space-y-1">
            {flow.map((f, i) => (
              <li
                key={f.label}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                  i === 2 || i === 5 ? "bg-paper font-semibold" : "",
                  i === 3 && "mt-3",
                )}
              >
                <span className={cn(f.tone === "muted" && "text-ink-3")}>{f.label}</span>
                <span
                  className={cn(
                    "num",
                    f.tone === "good" && "text-brand",
                    f.tone === "bad" && "text-debt",
                    f.tone === "muted" && "text-ink-3",
                  )}
                >
                  {f.value < 0 ? `− ${usd(-f.value)}` : usd(f.value)}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-start gap-1 text-xs text-ink-3">
            Federal only. Excludes credits, other income and state tax.
            <InfoTip>See the methodology page for exactly what&apos;s included.</InfoTip>
          </p>
        </Card>
      </div>
    </div>
  );
}

function Mini({ label, value, tone, strong }: { label: string; value: string; tone?: "good"; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl p-4", strong ? "bg-obsidian text-paper" : "bg-paper")}>
      <div className={cn("text-xs", strong ? "text-paper/70" : "text-ink-3")}>{label}</div>
      <div className={cn("num mt-1 text-xl font-semibold", tone === "good" && "text-brand")}>{value}</div>
    </div>
  );
}

function Explainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl bg-info-soft p-3 text-sm text-ink">
      <Info size={16} className="mt-0.5 shrink-0 text-info" />
      <p>{children}</p>
    </div>
  );
}

function W2Preview({ w2 }: { w2: NonNullable<ReturnType<typeof useApp.getState>["w2"]> }) {
  const box = (n: string, label: string, v: number) => (
    <div className="border-b border-r border-ink/20 p-2">
      <div className="text-[10px] text-ink-3">
        <b className="text-ink">{n}</b> {label}
      </div>
      <div className="num text-sm font-semibold">{v.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
    </div>
  );
  return (
    <div className="rounded-xl border border-ink/20 bg-card">
      <div className="flex items-center justify-between border-b border-ink/20 px-3 py-2 text-xs">
        <b>Form W-2 · Wage and Tax Statement · {TAX_YEAR}</b>
        <span className="text-ink-3">{w2.employer}</span>
      </div>
      <div className="grid grid-cols-2 border-l border-ink/20 sm:grid-cols-3">
        {box("1", "Wages, tips, other comp.", w2.box1Wages)}
        {box("2", "Federal income tax withheld", w2.box2FederalWithheld)}
        {box("3", "Social security wages", w2.box3SocialSecurityWages)}
        {box("4", "Social security tax withheld", w2.box4SocialSecurityWithheld)}
        {box("5", "Medicare wages and tips", w2.box5MedicareWages)}
        {box("6", "Medicare tax withheld", w2.box6MedicareWithheld)}
      </div>
    </div>
  );
}
