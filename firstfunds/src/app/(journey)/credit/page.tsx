"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from "recharts";
import { AlertTriangle, ChevronDown, Database, Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { useApp } from "@/lib/store";
import { askTutorQuestion } from "@/lib/tutor/ask";
import { IS_STATIC } from "@/lib/runtime";
import { simulate, utilization, utilizationBand, minimumPayment, monthlyRate } from "@/lib/finance/credit";
import { computePaycheck, PERIODS } from "@/lib/finance/paycheck";
import { duration, durationLong, pct, usd } from "@/lib/format";
import { Badge, Button, Card, PageHeader, SliderField, Stat, cn } from "@/components/ui";
import { AdvisorTabs } from "@/components/AppShell";

const S = { min: "#eb6834", plan: "#2a78d6", fast: "#1baf7a" };

export default function CreditPage() {
  const { card, setCard, paycheck, transactions, transactionsSource, setTransactions, setTutorOpen } = useApp();
  const [showRule, setShowRule] = useState(false);
  const [showTable, setShowTable] = useState(false);

  // Try the Nessie adapter once (falls back to demo data server-side).
  useEffect(() => {
    if (transactionsSource !== "demo" || IS_STATIC) return;
    let cancelled = false;
    fetch("/api/nessie")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.source === "nessie") setTransactions(d.transactions, "nessie");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [transactionsSource, setTransactions]);

  const firstInterest = Math.round(card.balance * monthlyRate(card.apr) * 100) / 100;
  const firstMin = minimumPayment(card.balance, firstInterest, card.minRule);
  const fastPayment = Math.max(card.monthlyPayment * 2, firstMin * 2);

  const min = useMemo(() => simulate(card, "minimum"), [card]);
  const plan = useMemo(() => simulate(card, "fixed"), [card]);
  const fast = useMemo(() => simulate({ ...card, monthlyPayment: fastPayment }, "fixed"), [card, fastPayment]);

  const util = utilization(card.balance, card.creditLimit);
  const band = utilizationBand(util);
  const pay = computePaycheck(paycheck);
  const monthlyTakeHome = (pay.net * PERIODS[paycheck.frequency]) / 12;
  const paymentShare = monthlyTakeHome ? (card.monthlyPayment / monthlyTakeHome) * 100 : 0;
  const effectivePlanPayment = Math.max(card.monthlyPayment, firstMin);

  // Chart horizon: long enough to show the slowest plan finishing (cap 15 years).
  const horizon = Math.min(180, Math.max(12, (min.months ?? 180) + 1, (plan.months ?? 180) + 1));
  const lineData = useMemo(() => {
    const at = (s: typeof min, m: number) => {
      if (m < s.schedule.length) return s.paidOff && m === s.months ? 0 : s.schedule[m].endBalance;
      return s.paidOff ? null : s.schedule[s.schedule.length - 1].endBalance;
    };
    return Array.from({ length: horizon + 1 }, (_, m) => ({
      month: m,
      minimum: at(min, m),
      plan: at(plan, m),
      fast: at(fast, m),
    }));
  }, [min, plan, fast, horizon]);

  // If any plan never finishes, compare everyone over the same 5-year window.
  const allPaid = min.paidOff && plan.paidOff && fast.paidOff;
  const windowed = (r: typeof min) => {
    const row = r.schedule[allPaid ? r.schedule.length - 1 : Math.min(60, r.schedule.length - 1)];
    return { principal: Math.max(0, row.cumulativePaid - row.cumulativeInterest), interest: row.cumulativeInterest };
  };
  const barData = [
    { name: "Minimum", ...windowed(min) },
    { name: `${usd(effectivePlanPayment)}/mo`, ...windowed(plan) },
    { name: `${usd(fastPayment)}/mo`, ...windowed(fast) },
  ];

  const saved = plan.paidOff && min.paidOff ? min.totalInterest - plan.totalInterest : 0;
  const monthsSaved = min.months !== null && plan.months !== null ? min.months - plan.months : null;
  const txTotal = transactions.reduce((a, t) => a + t.amount, 0);
  const overLimit = card.balance > card.creditLimit;

  function askTutor(q: string) {
    setTutorOpen(true);
    askTutorQuestion(q, "/credit");
  }

  return (
    <div>
      <AdvisorTabs />
      <PageHeader
        step="Financial Advisor"
        title="Credit card simulator"
        subtitle="Change any number and watch what borrowing really costs over time."
        right={
          <Button variant="secondary" onClick={() => askTutor(`Why am I paying so much interest if I only spent ${usd(card.balance)}?`)}>
            <Sparkles size={16} className="text-brand" /> Why so much interest?
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Controls */}
        <Card className="h-fit space-y-6 lg:sticky lg:top-24">
          <SliderField
            label="Card balance"
            value={card.balance}
            onChange={(v) => setCard({ balance: Math.max(0, v) })}
            min={0}
            max={10000}
            step={50}
            prefix="$"
            tip="What you owe on the card right now, or what you plan to put on it."
          />
          <SliderField
            label="Credit limit"
            value={card.creditLimit}
            onChange={(v) => setCard({ creditLimit: Math.max(0, v) })}
            min={200}
            max={20000}
            step={100}
            prefix="$"
            tip="The most the issuer lets you borrow on this card."
          />
          <SliderField
            label="APR"
            value={card.apr}
            onChange={(v) => setCard({ apr: Math.max(0, Math.min(99, v)) })}
            min={0}
            max={36}
            step={0.01}
            suffix="%"
            tip="Annual percentage rate: the yearly interest rate. Each month you're charged about APR ÷ 12."
            hint={`≈ ${pct(card.apr / 12, 2)} per month`}
          />
          <SliderField
            label="Your monthly payment"
            value={card.monthlyPayment}
            onChange={(v) => setCard({ monthlyPayment: Math.max(0, v) })}
            min={0}
            max={Math.max(1000, Math.ceil(card.balance / 50) * 50)}
            step={5}
            prefix="$"
            hint={
              <>
                Minimum due this month: <b className="text-ink-2">{usd(firstMin, true)}</b>
                {card.monthlyPayment < firstMin && " — payments below the minimum are raised to it"}
                {monthlyTakeHome > 0 && <> · {pct(paymentShare, 1)} of monthly take-home</>}
              </>
            }
          />
          <SliderField
            label="New spending each month"
            value={card.monthlyNewSpending}
            onChange={(v) => setCard({ monthlyNewSpending: Math.max(0, v) })}
            min={0}
            max={1500}
            step={10}
            prefix="$"
            tip="Purchases you keep adding while paying the card down. This is where spending habits show up."
          />

          <div className="border-t border-line pt-4">
            <button
              onClick={() => setShowRule((s) => !s)}
              aria-expanded={showRule}
              className="flex w-full items-center justify-between text-sm font-medium text-ink-2"
            >
              Minimum payment assumptions
              <ChevronDown size={16} className={cn("transition-transform", showRule && "rotate-180")} />
            </button>
            {showRule && (
              <div className="mt-4 space-y-4">
                <SliderField
                  label="% of balance"
                  value={card.minRule.percentOfBalance}
                  onChange={(v) => setCard({ minRule: { ...card.minRule, percentOfBalance: Math.max(0.5, v) } })}
                  min={0.5}
                  max={5}
                  step={0.5}
                  suffix="%"
                />
                <SliderField
                  label="Minimum floor"
                  value={card.minRule.floor}
                  onChange={(v) => setCard({ minRule: { ...card.minRule, floor: Math.max(0, v) } })}
                  min={0}
                  max={50}
                  step={5}
                  prefix="$"
                />
                <label className="flex items-center gap-2 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={card.minRule.plusInterest}
                    onChange={(e) => setCard({ minRule: { ...card.minRule, plusInterest: e.target.checked } })}
                    className="h-4 w-4 accent-brand"
                  />
                  Add the month&apos;s interest to the minimum
                </label>
                <p className="text-xs text-ink-3">Issuers set their own formula. Check your card agreement or statement.</p>
              </div>
            )}
          </div>
        </Card>

        {/* Results */}
        <div className="space-y-6">
          <Card>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <Stat
                label="Payoff time"
                value={plan.paidOff ? duration(plan.months) : "Never"}
                sub={`Minimum only: ${min.paidOff ? duration(min.months) : "never"}`}
                tone={plan.paidOff ? "default" : "bad"}
              />
              <Stat
                label={plan.paidOff ? "Total interest" : "Interest, first 5 yrs"}
                value={usd(plan.paidOff ? plan.totalInterest : plan.interest5yr)}
                sub={`Minimum only: ${min.paidOff ? usd(min.totalInterest) : `${usd(min.interest5yr)} in 5 yrs`}`}
                tone="bad"
                tip={plan.paidOff ? "Interest you pay before the balance reaches $0." : "This plan never pays the card off, so we show interest over the first five years."}
              />
              <Stat
                label="Interest saved"
                value={saved > 0 && plan.paidOff ? usd(saved) : "$0"}
                sub={monthsSaved && monthsSaved > 0 ? `${monthsSaved} months sooner` : "vs. minimum only"}
                tone="good"
              />
              <Stat
                label="Utilization"
                value={pct(util)}
                sub={<Badge tone={band.tone === "good" ? "good" : band.tone === "ok" ? "info" : band.tone === "warn" ? "warn" : "bad"}>{band.label}</Badge>}
              />
            </div>
          </Card>

          {(plan.growing || min.growing || overLimit) && (
            <div role="alert" className="flex gap-3 rounded-2xl border border-debt/30 bg-debt-soft p-4 text-sm text-debt">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                {overLimit && <p className="font-semibold">Your balance is over your credit limit. Expect declined charges and possible fees.</p>}
                {(plan.growing || min.growing) && (
                  <p>
                    <b>The balance keeps growing.</b> Interest plus {usd(card.monthlyNewSpending)} of new spending each month is more
                    than {plan.growing ? "your payment" : "the minimum payment"} covers. Lower spending or raise your payment to break the cycle.
                  </p>
                )}
              </div>
            </div>
          )}

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Balance over time</h2>
                <p className="text-sm text-ink-3">How fast each payment plan clears {usd(card.balance)} at {card.apr}% APR</p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-ink-2" aria-label="Legend">
                <LegendDot color={S.min} label={`Minimum only`} />
                <LegendDot color={S.plan} label={`Your plan · ${usd(effectivePlanPayment)}/mo`} />
                <LegendDot color={S.fast} label={`Pay ${usd(fastPayment)}/mo`} dashed />
              </div>
            </div>
            <div className="mt-4 h-72" role="img" aria-label={`Line chart: minimum payments take ${durationLong(min.months)}, your plan takes ${durationLong(plan.months)}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e3e8e4" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={{ stroke: "#e3e8e4" }}
                    tick={{ fontSize: 12, fill: "#6b7a87" }}
                    tickFormatter={(m) => (horizon > 36 ? (m % 12 === 0 ? `${m / 12}y` : "") : `${m}`)}
                    interval={horizon > 36 ? 0 : "preserveStartEnd"}
                    minTickGap={4}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "#6b7a87" }}
                    tickFormatter={(v) => usd(v)}
                    width={64}
                  />
                  <Tooltip
                    cursor={{ stroke: "#6b7a87", strokeDasharray: "3 3" }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e3e8e4", fontSize: 13 }}
                    labelFormatter={(m) => `Month ${m}`}
                    formatter={(v, n) => [usd(Number(v), true), n === "minimum" ? "Minimum only" : n === "plan" ? "Your plan" : "Faster plan"]}
                  />
                  {card.creditLimit > 0 && card.creditLimit < card.balance * 1.6 && (
                    <ReferenceLine y={card.creditLimit} stroke="#b7790d" strokeDasharray="4 4" label={{ value: "Credit limit", fontSize: 11, fill: "#b7790d", position: "insideTopRight" }} />
                  )}
                  <Line type="linear" dataKey="minimum" stroke={S.min} strokeWidth={2.5} dot={false} connectNulls={false} animationDuration={450} />
                  <Line type="linear" dataKey="plan" stroke={S.plan} strokeWidth={2.5} dot={false} animationDuration={450} />
                  <Line type="linear" dataKey="fast" stroke={S.fast} strokeWidth={2} strokeDasharray="6 4" dot={false} animationDuration={450} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <button onClick={() => setShowTable((s) => !s)} className="mt-2 text-xs font-medium text-info hover:underline">
              {showTable ? "Hide" : "Show"} month-by-month table
            </button>
            {showTable && <ScheduleTable rows={plan.schedule.slice(1, 61)} />}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Where your payments go</h2>
              <p className="text-sm text-ink-3">
                Principal vs. interest the bank keeps{allPaid ? "" : " · first 5 years"}
              </p>
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 16 }} barCategoryGap={14}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={84} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#3b4a57" }} />
                    <Tooltip
                      cursor={{ fill: "rgba(14,26,36,0.04)" }}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e3e8e4", fontSize: 13 }}
                      formatter={(v, n) => [usd(Number(v), true), n === "principal" ? "Principal" : "Interest"]}
                    />
                    <Bar dataKey="principal" stackId="a" fill="#c9d3d9" stroke="#fff" strokeWidth={2} animationDuration={450} />
                    <Bar dataKey="interest" stackId="a" fill={S.min} stroke="#fff" strokeWidth={2} radius={[0, 4, 4, 0]} animationDuration={450} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 text-xs text-ink-2">
                <LegendDot color="#c9d3d9" label="Principal" />
                <LegendDot color={S.min} label="Interest" />
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold">Credit utilization</h2>
              <p className="text-sm text-ink-3">
                {usd(card.balance)} of {usd(card.creditLimit)} limit
              </p>
              <UtilizationMeter value={util} />
              <p className="mt-4 text-sm text-ink-2">{band.note}</p>
              <p className="mt-2 text-xs text-ink-3">
                Utilization is one factor in credit scores, along with payment history and credit age. We don&apos;t predict
                score changes, because no tool can do that reliably. Under 30% here means {usd(card.creditLimit * 0.3)} or less.
              </p>
            </Card>
          </div>

          <Card className="border-brand/20 bg-brand-soft/50">
            <div className="flex gap-3">
              <Lightbulb size={20} className="mt-0.5 shrink-0 text-brand" />
              <div className="text-sm text-ink">
                {plan.paidOff && min.paidOff && saved > 1 ? (
                  <p>
                    Paying <b>{usd(effectivePlanPayment)}</b> a month instead of the minimum saves <b>{usd(saved)}</b> in interest
                    {monthsSaved ? (
                      <>
                        {" "}and gets you debt-free <b>{monthsSaved} months sooner</b>
                      </>
                    ) : null}
                    . Paying the full statement balance by the due date usually means no interest at all.
                  </p>
                ) : (
                  <p>Paying the full statement balance by the due date each month usually means you pay no interest on purchases.</p>
                )}
              </div>
            </div>
          </Card>

          {transactions.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold">
                    Recent card activity
                    <Badge tone={transactionsSource === "nessie" ? "info" : "default"}>
                      <Database size={12} /> {transactionsSource === "nessie" ? "Capital One Nessie sandbox" : "Sample data"}
                    </Badge>
                  </h2>
                  <p className="text-sm text-ink-3">
                    {transactions.length} purchases · {usd(txTotal, true)} total
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCard({ monthlyNewSpending: Math.round(txTotal) });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <TrendingUp size={16} /> What if I keep spending like this?
                </Button>
              </div>
              <ul className="mt-4 divide-y divide-line">
                {transactions.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <div className="font-medium">{t.merchant}</div>
                      <div className="text-xs text-ink-3">
                        {new Date(t.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {t.category}
                      </div>
                    </div>
                    <div className="num font-semibold">{usd(t.amount, true)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="8" aria-hidden>
        <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth={dashed ? 2 : 3} strokeDasharray={dashed ? "4 3" : undefined} strokeLinecap="round" />
      </svg>
      {label}
    </span>
  );
}

function UtilizationMeter({ value }: { value: number }) {
  const v = Math.min(100, Math.max(0, value));
  const color = value <= 10 ? "#17795a" : value <= 30 ? "#2f5fd0" : value <= 75 ? "#b7790d" : "#d0453a";
  return (
    <div className="mt-5">
      <div className="num text-4xl font-semibold">{pct(value)}</div>
      <div className="relative mt-3 h-3 rounded-full bg-line" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label="Credit utilization">
        <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${v}%`, background: color }} />
        <div className="absolute top-[-4px] h-5 w-px bg-ink-3" style={{ left: "30%" }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>0%</span>
        <span style={{ marginLeft: "18%" }}>30% rule of thumb</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function ScheduleTable({ rows }: { rows: ReturnType<typeof simulate>["schedule"] }) {
  return (
    <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-line">
      <table className="num w-full text-right text-xs">
        <thead className="sticky top-0 bg-paper text-ink-3">
          <tr>
            <th className="p-2 text-left">Month</th>
            <th className="p-2">Start</th>
            <th className="p-2">Interest</th>
            <th className="p-2">Payment</th>
            <th className="p-2">New spend</th>
            <th className="p-2">End</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t border-line">
              <td className="p-2 text-left">{r.month}</td>
              <td className="p-2">{usd(r.startBalance, true)}</td>
              <td className="p-2 text-debt">{usd(r.interest, true)}</td>
              <td className="p-2">{usd(r.payment, true)}</td>
              <td className="p-2">{usd(r.newSpending, true)}</td>
              <td className="p-2 font-semibold">{usd(r.endBalance, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
