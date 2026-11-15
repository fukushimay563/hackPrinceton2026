"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, FileText, FileUp, GraduationCap, LineChart, Lock, MessageCircle, Sparkles } from "lucide-react";
import { Logo } from "@/components/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useApp } from "@/lib/store";
import { AnimatedSection, StaggerContainer, StaggerItem } from "@/components/motion";
import { computeTax } from "@/lib/finance/tax2025";
import { computePaycheck } from "@/lib/finance/paycheck";
import { MAYA_PAYCHECK, MAYA_TAX } from "@/lib/demo/maya";
import { ALL_LESSONS } from "@/lib/academy/lessons";
import { usd } from "@/lib/format";

const mayaPay = computePaycheck(MAYA_PAYCHECK);
const mayaTax = computeTax(MAYA_TAX);

// Product facts only (no simulated "live" counters).
const FACTS = [
  { label: "Specialist agents", value: "6" },
  { label: "Tax year covered", value: "2025 IRS figures" },
  { label: "Academy lessons", value: String(ALL_LESSONS.length) },
  { label: "SSNs or account numbers needed", value: "0" },
];

export default function Home() {
  const router = useRouter();
  const { loadDemo, profile } = useApp();

  const startDemo = () => {
    if (!profile) loadDemo();
    router.push("/advisor");
  };

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-20 border-b border-line">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/finpilot" className="hidden min-h-9 items-center rounded-md px-3 text-sm text-ink transition-colors duration-300 hover:bg-sunken sm:inline-flex">
              Open the advisor
            </Link>
            <button type="button" onClick={startDemo} className="inline-flex min-h-9 items-center rounded-md bg-accent px-4 text-sm text-on-accent transition-colors duration-300 hover:bg-[#d6e41c]">
              See the demo
            </button>
          </div>
        </div>
      </header>

      <main>
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mx-auto grid max-w-[1200px] items-start gap-12 px-5 pt-16 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-24"
        >
          <div>
            <div className="text-[11px] tracking-[0.05em] text-ink-3 uppercase">AI financial &amp; tax advisor · for first-timers</div>
            <h1 className="mt-5 text-[44px] leading-[1.0] text-ink sm:text-[64px]">Your finances, finally making sense.</h1>
            <p className="mt-6 max-w-xl text-[20px] leading-[1.3] text-ink-3">
              Get clarity on your taxes, understand your finances, and find your next best move with an AI-powered financial advisor.
            </p>

            <StaggerContainer delay={0.25} stagger={0.07} className="mt-10 grid gap-2 sm:grid-cols-3">
              <StaggerItem className="h-full"><ActionCard primary icon={MessageCircle} title="Ask a question" body="Plain-English answers with sources. Nothing to upload." onClick={() => router.push("/finpilot")} /></StaggerItem>
              <StaggerItem className="h-full"><ActionCard icon={FileUp} title="Upload a tax document" body="Add a W-2 for a reviewable 2025 estimate." onClick={() => router.push("/taxes")} /></StaggerItem>
              <StaggerItem className="h-full"><ActionCard icon={Sparkles} title="Explore with demo data" body="Maya, a sample 20-year-old. No account needed." onClick={startDemo} /></StaggerItem>
            </StaggerContainer>

            <p className="mt-6 flex items-start gap-2 text-sm text-ink-3">
              <Lock size={14} className="mt-0.5 shrink-0" />
              No sign-up. We ask for information only when a task needs it, and say why.
            </p>
          </div>

          {/* Product frame */}
          <div className="rounded-2xl border border-line bg-card">
            <div className="flex items-center gap-1.5 border-b border-line px-4 py-3" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-smoke" />
              <span className="h-2.5 w-2.5 rounded-full bg-smoke" />
              <span className="h-2.5 w-2.5 rounded-full bg-smoke" />
              <span className="ml-3 text-xs text-ink-3">firstfunds · overview</span>
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] tracking-[0.05em] text-ink-3 uppercase">Maya, 20 · first job</div>
                  <div className="mt-1 text-[24px] leading-[1.17] text-ink">2025 return estimate</div>
                </div>
                <span className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-3">Demo data</span>
              </div>
              <dl className="mt-6 divide-y divide-line border-y border-line">
                <Row label="Take-home per paycheck" value={usd(mayaPay.net, true)} />
                <Row label="Federal tax (IRS tax table)" value={usd(mayaTax.tax)} />
                <Row label="Expected refund" value={usd(mayaTax.refund)} highlight />
              </dl>
              <div className="mt-5 rounded-xl bg-sunken p-4 text-sm text-ink-2">
                Every number comes from deterministic tax math, and a verification step re-checks it before you see it.
              </div>
              <button type="button" onClick={startDemo} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 text-sm text-on-accent transition-colors duration-300 hover:bg-[#d6e41c]">
                Open Maya&apos;s overview <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </motion.section>

        {/* Inverted facts band */}
        <AnimatedSection className="bg-obsidian text-paper">
          <dl className="mx-auto grid max-w-[1200px] grid-cols-2 gap-6 px-5 py-10 sm:grid-cols-4">
            {FACTS.map((f) => (
              <div key={f.label}>
                <dt className="text-[10px] tracking-[0.018em] text-paper/60 uppercase">{f.label}</dt>
                <dd className="num mt-1 text-[24px] leading-[1.17]">{f.value}</dd>
              </div>
            ))}
          </dl>
        </AnimatedSection>

        <AnimatedSection className="mx-auto max-w-[1200px] px-5 py-20">
          <h2 className="max-w-2xl text-[28px] leading-[1.14] text-ink sm:text-[40px] sm:leading-[1.05]">Everything a first-time filer needs, in one place.</h2>
          <StaggerContainer inView delay={0.1} className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/advisor", icon: LineChart, title: "Financial Advisor", body: "Paycheck, budget and credit card, with next steps.", demo: true },
              { href: "/taxes", icon: FileText, title: "Tax Assistant", body: "A reviewable 2025 estimate with a source for every number." },
              { href: "/academy", icon: GraduationCap, title: "Academy", body: `${ALL_LESSONS.length} short lessons on W-2s, withholding and filing.` },
              { href: "/finpilot", icon: MessageCircle, title: "FinPilot", body: "Ask anything. It explains your actual math." },
            ].map((f) => (
              <StaggerItem key={f.href} className="h-full">
              <button
                type="button"
                onClick={() => (f.demo ? startDemo() : router.push(f.href))}
                className="lift group flex h-full w-full flex-col rounded-2xl border border-line bg-card p-6 text-left"
              >
                <f.icon size={20} className="text-ink" />
                <div className="mt-8 text-[20px] leading-[1.3] text-ink">{f.title}</div>
                <p className="mt-1 text-sm text-ink-3">{f.body}</p>
                <span className="mt-6 inline-flex items-center gap-1 text-sm text-ink underline-offset-4 group-hover:underline">
                  Open <ArrowRight size={14} />
                </span>
              </button>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </AnimatedSection>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1200px] px-5 py-8 text-xs text-ink-3">
          Educational guidance only. FirstFunds isn&apos;t a licensed financial advisor or tax preparer and doesn&apos;t file tax returns.{" "}
          <Link href="/methodology" className="underline">
            How we calculate
          </Link>
        </div>
      </footer>
    </div>
  );
}

function ActionCard({ icon: Icon, title, body, onClick, primary }: { icon: typeof FileUp; title: string; body: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`lift group flex h-full w-full flex-col rounded-xl border p-4 text-left ${primary ? "border-accent bg-accent text-on-accent hover:bg-[#d6e41c]" : "border-line bg-card text-ink hover:border-ink-3"}`}
    >
      <Icon size={18} />
      <span className="mt-6 flex items-center gap-1 text-[16px]">
        {title} <ArrowRight size={14} />
      </span>
      <span className={`mt-1 text-[13px] leading-snug ${primary ? "text-on-accent/75" : "text-ink-3"}`}>{body}</span>
    </button>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-3">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className={`num text-[20px] text-ink ${highlight ? "bg-accent px-1.5 text-on-accent" : ""}`}>{value}</dd>
    </div>
  );
}
