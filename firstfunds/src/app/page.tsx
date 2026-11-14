"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, GraduationCap, LineChart, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/AppShell";
import { Button, Card } from "@/components/ui";
import { useApp } from "@/lib/store";
import { simulate } from "@/lib/finance/credit";
import { computeTax } from "@/lib/finance/tax2025";
import { computePaycheck } from "@/lib/finance/paycheck";
import { MAYA_CARD, MAYA_PAYCHECK, MAYA_TAX } from "@/lib/demo/maya";
import { ALL_LESSONS } from "@/lib/academy/lessons";
import { durationLong, usd } from "@/lib/format";

const mayaPay = computePaycheck(MAYA_PAYCHECK);
const mayaMin = simulate(MAYA_CARD, "minimum");
const mayaTax = computeTax(MAYA_TAX);

const FEATURES = [
  {
    href: "/advisor",
    icon: LineChart,
    tag: "Budget & credit",
    title: "Financial Advisor",
    body: "See where your paycheck goes and what a credit card balance really costs, with next steps from your own numbers.",
    demo: true,
  },
  {
    href: "/taxes",
    icon: FileText,
    tag: "2025 returns",
    title: "Tax Assistant",
    body: "Add your W-2 and answer only what it can't tell us. A reviewable estimate in about 3 minutes, with a source for every number.",
  },
  {
    href: "/academy",
    icon: GraduationCap,
    tag: "Only on FirstFunds",
    title: "Financial Advisory Academy",
    body: `${ALL_LESSONS.length} bite-size lessons that teach first-time taxpayers W-2s, withholding, brackets and filing, with hands-on examples and quizzes.`,
    highlight: true,
  },
  {
    href: "/finpilot",
    icon: MessageCircle,
    tag: "AI assistant",
    title: "FinPilot",
    body: "Ask anything about money, taxes or the app. It explains your actual math and cites IRS and CFPB sources.",
  },
];

export default function Home() {
  const router = useRouter();
  const { loadDemo, profile } = useApp();

  const open = (href: string, demo?: boolean) => {
    if (demo && !profile) loadDemo();
    router.push(href);
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <Button variant="secondary" onClick={() => open("/advisor", true)}>
          Try the demo
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="grid items-center gap-10 py-10 md:grid-cols-[1.1fr_1fr] md:py-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-ink-2">
              <Sparkles size={14} className="text-brand" /> For your first paycheck, first card, first tax return
            </div>
            <h1 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight text-ink sm:text-6xl">
              Money gets real fast.
              <br />
              <span className="text-brand">Understand it first.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">
              FirstFunds helps young adults budget, handle credit, and file a first tax return, and teaches the why along the way.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button className="px-5 py-3 text-base" onClick={() => open("/advisor", true)}>
                <Sparkles size={18} /> Try Maya&apos;s demo
              </Button>
              <Button variant="secondary" className="px-5 py-3 text-base" onClick={() => router.push("/academy")}>
                <GraduationCap size={18} /> Start learning
              </Button>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-3">
              <ShieldCheck size={16} /> No sign-up needed. Nothing is saved after you close the tab unless you sign in.
            </p>
          </div>

          <Card className="relative overflow-hidden">
            <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-mint/40 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-lg font-bold text-brand-2">M</div>
                <div>
                  <div className="font-semibold">Maya, 20</div>
                  <div className="text-sm text-ink-3">First job · first credit card · first tax return</div>
                </div>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-paper p-4">
                  <dt className="text-xs text-ink-3">Gross paycheck</dt>
                  <dd className="num text-xl font-semibold">{usd(mayaPay.gross)}</dd>
                </div>
                <div className="rounded-xl bg-paper p-4">
                  <dt className="text-xs text-ink-3">Take-home</dt>
                  <dd className="num text-xl font-semibold text-brand">{usd(mayaPay.net, true)}</dd>
                </div>
                <div className="col-span-2 rounded-xl bg-debt-soft p-4">
                  <dt className="text-xs text-debt">$600 on her card, minimum payments only</dt>
                  <dd className="num mt-1 text-xl font-semibold text-debt">
                    {durationLong(mayaMin.months)} · {usd(mayaMin.totalInterest)} interest
                  </dd>
                </div>
                <div className="col-span-2 rounded-xl bg-brand-soft p-4">
                  <dt className="text-xs text-brand-2">2025 tax return estimate</dt>
                  <dd className="num mt-1 text-xl font-semibold text-brand-2">{usd(mayaTax.refund)} refund</dd>
                </div>
              </dl>
            </div>
          </Card>
        </section>

        <section className="pb-16">
          <h2 className="text-2xl font-semibold tracking-tight">Four ways FirstFunds helps</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <button
                key={f.href}
                onClick={() => open(f.href, f.demo)}
                className={`group rounded-2xl border p-6 text-left transition-colors ${f.highlight ? "border-brand bg-brand-soft/60 hover:bg-brand-soft" : "border-line bg-white hover:border-brand"}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${f.highlight ? "bg-brand text-white" : "bg-paper text-brand"}`}>
                    <f.icon size={22} />
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${f.highlight ? "bg-brand text-white" : "bg-paper text-ink-2"}`}>{f.tag}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-ink-2">{f.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                  Open <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-ink-3">
        Educational guidance only. FirstFunds isn&apos;t a licensed financial advisor or tax preparer and doesn&apos;t file tax returns.{" "}
        <Link href="/methodology" className="underline">
          How we calculate
        </Link>
      </footer>
    </div>
  );
}
