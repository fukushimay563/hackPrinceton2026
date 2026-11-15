"use client";
import Link from "next/link";
import { IS_STATIC } from "@/lib/runtime";
import { Bot, CreditCard, FileText, Wallet } from "lucide-react";
import { useApp } from "@/lib/store";
import { cardSummary } from "@/lib/finance/credit";
import { computePaycheck } from "@/lib/finance/paycheck";
import { computeTax } from "@/lib/finance/tax2025";
import { duration, pct, usd } from "@/lib/format";
import { TutorChat } from "@/components/TutorChat";
import { Card, PageHeader } from "@/components/ui";

export default function TutorPage() {
  const { paycheck, card, tax } = useApp();
  const pay = computePaycheck(paycheck);
  const c = cardSummary(card);
  const t = tax.wages > 0 ? computeTax(tax) : null;

  return (
    <div>
      <PageHeader
        step="FinPilot AI Assistant"
        title="Your AI financial advisor"
        subtitle="Ask in plain English. Answers use your own numbers and cite IRS and CFPB sources."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <TutorChat />
        <div className="space-y-4">
          {!IS_STATIC && (
            <Link href="/agents" className="surface lift block rounded-2xl border border-brand/30 p-4 hover:border-brand/60">
              <div className="flex items-center gap-2 text-sm font-semibold"><Bot size={16} className="text-brand" /> Deep mode</div>
              <p className="mt-1 text-sm text-ink-2">Watch a team of specialist agents check a return, with verification before every answer.</p>
              <span className="mt-2 inline-block text-sm font-semibold text-brand">Open Agent Console →</span>
            </Link>
          )}
          <div className="text-xs font-semibold tracking-wide text-ink-3 uppercase">What FinPilot can see</div>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wallet size={16} className="text-brand" /> Paycheck
            </div>
            <dl className="mt-2 space-y-1 text-sm">
              <Row k="Gross / paycheck" v={usd(pay.gross)} />
              <Row k="Take-home" v={usd(pay.net, true)} />
            </dl>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard size={16} className="text-brand" /> Credit card
            </div>
            <dl className="mt-2 space-y-1 text-sm">
              <Row k="Balance" v={usd(card.balance)} />
              <Row k="APR" v={pct(card.apr, 2)} />
              <Row k="Utilization" v={pct(c.utilizationPct)} />
              <Row k="Minimum-only payoff" v={duration(c.minimum.months)} />
            </dl>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText size={16} className="text-brand" /> Taxes
            </div>
            {t ? (
              <dl className="mt-2 space-y-1 text-sm">
                <Row k="Taxable income" v={usd(t.taxableIncome)} />
                <Row k="Estimated tax" v={usd(t.tax)} />
                <Row k={t.refund >= 0 ? "Refund" : "Owed"} v={usd(Math.abs(t.refund))} />
              </dl>
            ) : (
              <p className="mt-2 text-sm text-ink-3">Finish the tax step to share it.</p>
            )}
          </Card>
          <p className="text-xs text-ink-3">
            Only these computed numbers are sent with your question: no names, SSNs, or account numbers.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-3">{k}</dt>
      <dd className="num font-semibold">{v}</dd>
    </div>
  );
}
