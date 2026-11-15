"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, FileUp, GraduationCap, LineChart, Lock, MessageCircle, Sparkles, FileText } from "lucide-react";
import { Logo } from "@/components/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card } from "@/components/ui";
import { useApp } from "@/lib/store";
import { computeTax } from "@/lib/finance/tax2025";
import { computePaycheck } from "@/lib/finance/paycheck";
import { MAYA_PAYCHECK, MAYA_TAX } from "@/lib/demo/maya";
import { ALL_LESSONS } from "@/lib/academy/lessons";
import { usd } from "@/lib/format";

const mayaPay = computePaycheck(MAYA_PAYCHECK);
const mayaTax = computeTax(MAYA_TAX);

const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function Home() {
  const router = useRouter();
  const { loadDemo, profile } = useApp();

  const startDemo = () => {
    if (!profile) loadDemo();
    router.push("/advisor");
  };

  const actions = [
    {
      icon: MessageCircle,
      title: "Ask a question",
      body: "Get a plain-English answer about taxes or money, with sources. Nothing to upload.",
      onClick: () => router.push("/finpilot"),
      primary: true,
    },
    {
      icon: FileUp,
      title: "Upload a tax document",
      body: "Add your W-2 and get a reviewable 2025 estimate. We only ask what it can't tell us.",
      onClick: () => router.push("/taxes"),
    },
    {
      icon: Sparkles,
      title: "Explore with demo data",
      body: "See everything with Maya, a sample 20-year-old. No account, no personal info.",
      onClick: startDemo,
    },
  ];

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/finpilot" className="rounded-full border border-line bg-card px-3.5 py-2 text-sm font-semibold text-ink-2 hover:text-ink">
            Open the advisor
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <motion.section
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.06 }}
          className="grid items-center gap-10 pt-8 pb-12 lg:grid-cols-[1.15fr_1fr] lg:pt-14"
        >
          <div>
            <motion.div variants={rise} className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-ink-2">
              <BadgeCheck size={14} className="text-brand" /> AI financial &amp; tax advisor for first-timers
            </motion.div>
            <motion.h1 variants={rise} className="mt-5 text-4xl leading-[1.04] font-semibold tracking-tight text-balance text-ink sm:text-6xl">
              Your finances, <span className="text-brand">finally making sense.</span>
            </motion.h1>
            <motion.p variants={rise} className="mt-5 max-w-xl text-lg text-ink-2">
              Get clarity on your taxes, understand your finances, and find your next best move with an AI-powered financial advisor.
            </motion.p>

            <motion.div variants={rise} className="mt-8 grid gap-3 sm:grid-cols-3">
              {actions.map((a) => (
                <button
                  key={a.title}
                  type="button"
                  onClick={a.onClick}
                  className={`group lift flex flex-col rounded-2xl border p-4 text-left ${a.primary ? "border-ink bg-ink text-paper dark:border-brand/40 dark:bg-brand-soft dark:text-ink" : "surface border-line text-ink hover:border-brand/50"}`}
                >
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${a.primary ? "bg-paper/10 text-mint dark:bg-brand dark:text-on-brand" : "bg-brand-soft text-brand"}`}>
                    <a.icon size={18} />
                  </span>
                  <span className="mt-3 flex items-center gap-1 font-semibold">
                    {a.title} <ArrowRight size={14} className="transition-transform duration-150 group-hover:translate-x-0.5" />
                  </span>
                  <span className={`mt-1 text-sm ${a.primary ? "text-paper/75 dark:text-ink-2" : "text-ink-2"}`}>{a.body}</span>
                </button>
              ))}
            </motion.div>

            <motion.p variants={rise} className="mt-5 flex items-start gap-2 text-sm text-ink-3">
              <Lock size={15} className="mt-0.5 shrink-0" />
              No sign-up. We ask for information only when a task needs it, and tell you why. Nothing is saved after you close the tab unless you sign in.
            </motion.p>
          </div>

          <motion.div variants={rise}>
            <Card className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft font-bold text-brand-2">M</div>
                  <div>
                    <div className="font-semibold">Maya, 20</div>
                    <div className="text-sm text-ink-3">First job · first card · first return</div>
                  </div>
                </div>
                <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">Demo data</span>
              </div>
              <div className="mt-5 space-y-3">
                <PreviewRow label="Take-home per paycheck" value={usd(mayaPay.net, true)} sub={`of ${usd(mayaPay.gross)} gross`} />
                <PreviewRow label="2025 federal tax estimate" value={usd(mayaTax.tax)} sub="calculated from the IRS tables" />
                <PreviewRow label="Expected refund" value={usd(mayaTax.refund)} sub="withheld minus estimated tax" tone="good" />
              </div>
              <div className="mt-5 rounded-xl border border-line bg-sunken p-3 text-sm text-ink-2">
                <span className="font-semibold text-ink">How estimates are checked:</span> numbers come from deterministic tax math, then a verification step re-checks them before you see them.
              </div>
            </Card>
          </motion.div>
        </motion.section>

        <section className="pb-16">
          <h2 className="text-sm font-semibold tracking-widest text-ink-3 uppercase">Everything in one place</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/advisor", icon: LineChart, title: "Financial Advisor", body: "Paycheck, budget and credit card, with next steps.", demo: true },
              { href: "/taxes", icon: FileText, title: "Tax Assistant", body: "A reviewable 2025 estimate with a source for every number." },
              { href: "/academy", icon: GraduationCap, title: "Academy", body: `${ALL_LESSONS.length} short lessons on W-2s, withholding and filing.` },
              { href: "/finpilot", icon: MessageCircle, title: "FinPilot", body: "Ask anything. It explains your actual math." },
            ].map((f) => (
              <button
                key={f.href}
                type="button"
                onClick={() => (f.demo ? startDemo() : router.push(f.href))}
                className="surface lift group rounded-2xl border border-line p-5 text-left hover:border-brand/40"
              >
                <f.icon size={20} className="text-brand" />
                <div className="mt-3 font-semibold">{f.title}</div>
                <p className="mt-1 text-sm text-ink-2">{f.body}</p>
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

function PreviewRow({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-line pb-3 last:border-0">
      <div>
        <div className="text-sm text-ink-2">{label}</div>
        <div className="text-xs text-ink-3">{sub}</div>
      </div>
      <div className={`num text-xl font-semibold ${tone === "good" ? "text-brand" : "text-ink"}`}>{value}</div>
    </div>
  );
}
