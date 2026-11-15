"use client";
// Agent status board. Every state shown here is derived from real events the backend
// returned (or from an in-flight request). Nothing is simulated, and internal model
// reasoning is never displayed — only each agent's action and outcome.
import { motion } from "framer-motion";
import { Bot, Calculator, CheckCircle2, FileSearch, Landmark, Lightbulb, MessageSquareText, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "./ui";

export type AgentEvent = { seq: number; agent: string; type: string; title: string; detail?: string };

export const AGENT_META: Record<string, { label: string; task: string; icon: LucideIcon; color: string }> = {
  supervisor: { label: "Supervisor", task: "Planning and delegating", icon: Bot, color: "#0f1d2e" },
  document: { label: "Document Agent", task: "Extracting information", icon: FileSearch, color: "#2a78d6" },
  research: { label: "Research Agent", task: "Checking IRS guidance", icon: Landmark, color: "#6250d6" },
  calculation: { label: "Calculation Agent", task: "Computing verified estimates", icon: Calculator, color: "#1baf7a" },
  verification: { label: "Verification Agent", task: "Reviewing the results", icon: ShieldCheck, color: "#eb6834" },
  planning: { label: "Planning Agent", task: "Finding opportunities", icon: Lightbulb, color: "#b7790d" },
  communication: { label: "Advisor Agent", task: "Preparing the explanation", icon: MessageSquareText, color: "#3a4859" },
};

const ORDER = ["document", "research", "calculation", "verification", "planning", "communication"];

export type AgentState = "idle" | "waiting" | "active" | "done" | "issue";

/** Status per agent from the events revealed so far. */
export function agentStates(events: AgentEvent[], shown: number, busy: boolean): Record<string, AgentState> {
  const seen = events.slice(0, shown);
  const last = seen[seen.length - 1];
  const out: Record<string, AgentState> = {};
  for (const a of ORDER) {
    const mine = seen.filter((e) => e.agent === a);
    if (mine.some((e) => e.type === "blocked" || e.type === "error")) out[a] = "issue";
    else if (last?.agent === a && shown < events.length) out[a] = "active";
    else if (mine.length) out[a] = "done";
    else out[a] = busy || shown < events.length ? "waiting" : "idle";
  }
  return out;
}

const STATE_LABEL: Record<AgentState, string> = { idle: "Not used", waiting: "Waiting", active: "Working", done: "Done", issue: "Needs attention" };

export function AgentStatusBoard({ events, shown, busy, compact }: { events: AgentEvent[]; shown: number; busy: boolean; compact?: boolean }) {
  const states = agentStates(events, shown, busy);
  return (
    <ul className={cn("grid gap-2", compact ? "grid-cols-1" : "sm:grid-cols-2")} aria-label="Agent status">
      {ORDER.map((a) => {
        const meta = AGENT_META[a];
        const st = states[a];
        const Icon = meta.icon;
        return (
          <motion.li
            key={a}
            layout
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-300",
              st === "active" ? "border-ink bg-card" : st === "issue" ? "border-warn/40 bg-warn-soft" : "border-line bg-card",
              st === "idle" && "opacity-60",
            )}
          >
            <span className={cn("relative grid h-8 w-8 shrink-0 place-items-center rounded-md", st === "active" ? "bg-obsidian text-accent" : "bg-sunken text-ink")}>
              <Icon size={15} />
              {(st === "active" || st === "waiting") && (
                <motion.span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent"
                  animate={{ scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{meta.label}</span>
              <span className="block truncate text-xs text-ink-3">{meta.task}</span>
            </span>
            <span className={cn("flex shrink-0 items-center gap-1 text-xs font-semibold", st === "done" ? "text-ink" : st === "issue" ? "text-warn" : "text-ink-3")}>
              {st === "done" && <CheckCircle2 size={13} />}
              {st === "issue" && <ShieldAlert size={13} />}
              {STATE_LABEL[st]}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// AgentActivityIndicator: the five specialists as connected nodes. A link "flows" once
// the agent before it has finished; the working agent pulses. All states come from
// agentStates() over real backend events — nothing advances on a timer.
const FLOW = ["document", "research", "calculation", "verification", "communication"] as const;
const FLOW_LABEL: Record<(typeof FLOW)[number], string> = {
  document: "Documents",
  research: "IRS research",
  calculation: "Calculation",
  verification: "Verification",
  communication: "Advisor",
};

export function AgentActivityIndicator({ events, shown, busy }: { events: AgentEvent[]; shown: number; busy: boolean }) {
  const states = agentStates(events, shown, busy);
  const done = (a: string) => states[a] === "done" || states[a] === "issue";
  return (
    <div className="w-full" role="img" aria-label={`Agent progress: ${FLOW.map((a) => `${FLOW_LABEL[a]} ${STATE_LABEL[states[a]].toLowerCase()}`).join(", ")}`}>
      <svg viewBox="0 0 500 70" className="h-16 w-full overflow-visible" aria-hidden>
        {FLOW.slice(0, -1).map((a, i) => {
          const x1 = 50 + i * 100 + 16;
          const x2 = 50 + (i + 1) * 100 - 16;
          return (
            <g key={a}>
              <line x1={x1} y1={26} x2={x2} y2={26} stroke="var(--color-line)" strokeWidth={2} />
              <motion.line
                x1={x1}
                y1={26}
                x2={x2}
                y2={26}
                stroke="var(--color-ink)"
                strokeWidth={2}
                initial={false}
                animate={{ pathLength: done(a) ? 1 : 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              />
            </g>
          );
        })}
        {FLOW.map((a, i) => {
          const st = states[a];
          const cx = 50 + i * 100;
          return (
            <g key={a}>
              {st === "active" && (
                <motion.circle cx={cx} cy={26} r={14} fill="var(--color-accent)" initial={{ opacity: 0.5, scale: 1 }} animate={{ opacity: 0, scale: 1.9 }} transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }} style={{ transformOrigin: `${cx}px 26px` }} />
              )}
              <motion.circle
                cx={cx}
                cy={26}
                r={12}
                initial={false}
                animate={{
                  fill: st === "active" ? "var(--color-accent)" : st === "done" ? "var(--color-ink)" : st === "issue" ? "var(--color-warn)" : "var(--color-card)",
                  stroke: st === "idle" || st === "waiting" ? "var(--color-smoke)" : "var(--color-ink)",
                }}
                strokeWidth={2}
                transition={{ duration: 0.25 }}
              />
              {st === "done" && <path d={`M${cx - 5} 26 l3.5 3.5 l6.5 -7`} fill="none" stroke="var(--color-paper)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
              {st === "issue" && <text x={cx} y={30.5} textAnchor="middle" fontSize={13} fill="var(--color-card)">!</text>}
              <text x={cx} y={60} textAnchor="middle" fontSize={11} fill="var(--color-ink-3)">{FLOW_LABEL[a]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
