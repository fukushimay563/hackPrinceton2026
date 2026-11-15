"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
import { Card, cn } from "@/components/ui";

type Info = { purpose: string; field: { key: string; label: string } | null; document: { fileName: string; synthetic: boolean } | null; expiresAt: number; saved: boolean };
type Run = {
  status: string;
  events: { seq: number; agent: string; title: string }[];
  verification?: { status: string; checks: { name: string; pass: boolean; detail: string }[]; blockedClaims: { claim: string; reason: string }[] };
  calculation?: { breakdown: { wages: number; standardDeduction: number; taxableIncome: number; tax: number; withholding: number | null; refund: number | null } | null };
  pendingApproval: { summary: string } | null;
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function ClarifyPage() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [done, setDone] = useState<null | { status: string; notification?: { status: string } }>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    Promise.resolve().then(() => setToken(t));
    if (!t) {
      Promise.resolve().then(() => setError("This link is missing its security token."));
      return;
    }
    fetch(`/api/agents/clarify?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setInfo(d);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/agents/clarify", { method: "POST", body: JSON.stringify({ token, value: Number(value) }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setError(d.error);
    setRun(d.run);
  }

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    const r = await fetch("/api/agents/approve", { method: "POST", body: JSON.stringify({ token, decision }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setError(d.error);
    setDone({ status: d.run.status, notification: d.notification });
  }

  const b = run?.calculation?.breakdown;
  const verified = run?.verification?.status === "verified";

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/agents" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> Agent Console
      </Link>
      <Card className="mt-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-2">
          <Lock size={14} /> Secure page · link expires {info ? new Date(info.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "soon"}
        </div>

        {error && <p className="mt-4 rounded-xl bg-debt-soft px-3 py-2 text-sm text-debt">{error}</p>}
        {!info && !error && (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-3">
            <Loader2 size={14} className="animate-spin" /> Checking your link…
          </p>
        )}

        {info && info.purpose === "clarify-field" && !run && (
          <form onSubmit={submit} className="mt-4">
            <h1 className="text-2xl font-semibold tracking-tight">One detail is missing</h1>
            <p className="mt-2 text-ink-2">
              Your <b>{info.document?.fileName}</b> {info.document?.synthetic && <span className="text-ink-3">(synthetic demo document)</span>} has a blank box 2. Check your copy and enter
              what it shows. If it&apos;s empty, enter 0.
            </p>
            <label className="mt-5 block">
              <span className="text-sm font-medium text-ink-2">{info.field?.label}</span>
              <div className="mt-1.5 flex items-center rounded-2xl border-2 border-line bg-card px-4 focus-within:border-brand">
                <span className="text-lg text-ink-3">$</span>
                <input type="number" inputMode="decimal" min={0} step="0.01" required value={value} onChange={(e) => setValue(e.target.value)} className="num w-full bg-transparent px-2 py-3.5 text-lg font-semibold outline-none" placeholder="0.00" />
              </div>
            </label>
            <button disabled={busy || value === ""} className="mt-4 flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink font-semibold text-paper disabled:opacity-40">
              {busy ? <Loader2 size={18} className="animate-spin" /> : null} Submit and re-check
            </button>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-3">
              <ShieldCheck size={13} className="mt-0.5 shrink-0" /> Your answer is recorded as provided by you. The agents can&apos;t change it, and nothing is saved to your return without your approval.
            </p>
          </form>
        )}

        {info && info.purpose === "review-estimate" && !done && (
          <div className="mt-4">
            <h1 className="text-2xl font-semibold tracking-tight">Review your estimate</h1>
            <p className="mt-2 text-ink-2">{info.saved ? "Your verified estimate is already saved." : "Your verified 2025 estimate is ready. Save it to your record?"}</p>
            {!info.saved && <Decision busy={busy} onDecide={decide} />}
          </div>
        )}

        {run && !done && (
          <div className="mt-4">
            <h1 className="text-2xl font-semibold tracking-tight">{verified ? "Verified" : "Re-checked"}</h1>
            <ol className="mt-3 space-y-1 text-xs text-ink-2">
              {run.events.filter((e) => e.agent !== "supervisor" || /Plan complete|approval/i.test(e.title)).map((e) => (
                <li key={e.seq} className="flex gap-2">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-brand" /> <span><b className="capitalize">{e.agent}</b>: {e.title}</span>
                </li>
              ))}
            </ol>
            {b && b.refund !== null && verified && (
              <div className={cn("mt-4 rounded-2xl p-4 text-center", b.refund >= 0 ? "bg-brand-soft" : "bg-debt-soft")}>
                <div className="text-sm font-semibold text-brand-2">{b.refund >= 0 ? "Estimated federal refund" : "Estimated amount owed"}</div>
                <div className="num text-4xl font-semibold">{usd(Math.abs(b.refund))}</div>
                <div className="num mt-1 text-xs text-ink-2">
                  {usd(b.wages)} wages − {usd(b.standardDeduction)} = {usd(b.taxableIncome)} taxable · tax {usd(b.tax)} · withheld {usd(b.withholding ?? 0)}
                </div>
              </div>
            )}
            {run.verification && run.verification.blockedClaims.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">
                {run.verification.blockedClaims.map((c) => (
                  <li key={c.claim + c.reason} className="flex gap-2 text-warn">
                    <XCircle size={13} className="mt-0.5 shrink-0" /> {c.claim}: {c.reason}
                  </li>
                ))}
              </ul>
            )}
            {run.pendingApproval && (
              <>
                <p className="mt-4 text-sm font-semibold">Approval needed</p>
                <p className="text-sm text-ink-2">{run.pendingApproval.summary}</p>
                <Decision busy={busy} onDecide={decide} />
              </>
            )}
            {!run.pendingApproval && !verified && <p className="mt-4 text-sm text-ink-2">Answer the remaining question by text, then come back. Nothing has been saved.</p>}
          </div>
        )}

        {done && (
          <div className="mt-4 text-center">
            {done.status === "saved" ? <CheckCircle2 size={48} className="mx-auto text-brand" /> : <XCircle size={48} className="mx-auto text-ink-3" />}
            <h1 className="mt-2 text-2xl font-semibold">{done.status === "saved" ? "Saved to your record" : "Not saved"}</h1>
            <p className="mt-1 text-sm text-ink-2">
              {done.status === "saved"
                ? done.notification?.status === "sent"
                  ? "We sent a short confirmation to your phone, because you opted in. It contains no amounts."
                  : "No text was sent."
                : done.status === "rejected"
                  ? "You declined, so nothing changed."
                  : "Nothing was saved."}
            </p>
            <Link href="/agents" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-ink px-5 font-semibold text-paper">
              Back to the Agent Console
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}

function Decision({ busy, onDecide }: { busy: boolean; onDecide: (d: "approve" | "reject") => void }) {
  return (
    <div className="mt-3 flex gap-2">
      <button disabled={busy} onClick={() => onDecide("reject")} className="min-h-12 flex-1 rounded-xl border-2 border-line bg-card font-semibold disabled:opacity-40">
        Don&apos;t save
      </button>
      <button disabled={busy} onClick={() => onDecide("approve")} className="min-h-12 flex-1 rounded-xl bg-brand font-semibold text-on-brand disabled:opacity-40">
        Approve and save
      </button>
    </div>
  );
}
