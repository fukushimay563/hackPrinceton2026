"use client";
import Link from "next/link";
import { ArrowRight, CreditCard, Lightbulb, PiggyBank, Sparkles, Wallet } from "lucide-react";
import { useApp } from "@/lib/store";
import { computePaycheck, PERIODS } from "@/lib/finance/paycheck";
import { cardSummary } from "@/lib/finance/credit";
import { askTutorQuestion } from "@/lib/tutor/ask";
import { duration, pct, usd } from "@/lib/format";
import { AdvisorTabs } from "@/components/AppShell";
import { Badge, Button, Card, PageHeader, Stat } from "@/components/ui";

export default function AdvisorPage() {
  const { paycheck, card, profile, setTutorOpen } = useApp();
  const pay = computePaycheck(paycheck);
  const monthly = (pay.net * PERIODS[paycheck.frequency]) / 12;
  const c = cardSummary(card);
  const savings20 = monthly * 0.2;
  const paymentShare = monthly ? (card.monthlyPayment / monthly) * 100 : 0;

  // Rule-based observations from the user's own numbers. Education, not advice.
  const insights: { tone: "good" | "warn" | "info"; text: string; href: string; cta: string }[] = [];
  if (card.balance > 0 && c.minimum.months !== null && c.chosen.months !== null && c.minimum.totalInterest - c.chosen.totalInterest > 1) {
    insights.push({
      tone: "info",
      text: `Paying ${usd(card.monthlyPayment)} a month instead of the minimum saves about ${usd(c.minimum.totalInterest - c.chosen.totalInterest)} in interest and clears the card in ${duration(c.chosen.months)} instead of ${duration(c.minimum.months)}.`,
      href: "/credit",
      cta: "Explore payment plans",
    });
  }
  if (c.utilizationPct > 30) {
    insights.push({
      tone: "warn",
      text: `You're using ${pct(c.utilizationPct)} of your credit limit. Under about 30% (${usd(card.creditLimit * 0.3)} here) is a common rule of thumb, and utilization is one factor in credit scores.`,
      href: "/credit",
      cta: "See utilization",
    });
  }
  if (card.monthlyNewSpending > 0 && (c.chosen.growing || c.minimum.growing)) {
    insights.push({
      tone: "warn",
      text: `New spending of ${usd(card.monthlyNewSpending)} a month is more than your payment covers, so the balance won't go down.`,
      href: "/credit",
      cta: "Fix the plan",
    });
  }
  if (card.balance > 0 && card.monthlyPayment <= savings20) {
    insights.push({
      tone: "good",
      text: `Your ${usd(card.monthlyPayment)} card payment fits inside the 20% "savings and debt" slice of your take-home (${usd(savings20)}/month).`,
      href: "/paycheck",
      cta: "See your budget",
    });
  }
  insights.push({
    tone: "info",
    text: "Your W-2 withholding decides whether you get a refund or owe. The Tax Assistant can estimate it in about 3 minutes.",
    href: "/taxes",
    cta: "Open Tax Assistant",
  });

  return (
    <div>
      <AdvisorTabs />
      <PageHeader
        step="Financial Advisor"
        title={profile?.isDemo ? "Maya's money snapshot" : "Your money snapshot"}
        subtitle="Your paycheck and credit card, in one view, with clear next steps."
        right={
          <Button
            variant="secondary"
            onClick={() => {
              setTutorOpen(true);
              askTutorQuestion("Where did my paycheck go?", "/advisor");
            }}
          >
            <Sparkles size={16} className="text-brand" /> Explain my numbers
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <Stat label="Monthly take-home" value={usd(monthly)} sub={`from ${usd(pay.annualGross)}/yr gross`} tone="good" />
        </Card>
        <Card className="p-5">
          <Stat label="Card balance" value={usd(card.balance)} sub={`${card.apr}% APR · ${pct(c.utilizationPct)} of limit`} tone={c.utilizationPct > 30 ? "warn" : "default"} />
        </Card>
        <Card className="p-5">
          <Stat label="Payoff at your plan" value={c.chosen.months === null ? "Never" : duration(c.chosen.months)} sub={`${usd(card.monthlyPayment)}/mo · ${pct(paymentShare, 1)} of take-home`} />
        </Card>
        <Card className="p-5">
          <Stat label="Interest at your plan" value={usd(c.chosen.totalInterest)} sub={`Minimum only: ${usd(c.minimum.totalInterest)}`} tone="bad" />
        </Card>
      </div>

      <h2 className="mt-8 flex items-center gap-2 text-lg font-semibold">
        <Lightbulb size={18} className="text-brand" /> What stands out
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {insights.map((i) => (
          <Card key={i.text} className="flex flex-col justify-between gap-3 p-5">
            <div className="flex gap-3">
              <Badge tone={i.tone}>{i.tone === "good" ? "On track" : i.tone === "warn" ? "Watch" : "Tip"}</Badge>
              <p className="text-sm text-ink">{i.text}</p>
            </div>
            <Link href={i.href} className="inline-flex items-center gap-1 self-end text-sm font-semibold text-brand hover:underline">
              {i.cta} <ArrowRight size={14} />
            </Link>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Tools</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {[
          { href: "/paycheck", icon: Wallet, title: "Paycheck breakdown", body: "Taxes, FICA and take-home, plus a 50/30/20 starting budget." },
          { href: "/credit", icon: CreditCard, title: "Credit card simulator", body: "See interest, payoff time and utilization change as you drag." },
          { href: "/academy", icon: PiggyBank, title: "Learn the basics", body: "Short lessons on paychecks, W-2s and taxes in the Academy." },
        ].map((t) => (
          <Link key={t.href} href={t.href} className="rounded-2xl border border-line bg-white p-5 transition-colors hover:border-brand">
            <t.icon size={20} className="text-brand" />
            <div className="mt-3 font-semibold">{t.title}</div>
            <p className="mt-1 text-sm text-ink-2">{t.body}</p>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-xs text-ink-3">
        These observations come from simple rules applied to your numbers. They&apos;re educational, not personalized financial advice.
      </p>
    </div>
  );
}
