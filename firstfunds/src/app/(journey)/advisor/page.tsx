"use client";
// Main dashboard. Answers: where am I, what's happening, what should I do next.
// Every number is computed from the user's own inputs, stored demo transactions, or the
// deterministic tax engine. Demo data is always labelled.
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { fadeUp, staggerParent } from "@/lib/motion";
import { AnimatedNumber } from "@/components/motion";
import { AlertCircle, ArrowRight, Bot, ChevronDown, FileCheck2, FileUp, Lightbulb, MessageCircle, PiggyBank, Receipt, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { computePaycheck, PERIODS } from "@/lib/finance/paycheck";
import { cardSummary } from "@/lib/finance/credit";
import { computeTax } from "@/lib/finance/tax2025";
import { askTutorQuestion } from "@/lib/tutor/ask";
import { duration, pct, usd } from "@/lib/format";
import { IS_STATIC } from "@/lib/runtime";
import { authHeaders } from "@/lib/supabase/client";
import { AdvisorTabs } from "@/components/AppShell";
import { AgentActivityIndicator, type AgentEvent } from "@/components/AgentActivity";
import { Badge, Card, EmptyState, PageHeader, Skeleton, Stat, cn } from "@/components/ui";
import type { MonthPoint } from "@/components/dashboard/Charts";

const ChartFallback = () => <Skeleton className="h-56 w-full" />;
const IncomeSpendingChart = dynamic(() => import("@/components/dashboard/Charts").then((m) => m.IncomeSpendingChart), { ssr: false, loading: ChartFallback });
const TaxChart = dynamic(() => import("@/components/dashboard/Charts").then((m) => m.TaxChart), { ssr: false, loading: () => <Skeleton className="h-36 w-full" /> });

type Banking = { source: { provider: string; live: boolean; label: string } | null; trend: MonthPoint[]; needsReview: number };
type AgentRun = { status: string; events: AgentEvent[]; verification?: { status: string } };

export default function AdvisorPage() {
  const { paycheck, card, tax, w2, profile, chat, setTutorOpen } = useApp();
  const pay = computePaycheck(paycheck);
  const monthly = (pay.net * PERIODS[paycheck.frequency]) / 12;
  const c = cardSummary(card);
  const t = tax.wages > 0 ? computeTax(tax) : null;
  const [banking, setBanking] = useState<Banking | null>(null);
  const [bankingState, setBankingState] = useState<"loading" | "ready" | "unavailable">(IS_STATIC ? "unavailable" : "loading");
  const [agentRun, setAgentRun] = useState<AgentRun | null | undefined>(IS_STATIC ? null : undefined);
  const [showAll, setShowAll] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (IS_STATIC) return;
    let live = true;
    authHeaders()
      .then((headers) => fetch("/api/banking", { headers, cache: "no-store" }))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Banking) => live && (setBanking(d), setBankingState("ready")))
      .catch(() => live && setBankingState("unavailable"));
    fetch("/api/agents/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setAgentRun(d?.lastRun ?? null))
      .catch(() => live && setAgentRun(null));
    return () => {
      live = false;
    };
  }, []);

  // Items that need the user's attention, in priority order.
  const missing: { text: string; href: string; cta: string }[] = [];
  if (!t) missing.push({ text: "No W-2 yet, so there's no 2025 tax estimate.", href: "/taxes", cta: "Add W-2" });
  if (banking && banking.needsReview > 0) missing.push({ text: `${banking.needsReview} transactions need a quick review.`, href: "/budget", cta: "Review" });
  if (c.utilizationPct > 30) missing.push({ text: `Card utilization is ${pct(c.utilizationPct)}, above the ~30% rule of thumb.`, href: "/credit", cta: "See plan" });

  // Rule-based observations. Education, not advice.
  const insights: { tone: "good" | "warn" | "info"; text: string; href: string; cta: string }[] = [];
  if (t && t.refund > 0) insights.push({ tone: "good", text: `You're on track for a ${usd(t.refund)} refund: ${usd(t.withholding)} was withheld and the estimated tax is ${usd(t.tax)}.`, href: "/taxes", cta: "Review estimate" });
  if (t && t.refund < 0) insights.push({ tone: "warn", text: `You may owe ${usd(-t.refund)}: estimated tax ${usd(t.tax)} is more than the ${usd(t.withholding)} withheld.`, href: "/taxes", cta: "Review estimate" });
  if (card.balance > 0 && c.minimum.months !== null && c.chosen.months !== null && c.minimum.totalInterest - c.chosen.totalInterest > 1)
    insights.push({ tone: "info", text: `Paying ${usd(card.monthlyPayment)}/month instead of the minimum saves about ${usd(c.minimum.totalInterest - c.chosen.totalInterest)} in interest and clears the card in ${duration(c.chosen.months)}.`, href: "/credit", cta: "Payment plans" });
  if (card.monthlyNewSpending > 0 && (c.chosen.growing || c.minimum.growing))
    insights.push({ tone: "warn", text: `New spending of ${usd(card.monthlyNewSpending)}/month is more than your payment covers, so the balance won't go down.`, href: "/credit", cta: "Fix the plan" });
  if (card.balance > 0 && card.monthlyPayment <= monthly * 0.2)
    insights.push({ tone: "good", text: `Your ${usd(card.monthlyPayment)} card payment fits inside the 20% savings-and-debt slice of take-home (${usd(monthly * 0.2)}/month).`, href: "/paycheck", cta: "See budget" });
  const visible = showAll ? insights : insights.slice(0, 2);

  const next = missing[0] ?? { text: "Everything's in place. Ask FinPilot to explain your numbers or review your estimate.", href: "/finpilot", cta: "Ask FinPilot" };

  const actions = [
    { label: "Ask a financial question", icon: MessageCircle, onClick: () => setTutorOpen(true) },
    { label: "Upload a document", icon: FileUp, href: "/taxes" },
    { label: "Review tax estimate", icon: Receipt, href: "/taxes" },
    chat.length > 0
      ? { label: "Continue your conversation", icon: Sparkles, href: "/finpilot" }
      : { label: "Open My Budget", icon: PiggyBank, href: "/budget" },
  ];

  return (
    <motion.div variants={staggerParent(0.08)} initial={reduce ? false : "hidden"} animate="show">
      <AdvisorTabs />
      <PageHeader
        step="Financial Advisor · Overview"
        title={profile?.isDemo ? "Maya's financial overview" : "Your financial overview"}
        subtitle={profile?.isDemo ? "You're exploring sample data for Maya, a fictional 20-year-old. Nothing here is a real person's finances." : "Your income, taxes and next steps in one place."}
      />

      {/* Next best step + quick actions */}
      <motion.div variants={fadeUp} className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col justify-between gap-6 border-obsidian bg-obsidian text-paper">
          <div>
            <div className="text-[10px] tracking-[0.018em] text-paper/60 uppercase">Your next step</div>
            <p className="mt-3 text-[24px] leading-[1.17]">{next.text}</p>
          </div>
          <Link href={next.href} className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md bg-accent px-5 text-sm text-on-accent transition-colors duration-300 hover:bg-[#d6e41c]">
            {next.cta} <ArrowRight size={15} />
          </Link>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => {
            const inner = (
              <>
                <a.icon size={18} className="text-ink" />
                <span className="mt-4 text-[15px] leading-tight text-ink">{a.label}</span>
              </>
            );
            const cls = "lift flex min-h-24 flex-col justify-between rounded-2xl border border-line bg-card p-4 text-left";
            return "href" in a && a.href ? (
              <Link key={a.label} href={a.href} className={cls}>{inner}</Link>
            ) : (
              <button key={a.label} type="button" onClick={a.onClick} className={cls}>{inner}</button>
            );
          })}
        </div>
      </motion.div>

      {/* Financial overview */}
      <h2 className="mt-12 mb-4 text-[11px] tracking-[0.05em] text-ink-3 uppercase">Financial overview</h2>
      <motion.div variants={fadeUp} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5"><Stat label="Monthly take-home" value={<AnimatedNumber value={monthly} format={(n) => usd(n)} />} sub={`from ${usd(pay.annualGross)}/yr gross`} /></Card>
        <Card className="p-5">
          {t ? <Stat label="2025 federal tax (est.)" value={<AnimatedNumber value={t.tax} format={(n) => usd(n)} />} sub={`${pct(t.effectiveRate * 100, 1)} effective rate`} /> : (
            <div>
              <div className="text-xs font-medium tracking-wide text-ink-3 uppercase">2025 federal tax</div>
              <Link href="/taxes" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand">Add a W-2 to estimate <ArrowRight size={13} /></Link>
            </div>
          )}
        </Card>
        <Card className="p-5">
          {t ? <Stat label={t.refund >= 0 ? "Expected refund" : "May owe"} value={<AnimatedNumber value={Math.abs(t.refund)} format={(n) => usd(n)} />} tone={t.refund >= 0 ? "good" : "bad"} sub="withheld minus estimated tax" /> : <Stat label="Refund or owed" value="—" sub="needs your W-2" />}
        </Card>
        <Card className="p-5">
          <Stat label="Needs attention" value={String(missing.length)} tone={missing.length ? "warn" : "good"} sub={missing.length ? "items below" : "nothing missing"} />
        </Card>
      </motion.div>

      {missing.length > 0 && (
        <ul className="mt-3 space-y-2">
          {missing.map((m) => (
            <li key={m.text} className="flex items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm">
              <AlertCircle size={16} className="shrink-0 text-warn" />
              <span className="flex-1 text-ink">{m.text}</span>
              <Link href={m.href} className="shrink-0 font-semibold text-ink underline-offset-2 hover:underline">{m.cta}</Link>
            </li>
          ))}
        </ul>
      )}

      {/* Charts */}
      <motion.div variants={fadeUp} className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Income vs. spending</h3>
            {banking?.source && <Badge tone={banking.source.provider === "nessie" ? "info" : "default"}>{banking.source.provider === "nessie" ? "Nessie sandbox (demo)" : "Fictional sample data"}</Badge>}
          </div>
          {bankingState === "loading" && <ChartFallback />}
          {bankingState === "unavailable" && <EmptyState title="No transactions yet" body="Connect demo banking data on My Budget to see your monthly income and spending." action={<Link href="/budget" className="text-sm font-semibold text-brand">Open My Budget →</Link>} />}
          {bankingState === "ready" && banking && (banking.trend.length ? <IncomeSpendingChart data={banking.trend} /> : <EmptyState title="No transactions yet" body="Sync demo data on My Budget to see your monthly income and spending." />)}
          {banking?.source && <p className="mt-2 text-xs text-ink-3">{banking.source.label} Own-account transfers aren&apos;t counted.</p>}
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">2025 tax estimate</h3>
          {t ? (
            <>
              <TaxChart withheld={t.withholding} tax={t.tax} />
              <details className="group mt-2 text-sm">
                <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold text-brand">
                  How this is calculated <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                </summary>
                <ol className="mt-2 space-y-1 text-ink-2">
                  <li>W-2 wages <span className="num font-semibold text-ink">{usd(t.grossIncome)}</span> − standard deduction <span className="num font-semibold text-ink">{usd(t.standardDeduction)}</span></li>
                  <li>= taxable income <span className="num font-semibold text-ink">{usd(t.taxableIncome)}</span>, taxed using the 2025 IRS {t.method}</li>
                  <li>Withheld <span className="num font-semibold text-ink">{usd(t.withholding)}</span> − tax <span className="num font-semibold text-ink">{usd(t.tax)}</span> = {t.refund >= 0 ? "refund" : "owed"} <span className="num font-semibold text-ink">{usd(Math.abs(t.refund))}</span></li>
                </ol>
              </details>
            </>
          ) : (
            <EmptyState icon={<FileUp size={18} />} title="No tax documents yet" body="Upload your first W-2 to begin understanding your tax situation." action={<Link href="/taxes" className="inline-flex min-h-11 items-center gap-1 rounded-md bg-accent px-5 text-sm text-on-accent">Upload a W-2</Link>} />
          )}
        </Card>
      </motion.div>

      {/* Agents + documents */}
      <motion.div variants={fadeUp} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold"><Bot size={17} className="text-brand" /> Agent activity</h3>
            {!IS_STATIC && <Link href="/agents" className="text-sm font-semibold text-brand">Open console →</Link>}
          </div>
          {agentRun === undefined && <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
          {agentRun === null && <EmptyState title="No agent runs yet" body="When you ask the agents to check a return, each specialist's progress shows up here." action={!IS_STATIC ? <Link href="/agents" className="text-sm font-semibold text-brand">Try the Agent Console →</Link> : undefined} />}
          {agentRun && (
            <>
              <p className="mb-3 text-sm text-ink-2">
                Last run: <b className="text-ink">{agentRun.status === "awaiting-approval" ? "waiting for your approval" : agentRun.status}</b>
                {agentRun.verification && <> · verification <b className="text-ink">{agentRun.verification.status}</b></>}
              </p>
              <div className="rounded-xl border border-line bg-sunken px-3 pt-3 pb-1"><AgentActivityIndicator events={agentRun.events} shown={agentRun.events.length} busy={false} /></div>
            </>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><FileCheck2 size={17} className="text-brand" /> Documents</h3>
          {w2 || t ? (
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between rounded-xl border border-line bg-sunken px-3 py-2.5">
                <span>Form W-2 {profile?.isDemo && <span className="text-ink-3">(synthetic demo document)</span>}</span>
                <Badge tone={t ? "good" : "default"}>{t ? "Used in estimate" : "Added"}</Badge>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-dashed border-line px-3 py-2.5 text-ink-2">
                <span>Other income (1099s, interest)</span>
                <span className="text-xs">Only if you have it</span>
              </li>
            </ul>
          ) : (
            <EmptyState icon={<FileUp size={18} />} title="No financial documents yet" body="Most first-time filers only need a W-2 from their employer. We'll tell you if anything else is required." action={<Link href="/taxes" className="text-sm font-semibold text-brand">Upload a document →</Link>} />
          )}
        </Card>
      </motion.div>

      {/* Insights with progressive disclosure */}
      {insights.length > 0 && (
        <>
          <h2 className="mt-12 mb-4 flex items-center gap-2 text-[11px] tracking-[0.05em] text-ink-3 uppercase"><Lightbulb size={15} /> What stands out</h2>
          <motion.div layout className="grid gap-3 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {visible.map((i) => (
                <motion.div key={i.text} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Card interactive className="flex h-full flex-col justify-between gap-3 p-5">
                    <div className="flex gap-3">
                      <Badge tone={i.tone}>{i.tone === "good" ? "On track" : i.tone === "warn" ? "Watch" : "Tip"}</Badge>
                      <p className="text-sm text-ink">{i.text}</p>
                    </div>
                    <Link href={i.href} className="inline-flex items-center gap-1 self-end text-sm font-semibold text-brand hover:underline">{i.cta} <ArrowRight size={14} /></Link>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          {insights.length > 2 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
              {showAll ? "Show less" : `Show ${insights.length - 2} more`} <ChevronDown size={14} className={cn("transition-transform", showAll && "rotate-180")} />
            </button>
          )}
        </>
      )}

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => {
            setTutorOpen(true);
            askTutorQuestion("Where did my paycheck go?", "/advisor");
          }}
          className="inline-flex items-center gap-2 rounded-md border border-line bg-card px-4 py-2 text-sm font-semibold text-ink-2 hover:text-ink"
        >
          <Sparkles size={15} className="text-brand" /> Ask FinPilot to explain these numbers
        </button>
      </div>
      <p className="mt-6 text-xs text-ink-3">Observations come from simple rules applied to your numbers. They&apos;re educational, not personalized financial advice.</p>
    </motion.div>
  );
}
