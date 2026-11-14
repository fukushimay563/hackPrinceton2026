"use client";
import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowRight, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { computePaycheck, PERIODS, type PayFrequency } from "@/lib/finance/paycheck";
import { FILING_STATUS_LABEL, type FilingStatus } from "@/lib/finance/tax2025";
import { askTutorQuestion } from "@/lib/tutor/ask";
import { usd } from "@/lib/format";
import { Button, Card, InfoTip, PageHeader, SliderField, Stat } from "@/components/ui";
import { AdvisorTabs } from "@/components/AppShell";
import { HometownTaxSelector } from "@/components/HometownTaxSelector";

// Validated categorical order (dataviz validator, light surface).
const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#9b51e0", "#6250d6"];

const FREQ_LABEL: Record<PayFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
};

export default function PaycheckPage() {
  const { paycheck, setPaycheck, profile, card, setTutorOpen } = useApp();
  const p = computePaycheck(paycheck);
  const monthlyNet = (p.net * PERIODS[paycheck.frequency]) / 12;

  const hasLocal = p.cityTax > 0 || p.countyTax > 0;
  const localTaxTotal = p.cityTax + p.countyTax;

  const stateLabel = p.crossBorder?.isDifferentState
    ? `State tax (${p.crossBorder.work.state}/${p.crossBorder.residence.state})`
    : `State tax (${p.location.state})`;

  const slices = [
    { name: "Take-home pay", value: p.net, tip: "What lands in your bank account." },
    {
      name: "Federal income tax",
      value: p.federal,
      tip: "A prepayment toward your yearly income tax. Settled when you file — this is where refunds come from.",
    },
    {
      name: "Social Security",
      value: p.socialSecurity,
      tip: "6.2% of wages. Funds retirement and disability benefits. Not refundable.",
    },
    ...(hasLocal
      ? [
          {
            name: stateLabel,
            value: p.stateTax,
            tip: p.crossBorder?.stateTaxExplanation || `Income tax paid to ${p.location.stateName}.`,
          },
          {
            name: "Local income tax",
            value: localTaxTotal,
            tip:
              p.crossBorder?.cityTaxExplanation ||
              `County and city/municipal wage taxes (${(p.location.countyRatePct + p.location.cityRatePct).toFixed(2)}%).`,
          },
        ]
      : [
          {
            name: stateLabel,
            value: p.state,
            tip:
              p.crossBorder?.stateTaxExplanation ||
              `Income tax paid to ${p.location.stateName} (${p.location.stateRatePct}%). Some states (like TX and FL) have no wage tax.`,
          },
        ]),
    { name: "Medicare", value: p.medicare, tip: "1.45% of wages. Funds health coverage at 65+. Not refundable." },
  ].filter((s) => s.value > 0 || s.name === "Take-home pay");

  const budget = [
    { label: "Needs", pct: 50, eg: "rent, groceries, phone, transport" },
    { label: "Wants", pct: 30, eg: "eating out, concerts, shopping" },
    { label: "Savings & debt", pct: 20, eg: "emergency fund, extra card payments" },
  ];

  return (
    <div>
      <AdvisorTabs />
      <PageHeader
        step="Financial Advisor"
        title={profile?.isDemo ? `${profile.name}'s first paycheck` : "Your first paycheck"}
        subtitle="Your salary isn't what hits your bank account. Here's where every dollar of gross pay goes."
        right={
          <Button
            variant="secondary"
            onClick={() => {
              setTutorOpen(true);
              askTutorQuestion("Where did my paycheck go?", "/paycheck");
            }}
          >
            <Sparkles size={16} className="text-brand" /> Explain my paycheck
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[390px_1fr]">
        <Card className="h-fit space-y-6">
          <SliderField
            label="Gross pay per paycheck"
            value={paycheck.grossPerPeriod}
            onChange={(v) => setPaycheck({ grossPerPeriod: Math.max(0, v) })}
            min={200}
            max={8000}
            step={25}
            prefix="$"
            tip="Pay before any taxes or deductions. Hourly? Multiply hours × rate."
            hint={`${usd(p.annualGross)} a year`}
          />
          <div>
            <label htmlFor="freq" className="text-sm font-medium text-ink-2">
              How often you&apos;re paid
            </label>
            <select
              id="freq"
              value={paycheck.frequency}
              onChange={(e) => setPaycheck({ frequency: e.target.value as PayFrequency })}
              className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm"
            >
              {Object.entries(FREQ_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v} ({PERIODS[k as PayFrequency]}/yr)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fs" className="flex items-center text-sm font-medium text-ink-2">
              Filing status (from your W-4)
              <InfoTip>Most people with a first job who aren&apos;t married file as Single.</InfoTip>
            </label>
            <select
              id="fs"
              value={paycheck.filingStatus}
              onChange={(e) => setPaycheck({ filingStatus: e.target.value as FilingStatus })}
              className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm"
            >
              {(["single", "mfj", "hoh"] as FilingStatus[]).map((k) => (
                <option key={k} value={k}>
                  {FILING_STATUS_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          {/* Residence & Workplace Cross-Border Tax Engine */}
          <HometownTaxSelector
            residenceHometown={paycheck.hometown || profile?.city || "Trenton, NJ"}
            workHometown={paycheck.workHometown || "New York, NY"}
            isDifferentWorkLocation={paycheck.isDifferentWorkLocation ?? false}
            crossBorder={p.crossBorder}
            annualGross={p.annualGross}
            filingStatus={paycheck.filingStatus}
            manualRatePct={paycheck.stateTaxRatePct}
            isManualOverride={paycheck.isManualOverride}
            onChange={({
              residenceHometown,
              workHometown,
              isDifferentWorkLocation,
              effectiveRatePct,
              isManual,
            }) => {
              setPaycheck({
                hometown: residenceHometown,
                workHometown,
                isDifferentWorkLocation,
                stateTaxRatePct: effectiveRatePct,
                isManualOverride: isManual,
              });
            }}
          />

          <p className="text-xs text-ink-3">
            Federal withholding here is an estimate. Your real amount depends on your Form W-4 and IRS Publication 15-T.
          </p>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="grid items-center gap-6 md:grid-cols-[240px_1fr]">
              <div
                className="relative h-60"
                role="img"
                aria-label={`Donut chart: take-home ${usd(p.net, true)} of ${usd(p.gross, true)} gross.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="66%"
                      outerRadius="98%"
                      paddingAngle={1.5}
                      stroke="#fff"
                      strokeWidth={2}
                      animationDuration={500}
                    >
                      {slices.map((s, i) => (
                        <Cell key={s.name} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => usd(Number(v), true)}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e3e8e4", fontSize: 13 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-xs text-ink-3">Take-home</div>
                    <div className="num text-2xl font-semibold">{usd(p.net, true)}</div>
                    <div className="text-xs text-ink-3">of {usd(p.gross)}</div>
                  </div>
                </div>
              </div>
              <ul className="space-y-2.5">
                {slices.map((s, i) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      {s.name}
                      <InfoTip label={`About ${s.name}`}>{s.tip}</InfoTip>
                    </span>
                    <span className="num font-semibold">
                      {usd(s.value, true)}{" "}
                      <span className="font-normal text-ink-3">
                        · {((s.value / (p.gross || 1)) * 100).toFixed(1)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
              <Stat label="Monthly take-home" value={usd(monthlyNet)} sub="averaged across the year" tone="good" />
              <Stat label="Yearly take-home" value={usd(p.annualNet)} sub={`from ${usd(p.annualGross)} gross`} />
              <Stat
                label="Taxes & FICA / yr"
                value={usd(p.annualGross - p.annualNet)}
                sub={`${(((p.annualGross - p.annualNet) / (p.annualGross || 1)) * 100).toFixed(1)}% of gross`}
              />
            </div>

            {/* Commuter Cross-Border Breakdown Callout */}
            {p.crossBorder && !p.crossBorder.isSameLocation ? (
              <div className="mt-4 rounded-xl bg-paper/70 p-3 text-xs text-ink-2 border border-line/70 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink-1">
                    📍 Commute: {p.crossBorder.residence.city}, {p.crossBorder.residence.state} → {p.crossBorder.work.city}, {p.crossBorder.work.state}
                  </span>
                  <span className="rounded bg-white px-1.5 py-0.5 text-2xs font-semibold text-brand border border-line/60">
                    {p.crossBorder.summaryBadge}
                  </span>
                </div>
                <p className="text-ink-2 leading-relaxed">{p.crossBorder.stateTaxExplanation}</p>
                {p.crossBorder.cityTaxExplanation && (
                  <p className="text-ink-3 leading-relaxed">{p.crossBorder.cityTaxExplanation}</p>
                )}
              </div>
            ) : (
              hasLocal && (
                <div className="mt-4 rounded-xl bg-paper/60 p-3 text-xs text-ink-2 border border-line/60">
                  <span className="font-semibold text-ink-1">📍 Local breakdown for {p.location.hometown}:</span>{" "}
                  State tax is <b>{usd(p.stateTax * PERIODS[paycheck.frequency])}/yr</b> ({p.location.stateRatePct}%), and local (county + city) tax is{" "}
                  <b>{usd(localTaxTotal * PERIODS[paycheck.frequency])}/yr</b> ({(p.location.countyRatePct + p.location.cityRatePct).toFixed(2)}%).
                </div>
              )
            )}
          </Card>

          <Card>
            <h2 className="font-semibold">A starting budget for {usd(monthlyNet)}/month</h2>
            <p className="text-sm text-ink-3">The 50/30/20 rule of thumb, a common starting point, not a rule.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {budget.map((b) => (
                <div key={b.label} className="rounded-xl bg-paper p-4">
                  <div className="text-xs font-semibold text-ink-3 uppercase">
                    {b.label} · {b.pct}%
                  </div>
                  <div className="num mt-1 text-xl font-semibold">{usd((monthlyNet * b.pct) / 100)}</div>
                  <div className="mt-1 text-xs text-ink-3">{b.eg}</div>
                </div>
              ))}
            </div>
            {card.balance > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4 text-sm">
                <span>
                  The savings &amp; debt slice is <b>{usd(monthlyNet * 0.2)}</b>/month. Next, see what putting part of it toward a{" "}
                  <b>{usd(card.balance)}</b> card balance does.
                </span>
                <Link href="/credit" className="flex items-center gap-1 font-semibold text-brand hover:underline">
                  Open simulator <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
