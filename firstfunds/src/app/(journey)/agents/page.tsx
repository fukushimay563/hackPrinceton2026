"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge, Card, cn } from "@/components/ui";
import { motion } from "framer-motion";
import { AGENT_META, AgentStatusBoard, type AgentEvent } from "@/components/AgentActivity";

type Check = { name: string; pass: boolean; detail: string };
type Run = {
  mode: string;
  status: string;
  events: AgentEvent[];
  todos: { content: string; status: string }[];
  verification?: { status: string; verifiedClaims: string[]; blockedClaims: { claim: string; reason: string }[]; checks: Check[] };
  calculation?: { status: string; breakdown: { wages: number; standardDeduction: number; taxableIncome: number; tax: number; method: string; withholding: number | null; refund: number | null } | null; assumptions: string[] };
  research?: { taxYear: number; citations: { sourceId: string; title: string; url: string; taxYear: number | "any" }[]; unverified: string[] };
  planning?: { opportunities: { id: string; title: string; question: string; note: string }[] };
  documents: { fileName: string; kind: string; issues: string[] }[];
};
type Bubble = { from: "user" | "finpilot" | "system"; text: string; status?: string };
type SecurityLog = { ok: boolean; label: string; detail: string };



const QUICK = ["Is my 2025 tax return ready?", "No", "What's my refund?", "STOP", "START"];
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part.replace(/^https?:\/\/[^/]+/, "")} className="break-all font-semibold underline">
        {part.includes("token=") ? "Open secure page" : "Open FirstFunds"}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function AgentConsole() {
  const [chat, setChat] = useState<Bubble[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [modes, setModes] = useState<{ agents: string; photon: string } | null>(null);
  const [security, setSecurity] = useState<SecurityLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/agents/state");
    if (!r.ok) return setError("The agent demo is only available in mock mode.");
    const s = await r.json();
    setModes(s.modes);
    if (!s.seeded) await fetch("/api/agents/demo", { method: "POST", body: JSON.stringify({ action: "reset" }) });
    setChat(s.chat ?? []);
    if (s.lastRun) {
      setRun(s.lastRun);
      setShown(s.lastRun.events.length); // already happened: show without replay
    }
  }, []);

  useEffect(() => {
    // Deferred so the first render matches the server.
    Promise.resolve().then(load);
    Promise.resolve().then(() => {
      try {
        setShowIntro(localStorage.getItem("ff-agents-intro") !== "dismissed");
      } catch {
        setShowIntro(true);
      }
    });
  }, [load]);

  function dismissIntro() {
    setShowIntro(false);
    try {
      localStorage.setItem("ff-agents-intro", "dismissed");
    } catch {}
  }

  useEffect(() => {
    // Braces matter: scroll methods may return a Promise, and React would treat it as a cleanup.
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat.length]);

  // Reveal agent events one by one (they already happened; this is just pacing).
  useEffect(() => {
    if (!run || shown >= run.events.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 220);
    return () => clearTimeout(t);
  }, [run, shown]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    setChat((c) => [...c, { from: "user", text }]);
    try {
      const r = await fetch("/api/agents/demo", { method: "POST", body: JSON.stringify({ action: "message", text }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? d.verification?.reason ?? "Request failed");
      setModes(d.modes);
      setSecurity((s) => [{ ok: true, label: "Webhook signature verified", detail: `Official verifySpectrumSignature · event ${String(d.verification.eventId).slice(0, 12)}…` }, ...s].slice(0, 6));
      if (d.run) {
        setRun(d.run);
        setShown(0);
      }
      // Show the reply after the timeline has played.
      const delay = d.run ? Math.min(d.run.events.length * 220 + 200, 4000) : 300;
      setTimeout(() => setChat(d.chat), delay);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function securityTest(kind: "tamper" | "replay") {
    const r = await fetch("/api/agents/demo", { method: "POST", body: JSON.stringify({ action: kind }) });
    const d = await r.json();
    if (kind === "tamper")
      setSecurity((s) => [{ ok: !d.verification.ok, label: "Forged webhook rejected", detail: d.verification.ok ? "UNEXPECTED: accepted" : `HTTP ${d.verification.status} · ${d.verification.reason}` }, ...s].slice(0, 6));
    else
      setSecurity((s) => [{ ok: d.status === "duplicate", label: "Replayed delivery ignored", detail: d.error ?? `Result: ${d.status} · messages sent: ${d.sent ?? 0}` }, ...s].slice(0, 6));
  }

  async function reset() {
    await fetch("/api/agents/demo", { method: "POST", body: JSON.stringify({ action: "reset" }) });
    setChat([]);
    setRun(null);
    setShown(0);
    setSecurity([]);
  }

  const v = run?.verification;
  const b = run?.calculation?.breakdown;
  const refundVerified = v?.verifiedClaims.includes("Refund or amount owed");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-widest text-brand uppercase">FinPilot · Deep mode</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Agent Console</h1>
          <p className="mt-1 max-w-2xl text-ink-2">
            Text FinPilot over Photon. A Deep Agents supervisor plans, delegates to six specialists, verifies everything, and only then replies.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {modes && (
            <>
              <Badge tone={modes.agents === "gemini" ? "good" : "info"}>Agents: {modes.agents === "gemini" ? "Gemini" : "mock policy model"}</Badge>
              <Badge tone={modes.photon === "live" ? "good" : "warn"}>Photon: {modes.photon === "live" ? "live" : "MOCK mode"}</Badge>
            </>
          )}
          <button onClick={reset} className="inline-flex items-center gap-1 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold hover:border-ink-3">
            <RotateCcw size={14} /> Reset demo
          </button>
        </div>
      </div>
      {error && <p className="mb-4 rounded-xl bg-debt-soft px-3 py-2 text-sm text-debt">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr_360px]">
        {/* Phone */}
        <div className="mx-auto w-full max-w-[340px]">
          <div className="rounded-[2.2rem] border-8 border-ink bg-ink shadow-xl">
            <div className="rounded-[1.6rem] bg-card">
              <div className="border-b border-line px-4 py-3 text-center">
                <div className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-on-brand">F</div>
                <div className="mt-1 text-xs font-semibold">FinPilot</div>
                <div className="text-[10px] text-ink-3">iMessage via Photon {modes?.photon === "mock" ? "(mock)" : ""}</div>
              </div>
              <div className="h-[420px] space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
                {chat.length === 0 && <p className="mt-16 text-center text-xs text-ink-3">Send a message to start. Maya&apos;s synthetic W-2s are already in her account.</p>}
                {chat.map((m, i) => (
                  <div key={i} className={cn("flex", m.from === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap", m.from === "user" ? "rounded-br-md bg-[#0a84ff] text-white" : "rounded-bl-md bg-[#e9e9eb] text-[#0f1d2e]")}>
                      {linkify(m.text)}
                      {m.status && m.from !== "user" && m.status !== "sent" && <div className="mt-1 text-[10px] opacity-60">{m.status}</div>}
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex">
                    <div className="rounded-2xl rounded-bl-md bg-[#e9e9eb] px-3 py-2 text-ink-3">
                      <Loader2 size={14} className="animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={chatEnd} />
              </div>
              <div className="flex flex-wrap gap-1 px-3 pb-2">
                {QUICK.map((q) => (
                  <button key={q} onClick={() => send(q)} disabled={busy} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-2 hover:border-ink-3 disabled:opacity-40">
                    {q}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-center gap-2 border-t border-line p-2"
              >
                <label htmlFor="sms" className="sr-only">
                  Message
                </label>
                <input id="sms" value={input} onChange={(e) => setInput(e.target.value)} placeholder="iMessage" className="flex-1 rounded-full border border-line px-3 py-2 text-sm outline-none focus:border-[#0a84ff]" />
                <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid h-8 w-8 place-items-center rounded-full bg-[#0a84ff] text-white disabled:opacity-40">
                  <ArrowUp size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <Card className="min-h-[520px]">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">Agent activity {busy && <span className="text-xs font-medium text-brand">· request in progress</span>}</h2>
            {run && <span className="text-xs text-ink-3">{run.status === "awaiting-approval" ? "Waiting for your approval" : `${run.events.length} steps`}</span>}
          </div>
          {showIntro && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-info/30 bg-info-soft p-3 text-xs text-info">
              <span className="flex-1">
                <b>How this works:</b> the Supervisor hands each task to a specialist. <b>Done</b> means the step finished; <b>Needs attention</b> means a claim was blocked
                until you confirm something. Only actions and outcomes are shown, never internal model reasoning.
              </span>
              <button type="button" onClick={dismissIntro} aria-label="Dismiss" className="rounded p-0.5 hover:bg-info/10"><XCircle size={14} /></button>
            </div>
          )}
          {(run || busy) && (
            <div className="mt-4">
              <AgentStatusBoard events={run?.events ?? []} shown={busy ? 0 : shown} busy={busy} compact />
            </div>
          )}
          {!run && !busy && <p className="mt-6 text-sm text-ink-3">Send a message on the phone to start a run. Each agent&apos;s actions and outcomes appear here.</p>}
          {run && run.todos.length > 0 && (
            <ol className="mt-4 flex flex-wrap gap-1.5">
              {run.todos.map((t) => (
                <li key={t.content} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", t.status === "completed" ? "bg-brand-soft text-brand-2" : "bg-paper text-ink-2")}>
                  {t.status === "completed" ? <CheckCircle2 size={12} /> : <CircleDashed size={12} />} {t.content}
                </li>
              ))}
            </ol>
          )}
          <ol className="mt-4 space-y-2">
            {run?.events.slice(0, shown).map((e) => {
              const meta = AGENT_META[e.agent] ?? AGENT_META.supervisor;
              const Icon = meta.icon;
              return (
                <motion.li key={e.seq} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className={cn("flex gap-3 rounded-xl border p-3", e.agent === "supervisor" ? "border-line bg-sunken" : "ml-4 border-line bg-card")}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: meta.color }}>
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{meta.label}</span>
                      {e.type === "verified" && <Badge tone="good">verified</Badge>}
                      {e.type === "blocked" && <Badge tone="warn">blocked claims</Badge>}
                      {e.type === "approval" && <Badge tone="info">approval</Badge>}
                    </div>
                    <div className="text-sm text-ink">{e.title}</div>
                    {e.detail && <div className="mt-0.5 text-xs break-words text-ink-3">{e.detail}</div>}
                  </div>
                </motion.li>
              );
            })}
            {run && shown < run.events.length && (
              <li className="flex items-center gap-2 text-sm text-ink-3">
                <Loader2 size={14} className="animate-spin" /> Showing the recorded steps in order…
              </li>
            )}
          </ol>
        </Card>

        {/* Result */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-semibold">Verified result</h2>
            {!v ? (
              <p className="mt-2 text-sm text-ink-3">Nothing verified yet.</p>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <div className={cn("rounded-xl p-3", v.status === "verified" ? "bg-brand-soft" : "bg-warn-soft")}>
                  <div className="font-semibold">{v.status === "verified" ? "Everything verified" : v.status === "partially-verified" ? "Partially verified" : "Blocked"}</div>
                  {b && (
                    <div className="num mt-1 text-ink-2">
                      Tax liability {v.verifiedClaims.includes("2025 federal tax liability") ? usd(b.tax) : "not verified"}
                      {" · "}
                      {refundVerified && b.refund !== null ? (b.refund >= 0 ? `Refund ${usd(b.refund)}` : `Owe ${usd(-b.refund)}`) : "Refund: blocked"}
                    </div>
                  )}
                </div>
                {v.blockedClaims.length > 0 && (
                  <ul className="space-y-1">
                    {v.blockedClaims.map((c) => (
                      <li key={c.claim + c.reason} className="flex gap-2 text-xs text-ink-2">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" /> <span><b>{c.claim}:</b> {c.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="space-y-1 border-t border-line pt-2">
                  {v.checks.map((c) => (
                    <li key={c.name} className="flex items-start gap-2 text-xs">
                      {c.pass ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-brand" /> : <XCircle size={13} className="mt-0.5 shrink-0 text-warn" />}
                      <span>
                        {c.name} <span className="text-ink-3">· {c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {run && (
            <Card className="p-5">
              <h2 className="font-semibold">Documents & sources</h2>
              <ul className="mt-2 space-y-2 text-xs">
                {run.documents.map((d) => (
                  <li key={d.fileName}>
                    <div className="font-semibold text-ink">{d.fileName} <span className="font-normal text-ink-3">(synthetic)</span></div>
                    {d.issues.map((i) => (
                      <div key={i} className={cn("mt-0.5", /instruction-like/.test(i) ? "text-info" : "text-warn")}>
                        {/instruction-like/.test(i) ? "🛡 " : "⚠ "}
                        {i}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
              {run.research && (
                <div className="mt-3 border-t border-line pt-2">
                  <div className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">IRS citations · tax year {run.research.taxYear}</div>
                  <ul className="mt-1 space-y-0.5">
                    {run.research.citations.map((c) => (
                      <li key={c.sourceId}>
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-info hover:underline">
                          {c.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {run.research.unverified.length > 0 && <p className="mt-1 text-xs text-warn">Not verifiable from IRS sources here: {run.research.unverified.join(", ")}</p>}
                </div>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck size={16} className="text-brand" /> Security checks
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => securityTest("tamper")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold hover:border-ink-3">
                <ShieldAlert size={13} /> Send forged webhook
              </button>
              <button onClick={() => securityTest("replay")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold hover:border-ink-3">
                <RotateCcw size={13} /> Replay last delivery
              </button>
            </div>
            <ul className="mt-3 space-y-1.5">
              {security.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  {s.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-brand" /> : <XCircle size={13} className="mt-0.5 shrink-0 text-debt" />}
                  <span>
                    <b>{s.label}</b> <span className="text-ink-3">· {s.detail}</span>
                  </span>
                </li>
              ))}
              {security.length === 0 && <li className="text-xs text-ink-3">Every inbound message is signature-checked before the agents see it.</li>}
            </ul>
          </Card>
          <p className="flex items-start gap-1.5 text-[11px] text-ink-3">
            <Sparkles size={12} className="mt-0.5 shrink-0" /> Synthetic data only. Messages never include amounts, SSNs or document contents: details stay behind secure, expiring links.
          </p>
        </div>
      </div>
    </div>
  );
}
