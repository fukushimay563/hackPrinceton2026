"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PiggyBank, CreditCard, FileText, GraduationCap, LineChart, MessageCircle, Sparkles, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/supabase/useSession";
import { Button, Card, cn } from "./ui";
import { TutorPanel } from "./TutorPanel";

/** The four MVP features. `match` = paths that highlight the tab. */
export const FEATURES = [
  { href: "/advisor", label: "Financial Advisor", short: "Advisor", icon: LineChart, match: ["/advisor", "/paycheck", "/credit", "/budget"] },
  { href: "/taxes", label: "Tax Assistant", short: "Taxes", icon: FileText, match: ["/taxes"] },
  { href: "/academy", label: "Academy", short: "Academy", icon: GraduationCap, match: ["/academy"] },
  { href: "/finpilot", label: "FinPilot", short: "FinPilot", icon: MessageCircle, match: ["/finpilot", "/agents"] },
];

/** Pages that work with Maya's demo or your own numbers. */
const NEEDS_PROFILE = ["/advisor", "/paycheck", "/credit"];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-sm font-bold text-mint">F</span>
      <span>FirstFunds</span>
    </Link>
  );
}

export function AdvisorTabs() {
  const path = usePathname();
  const tabs = [
    { href: "/advisor", label: "Overview", icon: LineChart },
    { href: "/budget", label: "My Budget", icon: PiggyBank },
    { href: "/paycheck", label: "Paycheck", icon: Wallet },
    { href: "/credit", label: "Credit card", icon: CreditCard },
  ];
  return (
    <nav aria-label="Financial Advisor" className="surface mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-line p-1">
      {tabs.map((t) => {
        const on = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn("relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors", on ? "text-paper" : "text-ink-2 hover:bg-ink/5")}
          >
            {on && <motion.span layoutId="advisor-tab" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <t.icon size={15} className="relative" /> <span className="relative">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { profile, setTutorOpen, loadDemo, startFresh } = useApp();
  const auth = useSession();
  const needsProfile = NEEDS_PROFILE.some((p) => path.startsWith(p));
  const active = FEATURES.find((f) => f.match.some((m) => path.startsWith(m)));

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-20 border-b border-line/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav aria-label="Features" className="hidden items-center gap-1 rounded-full border border-line bg-card/70 p-1 md:flex">
            {FEATURES.map((f) => {
              const on = f === active;
              return (
                <Link
                  key={f.href}
                  href={f.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    on ? "text-paper" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {on && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                  <f.icon size={15} className={cn("relative", on && "text-mint")} />
                  <span className="relative">{f.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {auth.configured && !auth.loading && (
              <Link href="/account" className="hidden rounded-full border border-line bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink sm:block">
                {auth.label ?? "Sign in"}
              </Link>
            )}
            {profile?.isDemo && (
              <span className="hidden items-center gap-2 rounded-full border border-warn/30 bg-warn-soft px-3 py-1 text-sm text-warn lg:flex" title="Sample data, not a real person">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-card text-[11px] font-bold text-ink">M</span>
                Demo: Maya
              </span>
            )}
            <ThemeToggle />
            {!path.startsWith("/finpilot") && (
              <Button variant="primary" onClick={() => setTutorOpen(true)} className="py-2">
                <Sparkles size={16} /> <span className="sr-only sm:not-sr-only">Ask FinPilot</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile: bottom tab bar within thumb reach */}
      <nav aria-label="Features" className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-line px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        {FEATURES.map((f) => {
          const on = f === active;
          return (
            <Link
              key={f.href}
              href={f.href}
              aria-current={on ? "page" : undefined}
              className={cn("relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold", on ? "text-paper" : "text-ink-2")}
            >
              {on && <motion.span layoutId="nav-pill-mobile" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <f.icon size={18} className="relative" />
              <span className="relative">{f.short}</span>
            </Link>
          );
        })}
      </nav>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:pt-10 md:pb-10">
        {!needsProfile || profile ? (
          children
        ) : (
          <Card className="mx-auto max-w-lg text-center">
            <h2 className="text-xl font-semibold">See it with real numbers</h2>
            <p className="mt-2 text-ink-2">
              Load Maya&apos;s sample finances to explore, or start with your own paycheck and card. No personal info needed.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={loadDemo}>
                <Sparkles size={16} /> Try Maya&apos;s demo
              </Button>
              <Button variant="secondary" onClick={() => startFresh("You")}>
                Use my own numbers
              </Button>
              <Button variant="ghost" onClick={() => router.push("/")}>
                Home
              </Button>
            </div>
          </Card>
        )}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-28 text-xs leading-relaxed text-ink-3 md:pb-10">
        Educational guidance only. FirstFunds isn&apos;t a licensed financial advisor or tax preparer and doesn&apos;t file tax returns. Nothing is
        saved after you close the tab unless you sign in. <Link href="/methodology" className="underline">How we calculate</Link>
      </footer>
      <TutorPanel />
    </div>
  );
}
